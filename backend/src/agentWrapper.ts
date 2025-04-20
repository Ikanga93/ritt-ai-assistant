// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Agent wrapper to intercept messages and handle email collection
 */

import { ConversationState, ConversationStage } from './conversationState.js';
import { preprocessMessage } from './messageProcessor.js';

// Store conversation state globally for access in the wrapper
let globalConversationState: ConversationState | null = null;

/**
 * Set the global conversation state for the wrapper to use
 * 
 * @param state Current conversation state
 */
export function setGlobalConversationState(state: ConversationState): void {
  globalConversationState = state;
}

/**
 * Get the global conversation state
 * 
 * @returns Current conversation state or null if not set
 */
export function getGlobalConversationState(): ConversationState | null {
  return globalConversationState;
}

/**
 * Update the global conversation state
 * 
 * @param updater Function to update the state
 */
export function updateGlobalConversationState(
  updater: (state: ConversationState) => ConversationState
): void {
  if (globalConversationState) {
    globalConversationState = updater(globalConversationState);
  }
}

/**
 * Intercept and process a message before it's sent to the agent
 * 
 * @param ctx Agent context
 * @param message The incoming message
 * @returns Whether to continue normal processing
 */
export async function interceptMessage(
  ctx: any,
  message: string
): Promise<boolean> {
  // If we don't have a conversation state, continue normal processing
  if (!globalConversationState) {
    return true;
  }
  
  // Process the message using our message processor
  const { state, continueProcessing } = await preprocessMessage(
    ctx,
    message,
    globalConversationState
  );
  
  // Update the global state with the processed state
  setGlobalConversationState(state);
  
  // Return whether to continue normal processing
  return continueProcessing;
}

/**
 * Previously checked if the current conversation stage is related to email collection
 * Now always returns false since email functionality has been removed
 * 
 * @returns Always false
 */
export function isInEmailStage(): boolean {
  return false;
}
