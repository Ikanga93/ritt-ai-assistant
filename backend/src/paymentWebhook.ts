// Payment Webhook Handler
// Processes Stripe webhook events for payment status updates

import http from 'http';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Import order storage and notification functions
import { getOrderByPaymentLinkId, updateOrder } from './orderStorage.js';
import { sendOrderNotificationAfterPayment } from './restaurantUtils.js';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env.local') });

// Initialize Stripe with the secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-03-31.basil' as any, // Use the correct API version
});

/**
 * Process a Stripe webhook event
 * @param event The Stripe event object
 */
async function processStripeEvent(event: Stripe.Event): Promise<void> {
  try {
    console.log(`Processing Stripe event: ${event.type}`);
    
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        
        // Get payment link ID from the session
        const paymentLinkId = session.payment_link as string;
        if (!paymentLinkId) {
          console.log('No payment link ID found in session');
          return;
        }
        
        // Find the order associated with this payment link
        const order = await getOrderByPaymentLinkId(paymentLinkId);
        if (!order) {
          console.log(`No order found for payment link ID: ${paymentLinkId}`);
          return;
        }
        
        console.log(`Payment completed for order #${order.orderNumber}`);
        
        // Get payment details
        const paymentDetails = {
          transactionId: session.id,
          timestamp: new Date().toISOString()
        };
        
        // Update order status to completed
        await updateOrder(order.orderNumber, {
          paymentStatus: 'completed',
          status: 'confirmed',
          paymentTransactionId: session.id,
          paymentTimestamp: new Date().toISOString()
        });
        
        console.log(`Order #${order.orderNumber} status updated to paid`);
        
        // Send notification to restaurant
        try {
          const notificationResult = await sendOrderNotificationAfterPayment(order.orderNumber, paymentDetails);
          console.log(`Email notification sent for order #${order.orderNumber}: ${notificationResult ? 'Success' : 'Failed'}`);
          
          // Update notification status
          await updateOrder(order.orderNumber, {
            notificationSent: true,
            paymentTimestamp: new Date().toISOString() // Use the existing field for timestamp
          });
        } catch (error) {
          console.error(`Failed to send notification for order #${order.orderNumber}:`, error);
        }
        break;
      }
      
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log(`PaymentIntent succeeded: ${paymentIntent.id}`);
        // This is a backup event in case checkout.session.completed doesn't fire
        break;
      }
      
      default:
        // Unexpected event type
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    console.error('Error processing Stripe event:', error);
  }
}

/**
 * Create a simple HTTP server to handle Stripe webhook events
 * @param port The port to listen on
 * @returns A promise that resolves to the actual port the server is listening on, or rejects with an error
 */
export function startWebhookServer(port: number = 3333): Promise<number> {
  return new Promise((resolve, reject) => {
    // Try to start the server with error handling
    try {
      const server = http.createServer(async (req, res) => {
        if (req.method === 'POST' && req.url === '/webhook') {
          // Get the Stripe signature from headers
          const sig = req.headers['stripe-signature'] as string;
          const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
          
          if (!webhookSecret) {
            console.error('Stripe webhook secret is not set');
            res.statusCode = 500;
            res.end('Webhook secret not configured');
            return;
          }
          
          // Read the request body
          let body = '';
          req.on('data', (chunk) => {
            body += chunk.toString();
          });
          
          req.on('end', async () => {
            try {
              // Verify the webhook signature
              const event = stripe.webhooks.constructEvent(
                body,
                sig,
                webhookSecret
              );
              
              // Process the event
              await processStripeEvent(event);
              
              // Return a success response
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ received: true }));
            } catch (err: any) {
              console.error(`Webhook signature verification failed: ${err.message}`);
              res.statusCode = 400;
              res.end(`Webhook Error: ${err.message}`);
            }
          });
        } else if (req.method === 'GET' && req.url === '/health') {
          // Health check endpoint
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
        } else {
          // Not found
          res.statusCode = 404;
          res.end('Not Found');
        }
      });
      
      // Handle server errors
      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`Port ${port} is already in use, webhook server will not start`);
          console.log('This is normal if you have multiple instances running');
          // Resolve with 0 to indicate server didn't start but that's ok
          resolve(0);
        } else {
          console.error('Webhook server error:', err);
          reject(err);
        }
      });
      
      // Start listening
      server.listen(port, () => {
        console.log(`Webhook server running on port ${port}`);
        console.log(`Webhook endpoint: http://localhost:${port}/webhook`);
        resolve(port);
      });
    } catch (err) {
      console.error('Failed to create webhook server:', err);
      reject(err);
    }
  });
}

// Start the server if this file is run directly
// Using import.meta.url check for ES modules instead of require.main === module
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = parseInt(process.env.WEBHOOK_PORT || '3333', 10);
  startWebhookServer(port);
}
