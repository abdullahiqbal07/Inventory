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
app.use('/webhook/orders/create', bodyParser.raw({ type: 'application/json' }));
app.post('/webhook/orders/create', async (req, res) => {
    try {
        const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
        const generatedHmac = crypto
            .createHmac('sha256', SHOPIFY_SECRET)
            .update(req.body, 'utf8')
            .digest('base64');
        if (generatedHmac !== hmacHeader) {
            return res.status(401).send('Unauthorized - Invalid HMAC');
        }
        const order = JSON.parse(req.body.toString('utf8'));
                console.log(order)

        res.status(200).send('Webhook received');
        if (order.line_items.length > 1) {
            console.log('Order contains multiple SKUs - processing manually');
            return;
        }
        // 2. Extract Shipping & Product Details
        const shippingDetails = {
            name: `${order.shipping_address.first_name} ${order.shipping_address.last_name}`,
            address: `${order.shipping_address.address1}, ${order.shipping_address.city}, ${order.shipping_address.province_code} ${order.shipping_address.zip} ${order.shipping_address.country}`,
            contactNumber: order.shipping_address.phone,
        };
        const shippingCountry = order.shipping_address.country;
        const product = order.line_items[0];
        console.log(order)
        console.log(product)
        const productDetails = {
            sku: product.sku,
            productTitle: product.title + (product.variant_title ? ` - ${product.variant_title}` : ''),
            quantity: product.quantity,
            poNumber: order.order_number.toString(),
            price:product.price
        };
        const warehouseType = await getWarehouseType(order);
        const supplier = await getProductSupplier(product.product_id);
        let emailSent = false;
        let emailHtml = '';
        if (shouldSendEmail(warehouseType, supplier, shippingCountry)) {
            emailHtml = generateEmailHtml(shippingDetails, productDetails);
            emailSent = await sendAutomatedEmail(emailHtml, productDetails.poNumber);
            // 3. Update order tags if email was sent successfully
            if (emailSent) {
                await updateOrderTags(order.id, 'Test-Ordered');
                // await addOrderComment(order.id, emailHtml);
            }
        }
        // Final Output
        const extractedData = {
            shippingDetails,
            productDetails,
            warehouseType,
            supplier,
            shippingCountry,
            emailSent,
            action: emailSent ? 'processed' : 'skipped'
        };
        console.log(':package: Extracted Order Data:', extractedData);
        return;
    }
    catch (error) {
        console.error('Error processing webhook:', error.message);
        return res.status(500).send('Internal Server Error');
    }
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
    if (!isCanadaShipping) return false;
    const isBestBuySupplier = supplier === "Best Buy";
    if (!isBestBuySupplier) return false;
    const isDropShipWarehouse = warehouseType === "A - Dropship (Abbey Lane)";
    return isDropShipWarehouse && isBestBuySupplier && isCanadaShipping;
}
const sendAutomatedEmail = async (emailHtml, poNumber) => {
    try {
        console.log("Attempting to send email...");
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL,
                pass: process.env.PASSWORD
            }
        });
        const info = await transporter.sendMail({
            from: `"BeHope" <${process.env.EMAIL}>`,
            to: ["abdullah@behope.ca", "haroon@behope.ca", "hader@behope.ca","shahin@behope.ca", "shahana@behope.ca", "nadia@behope.ca", "orders@behope.ca"],
            subject: `Order Request for Account #62317 - PO ${poNumber}`,
            html: emailHtml,
        });
        console.log("Email sent successfully:", info.messageId);
        return true;
    } catch (error) {
        console.error("Failed to send email:", error.message);
        return false;
    }
};
async function updateOrderTags(orderId, newTag) {
    try {
        const orderResponse = await axios.get(
            `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-01/orders/${orderId}.json`,
            {
                headers: {
                    'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_API_KEY,
                },
            }
        );
        const currentTags = orderResponse.data.order.tags || '';
        const tagsArray = currentTags.split(',').map(tag => tag.trim());
        // Check if tag already exists
        if (!tagsArray.includes(newTag)) {
            tagsArray.push(newTag);
            const updatedTags = tagsArray.join(', ');
            // Update the order with new tags
            await axios.put(
                `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-01/orders/${orderId}.json`,
                {
                    order: {
                        id: orderId,
                        tags: updatedTags
                    }
                },
                {
                    headers: {
                        'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_API_KEY,
                        'Content-Type': 'application/json'
                    }
                }
            );
            console.log(`Successfully added tag "${newTag}" to order ${orderId}`);
            return true;
        } else {
            console.log(`:information_source: Tag "${newTag}" already exists on order ${orderId}`);
            return true;
        }
    } catch (error) {
        console.error(`:x: Failed to update tags for order ${orderId}:`, error.message);
        return false;
    }
}
function generateEmailHtml(shippingDetails, productDetails) {
    return `
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
            <li><strong>Max Approval Amount:</strong> ${productDetails.price}$</li>
        </ul>
        <p>If the item is unavailable in the primary warehouse, please fulfill the order from any warehouse with available stock. Kindly send the Order Confirmation once processed.</p>
        <p>Thank you, <br/>BeHope Team</p>
      </body>
    </html>
  `;
}
// async function addOrderComment(orderId, emailHtml) {
//     console.log(orderId);
//     try {
//         // Convert HTML to plain text
//         const plainText = emailHtml
//             .replace(/<[^>]*>/g, '')   // Remove HTML tags
//             .replace(/\n\s*\n/g, '\n') // Remove extra newlines
//             .trim();

//         console.log(`Adding note to order ${orderId}:`, plainText);

//         await axios.put(
//             `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-01/orders/${orderId}.json`,
//             {
//                 order: {
//                     id: orderId,
//                     note: plainText
//                 }
//             },
//             {
//                 headers: {
//                     'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_API_KEY,
//                     'Content-Type': 'application/json'
//                 }
//             }
//         );

//         console.log(`✅ Successfully added note to order ${orderId}`);
//         return true;
//     } catch (error) {
//         console.error(`❌ Failed to add note to order ${orderId}:`, error.message);
//         return false;
//     }
// }



app.listen(PORT, () => {
    console.log(`:rocket: Webhook server listening on port ${PORT}`);
});