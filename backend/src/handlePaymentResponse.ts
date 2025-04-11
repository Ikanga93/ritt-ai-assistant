// Handle payment response from the customer
import { JobContext } from '@livekit/agents';
import { ConversationState, ConversationStage, updateStage } from './conversationState.js';
import { handlePayment } from './handlePayment.js';

/**
 * Process the customer's response to the payment question
 * @param ctx LiveKit agent context
 * @param state Current conversation state
 * @param userMessage The user's message (response to payment question)
 * @returns Updated conversation state
 */
export async function handlePaymentResponse(
  ctx: JobContext,
  state: ConversationState,
  userMessage: string
): Promise<ConversationState> {
  // Only process if we're in the payment pending stage
  if (state.stage !== ConversationStage.PAYMENT_PENDING) {
    return state;
  }

  console.log('Processing payment response:', userMessage);

  // Check if the user wants to pay now
  const payNowIndicators = ['now', 'yes', 'online', 'payment', 'link', 'pay now', 'sure'];
  const payLaterIndicators = ['later', 'no', 'pickup', 'window', 'pay later', 'at pickup'];

  // Normalize the user message for comparison
  const normalizedMessage = userMessage.toLowerCase().trim();

  // Check if the user wants to pay now
  const wantToPayNow = payNowIndicators.some(indicator => normalizedMessage.includes(indicator.toLowerCase()));
  const wantToPayLater = payLaterIndicators.some(indicator => normalizedMessage.includes(indicator.toLowerCase()));

  if (wantToPayNow && !wantToPayLater) {
    // User wants to pay now, generate payment link
    await ctx.agent.sendText("Alright, I'll generate a payment link for you. One moment please...");

    try {
      // Generate payment link
      const updatedState = await handlePayment(ctx, state);
      
      // Send the payment link to the customer
      if (updatedState.paymentUrl) {
        await ctx.agent.sendText(`Here's your payment link: ${updatedState.paymentUrl}\nAfter payment, please proceed to the pickup window.`);
      } else {
        await ctx.agent.sendText("I'm sorry, I couldn't generate a payment link at this time. You can pay at the pickup window instead.");
      }

      // Update the state with the payment information
      const finalState = { ...updatedState };
      
      // Mark order as completed
      return updateStage(finalState, ConversationStage.ORDER_COMPLETED);
    } catch (error) {
      console.error('Error generating payment link:', error);
      await ctx.agent.sendText("I'm sorry, there was an error processing your payment. You can pay at the pickup window instead.");
      
      // Mark order as completed despite payment error
      return updateStage(state, ConversationStage.ORDER_COMPLETED);
    }
  } else {
    // User wants to pay later or response is unclear
    if (wantToPayLater) {
      await ctx.agent.sendText("No problem! You can pay at the pickup window. Thank you for your order!");
    } else {
      // Response is unclear, default to paying at pickup
      await ctx.agent.sendText("I'll assume you'll pay at the pickup window. Thank you for your order!");
    }
    
    // Mark order as completed
    return updateStage(state, ConversationStage.ORDER_COMPLETED);
  }
}
