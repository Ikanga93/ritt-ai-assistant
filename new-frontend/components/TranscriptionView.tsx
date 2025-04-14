import useCombinedTranscriptions from "@/hooks/useCombinedTranscriptions";
import * as React from "react";
import { PaymentPopup } from './PaymentPopup';
import PaymentMessage from './PaymentMessage';
import { useEffect, useState } from 'react';

/**
 * Process text to find and properly format URLs, especially payment links
 * This function handles both regular URLs and payment-specific URLs
 */
const formatTextWithLinks = (text: string) => {
  // Check if this is a payment-related message
  const isPaymentMessage = (
    text.includes("payment link") || 
    text.includes("pay for your order") ||
    text.includes("complete your payment") ||
    text.includes("I've created a secure payment link") ||
    text.includes("stripe.") ||
    text.includes("buy.stripe") ||
    /https?:\/\/buy\.stripe\.com\/test_[a-zA-Z0-9]+/i.test(text) // Direct URL detection
  );
  
  // For payment-related messages, use the specialized PaymentMessage component
  if (isPaymentMessage) {
    return <PaymentMessage text={text} />;
  }
  
  // For non-payment messages, process regular text with URLs
  return processTextWithUrls(text);
};

/**
 * Process text to find and make URLs clickable, handling line breaks properly
 * This function uses a more robust approach to ensure URLs are properly linked
 * even if they span multiple lines
 */
const processTextWithUrls = (text: string) => {
  // First, normalize the text by replacing newlines with spaces
  // This helps us find URLs that might be split across lines
  const normalizedText = text.replace(/\n/g, ' ');
  
  // Use a comprehensive URL regex that can match most URL patterns
  const urlRegex = /(https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*))/g;
  
  // Find all URLs in the normalized text
  const matches = normalizedText.match(urlRegex);
  
  // If no URLs are found, just preserve line breaks and return the text
  if (!matches) {
    return (
      <div className="message-text">
        {text.split('\n').map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    );
  }
  
  // If we found URLs, we need to process the text to make them clickable
  // We'll use a special approach to handle URLs that might be split across lines
  
  // Step 1: Create a map of all URLs and their positions in the normalized text
  const urlPositions: {url: string; start: number; end: number}[] = [];
  let match;
  const regex = new RegExp(urlRegex);
  
  // Find all matches and their positions
  while ((match = regex.exec(normalizedText)) !== null) {
    urlPositions.push({
      url: match[0],
      start: match.index,
      end: match.index + match[0].length
    });
  }
  
  // Step 2: Split the original text into segments, replacing URLs with placeholders
  let segments: {type: 'text' | 'url'; content: string}[] = [];
  let lastEnd = 0;
  
  // Sort URL positions by start index
  urlPositions.sort((a, b) => a.start - b.start);
  
  // Process each URL position
  for (const pos of urlPositions) {
    // Add text before the URL
    if (pos.start > lastEnd) {
      const textBefore = normalizedText.substring(lastEnd, pos.start);
      segments.push({type: 'text', content: textBefore});
    }
    
    // Add the URL
    segments.push({type: 'url', content: pos.url});
    lastEnd = pos.end;
  }
  
  // Add any remaining text after the last URL
  if (lastEnd < normalizedText.length) {
    segments.push({type: 'text', content: normalizedText.substring(lastEnd)});
  }
  
  // Step 3: Render the segments with proper formatting
  return (
    <div className="message-text">
      {segments.map((segment, index) => {
        if (segment.type === 'url') {
          // Render URL as a clickable link with proper styling
          return (
            <a
              key={index}
              href={segment.content}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline"
              style={{
                wordBreak: 'break-all',       // Allow breaking within the URL
                overflowWrap: 'break-word',   // Modern property for word breaking
                display: 'inline-block',      // Ensure the link is treated as a block
                maxWidth: '100%'              // Prevent overflow
              }}
            >
              {segment.content}
            </a>
          );
        } else {
          // Render regular text with line breaks preserved
          // Replace newlines with <br> tags
          return (
            <span key={index}>
              {segment.content.split('\n').map((line, i, arr) => (
                <React.Fragment key={i}>
                  {line}
                  {i < arr.length - 1 && <br />}
                </React.Fragment>
              ))}
            </span>
          );
        }
      })}
    </div>
  );
};

export default function TranscriptionView() {
  const combinedTranscriptions = useCombinedTranscriptions();
  const [showPaymentPopup, setShowPaymentPopup] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState('');
  
  // Add custom CSS to the document to handle URL formatting
  useEffect(() => {
    // Create a style element
    const style = document.createElement('style');
    style.textContent = `
      .message-text a {
        word-break: break-all !important;
        overflow-wrap: break-word !important;
        white-space: normal !important;
      }
      .payment-message a {
        word-break: normal !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }
    `;
    
    // Add the style to the document head
    document.head.appendChild(style);
    
    // Clean up when component unmounts
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // scroll to bottom when new transcription is added
  React.useEffect(() => {
    const transcription = combinedTranscriptions[combinedTranscriptions.length - 1];
    if (transcription) {
      const transcriptionElement = document.getElementById(transcription.id);
      if (transcriptionElement) {
        transcriptionElement.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [combinedTranscriptions]);

  return (
    <>
      <div className="h-full flex flex-col gap-2 overflow-y-auto">
        {combinedTranscriptions.map((segment) => {
          // Check if this is a payment message
          const isPaymentMessage = (
            segment.text.includes("payment link") || 
            segment.text.includes("pay for your order") ||
            segment.text.includes("complete your payment") ||
            segment.text.includes("I've created a secure payment link") ||
            segment.text.includes("stripe.") ||
            segment.text.includes("buy.stripe") ||
            /https?:\/\/buy\.stripe\.com\/test_[a-zA-Z0-9]+/i.test(segment.text) // Direct URL detection
          );
          
          // For payment messages from the assistant, use the PaymentMessage component
          if (isPaymentMessage && segment.role === "assistant") {
            return (
              <div
                id={segment.id}
                key={segment.id}
                className="p-2 self-start fit-content break-words"
              >
                <PaymentMessage text={segment.text} />
              </div>
            );
          }
          
          // For non-payment messages, process normally
          return (
            <div
              id={segment.id}
              key={segment.id}
              className={
                segment.role === "assistant"
                  ? "p-2 self-start fit-content break-words"
                  : "bg-gray-800 rounded-md p-2 self-end fit-content break-words"
              }
            >
              {isPaymentMessage ? processTextWithUrls(segment.text) : formatTextWithLinks(segment.text)}
            </div>
          );
        })}
      </div>
      <PaymentPopup 
        isOpen={showPaymentPopup} 
        onClose={() => setShowPaymentPopup(false)} 
        paymentUrl={paymentUrl} 
      />
    </>
  );
}
