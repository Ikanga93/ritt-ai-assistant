/**
 * Payment Service for Ritt Drive-Thru
 * Handles Stripe integration for payment links and processing
 */

import Stripe from 'stripe';
import * as logger from '../utils/logger.js';
import { AppDataSource } from '../database.js';
import { Order, PaymentStatus } from '../entities/Order.js';

// Initialize Stripe with API key from environment variables
const stripeApiKey = process.env.STRIPE_SECRET_KEY || '';
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

// Payment link configuration
const paymentLinkExpirationDays = parseInt(process.env.STRIPE_PAYMENT_LINK_EXPIRATION_DAYS || '7', 10);
const defaultCurrency = process.env.STRIPE_PAYMENT_LINK_DEFAULT_CURRENCY || 'usd';

// Initialize Stripe client
const stripe = new Stripe(stripeApiKey, {
  apiVersion: '2023-10-16' as Stripe.LatestApiVersion, // Use a stable API version
});

/**
 * Verify that Stripe is properly configured
 * @returns {Promise<boolean>} True if Stripe is configured, false otherwise
 */
export async function verifyStripeConfiguration(): Promise<boolean> {
  try {
    if (!stripeApiKey) {
      logger.error('Stripe API key is not configured', {
        context: 'paymentService.verifyStripeConfiguration'
      });
      return false;
    }

    // Test the Stripe connection by fetching account details
    const account = await stripe.accounts.retrieve();
    logger.info('Stripe configuration verified successfully', {
      context: 'paymentService.verifyStripeConfiguration',
      data: {
        accountId: account.id,
        businessType: account.business_type,
        chargesEnabled: account.charges_enabled
      }
    });
    
    return true;
  } catch (error) {
    logger.error('Failed to verify Stripe configuration', {
      context: 'paymentService.verifyStripeConfiguration',
      error
    });
    return false;
  }
}

/**
 * Verify a Stripe webhook signature
 * @param payload The raw request body from the webhook
 * @param signature The Stripe-Signature header
 * @returns {Stripe.Event} The verified Stripe event
 * @throws {Error} If verification fails
 */
export function verifyWebhookSignature(payload: string, signature: string): Stripe.Event {
  try {
    if (!stripeWebhookSecret) {
      throw new Error('Stripe webhook secret is not configured');
    }

    // Verify the webhook signature
    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      stripeWebhookSecret
    );

    logger.info('Webhook signature verified successfully', {
      context: 'paymentService.verifyWebhookSignature',
      data: {
        eventId: event.id,
        eventType: event.type
      }
    });

    return event;
  } catch (error) {
    logger.error('Webhook signature verification failed', {
      context: 'paymentService.verifyWebhookSignature',
      error
    });
    throw error;
  }
}

/**
 * Interface for payment link request parameters
 */
export interface PaymentLinkRequest {
  orderId: number;
  amount: number;
  customerEmail: string;
  customerName?: string;
  description?: string;
  metadata?: Record<string, string>;
  expirationDays?: number;
}

/**
 * Interface for payment link response
 */
export interface PaymentLinkResponse {
  id: string;
  url: string;
  expiresAt: number;
  metadata: Record<string, string>;
}

/**
 * Generate a payment link for an order
 * @param params Payment link parameters
 * @returns {Promise<PaymentLinkResponse>} The generated payment link
 */
export async function generatePaymentLink(
  params: PaymentLinkRequest
): Promise<PaymentLinkResponse> {
  const correlationId = logger.createCorrelationId(
    String(params.orderId),
    params.customerEmail
  );

  console.log('\n=== STARTING PAYMENT LINK GENERATION ===');
  console.log('Parameters:', JSON.stringify(params, null, 2));
  console.log('Stripe API Key configured:', !!process.env.STRIPE_SECRET_KEY);

  logger.info('Generating payment link', {
    correlationId,
    orderId: String(params.orderId),
    context: 'generatePaymentLink'
  });

  try {
    // Ensure Stripe is properly configured
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('Stripe secret key is not configured');
      throw new Error('Stripe secret key is not configured');
    }

    // Initialize Stripe with the correct API version
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16' as Stripe.LatestApiVersion,
      typescript: true
    });

    console.log('Stripe client initialized successfully');

    // Get the frontend URL from environment variables
    const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000';
    console.log('Frontend URL:', frontendUrl);
    
    // First create a product for the order
    console.log('Creating Stripe product...');
    const product = await stripe.products.create({
      name: params.description || `Order #${params.orderId}`,
      metadata: {
        orderId: String(params.orderId),
        customerEmail: params.customerEmail
      }
    });
    console.log('Product created:', product.id);
    
    // Calculate processing fee (2.9% + $0.40 for online transactions)
    const processingFeePercentage = 0.029; // 2.9%
    const processingFeeFixed = 40; // $0.40 in cents
    
    // Calculate total with processing fee (all in cents)
    const amountWithFee = params.amount + (params.amount * processingFeePercentage) + processingFeeFixed;
    
    console.log('Amount calculation:', {
      originalAmount: params.amount,
      processingFee: params.amount * processingFeePercentage,
      fixedFee: processingFeeFixed,
      totalWithFee: amountWithFee,
      amountInCents: Math.round(amountWithFee)
    });
    
    // Create a price for the product
    console.log('Creating Stripe price...');
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(amountWithFee), // Already in cents
      currency: defaultCurrency,
    });
    console.log('Price created:', price.id);
    
    // Create the payment link with the price
    console.log('Creating payment link...');
    const paymentLinkParams: any = {
      line_items: [
        {
          price: price.id,
          quantity: 1,
        },
      ],
      metadata: {
        orderId: String(params.orderId),
        customerEmail: params.customerEmail,
        customerName: params.customerName || ''
      },
      after_completion: {
        type: 'redirect',
        redirect: {
          url: `${frontendUrl}/order-confirmation?orderId=${params.orderId}`
        }
      }
    };

    console.log('Payment link parameters:', JSON.stringify(paymentLinkParams, null, 2));
    
    try {
      const paymentLink = await stripe.paymentLinks.create(paymentLinkParams);
      console.log('Payment link created:', paymentLink.id);
      console.log('Payment link URL:', paymentLink.url);

      return {
        id: paymentLink.id,
        url: paymentLink.url,
        expiresAt: Math.floor(Date.now() / 1000) + (paymentLinkExpirationDays * 24 * 60 * 60),
        metadata: {
          orderId: String(params.orderId),
          customerEmail: params.customerEmail
        }
      };
    } catch (stripeError: any) {
      console.error('\n=== STRIPE PAYMENT LINK CREATION FAILED ===');
      console.error('Stripe Error:', {
        type: stripeError.type,
        code: stripeError.code,
        message: stripeError.message,
        raw: stripeError.raw
      });
      throw stripeError;
    }
  } catch (error) {
    console.error('\n=== PAYMENT LINK GENERATION FAILED ===');
    console.error('Error details:', error);
    logger.error('Failed to generate payment link', {
      correlationId,
      orderId: String(params.orderId),
      context: 'generatePaymentLink',
      error
    });
    throw error;
  }
}

