import "reflect-metadata";
import { DataSource } from "typeorm";
import * as dotenv from "dotenv";
import * as path from "path";
import { Customer } from "./entities/Customer.js";
import { Restaurant } from "./entities/Restaurant.js";
import { MenuItem } from "./entities/MenuItem.js";
import { Order } from "./entities/Order.js";
import { OrderItem } from "./entities/OrderItem.js";
import { OrderQueue } from "./entities/OrderQueue.js";


const envPath = path.resolve(process.cwd(), ".env.local");

// Load environment variables
if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: envPath });
}

export const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL || process.env.INTERNAL_DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? {
    rejectUnauthorized: false
  } : false,
  synchronize: false, // Disable schema synchronization
  logging: process.env.NODE_ENV !== "production", // Only log in development
  entities: [Customer, Restaurant, MenuItem, Order, OrderItem, OrderQueue],
  migrations: ["dist/migrations/*.js"], // Include our migrations
  migrationsRun: process.env.NODE_ENV === "production", // Run migrations automatically in production
  migrationsTableName: "migrations",
  subscribers: ["dist/subscribers/**/*.js"] // Use compiled subscribers
});

// Maximum number of retries for database operations
const MAX_RETRIES = 3;
// Delay between retries in milliseconds (exponential backoff)
const RETRY_DELAY_BASE = 500;

/**
 * Function to initialize the database connection with retry logic
 */
export async function initializeDatabase() {
  try {
    let retries = 0;
    
    while (retries < MAX_RETRIES) {
      try {
        // Check if already initialized
        if (AppDataSource.isInitialized) {
          console.log("Database already initialized");
          return;
        }

        // Initialize the database connection
        await AppDataSource.initialize();
        console.log("Database connection established successfully");
        
        // In production, ensure migrations are run
        if (process.env.NODE_ENV === "production") {
          console.log("🔄 Running database migrations in production...");
          try {
            const migrations = await AppDataSource.runMigrations();
            if (migrations.length > 0) {
              console.log(`✅ Successfully ran ${migrations.length} migrations:`);
              migrations.forEach((migration, index) => {
                console.log(`  ${index + 1}. ${migration.name}`);
              });
            } else {
              console.log("✅ No pending migrations to run");
            }
          } catch (migrationError) {
            console.error("❌ Failed to run migrations:", migrationError);
            // Don't throw - allow application to continue
            console.warn("Application will continue without running migrations");
          }
        }
        
        return;
      } catch (error) {
        retries++;
        console.error(`Error connecting to database (attempt ${retries}/${MAX_RETRIES}):`, error);
        
        if (retries >= MAX_RETRIES) {
          console.error("Failed to initialize database after maximum retries");
          throw error;
        }
        
        // Calculate delay with exponential backoff
        const delay = RETRY_DELAY_BASE * Math.pow(2, retries - 1);
        console.log(`Retrying database initialization in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  } catch (error) {
    console.error("Fatal database initialization error:", error);
    // Don't throw - allow application to continue without database
    console.warn("Application will run without database functionality");
  }
}

/**
 * Check if the database connection is healthy
 * @returns True if the connection is healthy, false otherwise
 */
export async function isDatabaseHealthy(): Promise<boolean> {
  try {
    if (!AppDataSource.isInitialized) {
      console.log('Database not initialized, health check failed');
      return false;
    }

    // Try a simple query to verify the connection is working
    await AppDataSource.query('SELECT 1');
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

/**
 * Ensure the database connection is initialized and healthy
 * @returns True if the connection is ready, false if it couldn't be established
 */
export async function ensureDatabaseConnection(): Promise<boolean> {
  try {
    // If not initialized, initialize the database
    if (!AppDataSource.isInitialized) {
      console.log('Database not initialized, attempting to initialize...');
      await initializeDatabase();
    }

    // Verify the connection is healthy
    const isHealthy = await isDatabaseHealthy();
    if (!isHealthy) {
      console.log('Database connection is not healthy, attempting to reinitialize...');
      
      // Try to close the connection if it exists but is unhealthy
      try {
        if (AppDataSource.isInitialized) {
          await AppDataSource.destroy();
        }
      } catch (closeError) {
        console.error('Error closing database connection:', closeError);
      }
      
      // Reinitialize the connection
      await initializeDatabase();
      
      // Check health again
      const healthAfterReinit = await isDatabaseHealthy();
      if (!healthAfterReinit) {
        console.error('Failed to establish a healthy database connection after reinitialization');
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error ensuring database connection:', error);
    return false;
  }
}

/**
 * Execute a database operation with retry logic
 * @param operation The database operation to execute
 * @param operationName Name of the operation for logging
 * @returns The result of the operation
 */
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  let retries = 0;
  let lastError: any;

  while (retries < MAX_RETRIES) {
    try {
      // Ensure connection before executing the operation
      const connectionReady = await ensureDatabaseConnection();
      if (!connectionReady) {
        throw new Error(`Failed to establish database connection for operation: ${operationName}`);
      }

      // Execute the operation
      return await operation();
    } catch (error) {
      lastError = error;
      retries++;
      
      console.error(
        `Database operation "${operationName}" failed (attempt ${retries}/${MAX_RETRIES}):`,
        error
      );

      if (retries < MAX_RETRIES) {
        // Calculate delay with exponential backoff
        const delay = RETRY_DELAY_BASE * Math.pow(2, retries - 1);
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // If we've exhausted all retries, throw the last error
  throw new Error(
    `Database operation "${operationName}" failed after ${MAX_RETRIES} attempts: ${lastError?.message || 'Unknown error'}`
  );
}