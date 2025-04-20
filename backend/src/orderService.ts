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
 * @returns Order details
 */
export async function placeOrder(
  restaurantId: string,
  customerName: string,
  items: OrderItem[],
  customerEmail?: string,
  customerPhone?: string
): Promise<OrderDetails> {
  // Generate order details
  const orderNumber = Math.floor(Math.random() * 10000) + 1000;
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
    customerPhone, // Include phone number for SMS payment
    items: itemsWithPrices,
    subtotal: parseFloat(subtotal.toFixed(2)),
    stateTax: parseFloat(stateTax.toFixed(2)),
    orderTotal: parseFloat(orderTotal.toFixed(2)),
    processingFee: parseFloat(processingFee.toFixed(2)), // Hidden from customer
    timestamp: new Date().toISOString(),
    estimatedTime,
    status: 'confirmed',
    paymentLinkSent: false // Initialize as not sent
  };
  
  // Log the order
  console.log(`New order #${orderNumber} placed:`, {
    restaurantId,
    customerName,
    items: items.map(item => `${item.quantity}x ${item.name}`).join(', '),
    total: order.orderTotal
  });
  
  // Save the order to the database
  try {
    const savedOrder = await saveOrderToDatabase(order);
    console.log(`Order #${orderNumber} saved to database with ID: ${savedOrder.dbOrderId}`);
    return savedOrder; // Return the order with the database ID
  } catch (error) {
    console.error(`Failed to save order #${orderNumber} to database:`, error);
    // Still return the original order even if database save fails
    return order;
  }
}
