'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';

// Use dynamic import with SSR disabled to avoid the useSearchParams error
const OrderConfirmationContent = dynamic(
  () => import('./OrderConfirmationContent'),
  { ssr: false }
);

export default function OrderConfirmation() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
        <div className="p-8 bg-gray-800 rounded-lg shadow-md max-w-md w-full border border-gray-700">
          <div className="flex items-center justify-center mb-8">
            <div className="text-center">
              <h1 className="text-3xl font-bold text-white">Ritt</h1>
              <p className="text-sm text-gray-400">drive-thru</p>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center py-6">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white mb-4"></div>
            <p className="text-center text-gray-300">Loading your order details...</p>
          </div>
        </div>
      </div>
    }>
      <OrderConfirmationContent />
    </Suspense>
  );
}
