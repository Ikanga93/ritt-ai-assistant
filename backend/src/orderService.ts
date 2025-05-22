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
// Tax rate and processing fees are now handled by priceCalculator service

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
  // SUPER PROMINENT LOG MESSAGE
  console.log('\n\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  console.log('!!!!!!!!!!!!! PLACE ORDER FUNCTION CALLED !!!!!!!!!!!!!');
  console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  console.log('Order Data:', JSON.stringify(orderData, null, 2));
  console.log('Customer Info:', JSON.stringify(customerInfo, null, 2));
  console.log('Restaurant ID:', restaurantId);
  console.log('Restaurant Name:', restaurantName);
  console.log(`Customer: ${customerInfo.name} (${customerInfo.email})`);
  console.log('Items:', orderData.items.map(item => `${item.quantity}x ${item.name}`).join(', '));

  const correlationId = createCorrelationId();
  console.log('\n=== STARTING ORDER PLACEMENT ===');
  console.log(`Restaurant: ${restaurantName} (${restaurantId})`);
  
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

    console.log('\n=== ORDER DETAILS ===');
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
    
    console.log('Special instructions collected:', allSpecialInstructions);
    
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

    // Store in temporary storage
    console.log('\n=== STORING ORDER IN TEMPORARY STORAGE ===');
    console.log('Customer Email:', customerInfo.email ? customerInfo.email : 'NOT PROVIDED');
    
    // Create order object for temporary storage
    const tempOrderData = {
      customerName: customerInfo.name,
      customerEmail: customerInfo.email || '',
      restaurantId,
      restaurantName,
      items: orderData.items.map(item => ({
        id: item.id || `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        options: item.options || []
      })),
      subtotal,
      tax,
      total,
      orderNumber
    };

    console.log('Temporary Order Data:', JSON.stringify({
      customerName: tempOrderData.customerName,
      customerEmail: tempOrderData.customerEmail,
      itemCount: tempOrderData.items.length,
      total: tempOrderData.total
    }, null, 2));
    
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
    console.log(`Temporary Order ID: ${tempOrder.id}`);
    console.log(`Order Number: ${orderNumber}`);
    console.log(`Expires At: ${new Date(tempOrder.expiresAt).toLocaleString()}`);
    console.log('Order stored in temporary storage');
    
    info('Temporary order created', {
      correlationId,
      context: 'orderService',
      orderNumber,
      data: {
        tempOrderId: tempOrder.id,
        expiresAt: new Date(tempOrder.expiresAt).toISOString()
      }
    });

    // Generate payment link for all orders with customer emails
    console.log('\n=== GENERATING PAYMENT LINK ===');
    
    let paymentLinkResponse = null;
    
    if (customerInfo.email) {
      console.log('\n=== ORDER HAS CUSTOMER EMAIL, GENERATING PAYMENT LINK ===');
      console.log(`Customer Email: ${customerInfo.email}`);
      
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
        
        console.log('Order with payment:', JSON.stringify({
          id: orderWithPayment.id,
          paymentLink: orderWithPayment.metadata?.paymentLink?.url,
          paymentStatus: orderWithPayment.metadata?.paymentStatus
        }, null, 2));
        
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
      console.log(`Payment Link Expires At: ${new Date(paymentLinkResponse.expiresAt).toISOString()}`);
      info('Payment link generated successfully', {
        correlationId,
        context: 'orderService',
        orderNumber,
        data: {
          tempOrderId: tempOrder.id,
          paymentLinkId: paymentLinkResponse.id,
          paymentLinkUrl: paymentLinkResponse.url,
          expiresAt: new Date(paymentLinkResponse.expiresAt).toISOString()
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
