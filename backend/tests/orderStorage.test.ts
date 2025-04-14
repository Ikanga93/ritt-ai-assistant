import { storeOrder, getOrder, validateOrder, OrderWithPayment } from '../src/orderStorage';
import { ConversationState } from '../src/conversationState';
import fs from 'fs';
import path from 'path';

// Mock file system operations
jest.mock('fs/promises', () => ({
  writeFile: jest.fn(),
  readFile: jest.fn(),
  mkdir: jest.fn(),
  access: jest.fn()
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

// Mock the order database
jest.mock('../src/utils/orderDatabase', () => ({
  saveOrder: jest.fn(),
  getOrder: jest.fn(),
  updateOrder: jest.fn()
}));

describe('Order Storage Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Sample order for testing
  const sampleOrder: OrderWithPayment = {
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
    paymentMethod: 'online',
    paymentStatus: 'pending',
    orderDate: new Date().toISOString()
  };

  // Sample conversation state for testing
  const sampleState: ConversationState = {
    sessionId: 'test-session',
    stage: 'payment_method_selection',
    cart: {
      items: [
        { name: 'Burger', price: 5.99, quantity: 1 },
        { name: 'Fries', price: 2.99, quantity: 1 }
      ],
      restaurantId: 'rest-123',
      restaurantName: 'Test Restaurant'
    },
    orderNumber: 'TEST-123',
    paymentMethod: 'online',
    paymentStatus: 'pending'
  };

  test('Order validation with valid order', async () => {
    const result = validateOrder(sampleOrder);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('Order validation with invalid order', async () => {
    const invalidOrder = { ...sampleOrder };
    delete invalidOrder.orderTotal;
    
    const result = validateOrder(invalidOrder as any);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('Order storage with successful database operation', async () => {
    const orderDatabase = require('../src/utils/orderDatabase');
    orderDatabase.saveOrder.mockResolvedValue({ success: true });
    
    const result = await storeOrder(sampleOrder);
    
    expect(result.success).toBe(true);
    expect(orderDatabase.saveOrder).toHaveBeenCalledWith(sampleOrder);
  });

  test('Order storage with database failure but successful in-memory fallback', async () => {
    const orderDatabase = require('../src/utils/orderDatabase');
    orderDatabase.saveOrder.mockRejectedValue(new Error('Database error'));
    
    const result = await storeOrder(sampleOrder);
    
    expect(result.success).toBe(true);
    expect(result.error).toContain('Database error');
    expect(result.inMemoryOnly).toBe(true);
  });

  test('Order retrieval with existing order', async () => {
    const orderDatabase = require('../src/utils/orderDatabase');
    orderDatabase.getOrder.mockResolvedValue(sampleOrder);
    
    const result = await getOrder('TEST-123');
    
    expect(result.success).toBe(true);
    expect(result.order).toEqual(sampleOrder);
    expect(result.fromCache).toBe(false);
  });

  test('Order retrieval with non-existing order and no recovery', async () => {
    const orderDatabase = require('../src/utils/orderDatabase');
    orderDatabase.getOrder.mockResolvedValue(null);
    
    const result = await getOrder('NONEXISTENT-123');
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  test('Order retrieval with non-existing order but successful recovery', async () => {
    const orderDatabase = require('../src/utils/orderDatabase');
    orderDatabase.getOrder.mockResolvedValue(null);
    
    const result = await getOrder('TEST-123', {
      attemptRecovery: true,
      createIfMissing: true,
      conversationState: sampleState
    });
    
    expect(result.success).toBe(true);
    expect(result.recovered).toBe(true);
    expect(result.order.orderNumber).toBe('TEST-123');
  });

  test('Order retrieval with database failure but in-memory cache hit', async () => {
    const orderDatabase = require('../src/utils/orderDatabase');
    orderDatabase.getOrder.mockRejectedValue(new Error('Database error'));
    
    // First store the order to populate the cache
    await storeOrder(sampleOrder);
    
    const result = await getOrder('TEST-123');
    
    expect(result.success).toBe(true);
    expect(result.fromCache).toBe(true);
    expect(result.order).toEqual(sampleOrder);
  });
});
