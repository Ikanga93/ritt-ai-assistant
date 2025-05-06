/**
 * Full Order Flow Test Script
 * 
 * This script tests the complete order flow from creation to payment link generation and email sending.
 * Run with: npx tsx src/scripts/test-full-order-flow.ts [test-email]
 */

import dotenv from 'dotenv';
import * as logger from '../utils/logger.js';
import { temporaryOrderService } from '../services/temporaryOrderService.js';
import { generateOrderPaymentLink } from '../services/orderPaymentLinkService.js';
import { sendPaymentLinkEmail } from '../services/orderEmailService.js';
import { verifyStripeConfiguration } from '../services/paymentService.js';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Comment out logger output for cleaner terminal display
// We'll keep the logger as is

async function testFullOrderFlow() {
  console.log('\n=== Full Order Flow Test ===\n');
  
  try {
    // Get test email from command line
    const testEmail = process.argv[2];
    
    if (!testEmail) {
      console.error('❌ Please provide your email address as a command line argument.');
      console.error('   Example: npx tsx src/scripts/test-full-order-flow.ts your-email@example.com');
      process.exit(1);
    }
    
    console.log(`Using test email: ${testEmail}`);
    
    // First verify Stripe configuration
    console.log('\nVerifying Stripe configuration...');
    const isStripeConfigured = await verifyStripeConfiguration();
    
    if (!isStripeConfigured) {
      console.error('❌ Stripe is not properly configured. Please check your environment variables.');
      process.exit(1);
    }
    
    console.log('✅ Stripe configuration verified successfully');
    
    // Step 1: Create an order (simulating voice assistant order creation)
    console.log('\n1️⃣ Creating a new order (simulating voice assistant)...');
    const sampleOrder = {
      customerName: 'Voice Test Customer',
      customerEmail: testEmail,
      restaurantId: 'rest-123',
      restaurantName: 'Test Restaurant',
      items: [
        {
          id: 'item-1',
          name: 'Cheeseburger',
          price: 10.99,
          quantity: 1
        },
        {
          id: 'item-2',
          name: 'French Fries',
          price: 4.99,
          quantity: 1
        },
        {
          id: 'item-3',
          name: 'Chocolate Shake',
          price: 5.99,
          quantity: 1
        }
      ],
      total: 21.97,
      subtotal: 19.97,
      tax: 2.00
    };
    
    const createdOrder = temporaryOrderService.storeOrder(sampleOrder);
    console.log(`✅ Order created with ID: ${createdOrder.id}`);
    console.log(`   Customer: ${createdOrder.customerName}`);
    console.log(`   Email: ${createdOrder.customerEmail}`);
    console.log(`   Total: $${createdOrder.total.toFixed(2)}`);
    
    // Step 2: Generate payment link
    console.log('\n2️⃣ Generating payment link...');
    const orderWithPayment = await generateOrderPaymentLink({
      orderId: createdOrder.id,
      customerEmail: createdOrder.customerEmail,
      customerName: createdOrder.customerName,
      description: `Order from ${createdOrder.restaurantName}`,
      expirationHours: 48
    });
    
    // Get payment metadata
    const paymentMetadata = orderWithPayment.metadata || {};
    const paymentLink = paymentMetadata.paymentLink;
    
    if (!paymentLink) {
      throw new Error('Failed to generate payment link');
    }
    
    console.log(`✅ Payment link generated successfully`);
    console.log(`   Payment Link ID: ${paymentLink.id}`);
    console.log(`   Payment Link URL: ${paymentLink.url}`);
    console.log(`   Expires At: ${new Date(paymentLink.expiresAt * 1000).toLocaleString()}`);
    
    // Step 3: Manually send payment link email
    console.log('\n3️⃣ Sending payment link email...');
    const emailResult = await sendPaymentLinkEmail(
      orderWithPayment,
      paymentLink.url,
      paymentLink.expiresAt
    );
    
    if (emailResult.success) {
      console.log(`✅ Payment link email sent successfully`);
      console.log(`   Message ID: ${emailResult.messageId}`);
      console.log(`   Sent to: ${orderWithPayment.customerEmail}`);
    } else {
      console.error(`❌ Failed to send payment link email: ${emailResult.error?.message}`);
    }
    
    // Check email status in order metadata
    const updatedOrder = temporaryOrderService.getOrder(createdOrder.id);
    const emailStatus = updatedOrder?.metadata?.emailStatus;
    
    console.log('\n4️⃣ Email status check:');
    if (emailStatus) {
      console.log(`   Payment Link Email Sent: ${emailStatus.paymentLinkEmailSent ? 'Yes' : 'No'}`);
      if (emailStatus.paymentLinkEmailSentAt) {
        console.log(`   Sent At: ${new Date(emailStatus.paymentLinkEmailSentAt).toLocaleString()}`);
      }
      if (emailStatus.paymentLinkEmailMessageId) {
        console.log(`   Message ID: ${emailStatus.paymentLinkEmailMessageId}`);
      }
      if (emailStatus.paymentLinkEmailError) {
        console.log(`   Error: ${emailStatus.paymentLinkEmailError}`);
      }
    } else {
      console.log('   No email status information available');
    }
    
    // Step 5: Verify SendGrid configuration
    console.log('\n5️⃣ Verifying SendGrid configuration:');
    console.log(`   SENDGRID_API_KEY exists: ${!!process.env.SENDGRID_API_KEY}`);
    console.log(`   FROM_EMAIL configured: ${process.env.FROM_EMAIL || 'Not set'}`);
    console.log(`   SENDGRID_FROM_NAME configured: ${process.env.SENDGRID_FROM_NAME || 'Not set'}`);
    
    console.log('\n✅ Test completed successfully');
    console.log('\nNOTE: To verify email delivery:');
    console.log('1. Check your inbox for the payment link email');
    console.log('2. If not received, check spam/junk folders');
    console.log('3. Verify SendGrid settings and API key');
    console.log('4. Check SendGrid Activity dashboard for delivery status');
    
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
testFullOrderFlow().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
