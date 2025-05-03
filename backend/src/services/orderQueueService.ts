// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Service to handle the PostgreSQL-based order queue
 * Provides functions for adding, retrieving, and updating queue items
 */

import { OrderDetails } from '../orderService.js';
import { AppDataSource, ensureDatabaseConnection, executeWithRetry } from '../database.js';
import { OrderQueue, OrderQueueStatus } from '../entities/OrderQueue.js';
import * as logger from '../utils/logger.js';
import { LessThan, MoreThanOrEqual } from 'typeorm';

// Maximum number of retries before moving to dead letter
const MAX_RETRY_ATTEMPTS = 3;

// Base delay for exponential backoff (in milliseconds)
const RETRY_DELAY_BASE = 5000; // 5 seconds

/**
 * Add an order to the processing queue
 * 
 * @param orderDetails Order details from the conversation
 * @param auth0User Optional Auth0 user object for authenticated orders
 * @returns The queue item ID
 */
export async function addToQueue(
  orderDetails: OrderDetails,
  auth0User?: any
): Promise<number> {
  // Create a correlation ID for tracking this order
  const correlationId = logger.createCorrelationId(
    undefined,
    String(orderDetails.orderNumber)
  );
  
  logger.info('Adding order to processing queue', {
    correlationId,
    orderNumber: String(orderDetails.orderNumber),
    context: 'orderQueue',
    data: {
      restaurantId: orderDetails.restaurantId,
      hasAuth0User: !!auth0User
    }
  });
  
  // Ensure database connection is healthy
  const connectionReady = await ensureDatabaseConnection();
  if (!connectionReady) {
    const errorMessage = 'Failed to establish a healthy database connection for queue operation';
    logger.error(errorMessage, {
      correlationId,
      orderNumber: String(orderDetails.orderNumber),
      context: 'orderQueue'
    });
    throw new Error(errorMessage);
  }
  
  // Create a new queue item
  const queueItem = new OrderQueue();
  queueItem.order_data = orderDetails;
  queueItem.auth0_user = auth0User;
  queueItem.status = OrderQueueStatus.PENDING;
  queueItem.attempts = 0;
  queueItem.max_attempts = MAX_RETRY_ATTEMPTS;
  queueItem.correlation_id = correlationId;
  queueItem.next_attempt_at = new Date(); // Available for immediate processing
  
  try {
    // Save the queue item to the database
    const savedItem = await executeWithRetry(
      () => AppDataSource.getRepository(OrderQueue).save(queueItem),
      'saveQueueItem'
    );
    
    logger.info('Order added to processing queue successfully', {
      correlationId,
      orderNumber: String(orderDetails.orderNumber),
      context: 'orderQueue',
      data: { queueId: savedItem.id }
    });
    
    return savedItem.id;
  } catch (error: any) {
    logger.error('Failed to add order to processing queue', {
      correlationId,
      orderNumber: String(orderDetails.orderNumber),
      context: 'orderQueue',
      error
    });
    throw error;
  }
}

/**
 * Get the next pending order from the queue
 * 
 * @returns The next queue item to process, or null if none available
 */
export async function getNextPendingOrder(): Promise<OrderQueue | null> {
  try {
    // Ensure database connection is healthy
    const connectionReady = await ensureDatabaseConnection();
    if (!connectionReady) {
      logger.error('Failed to establish a healthy database connection for queue operation', {
        context: 'orderQueue'
      });
      return null;
    }
    
    // Get the next pending order that is due for processing
    const queueItem = await executeWithRetry(
      () => AppDataSource.getRepository(OrderQueue).findOne({
        where: {
          status: OrderQueueStatus.PENDING,
          next_attempt_at: LessThan(new Date())
        },
        order: {
          next_attempt_at: 'ASC', // Process oldest items first
          created_at: 'ASC'
        }
      }),
      'getNextPendingOrder'
    );
    
    if (queueItem) {
      logger.info('Retrieved next pending order from queue', {
        correlationId: queueItem.correlation_id || undefined,
        context: 'orderQueue',
        data: { 
          queueId: queueItem.id,
          orderNumber: queueItem.order_data?.orderNumber
        }
      });
    }
    
    return queueItem;
  } catch (error: any) {
    logger.error('Failed to get next pending order from queue', {
      context: 'orderQueue',
      error
    });
    return null;
  }
}

/**
 * Mark an order as being processed
 * 
 * @param id Queue item ID
 * @returns True if successful, false otherwise
 */
