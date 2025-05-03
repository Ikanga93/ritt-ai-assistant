// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Order retry queue for handling failed order submissions
 * Provides persistence and automatic retry for failed orders
 */

import * as fs from 'fs';
import * as path from 'path';
import { OrderDetails } from '../orderService.js';
import * as logger from './logger.js';

// Directory for storing failed orders
const FAILED_ORDERS_DIR = path.join(process.cwd(), 'data', 'failed_orders');

// Maximum number of retry attempts
const MAX_RETRY_ATTEMPTS = 5;

// Delay between retries in milliseconds (exponential backoff)
const RETRY_DELAY_BASE = 30000; // 30 seconds base

// Interface for failed order entry with retry metadata
interface FailedOrderEntry {
  orderDetails: OrderDetails;
  auth0User?: any;
  correlationId: string;
  failureReason: string;
  retryCount: number;
  lastRetryTime?: string;
  nextRetryTime?: string;
  createdAt: string;
}

/**
 * Ensure the failed orders directory exists
 */
function ensureFailedOrdersDirectory(): void {
  if (!fs.existsSync(FAILED_ORDERS_DIR)) {
    try {
      fs.mkdirSync(FAILED_ORDERS_DIR, { recursive: true });
      logger.info('Created failed orders directory', { 
        context: 'orderRetryQueue', 
        data: { directory: FAILED_ORDERS_DIR } 
      });
    } catch (error) {
      logger.error('Failed to create failed orders directory', {
        context: 'orderRetryQueue',
        error
      });
    }
  }
}

/**
 * Add a failed order to the retry queue
 * @param orderDetails The order details
 * @param auth0User Optional Auth0 user data
 * @param correlationId Correlation ID for tracking
 * @param failureReason Reason for the failure
 * @returns The file path where the failed order was saved
 */
export function addFailedOrder(
  orderDetails: OrderDetails,
  auth0User: any | undefined,
  correlationId: string,
  failureReason: string
): string {
  ensureFailedOrdersDirectory();
  
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const orderNumber = orderDetails.orderNumber || 'unknown';
  const filename = `failed-order-${orderNumber}-${timestamp}.json`;
  const filePath = path.join(FAILED_ORDERS_DIR, filename);
  
  const failedOrderEntry: FailedOrderEntry = {
    orderDetails,
    auth0User,
    correlationId,
    failureReason,
    retryCount: 0,
    createdAt: new Date().toISOString()
  };
  
  try {
    fs.writeFileSync(filePath, JSON.stringify(failedOrderEntry, null, 2));
    logger.info('Added failed order to retry queue', {
      correlationId,
      orderNumber: String(orderDetails.orderNumber),
      context: 'orderRetryQueue',
      data: { filePath }
    });
    return filePath;
  } catch (error: any) {
    logger.error('Failed to save failed order to retry queue', {
      correlationId,
      orderNumber: String(orderDetails.orderNumber),
      context: 'orderRetryQueue',
      error
    });
    throw error;
  }
}

/**
 * Get all failed orders in the retry queue
 * @returns Array of failed order entries with their file paths
 */
export function getFailedOrders(): Array<{ entry: FailedOrderEntry, filePath: string }> {
  ensureFailedOrdersDirectory();
  
  try {
    const files = fs.readdirSync(FAILED_ORDERS_DIR);
    const failedOrders: Array<{ entry: FailedOrderEntry, filePath: string }> = [];
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(FAILED_ORDERS_DIR, file);
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const entry: FailedOrderEntry = JSON.parse(content);
          failedOrders.push({ entry, filePath });
        } catch (error) {
          logger.error('Failed to read failed order file', {
            context: 'orderRetryQueue',
            data: { filePath },
            error
          });
        }
      }
    }
    
    return failedOrders;
  } catch (error) {
    logger.error('Failed to read failed orders directory', {
      context: 'orderRetryQueue',
      error
    });
    return [];
  }
}

/**
 * Update a failed order entry after a retry attempt
 * @param filePath Path to the failed order file
 * @param success Whether the retry was successful
 * @param failureReason If retry failed, the reason for failure
 */
