import express from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import dotenv from 'dotenv';
import axios from 'axios';
import nodemailer from "nodemailer";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
const SHOPIFY_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;
// Middleware to capture raw body
app.use('/webhook/orders/create', bodyParser.raw({ type: 'application/json' }));
// Webhook Handler
app.post('/webhook/orders/create', async (req, res) => {
    // HMAC Verification (unchanged)
    const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
    const generatedHmac = crypto
        .createHmac('sha256', SHOPIFY_SECRET)
        .update(req.body, 'utf8')
        .digest('base64');
    if (generatedHmac !== hmacHeader) {
        return res.status(401).send('Unauthorized - Invalid HMAC');
    }
    const order = JSON.parse(req.body.toString('utf8'));
    // 1. Extract Shipping & Product Details
    const shippingDetails = {
        name: `${order.shipping_address.first_name} ${order.shipping_address.last_name}`,
        address: `${order.shipping_address.address1}, ${order.shipping_address.city}, ${order.shipping_address.province_code} ${order.shipping_address.zip} ${order.shipping_address.country}`,
        contactNumber: order.shipping_address.phone,
    };
    const shippingCountry = order.shipping_address.country;
    const product = order.line_items[0];
    const productDetails = {
        sku: product.sku,
        productTitle: product.title + (product.variant_title ? ` - ${product.variant_title}` : ''),
        quantity: product.quantity,
        poNumber: order.order_number.toString(),
    };
    const warehouseType = await getWarehouseType(order);
    const supplier = await getProductSupplier(product.product_id);
    if (shouldSendEmail(warehouseType, supplier, shippingCountry)) {
        await sendAutomatedEmail(shippingDetails, productDetails);
    }
    // Final Output
    const extractedData = {
        shippingDetails,
        productDetails,
        warehouseType,
        supplier,
        shippingCountry
    };
    console.log(':package: Extracted Order Data:', extractedData);
    res.status(200).json(extractedData);
});
async function getWarehouseType(order) {
    try {
        const fulfillmentOrders = await axios.get(
            `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-01/orders/${order.id}/fulfillment_orders.json`,
            {
                headers: {
                    'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_API_KEY,
                },
            }
        );
        if (fulfillmentOrders.data.fulfillment_orders?.length > 0) {
            const fulfillmentOrder = fulfillmentOrders.data.fulfillment_orders[0];
            if (fulfillmentOrder.assigned_location?.name) {
                return fulfillmentOrder.assigned_location.name;
            }
            if (fulfillmentOrder.assigned_location_id) {
                const location = await axios.get(
                    `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-01/locations/${fulfillmentOrder.assigned_location_id}.json`,
                    {
                        headers: {
                            'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_API_KEY,
                        },
                    }
                );
                return location.data.location.name;
            }
        }
        const lineItem = order.line_items[0];
        if (lineItem.vendor) {
            return `${lineItem.vendor} (Vendor Fulfilled)`;
        }
        return order.shipping_lines[0]?.title || "Unknown Warehouse";
    } catch (error) {
        console.error(":x: Failed to fetch warehouse type:", error.message);
        return "Unknown Warehouse";
    }
}
async function getProductSupplier(productId) {
    try {
        const response = await axios.get(
            `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-01/products/${productId}/metafields.json`,
            { headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_API_KEY } }
        );
        const supplierMetafield = response.data.metafields.find(
            (meta) => meta.key === "supplier" || meta.namespace === "custom"
        );
        return supplierMetafield?.value || lineItem.vendor || "No Supplier Found";
    } catch (error) {
        console.error(":x: Failed to fetch supplier:", error.message);
        return "Unknown Supplier";
    }
}
function shouldSendEmail(warehouseType, supplier, shippingCountry) {
    const isCanadaShipping = shippingCountry === "Canada";
    if (!isCanadaShipping) return false; // Only process if shipping to Canada
    const isBestBuySupplier = supplier === "Best Buy";
    if (!isBestBuySupplier) return false; // Only process if supplier is BestBuy
    const isDropShipWarehouse = warehouseType === "A - Dropship (Abbey Lane)";
    return isDropShipWarehouse && isBestBuySupplier && isCanadaShipping;
}

const sendAutomatedEmail = async (shippingDetails, productDetails) => {
    console.log("it is perfect")
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL,
      pass: process.env.PASSWORD  // Use app-specific password if 2FA is enabled
    }
  });
  const emailHtml = `
  <html>
    <body>
      <p>Dear Team Best Buy,</p>
      <p>I hope this message finds you well. We are writing to formally place an order on behalf of our account number 62317 and would appreciate your assistance in processing it promptly.</p>
      
      <p><strong>Shipping Details:</strong></p>
      <ul>
        <li><strong>Name:</strong> ${shippingDetails.name}</li>
        <li><strong>Address:</strong> ${shippingDetails.address}</li>
        <li><strong>Contact Number:</strong> ${shippingDetails.contactNumber}</li>
      </ul>

      <p><strong>Product Details:</strong></p>
      <ul>
        <li><strong>SKU:</strong> ${productDetails.sku}</li>
        <li><strong>Product Title:</strong> ${productDetails.productTitle}</li>
        <li><strong>Quantity:</strong> ${productDetails.quantity}</li>
        <li><strong>PO #:</strong> ${productDetails.poNumber}</li>
      </ul>

      <p>Please confirm this order and send the product. Please send the Order Confirmation, Invoice, and Tracking number. Also, please share the ETA for this product.</p>

      
    </body>
  </html>
`;

  const info = await transporter.sendMail({
    from: `"BeHope" <${process.env.EMAIL}>`,
    to: ["haroon@behope.ca"],
    subject: `Purchase Order: ${productDetails.poNumber}`,
    // text: "Hello haider,\n\nJust wanted to check in and see how things are going.\n\nBest,\nAbdullah",
    html: emailHtml,
  });

  console.log(info.messageId)

//   console.log("Message sent: %s", info.messageId);
 
};




app.listen(PORT, () => {
    console.log(`:rocket: Webhook server listening on port ${PORT}`);
});



