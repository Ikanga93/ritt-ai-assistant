// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import { sendOrderNotification } from './restaurantUtils.js';

/**
 * Test script for email notifications
 */
async function testOrderEmail() {
  console.log('Testing order email notification...');

  // Create a sample order
  const sampleOrder = {
    orderNumber: 12345,
    restaurantId: 'burger_joint',
    restaurantName: 'Burger Joint',
    customerName: 'Test Customer',
    customerEmail: 'customer@example.com',
    items: [
      {
        id: 'burger_joint_classic_burger_0',
        name: 'Classic Burger',
        quantity: 2,
        price: 8.99,
        specialInstructions: 'No onions, extra sauce'
      },
      {
        id: 'burger_joint_fries_0',
        name: 'French Fries',
        quantity: 1,
        price: 3.99
      }
    ],
    orderTotal: 21.97,
    timestamp: new Date().toISOString(),
    estimatedTime: 15,
    status: 'confirmed'
  };

  // Send the test order notification
  try {
    const result = await sendOrderNotification('burger_joint', sampleOrder);
    console.log('Email notification result:', result ? 'Success' : 'Failed');
  } catch (error) {
    console.error('Error sending test email:', error);
  }
}

// Run the test
testOrderEmail().then(() => {
  console.log('Test completed');
}).catch(error => {
  console.error('Test failed:', error);
});
