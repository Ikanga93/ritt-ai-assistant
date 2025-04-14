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

// Import API throttler and performance monitor
import { apiThrottler } from './apiThrottler.js';
import { performanceMonitor } from './performanceMonitor.js';

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
  updateLastFunction,
  setPaymentInfo,
  startPaymentMethodSelection
} from './conversationState.js';

// Import restaurant utilities
import {
  getRestaurants,
  getRestaurantById,
  getMenuCategories,
  getMenuItemsByCategory,
  getAllMenuItems,
  sendOrderNotification,
  type MenuItem
} from './restaurantUtils.js';

// Import order service
import { placeOrder } from './orderService.js';

// Import payment integration
import { generatePaymentLink, checkPayment } from './paymentIntegration.js';

// Import enhanced payment flow management
import { 
  handlePaymentMethodSelection, 
  checkPaymentStatus, 
  suggestPaymentMethod, 
  recoverFromPaymentError,
  PaymentMethod
} from './paymentFlow.js';

// Import order storage system
import { storeOrder, convertToOrderWithPayment, OrderWithPayment } from './orderStorage.js';

// Import fuzzy matching utilities
import { findBestMatch, findAllMatches, verifyOrderItems, normalizeString } from './utils/fuzzyMatch.js';

// Import payment webhook handler
import { startWebhookServer } from './paymentWebhook.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env.local');
dotenv.config({ path: envPath });

