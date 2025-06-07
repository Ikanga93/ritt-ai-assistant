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
  subtotal: number;
  tax: number;
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
    console.log('🔔 RESTAURANT NOTIFICATION SERVICE STARTED');
    console.log(`📧 Processing restaurant notifications for order ID: ${orderId}`);
    
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
    
    console.log('📊 Database repositories initialized');
    
    // Find the order
    console.log(`🔍 Looking up order with ID: ${orderId}`);
    const order = await orderRepository.findOne({
      where: { id: orderId }
    });
    
    if (!order) {
      console.log(`❌ Order not found with ID: ${orderId}`);
      logger.error('Order not found for restaurant notification', {
        correlationId,
        context: 'restaurantNotificationService.sendRestaurantOrderNotifications',
        data: { orderId }
      });
      return false;
    }
    
    console.log(`✅ Order found: ${order.order_number} (Status: ${order.status}, Payment: ${order.payment_status})`);
    console.log(`📋 Order details:`, {
      id: order.id,
      orderNumber: order.order_number,
      status: order.status,
      paymentStatus: order.payment_status,
      total: order.total,
      tax: order.tax,
      restaurantId: order.restaurant_id,
      createdAt: order.created_at
    });
    
    // Find all order items for this order
    console.log(`🛒 Looking up order items for order ID: ${orderId}`);
    const orderItems = await orderItemRepository.find({
      where: { order_id: orderId },
      relations: ['menu_item']
    });
    
    console.log(`📦 Found ${orderItems.length} order items`);
    
    if (!orderItems || orderItems.length === 0) {
      console.log(`❌ No order items found for order ${orderId}`);
      logger.warn('No order items found for order', {
        correlationId,
        context: 'restaurantNotificationService.sendRestaurantOrderNotifications',
        data: { orderId }
      });
      return false;
    }
    
    // Log each order item
    orderItems.forEach((item, index) => {
      console.log(`📦 Order Item ${index + 1}:`, {
        id: item.id,
        quantity: item.quantity,
        priceAtTime: item.price_at_time,
        specialInstructions: item.special_instructions,
        menuItemId: item.menu_item_id,
        hasMenuItemRelation: !!item.menu_item
      });
    });
    
    // Group order items by restaurant
    const restaurantOrders = new Map<number, RestaurantOrderNotification>();
    
    console.log('🏪 Processing order items to group by restaurant...');
    
    for (const item of orderItems) {
      console.log(`🔍 Processing order item ${item.id} (menu_item_id: ${item.menu_item_id})`);
      
      // Skip items without menu item
      if (!item.menu_item) {
        console.log(`⚠️ Skipping item ${item.id} - no menu_item relation`);
        continue;
      }
      
      // Get the menu item to find restaurant
      console.log(`🔍 Looking up menu item ${item.menu_item_id}`);
      const menuItem = await menuItemRepository.findOne({
        where: { id: item.menu_item_id },
        relations: ['restaurant']
      });
      
      if (!menuItem || !menuItem.restaurant) {
        console.log(`❌ Menu item ${item.menu_item_id} not found or missing restaurant relation`);
        continue;
      }
      
      console.log(`✅ Menu item found: ${menuItem.name} (Restaurant ID: ${menuItem.restaurant_id})`);
      
      const restaurantId = menuItem.restaurant_id;
      
      // Get or create the restaurant order group
      if (!restaurantOrders.has(restaurantId)) {
        console.log(`🏪 First item for restaurant ${restaurantId}, looking up restaurant details...`);
        
        // Find restaurant details
        const restaurant = await restaurantRepository.findOne({
          where: { id: restaurantId }
        });
        
        if (!restaurant || !restaurant.email) {
          console.log(`❌ Restaurant ${restaurantId} not found or missing email:`, {
            found: !!restaurant,
            email: restaurant?.email || 'N/A'
          });
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
        
        console.log(`✅ Restaurant found: ${restaurant.name} (Email: ${restaurant.email})`);
        
        restaurantOrders.set(restaurantId, {
          restaurantId: restaurantId,
          restaurantName: restaurant.name,
          restaurantEmail: restaurant.email,
          orderId: order.id,
          orderNumber: order.order_number,
          customerName: 'Customer', // For privacy, don't include full customer details
          orderItems: [],
          subtotal: 0,
          tax: order.tax || 0, // Get tax from the order data
          orderTotal: order.total || 0, // Get total from the order data
          orderDate: order.created_at,
          specialInstructions: null
        });
        
        console.log(`📝 Created restaurant order group for ${restaurant.name}`);
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
      restaurantOrder.subtotal += item.price_at_time * item.quantity;
      
      console.log(`➕ Added item to restaurant order: ${menuItem.name} x${item.quantity} = $${(item.price_at_time * item.quantity).toFixed(2)}`);
    }
    
    console.log(`🏪 Restaurant order groups created: ${restaurantOrders.size}`);
    
    // Log each restaurant order group
    for (const [restaurantId, notification] of restaurantOrders.entries()) {
      console.log(`🏪 Restaurant ${restaurantId} (${notification.restaurantName}):`, {
        email: notification.restaurantEmail,
        itemCount: notification.orderItems.length,
        subtotal: notification.subtotal,
        tax: notification.tax,
        total: notification.orderTotal
      });
    }
    
    // Send notifications to each restaurant
    const notificationPromises: Promise<boolean>[] = [];
    
    console.log('📧 Starting to send notifications to restaurants...');
    
    for (const [restaurantId, notification] of restaurantOrders.entries()) {
      console.log(`📧 Queuing notification for restaurant ${restaurantId} (${notification.restaurantName})`);
      notificationPromises.push(sendSingleRestaurantNotification(notification, correlationId));
    }
    
    // Wait for all notifications to be sent
    console.log(`⏳ Waiting for ${notificationPromises.length} notification(s) to complete...`);
    const results = await Promise.all(notificationPromises);
    const allSuccessful = results.every(result => result === true);
    
    console.log('📧 Notification results:', results);
    console.log(`✅ All notifications successful: ${allSuccessful}`);
    
    logger.info('Restaurant notifications completed', {
      correlationId,
      context: 'restaurantNotificationService.sendRestaurantOrderNotifications',
      data: { 
        orderId,
        restaurantCount: restaurantOrders.size,
        success: allSuccessful,
        results
      }
    });
    
    return allSuccessful;
  } catch (error) {
    console.log('❌ ERROR in restaurant notification service:', error);
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
    console.log(`📧 SENDING SINGLE RESTAURANT NOTIFICATION`);
    console.log(`🏪 Restaurant: ${notification.restaurantName} (ID: ${notification.restaurantId})`);
    console.log(`📧 Email: ${notification.restaurantEmail}`);
    console.log(`📋 Order: ${notification.orderNumber} (ID: ${notification.orderId})`);
    
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
    console.log(`📦 Formatting ${notification.orderItems.length} items for email template...`);
    const itemsList = notification.orderItems.map(item => ({
      name: item.name,
      quantity: item.quantity,
      price: Number(item.price).toFixed(2),
      specialInstructions: item.specialInstructions
    }));
    
    console.log(`📦 Formatted items:`, itemsList);
    
    // Create the email content using the existing email service
    const subject = `New Paid Order #${notification.orderNumber} - Action Required`;
    console.log(`📧 Email subject: ${subject}`);
    
    // Calculate restaurant total (subtotal + tax, excluding processing fee)
    const restaurantTotal = (notification.subtotal + Number(notification.tax)).toFixed(2);
    console.log(`💰 Restaurant total calculation: $${notification.subtotal.toFixed(2)} + $${Number(notification.tax).toFixed(2)} = $${restaurantTotal}`);
    
    const templateData = {
      restaurantName: notification.restaurantName,
      orderNumber: notification.orderNumber,
      orderDate: notification.orderDate.toLocaleString(),
      customerName: notification.customerName,
      items: itemsList,
      subtotal: notification.subtotal.toFixed(2),
      tax: Number(notification.tax).toFixed(2),
      restaurantTotal: restaurantTotal,
      specialInstructions: notification.specialInstructions,
      orderId: notification.orderId
    };
    
    console.log(`📧 Template data prepared:`, {
      restaurantName: templateData.restaurantName,
      orderNumber: templateData.orderNumber,
      orderDate: templateData.orderDate,
      itemCount: templateData.items.length,
      subtotal: templateData.subtotal,
      tax: templateData.tax,
      restaurantTotal: templateData.restaurantTotal
    });
    
    // Send the email using the existing email service
    console.log(`📧 Calling emailService.sendEmail...`);
    console.log(`📧 Email parameters:`, {
      to: notification.restaurantEmail,
      subject: subject,
      templateName: 'restaurant-order'
    });
    
    const emailResult = await emailService.sendEmail({
      to: notification.restaurantEmail,
      subject: subject,
      templateName: 'restaurant-order',  // This would be a new template to create
      templateData: templateData
    });
    
    console.log(`📧 Email service result:`, {
      success: emailResult.success,
      messageId: emailResult.messageId,
      error: emailResult.error
    });
    
    if (emailResult.success) {
      console.log(`✅ Restaurant notification email sent successfully!`);
      console.log(`📧 Message ID: ${emailResult.messageId}`);
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
      console.log(`❌ Failed to send restaurant notification email`);
      console.log(`❌ Error:`, emailResult.error);
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
    console.log(`❌ EXCEPTION in sendSingleRestaurantNotification:`, error);
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