/**
 * Order Email Service for Ritt Drive-Thru
 * Handles email notifications specifically for orders and payment links
 */

import * as logger from '../utils/logger.js';
import { sendEmail, EmailResult } from './emailService.js';
import { TemporaryOrder } from './temporaryOrderService.js';
import { generateReceiptNumber } from '../utils/orderUtils.js';
import { PriceCalculator } from './priceCalculator.js';
// @ts-ignore - async-retry doesn't have type definitions
import retry from 'async-retry';

/**
 * Send a payment link email for a temporary order
 * @param order The temporary order details
 * @param paymentLink The payment link URL
 * @param expiresAt The expiration timestamp for the payment link
 * @returns {Promise<EmailResult>} The result of the email sending operation
 */
export async function sendPaymentLinkEmail(
  order: TemporaryOrder,
  paymentLink: string,
  expiresAt: number
): Promise<EmailResult> {
  const correlationId = logger.createCorrelationId(
    order.id,
    order.customerEmail
  );
  
  try {
    logger.info('Sending payment link email', {
      correlationId,
      context: 'orderEmailService.sendPaymentLinkEmail',
      data: {
        orderId: order.id,
        customerEmail: order.customerEmail,
        paymentLink
      }
    });
    
    // Calculate expiration time in a readable format
    const expirationDate = new Date(expiresAt * 1000).toLocaleString();
    
    // Use the price calculator for consistent calculations
    const priceCalculator = PriceCalculator.getInstance();
    const priceBreakdown = priceCalculator.calculateOrderPrices(order.subtotal);
    
    // Log the price breakdown for debugging
    logger.info('Payment link price breakdown', {
      correlationId,
      context: 'orderEmailService.sendPaymentLinkEmail',
      data: {
        orderId: order.id,
        subtotal: order.subtotal,
        tax: priceBreakdown.tax,
        total: priceBreakdown.total,
        processingFee: priceBreakdown.processingFee,
        totalWithFees: priceBreakdown.totalWithFees
      }
    });
    
    // Send the email using the generic sendEmail function
    return await sendEmail({
      to: order.customerEmail,
      subject: `Complete Your Ritt Drive-Thru Order Payment`,
      templateName: 'payment-link',
      templateData: {
        order,
        orderId: order.id,
        customerName: order.customerName,
        items: order.items,
        total: priceBreakdown.total.toFixed(2),
        tax: priceBreakdown.tax.toFixed(2),
        subtotal: priceBreakdown.subtotal.toFixed(2),
        processingFee: priceBreakdown.processingFee.toFixed(2),
        totalWithFees: priceBreakdown.totalWithFees.toFixed(2),
        orderDate: new Date(order.createdAt).toLocaleString(),
        restaurantName: order.restaurantName,
        paymentLink,
        expirationDate,
        payButtonText: 'Pay Now',
        payButtonUrl: paymentLink
      }
    });
  } catch (error: any) {
    logger.error('Failed to send payment link email', {
      correlationId,
      context: 'orderEmailService.sendPaymentLinkEmail',
      error: error.message,
      data: {
        orderId: order.id,
        customerEmail: order.customerEmail
      }
    });
    
    return {
      success: false,
      error,
      timestamp: Date.now()
    };
  }
}

/**
 * Send a payment reminder email for a pending order
 * @param order The temporary order details
 * @param paymentLink The payment link URL
 * @param expiresAt The expiration timestamp for the payment link
 * @param reminderNumber The reminder number (1st, 2nd, etc.)
 * @returns {Promise<EmailResult>} The result of the email sending operation
 */
