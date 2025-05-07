import React from 'react';
import { ShoppingCart } from 'lucide-react';

interface CartIconProps {
  itemCount: number;
  onClick: () => void;
}

export function CartIcon({ itemCount, onClick }: CartIconProps) {
  return (
    <button
      onClick={onClick}
      className="relative flex items-center justify-center w-12 h-12 bg-white border border-gray-300 rounded-full shadow-md hover:border-blue-500 focus:outline-none transition-all"
      aria-label="View cart"
      style={{ outline: 'none' }}
    >
      <ShoppingCart className="h-7 w-7 text-gray-700" />
      {itemCount > 0 && (
        <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white border-2 border-white shadow">
          {itemCount}
        </span>
      )}
    </button>
  );
} 