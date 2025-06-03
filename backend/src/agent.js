// @ts-nocheck
// This file has TypeScript checking disabled
// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
// @ts-ignore
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
        instructions: `You are Julie, a friendly AI drive-thru assistant for Niro's Gyros. Help customers place Greek and Mediterranean food orders through voice interaction.

CRITICAL ORDER CONFIRMATION SEQUENCE:
1. Get customer's name if not provided
2. Say "Let me confirm your order:" 
3. List EVERY item with quantity and price (e.g., "One Pepsi for $1.99")
4. Say "Your total with tax and fees is $X.XX"
5. Ask "Is that correct?"
6. WAIT for customer confirmation (yes/correct/sounds good)
7. IMMEDIATELY call placeOrder function
8. Share the placeOrder response

NEVER skip step 7! The payment banner ONLY appears if you call placeOrder!

MENU VERIFICATION RULE:
- BEFORE adding ANY item, call getAllMenuItems or getMenuItems to verify it exists and get the EXACT price
- NEVER assume prices - ALWAYS look them up
- Use EXACT names from menu data

TOTAL CALCULATION RULE:
- When stating the total, you MUST include tax and processing fees
- Calculate: subtotal + tax (11.5%) + processing fee (2.9% + $0.40)
- Example: $10.00 subtotal = $10.00 + $1.15 tax + $0.72 processing = $11.87 total
- Say "Your total with tax and fees is $11.87" (NOT just the subtotal)

GREETING: Start with "Hi! How can I help you today?"

ORDER TAKING:
- Always verify menu items exist before adding to order
- Ask for drink preferences on meal combos
- Keep responses brief and conversational
- Ask "Would you like anything else?" after each item

PAYMENT FLOW:
- When customer confirms order, IMMEDIATELY call placeOrder
- The placeOrder function handles payment instructions
- NEVER say completion messages before calling placeOrder

IMPORTANT: NEVER ask for customer's name more than once!`,
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
              
              try {
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
                    return `I don't see any items in the ${category} category. Let me check our full menu for you.`;
                  }
                  
                  let response = `Here are the items in our ${category} category:\n`;
                  
                  items.forEach((item: any) => {
                    response += `${item.name}: $${item.price.toFixed(2)} - ${item.description}\n`;
                  });
                  
                  return response;
                }
                
                return JSON.stringify(items);
              } catch (error) {
                console.error(`Error retrieving menu items for category ${category}:`, error);
                if (formatForVoice) {
                  return `I'm having trouble accessing the ${category} category right now. Could you please tell me what specific items you'd like to order?`;
                }
                return JSON.stringify({ error: 'Menu access failed', category, details: error.message });
              }
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
              
              try {
                // Always use Niros Gyros ID
                const allItemsByCategory = await getAllMenuItems('niros_gyros');
                const nirosGyros = await getRestaurantById('niros_gyros');
                
                // Flatten the items from all categories into a single array
                const allItems = [];
                for (const [category, items] of Object.entries(allItemsByCategory)) {
                  allItems.push(...items);
                }
                
                // Update conversation state
                if (nirosGyros) {
                  selectRestaurant(conversationState, 'niros_gyros', nirosGyros.coffee_shop_name);
                  updateLastFunction(conversationState, 'getAllMenuItems');
                  console.log(`Retrieved all menu items for ${nirosGyros.coffee_shop_name}`);
                }
                
                if (!allItems || allItems.length === 0) {
                  console.error('No menu items found for Niros Gyros');
                  return formatForVoice 
                    ? "I'm having trouble accessing our menu right now. Could you please tell me what specific items you'd like to order?"
                    : JSON.stringify({ error: 'No menu items available' });
                }
                
                if (formatForVoice) {
                  // Don't read all items aloud - that would be too long
                  return `I have access to our complete menu with ${allItems.length} items across all categories. What specific items or category would you like to know about?`;
                }
                
                return JSON.stringify(allItems);
              } catch (error) {
                console.error('Error retrieving all menu items:', error);
                return formatForVoice 
                  ? "I'm having trouble accessing our menu right now. Could you please tell me what specific items you'd like to order?"
                  : JSON.stringify({ error: 'Menu access failed', details: error.message });
              }
            },
          },
  
        calculateOrderTotal: {
          description: 'Calculate the total cost of an order including tax and processing fees',
          parameters: z.object({
            items: z.array(z.object({
              name: z.string().describe('Name of the menu item'),
              quantity: z.number().describe('Quantity of the item'),
              price: z.number().describe('Price of the item')
            })).describe('List of items in the order'),
            formatForVoice: z.boolean().optional().describe('Whether to format the response for voice readout')
          }),
          execute: async ({ items, formatForVoice = true }) => {
            console.debug('Calculating order total with tax and processing fees');
            
            try {
              // Calculate subtotal
              const subtotal = items.reduce((total, item) => {
                return total + (item.price * item.quantity);
              }, 0);
              
              // Use priceCalculator service for consistent calculations
              const { priceCalculator } = await import('./services/priceCalculator.js');
              const priceBreakdown = priceCalculator.calculateOrderPrices(subtotal);
              
              console.log('Order total calculation:', {
                subtotal: priceBreakdown.subtotal,
                tax: priceBreakdown.tax,
                processingFee: priceBreakdown.processingFee,
                totalWithFees: priceBreakdown.totalWithFees
              });
              
              if (formatForVoice) {
                return `Your subtotal is $${priceBreakdown.subtotal.toFixed(2)}, tax is $${priceBreakdown.tax.toFixed(2)}, processing fee is $${priceBreakdown.processingFee.toFixed(2)}, for a total with tax and fees of $${priceBreakdown.totalWithFees.toFixed(2)}.`;
              }
              
              return JSON.stringify({
                subtotal: priceBreakdown.subtotal,
                tax: priceBreakdown.tax,
                processingFee: priceBreakdown.processingFee,
                total: priceBreakdown.total,
                totalWithFees: priceBreakdown.totalWithFees
              });
            } catch (error) {
              console.error('Error calculating order total:', error);
              if (formatForVoice) {
                return "I'm having trouble calculating the total right now. Let me try again.";
              }
              return JSON.stringify({ error: 'Calculation failed' });
            }
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
      
      // Start the conversation session
      try {
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
              chatCollector.updateConversationState(participant.identity, conversationState);
            }
          } else {
            console.log(`[DEBUG] No content found in agent_speech_committed event`);
          }
        });

        session.on('function_call_output_added', (event) => {
          console.log(`[DEBUG] function_call_output_added event triggered for ${participant.identity}`);
          console.log(`[DEBUG] Event output: "${event.output?.substring(0, 100)}..."`);
          
          if (event.output) {
            chatCollector.addMessage(participant.identity, 'assistant', event.output);
            chatCollector.updateConversationState(participant.identity, conversationState);
          }
        });

        session.on('response_done', async (event) => {
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
        
        session.on('error', (err) => {
          if (err.message && err.message.includes('TextAudioSynchronizer')) {
            console.warn('TextAudioSynchronizer error caught:', err.message);
          } else {
            console.error('Session error:', err);
          }
        });

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
        
        try {
          await participant.publishData('I apologize, but I\'m experiencing some technical difficulties connecting to our service. Please try again in a moment.', 'text/plain');
        } catch (notifyError) {
          console.error('Failed to notify participant:', notifyError);
        }
        
        if (error.message && error.message.includes('rate_limit_exceeded')) {
          console.log('Rate limit exceeded, updating throttler config...');
          apiThrottler.updateConfig({
            maxTokensPerMinute: 5000,
            maxConcurrentRequests: 1,
            requestDelay: 2000,
          });
        } else if (error.message && error.message.includes('server had an error')) {
          console.log('Server error detected, waiting before retry...');
          await new Promise(resolve => setTimeout(resolve, 60000));
        } else {
          await new Promise(resolve => setTimeout(resolve, 15000));
        }
        
        try {
          console.log('Final retry attempt with minimal settings...');
          await apiThrottler.throttle(runConversation, 1500);
        } catch (retryError) {
          console.error('Final retry failed:', retryError);
        }
        throw error;
      }
    },
  });

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

  // Handle raw body for webhook endpoint
  // Handle webhook requests using Stripe's recommended approach
  app.use('/api/payments/webhook', (req, res, next) => {
    // Only process POST requests
    if (req.method !== 'POST') {
      return next();
    }
    
    let rawBody = '';
    req.setEncoding('utf8');
    
    req.on('data', (chunk) => {
      rawBody += chunk;
    });
    
    req.on('end', () => {
      if (rawBody) {
        // Store the raw body as a string for Stripe webhook verification
        (req as any).rawBody = rawBody;
        
        // Log successful raw body capture
        monitor.log('WebhookServer', 'Successfully captured raw body', {
          length: rawBody.length,
          headers: {
            'content-type': req.headers['content-type'],
            'content-length': req.headers['content-length']
          }
        });
        
        // Parse the body as JSON for easier access in the route handler
        try {
          (req as any).body = JSON.parse(rawBody);
        } catch (err) {
          // If JSON parsing fails, that's okay - we still have the raw body
          monitor.error('WebhookServer', 'Error parsing JSON body', err);
        }
      }
      next();
    });
    
    req.on('error', (err) => {
      monitor.error('WebhookServer', 'Error reading request stream', err);
      res.status(400).json({
        error: 'Could not read request body',
        details: err.message
      });
    });
  });
  
  // Add JSON parsing for non-webhook routes
  app.use((req, res, next) => {
    // Skip JSON parsing for webhook endpoint
    if (req.originalUrl === '/api/payments/webhook') {
      return next();
    }
    express.json()(req, res, next);
  });

  // Mount payment routes
  app.use('/api/payments', paymentRoutes);
  monitor.log('WebhookServer', 'Mounted payment routes at /api/payments');

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

  // Function to start the webhook server
  const startWebhookServer = () => {
    return new Promise((resolve, reject) => {
      // Prevent multiple server starts
      if (isServerStarting) {
        monitor.log('WebhookServer', 'Server start already in progress');
        return resolve(server);
      }
      if (server) {
        monitor.log('WebhookServer', 'Server already running');
        return resolve(server);
      }

      // Check if we've exceeded max attempts
      if (serverStartAttempts >= MAX_START_ATTEMPTS) {
        monitor.log('WebhookServer', 'Max server start attempts reached, using existing server');
        return resolve(server);
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
          resolve(server);
        });

        // Handle server errors
        server.on('error', async (error) => {
          clearTimeout(startTimeout);
          isServerStarting = false;
          if (error.code === 'EADDRINUSE') {
            monitor.log('WebhookServer', 'Port in use, server may already be running');
            // Use dynamic import for net module
            const { default: net } = await import('net');
            const testServer = net.createServer();
            testServer.once('error', (err) => {
              if (err.code === 'EADDRINUSE') {
                monitor.log('WebhookServer', 'Confirmed port is in use by another process');
                // Instead of resolving with null, we'll try to find the existing server
                const existingServer = net.createServer();
                existingServer.once('error', () => {
                  // If we can't connect, the server is already running
                  monitor.log('WebhookServer', 'Existing server confirmed running');
                  resolve(server);
                });
                existingServer.once('listening', () => {
                  existingServer.close();
                  reject(error);
                });
                existingServer.listen(port);
              }
            });
            testServer.once('listening', () => {
              testServer.close();
              reject(error);
            });
            testServer.listen(port);
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

  // Start both servers asynchronously
  (async () => {
    try {
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