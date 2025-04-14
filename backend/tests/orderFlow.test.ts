import { ConversationState, ConversationStage } from '../src/conversationState';
import { startOnlinePayment, setupWindowPayment } from '../src/paymentFlow';
import { storeOrder, getOrder } from '../src/orderStorage';
import { generatePaymentLink, checkPayment } from '../src/paymentIntegration';

// Mock the payment integration
jest.mock('../src/paymentIntegration', () => ({
  generatePaymentLink: jest.fn(),
  checkPayment: jest.fn()
}));

// Mock the order storage
jest.mock('../src/orderStorage', () => ({
  storeOrder: jest.fn(),
  getOrder: jest.fn(),
  updateOrder: jest.fn(),
  validateOrder: jest.fn()
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

describe('Order Flow Integration Tests', () => {
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

  // Sample order for testing
  const sampleOrder = {
    orderNumber: 'TEST-123',
    customerName: 'Test Customer',
    restaurantId: 'rest-123',
    restaurantName: 'Test Restaurant',
    items: [
      { name: 'Burger', price: 5.99, quantity: 1 },
      { name: 'Fries', price: 2.99, quantity: 1 }
    ],
    subtotal: 8.98,
    stateTax: 0.81,
    processingFee: 0.61,
    orderTotal: 10.40,
    estimatedTime: 15,
    paymentMethod: null,
    paymentStatus: null,
    orderDate: new Date().toISOString()
  };

  test('Complete flow from order creation to online payment', async () => {
    // Mock successful order retrieval
    (getOrder as jest.Mock).mockResolvedValue({
      success: true,
      order: sampleOrder,
      fromCache: false
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
    expect(result.paymentUrl).toBe('https://payment.example.com/link');
    
    // Verify order was retrieved
    expect(getOrder).toHaveBeenCalledWith('TEST-123', expect.any(Object));
    
    // Verify payment link was generated
    expect(generatePaymentLink).toHaveBeenCalledWith(expect.objectContaining({
      orderNumber: 'TEST-123',
      orderTotal: 10.40
    }));
  });

  test('Complete flow from order creation to window payment', async () => {
    // Mock successful order retrieval
    (getOrder as jest.Mock).mockResolvedValue({
      success: true,
      order: sampleOrder,
      fromCache: false
    });

    // Start window payment
    const result = await setupWindowPayment(sampleState, 'TEST-123');

    // Verify payment flow result
    expect(result.success).toBe(true);
    expect(result.stage).toBe(ConversationStage.ORDER_COMPLETE);
    expect(result.message).toContain('Your total of $10.40');
    
    // Verify order was retrieved
    expect(getOrder).toHaveBeenCalledWith('TEST-123', expect.any(Object));
  });

  test('Order persistence across conversation sessions', async () => {
    // Mock successful order storage
    (storeOrder as jest.Mock).mockResolvedValue({
      success: true,
      orderNumber: 'TEST-123'
    });

    // Store the order
    await storeOrder(sampleOrder);

    // Mock successful order retrieval
    (getOrder as jest.Mock).mockResolvedValue({
      success: true,
      order: sampleOrder,
      fromCache: false
    });

    // Create a new conversation state (simulating a new session)
    const newSession: ConversationState = {
      sessionId: 'new-session',
      stage: ConversationStage.PAYMENT_METHOD_SELECTION,
      orderNumber: 'TEST-123',
      paymentMethod: null,
      paymentStatus: null
    };

    // Start payment in the new session
    const result = await startOnlinePayment(newSession, 'TEST-123');

    // Verify payment flow result
    expect(result.success).toBe(true);
    
    // Verify order was retrieved
    expect(getOrder).toHaveBeenCalledWith('TEST-123', expect.any(Object));
  });

  test('Recovery from interrupted conversations', async () => {
    // Mock failed order retrieval but successful recovery
    (getOrder as jest.Mock).mockResolvedValue({
      success: true,
      order: sampleOrder,
      fromCache: false,
      recovered: true
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
});
