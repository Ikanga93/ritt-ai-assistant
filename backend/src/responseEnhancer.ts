// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Response enhancer utility for modifying agent responses
 * This allows adding payment markers and other enhancements without modifying the agent directly
 */
import { ConversationState } from './conversationState.js';
import { OrderDetails } from './orderService.js';
import { addPaymentMarkerToResponse } from './paymentResponseEnhancer.js';
import { preparePaymentForChat } from './paymentService.js';

/**
 * Enhance an agent response with payment markers when appropriate
 * 
 * @param response The original agent response
 * @param state The current conversation state
 * @param order Optional order details if available
 * @returns Enhanced response with payment markers if appropriate
 */
export async function enhanceResponse(
  response: string,
  state: ConversationState,
  order?: OrderDetails
): Promise<{ enhancedResponse: string; updatedState: ConversationState }> {
  let enhancedResponse = response;
  let updatedState = state;
  
  // Check if this is a payment-related response
  const isPaymentRelated = isPaymentResponse(response);
  
  // If we have an order and this is a payment-related response, add payment marker
  if (order && isPaymentRelated) {
    try {
      // If we don't have a payment URL yet, prepare one
      if (!state.paymentUrl) {
        const paymentResult = await preparePaymentForChat(order, state);
        updatedState = paymentResult.state;
        enhancedResponse = addPaymentMarkerToResponse(response, order);
      } else {
        // We already have a payment URL, just add the marker
        enhancedResponse = addPaymentMarkerToResponse(response, order);
      }
      
      console.log('Enhanced response with payment marker:', enhancedResponse);
    } catch (error) {
      console.error('Error enhancing response with payment marker:', error);
      // Return the original response if there was an error
      return { enhancedResponse: response, updatedState: state };
    }
  }
  
  return { enhancedResponse, updatedState };
}

/**
 * Check if a response is related to payment
 * 
 * @param response The response to check
 * @returns True if the response is related to payment
 */
function isPaymentResponse(response: string): boolean {
  const paymentPhrases = [
    'total',
    'pay',
    'payment',
    'credit card',
    'debit card',
    'checkout',
    'complete your order',
    'confirm your order',
    '$'
  ];
  
  return paymentPhrases.some(phrase => 
    response.toLowerCase().includes(phrase.toLowerCase())
  );
}
