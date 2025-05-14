/**
 * Order Email Service for Ritt Drive-Thru
 * Handles email notifications specifically for orders and payment links
 */

import * as logger from '../utils/logger.js';
import { sendEmail, EmailResult } from './emailService.js';
import { TemporaryOrder } from './temporaryOrderService.js';

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
    
    // Calculate processing fees
    const processingFeePercentage = 0.029; // 2.9%
    const processingFeeFixed = 0.40; // $0.40
    const processingFeeAmount = (order.total * processingFeePercentage);
    const totalProcessingFee = processingFeeAmount + processingFeeFixed;
    const totalWithFees = order.total + totalProcessingFee;
    
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
        total: order.total.toFixed(2),
        tax: order.tax.toFixed(2),
        subtotal: order.subtotal.toFixed(2),
        processingFee: totalProcessingFee.toFixed(2),
        totalWithFees: totalWithFees.toFixed(2),
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
    
    // Calculate processing fees
    const processingFeePercentage = 0.029; // 2.9%
    const processingFeeFixed = 0.40; // $0.40
    const processingFeeAmount = (order.total * processingFeePercentage);
    const totalProcessingFee = processingFeeAmount + processingFeeFixed;
    const totalWithFees = order.total + totalProcessingFee;
    
    // Send the email using the generic sendEmail function
    return await sendEmail({
      to: order.customerEmail,
      subject: `Your Ritt Drive-Thru Order Receipt`,
      templateName: 'payment-receipt',
      templateData: {
        order,
        orderId: order.id,
        customerName: order.customerName,
        items: order.items,
        total: order.total.toFixed(2),
        tax: order.tax.toFixed(2),
        subtotal: order.subtotal.toFixed(2),
        processingFee: totalProcessingFee.toFixed(2),
        totalWithFees: totalWithFees.toFixed(2),
        orderDate: new Date(order.createdAt).toLocaleString(),
        paidDate: new Date().toLocaleString(),
        restaurantName: order.restaurantName,
        paymentId,
        receiptNumber: `RCPT-${Date.now().toString().slice(-6)}-${order.id.slice(-4)}`
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
    logger.info('Sending order to restaurant printer', {
      correlationId,
      context: 'orderEmailService.sendOrderToPrinter',
      data: {
        orderId: order.id,
        restaurantName: order.restaurantName,
        printerEmail
      }
    });
    
    // Format the current date and time
    const orderDate = new Date().toLocaleString();
    
    // Send the email using the generic sendEmail function
    return await sendEmail({
      to: printerEmail,
      subject: `ORDER #${order.orderNumber || order.id}`,
      templateName: 'printer-receipt',
      templateData: {
        order,
        orderId: order.id,
        orderNumber: order.orderNumber || order.id,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        items: order.items,
        total: order.total.toFixed(2),
        tax: order.tax.toFixed(2),
        subtotal: order.subtotal.toFixed(2),
        orderDate: orderDate,
        paidDate: orderDate,
        restaurantName: order.restaurantName,
        isPaid: true,
        receiptType: 'PAID ORDER'
      }
    });
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
