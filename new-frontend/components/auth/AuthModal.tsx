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
          Hi {customerName}! Your order has been confirmed. You'll receive a secure payment link shortly.
        </p>
        <p className="mb-4 text-gray-700">
          Once payment is confirmed, your order will be sent to the kitchen for preparation.
        </p>
        <p className="mb-6 text-blue-600 font-medium">
          📧 Important: Please check your email for the payment link.
        </p>
        <div className="flex flex-col space-y-4">
          <button
            onClick={onClose}
            className="bg-gray-300 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-400 mt-2"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
