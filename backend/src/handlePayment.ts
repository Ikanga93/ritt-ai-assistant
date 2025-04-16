// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Handle payment generation and processing for orders
 */
import { generatePaymentLink } from './paymentService.js';
import { ConversationState, updatePaymentStatus } from './conversationState.js';
import { OrderDetails } from './orderService.js';

// Define a minimal context interface for the agent
interface AgentContext {
  agent: {
    sendText: (text: string) => Promise<void>;
  };
}

/**
 * Handle payment for an order
 * Updates the conversation state with payment information
 * 
 * @param ctx The agent context
 * @param state The current conversation state
 * @returns Updated conversation state with payment information
 */
export async function handlePayment(
  ctx: AgentContext,
  state: ConversationState
): Promise<{ state: ConversationState; paymentUrl: string }> {
  try {
    // Check if we have order details to process
    if (!state.orderDetails) {
      console.error('No order details found in conversation state');
      throw new Error('No order details found');
    }
    
    // Use the order details directly from the state
    const order = state.orderDetails;
    
    console.log('Processing payment for order:', order.orderNumber);
    
    // Generate a payment link for the order
    const paymentUrl = await generatePaymentLink(order);
    
    if (!paymentUrl) {
      throw new Error('Failed to generate payment URL');
    }
    
    // Update the conversation state with the payment URL
    const updatedState = updatePaymentStatus(
      state,
      paymentUrl,
      order.orderNumber,
      true
    );
    
    console.log('Payment URL generated:', paymentUrl);
    
    return {
      state: updatedState,
      paymentUrl
    };
  } catch (error) {
    console.error('Error handling payment:', error);
    throw error;
  }
}
