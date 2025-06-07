// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Order service for handling order placement and processing - Database Only
 */

// Import database service for order storage
import { saveOrderToDatabase } from './services/orderDatabaseService.js';
import { createCorrelationId, info, error, warn } from './utils/logger.js';
import { generateOrderNumber } from './utils/orderUtils.js';

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
 * Place an order with a restaurant - Database Only Approach
 */
export async function placeOrder(
  orderData: OrderData,
  customerInfo: CustomerInfo,
  restaurantId: string,
  restaurantName: string
): Promise<OrderResult> {
  console.log('\n🚀 DATABASE-ONLY ORDER PLACEMENT STARTED');
  console.log('Order Data:', JSON.stringify(orderData, null, 2));
  console.log('Customer Info:', JSON.stringify(customerInfo, null, 2));
  console.log('Restaurant ID:', restaurantId);
  console.log('Restaurant Name:', restaurantName);

  const correlationId = createCorrelationId();
  
  info('Starting database-only order placement', { 
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

    // Calculate order totals
    const subtotal = orderData.items.reduce((total, item) => {
      return total + (item.price * item.quantity);
    }, 0);

    // Use priceCalculator service for consistent calculations
    const { priceCalculator } = await import('./services/priceCalculator.js');
    const priceBreakdown = priceCalculator.calculateOrderPrices(subtotal);
    const { tax, processingFee, totalWithFees: total } = priceBreakdown;

    // Generate order number
    const orderNumber = generateOrderNumber();

    console.log('\n💰 ORDER TOTALS:');
    console.log(`Order Number: ${orderNumber}`);
    console.log(`Subtotal: $${subtotal.toFixed(2)}`);
    console.log(`Tax: $${tax.toFixed(2)}`);
    console.log(`Processing Fee: $${processingFee.toFixed(2)}`);
    console.log(`Total: $${total.toFixed(2)}`);

    // Collect special instructions from items
    const allSpecialInstructions = orderData.items
      .filter(item => item.specialInstructions && item.specialInstructions.trim() !== '')
      .map(item => `${item.name}: ${item.specialInstructions}`)
      .join('; ');
    
    // Create order details object
    const orderDetails: OrderDetails = {
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
      specialInstructions: allSpecialInstructions
    };

    // Create database order directly (NO TEMPORARY STORAGE)
    console.log('\n💾 CREATING DATABASE ORDER DIRECTLY');
    
    const savedOrder = await saveOrderToDatabase(orderDetails);
    const dbOrderId = savedOrder.dbOrderId;
    
    console.log(`✅ Database Order Created - ID: ${dbOrderId}`);
    
    info('Database order created successfully', {
      correlationId,
      context: 'orderService',
      orderNumber,
      data: {
        dbOrderId: dbOrderId,
        customerName: customerInfo.name,
        total: total
      }
    });

    // Generate payment link for the database order
    console.log('\n💳 GENERATING PAYMENT LINK');
    
    let paymentLinkUrl: string | undefined = undefined;
    
    try {
      // Import the order payment service (the correct one that works with database orders)
      const { generateOrderPaymentLink } = await import('./services/orderPaymentService.js');
      
      // Generate payment link using the database order
      const paymentLinkResult = await generateOrderPaymentLink(orderDetails, dbOrderId);
      
      paymentLinkUrl = paymentLinkResult;
      
      console.log('✅ Payment link generated successfully');
      console.log(`Payment Link URL: ${paymentLinkResult}`);
      
      info('Payment link generated successfully', {
        correlationId,
        context: 'orderService',
        orderNumber,
        data: {
          dbOrderId: dbOrderId,
          paymentLinkUrl: paymentLinkResult
        }
      });
      
    } catch (paymentError) {
      console.error('\n❌ PAYMENT LINK GENERATION FAILED');
      console.error('Error:', paymentError);
      warn('Failed to generate payment link', { 
        correlationId, 
        context: 'orderService',
        orderNumber,
        error: paymentError,
        data: { dbOrderId: dbOrderId }
      });
    }

    console.log('\n🎉 DATABASE-ONLY ORDER PLACEMENT COMPLETED');
    
    return {
      orderId: dbOrderId.toString(),
      orderNumber,
      total: total.toFixed(2),
      paymentLink: paymentLinkUrl
    };
    
  } catch (err) {
    console.error('\n❌ DATABASE-ONLY ORDER PLACEMENT FAILED');
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
