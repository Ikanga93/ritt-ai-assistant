import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Load environment variables from .env files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load environment variables
dotenv.config({ path: path.join(rootDir, '.env') });
dotenv.config({ path: path.join(rootDir, '.env.local') });

// Import after environment variables are loaded
import { PaymentStatus } from '../entities/Order.js';
import { updateOrderPaymentStatus } from '../services/orderPaymentLinkService.js';
import { temporaryOrderService } from '../services/temporaryOrderService.js';
import * as logger from '../utils/logger.js';

/**
 * Test function to simulate the payment_intent.succeeded webhook handler logic
 */
async function testPaymentIntentSucceeded() {
  console.log('=== Testing payment_intent.succeeded webhook handler ===');
  
  // Create a correlation ID for logging
  const correlationId = 'test-webhook-' + Date.now();
  
  try {
    // Check if printer email is configured
    const printerEmail = process.env.CENTRAL_ORDER_EMAIL || process.env.DEFAULT_PRINTER_EMAIL;
    
    if (!printerEmail) {
      console.error('❌ ERROR: No printer email configured in environment variables');
      console.log('Please set CENTRAL_ORDER_EMAIL or DEFAULT_PRINTER_EMAIL in your .env.local file');
      return;
    }
    
    console.log(`✓ Printer email configured: ${printerEmail}`);
    
    // Get a list of temporary orders to use for testing
    const tempOrdersDir = path.join(process.cwd(), 'data', 'temp-orders');
    
    if (!fs.existsSync(tempOrdersDir)) {
      console.error('❌ ERROR: Temporary orders directory not found:', tempOrdersDir);
      return;
    }
    
    const orderFiles = fs.readdirSync(tempOrdersDir).filter(file => file.endsWith('.json'));
    
    if (orderFiles.length === 0) {
      console.error('❌ ERROR: No temporary order files found in', tempOrdersDir);
      return;
    }
    
    console.log(`Found ${orderFiles.length} temporary order files`);
    
    // Use the first order file for testing
    const orderFile = orderFiles[0];
    const orderId = orderFile.replace('.json', '');
    
    console.log(`Using order ID: ${orderId} for testing`);
    
    // Simulate a payment intent ID
    const paymentIntentId = `pi_test_${Date.now()}`;
    
    // Update the order payment status to PAID
    console.log('Updating order payment status to PAID...');
    const updatedOrder = await updateOrderPaymentStatus(
      orderId,
      PaymentStatus.PAID,
      undefined, // No session ID for direct payment intents
      paymentIntentId
    );
    
    if (!updatedOrder) {
      console.error('❌ ERROR: Failed to update order payment status');
      return;
    }
    
    console.log('✓ Order payment status updated to PAID');
    console.log('Order details:', {
      id: updatedOrder.id,
      orderNumber: updatedOrder.orderNumber,
      customerName: updatedOrder.customerName,
      customerEmail: updatedOrder.customerEmail,
      restaurantName: updatedOrder.restaurantName,
      total: updatedOrder.total
    });
    
    // Import the sendOrderToPrinter function
    console.log('Importing sendOrderToPrinter function...');
    const { sendOrderToPrinter } = await import('../services/orderEmailService.js');
    
    // Send the order to the printer
    console.log(`Sending order to printer email: ${printerEmail}...`);
    const emailResult = await sendOrderToPrinter(updatedOrder, printerEmail);
    
    if (emailResult.success) {
      console.log('✓ SUCCESS: Order sent to printer email');
      console.log('Email details:', {
        messageId: emailResult.messageId,
        timestamp: new Date(emailResult.timestamp).toLocaleString()
      });
    } else {
      console.error('❌ ERROR: Failed to send order to printer email');
      console.error('Error details:', emailResult.error);
    }
    
  } catch (error) {
    console.error('❌ ERROR: Test failed with exception:', error);
  }
}

// Run the test
testPaymentIntentSucceeded().catch(console.error);
