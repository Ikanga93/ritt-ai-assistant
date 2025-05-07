import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';

// Define temporary order interface
export interface TemporaryOrder {
  id: string;
  customerName: string;
  customerEmail: string;
  restaurantId: string;
  restaurantName: string;
  items: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
    options?: any[];
  }>;
  total: number;
  subtotal: number;
  tax: number;
  createdAt: number;
  expiresAt: number;
  metadata?: Record<string, any>;
  orderNumber?: string;
  addToCart?: boolean;
}

// In-memory storage for temporary orders
const tempOrdersMap = new Map<string, TemporaryOrder>();

// File storage configuration
const TEMP_ORDERS_DIR = path.join(process.cwd(), 'data', 'temp-orders');
const TEMP_ORDERS_INDEX = path.join(TEMP_ORDERS_DIR, 'index.json');

// Ensure the directory exists
if (!fs.existsSync(TEMP_ORDERS_DIR)) {
  fs.mkdirSync(TEMP_ORDERS_DIR, { recursive: true });
}

// Default expiration time: 48 hours (in milliseconds)
const DEFAULT_EXPIRATION_MS = 48 * 60 * 60 * 1000;

/**
 * Generates a unique temporary order ID with "TEMP-" prefix
 */
function generateTempOrderId(): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `TEMP-${timestamp}-${random}`;
}

/**
 * Saves temporary orders to disk
 */
function saveOrdersToDisk(): void {
  try {
    // Create an index of all order IDs
    const orderIds = Array.from(tempOrdersMap.keys());
    fs.writeFileSync(TEMP_ORDERS_INDEX, JSON.stringify(orderIds), 'utf8');

    // Save each order to its own file
    for (const [id, order] of tempOrdersMap.entries()) {
      const orderFilePath = path.join(TEMP_ORDERS_DIR, `${id}.json`);
      fs.writeFileSync(orderFilePath, JSON.stringify(order), 'utf8');
    }
  } catch (error) {
    logger.error('Failed to save temporary orders to disk', {
      context: 'temporaryOrderService',
      error
    });
  }
}

/**
 * Loads temporary orders from disk
 */
function loadOrdersFromDisk(): void {
  try {
    if (!fs.existsSync(TEMP_ORDERS_INDEX)) {
      return;
    }

    const orderIds = JSON.parse(fs.readFileSync(TEMP_ORDERS_INDEX, 'utf8')) as string[];
    
    for (const id of orderIds) {
      const orderFilePath = path.join(TEMP_ORDERS_DIR, `${id}.json`);
      
      if (fs.existsSync(orderFilePath)) {
        const orderData = JSON.parse(fs.readFileSync(orderFilePath, 'utf8')) as TemporaryOrder;
        
        // Only load non-expired orders
        if (orderData.expiresAt > Date.now()) {
          tempOrdersMap.set(id, orderData);
        } else {
          // Clean up expired order files
          fs.unlinkSync(orderFilePath);
        }
      }
    }
    
    logger.info(`Loaded ${tempOrdersMap.size} temporary orders from disk`, {
      context: 'temporaryOrderService'
    });
  } catch (error) {
    logger.error('Failed to load temporary orders from disk', {
      context: 'temporaryOrderService',
      error
    });
  }
}

/**
 * Cleans up expired orders
 */
function cleanupExpiredOrders(): void {
  const now = Date.now();
  let expiredCount = 0;
  
  for (const [id, order] of tempOrdersMap.entries()) {
    if (order.expiresAt < now) {
      tempOrdersMap.delete(id);
      
      // Also remove from disk
      const orderFilePath = path.join(TEMP_ORDERS_DIR, `${id}.json`);
      if (fs.existsSync(orderFilePath)) {
        fs.unlinkSync(orderFilePath);
      }
      
      expiredCount++;
    }
  }
  
  if (expiredCount > 0) {
    logger.info(`Cleaned up ${expiredCount} expired temporary orders`, {
      context: 'temporaryOrderService'
    });
    
    // Update the index file after cleanup
    saveOrdersToDisk();
  }
}

