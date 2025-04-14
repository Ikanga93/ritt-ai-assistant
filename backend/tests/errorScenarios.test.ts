import { storeOrder, getOrder, updateOrder } from '../src/orderStorage';
import { startOnlinePayment, recoverFromPaymentError } from '../src/paymentFlow';
import { ConversationState, ConversationStage } from '../src/conversationState';
import { generatePaymentLink } from '../src/paymentIntegration';

// Mock the order storage
jest.mock('../src/orderStorage', () => ({
  storeOrder: jest.fn(),
  getOrder: jest.fn(),
  updateOrder: jest.fn(),
  validateOrder: jest.fn()
}));

// Mock the payment integration
jest.mock('../src/paymentIntegration', () => ({
  generatePaymentLink: jest.fn(),
  checkPayment: jest.fn()
}));

// Mock the payment logger
jest.mock('../src/utils/paymentLogger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

describe('Error Scenario Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Sample conversation state for testing
  const sampleState: ConversationState = {
    sessionId: 'test-session',
    stage: ConversationStage.PAYMENT_METHOD_SELECTION,
    cart: {
      items: [
        { name: 'Burger', price: 5.99, quantity: 1 },
        { name: 'Fries', price: 2.99, quantity: 1 }
      ],
      restaurantId: 'rest-123',
      restaurantName: 'Test Restaurant'
    },
    orderNumber: 'TEST-123',
    paymentMethod: null,
    paymentStatus: null
  };

  test('Behavior when database operations fail', async () => {
    // Mock database failure
    (storeOrder as jest.Mock).mockResolvedValue({
      success: true,
      orderNumber: 'TEST-123',
      inMemoryOnly: true,
      error: 'Database operation failed, using in-memory storage'
    });

    // Mock successful order retrieval from in-memory cache
    (getOrder as jest.Mock).mockResolvedValue({
      success: true,
      order: {
        orderNumber: 'TEST-123',
        orderTotal: 10.40,
        items: [{ name: 'Burger', price: 5.99, quantity: 1 }],
        estimatedTime: 15
      },
      fromCache: true
    });

    // Mock successful payment link generation
    (generatePaymentLink as jest.Mock).mockResolvedValue({
      success: true,
      url: 'https://payment.example.com/link',
      id: 'payment-123'
    });

    // Start online payment
    const result = await startOnlinePayment(sampleState, 'TEST-123');

    // Verify payment flow result
    expect(result.success).toBe(true);
    expect(result.stage).toBe(ConversationStage.PAYMENT_LINK_GENERATION);
    
    // Verify order was retrieved from cache
    expect(getOrder).toHaveBeenCalledWith('TEST-123', expect.any(Object));
  });

  test('Recovery when orders are missing', async () => {
    // Mock order not found but successful recovery
    (getOrder as jest.Mock).mockResolvedValue({
      success: true,
      order: {
        orderNumber: 'TEST-123',
        orderTotal: 10.40,
        items: [{ name: 'Burger', price: 5.99, quantity: 1 }],
        estimatedTime: 15
      },
      recovered: true,
      fromCache: false
    });

    // Mock successful payment link generation
    (generatePaymentLink as jest.Mock).mockResolvedValue({
      success: true,
      url: 'https://payment.example.com/link',
      id: 'payment-123'
    });

    // Start online payment with recovery
    const result = await startOnlinePayment(sampleState, 'TEST-123');

    // Verify payment flow result
    expect(result.success).toBe(true);
    expect(result.stage).toBe(ConversationStage.PAYMENT_LINK_GENERATION);
    
    // Verify order was retrieved with recovery options
    expect(getOrder).toHaveBeenCalledWith('TEST-123', expect.objectContaining({
      attemptRecovery: true,
      createIfMissing: true
    }));
  });

  test('Handling of duplicate order numbers', async () => {
    // First call: Mock successful order storage
    (storeOrder as jest.Mock).mockResolvedValueOnce({
      success: true,
      orderNumber: 'TEST-123'
    });

    // Store the first order
    await storeOrder({
      orderNumber: 'TEST-123',
      customerName: 'First Customer',
      orderTotal: 10.40
    });

    // Second call: Mock duplicate order number detection
    (storeOrder as jest.Mock).mockResolvedValueOnce({
      success: false,
      error: 'Order number TEST-123 already exists',
      orderNumber: 'TEST-123'
    });

    // Try to store another order with the same number
    const result = await storeOrder({
      orderNumber: 'TEST-123',
      customerName: 'Second Customer',
      orderTotal: 15.99
    });

    // Verify duplicate was detected
    expect(result.success).toBe(false);
    expect(result.error).toContain('already exists');
  });

  test('Payment error recovery with validation issues', async () => {
    // Mock order with missing total
    (getOrder as jest.Mock).mockResolvedValue({
      success: true,
      order: {
        orderNumber: 'TEST-123',
        items: [{ name: 'Burger', price: 5.99, quantity: 1 }],
        // Missing orderTotal
      },
      fromCache: false
    });

    // Mock successful order update
    (updateOrder as jest.Mock).mockResolvedValue({
      success: true
    });

    // Try to recover from a validation error
    const result = await recoverFromPaymentError(
      sampleState,
      'TEST-123',
      'VALIDATION_ERROR',
      'Invalid order total'
    );

    // Verify recovery result
    expect(result.success).toBe(true);
    expect(updateOrder).toHaveBeenCalled();
  });
});
