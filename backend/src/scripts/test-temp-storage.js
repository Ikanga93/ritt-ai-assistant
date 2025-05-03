// Simple test script for temporary order storage
const fs = require('fs');
const path = require('path');

// In-memory storage for temporary orders
const tempOrdersMap = new Map();

// File storage configuration
const TEMP_ORDERS_DIR = path.join(process.cwd(), 'data', 'temp-orders');
const TEMP_ORDERS_INDEX = path.join(TEMP_ORDERS_DIR, 'index.json');

// Ensure the directory exists
if (!fs.existsSync(TEMP_ORDERS_DIR)) {
  fs.mkdirSync(TEMP_ORDERS_DIR, { recursive: true });
  console.log(`Created directory: ${TEMP_ORDERS_DIR}`);
}

// Default expiration time: 48 hours (in milliseconds)
const DEFAULT_EXPIRATION_MS = 48 * 60 * 60 * 1000;

/**
 * Generates a unique temporary order ID with "TEMP-" prefix
 */
function generateTempOrderId() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `TEMP-${timestamp}-${random}`;
}

/**
 * Saves temporary orders to disk
 */
function saveOrdersToDisk() {
  try {
    // Create an index of all order IDs
    const orderIds = Array.from(tempOrdersMap.keys());
    fs.writeFileSync(TEMP_ORDERS_INDEX, JSON.stringify(orderIds), 'utf8');
    console.log(`Saved index with ${orderIds.length} orders`);

    // Save each order to its own file
    for (const [id, order] of tempOrdersMap.entries()) {
      const orderFilePath = path.join(TEMP_ORDERS_DIR, `${id}.json`);
      fs.writeFileSync(orderFilePath, JSON.stringify(order), 'utf8');
    }
    console.log('All orders saved to disk');
  } catch (error) {
    console.error('Failed to save temporary orders to disk', error);
  }
}

/**
 * Loads temporary orders from disk
 */
function loadOrdersFromDisk() {
  try {
    if (!fs.existsSync(TEMP_ORDERS_INDEX)) {
      console.log('No index file found, starting fresh');
      return;
    }

    const orderIds = JSON.parse(fs.readFileSync(TEMP_ORDERS_INDEX, 'utf8'));
    console.log(`Found ${orderIds.length} orders in index`);
    
    for (const id of orderIds) {
      const orderFilePath = path.join(TEMP_ORDERS_DIR, `${id}.json`);
      
      if (fs.existsSync(orderFilePath)) {
        const orderData = JSON.parse(fs.readFileSync(orderFilePath, 'utf8'));
        
        // Only load non-expired orders
        if (orderData.expiresAt > Date.now()) {
          tempOrdersMap.set(id, orderData);
          console.log(`Loaded order: ${id}`);
        } else {
          // Clean up expired order files
          fs.unlinkSync(orderFilePath);
          console.log(`Deleted expired order: ${id}`);
        }
      }
    }
    
    console.log(`Loaded ${tempOrdersMap.size} temporary orders from disk`);
  } catch (error) {
    console.error('Failed to load temporary orders from disk', error);
  }
}

/**
 * Cleans up expired orders
 */
function cleanupExpiredOrders() {
  const now = Date.now();
  let expiredCount = 0;
  
  for (const [id, order] of tempOrdersMap.entries()) {
    if (order.expiresAt < now) {
      tempOrdersMap.delete(id);
      
      // Also remove from disk
      const orderFilePath = path.join(TEMP_ORDERS_DIR, `${id}.json`);
      if (fs.existsSync(orderFilePath)) {
        fs.unlinkSync(orderFilePath);
      }
      
      expiredCount++;
    }
  }
  
  if (expiredCount > 0) {
    console.log(`Cleaned up ${expiredCount} expired temporary orders`);
    
    // Update the index file after cleanup
    saveOrdersToDisk();
  }
}

