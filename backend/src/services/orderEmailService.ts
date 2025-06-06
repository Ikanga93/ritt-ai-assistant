/**
 * Order Email Service for Ritt Drive-Thru
 * Handles email notifications specifically for orders and payment links
 */

import * as logger from '../utils/logger.js';
import { sendEmail, EmailResult } from './emailService.js';
import { TemporaryOrder } from './temporaryOrderService.js';
import { generateReceiptNumber } from '../utils/orderUtils.js';
import { PriceCalculator } from './priceCalculator.js';

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
