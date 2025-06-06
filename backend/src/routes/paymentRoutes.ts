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
  apiVersion: '2025-04-30.basil' as const
});

/**
 * Create a PaymentIntent for embedded checkout
 * 
 * POST /api/payments/create-payment-intent
 * 
 * Request Body:
 * {
 *   orderId: string,
 *   amount: number,
 *   customerEmail: string,
 *   metadata?: Record<string, string>,
 *   currency?: string
 * }
 * 
 * Response:
 * {
 *   clientSecret: string,
 *   amount: number,
 *   currency: string,
 *   status: string
 * }
 */
router.post('/create-payment-intent', async (req: Request, res: Response): Promise<void> => {
  const correlationId = logger.createCorrelationId();
  
  try {
    const { orderId, amount, customerEmail, metadata = {}, currency = 'usd' } = req.body;

    // Validate required fields
    if (!orderId || amount === undefined || !customerEmail) {
      logger.warn('Missing required fields for payment intent', {
        correlationId,
        context: 'payments.createPaymentIntent',
        data: { orderId, hasAmount: amount !== undefined, customerEmail: !!customerEmail }
      });
      res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: orderId, amount, and customerEmail are required' 
      });
      return;
    }

    // Convert amount to cents for Stripe
    const amountInCents = Math.round(amount * 100);
    
    // Create a PaymentIntent with the order amount and currency
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: currency.toLowerCase(),
      metadata: {
        orderId,
        customerEmail,
        ...metadata
      },
      // In the latest version of the API, the automatic_payment_methods parameter is optional
      automatic_payment_methods: {
        enabled: true,
      },
    });

    logger.info('Created payment intent', {
      correlationId,
      context: 'payments.createPaymentIntent',
      data: {
        paymentIntentId: paymentIntent.id,
        orderId,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status
      }
    });

    // Send publishable key and PaymentIntent details to client
    res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: paymentIntent.status,
      id: paymentIntent.id
    });
  } catch (error) {
    logger.error('Failed to create payment intent', {
      correlationId,
      context: 'payments.createPaymentIntent',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to create payment intent',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
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
 *   expirationDays?: number
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
    const expirationDays = body?.expirationDays;
    
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
    
    const orderWithPayment = await generateOrderPaymentLink({
      orderId: orderId,
      amount: orderId,
      tempOrderId: orderId,
      customerName: customerName,
      description: description || `Order from ${orderId}`,
      expirationDays: expirationDays || 2
    });
    
    // Get payment link from metadata
    const paymentLink = orderWithPayment.metadata?.paymentLink;
    
    if (!paymentLink) {
      throw new Error('Failed to generate payment link');
    }
    
    return res.status(200).json({
      success: true,
      paymentLink: paymentLink.url,
      orderId: orderWithPayment.id,
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
// Webhook handler
router.post('/webhook', async (req: Request, res: Response): Promise<void> => {
  const correlationId = logger.createCorrelationId();
  console.log('>>> Webhook endpoint /webhook hit by a POST request at', new Date().toISOString());
  console.log('>>> Request headers:', JSON.stringify(req.headers, null, 2));
  console.log('>>> Request body:', JSON.stringify(req.body, null, 2));

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim(); // Trim any whitespace
  
  // Log the webhook secret (partially masked for security)
  if (webhookSecret) {
    const maskedSecret = webhookSecret.substring(0, 4) + '...' + webhookSecret.substring(webhookSecret.length - 4);
    logger.debug('Using webhook secret', {
      correlationId,
      context: 'payments.webhook',
      data: {
        maskedSecret,
        length: webhookSecret.length
      }
    });
  } else {
    logger.error('Webhook secret not configured', {
      correlationId,
      context: 'payments.webhook'
    });
  }
  let event: Stripe.Event;
  const sig = req.headers['stripe-signature'];

  if (!webhookSecret) {
    logger.error('Webhook secret not configured', {
      correlationId,
      context: 'payments.webhook'
    });
    res.status(500).send('Webhook Error: Server configuration error (missing webhook secret).');
    return;
  }

  if (!sig) {
    logger.error('No Stripe signature found in request headers', {
      correlationId,
      context: 'payments.webhook'
    });
    res.status(400).send('Webhook Error: Missing stripe-signature header.');
    return;
  }

  try {
    // Get the raw body from the request (added by our middleware)
    const rawBody = (req as any).rawBody;
    
    if (!rawBody) {
      const errorMessage = 'Missing request body';
      logger.error(errorMessage, {
        correlationId,
        context: 'payments.webhook',
        data: {
          bodyType: typeof rawBody,
          headers: req.headers,
          url: req.url,
          method: req.method
        }
      });
      res.status(400).json({ error: errorMessage });
      return;
    }

    // Log the raw body for debugging
    logger.debug('Raw webhook body received', {
      correlationId,
      context: 'payments.webhook',
      data: {
        bodyLength: rawBody.length,
        signature: sig,
        headers: {
          'stripe-signature': sig,
          'content-type': req.headers['content-type'],
          'content-length': req.headers['content-length']
        }
      }
    });

    try {
      // Verify the webhook signature using the raw body
      // Note: Stripe's constructEvent can handle both string and Buffer
      event = stripe.webhooks.constructEvent(
        rawBody,
        sig as string,
        webhookSecret
      );
      
      console.log('>>> Webhook event constructed successfully:', {
        type: event.type,
        id: event.id,
        created: new Date(event.created * 1000).toISOString()
      });
    } catch (err: any) {
      logger.error('Webhook signature verification failed', {
        correlationId,
        context: 'payments.webhook',
        error: err.message,
        data: {
          bodyLength: rawBody.length,
          signature: sig,
          webhookSecretConfigured: !!webhookSecret,
          headers: req.headers
        }
      });
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }
    
    logger.info('Webhook signature verified', {
      correlationId,
      context: 'payments.webhook',
      data: {
        eventId: event.id,
        eventType: event.type,
        eventCreated: event.created
      }
    });
  } catch (err: any) {
    const errorMessage = `Webhook signature verification failed: ${err.message}`;
    logger.error(errorMessage, {
      correlationId,
      context: 'payments.webhook',
      error: {
        message: err.message,
        stack: err.stack
      },
      data: {
        headers: req.headers,
        signature: sig,
        webhookSecretConfigured: !!webhookSecret,
        bodyLength: (req as any).rawBody?.length || 0,
        bodyPreview: (req as any).rawBody ? (req as any).rawBody.toString('utf8').substring(0, 200) + '...' : 'No body'
      }
    });
    res.status(400).json({ error: errorMessage });
    return;
  }

  // Handle the event
  try {
    console.log('>>> Processing webhook event:', event.type);
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log('>>> Processing checkout.session.completed:', {
          sessionId: session.id,
          metadata: session.metadata,
          paymentStatus: session.payment_status,
          customerEmail: session.customer_email,
          customerDetails: session.customer_details
        });
        
        logger.info('Processing checkout.session.completed', {
          correlationId,
          context: 'payments.webhook',
          data: {
            sessionId: session.id,
            metadata: session.metadata,
            paymentStatus: session.payment_status,
            customerEmail: session.customer_email,
            customerDetails: session.customer_details
          }
        });
        
        // Look for order identifiers in metadata
        const orderNumber = session.metadata?.orderNumber;
        const tempOrderId = session.metadata?.tempOrderId;
        
        if (!orderNumber && !tempOrderId) {
          logger.warn('No order identifier found in session metadata', {
            correlationId,
            context: 'payments.webhook',
            data: {
              sessionId: session.id,
              metadata: session.metadata
            }
          });
          break;
        }

        console.log('>>> Found order identifiers:', { orderNumber, tempOrderId });

        // Process the completed checkout session
        try {
          // First, try to handle as a temporary order
          if (tempOrderId) {
            const tempOrder = temporaryOrderService.getOrder(tempOrderId);
            if (tempOrder) {
              console.log('>>> Processing temporary order payment:', tempOrderId);
              
              // Update temporary order payment status
              const updatedTempOrder = temporaryOrderService.updateOrder(tempOrderId, {
                metadata: {
                  ...tempOrder.metadata,
                  paymentStatus: 'paid',
                  paidAt: Date.now(),
                  sessionId: session.id,
                  paymentIntentId: session.payment_intent as string
                }
              });
              
              if (updatedTempOrder) {
                console.log('>>> Temporary order payment status updated to PAID:', {
                  tempOrderId,
                  orderNumber: updatedTempOrder.orderNumber,
                  sessionId: session.id
                });
                
                logger.info('Temporary order payment status updated to PAID', {
                  correlationId,
                  context: 'payments.webhook',
                  data: {
                    tempOrderId,
                    orderNumber: updatedTempOrder.orderNumber,
                    sessionId: session.id,
                    paymentIntentId: session.payment_intent,
                    paidAt: updatedTempOrder.metadata?.paidAt
                  }
                });
                
                // Move the paid order to the database
                try {
                  console.log('>>> Moving paid order to database...');
                  await temporaryOrderService.saveOrderToDatabase(updatedTempOrder);
                  
                  console.log('>>> Order successfully moved to database');
                  logger.info('Paid temporary order moved to database', {
                    correlationId,
                    context: 'payments.webhook',
                    data: {
                      tempOrderId,
                      orderNumber: updatedTempOrder.orderNumber
                    }
                  });
                } catch (dbError) {
                  console.log('>>> Failed to move order to database:', dbError);
                  logger.error('Failed to move paid order to database', {
                    correlationId,
                    context: 'payments.webhook',
                    error: dbError,
                    data: {
                      tempOrderId,
                      orderNumber: updatedTempOrder.orderNumber
                    }
                  });
                }
              }
            } else {
              console.log('>>> Temporary order not found:', tempOrderId);
              logger.warn('Temporary order not found for checkout session', {
                correlationId,
                context: 'payments.webhook',
                data: {
                  tempOrderId,
                  sessionId: session.id
                }
              });
            }
          }
          
          // Also try to handle as a database order (for backwards compatibility)
          if (orderNumber) {
            const updatedOrder = await updateOrderPaymentStatus(
              orderNumber,
              PaymentStatus.PAID,
              session.id,
              session.payment_intent as string
            );
            
            if (updatedOrder) {
              console.log('>>> Database order updated successfully:', {
                orderId: updatedOrder.id,
                orderNumber: updatedOrder.order_number,
                paymentStatus: 'PAID',
                paidAt: updatedOrder.paid_at
              });
              
              logger.info('Database order payment status updated to PAID via checkout session', {
                correlationId,
                context: 'payments.webhook',
                data: {
                  orderId: updatedOrder.id,
                  orderNumber: updatedOrder.order_number,
                  paymentStatus: 'PAID',
                  sessionId: session.id,
                  paymentIntentId: session.payment_intent,
                  paidAt: updatedOrder.paid_at
                }
              });
            }
          }
        } catch (error) {
          console.log('>>> Failed to process checkout.session.completed:', error);
          
          logger.error('Failed to process checkout.session.completed', {
            correlationId,
            context: 'payments.webhook',
            error: error instanceof Error ? error.message : 'Unknown error',
            data: {
              orderNumber,
              tempOrderId,
              sessionId: session.id,
              errorDetails: error instanceof Error ? error.toString() : 'Unknown error'
            }
          });
        }
        break;
      }
      case 'payment_intent.succeeded': {
        console.log('>>> Processing payment_intent.succeeded event');
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        logger.info('Processing payment_intent.succeeded', {
          correlationId,
          context: 'payments.webhook',
          data: {
            paymentIntentId: paymentIntent.id,
            metadata: paymentIntent.metadata,
            status: paymentIntent.status,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency
          }
        });
        
        // Check for order ID in metadata (used by embedded checkout)
        const orderId = paymentIntent.metadata?.orderId;
        // Also check for payment link ID (used by payment links)
        const paymentLinkId = paymentIntent.metadata?.payment_link_id;
        // Check for temporary order ID
        const tempOrderId = paymentIntent.metadata?.tempOrderId;
        
        const identifier = orderId || paymentLinkId || tempOrderId;
        const identifierType = orderId ? 'orderId' : paymentLinkId ? 'paymentLinkId' : 'tempOrderId';
        
        if (identifier) {
          try {
            // Handle temporary orders first
            if (identifierType === 'tempOrderId') {
              const tempOrder = temporaryOrderService.getOrder(identifier);
              if (tempOrder) {
                console.log('>>> Processing temporary order payment intent:', identifier);
                
                // Update temporary order payment status
                const updatedTempOrder = temporaryOrderService.updateOrder(identifier, {
                  metadata: {
                    ...tempOrder.metadata,
                    paymentStatus: 'paid',
                    paidAt: Date.now(),
                    paymentIntentId: paymentIntent.id
                  }
                });
                
                if (updatedTempOrder) {
                  console.log('>>> Temporary order payment status updated via payment intent:', {
                    tempOrderId: identifier,
                    orderNumber: updatedTempOrder.orderNumber,
                    paymentIntentId: paymentIntent.id
                  });
                  
                  logger.info('Temporary order payment status updated to PAID via payment intent', {
                    correlationId,
                    context: 'payments.webhook',
                    data: {
                      tempOrderId: identifier,
                      orderNumber: updatedTempOrder.orderNumber,
                      paymentIntentId: paymentIntent.id,
                      paidAt: updatedTempOrder.metadata?.paidAt
                    }
                  });
                  
                  // Move the paid order to the database
                  try {
                    console.log('>>> Moving paid order to database...');
                    await temporaryOrderService.saveOrderToDatabase(updatedTempOrder);
                    
                    console.log('>>> Order successfully moved to database');
                    logger.info('Paid temporary order moved to database via payment intent', {
                      correlationId,
                      context: 'payments.webhook',
                      data: {
                        tempOrderId: identifier,
                        orderNumber: updatedTempOrder.orderNumber
                      }
                    });
                  } catch (dbError) {
                    console.log('>>> Failed to move order to database:', dbError);
                    logger.error('Failed to move paid order to database via payment intent', {
                      correlationId,
                      context: 'payments.webhook',
                      error: dbError,
                      data: {
                        tempOrderId: identifier,
                        orderNumber: updatedTempOrder.orderNumber
                      }
                    });
                  }
                }
              } else {
                console.log('>>> Temporary order not found for payment intent:', identifier);
                logger.warn('Temporary order not found for payment intent', {
                  correlationId,
                  context: 'payments.webhook',
                  data: {
                    tempOrderId: identifier,
                    paymentIntentId: paymentIntent.id
                  }
                });
              }
            } else {
              // Handle database orders (existing logic)
              const updatedOrder = await updateOrderPaymentStatus(
                identifier,
                PaymentStatus.PAID,
                undefined, // No session ID for direct payment intents
                paymentIntent.id
              );
              
              if (updatedOrder) {
                logger.info('Database order payment status updated to PAID', {
                  correlationId,
                  context: 'payments.webhook',
                  data: {
                    orderId: updatedOrder.id,
                    orderNumber: updatedOrder.order_number,
                    [identifierType]: identifier,
                    paymentStatus: 'PAID',
                    paymentIntentId: paymentIntent.id,
                    paidAt: updatedOrder.paid_at,
                    amount: paymentIntent.amount,
                    currency: paymentIntent.currency
                  }
                });
                
                // Process all successful payments, whether from direct order or payment link
                logger.info('Processing successful payment for database order', {
                  correlationId,
                  context: 'payments.webhook',
                  data: {
                    orderId: updatedOrder.id,
                    orderNumber: updatedOrder.order_number,
                    paymentIntentId: paymentIntent.id
                  }
                });
              } else {
                logger.warn('Database order not found for payment', {
                  correlationId,
                  context: 'payments.webhook',
                  data: {
                    [identifierType]: identifier,
                    paymentIntentId: paymentIntent.id
                  }
                });
              }
            }
          } catch (error) {
            logger.error('Failed to process payment_intent.succeeded', {
              correlationId,
              context: 'payments.webhook',
              error,
              data: {
                [identifierType]: identifier,
                paymentIntentId: paymentIntent.id,
                errorStack: error instanceof Error ? error.stack : undefined
              }
            });
          }
        } else {
          logger.warn('No order identifier found in payment intent metadata', {
            correlationId,
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
          correlationId,
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
                correlationId,
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
                correlationId,
                context: 'payments.webhook',
                data: {
                  paymentLinkId
                }
              });
            }
          } catch (error) {
            logger.error('Failed to update order payment status', {
              correlationId,
              error,
              data: {
                paymentLinkId
              }
            });
          }
        } else {
          logger.warn('No payment link ID found in payment intent metadata', {
            correlationId,
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
          correlationId,
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
              correlationId,
              context: 'payments.webhook',
              data: {
                orderId: updatedOrder?.id,
                paymentStatus: updatedOrder?.metadata?.paymentStatus,
                updatedAt: new Date().toISOString()
              }
            });
          } else {
            logger.warn('Temporary order not found', {
              correlationId,
              context: 'payments.webhook',
              data: {
                orderId: tempOrderId
              }
            });
          }
        } else {
          logger.warn('No temporary order ID found in session metadata', {
            correlationId,
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
          correlationId,
          context: 'payments.webhook',
          data: {
            eventType: event.type,
            eventId: event.id
          }
        });
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.log('>>> Error processing webhook event:', error);
    
    logger.error('Error processing webhook event', {
      correlationId,
      context: 'payments.webhook',
      error,
      data: {
        eventId: event.id,
        eventType: event.type
      }
    });
    res.status(500).send('Internal server error');
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
