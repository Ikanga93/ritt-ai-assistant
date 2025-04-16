// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * SMS service for sending payment links via Twilio
 */
import twilio from 'twilio';

// Twilio credentials from environment variables
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

// Initialize Twilio client
const client = twilio(accountSid, authToken);

/**
 * Send a payment link via SMS using Twilio
 * 
 * @param phoneNumber Customer's phone number (format: +1XXXXXXXXXX)
 * @param paymentUrl Stripe payment URL to send
 * @param orderNumber Order number for reference
 * @returns Promise with message SID if successful
 */
export async function sendPaymentLinkSMS(
  phoneNumber: string,
  paymentUrl: string,
  orderNumber: number
): Promise<string> {
  try {
    // Validate phone number format (basic check)
    if (!phoneNumber.startsWith('+')) {
      phoneNumber = `+1${phoneNumber.replace(/\D/g, '')}`;
    }

    console.log(`Sending payment link SMS to ${phoneNumber} for order #${orderNumber}`);
    
    // Create and send the SMS message
    const message = await client.messages.create({
      body: `Thank you for your order #${orderNumber} at Ritt Drive-Thru! Complete your payment here: ${paymentUrl}`,
      from: twilioPhone,
      to: phoneNumber,
    });
    
    console.log(`SMS sent successfully! Message SID: ${message.sid}`);
    return message.sid;
  } catch (error) {
    console.error('Error sending payment link SMS:', error);
    throw error;
  }
}

/**
 * Format a phone number for Twilio (ensure it has country code)
 * 
 * @param phoneNumber Phone number input from user
 * @returns Formatted phone number with country code
 */
export function formatPhoneNumber(phoneNumber: string): string {
  // Remove all non-digit characters
  const digitsOnly = phoneNumber.replace(/\D/g, '');
  
  // If it's a 10-digit US number without country code, add +1
  if (digitsOnly.length === 10) {
    return `+1${digitsOnly}`;
  }
  
  // If it already has country code (11 digits starting with 1)
  if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    return `+${digitsOnly}`;
  }
  
  // Otherwise, just ensure it has a + prefix
  return phoneNumber.startsWith('+') ? phoneNumber : `+${digitsOnly}`;
}
