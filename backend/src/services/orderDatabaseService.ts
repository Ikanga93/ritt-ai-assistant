// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Service to handle database operations for orders
 * Bridges the gap between the in-memory order system and the database
 */

import { OrderRepository } from '../repositories/OrderRepository.js';

import { OrderDetails } from '../orderService.js';
import { OrderItem } from '../entities/OrderItem.js';
import { OrderStatus } from '../types/order.js';

import { Customer } from '../entities/Customer.js';
import { AppDataSource, ensureDatabaseConnection, executeWithRetry } from '../database.js';
import { Order } from '../entities/Order.js';
import { syncCustomerWithAuth0 } from './customerAuthService.js';
import * as logger from '../utils/logger.js';
import * as orderRetryQueue from '../utils/orderRetryQueue.js';
import { generateOrderPaymentLink } from './orderPaymentService.js';
import { PaymentStatus } from '../entities/Order.js';
import { generateOrderNumber } from '../utils/orderUtils.js';
import { priceCalculator } from './priceCalculator.js';

// Initialize repository
const orderRepository = new OrderRepository();

/**
 * Save an order to the database
 * 
 * @param orderDetails Order details from the conversation
 * @param auth0User Optional Auth0 user object for authenticated orders
 * @returns The saved order with database ID
 */
