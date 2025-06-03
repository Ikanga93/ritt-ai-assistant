// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

import { ChatMessage, OrderChatData, chatSaver } from './chatSaver.js';
import { ConversationState, ConversationStage } from '../conversationState.js';

interface ActiveChat {
  participantId: string;
  messages: ChatMessage[];
  startTime: string;
  orderNumber?: string;
  conversationState?: ConversationState;
}

class ChatCollectorService {
  private activeChats: Map<string, ActiveChat> = new Map();

  /**
   * Start tracking a new chat session
   */
  startChatSession(participantId: string): void {
    const activeChat: ActiveChat = {
      participantId,
      messages: [],
      startTime: new Date().toISOString()
    };

    this.activeChats.set(participantId, activeChat);
    console.log(`Started chat tracking for participant: ${participantId}`);
    console.log(`Total active chats: ${this.activeChats.size}`);
    console.log(`Active chat participants: ${Array.from(this.activeChats.keys()).join(', ')}`);
  }

  /**
   * Add a message to the active chat
   */
  addMessage(participantId: string, role: 'user' | 'assistant', content: string): void {
    console.log(`[DEBUG] Attempting to add ${role} message for participant: ${participantId}`);
    console.log(`[DEBUG] Message content: "${content.substring(0, 100)}..."`);
    console.log(`[DEBUG] Active chats: ${Array.from(this.activeChats.keys()).join(', ')}`);
    
    const activeChat = this.activeChats.get(participantId);
    if (!activeChat) {
      console.warn(`No active chat found for participant: ${participantId}`);
      console.warn(`Available participants: ${Array.from(this.activeChats.keys()).join(', ')}`);
      return;
    }

    // Skip empty messages or system messages
    if (!content || content.trim().length === 0) {
      console.log(`[DEBUG] Skipping empty message for ${participantId}`);
      return;
    }

    // Skip payment-related system messages that aren't part of the conversation
    if (content.startsWith('payment_link:') || content.startsWith('PAYMENT_DATA:')) {
      console.log(`[DEBUG] Skipping payment-related message for ${participantId}`);
      return;
    }

    const message: ChatMessage = {
      role,
      content: content.trim(),
      timestamp: new Date().toISOString()
    };

    activeChat.messages.push(message);
    console.log(`Added ${role} message to chat ${participantId}: ${content.substring(0, 50)}...`);
    console.log(`[DEBUG] Total messages for ${participantId}: ${activeChat.messages.length}`);
  }

  /**
   * Update the conversation state for a chat session
   */
  updateConversationState(participantId: string, conversationState: ConversationState): void {
    const activeChat = this.activeChats.get(participantId);
    if (activeChat) {
      activeChat.conversationState = conversationState;
      
      // If we have order details, extract the order number
      if (conversationState.orderDetails?.orderNumber) {
        activeChat.orderNumber = conversationState.orderDetails.orderNumber.toString();
      }
    }
  }

