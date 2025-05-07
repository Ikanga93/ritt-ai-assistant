import express from 'express';
import { temporaryOrderService } from '../services/temporaryOrderService.js';
import * as logger from '../utils/logger.js';

/**
 * Cart Routes
 * Handles API endpoints for cart operations:
 * - GET /api/cart/:email - Get temporary orders with payment links for a customer
 */

const router = express.Router();

/**
 * Get temporary orders with payment links for a customer
 * 
 * @route GET /api/cart/:email
 * @param {string} email.path.required - Customer's email address
 * @returns {Object} 200 - Success response with temporary orders that have payment links
 * @returns {Object} 400 - Bad request if email is missing
 * @returns {Object} 500 - Server error
 */
router.get('/:email', async (req, res) => {
  const { email } = req.params;
  const correlationId = logger.createCorrelationId();
  const normalizedEmail = email.toLowerCase().trim();

  if (!email) {
    return res.status(400).json({ 
      success: false, 
      error: 'Email is required' 
    });
  }

  try {
    logger.info('Fetching temporary orders with payment links for customer', {
      correlationId,
      context: 'cartRoutes',
      data: { email: normalizedEmail }
    });

    // Get all temporary orders
    const allTempOrders = temporaryOrderService.listOrders();
    
    // Filter by email and pending payment status
    const customerOrders = allTempOrders.filter(order => 
      order.customerEmail.toLowerCase() === normalizedEmail &&
      // Only include orders with payment links that aren't paid yet
      order.metadata?.paymentStatus === 'pending' &&
      order.metadata?.paymentLink?.url
    );
    
    // Format the response
    const cartItems = customerOrders.map(order => {
      // Get payment link from metadata
      const paymentLink = order.metadata?.paymentLink?.url || null;
      
      return {
        id: order.id,
        orderNumber: order.id.split('-')[1] || order.id, // Use part of the ID as order number if not available
        items: order.items.map(item => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price
        })),
        total: order.total,
        subtotal: order.subtotal,
        tax: order.tax,
        restaurantName: order.restaurantName,
        createdAt: order.createdAt,
        paymentLink
      };
    });
    
    logger.info('Successfully fetched temporary orders with payment links', {
      correlationId,
      context: 'cartRoutes',
      data: {
        email: normalizedEmail,
        orderCount: cartItems.length
      }
    });

    return res.json({
      success: true,
      cartCount: cartItems.length,
      items: cartItems
    });
  } catch (error) {
    logger.error('Error fetching temporary orders', {
      correlationId,
      context: 'cartRoutes',
      error
    });
    
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch cart data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;