/**
 * Restaurant Notification Service
 * Handles sending notifications to restaurants about new orders
 */

import { Order } from '../entities/Order.js';
import { OrderItem } from '../entities/OrderItem.js';
import { Restaurant } from '../entities/Restaurant.js';
import { MenuItem } from '../entities/MenuItem.js';
import { AppDataSource } from '../database.js';
import * as emailService from './emailService.js';
import * as logger from '../utils/logger.js';

/**
 * Restaurant order notification data structure
 */
interface RestaurantOrderNotification {
  restaurantId: number;
  restaurantName: string;
  restaurantEmail: string;
  orderId: number;
  orderNumber: string;
  customerName: string;
  orderItems: Array<{
    id: number;
    name: string;
    quantity: number;
    price: number;
    specialInstructions?: string | null;
  }>;
  orderTotal: number;
  orderDate: Date;
  specialInstructions?: string | null;
}

/**
 * Send order notification emails to restaurants after payment is confirmed
 * @param orderId The ID of the paid order
 * @returns Promise<boolean> True if notifications were sent successfully
 */
export async function sendRestaurantOrderNotifications(orderId: number): Promise<boolean> {
  const correlationId = logger.createCorrelationId();
  
  try {
    logger.info('Preparing to send restaurant notifications for paid order', {
      correlationId,
      context: 'restaurantNotificationService.sendRestaurantOrderNotifications',
      data: { orderId }
    });
    
    // Get the repositories
    const orderRepository = AppDataSource.getRepository(Order);
    const orderItemRepository = AppDataSource.getRepository(OrderItem);
    const menuItemRepository = AppDataSource.getRepository(MenuItem);
    const restaurantRepository = AppDataSource.getRepository(Restaurant);
    
    // Find the order
    const order = await orderRepository.findOne({
      where: { id: orderId }
    });
    
    if (!order) {
      logger.error('Order not found for restaurant notification', {
        correlationId,
        context: 'restaurantNotificationService.sendRestaurantOrderNotifications',
        data: { orderId }
      });
      return false;
    }
    
    // Find all order items for this order
    const orderItems = await orderItemRepository.find({
      where: { order_id: orderId },
      relations: ['menu_item']
    });
    
    if (!orderItems || orderItems.length === 0) {
      logger.warn('No order items found for order', {
        correlationId,
        context: 'restaurantNotificationService.sendRestaurantOrderNotifications',
        data: { orderId }
      });
      return false;
    }
    
    // Group order items by restaurant
    const restaurantOrders = new Map<number, RestaurantOrderNotification>();
    
    for (const item of orderItems) {
      // Skip items without menu item
      if (!item.menu_item) continue;
      
      // Get the menu item to find restaurant
      const menuItem = await menuItemRepository.findOne({
        where: { id: item.menu_item_id },
        relations: ['restaurant']
      });
      
      if (!menuItem || !menuItem.restaurant) continue;
      
      const restaurantId = menuItem.restaurant_id;
      
      // Get or create the restaurant order group
      if (!restaurantOrders.has(restaurantId)) {
        // Find restaurant details
        const restaurant = await restaurantRepository.findOne({
          where: { id: restaurantId }
        });
        
        if (!restaurant || !restaurant.email) {
          logger.warn('Restaurant not found or missing email', {
            correlationId,
            context: 'restaurantNotificationService.sendRestaurantOrderNotifications',
            data: { 
              orderId,
              restaurantId
            }
          });
          continue;
        }
        
        restaurantOrders.set(restaurantId, {
          restaurantId: restaurantId,
          restaurantName: restaurant.name,
          restaurantEmail: restaurant.email,
          orderId: order.id,
          orderNumber: order.order_number,
          customerName: 'Customer', // For privacy, don't include full customer details
          orderItems: [],
          orderTotal: 0,
          orderDate: order.created_at,
          specialInstructions: null
        });
      }
      
      // Add the item to the restaurant's order
      const restaurantOrder = restaurantOrders.get(restaurantId)!;
      restaurantOrder.orderItems.push({
        id: item.id,
        name: menuItem.name,
        quantity: item.quantity,
        price: item.price_at_time,
        specialInstructions: item.special_instructions
      });
      restaurantOrder.orderTotal += item.price_at_time * item.quantity;
    }
    
    // Send notifications to each restaurant
    const notificationPromises: Promise<boolean>[] = [];
    
    for (const [restaurantId, notification] of restaurantOrders.entries()) {
      notificationPromises.push(sendSingleRestaurantNotification(notification, correlationId));
    }
    
    // Wait for all notifications to be sent
    const results = await Promise.all(notificationPromises);
    const allSuccessful = results.every(result => result === true);
    
    logger.info('Restaurant notifications completed', {
      correlationId,
      context: 'restaurantNotificationService.sendRestaurantOrderNotifications',
      data: { 
        orderId,
        restaurantCount: restaurantOrders.size,
        success: allSuccessful
      }
    });
    
    return allSuccessful;
  } catch (error) {
    logger.error('Failed to send restaurant notifications', {
      correlationId,
      context: 'restaurantNotificationService.sendRestaurantOrderNotifications',
      error,
      data: { orderId }
    });
    return false;
  } finally {
    logger.removeCorrelationId(correlationId);
  }
}

