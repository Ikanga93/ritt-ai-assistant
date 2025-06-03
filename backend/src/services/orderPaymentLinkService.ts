/**
 * Order Payment Link Service
 * 
 * Integrates payment link generation with order storage
 */

import * as logger from '../utils/logger.js';
import { generatePaymentLink, PaymentLinkRequest, PaymentLinkResponse } from './paymentService.js';
import { PriceCalculator } from './priceCalculator.js';

// Import the order storage service
import { temporaryOrderService, TemporaryOrder } from './temporaryOrderService.js';
import { sendPaymentLinkEmail, sendOrderToPrinter, sendPaymentReceiptEmail } from './orderEmailService.js';
import { saveOrderToDatabase } from './orderDatabaseService.js';
import { OrderDetails } from '../orderService.js';

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
  movedToDatabase?: boolean;
  dbOrderId?: number;
  printerNotification?: {
    sent: boolean;
    sentAt: number;
    messageId?: string;
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
  const correlationId = logger.createCorrelationId(orderId);
  
  try {
    logger.info('Generating payment link for order', {
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
      logger.error(errorMessage, {
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
    
    // Create the payment link request
    const paymentLinkRequest: PaymentLinkRequest = {
      orderId: parseInt(order.id.split('-')[1], 10), // Use timestamp part of ID as numeric ID
      tempOrderId: tempOrderId,
      amount: amount,
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
/**
 * Move a paid temporary order to the permanent database
 * 
 * @param order The temporary order that has been paid
 * @returns Promise<boolean> True if the order was successfully moved to the database
 */
async function movePaidOrderToDatabase(order: TemporaryOrder): Promise<boolean> {
  const correlationId = logger.createCorrelationId(order.id);
  
  try {
    logger.info('Moving paid order to database', {
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
      logger.info('Order successfully moved to database', {
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
      logger.error('Failed to save order to database', {
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
    logger.error('Error moving paid order to database', {
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
    logger.removeCorrelationId(correlationId);
  }
}

export async function updateOrderPaymentStatus(
  paymentLinkId: string,
  newStatus: 'pending' | 'paid' | 'failed' | 'expired',
  stripeSessionId?: string,
  stripePaymentIntentId?: string
): Promise<OrderWithPayment | null> {
  const correlationId = logger.createCorrelationId(paymentLinkId);
  
  try {
    logger.info('Updating order payment status', {
      correlationId,
      context: 'orderPaymentLinkService.updateOrderPaymentStatus',
      data: {
        paymentLinkId,
        newStatus,
        stripeSessionId,
        stripePaymentIntentId
      }
    });
    
    // Find all orders
    const allOrders = temporaryOrderService.listOrders();
    
    // First try to find the order with the matching payment link ID
    let matchingOrder = allOrders.find(order => {
      const metadata = getPaymentMetadata(order);
      return metadata.paymentLink && metadata.paymentLink.id === paymentLinkId;
    });
    
    // If not found by payment link ID, check if paymentLinkId is actually an order ID
    if (!matchingOrder) {
      logger.info('Order not found by payment link ID, trying as order ID', {
        correlationId,
        context: 'orderPaymentLinkService.updateOrderPaymentStatus',
        data: { paymentLinkId }
      });
      
      // Try to get the order directly by ID
      const orderById = temporaryOrderService.getOrder(paymentLinkId);
      if (orderById) {
        matchingOrder = orderById;
      }
      
      // If still not found, check if it's a temporary order ID format
      if (!matchingOrder && paymentLinkId.startsWith('TEMP-')) {
        logger.info('Order not found in memory, checking disk directly', {
          correlationId,
          context: 'orderPaymentLinkService.updateOrderPaymentStatus',
          data: { paymentLinkId }
        });
        
        // Force reload from disk - this is redundant but kept for clarity
        const orderFromDisk = temporaryOrderService.getOrder(paymentLinkId);
        if (orderFromDisk) {
          matchingOrder = orderFromDisk;
        }
      }
    }
    
    if (!matchingOrder) {
      logger.warn('No order found with ID or payment link ID', {
        correlationId,
        context: 'orderPaymentLinkService.updateOrderPaymentStatus',
        data: { paymentLinkId }
      });
      return null;
    }
    
    // Update the order's payment status in metadata
    const currentMetadata = getPaymentMetadata(matchingOrder);
    let updatedOrder = temporaryOrderService.updateOrder(matchingOrder.id, {
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
    
    // If payment is confirmed, send notification to restaurant printer and move to database
    if (newStatus === 'paid') {
      // Step 1: Send order to printer first
      let printerNotificationSent = false;
      
      try {
        // First try to get the printer email from the restaurant's menu data
        let restaurantPrinterEmail;
        
        // Try to load the restaurant's menu data file
        let menuData: any = null;
        try {
          const fs = await import('fs/promises');
          const path = await import('path');
          
          // Construct the path to the restaurant's menu data file
          const menuDataPath = path.join(process.cwd(), 'menu_data', `${updatedOrder.restaurantId}.json`);
          
          // Read the menu data file
          const menuDataContent = await fs.readFile(menuDataPath, 'utf-8');
          menuData = JSON.parse(menuDataContent);
          
          // Get the printer email from the menu data
          restaurantPrinterEmail = menuData.printer_email;
          
          logger.info('Found printer email in restaurant menu data', {
            correlationId,
            context: 'orderPaymentLinkService.updateOrderPaymentStatus',
            data: {
              restaurantId: updatedOrder.restaurantId,
              restaurantPrinterEmail
            }
          });
        } catch (menuError) {
          logger.warn('Failed to load restaurant menu data, falling back to environment variable', {
            correlationId,
            context: 'orderPaymentLinkService.updateOrderPaymentStatus',
            error: menuError instanceof Error ? menuError.message : 'Unknown error loading menu data',
            data: {
              restaurantId: updatedOrder.restaurantId
            }
          });
          
          // Try to get the email from the menu data first
          restaurantPrinterEmail = menuData.printer_email || menuData.email;
          
          // If still no email, fall back to environment variable
          if (!restaurantPrinterEmail) {
            restaurantPrinterEmail = process.env.DEFAULT_RESTAURANT_EMAIL || process.env.CENTRAL_ORDER_EMAIL;
          }
        }
        
        if (restaurantPrinterEmail) {
          logger.info('Sending order to restaurant printer', {
            correlationId,
            context: 'orderPaymentLinkService.updateOrderPaymentStatus',
            data: {
              orderId: updatedOrder.id,
              restaurantPrinterEmail
            }
          });
          
          // Send order to restaurant printer
          const printerResult = await sendOrderToPrinter(updatedOrder, restaurantPrinterEmail);
          
          if (printerResult.success) {
            printerNotificationSent = true;
            
            logger.info('Order sent to restaurant printer successfully', {
              correlationId,
              context: 'orderPaymentLinkService.updateOrderPaymentStatus',
              data: {
                orderId: updatedOrder.id,
                messageId: printerResult.messageId
              }
            });
            
            // Update order metadata with printer notification status
            const orderWithPrinterStatus = temporaryOrderService.updateOrder(updatedOrder.id, {
              metadata: {
                ...updatedOrder.metadata,
                printerNotification: {
                  sent: true,
                  sentAt: Date.now(),
                  messageId: printerResult.messageId
                }
              }
            });
            
            // Update our reference to the order
            if (orderWithPrinterStatus) {
              updatedOrder = orderWithPrinterStatus;
            }
          } else {
            logger.warn('Failed to send order to restaurant printer', {
              correlationId,
              context: 'orderPaymentLinkService.updateOrderPaymentStatus',
              data: {
                orderId: updatedOrder.id,
                error: printerResult.error?.message
              }
            });
          }
        } else {
          logger.warn('No restaurant printer email configured', {
            correlationId,
            context: 'orderPaymentLinkService.updateOrderPaymentStatus',
            data: {
              orderId: updatedOrder.id
            }
          });
        }
      } catch (printerError: any) {
        // Log printer error but don't fail the overall operation
        logger.error('Error sending order to restaurant printer', {
          correlationId,
          context: 'orderPaymentLinkService.updateOrderPaymentStatus',
          error: printerError.message,
          data: {
            orderId: updatedOrder.id
          }
        });
      }
      
      // Step 2: Send payment receipt email to customer
      try {
        if (updatedOrder.customerEmail) {
          logger.info('Sending payment receipt email to customer', {
            correlationId,
            context: 'orderPaymentLinkService.updateOrderPaymentStatus',
            data: {
              orderId: updatedOrder.id,
              customerEmail: updatedOrder.customerEmail
            }
          });
          
          const paymentId = stripePaymentIntentId || stripeSessionId || `payment-${Date.now()}`;
          const receiptResult = await sendPaymentReceiptEmail(updatedOrder, paymentId);
          
          if (receiptResult.success) {
            logger.info('Payment receipt email sent successfully', {
              correlationId,
              context: 'orderPaymentLinkService.updateOrderPaymentStatus',
              data: {
                orderId: updatedOrder.id,
                customerEmail: updatedOrder.customerEmail,
                messageId: receiptResult.messageId
              }
            });
          } else {
            logger.warn('Failed to send payment receipt email', {
              correlationId,
              context: 'orderPaymentLinkService.updateOrderPaymentStatus',
              data: {
                orderId: updatedOrder.id,
                customerEmail: updatedOrder.customerEmail,
                error: receiptResult.error?.message
              }
            });
          }
        }
      } catch (emailError: any) {
        // Log email error but don't fail the overall operation
        logger.error('Error sending payment receipt email', {
          correlationId,
          context: 'orderPaymentLinkService.updateOrderPaymentStatus',
          error: emailError.message,
          data: {
            orderId: updatedOrder.id,
            customerEmail: updatedOrder.customerEmail
          }
        });
      }
      
      // Step 3: After notifications are sent, move to database
      try {
        // Check if order has already been moved to database
        const metadata = getPaymentMetadata(updatedOrder);
        const alreadyInDatabase = metadata.movedToDatabase || updatedOrder.metadata?.movedToDatabase;
        
        if (!alreadyInDatabase) {
          logger.info('Moving paid order to database', {
            correlationId,
            context: 'orderPaymentLinkService.updateOrderPaymentStatus',
            data: {
              orderId: updatedOrder.id,
              orderNumber: updatedOrder.orderNumber,
              printerNotificationSent
            }
          });
          
          // Only move to database if printer notification was sent successfully or couldn't be sent
          const moved = await movePaidOrderToDatabase(updatedOrder);
          
          if (moved) {
            logger.info('Order successfully moved to database', {
              correlationId,
              context: 'orderPaymentLinkService.updateOrderPaymentStatus',
              data: {
                orderId: updatedOrder.id
              }
            });
          } else {
            logger.warn('Failed to move order to database', {
              correlationId,
              context: 'orderPaymentLinkService.updateOrderPaymentStatus',
              data: {
                orderId: updatedOrder.id
              }
            });
          }
        } else {
          logger.info('Order already exists in database, skipping', {
            correlationId,
            context: 'orderPaymentLinkService.updateOrderPaymentStatus',
            data: {
              orderId: updatedOrder.id,
              dbOrderId: updatedOrder.metadata?.dbOrderId
            }
          });
        }
      } catch (dbError: any) {
        // Log database error but don't fail the overall operation
        logger.error('Error moving order to database', {
          correlationId,
          context: 'orderPaymentLinkService.updateOrderPaymentStatus',
          error: dbError.message,
          data: {
            orderId: updatedOrder.id
          }
        });
      }
    }
    
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