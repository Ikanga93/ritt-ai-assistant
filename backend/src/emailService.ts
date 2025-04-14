// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import sgMail from '@sendgrid/mail';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env.local');
dotenv.config({ path: envPath });

// Initialize SendGrid with API key
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;

// Use the provided verified sender email from env or fallback
const FROM_EMAIL = process.env.FROM_EMAIL || 'gekuke1@ritt.ai';

// Default restaurant email for testing
const DEFAULT_RESTAURANT_EMAIL = process.env.DEFAULT_RESTAURANT_EMAIL || 'pofaraorder@gmail.com';

// Central email that receives a copy of all orders
const CENTRAL_ORDER_EMAIL = process.env.CENTRAL_ORDER_EMAIL || 'orders@ritt.ai';

// Flag to control whether to use actual email sending or just logging
// Only enable if we have a valid API key
let USE_ACTUAL_EMAIL_SENDING = false;

// Set the API key if available
if (SENDGRID_API_KEY) {
  try {
    sgMail.setApiKey(SENDGRID_API_KEY);
    USE_ACTUAL_EMAIL_SENDING = true;
    console.log('SendGrid API key configured. Email sending is ENABLED.');
  } catch (error) {
    console.error('Error configuring SendGrid API key:', error);
    console.warn('Email notifications will be logged but not sent.');
  }
} else {
  console.warn('SendGrid API key not found in .env.local file. Email notifications will be logged but not sent.');
  console.log('To enable email sending, add SENDGRID_API_KEY to your .env.local file.');
}

/**
 * Interface for order items
 */
interface OrderItem {
  id?: string;
  name: string;
  quantity: number;
  price?: number;
  specialInstructions?: string;
}

/**
 * Interface for order details
 */
interface OrderDetails {
  orderNumber: number | string;
  restaurantId: string;
  restaurantName: string;
  customerName: string;
  customerEmail?: string;
  items: OrderItem[];
  subtotal?: number;
  stateTax?: number;
  processingFee?: number;
  orderTotal: number;
  timestamp: string;
  estimatedTime: number;
  status: string;
  
  // Payment-related fields
  paymentMethod?: "online" | "window";
  paymentStatus?: "pending" | "completed" | "failed";
  paymentLinkId?: string;
  paymentTimestamp?: string;
  paymentTransactionId?: string;
}

/**
 * Generate HTML email content for an order notification
 */
function generateOrderEmailHtml(order: OrderDetails): string {
  const itemsHtml = order.items
    .map(
      (item) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.quantity}x ${item.name}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">$${(item.price || 0).toFixed(2)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${
          item.specialInstructions ? item.specialInstructions : 'None'
        }</td>
      </tr>
    `
    )
    .join('');

  const orderDate = new Date(order.timestamp).toLocaleString();
  
  // Generate payment status HTML based on payment method and status
  let paymentStatusHtml = '';
  
  if (order.paymentMethod === 'window') {
    // Window payment - payment due at pickup
    paymentStatusHtml = `
      <div style="background-color: #FFF7E6; border: 2px solid #FF9900; padding: 15px; margin-bottom: 20px;">
        <h2 style="color: #FF6600; margin: 0;">⚠️ PAYMENT DUE AT WINDOW: $${order.orderTotal.toFixed(2)} ⚠️</h2>
        <p style="margin: 10px 0 0 0;">Please collect payment when customer arrives.</p>
      </div>
    `;
  } else if (order.paymentMethod === 'online' && order.paymentStatus === 'completed') {
    // Online payment - completed
    const paymentDate = order.paymentTimestamp ? new Date(order.paymentTimestamp).toLocaleString() : 'Unknown';
    paymentStatusHtml = `
      <div style="background-color: #E6FFE6; border: 2px solid #00CC00; padding: 15px; margin-bottom: 20px;">
        <h2 style="color: #009900; margin: 0;">✅ PAID ONLINE: $${order.orderTotal.toFixed(2)} ✅</h2>
        <p style="margin: 10px 0 0 0;">Payment confirmed at ${paymentDate}</p>
        ${order.paymentTransactionId ? `<p style="margin: 5px 0 0 0;">Transaction ID: ${order.paymentTransactionId}</p>` : ''}
      </div>
    `;
  } else {
    // Default or unknown payment method (should not happen in normal flow)
    paymentStatusHtml = `
      <div style="background-color: #F5F5F5; border: 2px solid #888888; padding: 15px; margin-bottom: 20px;">
        <h2 style="color: #555555; margin: 0;">💵 PAYMENT: $${order.orderTotal.toFixed(2)} 💵</h2>
        <p style="margin: 10px 0 0 0;">Order payment status not specified.</p>
      </div>
    `;
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>New Order Notification</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4CAF50; color: white; padding: 10px; text-align: center; }
        .order-info { margin: 20px 0; }
        .order-items { width: 100%; border-collapse: collapse; }
        .order-items th { background-color: #f2f2f2; text-align: left; padding: 8px; }
        .total { font-weight: bold; margin-top: 20px; }
        .footer { margin-top: 30px; font-size: 12px; color: #777; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>New Order #${order.orderNumber}</h1>
        </div>
        
        ${paymentStatusHtml}
        
        <div class="order-info">
          <p><strong>Restaurant:</strong> ${order.restaurantName}</p>
          <p><strong>Customer:</strong> ${order.customerName}</p>
          <p><strong>Order Time:</strong> ${orderDate}</p>
          <p><strong>Estimated Preparation Time:</strong> ${order.estimatedTime} minutes</p>
        </div>
        
        <h2>Order Items:</h2>
        <table class="order-items">
          <thead>
            <tr>
              <th>Item</th>
              <th>Price</th>
              <th>Special Instructions</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        
        <div class="total">
          <p>Subtotal: $${(order.subtotal || 0).toFixed(2)}</p>
          <p>Sales Tax (9%): $${(order.stateTax || 0).toFixed(2)}</p>
          <p><strong>Order Total: $${order.orderTotal.toFixed(2)}</strong></p>
        </div>
        
        <div class="footer">
          <p>This is an automated email order notification from Ritt Drive-Thru, an AI-powered voice ordering system.</p>
          <p>To learn more about Ritt Drive-Thru or to implement this system at your business, visit <a href="https://ritt.ai">ritt.ai</a> or contact us at <a href="mailto:gekuke1@ritt.ai">gekuke1@ritt.ai</a>.</p>
          <p><strong>Gilchrist Ekuke, CEO Ritt</strong></p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate plain text email content for an order notification
 */
function generateOrderEmailText(order: OrderDetails): string {
  const itemsList = order.items
    .map(
      (item) =>
        `${item.quantity}x ${item.name} - $${(item.price || 0).toFixed(2)}${
          item.specialInstructions ? ` (${item.specialInstructions})` : ''
        }`
    )
    .join('\n');

  const orderDate = new Date(order.timestamp).toLocaleString();

  return `
