// Test script to simulate placing an order with Auth0 user data
import { placeOrder } from './dist/orderService.js';
import { initializeDatabase } from './dist/database.js';

// Simulate Auth0 user data
const auth0User = {
  sub: 'auth0|test123456789',
  email: 'test@example.com',
  name: 'Test User',
  picture: 'https://example.com/avatar.jpg'
};

// Sample order data
const restaurantId = 'niros_gyros';
const customerName = auth0User.name;
const items = [
  {
    name: 'Single Gyro',
    quantity: 1,
    price: 7.99
  },
  {
    name: 'Greek Fries',
    quantity: 1,
    price: 3.99
  }
];

async function testOrderWithAuth0() {
  console.log('Testing order with Auth0 user data...');
  console.log('Auth0 User:', auth0User);
  console.log('Order Items:', items);
  
  try {
    // Initialize the database connection first
    console.log('Initializing database connection...');
    await initializeDatabase();
    console.log('Database connection initialized successfully');
    
    // Place the order with Auth0 user data
    const order = await placeOrder(
      restaurantId,
      customerName,
      items,
      auth0User.email,
      undefined, // No phone number
      auth0User
    );
    
    console.log('Order placed successfully!');
    console.log('Order details:', order);
    console.log('Check the database to verify Auth0 user data was saved');
  } catch (error) {
    console.error('Error placing order:', error);
  }
}

// Run the test
testOrderWithAuth0();
