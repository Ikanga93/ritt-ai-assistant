/**
 * Order Payment Link Service
 * 
 * Integrates payment link generation with order storage
 */

import * as logger from '../utils/logger.js';
import { generatePaymentLink, PaymentLinkRequest, PaymentLinkResponse } from './paymentService.js';

// Import the order storage service
import { temporaryOrderService, TemporaryOrder } from './temporaryOrderService.js';
import { sendPaymentLinkEmail } from './orderEmailService.js';

// Helper type for payment metadata structure
interface PaymentMetadata {
  paymentLink?: {
    id: string;
    url: string;
    expiresAt: number;
    createdAt: number;
  };
  paymentStatus?: 'pending' | 'paid' | 'failed' | 'expired';
  paidAt?: number;
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
  customerEmail: string;
  customerName?: string;
  description?: string;
  expirationHours?: number;
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
  const { orderId, customerEmail, customerName, description, expirationHours } = params;
  
  // Create a correlation ID for tracking this operation through logs
  const correlationId = logger.createCorrelationId(orderId, customerEmail);
  
  try {
    logger.info('Generating payment link for order', {
      correlationId,
      context: 'orderPaymentLinkService.generateOrderPaymentLink',
      data: {
        orderId,
        customerEmail
      }
    });
    
    // Retrieve the order
    const order = temporaryOrderService.getOrder(orderId);
    
    if (!order) {
      const errorMessage = `Order not found with ID: ${orderId}`;
      logger.error(errorMessage, {
        correlationId,
        context: 'orderPaymentLinkService.generateOrderPaymentLink'
      });
      throw new Error(errorMessage);
    }
    
    // Calculate expiration in days (convert from hours if provided)
    const expirationDays = expirationHours ? expirationHours / 24 : undefined;
    
    // Create metadata for the payment link
    const metadata: Record<string, string> = {
      orderId: order.id,
      orderType: 'pending',
      customerEmail,
      createdAt: new Date().toISOString()
    };
    
    // Add any additional order details to metadata
    if (order.restaurantId) {
      metadata.restaurantId = order.restaurantId;
    }
    if (order.restaurantName) {
      metadata.restaurantName = order.restaurantName;
    }
    
    // Create the payment link request
    const paymentLinkRequest: PaymentLinkRequest = {
      orderId: parseInt(order.id.split('-')[1], 10), // Use timestamp part of ID as numeric ID
      amount: order.total * 100, // Convert to cents for Stripe
      customerEmail,
      customerName: customerName || order.customerName,
      description: description || `Order from ${order.restaurantName || 'Ritt Drive-Thru'}`,
      metadata,
      expirationDays
    };
    
    // Generate the payment link
    const paymentLink = await generatePaymentLink(paymentLinkRequest);
    
    logger.info('Payment link generated successfully', {
      correlationId,
      context: 'orderPaymentLinkService.generateOrderPaymentLink',
      data: {
        orderId,
        paymentLinkId: paymentLink.id,
        expiresAt: new Date(paymentLink.expiresAt * 1000).toISOString()
      }
    });
    
    // Update the order with payment link information
    // Use metadata field to store payment information since TemporaryOrder doesn't have these fields directly
    const updatedOrder = temporaryOrderService.updateOrder(orderId, {
      metadata: {
        paymentLink: {
          id: paymentLink.id,
          url: paymentLink.url,
          expiresAt: paymentLink.expiresAt,
          createdAt: Math.floor(Date.now() / 1000)
        },
        paymentStatus: 'pending',
        emailStatus: {
          paymentLinkEmailSent: false,
          paymentLinkEmailAttempts: 0
        }
      }
    });
    
    // Send payment link email to customer
    try {
      // Check if order was updated successfully
      if (!updatedOrder) {
        throw new Error(`Failed to update order with payment link: ${orderId}`);
      }
      
      logger.info('Sending payment link email to customer', {
        correlationId,
        context: 'orderPaymentLinkService.generateOrderPaymentLink',
        data: {
          orderId,
          customerEmail,
          paymentLinkId: paymentLink.id
        }
      });
      
      const emailResult = await sendPaymentLinkEmail(
        updatedOrder,
        paymentLink.url,
        paymentLink.expiresAt
      );
      
      // Update email status in order metadata
      if (emailResult.success) {
        temporaryOrderService.updateOrder(orderId, {
          metadata: {
            emailStatus: {
              paymentLinkEmailSent: true,
              paymentLinkEmailSentAt: Date.now(),
              paymentLinkEmailMessageId: emailResult.messageId,
              paymentLinkEmailAttempts: 1
            }
          }
        });
        
        logger.info('Payment link email sent successfully', {
          correlationId,
          context: 'orderPaymentLinkService.generateOrderPaymentLink',
          data: {
            orderId,
            customerEmail,
            messageId: emailResult.messageId
          }
        });
      } else {
        // Update email status with failure information
        temporaryOrderService.updateOrder(orderId, {
          metadata: {
            emailStatus: {
              paymentLinkEmailSent: false,
              paymentLinkEmailAttempts: 1,
              paymentLinkEmailError: emailResult.error?.message || 'Unknown error',
              paymentLinkEmailLastAttempt: Date.now()
            }
          }
        });
        
        logger.warn('Failed to send payment link email', {
          correlationId,
          context: 'orderPaymentLinkService.generateOrderPaymentLink',
          data: {
            orderId,
            customerEmail,
            error: emailResult.error?.message
          }
        });
      }
    } catch (emailError: any) {
      // Log email error but don't fail the overall operation
      logger.error('Error sending payment link email', {
        correlationId,
        context: 'orderPaymentLinkService.generateOrderPaymentLink',
        error: emailError.message,
        data: {
          orderId,
          customerEmail
        }
      });
    }
    
    if (!updatedOrder) {
      throw new Error(`Failed to update order with payment link: ${orderId}`);
    }
    
    return updatedOrder as OrderWithPayment;
  } catch (error) {
    logger.error('Failed to generate payment link for order', {
      correlationId,
      context: 'orderPaymentLinkService.generateOrderPaymentLink',
      error,
      data: { orderId }
    });
    throw error;
  } finally {
    logger.removeCorrelationId(correlationId);
  }
}