export async function markOrderAsProcessing(id: number): Promise<boolean> {
  try {
    // Ensure database connection is healthy
    const connectionReady = await ensureDatabaseConnection();
    if (!connectionReady) {
      logger.error('Failed to establish a healthy database connection for queue operation', {
        context: 'orderQueue',
        data: { queueId: id }
      });
      return false;
    }
    
    // Get the queue item
    const queueItem = await executeWithRetry(
      () => AppDataSource.getRepository(OrderQueue).findOne({
        where: { id }
      }),
      'getQueueItemForProcessing'
    );
    
    if (!queueItem) {
      logger.error('Queue item not found', {
        context: 'orderQueue',
        data: { queueId: id }
      });
      return false;
    }
    
    // Update the queue item
    queueItem.status = OrderQueueStatus.PROCESSING;
    queueItem.processing_started_at = new Date();
    queueItem.attempts += 1;
    queueItem.updated_at = new Date();
    
    // Save the updated queue item
    await executeWithRetry(
      () => AppDataSource.getRepository(OrderQueue).save(queueItem),
      'markOrderAsProcessing'
    );
    
    logger.info('Marked order as processing', {
      correlationId: queueItem.correlation_id || undefined,
      context: 'orderQueue',
      data: { 
        queueId: queueItem.id,
        orderNumber: queueItem.order_data?.orderNumber,
        attempts: queueItem.attempts
      }
    });
    
    return true;
  } catch (error: any) {
    logger.error('Failed to mark order as processing', {
      context: 'orderQueue',
      data: { queueId: id },
      error
    });
    return false;
  }
}

/**
 * Mark an order as successfully completed
 * 
 * @param id Queue item ID
 * @param result Optional result data
 * @returns True if successful, false otherwise
 */
export async function markOrderAsCompleted(id: number, result?: any): Promise<boolean> {
  try {
    // Ensure database connection is healthy
    const connectionReady = await ensureDatabaseConnection();
    if (!connectionReady) {
      logger.error('Failed to establish a healthy database connection for queue operation', {
        context: 'orderQueue',
        data: { queueId: id }
      });
      return false;
    }
    
    // Get the queue item
    const queueItem = await executeWithRetry(
      () => AppDataSource.getRepository(OrderQueue).findOne({
        where: { id }
      }),
      'getQueueItemForCompletion'
    );
    
    if (!queueItem) {
      logger.error('Queue item not found', {
        context: 'orderQueue',
        data: { queueId: id }
      });
      return false;
    }
    
    // Update the queue item
    queueItem.status = OrderQueueStatus.COMPLETED;
    queueItem.completed_at = new Date();
    queueItem.updated_at = new Date();
    
    // If result data is provided, store it
    if (result) {
      queueItem.order_data = {
        ...queueItem.order_data,
        processingResult: result
      };
    }
    
    // Save the updated queue item
    await executeWithRetry(
      () => AppDataSource.getRepository(OrderQueue).save(queueItem),
      'markOrderAsCompleted'
    );
    
    logger.info('Marked order as completed', {
      correlationId: queueItem.correlation_id || undefined,
      context: 'orderQueue',
      data: { 
        queueId: queueItem.id,
        orderNumber: queueItem.order_data?.orderNumber
      }
    });
    
    return true;
  } catch (error: any) {
    logger.error('Failed to mark order as completed', {
      context: 'orderQueue',
      data: { queueId: id },
      error
    });
    return false;
  }
}

/**
 * Mark an order as failed and schedule retry if attempts remain
 * 
 * @param id Queue item ID
 * @param error Error that caused the failure
 * @returns True if successful, false otherwise
 */
