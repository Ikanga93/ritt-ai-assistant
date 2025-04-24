/**
 * Utilities for storing and retrieving order data during the authentication process
 */

// Define the order data structure
export interface OrderData {
  items: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
    specialInstructions?: string;
  }>;
  subtotal: number;
  tax: number;
  total: number;
  customerName?: string;
  restaurantId: string;
  timestamp: string;
  orderId?: string; // Store the order ID after initial submission
  orderNumber?: string; // Store the order number for reference
}

const ORDER_STORAGE_KEY = 'ritt_pending_order';

/**
 * Store order data in localStorage before authentication
 */
export function storePendingOrder(orderData: OrderData): void {
  try {
    localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(orderData));
    console.log('Order data stored in localStorage');
  } catch (error) {
    console.error('Failed to store order data:', error);
  }
}

/**
 * Retrieve pending order data after authentication
 */
export function getPendingOrder(): OrderData | null {
  try {
    const orderData = localStorage.getItem(ORDER_STORAGE_KEY);
    if (!orderData) return null;
    
    return JSON.parse(orderData);
  } catch (error) {
    console.error('Failed to retrieve order data:', error);
    return null;
  }
}

/**
 * Clear pending order data after successful submission
 */
export function clearPendingOrder(): void {
  try {
    localStorage.removeItem(ORDER_STORAGE_KEY);
    console.log('Pending order data cleared');
  } catch (error) {
    console.error('Failed to clear order data:', error);
  }
}
