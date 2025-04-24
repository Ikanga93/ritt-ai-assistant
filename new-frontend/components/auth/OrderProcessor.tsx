'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getPendingOrder, clearPendingOrder, OrderData } from '@/utils/orderStorage';

/**
 * Component that automatically processes pending orders after authentication
 * This component doesn't render anything visible - it just handles the logic
 */
export default function OrderProcessor() {
  const { user, isLoading } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  
  useEffect(() => {
    // Only run this when user authentication state changes and we have a user
    if (isLoading || !user || isProcessing) return;
    
    const processPendingOrder = async () => {
      try {
        setIsProcessing(true);
        
        // Check if there's a pending order in localStorage
        const pendingOrder = getPendingOrder();
        if (!pendingOrder) {
          console.log('No pending order found after authentication');
          return;
        }
        
        console.log('Processing pending order after authentication:', pendingOrder);
        
        // Declare response variable outside the if/else block
        let response;
        let result;
        
        // If the order already has an orderId, update the customer record instead of submitting a new order
        if (pendingOrder.orderId || pendingOrder.orderNumber) {
          console.log('Updating existing order with Auth0 user information');
          
          // Update the customer record with Auth0 information
          response = await fetch('/api/update-customer', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              orderId: pendingOrder.orderId,
              orderNumber: pendingOrder.orderNumber,
              auth0Id: user.sub,
              email: user.email,
              name: user.name || pendingOrder.customerName || 'Customer',
              picture: user.picture
            }),
          });
          
          if (!response.ok) {
            throw new Error(`Failed to update customer: ${response.statusText}`);
          }
          
          result = await response.json();
          console.log('Customer update result:', result);
        } else {
          // Submit the order with the authenticated user
          response = await fetch('/api/submit-order', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              ...pendingOrder,
              customerName: user.name || pendingOrder.customerName || 'Customer',
              customerEmail: user.email,
              auth0UserId: user.sub,
            }),
          });
          
          if (!response.ok) {
            throw new Error(`Failed to submit order: ${response.statusText}`);
          }
          
          result = await response.json();
        }
        console.log('Order submitted successfully:', result);
        
        // Clear the pending order from localStorage
        clearPendingOrder();
        
        // Log successful order processing
        console.log('Order was automatically processed after authentication:', pendingOrder);
        
        // Check if this was a voice ordering session
        const isVoiceOrderingSession = localStorage.getItem('voice_ordering_session') === 'active' || 
                                     sessionStorage.getItem('voice_ordering_session') === 'active';
        
        // Show payment confirmation message
        if (isVoiceOrderingSession) {
          // For voice ordering, use a more conversational message
          alert(`Thank you for your order! A payment link has been sent to your email at ${user.email}. Once payment is confirmed, your order will be sent to the kitchen for preparation.`);
          
          // Clear the voice ordering session flag but don't reload the page
          // This allows the voice assistant to continue
          localStorage.removeItem('voice_ordering_session');
          sessionStorage.removeItem('voice_ordering_session');
        } else {
          // For regular web ordering
          alert(`Thank you for your order! A payment link has been sent to your email. Your order will be processed after payment confirmation.`);
        }
        
      } catch (error) {
        console.error('Error processing pending order:', error);
      } finally {
        setIsProcessing(false);
      }
    };
    
    processPendingOrder();
  }, [user, isLoading, isProcessing]);
  
  // This component doesn't render anything visible
  return null;
}
