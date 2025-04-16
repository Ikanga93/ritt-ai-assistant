import { PaymentRepository } from '../repositories/PaymentRepository.js';
import { OrderRepository } from '../repositories/OrderRepository.js';
import { PaymentStatus } from '../types/payment.js';
import { AppDataSource } from '../database.js';

export class PaymentService {
  private paymentRepository: PaymentRepository;
  private orderRepository: OrderRepository;

  constructor() {
    this.paymentRepository = new PaymentRepository();
    this.orderRepository = new OrderRepository();
  }

  async processPayment(orderId: number, amount: number, stripePaymentId: string): Promise<PaymentStatus> {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Check if order exists first
      const order = await this.orderRepository.findOne(orderId);
      if (!order) {
        throw new Error('Order not found');
      }

      // Create payment record
      const payment = await this.paymentRepository.createPayment({
        orderId,
        amount,
        stripePaymentId,
        status: 'PENDING',
      });

      // Update order status
      order.status = 'PAID';
      await this.orderRepository.save(order);

      // Update payment status
      payment.status = 'COMPLETED';
      await this.paymentRepository.save(payment);

      await queryRunner.commitTransaction();
      return 'COMPLETED';
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async handlePaymentFailure(orderId: number, error: any): Promise<void> {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Update payment status
      const payment = await this.paymentRepository.findLatestByOrderId(orderId);
      if (payment) {
        payment.status = 'FAILED';
        await this.paymentRepository.save(payment);
      }

      // Update order status
      const order = await this.orderRepository.findOne(orderId);
      if (order) {
        order.status = 'FAILED';
        await this.orderRepository.save(order);
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getPaymentStatus(orderId: number): Promise<PaymentStatus | null> {
    const payment = await this.paymentRepository.findLatestByOrderId(orderId);
    return payment?.status as PaymentStatus || null;
  }

  async refundPayment(orderId: number): Promise<void> {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Update payment status
      const payment = await this.paymentRepository.findLatestByOrderId(orderId);
      if (payment) {
        payment.status = 'REFUNDED';
        await this.paymentRepository.save(payment);
      }

      // Update order status
      const order = await this.orderRepository.findOne(orderId);
      if (order) {
        order.status = 'REFUNDED';
        await this.orderRepository.save(order);
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
} 