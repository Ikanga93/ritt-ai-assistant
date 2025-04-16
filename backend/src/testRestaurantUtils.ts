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
  console.log('===== Testing Coffee Shop Utilities =====');
  
  // Test 1: Get all coffee shops
  console.log('\n1. Getting all coffee shops:');
  const coffeeShops = await getRestaurants();
  console.log(JSON.stringify(coffeeShops, null, 2));
  
  if (coffeeShops.length === 0) {
    console.error('No coffee shops found! Check the menu_data directory.');
    return;
  }
  
  // Use the first coffee shop for further tests
  const testCoffeeShopId = coffeeShops[0].id;
  console.log(`\nUsing coffee shop "${coffeeShops[0].name}" (${testCoffeeShopId}) for further tests.`);
  
  // Test 2: Get coffee shop by ID
  console.log('\n2. Getting coffee shop details:');
  const coffeeShop = await getRestaurantById(testCoffeeShopId);
  console.log(`Name: ${coffeeShop?.coffee_shop_name}`);
  console.log(`Description: ${coffeeShop?.description}`);
  console.log(`Address: ${coffeeShop?.location.address}`);

  
  // Test 3: Get menu categories
  console.log('\n3. Getting menu categories:');
  const categories = await getMenuCategories(testCoffeeShopId);
  console.log(categories);
  
  if (categories.length === 0) {
    console.error('No menu categories found!');
    return;
  }
  
  // Test 4: Get menu items for a specific category
  const testCategory = categories[0];
  console.log(`\n4. Getting menu items for category "${testCategory}":`);
  const menuItems = await getMenuItemsByCategory(testCoffeeShopId, testCategory);
  console.log(`Found ${menuItems.length} items:`);
  menuItems.forEach(item => {
    console.log(`- ${item.name}: $${item.price} - ${item.description.substring(0, 50)}${item.description.length > 50 ? '...' : ''}`);
  });
  
  // Test 5: Get all menu items
  console.log('\n5. Getting all menu items:');
  const allItems = await getAllMenuItems(testCoffeeShopId);
  console.log(`Found ${Object.keys(allItems).length} categories with items.`);
  
  console.log('\n===== Tests Completed =====');
}

// Run the tests
testRestaurantUtils().catch(error => {
  console.error('Error running tests:', error);
});
