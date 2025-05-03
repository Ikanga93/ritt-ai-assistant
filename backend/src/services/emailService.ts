/**
 * Email Service for Ritt Drive-Thru
 * Handles email notifications for orders and payments using SendGrid
 */

import sgMail from '@sendgrid/mail';
import * as logger from '../utils/logger.js';
import { Order } from '../entities/Order.js';

// Define a custom interface for order email data without extending Order
interface OrderEmailData {
  id: string | number;
  order_number: string;
  customer_name?: string;
  items?: Array<any>;
  restaurant_name?: string;
  created_at: number | string | Date;
  total: number;
  tax: number;
  subtotal: number;
  restaurant?: string;
}
import Handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';
// @ts-ignore - async-retry doesn't have type definitions
import retry from 'async-retry';
import { fileURLToPath } from 'url';

// Initialize SendGrid with API key
sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to email templates
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates', 'emails');

// Email options interface
export interface EmailOptions {
  to: string;
  subject: string;
  templateName: string;
  templateData: Record<string, any>;
  attachments?: Array<{
    content: string;
    filename: string;
    type: string;
    disposition: string;
  }>;
}

// Email result interface
export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: Error;
  timestamp: number;
}

// Email status tracking
export type EmailStatus = 'queued' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed';

export interface EmailTrackingInfo {
  messageId: string;
  status: EmailStatus;
  sentAt: number;
  deliveredAt?: number;
  openedAt?: number;
  clickedAt?: number;
  failedAt?: number;
  failureReason?: string;
  retryCount: number;
  orderId?: string;
  customerEmail?: string;
}

// In-memory store for email tracking information
// In a production environment, this would be stored in a database
const emailTrackingStore: Record<string, EmailTrackingInfo> = {};

/**
 * Get email tracking information by message ID
 * @param messageId The SendGrid message ID
 * @returns The email tracking information or null if not found
 */
export function getEmailTrackingInfo(messageId: string): EmailTrackingInfo | null {
  return emailTrackingStore[messageId] || null;
}

/**
 * Get all email tracking information for a specific order
 * @param orderId The order ID
 * @returns Array of email tracking information for the order
 */
export function getOrderEmailTrackingInfo(orderId: string): EmailTrackingInfo[] {
  return Object.values(emailTrackingStore).filter(info => info.orderId === orderId);
}

/**
 * Update email delivery status based on webhook events
 * @param messageId The SendGrid message ID
 * @param status The new email status
 * @param timestamp The timestamp of the status change
 * @param reason Optional failure reason
 */
export async function updateEmailDeliveryStatus(
  messageId: string,
  status: EmailStatus,
  timestamp: number = Date.now(),
  reason?: string
): Promise<void> {
  // Clean the message ID (SendGrid sometimes includes additional info)
  const cleanMessageId = messageId.split('.')[0];
  
  // Get existing tracking info or create a new one
  const trackingInfo = emailTrackingStore[cleanMessageId] || {
    messageId: cleanMessageId,
    status: 'queued',
    sentAt: timestamp,
    retryCount: 0
  };
  
  // Update the status and relevant timestamps
  trackingInfo.status = status;
  
  switch (status) {
    case 'delivered':
      trackingInfo.deliveredAt = timestamp;
      break;
    case 'opened':
      trackingInfo.openedAt = timestamp;
      break;
    case 'clicked':
      trackingInfo.clickedAt = timestamp;
      break;
    case 'bounced':
    case 'failed':
      trackingInfo.failedAt = timestamp;
      trackingInfo.failureReason = reason || trackingInfo.failureReason;
      break;
  }
  
  // Store the updated tracking info
  emailTrackingStore[cleanMessageId] = trackingInfo;
  
  // Log the status update
  logger.info('Email delivery status updated', {
    context: 'emailService.updateEmailDeliveryStatus',
    data: {
      messageId: cleanMessageId,
      status,
      timestamp: new Date(timestamp).toISOString()
    }
  });
  
  // TODO: In a production environment, we would update the database here
  // and potentially trigger notifications for certain status changes
}

/**
 * Generate an email delivery report for an order
 * @param orderId The order ID
 * @returns A summary of email delivery status for the order
 */
export function generateEmailDeliveryReport(orderId: string): {
  orderId: string;
  totalEmails: number;
  delivered: number;
  opened: number;
  clicked: number;
  failed: number;
  details: EmailTrackingInfo[];
} {
  const trackingInfos = getOrderEmailTrackingInfo(orderId);
  
  return {
    orderId,
    totalEmails: trackingInfos.length,
    delivered: trackingInfos.filter(info => info.status === 'delivered').length,
    opened: trackingInfos.filter(info => info.status === 'opened').length,
    clicked: trackingInfos.filter(info => info.status === 'clicked').length,
    failed: trackingInfos.filter(info => ['failed', 'bounced'].includes(info.status)).length,
    details: trackingInfos
  };
}

