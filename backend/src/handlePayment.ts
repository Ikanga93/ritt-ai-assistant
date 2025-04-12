import { JobContext } from '@livekit/agents';
import { ConversationState, ConversationStage, updateStage } from './conversationState.js';
import Stripe from 'stripe';

// Initialize Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-03-31.basil'
});

/**
 * Handle payment processing for the order
 * @param ctx LiveKit agent context
 * @param state Current conversation state
 * @returns Updated conversation state with payment URL
 */
export async function handlePayment(
  ctx: JobContext,
  state: ConversationState
): Promise<ConversationState> {
  try {
    // Calculate total amount from cart items
    const totalAmount = state.cartItems.reduce((sum, item) => {
      return sum + (item.price * item.quantity);
    }, 0);

    // First create a product
    const product = await stripe.products.create({
      name: 'Drive-thru Order',
      description: `Order for ${state.customerName || 'Customer'}`,
    });

    // Then create a price
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(totalAmount * 100), // Convert to cents
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
          url: `${process.env.FRONTEND_URL}/order-confirmation?orderId=${state.orderDetails?.orderNumber || 'unknown'}`,
        },
      },
      metadata: {
        orderNumber: state.orderDetails?.orderNumber || 'unknown',
        customerName: state.customerName || 'Unknown',
      },
    });

    // Update state with payment URL
    return {
      ...state,
      paymentUrl: paymentLink.url,
      stage: ConversationStage.PAYMENT_PENDING,
    };
  } catch (error) {
    console.error('Error creating payment link:', error);
    throw error;
  }
}
