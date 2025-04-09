import { findMenuItemByName, normalizeString, verifyOrderItems } from './utils/fuzzyMatch.js';
import { getRestaurantById } from './restaurantUtils.js';

async function testFuzzyMatching() {
  console.log('Testing fuzzy matching for "The Quickie" menu item...');
  
  // Get the Micro Dose restaurant data
  const restaurantId = 'micro_dose';
  const restaurant = await getRestaurantById(restaurantId);
  
  if (!restaurant) {
    console.error(`Restaurant not found: ${restaurantId}`);
    return;
  }
  
  console.log(`Successfully loaded restaurant: ${restaurant.coffee_shop_name}`);
  
  // Collect all menu items
  const allMenuItems = [];
  restaurant.menu_categories.forEach(category => {
    category.items.forEach(item => {
      allMenuItems.push(item);
    });
  });
  
  console.log(`Total menu items: ${allMenuItems.length}`);
  
  // Test variations of "The Quickie"
  const variations = [
    'The Quickie',
    'Quickie',
    'the quickie',
    'quickie',
    'quicky',
    'the quicky',
    'quick',
    'des kwikis'
  ];
  
  console.log('\nTesting individual variations:');
  for (const variation of variations) {
    console.log(`\nTesting: "${variation}"`);
    console.log(`Normalized: "${normalizeString(variation)}"`);
    const match = findMenuItemByName(variation, allMenuItems, 0.5);
    if (match) {
      console.log(`✅ Match found: "${match.name}" (id: ${match.id})`);
    } else {
      console.log(`❌ No match found for "${variation}"`);
    }
  }
  
  // Test order verification
  console.log('\nTesting order verification:');
  const testOrder = [
    { name: 'The Quickie', quantity: 1 },
    { name: 'Muffin', quantity: 1 }
  ];
  
  const verifiedItems = verifyOrderItems(testOrder, allMenuItems, 0.5);
  
  verifiedItems.forEach(item => {
    if (item.verified) {
      console.log(`✅ Verified: "${item.name}"`);
    } else {
      console.log(`❌ Not verified: "${item.name}"${item.suggestion ? `, suggested: "${item.suggestion}"` : ''}`);
    }
  });
}

// Run the test
testFuzzyMatching()
  .then(() => console.log('Test completed'))
  .catch(err => console.error('Test failed:', err));
