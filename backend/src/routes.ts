import { Request, Response, Router } from 'express';
import { AppDataSource } from './database.js';
import { Customer } from './entities/Customer.js';
import { Order } from './entities/Order.js';
import { placeOrder } from './orderService.js';
import { saveOrderToDatabase } from './services/orderDatabaseService.js';
import { syncCustomerWithAuth0 } from './services/customerAuthService.js';

// Create a router for our API routes
const router = Router();

// Customer update endpoint
router.post('/update-customer', async (req: Request, res: Response) => {
  try {
    const { orderId, orderNumber, auth0Id, email, name, picture } = req.body;
    
    // Validate required fields
    if ((!orderId && !orderNumber) || !auth0Id || !email) {
      res.status(400).json({ 
        error: 'Missing required fields', 
        message: 'orderId/orderNumber, auth0Id, and email are required' 
      });
      return;
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
      res.status(404).json({ 
        error: 'Order not found', 
        message: `No order found with ${orderId ? 'ID ' + orderId : 'order number ' + orderNumber}` 
      });
      return;
    }

    if (!order.customer || !order.customer.id) {
      res.status(400).json({ 
        error: 'No customer associated with order', 
        message: 'The order does not have an associated customer ID' 
      });
      return;
    }

    // Update the customer record with Auth0 information
    const customer = order.customer;
    customer.email = email;
    customer.auth0Id = auth0Id;
    customer.picture = picture || null;
    customer.updated_at = new Date();
    
    const updatedCustomer = await customerRepository.save(customer);

    if (!updatedCustomer) {
      res.status(500).json({ 
        error: 'Failed to update customer', 
        message: 'Customer update failed' 
      });
      return;
    }

    // Update the order status from PENDING to CONFIRMED
    order.status = 'CONFIRMED';
    order.updated_at = new Date();
    const updatedOrder = await orderRepository.save(order);
    
    res.status(200).json({
      message: 'Customer and order updated successfully',
      customer: updatedCustomer,
      order: updatedOrder
    });
    return;
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message
    });
    return;
  }
});

// Submit order endpoint
router.post('/submit-order', async (req: Request, res: Response) => {
  try {
    console.log('Received request to /api/submit-order');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    const orderData = req.body;
    const auth0User = orderData.auth0User;
    
    console.log('Received order submission:', {
      customerName: orderData.customerName,
      restaurantId: orderData.restaurantId,
      itemCount: orderData.items?.length || 0,
      auth0User: auth0User ? JSON.stringify(auth0User) : 'not present'
    });
    
    // Save the order to the database
    const result = await saveOrderToDatabase(orderData, auth0User);
    
    // Return success response
    res.status(200).json({
      success: true,
      message: 'Order submitted successfully',
      orderId: result.dbOrderId,
      orderNumber: result.orderNumber
    });
  } catch (error) {
    console.error('Error submitting order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit order',
      message: (error as Error).message
    });
  }
});

// Sync user endpoint
router.post('/sync-user', async (req: Request, res: Response) => {
  try {
    const { user } = req.body;
    
    if (!user || !user.sub || !user.email) {
      res.status(400).json({
        success: false,
        error: 'Invalid user data',
        message: 'User must have sub (Auth0 ID) and email'
      });
      return;
    }
    
    console.log('Syncing user with database:', {
      auth0Id: user.sub,
      email: user.email,
      name: user.name || 'Unknown'
    });
    
    // Sync the user with our database
    const customer = await syncCustomerWithAuth0(user);
    
    if (!customer) {
      res.status(500).json({
        success: false,
        error: 'Failed to sync user',
        message: 'Could not create or update customer record'
      });
      return;
    }
    
    // Return success response
    res.status(200).json({
      success: true,
      message: 'User synced successfully',
      customerId: customer.id
    });
    return;
  } catch (error) {
    console.error('Error syncing user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync user',
      message: (error as Error).message
    });
    return;
  }
});

export default router;
