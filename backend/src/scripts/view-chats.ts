#!/usr/bin/env node

import { chatSaver } from '../services/chatSaver.js';
import fs from 'fs';
import path from 'path';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'list':
      await listChats();
      break;
    case 'view':
      const filename = args[1];
      if (!filename) {
        console.error('Usage: npm run view-chats view <filename>');
        process.exit(1);
      }
      await viewChat(filename);
      break;
    case 'summary':
      await createSummary();
      break;
    case 'latest':
      await viewLatestChat();
      break;
    default:
      console.log('Available commands:');
      console.log('  list     - List all saved chat files');
      console.log('  view     - View a specific chat file');
      console.log('  summary  - Create a summary report');
      console.log('  latest   - View the most recent chat');
      console.log('');
      console.log('Usage examples:');
      console.log('  npm run view-chats list');
      console.log('  npm run view-chats view ORDER-123-1234567890.txt');
      console.log('  npm run view-chats summary');
      console.log('  npm run view-chats latest');
      break;
  }
}

async function listChats() {
  try {
    const files = await chatSaver.getAllChatFiles();
    
    if (files.length === 0) {
      console.log('No chat files found.');
      return;
    }

    console.log(`Found ${files.length} chat files:\n`);
    
    const chatDir = path.join(process.cwd(), 'data', 'order-chats');
    
    files.forEach((file, index) => {
      const filepath = path.join(chatDir, file);
      const stats = fs.statSync(filepath);
      const size = (stats.size / 1024).toFixed(2);
      
      console.log(`${index + 1}. ${file}`);
      console.log(`   Created: ${stats.birthtime.toLocaleString()}`);
      console.log(`   Size: ${size} KB`);
      console.log('');
    });
  } catch (error) {
    console.error('Error listing chats:', error);
  }
}

async function viewChat(filename: string) {
  try {
    const content = await chatSaver.readChatFile(filename);
    console.log(content);
  } catch (error) {
    console.error(`Error reading chat file ${filename}:`, error);
  }
}

async function createSummary() {
  try {
    const summaryPath = await chatSaver.createChatSummaryReport();
    console.log(`Summary report created: ${summaryPath}`);
    
    // Also display the summary
    const content = fs.readFileSync(summaryPath, 'utf8');
    console.log('\n' + content);
  } catch (error) {
    console.error('Error creating summary:', error);
  }
}

async function viewLatestChat() {
  try {
    const files = await chatSaver.getAllChatFiles();
    
    if (files.length === 0) {
      console.log('No chat files found.');
      return;
    }

    const chatDir = path.join(process.cwd(), 'data', 'order-chats');
    
    // Sort files by creation time (newest first)
    const filesWithStats = files.map(file => {
      const filepath = path.join(chatDir, file);
      const stats = fs.statSync(filepath);
      return { file, stats };
    });
    
    filesWithStats.sort((a, b) => b.stats.birthtime.getTime() - a.stats.birthtime.getTime());
    
    const latestFile = filesWithStats[0].file;
    console.log(`Viewing latest chat: ${latestFile}\n`);
    
    await viewChat(latestFile);
  } catch (error) {
    console.error('Error viewing latest chat:', error);
  }
}

main().catch(console.error); 