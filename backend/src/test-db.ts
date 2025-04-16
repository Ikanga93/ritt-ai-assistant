import { AppDataSource, initializeDatabase } from "./database.js";
import { Customer } from "./entities/Customer.js";

async function testDatabase() {
  try {
    // Initialize database connection
    await initializeDatabase();

    // Create a test customer
    const customer = new Customer();
    customer.name = "Test Customer";
    customer.email = "test@example.com";
    customer.phone = "1234567890";

    // Save the customer
    const customerRepository = AppDataSource.getRepository(Customer);
    await customerRepository.save(customer);
    console.log("Test customer saved successfully!");

    // Query the customer
    const savedCustomer = await customerRepository.findOne({
      where: { email: "test@example.com" }
    });
    console.log("Retrieved customer:", savedCustomer);

  } catch (error) {
    console.error("Error during database test:", error);
  } finally {
    // Close the connection
    await AppDataSource.destroy();
  }
}

// Run the test
testDatabase(); 