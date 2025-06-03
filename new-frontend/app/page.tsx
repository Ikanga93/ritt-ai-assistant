"use client";

import { CloseIcon } from "@/components/CloseIcon";
import { NoAgentNotification } from "@/components/NoAgentNotification";
import TranscriptionView from "@/components/TranscriptionView";
import UserProfile from "@/components/auth/UserProfile";
import AuthModal from "@/components/auth/AuthModal";
import {
  BarVisualizer,
  DisconnectButton,
  RoomAudioRenderer,
  RoomContext,
  VoiceAssistantControlBar,
  useVoiceAssistant,
} from "@livekit/components-react";
import { useKrispNoiseFilter } from "@livekit/components-react/krisp";
import { AnimatePresence, motion } from "framer-motion";
import { Room, RoomEvent } from "livekit-client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { OrderData, storePendingOrder } from "@/utils/orderStorage";
import type { ConnectionDetails } from "./api/connection-details/route";

export default function Page() {
  const [room] = useState(new Room());
  const { user, isLoading } = useAuth();

  const onConnectButtonClicked = useCallback(async () => {
    try {
      console.log('Connecting to room...');
      
      // Clear any existing connections first to prevent issues
      if (room.state === 'connected') {
        console.log('Room already connected, disconnecting first...');
        await room.disconnect();
        console.log('Room disconnected successfully');
      }
      
      // Generate room connection details, including:
      //   - A random Room name
      //   - A random Participant name
      //   - An Access Token to permit the participant to join the room
      //   - The URL of the LiveKit server to connect to

      const url = new URL(
        process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT ?? "/api/connection-details",
        window.location.origin
      );
      console.log('Fetching connection details from:', url.toString());
      
      // Add cache-busting parameter to prevent cached responses
      url.searchParams.append('t', Date.now().toString());
      
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch connection details: ${response.statusText}`);
      }
      
      const connectionDetailsData: ConnectionDetails = await response.json();
      console.log('Connection details received:', connectionDetailsData);

      if (!connectionDetailsData.serverUrl || !connectionDetailsData.participantToken) {
        throw new Error('Invalid connection details received');
      }

      // Connect to the room
      console.log('Connecting to LiveKit server:', connectionDetailsData.serverUrl);
      await room.connect(connectionDetailsData.serverUrl, connectionDetailsData.participantToken, {
        autoSubscribe: true
      });
      console.log('Connected to room successfully');
      
      // Enable microphone with retry logic
      console.log('Enabling microphone...');
      let micEnabled = false;
      let retryCount = 0;
      
      while (!micEnabled && retryCount < 3) {
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
          micEnabled = true;
          console.log('Microphone enabled successfully');
        } catch (micError) {
          console.error(`Attempt ${retryCount + 1} to enable microphone failed:`, micError);
          retryCount++;
          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      if (!micEnabled) {
        console.warn('Could not enable microphone after multiple attempts');
        // Continue anyway, as the connection is established
      }
    } catch (error) {
      console.error('Error connecting to room:', error);
      alert('Failed to connect to the voice assistant. Please check your microphone permissions and try again.');
    }
  }, [room]);

  useEffect(() => {
    room.on(RoomEvent.MediaDevicesError, onDeviceFailure);

    return () => {
      room.off(RoomEvent.MediaDevicesError, onDeviceFailure);
    };
  }, [room]);

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <main className="h-full grid content-center bg-gray-100">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Loading...</h1>
          <p>Please wait while we prepare your voice ordering experience.</p>
        </div>
      </main>
    );
  }

  // User is authenticated (middleware ensures this), show the voice assistant
  return (
    <div className="relative h-full">
      <div className="fixed top-8 left-0 right-0 z-50">
        <div className="text-gray-400 text-center text-xs py-1">
        </div>
      </div>
      <main data-lk-theme="default" className="h-full grid content-center bg-[var(--lk-bg)] pt-16">
        <RoomContext.Provider value={room}>
          <div className="lk-room-container max-h-[90vh]">
            <SimpleVoiceAssistant onConnectButtonClicked={onConnectButtonClicked} user={user} />
          </div>
        </RoomContext.Provider>
      </main>
    </div>
  );
}

// Define transcript message type
interface TranscriptMessage {
  role: 'assistant' | 'user';
  content: string;
}

// Extract order details from the voice assistant transcript
function extractOrderFromTranscript(transcript: TranscriptMessage[]): OrderData | null {
  if (!transcript || transcript.length === 0) return null;
  
  // This is a simplified implementation
  // In a real application, you would use NLP to extract structured order data
  // For now, we'll create a mock order based on the transcript
  
  // Look for menu items in the transcript
  const menuItems: Array<{id: string; name: string; price: number; quantity: number}> = [];
  
  // Simple pattern matching for common menu items
  const itemPatterns = [
    { regex: /gyro/i, id: 'gyro1', name: 'Single Gyro', price: 7.99 },
    { regex: /falafel/i, id: 'falafel1', name: 'Falafel Plate', price: 8.99 },
    { regex: /hummus/i, id: 'hummus1', name: 'Hummus Plate', price: 5.99 },
    { regex: /salad/i, id: 'salad1', name: 'Greek Salad', price: 6.99 },
    { regex: /soda|drink|coke|pepsi/i, id: 'drink1', name: 'Fountain Drink', price: 1.99 },
  ];
  
  // Extract items from transcript
  for (const msg of transcript) {
    if (msg.role === 'user') {
      const content = msg.content.toLowerCase();
      
      for (const pattern of itemPatterns) {
        if (pattern.regex.test(content) && !menuItems.some(item => item.id === pattern.id)) {
          // Extract quantity if mentioned
          const quantityMatch = content.match(/(\d+)\s+(?:order of|orders of|)\s*(?:the\s+|)(?:gyro|falafel|hummus|salad|soda|drink|coke|pepsi)/i);
          const quantity = quantityMatch ? parseInt(quantityMatch[1]) : 1;
          
          menuItems.push({
            id: pattern.id,
            name: pattern.name,
            price: pattern.price,
            quantity: quantity
          });
        }
      }
    }
  }
  
  // If no items found, return null
  if (menuItems.length === 0) return null;
  
  // Calculate totals
  const subtotal = menuItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const tax = subtotal * 0.115; // 11.5% tax rate
  const total = subtotal + tax;
  
  return {
    items: menuItems,
    subtotal: parseFloat(subtotal.toFixed(2)),
    tax: parseFloat(tax.toFixed(2)),
    total: parseFloat(total.toFixed(2)),
    restaurantId: '3', // Default restaurant ID
    timestamp: new Date().toISOString()
  };
}

function SimpleVoiceAssistant(props: { onConnectButtonClicked: () => void; user: any }) {
  const voiceAssistant = useVoiceAssistant();
  const { state: agentState } = voiceAssistant;
  // Use a local state for transcript since it's not directly available from useVoiceAssistant
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  // Use real Auth0 authentication
  const { user, isLoading, login } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [orderConfirmed, setOrderConfirmed] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [shouldPromptAuth, setShouldPromptAuth] = useState(false);
  const [currentOrderData, setCurrentOrderData] = useState<OrderData | null>(null);
  
  // Cart functionality removed
  
  // Update transcript based on messages from the voice assistant
  useEffect(() => {
    // Safely access messages from the agent state
    // In the real implementation, we need to access the messages from the appropriate property
    // For now, we'll use a workaround to access messages
    const messages = (agentState as any)?.messages || [];
    
    if (messages && Array.isArray(messages) && messages.length > 0) {
      // Convert messages to our transcript format
      const formattedTranscript: TranscriptMessage[] = messages.map((msg: any) => ({
        role: msg.role || (msg.isUser ? 'user' : 'assistant'),
        content: msg.content || msg.text || ''
      }));
      setTranscript(formattedTranscript);
    }
  }, [agentState]);

  // Listen to the transcript to detect order confirmation and extract customer name
  useEffect(() => {
    if (!transcript || transcript.length === 0) return;
    
    // Get the last few messages to analyze the conversation flow
    const lastMessages = transcript.slice(-5); // Look at the last 5 messages for better context
    const assistantMessages = lastMessages.filter((msg: TranscriptMessage) => msg.role === 'assistant');
    
    if (assistantMessages.length > 0) {
      // Get the most recent assistant message
      const lastAssistantMessage = assistantMessages[assistantMessages.length - 1].content.toLowerCase();
      console.log('Analyzing assistant message for order confirmation:', lastAssistantMessage);
      
      // More comprehensive check for order confirmation phrases
      const orderConfirmationPhrases = [
        'confirm your order',
        'is that correct',
        'anything else',
        'would you like to place this order',
        'place your order',
        'complete your order',
        'finalize your order',
        'proceed with your order',
        'confirm the order',
        'ready to order',
        'submit your order',
        'does that sound right',
        'shall i place the order',
        'is your order complete',
        'would you like to proceed',
        'ready to checkout'
      ];
      
      // Check if the assistant is confirming the order
      const isConfirmingOrder = orderConfirmationPhrases.some(phrase => 
        lastAssistantMessage.includes(phrase)
      );
      
      // Get the most recent customer responses after the last assistant message
      const lastAssistantIndex = lastMessages.findIndex(msg => 
        msg.role === 'assistant' && msg.content.toLowerCase() === lastAssistantMessage
      );
      
      const recentCustomerResponses = lastMessages
        .slice(lastAssistantIndex + 1)
        .filter((msg: TranscriptMessage) => msg.role === 'user');
      
      // More comprehensive check for customer confirmation phrases
      const customerConfirmationPhrases = [
        'yes',
        'yeah',
        'yep',
        'correct',
        'that\'s right',
        'sounds good',
        'place the order',
        'confirm',
        'go ahead',
        'proceed',
        'that\'s it',
        'looks good',
        'that\'s all',
        'perfect',
        'i\'m ready',
        'let\'s do it',
        'order it',
        'submit',
        'checkout'
      ];
      
      // Check if the customer has confirmed the order
      const hasCustomerConfirmed = recentCustomerResponses.some((msg: TranscriptMessage) => {
        const content = msg.content.toLowerCase();
        return customerConfirmationPhrases.some(phrase => content.includes(phrase));
      });
      
      console.log('Order confirmation analysis:', {
        isConfirmingOrder,
        hasCustomerConfirmed,
        currentlyConfirmed: orderConfirmed
      });
      
      // If the order is being confirmed and the customer has confirmed, process the order
      if (isConfirmingOrder && hasCustomerConfirmed && !orderConfirmed) {
        console.log('Order confirmation detected! Processing order...');
        setOrderConfirmed(true);
        setShouldPromptAuth(true); // This will trigger the order submission logic
      }
      
      // Try to extract customer name
      if (!customerName) {
        // Look for name patterns in the transcript
        const namePatterns = [
          /my name is ([\w\s]+)/i,
          /this is ([\w\s]+)/i,
          /([\w\s]+) here/i,
          /call me ([\w\s]+)/i,
          /for ([\w\s]+)/i
        ];
        
        for (const pattern of namePatterns) {
          for (const msg of transcript) {
            if (msg.role === 'user') {
              const match = msg.content.match(pattern);
              if (match && match[1]) {
                // Clean up the extracted name
                const extractedName = match[1].trim().split(' ')[0]; // Just take the first name
                if (extractedName.length > 1) { // Ensure it's not just a single character
                  setCustomerName(extractedName);
                  break;
                }
              }
            }
          }
        }
      }
    }
  }, [transcript, customerName, orderConfirmed, user, isLoading]);
  
  // Handle order confirmation with authenticated user
  useEffect(() => {
    if (shouldPromptAuth) {
      console.log('shouldPromptAuth is true, triggering order confirmation');
      console.log('User authentication status:', !!props.user);
      
      const handleOrderConfirmation = async (orderData: any) => {
        console.log('Order confirmed with data:', JSON.stringify(orderData, null, 2));
        console.log('User data:', JSON.stringify(props.user, null, 2));
        
        try {
          // Add processing fee if not present (2% of subtotal)
          if (!orderData.processingFee) {
            orderData.processingFee = parseFloat((orderData.subtotal * 0.02).toFixed(2));
            // Recalculate total with processing fee
            orderData.total = parseFloat((orderData.subtotal + orderData.tax + orderData.processingFee).toFixed(2));
          }
          
          // Submit the order with authenticated user information
          const response = await fetch('/api/submit-order', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              ...orderData,
              customerName: props.user?.name || orderData.customerName || 'Customer',
              // Include full Auth0 user object for backend processing
              auth0User: props.user ? {
                sub: props.user.sub,
                email: props.user.email,
                name: props.user.name,
                picture: props.user.picture
              } : null,
            }),
          });
          
          if (!response.ok) {
            throw new Error(`Failed to create initial order: ${response.statusText}`);
          }
          
          const result = await response.json();
          console.log('Initial order created:', result);
          
          // Store the order data in localStorage for retrieval after authentication
          const orderToStore = {
            items: orderData.items,
            subtotal: orderData.subtotal,
            tax: orderData.tax,
            processingFee: orderData.processingFee,
            total: orderData.total,
            customerName: orderData.customerName || props.user?.name || 'Customer',
            restaurantId: orderData.restaurantId,
            timestamp: new Date().toISOString(),
            orderId: result.orderId, // Store the order ID
            orderNumber: result.orderNumber, // Store the order number
            paymentLink: result.paymentLink // Store the payment link if available
          };
          
          storePendingOrder(orderToStore);
          console.log('Order data stored with payment link:', orderToStore);
          
          // Store payment link in localStorage for easy access
          if (result.paymentLink) {
            localStorage.setItem('latestPaymentUrl', result.paymentLink);
          }
          
          // Set the voice ordering session flag
          sessionStorage.setItem('voice_ordering_active', 'true');
          
        } catch (error) {
          console.error('Error handling order confirmation:', error);
        }
      }
      
      // Extract order details from the transcript
      const orderData = extractOrderFromTranscript(transcript);
      
      // Store order details in localStorage if available
      if (orderData) {
        // Add customer name if available
        if (customerName) {
          orderData.customerName = customerName;
        }
        
        // Store the order data temporarily
        setCurrentOrderData(orderData);
        console.log('Order data extracted from transcript:', orderData);
        
        // Call the order confirmation handler to process the order
        handleOrderConfirmation(orderData);
      } else {
        console.error('Failed to extract order data from transcript');
      }
      
      // Show the auth modal if needed
      // TEMPORARILY DISABLED - Allow usage without authentication
      /*
      if (!props.user) {
        console.log('User not authenticated, showing auth modal');
        setShowAuthModal(true);
      } else {
        console.log('User already authenticated, no need for auth modal');
      }
      */
      console.log('Authentication check disabled - proceeding without login requirement');
      
      // Reset the prompt flag
      setShouldPromptAuth(false);
    }
  }, [shouldPromptAuth, props.user, transcript, customerName]);
  return (
    <>
      <div className="fixed top-4 left-4 z-10 flex flex-col">
        <span className="text-3xl font-bold text-white">Ritt</span>
        <span className="text-sm text-gray-300 -mt-1">Drive-thru</span>
      </div>
      
      {/* Cart icon removed */}
      
      {/* Add user profile in top right */}
      <div className="fixed top-4 right-4 z-10">
        <UserProfile />
      </div>
      
      <AnimatePresence>
        {agentState === "disconnected" && (
          <motion.button
            initial={{ opacity: 0, top: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, top: "-10px" }}
            transition={{ duration: 1, ease: [0.09, 1.04, 0.245, 1.055] }}
            className="uppercase absolute left-1/2 -translate-x-1/2 px-6 py-3 bg-white text-black font-bold rounded-lg shadow-md hover:bg-gray-100 active:bg-gray-200 cursor-pointer transform hover:scale-105 transition-all duration-200"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('Start order button clicked');
              
              // Visual feedback that button was clicked
              const button = e.currentTarget;
              button.classList.add('bg-gray-200');
              setTimeout(() => button.classList.remove('bg-gray-200'), 200);
              
              // Call the connect function
              props.onConnectButtonClicked();
            }}
          >
            Start Order
          </motion.button>
        )}
        <div className="w-3/4 lg:w-1/2 mx-auto h-full">
          <TranscriptionView />
        </div>
      </AnimatePresence>

      <RoomAudioRenderer />
      <NoAgentNotification state={agentState} />
      
      {/* Order confirmation message */}
      {orderConfirmed && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-20">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Thank you for your order, {props.user?.name || customerName}!</h2>
            <p className="mb-4">Your order has been confirmed and is being processed.</p>
            <p className="mb-4 text-sm text-gray-600">You'll receive payment instructions shortly.</p>
            <div className="flex justify-end">
              <button 
                onClick={() => setOrderConfirmed(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="fixed bottom-0 w-full px-4 py-2">
        <ControlBar />
      </div>
      
      {/* Add Auth Modal */}
      {showAuthModal && (
        <AuthModal 
          onClose={() => setShowAuthModal(false)}
          onLogin={() => {
            setShowAuthModal(false);
            // Use real Auth0 login with return to current page
            login();
          }}
          customerName={customerName || 'there'}
          orderData={currentOrderData || undefined}
        />
      )}
    </>
  );
}

// Add order submission function
async function handleOrderSubmission(user: any) {
  try {
    // Get order details from your state management
    // This is a placeholder - you'll need to adapt this to your actual order data
    const orderDetails = {
      // Extract order details from your transcription or state
      customerName: user?.name || 'Anonymous',
      customerEmail: user?.email,
      // Other order details
      items: [{ name: "Order from voice interface", price: 0, quantity: 1 }]
    };
    
    // Submit order to your API
    const response = await fetch('/api/submit-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderDetails)
    });
    
    const result = await response.json();
    
    if (result.success) {
      // Show success message or redirect
      alert(`Order #${result.orderNumber} placed successfully!`);
    } else {
      // Show error
      alert('Failed to place order. Please try again.');
    }
  } catch (error) {
    console.error('Error submitting order:', error);
    alert('An error occurred while placing your order.');
  }
}

function ControlBar() {
  /**
   * Use Krisp background noise reduction when available.
   * Note: This is only available on Scale plan, see {@link https://livekit.io/pricing | LiveKit Pricing} for more details.
   */
  const krisp = useKrispNoiseFilter();
  const { state: agentState, audioTrack } = useVoiceAssistant();
  
  useEffect(() => {
    // Only attempt to enable Krisp when the agent is ready
    if (!krisp) return;
    
    // Wait for audio context to be fully established
    const enableKrisp = setTimeout(() => {
      try {
        // First disable, then try to enable after a short delay
        krisp.setNoiseFilterEnabled(false)
          .then(() => {
            // Try to enable it only after ensuring it's first disabled
            setTimeout(() => {
              krisp.setNoiseFilterEnabled(true)
                .catch(err => {
                  console.warn('Failed to enable noise filter, continuing without it:', err);
                });
            }, 500);
          })
          .catch(err => {
            console.warn('Failed to disable noise filter before enabling:', err);
          });
      } catch (error) {
        console.warn('Krisp noise filter initialization failed:', error);
        // Continue without noise filtering if it fails
      }
    }, 2000); // Longer delay to ensure audio context is ready
    
    return () => clearTimeout(enableKrisp);
  }, [krisp]);

  return (
    <div className="relative h-[100px]">
      <AnimatePresence>
        {agentState !== "disconnected" && agentState !== "connecting" && (
          <motion.div
            initial={{ opacity: 0, top: "10px" }}
            animate={{ opacity: 1, top: 0 }}
            exit={{ opacity: 0, top: "-10px" }}
            transition={{ duration: 0.4, ease: [0.09, 1.04, 0.245, 1.055] }}
            className="flex absolute w-full h-full justify-between px-8 sm:px-4"
          >
            <BarVisualizer
              state={agentState}
              barCount={5}
              trackRef={audioTrack}
              className="agent-visualizer w-24 gap-2"
              options={{ minHeight: 12 }}
            />
            <div className="flex items-center">
              {/* Control buttons */}
              <VoiceAssistantControlBar controls={{ leave: false }} />
              <DisconnectButton>
                <CloseIcon />
              </DisconnectButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function onDeviceFailure(error: Error) {
  console.error(error);
  alert(
    "Error acquiring camera or microphone permissions. Please make sure you grant the necessary permissions in your browser and reload the tab"
  );
}
