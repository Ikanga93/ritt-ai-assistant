// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Service to handle database operations for orders
 * Bridges the gap between the in-memory order system and the database
 */

import { OrderRepository } from '../repositories/OrderRepository.js';

import { OrderDetails, OrderItem } from '../orderService.js';
import { OrderStatus } from '../types/order.js';

import { Customer } from '../entities/Customer.js';
import { AppDataSource } from '../database.js';
import { Order } from '../entities/Order.js';
import { initializeDatabase } from '../database.js';
import { syncCustomerWithAuth0 } from './customerAuthService.js';


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
  try {
    console.log(`Saving order #${orderDetails.orderNumber} to database`);
    
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      console.log('Database not initialized, attempting to initialize...');
      await initializeDatabase();
    }
    
    // Handle customer creation/lookup based on Auth0 user if available
    let customerId: number;
    
    if (auth0User) {
      // If we have an Auth0 user, sync it with our customer database
      console.log(`Syncing Auth0 user ${auth0User.email} with customer database`);
      console.log('Auth0 user data:', JSON.stringify({
        sub: auth0User.sub,
        email: auth0User.email,
        name: auth0User.name,
        picture: auth0User.picture
      }));
      
      const customer = await syncCustomerWithAuth0(auth0User);
      console.log('Customer after sync:', customer ? JSON.stringify({
        id: customer.id,
        name: customer.name,
        email: customer.email,
        auth0Id: customer.auth0Id
      }) : 'null');
      
      if (customer) {
        customerId = customer.id;
        // Update order details with verified email from Auth0
        orderDetails.customerEmail = auth0User.email || orderDetails.customerEmail;
        // Use Auth0 name if available and not already set
        if (auth0User.name && (!orderDetails.customerName || orderDetails.customerName === 'Anonymous')) {
          orderDetails.customerName = auth0User.name;
        }
      } else {
        // Fallback to regular customer creation if sync fails
        customerId = await getOrCreateCustomer(orderDetails.customerName, orderDetails.customerPhone, orderDetails.customerEmail);
      }
    } else {
      // No Auth0 user, use regular customer creation
      customerId = await getOrCreateCustomer(orderDetails.customerName, orderDetails.customerPhone, orderDetails.customerEmail);
    }
    
    // First, ensure the restaurant exists in the database
    const restaurantId = await findOrCreateRestaurant(orderDetails.restaurantId, orderDetails.restaurantName);
    
    // Then, ensure menu items exist in the database
    const orderItems = await Promise.all(orderDetails.items.map(async item => {
      // Try to find an existing menu item by name
      let menuItemId = await findOrCreateMenuItem(item.name, item.price || 9.99, restaurantId);
      
      return {
        menuItemId,
        quantity: item.quantity,
        specialInstructions: item.specialInstructions
      };
    }));
    
    // Create the order in the database
    const order = await orderRepository.createOrderWithItems({
      customerId,
      restaurantId, // Use the restaurant ID we found or created
      items: orderItems
    });
    
    console.log(`Order saved to database with ID: ${order.id}`);
    
    // Return the original order details with the database ID added
    return {
      ...orderDetails,
      dbOrderId: order.id
    };
  } catch (error) {
    console.error('Error saving order to database:', error);
    // Return the original order details without a database ID
    // This allows the system to continue functioning even if database save fails
    return {
      ...orderDetails,
      dbOrderId: 0 // Indicate failure with 0 ID
    };
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
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      console.log('Database not initialized in getOrCreateCustomer, attempting to initialize...');
      await initializeDatabase();
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
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await initializeDatabase();
    }
    
    // First, try to find the restaurant by ID or name
    const restaurantRepository = AppDataSource.getRepository('restaurants');
    
    // Get the restaurant data from the JSON file to ensure we have the correct name
    const { getRestaurantById } = await import('../restaurantUtils.js');
    const restaurantData = await getRestaurantById(restaurantId);
    
    // Get the proper restaurant name from the data
    const properRestaurantName = restaurantData?.coffee_shop_name || 
                               restaurantData?.coffee_shop || 
                               restaurantName || 
                               'Unknown Restaurant';
    
    console.log(`Looking for restaurant with proper name: ${properRestaurantName}`);
    
    // Try to find the restaurant by name
    let restaurant = await restaurantRepository.findOne({
      where: [{ name: properRestaurantName }]
    });
    
    if (restaurant) {
      console.log(`Found existing restaurant: ${properRestaurantName} with ID: ${restaurant.id}`);
      return restaurant.id;
    }
    
    // If restaurant doesn't exist, use the data we already loaded
    console.log(`Restaurant not found in database, creating new record for: ${properRestaurantName}`);
    
    // We already have the restaurant data from above
    
    if (!restaurantData) {
      console.error(`Could not find restaurant data for ID: ${restaurantId}`);
      throw new Error(`Restaurant data not found for ID: ${restaurantId}`);
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
    // Return a default ID
    return 1;
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
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await initializeDatabase();
    }
    
    // First, try to find an existing menu item by name and restaurant ID
    const menuItemRepository = AppDataSource.getRepository('menu_items');
    
    // Try to find the menu item
    const menuItem = await menuItemRepository.findOne({
      where: {
        name: itemName,
        restaurant_id: restaurantId
      }
    });
    
    if (menuItem) {
      console.log(`Found existing menu item: ${itemName} with ID: ${menuItem.id}`);
      return menuItem.id;
    }
    
    // If menu item doesn't exist, create it
    // For now, we'll use a direct query to insert the menu item
    // This bypasses the entity validation which might be causing issues
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