export default defineAgent({
  entry: async (ctx: JobContext) => {
    await ctx.connect();
    
    // Start the payment webhook server to handle payment notifications
    try {
      const webhookPort = parseInt(process.env.WEBHOOK_PORT || '3333', 10);
      // The startWebhookServer function now returns a promise
      startWebhookServer(webhookPort).then(actualPort => {
        if (actualPort > 0) {
          console.log(`Payment webhook server started on port ${actualPort}`);
        } else {
          console.log('Payment webhook server not started (port already in use)');
          console.log('This is normal if you have multiple instances running');
        }
      }).catch(err => {
        console.error('Failed to start webhook server:', err);
        console.log('Continuing without webhook server - payment notifications may not work');
      });
    } catch (err) {
      console.error('Error setting up webhook server:', err);
      console.log('Continuing without webhook server - payment notifications may not work');
    }
    
    console.log('waiting for participant');
    const participant = await ctx.waitForParticipant();
    console.log(`starting assistant example agent for ${participant.identity}`);

    // Initialize conversation state
    const conversationState: ConversationState = createInitialState();
    
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
   - Keep a running total of their order
   - IMPORTANT: If a customer asks for a specific restaurant like Niros Gyros, ALWAYS try to find it even if initial lookup fails
   - If you initially say a restaurant doesn't exist but the customer insists, try again using the getRestaurantById function
   - NEVER tell customers a restaurant doesn't exist without trying multiple times to find it

4. ORDER CUSTOMIZATION:
   - Ask about size, milk options, sweeteners, and other relevant customizations
   - Confirm each item before moving to the next
   - Allow customers to order multiple items from different categories
   - Keep a running total of their order
   - ALWAYS ask for the customer's name before completing the order if not already provided

5. ORDER CONFIRMATION (Final Step):
   - ALWAYS ask for the customer's name if not already provided
   - Briefly summarize their complete order including all items and total
   - Tell the customer to proceed to the pickup window (DO NOT provide the restaurant address)
   - Use placeOrder function with the correct restaurant ID

6. CONVERSATION FLOW:
   - Keep all interactions brief and to the point
   - Focus on efficiency and accuracy
   - Use a step-by-step approach, but allow flexibility if they want to jump ahead

7. VOICE OPTIMIZATION:
   - Keep all responses extremely concise and easy to understand
   - Avoid unnecessary explanations or verbose descriptions
   - Confirm important details verbally but briefly
   - Remember that the customer can only interact with you through voice

8. UPSELLING STRATEGY:
   - Suggest relevant add-ons based on customer's order (e.g., "Would you like to add a pastry to your coffee?")
   - Recommend popular pairings when appropriate (e.g., "Our blueberry muffin pairs well with that latte")
   - Mention limited-time specials if available
   - Keep upselling suggestions brief and natural, not pushy

9. ORDER ACCURACY:
   - Always repeat back each item after the customer orders it
   - Confirm special instructions clearly (e.g., "That's an oat milk latte, no sugar")
   - Summarize the full order before finalizing
   - Double-check customer name and any customizations

10. PAYMENT PROCESSING:
   - After confirming the order details, always ask: "Would you like to pay online now or at the pickup window?"
   - Listen carefully for the customer's payment preference
   
   IF CUSTOMER CHOOSES ONLINE PAYMENT:
   - Say "Great! Let me generate a payment link for you."
   - Use the createPaymentLink function
   - When sharing the link, say: "I've created a secure payment link for your order. You can complete your payment at [payment link]. After payment, please proceed to the pickup window."
   - Offer to help with any payment questions
   
   IF CUSTOMER CHOOSES PICKUP PAYMENT:
   - Say "No problem! You can pay at the pickup window when you arrive."
   - Remind them of their order total: "Your total of $[amount] will be due at pickup."
   
   IF CUSTOMER ASKS ABOUT PAYMENT STATUS:
   - Use the checkPaymentStatus function
   - If payment is complete, say: "Great news! Your payment has been successfully processed."
   - If payment is pending, say: "I don't see your payment completed yet. You can still complete it at [payment link]."
   
   PAYMENT PHRASES TO USE:
   - "Would you like to pay online now or at the pickup window?"
   - "I can generate a secure payment link for you to pay online."
   - "Your total is $[amount]. Would you prefer to pay now or at pickup?"
   - "I've created a payment link for you at [link]. You can complete your payment there."
   - "After completing your payment online, please proceed to the pickup window."
   - "Your payment has been successfully processed. Thank you!"
   - "I don't see your payment completed yet. Do you need help with the payment process?"
   
   SAMPLE PAYMENT DIALOG:
   AGENT: "Your order total is $15.75. Would you like to pay online now or at the pickup window?"
   CUSTOMER: "I'll pay online."
   AGENT: "Great! Let me generate a payment link for you."
   AGENT: "I've created a secure payment link for your order. You can complete your payment at https://pay.stripe.com/link123. After payment, please proceed to the pickup window."
   CUSTOMER: "Thanks, I'll pay now."
   AGENT: "Perfect! Let me know if you have any questions about the payment process."
   
   ALTERNATIVE DIALOG (PAYMENT AT PICKUP):
   AGENT: "Your order total is $15.75. Would you like to pay online now or at the pickup window?"
   CUSTOMER: "I'll pay at pickup."
   AGENT: "No problem! Your total of $15.75 will be due when you arrive at the pickup window. Your order will be ready in approximately 10 minutes."
   
   PAYMENT STATUS CHECK DIALOG:
   CUSTOMER: "Has my payment gone through?"
   AGENT: "Let me check that for you."
   AGENT: "Great news! Your payment has been successfully processed. Your order will be ready for pickup in approximately 10 minutes."
   
   PAYMENT TROUBLESHOOTING DIALOG:
   CUSTOMER: "I'm having trouble with the payment link."
   AGENT: "I'm sorry to hear that. Let me help you. What issue are you experiencing with the payment?"
   CUSTOMER: "It's not accepting my card."
   AGENT: "I apologize for the inconvenience. You can try using a different card or payment method on the payment page. Alternatively, you can pay at the pickup window when you arrive."

11. MENU ITEMS AND COMMON CONFUSIONS:
   - Restaurants may have specialty items with unique names - always treat these as specific menu items
   - Pay close attention to menu items with names starting with "The" - these are individual items, not categories
   - When a customer asks for items with names like "The [Name]", always recognize it as a specific menu item, not as a category
   - Don't ask customers to clarify what items they want in their "The [Name]" order - these are complete menu items

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
              console.log('Available restaurants:', restaurants.map(r => `${r.name} (${r.id})`));
              
              // Present all available restaurants in a concise format
              const restaurantNames = restaurants.map(r => r.name).join(', ');
              return `You can order from ${restaurantNames}. Which one would you like to order from today?`;
            }
            
            // Return JSON for non-voice use
            return JSON.stringify(restaurants);
        },
      },

      getRestaurantInfo: {
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
          formatForVoice: z.boolean().optional().describe('Whether to format the response for voice readout')
        }),
        execute: async ({ restaurantId, items, customerName, customerEmail, formatForVoice = true }: { restaurantId: string; items: Array<{id?: string; name: string; quantity: number; price?: number; specialInstructions?: string}>; customerName: string; customerEmail?: string; formatForVoice?: boolean }) => {
            console.debug(`placing order with coffee shop ${restaurantId} for customer: ${customerName}:`, items);
            
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
            
            console.log(`Validating ${items.length} order items against ${allMenuItems.length} menu items`);
            
            // Use the enhanced verifyOrderItems function from fuzzyMatch.ts
            const verifiedItems = verifyOrderItems(items, allMenuItems, 0.6);
            
            // Process verified items
            const validatedItems = [];
            const unverifiedItems = [];
            
            for (const item of verifiedItems) {
              if (item.verified) {
                console.log(`Verified menu item: "${item.name}"`);
                validatedItems.push({
                  ...item,
                  price: item.price
                });
              } else {
                console.warn(`Unverified menu item: "${item.name}"${item.suggestion ? `, did you mean "${item.suggestion}"?` : ''}`);
                
                // If we have a suggestion, use it
                if (item.suggestion) {
                  const suggestedItem = allMenuItems.find(mi => mi.name === item.suggestion);
                  if (suggestedItem) {
                    console.log(`Using suggested menu item: "${item.name}" -> "${suggestedItem.name}"`);
                    validatedItems.push({
                      ...item,
                      name: suggestedItem.name,
                      price: suggestedItem.price || item.price,
                      id: suggestedItem.id || item.id
                    });
                    continue;
                  }
                }
                
                // If we still don't have a match, try using normalizeString for a more aggressive match
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
                  validatedItems.push({
                    ...item,
                    name: normalizedMatch.name,
                    price: normalizedMatch.price || item.price,
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
                  validatedItems.push({
                    ...item,
                    name: categoryItem.name,
                    price: categoryItem.price || item.price,
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
                  
                  const bestMatch = findBestMatch(normalizeString(item.name), 
                    allMenuItems.map(mi => normalizeString(mi.name)));
                  
                  if (bestMatch && bestMatch.similarity >= 0.6) {
                    const matchedItem = allMenuItems[bestMatch.index];
                    item.price = matchedItem.price;
                    item.id = item.id || matchedItem.id;
                    console.log(`Found fuzzy match for ${item.name}: ${matchedItem.name} at $${item.price} (similarity: ${bestMatch.similarity.toFixed(2)})`);
                    foundItem = true;
                  }
                }
                
                if (!foundItem) {
                  console.log(`Could not find price for ${item.name}`);
                  // Set a default price to avoid NaN in total
                  item.price = 5.00; // Default price if not found
                  console.log(`Setting default price of $5.00 for ${item.name}`);
                }
              }
            
              if (item.price !== undefined) {
                orderTotal += item.price * item.quantity;
              } else {
                // Ensure we always have a price
                item.price = 5.00; // Default price
                orderTotal += item.price * item.quantity;
                console.log(`Using default price of $5.00 for ${item.name}`);
              }
              
              return item;
          }));
          
            // Calculate subtotal, tax, and processing fee
            const subtotal = parseFloat(orderTotal.toFixed(2));
            const stateTax = parseFloat((subtotal * 0.09).toFixed(2));
            const processingFee = parseFloat((subtotal * 0.035 + 0.30).toFixed(2));
            const finalTotal = parseFloat((subtotal + stateTax + processingFee).toFixed(2));
            
            // Create base order object with more details
            const baseOrder = {
              orderNumber,
              restaurantId,
              restaurantName: coffeeShop.coffee_shop_name,
              customerName: customerName, // customerName is now required
              customerEmail: customerEmail,
              items: itemsWithDetails,
              subtotal: subtotal,
              stateTax: stateTax,
              processingFee: processingFee, // Hidden from customer
              orderTotal: finalTotal,
              timestamp: new Date().toISOString(),
              estimatedTime,
              status: 'confirmed'
            };
            
            // Get payment method suggestion based on order context
            // Always prioritize online payment as our preferred method
            const paymentSuggestion = suggestPaymentMethod(conversationState);
            
            // Always use online payment as the default method unless explicitly changed by the user
            const paymentMethod = conversationState.stage === ConversationStage.PAYMENT_METHOD_SELECTION && 
                                conversationState.paymentMethod === 'window' ? 
                                'window' : 'online';
            
            // Convert to order with payment fields
            const order: OrderWithPayment = convertToOrderWithPayment(baseOrder, paymentMethod as "online" | "window");
            
            // Add payment suggestion to conversation state for the AI to reference
            conversationState.paymentSuggestion = {
              method: paymentMethod,
              reason: paymentSuggestion.reason
            };
          
            // Update conversation state to payment method selection stage
            // We'll keep the order active until payment is completed
            startPaymentMethodSelection(conversationState);
            console.log('Moving to payment method selection stage');
            
            // Store the order in our order storage system with enhanced error handling
            const storeResult = await storeOrder(order);
            
            // Log storage result
            if (!storeResult.success) {
              console.error(`Failed to store order #${orderNumber}: ${storeResult.error}`);
            } else if (storeResult.error) {
              console.warn(`Order #${orderNumber} stored with warnings: ${storeResult.error}`);
            } else {
              console.log(`Order #${orderNumber} stored successfully`);
            }
            
            // For window payments, send notification immediately
            // For online payments, notification will be sent after payment confirmation
            if (order.paymentMethod === 'window') {
              // Send notification email to coffee shop for window payment
              await sendOrderNotification(restaurantId, order);
              console.log('Window payment selected, notification sent immediately');
              
              // Mark notification as sent
              updateOrder(order.orderNumber, { notificationSent: true });
            } else {
              console.log('Online payment selected, notification will be sent after payment confirmation');
            }
            
            // Set up payment flow if enabled
            let paymentLink = null;
            let paymentFlowResult = null;
            
            if (process.env.ENABLE_PAYMENTS === 'true') {
              try {
                // Start with the suggested payment method
                // The customer will be able to choose their preference during the conversation
                const initialPaymentMethod = paymentSuggestion.method;
                
                // Set up the initial payment flow based on the suggested method
                paymentFlowResult = await handlePaymentMethodSelection(
                  conversationState,
                  orderNumber.toString(),
                  initialPaymentMethod as PaymentMethod
                );
                
                // Store payment information if available
                if (paymentFlowResult.success && paymentFlowResult.paymentUrl && paymentFlowResult.paymentId) {
                  paymentLink = {
                    url: paymentFlowResult.paymentUrl,
                    id: paymentFlowResult.paymentId
                  };
                  console.log('Payment flow initialized:', paymentFlowResult.message);
                } else if (!paymentFlowResult.success) {
                  // If payment setup fails, log the error but continue with the order
                  console.error('Payment flow initialization failed:', paymentFlowResult.error);
                  
                  // Try to recover from the error
                  const recoveryResult = await recoverFromPaymentError(
                    conversationState,
                    orderNumber.toString(),
                    paymentFlowResult.errorCode || 'UNKNOWN_ERROR'
                  );
                  
                  console.log('Payment recovery attempt:', recoveryResult.message);
                }
              } catch (error) {
                console.error('Error in payment flow:', error);
                // If there's an error, complete the order anyway
                completeOrder(conversationState);
              }
            } else {
              // If payments are not enabled, complete the order
              completeOrder(conversationState);
            }
            
            if (formatForVoice) {
              // Format order summary for voice readout
              let orderSummary = `Thank you for your order with ${coffeeShop.coffee_shop_name}. `;
              orderSummary += `Your order number is ${orderNumber}. Here's a summary of your order:\n\n`;
            
              items.forEach((item: any) => {
                orderSummary += `${item.quantity} ${item.name}${item.specialInstructions ? ` (${item.specialInstructions})` : ''} - $${(item.price * item.quantity).toFixed(2)}\n`;
              });
            
              // Add subtotal, tax, and total information
              orderSummary += `\nSubtotal: $${order.subtotal.toFixed(2)}`;
              orderSummary += `\nState Tax (9%): $${order.stateTax.toFixed(2)}`;
              orderSummary += `\nTotal: $${order.orderTotal.toFixed(2)}`;
              
              orderSummary += `\n\nYour estimated wait time is ${estimatedTime} minutes. `;
            
              // Direct customer to pickup window instead of providing the address
              orderSummary += `Please proceed to the pickup window for your order. `;
              
            
              // Add payment method options if payments are enabled
              if (process.env.ENABLE_PAYMENTS === 'true') {
                // If we have a payment suggestion, include it in the prompt
                const suggestion = suggestPaymentMethod(conversationState);
                orderSummary += ` Would you like to pay online now or at the pickup window? ${suggestion.reason}`;
              } else {
                orderSummary += ` Thank you for using our voice ordering service!`;
              }
              
              // Add payment flow result message if available
              if (paymentFlowResult && paymentFlowResult.message) {
                orderSummary += ` ${paymentFlowResult.message}`;
              }
              // Add payment link information if available and if we're in payment link shared stage
              else if (paymentLink && paymentLink.url && conversationState.stage === ConversationStage.PAYMENT_LINK_SHARED) {
                // Format the payment link in a way that will be recognized as clickable by most chat interfaces
                // Use https:// prefix to ensure it's recognized as a link
                const linkUrl = paymentLink.url.startsWith('http') ? paymentLink.url : `https://${paymentLink.url}`;
                orderSummary += ` Great! I've generated a secure payment link for you.\n\nClick here to pay: ${linkUrl}\n\nAfter payment, please proceed to the pickup window.`;
              }
              
              return orderSummary;
            }
            
            // Include payment link in response if available
            const response = {
              success: true,
              orderNumber,
              restaurantName: coffeeShop.coffee_shop_name,
              items: itemsWithDetails,
              subtotal: order.subtotal,
              stateTax: order.stateTax,
              orderTotal: order.orderTotal,
              estimatedTime,
              message: `Order #${orderNumber} has been placed with ${coffeeShop.coffee_shop_name}${customerName ? ` for ${customerName}` : ''}. Your total is $${order.orderTotal.toFixed(2)}. Your estimated wait time is ${estimatedTime} minutes. Thank you for your order!`
            };
            
            // Add payment info if available
            if (paymentLink && paymentLink.url) {
              response.paymentLink = {
                url: paymentLink.url,
                id: paymentLink.id
              };
            }
            
            return JSON.stringify(response);
          },
        },
        
        // Add payment functions
        createPaymentLink: {
          description: 'Create a payment link for an order',
          parameters: z.object({
            orderDetails: z.object({
              orderNumber: z.string().describe('The order number'),
              customerName: z.string().describe('The customer name'),
              restaurantName: z.string().describe('The restaurant name'),
              orderTotal: z.number().describe('The total order amount'),
              items: z.array(z.object({
                name: z.string(),
                quantity: z.number(),
                price: z.number().optional()
              })).optional().describe('The order items')
            }).describe('The order details')
          }),
          execute: async ({ orderDetails }: { orderDetails: any }) => {
            console.debug(`Creating payment link for order: ${orderDetails.orderNumber}`);
            try {
              // Use the enhanced payment flow to handle online payment
              const result = await handlePaymentMethodSelection(
                conversationState,
                orderDetails.orderNumber,
                PaymentMethod.ONLINE
              );
              
              if (result.success) {
                console.log(`Payment link created: ${result.paymentUrl}`);
                
                return JSON.stringify({
                  success: true,
                  url: result.paymentUrl,
                  id: result.paymentId,
                  message: result.message
                });
              } else {
                console.error('Failed to create payment link:', result.error);
                
                // Try to recover from the error
                const recoveryResult = await recoverFromPaymentError(
                  conversationState,
                  orderDetails.orderNumber,
                  result.errorCode || 'UNKNOWN_ERROR'
                );
                
                return JSON.stringify({
                  success: false,
                  error: result.error || 'Failed to create payment link',
                  recoveryMessage: recoveryResult.message,
                  suggestedAction: recoveryResult.suggestedAction
                });
              }
            } catch (error) {
              console.error('Error creating payment link:', error);
              return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error creating payment link',
                message: "I'm having trouble generating a payment link. Would you prefer to pay at the pickup window instead?"
              });
            }
          },
        },
        
        checkPaymentStatus: {
          description: 'Check the status of a payment',
          parameters: z.object({
            paymentLinkId: z.string().describe('The ID of the payment link to check')
          }),
          execute: async ({ paymentLinkId }: { paymentLinkId: string }) => {
            console.debug(`Checking payment status for: ${paymentLinkId}`);
            try {
              // Use the enhanced payment status checking function
              const result = await checkPaymentStatus(conversationState, paymentLinkId);
              
              if (result.success) {
                console.log(`Payment status checked: ${result.message}`);
                return JSON.stringify({
                  success: true,
                  message: result.message,
                  stage: result.stage,
                  paymentUrl: result.paymentUrl
                });
              } else {
                console.error('Failed to check payment status:', result.error);
                return JSON.stringify({
                  success: false,
                  error: result.error || 'Failed to check payment status',
                  message: result.message
                });
              }
            } catch (error) {
              console.error('Error checking payment status:', error);
              return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error checking payment status',
                message: "I'm having trouble checking your payment status. You can try completing your payment using the link I provided earlier, or you can pay at the pickup window when you arrive."
              });
            }
          },
        },
        
        // Add payment method selection function
        selectPaymentMethod: {
          description: 'Select a payment method for an order',
          parameters: z.object({
            orderNumber: z.string().describe('The order number'),
            method: z.enum(['online', 'window']).describe('The payment method to use')
          }),
          execute: async ({ orderNumber, method }: { orderNumber: string; method: string }) => {
            console.debug(`Selecting payment method for order #${orderNumber}: ${method}`);
            try {
              // Convert method string to PaymentMethod enum
              const paymentMethod = method === 'online' ? PaymentMethod.ONLINE : PaymentMethod.WINDOW;
              
              // Handle payment method selection
              const result = await handlePaymentMethodSelection(
                conversationState,
                orderNumber,
                paymentMethod
              );
              
              if (result.success) {
                console.log(`Payment method selected: ${method}`);
                return JSON.stringify({
                  success: true,
                  message: result.message,
                  paymentUrl: result.paymentUrl,
                  paymentId: result.paymentId
                });
              } else {
                console.error(`Failed to set up ${method} payment:`, result.error);
                return JSON.stringify({
                  success: false,
                  error: result.error,
                  message: result.message,
                  suggestedAction: result.suggestedAction
                });
              }
            } catch (error) {
              console.error(`Error selecting payment method:`, error);
              return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error selecting payment method',
                message: "I'm having trouble setting up your payment. Would you like to try a different payment method?"
              });
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
      const session = await performanceMonitor.measure('conversation-session', () => 
        apiThrottler.throttle(runConversation, 3000)
      );
      
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
    }
  },
});

// Use PORT environment variable provided by Render or default to 8081
const port = process.env.PORT || 8081;

// Configure worker to listen on all interfaces (0.0.0.0) and use the PORT environment variable
cli.runApp(new WorkerOptions({
  agent: fileURLToPath(import.meta.url),
  port: parseInt(port.toString(), 10),
  host: '0.0.0.0'
}));
