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
    // Generate room connection details, including:
    //   - A random Room name
    //   - A random Participant name
    //   - An Access Token to permit the participant to join the room
    //   - The URL of the LiveKit server to connect to
    //
    // In real-world application, you would likely allow the user to specify their
    // own participant name, and possibly to choose from existing rooms to join.

    const url = new URL(
      process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT ?? "/api/connection-details",
      window.location.origin
    );
    const response = await fetch(url.toString());
    const connectionDetailsData: ConnectionDetails = await response.json();

    await room.connect(connectionDetailsData.serverUrl, connectionDetailsData.participantToken);
    await room.localParticipant.setMicrophoneEnabled(true);
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
    <main data-lk-theme="default" className="h-full grid content-center bg-[var(--lk-bg)]">
      <RoomContext.Provider value={room}>
        <div className="lk-room-container max-h-[90vh]">
          <SimpleVoiceAssistant onConnectButtonClicked={onConnectButtonClicked} user={user} />
        </div>
      </RoomContext.Provider>
    </main>
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
  const tax = subtotal * 0.09; // 9% tax rate
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
    
    // Get the last message from the assistant
    const lastMessages = transcript.slice(-3); // Look at the last few messages
    const assistantMessages = lastMessages.filter((msg: TranscriptMessage) => msg.role === 'assistant');
    
    if (assistantMessages.length > 0) {
      const lastAssistantMessage = assistantMessages[assistantMessages.length - 1].content.toLowerCase();
      
      // Check if the assistant is confirming the order
      const isConfirmingOrder = (
        lastAssistantMessage.includes('confirm your order') ||
        lastAssistantMessage.includes('is that correct') ||
        lastAssistantMessage.includes('anything else') ||
        lastAssistantMessage.includes('would you like to place this order')
      );
      
      // Check if the customer has confirmed the order
      const customerResponses = lastMessages.filter((msg: TranscriptMessage) => msg.role === 'user');
      const hasCustomerConfirmed = customerResponses.some((msg: TranscriptMessage) => {
        const content = msg.content.toLowerCase();
        return (
          content.includes('yes') ||
          content.includes('correct') ||
          content.includes('that\'s right') ||
          content.includes('sounds good') ||
          content.includes('place the order') ||
          content.includes('confirm')
        );
      });
      
      // If the order is being confirmed and the customer has confirmed, process the order
      if (isConfirmingOrder && hasCustomerConfirmed && !orderConfirmed) {
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
          storePendingOrder({
            items: orderData.items,
            subtotal: orderData.subtotal,
            tax: orderData.tax,
            total: orderData.total,
            customerName: orderData.customerName,
            restaurantId: orderData.restaurantId,
            timestamp: new Date().toISOString(),
            orderId: result.orderId, // Store the order ID
            orderNumber: result.orderNumber, // Store the order number
          });
          
          // Set the flag to show the auth modal
          setShowAuthModal(true);
          
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
        
        // Store the order data
        storePendingOrder(orderData);
        setCurrentOrderData(orderData);
        console.log('Order data stored before authentication:', orderData);
        
        // Call the order confirmation handler
        handleOrderConfirmation(orderData);
      }
      
      // We no longer need to inject a message here since the backend will handle it
      // Just log that we're showing the auth modal
      console.log('Showing authentication modal after order confirmation');
      
      // Show the auth modal
      setShowAuthModal(true);
      setShouldPromptAuth(false);
    }
  }, [shouldPromptAuth, user, isLoading, transcript, customerName, voiceAssistant]);
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
            className="uppercase absolute left-1/2 -translate-x-1/2 px-4 py-2 bg-white text-black rounded-md"
            onClick={() => props.onConnectButtonClicked()}
          >
            Start order
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
        <ControlBar 
          onCheckout={() => {
            // When user tries to checkout, check authentication
            if (!user && !isLoading) {
              setShowAuthModal(true);
            } else {
              // Process order with authenticated user
              handleOrderSubmission(user);
              setOrderConfirmed(false); // Reset after submission
            }
          }} 
        />
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

interface ControlBarProps {
  onCheckout?: () => void;
}

function ControlBar({ onCheckout }: ControlBarProps) {
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
              {/* Add confirmation and checkout buttons */}
              {onCheckout && (
                <button
                  onClick={onCheckout}
                  className="mr-4 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
                >
                  Complete Order
                </button>
              )}
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
