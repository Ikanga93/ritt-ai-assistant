import { PaymentService } from './paymentService.js';
import { AppDataSource } from '../database.js';

const paymentService = new PaymentService();

export async function handlePayment(orderId: number, stripePaymentId: string, amount: number): Promise<void> {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // Process payment through Stripe
    // This is where you would integrate with the Stripe API
    // For now, we'll simulate a successful payment

    // Update payment status in database
    const status = await paymentService.processPayment(orderId, amount, stripePaymentId);
    
    if (status !== 'COMPLETED') {
      throw new Error('Payment processing failed');
    }

    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    
    // Handle payment failure
    await paymentService.handlePaymentFailure(orderId, error);
    throw error;
  } finally {
    await queryRunner.release();
  }
}

export async function handlePaymentRefund(orderId: number): Promise<void> {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // Process refund through Stripe
    // This is where you would integrate with the Stripe API
    // For now, we'll simulate a successful refund

    // Update refund status in database
    await paymentService.refundPayment(orderId);

    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

export async function getPaymentStatus(orderId: number): Promise<string | null> {
  return paymentService.getPaymentStatus(orderId);
} 