// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cacheManager } from './cacheManager.js';
// Import the entire module instead of specific functions
import * as fuzzyMatchUtils from './utils/fuzzyMatch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const menuDataPath = path.join(__dirname, '../menu_data');

export interface MenuItem {
  name: string;
  description: string;
  price: number;
  calories: number | null;
  id: string;
}

export interface MenuCategory {
  category: string;
  items: MenuItem[];
}

export interface CoffeeShopLocation {
  address: string;
  phone: string;
  hours: string;
}

export interface CoffeeShop {
  coffee_shop: string;
  description: string;
  location: CoffeeShopLocation;
  coffee_shop_id: string;
  coffee_shop_name: string;
  menu_categories: MenuCategory[];
  notes?: string;
  email?: string; // Added for order notifications
}

/**
 * Get a list of all available coffee shops
 */
export async function getRestaurants(): Promise<{ id: string; name: string; description: string }[]> {
  return cacheManager.getOrSet('all_restaurants', async () => {
    try {
      console.log('Cache miss: Loading restaurants from disk');
      const files = await fs.readdir(menuDataPath);
      console.log('Available files in menu_data directory:', files);
      const restaurantFiles = files.filter(file => file.endsWith('.json'));
      console.log('JSON files found:', restaurantFiles);
      
      const restaurants = await Promise.all(
        restaurantFiles.map(async (file) => {
          const filePath = path.join(menuDataPath, file);
          console.log(`Reading coffee shop data from: ${filePath}`);
          const content = await fs.readFile(filePath, 'utf-8');
          const data = JSON.parse(content) as CoffeeShop;
          console.log(`Loaded coffee shop: ${data.coffee_shop_name} (ID: ${data.coffee_shop_id})`);
          return {
            id: data.coffee_shop_id,
            name: data.coffee_shop_name,
            description: data.description
          };
        })
      );
      
      console.log('All restaurants loaded:', restaurants.map(r => `${r.name} (${r.id})`).join(', '));
      return restaurants;
    } catch (error) {
      console.error('Error reading restaurant data:', error);
      return [];
    }
  });
}

/**
 * Map of common mispronunciations or alternate ways to refer to coffee shops
 */
const coffeeShopNameMappings: Record<string, string> = {
  // Micro Dose variations
  'micro dose': 'micro_dose',
  'micro dose coffee': 'micro_dose',
  'microdose': 'micro_dose',
  'microdose coffee': 'micro_dose',
  'microdose_id': 'micro_dose',
  'micro does': 'micro_dose',
  'micro-dose': 'micro_dose',
  'my crow dose': 'micro_dose',
  'micro doze': 'micro_dose',
  'micro': 'micro_dose',
  'dose': 'micro_dose',
  'micro d': 'micro_dose',
  'md': 'micro_dose',
  'micro_dose_id': 'micro_dose',
  'microdoseid': 'micro_dose',
  'micro dose id': 'micro_dose',
  'microdos': 'micro_dose',
  'microdos coffee': 'micro_dose',
  'microdoughs': 'micro_dose',
  'microdoughs coffee': 'micro_dose',
  'micro doughs': 'micro_dose',
  'micro doughs coffee': 'micro_dose',
  
  // Drinx variations
  'drinx': 'drinx',
  'drinks': 'drinx',
  'drink': 'drinx',
  'drinx coffee': 'drinx',
  'drinx cafe': 'drinx',
  'drinks coffee': 'drinx',
  
  // Burger Joint variations
  'burger joint': 'burger_joint',
  'burger place': 'burger_joint',
  'burgers': 'burger_joint',
  'burger spot': 'burger_joint',
  
  // Pizza Palace variations
  'pizza palace': 'pizza_palace',
  'pizza place': 'pizza_palace',
  'pizza': 'pizza_palace',
  'palace': 'pizza_palace',
  
  // Common mispronunciations of MacroDo's (which doesn't exist)
  'macrodo\'s': 'micro_dose',
  'macrodose': 'micro_dose',
  'macro dose': 'micro_dose',
  'macro does': 'micro_dose',
  'macro doze': 'micro_dose',
  'macros': 'micro_dose'
};

/**
 * Get a specific coffee shop by ID
 * Enhanced with fuzzy matching for better restaurant name recognition
 */
