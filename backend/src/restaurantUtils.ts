// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cacheManager } from './cacheManager.js';

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
 */
export async function getRestaurantById(id: string): Promise<CoffeeShop | null> {
  if (!id) {
    console.error('Invalid restaurant ID: ID is empty or undefined');
    return null;
  }

  console.log(`Looking up restaurant with original ID: "${id}"`);
  
  // First check if this is a known mispronunciation
  const lowerCaseId = id.toLowerCase();
  const mappedId = coffeeShopNameMappings[lowerCaseId] || lowerCaseId;
  
  // Then normalize: convert to lowercase and replace spaces with underscores
  const normalizedId = mappedId.replace(/\s+/g, '_');
  
  console.log(`Normalized restaurant ID: "${normalizedId}" (from "${id}")`);
  
  // Validate that we're looking for a known restaurant
  const availableRestaurants = await getRestaurants();
  const validIds = availableRestaurants.map(r => r.id);
  
  if (!validIds.includes(normalizedId)) {
    console.warn(`Warning: Restaurant ID "${normalizedId}" is not in the list of known restaurants: ${validIds.join(', ')}`);
    // Try to find a close match
    const closestMatch = validIds.find(validId => {
      return validId.includes(normalizedId) || normalizedId.includes(validId);
    });
    
    if (closestMatch) {
      console.log(`Found potential match: "${closestMatch}" for "${normalizedId}", using it instead`);
      return getRestaurantById(closestMatch);
    }
  }
  
  return cacheManager.getOrSet(`restaurant_${normalizedId}`, async () => {
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
  });
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
 */
export async function getMenuItemsByCategory(
  restaurantId: string, 
  categoryName: string
): Promise<MenuItem[]> {
  return cacheManager.getOrSet(`items_${restaurantId}_${categoryName.toLowerCase()}`, async () => {
    console.log(`Cache miss: Loading menu items for ${restaurantId}, category ${categoryName}`);
    const coffeeShop = await getRestaurantById(restaurantId);
    if (!coffeeShop) return [];
    
    // Handle special case for generic categories like 'drinks'
    if (categoryName.toLowerCase() === 'drinks') {
      // Define drink-related categories (excluding food categories)
      const drinkCategories = ['vibe dealer specials', 'rx lattes', 'level up', 'gateway drinks - basics', 'boujee', 'teas', 'kids'];
      
      // Get items from all drink categories
      const allDrinkItems: MenuItem[] = [];
      coffeeShop.menu_categories.forEach(cat => {
        if (drinkCategories.includes(cat.category.toLowerCase())) {
          allDrinkItems.push(...cat.items);
        }
      });
      
      return allDrinkItems;
    }
    
    // Regular category matching
    const category = coffeeShop.menu_categories.find(
      cat => cat.category.toLowerCase() === categoryName.toLowerCase()
    );
    
    return category?.items || [];
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