/**
 * Order Payment Link Service
 * 
 * Integrates payment link generation with order storage
 */

import { Order, PaymentStatus } from '../entities/Order.js';
import { AppDataSource } from '../database.js';
import { createCorrelationId, removeCorrelationId, error as logError } from '../utils/logger.js';
import { saveOrderToDatabase } from './orderDatabaseService.js';
import { sendPaymentLinkEmail } from './orderEmailService.js';
import { generatePaymentLink, PaymentLinkRequest, PaymentLinkResponse } from './paymentService.js';
import { PriceCalculator } from './priceCalculator.js';
import { temporaryOrderService, TemporaryOrder } from './temporaryOrderService.js';
import { OrderDetails } from '../orderService.js';

// Helper type for payment metadata structure
interface PaymentMetadata {
  paymentLink?: {
    id: string;
    url: string;
    expiresAt: number;
    createdAt: number;
  };
  paymentStatus?: PaymentStatus;
  paidAt?: number;
  movedToDatabase?: boolean;
  dbOrderId?: number;
  printerNotification?: {
    sent: boolean;
    timestamp?: number;
    error?: string;
  };
}

// Utility function to get payment metadata from a temporary order
function getPaymentMetadata(order: TemporaryOrder): PaymentMetadata {
  return (order.metadata as PaymentMetadata) || {};
}

// Extend the TemporaryOrder interface with payment properties
interface OrderWithPaymentInfo extends TemporaryOrder {
  // These properties are virtual and accessed through metadata
  // They're defined here for type safety in our service
  paymentLink?: {
    id: string;
    url: string;
    expiresAt: number;
    createdAt: number;
  };
  paymentStatus?: 'pending' | 'paid' | 'failed' | 'expired';
  paidAt?: number;
}

/**
 * Interface for order payment link request
 */
export interface OrderPaymentLinkRequest {
  orderId: string;
  amount: number;
  tempOrderId: string;
  customerName?: string;
  description?: string;
  expirationDays?: number;
}

/**
 * Export the extended order interface for external use
 */
export type OrderWithPayment = OrderWithPaymentInfo;

/**
 * Generate a payment link for an order
 * 
 * @param params The order payment link request parameters
 * @returns Promise<OrderWithPayment> The order with payment link info
 */
export async function generateOrderPaymentLink(
  params: OrderPaymentLinkRequest
): Promise<OrderWithPayment> {
  const { orderId, amount, tempOrderId, customerName, description, expirationDays } = params;
  
  // Create a correlation ID for tracking this operation through logs
  const correlationId = createCorrelationId(orderId);
  
  try {
    logError('Generating payment link for order', {
      correlationId,
      context: 'orderPaymentLinkService.generateOrderPaymentLink',
      data: {
        orderId
      }
    });
    
    // Retrieve the order
    const order = temporaryOrderService.getOrder(orderId);
    
    if (!order) {
      const errorMessage = `Order not found with ID: ${orderId}`;
      logError(errorMessage, {
        correlationId,
        context: 'orderPaymentLinkService.generateOrderPaymentLink'
      });
      throw new Error(errorMessage);
    }
    
    // Create metadata for the payment link
    const metadata: Record<string, string> = {
      orderId: order.id,
      orderType: 'pending',
      createdAt: new Date().toISOString()
    };
    
    // Add any additional order details to metadata
    if (order.restaurantId) {
      metadata.restaurantId = order.restaurantId;
    }
    if (order.restaurantName) {
      metadata.restaurantName = order.restaurantName;
    }
    
    // HYBRID APPROACH: Include database order ID if available
    const orderMetadata = getPaymentMetadata(order);
    if (orderMetadata.dbOrderId) {
      metadata.dbOrderId = String(orderMetadata.dbOrderId);
      console.log(`Including database order ID in payment metadata: ${orderMetadata.dbOrderId}`);
    }
    
    // Create the payment link request
    const paymentLinkRequest: PaymentLinkRequest = {
      orderId: orderMetadata.dbOrderId || parseInt(order.id.split('-')[1], 10), // Use database ID if available, fallback to timestamp
      tempOrderId: tempOrderId,
      amount: amount,
      customerName: customerName || order.customerName,
      description: description || `Order from ${order.restaurantName || 'Ritt Drive-Thru'}`,
      metadata,
      expirationDays
    };
    
    // Generate the payment link
    const paymentLink = await generatePaymentLink(paymentLinkRequest);
    
    logError('Payment link generated successfully', {
      correlationId,
      context: 'orderPaymentLinkService.generateOrderPaymentLink',
      data: {
        orderId,
        paymentLinkId: paymentLink.id,
        expiresAt: new Date(paymentLink.expiresAt * 1000).toISOString()
      }
    });
    
    // Update the order with payment link information
    const updatedOrder = temporaryOrderService.updateOrder(orderId, {
      metadata: {
        paymentLink: {
          id: paymentLink.id,
          url: paymentLink.url,
          expiresAt: paymentLink.expiresAt,
          createdAt: Math.floor(Date.now() / 1000)
        },
        paymentStatus: 'pending'
      }
    });
    
    if (!updatedOrder) {
      throw new Error(`Failed to update order with payment link: ${orderId}`);
    }
    
    return updatedOrder as OrderWithPayment;
  } catch (error) {
    logError('Failed to generate payment link for order', {
      correlationId,
      context: 'orderPaymentLinkService.generateOrderPaymentLink',
      error,
      data: { orderId }
    });
    throw error;
  } finally {
    removeCorrelationId(correlationId);
  }
}