/**
 * Update an order with payment link information
 * @param orderId The ID of the order to update
 * @param paymentLink The payment link information
 * @returns {Promise<Order>} The updated order
 */
export async function updateOrderWithPaymentLink(
  orderId: number | string,
  paymentLink: PaymentLinkResponse
): Promise<Order> {
  const correlationId = logger.createCorrelationId();
  
  try {
    logger.info('Updating order with payment link', {
      correlationId,
      context: 'paymentService.updateOrderWithPaymentLink',
      data: {
        orderId,
        paymentLinkId: paymentLink.id
      }
    });
    
    // Get the order repository
    const orderRepository = AppDataSource.getRepository(Order);
    
    // Find the order by ID
    const order = await orderRepository.findOne({
      where: { id: typeof orderId === 'string' ? parseInt(orderId, 10) : orderId }
    });
    
    if (!order) {
      const errorMessage = `Order not found with ID: ${orderId}`;
      logger.error(errorMessage, {
        correlationId,
        context: 'paymentService.updateOrderWithPaymentLink'
      });
      throw new Error(errorMessage);
    }
    
    // Update the order with payment link information
    order.payment_link_id = paymentLink.id;
    order.payment_link_url = paymentLink.url;
    order.payment_link_created_at = new Date();
    order.payment_status = PaymentStatus.PENDING;
    
    // Set expiration date if available
    if (paymentLink.expiresAt) {
      order.payment_link_expires_at = new Date(paymentLink.expiresAt * 1000); // Convert from Unix timestamp
    }
    
    // Save the updated order
    const updatedOrder = await orderRepository.save(order);
    
    logger.info('Order updated with payment link', {
      correlationId,
      context: 'paymentService.updateOrderWithPaymentLink',
      data: {
        orderId: updatedOrder.id,
        paymentLinkId: paymentLink.id,
        expiresAt: updatedOrder.payment_link_expires_at
      }
    });
    
    return updatedOrder;
  } catch (error) {
    logger.error('Failed to update order with payment link', {
      correlationId,
      context: 'paymentService.updateOrderWithPaymentLink',
      error,
      data: { orderId }
    });
    throw error;
  } finally {
    logger.removeCorrelationId(correlationId);
  }
}

/**
 * Update order payment status based on webhook event
 * @param paymentLinkId The ID of the payment link
 * @param newStatus The new payment status
 * @returns {Promise<Order | null>} The updated order or null if not found
 */
export async function updateOrderPaymentStatus(
  paymentLinkId: string,
  newStatus: PaymentStatus,
  paidAt?: Date
): Promise<Order | null> {
  const correlationId = logger.createCorrelationId();
  
  try {
    logger.info('Updating order payment status', {
      correlationId,
      context: 'paymentService.updateOrderPaymentStatus',
      data: {
        paymentLinkId,
        newStatus
      }
    });
    
    // Get the order repository
    const orderRepository = AppDataSource.getRepository(Order);
    
    // Find the order by payment link ID
    const order = await orderRepository.findOne({
      where: { payment_link_id: paymentLinkId }
    });
    
    if (!order) {
      logger.warn('No order found with payment link ID', {
        correlationId,
        context: 'paymentService.updateOrderPaymentStatus',
        data: { paymentLinkId }
      });
      return null;
    }
    
    // Update the order payment status
    order.payment_status = newStatus;
    
    // If paid, update the paid_at timestamp
    if (newStatus === PaymentStatus.PAID) {
      order.paid_at = paidAt || new Date();
    }
    
    // Save the updated order
    const updatedOrder = await orderRepository.save(order);
    
    logger.info('Order payment status updated', {
      correlationId,
      context: 'paymentService.updateOrderPaymentStatus',
      data: {
        orderId: updatedOrder.id,
        paymentLinkId,
        newStatus,
        paidAt: updatedOrder.paid_at
      }
    });
    
    return updatedOrder;
  } catch (error) {
    logger.error('Failed to update order payment status', {
      correlationId,
      context: 'paymentService.updateOrderPaymentStatus',
      error,
      data: { paymentLinkId, newStatus }
    });
    throw error;
  } finally {
    logger.removeCorrelationId(correlationId);
  }
}

// Export the Stripe instance and configuration for use in other parts of the application
export { 
  stripe,
  paymentLinkExpirationDays,
  defaultCurrency
};
