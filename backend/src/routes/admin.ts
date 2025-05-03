// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Admin routes for managing the order queue
 * Temporary version to pass TypeScript compilation
 */

import express from 'express';
import { AppDataSource } from '../database.js';
import { OrderQueue, OrderQueueStatus } from '../entities/OrderQueue.js';
import * as logger from '../utils/logger.js';
import { getQueueStats, retryOrder } from '../services/orderQueueService.js';
import { Between, In, LessThan, MoreThan } from 'typeorm';

// Create a router for admin routes
const adminRouter = express.Router();

// Simplified version of the routes to pass TypeScript compilation
adminRouter.get('/queue/stats', function(req, res) {
  getQueueStats().then(stats => {
    res.json({ success: true, stats });
  }).catch(error => {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get queue statistics',
      message: error.message || 'Unknown error'
    });
  });
});

adminRouter.get('/queue/items', function(req, res) {
  const { status, limit = '20', offset = '0' } = req.query as any;
  
  const repository = AppDataSource.getRepository(OrderQueue);
  
  // Build query conditions
  const where: any = {};
  if (status) {
    where.status = status;
  }
  
  repository.findAndCount({
    where,
    order: { updated_at: 'DESC' },
    take: parseInt(limit, 10),
    skip: parseInt(offset, 10)
  }).then(([items, total]) => {
    // Format response to avoid sending large order data
    const formattedItems = items.map(item => ({
      id: item.id,
      status: item.status,
      attempts: item.attempts,
      max_attempts: item.max_attempts,
      created_at: item.created_at,
      updated_at: item.updated_at,
      next_attempt_at: item.next_attempt_at,
      error_message: item.error_message,
      correlation_id: item.correlation_id,
      processing_started_at: item.processing_started_at,
      completed_at: item.completed_at,
      order_number: item.order_data?.orderNumber,
      restaurant_id: item.order_data?.restaurantId,
      customer_name: item.order_data?.customerName
    }));
    
    res.json({
      success: true,
      items: formattedItems,
      total,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10)
    });
  }).catch(error => {
    res.status(500).json({
      success: false,
      error: 'Failed to get queue items',
      message: error.message || 'Unknown error'
    });
  });
});

adminRouter.get('/queue/items/:id', function(req, res) {
  const id = req.params.id;
  
  AppDataSource.getRepository(OrderQueue).findOne({
    where: { id: parseInt(id, 10) }
  }).then(item => {
    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Queue item not found'
      });
    }
    
    res.json({ success: true, item });
  }).catch(error => {
    res.status(500).json({
      success: false,
      error: 'Failed to get queue item details',
      message: error.message || 'Unknown error'
    });
  });
});

adminRouter.post('/queue/retry/:id', function(req, res) {
  const id = req.params.id;
  
  retryOrder(parseInt(id, 10)).then(success => {
    if (!success) {
      return res.status(400).json({
        success: false,
        error: 'Failed to retry order',
        message: 'Order not found or not in a retryable state'
      });
    }
    
    res.json({
      success: true,
      message: 'Order queued for retry'
    });
  }).catch(error => {
    res.status(500).json({
      success: false,
      error: 'Failed to retry order',
      message: error.message || 'Unknown error'
    });
  });
});

adminRouter.post('/queue/retry-all', function(req, res) {
  const repository = AppDataSource.getRepository(OrderQueue);
  
  repository.find({
    where: {
      status: In([OrderQueueStatus.FAILED, OrderQueueStatus.DEAD_LETTER])
    }
  }).then(async failedItems => {
    if (failedItems.length === 0) {
      return res.json({
        success: true,
        message: 'No failed orders to retry',
        count: 0
      });
    }
    
    // Reset all items for retry
    const results = await Promise.all(
      failedItems.map(async item => {
        try {
          item.status = OrderQueueStatus.PENDING;
          item.next_attempt_at = new Date();
          item.updated_at = new Date();
          await repository.save(item);
          return true;
        } catch (error) {
          return false;
        }
      })
    );
    
    const successCount = results.filter(Boolean).length;
    
    res.json({
      success: true,
      message: `${successCount} orders queued for retry`,
      total: failedItems.length,
      successful: successCount
    });
  }).catch(error => {
    res.status(500).json({
      success: false,
      error: 'Failed to retry all orders',
      message: error.message || 'Unknown error'
    });
  });
});

adminRouter.post('/queue/clear-completed', function(req, res) {
  const days = (req.query.days as string) || '7';
  
  const daysAgo = parseInt(days, 10);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
  
  const repository = AppDataSource.getRepository(OrderQueue);
  
  repository.delete({
    status: OrderQueueStatus.COMPLETED,
    completed_at: LessThan(cutoffDate)
  }).then(result => {
    res.json({
      success: true,
      message: `Cleared ${result.affected || 0} completed orders older than ${daysAgo} days`,
      count: result.affected || 0
    });
  }).catch(error => {
    res.status(500).json({
      success: false,
      error: 'Failed to clear completed orders',
      message: error.message || 'Unknown error'
    });
  });
});

export default adminRouter;
