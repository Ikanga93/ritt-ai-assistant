/**
 * Email Testing Script
 * 
 * This script tests the email notification system by:
 * 1. Rendering email templates with test data
 * 2. Sending test emails to a specified address
 * 3. Testing the full order flow with email notifications
 */

import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as logger from '../utils/logger.js';
import { sendEmail } from '../services/emailService.js';
import Handlebars from 'handlebars';

// Function to render email templates since the original is not exported
async function renderEmailTemplate(
  templateName: string,
  data: Record<string, any>
): Promise<{ html: string; text: string }> {
  const TEMPLATES_DIR = path.join(__dirname, '..', 'templates', 'emails');
  
  // Read the HTML template
  const htmlTemplatePath = path.join(TEMPLATES_DIR, `${templateName}.html`);
  const textTemplatePath = path.join(TEMPLATES_DIR, `${templateName}.txt`);
  
  // Read templates
  const htmlTemplate = fs.readFileSync(htmlTemplatePath, 'utf-8');
  const textTemplate = fs.readFileSync(textTemplatePath, 'utf-8');
  
  // Register the 'lt' helper for less than comparison
  Handlebars.registerHelper('lt', function(a, b) {
    return a < b;
  });
  
  // Register the 'eq' helper for equality comparison
  Handlebars.registerHelper('eq', function(a, b) {
    return a === b;
  });
  
  // Compile and render the templates
  const htmlCompiled = Handlebars.compile(htmlTemplate);
  const textCompiled = Handlebars.compile(textTemplate);
  
  return {
    html: htmlCompiled(data),
    text: textCompiled(data)
  };
}
import { 
  sendPaymentLinkEmail, 
  sendPaymentReminderEmail,
  sendPaymentReceiptEmail 
} from '../services/orderEmailService.js';
import { temporaryOrderService } from '../services/temporaryOrderService.js';
import { generateOrderPaymentLink } from '../services/orderPaymentLinkService.js';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to output directory for rendered templates
const OUTPUT_DIR = path.join(__dirname, '../../test-output');

// Create output directory if it doesn't exist
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * Test email template rendering
 */
