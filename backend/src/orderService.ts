// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Order service for handling order placement and processing
 */

// Import database service for order storage
import { saveOrderToDatabase } from './services/orderDatabaseService.js';


export interface OrderItem {
  id?: string;
  name: string;
  quantity: number;
  price?: number;
  specialInstructions?: string;
}

export interface OrderDetails {
  orderNumber: number;
  restaurantId: string;
  restaurantName: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string; // Added for SMS payment flow
  items: OrderItem[];
  subtotal: number;
  stateTax: number;
  orderTotal: number;
  processingFee?: number; // Hidden from customer
  timestamp: string;
  estimatedTime: number;
  status: string;
  paymentLinkSent?: boolean; // Track if payment link was sent via SMS
  paymentUrl?: string; // Store the payment URL for SMS sending
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
export async function placeOrder(
  restaurantId: string,
  customerName: string,
  items: OrderItem[],
  customerEmail?: string,
  customerPhone?: string,
  auth0User?: any
): Promise<OrderDetails> {
  console.log('=== Order Placement Started ===');
  console.log('Input parameters:', {
    restaurantId,
    customerName,
    itemsCount: items.length,
    customerEmail,
    customerPhone,
    hasAuth0User: !!auth0User
  });

  // Generate order details
  const orderNumber = Math.floor(Math.random() * 10000) + 1000;
  console.log(`Generated order number: ${orderNumber}`);
  const estimatedTime = Math.floor(Math.random() * 10) + 5; // 5-15 minutes
  
  // Ensure all items have a price (use default if not provided)
  const itemsWithPrices = items.map(item => {
    // Check if item is undefined or null
    if (!item) {
      console.error('Received undefined or null item in order');
      return {
        name: 'Unknown item',
        quantity: 1,
        price: 9.99
      };
    }
    
    // Double check that price is a valid number
    let price = 9.99; // Default price
    
    if (item.price !== undefined && item.price !== null) {
      // Try to convert to number if it's not already
      const numPrice = Number(item.price);
      if (!isNaN(numPrice)) {
        price = numPrice;
      } else {
        console.warn(`Invalid price for item ${item.name}: ${item.price}, using default price`);
      }
    } else {
      console.warn(`No price specified for item ${item.name}, using default price`);
    }
    
    return {
      ...item,
      price: price
    };
  });
  
  // Calculate subtotal with extra validation
  const subtotal = itemsWithPrices.reduce((total, item) => {
    // Ensure price and quantity are valid numbers
    const price = typeof item.price === 'number' ? item.price : 9.99;
    const quantity = typeof item.quantity === 'number' ? item.quantity : 1;
    
    return total + (price * quantity);
  }, 0);
  
  // Calculate state tax (9%)
  const stateTax = subtotal * 0.09;
  
  // Calculate subtotal + tax
  const subtotalPlusTax = subtotal + stateTax;
  
  // Calculate processing fee (2.9% + $0.40) - based on subtotal + tax
  const processingFee = subtotalPlusTax * 0.029 + 0.40;
  
  // Calculate final order total (subtotal + tax + processing fee)
  const orderTotal = subtotal + stateTax + processingFee;
  
  // Create order object
  const order: OrderDetails = {
    orderNumber,
    restaurantId,
    restaurantName: '', 
    customerName,
    customerEmail,
    customerPhone,
    items: itemsWithPrices,
    subtotal: parseFloat(subtotal.toFixed(2)),
    stateTax: parseFloat(stateTax.toFixed(2)),
    orderTotal: parseFloat(orderTotal.toFixed(2)),
    processingFee: parseFloat(processingFee.toFixed(2)),
    timestamp: new Date().toISOString(),
    estimatedTime,
    status: 'confirmed',
    paymentLinkSent: false
  };
  
  console.log('Order object created:', {
    orderNumber: order.orderNumber,
    restaurantId: order.restaurantId,
    customerName: order.customerName,
    itemsCount: order.items.length,
    total: order.orderTotal
  });
  
  // Save the order to the database
  try {
    console.log('Attempting to save order to database...');
    const savedOrder = await saveOrderToDatabase(order, auth0User);
    console.log(`Order #${orderNumber} saved to database with ID: ${savedOrder.dbOrderId}`);
    return savedOrder;
  } catch (error) {
    console.error(`Failed to save order #${orderNumber} to database:`, error);
    return order;
  }
}
