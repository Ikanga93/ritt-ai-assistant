import { Request, Response } from 'express';
import { AppDataSource } from '../database.js';
import { Customer } from '../entities/Customer.js';
import { Order } from '../entities/Order.js';

/**
 * Update customer information with Auth0 data after authentication
 * This endpoint is called by the frontend after a user authenticates with Auth0
 */
export async function updateCustomer(req: Request, res: Response) {
  try {
    const { 
      orderId, 
      orderNumber, 
      auth0Id, 
      email, 
      name, 
      picture 
    } = req.body;

    // Validate required fields
    if ((!orderId && !orderNumber) || !auth0Id || !email) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        message: 'orderId/orderNumber, auth0Id, and email are required' 
      });
    }

    // Get repositories
    const orderRepository = AppDataSource.getRepository(Order);
    const customerRepository = AppDataSource.getRepository(Customer);

    // Find the order by ID or order number
    let order;
    if (orderId) {
      order = await orderRepository.findOne({ 
        where: { id: parseInt(orderId.toString()) },
        relations: ['customer']
      });
    } else {
      order = await orderRepository.findOne({ 
        where: { order_number: orderNumber },
        relations: ['customer']
      });
    }

    if (!order) {
      return res.status(404).json({ 
        error: 'Order not found', 
        message: `No order found with ${orderId ? 'ID ' + orderId : 'order number ' + orderNumber}` 
      });
    }

    if (!order.customer || !order.customer.id) {
      return res.status(400).json({ 
        error: 'No customer associated with order', 
        message: 'The order does not have an associated customer ID' 
      });
    }

    // Update the customer record with Auth0 information
    const customer = order.customer;
    customer.email = email;
    customer.auth0Id = auth0Id;
    customer.picture = picture || null;
    customer.updated_at = new Date();
    
    const updatedCustomer = await customerRepository.save(customer);

    if (!updatedCustomer) {
      return res.status(500).json({ 
        error: 'Failed to update customer', 
        message: 'Customer update failed' 
      });
    }

    // Update the order status from PENDING to CONFIRMED
    order.status = 'CONFIRMED';
    order.updated_at = new Date();
    const updatedOrder = await orderRepository.save(order);

    return res.status(200).json({
      message: 'Customer and order updated successfully',
      customer: updatedCustomer,
      order: updatedOrder
    });
  } catch (error) {
    console.error('Error updating customer:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message
    });
  }
}
