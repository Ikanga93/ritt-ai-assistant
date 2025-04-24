// Test script to directly update a customer with Auth0 data
import { AppDataSource } from './dist/database.js';
import { Customer } from './dist/entities/Customer.js';

// Simulate Auth0 user data
const auth0User = {
  sub: 'auth0|test123456789',
  email: 'test@example.com',
  name: 'Test User',
  picture: 'https://example.com/avatar.jpg'
};

async function updateCustomerWithAuth0() {
  console.log('Testing direct update of customer with Auth0 user data...');
  console.log('Auth0 User:', auth0User);
  
  try {
    // Initialize the database connection
    console.log('Initializing database connection...');
    await AppDataSource.initialize();
    console.log('Database connection initialized successfully');
    
    // Get the customer repository
    const customerRepository = AppDataSource.getRepository(Customer);
    
    // Find customer by email
    let customer = await customerRepository.findOne({ 
      where: { email: auth0User.email } 
    });
    
    if (customer) {
      console.log(`Found existing customer: ${customer.name} (ID: ${customer.id})`);
      
      // Update with Auth0 data
      customer.auth0Id = auth0User.sub;
      customer.name = auth0User.name;
      customer.picture = auth0User.picture;
      customer.updated_at = new Date();
      
      // Save the updated customer
      await customerRepository.save(customer);
      console.log('Customer updated with Auth0 data:', customer);
    } else {
      console.log('Customer not found, creating new customer');
      
      // Create new customer
      customer = new Customer();
      customer.name = auth0User.name;
      customer.email = auth0User.email;
      customer.auth0Id = auth0User.sub;
      customer.picture = auth0User.picture;
      customer.created_at = new Date();
      
      // Save the new customer
      const savedCustomer = await customerRepository.save(customer);
      console.log('New customer created with Auth0 data:', savedCustomer);
    }
    
    // Close the connection
    await AppDataSource.destroy();
    console.log('Database connection closed');
  } catch (error) {
    console.error('Error updating customer with Auth0 data:', error);
  }
}

// Run the test
updateCustomerWithAuth0();
