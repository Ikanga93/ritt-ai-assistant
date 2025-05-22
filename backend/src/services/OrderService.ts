import { OrderRepository, CreateOrderData } from '../repositories/OrderRepository.js';
import { OrderStatus } from '../types/order.js';
import { AppDataSource } from '../database.js';
import { Order } from '../entities/Order.js';
import * as logger from '../utils/logger.js';

export class OrderService {
  private orderRepository: OrderRepository;

  constructor() {
    this.orderRepository = new OrderRepository();
  }

  async createOrder(orderData: CreateOrderData): Promise<Order> {
    return this.orderRepository.createOrderWithItems(orderData);
  }

  async updateOrderStatus(orderId: number, status: OrderStatus): Promise<Order | null> {
    return this.orderRepository.updateStatus(orderId, status);
  }

  async updateOrderItems(
    orderId: number,
    items: Array<{ menuItemId: number; quantity: number; specialInstructions?: string }>
  ): Promise<Order | null> {
    return this.orderRepository.updateOrderItems(orderId, items);
  }

  async getOrderById(orderId: number): Promise<Order | null> {
    return this.orderRepository.findOne(orderId);
  }

  async getCustomerOrders(customerId: number): Promise<Order[]> {
    return this.orderRepository.findByCustomerId(customerId);
  }

  async getActiveOrders(): Promise<Order[]> {
    return this.orderRepository.findActiveOrders();
  }

  async cancelOrder(orderId: number): Promise<Order | null> {
    const order = await this.orderRepository.findOne(orderId);
    if (!order || order.status !== OrderStatus.PENDING) {
      return null;
    }

    return this.orderRepository.updateStatus(orderId, OrderStatus.CANCELLED);
  }

  async completeOrder(orderId: number): Promise<Order | null> {
    const order = await this.orderRepository.findOne(orderId);
    if (!order || order.status !== OrderStatus.PAID) {
      return null;
    }

    return this.orderRepository.updateStatus(orderId, OrderStatus.COMPLETED);
  }

  /**
   * Create an order in AWAITING_PAYMENT state for embedded checkout
   * @param orderData The order data with customer and payment information
   * @param customerEmail The customer's email
   * @param customerName The customer's name (optional)
   * @returns The created order
   */
  async createOrderAwaitingPayment(
    orderData: Omit<CreateOrderData, 'customerId' | 'customer_email' | 'customer_name' | 'status'> & { 
      customerId?: number;
    },
    customerEmail: string,
    customerName?: string
  ): Promise<Order> {
    const correlationId = logger.createCorrelationId();
    
    try {
      logger.info('Creating order in AWAITING_PAYMENT state', {
        correlationId,
        context: 'OrderService.createOrderAwaitingPayment',
        data: {
          customerId: orderData.customerId,
          restaurantId: orderData.restaurantId,
          itemsCount: orderData.items?.length || 0
        }
      });
      
      // Create the order with the provided customer ID or a default one
      const order = await this.orderRepository.createOrderWithItems({
        ...orderData,
        customerId: orderData.customerId || 0, // Default to 0 if not provided
        customer_email: customerEmail,
        customer_name: customerName || '',
        status: 'AWAITING_PAYMENT' as OrderStatus
      });
      
      logger.info('Successfully created order in AWAITING_PAYMENT state', {
        correlationId,
        context: 'OrderService.createOrderAwaitingPayment',
        data: {
          orderId: order.id,
          orderNumber: order.order_number,
          customerEmail,
          customerName: customerName || 'Guest'
        }
      });
      
      return order;
    } catch (error) {
      logger.error('Failed to create order in AWAITING_PAYMENT state', {
        correlationId,
        context: 'OrderService.createOrderAwaitingPayment',
        error: error instanceof Error ? error.message : 'Unknown error',
        data: {
          customerEmail,
          customerName: customerName || 'Guest',
          restaurantId: orderData.restaurantId,
          errorDetails: error instanceof Error ? error.toString() : 'Unknown error'
        }
      });
      throw error;
    }
  }
  
  /**
   * Update an order status from AWAITING_PAYMENT to PAID
   * @param orderId The order ID
   * @param paymentIntentId The Stripe payment intent ID
   * @returns The updated order or null if not found or invalid status transition
   */
  async confirmOrderPayment(orderId: number, paymentIntentId: string): Promise<Order | null> {
    const correlationId = logger.createCorrelationId(String(orderId));
    
    try {
      const order = await this.orderRepository.findOne(orderId);
      
      if (!order) {
        logger.warn('Order not found for payment confirmation', {
          correlationId,
          context: 'OrderService.confirmOrderPayment',
          data: { orderId }
        });
        return null;
      }
      
      // Only allow transition from AWAITING_PAYMENT to PAID
      if (order.status !== 'AWAITING_PAYMENT') {
        logger.warn('Invalid status transition for payment confirmation', {
          correlationId,
          context: 'OrderService.confirmOrderPayment',
          data: {
            orderId,
            currentStatus: order.status,
            expectedStatus: 'AWAITING_PAYMENT'
          }
        });
        return null;
      }
      
      // Update the order status to PAID and store the payment intent ID
      const updatedOrder = await this.orderRepository.updateOrderWithPayment(
        orderId,
        'PAID' as OrderStatus,
        paymentIntentId
      );
      
      if (updatedOrder) {
        logger.info('Successfully confirmed order payment', {
          correlationId,
          context: 'OrderService.confirmOrderPayment',
          data: {
            orderId,
            orderNumber: updatedOrder.order_number,
            paymentIntentId,
            customerEmail: updatedOrder.customer_email
          }
        });
      }
      
      return updatedOrder;
    } catch (error) {
      logger.error('Failed to confirm order payment', {
        correlationId,
        context: 'OrderService.confirmOrderPayment',
        error: error instanceof Error ? error.message : 'Unknown error',
        data: { 
          orderId, 
          paymentIntentId,
          errorDetails: error instanceof Error ? error.toString() : 'Unknown error'
        }
      });
      throw error;
    }
  }
} 