/**
 * Send notification to a single restaurant
 * @param notification The notification data for the restaurant
 * @param correlationId Correlation ID for logging
 * @returns Promise<boolean> True if notification was sent successfully
 */
async function sendSingleRestaurantNotification(
  notification: RestaurantOrderNotification,
  correlationId: string
): Promise<boolean> {
  try {
    logger.info('Sending notification to restaurant', {
      correlationId,
      context: 'restaurantNotificationService.sendSingleRestaurantNotification',
      data: { 
        restaurantId: notification.restaurantId,
        restaurantName: notification.restaurantName,
        orderId: notification.orderId
      }
    });
    
    // Format the items for email template
    const itemsList = notification.orderItems.map(item => ({
      name: item.name,
      quantity: item.quantity,
      price: item.price.toFixed(2),
      total: (item.price * item.quantity).toFixed(2),
      specialInstructions: item.specialInstructions
    }));
    
    // Create the email content using the existing email service
    const subject = `New Paid Order #${notification.orderNumber} - Action Required`;
    
    // Send the email using the existing email service
    const emailResult = await emailService.sendEmail({
      to: notification.restaurantEmail,
      subject: subject,
      templateName: 'restaurant-order',  // This would be a new template to create
      templateData: {
        restaurantName: notification.restaurantName,
        orderNumber: notification.orderNumber,
        orderDate: notification.orderDate.toLocaleString(),
        customerName: notification.customerName,
        items: itemsList,
        orderTotal: notification.orderTotal.toFixed(2),
        specialInstructions: notification.specialInstructions,
        orderId: notification.orderId
      }
    });
    
    if (emailResult.success) {
      logger.info('Restaurant notification email sent successfully', {
        correlationId,
        context: 'restaurantNotificationService.sendSingleRestaurantNotification',
        data: { 
          restaurantId: notification.restaurantId,
          restaurantEmail: notification.restaurantEmail,
          messageId: emailResult.messageId
        }
      });
      return true;
    } else {
      logger.error('Failed to send restaurant notification email', {
        correlationId,
        context: 'restaurantNotificationService.sendSingleRestaurantNotification',
        error: emailResult.error,
        data: { 
          restaurantId: notification.restaurantId,
          restaurantEmail: notification.restaurantEmail
        }
      });
      return false;
    }
  } catch (error) {
    logger.error('Error in restaurant notification', {
      correlationId,
      context: 'restaurantNotificationService.sendSingleRestaurantNotification',
      error,
      data: { 
        restaurantId: notification.restaurantId,
        orderId: notification.orderId
      }
    });
    return false;
  }
}