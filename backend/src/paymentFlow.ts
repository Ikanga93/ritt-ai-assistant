// Payment Flow Management for Ritt Drive-Thru AI Assistant
// This module handles the payment flow logic and state management

import { ConversationState, ConversationStage, updateStage } from './conversationState.js';
import { generatePaymentLink, checkPayment } from './paymentIntegration.js';
import { getOrder, updateOrder } from './orderStorage.js';
import paymentLogger from './utils/paymentLogger.js';
import paymentMonitor, { AlertLevel, AlertType } from './utils/paymentMonitor.js';

/**
 * Payment method options
 */
export enum PaymentMethod {
  ONLINE = 'online',
  WINDOW = 'window'
}

/**
 * Payment status options
 */
export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELED = 'canceled'
}

/**
 * Interface for payment flow result
 */
export interface PaymentFlowResult {
  success: boolean;
  stage: ConversationStage;
  message: string;
  paymentUrl?: string;
  paymentId?: string;
  error?: string;
  errorCode?: string;
  suggestedAction?: string;
}

/**
 * Suggest the best payment method based on order context
 * @param state The current conversation state
 * @returns The suggested payment method with explanation
 */
export function suggestPaymentMethod(state: ConversationState): { 
  method: PaymentMethod, 
  reason: string 
} {
  // Default to online payment as the preferred method for all orders
  let suggestedMethod = PaymentMethod.ONLINE;
  let reason = "Online payment is our preferred payment method for a faster checkout experience.";
  
  // Calculate order total for logging purposes
  const orderTotal = calculateOrderTotal(state);
  const itemCount = Array.isArray(state.cartItems) ? state.cartItems.length : 0;
  
  // Only suggest window payment in very specific cases
  // For example, if the order total is very small (less than $5)
  if (orderTotal < 5 && itemCount <= 1) {
    suggestedMethod = PaymentMethod.WINDOW;
    reason = "Window payment is available for small orders under $5.";
  }
  
  // Log the suggestion
  paymentLogger.info('PAYMENT_SUGGESTION', `Suggested payment method: ${suggestedMethod}`, {
    data: { reason, orderTotal, itemCount }
  });
  
  return { method: suggestedMethod, reason };
}

/**
 * Calculate the total price of items in the cart
 * @param state The current conversation state
 * @returns The total price
 */
function calculateOrderTotal(state: ConversationState): number {
  let total = 0;
  
  for (const item of state.cartItems) {
    if (item.price && item.quantity) {
      total += item.price * item.quantity;
    }
  }
  
  // Add tax (9%)
  const tax = total * 0.09;
  
  // Add processing fee (3.5% + $0.30)
  const processingFee = total * 0.035 + 0.30;
  
  // Return rounded total
  return parseFloat((total + tax + processingFee).toFixed(2));
}

/**
 * Start the online payment process with enhanced error handling and recovery
 * @param state The current conversation state
 * @param orderNumber The order number
 * @returns Payment flow result
 */
