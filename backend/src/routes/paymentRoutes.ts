/**
 * Payment Routes
 * 
 * API endpoints for payment link generation and webhook handling
 */

import express, { Request, Response } from 'express';
import * as logger from '../utils/logger.js';
import { generateOrderPaymentLink, regenerateOrderPaymentLink, updateOrderPaymentStatus } from '../services/orderPaymentLinkService.js';
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
// @ts-ignore - Express router type issues
router.post('/generate-link', async (req: any, res: Response) => {
  const correlationId = logger.createCorrelationId();
  
  try {
    // Safely access body properties with type assertion
    const body = req.body as any;
    const orderId = body?.orderId;
    const customerEmail = body?.customerEmail;
    const customerName = body?.customerName;
    const description = body?.description;
    const expirationHours = body?.expirationHours;
    
    // Validate required fields
    if (!orderId || !customerEmail) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: orderId, customerEmail'
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
      error: error instanceof Error ? error.message : 'Failed to generate payment link'
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
// @ts-ignore - Express router type issues
router.post('/webhook', express.raw({ type: 'application/json' }), async (req: any, res: Response) => {
  const correlationId = logger.createCorrelationId();
  
  try {
    // Get the signature from the headers with type safety
    const signature = req.headers['stripe-signature'] as string | string[] | undefined;
    
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
    
    // Convert req.body to string if it's a buffer
    const payload = req.body instanceof Buffer ? req.body.toString('utf8') : (req.body as string);
    
    // Verify the webhook signature
    const event = verifyWebhookSignature(payload, Array.isArray(signature) ? signature[0] : signature);
    
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
            typeof paymentLinkId === 'string' ? paymentLinkId : paymentLinkId.id,
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
      
      case 'checkout.session.expired': {
        const session = event.data.object;
        const paymentLinkId = session.id;
        
        // Get the order ID from the session metadata
        const orderId = session.metadata?.orderId;
        
        if (orderId) {
          // Generate a new payment link for the expired order
          const newPaymentLink = await regenerateOrderPaymentLink(orderId);
          
          // Update order payment status to expired
          const updatedOrder = await updateOrderPaymentStatus(
            paymentLinkId,
            'expired'
          );
          
          if (updatedOrder) {
            logger.info('New payment link generated for expired order', {
              correlationId,
              context: 'paymentRoutes.webhook',
              data: {
                orderId,
                oldPaymentLinkId: paymentLinkId,
                newPaymentLinkId: newPaymentLink?.paymentLink?.id || 'unknown'
              }
            });
          }
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
      error: error instanceof Error ? error.message : 'Failed to process webhook'
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
// @ts-ignore - Express router type issues
// @ts-ignore - Express router type issues
router.get('/status/:orderId', async (req: any, res: Response) => {
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
      error: error instanceof Error ? error.message : 'Failed to get payment status'
    });
  } finally {
    logger.removeCorrelationId(correlationId);
  }
});

export default router;