/**
 * Move a paid temporary order to the permanent database
 * 
 * @param order The temporary order that has been paid
 * @returns Promise<boolean> True if the order was successfully moved to the database
 */
async function movePaidOrderToDatabase(order: TemporaryOrder): Promise<boolean> {
  const correlationId = createCorrelationId(order.id);
  
  try {
    logError('Moving paid order to database', {
      correlationId,
      context: 'orderPaymentLinkService.movePaidOrderToDatabase',
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber
      }
    });
    
    // Check if the order already exists in the database by order number
    // We'll implement this check in a future version
    
    // Convert temporary order to OrderDetails format expected by saveOrderToDatabase
    const orderDetails: OrderDetails = {
      orderNumber: order.orderNumber || `ORDER-${Date.now()}`,
      restaurantId: order.restaurantId,
      restaurantName: order.restaurantName,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      customerPhone: order.metadata?.customerPhone ? String(order.metadata.customerPhone) : '',
      items: order.items.map(item => ({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        specialInstructions: item.specialInstructions || (item.options?.length ? item.options.join(', ') : undefined)
      })),
      subtotal: order.subtotal,
      stateTax: order.tax,
      orderTotal: order.total,
      processingFee: order.metadata?.processingFee || 0,
      tax: order.tax,
      total: order.total
    };
    
    // Save the order to the database
    const savedOrder = await saveOrderToDatabase(orderDetails);
    
    if (savedOrder && savedOrder.dbOrderId) {
      logError('Order successfully moved to database', {
        correlationId,
        context: 'orderPaymentLinkService.movePaidOrderToDatabase',
        data: {
          tempOrderId: order.id,
          dbOrderId: savedOrder.dbOrderId,
          orderNumber: orderDetails.orderNumber
        }
      });
      
      // Update the temporary order with database ID reference
      await temporaryOrderService.updateOrder(order.id, {
        metadata: {
          ...order.metadata,
          dbOrderId: savedOrder.dbOrderId,
          movedToDatabase: true,
          movedToDatabaseAt: Date.now()
        }
      });
      
      return true;
    } else {
      logError('Failed to save order to database', {
        correlationId,
        context: 'orderPaymentLinkService.movePaidOrderToDatabase',
        data: {
          tempOrderId: order.id,
          orderNumber: orderDetails.orderNumber
        }
      });
      
      return false;
    }
  } catch (error: any) {
    logError('Error moving paid order to database', {
      correlationId,
      context: 'orderPaymentLinkService.movePaidOrderToDatabase',
      error: error.message,
      data: {
        tempOrderId: order.id,
        orderNumber: order.orderNumber
      }
    });
    
    return false;
  } finally {
    removeCorrelationId(correlationId);
  }
}

