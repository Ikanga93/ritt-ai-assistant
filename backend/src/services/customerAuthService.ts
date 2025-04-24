import { Customer } from "../entities/Customer.js";
import { AppDataSource, initializeDatabase } from "../database.js";

/**
 * Synchronizes an Auth0 user with the Customer database entity
 * Either finds an existing customer by Auth0 ID or creates a new one
 */
export async function syncCustomerWithAuth0(auth0User: any): Promise<Customer | null> {
  console.log('=== Auth0 Sync Started ===');
  
  if (!auth0User) {
    console.log('No Auth0 user provided to syncCustomerWithAuth0');
    return null;
  }
  
  try {
    console.log('Auth0 user data:', {
      sub: auth0User.sub,
      email: auth0User.email,
      name: auth0User.name
    });
    
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      console.log('Database not initialized in syncCustomerWithAuth0, attempting to initialize...');
      await initializeDatabase();
      console.log('Database initialization completed');
    } else {
      console.log('Database already initialized');
    }
    
    const customerRepository = AppDataSource.getRepository(Customer);
    
    // Try to find customer by Auth0 ID first
    console.log('Looking for customer by Auth0 ID:', auth0User.sub);
    let customer = await customerRepository.findOne({ 
      where: { auth0Id: auth0User.sub } 
    });
    console.log('Customer found by Auth0 ID:', customer ? 'Yes' : 'No');
    
    // If not found by Auth0 ID, try to find by email
    if (!customer && auth0User.email) {
      console.log('Looking for customer by email:', auth0User.email);
      customer = await AppDataSource.getRepository(Customer).findOne({ 
        where: { email: auth0User.email } 
      });
      console.log('Customer found by email:', customer ? 'Yes' : 'No');
      
      // If found by email but no Auth0 ID, update with Auth0 ID
      if (customer && !customer.auth0Id) {
        console.log('Updating existing customer with Auth0 ID');
        customer.auth0Id = auth0User.sub;
      }
    }
    
    // If customer still not found, create a new one
    if (!customer) {
      console.log('Creating new customer with Auth0 data');
      customer = new Customer();
      customer.auth0Id = auth0User.sub;
      customer.created_at = new Date();
      console.log('New customer created with Auth0 ID:', customer.auth0Id);
    }
    
    // Update customer data from Auth0
    if (customer) {
      console.log('Updating customer data from Auth0');
      customer.name = auth0User.name || auth0User.nickname || customer.name || 'Unknown';
      customer.email = auth0User.email || customer.email || '';
      customer.picture = auth0User.picture || customer.picture || null;
      customer.updated_at = new Date();
      
      console.log('Updated customer data:', {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        auth0Id: customer.auth0Id,
        picture: customer.picture ? 'Has picture' : 'No picture'
      });
      
      // Save customer to database
      try {
        console.log('Saving customer to database...');
        const savedCustomer = await customerRepository.save(customer);
        console.log('Customer saved successfully with ID:', savedCustomer.id);
        return savedCustomer;
      } catch (saveError) {
        console.error('Error saving customer to database:', saveError);
        throw saveError;
      }
    }
    
    return null;
  } catch (error) {
    console.error("Error in syncCustomerWithAuth0:", error);
    return null;
  }
}

/**
 * Finds a customer by Auth0 ID
 */
export async function findCustomerByAuth0Id(auth0Id: string): Promise<Customer | null> {
  if (!auth0Id) return null;
  
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      console.log('Database not initialized in findCustomerByAuth0Id, attempting to initialize...');
      await initializeDatabase();
    }
    
    const customerRepository = AppDataSource.getRepository(Customer);
    return await customerRepository.findOne({ where: { auth0Id } });
  } catch (error) {
    console.error("Error finding customer by Auth0 ID:", error);
    return null;
  }
}

/**
 * Finds a customer by email
 */
export async function findCustomerByEmail(email: string): Promise<Customer | null> {
  if (!email) return null;
  
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      console.log('Database not initialized in findCustomerByEmail, attempting to initialize...');
      await initializeDatabase();
    }
    
    const customerRepository = AppDataSource.getRepository(Customer);
    return await customerRepository.findOne({ where: { email } });
  } catch (error) {
    console.error("Error finding customer by email:", error);
    return null;
  }
}
