/**
 * Simple test for temporary order service
 * 
 * This script only tests the temporary order service without Stripe integration
 * Run with: npx tsx src/scripts/test-simple-order.ts
 */

import { temporaryOrderService } from '../services/temporaryOrderService.js';

async function testTemporaryOrderService() {
  console.log('\n=== Temporary Order Service Test ===\n');
  
  try {
    // Create a sample temporary order
    console.log('Creating a temporary order...');
    const sampleOrder = {
      customerName: 'Test Customer',
      customerEmail: 'test@example.com',
      restaurantId: 'rest-123',
      restaurantName: 'Test Restaurant',
      items: [
        {
          id: 'item-1',
          name: 'Burger',
          price: 9.99,
          quantity: 2
        },
        {
          id: 'item-2',
          name: 'Fries',
          price: 3.99,
          quantity: 1
        }
      ],
      total: 23.97,
      subtotal: 21.79,
      tax: 2.18
    };
    
    const createdOrder = temporaryOrderService.storeOrder(sampleOrder);
    console.log(`✅ Temporary order created with ID: ${createdOrder.id}`);
    
    // Add some metadata to the order
    console.log('\nUpdating order with metadata...');
    const updatedOrder = temporaryOrderService.updateOrder(createdOrder.id, {
      metadata: {
        test: 'This is a test metadata field',
        paymentTest: {
          id: 'test-payment-id',
          status: 'pending'
        }
      }
    });
    
    if (!updatedOrder) {
      throw new Error('Failed to update order with metadata');
    }
    
    console.log(`✅ Order updated with metadata: ${JSON.stringify(updatedOrder.metadata, null, 2)}`);
    
    // Retrieve the order
    console.log('\nRetrieving the order...');
    const retrievedOrder = temporaryOrderService.getOrder(createdOrder.id);
    
    if (!retrievedOrder) {
      throw new Error('Failed to retrieve order');
    }
    
    console.log(`✅ Order retrieved successfully: ${retrievedOrder.id}`);
    console.log(`Metadata: ${JSON.stringify(retrievedOrder.metadata, null, 2)}`);
    
    // Cleanup
    console.log('\nCleaning up test data...');
    temporaryOrderService.deleteOrder(createdOrder.id);
    console.log(`✅ Temporary order ${createdOrder.id} deleted`);
    
    console.log('\n✅ Test completed successfully');
  } catch (error) {
    console.error('\n❌ Test failed:');
    if (error instanceof Error) {
      console.error(`Error message: ${error.message}`);
      console.error(`Stack trace: ${error.stack}`);
    } else {
      console.error(error);
    }
  }
}

// Run the test
testTemporaryOrderService();
