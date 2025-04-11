// Test script for Stripe payment integration with direct Stripe key
import Stripe from 'stripe';

// Create Stripe instance directly with the key
const stripe = new Stripe('sk_test_51R5kZQP4sLIsXeNy3uDv4DnTwD0h2WXfsv6Mp5Ee2felNv3zet4lCejwBdkqzGyoRo6tbfL7RG2ASSAgJH8B83GN00YSvfj4mA', {
  apiVersion: '2025-03-31.basil',
});

// Create a simple HTTP server to test payment link generation
import http from 'http';

const server = http.createServer(async (req, res) => {
  // Log all incoming requests
  console.log(`Received request: ${req.method} ${req.url}`);
  
  // Set CORS headers to allow requests from any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Only handle requests to /test-payment
  if ((req.url === '/test-payment' || req.url === '/test-payment/') && req.method === 'GET') {
    try {
      console.log('Generating test payment link directly with Stripe...');
      
      // Create a test order
      const testOrder = {
        id: `test-order-${Date.now()}`,
        items: [
          {
            id: 'item1',
            name: 'Test Item 1',
            price: 9.99,
            quantity: 1
          },
          {
            id: 'item2',
            name: 'Test Item 2',
            price: 4.99,
            quantity: 2
          }
        ],
        totalAmount: 19.97, // 9.99 + (4.99 * 2)
      };
      
      // Create a product for this order
      const product = await stripe.products.create({
        name: `Ritt Drive-Thru Test Order #${testOrder.id}`,
        description: testOrder.items.map(item => `${item.quantity}x ${item.name}`).join(', '),
      });

      // Create a price for the order
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: Math.round(testOrder.totalAmount * 100), // Convert to cents
        currency: 'usd',
      });

      // Create a payment link
      const paymentLink = await stripe.paymentLinks.create({
        line_items: [{ price: price.id, quantity: 1 }],
        after_completion: { 
          type: 'redirect', 
          redirect: { 
            url: `http://localhost:3000/order-confirmation?order_id=${testOrder.id}` 
          } 
        },
      });
      
      console.log('Payment link generated:', paymentLink.url);
      
      // Return success response with payment link
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: true, 
        paymentUrl: paymentLink.url,
        order: testOrder
      }));
    } catch (error) {
      console.error('Error generating payment link:', error);
      
      // Return error response
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: false, 
        error: error.message || 'Unknown error occurred'
      }));
    }
  } else {
    // Return 404 for any other routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Not found' }));
  }
});

// Start the server on port 3001
const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Test payment server running at http://localhost:${PORT}`);
  console.log(`To test payment link generation, visit: http://localhost:${PORT}/test-payment`);
});