async function testTemplateRendering() {
  console.log('🧪 Testing email template rendering...');
  
  // Sample order data for template rendering
  const sampleOrder = {
    id: 'TEST-ORDER-123',
    customerName: 'Test Customer',
    customerEmail: 'test@example.com',
    restaurantId: 'rest-123',
    restaurantName: 'Test Restaurant',
    items: [
      { name: 'Burger', price: 9.99, quantity: 1 },
      { name: 'Fries', price: 3.99, quantity: 2 },
      { name: 'Drink', price: 2.49, quantity: 1 }
    ],
    subtotal: 20.46,
    tax: 1.64,
    total: 22.10,
    createdAt: Date.now(),
    expiresAt: Date.now() + (48 * 60 * 60 * 1000) // 48 hours from now
  };
  
  // Calculate processing fees
  const processingFeePercentage = 0.029; // 2.9%
  const processingFeeFixed = 0.40; // $0.40
  const processingFeeAmount = (sampleOrder.total * processingFeePercentage);
  const totalProcessingFee = processingFeeAmount + processingFeeFixed;
  const totalWithFees = sampleOrder.total + totalProcessingFee;
  
  // Test data for each template
  const templateTestData = {
    'payment-link': {
      order: sampleOrder,
      orderId: sampleOrder.id,
      customerName: sampleOrder.customerName,
      items: sampleOrder.items,
      total: sampleOrder.total.toFixed(2),
      tax: sampleOrder.tax.toFixed(2),
      subtotal: sampleOrder.subtotal.toFixed(2),
      processingFee: totalProcessingFee.toFixed(2),
      totalWithFees: totalWithFees.toFixed(2),
      orderDate: new Date(sampleOrder.createdAt).toLocaleString(),
      restaurantName: sampleOrder.restaurantName,
      paymentLink: 'https://example.com/pay/test-link',
      expirationDate: new Date(sampleOrder.expiresAt).toLocaleString(),
      payButtonText: 'Pay Now',
      payButtonUrl: 'https://example.com/pay/test-link'
    },
    'payment-receipt': {
      order: sampleOrder,
      orderId: sampleOrder.id,
      customerName: sampleOrder.customerName,
      items: sampleOrder.items,
      total: sampleOrder.total.toFixed(2),
      tax: sampleOrder.tax.toFixed(2),
      subtotal: sampleOrder.subtotal.toFixed(2),
      processingFee: totalProcessingFee.toFixed(2),
      totalWithFees: totalWithFees.toFixed(2),
      orderDate: new Date(sampleOrder.createdAt).toLocaleString(),
      paidDate: new Date().toLocaleString(),
      restaurantName: sampleOrder.restaurantName,
      paymentId: 'pi_test_123456789',
      receiptNumber: `RCPT-${Date.now().toString().slice(-6)}-${sampleOrder.id.slice(-4)}`
    },
    'payment-reminder': {
      order: sampleOrder,
      orderId: sampleOrder.id,
      customerName: sampleOrder.customerName,
      restaurantName: sampleOrder.restaurantName,
      paymentLink: 'https://example.com/pay/test-link',
      hoursRemaining: 24,
      expirationDate: new Date(sampleOrder.expiresAt).toLocaleString(),
      reminderNumber: 1,
      payButtonText: 'Complete Payment',
      payButtonUrl: 'https://example.com/pay/test-link'
    },
    'order-status': {
      orderId: sampleOrder.id,
      customerName: sampleOrder.customerName,
      customerEmail: sampleOrder.customerEmail,
      restaurantName: sampleOrder.restaurantName,
      orderDate: new Date(sampleOrder.createdAt).toLocaleString(),
      statusText: 'Preparing',
      statusMessage: 'Your order is being prepared by the restaurant.',
      statusClass: 'status-preparing',
      currentStatus: 'preparing',
      statusIndex: 2,
      paidTime: new Date(Date.now() - 1000 * 60 * 10).toLocaleString(),
      preparingTime: new Date().toLocaleString(),
      estimatedTime: '15-20 minutes'
    }
  };
  
  // Render each template and save to file
  for (const [templateName, data] of Object.entries(templateTestData)) {
    try {
      console.log(`Rendering template: ${templateName}`);
      const { html, text } = await renderEmailTemplate(templateName, data);
      
      // Save rendered HTML to file
      const htmlOutputPath = path.join(OUTPUT_DIR, `${templateName}.html`);
      fs.writeFileSync(htmlOutputPath, html);
      console.log(`✅ HTML template saved to: ${htmlOutputPath}`);
      
      // Save rendered text to file
      const textOutputPath = path.join(OUTPUT_DIR, `${templateName}.txt`);
      fs.writeFileSync(textOutputPath, text);
      console.log(`✅ Text template saved to: ${textOutputPath}`);
    } catch (error) {
      console.error(`❌ Error rendering template ${templateName}:`, error);
    }
  }
}

/**
 * Test sending emails
 */
