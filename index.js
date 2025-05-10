import express from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const SHOPIFY_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;

// Middleware to capture raw body
app.use('/webhook/orders/create', bodyParser.raw({ type: 'application/json' }));

// Webhook Handler
app.post('/webhook/orders/create', (req, res) => {
    const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
    const rawBody = req.body;
    
    const generatedHmac = crypto
    .createHmac('sha256', SHOPIFY_SECRET)
    .update(rawBody, 'utf8')
    .digest('base64');
    
    if (generatedHmac !== hmacHeader) {
        return res.status(401).send('Unauthorized - Invalid HMAC');
    }
    
    const order = JSON.parse(rawBody.toString('utf8'));
    console.log('✅ New Order Received:', order.id);
    console.log('Order data received', order)
    // const orderData = req.body

    // Business logic here

    res.status(200).send('Order webhook received');
});

app.listen(PORT, () => {
    console.log(`:rocket: Webhook server listening on port ${PORT}`);
});


// import express from 'express';
// import bodyParser from 'body-parser';
// import crypto from 'crypto';
// import dotenv from 'dotenv';
// dotenv.config();

// const app = express();
// const PORT = process.env.PORT || 3000;
// const SHOPIFY_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;

// // Apply raw body parser for all routes (or specific to webhook path)
// app.use(bodyParser.json({
//   verify: (req, res, buf) => {
//     req.rawBody = buf.toString();
//   }
// }));

// // Webhook Handler
// app.post('/webhooks/orders/create', (req, res) => {
//   try {
//     const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
//     const rawBody = req.rawBody;

//     if (!hmacHeader) {
//       return res.status(401).send('Unauthorized - Missing HMAC header');
//     }

//     const generatedHmac = crypto
//       .createHmac('sha256', SHOPIFY_SECRET)
//       .update(rawBody, 'utf8')
//       .digest('base64');

//     if (!crypto.timingSafeEqual(Buffer.from(generatedHmac), Buffer.from(hmacHeader))) {
//       return res.status(401).send('Unauthorized - Invalid HMAC');
//     }

//     const order = JSON.parse(rawBody);
//     console.log('✅ New Order Received:', order.id);

//     // Add your business logic here
//     // Example: processOrder(order);

//     res.status(200).send('Order webhook received');
//   } catch (error) {
//     console.error('Webhook error:', error);
//     res.status(500).send('Internal Server Error');
//   }
// });

// app.listen(PORT, () => {
//   console.log(`🚀 Webhook server listening on port ${PORT}`);
// });


// const express = require('express')
// const bodyParser = require('body-parser')
// const app = express()
// const PORT = 3000
// app.use(bodyParser.json())
// app.post('/webhook/orders/create', (req, res) =>{
// const orderData = req.body
// console.log('Order data received', orderData)
// res.status(200).send('Webhook received')
// })
// app.listen(PORT, () =>{
// })
// console.log(`Server is running at port ${PORT}`)