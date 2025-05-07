import express from 'express';
import { getPendingOrders } from '../services/cartService.js';
import * as logger from '../utils/logger.js';

/**
 * Cart Routes
 * Handles API endpoints for cart operations:
 * - GET /api/cart/pending/:email - Get pending orders for a customer
 */

const router = express.Router();

/**
 * Get pending orders for a customer
 * 
 * @route GET /api/cart/pending/:email
 * @param {string} email.path.required - Customer's email address
 * @returns {Object} 200 - Success response with transformed orders
 * @returns {Object} 400 - Bad request if email is missing
 * @returns {Object} 500 - Server error
 */
router.get('/pending/:email', async (req: express.Request, res: express.Response) => {
  const { email } = req.params;
  const correlationId = logger.createCorrelationId();

  try {
    logger.info('Fetching pending orders for customer', {
      correlationId,
      context: 'cartRoutes',
      data: { email }
    });

    // Get orders from the database
    const orders = await getPendingOrders(email);
    
    // Transform orders to match frontend expectations
    const transformedOrders = orders.map(order => ({
      id: order.id,
      orderNumber: order.order_number,
      restaurantName: order.restaurant?.name || 'Unknown Restaurant',
      items: order.order_items.map(item => ({
        name: item.menu_item?.name || 'Unknown Item',
        quantity: item.quantity,
        price: item.price_at_time || 0
      })),
      total: order.total,
      paymentLink: order.payment_link_url,
      createdAt: order.created_at
    }));
    
    logger.info('Successfully transformed orders for frontend', {
      correlationId,
      context: 'cartRoutes',
      data: {
        email,
        orderCount: transformedOrders.length
      }
    });

    res.json({ 
      success: true, 
      orders: transformedOrders,
      count: transformedOrders.length
    });
  } catch (error) {
    logger.error('Failed to fetch pending orders', {
      correlationId,
      context: 'cartRoutes',
      error,
      data: { email }
    });

    res.status(500).json({
      success: false,
      error: 'Failed to fetch pending orders',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router; 