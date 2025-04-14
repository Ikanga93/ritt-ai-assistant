// Test script for payment link generation
import { generatePaymentLink } from '../paymentIntegration.js';

// Test cases for payment link generation
const testCases = [
  {
    name: 'Valid order',
    params: {
      orderNumber: 'TEST-001',
      customerName: 'Test Customer',
      restaurantName: 'Test Restaurant',
      orderTotal: 24.99,
      items: [
        { name: 'Test Item 1', quantity: 2, price: 9.99 },
        { name: 'Test Item 2', quantity: 1, price: 5.01 }
      ]
    },
    expectSuccess: true
  },
  {
    name: 'Missing order number',
    params: {
      orderNumber: '',
      customerName: 'Test Customer',
      restaurantName: 'Test Restaurant',
      orderTotal: 24.99,
      items: [
        { name: 'Test Item 1', quantity: 2, price: 9.99 },
        { name: 'Test Item 2', quantity: 1, price: 5.01 }
      ]
    },
    expectSuccess: false
  },
  {
    name: 'NaN order total',
    params: {
      orderNumber: 'TEST-002',
      customerName: 'Test Customer',
      restaurantName: 'Test Restaurant',
      orderTotal: NaN,
      items: [
        { name: 'Test Item 1', quantity: 2, price: 9.99 },
        { name: 'Test Item 2', quantity: 1, price: 5.01 }
      ]
    },
    expectSuccess: false
  },
  {
    name: 'Negative order total',
    params: {
      orderNumber: 'TEST-003',
      customerName: 'Test Customer',
      restaurantName: 'Test Restaurant',
      orderTotal: -10.50,
      items: [
        { name: 'Test Item 1', quantity: 2, price: 9.99 },
        { name: 'Test Item 2', quantity: 1, price: 5.01 }
      ]
    },
    expectSuccess: false
  },
  {
    name: 'Item with NaN price',
    params: {
      orderNumber: 'TEST-004',
      customerName: 'Test Customer',
      restaurantName: 'Test Restaurant',
      orderTotal: 24.99,
      items: [
        { name: 'Test Item 1', quantity: 2, price: NaN },
        { name: 'Test Item 2', quantity: 1, price: 5.01 }
      ]
    },
    expectSuccess: false
  },
  {
    name: 'Item with negative price',
    params: {
      orderNumber: 'TEST-005',
      customerName: 'Test Customer',
      restaurantName: 'Test Restaurant',
      orderTotal: 24.99,
      items: [
        { name: 'Test Item 1', quantity: 2, price: -9.99 },
        { name: 'Test Item 2', quantity: 1, price: 5.01 }
      ]
    },
    expectSuccess: false
  },
  {
    name: 'Item with zero quantity',
    params: {
      orderNumber: 'TEST-006',
      customerName: 'Test Customer',
      restaurantName: 'Test Restaurant',
      orderTotal: 24.99,
      items: [
        { name: 'Test Item 1', quantity: 0, price: 9.99 },
        { name: 'Test Item 2', quantity: 1, price: 5.01 }
      ]
    },
    expectSuccess: false
  },
  {
    name: 'Order total mismatch',
    params: {
      orderNumber: 'TEST-007',
      customerName: 'Test Customer',
      restaurantName: 'Test Restaurant',
      orderTotal: 50.00, // Doesn't match item prices
      items: [
        { name: 'Test Item 1', quantity: 2, price: 9.99 },
        { name: 'Test Item 2', quantity: 1, price: 5.01 }
      ]
    },
    expectSuccess: false
  },
  {
    name: 'String as order total',
    params: {
      orderNumber: 'TEST-008',
      customerName: 'Test Customer',
      restaurantName: 'Test Restaurant',
      orderTotal: '24.99' as any, // Testing string conversion
      items: [
        { name: 'Test Item 1', quantity: 2, price: 9.99 },
        { name: 'Test Item 2', quantity: 1, price: 5.01 }
      ]
    },
    expectSuccess: true // Should work with string conversion
  }
];

// Run the tests
async function runTests() {
  console.log('Starting payment link generation tests...');
  console.log('========================================');
  
  let passCount = 0;
  let failCount = 0;
  
  for (const test of testCases) {
    console.log(`\nTest: ${test.name}`);
    console.log('----------------------------------------');
    
    try {
      const result = await generatePaymentLink(test.params);
      
      console.log('Result:', {
        success: result.success,
        error: result.error,
        code: result.code
      });
      
      if (result.success === test.expectSuccess) {
        console.log('✅ PASS');
        passCount++;
      } else {
        console.log('❌ FAIL - Expected success:', test.expectSuccess, 'but got:', result.success);
        failCount++;
      }
    } catch (error) {
      console.error('Test threw an exception:', error);
      console.log('❌ FAIL - Test should not throw exceptions');
      failCount++;
    }
  }
  
  console.log('\n========================================');
  console.log(`Test Summary: ${passCount} passed, ${failCount} failed`);
  console.log('========================================');
}

// Run the tests
runTests().catch(error => {
  console.error('Error running tests:', error);
});
