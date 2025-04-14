// Stripe configuration
import Stripe from 'stripe';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env.local') });

// Use a fallback test key if needed (for development only)
const FALLBACK_TEST_KEY = 'sk_test_51R5kZQP4sLIsXeNy3uDv4DnTwD0h2WXfsv6Mp5Ee2felNv3zet4lCejwBdkqzGyoRo6tbfL7RG2ASSAgJH8B83GN00YSvfj4mA';

// Initialize Stripe with your API key
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || FALLBACK_TEST_KEY, {
  apiVersion: '2025-03-31.basil' // Use the API version compatible with Stripe v18.0.0
});

// Log Stripe configuration status
console.log('Stripe configuration loaded:', process.env.STRIPE_SECRET_KEY ? 'Using environment key' : 'Using fallback key');

// Define Stripe-related function schemas for the agent
export const stripeToolSchemas = {
  createPaymentLink: {
    name: 'createPaymentLink',
    description: 'Create a payment link for an order',
    parameters: {
      type: 'object',
      properties: {
        orderDetails: {
          type: 'object',
          description: 'The order details including total amount, customer name, and order number',
          properties: {
            orderNumber: { type: 'string', description: 'The order number' },
            customerName: { type: 'string', description: 'The customer name' },
            restaurantName: { type: 'string', description: 'The restaurant name' },
            orderTotal: { type: 'number', description: 'The total order amount' },
          },
          required: ['orderTotal']
        }
      },
      required: ['orderDetails']
    }
  },
  checkPaymentStatus: {
    name: 'checkPaymentStatus',
    description: 'Check the status of a payment link',
    parameters: {
      type: 'object',
      properties: {
        paymentLinkId: {
          type: 'string',
          description: 'The ID of the payment link to check'
        }
      },
      required: ['paymentLinkId']
    }
  }
};

/**
 * Validates and converts an order total to cents for Stripe
 * @param amount The amount to validate and convert
 * @returns The validated amount in cents or throws an error
 */
function validateAndConvertToCents(amount: any): number {
  // Check if amount is defined
  if (amount === undefined || amount === null) {
    throw new Error('Order total amount is missing');
  }
  
  // Convert to number if it's a string
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  // Check if amount is a valid number
  if (isNaN(numericAmount)) {
    throw new Error('Order total is not a valid number');
  }
  
  // Check if amount is positive
  if (numericAmount <= 0) {
    throw new Error('Order total must be greater than zero');
  }
  
  // Check if amount is reasonable (less than $10,000)
  if (numericAmount > 10000) {
    throw new Error('Order total exceeds maximum allowed amount');
  }
  
  // Convert to cents and round to avoid floating point issues
  const amountInCents = Math.round(numericAmount * 100);
  
  // Final validation to ensure we have a whole number of cents
  if (!Number.isInteger(amountInCents)) {
    throw new Error('Invalid amount after conversion to cents');
  }
  
  return amountInCents;
}

/**
 * Create a payment link for an order
 * @param orderDetails The order details including total amount, customer name, and order number
 * @returns Object containing success status, payment URL and ID if successful, or error message if failed
 */
export async function createPaymentLink(orderDetails: any) {
  try {
    // Validate the order total - access amount from different possible locations
    const orderTotal = orderDetails.orderTotal || orderDetails.orderDetails?.orderTotal || orderDetails.amount || orderDetails.orderDetails?.amount;
    const amountInCents = validateAndConvertToCents(orderTotal);
    
    // First create a product for this order
    const product = await stripe.products.create({
      name: `Order #${orderDetails.orderNumber || 'Unknown'}`,
      description: `Order for ${orderDetails.customerName || 'Customer'} from ${orderDetails.restaurantName || 'Restaurant'}`,
    });

    // Then create a price for the product
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: amountInCents, // Already converted to cents and validated
      currency: 'usd',
    });

    // Create a payment link
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{
        price: price.id,
        quantity: 1,
      }],
      after_completion: {
        type: 'redirect',
        redirect: {
          url: `${process.env.FRONTEND_URL}/order-confirmation?orderId=${orderDetails.orderNumber || 'unknown'}`,
        },
      },
      metadata: {
        orderNumber: orderDetails.orderNumber || 'unknown',
        customerName: orderDetails.customerName || 'Unknown',
      },
    });

    return {
      success: true,
      url: paymentLink.url,
      id: paymentLink.id,
    };
  } catch (error) {
    console.error('Error creating payment link:', error);
    // Provide more specific error messages for price calculation issues
    if (error instanceof Error && 
        (error.message.includes('amount') || 
         error.message.includes('total') || 
         error.message.includes('cents'))) {
      return {
        success: false,
        error: `Price calculation error: ${error.message}`,
        code: 'PRICE_CALCULATION_ERROR'
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check the status of a payment link
 * @param paymentLinkId The ID of the payment link to check
 * @returns Object containing success status and payment link details if successful, or error message if failed
 */
export async function checkPaymentStatus(paymentLinkId: string) {
  try {
    const paymentLink = await stripe.paymentLinks.retrieve(paymentLinkId);
    return {
      success: true,
      url: paymentLink.url,
      active: paymentLink.active,
    };
  } catch (error) {
    console.error('Error checking payment status:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
