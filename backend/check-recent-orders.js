import { AppDataSource } from './dist/database.js';

async function checkRecentOrders() {
  try {
    await AppDataSource.initialize();
    
    console.log('📊 Recent Database Orders:');
    const orders = await AppDataSource.query(
      'SELECT id, order_number, customer_name, total, payment_status, created_at FROM orders ORDER BY created_at DESC LIMIT 3'
    );
    
    orders.forEach((order, index) => {
      console.log(`${index + 1}. Order #${order.id} (${order.order_number})`);
      console.log(`   Customer: ${order.customer_name}`);
      console.log(`   Total: $${order.total}`);
      console.log(`   Status: ${order.payment_status}`);
      console.log(`   Created: ${new Date(order.created_at).toLocaleString()}`);
      console.log('');
    });
    
    await AppDataSource.destroy();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkRecentOrders(); 