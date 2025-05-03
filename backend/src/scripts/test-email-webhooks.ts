/**
 * Email Webhook Testing Script
 * 
 * This script tests the email webhook functionality by:
 * 1. Simulating SendGrid webhook events
 * 2. Testing email delivery status tracking
 * 3. Generating email delivery reports
 */

import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import * as logger from '../utils/logger.js';
import { 
  getEmailTrackingInfo, 
  updateEmailDeliveryStatus,
  generateEmailDeliveryReport,
  EmailStatus 
} from '../services/emailService.js';
import { temporaryOrderService } from '../services/temporaryOrderService.js';
import { sendPaymentLinkEmail } from '../services/orderEmailService.js';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Test email delivery status tracking
 */
async function testEmailStatusTracking() {
  console.log('🧪 Testing email delivery status tracking...');
  
  // Create a test message ID
  const testMessageId = `test-${Date.now()}`;
  
  // Update status to different states
  await updateEmailDeliveryStatus(testMessageId, 'sent', Date.now());
  console.log('✅ Updated status to: sent');
  
  await updateEmailDeliveryStatus(testMessageId, 'delivered', Date.now() + 1000);
  console.log('✅ Updated status to: delivered');
  
  await updateEmailDeliveryStatus(testMessageId, 'opened', Date.now() + 60000);
  console.log('✅ Updated status to: opened');
  
  await updateEmailDeliveryStatus(testMessageId, 'clicked', Date.now() + 120000);
  console.log('✅ Updated status to: clicked');
  
  // Get the tracking info
  const trackingInfo = getEmailTrackingInfo(testMessageId);
  console.log('📊 Email tracking info:', JSON.stringify(trackingInfo, null, 2));
  
  if (trackingInfo?.status === 'clicked') {
    console.log('✅ Email status tracking is working correctly');
  } else {
    console.error('❌ Email status tracking is not working correctly');
  }
}

/**
 * Test webhook simulation
 */
async function testWebhookSimulation() {
  console.log('🧪 Testing webhook simulation...');
  
  // Check if webhook URL is provided
  const webhookUrl = process.env.WEBHOOK_URL || 'http://localhost:3000/webhooks/sendgrid';
  
  // Create a test message ID
  const testMessageId = `test-${Date.now()}`;
  const testEmail = process.env.TEST_EMAIL || 'test@example.com';
  
  // Create sample webhook events
  const events = [
    {
      sg_message_id: testMessageId,
      email: testEmail,
      timestamp: Math.floor(Date.now() / 1000),
      event: 'delivered'
    },
    {
      sg_message_id: testMessageId,
      email: testEmail,
      timestamp: Math.floor(Date.now() / 1000) + 60,
      event: 'open'
    },
    {
      sg_message_id: testMessageId,
      email: testEmail,
      timestamp: Math.floor(Date.now() / 1000) + 120,
      event: 'click'
    }
  ];
  
  // Send webhook events to the endpoint
  try {
    console.log(`Sending webhook events to: ${webhookUrl}`);
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(events)
    });
    
    if (response.ok) {
      console.log(`✅ Webhook events sent successfully. Status: ${response.status}`);
      const responseData = await response.json();
      console.log('📊 Response:', responseData);
    } else {
      console.error(`❌ Failed to send webhook events. Status: ${response.status}`);
      const errorText = await response.text();
      console.error('Error:', errorText);
    }
  } catch (error) {
    console.error('❌ Error sending webhook events:', error);
  }
}

/**
 * Test email delivery reporting
 */
async function testEmailDeliveryReporting() {
  console.log('🧪 Testing email delivery reporting...');
  
  // Check if test email is provided
  const testEmail = process.env.TEST_EMAIL || process.argv[2];
  
  if (!testEmail) {
    console.error('❌ No test email provided. Please set TEST_EMAIL in .env.local or provide as argument.');
    return;
  }
  
  // Create a test order
  const testOrder = temporaryOrderService.createOrder({
    customerName: 'Test Customer',
    customerEmail: testEmail,
    restaurantId: 'rest-123',
    restaurantName: 'Test Restaurant',
    items: [
      { name: 'Burger', price: 9.99, quantity: 1 }
    ],
    subtotal: 9.99,
    tax: 0.80,
    total: 10.79
  });
  
  console.log(`Created test order with ID: ${testOrder.id}`);
  
  // Send a test email
  try {
    console.log('Sending test email...');
    const emailResult = await sendPaymentLinkEmail(
      testOrder,
      'https://example.com/pay/test-link',
      Math.floor(Date.now() / 1000) + (48 * 60 * 60)
    );
    
    if (emailResult.success) {
      console.log(`✅ Test email sent successfully. Message ID: ${emailResult.messageId}`);
      
      // Simulate email delivery events
      if (emailResult.messageId) {
        await updateEmailDeliveryStatus(emailResult.messageId, 'delivered', Date.now() + 1000);
        console.log('✅ Simulated delivery event');
        
        await updateEmailDeliveryStatus(emailResult.messageId, 'opened', Date.now() + 60000);
        console.log('✅ Simulated open event');
        
        // Generate a delivery report
        const report = generateEmailDeliveryReport(testOrder.id);
        console.log('📊 Email delivery report:', JSON.stringify(report, null, 2));
      }
    } else {
      console.error('❌ Failed to send test email:', emailResult.error);
    }
  } catch (error) {
    console.error('❌ Error in email delivery reporting test:', error);
  }
}