/**
 * Send an email using SendGrid with retry logic
 * @param options Email options including template and data
 * @returns {Promise<EmailResult>} The result of the email sending operation
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const correlationId = logger.createCorrelationId(
    options.to,
    options.subject
  );
  
  try {
    logger.info('Preparing to send email', {
      correlationId,
      context: 'emailService.sendEmail',
      data: {
        to: options.to,
        subject: options.subject,
        templateName: options.templateName
      }
    });
    
    // Render the email template
    const { html, text } = await renderEmailTemplate(options.templateName, options.templateData);
    
    // Prepare the email message
    const msg = {
      to: options.to,
      from: {
        email: process.env.FROM_EMAIL || 'gekuke1@ritt.ai',
        name: process.env.SENDGRID_FROM_NAME || 'Ritt Drive-Thru'
      },
      subject: options.subject,
      html,
      text,
      attachments: options.attachments,
      // Disable click tracking for payment links
      trackingSettings: {
        clickTracking: {
          enable: false
        }
      }
    };
    
    // Send the email with retry logic
    const response = await retry(
      async () => {
        const [response] = await sgMail.send(msg);
        return response;
      },
      {
        retries: 3,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 5000,
        onRetry: (error: Error, attempt: number) => {
          logger.warn(`Retry attempt ${attempt} for email sending`, {
            correlationId,
            context: 'emailService.sendEmail',
            error: error.message,
            data: { to: options.to, subject: options.subject }
          });
        }
      }
    );
    
    logger.info('Email sent successfully', {
      correlationId,
      context: 'emailService.sendEmail',
      data: {
        to: options.to,
        subject: options.subject,
        statusCode: response.statusCode,
        messageId: response.headers['x-message-id']
      }
    });
    
    const messageId = response.headers['x-message-id'] as string;
    
    // Store initial tracking information
    const trackingInfo: EmailTrackingInfo = {
      messageId,
      status: 'sent',
      sentAt: Date.now(),
      retryCount: 0,
      // Extract order ID from template data if available
      orderId: options.templateData.orderId || options.templateData.order?.id,
      customerEmail: options.to
    };
    
    // Store the tracking info
    emailTrackingStore[messageId] = trackingInfo;
    
    return {
      success: true,
      messageId,
      timestamp: trackingInfo.sentAt
    };
  } catch (error: any) {
    logger.error('Failed to send email', {
      correlationId,
      context: 'emailService.sendEmail',
      error: error.message,
      data: {
        to: options.to,
        subject: options.subject,
        templateName: options.templateName
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
 * Render an email template with the provided data
 * @param templateName The name of the template to render
 * @param data The data to use for template rendering
 * @returns {Promise<{html: string, text: string}>} The rendered HTML and plain text versions
 */
async function renderEmailTemplate(
  templateName: string,
  data: Record<string, any>
): Promise<{ html: string; text: string }> {
  try {
    // Check if template exists
    const htmlTemplatePath = path.join(TEMPLATES_DIR, `${templateName}.html`);
    const textTemplatePath = path.join(TEMPLATES_DIR, `${templateName}.txt`);
    
    // Read the HTML template
    let htmlTemplate = '';
    try {
      htmlTemplate = fs.readFileSync(htmlTemplatePath, 'utf-8');
    } catch (error) {
      logger.warn(`HTML template not found: ${templateName}.html`, {
        context: 'emailService.renderEmailTemplate'
      });
      htmlTemplate = '<p>{{message}}</p>'; // Fallback template
    }
    
    // Read the text template
    let textTemplate = '';
    try {
      textTemplate = fs.readFileSync(textTemplatePath, 'utf-8');
    } catch (error) {
      logger.warn(`Text template not found: ${templateName}.txt`, {
        context: 'emailService.renderEmailTemplate'
      });
      textTemplate = '{{message}}'; // Fallback template
    }
    
    // Compile and render the templates
    const htmlCompiled = Handlebars.compile(htmlTemplate);
    const textCompiled = Handlebars.compile(textTemplate);
    
    return {
      html: htmlCompiled(data),
      text: textCompiled(data)
    };
  } catch (error: any) {
    logger.error('Failed to render email template', {
      context: 'emailService.renderEmailTemplate',
      error: error.message,
      data: { templateName }
    });
    
    // Return a simple fallback template
    return {
      html: `<p>An error occurred while rendering the email template.</p>`,
      text: 'An error occurred while rendering the email template.'
    };
  }
}

