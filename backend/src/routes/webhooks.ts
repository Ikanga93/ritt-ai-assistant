/**
 * Webhook Routes
 * Handles incoming webhook events from Stripe and SendGrid
 */

import express from 'express';
import { Request, Response } from 'express';
import { verifyWebhookSignature, updateOrderPaymentStatus } from '../services/paymentService.js';
import { PaymentStatus } from '../entities/Order.js';
import * as logger from '../utils/logger.js';
import * as emailService from '../services/emailService.js';
import { updateEmailDeliveryStatus } from '../services/emailService.js';
import { sendPaymentReceiptEmail } from '../services/orderEmailService.js';

const router = express.Router();

/**
 * Raw body parser middleware for Stripe webhooks
 * Stripe requires the raw request body for signature verification
 */
const rawBodyParser = (req: Request, res: Response, next: () => void) => {
  let data = '';
  req.setEncoding('utf8');

  req.on('data', (chunk) => {
    data += chunk;
  });

  req.on('end', () => {
    req.body = data;
    next();
  });
};

/**
 * Stripe webhook endpoint
 * Receives and processes webhook events from Stripe
 */
router.post('/stripe', rawBodyParser, async (req: Request, res: Response) => {
  const signature = req.headers['stripe-signature'] as string;
  const payload = req.body;

  // Create a correlation ID for tracking this webhook event
  const correlationId = logger.createCorrelationId();

  try {
    // Verify the webhook signature
    if (!signature) {
      logger.error('Missing Stripe signature header', { correlationId, context: 'webhooks.stripe' });
      res.status(400).send('Missing signature header');
      return;
    }

    // Verify the webhook signature and parse the event
    const event = verifyWebhookSignature(payload, signature);

    logger.info('Received Stripe webhook event', {
      correlationId,
      context: 'webhooks.stripe',
      data: {
        eventId: event.id,
        eventType: event.type
      }
    });

    // Process different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        
        // Extract order information from the session metadata
        const orderId = session.metadata?.orderId;
        const customerEmail = session.customer_email || session.metadata?.customerEmail;
        
        if (!orderId) {
          logger.error('Missing orderId in session metadata', {
            correlationId,
            context: 'webhooks.stripe',
            data: { sessionId: session.id }
          });
          break;
        }

        logger.info('Payment completed for order', {
          correlationId,
          context: 'webhooks.stripe',
          data: {
            orderId,
            sessionId: session.id,
            paymentStatus: session.payment_status,
            customerEmail
          }
        });

        try {
          // Update order status to PAID
          const updatedOrder = await updateOrderPaymentStatus(
            session.id,
            PaymentStatus.PAID,
            new Date()
          );
          
          if (updatedOrder) {
            logger.info('Order payment status updated to PAID', {
              correlationId,
              context: 'webhooks.stripe',
              data: {
                orderId: updatedOrder.id,
                orderNumber: updatedOrder.order_number,
                paymentStatus: updatedOrder.payment_status
              }
            });
            
            // Send payment receipt email to customer if email is available
            if (customerEmail) {
              try {
                const emailResult = await sendPaymentReceiptEmail(updatedOrder, session.id);
                
                if (emailResult.success) {
                  logger.info('Payment receipt email sent successfully', {
                    correlationId,
                    context: 'webhooks.stripe',
                    data: {
                      orderId: updatedOrder.id,
                      orderNumber: updatedOrder.order_number,
                      customerEmail,
                      messageId: emailResult.messageId
                    }
                  });
                } else {
                  logger.error('Failed to send payment receipt email', {
                    correlationId,
                    context: 'webhooks.stripe',
                    error: emailResult.error,
                    data: {
                      orderId: updatedOrder.id,
                      customerEmail
                    }
                  });
                }
              } catch (emailError) {
                logger.error('Failed to send payment receipt email', {
                  correlationId,
                  context: 'webhooks.stripe',
                  error: emailError,
                  data: {
                    orderId: updatedOrder.id,
                    customerEmail
                  }
                });
              }
            }
            
            // TODO: Notify restaurant about the new paid order
          } else {
            logger.warn('No order found with payment link ID', {
              correlationId,
              context: 'webhooks.stripe',
              data: {
                sessionId: session.id,
                orderId
              }
            });
          }
        } catch (error) {
          logger.error('Failed to process payment completion', {
            correlationId,
            context: 'webhooks.stripe',
            error,
            data: {
              sessionId: session.id,
              orderId
            }
          });
        }

        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object;
        const orderId = session.metadata?.orderId;
        const customerEmail = session.customer_email || session.metadata?.customerEmail;

        if (!orderId) {
          logger.error('Missing orderId in session metadata', {
            correlationId,
            context: 'webhooks.stripe',
            data: { sessionId: session.id }
          });
          break;
        }

        logger.info('Payment link expired for order', {
          correlationId,
          context: 'webhooks.stripe',
          data: {
            orderId,
            sessionId: session.id,
            customerEmail
          }
        });

        try {
          // Update order status to EXPIRED
          const updatedOrder = await updateOrderPaymentStatus(
            session.id,
            PaymentStatus.EXPIRED
          );
          
          if (updatedOrder) {
            logger.info('Order payment status updated to EXPIRED', {
              correlationId,
              context: 'webhooks.stripe',
              data: {
                orderId: updatedOrder.id,
                orderNumber: updatedOrder.order_number,
                paymentStatus: updatedOrder.payment_status
              }
            });
            
            // TODO: Optionally generate a new payment link
            // TODO: Send reminder email to customer
          } else {
            logger.warn('No order found with payment link ID', {
              correlationId,
              context: 'webhooks.stripe',
              data: {
                sessionId: session.id,
                orderId
              }
            });
          }
        } catch (error) {
          logger.error('Failed to process payment link expiration', {
            correlationId,
            context: 'webhooks.stripe',
            error,
            data: {
              sessionId: session.id,
              orderId
            }
          });
        }

        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        
        logger.info('Payment intent succeeded', {
          correlationId,
          context: 'webhooks.stripe',
          data: {
            paymentIntentId: paymentIntent.id,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency
          }
        });

        // TODO: Capture payment details
        // TODO: Update payment records

        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object;
        const error = paymentIntent.last_payment_error;
        
        logger.error('Payment intent failed', {
          correlationId,
          context: 'webhooks.stripe',
          data: {
            paymentIntentId: paymentIntent.id,
            errorType: error?.type,
            errorMessage: error?.message
          }
        });

        // Find the checkout session associated with this payment intent
        // Note: In a real implementation, you would need to query Stripe for the session
        // or store a mapping between payment intents and sessions
        const sessionId = paymentIntent.metadata?.checkout_session_id;
        
        if (sessionId) {
          try {
            // Update order status to FAILED
            const updatedOrder = await updateOrderPaymentStatus(
              sessionId,
              PaymentStatus.FAILED
            );
            
            if (updatedOrder) {
              logger.info('Order payment status updated to FAILED', {
                correlationId,
                context: 'webhooks.stripe',
                data: {
                  orderId: updatedOrder.id,
                  orderNumber: updatedOrder.order_number,
                  paymentStatus: updatedOrder.payment_status,
                  errorType: error?.type,
                  errorMessage: error?.message
                }
              });
              
              // TODO: Notify customer about failed payment
            }
          } catch (updateError) {
            logger.error('Failed to update order payment status', {
              correlationId,
              context: 'webhooks.stripe',
              error: updateError,
              data: {
                paymentIntentId: paymentIntent.id,
                sessionId
              }
            });
          }
        } else {
          logger.warn('No session ID found for failed payment intent', {
            correlationId,
            context: 'webhooks.stripe',
            data: {
              paymentIntentId: paymentIntent.id
            }
          });
        }

        break;
      }

      default:
        logger.info('Unhandled event type', {
          correlationId,
          context: 'webhooks.stripe',
          data: { eventType: event.type }
        });
    }

    // Return a 200 response to acknowledge receipt of the event
    res.status(200).send({ received: true });
    return;
  } catch (error: any) {
    logger.error('Error processing webhook', {
      correlationId,
      context: 'webhooks.stripe',
      error
    });

    // Return a 400 error if signature verification fails
    res.status(400).send(`Webhook Error: ${error.message}`);
    return;
  } finally {
    // Remove the correlation ID from active tracking
    logger.removeCorrelationId(correlationId);
  }
});

