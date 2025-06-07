import { placeOrder } from './dist/orderService.js';

async function testOrderCreation() {
  console.log('🧪 Testing Hybrid Order Creation Approach');
  console.log('==========================================\n');

  try {
    // Test order data with REAL menu items from Niro's Gyros
    const orderData = {
      items: [
        {
          id: 'niros_gyros_single_gyro_0',
          name: 'Single Gyro',
          price: 7.99,
          quantity: 1,
          specialInstructions: 'Extra sauce please'
        },
        {
          id: 'niros_gyros_french_fries_4', 
          name: 'French Fries',
          price: 2.69,
          quantity: 1
        }
      ]
    };

    const customerInfo = {
      name: 'Test Customer',
      email: 'test@example.com',
      phone: '555-123-4567'
    };

    // Use the CORRECT restaurant ID and name
    const restaurantId = 'niros_gyros';
    const restaurantName = "Niro's Gyros";

    console.log('📝 Creating order with:');
    console.log('Customer:', customerInfo.name);
    console.log('Restaurant:', restaurantName, `(${restaurantId})`);
    console.log('Items:', orderData.items.length);
    console.log('Total items value:', orderData.items.reduce((sum, item) => sum + (item.price * item.quantity), 0));
    console.log('');

    // Place the order
    const result = await placeOrder(orderData, customerInfo, restaurantId, restaurantName);

    console.log('✅ Order created successfully!');
    console.log('Order Result:', {
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      total: result.total,
      hasPaymentLink: !!result.paymentLink
    });

    // Now let's check what was created in both systems
    console.log('\n🔍 Checking what was created...\n');

    // Check temporary storage
    const { temporaryOrderService } = await import('./dist/services/temporaryOrderService.js');
    const tempOrder = temporaryOrderService.getOrder(result.orderId);
    
    if (tempOrder) {
      console.log('✅ Temporary Order Created:');
      console.log('  - ID:', tempOrder.id);
      console.log('  - Order Number:', tempOrder.orderNumber);
      console.log('  - Customer:', tempOrder.customerName);
      console.log('  - Items:', tempOrder.items.length);
      console.log('  - Total:', tempOrder.total);
      console.log('  - Has Payment Link:', !!tempOrder.metadata?.paymentLink);
      console.log('  - Database Order ID:', tempOrder.metadata?.dbOrderId || 'Not linked');
    } else {
      console.log('❌ Temporary order not found');
    }

    // Check database
    const { AppDataSource } = await import('./dist/database.js');
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const dbOrders = await AppDataSource.query(
      'SELECT id, order_number, customer_name, total, payment_status, created_at FROM orders ORDER BY created_at DESC LIMIT 1'
    );

    if (dbOrders.length > 0) {
      const dbOrder = dbOrders[0];
      console.log('\n✅ Database Order Created:');
      console.log('  - ID:', dbOrder.id);
      console.log('  - Order Number:', dbOrder.order_number);
      console.log('  - Customer:', dbOrder.customer_name);
      console.log('  - Total:', dbOrder.total);
      console.log('  - Payment Status:', dbOrder.payment_status);
      console.log('  - Created:', new Date(dbOrder.created_at).toLocaleString());

      // Check if they're linked
      if (tempOrder && tempOrder.metadata?.dbOrderId === dbOrder.id) {
        console.log('\n🔗 ✅ Orders are properly linked!');
      } else {
        console.log('\n🔗 ⚠️  Orders may not be linked properly');
        if (tempOrder) {
          console.log('    Temp order dbOrderId:', tempOrder.metadata?.dbOrderId);
          console.log('    Database order ID:', dbOrder.id);
        }
      }
    } else {
      console.log('\n❌ No database order found');
    }

    await AppDataSource.destroy();
    console.log('\n🎉 Test completed successfully!');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

testOrderCreation(); 