// The temporary order service
const temporaryOrderService = {
  /**
   * Stores a temporary order
   */
  storeOrder(orderData) {
    const tempId = generateTempOrderId();
    const now = Date.now();
    
    const tempOrder = {
      ...orderData,
      id: tempId,
      createdAt: now,
      expiresAt: now + DEFAULT_EXPIRATION_MS
    };
    
    // Store in memory
    tempOrdersMap.set(tempId, tempOrder);
    
    // Save to disk immediately for this new order
    try {
      const orderFilePath = path.join(TEMP_ORDERS_DIR, `${tempId}.json`);
      fs.writeFileSync(orderFilePath, JSON.stringify(tempOrder), 'utf8');
      
      // Update the index
      const orderIds = Array.from(tempOrdersMap.keys());
      fs.writeFileSync(TEMP_ORDERS_INDEX, JSON.stringify(orderIds), 'utf8');
    } catch (error) {
      console.error('Failed to save new temporary order to disk', error);
    }
    
    console.log('Temporary order created', { tempOrderId: tempId });
    
    return tempOrder;
  },
  
  /**
   * Retrieves a temporary order by ID
   */
  getOrder(tempOrderId) {
    // Try to get from memory first
    const order = tempOrdersMap.get(tempOrderId);
    
    if (order) {
      return order;
    }
    
    // If not in memory, try to get from disk
    try {
      const orderFilePath = path.join(TEMP_ORDERS_DIR, `${tempOrderId}.json`);
      
      if (fs.existsSync(orderFilePath)) {
        const orderData = JSON.parse(fs.readFileSync(orderFilePath, 'utf8'));
        
        // Check if expired
        if (orderData.expiresAt > Date.now()) {
          // Add to memory for future access
          tempOrdersMap.set(tempOrderId, orderData);
          return orderData;
        } else {
          // Clean up expired order file
          fs.unlinkSync(orderFilePath);
        }
      }
    } catch (error) {
      console.error('Failed to load temporary order from disk', error);
    }
    
    return null;
  },
  
  /**
   * Updates a temporary order
   */
  updateOrder(tempOrderId, updates) {
    const existingOrder = this.getOrder(tempOrderId);
    
    if (!existingOrder) {
      return null;
    }
    
    const updatedOrder = {
      ...existingOrder,
      ...updates
    };
    
    // Update in memory
    tempOrdersMap.set(tempOrderId, updatedOrder);
    
    // Update on disk
    try {
      const orderFilePath = path.join(TEMP_ORDERS_DIR, `${tempOrderId}.json`);
      fs.writeFileSync(orderFilePath, JSON.stringify(updatedOrder), 'utf8');
    } catch (error) {
      console.error('Failed to update temporary order on disk', error);
    }
    
    return updatedOrder;
  },
  
  /**
   * Deletes a temporary order
   */
  deleteOrder(tempOrderId) {
    // Remove from memory
    const deleted = tempOrdersMap.delete(tempOrderId);
    
    // Remove from disk
    try {
      const orderFilePath = path.join(TEMP_ORDERS_DIR, `${tempOrderId}.json`);
      
      if (fs.existsSync(orderFilePath)) {
        fs.unlinkSync(orderFilePath);
      }
      
      // Update the index
      const orderIds = Array.from(tempOrdersMap.keys());
      fs.writeFileSync(TEMP_ORDERS_INDEX, JSON.stringify(orderIds), 'utf8');
    } catch (error) {
      console.error('Failed to delete temporary order from disk', error);
    }
    
    return deleted;
  },
  
  /**
   * Lists all temporary orders (for admin purposes)
   */
  listOrders() {
    return Array.from(tempOrdersMap.values());
  },
  
  /**
   * Gets the count of temporary orders
   */
  getOrderCount() {
    return tempOrdersMap.size;
  },
  
  /**
   * Force saves all orders to disk (useful before shutdown)
   */
  forceSaveToDisk() {
    saveOrdersToDisk();
  }
};

