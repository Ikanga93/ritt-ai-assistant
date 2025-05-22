// @ts-nocheck
// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import {
    type JobContext,
    WorkerOptions,
    cli,
    defineAgent,
    llm,
    multimodal,
  } from '@livekit/agents';
  import * as openai from '@livekit/agents-plugin-openai';
  import dotenv from 'dotenv';
  import path from 'node:path';
  import { fileURLToPath } from 'node:url';
  import { z } from 'zod';
  import express from 'express';
  import fetch from 'node-fetch';
  // Import API throttler and performance monitor
  import { apiThrottler } from './apiThrottler.js';
  import { performanceMonitor } from './performanceMonitor.js';
  
  // Import payment routes for Stripe webhook handling
  import paymentRoutes from './routes/paymentRoutes.js';
  
  // Import conversation state management
  import {
    ConversationState,
    ConversationStage,
    createInitialState,
    selectRestaurant,
    selectCategory,
    addToCart,
    removeFromCart,
    updateCustomerInfo,
    resetOrder,
    completeOrder,
    updateStage,
    updateLastFunction
  } from './conversationState.js';
  
  // Import restaurant utilities
  import { getRestaurants, getRestaurantById, getMenuCategories, getMenuItemsByCategory, getAllMenuItems } from './restaurantUtils.js';
  
  // Import order service
  import { placeOrder } from './orderService.js';

  // Import database initialization to ensure connection is established
  import { ensureDatabaseInitialized } from './database-init.js';

  // Ensure database is initialized
  ensureDatabaseInitialized();

  import { preprocessMessage } from './messageProcessor.js';
  

  
  // Import fuzzy matching utilities
  import { findBestMatch, findAllMatches, verifyOrderItems, normalizeString } from './utils/fuzzyMatch.js';
  

  
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.join(__dirname, '../.env.local');
  dotenv.config({ path: envPath });
  


