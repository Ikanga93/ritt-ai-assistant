'use client';
import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { OrderData, storePendingOrder } from '@/utils/orderStorage';

interface AuthModalProps {
  onClose: () => void;
  onLogin: () => void;
  customerName?: string;
  orderData?: OrderData;
}

export default function AuthModal({ onClose, onLogin, customerName = 'there', orderData }: AuthModalProps) {
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-md w-full">
        <h2 className="text-2xl font-bold mb-4">Complete Your Order</h2>
        <p className="mb-4">
          Hi {customerName}! Your order has been confirmed. To proceed with payment and send your order to the kitchen, please sign in or create an account.
        </p>
        <p className="mb-4 text-gray-700">
          After signing in, you'll receive a secure payment link. Once payment is confirmed, your order will be sent to the kitchen for preparation.
        </p>
        <p className="mb-6 text-blue-600 font-medium">
          📧 Important: Please use a Gmail address for the best experience with our payment system.
        </p>
        <div className="flex flex-col space-y-4">
          <button
            onClick={() => {
              // Store order data before authentication if available
              if (orderData) {
                // Add customer name if available
                if (customerName) {
                  orderData.customerName = customerName;
                }
                storePendingOrder(orderData);
                console.log('Order data stored from AuthModal:', orderData);
              }
              
              // Proceed with login
              onLogin();
            }}
            className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 font-medium"
          >
            Sign In with Auth0
          </button>
          <p className="text-sm text-gray-600 text-center">
            Your voice ordering session will continue after authentication.
          </p>
          <p className="text-sm text-gray-600 text-center mt-2">
            We'll securely process your payment and send your order to the kitchen.
          </p>
          <button
            onClick={onClose}
            className="bg-gray-300 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-400 mt-2"
          >
            Cancel Order
          </button>
        </div>
      </div>
    </div>
  );
}
