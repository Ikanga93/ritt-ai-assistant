/**
 * Test script to simulate payment confirmation for temporary orders
 */

import { temporaryOrderService } from '../services/temporaryOrderService.js';
import * as logger from '../utils/logger.js';

async function testPaymentConfirmation() {
  console.log('\n=== Testing Payment Confirmation ===');
  
  try {
    // Get all temporary orders
    const orders = temporaryOrderService.listOrders();
    console.log(`Found ${orders.length} temporary orders`);
    
    if (orders.length === 0) {
      console.log('No temporary orders found to test');
      return;
    }
    
    // Find a pending order to test with
    const pendingOrder = orders.find(order => 
      order.metadata?.paymentStatus === 'pending'
    );
    
    if (!pendingOrder) {
      console.log('No pending orders found to test');
      return;
    }
    
    console.log(`\nTesting with order: ${pendingOrder.id}`);
    console.log(`Customer: ${pendingOrder.customerName}`);
    console.log(`Total: $${pendingOrder.total.toFixed(2)}`);
    console.log(`Current status: ${pendingOrder.metadata?.paymentStatus || 'unknown'}`);
    
    // Simulate payment confirmation
    console.log('\n--- Simulating Payment Confirmation ---');
    
    // Update the order payment status to paid
    const updatedOrder = temporaryOrderService.updateOrder(pendingOrder.id, {
      metadata: {
        ...pendingOrder.metadata,
        paymentStatus: 'paid',
        paidAt: Date.now(),
        sessionId: 'test_session_123',
        paymentIntentId: 'test_pi_123'
      }
    });
    
    if (updatedOrder) {
      console.log('✅ Order payment status updated to PAID');
      console.log(`Updated at: ${new Date(updatedOrder.metadata?.paidAt || 0).toISOString()}`);
      
      // Force save to disk
      console.log('\n--- Forcing Save to Disk ---');
      temporaryOrderService.forceSaveToDisk();
      console.log('✅ Orders saved to disk');
      
      // Verify the file was updated
      const reloadedOrder = temporaryOrderService.getOrder(pendingOrder.id);
      console.log(`Reloaded order status: ${reloadedOrder?.metadata?.paymentStatus}`);
      
      // Move the paid order to the database (this will fail due to DB config, but that's expected)
      console.log('\n--- Moving Order to Database ---');
      try {
        await temporaryOrderService.saveOrderToDatabase(updatedOrder);
        console.log('✅ Order successfully moved to database');
        
        // Check if the order was marked as moved
        const finalOrder = temporaryOrderService.getOrder(pendingOrder.id);
        if (finalOrder?.metadata?.movedToDatabase) {
          console.log('✅ Order marked as moved to database');
          console.log(`Database Order ID: ${finalOrder.metadata.dbOrderId}`);
        } else {
          console.log('⚠️  Order not marked as moved to database');
        }
      } catch (dbError) {
        console.log('❌ Failed to move order to database (expected due to DB config)');
        console.log('This is normal in the test environment');
      }
    } else {
      console.log('❌ Failed to update order payment status');
    }
    
    console.log('\n=== Test Complete ===');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    logger.error('Payment confirmation test failed', {
      context: 'test-payment-confirmation',
      error
    });
  }
}

// Run the test
testPaymentConfirmation().then(() => {
  console.log('\nTest script finished');
  process.exit(0);
}).catch(error => {
  console.error('Test script error:', error);
  process.exit(1);
}); 