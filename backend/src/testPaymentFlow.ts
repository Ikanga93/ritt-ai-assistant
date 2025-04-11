// Test script for payment flow
import { handlePayment } from './handlePayment.js';
import { handlePaymentResponse } from './handlePaymentResponse.js';
import { ConversationState, ConversationStage, createInitialState, updateStage } from './conversationState.js';

// Mock LiveKit agent context
const mockCtx = {
  agent: {
    sendText: async (text: string) => {
      console.log('AGENT RESPONSE:', text);
      return true;
    }
  }
};

async function testPaymentFlow() {
  console.log('=== TESTING PAYMENT FLOW ===');
  
  // Create a sample order
  const initialState = createInitialState();
  
  // Add restaurant selection
  const stateWithRestaurant = {
    ...initialState,
    selectedRestaurantId: 'burger_joint',
    selectedRestaurantName: 'Burger Joint',
    stage: ConversationStage.ITEM_SELECTION,
    cartItems: [
      {
        id: 'item-1',
        name: 'Cheeseburger',
        quantity: 2,
        price: 8.99
      },
      {
        id: 'item-2',
        name: 'French Fries',
        quantity: 1,
        price: 3.99
      }
    ],
    customerName: 'Test Customer',
    customerEmail: 'test@example.com'
  };
  
  // Set to payment pending stage
  const paymentPendingState = updateStage(stateWithRestaurant, ConversationStage.PAYMENT_PENDING);
  console.log('Initial state:', JSON.stringify(paymentPendingState, null, 2));
  
  // Test payment link generation
  console.log('\n=== TESTING PAYMENT LINK GENERATION ===');
  try {
    const stateWithPaymentLink = await handlePayment(mockCtx as any, paymentPendingState);
    console.log('Payment URL:', stateWithPaymentLink.paymentUrl);
    
    // Test handling "yes" response
    console.log('\n=== TESTING "YES" RESPONSE ===');
    const yesResponse = await handlePaymentResponse(mockCtx as any, stateWithPaymentLink, 'yes I want to pay now');
    console.log('Response to "yes":', JSON.stringify(yesResponse, null, 2));
    
    // Test handling "no" response with a fresh state
    console.log('\n=== TESTING "NO" RESPONSE ===');
    const noResponse = await handlePaymentResponse(mockCtx as any, stateWithPaymentLink, 'no I will pay at pickup');
    console.log('Response to "no":', JSON.stringify(noResponse, null, 2));
    
  } catch (error) {
    console.error('Error in payment flow test:', error);
  }
}

// Run the test
testPaymentFlow().then(() => {
  console.log('Payment flow test completed');
}).catch(error => {
  console.error('Payment flow test failed:', error);
});
