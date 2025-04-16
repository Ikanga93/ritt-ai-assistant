/**
 * Service for handling payment-related functionality
 */

/**
 * Retrieves a payment URL for a specific order
 * @param orderId The ID of the order to pay for
 * @param amount The amount to pay
 * @returns A Promise that resolves to the payment URL
 */
export async function getPaymentUrl(orderId: number, amount: number): Promise<string> {
  try {
    // Call the API to get the payment URL
    const response = await fetch(`/api/payment/generate?orderId=${orderId}&amount=${amount}`);
    
    if (!response.ok) {
      throw new Error(`Failed to retrieve payment URL: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.paymentUrl;
  } catch (error) {
    console.error('Error retrieving payment URL:', error);
    // Fallback to a direct API call if the frontend API fails
    return `/api/payment/generate?orderId=${orderId}&amount=${amount}`;
  }
}

/**
 * Opens a payment URL in a new tab
 * @param url The payment URL to open
 */
export function openPaymentUrl(url: string): void {
  // Open the payment URL in a new tab
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Handles a payment button click
 * Retrieves the payment URL and opens it in a new tab
 * @param orderId The ID of the order to pay for
 * @param amount The amount to pay
 */
export async function handlePaymentButtonClick(orderId: number, amount: number): Promise<void> {
  try {
    const paymentUrl = await getPaymentUrl(orderId, amount);
    openPaymentUrl(paymentUrl);
  } catch (error) {
    console.error('Error handling payment button click:', error);
    alert('Sorry, we couldn\'t process your payment request. Please try again later.');
  }
}
