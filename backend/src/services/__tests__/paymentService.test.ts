import { PaymentService } from '../paymentService.js';
import { AppDataSource } from '../../database.js';
import { Customer } from '../../entities/Customer.js';
import { Order } from '../../entities/Order.js';
import { Payment } from '../../entities/Payment.js';
import { PaymentStatus } from '../../types/payment.js';

describe('PaymentService', () => {
  let paymentService: PaymentService;
  let testOrderId: number;

  beforeAll(async () => {
    await AppDataSource.initialize();
    paymentService = new PaymentService();
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

  describe('processPayment', () => {
    it('should process payment successfully', async () => {
      const status = await paymentService.processPayment(
        testOrderId,
        10.99,
        'test_stripe_id'
      );

      expect(status).toBe('COMPLETED');

      // Verify order status was updated
      const order = await AppDataSource.manager.findOne(Order, {
        where: { id: testOrderId },
      });
      expect(order?.status).toBe('PAID');

      // Verify payment was created
      const payments = await AppDataSource.manager.find(Payment, {
        where: { order_id: testOrderId },
      });
      expect(payments).toHaveLength(1);
      expect(payments[0].status).toBe('COMPLETED');
    });

    it('should handle invalid order ID', async () => {
      await expect(
        paymentService.processPayment(999999, 10.99, 'test_stripe_id')
      ).rejects.toThrow('Order not found');
    });
  });

  describe('handlePaymentFailure', () => {
    it('should update payment and order status on failure', async () => {
      // Create a pending payment first
      await paymentService.processPayment(testOrderId, 10.99, 'test_stripe_id');

      // Simulate a payment failure
      await paymentService.handlePaymentFailure(testOrderId, new Error('Payment failed'));

      // Verify order status was updated
      const order = await AppDataSource.manager.findOne(Order, {
        where: { id: testOrderId },
      });
      expect(order?.status).toBe('FAILED');

      // Verify payment status was updated
      const payments = await AppDataSource.manager.find(Payment, {
        where: { order_id: testOrderId },
      });
      expect(payments[0].status).toBe('FAILED');
    });
  });

  describe('getPaymentStatus', () => {
    it('should return payment status', async () => {
      // Create a payment
      await paymentService.processPayment(testOrderId, 10.99, 'test_stripe_id');

      const status = await paymentService.getPaymentStatus(testOrderId);
      expect(status).toBe('COMPLETED');
    });

    it('should return null for non-existent payment', async () => {
      const status = await paymentService.getPaymentStatus(999999);
      expect(status).toBeNull();
    });
  });

  describe('refundPayment', () => {
    it('should process refund successfully', async () => {
      // Create a completed payment first
      await paymentService.processPayment(testOrderId, 10.99, 'test_stripe_id');

      // Process refund
      await paymentService.refundPayment(testOrderId);

      // Verify order status was updated
      const order = await AppDataSource.manager.findOne(Order, {
        where: { id: testOrderId },
      });
      expect(order?.status).toBe('REFUNDED');

      // Verify payment status was updated
      const payments = await AppDataSource.manager.find(Payment, {
        where: { order_id: testOrderId },
      });
      expect(payments[0].status).toBe('REFUNDED');
    });
  });
}); 