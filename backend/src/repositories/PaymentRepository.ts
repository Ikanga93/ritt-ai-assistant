import { Payment } from '../entities/Payment.js';
import { BaseRepository } from './BaseRepository.js';
import { AppDataSource } from '../database.js';
import { PaymentStatus } from '../types/payment.js';

export class PaymentRepository extends BaseRepository<Payment> {
  constructor() {
    super(Payment);
  }

  async createPayment(data: {
    orderId: number;
    amount: number;
    stripePaymentId?: string;
    status: PaymentStatus;
    paymentUrl?: string;
  }): Promise<Payment> {
    const payment = this.repository.create({
      order_id: data.orderId,
      amount: data.amount,
      stripe_payment_id: data.stripePaymentId,
      status: data.status,
      payment_url: data.paymentUrl,
    });

    return this.save(payment);
  }

  async updatePaymentStatus(id: number, status: PaymentStatus): Promise<Payment | null> {
    const payment = await this.findOne(id);
    if (!payment) {
      return null;
    }

    payment.status = status;
    return this.save(payment);
  }

  async findByOrderId(orderId: number): Promise<Payment[]> {
    return this.repository.find({
      where: { order_id: orderId },
      order: { created_at: 'DESC' },
    });
  }

  async findLatestByOrderId(orderId: number): Promise<Payment | null> {
    return this.repository.findOne({
      where: { order_id: orderId },
      order: { created_at: 'DESC' },
    });
  }
} 