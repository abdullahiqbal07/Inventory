import nodemailer from 'nodemailer';
import * as dotenv from 'dotenv';
dotenv.config();

export function generateEmailHtml(shippingDetails, productDetailsList, supplier) {
  let accountNumber = '';
  if (supplier === "Best Buy") {
    accountNumber = "62317";
  } else if (supplier === "Drive DeVilbiss Healthcare") {
    accountNumber = "134943";
  } else if (supplier === "Mobb Health Care") {
    accountNumber = "BEH001";
  } else if (supplier === "Medline Canada") {
    accountNumber = "3121775";
  } else if (supplier === "Handicare") {
    accountNumber = "CA00004039";
  }

  const accountParagraph = accountNumber
    ? `<p>I hope this message finds you well. We are writing to formally place an order on behalf of our account number ${accountNumber} and would appreciate your assistance in processing it promptly.</p>`
    : `<p>I hope this message finds you well. We are writing to formally place an order and would appreciate your assistance in processing it promptly.</p>`;

  return `
    <html>
      <body>
        <p>Dear Team ${supplier},</p>
        ${accountParagraph}
        
        <p><strong>Shipping Details:</strong></p>
        <ul>
          <li><strong>Name:</strong> ${shippingDetails.name}</li>
          <li><strong>Address:</strong> ${shippingDetails.address}</li>
          <li><strong>Contact Number:</strong> ${shippingDetails.contactNumber}</li>
          <li><strong>PO #:</strong> ${shippingDetails.poNumber}</li>
        </ul>

        <p><strong>Product Details:</strong></p>
        <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse;">
          <thead>
            <tr>
              <th>#</th>
              <th>SKU</th>
              <th>Product Title</th>
              <th>Quantity</th>
              <th>Max Approval Amount</th>
            </tr>
          </thead>
          <tbody>
            ${productDetailsList
      .map((product, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${product.sku}</td>
                  <td>${product.productTitle}</td>
                  <td>${product.quantity}</td>
                  <td>$${product.price}</td>
                </tr>
              `)
      .join('')}
          </tbody>
        </table>

        <p>If the item is unavailable in the primary warehouse, please fulfill the order from any warehouse with available stock. Kindly send the Order Confirmation once processed.</p>
        <p>Thank you, <br/>BeHope Team</p>
      </body>
    </html>
  `;
}


export const sendAutomatedEmail = async (emailHtml, poNumber, supplier) => {
  try {
    console.log("Attempting to send email...");
    console.log("Email config:", {
      user: process.env.EMAIL ? "Email exists" : "Email missing",
      pass: process.env.PASSWORD ? "Password exists" : "Password missing"
    });

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL,
        pass: process.env.PASSWORD
      }
    });

    let accountNumber = '';
    let supplierEmail = '';

    switch (supplier) {
      case "Mobb Health Care":
        accountNumber = "BEH001";
        supplierEmail = "info@mobbhhc.com";
        break;
      case "Medline Canada":
        accountNumber = "3121775";
        supplierEmail = "canadacs@medline.com";
        break;
      case "Handicare":
        accountNumber = "CA00004039";
        supplierEmail = "CustomerService.Canada@handicare.com";
        break;
      case "Sam Medical":
        accountNumber = ""; // No account number
        supplierEmail = "mmiri@sammed.ca";
        break;
      case "Best Buy":
        accountNumber = "62317";
        supplierEmail = "orders@bestbuymedical.ca";
        break;
      case "Drive DeVilbiss Healthcare":
        accountNumber = "134943";
        supplierEmail = "customerservice@drivemedical.com";
        break;
      default:
        console.warn(`No account/email found for supplier: ${supplier}`);
        break;
    }

    const toRecipients =  ["abdullah@behope.ca", "haroon@behope.ca", "hader@behope.ca","shahin@behope.ca", "shahana@behope.ca", "nadia@behope.ca", "orders@behope.ca"];
    if (supplierEmail) {
      toRecipients.push(supplierEmail);
    }

    const subjectLine = accountNumber
      ? `Order Request for Account #${accountNumber} - PO ${poNumber}`
      : `Order Request - PO ${poNumber}`;

    const info = await transporter.sendMail({
      from: `"BeHope" <${process.env.EMAIL || 'orders@behope.ca'}>`,
      to: toRecipients,
      subject: subjectLine,
      html: emailHtml,
    });

    console.log("Email sent successfully:", info.messageId);
    return true;
  } catch (error) {
    console.error("Failed to send email:", error);
    return false;
  }
};