export async function markOrderAsFailed(id: number, error: any): Promise<boolean> {
  try {
    // Ensure database connection is healthy
    const connectionReady = await ensureDatabaseConnection();
    if (!connectionReady) {
      logger.error('Failed to establish a healthy database connection for queue operation', {
        context: 'orderQueue',
        data: { queueId: id }
      });
      return false;
    }
    
    // Get the queue item
    const queueItem = await executeWithRetry(
      () => AppDataSource.getRepository(OrderQueue).findOne({
        where: { id }
      }),
      'getQueueItemForFailure'
    );
    
    if (!queueItem) {
      logger.error('Queue item not found', {
        context: 'orderQueue',
        data: { queueId: id }
      });
      return false;
    }
    
    // Check if we've reached max attempts
    if (queueItem.attempts >= queueItem.max_attempts) {
      // Move to dead letter
      queueItem.status = OrderQueueStatus.DEAD_LETTER;
      queueItem.error_message = error?.message || 'Unknown error';
      queueItem.updated_at = new Date();
      
      // Save the updated queue item
      await executeWithRetry(
        () => AppDataSource.getRepository(OrderQueue).save(queueItem),
        'markOrderAsDeadLetter'
      );
      
      logger.error('Order moved to dead letter queue after max retries', {
        correlationId: queueItem.correlation_id || undefined,
        context: 'orderQueue',
        data: { 
          queueId: queueItem.id,
          orderNumber: queueItem.order_data?.orderNumber,
          attempts: queueItem.attempts,
          maxAttempts: queueItem.max_attempts
        },
        error
      });
    } else {
      // Schedule retry with exponential backoff
      const delay = RETRY_DELAY_BASE * Math.pow(2, queueItem.attempts - 1);
      const nextAttemptAt = new Date(Date.now() + delay);
      
      // Update the queue item
      queueItem.status = OrderQueueStatus.PENDING;
      queueItem.error_message = error?.message || 'Unknown error';
      queueItem.next_attempt_at = nextAttemptAt;
      queueItem.updated_at = new Date();
      
      // Save the updated queue item
      await executeWithRetry(
        () => AppDataSource.getRepository(OrderQueue).save(queueItem),
        'markOrderForRetry'
      );
      
      logger.warn('Order processing failed, scheduled for retry', {
        correlationId: queueItem.correlation_id || undefined,
        context: 'orderQueue',
        data: { 
          queueId: queueItem.id,
          orderNumber: queueItem.order_data?.orderNumber,
          attempts: queueItem.attempts,
          maxAttempts: queueItem.max_attempts,
          nextAttemptAt: nextAttemptAt.toISOString(),
          delayMs: delay
        },
        error
      });
    }
    
    return true;
  } catch (error: any) {
    logger.error('Failed to mark order as failed', {
      context: 'orderQueue',
      data: { queueId: id },
      error
    });
    return false;
  }
}

/**
 * Get statistics about the queue
 * 
 * @returns Queue statistics
 */
export async function getQueueStats(): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  deadLetter: number;
  total: number;
}> {
  try {
    // Ensure database connection is healthy
    const connectionReady = await ensureDatabaseConnection();
    if (!connectionReady) {
      logger.error('Failed to establish a healthy database connection for queue stats', {
        context: 'orderQueue'
      });
      return {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        deadLetter: 0,
        total: 0
      };
    }
    
    const repository = AppDataSource.getRepository(OrderQueue);
    
    // Get counts for each status
    const pending = await repository.count({
      where: { status: OrderQueueStatus.PENDING }
    });
    
    const processing = await repository.count({
      where: { status: OrderQueueStatus.PROCESSING }
    });
    
    const completed = await repository.count({
      where: { status: OrderQueueStatus.COMPLETED }
    });
    
    const failed = await repository.count({
      where: { status: OrderQueueStatus.FAILED }
    });
    
    const deadLetter = await repository.count({
      where: { status: OrderQueueStatus.DEAD_LETTER }
    });
    
    const total = pending + processing + completed + failed + deadLetter;
    
    return {
      pending,
      processing,
      completed,
      failed,
      deadLetter,
      total
    };
  } catch (error: any) {
    logger.error('Failed to get queue stats', {
      context: 'orderQueue',
      error
    });
    return {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      deadLetter: 0,
      total: 0
    };
  }
}

/**
 * Retry a failed or dead letter order
 * 
 * @param id Queue item ID
 * @returns True if successful, false otherwise
 */
export async function retryOrder(id: number): Promise<boolean> {
  try {
    // Ensure database connection is healthy
    const connectionReady = await ensureDatabaseConnection();
    if (!connectionReady) {
      logger.error('Failed to establish a healthy database connection for queue operation', {
        context: 'orderQueue',
        data: { queueId: id }
      });
      return false;
    }
    
    // Get the queue item
    const queueItem = await executeWithRetry(
      () => AppDataSource.getRepository(OrderQueue).findOne({
        where: { 
          id,
          status: MoreThanOrEqual(OrderQueueStatus.FAILED) // FAILED or DEAD_LETTER
        }
      }),
      'getQueueItemForRetry'
    );
    
    if (!queueItem) {
      logger.error('Queue item not found or not in failed/dead letter status', {
        context: 'orderQueue',
        data: { queueId: id }
      });
      return false;
    }
    
    // Reset the queue item for retry
    queueItem.status = OrderQueueStatus.PENDING;
    queueItem.next_attempt_at = new Date(); // Available for immediate processing
    queueItem.updated_at = new Date();
    
    // Save the updated queue item
    await executeWithRetry(
      () => AppDataSource.getRepository(OrderQueue).save(queueItem),
      'retryOrder'
    );
    
    logger.info('Order queued for retry', {
      correlationId: queueItem.correlation_id || undefined,
      context: 'orderQueue',
      data: { 
        queueId: queueItem.id,
        orderNumber: queueItem.order_data?.orderNumber,
        previousStatus: queueItem.status
      }
    });
    
    return true;
  } catch (error: any) {
    logger.error('Failed to retry order', {
      context: 'orderQueue',
      data: { queueId: id },
      error
    });
    return false;
  }
}
