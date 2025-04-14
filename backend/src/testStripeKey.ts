// Test Stripe API Key Loading
// This script tests if the Stripe API key is properly loaded from environment variables

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Stripe from 'stripe';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
console.log('Loading environment variables from:', path.join(__dirname, '../.env.local'));
dotenv.config({ path: path.join(__dirname, '../.env.local') });

// Log all environment variables (for debugging)
console.log('\nEnvironment Variables:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? '✅ Set' : '❌ Not set');
console.log('STRIPE_PUBLISHABLE_KEY:', process.env.STRIPE_PUBLISHABLE_KEY ? '✅ Set' : '❌ Not set');
console.log('STRIPE_WEBHOOK_SECRET:', process.env.STRIPE_WEBHOOK_SECRET ? '✅ Set' : '❌ Not set');

// Use a fallback test key if needed
const FALLBACK_TEST_KEY = 'sk_test_51R5kZQP4sLIsXeNy3uDv4DnTwD0h2WXfsv6Mp5Ee2felNv3zet4lCejwBdkqzGyoRo6tbfL7RG2ASSAgJH8B83GN00YSvfj4mA';

try {
  // Try to initialize Stripe with the API key from environment variables
  console.log('\nTrying to initialize Stripe with environment variable...');
  const stripeEnv = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2025-03-31.basil' as any,
  });
  console.log('✅ Stripe initialized successfully with environment variable');
} catch (error) {
  console.error('❌ Failed to initialize Stripe with environment variable:', error.message);
}

try {
  // Try to initialize Stripe with the fallback test key
  console.log('\nTrying to initialize Stripe with fallback test key...');
  const stripeFallback = new Stripe(FALLBACK_TEST_KEY, {
    apiVersion: '2025-03-31.basil' as any,
  });
  console.log('✅ Stripe initialized successfully with fallback test key');
} catch (error) {
  console.error('❌ Failed to initialize Stripe with fallback test key:', error.message);
}

// Test if we can create a Stripe instance with a direct key
try {
  console.log('\nTrying to initialize Stripe with a direct test key...');
  const stripeDirectKey = new Stripe('sk_test_example', {
    apiVersion: '2025-03-31.basil' as any,
  });
  console.log('✅ Stripe initialized successfully with direct test key');
} catch (error) {
  console.error('❌ Failed to initialize Stripe with direct test key:', error.message);
}
