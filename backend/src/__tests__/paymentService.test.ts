import { PaymentService } from '../services/paymentService.js';
import { PaymentStatus } from '../types/payment.js';
import { PaymentRepository } from '../repositories/PaymentRepository.js';
import { OrderRepository } from '../repositories/OrderRepository.js';
import { Payment } from '../entities/Payment.js';
import { Order } from '../entities/Order.js';
import { OrderStatus } from '../types/order.js';
import { BaseRepository } from '../repositories/BaseRepository.js';

// Create mock class for OrderRepository
class MockOrderRepository extends BaseRepository<Order> {
  constructor() {
    super(Order);
  }

  async createOrderWithItems() {
    return Promise.resolve(new Order());
  }

  async findByCustomerId() {
    return Promise.resolve([]);
  }

  async findActiveOrders() {
    return Promise.resolve([]);
  }

  async updateStatus() {
    return Promise.resolve(null);
  }

  async updateOrderItems() {
    return Promise.resolve(null);
  }

  private calculateOrderTotals() {
    return Promise.resolve({ subtotal: 0, tax: 0, total: 0 });
  }
}

// Mock repositories
jest.mock('../repositories/PaymentRepository.js', () => ({
  PaymentRepository: jest.fn().mockImplementation(() => ({
    createPayment: jest.fn().mockResolvedValue({ id: 1, status: 'PENDING' }),
    findLatestByOrderId: jest.fn().mockResolvedValue({ id: 1, status: 'COMPLETED' }),
    save: jest.fn().mockImplementation((payment: Payment) => Promise.resolve(payment))
  }))
}));

jest.mock('../repositories/OrderRepository.js', () => ({
  OrderRepository: jest.fn().mockImplementation(() => new MockOrderRepository())
}));

// Mock AppDataSource
jest.mock('../database.js', () => ({
  AppDataSource: {
    createQueryRunner: () => ({
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn()
    }),
    getRepository: () => ({
      findOne: jest.fn().mockResolvedValue({ id: 1, status: OrderStatus.PENDING }),
      find: jest.fn(),
      save: jest.fn(),
      delete: jest.fn()
    })
  }
}));

describe('PaymentService', () => {
  let paymentService: PaymentService;

  beforeEach(() => {
    jest.clearAllMocks();
    paymentService = new PaymentService();
  });

  it('should process payment successfully', async () => {
    const orderId = 123;
    const amount = 1000;
    const stripePaymentId = 'pi_123';
    
    const result = await paymentService.processPayment(orderId, amount, stripePaymentId);
    
    expect(result).toBe('COMPLETED' as PaymentStatus);
  });

  it('should handle invalid order ID', async () => {
    const orderId = -1;
    const amount = 1000;
    const stripePaymentId = 'pi_123';
    
    // Mock OrderRepository to return null for invalid order
    jest.spyOn(MockOrderRepository.prototype, 'findOne').mockResolvedValue(null);
    
    await expect(paymentService.processPayment(orderId, amount, stripePaymentId))
      .rejects.toThrow('Order not found');
  });

  it('should get payment status', async () => {
    const orderId = 123;
    
    const status = await paymentService.getPaymentStatus(orderId);
    
    expect(status).toBe('COMPLETED' as PaymentStatus);
  });

  it('should handle payment failure', async () => {
    const orderId = 123;
    const error = new Error('Payment failed');
    
    await paymentService.handlePaymentFailure(orderId, error);
    
    // Verify payment and order status were updated
    const status = await paymentService.getPaymentStatus(orderId);
    expect(status).toBe('FAILED' as PaymentStatus);
  });
}); 