export async function startOnlinePayment(
  state: ConversationState,
  orderNumber: string
): Promise<PaymentFlowResult> {
  try {
    // Update stage to payment link generation
    updateStage(state, ConversationStage.PAYMENT_LINK_GENERATION);
    
    // Log payment initiation
    await paymentLogger.info('PAYMENT_FLOW', `Starting online payment for order #${orderNumber}`, {
      orderId: orderNumber,
      data: { stage: state.stage }
    });
    
    // Get the order details with recovery options
    const orderResult = await getOrder(orderNumber, {
      attemptRecovery: true,
      createIfMissing: true,
      conversationState: state
    });
    
    // Handle order retrieval failure
    if (!orderResult.success || !orderResult.order) {
      const errorMessage = orderResult.error || `Order #${orderNumber} not found`;
      throw new Error(errorMessage);
    }
    
    // Log if order was recovered
    if (orderResult.recovered) {
      await paymentLogger.info('PAYMENT_FLOW', `Using recovered order #${orderNumber} for payment`, {
        orderId: orderNumber,
        data: { recovered: true }
      });
    }
    
    const order = orderResult.order;
    
    // Generate payment link
    const paymentResult = await generatePaymentLink({
      orderNumber: orderNumber,
      customerName: order.customerName,
      restaurantName: order.restaurantName,
      orderTotal: order.orderTotal,
      items: order.items.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price || 0
      }))
    });
    
    if (!paymentResult.success) {
      // Handle payment link generation failure
      await paymentLogger.error('PAYMENT_FLOW', `Failed to generate payment link for order #${orderNumber}: ${paymentResult.error}`, {
        orderId: orderNumber,
        errorCode: paymentResult.code,
        data: { error: paymentResult.error }
      });
      
      // Create alert for payment link generation failure
      await paymentMonitor.createAlert(
        AlertLevel.WARNING,
        AlertType.PAYMENT_FAILURE,
        `Failed to generate payment link for order #${orderNumber}`,
        {
          orderId: orderNumber,
          errorCode: paymentResult.code,
          data: { error: paymentResult.error }
        }
      );
      
      // Suggest fallback to window payment
      return {
        success: false,
        stage: ConversationStage.PAYMENT_METHOD_SELECTION,
        message: "I'm having trouble generating an online payment link. Would you prefer to pay at the pickup window instead?",
        error: paymentResult.error,
        errorCode: paymentResult.code,
        suggestedAction: "Switch to window payment"
      };
    }
    
    // Update order with payment link ID
    await updateOrder(orderNumber, {
      paymentMethod: "online",
      paymentLinkId: paymentResult.id,
      paymentStatus: "pending"
    });
    
    // Update conversation state
    state.paymentLinkId = paymentResult.id;
    state.paymentLinkUrl = paymentResult.url;
    state.paymentStatus = "pending";
    updateStage(state, ConversationStage.PAYMENT_LINK_SHARED);
    
    // Log successful payment link generation
    await paymentLogger.info('PAYMENT_FLOW', `Payment link generated for order #${orderNumber}`, {
      orderId: orderNumber,
      paymentId: paymentResult.id,
      data: { url: paymentResult.url }
    });
    
    // Create a special format that will be preserved in production
    // Using HTML-like tags that the model is less likely to modify
    return {
      success: true,
      stage: ConversationStage.PAYMENT_LINK_SHARED,
      message: `I've created a secure payment link for your order.

<payment-url>${paymentResult.url}</payment-url>

After payment, please proceed to the pickup window.`,
      paymentUrl: paymentResult.url,
      paymentId: paymentResult.id
    };
  } catch (error) {
    // Log error
    await paymentLogger.error('PAYMENT_FLOW', `Error in online payment flow for order #${orderNumber}: ${error.message}`, {
      orderId: orderNumber,
      data: { error: error.message }
    });
    
    // Create alert for payment flow error
    await paymentMonitor.createAlert(
      AlertLevel.WARNING,
      AlertType.PAYMENT_FAILURE,
      `Error in online payment flow for order #${orderNumber}`,
      {
        orderId: orderNumber,
        data: { error: error.message }
      }
    );
    
    // Return error result with fallback suggestion
    return {
      success: false,
      stage: ConversationStage.PAYMENT_METHOD_SELECTION,
      message: "I'm having trouble setting up online payment. Would you prefer to pay at the pickup window instead?",
      error: error.message,
      suggestedAction: "Switch to window payment"
    };
  }
}

/**
 * Set up window payment for an order
 * @param state The current conversation state
 * @param orderNumber The order number
 * @returns Payment flow result
 */
