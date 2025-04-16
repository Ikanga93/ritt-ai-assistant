// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Test script to demonstrate how to use payment markers in chat responses
 */
import { OrderDetails } from './orderService.js';
import { 
  addPaymentMarkerToResponse, 
  containsPaymentMarker, 
  extractPaymentInfo 
} from './paymentResponseEnhancer.js';

// Sample order for testing
const sampleOrder: OrderDetails = {
  orderNumber: 1234,
  restaurantId: 'micro_dose',
  restaurantName: 'Micro Dose',
  customerName: 'John Doe',
  items: [
    { name: 'Espresso', quantity: 2, price: 3.50 },
    { name: 'Croissant', quantity: 1, price: 4.25 }
  ],
  subtotal: 11.25,
  stateTax: 1.01,
  orderTotal: 12.26,
  timestamp: new Date().toISOString(),
  estimatedTime: 10,
  status: 'confirmed'
};

// Test adding payment markers to different types of responses
function testPaymentMarkers() {
  console.log('\n=== Testing Payment Markers ===\n');
  
  // Test 1: Response with payment phrase
  const response1 = "Your order has been confirmed. Your total is $12.26. Would you like anything else?";
  const markedResponse1 = addPaymentMarkerToResponse(response1, sampleOrder);
  console.log('Original response:', response1);
  console.log('Marked response:', markedResponse1);
  console.log('Contains marker:', containsPaymentMarker(markedResponse1));
  console.log('Extracted info:', extractPaymentInfo(markedResponse1));
  
  // Test 2: Response without payment phrase
  const response2 = "Thank you for your order! We'll have it ready in about 10 minutes.";
  const markedResponse2 = addPaymentMarkerToResponse(response2, sampleOrder);
  console.log('\nOriginal response:', response2);
  console.log('Marked response:', markedResponse2);
  console.log('Contains marker:', containsPaymentMarker(markedResponse2));
  console.log('Extracted info:', extractPaymentInfo(markedResponse2));
  
  // Test 3: Response that already has a marker
  const response3 = "Your order total is $12.26. [PAYMENT_BUTTON:1234:12.26]";
  const markedResponse3 = addPaymentMarkerToResponse(response3, sampleOrder);
  console.log('\nOriginal response:', response3);
  console.log('Marked response:', markedResponse3);
  console.log('Contains marker:', containsPaymentMarker(markedResponse3));
  console.log('Extracted info:', extractPaymentInfo(markedResponse3));
  
  console.log('\n=== End of Tests ===\n');
}

// Run the tests
testPaymentMarkers();
