/**
 * Order Payment Service
 * Handles the integration between orders and payment processing
 */

import * as logger from '../utils/logger.js';
import { OrderDetails } from '../orderService.js';
import { generatePaymentLink, updateOrderWithPaymentLink } from './paymentService.js';
import { PaymentStatus } from '../entities/Order.js';
import { sendPaymentLinkEmail } from './orderEmailService.js';

/**
 * Generate a payment link for an order and update the order with the link information
 * @param order The order details
 * @param orderId The database order ID
 * @returns {Promise<string>} The payment link URL
 */
export async function generateOrderPaymentLink(
  order: OrderDetails,
  orderId: number
): Promise<string> {
  const correlationId = logger.createCorrelationId(
    String(orderId),
    String(order.orderNumber)
  );
  
  console.log('\n=== STARTING PAYMENT LINK GENERATION ===');
  console.log(`Order ID: ${orderId}`);
  console.log(`Order Number: ${order.orderNumber}`);
  console.log(`Customer Email: ${order.customerEmail}`);
  
  try {
    logger.info('Generating payment link for order', {
      correlationId,
      context: 'orderPaymentService.generateOrderPaymentLink',
      data: {
        orderId,
        orderNumber: order.orderNumber
      }
    });
    
    // Create payment link request
    const paymentLinkRequest = {
      orderId,
      amount: order.total,
      customerEmail: order.customerEmail,
      customerName: order.customerName,
      description: `Order #${order.orderNumber} from ${order.restaurantName}`,
      metadata: {
        orderId: String(orderId),
        orderNumber: String(order.orderNumber),
        restaurantId: order.restaurantId,
        customerEmail: order.customerEmail || ''
      }
    };
    
    console.log('\n=== GENERATING PAYMENT LINK ===');
    console.log('Payment Link Request:', JSON.stringify(paymentLinkRequest, null, 2));
    
    // Generate the payment link
    const paymentLink = await generatePaymentLink(paymentLinkRequest);
    
    console.log('\n=== PAYMENT LINK GENERATED ===');
    console.log(`Payment Link ID: ${paymentLink.id}`);
    console.log(`Payment Link URL: ${paymentLink.url}`);
    console.log(`Expires At: ${new Date(paymentLink.expiresAt * 1000).toLocaleString()}`);
    
    // Update the order with the payment link information
    console.log('\n=== UPDATING ORDER WITH PAYMENT LINK ===');
    await updateOrderWithPaymentLink(orderId, paymentLink);
    console.log('Order updated successfully with payment link');

    // Send payment link email to customer
    if (order.customerEmail) {
      console.log('\n=== SENDING PAYMENT LINK EMAIL ===');
      console.log(`To: ${order.customerEmail}`);
      try {
        const emailResult = await sendPaymentLinkEmail(
          {
            id: String(orderId),
            customerName: order.customerName,
            customerEmail: order.customerEmail,
            restaurantId: order.restaurantId,
            restaurantName: order.restaurantName,
            items: order.items,
            subtotal: order.subtotal,
            tax: order.tax,
            total: order.total,
            createdAt: Date.now(),
            expiresAt: paymentLink.expiresAt,
            metadata: {}
          },
          paymentLink.url,
          paymentLink.expiresAt
        );

        if (emailResult.success) {
          console.log('✅ Payment link email sent successfully');
          console.log(`Message ID: ${emailResult.messageId}`);
          logger.info('Payment link email sent successfully', {
            correlationId,
            context: 'orderPaymentService.generateOrderPaymentLink',
            data: {
              orderId,
              orderNumber: order.orderNumber,
              customerEmail: order.customerEmail,
              messageId: emailResult.messageId
            }
          });
        } else {
          console.error('❌ Failed to send payment link email');
          console.error('Error:', emailResult.error);
          logger.warn('Failed to send payment link email', {
            correlationId,
            context: 'orderPaymentService.generateOrderPaymentLink',
            data: {
              orderId,
              orderNumber: order.orderNumber,
              customerEmail: order.customerEmail,
              error: emailResult.error
            }
          });
        }
      } catch (emailError) {
        console.error('❌ Error sending payment link email');
        console.error('Error:', emailError);
        logger.error('Error sending payment link email', {
          correlationId,
          context: 'orderPaymentService.generateOrderPaymentLink',
          error: emailError,
          data: {
            orderId,
            orderNumber: order.orderNumber,
            customerEmail: order.customerEmail
          }
        });
      }
    } else {
      console.log('\n=== SKIPPING EMAIL SEND ===');
      console.log('No customer email provided');
    }
    
    console.log('\n=== PAYMENT LINK PROCESS COMPLETED ===\n');
    logger.info('Payment link generated and order updated', {
      correlationId,
      context: 'orderPaymentService.generateOrderPaymentLink',
      data: {
        orderId,
        orderNumber: order.orderNumber,
        paymentLinkId: paymentLink.id,
        paymentLinkUrl: paymentLink.url
      }
    });
    
    return paymentLink.url;
  } catch (error) {
    console.error('\n=== PAYMENT LINK GENERATION FAILED ===');
    console.error('Error:', error);
    logger.error('Failed to generate payment link for order', {
      correlationId,
      context: 'orderPaymentService.generateOrderPaymentLink',
      error,
      data: {
        orderId,
        orderNumber: order.orderNumber
      }
    });
    throw error;
  } finally {
    logger.removeCorrelationId(correlationId);
  }
}

/**
 * Regenerate a payment link for an expired or failed order
 * @param orderId The order ID
 * @returns {Promise<string>} The new payment link URL
 */
export async function regenerateOrderPaymentLink(orderId: number): Promise<string> {
  const correlationId = logger.createCorrelationId(String(orderId));
  
  try {
    logger.info('Regenerating payment link for order', {
      correlationId,
      context: 'orderPaymentService.regenerateOrderPaymentLink',
      data: { orderId }
    });
    
    // Get the order from the database
    // This would typically involve fetching the order details
    // For now, we'll just create a placeholder for the implementation
    
    // TODO: Implement order retrieval
    // const order = await getOrderById(orderId);
    
    // For now, we'll throw an error to indicate this isn't fully implemented
    throw new Error('Payment link regeneration not yet implemented');
    
    // The full implementation would:
    // 1. Fetch the order from the database
    // 2. Check if the order needs a new payment link (expired, failed, etc.)
    // 3. Generate a new payment link
    // 4. Update the order with the new payment link
    // 5. Return the new payment link URL
    
  } catch (error) {
    logger.error('Failed to regenerate payment link for order', {
      correlationId,
      context: 'orderPaymentService.regenerateOrderPaymentLink',
      error,
      data: { orderId }
    });
    throw error;
  } finally {
    logger.removeCorrelationId(correlationId);
  }
}
