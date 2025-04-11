import { JobContext } from '@livekit/agents';
import { ConversationState, ConversationStage, updateStage } from './conversationState.js';
import { paymentService, Order, OrderItem } from './paymentService.js';

/**
 * Handles payment processing for an order
 * @param ctx LiveKit agent context
 * @param state Current conversation state
 * @returns Updated conversation state
 */
export async function handlePayment(ctx: JobContext, state: ConversationState): Promise<ConversationState> {
  try {
    // Create an order object from the current state
    const orderItems: OrderItem[] = state.cartItems.map(item => ({
      id: item.id || `item-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      name: item.name,
      price: item.price || 0,
      quantity: item.quantity
    }));

    // Calculate total amount
    const totalAmount = orderItems.reduce((total, item) => total + (item.price * item.quantity), 0);

    const order: Order = {
      id: `order-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      items: orderItems,
      totalAmount: totalAmount,
      customerName: state.customerName || 'Guest',
      status: 'pending',
      createdAt: new Date()
    };
    
    // Generate payment link
    const paymentUrl = await paymentService.createPaymentLink(order);
    
    // Return the payment link message to be sent by the agent
    // The agent will handle sending the message to the customer
    console.log(`Payment link generated: ${paymentUrl}`);
    
    // Update the conversation state with payment information
    const updatedState = { ...state };
    updatedState.paymentUrl = paymentUrl;
    
    // Update conversation state to reflect payment link was sent
    return updateStage(updatedState, ConversationStage.PAYMENT_PENDING);
  } catch (error) {
    console.error('Error handling payment:', error);
    
    // Log the error and continue with order completion
    console.error('Payment processing error:', error);
    
    // Update the conversation state to indicate payment failed
    const updatedState = { ...state };
    updatedState.paymentError = true;
    
    // Continue with order completion despite payment error
    return updateStage(updatedState, ConversationStage.ORDER_COMPLETED);
  }
}
