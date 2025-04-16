// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Handle payment response processing for orders
 */
import { ConversationState, updatePaymentStatus } from './conversationState.js';
import { generatePaymentLink } from './paymentService.js';
import { addPaymentMarkerToResponse } from './paymentResponseEnhancer.js';
import { OrderDetails } from './orderService.js';

// Define a minimal context interface for the agent
interface AgentContext {
  agent: {
    sendText: (text: string) => Promise<void>;
  };
}

/**
 * Process a customer's response to payment options
 * Updates the conversation state based on payment preference
 * 
 * @param ctx The agent context
 * @param state The current conversation state
 * @param message The customer's message
 * @returns Updated conversation state with payment information
 */
export async function handlePaymentResponse(
  ctx: AgentContext,
  state: ConversationState,
  message: string
): Promise<ConversationState> {
  try {
    console.log('Handling payment response:', message);
    
    // Check if we have cart items to process
    if (state.cartItems.length === 0) {
      console.error('No items in cart');
      return state;
    }
    
    // Use the order details from the state
    const order = state.cartItems[0].price ? {
      orderNumber: state.paymentOrderId || Math.floor(Math.random() * 1000) + 1000,
      items: state.cartItems,
      subtotal: state.cartItems.reduce((total, item) => total + (item.price || 0) * item.quantity, 0),
      stateTax: state.cartItems.reduce((total, item) => total + (item.price || 0) * item.quantity, 0) * 0.09,
      orderTotal: state.cartItems.reduce((total, item) => total + (item.price || 0) * item.quantity, 0) * 1.09,
      restaurantName: state.selectedRestaurantName || 'Ritt Drive-Thru'
    } as OrderDetails : null;
    
    if (!order) {
      console.error('Could not create order from cart items');
      return state;
    }
    
    // Normalize the message for easier matching
    const normalizedMessage = message.toLowerCase().trim();
    
    // Check if the customer wants to pay online
    const onlinePaymentKeywords = ['online', 'link', 'now', 'card', 'credit', 'debit', 'pay now', 'website'];
    const wantsOnlinePayment = onlinePaymentKeywords.some(keyword => normalizedMessage.includes(keyword));
    
    if (wantsOnlinePayment || true) { // Always process as online payment since it's the only option
      console.log('Customer wants to pay online');
      
      // Generate a payment link if we don't already have one
      if (!state.paymentUrl) {
        const paymentUrl = await generatePaymentLink(order);
        
        // Update the conversation state with the payment URL
        const updatedState = updatePaymentStatus(
          state,
          paymentUrl,
          order.orderNumber,
          true
        );
        
        console.log('Payment URL generated and state updated:', paymentUrl);
        
        // Return the updated state at the end of the function
        return updatedState;
      }
      
      // Create a payment message with marker
      const paymentMessage = `Your order total is $${order.orderTotal.toFixed(2)}. Please complete your payment using the button below.`;
      const enhancedMessage = addPaymentMarkerToResponse(paymentMessage, order);
      
      // Send the payment message
      await ctx.agent.sendText(enhancedMessage);
    }
    
    return state;
  } catch (error) {
    console.error('Error handling payment response:', error);
    return state;
  }
}
