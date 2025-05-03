/**
 * Payment Routes
 * 
 * API endpoints for payment link generation and webhook handling
 */

import express from 'express';
import * as logger from '../utils/logger.js';
import { generateOrderPaymentLink, updateOrderPaymentStatus } from '../services/orderPaymentLinkService.js';
import { verifyWebhookSignature } from '../services/paymentService.js';

const router = express.Router();

/**
 * Generate a payment link for an order
 * 
 * POST /api/payments/generate-link
 * 
 * Request Body:
 * {
 *   orderId: string,
 *   customerEmail: string,
 *   customerName?: string,
 *   description?: string,
 *   expirationHours?: number
 * }
 * 
 * Response:
 * {
 *   success: boolean,
 *   paymentLink?: string,
 *   orderId?: string,
 *   expiresAt?: number,
 *   error?: string
 * }
 */
router.post('/generate-link', async (req, res) => {
  const correlationId = logger.createCorrelationId();
  
  try {
    const { orderId, customerEmail, customerName, description, expirationHours } = req.body;
    
    if (!orderId || !customerEmail) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: orderId and customerEmail are required'
      });
    }
    
    logger.info('Generating payment link for order', {
      correlationId,
      context: 'paymentRoutes.generateLink',
      data: { orderId, customerEmail }
    });
    
    const result = await generateOrderPaymentLink({
      orderId,
      customerEmail,
      customerName,
      description,
      expirationHours
    });
    
    // Get payment link from metadata
    const paymentLink = result.metadata?.paymentLink;
    
    if (!paymentLink) {
      throw new Error('Failed to generate payment link');
    }
    
    return res.status(200).json({
      success: true,
      paymentLink: paymentLink.url,
      orderId: result.id,
      expiresAt: paymentLink.expiresAt
    });
  } catch (error) {
    logger.error('Error generating payment link', {
      correlationId,
      context: 'paymentRoutes.generateLink',
      error
    });
    
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate payment link'
    });
  } finally {
    logger.removeCorrelationId(correlationId);
  }
});

/**
 * Stripe webhook handler
 * 
 * POST /api/payments/webhook
 * 
 * Handles Stripe payment events
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const correlationId = logger.createCorrelationId();
  
  try {
    // Get the signature from headers
    const signature = req.headers['stripe-signature'];
    
    if (!signature) {
      logger.warn('Missing Stripe signature', {
        correlationId,
        context: 'paymentRoutes.webhook'
      });
      
      return res.status(400).json({
        success: false,
        error: 'Missing Stripe signature'
      });
    }
    
    // Verify the webhook signature
    const event = verifyWebhookSignature(req.body, signature);
    
    logger.info('Received Stripe webhook event', {
      correlationId,
      context: 'paymentRoutes.webhook',
      data: {
        eventId: event.id,
        eventType: event.type
      }
    });
    
    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        
        // Extract payment link ID from the session
        const paymentLinkId = session.payment_link;
        
        if (paymentLinkId) {
          // Update order payment status to paid
          const updatedOrder = await updateOrderPaymentStatus(
            paymentLinkId,
            'paid'
          );
          
          if (updatedOrder) {
            logger.info('Order payment completed', {
              correlationId,
              context: 'paymentRoutes.webhook',
              data: {
                orderId: updatedOrder.id,
                paymentLinkId
              }
            });
          } else {
            logger.warn('Order not found for payment link', {
              correlationId,
              context: 'paymentRoutes.webhook',
              data: { paymentLinkId }
            });
          }
        }
        break;
      }
      
      case 'payment_link.expired': {
        const paymentLink = event.data.object;
        
        // Update order payment status to expired
        const updatedOrder = await updateOrderPaymentStatus(
          paymentLink.id,
          'expired'
        );
        
        if (updatedOrder) {
          logger.info('Payment link expired', {
            correlationId,
            context: 'paymentRoutes.webhook',
            data: {
              orderId: updatedOrder.id,
              paymentLinkId: paymentLink.id
            }
          });
        }
        break;
      }
      
      // Add more event handlers as needed
      
      default:
        logger.info('Unhandled Stripe event type', {
          correlationId,
          context: 'paymentRoutes.webhook',
          data: { eventType: event.type }
        });
    }
    
    // Return a 200 response to acknowledge receipt of the event
    res.status(200).json({ received: true });
  } catch (error) {
    logger.error('Error processing Stripe webhook', {
      correlationId,
      context: 'paymentRoutes.webhook',
      error
    });
    
    return res.status(400).json({
      success: false,
      error: error.message || 'Failed to process webhook'
    });
  } finally {
    logger.removeCorrelationId(correlationId);
  }
});

/**
 * Get payment status for an order
 * 
 * GET /api/payments/status/:orderId
 * 
 * Response:
 * {
 *   success: boolean,
 *   orderId?: string,
 *   paymentStatus?: string,
 *   paymentLink?: string,
 *   error?: string
 * }
 */
router.get('/status/:orderId', async (req, res) => {
  const correlationId = logger.createCorrelationId();
  const { orderId } = req.params;
  
  try {
    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'Order ID is required'
      });
    }
    
    // Import here to avoid circular dependency
    const { getOrderWithPayment } = await import('../services/orderPaymentLinkService.js');
    
    const order = getOrderWithPayment(orderId);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        error: `Order not found: ${orderId}`
      });
    }
    
    // Get payment metadata
    const paymentMetadata = order.metadata || {};
    
    return res.status(200).json({
      success: true,
      orderId: order.id,
      paymentStatus: paymentMetadata.paymentStatus || 'unknown',
      paymentLink: paymentMetadata.paymentLink?.url,
      expiresAt: paymentMetadata.paymentLink?.expiresAt
    });
  } catch (error) {
    logger.error('Error getting payment status', {
      correlationId,
      context: 'paymentRoutes.getStatus',
      error,
      data: { orderId }
    });
    
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get payment status'
    });
  } finally {
    logger.removeCorrelationId(correlationId);
  }
});

export default router;