/**
 * Update the payment status of an order
 */
export async function updateOrderPaymentStatus(
  orderId: number,
  newStatus: PaymentStatus,
  sessionId?: string,
  paymentIntentId?: string
): Promise<Order | null> {
  const correlationId = createCorrelationId();
  
  try {
    logError('Attempting to update order payment status', {
      correlationId,
      data: { orderId, newStatus, sessionId, paymentIntentId }
    });
    
    // Update order status - search by ID, not order_number
    const order = await AppDataSource.getRepository(Order).findOne({
      where: { id: orderId }
    });

    if (!order) {
      logError('Order not found during payment status update', {
        correlationId,
        data: { orderId, newStatus }
      });
      throw new Error('Order not found');
    }

    logError('Order found, updating payment status', {
      correlationId,
      data: { 
        orderId: order.id,
        orderNumber: order.order_number,
        currentStatus: order.payment_status,
        newStatus 
      }
    });

    order.payment_status = newStatus;
    if (newStatus === PaymentStatus.PAID) {
      order.paid_at = new Date();
    }

    const updatedOrder = await AppDataSource.getRepository(Order).save(order);
    
    logError('Order payment status updated successfully', {
      correlationId,
      data: { 
        orderId: updatedOrder.id,
        orderNumber: updatedOrder.order_number,
        paymentStatus: updatedOrder.payment_status,
        paidAt: updatedOrder.paid_at
      }
    });
    
    return updatedOrder;
  } catch (error) {
    logError('Failed to update order payment status', {
      correlationId,
      error,
      data: { orderId, newStatus }
    });
    return null;
  } finally {
    removeCorrelationId(correlationId);
  }
}

/**
 * Regenerate a payment link for an expired order
 * 
 * @param orderId The order ID
 * @returns Promise<OrderWithPayment> The order with new payment link
 */
export async function regenerateOrderPaymentLink(
  orderId: string
): Promise<OrderWithPayment> {
  // Get the order
  const order = temporaryOrderService.getOrder(orderId);
  if (!order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  // Get the price calculator
  const priceCalculator = PriceCalculator.getInstance();
  const priceBreakdown = priceCalculator.calculateOrderPrices(order.subtotal);

  // Generate a new payment link
  return await generateOrderPaymentLink({
    orderId: order.id,
    amount: priceBreakdown.totalWithFees,
    tempOrderId: order.id,
    customerName: order.customerName,
    description: `Order from ${order.restaurantName || 'Ritt Drive-Thru'}`,
    expirationDays: 2
  });
}

/**
 * Get all orders with their payment status
 * 
 * @returns Array<OrderWithPayment> List of all orders with payment info
 */
export function listOrdersWithPayment(): OrderWithPayment[] {
  try {
    const allOrders = temporaryOrderService.listOrders();
    return allOrders as OrderWithPayment[];
  } catch (error) {
    logError('Failed to list orders with payment', {
      context: 'orderPaymentLinkService.listOrdersWithPayment',
      error
    });
    throw error;
  }
}

/**
 * Get an order with payment information by ID
 * 
 * @param orderId The order ID
 * @returns OrderWithPayment | null The order or null if not found
 */
export function getOrderWithPayment(orderId: string): OrderWithPayment | null {
  const correlationId = createCorrelationId();
  
  try {
    // Get the order
    const order = temporaryOrderService.getOrder(orderId);

    if (!order) {
      return null;
    }

    // Return the order as OrderWithPayment (it already matches the interface)
    return order as OrderWithPayment;
  } catch (error) {
    logError('Failed to get order with payment', {
      correlationId,
      error,
      data: { orderId }
    });
    return null;
  } finally {
    removeCorrelationId(correlationId);
  }
}