// Order Storage System
// Stores and manages orders with payment information

import paymentLogger from './utils/paymentLogger.js';
import orderMonitor from './utils/orderMonitor.js';
import orderDatabase from './utils/orderDatabase.js';

/**
 * Extended order interface with payment-related fields
 */
export interface OrderWithPayment {
  // Basic order fields
  orderNumber: string | number;
  restaurantId: string;
  restaurantName: string;
  customerName: string;
  customerEmail?: string;
  items: Array<{
    id?: string;
    name: string;
    quantity: number;
    price?: number;
    specialInstructions?: string;
  }>;
  subtotal: number;
  stateTax: number;
  processingFee?: number;
  orderTotal: number;
  timestamp: string;
  estimatedTime: number;
  status: string;
  
  // Payment-related fields
  paymentMethod: "online" | "window";
  paymentStatus: "pending" | "completed" | "failed";
  paymentLinkId?: string;
  paymentTimestamp?: string;
  paymentTransactionId?: string;
  notificationSent: boolean;
}

// In-memory storage for pending orders
const orderStorage: { [key: string]: OrderWithPayment } = {};

// In-memory storage for orders by payment link ID
const ordersByPaymentLinkId: Map<string, string | number> = new Map();

/**
 * Store a pending order with robust error handling and retries
 * @param order The order to store
 * @returns Object with success status, error message if any, and the stored order
 */