export async function saveOrderToDatabase(
  orderDetails: OrderDetails, 
  auth0User?: any
): Promise<OrderDetails & { dbOrderId: number }> {
  // Create a correlation ID for tracking this order throughout the system
  const correlationId = logger.createCorrelationId(
    undefined,  // Order ID not yet available
    String(orderDetails.orderNumber)
  );
  
  logger.info('Database save started', {
    correlationId,
    orderNumber: String(orderDetails.orderNumber),
    context: 'saveOrderToDatabase',
    data: {
      restaurantId: orderDetails.restaurantId,
      customerName: orderDetails.customerName,
      hasAuth0User: !!auth0User,
      itemCount: orderDetails.items.length
    }
  });
  
  logger.info('Ensuring database connection is healthy', {
    correlationId,
    orderNumber: String(orderDetails.orderNumber),
    context: 'saveOrderToDatabase'
  });
  
  try {
    // Ensure database connection is ready before proceeding
    const connectionReady = await ensureDatabaseConnection();
    if (!connectionReady) {
      const errorMessage = 'Failed to establish a healthy database connection for order processing';
      logger.error(errorMessage, {
        correlationId,
        orderNumber: String(orderDetails.orderNumber),
        context: 'saveOrderToDatabase'
      });
      
      // Add to retry queue if database connection fails
      orderRetryQueue.addFailedOrder(
        orderDetails,
        auth0User,
        correlationId,
        errorMessage
      );
      
      throw new Error(errorMessage);
    }

    // Verify database is initialized
    if (!AppDataSource.isInitialized) {
      throw new Error('Database not initialized');
    }
    
    // Start a transaction to ensure all operations succeed or fail together
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
  
    try {
      
      // Handle customer creation/lookup based on Auth0 user if available
      let customerId: number;
      
      if (auth0User) {
        console.log('Processing Auth0 user:', {
          sub: auth0User.sub,
          email: auth0User.email,
          name: auth0User.name
        });
        
        const customer = await syncCustomerWithAuth0(auth0User);
        console.log('Customer sync result:', customer ? {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          auth0Id: customer.auth0Id
        } : 'null');
        
        if (customer) {
          customerId = customer.id;
          console.log(`Using customer ID from Auth0 sync: ${customerId}`);
        } else {
          console.log('Auth0 sync failed, falling back to regular customer creation');
          customerId = await executeWithRetry(
            () => getOrCreateCustomer(
              orderDetails.customerName,
              orderDetails.customerPhone,
              orderDetails.customerEmail
            ),
            'getOrCreateCustomer'
          );
        }
      } else {
        console.log('No Auth0 user, using regular customer creation');
        customerId = await executeWithRetry(
          () => getOrCreateCustomer(
            orderDetails.customerName,
            orderDetails.customerPhone,
            orderDetails.customerEmail
          ),
          'getOrCreateCustomer'
        );
      }
      
      if (!customerId) {
        throw new Error('Failed to get or create customer');
      }
      
      console.log(`Final customer ID: ${customerId}`);
      
      // First, ensure the restaurant exists in the database
      const restaurantId = await findOrCreateRestaurant(orderDetails.restaurantId, orderDetails.restaurantName);
      if (!restaurantId) {
        throw new Error('Failed to get or create restaurant');
      }
      console.log(`Restaurant ID: ${restaurantId}`);
      
      // Then, ensure menu items exist in the database
      console.log('Processing menu items...');
      const orderItems = await Promise.all(orderDetails.items.map(async item => {
        // Validate that the item has a valid price
        if (item.price === undefined || item.price === null || item.price < 0) {
          throw new Error(`Invalid price for menu item: ${item.name}. All items must have valid prices.`);
        }
        
        const menuItemId = await executeWithRetry(
          () => findOrCreateMenuItem(item.name, item.price, restaurantId),
          `findOrCreateMenuItem-${item.name}`
        );
        if (!menuItemId) {
          throw new Error(`Failed to get or create menu item: ${item.name}`);
        }
        console.log(`Menu item processed: ${item.name} -> ID: ${menuItemId}`);
        return {
          menuItemId,
          quantity: item.quantity,
          specialInstructions: item.specialInstructions,
          price_at_time: item.price
        };
      }));
      
      if (!orderItems.length) {
        throw new Error('No order items to save');
      }
      
      console.log('Creating order in database...');
      // Calculate price breakdown
      const priceBreakdown = priceCalculator.calculateOrderPrices(orderDetails.subtotal);

      const newOrder = new Order();
      newOrder.order_number = orderDetails.orderNumber;
      newOrder.status = OrderStatus.PENDING;
      newOrder.customer_id = customerId;
      newOrder.restaurant_id = restaurantId;
      newOrder.subtotal = orderDetails.subtotal;
      newOrder.tax = priceBreakdown.tax;
      newOrder.total = priceBreakdown.totalWithFees;  // This is subtotal + tax + processing fee
      newOrder.processing_fee = priceBreakdown.processingFee;
      newOrder.customer_email = orderDetails.customerEmail;
      newOrder.customer_name = orderDetails.customerName;
      // Use existing tax or calculate it
      let tax = orderDetails.stateTax;
      if (tax === undefined || tax === null) {
        // Calculate tax (assuming 11.5% tax rate)
        tax = parseFloat((orderDetails.subtotal * 0.115).toFixed(2));
      }
      newOrder.tax = tax;
      
      // Use existing processing fee or default to 0
      const processingFee = orderDetails.processingFee || 0;
      newOrder.processing_fee = processingFee;
      
      // Use existing total or calculate it
      let total = orderDetails.orderTotal;
      if (total === undefined || total === null) {
        // Calculate total (subtotal + tax + processing fee)
        total = orderDetails.subtotal + tax + processingFee;
      }
      newOrder.total = parseFloat(total.toFixed(2));
      
      // Ensure order_number is a string as required by the entity
      newOrder.order_number = String(orderDetails.orderNumber);
      newOrder.created_at = new Date();
      newOrder.updated_at = new Date();
      
      console.log(`Order details: subtotal=${orderDetails.subtotal}, tax=${tax}, processingFee=${processingFee}, total=${total}`);
      
      // Save the order
      const savedOrder = await queryRunner.manager.save(Order, newOrder);
      console.log(`Order saved with ID: ${savedOrder.id}`);
      
      // Create order items
      const orderItemEntities = orderItems.map(item => {
        const orderItem = new OrderItem();
        orderItem.order_id = savedOrder.id;
        orderItem.menu_item_id = item.menuItemId;
        orderItem.quantity = item.quantity;
        orderItem.special_instructions = item.specialInstructions || null;
        orderItem.price_at_time = item.price_at_time;
        return orderItem;
      });

      // Save all order items
      console.log(`Saving ${orderItemEntities.length} order items with retry logic...`);
      await executeWithRetry(
        () => queryRunner.manager.save('OrderItem', orderItemEntities),
        'saveOrderItems'
      );
      console.log(`Saved ${orderItemEntities.length} order items successfully`);
      
      // Get the complete order with items
      const completedOrder = await executeWithRetry(
        () => queryRunner.manager
          .createQueryBuilder(Order, 'order')
          .where('order.id = :id', { id: savedOrder.id })
          .getOne(),
        'getCompletedOrder'
      );

      if (!completedOrder) {
        throw new Error('Failed to retrieve completed order');
      }

      // Commit the transaction
      await queryRunner.commitTransaction();

      // Generate payment link if needed
      if (orderDetails.customerEmail) {
        try {
          const paymentLink = await generateOrderPaymentLink(orderDetails, completedOrder.id);
          if (paymentLink) {
            completedOrder.payment_link_url = paymentLink;
            await queryRunner.manager.save(Order, completedOrder);
          }
        } catch (error) {
          logger.error('Failed to generate payment link', {
            correlationId,
            orderNumber: String(orderDetails.orderNumber),
            context: 'saveOrderToDatabase',
            error
          });
          // Don't throw here - we still want to return the order even if payment link generation fails
        }
      }

      return {
        ...orderDetails,
        dbOrderId: completedOrder.id
      };

    } catch (error) {
      // Rollback the transaction on error
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      // Release the query runner
      await queryRunner.release();
    }
  } catch (error: any) {
    logger.error('Failed to save order to database', {
      correlationId,
      orderNumber: String(orderDetails.orderNumber),
      context: 'saveOrderToDatabase',
      error: error.message
    });
    throw error;
  }
}

