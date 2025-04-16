// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Payment response enhancer for adding payment markers to agent responses
 * This allows the frontend to display payment buttons in the chat interface
 */
import { OrderDetails } from './orderService.js';

/**
 * Generate a payment marker to be included in chat messages
 * The frontend will detect this marker and replace it with a payment button
 * 
 * @param orderId The order ID associated with the payment
 * @param amount The payment amount to display on the button
 * @returns A marker string to include in the chat message
 */
export function generatePaymentMarker(orderId: number, amount: number): string {
  // Format: [PAYMENT_BUTTON:ORDER_ID:AMOUNT]
  // This format is easy to detect and parse in the frontend
  return `[PAYMENT_BUTTON:${orderId}:${amount.toFixed(2)}]`;
}

/**
 * Add a payment marker to a response message
 * This will be detected by the frontend and replaced with a payment button
 * 
 * @param message The original message to add the payment marker to
 * @param order The order details to generate the payment marker from
 * @returns The message with the payment marker added
 */
export function addPaymentMarkerToResponse(message: string, order: OrderDetails): string {
  // Don't add a marker if the message already contains one
  if (containsPaymentMarker(message)) {
    return message;
  }
  
  // Generate the payment marker
  const paymentMarker = generatePaymentMarker(order.orderNumber, order.orderTotal);
  
  // Look for common payment phrases to replace with the marker
  const paymentPhrases = [
    'You can pay online',
    'You can pay with a credit card',
    'Would you like to pay now',
    'Would you like to pay online',
    'You can complete your payment',
    'Your total is',
    'The total is',
    'Your order total is',
    'That will be'
  ];
  
  // Check if the message contains any payment phrases
  for (const phrase of paymentPhrases) {
    if (message.includes(phrase)) {
      // Add the payment marker after the phrase
      return message.replace(phrase, `${phrase} ${paymentMarker}`);
    }
  }
  
  // If no payment phrases found but message is payment-related, add the marker at the end
  if (isPaymentRelatedMessage(message)) {
    return `${message} ${paymentMarker}`;
  }
  
  // If not payment-related, return the original message
  return message;
}

/**
 * Check if a message contains a payment marker
 * 
 * @param message The message to check for payment markers
 * @returns True if the message contains a payment marker
 */
export function containsPaymentMarker(message: string): boolean {
  return message.includes('[PAYMENT_BUTTON:');
}

/**
 * Extract order ID and amount from a payment marker
 * 
 * @param message Message containing a payment marker
 * @returns Object with orderId and amount, or null if no valid marker found
 */
export function extractPaymentInfo(message: string): { orderId: number; amount: number } | null {
  const markerRegex = /\[PAYMENT_BUTTON:(\d+):([\d.]+)\]/;
  const match = message.match(markerRegex);
  
  if (match && match.length === 3) {
    const orderId = parseInt(match[1], 10);
    const amount = parseFloat(match[2]);
    
    if (!isNaN(orderId) && !isNaN(amount)) {
      return { orderId, amount };
    }
  }
  
  return null;
}

/**
 * Helper function to determine if a message is related to payment
 * 
 * @param message The message to check
 * @returns True if the message is related to payment
 */
export function isPaymentRelatedMessage(message: string): boolean {
  const paymentKeywords = [
    'pay',
    'payment',
    'total',
    'credit card',
    'debit card',
    'checkout',
    '$'
  ];
  
  return paymentKeywords.some(keyword => 
    message.toLowerCase().includes(keyword.toLowerCase())
  );
}
