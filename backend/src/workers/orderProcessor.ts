// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Worker process for processing orders from the queue
 * Polls the database for pending orders and processes them
 */

import { 
  getNextPendingOrder, 
  markOrderAsProcessing, 
  markOrderAsCompleted, 
  markOrderAsFailed 
} from '../services/orderQueueService.js';
import { saveOrderToDatabase } from '../services/orderDatabaseService.js';
import * as logger from '../utils/logger.js';

// Polling interval in milliseconds
const POLLING_INTERVAL = 5000; // 5 seconds

// Flag to indicate if the worker is running
let isRunning = false;

// Interval ID for the polling timer
let pollingIntervalId: NodeJS.Timeout | null = null;

/**
 * Process a single order from the queue
 */
async function processNextOrder(): Promise<boolean> {
  try {
    // Get the next pending order
    const queueItem = await getNextPendingOrder();
    
    // If no pending orders, return false
    if (!queueItem) {
      return false;
    }
    
    // Mark the order as processing
    const marked = await markOrderAsProcessing(queueItem.id);
    if (!marked) {
      logger.error('Failed to mark order as processing', {
        correlationId: queueItem.correlation_id || undefined,
        context: 'orderProcessor',
        data: { queueId: queueItem.id }
      });
      return false;
    }
    
    try {
      // Extract order details and Auth0 user from queue item
      const { order_data: orderDetails, auth0_user: auth0User } = queueItem;
      
      logger.info('Processing order from queue', {
        correlationId: queueItem.correlation_id || undefined,
        context: 'orderProcessor',
        data: { 
          queueId: queueItem.id,
          orderNumber: orderDetails.orderNumber
        }
      });
      
      // Process the order using the existing order processing logic
      const result = await saveOrderToDatabase(orderDetails, auth0User);
      
      // Mark the order as completed
      await markOrderAsCompleted(queueItem.id, result);
      
      logger.info('Order processed successfully', {
        correlationId: queueItem.correlation_id || undefined,
        context: 'orderProcessor',
        data: { 
          queueId: queueItem.id,
          orderNumber: orderDetails.orderNumber,
          dbOrderId: result.dbOrderId
        }
      });
      
      return true;
    } catch (error: any) {
      // Mark the order as failed
      await markOrderAsFailed(queueItem.id, error);
      
      logger.error('Failed to process order', {
        correlationId: queueItem.correlation_id || undefined,
        context: 'orderProcessor',
        data: { 
          queueId: queueItem.id,
          orderNumber: queueItem.order_data?.orderNumber
        },
        error
      });
      
      return false;
    }
  } catch (error: any) {
    logger.error('Error in order processor', {
      context: 'orderProcessor',
      error
    });
    return false;
  }
}

/**
 * Process all pending orders in the queue
 * This function will process orders one by one until there are no more pending orders
 */
async function processAllPendingOrders(): Promise<void> {
  // If already processing, skip this cycle
  if (isRunning) {
    return;
  }
  
  try {
    isRunning = true;
    
    // Process orders until there are no more pending orders
    let hasMoreOrders = true;
    while (hasMoreOrders) {
      hasMoreOrders = await processNextOrder();
    }
  } finally {
    isRunning = false;
  }
}

/**
 * Start the order processor worker
 * @returns The interval ID for the polling timer
 */
export function startOrderProcessor(): NodeJS.Timeout {
  logger.info('Starting order processor worker', {
    context: 'orderProcessor',
    data: { pollingInterval: POLLING_INTERVAL }
  });
  
  // Start processing immediately
  processAllPendingOrders();
  
  // Set up polling interval
  pollingIntervalId = setInterval(processAllPendingOrders, POLLING_INTERVAL);
  
  return pollingIntervalId;
}

/**
 * Stop the order processor worker
 */
export function stopOrderProcessor(): void {
  if (pollingIntervalId) {
    clearInterval(pollingIntervalId);
    pollingIntervalId = null;
    
    logger.info('Stopped order processor worker', {
      context: 'orderProcessor'
    });
  }
}