export async function getRestaurantById(id: string): Promise<CoffeeShop | null> {
  if (!id) {
    console.error('Invalid restaurant ID: ID is empty or undefined');
    return null;
  }

  console.log(`Looking up restaurant with original ID: "${id}"`);
  
  // First check if this is a known mispronunciation
  const lowerCaseId = id.toLowerCase().trim();
  const mappedId = coffeeShopNameMappings[lowerCaseId] || lowerCaseId;
  
  // Then normalize: convert to lowercase and replace spaces with underscores
  const normalizedId = mappedId.replace(/\s+/g, '_');
  
  console.log(`Normalized restaurant ID: "${normalizedId}" (from "${id}")`);
  
  // Validate that we're looking for a known restaurant
  const availableRestaurants = await getRestaurants();
  const validIds = availableRestaurants.map(r => r.id);
  const restaurantNames = availableRestaurants.map(r => r.name);
  
  // Try exact match first
  if (validIds.includes(normalizedId)) {
    return cacheManager.getOrSet(`restaurant_${normalizedId}`, () => loadRestaurantFromDisk(normalizedId));
  }
  
  // If no exact match, try fuzzy matching
  console.warn(`Warning: Restaurant ID "${normalizedId}" is not in the list of known restaurants: ${validIds.join(', ')}`);
  
  // Try to find a close match by ID substring
  const substringMatch = validIds.find(validId => {
    return validId.includes(normalizedId) || normalizedId.includes(validId);
  });
  
  if (substringMatch) {
    console.log(`Found substring match by ID: "${substringMatch}" for "${normalizedId}", using it instead`);
    return cacheManager.getOrSet(`restaurant_${substringMatch}`, () => loadRestaurantFromDisk(substringMatch));
  }
  
  // Try fuzzy matching with restaurant names
  // Normalize the input for better matching
  const normalizedInput = fuzzyMatchUtils.normalizeString(id);
  
  // Try to find the best match among restaurant names
  const bestNameMatch = fuzzyMatchUtils.findBestMatch(normalizedInput, restaurantNames);
  
  if (bestNameMatch && bestNameMatch.similarity >= 0.5) {
    // Find the restaurant ID that corresponds to the matched name
    const matchedRestaurant = availableRestaurants.find(r => r.name === bestNameMatch.match);
    
    if (matchedRestaurant) {
      console.log(`Fuzzy match found: "${id}" -> "${matchedRestaurant.name}" (similarity: ${bestNameMatch.similarity.toFixed(2)})`);
      console.log(`Using restaurant ID: ${matchedRestaurant.id}`);
      return cacheManager.getOrSet(`restaurant_${matchedRestaurant.id}`, () => loadRestaurantFromDisk(matchedRestaurant.id));
    }
  }
  
  // If still no match, try fuzzy matching with IDs as a last resort
  const bestIdMatch = fuzzyMatchUtils.findBestMatch(normalizedInput, validIds);
  
  if (bestIdMatch && bestIdMatch.similarity >= 0.5) {
    console.log(`Fuzzy match found by ID: "${id}" -> "${bestIdMatch.match}" (similarity: ${bestIdMatch.similarity.toFixed(2)})`);
    return cacheManager.getOrSet(`restaurant_${bestIdMatch.match}`, () => loadRestaurantFromDisk(bestIdMatch.match));
  }
  
  // No match found
  console.error(`No matching restaurant found for: "${id}"`);
  return null;
}

/**
 * Helper function to load restaurant data from disk
 */
async function loadRestaurantFromDisk(normalizedId: string): Promise<CoffeeShop | null> {
  try {
    console.log(`Cache miss: Loading coffee shop ${normalizedId} from disk`);
    const filePath = path.join(menuDataPath, `${normalizedId}.json`);
    console.log(`Looking for file at: ${filePath}`);
    
    // Check if file exists before trying to read it
    try {
      await fs.access(filePath);
    } catch (err) {
      console.error(`File not found: ${filePath}`);
      return null;
    }
    
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content) as CoffeeShop;
    console.log(`Successfully loaded restaurant: ${data.coffee_shop_name}`);
    return data;
  } catch (error) {
    console.error(`Error reading coffee shop data for ${normalizedId}:`, error);
    return null;
  }
}

/**
 * Get menu categories for a specific coffee shop
 */
export async function getMenuCategories(restaurantId: string): Promise<string[]> {
  return cacheManager.getOrSet(`categories_${restaurantId}`, async () => {
    console.log(`Cache miss: Loading menu categories for ${restaurantId}`);
    const coffeeShop = await getRestaurantById(restaurantId);
    if (!coffeeShop) return [];
    
    return coffeeShop.menu_categories.map(category => category.category);
  });
}

/**
 * Get menu items for a specific category in a coffee shop
 * Enhanced with fuzzy matching for category names
 */
