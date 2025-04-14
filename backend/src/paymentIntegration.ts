// Payment Integration for Ritt Drive-Thru AI Assistant
import { stripe, createPaymentLink, checkPaymentStatus } from './stripeConfig.js';
import paymentLogger, { LogLevel } from './utils/paymentLogger.js';
import paymentMonitor, { AlertLevel, AlertType } from './utils/paymentMonitor.js';
import paymentRetry from './utils/paymentRetry.js';

// Interface for order details
export interface OrderDetails {
  orderNumber: string;
  customerName: string;
  restaurantName: string;
  orderTotal: number;
  items?: Array<{
    name: string;
    quantity: number;
    price: number;
    specialInstructions?: string;
  }>;
}

// Interface for payment result
export interface PaymentResult {
  success: boolean;
  url?: string;
  id?: string;
  error?: string;
}

// Interface for payment status result
export interface PaymentStatusResult {
  success: boolean;
  active?: boolean;
  url?: string;
  error?: string;
}

/**
 * Generate a payment link for an order
 * @param params Order parameters
 * @returns Object containing success status, payment URL and ID if successful, or error message if failed
 */
/**
 * Validates order parameters before generating payment link
 * @param params Order parameters to validate
 * @throws Error if validation fails
 */
function validateOrderParams(params: {
  orderNumber: string;
  customerName: string;
  restaurantName: string;
  orderTotal: number;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    specialInstructions?: string;
  }>;
}) {
  // Check required fields
  if (!params.orderNumber) {
    throw new Error('Order number is required');
  }
  
  if (!params.customerName) {
    throw new Error('Customer name is required');
  }
  
  if (!params.restaurantName) {
    throw new Error('Restaurant name is required');
  }
  
  // Validate orderTotal
  let orderTotal = params.orderTotal;
  
  // Convert string to number if needed
  if (typeof orderTotal === 'string') {
    try {
      orderTotal = parseFloat(orderTotal);
      // Update the params object with the converted value
      params.orderTotal = orderTotal;
    } catch (e) {
      throw new Error(`Cannot convert order total from string to number: ${orderTotal}`);
    }
  } else if (typeof orderTotal !== 'number') {
    throw new Error(`Order total must be a number, received ${typeof orderTotal}`);
  }
  
  if (isNaN(orderTotal)) {
    throw new Error('Order total is NaN');
  }
  
  if (params.orderTotal <= 0) {
    throw new Error(`Order total must be greater than zero, received ${params.orderTotal}`);
  }
  
  // Validate items
  if (!Array.isArray(params.items) || params.items.length === 0) {
    throw new Error('Order must contain at least one item');
  }
  
  // Validate each item
  let calculatedSubtotal = 0;
  for (const item of params.items) {
    if (!item.name) {
      throw new Error('Item name is required');
    }
    
    if (typeof item.quantity !== 'number' || item.quantity <= 0) {
      throw new Error(`Item quantity must be a positive number, received ${item.quantity} for ${item.name}`);
    }
    
    if (typeof item.price !== 'number') {
      throw new Error(`Item price must be a number, received ${typeof item.price} for ${item.name}`);
    }
    
    if (isNaN(item.price)) {
      throw new Error(`Item price is NaN for ${item.name}`);
    }
    
    if (item.price < 0) {
      throw new Error(`Item price must be non-negative, received ${item.price} for ${item.name}`);
    }
    
    calculatedSubtotal += item.price * item.quantity;
  }
  
  // Calculate expected total with tax and fees (matching the logic in orderStorage.ts)
  const roundedSubtotal = parseFloat(calculatedSubtotal.toFixed(2));
  const stateTax = parseFloat((roundedSubtotal * 0.09).toFixed(2));
  const processingFee = parseFloat((roundedSubtotal * 0.035 + 0.30).toFixed(2));
  const expectedTotal = parseFloat((roundedSubtotal + stateTax + processingFee).toFixed(2));
  
  // Check if the provided total is close to our expected total
  const difference = Math.abs(expectedTotal - params.orderTotal);
  if (difference > 0.5) { // Allow for a small difference due to rounding (50 cents)
    throw new Error(`Order total (${params.orderTotal.toFixed(2)}) doesn't match expected total with tax and fees (${expectedTotal.toFixed(2)})`);
  }
}

