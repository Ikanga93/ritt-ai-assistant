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
  updateLastFunction
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env.local');
dotenv.config({ path: envPath });

export default defineAgent({
  entry: async (ctx: JobContext) => {
    await ctx.connect();
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
      instructions: `You are a friendly drive-thru assistant for a multi-restaurant ordering system. Your primary goal is to help customers place orders through voice interaction only.

IMPORTANT GUIDELINES FOR MULTI-RESTAURANT ORDERING:

1. Always speak naturally and conversationally, as if you're talking to someone through a drive-thru speaker.

2. RESTAURANT SELECTION (First Step):
   - Begin by helping customers choose a restaurant from our available options
   - Use the listRestaurants function to provide options
   - Confirm their restaurant selection before proceeding
   - Remember their selection throughout the conversation

3. MENU NAVIGATION (Second Step):
   - Once a restaurant is selected, help them browse that restaurant's specific menu
   - Use getMenuCategories to show available categories for the selected restaurant
   - Use getMenuItems to show items within a category
   - Keep track of which restaurant and category they're browsing

4. ORDER PLACEMENT (Third Step):
   - Take their order with any special instructions
   - Confirm each item before adding it to their order
   - Allow them to order multiple items from different categories
   - Keep a running total of their order

5. ORDER CONFIRMATION (Final Step):
   - Summarize their complete order including restaurant name, all items, and total
   - Confirm delivery/pickup details
   - Use placeOrder function with the correct restaurant ID

6. CONVERSATION FLOW:
   - Always maintain context of which restaurant they're ordering from
   - If they want to switch restaurants, confirm and reset their current order
   - If they seem confused, remind them which restaurant they're currently ordering from
   - Use a step-by-step approach, but allow flexibility if they want to jump ahead

7. VOICE OPTIMIZATION:
   - Keep all responses concise and easy to understand through voice
   - Break up long lists into manageable chunks
   - Confirm important details verbally
   - Remember that the customer can only interact with you through voice - there is no visual interface

The customer can order from any of our partner restaurants through this single voice interface. Be patient, helpful, and make the ordering process as smooth as possible.`,
    });

    // Define the function context with proper type annotation
    const fncCtx: llm.FunctionContext = {
      listRestaurants: {
        description: 'Get a list of available restaurants',
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
              // Format for voice readout
              if (restaurants.length === 0) {
                return 'I don\'t have any restaurants available at the moment.';
              }
              
              const restaurantList = restaurants.map(r => `${r.name}: ${r.description}`).join('. ');
              const restaurantNames = restaurants.map(r => r.name).join(', ');
              
              return `We have ${restaurants.length} restaurants available: ${restaurantNames}. ${restaurantList}. Which restaurant would you like to order from today?`;
            }
            
            // Return JSON for non-voice use
            return JSON.stringify(restaurants);
        },
      },

      getRestaurantInfo: {
        description: 'Get detailed information about a specific restaurant',
        parameters: z.object({
          restaurantId: z.string().describe('The ID of the restaurant to get information for'),
        }),
        execute: async ({ restaurantId }: { restaurantId: string }) => {
          console.debug(`retrieving information for restaurant: ${restaurantId}`);
          const restaurant = await getRestaurantById(restaurantId);
          if (!restaurant) {
            return JSON.stringify({ error: 'Restaurant not found' });
          }
          return JSON.stringify({
            id: restaurant.restaurant_id,
            name: restaurant.restaurant_name,
            description: restaurant.description,
            location: restaurant.location,
            notes: restaurant.notes
          });
        },
      },

      getMenuCategories: {
        description: 'Get menu categories for a specific restaurant',
        parameters: z.object({
          restaurantId: z.string().describe('The ID of the restaurant to get menu categories for'),
          formatForVoice: z.boolean().optional().describe('Whether to format the response for voice readout')
        }),
        execute: async ({ restaurantId, formatForVoice = true }: { restaurantId: string; formatForVoice?: boolean }) => {
            console.debug(`retrieving menu categories for restaurant: ${restaurantId}`);
            const categories = await getMenuCategories(restaurantId);
            const restaurant = await getRestaurantById(restaurantId);
            
            // Update conversation state with selected restaurant
            if (restaurant) {
              selectRestaurant(conversationState, restaurantId, restaurant.restaurant_name);
              updateLastFunction(conversationState, 'getMenuCategories');
              console.log(`Selected restaurant: ${restaurant.restaurant_name} (${restaurantId})`);
            }
            
            if (formatForVoice) {
              // Format for voice readout
              if (categories.length === 0) {
                return `I don't see any menu categories for ${restaurant?.restaurant_name || 'this restaurant'}.`;
              }
              
              const categoryList = categories.join(', ');
              return `${restaurant?.restaurant_name || 'This restaurant'} offers the following menu categories: ${categoryList}. Which category would you like to hear about?`;
            }
            
            // Return JSON for non-voice use
            return JSON.stringify(categories);
        },
      },
      
      getMenuItems: {
        description: 'Get menu items for a specific restaurant and category',
        parameters: z.object({
          restaurantId: z.string().describe('The ID of the restaurant'),
          category: z.string().describe('The menu category to retrieve items for'),
          formatForVoice: z.boolean().optional().describe('Whether to format the response for voice readout')
        }),
        execute: async ({ restaurantId, category, formatForVoice = true }: { restaurantId: string; category: string; formatForVoice?: boolean }) => {
            console.debug(`retrieving menu items for restaurant ${restaurantId}, category: ${category}`);
            
            const restaurant = await getRestaurantById(restaurantId);
            const restaurantName = restaurant?.restaurant_name || 'this restaurant';
            
            // Update conversation state with selected category
            selectCategory(conversationState, category);
            updateLastFunction(conversationState, 'getMenuItems');
            console.log(`Selected category: ${category}`);
            
            // If restaurant changed, update that as well
            if (conversationState.selectedRestaurantId !== restaurantId && restaurant) {
              selectRestaurant(conversationState, restaurantId, restaurant.restaurant_name);
              console.log(`Updated selected restaurant: ${restaurant.restaurant_name} (${restaurantId})`);
            }
          
            if (category.toLowerCase() === 'all') {
              const allItems = await getAllMenuItems(restaurantId);
            
            if (formatForVoice) {
              // Format all categories for voice readout
              if (Object.keys(allItems).length === 0) {
                return `I don't see any menu items for ${restaurantName}.`;
              }
              
              let response = `Here's the menu for ${restaurantName}:\n`;
              
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
              return `I don't see any items in the ${category} category for ${restaurantName}.`;
            }
            
            let response = `Here are the items in the ${category} category at ${restaurantName}:\n`;
            
            items.forEach((item: MenuItem) => {
              response += `${item.name}: $${item.price.toFixed(2)} - ${item.description}\n`;
            });
            
            return response;
          }
          
          return JSON.stringify(items);
        },
      },
      
      placeOrder: {
        description: 'Place a customer order with a specific restaurant',
        parameters: z.object({
          restaurantId: z.string().describe('The ID of the restaurant to place the order with'),
          items: z.array(z.object({
            id: z.string().optional().describe('ID of the menu item'),
            name: z.string().describe('Name of the menu item'),
            quantity: z.number().describe('Quantity of the item'),
            price: z.number().optional().describe('Price of the item'),
            specialInstructions: z.string().optional().describe('Any special instructions for this item')
          })).describe('List of items in the order'),
          customerName: z.string().optional().describe('Name of the customer for the order'),
          customerEmail: z.string().optional().describe('Email of the customer for order confirmation'),
          formatForVoice: z.boolean().optional().describe('Whether to format the response for voice readout')
        }),
        execute: async ({ restaurantId, items, customerName, customerEmail, formatForVoice = true }: { restaurantId: string; items: Array<{id?: string; name: string; quantity: number; price?: number; specialInstructions?: string}>; customerName?: string; customerEmail?: string; formatForVoice?: boolean }) => {
            console.debug(`placing order with restaurant ${restaurantId} for ${customerName || 'customer'}:`, items);
            
            // Update customer info in conversation state
            updateCustomerInfo(conversationState, customerName || 'Anonymous Customer', customerEmail);
            updateLastFunction(conversationState, 'placeOrder');
          
            // Add items to cart if not already there
            items.forEach((item: { name: string; quantity: number; price?: number; specialInstructions?: string }) => {
              addToCart(conversationState, {
                name: item.name,
                quantity: item.quantity,
                price: item.price,
                specialInstructions: item.specialInstructions
              });
            });
          
            console.log('Updated conversation state with order details');
            console.log('Cart items:', conversationState.cartItems);
          
            const restaurant = await getRestaurantById(restaurantId);
            if (!restaurant) {
              return formatForVoice
                ? `I'm sorry, but I couldn't find the restaurant you selected. Please try again with a different restaurant.`
                : JSON.stringify({
                    success: false,
                    message: 'Restaurant not found'
                  });
          }
          
            // Generate order details
            const orderNumber = Math.floor(Math.random() * 1000) + 1;
            const estimatedTime = Math.floor(Math.random() * 10) + 5; // 5-15 minutes
          
            // Calculate order total
            let orderTotal = 0;
            const itemsWithDetails = await Promise.all(items.map(async (item: any) => {
              // If price is not provided, try to find the item in the menu
              if (item.price === undefined) {
                const allCategories = restaurant.menu_categories;
                for (const category of allCategories) {
                  const menuItem = category.items.find(mi => 
                    mi.name.toLowerCase() === item.name.toLowerCase() || 
                    mi.id === item.id
                  );
                  if (menuItem) {
                    item.price = menuItem.price;
                    item.id = item.id || menuItem.id;
                    break;
                  }
                }
              }
            
              if (item.price !== undefined) {
                orderTotal += item.price * item.quantity;
              }
              
              return item;
          }));
          
            // Create order object with more details
            const order = {
              orderNumber,
              restaurantId,
              restaurantName: restaurant.restaurant_name,
              customerName: customerName || 'Anonymous Customer',
              customerEmail: customerEmail,
              items: itemsWithDetails,
              orderTotal: parseFloat(orderTotal.toFixed(2)),
              timestamp: new Date().toISOString(),
              estimatedTime,
              status: 'confirmed'
            };
          
            // Send notification email to restaurant
            await sendOrderNotification(restaurantId, order);
          
            // Mark order as completed in conversation state
            completeOrder(conversationState);
            console.log('Order completed, conversation state reset');
          

            
            if (formatForVoice) {
              // Format order summary for voice readout
              let orderSummary = `Thank you for your order with ${restaurant.restaurant_name}. `;
              orderSummary += `Your order number is ${orderNumber}. Here's a summary of your order:\n\n`;
            
              items.forEach((item: any) => {
                orderSummary += `${item.quantity} ${item.name}${item.specialInstructions ? ` (${item.specialInstructions})` : ''}\n`;
              });
            
              orderSummary += `\nYour order total is $${orderTotal.toFixed(2)}. `;
              orderSummary += `Your estimated wait time is ${estimatedTime} minutes. `;
            
              if (restaurant.location && restaurant.location.address) {
                orderSummary += `Please pick up your order at ${restaurant.location.address}. `;
              }
            
              orderSummary += `Thank you for using our voice ordering service!`;
            
              return orderSummary;
            }
            
            return JSON.stringify({
              success: true,
              orderNumber,
              restaurantName: restaurant.restaurant_name,
              items: itemsWithDetails,
              orderTotal: parseFloat(orderTotal.toFixed(2)),
              estimatedTime,
              message: `Order #${orderNumber} has been placed with ${restaurant.restaurant_name}${customerName ? ` for ${customerName}` : ''}. Your estimated wait time is ${estimatedTime} minutes. Thank you for your order!`
            });
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

cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }));