// Run tests
function runTests() {
  console.log('\n=== Starting Temporary Order Storage Tests ===\n');
  
  // Load any existing orders
  loadOrdersFromDisk();
  
  // Test 1: Create a temporary order
  const sampleOrder = {
    customerName: 'Test Customer',
    customerEmail: 'test@example.com',
    restaurantId: 'rest-123',
    restaurantName: 'Test Restaurant',
    items: [
      {
        id: 'item-1',
        name: 'Burger',
        price: 9.99,
        quantity: 2
      },
      {
        id: 'item-2',
        name: 'Fries',
        price: 3.99,
        quantity: 1
      }
    ],
    total: 23.97,
    subtotal: 21.79,
    tax: 2.18
  };

  console.log('\n--- Test 1: Create Order ---\n');
  const createdOrder = temporaryOrderService.storeOrder(sampleOrder);
  console.log('Created order:', createdOrder.id);

  // Test 2: Retrieve the order
  console.log('\n--- Test 2: Retrieve Order ---\n');
  const retrievedOrder = temporaryOrderService.getOrder(createdOrder.id);
  
  if (!retrievedOrder) {
    console.error('Failed to retrieve order:', createdOrder.id);
  } else {
    console.log('Retrieved order:', {
      id: retrievedOrder.id,
      customerName: retrievedOrder.customerName,
      total: retrievedOrder.total
    });
  }

  // Test 3: Update the order
  console.log('\n--- Test 3: Update Order ---\n');
  const updatedOrder = temporaryOrderService.updateOrder(createdOrder.id, {
    customerName: 'Updated Customer Name',
    metadata: {
      note: 'This order was updated during testing'
    }
  });
  
  if (!updatedOrder) {
    console.error('Failed to update order:', createdOrder.id);
  } else {
    console.log('Updated order:', {
      id: updatedOrder.id,
      customerName: updatedOrder.customerName,
      metadata: updatedOrder.metadata
    });
  }

  // Test 4: List all orders
  console.log('\n--- Test 4: List All Orders ---\n');
  const allOrders = temporaryOrderService.listOrders();
  console.log(`Found ${allOrders.length} temporary orders`);
  console.log('Order IDs:', allOrders.map(order => order.id));

  // Test 5: Force save to disk
  console.log('\n--- Test 5: Force Save to Disk ---\n');
  temporaryOrderService.forceSaveToDisk();

  // Test 6: Delete the order
  console.log('\n--- Test 6: Delete Order ---\n');
  const deleted = temporaryOrderService.deleteOrder(createdOrder.id);
  console.log(`Order deletion ${deleted ? 'successful' : 'failed'}`);

  // Test 7: Verify deletion
  console.log('\n--- Test 7: Verify Deletion ---\n');
  const deletedOrder = temporaryOrderService.getOrder(createdOrder.id);
  
  if (deletedOrder) {
    console.error('Order still exists after deletion:', createdOrder.id);
  } else {
    console.log('Order successfully deleted:', createdOrder.id);
  }

  // Test 8: Create an order with short expiration for testing expiration
  console.log('\n--- Test 8: Test Expiration ---\n');
  const shortExpirationOrder = temporaryOrderService.storeOrder({
    ...sampleOrder,
    customerName: 'Expiration Test Customer'
  });
  
  // Manually update the expiration to be in the past
  const pastExpiration = Date.now() - 1000; // 1 second in the past
  temporaryOrderService.updateOrder(shortExpirationOrder.id, {
    expiresAt: pastExpiration
  });
  
  console.log('Created order with past expiration date:', {
    id: shortExpirationOrder.id,
    expiresAt: new Date(pastExpiration).toISOString()
  });

  // Run cleanup manually for testing
  console.log('\n--- Test 9: Run Cleanup ---\n');
  cleanupExpiredOrders();

  // Check if the expired order was removed
  const expiredOrder = temporaryOrderService.getOrder(shortExpirationOrder.id);
  
  if (expiredOrder) {
    console.error('Expired order still exists after cleanup:', shortExpirationOrder.id);
  } else {
    console.log('Expired order successfully cleaned up:', shortExpirationOrder.id);
  }

  console.log('\n=== Temporary Order Storage Tests Completed ===\n');
}

// Run the tests
runTests();
