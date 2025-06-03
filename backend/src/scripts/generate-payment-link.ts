/**
 * Generate Payment Link Script
 * 
 * This script generates a payment link for an existing order in the temporary storage
 * and optionally updates its payment status for testing.
 * 
 * Run with: npx tsx src/scripts/generate-payment-link.ts [orderId] [updateStatus]
 * 
 * Example: 
 * - Generate link only: npx tsx src/scripts/generate-payment-link.ts TEMP-1747105843457-8002
 * - Generate and mark as paid: npx tsx src/scripts/generate-payment-link.ts TEMP-1747105843457-8002 paid
 */

import { temporaryOrderService } from '../services/temporaryOrderService.js';
import { 
  generateOrderPaymentLink, 
  updateOrderPaymentStatus 
} from '../services/orderPaymentLinkService.js';
import * as logger from '../utils/logger.js';

async function generatePaymentLinkForOrder() {
  // Get the order ID from command line arguments
  const orderId = process.argv[2];
  const updateStatus = process.argv[3]; // Optional: 'paid', 'failed', or 'expired'
  
  if (!orderId) {
    console.error('Please provide an order ID as the first argument');
    console.log('Usage: npx tsx src/scripts/generate-payment-link.ts [orderId] [updateStatus]');
    process.exit(1);
  }
  
  console.log('\n=== Generate Payment Link ===\n');
  
  try {
    // Check if the order exists
    const order = temporaryOrderService.getOrder(orderId);
    
    if (!order) {
      console.error(`Order with ID ${orderId} not found`);
      process.exit(1);
    }
    
    console.log(`Found order: ${order.id}`);
    console.log(`Customer: ${order.customerName}`);
    console.log(`Email: ${order.customerEmail}`);
    console.log(`Total: $${order.total.toFixed(2)}`);
    
    // Check if the order already has a payment link
    if (order.metadata?.paymentLink) {
      console.log('\nOrder already has a payment link:');
      console.log(`Payment Link: ${order.metadata.paymentLink.url}`);
      console.log(`Payment Status: ${order.metadata.paymentStatus || 'unknown'}`);
      
      // If update status is provided, update the payment status
      if (updateStatus && ['paid', 'failed', 'expired'].includes(updateStatus)) {
        console.log(`\nUpdating payment status to: ${updateStatus}`);
        
        const paymentLinkId = order.metadata.paymentLink.id;
        const updatedOrder = await updateOrderPaymentStatus(paymentLinkId, updateStatus as any);
        
        if (updatedOrder) {
          console.log(`Payment status updated to: ${updatedOrder.metadata?.paymentStatus}`);
          
          if (updateStatus === 'paid' && updatedOrder.metadata?.movedToDatabase) {
            console.log('Order was moved to the permanent database');
            console.log(`Database Order ID: ${updatedOrder.metadata.dbOrderId}`);
          }
        } else {
          console.error('Failed to update payment status');
        }
      }
    } else {
      // Generate a payment link for the order
      console.log('\nGenerating payment link...');
      
      const orderWithPayment = await generateOrderPaymentLink({
        orderId: order.id,
        amount: order.total,
        tempOrderId: order.id,
        customerName: order.customerName,
        description: `Order from ${order.restaurantName || 'Ritt Drive-Thru'}`,
        expirationDays: 2
      });
      
      console.log('\nPayment link generated:');
      console.log(`Payment Link: ${orderWithPayment.metadata?.paymentLink?.url}`);
      console.log(`Payment Status: ${orderWithPayment.metadata?.paymentStatus || 'pending'}`);
      
      // If update status is provided, update the payment status
      if (updateStatus && ['paid', 'failed', 'expired'].includes(updateStatus)) {
        console.log(`\nUpdating payment status to: ${updateStatus}`);
        
        const paymentLinkId = orderWithPayment.metadata?.paymentLink?.id;
        if (paymentLinkId) {
          const updatedOrder = await updateOrderPaymentStatus(paymentLinkId, updateStatus as any);
          
          if (updatedOrder) {
            console.log(`Payment status updated to: ${updatedOrder.metadata?.paymentStatus}`);
            
            if (updateStatus === 'paid' && updatedOrder.metadata?.movedToDatabase) {
              console.log('Order was moved to the permanent database');
              console.log(`Database Order ID: ${updatedOrder.metadata.dbOrderId}`);
            }
          } else {
            console.error('Failed to update payment status');
          }
        } else {
          console.error('Payment link ID not found');
        }
      }
    }
    
    console.log('\n=== Operation completed ===');
    
  } catch (error) {
    console.error('\n❌ Operation failed:');
    console.error(error);
  } finally {
    process.exit(0);
  }
}

// Run the script
generatePaymentLinkForOrder().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