export async function getMenuItemsByCategory(
  restaurantId: string, 
  categoryName: string
): Promise<MenuItem[]> {
  // Normalize the category name for better caching
  const normalizedCategoryName = fuzzyMatchUtils.normalizeString(categoryName);
  
  return cacheManager.getOrSet(`items_${restaurantId}_${normalizedCategoryName}`, async () => {
    console.log(`Cache miss: Loading menu items for ${restaurantId}, category "${categoryName}"`);
    const coffeeShop = await getRestaurantById(restaurantId);
    if (!coffeeShop) return [];
    
    // Handle special cases for generic categories
    const lowerCaseCategoryName = categoryName.toLowerCase().trim();
    
    // Handle 'drinks' category (combines all drink-related categories)
    if (lowerCaseCategoryName === 'drinks' || 
        lowerCaseCategoryName === 'drink' || 
        lowerCaseCategoryName === 'beverages' || 
        lowerCaseCategoryName === 'beverage') {
      // Define drink-related categories (excluding food categories)
      const drinkCategories = ['vibe dealer specials', 'rx lattes', 'level up', 'gateway drinks - basics', 'boujee', 'teas', 'kids'];
      
      // Get items from all drink categories
      const allDrinkItems: MenuItem[] = [];
      coffeeShop.menu_categories.forEach(cat => {
        if (drinkCategories.includes(cat.category.toLowerCase())) {
          allDrinkItems.push(...cat.items);
        }
      });
      
      console.log(`Returning ${allDrinkItems.length} items from combined drink categories`);
      return allDrinkItems;
    }
    
    // Handle 'food' category (combines all food-related categories)
    if (lowerCaseCategoryName === 'food' || 
        lowerCaseCategoryName === 'foods' || 
        lowerCaseCategoryName === 'snacks' || 
        lowerCaseCategoryName === 'snack') {
      // Define food-related categories
      const foodCategories = ['food', 'pastries', 'breakfast', 'lunch', 'bakery', 'sandwiches', 'snacks'];
      
      // Get items from all food categories
      const allFoodItems: MenuItem[] = [];
      coffeeShop.menu_categories.forEach(cat => {
        if (foodCategories.some(fc => cat.category.toLowerCase().includes(fc))) {
          allFoodItems.push(...cat.items);
        }
      });
      
      console.log(`Returning ${allFoodItems.length} items from combined food categories`);
      return allFoodItems;
    }
    
    // Try exact match first
    const exactCategory = coffeeShop.menu_categories.find(
      cat => cat.category.toLowerCase() === lowerCaseCategoryName
    );
    
    if (exactCategory) {
      console.log(`Exact category match found: "${exactCategory.category}"`);
      return exactCategory.items;
    }
    
    // If no exact match, try fuzzy matching
    // Get all category names
    const categoryNames = coffeeShop.menu_categories.map(cat => cat.category);
    
    // Import the findBestMatch function
    // Already imported at the top level
    
    // Try to find the best match
    const bestMatch = fuzzyMatchUtils.findBestMatch(normalizedCategoryName, categoryNames);
    
    if (bestMatch && bestMatch.similarity >= 0.6) {
      const matchedCategory = coffeeShop.menu_categories.find(
        cat => cat.category === bestMatch.match
      );
      
      if (matchedCategory) {
        console.log(`Fuzzy category match found: "${categoryName}" -> "${matchedCategory.category}" (similarity: ${bestMatch.similarity.toFixed(2)})`);
        return matchedCategory.items;
      }
    }
    
    // If still no match, try substring matching
    for (const cat of coffeeShop.menu_categories) {
      const normalizedCatName = fuzzyMatchUtils.normalizeString(cat.category);
      
      if (normalizedCatName.includes(normalizedCategoryName) || 
          normalizedCategoryName.includes(normalizedCatName)) {
        console.log(`Substring match found: "${categoryName}" -> "${cat.category}"`);
        return cat.items;
      }
    }
    
    // If no match found, return empty array
    console.warn(`No category match found for: "${categoryName}"`);
    return [];
  });
}

/**
 * Get all menu items for a coffee shop
 */
export async function getAllMenuItems(restaurantId: string): Promise<Record<string, MenuItem[]>> {
  const coffeeShop = await getRestaurantById(restaurantId);
  if (!coffeeShop) return {};
  
  const menuByCategory: Record<string, MenuItem[]> = {};
  
  for (const category of coffeeShop.menu_categories) {
    menuByCategory[category.category] = category.items;
  }
  
  return menuByCategory;
}

/**
 * Send an order notification email using SendGrid
 */
import { sendOrderEmail } from './emailService.js';

export async function sendOrderNotification(
  restaurantId: string,
  orderDetails: any
): Promise<boolean> {
  const coffeeShop = await getRestaurantById(restaurantId);
  if (!coffeeShop) {
    console.error(`Coffee shop with ID ${restaurantId} not found. Cannot send order notification.`);
    return false;
  }
  
  // Use the coffee shop's email if available, otherwise use the default email
  const coffeeShopEmail = coffeeShop.email || 'pofaraorder@gmail.com';
  
  // Send the email notification
  try {
    const emailSent = await sendOrderEmail(coffeeShopEmail, orderDetails);
    if (emailSent) {
      console.log(`Order notification sent to ${coffeeShop.coffee_shop_name} at ${coffeeShopEmail}`);
      return true;
    } else {
      console.error(`Failed to send order notification to ${coffeeShop.coffee_shop_name}`);
      return false;
    }
  } catch (error) {
    console.error(`Error sending order notification to ${coffeeShop.coffee_shop_name}:`, error);
    return false;
  }
}