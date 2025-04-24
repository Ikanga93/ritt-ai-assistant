// Test script to directly update a customer with Auth0 data using SQL
import pg from 'pg';
import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

// Simulate Auth0 user data
const auth0User = {
  sub: 'auth0|test123456789',
  email: 'test@example.com',
  name: 'Test User',
  picture: 'https://example.com/avatar.jpg'
};

async function updateCustomerWithAuth0() {
  console.log('Testing direct update of customer with Auth0 user data using SQL...');
  console.log('Auth0 User:', auth0User);
  
  // Create a PostgreSQL client
  const client = new pg.Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USERNAME || 'gie',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'ritt_drive_thru'
  });
  
  try {
    // Connect to the database
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected to database successfully');
    
    // Check if customer exists by email
    const checkResult = await client.query(
      'SELECT * FROM customers WHERE email = $1',
      [auth0User.email]
    );
    
    if (checkResult.rows.length > 0) {
      // Customer exists, update with Auth0 data
      const customer = checkResult.rows[0];
      console.log(`Found existing customer: ${customer.name} (ID: ${customer.id})`);
      
      // Update customer with Auth0 data
      const updateResult = await client.query(
        'UPDATE customers SET "auth0Id" = $1, name = $2, picture = $3, updated_at = NOW() WHERE id = $4 RETURNING *',
        [auth0User.sub, auth0User.name, auth0User.picture, customer.id]
      );
      
      console.log('Customer updated with Auth0 data:', updateResult.rows[0]);
    } else {
      // Customer doesn't exist, create new one
      console.log('Customer not found, creating new customer');
      
      // Create new customer with Auth0 data
      const insertResult = await client.query(
        'INSERT INTO customers (name, email, "auth0Id", picture, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *',
        [auth0User.name, auth0User.email, auth0User.sub, auth0User.picture]
      );
      
      console.log('New customer created with Auth0 data:', insertResult.rows[0]);
    }
  } catch (error) {
    console.error('Error updating customer with Auth0 data:', error);
  } finally {
    // Close the database connection
    await client.end();
    console.log('Database connection closed');
  }
}

// Run the test
updateCustomerWithAuth0();
