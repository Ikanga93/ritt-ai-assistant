// Test Payment Flow
// This script tests the complete payment flow for both window and online payments

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Stripe from 'stripe';

// Import required modules
import { 
  storeOrder, 
  getOrder, 
  getOrderByPaymentLinkId, 
  updateOrder, 
  OrderWithPayment,
  deleteOrder
} from './orderStorage.js';
import { generatePaymentLink } from './paymentIntegration.js';
import { sendOrderNotification, sendOrderNotificationAfterPayment } from './restaurantUtils.js';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env.local') });

// Initialize Stripe with the secret key (using fallback test key if not in env)
const FALLBACK_TEST_KEY = 'sk_test_51R5kZQP4sLIsXeNy3uDv4DnTwD0h2WXfsv6Mp5Ee2felNv3zet4lCejwBdkqzGyoRo6tbfL7RG2ASSAgJH8B83GN00YSvfj4mA';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || FALLBACK_TEST_KEY, {
  apiVersion: '2025-03-31.basil' as any,
});

// Log API key status
console.log('STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? '✅ Set' : '❌ Using fallback test key');

// Test data
const testRestaurantId = 'starbucks';
const testRestaurantName = 'Starbucks';
const testCustomerName = 'Test Customer';
const testCustomerEmail = 'test@example.com';

/**
 * Create a test order
 */
function createTestOrder(orderNumber: number): any {
  return {
    orderNumber,
    restaurantId: testRestaurantId,
    restaurantName: testRestaurantName,
    customerName: testCustomerName,
    customerEmail: testCustomerEmail,
    items: [
      {
        name: 'Caffe Latte',
        quantity: 2,
        price: 4.95,
        specialInstructions: 'Extra hot'
      },
      {
        name: 'Croissant',
        quantity: 1,
        price: 3.50,
        specialInstructions: ''
      }
    ] as { name: string; quantity: number; price: number; specialInstructions?: string }[],
    subtotal: 13.40,
    stateTax: 1.11,
    processingFee: 0.77,
    orderTotal: 15.28,
    timestamp: new Date().toISOString(),
    estimatedTime: 10,
    status: 'confirmed'
  };
}

/**
 * Test window payment flow
 */
async function testWindowPaymentFlow(): Promise<void> {
  console.log('\n----- Testing Window Payment Flow -----\n');
  
  try {
    // 1. Create a test order
    const orderNumber = Math.floor(Math.random() * 10000);
    const baseOrder = createTestOrder(orderNumber);
    console.log(`Created test order #${orderNumber}`);
    
    // 2. Convert to order with payment fields (window payment)
    const order: OrderWithPayment = {
      ...baseOrder,
      paymentMethod: 'window',
      paymentStatus: 'pending',
      notificationSent: false
    };
    console.log('Converted to order with payment fields (window payment)');
    
    // 3. Store the order
    storeOrder(order);
    console.log('Stored order in order storage system');
    
    // 4. Send notification immediately (window payment)
    const notificationSent = await sendOrderNotification(order.restaurantId, order);
    console.log(`Notification sent: ${notificationSent}`);
    
    // 5. Mark notification as sent
    updateOrder(order.orderNumber, { notificationSent: true });
    console.log('Order marked as notified');
    
    // Get the order by number
    const retrievedOrderResult = await getOrder(order.orderNumber);
    const retrievedOrder = retrievedOrderResult.success ? retrievedOrderResult.order : null;
    console.log('Retrieved order by number:', retrievedOrder?.orderNumber);
    
    console.log('Final order status:', {
      orderNumber: retrievedOrder?.orderNumber,
      paymentMethod: retrievedOrder?.paymentMethod,
      paymentStatus: retrievedOrder?.paymentStatus,
      notificationSent: retrievedOrder?.notificationSent
    });
    
    console.log('\nWindow payment flow test completed successfully!');
  } catch (error) {
    console.error('Error testing window payment flow:', error);
  }
}

/**
 * Test online payment flow
 */
async function testOnlinePaymentFlow(): Promise<void> {
  console.log('\n----- Testing Online Payment Flow -----\n');
  
  try {
    // 1. Create a test order
    const orderNumber = Math.floor(Math.random() * 10000);
    const baseOrder = createTestOrder(orderNumber);
    console.log(`Created test order #${orderNumber}`);
    
    // 2. Convert to order with payment fields (online payment)
    const order: OrderWithPayment = {
      ...baseOrder,
      paymentMethod: 'online',
      paymentStatus: 'pending',
      notificationSent: false
    };
    console.log('Converted to order with payment fields (online payment)');
    
    // 3. Store the order
    storeOrder(order);
    console.log('Stored order in order storage system');
    
    // 4. Generate payment link
    const paymentResult = await generatePaymentLink({
      orderNumber: order.orderNumber.toString(),
      customerName: order.customerName,
      restaurantName: order.restaurantName,
      orderTotal: order.orderTotal,
      items: order.items as { name: string; quantity: number; price: number; specialInstructions?: string }[]
    });
    
    if (!paymentResult.success) {
      throw new Error('Failed to generate payment link');
    }
    
    console.log('Generated payment link:', paymentResult.url);
    
    // 5. Update order with payment link ID
    updateOrder(order.orderNumber, { paymentLinkId: paymentResult.id });
    console.log('Updated order with payment link ID');
    
    // 6. Verify order can be retrieved by payment link ID
    const orderByPaymentLink = await getOrderByPaymentLinkId(paymentResult.id);
    console.log('Retrieved order by payment link ID:', orderByPaymentLink?.orderNumber);
    
    // 7. Simulate payment completion (webhook event)
    console.log('\nSimulating payment completion...');
    
    // Create mock payment details
    const mockPaymentDetails = {
      transactionId: `test_tx_${Date.now()}`,
      timestamp: new Date().toISOString()
    };
    
    // Send notification after payment
    const notificationSent = await sendOrderNotificationAfterPayment(
      order.orderNumber,
      mockPaymentDetails
    );
    
    console.log(`Notification sent after payment: ${notificationSent}`);
    
    // Get the order by number
    const finalOrderResult = await getOrder(orderNumber);
    const finalOrder = finalOrderResult.success ? finalOrderResult.order : null;
    console.log('Final order status:', {
      orderNumber: finalOrder?.orderNumber,
      paymentMethod: finalOrder?.paymentMethod,
      paymentStatus: finalOrder?.paymentStatus,
      paymentTransactionId: finalOrder?.paymentTransactionId,
      notificationSent: finalOrder?.notificationSent
    });
    
    console.log('\nOnline payment flow test completed successfully!');
  } catch (error) {
    console.error('Error testing online payment flow:', error);
  }
}

/**
 * Run all tests
 */
async function runTests(): Promise<void> {
  console.log('Starting payment flow tests...');
  
  // Test window payment flow
  await testWindowPaymentFlow();
  
  // Test online payment flow
  await testOnlinePaymentFlow();
  
  console.log('\nAll tests completed!');
}

// Run the tests if this file is executed directly
// Using import.meta.url check for ES modules instead of require.main === module
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export { testWindowPaymentFlow, testOnlinePaymentFlow, runTests };
