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


// Initialize repository
const orderRepository = new OrderRepository();

/**
 * Save an order to the database
 * 
 * @param orderDetails Order details from the conversation
 * @returns The saved order with database ID
 */
export async function saveOrderToDatabase(orderDetails: OrderDetails): Promise<OrderDetails & { dbOrderId: number }> {
  try {
    console.log(`Saving order #${orderDetails.orderNumber} to database`);
    
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      console.log('Database not initialized, attempting to initialize...');
      await initializeDatabase();
    }
    
    // First, ensure the customer exists or create a new one
    let customerId = await getOrCreateCustomer(orderDetails.customerName, orderDetails.customerPhone);
    
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
 * @returns Customer ID
 */
async function getOrCreateCustomer(
  name: string,
  phone?: string
): Promise<number> {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      console.log('Database not initialized in getOrCreateCustomer, attempting to initialize...');
      await initializeDatabase();
    }
    
    // Try to find an existing customer by phone if provided
    let customer: Customer | null = null;
    
    if (phone) {
      try {
        customer = await AppDataSource.getRepository(Customer)
          .findOne({ where: { phone } });
      } catch (error) {
        console.error('Error finding customer by phone:', error);
      }
    }
    
    // If customer doesn't exist, create a new one
    if (!customer) {
      try {
        customer = new Customer();
        customer.name = name;
        customer.phone = phone || ''; // Use empty string instead of null
        
        customer = await AppDataSource.getRepository(Customer).save(customer);
        console.log(`Created new customer with ID: ${customer.id}`);
      } catch (error) {
        console.error('Error creating new customer:', error);
        throw error;
      }
    } else {
      console.log(`Found existing customer with ID: ${customer.id}`);
    }
    
    return customer.id;
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
    
    // First, try to find the restaurant by name
    const restaurantRepository = AppDataSource.getRepository('restaurants');
    
    // Try to find the restaurant
    const restaurant = await restaurantRepository.findOne({
      where: { name: restaurantName }
    });
    
    if (restaurant) {
      console.log(`Found existing restaurant: ${restaurantName} with ID: ${restaurant.id}`);
      return restaurant.id;
    }
    
    // If restaurant doesn't exist, create it
    const result = await AppDataSource.query(
      `INSERT INTO restaurants (name, address, phone, is_active) 
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [restaurantName, 'Address not provided', 'Phone not provided', true]
    );
    
    if (result && result.length > 0) {
      console.log(`Created new restaurant: ${restaurantName} with ID: ${result[0].id}`);
      return result[0].id;
    }
    
    throw new Error(`Failed to create restaurant: ${restaurantName}`);
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
