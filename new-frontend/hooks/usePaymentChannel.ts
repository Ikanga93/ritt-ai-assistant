import { useRoomContext } from "@livekit/components-react";
import { useEffect, useState, useRef } from "react";

interface PaymentData {
  orderId: string;
  orderNumber: string;
  total: string;
  paymentLink: string;
  items: any[];
  subtotal: number;
  tax: number;
  processingFee: number;
}

export default function usePaymentChannel() {
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const room = useRoomContext();
  const handlersRegistered = useRef(false);
  
  // Listen for text streams from the agent (this is the correct LiveKit approach)
  useEffect(() => {
    if (!room || handlersRegistered.current) return;

    console.log("🔊 Setting up text stream handlers for payment data");

    // Handler for text streams - this is how agents send data according to LiveKit docs
    const handleTextStream = async (reader: any, participantInfo: any) => {
      console.log("💰 Text stream received from:", participantInfo.identity);
      
      try {
        const message = await reader.readAll();
        console.log("💰 Text stream message:", message);
        
        // Check for payment link format: payment_link:URL
        if (message.includes('payment_link:')) {
          const paymentLinkMatch = message.match(/payment_link:\s*(https?:\/\/\S+)/i);
          if (paymentLinkMatch && paymentLinkMatch[1]) {
            const paymentLink = paymentLinkMatch[1].trim();
            console.log("💰 Found payment link:", paymentLink);
            
            // Create minimal payment data for the link
            const data = {
              orderId: 'pending',
              orderNumber: 'pending',
              total: '0',
              paymentLink: paymentLink,
              items: [],
              subtotal: 0,
              tax: 0,
              processingFee: 0
            };
            
            setPaymentData(data);
            
            // Store in localStorage for persistence
            if (typeof window !== 'undefined') {
              localStorage.setItem('latestPaymentUrl', paymentLink);
              console.log("💰 Payment link stored in localStorage");
            }
          }
        }
        
        // Check for structured payment data: PAYMENT_DATA:{json}
        if (message.includes('PAYMENT_DATA:')) {
          try {
            const jsonStr = message.substring(message.indexOf('PAYMENT_DATA:') + 'PAYMENT_DATA:'.length);
            const data = JSON.parse(jsonStr);
            console.log("💰 Parsed structured payment data:", data);
            
            if (data && data.paymentLink) {
              setPaymentData(data);
              
              // Store in localStorage for persistence
              if (typeof window !== 'undefined') {
                localStorage.setItem('currentOrder', JSON.stringify(data));
                localStorage.setItem('latestPaymentUrl', data.paymentLink);
                console.log("💰 Full payment data stored in localStorage");
              }
            }
          } catch (parseError) {
            console.error("💰 Error parsing PAYMENT_DATA JSON:", parseError);
          }
        }
      } catch (error) {
        console.error("💰 Error reading text stream:", error);
      }
    };

    try {
      // Register text stream handler for the chat topic (where agents send data)
      room.registerTextStreamHandler('lk.chat', handleTextStream);
      
      // Also listen on transcription topic as a fallback
      room.registerTextStreamHandler('lk.transcription', handleTextStream);
      
      // Listen on default topic as well (in case no topic is specified)
      room.registerTextStreamHandler('', handleTextStream);

      handlersRegistered.current = true;
      console.log("🔊 Text stream handlers registered for 'lk.chat', 'lk.transcription', and default topics");
    } catch (error) {
      console.error("🔊 Error registering text stream handlers:", error);
    }

    // Cleanup function
    return () => {
      console.log("🔊 Cleaning up text stream handlers");
      handlersRegistered.current = false;
      // Note: LiveKit doesn't provide an unregister method, handlers are cleaned up when room disconnects
    };
  }, [room]);

  // Check localStorage on mount for existing payment data
  useEffect(() => {
    if (typeof window !== 'undefined' && !paymentData) {
      try {
        const storedOrder = localStorage.getItem('currentOrder');
        if (storedOrder) {
          const data = JSON.parse(storedOrder);
          setPaymentData(data);
        }
      } catch (error) {
        console.error('Error reading from localStorage:', error);
      }
    }
  }, [paymentData]);

  return { paymentData };
}
