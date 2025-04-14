// Test file for Stripe integration
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Stripe from 'stripe';

// Load environment variables from .env.local
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env.local');
dotenv.config({ path: envPath });

// Print loaded environment variables (without sensitive values)
console.log('Loaded environment variables:');
console.log('- STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? '✅ Set' : '❌ Not set');
console.log('- FRONTEND_URL:', process.env.FRONTEND_URL || '❌ Not set');

// Initialize Stripe directly
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_51R5kZQP4sLIsXeNy3uDv4DnTwD0h2WXfsv6Mp5Ee2felNv3zet4lCejwBdkqzGyoRo6tbfL7RG2ASSAgJH8B83GN00YSvfj4mA', {
  apiVersion: '2025-03-31.basil'
});

// Sample order details for testing
const sampleOrder = {
  orderNumber: 'TEST-' + Math.floor(Math.random() * 10000),
  customerName: 'Test Customer',
  restaurantName: 'Test Restaurant',
  orderTotal: 10.99, // $10.99
  items: [
    { name: 'Test Item', quantity: 1, price: 10.99 }
  ]
};

async function testStripeIntegration() {
  console.log('Testing Stripe Integration directly...');
  
  try {
    // Create a test product
    console.log('Creating test product...');
    const product = await stripe.products.create({
      name: `Test Product ${Math.floor(Math.random() * 10000)}`,
      description: 'Test product for Stripe integration',
    });
    console.log('✅ Product created:', product.id);
    
    // Create a test price
    console.log('Creating test price...');
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: 1099, // $10.99
      currency: 'usd',
    });
    console.log('✅ Price created:', price.id);
    
    // Create a payment link
    console.log('Creating test payment link...');
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{
        price: price.id,
        quantity: 1,
      }],
      after_completion: {
        type: 'redirect',
        redirect: {
          url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/order-confirmation?orderId=test-order`,
        },
      },
      metadata: {
        orderNumber: 'TEST-ORDER',
        customerName: 'Test Customer',
      },
    });
    
    console.log('✅ Successfully created payment link!');
    console.log('Payment Link URL:', paymentLink.url);
    console.log('Payment Link ID:', paymentLink.id);
    return true;
  } catch (error) {
    console.error('❌ Error testing Stripe integration:', error);
    return false;
  }
}

// Run the test if this file is executed directly
testStripeIntegration()
  .then(success => {
    console.log('Test completed, success:', success);
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unexpected error during test:', error);
    process.exit(1);
  });
