// Order Database Utility
// Simple file-based database for storing orders by restaurant ID

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { OrderWithPayment } from '../orderStorage.js';
import paymentLogger from './paymentLogger.js';

// Get the database directory path
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbDir = path.join(__dirname, '../../data/orders');
const indexFile = path.join(dbDir, 'order_index.json');

// Ensure database directory exists
async function ensureDbDirectory() {
  try {
    await fs.mkdir(dbDir, { recursive: true });
    
    // Create index file if it doesn't exist
    try {
      await fs.access(indexFile);
    } catch {
      // Index file doesn't exist, create it
      await fs.writeFile(indexFile, JSON.stringify({
        lastOrderId: 0,
        restaurantOrders: {}
      }, null, 2), 'utf8');
    }
  } catch (error) {
    console.error('Error creating database directory:', error);
  }
}

// Initialize database
ensureDbDirectory();

// Interface for order index
interface OrderIndex {
  lastOrderId: number;
  restaurantOrders: {
    [restaurantId: string]: number[];
  };
}

/**
 * Save an order to the database
 * @param order The order to save
 * @returns Promise with result object containing success status and error information
 */
export async function saveOrder(order: OrderWithPayment): Promise<{success: boolean, error?: string}> {
  try {
    // Ensure the database directory exists
    await ensureDbDirectory();
    
    // Read the current index
    let index: OrderIndex;
    try {
      const indexData = await fs.readFile(indexFile, 'utf8');
      index = JSON.parse(indexData);
    } catch (error) {
      // If the index file can't be read, create a new one
      index = {
        lastOrderId: 0,
        restaurantOrders: {}
      };
      console.log('Created new order index file');
    }
    
    // Get the restaurant ID
    const restaurantId = order.restaurantId;
    
    // Create restaurant entry in index if it doesn't exist
    if (!index.restaurantOrders[restaurantId]) {
      index.restaurantOrders[restaurantId] = [];
    }
    
    // Parse the order number correctly
    let orderNumber: number;
    if (typeof order.orderNumber === 'string') {
      // Try to parse as integer, but if it fails, use a new order ID
      const parsed = parseInt(order.orderNumber, 10);
      orderNumber = isNaN(parsed) ? ++index.lastOrderId : parsed;
    } else if (typeof order.orderNumber === 'number') {
      orderNumber = order.orderNumber;
    } else {
      // Generate a new order ID if none exists
      orderNumber = ++index.lastOrderId;
    }
    
    // Update the order object with the correct order number
    order.orderNumber = orderNumber.toString();
    
    // Add order number to restaurant's order list if not already there
    if (!index.restaurantOrders[restaurantId].includes(orderNumber)) {
      index.restaurantOrders[restaurantId].push(orderNumber);
    }
    
    // Update lastOrderId if needed
    if (orderNumber > index.lastOrderId) {
      index.lastOrderId = orderNumber;
    }
    
    // Update index
    await fs.writeFile(indexFile, JSON.stringify(index, null, 2), 'utf8');
    
    // Save order to its own file
    const orderFile = path.join(dbDir, `order_${orderNumber}.json`);
    await fs.writeFile(orderFile, JSON.stringify(order, null, 2), 'utf8');
    
    await paymentLogger.info('DATABASE', `Order #${orderNumber} saved to database`, {
      orderId: orderNumber.toString(),
      data: { restaurantId }
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error saving order:', error);
    await paymentLogger.error('DATABASE', `Error saving order: ${error.message}`, {
      data: { error: error.message }
    });
    return { success: false, error: error.message };
  }
}

/**
 * Get an order from the database
 * @param orderNumber The order number
 * @returns Promise with result object containing the order and status information
 */
export async function getOrder(orderNumber: string | number): Promise<{success: boolean, order?: OrderWithPayment, error?: string}> {
  try {
    // Convert order number to string if it's a number
    let orderNum: number;
    
    if (typeof orderNumber === 'number') {
      orderNum = orderNumber;
    } else {
      // Try to parse as integer
      const parsed = parseInt(orderNumber, 10);
      if (isNaN(parsed)) {
        return { 
          success: false, 
          error: `Invalid order number format: ${orderNumber}` 
        };
      }
      orderNum = parsed;
    }
    
    // Get the order file path
    const orderFile = path.join(dbDir, `order_${orderNum}.json`);
    
    // Check if the file exists
    try {
      await fs.access(orderFile);
    } catch {
      // File doesn't exist
      return { 
        success: false, 
        error: `Order #${orderNum} not found in database` 
      };
    }
    
    // Read the order file
    const orderData = await fs.readFile(orderFile, 'utf8');
    const order: OrderWithPayment = JSON.parse(orderData);
    
    await paymentLogger.info('DATABASE', `Order #${orderNum} retrieved from database`, {
      orderId: orderNum.toString()
    });
    
    return { success: true, order };
  } catch (error) {
    console.error('Error getting order from database:', error);
    
    await paymentLogger.error('DATABASE', `Error retrieving order #${orderNumber}`, {
      data: { error: error.message }
    });
    
    return { 
      success: false, 
      error: `Database error: ${error.message}` 
    };
  }
}

/**
 * Get all orders for a restaurant
 * @param restaurantId The restaurant ID
 * @returns Promise<OrderWithPayment[]> Array of orders
 */
export async function getOrdersByRestaurantId(restaurantId: string): Promise<OrderWithPayment[]> {
  try {
    // Read the index
    const indexData = await fs.readFile(indexFile, 'utf8');
    const index: OrderIndex = JSON.parse(indexData);
    
    // Get order numbers for this restaurant
    const orderNumbers = index.restaurantOrders[restaurantId] || [];
    
    // Load each order
    const orders: OrderWithPayment[] = [];
    for (const orderNumber of orderNumbers) {
      const orderResult = await getOrder(orderNumber);
      if (orderResult.success && orderResult.order) {
        orders.push(orderResult.order);
      }
    }
    
    return orders;
  } catch (error) {
    console.error(`Error getting orders for restaurant ${restaurantId}:`, error);
    return [];
  }
}

/**
 * Update an existing order in the database
 * @param order The updated order
 * @returns Promise<boolean> indicating success or failure
 */
export async function updateOrder(order: OrderWithPayment): Promise<boolean> {
  try {
    const orderNumber = typeof order.orderNumber === 'string' ? 
      parseInt(order.orderNumber, 10) : order.orderNumber;
      
    // Save order to its file (overwriting existing)
    const orderFile = path.join(dbDir, `order_${orderNumber}.json`);
    await fs.writeFile(orderFile, JSON.stringify(order, null, 2), 'utf8');
    
    await paymentLogger.info('DATABASE', `Order #${orderNumber} updated in database`, {
      orderId: orderNumber,
      data: { restaurantId: order.restaurantId }
    });
    
    return true;
  } catch (error) {
    console.error(`Error updating order #${order.orderNumber} in database:`, error);
    
    await paymentLogger.error('DATABASE', `Failed to update order #${order.orderNumber} in database`, {
      orderId: order.orderNumber,
      data: { error: error instanceof Error ? error.message : String(error) }
    });
    
    return false;
  }
}

/**
 * Delete an order from the database
 * @param orderNumber The order number to delete
 * @returns Promise<boolean> indicating success or failure
 */
export async function deleteOrder(orderNumber: string | number): Promise<boolean> {
  try {
    // Get the order first to know its restaurant ID
    const orderResult = await getOrder(orderNumber);
    if (!orderResult.success || !orderResult.order) {
      return false;
    }
    const order = orderResult.order;
    
    // Read the index
    const indexData = await fs.readFile(indexFile, 'utf8');
    const index: OrderIndex = JSON.parse(indexData);
    
    // Remove order from restaurant's order list
    const restaurantId = order.restaurantId;
    const orderNum = typeof orderNumber === 'string' ? parseInt(orderNumber, 10) : orderNumber;
    
    if (index.restaurantOrders[restaurantId]) {
      index.restaurantOrders[restaurantId] = index.restaurantOrders[restaurantId].filter(
        num => num !== orderNum
      );
    }
    
    // Update index
    await fs.writeFile(indexFile, JSON.stringify(index, null, 2), 'utf8');
    
    // Delete order file
    const orderFile = path.join(dbDir, `order_${orderNumber}.json`);
    await fs.unlink(orderFile);
    
    await paymentLogger.info('DATABASE', `Order #${orderNumber} deleted from database`, {
      orderId: orderNumber,
      data: { restaurantId }
    });
    
    return true;
  } catch (error) {
    console.error(`Error deleting order #${orderNumber} from database:`, error);
    return false;
  }
}

// Export the database functions
export const orderDatabase = {
  saveOrder,
  getOrder,
  getOrdersByRestaurantId,
  updateOrder,
  deleteOrder
};

export default orderDatabase;