export function generateWarningEmailHtml(shippingDetails, productDetailsList) {

  return `
    <html>
      <body style="font-family: Arial, sans-serif;">
        <p>Hi Operations Team,</p>
        <p><strong>⚠️ Address validation returned “WARNING”.</strong><br/>
           Please contact the customer <em>before</em> fulfillment.</p>

        <h3>Shipping details</h3>
        <ul>
          <li><strong>Name:</strong> ${shippingDetails.name}</li>
          <li><strong>Address:</strong> ${shippingDetails.address}</li>
          <li><strong>Phone:</strong> ${shippingDetails.contactNumber}</li>
        </ul>

        <h3>Product details</h3>
        <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
          <thead>
            <tr>
              <th>#</th>
              <th>SKU</th>
              <th>Title</th>
              <th>Qty</th>
              <th>PO #</th>
              <th>Price</th>
            </tr>
          </thead>
          <tbody>
            ${productDetailsList
      .map((product, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${product.sku}</td>
                  <td>${product.productTitle}</td>
                  <td>${product.quantity}</td>
                  <td>${shippingDetails.poNumber}</td>
                  <td>$${product.price}</td>
                </tr>
              `)
      .join('')}
          </tbody>
        </table>

        <p>If the item is unavailable in the primary warehouse, please ship from any warehouse with stock.<br/>
           Send Order Confirmation once processed.</p>

        <p>Thank you,<br/>Dev Team</p>
      </body>
    </html>
  `;
}


export const sendAutomatedEmailWarning = async (emailHtml, poNumber) => {
  try {
    console.log("Attempting to send email...");
    console.log("Email config:", {
      user: process.env.EMAIL ? "Email exists" : "Email missing",
      pass: process.env.PASSWORD ? "Password exists" : "Password missing"
    });

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL,
        pass: process.env.PASSWORD
      }
    });

    const info = await transporter.sendMail({
      from: `"BeHope" <${process.env.EMAIL || 'orders@behope.ca'}>`,
      to: ["abdullah@behope.ca", "haroon@behope.ca", "hader@behope.ca", "shahin@behope.ca", "shahana@behope.ca", "nadia@behope.ca", "info@behope.ca"],
      subject: `⚠️ Address issue for PO ${poNumber}`,
      html: emailHtml,
    });

    console.log("Email sent successfully:", info.messageId);
    return true;
  } catch (error) {
    console.error("Failed to send email:", error);
    return false;
  }
};

export function generateEmailHtmlRisk(shippingDetails, productDetailsList) {
  return `
    <!DOCTYPE html>
    <html lang="en">
      <body style="margin:0; padding:0; font-family:Arial, Helvetica, sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" style="background:#f7f7f7; padding:40px 15px;">
              <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden;">
                
                <!-- banner -->
                <tr>
                  <td style="background:#c1121f; padding:12px 24px; color:#ffffff; font-size:18px; font-weight:bold;">
                    🚩 High-Risk Order Detected
                  </td>
                </tr>

                <!-- intro -->
                <tr>
                  <td style="padding:24px 24px 8px; font-size:14px; line-height:1.5; color:#555;">
                    Hi Operations Team,<br/><br/>
                    Shopify has flagged <strong>${shippingDetails.poNumber}</strong> as <em>high risk</em>.
                    Please investigate and contact the customer <strong>before</strong> fulfilling the order.
                  </td>
                </tr>

                <!-- shipping -->
                <tr>
                  <td style="padding:0 24px 16px;">
                    <h3 style="margin:16px 0 8px; font-size:16px; color:#333;">Shipping details</h3>
                    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px; color:#555;">
                      <tr><td width="120">Name:</td><td>${shippingDetails.name}</td></tr>
                      <tr><td>Address:</td><td>${shippingDetails.address}</td></tr>
                      <tr><td>Phone:</td><td>${shippingDetails.contactNumber || "—"}</td></tr>
                      <tr><td>PO #:</td><td>${shippingDetails.poNumber}</td></tr>
                    </table>
                  </td>
                </tr>

                <!-- product -->
                <tr>
                  <td style="padding:0 24px 16px;">
                    <h3 style="margin:16px 0 8px; font-size:16px; color:#333;">Product details</h3>
                    <table width="100%" cellpadding="5" cellspacing="0" border="1" style="font-size:14px; color:#555; border-collapse: collapse;">
                      <thead style="background:#f0f0f0;">
                        <tr>
                          <th align="left">#</th>
                          <th align="left">SKU</th>
                          <th align="left">Title</th>
                          <th align="left">Quantity</th>
                          <th align="left">Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${productDetailsList
      .map((product, index) => `
                            <tr>
                              <td>${index + 1}</td>
                              <td>${product.sku}</td>
                              <td>${product.productTitle}</td>
                              <td>${product.quantity}</td>
                              <td>$${product.price}</td>
                            </tr>
                          `)
      .join('')}
                      </tbody>
                    </table>
                  </td>
                </tr>

                <!-- next steps -->
                <tr>
                  <td style="padding:0 24px 24px; font-size:14px; line-height:1.5; color:#555;">
                    Follow internal fraud-check procedures.<br>
                    Mark the order safe or cancel it once verified.
                  </td>
                </tr>

                <!-- footer -->
                <tr>
                  <td style="background:#f7f7f7; padding:16px 24px; font-size:13px; color:#777;">
                    Thank you,<br/><strong>Dev&nbsp;Team</strong>
                  </td>
                </tr>
                
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

export const sendAutomatedEmailRisk = async (emailHtml, poNumber) => {
  try {
    console.log("Attempting to send email...");
    console.log("Email config:", {
      user: process.env.EMAIL ? "Email exists" : "Email missing",
      pass: process.env.PASSWORD ? "Password exists" : "Password missing"
    });

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL,
        pass: process.env.PASSWORD
      }
    });

    const info = await transporter.sendMail({
      from: `"BeHope" <${process.env.EMAIL || 'orders@behope.ca'}>`,
      to: ["abdullah@behope.ca", "haroon@behope.ca", "hader@behope.ca", "shahin@behope.ca", "shahana@behope.ca", "nadia@behope.ca", "info@behope.ca"],
      subject: `🚩 High-Risk Order PO ${poNumber}`,
      html: emailHtml,
    });

    console.log("Email sent successfully:", info.messageId);
    return true;
  } catch (error) {
    console.error("Failed to send email:", error);
    return false;
  }
};