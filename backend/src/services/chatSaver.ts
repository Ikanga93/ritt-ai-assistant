// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

import fs from 'fs';
import path from 'path';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface OrderChatData {
  orderNumber: string;
  customerName?: string;
  customerEmail?: string;
  restaurantName?: string;
  orderTotal?: number;
  paymentStatus: 'pending' | 'paid' | 'failed' | 'not_completed';
  orderStatus: 'confirmed' | 'cancelled' | 'in_progress' | 'completed';
  chatMessages: ChatMessage[];
  orderItems?: Array<{
    name: string;
    quantity: number;
    price: number;
    specialInstructions?: string;
  }>;
  createdAt: string;
  completedAt?: string;
}

class ChatSaverService {
  private chatSaveDir: string;

  constructor() {
    // Create a new folder specifically for chat logs
    this.chatSaveDir = path.join(process.cwd(), 'data', 'order-chats');
    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.chatSaveDir)) {
      fs.mkdirSync(this.chatSaveDir, { recursive: true });
      console.log(`Created order-chats directory: ${this.chatSaveDir}`);
    }
  }

  /**
   * Save a complete order chat to a text file
   */
  async saveOrderChat(chatData: OrderChatData): Promise<string> {
    try {
      const filename = `ORDER-${chatData.orderNumber}-${Date.now()}.txt`;
      const filepath = path.join(this.chatSaveDir, filename);

      const chatContent = this.formatChatAsText(chatData);
      
      fs.writeFileSync(filepath, chatContent, 'utf8');
      
      console.log(`Order chat saved: ${filepath}`);
      return filepath;
    } catch (error) {
      console.error('Error saving order chat:', error);
      throw error;
    }
  }

  /**
   * Format chat data as readable text
   */
  private formatChatAsText(chatData: OrderChatData): string {
    const lines: string[] = [];
    
    // Header
    lines.push('='.repeat(80));
    lines.push('ORDER CHAT LOG');
    lines.push('='.repeat(80));
    lines.push('');
    
    // Order Information
    lines.push('ORDER DETAILS:');
    lines.push(`Order Number: ${chatData.orderNumber}`);
    lines.push(`Customer Name: ${chatData.customerName || 'Not provided'}`);
    lines.push(`Customer Email: ${chatData.customerEmail || 'Not provided'}`);
    lines.push(`Restaurant: ${chatData.restaurantName || 'Not specified'}`);
    lines.push(`Order Total: $${chatData.orderTotal?.toFixed(2) || '0.00'}`);
    lines.push(`Payment Status: ${chatData.paymentStatus.toUpperCase()}`);
    lines.push(`Order Status: ${chatData.orderStatus.toUpperCase()}`);
    lines.push(`Created At: ${chatData.createdAt}`);
    if (chatData.completedAt) {
      lines.push(`Completed At: ${chatData.completedAt}`);
    }
    lines.push('');

    // Order Items
    if (chatData.orderItems && chatData.orderItems.length > 0) {
      lines.push('ORDER ITEMS:');
      chatData.orderItems.forEach((item, index) => {
        lines.push(`${index + 1}. ${item.name}`);
        lines.push(`   Quantity: ${item.quantity}`);
        lines.push(`   Price: $${item.price.toFixed(2)}`);
        if (item.specialInstructions) {
          lines.push(`   Special Instructions: ${item.specialInstructions}`);
        }
        lines.push('');
      });
    }

    // Chat Conversation
    lines.push('-'.repeat(80));
    lines.push('CHAT CONVERSATION:');
    lines.push('-'.repeat(80));
    lines.push('');

    chatData.chatMessages.forEach((message, index) => {
      const timestamp = new Date(message.timestamp).toLocaleString();
      const speaker = message.role === 'user' ? 'CUSTOMER' : 'ASSISTANT';
      
      lines.push(`[${timestamp}] ${speaker}:`);
      lines.push(message.content);
      lines.push('');
    });

    // Footer
    lines.push('='.repeat(80));
    lines.push('END OF CHAT LOG');
    lines.push('='.repeat(80));

    return lines.join('\n');
  }

  /**
   * Add a message to an ongoing chat (for real-time saving)
   */
  async addMessageToChat(orderNumber: string, message: ChatMessage): Promise<void> {
    // This could be used for real-time chat logging if needed
    // For now, we'll focus on saving complete chats
    console.log(`Message added to order ${orderNumber}: ${message.role} - ${message.content.substring(0, 50)}...`);
  }

  /**
   * Get all saved chat files
   */
  async getAllChatFiles(): Promise<string[]> {
    try {
      const files = fs.readdirSync(this.chatSaveDir);
      return files.filter(file => file.endsWith('.txt') && file.startsWith('ORDER-'));
    } catch (error) {
      console.error('Error reading chat files:', error);
      return [];
    }
  }

  /**
   * Read a specific chat file
   */
  async readChatFile(filename: string): Promise<string> {
    try {
      const filepath = path.join(this.chatSaveDir, filename);
      return fs.readFileSync(filepath, 'utf8');
    } catch (error) {
      console.error(`Error reading chat file ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Create a summary report of all chats
   */
  async createChatSummaryReport(): Promise<string> {
    try {
      const chatFiles = await this.getAllChatFiles();
      const summaryLines: string[] = [];
      
      summaryLines.push('ORDER CHAT SUMMARY REPORT');
      summaryLines.push('Generated: ' + new Date().toLocaleString());
      summaryLines.push('='.repeat(60));
      summaryLines.push('');
      
      summaryLines.push(`Total Chat Files: ${chatFiles.length}`);
      summaryLines.push('');
      
      // List all files with basic info
      summaryLines.push('CHAT FILES:');
      chatFiles.forEach((file, index) => {
        const filepath = path.join(this.chatSaveDir, file);
        const stats = fs.statSync(filepath);
        summaryLines.push(`${index + 1}. ${file}`);
        summaryLines.push(`   Created: ${stats.birthtime.toLocaleString()}`);
        summaryLines.push(`   Size: ${stats.size} bytes`);
        summaryLines.push('');
      });
      
      const summaryContent = summaryLines.join('\n');
      const summaryFilepath = path.join(this.chatSaveDir, `CHAT-SUMMARY-${Date.now()}.txt`);
      fs.writeFileSync(summaryFilepath, summaryContent, 'utf8');
      
      console.log(`Chat summary report created: ${summaryFilepath}`);
      return summaryFilepath;
    } catch (error) {
      console.error('Error creating chat summary report:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const chatSaver = new ChatSaverService(); 