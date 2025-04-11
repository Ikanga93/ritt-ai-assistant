'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function OrderConfirmation() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('order_id');
  const status = searchParams.get('status');
  const [orderStatus, setOrderStatus] = useState('loading');

  useEffect(() => {
    if (orderId) {
      // Check if status is provided by Stripe Checkout
      if (status === 'success') {
        setOrderStatus('success');
      } else if (status === 'canceled') {
        setOrderStatus('canceled');
      } else {
        // If no status provided, check with backend (or default to success for demo)
        setOrderStatus('success');
      }
    }
  }, [orderId, status]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
      <div className="p-8 bg-gray-800 rounded-lg shadow-md max-w-md w-full border border-gray-700">
        {/* Ritt Drive-Thru branding */}
        <div className="flex items-center justify-center mb-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white">Ritt</h1>
            <p className="text-sm text-gray-400">drive-thru</p>
          </div>
        </div>

        <h2 className="text-2xl font-bold text-center mb-6">Order Confirmation</h2>
        
        {orderStatus === 'loading' && (
          <div className="flex flex-col items-center justify-center py-6">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white mb-4"></div>
            <p className="text-center text-gray-300">Loading your order details...</p>
          </div>
        )}
        
        {orderStatus === 'canceled' && (
          <>
            <div className="mb-6 text-center">
              <div className="w-16 h-16 bg-red-900 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white">Payment Canceled</h3>
              <p className="text-gray-400 mt-2">Your order has been canceled.</p>
            </div>
            
            <div className="mt-8">
              <Link href="/" className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded text-center transition duration-200">
                Return to Drive-Thru
              </Link>
            </div>
          </>
        )}
        
        {orderStatus === 'success' && (
          <>
            <div className="mb-6 text-center">
              <div className="w-16 h-16 bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white">Payment Successful!</h3>
              <p className="text-gray-400 mt-2">Your order #{orderId} has been confirmed.</p>
            </div>
            
            <div className="bg-gray-700 p-4 rounded-lg mb-6">
              <p className="text-center text-gray-300">
                Thank you for your order. Please proceed to the pickup window.
              </p>
              <p className="text-center text-gray-400 text-sm mt-2">
                Your order details have been sent to the restaurant.
              </p>
            </div>

            <div className="text-center">
              <Link href="/" className="inline-block px-6 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors">
                Return to Home
              </Link>
            </div>
          </>
        )}

        {orderStatus === 'error' && (
          <div className="text-center">
            <div className="w-16 h-16 bg-red-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-white">Payment Error</h3>
            <p className="text-gray-400 mt-2 mb-6">There was an issue processing your payment.</p>
            <p className="text-gray-300">
              You can still pick up your order and pay at the pickup window.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
