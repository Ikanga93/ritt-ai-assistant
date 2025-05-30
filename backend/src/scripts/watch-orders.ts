import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';

// Keep track of processed orders to avoid duplicates
const processedOrders = new Set<string>();

async function processNewOrder(orderFilePath: string) {
  try {
    // Skip if not a JSON file or if it's the index file
    if (!orderFilePath.endsWith('.json') || orderFilePath.endsWith('index.json')) {
      return;
    }

    // Get order ID from filename
    const orderId = path.basename(orderFilePath, '.json');
    
    // Skip if already processed
    if (processedOrders.has(orderId)) {
      return;
    }

    console.log(`\nProcessing new order: ${orderId}`);

    // Read and parse the order file
    const orderData = JSON.parse(fs.readFileSync(orderFilePath, 'utf8'));

    // Get payment link from metadata
    const paymentLink = orderData.metadata?.paymentLink?.url || 
                       orderData.metadata?.stripePaymentLink ||
                       orderData.metadata?.payment_link;

    if (paymentLink && orderData.metadata?.paymentStatus === 'pending') {
      console.log('\n=== New Order Payment Link ===');
      console.log(`Order ID: ${orderData.id}`);
      console.log(`Customer: ${orderData.customerName}`);
      console.log(`Email: ${orderData.customerEmail}`);
      console.log(`Total: $${orderData.total}`);
      console.log(`Items: ${orderData.items.length}`);
      console.log(`Created: ${new Date(orderData.createdAt).toLocaleString()}`);
      
      // Format payment link for chat interface
      console.log('\nSending to chat interface:');
      console.log(`payment_link:${paymentLink}`);
      
      // TODO: Here you would integrate with your chat interface
      // For example:
      // await sendToChatInterface({
      //   orderId: orderData.id,
      //   paymentLink: `payment_link:${paymentLink}`
      // });
    }

    // Mark as processed
    processedOrders.add(orderId);

  } catch (error: unknown) {
    console.error('Error processing order:', error);
  }
}

async function watchOrders() {
  const tempOrdersDir = path.join(process.cwd(), 'data', 'temp-orders');

  // Load existing orders to avoid reprocessing
  const existingFiles = fs.readdirSync(tempOrdersDir)
    .filter(file => file.endsWith('.json') && file !== 'index.json');
  
  for (const file of existingFiles) {
    processedOrders.add(path.basename(file, '.json'));
  }

  console.log(`\nWatching for new orders in: ${tempOrdersDir}`);
  console.log('Loaded', processedOrders.size, 'existing orders');
  console.log('\nWaiting for new orders...');

  // Watch for new files
  const watcher = chokidar.watch(tempOrdersDir, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true
  });

  watcher
    .on('add', (filePath: string) => {
      processNewOrder(filePath);
    })
    .on('change', (filePath: string) => {
      // Also process changes in case payment status is updated
      processNewOrder(filePath);
    })
    .on('error', (error: unknown) => {
      console.error('Watch error:', error);
    });
}

// Start watching
watchOrders(); 