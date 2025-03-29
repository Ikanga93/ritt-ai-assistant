// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Test script for simulating a complete conversation flow
 * This script tests the agent's ability to handle a multi-restaurant ordering scenario
 */

import { getRestaurants, getMenuCategories, getMenuItemsByCategory, sendOrderNotification } from './restaurantUtils.js';
import { placeOrder } from './orderService.js';
import { ConversationState, ConversationStage, createInitialState, selectRestaurant, selectCategory, addToCart, updateCustomerInfo, completeOrder } from './conversationState.js';

/**
 * Simulates a complete conversation flow
 */
async function testConversationFlow() {
  console.log('=== TESTING COMPLETE CONVERSATION FLOW ===\n');
  
  // Initialize conversation state
  const state = createInitialState();
  console.log('Initial state:', state);
  
  // Step 1: List restaurants (simulates user asking for restaurant options)
  console.log('\n--- STEP 1: RESTAURANT SELECTION ---');
  const restaurants = await getRestaurants();
  console.log(`Found ${restaurants.length} restaurants:`);
  restaurants.forEach(r => console.log(`- ${r.name}: ${r.description}`));
  
  // Step 2: Select a restaurant (simulates user choosing Micro Dose)
  console.log('\n--- STEP 2: RESTAURANT CHOSEN ---');
  const selectedRestaurant = restaurants.find(r => r.id === 'micro_dose');
  if (!selectedRestaurant) {
    console.error('Restaurant not found');
    return;
  }
  
  // Update state with selected restaurant
  selectRestaurant(state, selectedRestaurant.id, selectedRestaurant.name);
  console.log(`Selected restaurant: ${selectedRestaurant.name}`);
  console.log('Updated state:', state);
  
  // Step 3: Get menu categories (simulates user asking about menu)
  console.log('\n--- STEP 3: MENU CATEGORIES ---');
  const categories = await getMenuCategories(selectedRestaurant.id);
  console.log(`Found ${categories.length} categories for ${selectedRestaurant.name}:`);
  console.log(categories.join(', '));
  
  // Step 4: Select a category (simulates user choosing a category)
  console.log('\n--- STEP 4: CATEGORY SELECTION ---');
  const selectedCategory = categories[0]; // Select first category
  selectCategory(state, selectedCategory);
  console.log(`Selected category: ${selectedCategory}`);
  console.log('Updated state:', state);
  
  // Step 5: Get menu items (simulates user browsing items in a category)
  console.log('\n--- STEP 5: MENU ITEMS ---');
  const menuItems = await getMenuItemsByCategory(selectedRestaurant.id, selectedCategory);
  console.log(`Found ${menuItems.length} items in ${selectedCategory} category:`);
  menuItems.forEach(item => console.log(`- ${item.name}: $${item.price.toFixed(2)} - ${item.description}`));
  
  // Step 6: Add items to cart (simulates user ordering items)
  console.log('\n--- STEP 6: ADDING ITEMS TO CART ---');
  // Add first item with quantity 2
  const item1 = menuItems[0];
  addToCart(state, {
    id: item1.id,
    name: item1.name,
    quantity: 2,
    price: item1.price,
    specialInstructions: 'Extra sweet'
  });
  
  // Add second item with quantity 1
  const item2 = menuItems.length > 1 ? menuItems[1] : menuItems[0];
  addToCart(state, {
    id: item2.id,
    name: item2.name,
    quantity: 1,
    price: item2.price
  });
  
  console.log('Cart updated with items:');
  state.cartItems.forEach(item => {
    console.log(`- ${item.quantity}x ${item.name} ($${item.price?.toFixed(2)})${item.specialInstructions ? ` - ${item.specialInstructions}` : ''}`);
  });
  
  // Step 7: Update customer info (simulates user providing their details)
  console.log('\n--- STEP 7: CUSTOMER INFORMATION ---');
  updateCustomerInfo(state, 'Test Customer', 'customer@example.com');
  console.log('Updated customer information:');
  console.log(`Name: ${state.customerName}`);
  console.log(`Email: ${state.customerEmail}`);
  console.log('Updated state:', state);
  
  // Step 8: Place order (simulates user confirming the order)
  console.log('\n--- STEP 8: PLACING ORDER ---');
  
  // Calculate order total
  const orderTotal = state.cartItems.reduce((total, item) => {
    return total + (item.price || 0) * item.quantity;
  }, 0);
  
  // Convert cart items to order items format
  const orderItems = state.cartItems.map(item => ({
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    price: item.price,
    specialInstructions: item.specialInstructions
  }));
  
  try {
    const orderDetails = await placeOrder(
      state.selectedRestaurantId!,
      state.customerName!,
      orderItems,
      state.customerEmail
    );
    
    console.log('Order placed successfully:');
    console.log(`Order #${orderDetails.orderNumber} at ${orderDetails.restaurantName}`);
    console.log(`Total: $${orderDetails.orderTotal.toFixed(2)}`);
    console.log(`Estimated time: ${orderDetails.estimatedTime} minutes`);
    
    // Step 9: Send notification (simulates the email being sent)
    console.log('\n--- STEP 9: SENDING NOTIFICATION ---');
    const notificationResult = await sendOrderNotification(state.selectedRestaurantId!, orderDetails);
    console.log(`Notification sent: ${notificationResult ? 'Success' : 'Failed'}`);
    
    // Step 10: Complete order and reset state
    console.log('\n--- STEP 10: COMPLETING ORDER ---');
    completeOrder(state);
    console.log('Final state after order completion:', state);
    
  } catch (error) {
    console.error('Error placing order:', error);
  }
  
  console.log('\n=== CONVERSATION FLOW TEST COMPLETED ===');
}

// Run the test
testConversationFlow().catch(error => {
  console.error('Test failed:', error);
});
