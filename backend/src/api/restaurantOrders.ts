// Restaurant Orders API
// Simple API endpoint to retrieve orders by restaurant ID

import express, { Router, Request, Response, NextFunction } from 'express';
import { getOrdersByRestaurant } from '../orderStorage.js';
import paymentLogger from '../utils/paymentLogger.js';

const router = express.Router() as Router;

// Get all orders for a restaurant
router.get('/api/restaurant/:restaurantId/orders', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    
    if (!restaurantId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Restaurant ID is required' 
      });
    }
    
    // Log the request
    await paymentLogger.info('API', `Retrieving orders for restaurant ${restaurantId}`, {
      data: { restaurantId }
    });
    
    // Get orders for the restaurant
    const orders = await getOrdersByRestaurant(restaurantId);
    
    // Return the orders
    return res.status(200).json({
      success: true,
      count: orders.length,
      data: orders
    });
  } catch (error) {
    // Log the error
    await paymentLogger.error('API', 'Error retrieving restaurant orders', {
      data: { 
        error: error instanceof Error ? error.message : String(error),
        restaurantId: req.params.restaurantId
      }
    });
    
    // Return error response
    return res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// Get a specific order for a restaurant
router.get('/api/restaurant/:restaurantId/orders/:orderNumber', async (req: Request, res: Response) => {
  try {
    const { restaurantId, orderNumber } = req.params;
    
    if (!restaurantId || !orderNumber) {
      return res.status(400).json({ 
        success: false, 
        error: 'Restaurant ID and Order Number are required' 
      });
    }
    
    // Log the request
    await paymentLogger.info('API', `Retrieving order #${orderNumber} for restaurant ${restaurantId}`, {
      orderId: orderNumber,
      data: { restaurantId }
    });
    
    // Get orders for the restaurant
    const orders = await getOrdersByRestaurant(restaurantId);
    
    // Find the specific order
    const order = orders.find(o => 
      String(o.orderNumber) === String(orderNumber)
    );
    
    if (!order) {
      return res.status(404).json({
        success: false,
        error: `Order #${orderNumber} not found for restaurant ${restaurantId}`
      });
    }
    
    // Return the order
    return res.status(200).json({
      success: true,
      data: order
    });
  } catch (error) {
    // Log the error
    await paymentLogger.error('API', 'Error retrieving restaurant order', {
      orderId: req.params.orderNumber,
      data: { 
        error: error instanceof Error ? error.message : String(error),
        restaurantId: req.params.restaurantId
      }
    });
    
    // Return error response
    return res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

export default router;