/**
 * Retrieve an order from the database by order number
 * 
 * @param orderNumber The order number to look up
 * @returns The order details or null if not found
 */
export async function getOrderByNumber(orderNumber: string): Promise<Order | null> {
  try {
    // Find the order by its order number
    const order = await AppDataSource.getRepository(Order)
      .createQueryBuilder('order')
      .where('order.order_number = :orderNumber', { orderNumber })
      .leftJoinAndSelect('order.order_items', 'order_items')
      .getOne();
    
    return order;
  } catch (error) {
    console.error(`Error retrieving order #${orderNumber}:`, error);
    return null;
  }
}

/**
 * Get or create a customer record
 * 
 * @param name Customer name
 * @param phone Optional customer phone
 * @param email Optional customer email
 * @returns Customer ID
 */
async function getOrCreateCustomer(
  name: string,
  phone?: string,
  email?: string
): Promise<number> {
  try {
    // Ensure database connection is healthy
    console.log('Ensuring database connection is healthy in getOrCreateCustomer...');
    const connectionReady = await ensureDatabaseConnection();
    if (!connectionReady) {
      throw new Error('Failed to establish a healthy database connection in getOrCreateCustomer');
    }
    
    // Try to find an existing customer by email first (most reliable), then phone
    let customer: Customer | null = null;
    
    if (email) {
      try {
        customer = await AppDataSource.getRepository(Customer).findOne({
          where: { email }
        });
        
        if (customer) {
          console.log(`Found existing customer by email: ${email}`);
          return customer.id;
        }
      } catch (error) {
        console.error('Error finding customer by email:', error);
      }
    }
    
    if (phone && !customer) {
      try {
        customer = await AppDataSource.getRepository(Customer)
          .findOne({ where: { phone } });
      } catch (error) {
        console.error('Error finding customer by phone:', error);
      }
    }
    
    // If customer doesn't exist, create a new one
    console.log(`Creating new customer: ${name}`);
    const newCustomer = new Customer();
    newCustomer.name = name;
    newCustomer.phone = phone || '';
    newCustomer.email = email || '';
    
    const savedCustomer = await AppDataSource.getRepository(Customer).save(newCustomer);
    console.log(`Created new customer with ID: ${savedCustomer.id}`);
    return savedCustomer.id;
  } catch (error) {
    console.error('Error getting or creating customer:', error);
    // Return a default customer ID
    return 1;
  }
}

/**
 * Find or create a restaurant in the database
 * 
 * @param restaurantId The restaurant ID from the JSON file
 * @param restaurantName The restaurant name
 * @returns The database restaurant ID
 */
