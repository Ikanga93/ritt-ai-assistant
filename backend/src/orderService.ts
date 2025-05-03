// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Order service for handling order placement and processing
 */

// Import database service for order storage
import { saveOrderToDatabase } from './services/orderDatabaseService.js';
import { createCorrelationId, info, error, warn } from './utils/logger.js';
import { generatePaymentLink } from './services/paymentService.js';
import { generateOrderNumber } from './utils/orderUtils.js';

// Constants
const TAX_RATE = 0.0825; // 8.25%
const PROCESSING_FEE_RATE = 0.029; // 2.9%
const PROCESSING_FEE_FIXED = 0.30; // $0.30

export interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  specialInstructions?: string;
  options?: {
    name: string;
    value: string;
  }[];
}

export interface OrderDetails {
  orderNumber: string;
  restaurantId: string;
  restaurantName: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  processingFee: number;
  total: number;
  stateTax?: number;
  orderTotal?: number;
  specialInstructions?: string;
  paymentUrl?: string;
}

export interface OrderData {
  items: OrderItem[];
}

export interface CustomerInfo {
  name: string;
  email: string;
  phone: string;
}

export interface Order {
  orderNumber: string;
  restaurantId: string;
  restaurantName: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  processingFee: number;
  total: number;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
  stateTax?: number;
  orderTotal?: number;
  specialInstructions?: string;
}

export interface OrderResult {
  orderId: string;
  orderNumber: string;
  total: string;
  paymentLink?: string;
}

export interface PaymentLinkResponse {
  url: string;
  expiresAt: Date;
}

/**
 * Place an order with a restaurant
 * 
 * @param restaurantId ID of the restaurant
 * @param customerName Name of the customer
 * @param items Items in the order
 * @param customerEmail Optional email for confirmation
 * @param customerPhone Optional phone number for SMS payment link
 * @param auth0User Optional Auth0 user data for authenticated orders
 * @returns Order details
 */
/**
 * Diagnostic logging function for order processing
 */
function logOrderDetails(stage: string, details: any) {
  console.log(`[ORDER PROCESSING - ${stage}]`, JSON.stringify(details, null, 2));
}

export async function placeOrder(
  orderData: OrderData,
  customerInfo: CustomerInfo,
  restaurantId: string,
  restaurantName: string
): Promise<OrderResult> {
  const correlationId = createCorrelationId();
  console.log('\n=== STARTING ORDER PLACEMENT ===');
  console.log(`Restaurant: ${restaurantName} (${restaurantId})`);
  console.log(`Customer: ${customerInfo.name} (${customerInfo.email})`);
  console.log('Items:', orderData.items.map(item => `${item.quantity}x ${item.name}`).join(', '));
  
  info('Starting order placement process', { 
    correlationId, 
    context: 'orderService', 
    data: { 
      restaurantId,
      restaurantName,
      customerName: customerInfo.name,
      customerEmail: customerInfo.email,
      itemCount: orderData.items.length
    } 
  });

  try {
    // Validate order data
    if (!orderData.items || orderData.items.length === 0) {
      error('Invalid order data: no items', { correlationId, context: 'orderService' });
      throw new Error('Invalid order data: no items');
    }

    // Calculate totals
    info('Calculating order totals', { 
      correlationId, 
      context: 'orderService',
      data: {
        items: orderData.items.map(item => ({
          name: item.name,
          price: item.price,
          quantity: item.quantity
        }))
      }
    });
    const subtotal = orderData.items.reduce((sum: number, item: OrderItem) => {
      const price = item.price ?? 0;
      const quantity = item.quantity ?? 1;
      return sum + (price * quantity);
    }, 0);
    const tax = subtotal * TAX_RATE;
    const processingFee = (subtotal * PROCESSING_FEE_RATE) + PROCESSING_FEE_FIXED;
    const total = subtotal + tax + processingFee;

    info('Order totals calculated', {
      correlationId,
      context: 'orderService',
      data: {
        subtotal: subtotal.toFixed(2),
        tax: tax.toFixed(2),
        processingFee: processingFee.toFixed(2),
        total: total.toFixed(2)
      }
    });

    // Generate order number
    info('Generating order number', { correlationId, context: 'orderService' });
    const orderNumber = generateOrderNumber();

    // Create order object
    const order: Order = {
      orderNumber,
      restaurantId,
      restaurantName,
      customerName: customerInfo.name,
      customerEmail: customerInfo.email,
      customerPhone: customerInfo.phone,
      items: orderData.items,
      subtotal,
      tax,
      processingFee,
      total,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      stateTax: tax,
      orderTotal: total,
      specialInstructions: ''
    };

    info('Saving order to database', { 
      correlationId, 
      context: 'orderService',
      orderNumber,
      data: { 
        restaurantId,
        restaurantName,
        customerName: customerInfo.name,
        customerEmail: customerInfo.email,
        itemCount: orderData.items.length,
        total: total.toFixed(2)
      }
    });

    // Save to database
    console.log('\n=== SAVING ORDER TO DATABASE ===');
    const savedOrder = await saveOrderToDatabase(order);
    
    if (!savedOrder) {
      console.error('\n=== DATABASE SAVE FAILED ===');
      error('Failed to save order to database', { 
        correlationId, 
        context: 'orderService',
        orderNumber,
        data: order 
      });
      throw new Error('Failed to save order to database');
    }

    console.log('\n=== ORDER SAVED SUCCESSFULLY ===');
    console.log(`Order Number: ${orderNumber}`);
    console.log(`Database ID: ${savedOrder.dbOrderId}`);
    console.log(`Total: $${total.toFixed(2)}`);

    // Generate payment link
    console.log('\n=== GENERATING PAYMENT LINK ===');
    info('Generating payment link', { 
      correlationId, 
      context: 'orderService',
      orderNumber,
      data: {
        orderId: savedOrder.dbOrderId,
        amount: total.toFixed(2),
        customerEmail: customerInfo.email
      }
    });
    const paymentLinkResponse = await generatePaymentLink({
      orderId: savedOrder.dbOrderId,
      amount: total,
      customerEmail: customerInfo.email,
      customerName: customerInfo.name
    });

    if (!paymentLinkResponse) {
      console.error('\n=== PAYMENT LINK GENERATION FAILED ===');
      warn('Failed to generate payment link', { 
        correlationId, 
        context: 'orderService',
        orderNumber,
        data: { orderId: savedOrder.dbOrderId }
      });
    } else {
      console.log('\n=== PAYMENT LINK GENERATED SUCCESSFULLY ===');
      console.log(`Payment Link ID: ${paymentLinkResponse.id}`);
      console.log(`Payment Link URL: ${paymentLinkResponse.url}`);
      info('Payment link generated successfully', {
        correlationId,
        context: 'orderService',
        orderNumber,
        data: {
          orderId: savedOrder.dbOrderId,
          paymentLinkId: paymentLinkResponse.id,
          paymentLinkUrl: paymentLinkResponse.url
        }
      });
    }

    console.log('\n=== ORDER PLACEMENT COMPLETED ===\n');
    return {
      orderId: savedOrder.dbOrderId.toString(),
      orderNumber,
      total: total.toFixed(2),
      paymentLink: paymentLinkResponse?.url
    };
  } catch (err) {
    console.error('\n=== ORDER PLACEMENT FAILED ===');
    console.error('Error:', err);
    error('Error placing order', { 
      correlationId, 
      context: 'orderService',
      error: err,
      data: { 
        restaurantId,
        restaurantName,
        customerName: customerInfo.name,
        customerEmail: customerInfo.email
      }
    });
    throw err;
  }
}
