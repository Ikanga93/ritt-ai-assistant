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
    const tempId = generateTempOrderId();
    const now = Date.now();
    
    const tempOrder: TemporaryOrder = {
      ...orderData,
      id: tempId,
      createdAt: now,
      expiresAt: now + DEFAULT_EXPIRATION_MS
    };
    
    // Store in memory
    tempOrdersMap.set(tempId, tempOrder);
    
    // Save to disk immediately for this new order
    try {
      const orderFilePath = path.join(TEMP_ORDERS_DIR, `${tempId}.json`);
      fs.writeFileSync(orderFilePath, JSON.stringify(tempOrder), 'utf8');
      
      // Update the index
      const orderIds = Array.from(tempOrdersMap.keys());
      fs.writeFileSync(TEMP_ORDERS_INDEX, JSON.stringify(orderIds), 'utf8');
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
   * Retrieves a temporary order by ID
   */
  getOrder(tempOrderId: string): TemporaryOrder | null {
    // Try to get from memory first
    const order = tempOrdersMap.get(tempOrderId);
    
    if (order) {
      return order;
    }
    
    // If not in memory, try to get from disk
    try {
      const orderFilePath = path.join(TEMP_ORDERS_DIR, `${tempOrderId}.json`);
      
      if (fs.existsSync(orderFilePath)) {
        const orderData = JSON.parse(fs.readFileSync(orderFilePath, 'utf8')) as TemporaryOrder;
        
        // Check if expired
        if (orderData.expiresAt > Date.now()) {
          // Add to memory for future access
          tempOrdersMap.set(tempOrderId, orderData);
          return orderData;
        } else {
          // Clean up expired order file
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
    
    // Update in memory
    tempOrdersMap.set(tempOrderId, updatedOrder);
    
    // Update on disk
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
    // Remove from memory
    const deleted = tempOrdersMap.delete(tempOrderId);
    
    // Remove from disk
    try {
      const orderFilePath = path.join(TEMP_ORDERS_DIR, `${tempOrderId}.json`);
      
      if (fs.existsSync(orderFilePath)) {
        fs.unlinkSync(orderFilePath);
      }
      
      // Update the index
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
    return Array.from(tempOrdersMap.values());
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

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Saving temporary orders before shutdown', {
    context: 'temporaryOrderService'
  });
  saveOrdersToDisk();
});

process.on('SIGINT', () => {
  logger.info('Saving temporary orders before shutdown', {
    context: 'temporaryOrderService'
  });
  saveOrdersToDisk();
});