/**
 * Test end-to-end email flow with webhook events
 */
async function testEndToEndFlow() {
  console.log('🧪 Testing end-to-end email flow with webhook events...');
  
  // Check if test email is provided
  const testEmail = process.env.TEST_EMAIL || process.argv[2];
  
  if (!testEmail) {
    console.error('❌ No test email provided. Please set TEST_EMAIL in .env.local or provide as argument.');
    return;
  }
  
  // Create a test order
  const testOrder = temporaryOrderService.createOrder({
    customerName: 'Test Customer',
    customerEmail: testEmail,
    restaurantId: 'rest-123',
    restaurantName: 'Test Restaurant',
    items: [
      { name: 'Burger', price: 9.99, quantity: 1 },
      { name: 'Fries', price: 3.99, quantity: 1 }
    ],
    subtotal: 13.98,
    tax: 1.12,
    total: 15.10
  });
  
  console.log(`Created test order with ID: ${testOrder.id}`);
  
  // Send a test email
  try {
    console.log('Sending test email...');
    const emailResult = await sendPaymentLinkEmail(
      testOrder,
      'https://example.com/pay/test-link',
      Math.floor(Date.now() / 1000) + (48 * 60 * 60)
    );
    
    if (emailResult.success && emailResult.messageId) {
      console.log(`✅ Test email sent successfully. Message ID: ${emailResult.messageId}`);
      
      // Check if webhook URL is provided
      const webhookUrl = process.env.WEBHOOK_URL || 'http://localhost:3000/webhooks/sendgrid';
      
      // Create sample webhook events for this message
      const events = [
        {
          sg_message_id: emailResult.messageId,
          email: testEmail,
          timestamp: Math.floor(Date.now() / 1000),
          event: 'delivered'
        },
        {
          sg_message_id: emailResult.messageId,
          email: testEmail,
          timestamp: Math.floor(Date.now() / 1000) + 60,
          event: 'open'
        },
        {
          sg_message_id: emailResult.messageId,
          email: testEmail,
          timestamp: Math.floor(Date.now() / 1000) + 120,
          event: 'click'
        }
      ];
      
      // Send webhook events to the endpoint
      console.log(`Sending webhook events to: ${webhookUrl}`);
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(events)
      });
      
      if (response.ok) {
        console.log(`✅ Webhook events sent successfully. Status: ${response.status}`);
        
        // Wait a moment for webhook processing
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Generate a delivery report
        const report = generateEmailDeliveryReport(testOrder.id);
        console.log('📊 Email delivery report:', JSON.stringify(report, null, 2));
        
        if (report.clicked > 0) {
          console.log('✅ End-to-end email flow with webhooks is working correctly');
        } else {
          console.log('⚠️ End-to-end flow completed but email status may not be updated correctly');
        }
      } else {
        console.error(`❌ Failed to send webhook events. Status: ${response.status}`);
      }
    } else {
      console.error('❌ Failed to send test email:', emailResult.error);
    }
  } catch (error) {
    console.error('❌ Error in end-to-end test:', error);
  }
}

// Main function to run the tests
async function main() {
  const testType = process.argv[3] || 'all';
  
  try {
    if (testType === 'all' || testType === 'status') {
      await testEmailStatusTracking();
      console.log('\n');
    }
    
    if (testType === 'all' || testType === 'webhook') {
      await testWebhookSimulation();
      console.log('\n');
    }
    
    if (testType === 'all' || testType === 'report') {
      await testEmailDeliveryReporting();
      console.log('\n');
    }
    
    if (testType === 'all' || testType === 'e2e') {
      await testEndToEndFlow();
    }
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

// Display usage instructions
console.log(`
Usage: 
  pnpm tsx src/scripts/test-email-webhooks.ts [test-email] [test-type]
  
  test-email: Email address to send test emails to (optional if TEST_EMAIL is set in .env.local)
  test-type: Type of test to run (status, webhook, report, e2e, all) (default: all)
  
Examples:
  pnpm tsx src/scripts/test-email-webhooks.ts test@example.com status
  pnpm tsx src/scripts/test-email-webhooks.ts test@example.com webhook
  pnpm tsx src/scripts/test-email-webhooks.ts test@example.com report
  pnpm tsx src/scripts/test-email-webhooks.ts test@example.com e2e
  pnpm tsx src/scripts/test-email-webhooks.ts test@example.com all
`);
