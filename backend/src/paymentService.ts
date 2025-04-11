import Stripe from 'stripe';
import dotenv from 'dotenv';

// Ensure environment variables are loaded
dotenv.config();

// Define order types
export interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface Order {
  id?: string;
  items: OrderItem[];
  totalAmount: number;
  customerName?: string;
  status?: 'pending' | 'paid' | 'completed';
  createdAt?: Date;
}

export class PaymentService {
  private stripe: Stripe;

  constructor() {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) {
      throw new Error('STRIPE_SECRET_KEY is not defined in environment variables');
    }
    this.stripe = new Stripe(apiKey, {
      apiVersion: '2025-03-31.basil',
    });
  }

  async createPaymentLink(order: Order): Promise<string> {
    try {
      // Create a product for this order
      const product = await this.stripe.products.create({
        name: `Ritt Drive-Thru Order #${order.id || Date.now()}`,
        description: this.generateOrderDescription(order),
      });

      // Create a price for the order
      const price = await this.stripe.prices.create({
        product: product.id,
        unit_amount: Math.round(order.totalAmount * 100), // Convert to cents
        currency: 'usd',
      });

      // Create a payment link
      const paymentLink = await this.stripe.paymentLinks.create({
        line_items: [{ price: price.id, quantity: 1 }],
        after_completion: { 
          type: 'redirect', 
          redirect: { 
            url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/order-confirmation?order_id=${order.id}` 
          } 
        },
      });

      return paymentLink.url;
    } catch (error) {
      console.error('Error creating payment link:', error);
      throw error;
    }
  }

  private generateOrderDescription(order: Order): string {
    return order.items.map(item => `${item.quantity}x ${item.name}`).join(', ');
  }
}

// Export a singleton instance
export const paymentService = new PaymentService();