export async function storeOrder(order: OrderWithPayment): Promise<{
  success: boolean;
  error?: string;
  order?: OrderWithPayment;
}> {
  // Validate the order before attempting to store it
  if (!validateOrder(order)) {
    const errorMsg = `Invalid order data for order #${order.orderNumber}`;
    await paymentLogger.error('ORDER_STORAGE', errorMsg, {
      orderId: order.orderNumber,
      data: { error: 'VALIDATION_FAILED' }
    });
    return { success: false, error: errorMsg };
  }

  // Generate a unique key for the order
  const orderKey = `order_${order.orderNumber}`;
  
  // Store the order in memory first (this rarely fails)
  orderStorage[orderKey] = order;
  
  // If payment link ID is provided, store the reference
  if (order.paymentLinkId) {
    ordersByPaymentLinkId.set(order.paymentLinkId, order.orderNumber);
  }
  
  // Try to store the order in the database with retries
  let retries = 3;
  let dbStored = false;
  let lastError: any = null;
  
  while (retries > 0 && !dbStored) {
    try {
      // Store the order in the database
      await orderDatabase.saveOrder(order);
      dbStored = true;
    } catch (error) {
      lastError = error;
      retries--;
      
      // Log the retry attempt
      await paymentLogger.warning('ORDER_STORAGE', `Retry storing order #${order.orderNumber} (${3 - retries}/3)`, {
        orderId: order.orderNumber,
        data: { error: error instanceof Error ? error.message : String(error) }
      });
      
      // Wait before retrying
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }
  
  // If database storage failed but memory storage succeeded
  if (!dbStored) {
    const errorMsg = `Failed to store order #${order.orderNumber} in database after 3 attempts`;
    await paymentLogger.error('ORDER_STORAGE', errorMsg, {
      orderId: order.orderNumber,
      data: { error: lastError instanceof Error ? lastError.message : String(lastError) }
    });
    
    // We still return partial success since the order is in memory
    return { 
      success: true, // Still return success since memory storage worked
      error: errorMsg,
      order: orderStorage[orderKey]
    };
  }
  
  // Log successful storage
  await paymentLogger.info('ORDER_STORAGE', `Order #${order.orderNumber} stored in memory and database`, {
    orderId: order.orderNumber,
    data: { restaurantId: order.restaurantId, paymentMethod: order.paymentMethod }
  });
  
  return { success: true, order: orderStorage[orderKey] };
}

/**
 * Validate an order to ensure it has all required fields
 * @param order The order to validate
 * @returns True if the order is valid, false otherwise
 */
function validateOrder(order: OrderWithPayment): boolean {
  // Check required fields
  if (!order.orderNumber || !order.restaurantId || !order.restaurantName) {
    console.error('Order missing required fields:', { 
      hasOrderNumber: !!order.orderNumber,
      hasRestaurantId: !!order.restaurantId,
      hasRestaurantName: !!order.restaurantName
    });
    return false;
  }
  
  // Check items array
  if (!Array.isArray(order.items) || order.items.length === 0) {
    console.error('Order has no items or invalid items array');
    return false;
  }
  
  // Validate each item has required fields
  for (const item of order.items) {
    if (!item.name || typeof item.quantity !== 'number' || item.quantity <= 0) {
      console.error('Invalid item in order:', item);
      return false;
    }
  }
  
  // Validate price fields
  if (typeof order.subtotal !== 'number' || 
      typeof order.stateTax !== 'number' || 
      typeof order.orderTotal !== 'number') {
    console.error('Order has invalid price fields');
    return false;
  }
  
  return true;
}

/**
 * Get an order by its order number with enhanced error handling and recovery
 * @param orderNumber The order number
 * @param options Optional parameters for recovery behavior
 * @returns Object with order data and status information
 */
export async function getOrder(
  orderNumber: string | number,
  options: {
    attemptRecovery?: boolean;
    createIfMissing?: boolean;
    conversationState?: any;
  } = {}
): Promise<{
  success: boolean;
  order: OrderWithPayment | null;
  fromCache: boolean;
  error?: string;
  recovered?: boolean;
}> {
  try {
    // Generate the order key
    const orderKey = `order_${orderNumber}`;
    
    // Check if the order exists in memory cache first (fastest)
    if (orderStorage[orderKey]) {
      return {
        success: true,
        order: orderStorage[orderKey],
        fromCache: true
      };
    }
    
    // If not in memory, try to get from database
    try {
      const dbResult = await orderDatabase.getOrder(orderNumber);
      if (dbResult.success && dbResult.order) {
        // Add to memory cache for future use
        orderStorage[orderKey] = dbResult.order;
        await paymentLogger.info('ORDER_STORAGE', `Order #${orderNumber} loaded from database to memory`, {
          orderId: orderNumber
        });
        return {
          success: true,
          order: dbResult.order,
          fromCache: false
        };
      }
    } catch (dbError) {
      // Log database error but continue with recovery attempts
      await paymentLogger.error('ORDER_STORAGE', `Error accessing database for order #${orderNumber}`, {
        orderId: orderNumber,
        data: { error: dbError instanceof Error ? dbError.message : String(dbError) }
      });
    }
    
    // Order not found in memory or database
    await paymentLogger.info('ORDER_STORAGE', `Order #${orderNumber} not found in memory or database`, {
      orderId: orderNumber
    });
    
    // Attempt recovery if requested
    if (options.attemptRecovery && options.conversationState) {
      try {
        const recoveredOrder = await recoverOrderFromConversation(orderNumber, options.conversationState);
        if (recoveredOrder) {
          // Store the recovered order
          const storeResult = await storeOrder(recoveredOrder);
          if (storeResult.success) {
            await paymentLogger.info('ORDER_STORAGE', `Successfully recovered and stored order #${orderNumber}`, {
              orderId: orderNumber
            });
            return {
              success: true,
              order: recoveredOrder,
              fromCache: false,
              recovered: true
            };
          }
        }
      } catch (recoveryError) {
        await paymentLogger.error('ORDER_STORAGE', `Failed to recover order #${orderNumber}`, {
          orderId: orderNumber,
          data: { error: recoveryError instanceof Error ? recoveryError.message : String(recoveryError) }
        });
      }
    }
    
    // Create a placeholder order if requested
    if (options.createIfMissing && options.conversationState) {
      try {
        const placeholderOrder = createPlaceholderOrder(orderNumber, options.conversationState);
        const storeResult = await storeOrder(placeholderOrder);
        
        if (storeResult.success) {
          await paymentLogger.info('ORDER_STORAGE', `Created placeholder for missing order #${orderNumber}`, {
            orderId: orderNumber
          });
          return {
            success: true,
            order: placeholderOrder,
            fromCache: false,
            recovered: true
          };
        }
      } catch (createError) {
        await paymentLogger.error('ORDER_STORAGE', `Failed to create placeholder for order #${orderNumber}`, {
          orderId: orderNumber,
          data: { error: createError instanceof Error ? createError.message : String(createError) }
        });
      }
    }
    
    // If we get here, all recovery attempts failed
    return {
      success: false,
      order: null,
      fromCache: false,
      error: `Order #${orderNumber} not found and recovery failed`
    };
  } catch (error) {
    // Catch any unexpected errors
    console.error(`Error in getOrder #${orderNumber}:`, error);
    await paymentLogger.error('ORDER_STORAGE', `Unexpected error getting order #${orderNumber}`, {
      orderId: orderNumber,
      data: { error: error instanceof Error ? error.message : String(error) }
    });
    
    return {
      success: false,
      order: null,
      fromCache: false,
      error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Attempt to recover an order from conversation state
 * @param orderNumber The order number to recover
 * @param conversationState The current conversation state
 * @returns Recovered order or null if recovery failed
 */
async function recoverOrderFromConversation(
  orderNumber: string | number,
  conversationState: any
): Promise<OrderWithPayment | null> {
  try {
    // Check if we have enough information in the conversation state to recreate the order
    if (!conversationState.selectedRestaurantId || 
        !conversationState.selectedRestaurantName || 
        !Array.isArray(conversationState.cartItems) || 
        conversationState.cartItems.length === 0) {
      console.log('Insufficient data in conversation state to recover order');
      return null;
    }
    
    // Calculate order totals from cart items
    let subtotal = 0;
    const items = conversationState.cartItems.map((item: any) => {
      const price = typeof item.price === 'number' ? item.price : 5.00; // Default price
      const quantity = typeof item.quantity === 'number' ? item.quantity : 1; // Default quantity
      
      subtotal += price * quantity;
      
      return {
        id: item.id || `item_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        name: item.name,
        quantity: quantity,
        price: price,
        specialInstructions: item.specialInstructions
      };
    });
    
    // Calculate tax and total
    const stateTax = parseFloat((subtotal * 0.09).toFixed(2));
    const processingFee = parseFloat((subtotal * 0.035 + 0.30).toFixed(2));
    const orderTotal = parseFloat((subtotal + stateTax + processingFee).toFixed(2));
    
    // Create recovered order with online payment as the default method
    const recoveredOrder: OrderWithPayment = {
      orderNumber,
      restaurantId: conversationState.selectedRestaurantId || 
                    (conversationState.cart && conversationState.cart.restaurantId) || 
                    'unknown',
      restaurantName: conversationState.selectedRestaurantName || 
                     (conversationState.cart && conversationState.cart.restaurantName) || 
                     'Unknown Restaurant',
      customerName: conversationState.customerName || 'Unknown Customer',
      customerEmail: conversationState.customerEmail,
      items,
      subtotal,
      stateTax,
      processingFee,
      orderTotal,
      timestamp: new Date().toISOString(),
      estimatedTime: 15, // Default estimate
      status: 'recovered',
      paymentMethod: 'online', // Default to online payment as preferred method
      paymentStatus: 'pending',
      notificationSent: false
    };
    
    await paymentLogger.info('ORDER_STORAGE', `Recovered order #${orderNumber} from conversation state`, {
      orderId: orderNumber
    });
    
    return recoveredOrder;
  } catch (error) {
    console.error(`Error recovering order #${orderNumber}:`, error);
    return null;
  }
}

/**
 * Create a placeholder order when the original is missing
 * @param orderNumber The order number
 * @param conversationState Current conversation state
 * @returns A placeholder order
 */
function createPlaceholderOrder(
  orderNumber: string | number,
  conversationState: any
): OrderWithPayment {
  // Extract cart items from conversation state
  let items = [];
  let subtotal = 0;
  
  // Try to get cart items from different possible locations in the conversation state
  const cartItems = conversationState.cartItems || 
                   (conversationState.cart && conversationState.cart.items) || 
                   [];
  
  if (Array.isArray(cartItems) && cartItems.length > 0) {
    // Use actual cart items if available
    items = cartItems.map((item: any) => {
      const price = typeof item.price === 'number' ? item.price : 5.00;
      const quantity = typeof item.quantity === 'number' ? item.quantity : 1;
      
      // Don't accumulate subtotal here, we'll calculate it after
      
      return {
        name: item.name || 'Unknown Item',
        quantity: quantity,
        price: price,
        specialInstructions: item.specialInstructions || ''
      };
    });
    
    // Calculate subtotal from the items array to ensure consistency
    subtotal = items.reduce((total, item) => total + (item.price * item.quantity), 0);
  } else {
    // Use placeholder item if no cart items available
    items = [
      {
        name: 'Placeholder Item',
        quantity: 1,
        price: 10.00
      }
    ];
    subtotal = 10.00;
  }
  
  // Calculate tax and fees consistently
  const roundedSubtotal = parseFloat(subtotal.toFixed(2));
  const stateTax = parseFloat((roundedSubtotal * 0.09).toFixed(2));
  const processingFee = parseFloat((roundedSubtotal * 0.035 + 0.30).toFixed(2));
  
  // Calculate total - IMPORTANT: This must match the sum of components exactly
  const orderTotal = parseFloat((roundedSubtotal + stateTax + processingFee).toFixed(2));
  
  // Get restaurant info from conversation state
  const restaurantId = conversationState.selectedRestaurantId || 
                      (conversationState.cart && conversationState.cart.restaurantId) || 
                      'unknown';
  
  const restaurantName = conversationState.selectedRestaurantName || 
                        (conversationState.cart && conversationState.cart.restaurantName) || 
                        'Unknown Restaurant';
  
  // Create the placeholder order with consistent values
  const placeholderOrder: OrderWithPayment = {
    orderNumber,
    restaurantId: restaurantId,
    restaurantName: restaurantName,
    customerName: conversationState.customerName || 'Unknown Customer',
    customerEmail: conversationState.customerEmail,
    items: items,
    subtotal: roundedSubtotal,
    stateTax: stateTax,
    processingFee: processingFee,
    orderTotal: orderTotal,
    timestamp: new Date().toISOString(),
    estimatedTime: 15,
    status: 'placeholder',
    paymentMethod: 'online', // Default to online payment as preferred method
    paymentStatus: 'pending',
    notificationSent: false
  };
  
  // Log the placeholder order creation
  console.log(`Created placeholder order #${orderNumber} with ${items.length} items and total $${orderTotal}`);
  
  return placeholderOrder;
}

/**
 * Delete an order
 * @param orderNumber The order number
 * @returns True if the order was deleted, false if not found
 */
export async function deleteOrder(orderNumber: string | number): Promise<boolean> {
  try {
    // Generate the order key
    const orderKey = `order_${orderNumber}`;
    
    // Check if the order exists in memory
    const existsInMemory = !!orderStorage[orderKey];
    
    // Delete from memory if it exists
    if (existsInMemory) {
      delete orderStorage[orderKey];
    }
    
    // Delete from database
    const deletedFromDb = await orderDatabase.deleteOrder(orderNumber);
    
    if (!existsInMemory && !deletedFromDb) {
      await paymentLogger.warning('ORDER_STORAGE', `Attempted to delete non-existent order #${orderNumber}`, {
        orderId: orderNumber
      });
      return false;
    }
    
    // Log order deletion
    await paymentLogger.info('ORDER_STORAGE', `Order #${orderNumber} deleted from ${existsInMemory ? 'memory' : ''}${existsInMemory && deletedFromDb ? ' and ' : ''}${deletedFromDb ? 'database' : ''}`, {
      orderId: orderNumber
    });
    
    return true;
  } catch (error) {
    console.error('Error deleting order:', error);
    return false;
  }
}

/**
 * Get an order by its payment link ID
 * @param paymentLinkId The payment link ID
 * @returns The order or null if not found
 */
export async function getOrderByPaymentLinkId(paymentLinkId: string): Promise<OrderWithPayment | null> {
  try {
    // Check if we have a mapping for this payment link ID
    const orderNumber = ordersByPaymentLinkId.get(paymentLinkId);
    if (!orderNumber) {
      return null;
    }
    
    // Get the order by order number
    const orderResult = await getOrder(orderNumber);
    return orderResult.success ? orderResult.order : null;
  } catch (error) {
    console.error('Error getting order by payment link ID:', error);
    return null;
  }
}

/**
 * Update an existing order
 * @param orderNumber The order number
 * @param updates Partial updates to apply to the order
 * @returns True if the order was updated, false if not
 */
export async function updateOrder(orderNumber: string | number, updates: Partial<OrderWithPayment>): Promise<boolean> {
  try {
    // Generate the order key
    const orderKey = `order_${orderNumber}`;
    
    // Check if the order exists in memory
    if (!orderStorage[orderKey]) {
      // Try to get it from the database
      const dbResult = await orderDatabase.getOrder(orderNumber);
      if (dbResult.success && dbResult.order) {
        // Found in database, add to memory
        orderStorage[orderKey] = dbResult.order;
      } else {
        await paymentLogger.warning('ORDER_STORAGE', `Attempted to update non-existent order #${orderNumber}`, {
          orderId: orderNumber
        });
        return false;
      }
    }
    
    // Update the order in memory
    orderStorage[orderKey] = { ...orderStorage[orderKey], ...updates };
    
    // Update the order in the database
    await orderDatabase.updateOrder(orderStorage[orderKey]);
    
    // Log order update
    await paymentLogger.info('ORDER_STORAGE', `Order #${orderNumber} updated in memory and database`, {
      orderId: orderNumber,
      data: { updatedFields: Object.keys(updates) }
    });
    
    return true;
  } catch (error) {
    console.error('Error updating order:', error);
    return false;
  }
}

/**
 * Get all orders for a restaurant
 * @param restaurantId The restaurant ID
 * @returns Array of orders for the restaurant
 */
export async function getOrdersByRestaurant(restaurantId: string): Promise<OrderWithPayment[]> {
  try {
    // Get orders from database first
    const dbOrders = await orderDatabase.getOrdersByRestaurantId(restaurantId);
    
    // Get orders from memory
    const memoryOrders = Object.values(orderStorage).filter(
      order => order.restaurantId === restaurantId
    );
    
    // Merge the two sets, prioritizing memory versions
    const orderMap = new Map<string | number, OrderWithPayment>();
    
    // Add database orders to the map
    for (const order of dbOrders) {
      orderMap.set(order.orderNumber, order);
    }
    
    // Add/override with memory orders
    for (const order of memoryOrders) {
      orderMap.set(order.orderNumber, order);
    }
    
    // Convert map values to array
    const mergedOrders = Array.from(orderMap.values());
    
    await paymentLogger.info('ORDER_STORAGE', `Retrieved ${mergedOrders.length} orders for restaurant ${restaurantId}`, {
      data: { restaurantId, orderCount: mergedOrders.length }
    });
    
    return mergedOrders;
  } catch (error) {
    console.error('Error getting orders by restaurant:', error);
    return [];
  }
}

/**
 * Remove an order from storage
 * @param orderNumber The order number
 * @returns True if the order was removed, false if not found
 */
export async function removeOrder(orderNumber: string | number): Promise<boolean> {
  try {
    // Generate the order key
    const orderKey = `order_${orderNumber}`;
    
    // Check if the order exists in memory
    if (!orderStorage[orderKey]) {
      // Try to get it from the database
      const dbResult = await orderDatabase.getOrder(orderNumber);
      if (!dbResult.success || !dbResult.order) {
        await paymentLogger.warning('ORDER_STORAGE', `Attempted to remove non-existent order #${orderNumber}`, {
          orderId: orderNumber
        });
        return false;
      }
    }
    
    // Remove the order from memory
    delete orderStorage[orderKey];
    
    // Remove the order from the database
    await orderDatabase.deleteOrder(orderNumber);
    
    // Log order removal
    await paymentLogger.info('ORDER_STORAGE', `Order #${orderNumber} removed from memory and database`, {
      orderId: orderNumber
    });
    
    return true;
  } catch (error) {
    console.error('Error removing order:', error);
    return false;
  }
}

/**
 * Get the total number of pending orders
 * @returns The number of pending orders
 */
export function getPendingOrderCount(): number {
  return Object.values(orderStorage).filter(order => order.paymentStatus === 'pending').length;
}

/**
 * Convert a regular order to an order with payment fields
 * @param order The original order
 * @param paymentMethod The payment method
 * @returns An order with payment fields
 */
export function convertToOrderWithPayment(
  order: any,
  paymentMethod: "online" | "window"
): OrderWithPayment {
  return {
    ...order,
    paymentMethod,
    paymentStatus: "pending",
    notificationSent: false
  };
}
