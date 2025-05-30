import fs from 'fs';
import path from 'path';

async function listPaymentLinks() {
  console.log('\n=== Recent Orders Payment Links ===\n');
  
  try {
    // Get the temp orders directory
    const tempOrdersDir = path.join(process.cwd(), 'data', 'temp-orders');
    
    // Read all files in the directory
    const files = fs.readdirSync(tempOrdersDir)
      .filter(file => file.endsWith('.json') && file !== 'index.json');
    
    // Sort files by creation time (newest first)
    const sortedFiles = files.sort((a, b) => {
      const statA = fs.statSync(path.join(tempOrdersDir, a));
      const statB = fs.statSync(path.join(tempOrdersDir, b));
      return statB.ctimeMs - statA.ctimeMs;
    });
    
    // Process each order file
    for (const file of sortedFiles) {
      const orderFilePath = path.join(tempOrdersDir, file);
      const orderData = JSON.parse(fs.readFileSync(orderFilePath, 'utf8'));
      
      // Get payment link from metadata
      const paymentLink = orderData.metadata?.paymentLink?.url || 
                         orderData.metadata?.stripePaymentLink ||
                         orderData.metadata?.payment_link;
      
      if (paymentLink && orderData.metadata?.paymentStatus === 'pending') {
        console.log('\n-----------------------------------');
        console.log(`Order ID: ${orderData.id}`);
        console.log(`Customer: ${orderData.customerName}`);
        console.log(`Email: ${orderData.customerEmail}`);
        console.log(`Total: $${orderData.total}`);
        console.log(`Items: ${orderData.items.length}`);
        console.log(`Created: ${new Date(orderData.createdAt).toLocaleString()}`);
        console.log('\nChat Interface Payment Link:');
        console.log(`payment_link:${paymentLink}`);
        console.log('-----------------------------------');
      }
    }
    
  } catch (error) {
    console.error('Error listing payment links:', error);
  }
}

// Run the script
listPaymentLinks(); 