import express from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { sendAutomatedEmail, generateEmailHtml, generateEmailHtmlRisk, sendAutomatedEmailRisk, generateWarningEmailHtml, sendAutomatedEmailWarning } from './lib/email.js';
import {
  getWarehouseType,
  getProductSupplier,
  updateOrderTags,
  riskOrders,
  checkAddressIssue,
} from './lib/shopify.js';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
const SHOPIFY_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;

// Middleware
app.use('/webhook/orders/create', bodyParser.raw({ type: 'application/json' }));

// Webhook endpoint
app.post('/webhook/orders/create', async (req, res) => {
    try {
        // Verify HMAC
        const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
        const generatedHmac = crypto
            .createHmac('sha256', SHOPIFY_SECRET)
            .update(req.body, 'utf8')
            .digest('base64');

        if (generatedHmac !== hmacHeader) {
            return res.status(401).send('Unauthorized - Invalid HMAC');
        }

        const order = JSON.parse(req.body.toString('utf8'));
        console.log('Order received:', order.id);

        // Respond quickly to Shopify
        res.status(200).send('Webhook received');

        // Process address
        let address = order.shipping_address.address2;
        let processedAddress = "";

        if (!address || address.trim() === "") {
            processedAddress = address;
        } else {
            processedAddress = address.toLowerCase().replace(/\s+/g, '');
            if (/^\d+unit/.test(processedAddress)) {
                const number = processedAddress.match(/^(\d+)unit/)[1];
                processedAddress = 'Unit ' + number;
            }
            else if (!/unit\d*/.test(processedAddress)) {
                const unitNumberMatch = processedAddress.match(/\d+/);
                const unitNumber = unitNumberMatch ? unitNumberMatch[0] : '';
                processedAddress = 'Unit ' + unitNumber;
            }
            else {
                processedAddress = processedAddress.replace(/unit(\d+)/, 'Unit $1');
            }
        }

        // Extract Shipping Details
        const shippingDetails = {
            name: `${order.shipping_address.first_name} ${order.shipping_address.last_name}`,
            address: `${order.shipping_address.address1}, ${processedAddress ? processedAddress : ""}${processedAddress ? ", " : ""} ${order.shipping_address.city}, ${order.shipping_address.province_code} ${order.shipping_address.zip} ${order.shipping_address.country}`,
            contactNumber: order.shipping_address.phone,
            poNumber: order.name,
        };

        const shippingCountry = order.shipping_address.country;

        // Check if all products meet the criteria
        const { qualifies: allProductsQualify, supplier } = await checkAllProducts(order);

        if (allProductsQualify) {
            // Prepare product details for all items
            const productDetailsList = order.line_items.map(product => ({
                sku: product.sku,
                productTitle: product.title + (product.variant_title ? ` - ${product.variant_title}` : ''),
                quantity: product.quantity,
                price: Number(
                    ((Number(product.price) * product.quantity) - Number(product.total_discount)).toFixed(2))
            }));

            // Check for risks
            const score = await riskOrders(order);
            if (score > 0.5) {
                const emailHtml = generateEmailHtmlRisk(shippingDetails, productDetailsList);
                await sendAutomatedEmailRisk(emailHtml, shippingDetails.poNumber);
                return;
            }

            // Check address issues
            const addressIssue = await checkAddressIssue(order);
            if (addressIssue === 'WARNING') {
                const emailHtml = generateWarningEmailHtml(shippingDetails, productDetailsList);
                await sendAutomatedEmailWarning(emailHtml, shippingDetails.poNumber);
                return;
            }

            // Generate and send email
            const emailHtml = generateEmailHtml(shippingDetails, productDetailsList, supplier);
            const emailSent = await sendAutomatedEmail(emailHtml, order.name, supplier);

            if (emailSent) {
                await updateOrderTags(order.id, 'JARVIS - Ordered');
                console.log("Email sent successfully");
            }
        } else {
            console.log("Not all products qualify for email sending");
        }

    } catch (error) {
        console.error('Error processing webhook:', error);
    }
});

// Helper functions (same as your existing implementations)
async function checkAllProducts(order) {
    const shippingCountry = order.shipping_address.country;
    const isCanadaShipping = shippingCountry === "Canada";
    if (!isCanadaShipping) return { qualifies: false, supplier: null };
    
    const allowedSuppliers = ["Best Buy", "Drive DeVilbiss Healthcare", "Mobb Health Care", "Medline Canada", "Handicare", "Sam Medical"];
    const suppliersSet = new Set();
    
    for (const product of order.line_items) {
        const warehouseType = await getWarehouseType(order, product.variant_id);
        const supplier = await getProductSupplier(product.product_id);
        suppliersSet.add(supplier);
        
        if (!shouldSendEmailForProduct(warehouseType, supplier, shippingCountry)) {
            return { qualifies: false, supplier: null };
        }
    }
    
    if (suppliersSet.size !== 1) {
        console.log("Products have mixed suppliers:", Array.from(suppliersSet));
        return { qualifies: false, supplier: null };
    }
    
    const [supplierName] = suppliersSet;
    if (!allowedSuppliers.includes(supplierName)) {
        console.log(`Supplier '${supplierName}' not allowed for email sending`);
        return { qualifies: false, supplier: null };
    }
    
    return { qualifies: true, supplier: supplierName };
}

function shouldSendEmailForProduct(warehouseType, supplier, shippingCountry) {
    const isCanadaShipping = shippingCountry === "Canada";
    if (!isCanadaShipping) return false;
    
    const isAllowedSupplier = ["Best Buy", "Drive DeVilbiss Healthcare", "Mobb Health Care", "Medline Canada", "Handicare", "Sam Medical"].includes(supplier);
    if (!isAllowedSupplier) return false;
    
    const isDropShipWarehouse = warehouseType === "A - Dropship (Abbey Lane)";
    return isDropShipWarehouse;
}

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});