async function findOrCreateRestaurant(restaurantId: string, restaurantName: string): Promise<number> {
  try {
    // Ensure database connection is healthy
    console.log('Ensuring database connection is healthy in findOrCreateRestaurant...');
    const connectionReady = await ensureDatabaseConnection();
    if (!connectionReady) {
      throw new Error('Failed to establish a healthy database connection in findOrCreateRestaurant');
    }
    
    // Normalize the restaurant ID (replace hyphens with underscores)
    const normalizedRestaurantId = restaurantId.replace(/-/g, '_');
    console.log(`Normalized restaurant ID: ${normalizedRestaurantId} (from "${restaurantId}")`);
    
    // Get the restaurant data from the JSON file to ensure we have the correct name
    const { getRestaurantById } = await import('../restaurantUtils.js');
    const restaurantData = await getRestaurantById(normalizedRestaurantId);
    
    // Get the proper restaurant name from the data
    const properRestaurantName = restaurantData?.coffee_shop_name || 
                               restaurantData?.coffee_shop || 
                               restaurantName || 
                               'Unknown Restaurant';
    
    console.log(`Looking for restaurant with proper name: ${properRestaurantName}`);
    
    // Try to find the restaurant by name using raw query to avoid entity mapping issues
    const existingRestaurant = await AppDataSource.query(
      `SELECT id, name FROM restaurants WHERE name = $1 LIMIT 1`,
      [properRestaurantName]
    );
    
    if (existingRestaurant && existingRestaurant.length > 0) {
      console.log(`Found existing restaurant: ${properRestaurantName} with ID: ${existingRestaurant[0].id}`);
      return existingRestaurant[0].id;
    }
    
    // If restaurant doesn't exist, use the data we already loaded
    console.log(`Restaurant not found in database, creating new record for: ${properRestaurantName}`);
    
    if (!restaurantData) {
      console.error(`Could not find restaurant data for ID: ${normalizedRestaurantId}`);
      throw new Error(`Restaurant data not found for ID: ${normalizedRestaurantId}`);
    }
    
    // Extract the location data
    const address = restaurantData.location?.address || 'Address not provided';
    const phone = restaurantData.location?.phone || 'Phone not provided';
    const email = restaurantData.location?.email || restaurantData.email || null;
    
    console.log(`Creating restaurant with data from JSON: ${properRestaurantName}, ${address}, ${phone}, ${email || 'No email'}`);
    
    // Create the restaurant with the data from the JSON file
    const result = await AppDataSource.query(
      `INSERT INTO restaurants (name, address, phone, email, is_active) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [properRestaurantName, address, phone, email, true]
    );
    
    if (result && result.length > 0) {
      console.log(`Created new restaurant: ${properRestaurantName} with ID: ${result[0].id}`);
      return result[0].id;
    } else {
      console.error('Failed to create restaurant');
      throw new Error('Failed to create restaurant');
    }
  } catch (error) {
    console.error(`Error finding or creating restaurant: ${restaurantName}`, error);
    throw error; // Re-throw the error to be handled by the caller
  }
}

/**
 * Find or create a menu item in the database
 * 
 * @param itemName The name of the menu item
 * @param price The price of the menu item
 * @param restaurantId The restaurant ID
 * @returns The menu item ID
 */
async function findOrCreateMenuItem(itemName: string, price: number, restaurantId: number): Promise<number> {
  try {
    // Ensure database connection is healthy
    console.log('Ensuring database connection is healthy in findOrCreateMenuItem...');
    const connectionReady = await ensureDatabaseConnection();
    if (!connectionReady) {
      throw new Error('Failed to establish a healthy database connection in findOrCreateMenuItem');
    }
    
    // Try to find an existing menu item by name and restaurant ID using raw query
    const existingMenuItem = await AppDataSource.query(
      `SELECT id, name FROM menu_items WHERE name = $1 AND restaurant_id = $2 LIMIT 1`,
      [itemName, restaurantId]
    );
    
    if (existingMenuItem && existingMenuItem.length > 0) {
      console.log(`Found existing menu item: ${itemName} with ID: ${existingMenuItem[0].id}`);
      return existingMenuItem[0].id;
    }
    
    // If menu item doesn't exist, create it
    const result = await AppDataSource.query(
      `INSERT INTO menu_items (name, price, restaurant_id, category, is_available) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [itemName, price, restaurantId, 'Other', true]
    );
    
    if (result && result.length > 0) {
      console.log(`Created new menu item: ${itemName} with ID: ${result[0].id}`);
      return result[0].id;
    }
    
    throw new Error(`Failed to create menu item: ${itemName}`);
  } catch (error) {
    console.error(`Error finding or creating menu item: ${itemName}`, error);
    // Return a placeholder ID that will be used for file-based storage
    return 1;
  }
}
