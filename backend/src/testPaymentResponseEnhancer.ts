// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Test script to demonstrate how to use the payment response enhancer
 */
import { OrderDetails } from './orderService.js';
import { addPaymentMarkerToResponse, isPaymentRelatedMessage } from './paymentResponseEnhancer.js';

// Sample order for testing
const sampleOrder: OrderDetails = {
  orderNumber: 1234,
  restaurantId: 'micro_dose',
  restaurantName: 'Micro Dose',
  customerName: 'John Doe',
  items: [
    { name: 'Espresso', quantity: 2, price: 3.50 },
    { name: 'Croissant', quantity: 1, price: 4.25 }
  ],
  subtotal: 11.25,
  stateTax: 1.01,
  orderTotal: 12.26,
  timestamp: new Date().toISOString(),
  estimatedTime: 10,
  status: 'confirmed'
};

/**
 * Test the payment response enhancer
 */
function testPaymentResponseEnhancer() {
  console.log('=== Testing Payment Response Enhancer ===\n');
  
  // Test cases
  const testCases = [
    "Your order has been confirmed. Your total is $12.26. Would you like anything else?",
    "Thank you for your order! We'll have it ready in about 10 minutes.",
    "Would you like to pay now or when you pick up your order?",
    "Your order #1234 includes 2 Espressos and 1 Croissant. The total is $12.26.",
    "Is there anything else you'd like to add to your order?"
  ];
  
  // Process each test case
  testCases.forEach((message, index) => {
    console.log(`Test Case ${index + 1}:`);
    console.log(`Original: "${message}"`);
    console.log(`Payment related: ${isPaymentRelatedMessage(message)}`);
    
    const enhancedMessage = addPaymentMarkerToResponse(message, sampleOrder);
    console.log(`Enhanced: "${enhancedMessage}"`);
    console.log(`Changed: ${message !== enhancedMessage}`);
    console.log();
  });
  
  console.log('=== Integration Example ===\n');
  console.log('In your agent.ts file, you can integrate this as follows:');
  console.log(`
// Import the payment response enhancer
import { addPaymentMarkerToResponse } from './paymentResponseEnhancer.js';

// When generating a response in your agent:
const originalResponse = "Your order total is $12.26. Would you like to pay now?";

// If you have an order and are at the payment stage:
if (state.stage === ConversationStage.ORDER_CONFIRMATION && order) {
  // Enhance the response with a payment marker
  const enhancedResponse = addPaymentMarkerToResponse(originalResponse, order);
  
  // Use the enhanced response instead of the original
  // This will include the payment marker that the frontend can detect
  // and replace with a payment button
  return enhancedResponse;
}

// Otherwise, use the original response
return originalResponse;
`);
}

// Run the test
testPaymentResponseEnhancer();
