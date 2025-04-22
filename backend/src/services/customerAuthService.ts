import { getRepository } from "typeorm";
import { Customer } from "../entities/Customer.js";

/**
 * Synchronizes an Auth0 user with the Customer database entity
 * Either finds an existing customer by Auth0 ID or creates a new one
 */
export async function syncCustomerWithAuth0(auth0User: any): Promise<Customer | null> {
  if (!auth0User) return null;
  
  try {
    const customerRepository = getRepository(Customer);
    
    // Try to find customer by Auth0 ID first
    let customer = await customerRepository.findOne({ 
      where: { auth0Id: auth0User.sub } 
    });
    
    // If not found by Auth0 ID, try to find by email
    if (!customer && auth0User.email) {
      customer = await customerRepository.findOne({ 
        where: { email: auth0User.email } 
      });
      
      // If found by email but no Auth0 ID, update with Auth0 ID
      if (customer && !customer.auth0Id) {
        customer.auth0Id = auth0User.sub;
      }
    }
    
    // If customer still not found, create a new one
    if (!customer) {
      customer = new Customer();
      customer.auth0Id = auth0User.sub;
      customer.created_at = new Date();
    }
    
    // Update customer data from Auth0
    if (customer) {
      customer.name = auth0User.name || auth0User.nickname || customer.name || 'Unknown';
      customer.email = auth0User.email || customer.email || '';
      customer.picture = auth0User.picture || customer.picture || null;
      customer.updated_at = new Date();
      
      // Save customer to database
      return await customerRepository.save(customer);
    }
    
    return null;
  } catch (error) {
    console.error("Error syncing customer with Auth0:", error);
    return null;
  }
}

/**
 * Finds a customer by Auth0 ID
 */
export async function findCustomerByAuth0Id(auth0Id: string): Promise<Customer | null> {
  if (!auth0Id) return null;
  
  try {
    const customerRepository = getRepository(Customer);
    return await customerRepository.findOne({ 
      where: { auth0Id } 
    });
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
    const customerRepository = getRepository(Customer);
    return await customerRepository.findOne({ 
      where: { email } 
    });
  } catch (error) {
    console.error("Error finding customer by email:", error);
    return null;
  }
}
