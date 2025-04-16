import { PaymentRepository } from '../PaymentRepository.js';
import { OrderRepository } from '../OrderRepository.js';
import { AppDataSource } from '../../database.js';
import { PaymentStatus } from '../../types/payment.js';
import { Customer } from '../../entities/Customer.js';
import { Order } from '../../entities/Order.js';

describe('PaymentRepository', () => {
  let paymentRepository: PaymentRepository;
  let orderRepository: OrderRepository;
  let testOrderId: number;

  beforeAll(async () => {
    await AppDataSource.initialize();
    paymentRepository = new PaymentRepository();
    orderRepository = new OrderRepository();
  });

  beforeEach(async () => {
    // Clean up existing data
    await AppDataSource.manager.query('DELETE FROM "payments"');
    await AppDataSource.manager.query('DELETE FROM "orders"');
    await AppDataSource.manager.query('DELETE FROM "customers"');

    // Create a test order
    const customer = new Customer();
    customer.name = 'Test Customer';
    customer.email = 'test@example.com';
    customer.phone = '1234567890';
    await AppDataSource.manager.save(customer);

    const order = new Order();
    order.order_number = `TEST-${Date.now()}`;
    order.status = 'PENDING';
    order.subtotal = 10;
    order.tax = 0.99;
    order.total = 10.99;
    order.customer_id = customer.id;
    order.restaurant_id = 1;
    await AppDataSource.manager.save(order);

    testOrderId = order.id;
  });

  afterEach(async () => {
    // Clean up after each test
    await AppDataSource.manager.query('DELETE FROM "payments"');
    await AppDataSource.manager.query('DELETE FROM "orders"');
    await AppDataSource.manager.query('DELETE FROM "customers"');
  });

  afterAll(async () => {
    await AppDataSource.destroy();
  });

  describe('createPayment', () => {
    it('should create a new payment record', async () => {
      const paymentData = {
        orderId: testOrderId,
        amount: 10.99,
        stripePaymentId: 'test_stripe_id',
        status: 'PENDING' as PaymentStatus,
        paymentUrl: 'https://example.com/payment',
      };

      const payment = await paymentRepository.createPayment(paymentData);

      expect(payment).toBeDefined();
      expect(payment.order_id).toBe(testOrderId);
      expect(payment.amount).toBe(10.99);
      expect(payment.stripe_payment_id).toBe('test_stripe_id');
      expect(payment.status).toBe('PENDING');
      expect(payment.payment_url).toBe('https://example.com/payment');
    });
  });

  describe('updatePaymentStatus', () => {
    it('should update payment status', async () => {
      // Create a payment first
      const payment = await paymentRepository.createPayment({
        orderId: testOrderId,
        amount: 10.99,
        status: 'PENDING' as PaymentStatus,
      });

      // Update the status
      const updatedPayment = await paymentRepository.updatePaymentStatus(payment.id, 'COMPLETED');

      expect(updatedPayment).toBeDefined();
      expect(updatedPayment?.status).toBe('COMPLETED');
    });

    it('should return null for non-existent payment', async () => {
      const updatedPayment = await paymentRepository.updatePaymentStatus(999999, 'COMPLETED');
      expect(updatedPayment).toBeNull();
    });
  });

  describe('findByOrderId', () => {
    it('should find all payments for an order', async () => {
      // Create multiple payments
      await paymentRepository.createPayment({
        orderId: testOrderId,
        amount: 10.99,
        status: 'PENDING' as PaymentStatus,
      });

      await paymentRepository.createPayment({
        orderId: testOrderId,
        amount: 10.99,
        status: 'COMPLETED' as PaymentStatus,
      });

      const payments = await paymentRepository.findByOrderId(testOrderId);

      expect(payments).toHaveLength(2);
      expect(payments[0].status).toBe('COMPLETED'); // Should be ordered by created_at DESC
      expect(payments[1].status).toBe('PENDING');
    });

    it('should return empty array for non-existent order', async () => {
      const payments = await paymentRepository.findByOrderId(999999);
      expect(payments).toHaveLength(0);
    });
  });

  describe('findLatestByOrderId', () => {
    it('should find the latest payment for an order', async () => {
      // Create multiple payments
      await paymentRepository.createPayment({
        orderId: testOrderId,
        amount: 10.99,
        status: 'PENDING' as PaymentStatus,
      });

      await paymentRepository.createPayment({
        orderId: testOrderId,
        amount: 10.99,
        status: 'COMPLETED' as PaymentStatus,
      });

      const latestPayment = await paymentRepository.findLatestByOrderId(testOrderId);

      expect(latestPayment).toBeDefined();
      expect(latestPayment?.status).toBe('COMPLETED');
    });

    it('should return null for non-existent order', async () => {
      const latestPayment = await paymentRepository.findLatestByOrderId(999999);
      expect(latestPayment).toBeNull();
    });
  });
}); 