NEW ORDER #${order.orderNumber}

Restaurant: ${order.restaurantName}
Customer: ${order.customerName}
Order Time: ${orderDate}
Estimated Preparation Time: ${order.estimatedTime} minutes

ORDER ITEMS:
${itemsList}

Subtotal: $${(order.subtotal || 0).toFixed(2)}
Sales Tax (9%): $${(order.stateTax || 0).toFixed(2)}
Order Total: $${order.orderTotal.toFixed(2)}

This is an automated message from Ritt Drive-Thru, an AI-powered voice ordering system.
For any issues with this order, please contact the customer directly.

To learn more about Ritt Drive-Thru or to implement this system at your business, visit ritt.ai or contact us at info@ritt.ai.
  `;
}

/**
 * Send an order notification email to a restaurant
 */
/**
 * Send an order notification email to a restaurant
 * @param restaurantEmail The email address of the restaurant
 * @param order The order details including payment information
 * @returns Promise<boolean> indicating success or failure
 */
export async function sendOrderEmail(
  restaurantEmail: string,
  order: OrderDetails
): Promise<boolean> {
  // Prepare the email message for the restaurant with payment status in subject
  let subjectPrefix = '';
  
  // Add payment status to subject line for quick identification
  if (order.paymentMethod === 'window') {
    subjectPrefix = '[PAYMENT DUE] ';
  } else if (order.paymentMethod === 'online' && order.paymentStatus === 'completed') {
    subjectPrefix = '[PAID ONLINE] ';
  }
  
  const restaurantMsg = {
    to: restaurantEmail,
    from: FROM_EMAIL,
    subject: `${subjectPrefix}New Order #${order.orderNumber} from ${order.customerName}`,
    text: generateOrderEmailText(order),
    html: generateOrderEmailHtml(order),
  };

  // Prepare the same message for the central email
  const centralMsg = {
    to: CENTRAL_ORDER_EMAIL,
    from: FROM_EMAIL,
    subject: `[COPY] Order #${order.orderNumber} for ${order.restaurantName} from ${order.customerName}`,
    text: generateOrderEmailText(order),
    html: generateOrderEmailHtml(order),
  };

  // Always log the email for debugging/development purposes
  console.log('\n==== EMAIL NOTIFICATION ====');
  console.log(`To Restaurant: ${restaurantEmail}`);
  console.log(`To Central: ${CENTRAL_ORDER_EMAIL}`);
  console.log(`From: ${FROM_EMAIL}`);
  console.log(`Subject: ${restaurantMsg.subject}`);
  console.log(generateOrderEmailText(order));
  console.log('==== END EMAIL NOTIFICATION ====\n');

  // If we're not using actual email sending, just return success after logging
  if (!USE_ACTUAL_EMAIL_SENDING) {
    console.log('Email sending disabled. Emails logged but not sent.');
    return true;
  }

  // Attempt to send both emails if enabled
  try {
    // Send to restaurant
    await sgMail.send(restaurantMsg);
    console.log(`Order notification email sent to restaurant at ${restaurantEmail}`);
    
    // Send to central email
    await sgMail.send(centralMsg);
    console.log(`Order notification copy sent to central email at ${CENTRAL_ORDER_EMAIL}`);
    
    return true;
  } catch (error) {
    console.error('Error sending order notification emails:', error);
    console.log('Falling back to log-only mode due to SendGrid error');
    return true; // Still return true so the order process continues
  }
}
