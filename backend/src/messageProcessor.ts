// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Message processor for handling different conversation stages
 */

import { ConversationState, ConversationStage } from './conversationState.js';


// Define a type for the agent context based on the existing code structure
type AgentContext = {
  agent: {
    sendText: (text: string) => Promise<void>;
  };
  room: any;
};

/**
 * Process an incoming message based on the current conversation stage
 * 
 * @param ctx Agent context
 * @param message The incoming message
 * @param conversationState Current conversation state
 * @returns Updated conversation state
 */
export async function processMessage(
  ctx: AgentContext,
  message: string,
  conversationState: ConversationState
): Promise<ConversationState> {
  console.log(`Processing message in stage: ${conversationState.stage}`);
  
  
  // For all other stages, return the state unchanged
  return conversationState;
}

/**
 * Check if the current message should be intercepted for special handling
 * 
 * @param message The incoming message
 * @param conversationState Current conversation state
 * @returns True if the message should be intercepted
 */
export function shouldInterceptMessage(
  message: string,
  conversationState: ConversationState
): boolean {
  // No special stages to intercept anymore
  return false;
}

/**
 * Integration function to be called before passing a message to the agent
 * 
 * @param ctx Agent context
 * @param message The incoming message
 * @param conversationState Current conversation state
 * @returns Updated conversation state and whether to continue normal processing
 */
export async function preprocessMessage(
  ctx: AgentContext,
  message: string,
  conversationState: ConversationState
): Promise<{ state: ConversationState; continueProcessing: boolean }> {
  // Check if we should intercept this message
  if (shouldInterceptMessage(message, conversationState)) {
    // Process the message based on current stage
    const updatedState = await processMessage(ctx, message, conversationState);
    
    // Always continue normal processing
    const continueProcessing = true;
    
    return { state: updatedState, continueProcessing };
  }
  
  // For all other messages, continue normal processing
  return { state: conversationState, continueProcessing: true };
}
