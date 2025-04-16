import { OrderRepository, CreateOrderData } from '../repositories/OrderRepository.js';
import { OrderStatus } from '../types/order.js';
import { AppDataSource } from '../database.js';
import { Order } from '../entities/Order.js';

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
} 