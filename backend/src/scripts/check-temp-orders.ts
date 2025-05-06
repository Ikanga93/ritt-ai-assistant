/**
 * Check Temporary Orders Script
 * 
 * This script checks the temporary order storage to see if there are any pending orders.
 * Run with: npx tsx src/scripts/check-temp-orders.ts
 */

import fs from 'fs';
import path from 'path';
import { temporaryOrderService } from '../services/temporaryOrderService.js';

async function checkTempOrders() {
  console.log('\n=== Temporary Order Storage Check ===\n');
  
  try {
    // Get all orders from the temporary order service
    const orders = temporaryOrderService.listOrders();
    
    console.log(`Found ${orders.length} temporary orders in memory.`);
    
    // Check if there are any orders
    if (orders.length === 0) {
      console.log('No temporary orders found in memory.');
      
      // Check if there are any files in the temp-orders directory
      const tempOrdersDir = path.join(process.cwd(), 'data', 'temp-orders');
      
      if (fs.existsSync(tempOrdersDir)) {
        const files = fs.readdirSync(tempOrdersDir);
        const orderFiles = files.filter(file => file !== 'index.json' && file.endsWith('.json'));
        
        console.log(`\nFound ${orderFiles.length} order files in the temp-orders directory.`);
        
        if (orderFiles.length > 0) {
          console.log('\nOrder files:');
          for (const file of orderFiles) {
            console.log(`- ${file}`);
            
            // Read the file to get more details
            try {
              const orderData = JSON.parse(fs.readFileSync(path.join(tempOrdersDir, file), 'utf8'));
              console.log(`  ID: ${orderData.id}`);
              console.log(`  Customer: ${orderData.customerName}`);
              console.log(`  Email: ${orderData.customerEmail || 'No email'}`);
              console.log(`  Created: ${new Date(orderData.createdAt).toLocaleString()}`);
              console.log(`  Expires: ${new Date(orderData.expiresAt).toLocaleString()}`);
              console.log(`  Items: ${orderData.items.length}`);
              console.log(`  Total: $${orderData.total.toFixed(2)}`);
              
              // Check if there's payment link metadata
              if (orderData.metadata?.paymentLink) {
                console.log(`  Payment Link: ${orderData.metadata.paymentLink.url}`);
                console.log(`  Payment Status: ${orderData.metadata.paymentStatus || 'unknown'}`);
              } else {
                console.log(`  No payment link found`);
              }
              
              // Check if there's email status metadata
              if (orderData.metadata?.emailStatus) {
                console.log(`  Email Sent: ${orderData.metadata.emailStatus.paymentLinkEmailSent ? 'Yes' : 'No'}`);
                if (orderData.metadata.emailStatus.paymentLinkEmailSentAt) {
                  console.log(`  Email Sent At: ${new Date(orderData.metadata.emailStatus.paymentLinkEmailSentAt).toLocaleString()}`);
                }
                if (orderData.metadata.emailStatus.paymentLinkEmailError) {
                  console.log(`  Email Error: ${orderData.metadata.emailStatus.paymentLinkEmailError}`);
                }
              } else {
                console.log(`  No email status found`);
              }
              
              console.log('');
            } catch (error) {
              console.error(`Error reading file ${file}:`, error);
            }
          }
        }
      } else {
        console.log('\nTemp-orders directory does not exist.');
      }
    } else {
      // Display details of each order
      console.log('\nOrder details:');
      
      for (const order of orders) {
        console.log(`\nOrder ID: ${order.id}`);
        console.log(`Customer: ${order.customerName}`);
        console.log(`Email: ${order.customerEmail || 'No email'}`);
        console.log(`Created: ${new Date(order.createdAt).toLocaleString()}`);
        console.log(`Expires: ${new Date(order.expiresAt).toLocaleString()}`);
        console.log(`Items: ${order.items.length}`);
        console.log(`Total: $${order.total.toFixed(2)}`);
        
        // Check if there's payment link metadata
        if (order.metadata?.paymentLink) {
          console.log(`Payment Link: ${order.metadata.paymentLink.url}`);
          console.log(`Payment Status: ${order.metadata.paymentStatus || 'unknown'}`);
        } else {
          console.log(`No payment link found`);
        }
        
        // Check if there's email status metadata
        if (order.metadata?.emailStatus) {
          console.log(`Email Sent: ${order.metadata.emailStatus.paymentLinkEmailSent ? 'Yes' : 'No'}`);
          if (order.metadata.emailStatus.paymentLinkEmailSentAt) {
            console.log(`Email Sent At: ${new Date(order.metadata.emailStatus.paymentLinkEmailSentAt).toLocaleString()}`);
          }
          if (order.metadata.emailStatus.paymentLinkEmailError) {
            console.log(`Email Error: ${order.metadata.emailStatus.paymentLinkEmailError}`);
          }
        } else {
          console.log(`No email status found`);
        }
        
        // Display items
        console.log('\nItems:');
        for (const item of order.items) {
          console.log(`- ${item.quantity}x ${item.name} @ $${item.price.toFixed(2)} = $${(item.quantity * item.price).toFixed(2)}`);
        }
      }
    }
    
    console.log('\n=== Check completed ===');
    
  } catch (error) {
    console.error('\n❌ Check failed:');
    console.error(error);
  }
}

// Run the check
checkTempOrders().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
