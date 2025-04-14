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
  
  // Payment information
  paymentLinkId?: string;
  paymentLinkUrl?: string;
  paymentStatus?: string;
  
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
  // Initial stages
  GREETING = 'greeting',
  RESTAURANT_SELECTION = 'restaurant_selection',
  
  // Menu and ordering stages
  MENU_BROWSING = 'menu_browsing',
  CATEGORY_SELECTION = 'category_selection',
  ITEM_SELECTION = 'item_selection',
  ORDER_CONFIRMATION = 'order_confirmation',
  CUSTOMER_INFO = 'customer_info',
  
  // Payment stages
  PAYMENT_METHOD_SELECTION = 'payment_method_selection',  // Choosing payment method (online vs. at pickup)
  PAYMENT_LINK_GENERATION = 'payment_link_generation',    // Generating payment link
  PAYMENT_LINK_SHARED = 'payment_link_shared',           // Payment link has been shared with customer
  PAYMENT_CONFIRMATION = 'payment_confirmation',         // Confirming payment has been completed
  PAYMENT_COMPLETED = 'payment_completed',              // Payment has been successfully processed
  
  // Final stages
  ORDER_COMPLETE = 'order_complete',
  IDLE = 'idle'
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
    stage: ConversationStage.ORDER_COMPLETE
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
  state.lastFunction = functionName;
  
  console.log(`Updated last function called to: ${functionName}`);
  
  return state;
}

/**
 * Set payment information in the conversation state
 * @param state The current conversation state
 * @param paymentLinkId The ID of the payment link
 * @param paymentLinkUrl The URL of the payment link
 * @param paymentStatus Optional payment status
 * @returns Updated conversation state
 */
export function setPaymentInfo(
  state: ConversationState,
  paymentLinkId: string,
  paymentLinkUrl: string,
  paymentStatus: string = 'pending'
): ConversationState {
  state.paymentLinkId = paymentLinkId;
  state.paymentLinkUrl = paymentLinkUrl;
  state.paymentStatus = paymentStatus;
  
  // Update the conversation stage to payment link shared
  updateStage(state, ConversationStage.PAYMENT_LINK_SHARED);
  
  console.log(`Set payment information: ID=${paymentLinkId}, Status=${paymentStatus}`);
  
  return state;
}

/**
 * Start the payment method selection process
 * @param state The current conversation state
 * @returns Updated conversation state
 */
export function startPaymentMethodSelection(state: ConversationState): ConversationState {
  updateStage(state, ConversationStage.PAYMENT_METHOD_SELECTION);
  console.log('Starting payment method selection');
  return state;
}

/**
 * Start the payment link generation process
 * @param state The current conversation state
 * @returns Updated conversation state
 */
export function startPaymentLinkGeneration(state: ConversationState): ConversationState {
  updateStage(state, ConversationStage.PAYMENT_LINK_GENERATION);
  console.log('Starting payment link generation');
  return state;
}

/**
 * Update the payment status and stage
 * @param state The current conversation state
 * @param status The new payment status
 * @returns Updated conversation state
 */
export function updatePaymentStatus(
  state: ConversationState,
  status: string
): ConversationState {
  state.paymentStatus = status;
  
  // Update stage based on payment status
  if (status === 'completed' || status === 'succeeded') {
    updateStage(state, ConversationStage.PAYMENT_COMPLETED);
  } else if (status === 'pending') {
    updateStage(state, ConversationStage.PAYMENT_CONFIRMATION);
  }
  
  console.log(`Updated payment status to: ${status}`);
  return state;
}
