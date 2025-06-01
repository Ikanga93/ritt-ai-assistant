// Test cases for payment link extraction
const testCases = [
  {
    name: "Backend message format with payment link",
    input: {
      role: 'assistant',
      text: JSON.stringify({
        message: 'Sending payment link to user',
        paymentLink: 'https://buy.stripe.com/00wfZjgeY5BlaWygTT6oo0j',
        orderId: 'TEMP-1748751460683-0675',
        orderNumber: 'RITT-20250531-59883',
        timestamp: '2025-06-01T04:17:42.062Z'
      }),
      timestamp: '2025-06-01T04:17:42.062Z'
    },
    expected: 'https://buy.stripe.com/00wfZjgeY5BlaWygTT6oo0j'
  },
  {
    name: "Message with payment link in text",
    input: {
      role: 'assistant',
      text: "Here's your payment link: https://buy.stripe.com/00wfZjgeY5BlaWygTT6oo0j",
      timestamp: '2025-06-01T04:17:42.062Z'
    },
    expected: 'https://buy.stripe.com/00wfZjgeY5BlaWygTT6oo0j'
  },
  {
    name: "Payment button message",
    input: {
      role: 'assistant',
      text: "You'll see a payment button appear in our chat that you can click to complete your payment.",
      timestamp: '2025-06-01T04:17:42.062Z'
    },
    expected: 'PAYMENT_BUTTON_MESSAGE'
  },
  {
    name: "Order confirmation message",
    input: {
      role: 'assistant',
      text: "Thanks for confirming your order!",
      timestamp: '2025-06-01T04:17:42.062Z'
    },
    expected: null
  },
  {
    name: "Invalid JSON in message",
    input: {
      role: 'assistant',
      text: "{invalid json}",
      timestamp: '2025-06-01T04:17:42.062Z'
    },
    expected: null
  },
  {
    name: "Payment button message with different wording",
    input: {
      role: 'assistant',
      text: "A payment button will appear in the chat for you to complete your payment.",
      timestamp: '2025-06-01T04:17:42.062Z'
    },
    expected: 'PAYMENT_BUTTON_MESSAGE'
  },
  {
    name: "Full conversation flow with payment button",
    input: {
      role: 'assistant',
      text: "Thanks for confirming your order!\nYou'll see a payment button appear in our chat that you can click to complete your payment.\nYou'll also receive a payment link via email as a backup.\nOnce payment is confirmed, your order will be ready for pickup shortly after.\nHave a great day!",
      timestamp: '2025-06-01T04:17:42.062Z'
    },
    expected: 'PAYMENT_BUTTON_MESSAGE'
  }
];

function extractPaymentUrl(message) {
  console.log('\n=== EXTRACTING PAYMENT URL ===');
  console.log('Message:', message);
  console.log('Text length:', message.text.length);
  console.log('First 100 chars:', message.text.substring(0, 100));

  // Check for payment button message first
  const paymentButtonPatterns = [
    /payment button.*appear.*chat/i,
    /payment button.*show.*chat/i,
    /payment button.*display.*chat/i,
    /payment button.*click.*complete/i
  ];

  for (const pattern of paymentButtonPatterns) {
    if (pattern.test(message.text)) {
      console.log('Found payment button message');
      return 'PAYMENT_BUTTON_MESSAGE';
    }
  }

  try {
    // First try to parse the text as JSON
    const jsonMatch = message.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[0];
      const data = JSON.parse(jsonStr);
      if (data.paymentLink) {
        console.log('Found payment link in JSON:', data.paymentLink);
        return data.paymentLink;
      }
    }

    // Then try to find URL in text
    const urlPattern = /(https?:\/\/[^\s]+)/;
    const patternMatches = message.text.match(urlPattern);
    console.log('Pattern matches:', patternMatches);
    
    if (patternMatches && patternMatches[0]) {
      const url = patternMatches[0];
      if (url.includes('stripe.com') || url.includes('payment')) {
        console.log('Found valid payment URL:', url);
        return url;
      }
    }
  } catch (error) {
    console.error('Error extracting payment URL:', error);
  }

  console.log('No valid payment URL found in text');
  return null;
}

// Run tests
console.log('Running payment link extraction tests...\n');

testCases.forEach((testCase, index) => {
  console.log(`\nTest Case ${index + 1}: ${testCase.name}`);
  console.log('Input:', JSON.stringify(testCase.input, null, 2));
  const result = extractPaymentUrl(testCase.input);
  console.log('Result:', result);
  console.log('Expected:', testCase.expected);
  console.log('Test', result === testCase.expected ? 'PASSED' : 'FAILED');
}); 