// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import {
  getRestaurants,
  getRestaurantById,
  getMenuCategories,
  getMenuItemsByCategory,
  getAllMenuItems
} from './restaurantUtils.js';

async function testRestaurantUtils() {
  console.log('===== Testing Restaurant Utilities =====');
  
  // Test 1: Get all restaurants
  console.log('\n1. Getting all restaurants:');
  const restaurants = await getRestaurants();
  console.log(JSON.stringify(restaurants, null, 2));
  
  if (restaurants.length === 0) {
    console.error('No restaurants found! Check the menu_data directory.');
    return;
  }
  
  // Use the first restaurant for further tests
  const testRestaurantId = restaurants[0].id;
  console.log(`\nUsing restaurant "${restaurants[0].name}" (${testRestaurantId}) for further tests.`);
  
  // Test 2: Get restaurant by ID
  console.log('\n2. Getting restaurant details:');
  const restaurant = await getRestaurantById(testRestaurantId);
  console.log(`Name: ${restaurant?.restaurant_name}`);
  console.log(`Description: ${restaurant?.description}`);
  console.log(`Address: ${restaurant?.location.address}`);
  console.log(`Email: ${restaurant?.email || 'Not specified'}`);
  
  // Test 3: Get menu categories
  console.log('\n3. Getting menu categories:');
  const categories = await getMenuCategories(testRestaurantId);
  console.log(categories);
  
  if (categories.length === 0) {
    console.error('No menu categories found!');
    return;
  }
  
  // Test 4: Get menu items for a specific category
  const testCategory = categories[0];
  console.log(`\n4. Getting menu items for category "${testCategory}":`);
  const menuItems = await getMenuItemsByCategory(testRestaurantId, testCategory);
  console.log(`Found ${menuItems.length} items:`);
  menuItems.forEach(item => {
    console.log(`- ${item.name}: $${item.price} - ${item.description.substring(0, 50)}${item.description.length > 50 ? '...' : ''}`);
  });
  
  // Test 5: Get all menu items
  console.log('\n5. Getting all menu items:');
  const allItems = await getAllMenuItems(testRestaurantId);
  console.log(`Found ${Object.keys(allItems).length} categories with items.`);
  
  console.log('\n===== Tests Completed =====');
}

// Run the tests
testRestaurantUtils().catch(error => {
  console.error('Error running tests:', error);
});
