import { FindOptionsWhere, MoreThanOrEqual } from "typeorm";
import { Order } from "../entities/Order.js";
import { OrderItem } from "../entities/OrderItem.js";
import { BaseRepository } from "./BaseRepository.js";
import { OrderStatus } from "../types/order.js";
import { AppDataSource } from "../database.js";

export interface CreateOrderData {
  customerId: number;
  restaurantId: number;
  items: Array<{
    menuItemId: number;
    quantity: number;
    specialInstructions?: string;
  }>;
}

export class OrderRepository extends BaseRepository<Order> {
  constructor() {
    super(Order);
  }

  async createOrderWithItems(orderData: CreateOrderData): Promise<Order> {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Create the order first
      const order = new Order();
      order.customer_id = orderData.customerId;
      order.restaurant_id = orderData.restaurantId;
      order.status = OrderStatus.PENDING;
      order.order_number = `ORD-${Date.now()}`;

      // Calculate initial totals (will be updated with actual menu item prices)
      const { subtotal, tax, total } = await this.calculateOrderTotals(orderData.items);
      order.subtotal = subtotal;
      order.tax = tax;
      order.total = total;

      const savedOrder = await queryRunner.manager.save(Order, order);

      // Create order items
      const orderItems = orderData.items.map(item => {
        const orderItem = new OrderItem();
        orderItem.order_id = savedOrder.id;
        orderItem.menu_item_id = item.menuItemId;
        orderItem.quantity = item.quantity;
        orderItem.special_instructions = item.specialInstructions || null;
        return orderItem;
      });

      await queryRunner.manager.save(OrderItem, orderItems);
      await queryRunner.commitTransaction();

      return this.findOne(savedOrder.id) as Promise<Order>;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findByCustomerId(customerId: number): Promise<Order[]> {
    return this.repository.find({
      where: { customer_id: customerId } as FindOptionsWhere<Order>,
      relations: ['items', 'items.menuItem']
    });
  }

  async findActiveOrders(): Promise<Order[]> {
    return this.repository.find({
      where: {
        status: MoreThanOrEqual(OrderStatus.PENDING)
      } as FindOptionsWhere<Order>,
      relations: ['items', 'items.menuItem']
    });
  }

  async updateStatus(id: number, status: OrderStatus): Promise<Order | null> {
    const order = await this.repository.findOne({ 
      where: { id } as FindOptionsWhere<Order>,
      relations: ['items', 'items.menuItem']
    });
    if (!order) return null;
    
    order.status = status;
    return this.repository.save(order);
  }

  async updateOrderItems(
    orderId: number,
    items: Array<{ menuItemId: number; quantity: number; specialInstructions?: string }>
  ): Promise<Order | null> {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const order = await this.findOne(orderId);
      if (!order || order.status !== OrderStatus.PENDING) {
        return null;
      }

      // Delete existing items
      await queryRunner.manager.delete(OrderItem, { order_id: orderId });

      // Create new items
      const orderItems = items.map(item => {
        const orderItem = new OrderItem();
        orderItem.order_id = orderId;
        orderItem.menu_item_id = item.menuItemId;
        orderItem.quantity = item.quantity;
        orderItem.special_instructions = item.specialInstructions || null;
        return orderItem;
      });

      await queryRunner.manager.save(OrderItem, orderItems);

      // Update order totals
      const { subtotal, tax, total } = await this.calculateOrderTotals(items);
      order.subtotal = subtotal;
      order.tax = tax;
      order.total = total;

      const updatedOrder = await queryRunner.manager.save(Order, order);
      await queryRunner.commitTransaction();

      return this.findOne(updatedOrder.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async calculateOrderTotals(items: Array<{ menuItemId: number; quantity: number }>) {
    // Fetch menu items to get prices
    const menuItems = await AppDataSource.manager
      .createQueryBuilder()
      .select("menu_item")
      .from("menu_items", "menu_item")
      .whereInIds(items.map(item => item.menuItemId))
      .getMany();

    // Calculate subtotal
    const subtotal = items.reduce((total, item) => {
      const menuItem = menuItems.find(mi => mi.id === item.menuItemId);
      return total + (menuItem ? menuItem.price * item.quantity : 0);
    }, 0);

    // Calculate tax (assuming 10% tax rate)
    const taxRate = 0.10;
    const tax = subtotal * taxRate;

    // Calculate total
    const total = subtotal + tax;

    return { subtotal, tax, total };
  }
} 