/**
 * Send an order confirmation email with payment receipt
 * @param order The order details
 * @param email The recipient email address
 * @returns {Promise<EmailResult>} The result of the email sending operation
 */
export async function sendOrderConfirmationEmail(
  order: OrderEmailData,
  email: string
): Promise<EmailResult> {
  const correlationId = logger.createCorrelationId(
    String(order.id),
    order.order_number
  );
  
  try {
    logger.info('Sending order confirmation email', {
      correlationId,
      context: 'emailService.sendOrderConfirmationEmail',
      data: {
        orderId: order.id,
        orderNumber: order.order_number,
        email
      }
    });
    
    // Send the email using the generic sendEmail function
    return await sendEmail({
      to: email,
      subject: `Your Ritt Drive-Thru Order #${order.order_number} Confirmation`,
      templateName: 'order-confirmation',
      templateData: {
        order,
        orderNumber: order.order_number,
        customerName: order.customer_name,
        items: order.items,
        total: order.total,
        tax: order.tax,
        subtotal: order.subtotal,
        orderDate: new Date(order.created_at).toLocaleString(),
        restaurantName: order.restaurant_name
      }
    });
  } catch (error: any) {
    logger.error('Failed to send order confirmation email', {
      correlationId,
      context: 'emailService.sendOrderConfirmationEmail',
      error,
      data: {
        orderId: order.id,
        orderNumber: order.order_number,
        email
      }
    });
    
    return {
      success: false,
      error,
      timestamp: Date.now()
    };
  } finally {
    logger.removeCorrelationId(correlationId);
  }
}

/**
 * Send a payment link email to a customer
 * @param order The order details
 * @param paymentLinkUrl The payment link URL
 * @param email The recipient email address
 * @returns {Promise<boolean>} True if email was sent successfully
 */
export async function sendPaymentLinkEmail(
  order: Order,
  paymentLinkUrl: string,
  email: string
): Promise<boolean> {
  const correlationId = logger.createCorrelationId(
    String(order.id),
    order.order_number
  );
  
  try {
    logger.info('Sending payment link email', {
      correlationId,
      context: 'emailService.sendPaymentLinkEmail',
      data: {
        orderId: order.id,
        orderNumber: order.order_number,
        email,
        paymentLinkUrl
      }
    });
    
    // TODO: Implement actual email sending logic
    // For now, this is just a placeholder
    
    // In a real implementation, you would:
    // 1. Create an email template with order details
    // 2. Include the payment link button
    // 3. Send the email using a service like SendGrid or nodemailer
    
    logger.info('Payment link email would be sent (placeholder)', {
      correlationId,
      context: 'emailService.sendPaymentLinkEmail',
      data: {
        orderId: order.id,
        orderNumber: order.order_number,
        email
      }
    });
    
    return true;
  } catch (error) {
    logger.error('Failed to send payment link email', {
      correlationId,
      context: 'emailService.sendPaymentLinkEmail',
      error,
      data: {
        orderId: order.id,
        orderNumber: order.order_number,
        email
      }
    });
    return false;
  } finally {
    logger.removeCorrelationId(correlationId);
  }
}

/**
 * Send a payment reminder email for expired payment links
 * @param order The order details
 * @param newPaymentLinkUrl The new payment link URL
 * @param email The recipient email address
 * @returns {Promise<boolean>} True if email was sent successfully
 */
export async function sendPaymentReminderEmail(
  order: Order,
  newPaymentLinkUrl: string,
  email: string
): Promise<boolean> {
  const correlationId = logger.createCorrelationId(
    String(order.id),
    order.order_number
  );
  
  try {
    logger.info('Sending payment reminder email', {
      correlationId,
      context: 'emailService.sendPaymentReminderEmail',
      data: {
        orderId: order.id,
        orderNumber: order.order_number,
        email,
        newPaymentLinkUrl
      }
    });
    
    // TODO: Implement actual email sending logic
    // For now, this is just a placeholder
    
    // In a real implementation, you would:
    // 1. Create an email template with order details
    // 2. Include the new payment link button
    // 3. Send the email using a service like SendGrid or nodemailer
    
    logger.info('Payment reminder email would be sent (placeholder)', {
      correlationId,
      context: 'emailService.sendPaymentReminderEmail',
      data: {
        orderId: order.id,
        orderNumber: order.order_number,
        email
      }
    });
    
    return true;
  } catch (error) {
    logger.error('Failed to send payment reminder email', {
      correlationId,
      context: 'emailService.sendPaymentReminderEmail',
      error,
      data: {
        orderId: order.id,
        orderNumber: order.order_number,
        email
      }
    });
    return false;
  } finally {
    logger.removeCorrelationId(correlationId);
  }
}
