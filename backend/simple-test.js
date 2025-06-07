import { placeOrder } from './dist/orderService.js';

async function simpleTest() {
  console.log('🧪 Simple Database-Only Test');
  
  try {
    const result = await placeOrder(
      {
        items: [
          {
            id: 'niros_gyros_pepsi_0',
            name: 'Pepsi',
            price: 1.99,
            quantity: 1
          }
        ]
      },
      {
        name: 'Test User',
        email: 'test@test.com',
        phone: '555-0123'
      },
      'niros_gyros',
      "Niro's Gyros"
    );
    
    console.log('✅ Order created:', result.orderId, result.orderNumber);
    console.log('💰 Total:', result.total);
    console.log('💳 Has Payment Link:', !!result.paymentLink);
    
    // Check database order directly using the new API endpoint
    try {
      const response = await fetch(`http://localhost:3001/api/payments/order/${result.orderNumber}`);
      if (response.ok) {
        const orderData = await response.json();
        console.log('🔗 Database Order Found:', {
          id: orderData.order?.id,
          orderNumber: orderData.order?.orderNumber,
          paymentStatus: orderData.order?.paymentStatus,
          hasPaymentLink: !!orderData.order?.paymentLink
        });
      } else {
        console.log('⚠️ Could not fetch order from database API (server may not be running)');
      }
    } catch (fetchError) {
      console.log('⚠️ Could not fetch order from database API (server may not be running)');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

simpleTest(); 