/**
 * Update an order's payment status
 * 
 * @param paymentLinkId The Stripe payment link ID
 * @param newStatus The new payment status
 * @returns Promise<OrderWithPayment | null> The updated order or null if not found
 */
export async function updateOrderPaymentStatus(
  paymentLinkId: string,
  newStatus: 'pending' | 'paid' | 'failed' | 'expired'
): Promise<OrderWithPayment | null> {
  const correlationId = logger.createCorrelationId(paymentLinkId);
  
  try {
    logger.info('Updating order payment status', {
      correlationId,
      context: 'orderPaymentLinkService.updateOrderPaymentStatus',
      data: {
        paymentLinkId,
        newStatus
      }
    });
    
    // Find all orders
    const allOrders = temporaryOrderService.listOrders();
    
    // Find the order with the matching payment link ID
    const matchingOrder = allOrders.find(order => {
      const metadata = getPaymentMetadata(order);
      return metadata.paymentLink && metadata.paymentLink.id === paymentLinkId;
    });
    
    if (!matchingOrder) {
      logger.warn('No order found with payment link ID', {
        correlationId,
        context: 'orderPaymentLinkService.updateOrderPaymentStatus',
        data: { paymentLinkId }
      });
      return null;
    }
    
    // Update the order's payment status in metadata
    const currentMetadata = getPaymentMetadata(matchingOrder);
    const updatedOrder = temporaryOrderService.updateOrder(matchingOrder.id, {
      metadata: {
        ...matchingOrder.metadata,
        paymentLink: currentMetadata.paymentLink,
        paymentStatus: newStatus,
        paidAt: newStatus === 'paid' ? Date.now() : currentMetadata.paidAt
      }
    });
    
    if (!updatedOrder) {
      throw new Error(`Failed to update order payment status: ${matchingOrder.id}`);
    }
    
    // Get updated payment metadata
    const updatedMetadata = getPaymentMetadata(updatedOrder);
    
    logger.info('Order payment status updated', {
      correlationId,
      context: 'orderPaymentLinkService.updateOrderPaymentStatus',
      data: {
        orderId: updatedOrder.id,
        paymentLinkId,
        newStatus,
        paidAt: updatedMetadata.paidAt
      }
    });
    
    return updatedOrder as OrderWithPayment;
  } catch (error) {
    logger.error('Failed to update order payment status', {
      correlationId,
      context: 'orderPaymentLinkService.updateOrderPaymentStatus',
      error,
      data: { paymentLinkId, newStatus }
    });
    throw error;
  } finally {
    logger.removeCorrelationId(correlationId);
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
  const correlationId = logger.createCorrelationId(orderId);
  
  try {
    logger.info('Regenerating payment link for order', {
      correlationId,
      context: 'orderPaymentLinkService.regenerateOrderPaymentLink',
      data: { orderId }
    });
    
    // Retrieve the order
    const order = temporaryOrderService.getOrder(orderId);
    
    if (!order) {
      const errorMessage = `Order not found with ID: ${orderId}`;
      logger.error(errorMessage, {
        correlationId,
        context: 'orderPaymentLinkService.regenerateOrderPaymentLink'
      });
      throw new Error(errorMessage);
    }
    
    // Get payment metadata from the order
    const paymentMetadata = getPaymentMetadata(order);
    
    // Check if the order has a payment link and it's expired or failed
    if (!paymentMetadata.paymentLink || 
        (paymentMetadata.paymentStatus !== 'expired' && paymentMetadata.paymentStatus !== 'failed')) {
      logger.warn('Cannot regenerate payment link - order is not expired or failed', {
        correlationId,
        context: 'orderPaymentLinkService.regenerateOrderPaymentLink',
        data: {
          orderId,
          currentStatus: paymentMetadata.paymentStatus
        }
      });
      throw new Error(`Cannot regenerate payment link for order ${orderId} - not expired or failed`);
    }
    
    // Generate a new payment link
    return await generateOrderPaymentLink({
      orderId,
      customerEmail: order.customerEmail,
      customerName: order.customerName
    });
  } catch (error) {
    logger.error('Failed to regenerate payment link for order', {
      correlationId,
      context: 'orderPaymentLinkService.regenerateOrderPaymentLink',
      error,
      data: { orderId }
    });
    throw error;
  } finally {
    logger.removeCorrelationId(correlationId);
  }
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
    logger.error('Failed to list orders with payment', {
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
  try {
    const order = temporaryOrderService.getOrder(orderId);
    return order as OrderWithPayment | null;
  } catch (error) {
    logger.error('Failed to get order with payment', {
      context: 'orderPaymentLinkService.getOrderWithPayment',
      error,
      data: { orderId }
    });
    throw error;
  }
}