export async function setupWindowPayment(
  state: ConversationState,
  orderNumber: string
): Promise<PaymentFlowResult> {
  try {
    // Get the order details with recovery options
    const orderResult = await getOrder(orderNumber, {
      attemptRecovery: true,
      createIfMissing: true,
      conversationState: state
    });
    
    // Handle order retrieval failure
    if (!orderResult.success || !orderResult.order) {
      const errorMessage = orderResult.error || `Order #${orderNumber} not found`;
      throw new Error(errorMessage);
    }
    
    const order = orderResult.order;
    
    // Update order with window payment method
    await updateOrder(orderNumber, {
      paymentMethod: "window",
      paymentStatus: "pending"
    });
    
    // Update conversation state
    state.paymentStatus = "pending";
    updateStage(state, ConversationStage.ORDER_COMPLETE);
    
    // Log window payment setup
    await paymentLogger.info('PAYMENT_FLOW', `Window payment set up for order #${orderNumber}`, {
      orderId: orderNumber,
      data: { orderTotal: order.orderTotal }
    });
    
    return {
      success: true,
      stage: ConversationStage.ORDER_COMPLETE,
      message: `Your total of $${order.orderTotal.toFixed(2)} will be due when you arrive at the pickup window. Your order will be ready in approximately ${order.estimatedTime} minutes.`
    };
  } catch (error) {
    // Log error
    await paymentLogger.error('PAYMENT_FLOW', `Error setting up window payment for order #${orderNumber}: ${error.message}`, {
      orderId: orderNumber,
      data: { error: error.message }
    });
    
    // Return error result
    return {
      success: false,
      stage: state.stage,
      message: "I'm having trouble setting up your payment. Let's try again. Would you like to pay online or at the pickup window?",
      error: error.message
    };
  }
}

/**
 * Check payment status for an order
 * @param state The current conversation state
 * @param paymentLinkId The payment link ID to check
 * @returns Payment flow result with status information
 */
export async function checkPaymentStatus(
  state: ConversationState,
  paymentLinkId: string
): Promise<PaymentFlowResult> {
  try {
    // Log payment status check
    await paymentLogger.info('PAYMENT_FLOW', `Checking payment status for link ID: ${paymentLinkId}`, {
      paymentId: paymentLinkId,
      data: { stage: state.stage }
    });
    
    // Check payment status
    const statusResult = await checkPayment(paymentLinkId);
    
    if (!statusResult.success) {
      // Handle payment status check failure
      await paymentLogger.error('PAYMENT_FLOW', `Failed to check payment status: ${statusResult.error}`, {
        paymentId: paymentLinkId,
        data: { error: statusResult.error }
      });
      
      return {
        success: false,
        stage: state.stage,
        message: "I'm having trouble checking your payment status. You can try completing your payment again using the payment link, or you can pay at the pickup window when you arrive.",
        error: statusResult.error
      };
    }
    
    // Determine if payment is active (pending) or inactive (completed)
    const isActive = statusResult.active === true;
    const paymentStatus = isActive ? PaymentStatus.PENDING : PaymentStatus.COMPLETED;
    
    // Update conversation state with payment status
    state.paymentStatus = paymentStatus;
    
    // Update stage based on payment status
    if (paymentStatus === PaymentStatus.COMPLETED) {
      updateStage(state, ConversationStage.PAYMENT_COMPLETED);
    } else {
      updateStage(state, ConversationStage.PAYMENT_CONFIRMATION);
    }
    
    // Log payment status result
    await paymentLogger.info('PAYMENT_FLOW', `Payment status checked: ${paymentStatus}`, {
      paymentId: paymentLinkId,
      data: { active: isActive, url: statusResult.url }
    });
    
    // Return result based on payment status
    if (paymentStatus === PaymentStatus.COMPLETED) {
      return {
        success: true,
        stage: ConversationStage.PAYMENT_COMPLETED,
        message: "Great news! Your payment has been successfully processed. Your order will be ready for pickup in a few minutes. Thank you for your order!"
      };
    } else {
      return {
        success: true,
        stage: ConversationStage.PAYMENT_CONFIRMATION,
        message: `I don't see your payment completed yet. You can still complete it at ${statusResult.url}, or you can pay at the pickup window when you arrive.`,
        paymentUrl: statusResult.url
      };
    }
  } catch (error) {
    // Log error
    await paymentLogger.error('PAYMENT_FLOW', `Error checking payment status: ${error.message}`, {
      paymentId: paymentLinkId,
      data: { error: error.message }
    });
    
    // Return error result
    return {
      success: false,
      stage: state.stage,
      message: "I'm having trouble checking your payment status. You can try completing your payment using the link I provided earlier, or you can pay at the pickup window when you arrive.",
      error: error.message
    };
  }
}

/**
 * Handle payment method selection
 * @param state The current conversation state
 * @param orderNumber The order number
 * @param method The selected payment method
 * @returns Payment flow result
 */
