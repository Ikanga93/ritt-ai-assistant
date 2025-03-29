// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import { sendOrderNotification } from './restaurantUtils.js';

/**
 * Test script for email notifications with the updated configuration
 */
async function testOrderEmailWithConfig() {
  console.log('Testing order email notification with updated configuration...');

  // Create a sample order for Micro Dose
  const sampleOrder = {
    orderNumber: 12345,
    restaurantId: 'micro_dose',
    restaurantName: 'Micro Dose',
    customerName: 'Test Customer',
    customerEmail: 'customer@example.com',
    items: [
      {
        id: 'micro_dose_the_quickie_0',
        name: 'The Quickie',
        quantity: 2,
        price: 7.00,
        specialInstructions: 'Extra sweet'
      },
      {
        id: 'micro_dose_iced_latte_0',
        name: 'Iced Latte',
        quantity: 1,
        price: 5.50
      }
    ],
    orderTotal: 19.50,
    timestamp: new Date().toISOString(),
    estimatedTime: 10,
    status: 'confirmed'
  };

  // Send the test order notification
  try {
    console.log('Sending order notification to Micro Dose...');
    const result = await sendOrderNotification('micro_dose', sampleOrder);
    console.log('Email notification result:', result ? 'Success' : 'Failed');
  } catch (error) {
    console.error('Error sending test email:', error);
  }
}

// Run the test
testOrderEmailWithConfig().then(() => {
  console.log('Test completed');
}).catch(error => {
  console.error('Test failed:', error);
});