export function updateFailedOrderAfterRetry(
  filePath: string,
  success: boolean,
  failureReason?: string
): void {
  try {
    if (!fs.existsSync(filePath)) {
      logger.warn('Failed order file not found for update', {
        context: 'orderRetryQueue',
        data: { filePath }
      });
      return;
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const entry: FailedOrderEntry = JSON.parse(content);
    
    if (success) {
      // If successful, remove the failed order file
      fs.unlinkSync(filePath);
      logger.info('Removed successfully processed failed order', {
        correlationId: entry.correlationId,
        orderNumber: String(entry.orderDetails.orderNumber),
        context: 'orderRetryQueue',
        data: { filePath, retryCount: entry.retryCount }
      });
    } else {
      // If failed, update retry count and times
      entry.retryCount++;
      entry.failureReason = failureReason || entry.failureReason;
      entry.lastRetryTime = new Date().toISOString();
      
      // Calculate next retry time with exponential backoff
      if (entry.retryCount < MAX_RETRY_ATTEMPTS) {
        const delay = RETRY_DELAY_BASE * Math.pow(2, entry.retryCount - 1);
        const nextRetryTime = new Date(Date.now() + delay);
        entry.nextRetryTime = nextRetryTime.toISOString();
      } else {
        // Max retries reached, mark as permanently failed
        entry.nextRetryTime = undefined;
      }
      
      // Save updated entry
      fs.writeFileSync(filePath, JSON.stringify(entry, null, 2));
      logger.info('Updated failed order after retry attempt', {
        correlationId: entry.correlationId,
        orderNumber: String(entry.orderDetails.orderNumber),
        context: 'orderRetryQueue',
        data: { 
          filePath, 
          retryCount: entry.retryCount, 
          maxRetries: MAX_RETRY_ATTEMPTS,
          nextRetryTime: entry.nextRetryTime 
        }
      });
    }
  } catch (error) {
    logger.error('Failed to update failed order after retry', {
      context: 'orderRetryQueue',
      data: { filePath },
      error
    });
  }
}

/**
 * Get failed orders that are due for retry
 * @returns Array of failed order entries with their file paths
 */
export function getOrdersDueForRetry(): Array<{ entry: FailedOrderEntry, filePath: string }> {
  const allFailedOrders = getFailedOrders();
  const now = new Date();
  
  return allFailedOrders.filter(({ entry }) => {
    // Skip if max retries reached
    if (entry.retryCount >= MAX_RETRY_ATTEMPTS) {
      return false;
    }
    
    // If no next retry time (first attempt), or next retry time has passed
    if (!entry.nextRetryTime || new Date(entry.nextRetryTime) <= now) {
      return true;
    }
    
    return false;
  });
}

/**
 * Initialize the order retry system
 * @param saveOrderFunction Function to save an order to the database
 */
export function initializeOrderRetrySystem(
  saveOrderFunction: (orderDetails: OrderDetails, auth0User?: any) => Promise<any>
): NodeJS.Timeout {
  ensureFailedOrdersDirectory();
  
  // Process function that will be called by the interval
  const processFailedOrders = async () => {
    const ordersDueForRetry = getOrdersDueForRetry();
    
    if (ordersDueForRetry.length > 0) {
      logger.info('Processing failed orders for retry', {
        context: 'orderRetryQueue',
        data: { count: ordersDueForRetry.length }
      });
      
      for (const { entry, filePath } of ordersDueForRetry) {
        const { orderDetails, auth0User, correlationId } = entry;
        
        logger.info('Retrying failed order', {
          correlationId,
          orderNumber: String(orderDetails.orderNumber),
          context: 'orderRetryQueue',
          data: { 
            retryCount: entry.retryCount + 1, 
            maxRetries: MAX_RETRY_ATTEMPTS 
          }
        });
        
        try {
          // Attempt to save the order
          await saveOrderFunction(orderDetails, auth0User);
          
          // Update as successful
          updateFailedOrderAfterRetry(filePath, true);
        } catch (error: any) {
          // Update as failed
          updateFailedOrderAfterRetry(filePath, false, error.message || 'Unknown error');
          
          logger.error('Retry attempt failed for order', {
            correlationId,
            orderNumber: String(orderDetails.orderNumber),
            context: 'orderRetryQueue',
            error
          });
        }
      }
    }
  };
  
  // Set up interval to check for failed orders to retry (every 1 minute)
  const intervalId = setInterval(processFailedOrders, 60000);
  
  // Run once immediately to process any existing failed orders
  processFailedOrders();
  
  return intervalId;
}

/**
 * Stop the order retry system
 * @param intervalId The interval ID returned by initializeOrderRetrySystem
 */
export function stopOrderRetrySystem(intervalId: NodeJS.Timeout): void {
  clearInterval(intervalId);
  logger.info('Order retry system stopped', {
    context: 'orderRetryQueue'
  });
}

// Default export for convenience
export default {
  addFailedOrder,
  getFailedOrders,
  updateFailedOrderAfterRetry,
  getOrdersDueForRetry,
  initializeOrderRetrySystem,
  stopOrderRetrySystem
};
