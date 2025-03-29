// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Order service for handling order placement and processing
 */

import { sendOrderNotification } from './restaurantUtils.js';

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
  items: OrderItem[];
  orderTotal: number;
  timestamp: string;
  estimatedTime: number;
  status: string;
}

/**
 * Place an order with a restaurant
 * 
 * @param restaurantId ID of the restaurant
 * @param customerName Name of the customer
 * @param items Items in the order
 * @param customerEmail Optional email for confirmation
 * @returns Order details
 */
export async function placeOrder(
  restaurantId: string,
  customerName: string,
  items: OrderItem[],
  customerEmail?: string
): Promise<OrderDetails> {
  // Generate order details
  const orderNumber = Math.floor(Math.random() * 10000) + 1000;
  const estimatedTime = Math.floor(Math.random() * 10) + 5; // 5-15 minutes
  
  // Calculate order total
  const orderTotal = items.reduce((total, item) => {
    return total + ((item.price || 0) * item.quantity);
  }, 0);
  
  // Create order object
  const order: OrderDetails = {
    orderNumber,
    restaurantId,
    restaurantName: '', // Will be filled in by sendOrderNotification
    customerName,
    customerEmail,
    items,
    orderTotal: parseFloat(orderTotal.toFixed(2)),
    timestamp: new Date().toISOString(),
    estimatedTime,
    status: 'confirmed'
  };
  
  // Log the order
  console.log(`New order #${orderNumber} placed:`, {
    restaurantId,
    customerName,
    items: items.map(item => `${item.quantity}x ${item.name}`).join(', '),
    total: order.orderTotal
  });
  
  return order;
}
