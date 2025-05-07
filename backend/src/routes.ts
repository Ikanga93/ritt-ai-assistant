import { Request, Response, Router } from 'express';
import { AppDataSource } from './database.js';
import { Customer } from './entities/Customer.js';
import { Order } from './entities/Order.js';
import { placeOrder } from './orderService.js';
import { saveOrderToDatabase } from './services/orderDatabaseService.js';
import { syncCustomerWithAuth0 } from './services/customerAuthService.js';
import { isDatabaseHealthy } from './database.js';
import * as logger from './utils/logger.js';
import { addToQueue, getQueueStats } from './services/orderQueueService.js';
import { temporaryOrderService, TemporaryOrder } from './services/temporaryOrderService.js';
import { generateOrderPaymentLink } from './services/orderPaymentLinkService.js';
import adminRoutes from './routes/admin.js';
import webhookRoutes from './routes/webhooks.js';
import paymentRoutes from './routes/paymentRoutes.js';
import cartRoutes from './routes/cart.js';
import express from 'express';

// Create a router for our API routes
const router: Router = express.Router();

// Mount admin routes
router.use('/admin', adminRoutes);

// Mount webhook routes
router.use('/webhooks', webhookRoutes);

// Mount payment routes
router.use('/payments', paymentRoutes);

// Mount cart routes
router.use('/cart', cartRoutes);

/**
 * Health check endpoint to monitor system status
 * Returns database connection status and other system health information
 */
router.get('/health', async (req: Request, res: Response) => {
  const correlationId = logger.createCorrelationId();
  logger.info('Health check requested', { correlationId, context: 'healthCheck' });
  
  try {
    // Check database connection health
    const dbHealthy = await isDatabaseHealthy();
    
    // Get queue statistics
    let queueStats = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      deadLetter: 0,
      total: 0
    };
    
    try {
      queueStats = await getQueueStats();
    } catch (error) {
      logger.error('Error getting queue statistics', { correlationId, context: 'healthCheck', error });
    }
    
    // Determine overall system status
    const hasQueueIssues = queueStats.deadLetter > 0 || queueStats.failed > 0;
    const status = !dbHealthy ? 'degraded' : hasQueueIssues ? 'warning' : 'healthy';
    
    // Return health check response
    const healthData = {
      status,
      timestamp: new Date().toISOString(),
      database: {
        connected: dbHealthy,
        status: dbHealthy ? 'healthy' : 'error'
      },
      queue: {
        pending: queueStats.pending,
        processing: queueStats.processing,
        completed: queueStats.completed,
        failed: queueStats.failed,
        deadLetter: queueStats.deadLetter,
        total: queueStats.total,
        status: hasQueueIssues ? 'warning' : 'healthy'
      },
      version: process.env.npm_package_version || '1.0.0'
    };
    
    logger.info('Health check completed', { 
      correlationId, 
      context: 'healthCheck',
      data: healthData
    });
    
    // Set appropriate status code based on health
    const statusCode = dbHealthy ? 200 : 503; // Service Unavailable if DB is down
    res.status(statusCode).json(healthData);
  } catch (error) {
    logger.error('Health check failed', { correlationId, context: 'healthCheck', error });
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Failed to complete health check'
    });
  }
});

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
  // Create a correlation ID for tracking this request
  const correlationId = logger.createCorrelationId();
  
  try {
    logger.info('Received order submission request', {
      correlationId,
      context: 'submitOrder'
    });
    
    const orderData = req.body;
    const auth0User = orderData.auth0User;
    
    logger.info('Processing order submission', {
      correlationId,
      orderNumber: String(orderData.orderNumber),
      context: 'submitOrder',
      data: {
        customerName: orderData.customerName,
        restaurantId: orderData.restaurantId,
        hasAuth0User: !!auth0User,
        itemCount: orderData.items?.length || 0
      }
    });
    
    // NEW FLOW: Store the order in temporary storage first
    // Create order object for temporary storage
    const tempOrderData = {
      customerName: orderData.customerName,
      customerEmail: orderData.customerEmail || '',
      restaurantId: orderData.restaurantId || 'default-restaurant',
      restaurantName: orderData.restaurantName || 'Ritt Drive-Thru',
      items: orderData.items.map((item: any) => ({
        id: item.id || `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: item.name,
        price: item.price,
        quantity: item.quantity || 1,
        options: item.options || []
      })),
      subtotal: orderData.subtotal || orderData.items.reduce((sum: number, item: any) => sum + (item.price * (item.quantity || 1)), 0),
      tax: orderData.tax || 0,
      total: orderData.total || orderData.items.reduce((sum: number, item: any) => sum + (item.price * (item.quantity || 1)), 0) + (orderData.tax || 0),
      orderNumber: orderData.orderNumber
    };
    
    // Store order in temporary storage
    logger.info('Storing order in temporary storage', {
      correlationId,
      context: 'submitOrder',
      data: {
        customerName: tempOrderData.customerName,
        itemCount: tempOrderData.items.length,
        total: tempOrderData.total
      }
    });
    
    const tempOrder = temporaryOrderService.storeOrder(tempOrderData);
    
    logger.info('Order stored in temporary storage', {
      correlationId,
      context: 'submitOrder',
      data: {
        tempOrderId: tempOrder.id,
        expiresAt: new Date(tempOrder.expiresAt).toISOString()
      }
    });
    
    // Generate payment link if customer email is provided
    let paymentLinkUrl = null;
    
    if (tempOrderData.customerEmail) {
      try {
        logger.info('Generating payment link', {
          correlationId,
          context: 'submitOrder',
          data: {
            tempOrderId: tempOrder.id,
            customerEmail: tempOrderData.customerEmail
          }
        });
        
        // Generate payment link using the temporary order
        const orderWithPayment = await generateOrderPaymentLink({
          orderId: tempOrder.id,
          customerEmail: tempOrderData.customerEmail,
          customerName: tempOrderData.customerName,
          description: `Order from ${tempOrderData.restaurantName}`,
          expirationHours: 48
        });
        
        // Extract payment link URL
        paymentLinkUrl = orderWithPayment.metadata?.paymentLink?.url || null;
        
        logger.info('Payment link generated', {
          correlationId,
          context: 'submitOrder',
          data: {
            tempOrderId: tempOrder.id,
            hasPaymentLink: !!paymentLinkUrl
          }
        });
      } catch (error) {
        logger.error('Failed to generate payment link', {
          correlationId,
          context: 'submitOrder',
          error,
          data: {
            tempOrderId: tempOrder.id,
            customerEmail: tempOrderData.customerEmail
          }
        });
      }
    } else {
      logger.info('No customer email provided, skipping payment link generation', {
        correlationId,
        context: 'submitOrder',
        data: {
          tempOrderId: tempOrder.id
        }
      });
    }
    
    // Return success response
    res.status(200).json({
      success: true,
      message: 'Order received successfully',
      orderId: tempOrder.id,
      orderNumber: orderData.orderNumber,
      paymentLink: paymentLinkUrl
    });
  } catch (error: any) {
    logger.error('Error submitting order', {
      correlationId,
      context: 'submitOrder',
      error
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to submit order',
      message: error.message || 'Unknown error'
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

// Error handling middleware
router.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const errorMessage = err instanceof Error ? err.message : 'Unknown error';
  
  logger.error('Unhandled error in routes', {
    context: 'routes',
    error: errorMessage
  });
  
  res.status(500).json({ error: 'Internal server error' });
});

export default router;