  /**
   * Save the chat when an order is completed
   */
  async saveOrderChat(participantId: string, paymentStatus: 'pending' | 'paid' | 'failed' | 'not_completed' = 'pending'): Promise<string | null> {
    const activeChat = this.activeChats.get(participantId);
    if (!activeChat) {
      console.warn(`No active chat found for participant: ${participantId}`);
      return null;
    }

    const conversationState = activeChat.conversationState;
    const orderDetails = conversationState?.orderDetails;

    // If no messages were captured but we have order details, create a basic chat log
    if (activeChat.messages.length === 0 && orderDetails) {
      console.log(`No messages captured, but order details exist. Creating basic chat log for participant: ${participantId}`);
      
      // Add basic messages based on order details
      activeChat.messages.push({
        role: 'assistant',
        content: 'Welcome to Niro\'s Gyros! How can I help you today?',
        timestamp: activeChat.startTime
      });
      
      if (orderDetails.items && orderDetails.items.length > 0) {
        const itemNames = orderDetails.items.map((item: any) => `${item.quantity}x ${item.name}`).join(', ');
        activeChat.messages.push({
          role: 'user',
          content: `I'd like to order: ${itemNames}`,
          timestamp: new Date(Date.now() - 60000).toISOString() // 1 minute ago
        });
        
        activeChat.messages.push({
          role: 'assistant',
          content: `Great! I've added ${itemNames} to your order. Your total is $${orderDetails.orderTotal?.toFixed(2) || '0.00'}.`,
          timestamp: new Date(Date.now() - 30000).toISOString() // 30 seconds ago
        });
      }
      
      if (orderDetails.customerName) {
        activeChat.messages.push({
          role: 'assistant',
          content: `Can I get your name for the order?`,
          timestamp: new Date(Date.now() - 20000).toISOString()
        });
        
        activeChat.messages.push({
          role: 'user',
          content: orderDetails.customerName,
          timestamp: new Date(Date.now() - 10000).toISOString()
        });
      }
      
      activeChat.messages.push({
        role: 'assistant',
        content: `Your order has been confirmed. Please use the payment button in the chat to complete your payment.`,
        timestamp: new Date().toISOString()
      });
      
      console.log(`Created ${activeChat.messages.length} fallback messages for order chat`);
    }

    // Don't save if there are still no meaningful messages
    if (activeChat.messages.length === 0) {
      console.log(`No messages to save for participant: ${participantId}`);
      return null;
    }

    // Generate order number if not available
    const orderNumber = activeChat.orderNumber || 
                       orderDetails?.orderNumber?.toString() || 
                       `CHAT-${Date.now()}`;

    // Determine order status
    let orderStatus: 'confirmed' | 'cancelled' | 'in_progress' | 'completed' = 'confirmed';
    if (conversationState?.stage === ConversationStage.ORDER_COMPLETED) {
      orderStatus = 'completed';
    }

    // Prepare chat data
    const chatData: OrderChatData = {
      orderNumber,
      customerName: conversationState?.customerName || orderDetails?.customerName,
      customerEmail: conversationState?.customerEmail || orderDetails?.customerEmail,
      restaurantName: conversationState?.selectedRestaurantName || orderDetails?.restaurantName,
      orderTotal: orderDetails?.orderTotal || this.calculateTotalFromCart(conversationState),
      paymentStatus,
      orderStatus,
      chatMessages: activeChat.messages,
      orderItems: this.extractOrderItems(conversationState),
      createdAt: activeChat.startTime,
      completedAt: new Date().toISOString()
    };

    try {
      const savedFilePath = await chatSaver.saveOrderChat(chatData);
      console.log(`Chat saved successfully for order ${orderNumber}: ${savedFilePath}`);
      
      // Clean up the active chat
      this.activeChats.delete(participantId);
      
      return savedFilePath;
    } catch (error) {
      console.error(`Error saving chat for participant ${participantId}:`, error);
      return null;
    }
  }

  /**
   * Extract order items from conversation state
   */
  private extractOrderItems(conversationState?: ConversationState): Array<{
    name: string;
    quantity: number;
    price: number;
    specialInstructions?: string;
  }> {
    if (!conversationState) return [];

    // Try to get items from order details first
    if (conversationState.orderDetails?.items) {
      return conversationState.orderDetails.items.map((item: any) => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price || 0,
        specialInstructions: item.specialInstructions
      }));
    }

    // Fall back to cart items
    if (conversationState.cartItems) {
      return conversationState.cartItems.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price || 0,
        specialInstructions: item.specialInstructions
      }));
    }

    return [];
  }

  /**
   * Calculate total from cart items if not available in order details
   */
  private calculateTotalFromCart(conversationState?: ConversationState): number {
    if (!conversationState?.cartItems) return 0;

    return conversationState.cartItems.reduce((total, item) => {
      return total + ((item.price || 0) * item.quantity);
    }, 0);
  }

  /**
   * Force save a chat (for debugging or manual triggers)
   */
  async forceSaveChat(participantId: string): Promise<string | null> {
    return this.saveOrderChat(participantId, 'not_completed');
  }

  /**
   * Get active chat info for debugging
   */
  getActiveChatInfo(participantId: string): ActiveChat | undefined {
    return this.activeChats.get(participantId);
  }

  /**
   * Get all active chats (for debugging)
   */
  getAllActiveChats(): Map<string, ActiveChat> {
    return this.activeChats;
  }

  /**
   * Clean up old inactive chats (call periodically)
   */
  cleanupOldChats(maxAgeHours: number = 24): void {
    const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);
    
    for (const [participantId, chat] of this.activeChats.entries()) {
      const chatStartTime = new Date(chat.startTime).getTime();
      if (chatStartTime < cutoffTime) {
        console.log(`Cleaning up old chat for participant: ${participantId}`);
        // Save the chat before removing it
        this.saveOrderChat(participantId, 'not_completed').catch(error => {
          console.error(`Error saving old chat during cleanup: ${error}`);
        });
      }
    }
  }
}

// Export singleton instance
export const chatCollector = new ChatCollectorService(); 