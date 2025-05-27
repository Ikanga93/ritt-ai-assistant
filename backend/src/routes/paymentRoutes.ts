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
// Webhook handler
router.post('/webhook', async (req: Request, res: Response): Promise<void> => {
  const correlationId = logger.createCorrelationId();
  console.log('>>> Webhook endpoint /webhook hit by a POST request at', new Date().toISOString());

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
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        logger.info('Processing checkout.session.completed', {
          correlationId,
          context: 'payments.webhook',
          data: {
            sessionId: session.id,
            metadata: session.metadata,
            paymentStatus: session.payment_status
          }
        });
        
        // Look for order number in metadata (try different possible fields)
        const orderNumber = session.metadata?.orderNumber || session.metadata?.tempOrderId;
        if (!orderNumber) {
          logger.warn('No order number found in session metadata', {
            correlationId,
            context: 'payments.webhook',
            data: {
              sessionId: session.id,
              metadata: session.metadata
            }
          });
          break;
        }

        // Process the completed checkout session
        try {
          // Update order payment status to paid
          const updatedOrder = await updateOrderPaymentStatus(
            orderNumber,
            PaymentStatus.PAID,
            session.id,
            session.payment_intent as string
          );
          
          if (updatedOrder) {
            logger.info('Order payment status updated to PAID via checkout session', {
              correlationId,
              context: 'payments.webhook',
              data: {
                orderId: updatedOrder.id,
                orderNumber: updatedOrder.orderNumber || orderNumber,
                paymentStatus: 'PAID',
                sessionId: session.id,
                paymentIntentId: session.payment_intent,
                paidAt: updatedOrder.paidAt
              }
            });
            
            // Send payment receipt email if customer email is available
            if (updatedOrder.customerEmail) {
              try {
                // Import here to avoid circular dependency
                const { sendPaymentReceiptEmail } = await import('../services/orderEmailService.js');
                
                await sendPaymentReceiptEmail(updatedOrder, updatedOrder.customerEmail);
                logger.info('Payment receipt email sent', {
                  correlationId,
                  context: 'payments.webhook',
                  data: {
                    orderId: updatedOrder.id,
                    email: updatedOrder.customerEmail
                  }
                });
              } catch (emailError) {
                logger.error('Failed to send payment receipt email', {
                  correlationId,
                  context: 'payments.webhook',
                  error: emailError,
                  data: {
                    orderId: updatedOrder.id,
                    email: updatedOrder.customerEmail
                  }
                });
              }
            }
            
            // Send order to printer
            try {
              // Get the central printer email from environment variables
              const printerEmail = process.env.CENTRAL_ORDER_EMAIL || process.env.DEFAULT_PRINTER_EMAIL;
              
              if (!printerEmail) {
                throw new Error('No printer email configured in environment variables');
              }
              
              // Import here to avoid circular dependency
              const { sendOrderToPrinter } = await import('../services/orderEmailService.js');
              
              await sendOrderToPrinter(updatedOrder, printerEmail);
              logger.info('Order sent to printer', {
                correlationId,
                context: 'payments.webhook',
                data: {
                  orderId: updatedOrder.id,
                  orderNumber: updatedOrder.orderNumber || orderNumber,
                  printerEmail
                }
              });
              
              // Explicitly move the order to the database
              try {
                // Import the entire module since movePaidOrderToDatabase is not exported directly
                const orderPaymentLinkService = await import('../services/orderPaymentLinkService.js');
                // Call the function to move the order to the database
                const moved = await orderPaymentLinkService.updateOrderPaymentStatus(
                  updatedOrder.id,
                  PaymentStatus.PAID,
                  session.id,
                  session.payment_intent as string
                );
                
                if (moved) {
                  logger.info('Order successfully moved to database from webhook handler', {
                    correlationId,
                    context: 'payments.webhook',
                    data: {
                      orderId: updatedOrder.id,
                      orderNumber: updatedOrder.orderNumber || orderNumber
                    }
                  });
                } else {
                  logger.warn('Failed to move order to database from webhook handler', {
                    correlationId,
                    context: 'payments.webhook',
                    data: {
                      orderId: updatedOrder.id,
                      orderNumber: updatedOrder.orderNumber || orderNumber
                    }
                  });
                }
              } catch (dbError) {
                logger.error('Error moving order to database from webhook handler', {
                  correlationId,
                  context: 'payments.webhook',
                  error: dbError,
                  data: {
                    orderId: updatedOrder.id,
                    orderNumber: updatedOrder.orderNumber || orderNumber
                  }
                });
              }
            } catch (printerError) {
              logger.error('Failed to send order to printer', {
                correlationId,
                context: 'payments.webhook',
                error: printerError,
                data: {
                  orderId: updatedOrder.id,
                  orderNumber: updatedOrder.orderNumber || orderNumber
                }
              });
            }
          } else {
            logger.warn('Order not found for checkout session', {
              correlationId,
              context: 'payments.webhook',
              data: {
                orderNumber,
                sessionId: session.id
              }
            });
          }
        } catch (error) {
          logger.error('Failed to process checkout.session.completed', {
            correlationId,
            context: 'payments.webhook',
            error: error instanceof Error ? error.message : 'Unknown error',
            data: {
              orderNumber,
              sessionId: session.id,
              errorDetails: error instanceof Error ? error.toString() : 'Unknown error'
            }
          });
        }
        break;
      }
      case 'payment_intent.succeeded': {
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
        
        const identifier = orderId || paymentLinkId;
        const identifierType = orderId ? 'orderId' : 'paymentLinkId';
        
        if (identifier) {
          try {
            // Update order payment status to paid
            const updatedOrder = await updateOrderPaymentStatus(
              identifier,
              PaymentStatus.PAID,
              undefined, // No session ID for direct payment intents
              paymentIntent.id
            );
            
            if (updatedOrder) {
              logger.info('Order payment status updated to PAID', {
                correlationId,
                context: 'payments.webhook',
                data: {
                  orderId: updatedOrder.id,
                  orderNumber: updatedOrder.orderNumber,
                  [identifierType]: identifier,
                  paymentStatus: 'PAID',
                  paymentIntentId: paymentIntent.id,
                  paidAt: updatedOrder.paidAt,
                  amount: paymentIntent.amount,
                  currency: paymentIntent.currency
                }
              });
              
              // Check if this was a new order (not from a payment link)
              if (orderId) {
                logger.info('Processing successful payment for order', {
                  correlationId,
                  context: 'payments.webhook',
                  data: {
                    orderId: updatedOrder.id,
                    orderNumber: updatedOrder.orderNumber,
                    paymentIntentId: paymentIntent.id
                  }
                });
                
                // Here you could add additional logic for orders that were just paid
                // For example, sending order confirmation emails, etc.
              }
            } else {
              logger.warn('Order not found for payment', {
                correlationId,
                context: 'payments.webhook',
                data: {
                  [identifierType]: identifier,
                  paymentIntentId: paymentIntent.id
                }
              });
            }
          } catch (error) {
            logger.error('Failed to update order payment status', {
              correlationId,
              error: error instanceof Error ? error.message : 'Unknown error',
              data: {
                [identifierType]: identifier,
                paymentIntentId: paymentIntent.id,
                errorDetails: error instanceof Error ? error.toString() : 'Unknown error'
              }
            });
          }
        } else {
          logger.warn('No order ID or payment link ID found in payment intent metadata', {
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