/**
 * SendGrid webhook endpoint
 * Receives and processes email event webhooks from SendGrid
 * Documentation: https://docs.sendgrid.com/for-developers/tracking-events/event
 */
router.post('/sendgrid', express.json(), async (req: Request, res: Response) => {
  // Create a correlation ID for tracking this webhook event
  const correlationId = logger.createCorrelationId();
  
  try {
    // SendGrid sends an array of event objects
    const events = req.body;
    
    if (!Array.isArray(events)) {
      logger.error('Invalid SendGrid webhook payload', { 
        correlationId, 
        context: 'webhooks.sendgrid',
        data: { body: typeof req.body }
      });
      return res.status(400).send('Invalid event payload');
    }
    
    logger.info(`Processing ${events.length} SendGrid events`, {
      correlationId,
      context: 'webhooks.sendgrid'
    });
    
    // Process each event in the payload
    for (const event of events) {
      // Extract the message ID and event type
      const messageId = event.sg_message_id;
      const eventType = event.event;
      const email = event.email;
      const timestamp = event.timestamp ? new Date(event.timestamp * 1000).getTime() : Date.now();
      
      if (!messageId || !eventType) {
        logger.warn('Missing required fields in SendGrid event', {
          correlationId,
          context: 'webhooks.sendgrid',
          data: { event }
        });
        continue;
      }
      
      logger.info('Processing SendGrid event', {
        correlationId,
        context: 'webhooks.sendgrid',
        data: {
          messageId,
          eventType,
          email,
          timestamp: new Date(timestamp).toISOString()
        }
      });
      
      // Map SendGrid event types to our email status types
      let status: emailService.EmailStatus;
      switch (eventType) {
        case 'delivered':
          status = 'delivered';
          break;
        case 'open':
          status = 'opened';
          break;
        case 'click':
          status = 'clicked';
          break;
        case 'bounce':
        case 'blocked':
        case 'dropped':
          status = 'bounced';
          break;
        case 'deferred':
        case 'spamreport':
          status = 'failed';
          break;
        default:
          logger.warn('Unhandled SendGrid event type', {
            correlationId,
            context: 'webhooks.sendgrid',
            data: { eventType }
          });
          continue;
      }
      
      // Update the email delivery status in our system
      try {
        await updateEmailDeliveryStatus(messageId, status, timestamp, event.reason);
        
        logger.info('Email status updated', {
          correlationId,
          context: 'webhooks.sendgrid',
          data: {
            messageId,
            status,
            email
          }
        });
      } catch (error) {
        logger.error('Failed to update email status', {
          correlationId,
          context: 'webhooks.sendgrid',
          error,
          data: {
            messageId,
            status,
            email
          }
        });
      }
    }
    
    // Return a 200 response to acknowledge receipt of the events
    return res.status(200).send({ received: true });
  } catch (error) {
    logger.error('Error processing SendGrid webhook', {
      correlationId,
      context: 'webhooks.sendgrid',
      error
    });
    
    return res.status(500).send('Internal server error');
  } finally {
    // Remove the correlation ID from active tracking
    logger.removeCorrelationId(correlationId);
  }
});

export default router;
