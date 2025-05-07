import { AppDataSource } from '../database.js';
import { Order } from '../entities/Order.js';
import { PaymentStatus } from '../entities/Order.js';
import * as logger from '../utils/logger.js';

/**
 * Cart Service
 * Handles operations related to customer's shopping cart and pending orders
 */

/**
 * Get pending orders for a customer by email
 * This includes orders that:
 * 1. Are associated with the customer's email
 * 2. Have a pending payment status
 * 3. Include all related data (restaurant, items, etc.)
 * 
 * @param email Customer's email address
 * @returns Array of pending orders with all related data
 */
export async function getPendingOrders(email: string): Promise<Order[]> {
  const correlationId = logger.createCorrelationId();
  
  try {
    logger.info('Fetching pending orders for customer', {
      correlationId,
      context: 'cartService',
      data: { email }
    });

    // Query orders with all necessary relations
    const orders = await AppDataSource.getRepository(Order)
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.restaurant', 'restaurant')
      .leftJoinAndSelect('order.order_items', 'order_items')
      .leftJoinAndSelect('order_items.menu_item', 'menu_item')
      .where('customer.email = :email', { email })
      .andWhere('order.payment_status = :status', { status: PaymentStatus.PENDING })
      .orderBy('order.created_at', 'DESC') // Most recent orders first
      .getMany();

    logger.info('Successfully fetched pending orders', {
      correlationId,
      context: 'cartService',
      data: {
        email,
        orderCount: orders.length,
        orderIds: orders.map(o => o.id)
      }
    });

    return orders;
  } catch (error) {
    logger.error('Failed to fetch pending orders', {
      correlationId,
      context: 'cartService',
      error,
      data: { email }
    });
    throw error;
  }
} 