export async function handlePaymentMethodSelection(
  state: ConversationState,
  orderNumber: string,
  method: PaymentMethod
): Promise<PaymentFlowResult> {
  // Log payment method selection
  await paymentLogger.info('PAYMENT_FLOW', `Payment method selected for order #${orderNumber}: ${method}`, {
    orderId: orderNumber,
    data: { method }
  });
  
  if (method === PaymentMethod.ONLINE) {
    return await startOnlinePayment(state, orderNumber);
  } else {
    return await setupWindowPayment(state, orderNumber);
  }
}

/**
 * Recover from payment errors
 * @param state The current conversation state
 * @param orderNumber The order number
 * @param errorCode The error code
 * @returns Payment flow result with recovery options
 */
export async function recoverFromPaymentError(
  state: ConversationState,
  orderNumber: string,
  errorCode: string
): Promise<PaymentFlowResult> {
  // Log recovery attempt
  await paymentLogger.info('PAYMENT_FLOW', `Attempting to recover from payment error for order #${orderNumber}`, {
    orderId: orderNumber,
    errorCode,
    data: { stage: state.stage }
  });
  
  // Different recovery strategies based on error code
  switch (errorCode) {
    case 'PRICE_ERROR':
    case 'AMOUNT_ERROR':
    case 'PRICE_CALCULATION_ERROR':
      // For price-related errors, suggest window payment
      return {
        success: true,
        stage: ConversationStage.PAYMENT_METHOD_SELECTION,
        message: "I'm having trouble processing the payment amount. Would you prefer to pay at the pickup window instead?",
        suggestedAction: "Switch to window payment"
      };
      
    case 'VALIDATION_ERROR':
      // For validation errors, try to fix the order data and retry
      try {
        // Get the order and ensure it has valid data with recovery options
        const orderResult = await getOrder(orderNumber, {
          attemptRecovery: true,
          createIfMissing: true,
          conversationState: state
        });
        
        // Handle order retrieval failure
        if (!orderResult.success || !orderResult.order) {
          const errorMessage = orderResult.error || `Order #${orderNumber} not found`;
          throw new Error(errorMessage);
        }
        
        const order = orderResult.order;
        
        // Ensure order total is valid
        if (!order.orderTotal || isNaN(order.orderTotal) || order.orderTotal <= 0) {
          // Calculate a new total if needed
          const subtotal = order.items.reduce((total, item) => {
            return total + (item.price || 0) * (item.quantity || 1);
          }, 0);
          
          const tax = subtotal * 0.09;
          const processingFee = subtotal * 0.035 + 0.30;
          const newTotal = parseFloat((subtotal + tax + processingFee).toFixed(2));
          
          // Update the order with the new total
          await updateOrder(orderNumber, {
            subtotal: subtotal,
            stateTax: tax,
            processingFee: processingFee,
            orderTotal: newTotal
          });
          
          // Log the fix
          await paymentLogger.info('PAYMENT_FLOW', `Fixed invalid order total for order #${orderNumber}`, {
            orderId: orderNumber,
            data: { oldTotal: order.orderTotal, newTotal }
          });
          
          // Try online payment again with fixed data
          return await startOnlinePayment(state, orderNumber);
        }
        
        // If we can't fix it, suggest window payment
        return {
          success: true,
          stage: ConversationStage.PAYMENT_METHOD_SELECTION,
          message: "I'm having trouble validating your order data for online payment. Would you prefer to pay at the pickup window instead?",
          suggestedAction: "Switch to window payment"
        };
      } catch (error) {
        // If recovery fails, suggest window payment
        return {
          success: false,
          stage: ConversationStage.PAYMENT_METHOD_SELECTION,
          message: "I'm having trouble with the payment system. Would you prefer to pay at the pickup window instead?",
          error: error.message,
          suggestedAction: "Switch to window payment"
        };
      }
      
    default:
      // For other errors, suggest window payment as a fallback
      return {
        success: true,
        stage: ConversationStage.PAYMENT_METHOD_SELECTION,
        message: "I'm experiencing some technical difficulties with online payment processing. Would you prefer to pay at the pickup window instead?",
        suggestedAction: "Switch to window payment"
      };
  }
}
