/**
 * Utility functions for handling payment markers in chat messages
 */

// Regular expression to match payment markers in the format [PAYMENT_BUTTON:ORDER_ID:AMOUNT]
const PAYMENT_MARKER_REGEX = /\[PAYMENT_BUTTON:(\d+):([\d.]+)\]/g;

/**
 * Checks if a message contains a payment marker
 * @param message The message to check
 * @returns True if the message contains a payment marker
 */
export function hasPaymentMarker(message: string): boolean {
  return PAYMENT_MARKER_REGEX.test(message);
}

/**
 * Extracts payment information from a message containing a payment marker
 * @param message The message containing a payment marker
 * @returns An object with orderId and amount, or null if no marker is found
 */
export function extractPaymentInfo(message: string): { orderId: number; amount: number } | null {
  // Reset the regex state
  PAYMENT_MARKER_REGEX.lastIndex = 0;
  
  const match = PAYMENT_MARKER_REGEX.exec(message);
  if (!match) return null;
  
  return {
    orderId: parseInt(match[1], 10),
    amount: parseFloat(match[2])
  };
}

/**
 * Replaces payment markers in a message with a placeholder
 * This is used to split the message into parts before and after the marker
 * @param message The message containing a payment marker
 * @returns The message with payment markers replaced by placeholders
 */
export function replacePaymentMarker(message: string): string {
  return message.replace(PAYMENT_MARKER_REGEX, "{{PAYMENT_BUTTON}}");
}

/**
 * Splits a message into parts before and after a payment marker
 * @param message The message containing a payment marker
 * @returns An array of message parts, or the original message if no marker is found
 */
export function splitMessageAtPaymentMarker(message: string): string[] {
  if (!hasPaymentMarker(message)) return [message];
  
  return replacePaymentMarker(message).split("{{PAYMENT_BUTTON}}");
}