export async function sendPaymentReminderEmail(
  order: TemporaryOrder,
  paymentLink: string,
  expiresAt: number,
  reminderNumber: number
): Promise<EmailResult> {
  const correlationId = logger.createCorrelationId(
    order.id,
    order.customerEmail
  );
  
  try {
    logger.info(`Sending payment reminder #${reminderNumber} email`, {
      correlationId,
      context: 'orderEmailService.sendPaymentReminderEmail',
      data: {
        orderId: order.id,
        customerEmail: order.customerEmail,
        reminderNumber
      }
    });
    
    // Calculate time remaining before expiration
    const now = Math.floor(Date.now() / 1000);
    const hoursRemaining = Math.floor((expiresAt - now) / 3600);
    
    // Send the email using the generic sendEmail function
    return await sendEmail({
      to: order.customerEmail,
      subject: `Reminder: Complete Your Ritt Drive-Thru Order Payment`,
      templateName: 'payment-reminder',
      templateData: {
        order,
        orderId: order.id,
        customerName: order.customerName,
        restaurantName: order.restaurantName,
        paymentLink,
        hoursRemaining,
        expirationDate: new Date(expiresAt * 1000).toLocaleString(),
        reminderNumber,
        payButtonText: 'Complete Payment',
        payButtonUrl: paymentLink
      }
    });
  } catch (error: any) {
    logger.error(`Failed to send payment reminder #${reminderNumber} email`, {
      correlationId,
      context: 'orderEmailService.sendPaymentReminderEmail',
      error: error.message,
      data: {
        orderId: order.id,
        customerEmail: order.customerEmail,
        reminderNumber
      }
    });
    
    return {
      success: false,
      error,
      timestamp: Date.now()
    };
  }
}

/**
 * Send a payment receipt email for a completed order
 * @param order The temporary order details
 * @param paymentId The payment ID or transaction reference
 * @returns {Promise<EmailResult>} The result of the email sending operation
 */
export async function sendPaymentReceiptEmail(
  order: TemporaryOrder,
  paymentId: string
): Promise<EmailResult> {
  const correlationId = logger.createCorrelationId(
    order.id,
    order.customerEmail
  );
  
  try {
    logger.info('Sending payment receipt email', {
      correlationId,
      context: 'orderEmailService.sendPaymentReceiptEmail',
      data: {
        orderId: order.id,
        customerEmail: order.customerEmail,
        paymentId
      }
    });
    
    // Use the price calculator for consistent calculations
    const priceCalculator = PriceCalculator.getInstance();
    const priceBreakdown = priceCalculator.calculateOrderPrices(order.subtotal);
    
    // Generate receipt number using the new utility function
    const receiptNumber = generateReceiptNumber();
    
    // Log the price breakdown for debugging
    logger.info('Payment receipt price breakdown', {
      correlationId,
      context: 'orderEmailService.sendPaymentReceiptEmail',
      data: {
        orderId: order.id,
        subtotal: order.subtotal,
        tax: priceBreakdown.tax,
        total: priceBreakdown.total,
        processingFee: priceBreakdown.processingFee,
        totalWithFees: priceBreakdown.totalWithFees
      }
    });
    
    // Send the email using the generic sendEmail function
    return await sendEmail({
      to: order.customerEmail,
      subject: `Payment Receipt - Order #${order.orderNumber}`,
      templateName: 'payment-receipt',
      templateData: {
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        restaurantName: order.restaurantName,
        paidDate: new Date().toLocaleString(),
        paymentId,
        receiptNumber,
        orderNumber: order.orderNumber,
        items: order.items,
        subtotal: priceBreakdown.subtotal,
        tax: priceBreakdown.tax,
        total: priceBreakdown.total,
        processingFee: priceBreakdown.processingFee,
        totalWithFees: priceBreakdown.totalWithFees
      }
    });
  } catch (error: any) {
    logger.error('Failed to send payment receipt email', {
      correlationId,
      context: 'orderEmailService.sendPaymentReceiptEmail',
      error: error.message,
      data: {
        orderId: order.id,
        customerEmail: order.customerEmail,
        paymentId
      }
    });
    
    return {
      success: false,
      error,
      timestamp: Date.now()
    };
  }
}

