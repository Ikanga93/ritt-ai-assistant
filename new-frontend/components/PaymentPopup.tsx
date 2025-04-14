import React from 'react';

interface PaymentPopupProps {
  isOpen: boolean;
  onClose: () => void;
  paymentUrl: string;
}

export const PaymentPopup: React.FC<PaymentPopupProps> = ({ isOpen, onClose, paymentUrl }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Complete Your Payment</h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>
        <div className="flex flex-col items-center space-y-4">
          <p className="text-center text-gray-600">Please click the button below to complete your payment.</p>
          <button
            onClick={() => window.open(paymentUrl, '_blank')}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors duration-200"
          >
            Complete Payment
          </button>
        </div>
      </div>
    </div>
  );
}; 