import useCombinedTranscriptions from "@/hooks/useCombinedTranscriptions";
import * as React from "react";
import type { JSX } from 'react';
import { useLocalParticipant, useRoomContext } from "@livekit/components-react";
import usePaymentChannel from '../hooks/usePaymentChannel';
import { PaymentButton } from "./PaymentButton";
import { useEffect } from "react";

// Define types for transcriptions
interface Transcription {
  role: string;
  id: string;
  text: string;
  language: string;
  startTime: number;
  endTime: number;
  final: boolean;
  firstReceivedTime: number;
  lastReceivedTime: number;
  receivedAtMediaTimestamp: number;
  receivedAt: number;
}

// Interface for the payment data structure sent from the backend
interface PaymentData {
  orderId: string;
  orderNumber: string;
  total: string;
  paymentLink: string;
  items: Array<{
    name: string;
    price: number;
    quantity: number;
    id?: string;
  }>;
  subtotal: number;
  tax: number;
  processingFee: number;
}

// Helper function to extract payment URLs from text messages
const extractPaymentUrl = (text: string): string | null => {
  console.log('=== EXTRACTING PAYMENT URL ===');
  console.log('Text length:', text.length);
  console.log('First 100 chars:', text.substring(0, 100));

  try {
    // First check for payment_link: format
    const paymentLinkPattern = /payment_link:\s*(https?:\/\/\S+)/i;
    const paymentLinkMatch = text.match(paymentLinkPattern);
    if (paymentLinkMatch && paymentLinkMatch[1]) {
      const url = paymentLinkMatch[1].trim();
      console.log('Found payment_link format:', url);
      return url;
    }
    
    // Then try to parse as JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
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
    const patternMatches = text.match(urlPattern);
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
};

export default function TranscriptionView(): JSX.Element {
  const combinedTranscriptions = useCombinedTranscriptions();
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  
  // Use the dedicated payment channel
  const { paymentData, clearPaymentData } = usePaymentChannel();
  
  // Centralized payment state management
  const [paymentState, setPaymentState] = React.useState<{
    url: string;
    source: 'channel' | 'message' | 'storage' | null;
    timestamp: number;
  }>({
    url: '',
    source: null,
    timestamp: 0
  });
  
  const [isOrderConfirmed, setIsOrderConfirmed] = React.useState<boolean>(false);
  
  // Single function to update payment link
  const updatePaymentLink = React.useCallback((url: string, source: 'channel' | 'message' | 'storage') => {
    if (!url) {
      console.log('updatePaymentLink called with empty URL, ignoring');
      return;
    }
    
    console.log(`\n=== UPDATING PAYMENT LINK ===`);
    console.log(`Source: ${source}`);
    console.log(`URL: ${url}`);
    
    setPaymentState(prev => {
      // Only update if this is a newer source or the same source with a newer timestamp
      if (prev.source === source && prev.timestamp > Date.now() - 1000) {
        console.log('Skipping update - same source and recent timestamp');
        return prev;
      }
      
      // Store in localStorage for persistence
      if (typeof window !== 'undefined') {
        localStorage.setItem('latestPaymentUrl', url);
        console.log('Stored payment URL in localStorage');
      }
      
      console.log('Updating payment state with new URL');
      return {
        url,
        source,
        timestamp: Date.now()
      };
    });
  }, []);

  // Add effect to log payment state changes
  React.useEffect(() => {
    console.log('\n=== PAYMENT STATE UPDATED ===');
    console.log('URL:', paymentState.url);
    console.log('Source:', paymentState.source);
    console.log('Timestamp:', new Date(paymentState.timestamp).toISOString());
  }, [paymentState]);
  
  // Process messages for payment links
  React.useEffect(() => {
    // Skip if we already have a payment URL from a reliable source
    if (paymentState.url && (paymentState.source === 'channel' || paymentState.source === 'storage')) {
      console.log("Payment URL already set from reliable source, skipping extraction");
      return;
    }
    
    console.log("\n=== PROCESSING MESSAGES FOR ORDER CONFIRMATION AND PAYMENT LINKS ===");
    console.log("Total messages:", combinedTranscriptions.length);
    
    // Process messages in reverse order (newest first)
    for (const message of [...combinedTranscriptions].reverse()) {
      if (!message.text) continue;
      
      console.log("\nProcessing message:", {
        role: message.role,
        text: message.text.substring(0, 100),
        timestamp: new Date(message.startTime).toISOString()
      });
      
      // Check for order confirmation messages
      if (message.role === 'assistant' && 
          (message.text.includes('order is confirmed') || 
           message.text.includes('order #') || 
           message.text.includes('Thanks for confirming your order'))) {
        console.log("Order confirmation detected in message:", message.text);
        setIsOrderConfirmed(true);
        
        // After order confirmation, check localStorage for the payment link
        if (typeof window !== 'undefined') {
          try {
            const storedOrder = localStorage.getItem('currentOrder');
            if (storedOrder) {
              const orderData = JSON.parse(storedOrder);
              if (orderData.paymentLink) {
                console.log('Found payment link in localStorage after order confirmation:', orderData.paymentLink);
                updatePaymentLink(orderData.paymentLink, 'storage');
                break;
              }
            }
          } catch (error) {
            console.error('Error reading from localStorage:', error);
          }
        }
      }
    }
  }, [combinedTranscriptions, paymentState.url, paymentState.source, updatePaymentLink]);

  // Update payment URL when payment data is received through the dedicated channel
  React.useEffect(() => {
    if (paymentData?.paymentLink) {
      console.log('Received payment link from dedicated channel:', paymentData.paymentLink);
      updatePaymentLink(paymentData.paymentLink, 'channel');
      setIsOrderConfirmed(true);
      
      // Store the order data in localStorage
      if (typeof window !== 'undefined' && paymentData.items) {
        localStorage.setItem('currentOrder', JSON.stringify(paymentData));
      }
    }
  }, [paymentData, updatePaymentLink]);

  // Check localStorage for a payment link on component mount
  useEffect(() => {
    if (typeof window !== 'undefined' && !paymentState.url) {
      try {
        const storedOrder = localStorage.getItem('currentOrder');
        if (storedOrder) {
          const orderData = JSON.parse(storedOrder);
          if (orderData.paymentLink) {
            console.log('Found payment link in localStorage:', orderData.paymentLink);
            updatePaymentLink(orderData.paymentLink, 'storage');
          }
        }
      } catch (error) {
        console.error('Error reading from localStorage:', error);
      }
    }
  }, [paymentState.url, updatePaymentLink]);

  // Auto-scroll to latest message
  React.useEffect(() => {
    const transcription = combinedTranscriptions[combinedTranscriptions.length - 1];
    if (transcription) {
      const transcriptionElement = document.getElementById(transcription.id);
      if (transcriptionElement) {
        transcriptionElement.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [combinedTranscriptions]);

  // Format message text, handling payment links
  const formatMessageText = (text: string) => {
    if (!text) return '';
    
    // Handle payment link messages - we'll skip these in the render function
    if (text.includes('payment_link:') || text.includes('PAYMENT_DATA:')) {
      console.log("Filtering out payment message from display:", text);
      
      // Extract and save the payment URL when we see it in a message
      if (text.includes('payment_link:')) {
        const paymentLinkMatch = text.match(/payment_link:\s*(https?:\/\/\S+)/i);
        if (paymentLinkMatch && paymentLinkMatch[1]) {
          const url = paymentLinkMatch[1].trim().replace(/[.,;:!?]+$/, '');
          console.log("Extracted payment URL from message text:", url);
          updatePaymentLink(url, 'message');
        }
      }
      
      return '';
    }
    
    return text;
  };
  
  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto h-full relative">
      {/* Payment Banner - shows at the top of chat when order is confirmed */}
      {paymentState.url && (
        <div className="sticky top-0 z-10 flex justify-center py-3 bg-white/95 backdrop-blur-sm border-b border-gray-200">
          <div className="bg-white p-6 rounded-xl text-center max-w-md w-full mx-4 shadow-lg border border-gray-100 relative">
            <button
              onClick={() => {
                clearPaymentData();
                setPaymentState({ url: '', source: null, timestamp: 0 });
              }}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 text-lg font-medium transition-colors duration-200"
              title="Clear payment link"
            >
              ✕
            </button>
            <div className="mb-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Order Ready!
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Complete your payment to finalize your order
              </p>
              
              {/* Order Details Section */}
              {(() => {
                // Try to get order details from paymentData first, then localStorage
                let orderData = paymentData;
                if (!orderData && typeof window !== 'undefined') {
                  try {
                    const storedOrder = localStorage.getItem('currentOrder');
                    if (storedOrder) {
                      orderData = JSON.parse(storedOrder);
                    }
                  } catch (error) {
                    console.error('Error reading order data from localStorage:', error);
                  }
                }
                
                if (orderData && orderData.items && orderData.items.length > 0) {
                  // Extract processing fee with proper type checking
                  const processingFee = typeof orderData.processingFee === 'number' ? orderData.processingFee : 0;
                  const hasProcessingFee = processingFee > 0;
                  
                  return (
                    <div className="bg-gray-50 rounded-lg p-4 mb-4 text-left">
                      <h4 className="font-medium text-gray-900 mb-2 text-center">Order Summary</h4>
                      
                      {/* Order Items */}
                      <div className="space-y-1 mb-3">
                        {orderData.items.map((item, index) => (
                          <div key={index} className="flex justify-between text-sm">
                            <span className="text-gray-700">
                              {item.quantity}x {item.name}
                            </span>
                            <span className="text-gray-900 font-medium">
                              ${(item.price * item.quantity).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                      
                      {/* Order Totals */}
                      <div className="border-t border-gray-200 pt-2 space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Subtotal:</span>
                          <span className="text-gray-900">${orderData.subtotal?.toFixed(2) || '0.00'}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Tax:</span>
                          <span className="text-gray-900">${orderData.tax?.toFixed(2) || '0.00'}</span>
                        </div>
                        {hasProcessingFee && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Processing Fee:</span>
                            <span className="text-gray-900">${processingFee.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-base font-semibold border-t border-gray-200 pt-1">
                          <span className="text-gray-900">Total:</span>
                          <span className="text-gray-900">
                            ${typeof orderData.total === 'string' ? orderData.total : orderData.total?.toFixed(2) || '0.00'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
            <div className="flex justify-center">
              <PaymentButton 
                paymentLink={paymentState.url} 
                className="bg-black hover:bg-gray-800 text-white font-semibold py-3 px-8 rounded-lg transition-all duration-200 transform hover:scale-105 shadow-md hover:shadow-lg"
              />
            </div>
          </div>
        </div>
      )}
      
      {combinedTranscriptions.map((transcription) => {
        const isFromServer = transcription.role === 'assistant';
        
        // Process payment link messages
        if (transcription.text && transcription.text.includes('payment_link:')) {
          console.log("Found payment link message:", transcription.text);
          const paymentLinkMatch = transcription.text.match(/payment_link:\s*(https?:\/\/\S+)/i);
          if (paymentLinkMatch && paymentLinkMatch[1]) {
            const url = paymentLinkMatch[1].trim().replace(/[.,;:!?]+$/, '');
            console.log("Extracted payment URL from transcription:", url);
            
            // Update payment link asynchronously to avoid render issues
            setTimeout(() => {
              updatePaymentLink(url, 'message');
            }, 10);
          }
          return null; // Don't render this message
        }
        
        // Process PAYMENT_DATA messages with full order/payment details
        if (transcription.text && transcription.text.includes('PAYMENT_DATA:')) {
          console.log("Found PAYMENT_DATA message");
          try {
            // Extract the JSON data
            const jsonStr = transcription.text.substring(transcription.text.indexOf('PAYMENT_DATA:') + 'PAYMENT_DATA:'.length);
            const data = JSON.parse(jsonStr);
            console.log("Extracted payment data:", data);
            
            if (data && data.paymentLink) {
              console.log("Found valid payment link in PAYMENT_DATA:", data.paymentLink);
              
              // Update payment link asynchronously to avoid render issues
              setTimeout(() => {
                updatePaymentLink(data.paymentLink, 'message');
                
                // Store full order data in localStorage
                if (typeof window !== 'undefined') {
                  localStorage.setItem('currentOrder', JSON.stringify(data));
                }
              }, 10);
            }
          } catch (error) {
            console.error("Error parsing PAYMENT_DATA:", error);
          }
          return null; // Don't render this message
        }
        
        // Don't render empty messages
        if (!transcription.text) {
          return null;
        }
        
        return (
          <div
            key={transcription.id}
            id={transcription.id}
            className={`flex ${isFromServer ? "justify-start" : "justify-end"}`}
          >
            <div
              className={`rounded-lg p-3 max-w-[80%] ${
                isFromServer ? "bg-gray-200 text-black" : "bg-blue-500 text-white"
              }`}
            >
              <div className="flex flex-col gap-2">
                <div>
                  {transcription.text}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}