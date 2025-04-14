import React from 'react';

interface PaymentMessageProps {
  text: string;
  paymentUrl?: string;
}

/**
 * A specialized component for displaying payment information in the chat
 * This component extracts and formats payment URLs from the message text
 */
const PaymentMessage: React.FC<PaymentMessageProps> = ({ text, paymentUrl }) => {
  // Extract the payment URL from the text if not explicitly provided
  const extractedUrl = paymentUrl || extractPaymentUrl(text);
  
  return (
    <div className="payment-message">
      <div className="mb-2">I've created a secure payment link for your order.</div>
      {extractedUrl && (
        <div className="mt-2 mb-3">
          <a
            href={extractedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors duration-200 text-center no-underline"
            style={{ 
              whiteSpace: 'nowrap', 
              overflow: 'hidden', 
              textOverflow: 'ellipsis',
              wordBreak: 'normal'
            }}
          >
            Complete Payment
          </a>
        </div>
      )}
      <div className="mt-2">After payment, please proceed to the pickup window.</div>
    </div>
  );
};

/**
 * Extract a payment URL from the message text
 */
function extractPaymentUrl(text: string): string | null {
  // Normalize text by replacing newlines with spaces to handle broken links
  const normalizedText = text.replace(/\n/g, ' ');
  
  // Try different patterns to extract the URL
  
  // Pattern 0: Extract URL from <payment-url> tags (production-safe format)
  const paymentUrlTagMatch = normalizedText.match(/<payment-url>(https?:\/\/[^<]+)<\/payment-url>/i);
  if (paymentUrlTagMatch) {
    return paymentUrlTagMatch[1];
  }
  
  // Pattern 1: Complete Stripe URL
  const stripeUrlMatch = normalizedText.match(/https?:\/\/buy\.stripe\.[^\s]+\/test_[a-zA-Z0-9]+/i);
  if (stripeUrlMatch) {
    return stripeUrlMatch[0];
  }
  
  // Pattern 2: Complete Markdown link format [text](url)
  const markdownMatch = normalizedText.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
  if (markdownMatch) {
    return markdownMatch[2];
  }
  
  // Pattern 2: Broken Markdown link - [this link]( followed by URL on next line(s)
  if (normalizedText.includes('[this link](')) {
    // Find the opening part
    const openingPart = normalizedText.match(/\[this link\]\(/);
    if (openingPart) {
      // Look for Stripe URL pattern anywhere in the text
      const stripeUrlPattern = /(https?:\/\/buy\.stripe\.com\/[^\s)]+|stripe\.\$\d\/test_[a-zA-Z0-9]+)/i;
      const stripeMatch = normalizedText.match(stripeUrlPattern);
      
      if (stripeMatch) {
        console.log('Found Stripe URL in broken markdown:', stripeMatch[0]);
        return stripeMatch[0].replace(/\)$/, '');
      }
      
      // If we found [this link]( but no URL, look for test_ID pattern
      const testIdMatch = normalizedText.match(/test_[a-zA-Z0-9]+/i);
      if (testIdMatch) {
        // Reconstruct the URL
        const reconstructedUrl = `https://buy.stripe.com/${testIdMatch[0]}`;
        console.log('Reconstructed URL from test ID:', reconstructedUrl);
        return reconstructedUrl;
      }
    }
  }
  
  // Pattern 3: Complete Stripe URL (alternative format)
  const stripeUrlMatch2 = normalizedText.match(/https?:\/\/buy\.stripe\.[^\s]+\/test_[a-zA-Z0-9]+/i);
  if (stripeUrlMatch2) {
    return stripeUrlMatch2[0];
  }
  
  // Pattern 4: URL split into parts
  const urlStartMatch = normalizedText.match(/(https?:\/\/buy\.[^\s]+)/i);
  const urlEndMatch = normalizedText.match(/([.\w$]+\/test_[a-zA-Z0-9]+)/i);
  
  if (urlStartMatch && urlEndMatch) {
    const urlStart = urlStartMatch[0].replace(/\.$/, '');
    const urlEnd = urlEndMatch[0].replace(/^\.$/, '');
    
    // Check if the start already contains the end
    if (urlStart.includes('test_')) {
      return urlStart;
    } else {
      // Otherwise combine them
      return urlStart + urlEnd;
    }
  }
  
  // Pattern 5: Stripe domain with test ID
  const stripeDomainMatch = normalizedText.match(/stripe\.\$\d\/test_[a-zA-Z0-9]+/i);
  if (stripeDomainMatch) {
    // Replace the $2 with .com to fix the URL
    const fixedUrl = stripeDomainMatch[0].replace(/stripe\.\$\d/, 'stripe.com');
    return `https://buy.${fixedUrl}`;
  }
  
  // Pattern 6: Any URL
  const urlMatch = normalizedText.match(/(https?:\/\/[^\s]+)/i);
  if (urlMatch) {
    return urlMatch[0].replace(/[.,;!?)]$/, '');
  }
  
  // Pattern 7: Just test ID
  const testIdOnlyMatch = normalizedText.match(/test_[a-zA-Z0-9]+/i);
  if (testIdOnlyMatch) {
    return `https://buy.stripe.com/${testIdOnlyMatch[0]}`;
  }
  
  // If no URL found but the message contains [payment link], create a dummy URL for testing
  // In production, this should be replaced with actual payment URL from backend
  if (normalizedText.includes('[payment link]') || normalizedText.includes('[this link]')) {
    // For testing purposes only - in production this should come from backend
    return 'https://buy.stripe.com/test_payment_link';
  }
  
  return null;
}

/**
 * Remove the URL from the message text
 */
function removeUrlFromText(text: string): string {
  // Remove <payment-url> tags and their contents
  let cleanText = text.replace(/<payment-url>.*?<\/payment-url>/g, '');
  
  // Remove plain URLs
  cleanText = cleanText.replace(/https?:\/\/[^\s\n]+/g, '');
  
  // Clean up any double spaces or trailing/leading spaces
  cleanText = cleanText.replace(/\s+/g, ' ').trim();
  
  return cleanText;
}

export default PaymentMessage;
