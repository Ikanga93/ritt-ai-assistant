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

export interface RestaurantLocation {
  address: string;
  phone: string;
  hours: string;
}

export interface Restaurant {
  restaurant: string;
  description: string;
  location: RestaurantLocation;
  restaurant_id: string;
  restaurant_name: string;
  menu_categories: MenuCategory[];
  notes?: string;
  email?: string; // Added for order notifications
}

/**
 * Get a list of all available restaurants
 */
export async function getRestaurants(): Promise<{ id: string; name: string; description: string }[]> {
  return cacheManager.getOrSet('all_restaurants', async () => {
    try {
      console.log('Cache miss: Loading restaurants from disk');
      const files = await fs.readdir(menuDataPath);
      const restaurantFiles = files.filter(file => file.endsWith('.json'));
      
      const restaurants = await Promise.all(
        restaurantFiles.map(async (file) => {
          const filePath = path.join(menuDataPath, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const data = JSON.parse(content) as Restaurant;
          return {
            id: data.restaurant_id,
            name: data.restaurant_name,
            description: data.description
          };
        })
      );
      
      return restaurants;
    } catch (error) {
      console.error('Error reading restaurant data:', error);
      return [];
    }
  });
}

/**
 * Get a specific restaurant by ID
 */
export async function getRestaurantById(id: string): Promise<Restaurant | null> {
  return cacheManager.getOrSet(`restaurant_${id}`, async () => {
    try {
      console.log(`Cache miss: Loading restaurant ${id} from disk`);
      const filePath = path.join(menuDataPath, `${id}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as Restaurant;
    } catch (error) {
      console.error(`Error reading restaurant data for ${id}:`, error);
      return null;
    }
  });
}

/**
 * Get menu categories for a specific restaurant
 */
export async function getMenuCategories(restaurantId: string): Promise<string[]> {
  return cacheManager.getOrSet(`categories_${restaurantId}`, async () => {
    console.log(`Cache miss: Loading menu categories for ${restaurantId}`);
    const restaurant = await getRestaurantById(restaurantId);
    if (!restaurant) return [];
    
    return restaurant.menu_categories.map(category => category.category);
  });
}

/**
 * Get menu items for a specific category in a restaurant
 */
export async function getMenuItemsByCategory(
  restaurantId: string, 
  categoryName: string
): Promise<MenuItem[]> {
  return cacheManager.getOrSet(`items_${restaurantId}_${categoryName.toLowerCase()}`, async () => {
    console.log(`Cache miss: Loading menu items for ${restaurantId}, category ${categoryName}`);
    const restaurant = await getRestaurantById(restaurantId);
    if (!restaurant) return [];
    
    const category = restaurant.menu_categories.find(
      cat => cat.category.toLowerCase() === categoryName.toLowerCase()
    );
    
    return category?.items || [];
  });
}

/**
 * Get all menu items for a restaurant
 */
export async function getAllMenuItems(restaurantId: string): Promise<Record<string, MenuItem[]>> {
  const restaurant = await getRestaurantById(restaurantId);
  if (!restaurant) return {};
  
  const menuByCategory: Record<string, MenuItem[]> = {};
  
  for (const category of restaurant.menu_categories) {
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
  const restaurant = await getRestaurantById(restaurantId);
  if (!restaurant) {
    console.error(`Restaurant with ID ${restaurantId} not found. Cannot send order notification.`);
    return false;
  }
  
  // Use the restaurant's email if available, otherwise use the default email
  const restaurantEmail = restaurant.email || 'pofaraorder@gmail.com';
  
  // Send the email notification
  try {
    const emailSent = await sendOrderEmail(restaurantEmail, orderDetails);
    if (emailSent) {
      console.log(`Order notification sent to ${restaurant.restaurant_name} at ${restaurantEmail}`);
      return true;
    } else {
      console.error(`Failed to send order notification to ${restaurant.restaurant_name}`);
      return false;
    }
  } catch (error) {
    console.error(`Error sending order notification to ${restaurant.restaurant_name}:`, error);
    return false;
  }
}