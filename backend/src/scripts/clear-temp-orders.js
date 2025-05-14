#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const TEMP_ORDERS_DIR = path.join(process.cwd(), 'data', 'temp-orders');
const TEMP_ORDERS_INDEX = path.join(TEMP_ORDERS_DIR, 'index.json');

console.log(`Clearing temporary orders from: ${TEMP_ORDERS_DIR}`);

// Ensure the directory exists
if (!fs.existsSync(TEMP_ORDERS_DIR)) {
  console.error(`Temp orders directory not found: ${TEMP_ORDERS_DIR}`);
  process.exit(1);
}

// Get all order files
const orderFiles = fs.readdirSync(TEMP_ORDERS_DIR)
  .filter(file => file.startsWith('TEMP-') && file.endsWith('.json'));

console.log(`Found ${orderFiles.length} temporary order files to delete.`);

// Delete each order file
let deletedCount = 0;
orderFiles.forEach(file => {
  const orderPath = path.join(TEMP_ORDERS_DIR, file);
  try {
    fs.unlinkSync(orderPath);
    deletedCount++;
    console.log(`Deleted: ${file}`);
  } catch (error) {
    console.error(`Failed to delete ${file}: ${error.message}`);
  }
});

// Reset the index file
try {
  fs.writeFileSync(TEMP_ORDERS_INDEX, JSON.stringify([]), 'utf8');
  console.log('Reset order index file.');
} catch (error) {
  console.error(`Failed to reset index file: ${error.message}`);
}

console.log(`Successfully deleted ${deletedCount} of ${orderFiles.length} temporary order files.`);
