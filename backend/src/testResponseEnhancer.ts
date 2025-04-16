// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Test script to demonstrate how to use the response enhancer in the agent flow
 */
import { ConversationState, ConversationStage, createInitialState } from './conversationState.js';
import { OrderDetails } from './orderService.js';
import { enhanceResponse } from './responseEnhancer.js';

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

// Create initial conversation state
const initialState = createInitialState();
initialState.stage = ConversationStage.ORDER_CONFIRMATION;
initialState.customerName = 'John Doe';

// Test enhancing different types of responses
async function testResponseEnhancer() {
  console.log('\n=== Testing Response Enhancer ===\n');
  
  // Test 1: Payment-related response
  const response1 = "Your order has been confirmed. Your total is $12.26. Would you like anything else?";
  console.log('Original response:', response1);
  const { enhancedResponse: enhanced1, updatedState: state1 } = await enhanceResponse(response1, initialState, sampleOrder);
  console.log('Enhanced response:', enhanced1);
  console.log('Payment URL stored in state:', state1.paymentUrl ? 'Yes' : 'No');
  
  // Test 2: Non-payment-related response
  const response2 = "Thank you for your order! We'll have it ready in about 10 minutes.";
  console.log('\nOriginal response:', response2);
  const { enhancedResponse: enhanced2 } = await enhanceResponse(response2, initialState, sampleOrder);
  console.log('Enhanced response:', enhanced2);
  
  // Test 3: Response with existing payment URL in state
  const stateWithPaymentUrl = { ...initialState, paymentUrl: 'https://checkout.stripe.com/example' };
  const response3 = "Your order total is $12.26. You can pay online.";
  console.log('\nOriginal response:', response3);
  const { enhancedResponse: enhanced3 } = await enhanceResponse(response3, stateWithPaymentUrl, sampleOrder);
  console.log('Enhanced response:', enhanced3);
  
  console.log('\n=== End of Tests ===\n');
  
  // Example of how to integrate in agent flow
  console.log('=== Example Integration in Agent Flow ===\n');
  console.log('1. Agent generates response: "Your order total is $12.26. Would you like to pay now?"');
  console.log('2. Before sending to user, pass through enhanceResponse()');
  console.log('3. Send the enhanced response to the user');
  console.log('4. Update conversation state with the returned updatedState');
  console.log('\nThis allows adding payment markers without modifying the agent directly');
}

// Run the tests
testResponseEnhancer();
