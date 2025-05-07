import { Order } from '../types/order';

interface CartResponse {
  orders: Order[];
}

/**
 * Fetch pending orders for a customer
 * @param email Customer's email address
 * @returns Promise<Order[]> Array of pending orders
 */
export async function getPendingOrders(email: string): Promise<Order[]> {
  try {
    const response = await fetch(`/api/cart/pending/${encodeURIComponent(email)}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch pending orders');
    }
    
    const data: CartResponse = await response.json();
    return data.orders;
  } catch (error) {
    console.error('Error fetching pending orders:', error);
    throw error;
  }
} 