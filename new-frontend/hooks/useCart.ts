import { useState, useEffect, useCallback } from 'react';
import { getPendingOrders } from '../services/cartService';
import { Order } from '../types/order';

export function useCart(customerEmail: string | null) {
  const [isOpen, setIsOpen] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!customerEmail) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const pendingOrders = await getPendingOrders(customerEmail);
      setOrders(pendingOrders);
    } catch (err) {
      setError('Failed to fetch pending orders');
      console.error('Error fetching pending orders:', err);
    } finally {
      setIsLoading(false);
    }
  }, [customerEmail]);

  useEffect(() => {
    if (customerEmail) {
      fetchOrders();
    }
  }, [customerEmail, fetchOrders]);

  const openCart = () => setIsOpen(true);
  const closeCart = () => setIsOpen(false);

  return {
    isOpen,
    orders,
    isLoading,
    error,
    openCart,
    closeCart,
    refreshOrders: fetchOrders
  };
} 