async function testEmailSending() {
  // Check if test email is provided
  const testEmail = process.env.TEST_EMAIL || process.argv[2];
  
  if (!testEmail) {
    console.error('❌ No test email provided. Please set TEST_EMAIL in .env.local or provide as argument.');
    return;
  }
  
  console.log(`🧪 Testing email sending to: ${testEmail}`);
  
  // Create a test order
  const testOrder = temporaryOrderService.createOrder({
    customerName: 'Test Customer',
    customerEmail: testEmail,
    restaurantId: 'rest-123',
    restaurantName: 'Test Restaurant',
    items: [
      { name: 'Burger', price: 9.99, quantity: 1 },
      { name: 'Fries', price: 3.99, quantity: 2 },
      { name: 'Drink', price: 2.49, quantity: 1 }
    ],
    subtotal: 20.46,
    tax: 1.64,
    total: 22.10
  });
  
  console.log(`Created test order with ID: ${testOrder.id}`);
  
  // Test payment link email
  try {
    console.log('Sending payment link email...');
    const paymentLinkResult = await sendPaymentLinkEmail(
      testOrder,
      'https://example.com/pay/test-link',
      Math.floor(Date.now() / 1000) + (48 * 60 * 60) // 48 hours from now
    );
    
    if (paymentLinkResult.success) {
      console.log(`✅ Payment link email sent successfully. Message ID: ${paymentLinkResult.messageId}`);
    } else {
      console.error('❌ Failed to send payment link email:', paymentLinkResult.error);
    }
  } catch (error) {
    console.error('❌ Error sending payment link email:', error);
  }
  
  // Test payment reminder email
  try {
    console.log('Sending payment reminder email...');
    const reminderResult = await sendPaymentReminderEmail(
      testOrder,
      'https://example.com/pay/test-link',
      Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours from now
      1
    );
    
    if (reminderResult.success) {
      console.log(`✅ Payment reminder email sent successfully. Message ID: ${reminderResult.messageId}`);
    } else {
      console.error('❌ Failed to send payment reminder email:', reminderResult.error);
    }
  } catch (error) {
    console.error('❌ Error sending payment reminder email:', error);
  }
  
  // Test payment receipt email
  try {
    console.log('Sending payment receipt email...');
    const receiptResult = await sendPaymentReceiptEmail(
      testOrder,
      'pi_test_123456789'
    );
    
    if (receiptResult.success) {
      console.log(`✅ Payment receipt email sent successfully. Message ID: ${receiptResult.messageId}`);
    } else {
      console.error('❌ Failed to send payment receipt email:', receiptResult.error);
    }
  } catch (error) {
    console.error('❌ Error sending payment receipt email:', error);
  }
}

/**
 * Test the full order flow with email notifications
 */
async function testOrderFlow() {
  // Check if test email is provided
  const testEmail = process.env.TEST_EMAIL || process.argv[2];
  
  if (!testEmail) {
    console.error('❌ No test email provided. Please set TEST_EMAIL in .env.local or provide as argument.');
    return;
  }
  
  console.log(`🧪 Testing full order flow with email notifications to: ${testEmail}`);
  
  // Create a test order
  const testOrder = temporaryOrderService.createOrder({
    customerName: 'Test Customer',
    customerEmail: testEmail,
    restaurantId: 'rest-123',
    restaurantName: 'Test Restaurant',
    items: [
      { name: 'Burger', price: 9.99, quantity: 1 },
      { name: 'Fries', price: 3.99, quantity: 2 },
      { name: 'Drink', price: 2.49, quantity: 1 }
    ],
    subtotal: 20.46,
    tax: 1.64,
    total: 22.10
  });
  
  console.log(`Created test order with ID: ${testOrder.id}`);
  
  // Generate payment link
  try {
    console.log('Generating payment link with email notification...');
    const orderWithPayment = await generateOrderPaymentLink({
      orderId: testOrder.id,
      customerEmail: testOrder.customerEmail,
      customerName: testOrder.customerName,
      description: `Test order from ${testOrder.restaurantName}`,
      expirationHours: 48
    });
    
    console.log(`✅ Payment link generated: ${orderWithPayment.paymentLink?.url}`);
    console.log(`✅ Email status: ${JSON.stringify(orderWithPayment.metadata?.emailStatus)}`);
  } catch (error) {
    console.error('❌ Error generating payment link:', error);
  }
}

// Main function to run the tests
async function main() {
  const testType = process.argv[3] || 'all';
  
  try {
    if (testType === 'all' || testType === 'render') {
      await testTemplateRendering();
      console.log('\n');
    }
    
    if (testType === 'all' || testType === 'send') {
      await testEmailSending();
      console.log('\n');
    }
    
    if (testType === 'all' || testType === 'flow') {
      await testOrderFlow();
    }
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

// Display usage instructions
console.log(`
Usage: 
  pnpm tsx src/scripts/test-email.ts [test-email] [test-type]
  
  test-email: Email address to send test emails to (optional if TEST_EMAIL is set in .env.local)
  test-type: Type of test to run (render, send, flow, all) (default: all)
  
Examples:
  pnpm tsx src/scripts/test-email.ts test@example.com render
  pnpm tsx src/scripts/test-email.ts test@example.com send
  pnpm tsx src/scripts/test-email.ts test@example.com flow
  pnpm tsx src/scripts/test-email.ts test@example.com all
`);