/**
 * Send an order notification to a restaurant's printer via Epson Connect
 * @param order The order details
 * @param printerEmail The restaurant's Epson printer email address
 * @returns {Promise<EmailResult>} The result of the email sending operation
 */
export async function sendOrderToPrinter(
  order: TemporaryOrder,
  printerEmail: string
): Promise<EmailResult> {
  const correlationId = logger.createCorrelationId(
    order.id,
    printerEmail
  );
  
  try {
    // Validate inputs
    if (!order || !order.id) {
      throw new Error('Invalid order data provided to sendOrderToPrinter');
    }
    
    if (!printerEmail || !printerEmail.includes('@')) {
      throw new Error(`Invalid printer email: ${printerEmail}`);
    }
    
    logger.info('Sending order to restaurant printer', {
      correlationId,
      context: 'orderEmailService.sendOrderToPrinter',
      data: {
        orderId: order.id,
        restaurantName: order.restaurantName || 'Unknown Restaurant',
        printerEmail,
        orderItems: order.items?.length || 0
      }
    });
    
    // Format the current date and time
    const orderDate = new Date().toLocaleString();
    
    // Use the price calculator for consistent calculations
    const priceCalculator = PriceCalculator.getInstance();
    const priceBreakdown = priceCalculator.calculateOrderPrices(order.subtotal);
    
    // Use the calculated values for consistency
    const processingFee = priceBreakdown.processingFee;
    const totalWithFees = priceBreakdown.totalWithFees;
    
    // Generate receipt number using the new utility function
    const receiptNumber = generateReceiptNumber();
    
    // Prepare the template data with fallbacks for all required fields
    const templateData = {
      order,
      orderId: order.id,
      orderNumber: order.orderNumber || order.id,
      customerName: order.customerName || 'Customer',
      customerEmail: order.customerEmail || 'No Email Provided',
      items: order.items || [],
      total: (typeof order.total === 'number' ? order.total : priceBreakdown.total).toFixed(2),
      tax: (typeof order.tax === 'number' ? order.tax : priceBreakdown.tax).toFixed(2),
      subtotal: (typeof order.subtotal === 'number' ? order.subtotal : priceBreakdown.subtotal).toFixed(2),
      processingFee: processingFee.toFixed(2),
      totalWithFees: totalWithFees.toFixed(2),
      orderDate: orderDate,
      paidDate: orderDate,
      restaurantName: order.restaurantName || 'Ritt Drive-Thru Restaurant',
      isPaid: true,
      receiptType: 'PAID ORDER'
    };
    
    // Log the template data for debugging
    logger.info('Printer receipt template data prepared', {
      correlationId,
      context: 'orderEmailService.sendOrderToPrinter',
      data: {
        orderId: order.id,
        templateData: {
          orderNumber: templateData.orderNumber,
          items: templateData.items.length,
          total: templateData.total,
          subtotal: templateData.subtotal
        }
      }
    });
    
    // Send the email using the generic sendEmail function with retry logic
    return await retry(
      async () => {
        return await sendEmail({
          to: printerEmail,
          subject: `ORDER #${templateData.orderNumber}`,
          templateName: 'printer-receipt',
          templateData
        });
      },
      {
        retries: 3,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 5000,
        onRetry: (error: Error, attempt: number) => {
          logger.warn(`Retry attempt ${attempt} for printer email`, {
            correlationId,
            context: 'orderEmailService.sendOrderToPrinter',
            error: error.message,
            data: { printerEmail, orderId: order.id }
          });
        }
      }
    );
  } catch (error: any) {
    logger.error('Failed to send order to restaurant printer', {
      correlationId,
      context: 'orderEmailService.sendOrderToPrinter',
      error: error.message,
      data: {
        orderId: order.id,
        printerEmail
      }
    });
    
    return {
      success: false,
      error,
      timestamp: Date.now()
    };
  }
}