export async function generatePaymentLink(params: {
  orderNumber: string;
  customerName: string;
  restaurantName: string;
  orderTotal: number;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    specialInstructions?: string;
  }>;
}): Promise<{ success: boolean; url?: string; id?: string; error?: string; code?: string }> {
  try {
    // Validate order parameters
    validateOrderParams(params);
    
    // Log payment link generation attempt
    await paymentLogger.info('PAYMENT_LINK', `Generating payment link for order #${params.orderNumber}`, {
      orderId: params.orderNumber,
      data: {
        customerName: params.customerName,
        restaurantName: params.restaurantName,
        orderTotal: params.orderTotal,
        itemCount: params.items.length
      }
    });
  } catch (error) {
    // Log validation error
    await paymentLogger.error('PAYMENT_LINK', `Validation error for order #${params.orderNumber}: ${error.message}`, {
      orderId: params.orderNumber,
      data: { errorMessage: error.message }
    });
    
    return { 
      success: false, 
      error: error.message,
      code: 'VALIDATION_ERROR'
    };
  }
  
  // Create a function to generate the payment link with Stripe
  const generateWithStripe = async () => {
    const result = await createPaymentLink({
      orderDetails: {
        orderNumber: params.orderNumber,
        customerName: params.customerName,
        restaurantName: params.restaurantName,
        amount: params.orderTotal,
        items: params.items.map(item => ({
          name: item.name,
          quantity: item.quantity,
          amount: item.price
        }))
      }
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to create payment link');
    }

    return {
      success: true,
      url: result.url,
      id: result.id
    };
  };
  
  try {
    // Use retry mechanism for payment link generation
    const result = await paymentRetry.withRetry(
      generateWithStripe,
      {
        name: 'Payment Link Generation',
        category: 'PAYMENT_LINK_GENERATION',
        orderId: params.orderNumber,
        config: {
          maxRetries: 3,
          initialDelayMs: 1000
        }
      }
    );
    
    // Log successful payment link generation
    await paymentLogger.info('PAYMENT_LINK', `Payment link created for order #${params.orderNumber}`, {
      orderId: params.orderNumber,
      paymentId: result.id,
      data: { url: result.url }
    });
    
    console.log(`Payment link created: ${result.url}`);
    return result;
  } catch (error: any) {
    // Check for specific error codes from Stripe
    const errorCode = error.code || 
                     (error.message && error.message.includes('price') ? 'PRICE_ERROR' : 
                     (error.message && error.message.includes('amount') ? 'AMOUNT_ERROR' : 'GENERAL_ERROR'));
    
    // Log payment link generation error with code
    await paymentLogger.error('PAYMENT_LINK', `Error generating payment link for order #${params.orderNumber} after retries`, {
      orderId: params.orderNumber,
      errorCode,
      data: { errorMessage: error.message }
    });
    
    // Track API error with more detailed information
    await paymentMonitor.trackApiError('PAYMENT_LINK_GENERATION', error.message, {
      orderId: params.orderNumber,
      errorCode,
      data: { 
        orderTotal: params.orderTotal, 
        restaurantName: params.restaurantName,
        itemCount: params.items.length
      }
    });
    
    console.error('Error generating payment link after retries:', error.message);
    return { 
      success: false, 
      error: error.message,
      code: errorCode
    };
  }
}

/**
 * Check the status of a payment
 * @param paymentLinkId The ID of the payment link to check
 * @returns Object containing success status and payment status if successful, or error message if failed
 */
export async function checkPayment(paymentLinkId: string): Promise<{ success: boolean; status?: string; active?: boolean; url?: string; error?: string }> {
  // Log payment status check attempt
  await paymentLogger.info('PAYMENT_STATUS', `Checking status for payment link ${paymentLinkId}`, {
    paymentId: paymentLinkId
  });
  
  // Create a function to check payment status with Stripe
  const checkWithStripe = async () => {
    const result = await checkPaymentStatus(paymentLinkId);

    if (!result.success) {
      throw new Error(result.error || 'Failed to check payment status');
    }

    const statusText = result.active ? 'active' : 'inactive';
    return {
      success: true,
      status: statusText,
      active: result.active,
      url: result.url
    };
  };
  
  // Create a fallback function that assumes the payment is still pending
  const fallbackCheck = async () => {
    await paymentLogger.warning('PAYMENT_STATUS', `Using fallback for payment link ${paymentLinkId}`, {
      paymentId: paymentLinkId
    });
    
    // Return a conservative result (assume payment is still active/pending)
    return {
      success: true,
      status: 'unknown (fallback)',
      active: true, // Assume still active to be safe
      url: null
    };
  };
  
  try {
    // Use graceful degradation with retry and fallback
    const primaryOperation = async () => {
      return await paymentRetry.withRetry(
        checkWithStripe,
        {
          name: 'Payment Status Check',
          category: 'PAYMENT_STATUS_CHECK',
          paymentId: paymentLinkId,
          config: {
            maxRetries: 2,
            initialDelayMs: 500
          }
        }
      );
    };
    
    // Use graceful degradation pattern
    const result = await paymentRetry.withGracefulDegradation(
      primaryOperation,
      fallbackCheck,
      {
        name: 'Payment Status Check',
        category: 'PAYMENT_STATUS_CHECK',
        paymentId: paymentLinkId
      }
    );
    
    // Log successful payment status check
    await paymentLogger.info('PAYMENT_STATUS', `Payment status for ${paymentLinkId}: ${result.status}`, {
      paymentId: paymentLinkId,
      data: { active: result.active, url: result.url }
    });
    
    console.log(`Payment status for ${paymentLinkId}: ${result.status}`);
    return result;
  } catch (error: any) {
    // This should only happen if both primary and fallback failed
    // Log payment status check error
    await paymentLogger.error('PAYMENT_STATUS', `Error checking status for payment link ${paymentLinkId} after all retries and fallbacks`, {
      paymentId: paymentLinkId,
      data: { errorMessage: error.message }
    });
    
    // Track API error
    await paymentMonitor.trackApiError('PAYMENT_STATUS_CHECK', `Complete failure: ${error.message}`, {
      paymentId: paymentLinkId
    });
    
    console.error('Error checking payment status after all retries and fallbacks:', error.message);
    return { success: false, error: error.message };
  }
}
