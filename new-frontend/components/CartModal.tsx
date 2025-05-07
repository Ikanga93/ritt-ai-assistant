import React from 'react';
import { X } from 'lucide-react';
import { Order } from '../types/order';

interface CartModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
}

export function CartModal({ isOpen, onClose, orders }: CartModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-lg shadow-xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 bg-white border-b">
          <h2 className="text-xl font-semibold text-gray-900">
            Your Pending Orders
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 focus:outline-none"
            aria-label="Close cart"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-lg text-gray-600">No pending orders</p>
              <p className="mt-2 text-sm text-gray-500">
                Your completed orders will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {orders.map((order) => (
                <div 
                  key={order.id}
                  className="p-4 bg-gray-50 rounded-lg border border-gray-200"
                >
                  {/* Order Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-medium text-gray-900">
                        {order.restaurantName}
                      </h3>
                      <p className="text-sm text-gray-500">
                        Order #{order.orderNumber}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-gray-900">
                        ${order.total.toFixed(2)}
                      </p>
                      <p className="text-sm text-gray-500">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {/* Order Items */}
                  <div className="mb-4">
                    <h4 className="mb-2 text-sm font-medium text-gray-700">
                      Items
                    </h4>
                    <ul className="space-y-2">
                      {order.items.map((item, index) => (
                        <li 
                          key={index}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-gray-600">
                            {item.quantity}x {item.name}
                          </span>
                          <span className="text-gray-900">
                            ${(item.price * item.quantity).toFixed(2)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Payment Link */}
                  {order.paymentLink && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <a
                        href={order.paymentLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-full px-4 py-2 text-center text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      >
                        Complete Payment
                      </a>
                      <p className="mt-2 text-xs text-center text-gray-500">
                        Click to complete your payment securely
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 