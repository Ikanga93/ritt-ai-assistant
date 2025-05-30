import React from 'react';

interface PaymentButtonProps {
  paymentLink: string;
}

export const PaymentButton: React.FC<PaymentButtonProps> = ({ paymentLink }) => {
  const handleClick = () => {
    // Ensure paymentLink is properly formatted and not empty
    if (!paymentLink) {
      console.error("Payment link is empty or undefined");
      alert("Payment link is not available. Please use the email link instead.");
      return;
    }
    
    console.log("Payment button clicked with URL:", paymentLink);
    
    let urlToOpen = paymentLink;
        
    // Check if this contains payment_link: prefix and extract the actual URL
    if (urlToOpen.startsWith('payment_link:')) {
      urlToOpen = urlToOpen.replace('payment_link:', '').trim();
      console.log("Extracted URL from payment_link prefix:", urlToOpen);
    }
    
    // Log if this is a test URL (only for debugging)
    const isTestUrl = urlToOpen.includes('test_');
    if (isTestUrl) {
      console.log("Test payment URL detected:", urlToOpen);
    }
    
    // Clean up the URL - trim whitespace and remove any trailing punctuation
    let cleanUrl = urlToOpen.trim();
    // Remove trailing punctuation that might have been captured by the regex
    cleanUrl = cleanUrl.replace(/[.,;:!?]+$/, '');
    
    // Make sure URL has http(s) prefix
    if (!cleanUrl.startsWith('http')) {
      cleanUrl = 'https://' + cleanUrl;
    }
    
    console.log("Opening payment URL:", cleanUrl);
    
    // Try to open the URL in a new tab
    const newWindow = window.open(cleanUrl, '_blank', 'noopener,noreferrer');
    
    // If window.open returns null, the popup was likely blocked
    if (!newWindow) {
      console.error("Popup blocked or could not open window. URL:", cleanUrl);
      alert("Please allow popups for this site to access the payment page.");
    }
  };

  return (
    <button
      onClick={handleClick}
      className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
      aria-label="Open payment link"
    >
      Pay Now
    </button>
  );
};
