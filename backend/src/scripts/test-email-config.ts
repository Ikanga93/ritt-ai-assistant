/**
 * Email Configuration Test Script
 * 
 * This script tests the SendGrid configuration and email sending functionality.
 * Run with: npx tsx src/scripts/test-email-config.ts your-email@example.com
 */

import dotenv from 'dotenv';
import * as logger from '../utils/logger.js';
import sgMail from '@sendgrid/mail';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testEmailConfig() {
  console.log('\n=== Email Configuration Test ===\n');
  
  try {
    // Get test email from command line
    const testEmail = process.argv[2];
    
    if (!testEmail) {
      console.error('❌ Please provide your email address as a command line argument.');
      console.error('   Example: npx tsx src/scripts/test-email-config.ts your-email@example.com');
      process.exit(1);
    }
    
    console.log(`Using test email: ${testEmail}`);
    
    // Step 1: Check SendGrid API key
    console.log('\n1️⃣ Checking SendGrid API key...');
    const apiKey = process.env.SENDGRID_API_KEY;
    
    if (!apiKey) {
      console.error('❌ SENDGRID_API_KEY not found in environment variables.');
      console.error('   Please add it to your .env.local file.');
      process.exit(1);
    }
    
    console.log(`✅ SENDGRID_API_KEY found: ${apiKey.substring(0, 5)}...${apiKey.substring(apiKey.length - 5)}`);
    
    // Step 2: Check FROM_EMAIL
    console.log('\n2️⃣ Checking FROM_EMAIL...');
    const fromEmail = process.env.FROM_EMAIL;
    
    if (!fromEmail) {
      console.error('❌ FROM_EMAIL not found in environment variables.');
      console.error('   Please add it to your .env.local file.');
      process.exit(1);
    }
    
    console.log(`✅ FROM_EMAIL found: ${fromEmail}`);
    
    // Step 3: Check SENDGRID_FROM_NAME
    console.log('\n3️⃣ Checking SENDGRID_FROM_NAME...');
    const fromName = process.env.SENDGRID_FROM_NAME || 'Ritt Drive-Thru';
    console.log(`✅ SENDGRID_FROM_NAME: ${fromName}`);
    
    // Step 4: Check email templates
    console.log('\n4️⃣ Checking email templates...');
    const templatesDir = path.join(__dirname, '..', 'templates', 'emails');
    
    const templates = [
      'payment-link.html',
      'payment-link.txt',
      'payment-receipt.html',
      'payment-receipt.txt',
      'payment-reminder.html',
      'payment-reminder.txt'
    ];
    
    let allTemplatesExist = true;
    
    for (const template of templates) {
      const templatePath = path.join(templatesDir, template);
      if (fs.existsSync(templatePath)) {
        console.log(`✅ Template found: ${template}`);
      } else {
        console.error(`❌ Template missing: ${template}`);
        allTemplatesExist = false;
      }
    }
    
    if (!allTemplatesExist) {
      console.error('❌ Some email templates are missing. Please check the templates directory.');
      process.exit(1);
    }
    
    // Step 5: Test sending a simple email
    console.log('\n5️⃣ Testing email sending...');
    
    // Initialize SendGrid with API key
    sgMail.setApiKey(apiKey);
    
    // Prepare a simple test email
    const msg = {
      to: testEmail,
      from: {
        email: fromEmail,
        name: fromName
      },
      subject: 'Ritt Drive-Thru Email Test',
      text: 'This is a test email from Ritt Drive-Thru to verify email sending functionality.',
      html: '<strong>This is a test email from Ritt Drive-Thru</strong> to verify email sending functionality.'
    };
    
    console.log('Sending test email...');
    
    try {
      const [response] = await sgMail.send(msg);
      
      console.log(`✅ Test email sent successfully!`);
      console.log(`   Status code: ${response.statusCode}`);
      console.log(`   Message ID: ${response.headers['x-message-id']}`);
      
      console.log('\n✅ Email configuration test completed successfully!');
      console.log('\nIf you received the test email, your email configuration is working correctly.');
      console.log('If you did not receive the test email, please check your spam folder and SendGrid settings.');
    } catch (error: any) {
      console.error('❌ Failed to send test email:');
      console.error(error);
      
      if (error.response) {
        console.error('SendGrid API response:');
        console.error(error.response.body);
      }
      
      process.exit(1);
    }
    
  } catch (error: any) {
    console.error('\n❌ Test failed:');
    console.error(error);
    process.exit(1);
  }
}

// Run the test
testEmailConfig().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
