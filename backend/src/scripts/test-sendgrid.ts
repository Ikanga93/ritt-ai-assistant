/**
 * Simple SendGrid Test Script
 * 
 * This script tests the SendGrid email sending functionality directly
 */

import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import sgMail from '@sendgrid/mail';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Main function to test SendGrid
async function testSendGrid() {
  // Get the API key from environment variables
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.FROM_EMAIL || 'gekuke1@ritt.ai';
  
  // Check if API key is available
  if (!apiKey) {
    console.error('❌ SendGrid API key not found in environment variables');
    console.error('Make sure SENDGRID_API_KEY is set in your .env.local file');
    return;
  }
  
  console.log(`API Key found: ${apiKey.substring(0, 10)}...`);
  
  // Initialize SendGrid with API key
  sgMail.setApiKey(apiKey);
  
  // Get the test email from command line arguments
  const testEmail = process.argv[2];
  
  if (!testEmail) {
    console.error('❌ No test email provided');
    console.error('Usage: pnpm tsx src/scripts/test-sendgrid.ts <test-email>');
    return;
  }
  
  console.log(`🧪 Testing SendGrid email sending to: ${testEmail}`);
  
  // Create a simple test email
  const msg = {
    to: testEmail,
    from: fromEmail,
    subject: 'Ritt Drive-Thru - SendGrid Test',
    text: 'This is a test email from Ritt Drive-Thru using SendGrid',
    html: '<strong>This is a test email from Ritt Drive-Thru using SendGrid</strong>',
  };
  
  try {
    // Send the email
    console.log('Sending email...');
    const response = await sgMail.send(msg);
    
    console.log('✅ Email sent successfully!');
    console.log(`Status code: ${response[0].statusCode}`);
    console.log(`Headers: ${JSON.stringify(response[0].headers, null, 2)}`);
  } catch (error) {
    console.error('❌ Error sending email:');
    console.error(error);
    
    if (error.response) {
      console.error('Error details:');
      console.error(error.response.body);
    }
  }
}

// Run the test
testSendGrid().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
