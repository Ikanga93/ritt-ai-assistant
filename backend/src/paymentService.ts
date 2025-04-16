// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Payment service for generating Stripe payment links and chat payment markers
 */
// Load environment variables from .env.local if not already loaded
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env.local');

// Check if .env.local exists and load it
if (fs.existsSync(envPath)) {
  console.log(`Loading environment variables from ${envPath}`);
  dotenv.config({ path: envPath });
} else {
  console.warn(`Environment file not found: ${envPath}`);
  // Try loading from .env as fallback
  const defaultEnvPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(defaultEnvPath)) {
    console.log(`Loading environment variables from ${defaultEnvPath}`);
    dotenv.config({ path: defaultEnvPath });
  }
}

// @ts-ignore - Stripe provides its own types
import Stripe from 'stripe';
import { sendPaymentLinkSMS, formatPhoneNumber } from './smsService.js';
import { OrderDetails } from './orderService.js';
import { generatePaymentMarker } from './paymentResponseEnhancer.js';
import { ConversationState, updatePaymentStatus } from './conversationState.js';

// Get Stripe API key from environment
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
console.log('Stripe API Key available:', !!stripeSecretKey);

if (!stripeSecretKey) {
  console.error('STRIPE_SECRET_KEY is not set. Payment functionality will not work!');
  throw new Error('STRIPE_SECRET_KEY is not set. Please check your environment variables.');
}

// Initialize Stripe with API key from environment
const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2025-03-31.basil', // Updated to latest API version
});

/**
 * Generate a Stripe payment link for an order
 * 
 * @param order Order details to generate payment for
 * @returns Payment URL for the order
 */
export async function generatePaymentLink(order: OrderDetails): Promise<string> {
  try {
    console.log(`Generating payment link for order #${order.orderNumber}`);
    
    if (!stripeSecretKey) {
      throw new Error('Stripe secret key is not configured');
    }
    
    // Create a payment link using Stripe Checkout
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Order #${order.orderNumber} from ${order.restaurantName || 'Ritt Drive-Thru'}`,
              description: order.items.map(item => `${item.quantity}x ${item.name}`).join(', '),
            },
            unit_amount: Math.round(order.orderTotal * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-success?order=${order.orderNumber}`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-cancel?order=${order.orderNumber}`,
      metadata: {
        orderNumber: order.orderNumber.toString(),
        restaurantName: order.restaurantName,
        customerName: order.customerName
      }
    });

    // Return the payment URL
    if (!session.url) {
      throw new Error('Failed to generate payment URL');
    }
    
    console.log(`Payment link generated successfully for order #${order.orderNumber}: ${session.url}`);
    return session.url;
  } catch (error) {
    console.error('Error generating payment link:', error);
    throw error;
  }
}

/**
 * Send a payment link for an order via SMS
 * 
 * @param order Order details with customer phone number
 * @returns Updated order with payment link sent status
 */
export async function sendOrderPaymentLink(order: OrderDetails): Promise<OrderDetails> {
  try {
    // Check if phone number is available
    if (!order.customerPhone) {
      throw new Error('Customer phone number is required for SMS payment');
    }
    
    // Format the phone number for Twilio
    const formattedPhone = formatPhoneNumber(order.customerPhone);
    
    // Generate payment link if not already present
    if (!order.paymentUrl) {
      order.paymentUrl = await generatePaymentLink(order);
    }
    
    // Send the payment link via SMS
    await sendPaymentLinkSMS(formattedPhone, order.paymentUrl, order.orderNumber);
    
    // Update order status
    return {
      ...order,
      paymentLinkSent: true
    };
  } catch (error) {
    console.error('Error sending payment link via SMS:', error);
    // Don't update paymentLinkSent status if there was an error
    return order;
  }
}

/**
 * Generate a payment marker for chat messages and store payment URL in conversation state
 * 
 * @param order The order details to generate payment for
 * @param state The current conversation state
 * @returns Object containing the updated state and payment marker for chat message
 */
export async function preparePaymentForChat(
  order: OrderDetails,
  state: ConversationState
): Promise<{ state: ConversationState; paymentMarker: string }> {
  try {
    // Generate payment link if not already present
    const paymentUrl = state.paymentUrl || await generatePaymentLink(order);
    
    // Create payment marker for chat message
    const paymentMarker = generatePaymentMarker(order.orderNumber, order.orderTotal);
    
    // Update conversation state with payment information
    const updatedState = updatePaymentStatus(
      state,
      paymentUrl,
      order.orderNumber,
      false // Not sent yet, just prepared
    );
    
    console.log(`Payment prepared for order #${order.orderNumber}: ${paymentUrl}`);
    console.log(`Payment marker generated: ${paymentMarker}`);
    
    return {
      state: updatedState,
      paymentMarker
    };
  } catch (error) {
    console.error('Error preparing payment for chat:', error);
    throw error;
  }
}
