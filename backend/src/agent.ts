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
import express, { type Request } from 'express';
import fetch from 'node-fetch';
import getRawBody from 'raw-body';
import type { IncomingMessage } from 'http';
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
  
  // Import chat collection services
  import { chatCollector } from './services/chatCollector.js';

  
  // Import fuzzy matching utilities
  import { findBestMatch, findAllMatches, verifyOrderItems, normalizeString } from './utils/fuzzyMatch.js';
  

  
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.join(__dirname, '../.env.local');
  dotenv.config({ path: envPath });
  
  // Global flag to prevent multiple server starts
  declare global {
    var serversInitialized: boolean | undefined;
  }

export default defineAgent({
    entry: async (ctx: JobContext) => {
      await ctx.connect();
      console.log('waiting for participant');
      const participant = await ctx.waitForParticipant();
      console.log(`starting assistant example agent for ${participant.identity}`);
      
      // Start chat tracking for this participant
      chatCollector.startChatSession(participant.identity);
      
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
      
      // Update chat collector with initial conversation state
      chatCollector.updateConversationState(participant.identity, conversationState);
      
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
        instructions: `You are Julie, a friendly AI drive-thru assistant for Niro's Gyros. Your primary goal is to help customers place Greek and Mediterranean food orders through voice interaction only. CRITICAL: You must ONLY reference menu items that actually exist in the Niro's Gyros menu data. NEVER make up or assume menu items exist.

  CRITICAL PAYMENT FLOW:
  - When a customer confirms their order, you MUST call the placeOrder function
  - The placeOrder function will automatically tell them about the payment button
  - NEVER complete an order without calling placeOrder - this is how customers pay
  - The payment instructions are built into the placeOrder function response
        
  IMPORTANT GUIDELINES FOR DRIVE-THRU:
  
  1. Always speak naturally and conversationally, but KEEP ALL RESPONSES CONCISE.

  2. MENU ACCURACY (CRITICAL):
     - NEVER mention menu items unless you have verified they exist using the getMenuItems or getAllMenuItems functions
     - If a customer asks about specific items (like chicken items, burgers, sandwiches, etc.), ALWAYS call getMenuItems or getAllMenuItems first to check what's actually available
     - NEVER say items like "Chicken Gyro", "Chicken Souvlaki Platter", or "Chicken Salad" exist - these are NOT on our menu
     - Our actual chicken items include: Chicken Strips Salad, 6 Piece Chicken Wings, Chicken Breast Sandwich, Chicken Strips, Chicken Philly Sandwich, Grilled Chicken Pita Sandwich, Chicken Parmesan Sandwich, and Kid's Chicken Strips Meal
     - When asked about menu categories or items, use the getMenuCategories and getMenuItems functions to provide accurate information
     - If you're unsure about any menu item, call getAllMenuItems to verify before responding
     - CRITICAL: When a customer asks "What burgers do you have?" or "Do you have burgers?", you MUST call getMenuItems with category "Beef Patties" or getAllMenuItems to check for burger items before responding
     - NEVER say "we don't have burgers" without first checking the menu data

  3. GREETING (First Step):
     - Begin with a brief, friendly greeting like "Hi".
     - Immediately ask "How can I help you today?"
     - DO NOT ask which restaurant they want to order from - you are exclusively for Niro's Gyros
     - If the customer asks about other restaurants, politely inform them that you can only take orders for Niro's Gyros
  
  4. ORDER TAKING (Second Step):
     - Let the customer order directly by item name
     - Always treat items with names like "The [Name]" as specific menu items, not as categories
     - If a customer says "I want the [item name]" or any variation, add it to their order as a menu item
     - EXAMPLE: If customer says "I want the [item name]", respond with "Adding one [item name]. Would you like anything else?"
     - NEVER say "What would you like to order from The [item name]?" - this is incorrect
     - ONLY mention menu items that actually exist in Niro's Gyros menu
     - NEVER make up or suggest menu items that are not in the actual menu data
     - Keep a running total of their order
     - Ask for the customer's name before completing the order if not already provided
  
  5. ORDER CUSTOMIZATION:
     - Ask about any available customizations for the items ordered
     - Confirm each item before moving to the next
     - Allow customers to order multiple items from different categories
     - Keep a running total of their order

  6. ORDER CONFIRMATION (Final Step):
     - ALWAYS ask for the customer's name if not already provided
     - Summarize the complete order with all items, quantities, and the total price
     - Ask the customer to confirm if everything is correct
     - CRITICAL: When the customer confirms their order (says "yes", "correct", "that's right", etc.), you MUST IMMEDIATELY call the placeOrder function with all order details
     - DO NOT say "Thanks for confirming your order!" or any completion message UNTIL AFTER you have called the placeOrder function
     - The placeOrder function will return a confirmation message that includes payment instructions
     - NEVER skip calling the placeOrder function when an order is confirmed - this is MANDATORY
     - If they want changes, go back to the appropriate step

  7. ORDER COMPLETION (Final Step):
     - After successfully calling placeOrder, the function will automatically provide payment instructions
     - The customer will be told about the payment button and pickup instructions
     - DO NOT add additional completion messages after placeOrder is called
     - The placeOrder function handles all final messaging
  
  8. CONVERSATION FLOW:
     - Keep all interactions brief and to the point
     - Focus on efficiency and accuracy
     - Use a step-by-step approach, but allow flexibility if they want to jump ahead
     - DO NOT repeat order details unnecessarily
     - After confirming an item, simply ask "Would you like anything else?"
  
  9. VOICE OPTIMIZATION:
     - Keep all responses extremely concise and easy to understand
     - Avoid unnecessary explanations or verbose descriptions
     - Confirm important details verbally but briefly
     - Remember that the customer can only interact with you through voice
  
  10. UPSELLING STRATEGY:
     - Suggest relevant add-ons based on customer's order (e.g., "Would you like to add fries to your gyro?")
     - Recommend popular pairings when appropriate (e.g., "Our Greek salad pairs well with that gyro")
     - Mention limited-time specials if available
     - Keep upselling suggestions brief and natural, not pushy
  
  11. ORDER ACCURACY:
     - Always repeat back each item after the customer orders it
     - Confirm special instructions clearly
     - Summarize the full order before finalizing
     - Double-check customer name and any customizations
  
  12. DRINK PREFERENCES:
     - CRITICAL: When a customer orders an item that comes with a drink (e.g., meal combos), ALWAYS ask for their drink preference
     - IMPORTANT: Always reference the actual drinks available in the menu's "Drinks" category
     - Available drinks include all items listed in the Drinks category such as: Pepsi, Diet Pepsi, Mountain Dew, Starry, Lemonade, Fruit Punch, Root Beer, Crush Orange, Dr. Pepper, Ice Tea (Sweetened/Unsweetened), Iced Tea Raspberry, and Soft Drinks
     - If the customer doesn't specify a drink preference, ask "What would you like to drink with that?"
     - If the customer declines a drink, confirm by saying "No drink, just the [item name]?"
     - Add the drink preference as a special instruction to the item (e.g., "Drink: Pepsi")
     - NEVER say a drink is not available if it's listed in the menu - always check the actual menu data first
     - Example flow:
       * Customer: "I'll have a Gyro, Fries and Drink combo"
       * Assistant: "What would you like to drink with that?"
       * Customer: "Pepsi"
       * Assistant: "Adding one Gyro, Fries and Drink combo with Pepsi. Would you like anything else?"
     - If the customer orders a meal combo and doesn't specify a drink, DO NOT proceed until you've asked about their drink preference

  13. MENU AVAILABILITY VERIFICATION:
     - CRITICAL: Before telling a customer that any item is not available, you MUST first check the actual menu data
     - Use the getMenuItems function to verify what items are actually available in each category
     - NEVER assume an item doesn't exist based on memory or previous responses
     - If a customer asks for a specific item (like "Pepsi"), always check the Drinks category first
     - If a customer asks about burgers, ALWAYS call getMenuItems with category "Beef Patties" to check what burger options are available
     - Only say an item is unavailable AFTER you have confirmed it's not in the menu data
     - If you find the item in the menu, immediately correct yourself and offer it to the customer
     - Example: If you initially say "We don't have Pepsi" but then find it in the menu, say "Actually, I apologize - we do have Pepsi available for $1.99. Would you like to add that to your order?"
     - MANDATORY: When customers ask about specific food categories (burgers, chicken, sandwiches, etc.), you MUST call the appropriate getMenuItems function before responding
   
  14. MENU ITEMS AND SPECIAL INSTRUCTIONS:
     - Pay close attention to menu items with unique names
     - When a customer asks for items with names like "The [Name]", always recognize it as a specific menu item
     - Don't ask customers to clarify what items they want in their order - these are complete menu items
     - CRITICAL: Distinguish between actual menu items and special instructions
     - Special instructions like "add napkins" or "include silverware" are NOT menu items and should NOT be charged
     - When a customer makes a request that doesn't match any menu item, treat it as a special instruction
     - Examples of special instructions: "include napkins", "extra sauce", "no onions", "silverware please"
     - NEVER charge customers for special instructions - only charge for actual menu items
     - If a customer asks for something that's clearly not a menu item, add it as a special instruction instead
     - IMPORTANT: When a customer orders an item with modifications (e.g., "Single Gyro without tomatoes"), 
       add the modification as a special instruction to that specific item
     - Common modifications to recognize and add as special instructions:
       * "without [ingredient]" (e.g., "without tomatoes", "without onions")
       * "extra [ingredient]" (e.g., "extra sauce", "extra meat")
       * "light [ingredient]" (e.g., "light sauce")
       * "no [ingredient]" (e.g., "no onions", "no tomatoes")
     - When a customer orders an item with modifications, confirm the item and its modifications before moving on
     - Example: If customer says "I'll have a Single Gyro without tomatoes", respond with "Adding one Single Gyro without tomatoes. Would you like anything else?"`,
      });
  
      // Define the function context with proper type annotation
      const fncCtx: llm.FunctionContext = {
        listRestaurants: {
          description: 'Get a list of available restaurants',
          parameters: z.object({
            formatForVoice: z.boolean().optional().describe('Whether to format the response for voice readout')
          }),
          execute: async ({ formatForVoice = true }) => {
              console.debug('retrieving list of restaurants - defaulting to Niros Gyros');
              
              // Always return Niros Gyros
              const nirosGyros = await getRestaurantById('niros_gyros');
              
              // Make sure Niros Gyros is selected in the conversation state
              selectRestaurant(conversationState, 'niros_gyros', "Niro's Gyros");
              updateLastFunction(conversationState, 'listRestaurants');
              console.log('Conversation state updated with Niros Gyros');
              
              if (formatForVoice) {
                // Always direct customers to order from Niros Gyros
                return "I can only take orders for Niro's Gyros. What would you like to order today?";
              }
              
              // Return JSON for non-voice use
              return JSON.stringify([nirosGyros]);
          },
        },
  
        getRestaurantById: {
          description: 'Get detailed information about Niros Gyros',
          parameters: z.object({
            restaurantId: z.string().describe('The ID of the restaurant to get information for'),
          }),
          execute: async ({ restaurantId }: { restaurantId: string }) => {
            console.debug(`retrieving information for Niros Gyros regardless of provided ID: ${restaurantId}`);
            // Always get Niros Gyros regardless of the provided ID
            const nirosGyros = await getRestaurantById('niros_gyros');
            
            // Make sure Niros Gyros is selected in the conversation state
            if (nirosGyros) {
              selectRestaurant(conversationState, 'niros_gyros', nirosGyros.coffee_shop_name);
              updateLastFunction(conversationState, 'getRestaurantById');
              console.log(`Selected restaurant: ${nirosGyros.coffee_shop_name} (niros_gyros)`);
            }
            
            if (!nirosGyros) {
              return JSON.stringify({ error: 'Niros Gyros information not found' });
            }
            
            return JSON.stringify({
              id: nirosGyros.coffee_shop_id,
              name: nirosGyros.coffee_shop_name,
              description: nirosGyros.description,
              location: nirosGyros.location,
              notes: nirosGyros.notes
            });
          },
        },
  
        getMenuCategories: {
          description: 'Get menu categories for Niros Gyros',
          parameters: z.object({
            restaurantId: z.string().describe('The ID of the restaurant to get menu categories for (always uses Niros Gyros)'),
            formatForVoice: z.boolean().optional().describe('Whether to format the response for voice readout')
          }),
          execute: async ({ restaurantId, formatForVoice = true }: { restaurantId: string; formatForVoice?: boolean }) => {
              console.debug(`retrieving menu categories for Niros Gyros regardless of provided ID: ${restaurantId}`);
              // Always use Niros Gyros ID
              const categories = await getMenuCategories('niros_gyros');
              const nirosGyros = await getRestaurantById('niros_gyros');
              
              // Update conversation state with Niros Gyros
              if (nirosGyros) {
                selectRestaurant(conversationState, 'niros_gyros', nirosGyros.coffee_shop_name);
                updateLastFunction(conversationState, 'getMenuCategories');
                console.log(`Selected restaurant: ${nirosGyros.coffee_shop_name} (niros_gyros)`);
              }
              
              if (formatForVoice) {
                // Format for voice readout
                if (categories.length === 0) {
                  return `I don't see any menu categories for ${nirosGyros?.coffee_shop_name || 'this restaurant'}.`;
                }
                
                const categoryList = categories.join(', ');
                return `${nirosGyros?.coffee_shop_name || 'This restaurant'} offers the following menu categories: ${categoryList}. Which category would you like to hear about?`;
              }
              
              return JSON.stringify(categories);
            },
          },
          
          getMenuItems: {
            description: 'Get menu items from a specific category at Niros Gyros',
            parameters: z.object({
              restaurantId: z.string().describe('The ID of the restaurant (always uses Niros Gyros)'),
              category: z.string().describe('The menu category to get items from'),
              formatForVoice: z.boolean().optional().describe('Whether to format the response for voice readout')
            }),
            execute: async ({ restaurantId, category, formatForVoice = true }: { restaurantId: string; category: string; formatForVoice?: boolean }) => {
                console.debug(`retrieving menu items for category ${category} at Niros Gyros`);
                // Always use Niros Gyros ID
                const items = await getMenuItemsByCategory('niros_gyros', category);
                const nirosGyros = await getRestaurantById('niros_gyros');
                
                // Update conversation state
                if (nirosGyros) {
                  selectRestaurant(conversationState, 'niros_gyros', nirosGyros.coffee_shop_name);
                  selectCategory(conversationState, category);
                  updateLastFunction(conversationState, 'getMenuItems');
                  console.log(`Selected category: ${category} at ${nirosGyros.coffee_shop_name}`);
                }
                
                if (formatForVoice) {
                  // Format for voice readout
                  if (items.length === 0) {
                    return `I don't see any items in the ${category} category.`;
                  }
                  
                  let response = `Here are the items in our ${category} category:\n`;
                  
                  items.forEach((item: any) => {
                    response += `${item.name}: $${item.price.toFixed(2)} - ${item.description}\n`;
                  });
                  
                  return response;
                }
                
                return JSON.stringify(items);
              },
            },

          getAllMenuItems: {
            description: 'Get all menu items from Niros Gyros to verify what is actually available',
            parameters: z.object({
              restaurantId: z.string().describe('The ID of the restaurant (always uses Niros Gyros)'),
              formatForVoice: z.boolean().optional().describe('Whether to format the response for voice readout')
            }),
            execute: async ({ restaurantId, formatForVoice = true }: { restaurantId: string; formatForVoice?: boolean }) => {
                console.debug(`retrieving all menu items for Niros Gyros`);
                // Always use Niros Gyros ID
                const allItems = await getAllMenuItems('niros_gyros');
                const nirosGyros = await getRestaurantById('niros_gyros');
                
                // Update conversation state
                if (nirosGyros) {
                  selectRestaurant(conversationState, 'niros_gyros', nirosGyros.coffee_shop_name);
                  updateLastFunction(conversationState, 'getAllMenuItems');
                  console.log(`Retrieved all menu items for ${nirosGyros.coffee_shop_name}`);
                }
                
                if (formatForVoice) {
                  // Don't read all items aloud - that would be too long
                  return `I have access to our complete menu with ${allItems.length} items across all categories. What specific items or category would you like to know about?`;
                }
                
                return JSON.stringify(allItems);
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
          execute: async (params) => {
              const { restaurantId, items, customerName, customerEmail, auth0User, formatForVoice = true } = params;
              
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
              
              // Collect all menu items for validation
              const allMenuItems = [];
              coffeeShop.menu_categories.forEach(category => {
                category.items.forEach(menuItem => {
                  allMenuItems.push(menuItem);
                });
              });
              
              // CRITICAL: Validate ALL items against the menu BEFORE processing the order
              const invalidItems = [];
              const validatedItems = [];
              
              for (const item of items) {
                // Skip special instructions (they have price 0 or are marked as special instructions)
                if (item.price === 0 || item.name.toLowerCase().includes('special:') || 
                    item.name.toLowerCase().includes('napkins') || 
                    item.name.toLowerCase().includes('silverware') ||
                    item.name.toLowerCase().includes('extra sauce') ||
                    item.name.toLowerCase().includes('no ') ||
                    item.name.toLowerCase().includes('without ')) {
                  console.log(`Processing special instruction: "${item.name}"`);
                  validatedItems.push({
                    ...item,
                    price: 0,
                    specialInstructions: item.specialInstructions || item.name,
                    name: item.name.startsWith('Special:') ? item.name : `Special: ${item.name}`
                  });
                  continue;
                }
                
                // Try to find the item in the menu
                let foundMenuItem = null;
                
                // First try exact match by name
                foundMenuItem = allMenuItems.find(mi => 
                  mi.name.toLowerCase() === item.name.toLowerCase()
                );
                
                // If no exact match, try by ID
                if (!foundMenuItem && item.id) {
                  foundMenuItem = allMenuItems.find(mi => mi.id === item.id);
                }
                
                // If still no match, try partial match
                if (!foundMenuItem) {
                  foundMenuItem = allMenuItems.find(mi => 
                    mi.name.toLowerCase().includes(item.name.toLowerCase()) || 
                    item.name.toLowerCase().includes(mi.name.toLowerCase())
                  );
                }
                
                if (foundMenuItem) {
                  console.log(`Found menu item for "${item.name}": "${foundMenuItem.name}" at $${foundMenuItem.price}`);
                  validatedItems.push({
                    ...item,
                    name: foundMenuItem.name, // Use the exact menu item name
                    price: foundMenuItem.price,
                    id: foundMenuItem.id
                  });
                } else {
                  console.warn(`Could not find menu item: "${item.name}"`);
                  invalidItems.push(item.name);
                }
              }
              
              // If there are invalid items, reject the order and ask the customer to clarify
              if (invalidItems.length > 0) {
                console.log(`Order rejected due to invalid items: ${invalidItems.join(', ')}`);
                
                if (formatForVoice) {
                  if (invalidItems.length === 1) {
                    return `I'm sorry, but I couldn't find "${invalidItems[0]}" on our menu. Could you please check our menu and let me know what you'd like to order instead?`;
                  } else {
                    return `I'm sorry, but I couldn't find these items on our menu: ${invalidItems.join(', ')}. Could you please check our menu and let me know what you'd like to order instead?`;
                  }
                } else {
                  return JSON.stringify({
                    success: false,
                    message: 'Invalid menu items',
                    invalidItems: invalidItems
                  });
                }
              }
              
              // If all items are valid, proceed with the order
              console.log(`All ${validatedItems.length} items validated successfully`);
              
              // Add items to cart before order placement
              validatedItems.forEach(item => {
                addToCart(conversationState, {
                  name: item.name,
                  quantity: item.quantity,
                  price: item.price,
                  specialInstructions: item.specialInstructions
                });
              });
            
              console.log('Items added to cart:', conversationState.cartItems);
            
              // Update customer info in conversation state
              updateCustomerInfo(conversationState, customerName, customerEmail);
              updateLastFunction(conversationState, 'placeOrder');
            
              console.log('Updated conversation state with order details');
              console.log('Cart items:', conversationState.cartItems);
            
              // Generate order details
              const orderNumber = Math.floor(Math.random() * 1000) + 1;
              const estimatedTime = Math.floor(Math.random() * 10) + 5; // 5-15 minutes
            
              // Calculate order total using validated items
              let orderTotal = 0;
              validatedItems.forEach(item => {
                if (item.price > 0) { // Only count items with actual prices (not special instructions)
                  orderTotal += item.price * item.quantity;
                }
              });
            
              // Calculate subtotal, tax, and processing fee
              const subtotal = parseFloat(orderTotal.toFixed(2));
              const { priceCalculator } = await import('./services/priceCalculator.js');
              const priceBreakdown = priceCalculator.calculateOrderPrices(subtotal);
              const { tax, processingFee, totalWithFees: finalTotal } = priceBreakdown;
              
              try {
                // Use email from Auth0 user data if available and customerEmail is not provided
                const effectiveEmail = customerEmail || 
                  (conversationState.auth0User ? conversationState.auth0User.email : undefined);
                
                console.log('Customer Email (original):', customerEmail);
                console.log('Customer Email (from Auth0):', 
                  conversationState.auth0User ? conversationState.auth0User.email : 'Not available');
                console.log('Customer Email (effective):', effectiveEmail);
                
                // Ensure special instructions are properly included in each item
                const itemsWithSpecialInstructions = validatedItems.map(item => {
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

                // Call placeOrder function directly
                console.log('Calling placeOrder function now...');
                const order = await placeOrder(
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
                
                // Create order object with more details
                const orderDetails = {
                  orderNumber,
                  restaurantId,
                  restaurantName: coffeeShop.coffee_shop_name,
                  customerName: customerName,
                  customerEmail: effectiveEmail,
                  items: validatedItems,
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
                
                // Update chat collector with the completed order state
                chatCollector.updateConversationState(participant.identity, conversationState);
                
                // Save the chat now that the order is completed
                try {
                  console.log('Order completed, saving chat...');
                  const savedPath = await chatCollector.saveOrderChat(participant.identity, 'pending');
                  if (savedPath) {
                    console.log(`Chat saved successfully: ${savedPath}`);
                  } else {
                    console.log('No chat to save or saving failed');
                  }
                } catch (chatSaveError) {
                  console.error('Error saving chat after order completion:', chatSaveError);
                  // Don't fail the order if chat saving fails
                }
                
                // Send the payment data as a structured message first
                if (order.paymentLink) {
                  console.log('\n=== SENDING PAYMENT LINK TO FRONTEND ===');
                  
                  // Create structured payment data object
                  const paymentData = {
                    orderId: order.orderId,
                    orderNumber: order.orderNumber,
                    total: order.total,
                    paymentLink: order.paymentLink,
                    items: orderDetails.items,
                    subtotal: orderDetails.subtotal,
                    tax: orderDetails.tax,
                    processingFee: orderDetails.processingFee || 0
                  };
                  
                  // Log payment information
                  console.log({
                    message: 'Sending payment link to user',
                    paymentLink: order.paymentLink,
                    orderId: order.orderId,
                    orderNumber: order.orderNumber,
                    timestamp: new Date().toISOString()
                  });
                  
                  try {
                    console.log('Sending payment data to frontend...');
                    
                    // Send payment link with the chat topic
                    await ctx.agent.sendText(`payment_link:${order.paymentLink}`, { topic: 'lk.chat' });
                    console.log('Payment link sent successfully to lk.chat topic');
                    
                    // Send structured payment data with the chat topic
                    const paymentDataJson = JSON.stringify(paymentData);
                    await ctx.agent.sendText(`PAYMENT_DATA:${paymentDataJson}`, { topic: 'lk.chat' });
                    console.log('Full payment data sent successfully to lk.chat topic');
                    
                    // Send the user-friendly message normally (will appear in transcription)
                    await ctx.agent.sendText('Your order has been confirmed. Please use the payment button in the chat to complete your payment.');
                    console.log('Payment button direction message sent successfully');
                  } catch (error) {
                    console.error('Error sending payment data:', error);
                    
                    // If there's an error, send a fallback message
                    await ctx.agent.sendText('Your order has been confirmed. Please use the payment button in the chat to complete your payment.');
                  }
                } else {
                  console.log('\n=== NO PAYMENT LINK AVAILABLE TO SEND ===');
                }
                
                // After confirming payment status is PAID for an order
                if (order.paymentStatus === 'PAID') {
                  const paymentStatusMsg = JSON.stringify({
                    type: 'payment_status',
                    status: 'paid',
                    orderId: order.id
                  });
                  await ctx.agent.sendText(paymentStatusMsg, { topic: 'lk.chat' });
                }
                
                // Then send the confirmation message
                return `Okay, your order #${orderDetails.orderNumber} is confirmed for a total of $${orderDetails.orderTotal.toFixed(2)}. You'll see a payment button appear in our chat that you can click to complete your payment. Once payment is confirmed, your order will be sent to the kitchen and will be ready for pickup shortly after. Thank you for choosing us!`;
                
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
          
          // Add chat message tracking to the session
          session.on('user_speech_committed', (event) => {
            console.log(`[DEBUG] user_speech_committed event triggered for ${participant.identity}`);
            console.log(`[DEBUG] Event data:`, JSON.stringify(event, null, 2));
            
            if (event.item && event.item.content) {
              const content = Array.isArray(event.item.content) 
                ? event.item.content.map(c => c.text || c.transcript || '').join(' ')
                : event.item.content.text || event.item.content.transcript || '';
              
              console.log(`[DEBUG] Extracted user content: "${content}"`);
              
              if (content.trim()) {
                chatCollector.addMessage(participant.identity, 'user', content);
                // Update conversation state in chat collector
                chatCollector.updateConversationState(participant.identity, conversationState);
              }
            } else {
              console.log(`[DEBUG] No content found in user_speech_committed event`);
            }
          });

          session.on('agent_speech_committed', (event) => {
            console.log(`[DEBUG] agent_speech_committed event triggered for ${participant.identity}`);
            console.log(`[DEBUG] Event data:`, JSON.stringify(event, null, 2));
            
            if (event.item && event.item.content) {
              const content = Array.isArray(event.item.content) 
                ? event.item.content.map(c => c.text || '').join(' ')
                : event.item.content.text || '';
              
              console.log(`[DEBUG] Extracted agent content: "${content}"`);
              
              if (content.trim()) {
                chatCollector.addMessage(participant.identity, 'assistant', content);
                // Update conversation state in chat collector
                chatCollector.updateConversationState(participant.identity, conversationState);
              }
            } else {
              console.log(`[DEBUG] No content found in agent_speech_committed event`);
            }
          });

          // Also track function call responses as assistant messages
          session.on('function_call_output_added', (event) => {
            console.log(`[DEBUG] function_call_output_added event triggered for ${participant.identity}`);
            console.log(`[DEBUG] Event output: "${event.output?.substring(0, 100)}..."`);
            
            if (event.output) {
              chatCollector.addMessage(participant.identity, 'assistant', event.output);
              // Update conversation state in chat collector
              chatCollector.updateConversationState(participant.identity, conversationState);
            }
          });

          // Track when orders are completed to save the chat
          session.on('response_done', async (event) => {
            // Check if this was an order completion
            if (conversationState.stage === ConversationStage.ORDER_COMPLETED && 
                conversationState.orderDetails) {
              console.log('Order completed, saving chat...');
              try {
                const savedPath = await chatCollector.saveOrderChat(participant.identity, 'pending');
                if (savedPath) {
                  console.log(`Chat saved successfully: ${savedPath}`);
                } else {
                  console.log('No chat to save or saving failed');
                }
              } catch (error) {
                console.error('Error saving chat after order completion:', error);
              }
            }
          });
          
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

          // Add cleanup when session ends
          session.on('disconnected', async () => {
            console.log('Session disconnected, attempting to save any remaining chat...');
            try {
              await chatCollector.forceSaveChat(participant.identity);
            } catch (error) {
              console.error('Error saving chat on disconnect:', error);
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

    // Declare global flag for server initialization
    declare global {
      var serversInitialized: boolean;
    }
    global.serversInitialized = false;

    // Add monitoring utilities at the top of the file
    const monitor = {
      webhookServer: {
        status: 'initializing',
        port: null,
        startTime: null,
        lastRequest: null,
        errorCount: 0,
        requestCount: 0
      },
      liveKitWorker: {
        status: 'initializing',
        port: null,
        startTime: null,
        errorCount: 0
      },
      log: (component: string, message: string, data?: any) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [${component}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
      },
      error: (component: string, message: string, error?: any) => {
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}] [${component}] ERROR: ${message}`, error ? JSON.stringify(error, null, 2) : '');
      }
    };

    // Create Express app for webhook handling
    const app = express();

    // Add request logging middleware
    app.use((req, res, next) => {
      monitor.webhookServer.lastRequest = new Date().toISOString();
      monitor.webhookServer.requestCount++;
      monitor.log('WebhookServer', `Incoming request: ${req.method} ${req.url}`);
      next();
    });

    // Configure timeout for webhook requests
    app.use((req, res, next) => {
      // Set timeout to 30 seconds
      req.setTimeout(30000);
      res.setTimeout(30000);
      next();
    });

    // Handle raw body for webhook endpoints using express.raw()
    app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

    // Handle raw body for the root path webhook endpoint
    app.use('/', (req, res, next) => {
      // Only use raw body parser for POST requests with Stripe signature
      if (req.method === 'POST' && req.headers['stripe-signature']) {
        return express.raw({ type: 'application/json' })(req, res, next);
      }
      next();
    });

    // Add JSON parsing for non-webhook routes
    app.use((req, res, next) => {
      // Skip JSON parsing for webhook endpoints
      if (req.originalUrl === '/api/payments/webhook' || 
          (req.originalUrl === '/' && req.headers['stripe-signature'])) {
        return next();
      }
      express.json()(req, res, next);
    });

    // Mount payment routes
    app.use('/api/payments', paymentRoutes);
    monitor.log('WebhookServer', 'Mounted payment routes at /api/payments');

    // Add direct webhook handler at root path for Stripe webhooks
    app.post('/', async (req, res) => {
      monitor.log('WebhookServer', 'Received POST request at root path');
      
      // Check if this looks like a Stripe webhook
      if (req.headers['stripe-signature']) {
        monitor.log('WebhookServer', 'Processing Stripe webhook at root path');
        
        try {
          // Process the webhook using the same logic as payment routes
          console.log('>>> Webhook endpoint / hit by a POST request at', new Date().toISOString());
          console.log('>>> Request headers:', JSON.stringify(req.headers, null, 2));

          const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
          
          if (!webhookSecret) {
            monitor.error('WebhookServer', 'Webhook secret not configured');
            return res.status(500).send('Webhook Error: Server configuration error (missing webhook secret).');
          }

          const sig = req.headers['stripe-signature'];
          if (!sig) {
            monitor.error('WebhookServer', 'No Stripe signature found in request headers');
            return res.status(400).send('Webhook Error: Missing stripe-signature header.');
          }

          // Get the raw body from the request (express.raw() provides it as req.body Buffer)
          const rawBody = req.body;
          
          if (!rawBody) {
            monitor.error('WebhookServer', 'Missing request body');
            return res.status(400).json({ error: 'Missing request body' });
          }

          monitor.log('WebhookServer', 'Raw body captured', {
            bodyType: typeof rawBody,
            isBuffer: Buffer.isBuffer(rawBody),
            length: rawBody.length
          });

          // Initialize Stripe
          const Stripe = (await import('stripe')).default;
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
            apiVersion: '2025-04-30.basil' as const
          });

          // Verify the webhook signature
          let event;
          try {
            event = stripe.webhooks.constructEvent(rawBody, sig as string, webhookSecret);
            console.log('>>> Webhook event constructed successfully:', {
              type: event.type,
              id: event.id,
              created: new Date(event.created * 1000).toISOString()
            });
          } catch (err: any) {
            monitor.error('WebhookServer', 'Webhook signature verification failed', err);
            return res.status(400).send(`Webhook Error: ${err.message}`);
          }

          // Log successful verification
          monitor.log('WebhookServer', `Webhook verified: ${event.type}`);
          
          // Process the webhook event
          console.log('>>> Processing webhook event:', event.type);
          
          // Handle payment_intent.succeeded event to update order status and send restaurant email
          if (event.type === 'payment_intent.succeeded') {
            const paymentIntent = event.data.object as any;
            console.log('>>> Processing payment_intent.succeeded:', {
              paymentIntentId: paymentIntent.id,
              metadata: paymentIntent.metadata
            });
            
            // Get order information from metadata
            const orderNumber = paymentIntent.metadata?.orderNumber;
            const dbOrderId = paymentIntent.metadata?.orderId;
            
            if (dbOrderId) {
              console.log('>>> Updating database order payment status:', dbOrderId);
              
              // Import and use the order payment service
              const { updateOrderPaymentStatus } = await import('./services/orderPaymentLinkService.js');
              const { sendRestaurantOrderNotifications } = await import('./services/restaurantNotificationService.js');
              
              try {
                console.log('>>> 🔄 Attempting to update order payment status to PAID...');
                // Update order status to PAID
                const updatedOrder = await updateOrderPaymentStatus(parseInt(dbOrderId), 'PAID');
                
                if (updatedOrder) {
                  console.log('>>> ✅ Database order updated successfully:', {
                    orderId: updatedOrder.id,
                    orderNumber: updatedOrder.order_number,
                    paymentStatus: 'PAID',
                    paidAt: updatedOrder.paid_at
                  });
                  
                  // Send restaurant notification email
                  console.log('>>> 📧 ATTEMPTING TO SEND RESTAURANT NOTIFICATION...');
                  console.log('>>> 📧 Order ID for notification:', updatedOrder.id);
                  console.log('>>> 📧 Order Number:', updatedOrder.order_number);
                  
                  try {
                    console.log('>>> 📧 Calling sendRestaurantOrderNotifications...');
                    const notificationResult = await sendRestaurantOrderNotifications(updatedOrder.id);
                    console.log('>>> 📧 Restaurant notification result:', notificationResult);
                    
                    if (notificationResult) {
                      console.log('>>> ✅ Restaurant notification sent successfully for order:', updatedOrder.order_number);
                    } else {
                      console.log('>>> ❌ Restaurant notification failed for order:', updatedOrder.order_number);
                    }
                  } catch (notificationError) {
                    console.log('>>> ❌ EXCEPTION in restaurant notification:', notificationError);
                    console.log('>>> ❌ Error details:', {
                      message: notificationError.message,
                      stack: notificationError.stack
                    });
                  }
                } else {
                  console.log('>>> ❌ Order not found for payment update:', dbOrderId);
                }
              } catch (updateError) {
                console.log('>>> ❌ Error updating order payment status:', updateError);
                console.log('>>> ❌ Update error details:', {
                  message: updateError.message,
                  stack: updateError.stack
                });
              }
            } else {
              console.log('>>> ⚠️ No dbOrderId found in paymentIntent metadata');
              console.log('>>> ⚠️ Available metadata keys:', Object.keys(paymentIntent.metadata || {}));
            }
          }
          
          // Handle checkout.session.completed event (this has the payment link metadata)
          if (event.type === 'checkout.session.completed') {
            const session = event.data.object as any;
            console.log('>>> Processing checkout.session.completed:', {
              sessionId: session.id,
              metadata: session.metadata,
              paymentStatus: session.payment_status
            });
            
            // Get order information from metadata
            const orderNumber = session.metadata?.orderNumber;
            const dbOrderId = session.metadata?.orderId;
            
            if (dbOrderId) {
              console.log('>>> Updating database order payment status via session:', dbOrderId);
              
              // Import and use the order payment service
              const { updateOrderPaymentStatus } = await import('./services/orderPaymentLinkService.js');
              const { sendRestaurantOrderNotifications } = await import('./services/restaurantNotificationService.js');
              
              try {
                console.log('>>> 🔄 Attempting to update order payment status to PAID...');
                // Update order status to PAID
                const updatedOrder = await updateOrderPaymentStatus(parseInt(dbOrderId), 'PAID');
                
                if (updatedOrder) {
                  console.log('>>> ✅ Database order updated successfully via session:', {
                    orderId: updatedOrder.id,
                    orderNumber: updatedOrder.order_number,
                    paymentStatus: 'PAID',
                    paidAt: updatedOrder.paid_at
                  });
                  
                  // Send restaurant notification email
                  console.log('>>> 📧 ATTEMPTING TO SEND RESTAURANT NOTIFICATION...');
                  console.log('>>> 📧 Order ID for notification:', updatedOrder.id);
                  console.log('>>> 📧 Order Number:', updatedOrder.order_number);
                  
                  try {
                    console.log('>>> 📧 Calling sendRestaurantOrderNotifications...');
                    const notificationResult = await sendRestaurantOrderNotifications(updatedOrder.id);
                    console.log('>>> 📧 Restaurant notification result:', notificationResult);
                    
                    if (notificationResult) {
                      console.log('>>> ✅ Restaurant notification sent successfully for order:', updatedOrder.order_number);
                    } else {
                      console.log('>>> ❌ Restaurant notification failed for order:', updatedOrder.order_number);
                    }
                  } catch (notificationError) {
                    console.log('>>> ❌ EXCEPTION in restaurant notification:', notificationError);
                    console.log('>>> ❌ Error details:', {
                      message: notificationError.message,
                      stack: notificationError.stack
                    });
                  }
                } else {
                  console.log('>>> ❌ Order not found for payment update:', dbOrderId);
                }
              } catch (updateError) {
                console.log('>>> ❌ Error updating order payment status:', updateError);
                console.log('>>> ❌ Update error details:', {
                  message: updateError.message,
                  stack: updateError.stack
                });
              }
            } else {
              console.log('>>> ⚠️ No dbOrderId found in session metadata');
              console.log('>>> ⚠️ Available metadata keys:', Object.keys(session.metadata || {}));
            }
          }
          
          // Send success response
          res.status(200).json({ received: true, eventType: event.type });
          
        } catch (error: any) {
          monitor.error('WebhookServer', 'Error processing webhook', {
            message: error.message,
            stack: error.stack
          });
          return res.status(500).json({ error: 'Internal server error' });
        }
      } else {
        // Not a Stripe webhook, return 404
        monitor.log('WebhookServer', 'POST to root without stripe-signature header');
        return res.status(404).send('Cannot POST /');
      }
    });

    // Add a simple health check for GET requests to root
    app.get('/', (req, res) => {
      res.json({ 
        status: 'ok', 
        message: 'Webhook server is running',
        timestamp: new Date().toISOString()
      });
    });

    // Start the Express server for webhook handling
    // Use the port provided by Render, falling back to 3000 for local development
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
    let server;
    let isServerStarting = false;
    let serverStartAttempts = 0;
    const MAX_START_ATTEMPTS = 3;
    const SERVER_START_TIMEOUT = 5000; // 5 seconds timeout for server start

    // Log the port we're using
    monitor.log('WebhookServer', `Using port from environment: ${port}`);

    const startWebhookServer = () => {
      return new Promise<void>((resolve, reject) => {
        // Prevent multiple server starts
        if (isServerStarting) {
          monitor.log('WebhookServer', 'Server start already in progress');
          return resolve();
        }
        if (server) {
          monitor.log('WebhookServer', 'Server already running');
          return resolve();
        }

        // Check if we've exceeded max attempts
        if (serverStartAttempts >= MAX_START_ATTEMPTS) {
          monitor.log('WebhookServer', 'Max server start attempts reached, using existing server');
          return resolve();
        }

        isServerStarting = true;
        serverStartAttempts++;
        
        try {
          monitor.log('WebhookServer', `Starting webhook server (attempt ${serverStartAttempts}/${MAX_START_ATTEMPTS})`, { port });
          
          // Configure server with timeouts
          server = app.listen(port, '0.0.0.0');
          server.keepAliveTimeout = 65000; // Slightly higher than 60 seconds
          server.headersTimeout = 66000; // Slightly higher than keepAliveTimeout

          // Add timeout for server start
          const startTimeout = setTimeout(() => {
            if (isServerStarting) {
              isServerStarting = false;
              monitor.error('WebhookServer', 'Server start timeout');
              reject(new Error('Server start timeout'));
            }
          }, SERVER_START_TIMEOUT);

          server.on('listening', () => {
            clearTimeout(startTimeout);
            isServerStarting = false;
            monitor.webhookServer.status = 'running';
            monitor.webhookServer.port = port;
            monitor.webhookServer.startTime = new Date().toISOString();
            monitor.log('WebhookServer', 'Server started successfully', { 
              port,
              keepAliveTimeout: server.keepAliveTimeout,
              headersTimeout: server.headersTimeout
            });
            resolve();
          });

          // Handle server errors
          server.on('error', async (error) => {
            clearTimeout(startTimeout);
            isServerStarting = false;
            if (error.code === 'EADDRINUSE') {
              monitor.log('WebhookServer', 'Port in use, server may already be running');
              // If port is in use, assume server is already running and resolve
              resolve();
            } else {
              monitor.webhookServer.errorCount++;
              monitor.error('WebhookServer', 'Server error', error);
              reject(error);
            }
          });
        } catch (error) {
          isServerStarting = false;
          monitor.webhookServer.errorCount++;
          monitor.error('WebhookServer', 'Failed to start server', error);
          reject(error);
        }
      });
    };

    // Start both servers asynchronously - only once per process
    (async () => {
      try {
        // Only start servers if they're not already running
        if (!global.serversInitialized) {
          // Start webhook server
          await startWebhookServer();
          
          // Configure worker to listen on a different port
          const liveKitPort = port + 2; // Use the same port offset logic
          monitor.log('LiveKitWorker', 'Starting LiveKit worker', { port: liveKitPort });
          
          // Add error handlers for the LiveKit worker
          process.on('uncaughtException', (error) => {
            if (error.code === 'ERR_IPC_CHANNEL_CLOSED') {
              monitor.log('LiveKitWorker', 'IPC channel closed, attempting graceful shutdown');
              // Attempt graceful shutdown
              if (server) {
                server.close(() => {
                  monitor.log('System', 'Webhook server closed');
                  process.exit(0);
                });
              } else {
                process.exit(0);
              }
            } else {
              monitor.error('System', 'Uncaught exception', error);
              // Don't exit immediately, allow the error to be logged
              setTimeout(() => {
                process.exit(1);
              }, 1000);
            }
          });

          // Add handler for IPC channel errors
          process.on('message', (message) => {
            if (message && message.type === 'error' && message.error && message.error.code === 'ERR_IPC_CHANNEL_CLOSED') {
              monitor.log('LiveKitWorker', 'Received IPC channel error, attempting recovery');
              // Attempt to recover by restarting the worker
              cli.runApp(new WorkerOptions({
                agent: fileURLToPath(import.meta.url),
                port: liveKitPort,
                host: '0.0.0.0'
              }));
            }
          });

          cli.runApp(new WorkerOptions({
            agent: fileURLToPath(import.meta.url),
            port: liveKitPort,
            host: '0.0.0.0'
          }));

          monitor.liveKitWorker.status = 'running';
          monitor.liveKitWorker.port = liveKitPort;
          monitor.liveKitWorker.startTime = new Date().toISOString();
          monitor.log('LiveKitWorker', 'Worker started successfully', { port: liveKitPort });
          
          // Mark servers as initialized
          global.serversInitialized = true;
        }
      } catch (error) {
        monitor.error('System', 'Failed to start servers', error);
        // Don't exit immediately on error, attempt graceful shutdown
        if (server) {
          server.close(() => {
            process.exit(1);
          });
        } else {
          process.exit(1);
        }
      }
    })();

    // Handle process termination
    process.on('SIGTERM', () => {
      monitor.log('System', 'SIGTERM received. Closing webhook server...');
      if (server) {
        server.close(() => {
          monitor.log('System', 'Webhook server closed');
          process.exit(0);
        });
      } else {
        process.exit(0);
      }
    });

    process.on('SIGINT', () => {
      monitor.log('System', 'SIGINT received. Closing webhook server...');
      if (server) {
        server.close(() => {
          monitor.log('System', 'Webhook server closed');
          process.exit(0);
        });
      } else {
        process.exit(0);
      }
    });

    // Add unhandled rejection handler
    process.on('unhandledRejection', (reason, promise) => {
      monitor.error('System', 'Unhandled promise rejection', { reason, promise });
      // Don't exit on unhandled rejection, just log it
    });