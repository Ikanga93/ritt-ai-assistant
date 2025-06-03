import React, { useEffect, useState } from 'react';
import usePaymentChannel from '../hooks/usePaymentChannel';

interface PaymentButtonProps {
  paymentLink?: string;
  className?: string;
}

export const PaymentButton: React.FC<PaymentButtonProps> = ({ paymentLink, className }) => {
  const [link, setLink] = useState<string>('');
  const { paymentData } = usePaymentChannel();

  // Log when the component renders and what payment link it receives
  useEffect(() => {
    console.log('PaymentButton rendered with prop link:', paymentLink);
    console.log('PaymentButton has paymentData:', !!paymentData);
    
    // Priority 1: Use the payment link from props if available
    if (paymentLink) {
      console.log('Using payment link from props:', paymentLink);
      setLink(paymentLink);
    } 
    // Priority 2: Use the payment link from the payment channel
    else if (paymentData?.paymentLink) {
      console.log('Using payment link from payment channel:', paymentData.paymentLink);
      setLink(paymentData.paymentLink);
    }
    // Priority 3: Check localStorage as a fallback
    else if (typeof window !== 'undefined') {
      try {
        const storedLink = localStorage.getItem('latestPaymentUrl');
        if (storedLink) {
          console.log('Using payment link from localStorage:', storedLink);
          setLink(storedLink);
        }
        
        if (!storedLink) {
          const storedOrder = localStorage.getItem('currentOrder');
          if (storedOrder) {
            try {
              const orderData = JSON.parse(storedOrder);
              if (orderData.paymentLink) {
                console.log('Using payment link from stored order:', orderData.paymentLink);
                setLink(orderData.paymentLink);
              }
            } catch (parseError) {
              console.error('Error parsing stored order:', parseError);
            }
          }
        }
      } catch (error) {
        console.error('Error reading from localStorage:', error);
      }
    }
  }, [paymentLink, paymentData]);

  const handleClick = () => {
    // Log the click and what URL we're opening
    console.log('Payment button clicked, opening URL:', link);
    if (!link) {
      console.error('No payment link available');
      alert('Sorry, the payment link is not available. Please check your email for the payment link.');
      return;
    }

    // Process the URL to ensure it's properly formatted
    let processedUrl = link;
    
    // Check if this contains PAYMENT_DATA: prefix and extract the JSON
    if (processedUrl.includes('PAYMENT_DATA:')) {
      try {
        const jsonStr = processedUrl.substring(processedUrl.indexOf('PAYMENT_DATA:') + 'PAYMENT_DATA:'.length);
        console.log('Extracted JSON string from PAYMENT_DATA:', jsonStr);
        const data = JSON.parse(jsonStr);
        if (data.paymentLink) {
          processedUrl = data.paymentLink;
          console.log('Extracted payment link from PAYMENT_DATA:', processedUrl);
        }
      } catch (error) {
        console.error('Error parsing PAYMENT_DATA:', error);
      }
    }
    
    // Check if this contains payment_link: prefix and extract the URL
    if (processedUrl.includes('payment_link:')) {
      processedUrl = processedUrl.substring(processedUrl.indexOf('payment_link:') + 'payment_link:'.length).trim();
      console.log('Extracted payment link from payment_link prefix:', processedUrl);
    }
    
    // Check if this contains "Your payment link:" and extract the URL
    if (processedUrl.includes('Your payment link:')) {
      processedUrl = processedUrl.substring(processedUrl.indexOf('Your payment link:') + 'Your payment link:'.length).trim();
      console.log('Extracted payment link from "Your payment link:" text:', processedUrl);
    }
    
    // Make sure the URL starts with http:// or https://
    if (!processedUrl.startsWith('http://') && !processedUrl.startsWith('https://')) {
      processedUrl = 'https://' + processedUrl;
      console.log('Added https:// prefix to URL:', processedUrl);
    }
    
    // Final validation
    if (!processedUrl.includes('stripe.com')) {
      console.warn('Payment URL does not contain stripe.com domain:', processedUrl);
    }
    
    // Navigate to the payment URL in the same tab - no popup blockers!
    console.log('Navigating to payment URL:', processedUrl);
    window.location.href = processedUrl;
  };

  const defaultClassName = "bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200";

  return (
    <button
      onClick={handleClick}
      className={className || defaultClassName}
      aria-label="Open payment link"
    >
      Pay Now
    </button>
  );
}
