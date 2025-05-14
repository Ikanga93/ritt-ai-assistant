/**
 * Payment Routes
 * 
 * API endpoints for payment link generation and webhook handling
 */

import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import * as logger from '../utils/logger.js';
import { PaymentStatus } from '../entities/Order.js';
import { generateOrderPaymentLink, regenerateOrderPaymentLink, updateOrderPaymentStatus } from '../services/orderPaymentLinkService.js';
import { temporaryOrderService } from '../services/temporaryOrderService.js';

const router = express.Router();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-03-31.basil'
});

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
 * POST /api/payments/
 * 
 * Handles Stripe payment events
 */
// Webhook handler
router.post('/', express.raw({type: 'application/json'}), async (req: Request, res: Response): Promise<void> => {
  console.log('>>> Webhook endpoint / hit by a POST request at', new Date().toISOString());
  const sig = req.headers['stripe-signature'] as string;

  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!endpointSecret) {
    console.error(' STRIPE_WEBHOOK_SECRET is not set in environment variables.');
    // It's crucial that this secret is configured for signature verification.
    // Sending a 500 to indicate a server-side configuration issue.
    res.status(500).send('Webhook Error: Server configuration error (missing webhook secret).');
    return;
  }

  if (!sig) {
    console.error(' Missing stripe-signature header. Stripe SDK cannot verify the event.');
    res.status(400).send('Webhook Error: Missing stripe-signature header.');
    return;
  }

  let event: Stripe.Event;

  try {
    // The req.body needs to be the raw buffer from express.raw()
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    console.log(' Webhook signature verified. Event ID:', event.id, 'Event Type:', event.type);
  } catch (err: any) {
    console.error(' Webhook signature verification failed:', err.message);
    // Log information about the body to help debug if it's not raw
    console.error('Raw request body type:', typeof req.body, 'Is Buffer?', Buffer.isBuffer(req.body)); 
    console.error('Raw request body content (first 200 chars):', String(req.body).substring(0,200)); 
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  console.log('Webhook received:', event.id, 'Type:', event.type);

  // Log the raw request body for debugging
  console.log('Raw webhook request body:', JSON.stringify(req.body, null, 2));
  
  logger.info('Received webhook request', {
    context: 'payments.webhook',
    data: {
      headers: req.headers,
      hasBody: !!req.body,
      bodyType: typeof req.body,
      rawBody: req.body // Log the raw body
    }
  });

  // Check if the object has metadata
  const hasMetadata = 'metadata' in event.data.object;
  
  logger.info('Webhook signature verified', {
    context: 'payments.webhook',
    data: {
      eventId: event.id,
      eventType: event.type,
      eventCreated: event.created,
      eventData: event.data.object,
      metadata: hasMetadata ? (event.data.object as any).metadata : undefined
    }
  });
  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log('Processing checkout.session.completed:', JSON.stringify(session, null, 2));
      
      logger.info('Processing checkout.session.completed', {
        context: 'payments.webhook',
        data: {
          sessionId: session.id,
          metadata: session.metadata,
          paymentStatus: session.payment_status
        }
      });
      
      console.log('Webhook Session:', {
        id: session.id,
        metadata: session.metadata,
        customer: session.customer,
        paymentStatus: session.payment_status,
        amount: session.amount_total
      });

      // Look for order number in metadata (try different possible fields)
      const orderNumber = session.metadata?.orderNumber || session.metadata?.tempOrderId;
      console.log('Order Number from metadata:', orderNumber, 'Full metadata:', session.metadata);
      
      if (orderNumber) {
        try {
          // Update order payment status to paid
          const updatedOrder = await updateOrderPaymentStatus(
            orderNumber,
            PaymentStatus.PAID,
            session.id,
            session.payment_intent as string
          );
          
          if (updatedOrder) {
            logger.info('Order payment status updated to PAID', {
              context: 'payments.webhook',
              data: {
                orderId: updatedOrder.id,
                orderNumber,
                paymentStatus: 'PAID',
                paidAt: updatedOrder.paidAt
              }
            });
          } else {
            logger.warn('Order not found for order number', {
              context: 'payments.webhook',
              data: {
                orderNumber
              }
            });
          }
        } catch (error) {
          logger.error('Failed to update order payment status', {
            context: 'payments.webhook',
            error,
            data: {
              orderNumber
            }
          });
        }
      } else {
        logger.warn('No order number found in session metadata', {
          context: 'payments.webhook',
          data: {
            sessionId: session.id,
            metadata: session.metadata
          }
        });
      }
      break;
    }
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      logger.info('Processing payment_intent.succeeded', {
        context: 'payments.webhook',
        data: {
          paymentIntentId: paymentIntent.id,
          metadata: paymentIntent.metadata,
          status: paymentIntent.status
        }
      });
      
      // For payment intents created through payment links, find the payment link ID
      const paymentLinkId = paymentIntent.metadata?.payment_link_id;
      if (paymentLinkId) {
        try {
          // Update order payment status to paid
          const updatedOrder = await updateOrderPaymentStatus(
            paymentLinkId,
            PaymentStatus.PAID
          );
          
          if (updatedOrder) {
            logger.info('Order payment status updated to PAID', {
              context: 'payments.webhook',
              data: {
                orderId: updatedOrder.id,
                paymentLinkId,
                paymentStatus: 'PAID',
                paidAt: updatedOrder.paidAt
              }
            });
          } else {
            logger.warn('Order not found for payment link', {
              context: 'payments.webhook',
              data: {
                paymentLinkId
              }
            });
          }
        } catch (error) {
          logger.error('Failed to update order payment status', {
            context: 'payments.webhook',
            error,
            data: {
              paymentLinkId
            }
          });
        }
      } else {
        logger.warn('No payment link ID found in payment intent metadata', {
          context: 'payments.webhook',
          data: {
            paymentIntentId: paymentIntent.id,
            metadata: paymentIntent.metadata
          }
        });
      }
      break;
    }
    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      logger.info('Processing payment_intent.payment_failed', {
        context: 'payments.webhook',
        data: {
          paymentIntentId: paymentIntent.id,
          metadata: paymentIntent.metadata,
          status: paymentIntent.status,
          lastPaymentError: paymentIntent.last_payment_error
        }
      });
      
      // For payment intents created through payment links, find the payment link ID
      const paymentLinkId = paymentIntent.metadata?.payment_link_id;
      if (paymentLinkId) {
        try {
          // Update order payment status to failed
          const updatedOrder = await updateOrderPaymentStatus(
            paymentLinkId,
            PaymentStatus.FAILED
          );
          
          if (updatedOrder) {
            logger.info('Order payment status updated to FAILED', {
              context: 'payments.webhook',
              data: {
                orderId: updatedOrder.id,
                paymentLinkId,
                paymentStatus: 'FAILED',
                error: paymentIntent.last_payment_error?.message
              }
            });
          } else {
            logger.warn('Order not found for payment link', {
              context: 'payments.webhook',
              data: {
                paymentLinkId
              }
            });
          }
        } catch (error) {
          logger.error('Failed to update order payment status', {
            context: 'payments.webhook',
            error,
            data: {
              paymentLinkId
            }
          });
        }
      } else {
        logger.warn('No payment link ID found in payment intent metadata', {
          context: 'payments.webhook',
          data: {
            paymentIntentId: paymentIntent.id,
            metadata: paymentIntent.metadata
          }
        });
      }
      break;
    }
    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session;
      logger.info('Processing checkout.session.expired', {
        context: 'payments.webhook',
        data: {
          sessionId: session.id,
          metadata: session.metadata,
          expiresAt: session.expires_at
        }
      });
      // Look for temporary order ID in metadata
      const tempOrderId = session.metadata?.tempOrderId || session.metadata?.orderId;
      if (tempOrderId) {
        const tempOrder = temporaryOrderService.getOrder(tempOrderId);
        if (tempOrder) {
          const updatedOrder = temporaryOrderService.updateOrder(tempOrderId, {
            metadata: {
              ...tempOrder.metadata,
              paymentStatus: 'expired',
              expiredAt: new Date().toISOString()
            }
          });
          logger.info('Temporary order payment status updated', {
            context: 'payments.webhook',
            data: {
              orderId: updatedOrder?.id,
              paymentStatus: updatedOrder?.metadata?.paymentStatus,
              updatedAt: new Date().toISOString()
            }
          });
        } else {
          logger.warn('Temporary order not found', {
            context: 'payments.webhook',
            data: {
              orderId: tempOrderId
            }
          });
        }
      } else {
        logger.warn('No temporary order ID found in session metadata', {
          context: 'payments.webhook',
          data: {
            sessionId: session.id,
            metadata: session.metadata
          }
        });
      }
      break;
    }
    default: {
      logger.info('Unhandled webhook event type', {
        context: 'payments.webhook',
        data: {
          eventType: event.type,
          eventId: event.id
        }
      });
    }
  }

  res.json({ received: true });
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