// Initialize: load existing orders from disk
loadOrdersFromDisk();

// Set up periodic cleanup (every hour)
setInterval(cleanupExpiredOrders, 60 * 60 * 1000);

// Set up periodic saving to disk (every 5 minutes)
setInterval(saveOrdersToDisk, 5 * 60 * 1000);

// Export the service
export const temporaryOrderService = {
  /**
   * Stores a temporary order
   */
  storeOrder(orderData: Omit<TemporaryOrder, 'id' | 'createdAt' | 'expiresAt'>): TemporaryOrder {
    console.log('\n=== TEMPORARY ORDER SERVICE - STORE ORDER CALLED ===');
    console.log('Order Data:', JSON.stringify(orderData, null, 2));
    console.log('Add To Cart Flag:', orderData.addToCart ? 'YES' : 'NO');
    console.log('Customer Email:', orderData.customerEmail);
    
    const tempId = generateTempOrderId();
    const now = Date.now();
    
    const tempOrder: TemporaryOrder = {
      ...orderData,
      id: tempId,
      createdAt: now,
      expiresAt: now + DEFAULT_EXPIRATION_MS
    };
    
    console.log('Created Temporary Order:', JSON.stringify({
      id: tempOrder.id,
      customerEmail: tempOrder.customerEmail,
      addToCart: tempOrder.addToCart,
      itemCount: tempOrder.items.length
    }, null, 2));
    
    // Store in memory
    tempOrdersMap.set(tempId, tempOrder);
    
    // Save to disk immediately for this new order
    try {
      const orderFilePath = path.join(TEMP_ORDERS_DIR, `${tempId}.json`);
      fs.writeFileSync(orderFilePath, JSON.stringify(tempOrder), 'utf8');
      
      // Update the index
      const orderIds = Array.from(tempOrdersMap.keys());
      fs.writeFileSync(TEMP_ORDERS_INDEX, JSON.stringify(orderIds), 'utf8');
      
      // If this order should be added to the cart, set the necessary flags
      if (orderData.addToCart && orderData.customerEmail) {
        console.log('\n=== ORDER MARKED FOR CART ===');
        console.log(`Customer Email: ${orderData.customerEmail}`);
        console.log(`Order ID: ${tempId}`);
        
        // Set a flag in the metadata to indicate this order should be in the cart
        tempOrder.metadata = tempOrder.metadata || {};
        tempOrder.metadata.addToCart = true;
        tempOrder.metadata.paymentStatus = 'pending';
        
        // Make sure the addToCart flag is explicitly set to true at the top level as well
        tempOrder.addToCart = true;
        
        // Update the order in memory with the cart flag
        tempOrdersMap.set(tempId, tempOrder);
        
        // Save the updated order to disk
        fs.writeFileSync(orderFilePath, JSON.stringify(tempOrder), 'utf8');
        
        logger.info('Order marked for cart', {
          context: 'temporaryOrderService',
          data: { tempOrderId: tempId, customerEmail: orderData.customerEmail }
        });
      }
    } catch (error) {
      logger.error('Failed to save new temporary order to disk', {
        context: 'temporaryOrderService',
        data: { tempOrderId: tempId },
        error
      });
    }
    
    logger.info('Temporary order created', {
      context: 'temporaryOrderService',
      data: { tempOrderId: tempId }
    });
    
    return tempOrder;
  },
  
  /**
   * Saves an order to the database for cart retrieval
   * This ensures orders placed through the voice assistant are immediately available in the cart
   */
  async saveOrderToDatabase(order: TemporaryOrder): Promise<void> {
    console.log('\n=== SAVE ORDER TO DATABASE CALLED ===');
    console.log('Order:', JSON.stringify({
      id: order.id,
      customerEmail: order.customerEmail,
      addToCart: order.addToCart,
      metadata: order.metadata,
      itemCount: order.items.length
    }, null, 2));
    
    try {
      // Import database-related modules dynamically to avoid circular dependencies
      console.log('Importing database modules...');
      const { AppDataSource } = await import('../database.js');
      const { Order } = await import('../entities/Order.js');
      const { Customer } = await import('../entities/Customer.js');
      const { Restaurant } = await import('../entities/Restaurant.js');
      const { OrderItem } = await import('../entities/OrderItem.js');
      const { MenuItem } = await import('../entities/MenuItem.js');
      const { PaymentStatus } = await import('../entities/Order.js');
      
      console.log('Database initialized:', AppDataSource.isInitialized ? 'YES' : 'NO');
      
      // If database is not initialized, initialize it
      if (!AppDataSource.isInitialized) {
        console.log('Database not initialized, initializing now...');
        try {
          await AppDataSource.initialize();
          console.log('Database initialized successfully');
        } catch (dbInitError: unknown) {
          console.error('Failed to initialize database:', dbInitError);
          const errorMessage = dbInitError instanceof Error ? dbInitError.message : 'Unknown error';
          throw new Error('Database initialization failed: ' + errorMessage);
        }
      }
      
      // Start a transaction
      console.log('Starting database transaction...');
      await AppDataSource.transaction(async transactionalEntityManager => {
        console.log('Transaction started successfully');
        
        // Find or create customer
        console.log('Finding customer with email:', order.customerEmail);
        let customer = await transactionalEntityManager.findOne(Customer, {
          where: { email: order.customerEmail }
        });
        
        if (!customer) {
          console.log('Customer not found, creating new customer:', order.customerName);
          customer = new Customer();
          customer.name = order.customerName;
          customer.email = order.customerEmail;
          customer = await transactionalEntityManager.save(Customer, customer);
          console.log('New customer created with ID:', customer.id);
        } else {
          console.log('Found existing customer with ID:', customer.id);
        }
        
        // Find or create restaurant
        let restaurant = await transactionalEntityManager.findOne(Restaurant, {
          where: { name: order.restaurantName }
        });
        
        if (!restaurant) {
          restaurant = new Restaurant();
          restaurant.name = order.restaurantName;
          restaurant = await transactionalEntityManager.save(Restaurant, restaurant);
        }
        
        // Create order
        const dbOrder = new Order();
        dbOrder.customer = customer;
        dbOrder.restaurant = restaurant;
        dbOrder.order_number = order.orderNumber || `ORDER-${Date.now()}`;
        dbOrder.subtotal = order.subtotal;
        dbOrder.tax = order.tax;
        dbOrder.total = order.total;
        dbOrder.payment_status = PaymentStatus.PENDING;
        dbOrder.payment_link_url = order.metadata?.paymentLink?.url || null;
        
        // Save order
        const savedOrder = await transactionalEntityManager.save(Order, dbOrder);
        
        // Create order items
        for (const item of order.items) {
          let menuItem = await transactionalEntityManager.findOne(MenuItem, {
            where: { name: item.name, restaurant: { id: restaurant.id } }
          });
          
          if (!menuItem) {
            menuItem = new MenuItem();
            menuItem.name = item.name;
            menuItem.price = item.price;
            menuItem.restaurant = restaurant;
            menuItem = await transactionalEntityManager.save(MenuItem, menuItem);
          }
          
          const orderItem = new OrderItem();
          orderItem.order = savedOrder;
          orderItem.menu_item = menuItem;
          orderItem.quantity = item.quantity;
          orderItem.price_at_time = item.price;
          
          await transactionalEntityManager.save(OrderItem, orderItem);
        }
        
        logger.info('Order saved to database for cart retrieval', {
          context: 'temporaryOrderService',
          data: { orderId: savedOrder.id, tempOrderId: order.id }
        });
      });
    } catch (error) {
      logger.error('Failed to save order to database', {
        context: 'temporaryOrderService',
        error,
        data: { tempOrderId: order.id }
      });
      throw error;
    }
  },
  
  /**
   * Retrieves a temporary order by ID
   */
  getOrder(tempOrderId: string): TemporaryOrder | null {
    const order = tempOrdersMap.get(tempOrderId);
    
    if (order) {
      return order;
    }
    
    try {
      const orderFilePath = path.join(TEMP_ORDERS_DIR, `${tempOrderId}.json`);
      
      if (fs.existsSync(orderFilePath)) {
        const orderData = JSON.parse(fs.readFileSync(orderFilePath, 'utf8')) as TemporaryOrder;
        
        if (orderData.expiresAt > Date.now()) {
          tempOrdersMap.set(tempOrderId, orderData);
          return orderData;
        } else {
          fs.unlinkSync(orderFilePath);
        }
      }
    } catch (error) {
      logger.error('Failed to load temporary order from disk', {
        context: 'temporaryOrderService',
        data: { tempOrderId },
        error
      });
    }
    
    return null;
  },
  
  /**
   * Updates a temporary order
   */
  updateOrder(tempOrderId: string, updates: Partial<TemporaryOrder>): TemporaryOrder | null {
    const existingOrder = this.getOrder(tempOrderId);
    
    if (!existingOrder) {
      return null;
    }
    
    const updatedOrder = {
      ...existingOrder,
      ...updates
    };
    
    tempOrdersMap.set(tempOrderId, updatedOrder);
    
    try {
      const orderFilePath = path.join(TEMP_ORDERS_DIR, `${tempOrderId}.json`);
      fs.writeFileSync(orderFilePath, JSON.stringify(updatedOrder), 'utf8');
    } catch (error) {
      logger.error('Failed to update temporary order on disk', {
        context: 'temporaryOrderService',
        data: { tempOrderId },
        error
      });
    }
    
    return updatedOrder;
  },
  
  /**
   * Deletes a temporary order
   */
  deleteOrder(tempOrderId: string): boolean {
    const deleted = tempOrdersMap.delete(tempOrderId);
    
    try {
      const orderFilePath = path.join(TEMP_ORDERS_DIR, `${tempOrderId}.json`);
      
      if (fs.existsSync(orderFilePath)) {
        fs.unlinkSync(orderFilePath);
      }
      
      const orderIds = Array.from(tempOrdersMap.keys());
      fs.writeFileSync(TEMP_ORDERS_INDEX, JSON.stringify(orderIds), 'utf8');
    } catch (error) {
      logger.error('Failed to delete temporary order from disk', {
        context: 'temporaryOrderService',
        data: { tempOrderId },
        error
      });
    }
    
    return deleted;
  },
  
  /**
   * Lists all temporary orders (for admin purposes)
   */
  listOrders(): TemporaryOrder[] {
    console.log('\n=== LISTING TEMPORARY ORDERS ===');
    console.log('Total orders in memory:', tempOrdersMap.size);
    
    const orders = Array.from(tempOrdersMap.values());
    
    const cartOrders = orders.filter(order => order.addToCart === true);
    console.log('Orders with addToCart flag:', cartOrders.length);
    
    if (cartOrders.length > 0) {
      console.log('Cart Orders:', cartOrders.map(order => ({
        id: order.id,
        customerEmail: order.customerEmail,
        addToCart: order.addToCart,
        itemCount: order.items.length,
        total: order.total
      })));
    }
    
    return orders;
  },
  
  /**
   * Gets the count of temporary orders
   */
  getOrderCount(): number {
    return tempOrdersMap.size;
  },
  
  /**
   * Force saves all orders to disk (useful before shutdown)
   */
  forceSaveToDisk(): void {
    saveOrdersToDisk();
  }
};

// Set up process handlers
process.on('SIGTERM', () => {
  saveOrdersToDisk();
  process.exit(0);
});

process.on('SIGINT', () => {
  saveOrdersToDisk();
  process.exit(0);
});
