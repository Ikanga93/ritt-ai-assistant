import React, { useEffect, useState } from 'react';
import useCombinedTranscriptions from '@/hooks/useCombinedTranscriptions';

const PaymentBanner: React.FC = () => {
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const combinedTranscriptions = useCombinedTranscriptions();

  useEffect(() => {
    // Look for payment URLs in the transcriptions
    const findPaymentUrl = () => {
      for (const segment of combinedTranscriptions) {
        if (segment.role === 'assistant') {
          // Check if this message contains payment-related text
          if (
            segment.text.includes('payment link') || 
            segment.text.includes('pay for your order') ||
            segment.text.includes('complete your payment') ||
            segment.text.includes('stripe.com')
          ) {
            // Normalize the text by replacing newlines with spaces
            const normalizedText = segment.text.replace(/\n/g, ' ');
            
            // Try to extract a Stripe URL using various patterns
            let url: string | null = null;
            
            // Pattern 1: Complete Stripe URL
            const stripeUrlMatch = normalizedText.match(/(https?:\/\/buy\.stripe\.com\/[^\s]+)/i);
            if (stripeUrlMatch) {
              url = stripeUrlMatch[0];
            }
            
            // Pattern 2: URL broken across lines
            if (!url) {
              const urlStart = normalizedText.match(/(https?:\/\/buy\.[^\s]+)/i);
              const testIdMatch = normalizedText.match(/([.\w$]+\/test_[a-zA-Z0-9]+)/i);
              
              if (urlStart && testIdMatch) {
                url = urlStart[0].replace(/\.$/, '') + testIdMatch[0].replace(/^\.$/, '');
              }
            }
            
            // Clean up the URL if found
            if (url) {
              url = url.replace(/[.,;!?)]$/, '');
              setPaymentUrl(url);
              return;
            }
          }
        }
      }
    };
    
    findPaymentUrl();
  }, [combinedTranscriptions]);

  if (!paymentUrl) return null;

  return (
    <div className="sticky top-0 z-10 bg-gradient-to-r from-blue-500 to-blue-700 p-4 rounded-md shadow-md mb-4">
      <div className="flex flex-col items-center">
        <h3 className="text-white font-medium mb-2">Complete your payment to finish your order</h3>
        <a
          href={paymentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full max-w-md px-4 py-2 bg-white text-blue-700 rounded-md hover:bg-gray-100 transition-colors duration-200 text-center font-bold"
        >
          Pay Now
        </a>
      </div>
    </div>
  );
};

export default PaymentBanner;
