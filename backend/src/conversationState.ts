// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Interface for conversation state
 */
export interface ConversationState {
  // Current selected restaurant ID
  selectedRestaurantId?: string;
  
  // Current selected restaurant name
  selectedRestaurantName?: string;
  
  // Current menu category being browsed
  currentCategory?: string;
  
  // Current cart items
  cartItems: CartItem[];
  
  // Customer information
  customerName?: string;
  customerEmail?: string;
  
  // Conversation stage
  stage: ConversationStage;
  
  // Last function called
  lastFunction?: string;
}

/**
 * Interface for cart items
 */
export interface CartItem {
  id?: string;
  name: string;
  quantity: number;
  price?: number;
  specialInstructions?: string;
}

/**
 * Enum for conversation stages
 */
export enum ConversationStage {
  GREETING = 'greeting',
  RESTAURANT_SELECTION = 'restaurant_selection',
  MENU_BROWSING = 'menu_browsing',
  CATEGORY_SELECTION = 'category_selection',
  ITEM_SELECTION = 'item_selection',
  ORDER_CONFIRMATION = 'order_confirmation',
  ORDER_COMPLETED = 'order_completed'
}

/**
 * Create a new conversation state
 */
export function createInitialState(): ConversationState {
  return {
    cartItems: [],
    stage: ConversationStage.GREETING
  };
}

/**
 * Update the restaurant selection in the conversation state
 */
export function selectRestaurant(
  state: ConversationState,
  restaurantId: string,
  restaurantName: string
): ConversationState {
  return {
    ...state,
    selectedRestaurantId: restaurantId,
    selectedRestaurantName: restaurantName,
    stage: ConversationStage.MENU_BROWSING
  };
}

/**
 * Update the category selection in the conversation state
 */
export function selectCategory(
  state: ConversationState,
  category: string
): ConversationState {
  return {
    ...state,
    currentCategory: category,
    stage: ConversationStage.ITEM_SELECTION
  };
}

/**
 * Add an item to the cart
 */
export function addToCart(
  state: ConversationState,
  item: CartItem
): ConversationState {
  // Check if the item is already in the cart
  const existingItemIndex = state.cartItems.findIndex(
    cartItem => cartItem.name.toLowerCase() === item.name.toLowerCase()
  );

  let updatedCartItems;
  
  if (existingItemIndex >= 0) {
    // Update the existing item
    updatedCartItems = [...state.cartItems];
    updatedCartItems[existingItemIndex] = {
      ...updatedCartItems[existingItemIndex],
      quantity: updatedCartItems[existingItemIndex].quantity + item.quantity,
      specialInstructions: item.specialInstructions || updatedCartItems[existingItemIndex].specialInstructions
    };
  } else {
    // Add the new item
    updatedCartItems = [...state.cartItems, item];
  }
  
  return {
    ...state,
    cartItems: updatedCartItems
  };
}

/**
 * Remove an item from the cart
 */
export function removeFromCart(
  state: ConversationState,
  itemName: string
): ConversationState {
  const updatedCartItems = state.cartItems.filter(
    item => item.name.toLowerCase() !== itemName.toLowerCase()
  );
  
  return {
    ...state,
    cartItems: updatedCartItems
  };
}

/**
 * Update customer information
 */
export function updateCustomerInfo(
  state: ConversationState,
  name?: string,
  email?: string
): ConversationState {
  return {
    ...state,
    customerName: name || state.customerName,
    customerEmail: email || state.customerEmail,
    stage: ConversationStage.ORDER_CONFIRMATION
  };
}

/**
 * Clear the cart and reset the order state
 */
export function resetOrder(state: ConversationState): ConversationState {
  return {
    ...state,
    cartItems: [],
    currentCategory: undefined,
    stage: state.selectedRestaurantId 
      ? ConversationStage.MENU_BROWSING 
      : ConversationStage.RESTAURANT_SELECTION
  };
}

/**
 * Complete the order and reset to initial state
 */
export function completeOrder(state: ConversationState): ConversationState {
  return {
    ...state,
    cartItems: [],
    currentCategory: undefined,
    stage: ConversationStage.ORDER_COMPLETED
  };
}

/**
 * Update the conversation stage
 */
export function updateStage(
  state: ConversationState,
  stage: ConversationStage
): ConversationState {
  return {
    ...state,
    stage
  };
}

/**
 * Update the last function called
 */
export function updateLastFunction(
  state: ConversationState,
  functionName: string
): ConversationState {
  return {
    ...state,
    lastFunction: functionName
  };
}
