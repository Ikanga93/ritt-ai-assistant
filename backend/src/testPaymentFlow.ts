// Test script for payment flow
import { JobContext } from '@livekit/agents';
import { handlePayment } from './handlePayment.js';
import { handlePaymentResponse } from './handlePaymentResponse.js';
import { ConversationState, ConversationStage, createInitialState, updateStage } from './conversationState.js';

// Mock LiveKit agent context with proper type casting
const mockCtx = {
  agent: {
    sendText: async (text: string) => {
      console.log('AGENT RESPONSE:', text);
      return true;
    }
  }
} as unknown as JobContext;

async function testPaymentFlow() {
  console.log('=== TESTING PAYMENT FLOW ===');
  
  // Create a sample order
  const initialState = createInitialState();
  
  // Add restaurant selection and order details
  const stateWithOrder = {
    ...initialState,
    selectedRestaurantId: 'burger_joint',
    selectedRestaurantName: 'Burger Joint',
    stage: ConversationStage.PAYMENT_REQUEST,
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
    customerEmail: 'test@example.com',
    orderDetails: {
      orderNumber: 'TEST-123',
      restaurantId: 'burger_joint',
      restaurantName: 'Burger Joint',
      customerName: 'Test Customer',
      customerEmail: 'test@example.com',
      items: [
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
      subtotal: 21.97,
      stateTax: 1.98,
      processingFee: 1.07,
      orderTotal: 25.02,
      timestamp: new Date().toISOString(),
      estimatedTime: 15,
      status: 'pending'
    }
  };

  console.log('\n=== TEST 1: PAY NOW SCENARIO ===');
  try {
    // Test payment link generation
    const paymentState = await handlePayment(mockCtx, stateWithOrder);
    console.log('Payment URL:', paymentState.paymentUrl);
    console.log('Payment state:', JSON.stringify(paymentState, null, 2));
    
    // Test card information for Stripe testing
    console.log('\nTest Card Information:');
    console.log('Success Card: 4242 4242 4242 4242');
    console.log('Expiry: Any future date (e.g., 12/25)');
    console.log('CVC: Any 3 digits (e.g., 123)');
    console.log('ZIP: Any 5 digits (e.g., 12345)');
  } catch (error) {
    console.error('Error generating payment link:', error);
  }

  console.log('\n=== TEST 2: PAY LATER SCENARIO ===');
  try {
    // Test payment response handling for "pay later"
    const payLaterState = await handlePaymentResponse(
      mockCtx,
      stateWithOrder,
      'I will pay at the pickup window'
    );
    console.log('Pay later state:', JSON.stringify(payLaterState, null, 2));
  } catch (error) {
    console.error('Error handling pay later response:', error);
  }

  console.log('\n=== TEST 3: PAY NOW RESPONSE ===');
  try {
    // Test payment response handling for "pay now"
    const payNowState = await handlePaymentResponse(
      mockCtx,
      stateWithOrder,
      'Yes, I want to pay now'
    );
    console.log('Pay now state:', JSON.stringify(payNowState, null, 2));
  } catch (error) {
    console.error('Error handling pay now response:', error);
  }

  console.log('\n=== TEST 4: ERROR HANDLING ===');
  try {
    // Test error handling with invalid state
    const invalidState = { ...stateWithOrder, stage: ConversationStage.GREETING };
    const errorState = await handlePaymentResponse(
      mockCtx,
      invalidState,
      'I want to pay now'
    );
    console.log('Error handling state:', JSON.stringify(errorState, null, 2));
  } catch (error) {
    console.error('Error handling test:', error);
  }
}

// Run the tests
testPaymentFlow().catch(console.error);