export default defineAgent({
    entry: async (ctx: JobContext) => {
      await ctx.connect();
      console.log('waiting for participant');
      const participant = await ctx.waitForParticipant();
      console.log(`starting assistant example agent for ${participant.identity}`);
      
      // Extract Auth0 user data from participant metadata if available
      let auth0User = null;
      console.log('Checking participant metadata for Auth0 user data...');
      console.log('Participant identity:', participant.identity);
      console.log('Participant metadata exists:', !!participant.metadata);
      
      if (participant.metadata) {
        console.log('Raw participant metadata:', participant.metadata);
        try {
          const metadata = JSON.parse(participant.metadata);
          console.log('Parsed participant metadata:', metadata);
          
          // Check for Auth0 user data in various formats
          if (metadata.sub && (metadata.email || metadata.name)) {
            auth0User = metadata;
            console.log('Auth0 user data found directly in metadata:', auth0User);
          } else if (metadata.user && metadata.user.sub) {
            auth0User = metadata.user;
            console.log('Auth0 user data found in metadata.user:', auth0User);
          } else {
            // Log all keys in the metadata to help diagnose the structure
            console.log('Metadata keys:', Object.keys(metadata));
            console.log('No Auth0 user data found in expected format');
          }
        } catch (error) {
          console.error('Error parsing participant metadata:', error);
        }
      } else {
        console.log('No participant metadata available');
      }
  
      // Initialize conversation state
      // Use let instead of const for conversationState so we can reassign it
      let conversationState: ConversationState = createInitialState();
      
      // Store Auth0 user data in conversation state
      if (auth0User) {
        conversationState.auth0User = auth0User;
      }
      
      const model = new openai.realtime.RealtimeModel({
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4o-realtime-preview',
        // Add token optimization settings
        maxTokens: 512, // Further limit response length to reduce token usage
        temperature: 0.7, // Add temperature setting for more predictable responses
        timeout: 60000, // Add 60 second timeout for API calls
        turn_detection: {
          type: 'semantic_vad',
          eagerness: 'medium',
          create_response: true,
          interrupt_response: true
        },
        instructions: `You are Julie, a friendly AI drive-thru assistant. Your primary goal is to help customers place coffee and food orders from multiple restaurants through voice interaction only. IMPORTANT: You must ONLY reference restaurants and menu items that actually exist in the system data. NEVER mention or suggest restaurants or menu items that are not provided to you through the getRestaurants and other API functions.
        
  IMPORTANT GUIDELINES FOR DRIVE-THRU:
  
  1. Always speak naturally and conversationally, but KEEP ALL RESPONSES CONCISE.
  
  2. GREETING (First Step):
     - Begin with a brief, friendly greeting like "Hi, I'm Julie, your drive-thru assistant"
     - Ask "Where would you like to order from today?"
     - DO NOT list all restaurants unless the customer specifically asks for options
     - If the customer asks what restaurants are available, then use the listRestaurants function
     - ONLY mention restaurants that are actually available in the system
     - NEVER mention or suggest restaurants like Dunkin, Starbucks, or any others unless they are specifically in your available restaurant list
     - If the customer doesn't specify a preference, ask them what type of food they're in the mood for
  
  3. ORDER TAKING (Second Step):
     - Once a restaurant is selected, immediately ask "What would you like to order today?"
     - DO NOT list menu categories unless the customer specifically asks
     - DO NOT force the customer to browse by category first
     - Let the customer order directly by item name
     - Always treat items with names like "The [Name]" as specific menu items, not as categories
     - If a customer says "I want the [item name]" or any variation, add it to their order as a menu item
     - EXAMPLE: If customer says "I want the [item name]", respond with "Adding one [item name]. Would you like anything else?"
     - NEVER say "What would you like to order from The [item name]?" - this is incorrect
     - Each restaurant has its own unique menu items - always check if the item exists at the selected restaurant
     - ONLY mention menu items that actually exist in the restaurant's menu
     - NEVER make up or suggest menu items that are not in the restaurant's actual menu data
     - Confirm the customer's order before moving to the next step
     - Keep a running total of their order
     - Ask for the customer's name before completing the order if not already provided
  
  4. ORDER CUSTOMIZATION:
     - Ask about size, milk options, sweeteners, and other relevant customizations
     - Confirm each item before moving to the next
     - Allow customers to order multiple items from different categories
     - Keep a running total of their order

  5. ORDER CONFIRMATION (Final Step):
     - ALWAYS ask for the customer's name if not already provided
     - Summarize the complete order with all items, quantities, and the total price
     - Ask the customer to confirm if everything is correct
     - CRITICAL: When the customer confirms their order, you MUST IMMEDIATELY call the placeOrder function with all order details
     - After calling placeOrder, tell them: "Thanks for confirming your order! You'll receive a payment link via the email you used to sign in. Once payment is confirmed, your order will be sent to the kitchen for preparation. Your order will be ready for pickup shortly after payment is processed."
     - If they want changes, go back to the appropriate step
     - NEVER skip calling the placeOrder function when an order is confirmed

  6. ORDER COMPLETION (Final Step):
     - After the order is placed, thank the customer for their order
     - Tell them their order will be ready for pickup at the window
     - Wish them a good day
     - IMPORTANT: If a customer asks for a specific restaurant like Niros Gyros, ALWAYS try to find it even if initial lookup fails
     - If you initially say a restaurant doesn't exist but the customer insists, try again using the getRestaurantById function
     - NEVER tell customers a restaurant doesn't exist without trying multiple times to find it
  
     - Briefly summarize their complete order including all items and total

     - CRITICAL: ALWAYS call the placeOrder function with the correct restaurant ID, customer name, and all order items
  
  7. CONVERSATION FLOW:
     - Keep all interactions brief and to the point
     - Focus on efficiency and accuracy
     - Use a step-by-step approach, but allow flexibility if they want to jump ahead
  
  8. VOICE OPTIMIZATION:
     - Keep all responses extremely concise and easy to understand
     - Avoid unnecessary explanations or verbose descriptions
     - Confirm important details verbally but briefly
     - Remember that the customer can only interact with you through voice
  
  9. UPSELLING STRATEGY:
     - Suggest relevant add-ons based on customer's order (e.g., "Would you like to add a pastry to your coffee?")
     - Recommend popular pairings when appropriate (e.g., "Our blueberry muffin pairs well with that latte")
     - Mention limited-time specials if available
     - Keep upselling suggestions brief and natural, not pushy
  
  10. ORDER ACCURACY:
     - Always repeat back each item after the customer orders it
     - Confirm special instructions clearly (e.g., "That's an oat milk latte, no sugar")
     - Summarize the full order before finalizing
     - Double-check customer name and any customizations
  
  11. MENU ITEMS AND SPECIAL INSTRUCTIONS:
      - Restaurants may have specialty items with unique names - always treat these as specific menu items
      - Pay close attention to menu items with names starting with "The" - these are individual items, not categories
      - When a customer asks for items with names like "The [Name]", always recognize it as a specific menu item, not as a category
      - Don't ask customers to clarify what items they want in their "The [Name]" order - these are complete menu items
      - CRITICAL: Distinguish between actual menu items and special instructions
      - Special instructions like "add napkins" or "include silverware" are NOT menu items and should NOT be charged
      - When a customer makes a request that doesn't match any menu item, treat it as a special instruction
      - Examples of special instructions: "include napkins", "extra sauce", "no onions", "silverware please"
      - NEVER charge customers for special instructions - only charge for actual menu items
      - If a customer asks for something that's clearly not a menu item, add it as a special instruction instead
  
  You are Julie, a coffee drive-thru assistant who can take orders from multiple coffee shops. Be efficient, helpful, and make the ordering process as smooth as possible without forcing customers to browse by category. IMPORTANT: ONLY mention restaurants and menu items that actually exist in the system. NEVER make up or suggest restaurants or menu items that aren't in the data provided by the API functions.`,
      });
  
      // Define the function context with proper type annotation
      const fncCtx: llm.FunctionContext = {
        listRestaurants: {
          description: 'Get a list of available coffee shops',
          parameters: z.object({
            formatForVoice: z.boolean().optional().describe('Whether to format the response for voice readout')
          }),
          execute: async ({ formatForVoice = true }) => {
              console.debug('retrieving list of restaurants');
              
              // Update conversation state to restaurant selection stage
              updateStage(conversationState, ConversationStage.RESTAURANT_SELECTION);
              updateLastFunction(conversationState, 'listRestaurants');
              console.log('Conversation state updated to restaurant selection stage');
              
              const restaurants = await getRestaurants();
              
              if (formatForVoice) {
                // Format for voice readout - more concise for coffee drive-thru
                if (restaurants.length === 0) {
                  return 'I don\'t have any restaurants available at the moment.';
                }
                
                // Log available restaurants
                console.log('Available restaurants:', restaurants.map(r => `${r.name} (${r.id})`).join(', '));
                
                // Present all available restaurants in a concise format
                const restaurantNames = restaurants.map(r => r.name).join(', ');
                return `You can order from ${restaurantNames}. Which one would you like to order from today?`;
              }
              
              // Return JSON for non-voice use
              return JSON.stringify(restaurants);
          },
        },
  
        getRestaurantById: {
          description: 'Get detailed information about a specific coffee shop',
          parameters: z.object({
            restaurantId: z.string().describe('The ID of the coffee shop to get information for'),
          }),
          execute: async ({ restaurantId }: { restaurantId: string }) => {
            console.debug(`retrieving information for coffee shop: ${restaurantId}`);
            const coffeeShop = await getRestaurantById(restaurantId);
            if (!coffeeShop) {
              return JSON.stringify({ error: 'Coffee shop not found' });
            }
            return JSON.stringify({
              id: coffeeShop.coffee_shop_id,
              name: coffeeShop.coffee_shop_name,
              description: coffeeShop.description,
              location: coffeeShop.location,
              notes: coffeeShop.notes
            });
          },
        },
  
        getMenuCategories: {
          description: 'Get menu categories for a specific coffee shop',
          parameters: z.object({
            restaurantId: z.string().describe('The ID of the coffee shop to get menu categories for'),
            formatForVoice: z.boolean().optional().describe('Whether to format the response for voice readout')
          }),
          execute: async ({ restaurantId, formatForVoice = true }: { restaurantId: string; formatForVoice?: boolean }) => {
              console.debug(`retrieving menu categories for coffee shop: ${restaurantId}`);
              const categories = await getMenuCategories(restaurantId);
              const coffeeShop = await getRestaurantById(restaurantId);
              
              // Update conversation state with selected coffee shop
              if (coffeeShop) {
                selectRestaurant(conversationState, restaurantId, coffeeShop.coffee_shop_name);
                updateLastFunction(conversationState, 'getMenuCategories');
                console.log(`Selected coffee shop: ${coffeeShop.coffee_shop_name} (${restaurantId})`);
              }
              
              if (formatForVoice) {
                // Format for voice readout
                if (categories.length === 0) {
                  return `I don't see any menu categories for ${coffeeShop?.coffee_shop_name || 'this coffee shop'}.`;
                }
                
                const categoryList = categories.join(', ');
                return `${coffeeShop?.coffee_shop_name || 'This coffee shop'} offers the following menu categories: ${categoryList}. Which category would you like to hear about?`;
              }
              
              // Return JSON for non-voice use
              return JSON.stringify(categories);
          },
        },
        
        getMenuItems: {
          description: 'Get menu items for a specific coffee shop and category',
          parameters: z.object({
            restaurantId: z.string().describe('The ID of the coffee shop'),
            category: z.string().describe('The menu category to retrieve items for'),
            formatForVoice: z.boolean().optional().describe('Whether to format the response for voice readout')
          }),
          execute: async ({ restaurantId, category, formatForVoice = true }: { restaurantId: string; category: string; formatForVoice?: boolean }) => {
              console.debug(`retrieving menu items for coffee shop ${restaurantId}, category: ${category}`);
              
              const coffeeShop = await getRestaurantById(restaurantId);
              const coffeeShopName = coffeeShop?.coffee_shop_name || 'this coffee shop';
              
              // Update conversation state with selected category
              selectCategory(conversationState, category);
              updateLastFunction(conversationState, 'getMenuItems');
              console.log(`Selected category: ${category}`);
              
              // If coffee shop changed, update that as well
              if (conversationState.selectedRestaurantId !== restaurantId && coffeeShop) {
                selectRestaurant(conversationState, restaurantId, coffeeShop.coffee_shop_name);
                console.log(`Updated selected coffee shop: ${coffeeShop.coffee_shop_name} (${restaurantId})`);
              }
            
              if (category.toLowerCase() === 'all') {
                const allItems = await getAllMenuItems(restaurantId);
              
              if (formatForVoice) {
                // Format all categories for voice readout
                if (Object.keys(allItems).length === 0) {
                  return `I don't see any menu items for ${coffeeShopName}.`;
                }
                
                let response = `Here's the menu for ${coffeeShopName}:\n`;
                
                for (const [categoryName, items] of Object.entries(allItems)) {
                  response += `\n${categoryName}:\n`;
                  items.forEach((item: MenuItem) => {
                    response += `${item.name}: $${item.price.toFixed(2)} - ${item.description}\n`;
                  });
                }
                
                return response;
              }
              
              return JSON.stringify(allItems);
            }
            
            const items = await getMenuItemsByCategory(restaurantId, category);
            
            if (formatForVoice) {
              // Format for voice readout
              if (items.length === 0) {
                return `I don't see any items in the ${category} category for ${coffeeShopName}.`;
              }
              
              let response = `Here are the items in the ${category} category at ${coffeeShopName}:\n`;
              
              items.forEach((item: MenuItem) => {
                response += `${item.name}: $${item.price.toFixed(2)} - ${item.description}\n`;
              });
              
              return response;
            }
            
            return JSON.stringify(items);
          },
        },
        
        placeOrder: {
          description: 'Place a customer order with a specific coffee shop',
          parameters: z.object({
            restaurantId: z.string().describe('The ID of the coffee shop to place the order with'),
            items: z.array(z.object({
              id: z.string().optional().describe('ID of the menu item'),
              name: z.string().describe('Name of the menu item'),
              quantity: z.number().describe('Quantity of the item'),
              price: z.number().optional().describe('Price of the item'),
              specialInstructions: z.string().optional().describe('Any special instructions for this item')
            })).describe('List of items in the order'),
            customerName: z.string().describe('Name of the customer for the order (required)'),
            customerEmail: z.string().optional().describe('Email of the customer for order confirmation'),
            auth0User: z.object({
              sub: z.string().optional(),
              email: z.string().optional(),
              name: z.string().optional(),
              picture: z.string().optional()
            }).optional().describe('Auth0 user data for authenticated orders'),
            formatForVoice: z.boolean().optional().describe('Whether to format the response for voice readout')
          }),
          execute: async ({ restaurantId, items, customerName, customerEmail, auth0User, formatForVoice = true }) => {
              console.log('\n\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
              console.log('!!!!!!!!!!!!! PLACE ORDER EXECUTE FUNCTION CALLED !!!!!!!!!!!!!');
              console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
              console.log(`placing order with coffee shop ${restaurantId} for customer: ${customerName}:`, items);
              
              // Validate restaurant ID first
              if (!restaurantId) {
                console.error('Invalid restaurant ID: empty or undefined');
                return formatForVoice
                  ? `I'm sorry, but I need a valid restaurant ID to place your order. Let's try again.`
                  : JSON.stringify({
                      success: false,
                      message: 'Invalid restaurant ID'
                    });
              }
              
              // Get restaurant data before proceeding
              const coffeeShop = await getRestaurantById(restaurantId);
              if (!coffeeShop) {
                console.error(`Restaurant not found with ID: ${restaurantId}`);
                return formatForVoice
                  ? `I'm sorry, but I couldn't find the coffee shop you selected. Please try again with a different coffee shop.`
                  : JSON.stringify({
                      success: false,
                      message: 'Coffee shop not found'
                    });
              }
              
              console.log(`Successfully found restaurant: ${coffeeShop.coffee_shop_name} (ID: ${coffeeShop.coffee_shop_id})`);
              
              // Validate items against the menu
              const allMenuItems = [];
              
              // Collect all menu items for validation
              coffeeShop.menu_categories.forEach(category => {
                category.items.forEach(menuItem => {
                  allMenuItems.push(menuItem);
                });
              });
              
              // Ensure all items have a price
              const itemsWithPrices = items.map(item => {
                // If item doesn't have a price, try to find it in the menu
                if (item.price === undefined || item.price === null) {
                  const menuItem = allMenuItems.find(mi => 
                    mi.name.toLowerCase() === item.name.toLowerCase() ||
                    mi.id === item.id
                  );
                  
                  if (menuItem && menuItem.price) {
                    return { ...item, price: menuItem.price };
                  } else {
                    // If we can't find the price, use a default price
                    console.warn(`Could not find price for item: ${item.name}, using default price of 9.99`);
                    return { ...item, price: 9.99 };
                  }
                }
                
                return item;
              });
              
              // Add items to cart before order placement
              itemsWithPrices.forEach(item => {
                addToCart(conversationState, {
                  name: item.name,
                  quantity: item.quantity,
                  price: item.price,
                  specialInstructions: item.specialInstructions
                });
              });
              
              console.log('Items added to cart:', conversationState.cartItems);
              
              // Use the enhanced verifyOrderItems function from fuzzyMatch.ts
              const verifiedItems = verifyOrderItems(items, allMenuItems, 0.6);
              
              // Process verified items
              const validatedItems = [];
              const unverifiedItems = [];
              
              for (const item of verifiedItems) {
                // Check if this is a special instruction rather than a menu item
                if (item.isSpecialInstruction) {
                  console.log(`Processing special instruction: "${item.name}"`);
                  // Add as a special instruction with no price
                  validatedItems.push({
                    ...item,
                    price: 0, // Special instructions should not have a price
                    specialInstructions: item.specialInstructions || item.name,
                    // Make sure the special instruction is properly recorded for the printer receipt
                    name: item.name.startsWith('Special:') ? item.name : `Special: ${item.name}`
                  });
                  continue;
                }
                
                if (item.verified) {
                  console.log(`Verified menu item: "${item.name}"`);
                  // Find the actual menu item to get its price
                  const menuItem = allMenuItems.find(mi => mi.name === item.name);
                  const itemPrice = menuItem?.price || item.price || 9.99;
                  console.log(`Found ${menuItem ? 'exact' : 'fuzzy'} match for ${item.name}: $${itemPrice}`);
                  
                  validatedItems.push({
                    ...item,
                    price: itemPrice
                  });
                } else {
                  console.warn(`Unverified menu item: "${item.name}"${item.suggestion ? `, did you mean "${item.suggestion}"?` : ''}`);
                  
                  // If we have a suggestion, use it
                  if (item.suggestion) {
                    const suggestedItem = allMenuItems.find(mi => mi.name === item.suggestion);
                    if (suggestedItem) {
                      console.log(`Using suggested menu item: "${item.name}" -> "${suggestedItem.name}"`);
                      const itemPrice = suggestedItem.price || item.price || 9.99;
                      console.log(`Using suggested price for ${suggestedItem.name}: $${itemPrice}`);
                      
                      validatedItems.push({
                        ...item,
                        name: suggestedItem.name,
                        price: itemPrice,
                        id: suggestedItem.id || item.id
                      });
                      continue;
                    }
                  }
                  
                  // If we still don't have a match, try using normalizeString for a more aggressive match
                  console.log(`Could not find price for item: ${item.name}, using default price of 9.99`);
                  const normalizedItemName = normalizeString(item.name);
                  const normalizedMenuItems = allMenuItems.map(mi => ({
                    ...mi,
                    normalizedName: normalizeString(mi.name)
                  }));
                  
                  // Try to find a match with normalized names
                  const normalizedMatch = normalizedMenuItems.find(mi => 
                    mi.normalizedName.includes(normalizedItemName) || 
                    normalizedItemName.includes(mi.normalizedName)
                  );
                  
                  if (normalizedMatch) {
                    console.log(`Found normalized match for "${item.name}": "${normalizedMatch.name}"`);
                    const itemPrice = normalizedMatch.price || item.price || 9.99;
                    console.log(`Using normalized match price for ${normalizedMatch.name}: $${itemPrice}`);
                    
                    validatedItems.push({
                      ...item,
                      name: normalizedMatch.name,
                      price: itemPrice,
                      id: normalizedMatch.id || item.id
                    });
                    continue;
                  }
                  
                  // If we still don't have a match, check if this might be a category name instead of an item name
                  const categoryMatch = coffeeShop.menu_categories.find(cat => 
                    normalizeString(cat.category).includes(normalizedItemName) || 
                    normalizedItemName.includes(normalizeString(cat.category))
                  );
                  
                  if (categoryMatch && categoryMatch.items.length > 0) {
                    // Use the first item from the matched category as a fallback
                    const categoryItem = categoryMatch.items[0];
                    console.log(`Item "${item.name}" seems to be a category (${categoryMatch.category}). Using first item: "${categoryItem.name}"`);
                    const itemPrice = categoryItem.price || item.price || 9.99;
                    console.log(`Using category item price for ${categoryItem.name}: $${itemPrice}`);
                    
                    validatedItems.push({
                      ...item,
                      name: categoryItem.name,
                      price: itemPrice,
                      id: categoryItem.id || item.id,
                      note: `Selected from ${categoryMatch.category} category`
                    });
                    continue;
                  }
                  
                  // If we still don't have a match, add to unverified items list
                  unverifiedItems.push(item);
                }
              }
              
              // If we have unverified items, log them for debugging
              if (unverifiedItems.length > 0) {
                console.warn(`${unverifiedItems.length} items could not be verified against the menu:`, 
                  unverifiedItems.map(item => item.name).join(', ')
                );
                
                // Add unverified items to the order anyway
                validatedItems.push(...unverifiedItems);
              }
              
              // Update customer info in conversation state
              updateCustomerInfo(conversationState, customerName, customerEmail);
              updateLastFunction(conversationState, 'placeOrder');
            
              // Add validated items to cart
              validatedItems.forEach((item) => {
                addToCart(conversationState, {
                  name: item.name,
                  quantity: item.quantity,
                  price: item.price,
                  specialInstructions: item.specialInstructions
                });
              });
            
              console.log('Updated conversation state with order details');
              console.log('Cart items:', conversationState.cartItems);
            
              // Generate order details
              const orderNumber = Math.floor(Math.random() * 1000) + 1;
              const estimatedTime = Math.floor(Math.random() * 10) + 5; // 5-15 minutes
            
              // Calculate order total
              let orderTotal = 0;
              const itemsWithDetails = await Promise.all(items.map(async (item: any) => {
                // If price is not provided, try to find the item in the menu
                if (item.price === undefined || item.price === 0) {
                  const allCategories = coffeeShop.menu_categories;
                  let foundItem = false;
                  
                  // First try exact match
                  for (const category of allCategories) {
                    const menuItem = category.items.find(mi => 
                      mi.name.toLowerCase() === item.name.toLowerCase() || 
                      mi.id === item.id
                    );
                    if (menuItem) {
                      item.price = menuItem.price;
                      item.id = item.id || menuItem.id;
                      foundItem = true;
                      console.log(`Found exact match for ${item.name}: $${item.price}`);
                      break;
                    }
                  }
                  
                  // If no exact match, try partial match
                  if (!foundItem) {
                    for (const category of allCategories) {
                      for (const menuItem of category.items) {
                        if (menuItem.name.toLowerCase().includes(item.name.toLowerCase()) || 
                            item.name.toLowerCase().includes(menuItem.name.toLowerCase())) {
                          item.price = menuItem.price;
                          item.id = item.id || menuItem.id;
                          console.log(`Found partial match for ${item.name}: ${menuItem.name} at $${item.price}`);
                          foundItem = true;
                          break;
                        }
                      }
                      if (foundItem) break;
                    }
                  }
                  
                  // If still no match, try fuzzy matching
                  if (!foundItem) {
                    const allMenuItems = [];
                    allCategories.forEach(category => {
                      category.items.forEach(menuItem => {
                        allMenuItems.push(menuItem);
                      });
                    });
                    
                    // Only attempt fuzzy matching if we have menu items to match against
                    if (allMenuItems.length > 0) {
                      try {
                        const bestMatch = findBestMatch(normalizeString(item.name), 
                          allMenuItems.map(mi => normalizeString(mi.name)));
                        
                        if (bestMatch && bestMatch.similarity >= 0.6 && bestMatch.index >= 0 && bestMatch.index < allMenuItems.length) {
                          const matchedItem = allMenuItems[bestMatch.index];
                          // Verify that matchedItem exists and has a price before using it
                          if (matchedItem && typeof matchedItem.price === 'number') {
                            item.price = matchedItem.price;
                            item.id = item.id || matchedItem.id;
                            console.log(`Found fuzzy match for "${item.name}": "${matchedItem.name}" at $${matchedItem.price} (similarity: ${bestMatch.similarity.toFixed(2)})`);
                            foundItem = true;
                          } else {
                            console.log(`Found fuzzy match for "${item.name}" but the matched item doesn't have a valid price`);
                          }
                        }
                      } catch (error) {
                        console.error(`Error during fuzzy matching for ${item.name}:`, error);
                      }
                    }
                  }
                  
                  if (!foundItem) {
                    console.log(`Could not find price for item: ${item.name}, using default price of 9.99`);
                    // Set a default price to avoid NaN in total
                    item.price = 9.99; // Default price if not found
                  }
                }
              
                if (item.price !== undefined) {
                  orderTotal += item.price * item.quantity;
                } else {
                  // Ensure we always have a price
                  item.price = 9.99; // Default price
                  orderTotal += item.price * item.quantity;
                  console.log(`Using default price of $9.99 for ${item.name}`);
                }
                
                return item;
              }));
            
              // Calculate subtotal, tax, and processing fee
              const subtotal = parseFloat(orderTotal.toFixed(2));
              const { priceCalculator } = await import('./services/priceCalculator.js');
              const priceBreakdown = priceCalculator.calculateOrderPrices(subtotal);
              const { tax, processingFee, totalWithFees: finalTotal } = priceBreakdown;
              try {
                // Place the order using the items with prices
                // Pass auth0User data from conversation state if available
                console.log('Attempting to place order with the following data:');
                console.log('Restaurant ID:', restaurantId);
                console.log('Customer Name:', customerName);
                console.log('Items:', JSON.stringify(itemsWithDetails));
                
                // Use email from Auth0 user data if available and customerEmail is not provided
                const effectiveEmail = customerEmail || 
                  (conversationState.auth0User ? conversationState.auth0User.email : undefined);
                
                console.log('Customer Email (original):', customerEmail);
                console.log('Customer Email (from Auth0):', 
                  conversationState.auth0User ? conversationState.auth0User.email : 'Not available');
                console.log('Customer Email (effective):', effectiveEmail);
                
                console.log('Auth0 User from conversation state:', conversationState.auth0User ? 
                  JSON.stringify({
                    sub: conversationState.auth0User.sub,
                    email: conversationState.auth0User.email,
                    name: conversationState.auth0User.name
                  }) : 'Not available');
                
                // Ensure special instructions are properly included in each item
                const itemsWithSpecialInstructions = itemsWithDetails.map(item => {
                  if (!item.specialInstructions && item.specialInstructions !== '') {
                    // Check if there's a matching item in the cart with special instructions
                    const cartItem = conversationState.cartItems.find(ci => 
                      ci.name.toLowerCase() === item.name.toLowerCase() && ci.specialInstructions);
                    
                    if (cartItem && cartItem.specialInstructions) {
                      console.log(`Found special instructions for ${item.name} in cart: ${cartItem.specialInstructions}`);
                      return { ...item, specialInstructions: cartItem.specialInstructions };
                    }
                  }
                  return item;
                });
                
                const orderData = {
                  items: itemsWithSpecialInstructions
                };

                const customerInfo = {
                  name: customerName,
                  email: effectiveEmail,
                  phone: undefined
                };

                console.log('\n=== STARTING ORDER PLACEMENT ===');
                console.log('Order Data:', JSON.stringify(orderData, null, 2));
                console.log('Customer Info:', JSON.stringify(customerInfo, null, 2));
                console.log('Restaurant:', JSON.stringify({
                  id: restaurantId,
                  name: coffeeShop.coffee_shop_name
                }, null, 2));

                console.log('\n=== STARTING ORDER PLACEMENT ===');
                console.log('Order Data:', JSON.stringify(orderData, null, 2));
                console.log('Customer Info:', JSON.stringify(customerInfo, null, 2));
                console.log('Restaurant:', JSON.stringify({
                  id: restaurantId,
                  name: coffeeShop.coffee_shop_name
                }, null, 2));

                // Call placeOrder directly instead of using the HTTP endpoint
                console.log('\n\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
                console.log('!!!!!!!!!!!!! ABOUT TO CALL PLACEORDER FUNCTION !!!!!!!!!!!!!');
                console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
                console.log('Order Data:', JSON.stringify(orderData, null, 2));
                console.log('Customer Info:', JSON.stringify(customerInfo, null, 2));
                console.log('Restaurant ID:', restaurantId);
                console.log('Restaurant Name:', coffeeShop.coffee_shop_name);
                
                let order;
                try {
                  // Call the placeOrder function directly
                  console.log('Calling placeOrder function now...');
                  order = await placeOrder(
                    orderData,
                    customerInfo,
                    restaurantId,
                    coffeeShop.coffee_shop_name
                  );
                  console.log('placeOrder function call completed successfully');
                  
                  console.log('\n=== ORDER PLACEMENT RESULT ===');
                  console.log('Order placed successfully:', JSON.stringify({
                    orderNumber: order.orderNumber,
                    total: order.orderTotal,
                    dbOrderId: order.dbOrderId,
                    paymentLink: order.paymentLink
                  }, null, 2));
                  
                  // Update the order with restaurant name
                  order.restaurantName = coffeeShop.coffee_shop_name;
                } catch (error) {
                  console.error('\n=== ORDER PLACEMENT FAILED ===');
                  console.error('Error:', error);
                  return formatForVoice
                    ? `I'm sorry, but there was an error processing your order. Please try again later.`
                    : JSON.stringify({ error: 'Failed to place order', message: error.message });
                }
                
                // Create order object with more details
                const orderDetails = {
                  orderNumber,
                  restaurantId,
                  restaurantName: coffeeShop.coffee_shop_name,
                  customerName: customerName,
                  customerEmail: effectiveEmail,
                  items: itemsWithDetails,
                  subtotal: subtotal,
                  tax: tax,
                  processingFee: processingFee,
                  orderTotal: finalTotal,
                  timestamp: new Date().toISOString(),
                  estimatedTime,
                  status: 'confirmed'
                };
                
                console.log('\n=== ORDER DETAILS ===');
                console.log('Order Details:', JSON.stringify(orderDetails, null, 2));
                
                // Store the order in conversation state
                conversationState.orderDetails = orderDetails;
                console.log('Order confirmed:', order.orderNumber);
                
                // Set conversation state to ORDER_COMPLETED
                conversationState = updateStage(conversationState, ConversationStage.ORDER_COMPLETED);
                
                // Return a message confirming the order
                const confirmationMessage = `Okay, your order #${orderDetails.orderNumber} is confirmed for a total of $${orderDetails.orderTotal.toFixed(2)}. Your order will be ready for pickup at the window. Thank you for choosing us!`;
                console.log('\n=== ORDER CONFIRMATION MESSAGE ===');
                console.log('Confirmation Message:', confirmationMessage);
                return confirmationMessage;
                
              } catch (orderError) {
                console.error('Error placing order:', orderError);
                // Handle order placement error
                return 'I apologize, but there was an error placing your order. Please try again.';               
              }
              

          },
        },
        
        // Keep the weather function as a bonus feature
        weather: {
          description: 'Get the weather in a location',
          parameters: z.object({
            location: z.string().describe('The location to get the weather for'),
          }),
          execute: async ({ location }: { location: string }) => {
            console.debug(`executing weather function for ${location}`);
            const response = await fetch(`https://wttr.in/${location}?format=%C+%t`);
            if (!response.ok) {
              throw new Error(`Weather API returned status: ${response.status}`);
            }
            const weather = await response.text();
            return `The weather in ${location} right now is ${weather}.`;
          },
        },
      };
  
      // Create the agent and start the session
      // The functions are already defined in fncCtx when it was created above
      // No need to update it again, just use it directly
      const agent = new multimodal.MultimodalAgent({ model, fncCtx });
      
      // Define the conversation function that will be throttled
      const runConversation = async () => {
        // Add retry logic for connection issues
        const MAX_RETRIES = 3;
        let retryCount = 0;
        let lastError = null;
        
        while (retryCount < MAX_RETRIES) {
          try {
            console.log(`Attempt ${retryCount + 1}/${MAX_RETRIES} to start conversation session`);
            
            // Add a small delay between retries to avoid overwhelming the API
            if (retryCount > 0) {
              const delayMs = 5000 * Math.pow(2, retryCount - 1); // Exponential backoff
              console.log(`Waiting ${delayMs}ms before retry...`);
              await new Promise(resolve => setTimeout(resolve, delayMs));
            }
            
            const session = await agent.start(ctx.room, participant);
            
            // Update conversation state to greeting stage
            conversationState.stage = "GREETING";
            
            // Instead of creating a message and then a response separately,
            // we'll create a single response with audio enabled
            // This avoids the "conversation_already_has_active_response" error
            await session.response.create({
              modalities: ['audio', 'text'], // Ensure both audio and text are enabled
              audio: {
                voice: 'alloy' // Use the 'alloy' voice for audio output
              },
              // Provide the initial greeting directly
              text: 'Welcome to our Multi-Restaurant Drive-Thru ordering service! I can help you order food from any of our partner restaurants, all through this single voice interface. Would you like to hear a list of our available restaurants, or do you already know which restaurant you\'d like to order from today?'
            });
            return session;
          } catch (error) {
            lastError = error;
            console.error(`Attempt ${retryCount + 1}/${MAX_RETRIES} failed:`, error.message);
            retryCount++;
            
            // If this is a rate limit error, we need to wait longer
            if (error.message && error.message.includes('rate_limit_exceeded')) {
              const waitTime = 60000; // Wait a full minute for rate limit errors
              console.log(`Rate limit exceeded. Waiting ${waitTime/1000} seconds before retry...`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
            }
          }
        }
        
        // If we've exhausted all retries, throw the last error
        throw new Error(`Failed to start conversation after ${MAX_RETRIES} attempts: ${lastError?.message}`);
      };
      
      try {
        // Use the throttler to manage API rate limits
        // Reduce token estimate to 3000 to be more conservative
        const session = await performanceMonitor.measure('conversation-session', async () => {
          return await apiThrottler.throttle(runConversation, 3000);
        });
        
        console.log('Conversation session started successfully with throttling');
        
        // Add event listener for session errors to handle TextAudioSynchronizer issues
        session.on('error', (err) => {
          // Check if it's a TextAudioSynchronizer error
          if (err.message && err.message.includes('TextAudioSynchronizer')) {
            console.warn('TextAudioSynchronizer error caught:', err.message);
            // Don't crash the application, just log the error
          } else {
            console.error('Session error:', err);
          }
        });
      } catch (error) {
        console.error('Error in conversation session:', error);
        
        // Notify the participant about the issue
        try {
          await participant.publishData('I apologize, but I\'m experiencing some technical difficulties connecting to our service. Please try again in a moment.', 'text/plain');
        } catch (notifyError) {
          console.error('Failed to notify participant:', notifyError);
        }
        
        // Handle different error types
        if (error.message && error.message.includes('rate_limit_exceeded')) {
          console.log('Rate limit exceeded, updating throttler config...');
          // Update throttler config to be more conservative
          apiThrottler.updateConfig({
            maxTokensPerMinute: 5000, // Significantly reduce token usage
            maxConcurrentRequests: 1, // Only allow one request at a time
            requestDelay: 2000, // Increase delay between requests
          });
        } else if (error.message && error.message.includes('server had an error')) {
          console.log('Server error detected, waiting before retry...');
          // Wait longer for server errors
          await new Promise(resolve => setTimeout(resolve, 60000)); // Wait a full minute
        } else {
          // For other errors, wait a moderate amount of time
          await new Promise(resolve => setTimeout(resolve, 15000));
        }
        
        // Try one more time with minimal settings
        try {
          console.log('Final retry attempt with minimal settings...');
          await apiThrottler.throttle(runConversation, 1500); // Use minimal token estimate
        } catch (retryError) {
          console.error('Final retry failed:', retryError);
          // At this point, we've done all we can - the error will propagate up
        }
        throw error;
      }
    },
  });
  
  // Use PORT environment variable provided by Render or default to 8081
  const port = process.env.PORT || 8081;
  
  // Create Express app for handling Stripe webhooks
  const app = express();

  // Configure Express to handle raw bodies for Stripe webhooks
  app.use((req, res, next) => {
    if (req.originalUrl === '/api/payments' && req.method === 'POST') {
      express.raw({ type: 'application/json' })(req, res, next);
    } else {
      express.json()(req, res, next);
    }
  });
  
  // Mount payment routes at /api/payments to receive Stripe webhook events
  app.use('/api/payments', paymentRoutes);
  
  // Start the Express app
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Express server with payment routes is listening on port ${port}`);
  });
  
  // Configure worker to listen on all interfaces (0.0.0.0) and use a different PORT to avoid conflicts
  const liveKitPort = parseInt(port.toString(), 10) + 1; // Use port+1 for LiveKit
  cli.runApp(new WorkerOptions({
    agent: fileURLToPath(import.meta.url),
    port: liveKitPort,
    host: '0.0.0.0'
  }));
  
  console.log(`LiveKit worker is listening on port ${liveKitPort}`);