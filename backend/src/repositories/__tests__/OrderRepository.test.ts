import { AppDataSource, initializeDatabase } from "../../database.js";
import { OrderRepository } from "../OrderRepository.js";
import { OrderStatus } from "../../types/order.js";
import { Customer } from "../../entities/Customer.js";
import { Order } from "../../entities/Order.js";
import { OrderItem } from "../../entities/OrderItem.js";

describe("OrderRepository", () => {
  let orderRepository: OrderRepository;
  let testCustomer: Customer;
  let testOrder: Order;
  let orderNumber = 0;

  beforeAll(async () => {
    // Initialize database connection
    await initializeDatabase();
    orderRepository = new OrderRepository();

    // Clean up any existing data
    await AppDataSource.manager.query('DELETE FROM "order_items"');
    await AppDataSource.manager.query('DELETE FROM "payments"');
    await AppDataSource.manager.query('DELETE FROM "orders"');
    await AppDataSource.manager.query('DELETE FROM "customers"');
  });

  beforeEach(async () => {
    // Create a test customer
    testCustomer = new Customer();
    testCustomer.name = "Test Customer";
    testCustomer.email = "test@example.com";
    testCustomer.phone = "1234567890";
    await AppDataSource.manager.save(testCustomer);

    // Create a test order with a unique order number
    testOrder = new Order();
    testOrder.customer_id = testCustomer.id;
    testOrder.status = OrderStatus.PENDING;
    testOrder.subtotal = 10.00;
    testOrder.tax = 0.99;
    testOrder.total = 10.99;
    testOrder.order_number = `TEST-${++orderNumber}`;
    testOrder.restaurant_id = 1;
    await AppDataSource.manager.save(testOrder);
  });

  afterEach(async () => {
    // Clean up test data in the correct order
    await AppDataSource.manager.query('DELETE FROM "order_items"');
    await AppDataSource.manager.query('DELETE FROM "payments"');
    await AppDataSource.manager.query('DELETE FROM "orders"');
    await AppDataSource.manager.query('DELETE FROM "customers"');
  });

  afterAll(async () => {
    // Close database connection
    await AppDataSource.destroy();
  });

  it("should find orders by customer ID", async () => {
    const orders = await orderRepository.findByCustomerId(testCustomer.id);
    expect(orders).toHaveLength(1);
    expect(orders[0].id).toBe(testOrder.id);
  });

  it("should return empty array for non-existent customer ID", async () => {
    const orders = await orderRepository.findByCustomerId(999999);
    expect(orders).toHaveLength(0);
  });

  it("should find active orders", async () => {
    const activeOrders = await orderRepository.findActiveOrders();
    expect(activeOrders).toHaveLength(1);
    expect(activeOrders[0].id).toBe(testOrder.id);
  });

  it("should not find completed orders", async () => {
    testOrder.status = OrderStatus.COMPLETED;
    await AppDataSource.manager.save(testOrder);

    const activeOrders = await orderRepository.findActiveOrders();
    expect(activeOrders).toHaveLength(0);
  });

  it("should update order status", async () => {
    const updatedOrder = await orderRepository.updateStatus(testOrder.id, OrderStatus.PAID);
    expect(updatedOrder).not.toBeNull();
    expect(updatedOrder?.status).toBe(OrderStatus.PAID);
  });

  it("should return null for non-existent order", async () => {
    const updatedOrder = await orderRepository.updateStatus(999999, OrderStatus.PAID);
    expect(updatedOrder).toBeNull();
  });
}); 