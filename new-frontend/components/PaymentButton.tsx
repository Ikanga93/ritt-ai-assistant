import React from "react";

interface PaymentButtonProps {
  orderId: number;
  amount: number;
  onClick: () => void;
}

/**
 * PaymentButton component for displaying payment buttons in the chat interface
 * Styled to be visually distinct and attention-grabbing
 */
export default function PaymentButton({ orderId, amount, onClick }: PaymentButtonProps) {
  return (
    <button
      onClick={onClick}
      className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-full 
                 flex items-center space-x-2 shadow-md transition-all duration-200 
                 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-green-500"
      aria-label={`Pay $${amount.toFixed(2)} for order #${orderId}`}
      data-order-id={orderId}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z"
          clipRule="evenodd"
        />
      </svg>
      <span>Pay ${amount.toFixed(2)}</span>
    </button>
  );
}
