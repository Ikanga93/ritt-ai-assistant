import fs from 'fs';
import path from 'path';
import { temporaryOrderService } from '../services/temporaryOrderService.js';

async function sendPaymentLink(orderId: string) {
  console.log('\n=== Sending Payment Link for Order ===\n');
  
  try {
    // Get the order file path
    const tempOrdersDir = path.join(process.cwd(), 'data', 'temp-orders');
    const orderFilePath = path.join(tempOrdersDir, `${orderId}.json`);
    
    if (!fs.existsSync(orderFilePath)) {
      console.error(`Order file not found: ${orderId}`);
      return;
    }
    
    // Read and parse the order file
    const orderData = JSON.parse(fs.readFileSync(orderFilePath, 'utf8'));
    
    // Try different possible locations of the payment link
    const paymentLink = orderData.metadata?.paymentLink?.url || 
                       orderData.metadata?.stripePaymentLink ||
                       orderData.metadata?.payment_link;
    
    if (!paymentLink) {
      console.error('No payment link found in order metadata');
      console.log('Available metadata:', JSON.stringify(orderData.metadata, null, 2));
      return;
    }
    
    // Format the payment link message for the chat interface
    const paymentLinkMessage = `payment_link:${paymentLink}`;
    console.log('\nPayment Link Message (copy this to chat):\n');
    console.log(paymentLinkMessage);
    
    // Also display order details
    console.log('\nOrder Details:');
    console.log(`Customer: ${orderData.customerName}`);
    console.log(`Email: ${orderData.customerEmail}`);
    console.log(`Total: $${orderData.total}`);
    console.log(`Items: ${orderData.items.length}`);
    console.log(`Payment Status: ${orderData.metadata?.paymentStatus}`);
    
  } catch (error) {
    console.error('Error processing order:', error);
  }
}

// Get order ID from command line argument
const orderId = process.argv[2];
if (!orderId) {
  console.error('Please provide an order ID');
  console.log('Usage: npx tsx src/scripts/send-payment-link.ts TEMP-XXXXXXXXXX-XXXX');
  process.exit(1);
}

sendPaymentLink(orderId); 