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

    // NEW FLOW: Store in temporary storage first
    console.log('\n=== STORING ORDER IN TEMPORARY STORAGE ===');
    
    // Create order object for temporary storage
    const tempOrderData = {
      customerName: customerInfo.name,
      customerEmail: customerInfo.email || '',
      restaurantId: restaurantId,
      restaurantName: restaurantName,
      items: orderData.items.map(item => ({
        id: item.id || `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        options: item.options || []
      })),
      subtotal: subtotal,
      tax: tax,
      total: total,
      orderNumber: orderNumber
    };
    
    info('Storing order in temporary storage', {
      correlationId,
      context: 'orderService',
      orderNumber,
      data: {
        customerName: tempOrderData.customerName,
        itemCount: tempOrderData.items.length,
        total: tempOrderData.total
      }
    });
    
    // Import the temporary order service
    const { temporaryOrderService } = await import('./services/temporaryOrderService.js');
    
    // Store the order in temporary storage
    const tempOrder = temporaryOrderService.storeOrder(tempOrderData);
    
    console.log('\n=== ORDER STORED IN TEMPORARY STORAGE ===');
    console.log(`Temporary Order ID: ${tempOrder.id}`);
    console.log(`Order Number: ${orderNumber}`);
    console.log(`Expires At: ${new Date(tempOrder.expiresAt).toLocaleString()}`);
    
    info('Order stored in temporary storage', {
      correlationId,
      context: 'orderService',
      orderNumber,
      data: {
        tempOrderId: tempOrder.id,
        expiresAt: new Date(tempOrder.expiresAt).toISOString()
      }
    });
    
    // Generate payment link
    console.log('\n=== GENERATING PAYMENT LINK ===');
    
    let paymentLinkResponse = null;
    let savedOrder = null;
    
    if (customerInfo.email) {
      try {
        console.log('Payment Link Parameters:', {
          orderId: tempOrder.id,
          customerEmail: customerInfo.email,
          customerName: customerInfo.name
        });
        
        info('Generating payment link', { 
          correlationId, 
          context: 'orderService',
          orderNumber,
          data: {
            tempOrderId: tempOrder.id,
            customerEmail: customerInfo.email
          }
        });
        
        // Import the order payment link service
        const { generateOrderPaymentLink } = await import('./services/orderPaymentLinkService.js');
        
        // Generate payment link using the temporary order
        const orderWithPayment = await generateOrderPaymentLink({
          orderId: tempOrder.id,
          customerEmail: customerInfo.email,
          customerName: customerInfo.name,
          description: `Order from ${restaurantName}`,
          expirationHours: 48
        });
        
        // Extract payment link information
        paymentLinkResponse = orderWithPayment.metadata?.paymentLink || null;
      } catch (error) {
        console.error('\n=== PAYMENT LINK GENERATION FAILED ===');
        console.error('Error:', error);
        warn('Failed to generate payment link', { 
          correlationId, 
          context: 'orderService',
          orderNumber,
          error,
          data: { tempOrderId: tempOrder.id }
        });
      }
    } else {
      console.log('\n=== SKIPPING PAYMENT LINK GENERATION ===');
      console.log('No customer email provided');
      info('No customer email provided, skipping payment link generation', {
        correlationId,
        context: 'orderService',
        orderNumber,
        data: { tempOrderId: tempOrder.id }
      });
    }

    if (!paymentLinkResponse) {
      console.error('\n=== PAYMENT LINK GENERATION FAILED ===');
      console.error('No payment link response received');
      warn('Failed to generate payment link', { 
        correlationId, 
        context: 'orderService',
        orderNumber,
        data: { tempOrderId: tempOrder.id }
      });
    } else {
      console.log('\n=== PAYMENT LINK GENERATED SUCCESSFULLY ===');
      console.log(`Payment Link ID: ${paymentLinkResponse.id}`);
      console.log(`Payment Link URL: ${paymentLinkResponse.url}`);
      console.log(`Payment Link Expires At: ${new Date(paymentLinkResponse.expiresAt * 1000).toISOString()}`);
      info('Payment link generated successfully', {
        correlationId,
        context: 'orderService',
        orderNumber,
        data: {
          tempOrderId: tempOrder.id,
          paymentLinkId: paymentLinkResponse.id,
          paymentLinkUrl: paymentLinkResponse.url,
          expiresAt: new Date(paymentLinkResponse.expiresAt * 1000).toISOString()
        }
      });
    }

    console.log('\n=== ORDER PLACEMENT COMPLETED ===\n');
    return {
      orderId: tempOrder.id,
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
