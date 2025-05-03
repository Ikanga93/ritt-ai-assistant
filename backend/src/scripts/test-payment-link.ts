/**
 * Test script for payment link generation
 * 
 * This script creates a temporary order and generates a payment link for it.
 * Run with: npx tsx src/scripts/test-payment-link.ts
 */

import dotenv from 'dotenv';
import { temporaryOrderService } from '../services/temporaryOrderService.js';
import { generateOrderPaymentLink } from '../services/orderPaymentLinkService.js';
import { verifyStripeConfiguration, stripe } from '../services/paymentService.js';

// Enable debug mode for detailed logging
const DEBUG = true;

// Load environment variables
dotenv.config();

async function testPaymentLinkGeneration() {
  console.log('\n=== Payment Link Generation Test ===\n');
  
  try {
    // Print environment variables (without sensitive data)
    if (DEBUG) {
      console.log('Environment variables:');
      console.log(`STRIPE_SECRET_KEY exists: ${!!process.env.STRIPE_SECRET_KEY}`);
      console.log(`STRIPE_WEBHOOK_SECRET exists: ${!!process.env.STRIPE_WEBHOOK_SECRET}`);
      console.log(`STRIPE_PAYMENT_LINK_EXPIRATION_DAYS: ${process.env.STRIPE_PAYMENT_LINK_EXPIRATION_DAYS || 'not set'}`);
      console.log(`STRIPE_PAYMENT_LINK_DEFAULT_CURRENCY: ${process.env.STRIPE_PAYMENT_LINK_DEFAULT_CURRENCY || 'not set'}`);
    }
    
    // First verify Stripe configuration
    console.log('\nVerifying Stripe configuration...');
    const isStripeConfigured = await verifyStripeConfiguration();
    
    if (!isStripeConfigured) {
      console.error('Stripe is not properly configured. Please check your environment variables.');
      process.exit(1);
    }
    
    console.log('✅ Stripe configuration verified successfully');
    
    // Create a sample temporary order
    console.log('\nCreating a temporary order...');
    const sampleOrder = {
      customerName: 'Test Customer',
      customerEmail: 'test@example.com',
      restaurantId: 'rest-123',
      restaurantName: 'Test Restaurant',
      items: [
        {
          id: 'item-1',
          name: 'Burger',
          price: 9.99,
          quantity: 2
        },
        {
          id: 'item-2',
          name: 'Fries',
          price: 3.99,
          quantity: 1
        }
      ],
      total: 23.97,
      subtotal: 21.79,
      tax: 2.18
    };
    
    const createdOrder = temporaryOrderService.storeOrder(sampleOrder);
    console.log(`✅ Temporary order created with ID: ${createdOrder.id}`);
    
    // Generate a payment link for the order
    console.log('\nGenerating payment link...');
    
    if (DEBUG) {
      console.log('Stripe instance:', !!stripe);
      console.log('Payment link request parameters:');
      console.log({
        orderId: createdOrder.id,
        customerEmail: createdOrder.customerEmail,
        customerName: createdOrder.customerName,
        description: `Order from ${createdOrder.restaurantName}`,
        expirationHours: 48
      });
    }
    
    const orderWithPayment = await generateOrderPaymentLink({
      orderId: createdOrder.id,
      customerEmail: createdOrder.customerEmail,
      customerName: createdOrder.customerName,
      description: `Order from ${createdOrder.restaurantName}`,
      expirationHours: 48
    });
    
    if (DEBUG) {
      console.log('Order with payment result:');
      console.log(JSON.stringify(orderWithPayment, null, 2));
    }
    
    // Get payment metadata
    const paymentMetadata = orderWithPayment.metadata || {};
    
    // Calculate processing fees for display
    const processingFeePercentage = 0.029; // 2.9%
    const processingFeeFixed = 0.40; // $0.40
    const processingFeeAmount = (orderWithPayment.total * processingFeePercentage).toFixed(2);
    const totalProcessingFee = (parseFloat(processingFeeAmount) + processingFeeFixed).toFixed(2);
    const totalWithFees = (orderWithPayment.total + parseFloat(totalProcessingFee)).toFixed(2);
    const paymentLink = paymentMetadata.paymentLink;
    
    if (!paymentLink) {
      throw new Error('Failed to generate payment link');
    }
    
    console.log('\n=== Payment Link Generated Successfully ===');
    console.log(`Order ID: ${orderWithPayment.id}`);
    console.log(`Payment Link ID: ${paymentLink.id}`);
    console.log(`Payment Link URL: ${paymentLink.url}`);
    console.log(`Expires At: ${new Date(paymentLink.expiresAt * 1000).toLocaleString()}`);
    console.log(`Payment Status: ${paymentMetadata.paymentStatus || 'unknown'}`);
    console.log('\n=== Order Summary ===');
    console.log(`Subtotal: $${orderWithPayment.subtotal.toFixed(2)}`);
    console.log(`Tax: $${orderWithPayment.tax.toFixed(2)}`);
    console.log(`Order Total: $${orderWithPayment.total.toFixed(2)}`);
    console.log(`Processing Fees: $${totalProcessingFee}`);
    console.log(`Total with Fees: $${totalWithFees}`);
    
    console.log('\n✅ Test completed successfully');
    
    // Cleanup - uncomment this if you want to delete the test order
    // console.log('\nCleaning up test data...');
    // temporaryOrderService.deleteOrder(createdOrder.id);
    // console.log(`✅ Temporary order ${createdOrder.id} deleted`);
  } catch (error) {
    console.error('\n❌ Test failed:');
    if (error instanceof Error) {
      console.error(`Error message: ${error.message}`);
      console.error(`Stack trace: ${error.stack}`);
    } else {
      console.error(error);
    }
  }
}

// Run the test
testPaymentLinkGeneration();
