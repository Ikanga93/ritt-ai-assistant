import "reflect-metadata";
import { DataSource } from "typeorm";
import * as dotenv from "dotenv";
import * as path from "path";
import { Customer } from "./entities/Customer.js";
import { Restaurant } from "./entities/Restaurant.js";
import { MenuItem } from "./entities/MenuItem.js";
import { Order } from "./entities/Order.js";
import { OrderItem } from "./entities/OrderItem.js";


const envPath = path.resolve(process.cwd(), ".env.local");

// Load environment variables
if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: envPath });
}

export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT || "5432"),
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB || "ritt_drive_thru",
  schema: process.env.POSTGRES_SCHEMA || "public",
  synchronize: false, // Disable schema synchronization
  logging: process.env.NODE_ENV !== "production", // Only log in development
  entities: [Customer, Restaurant, MenuItem, Order, OrderItem],
  migrations: [], // Disable migrations
  migrationsRun: false, // Never run migrations automatically
  migrationsTableName: "migrations",
  subscribers: ["dist/subscribers/**/*.js"] // Use compiled subscribers
});

// Function to initialize the database connection
export async function initializeDatabase() {
  try {
    // Check if already initialized
    if (AppDataSource.isInitialized) {
      console.log("Database already initialized");
      return;
    }

    // Initialize the database connection without running migrations
    try {
      await AppDataSource.initialize();
      console.log("Database connection established successfully");
    } catch (error) {
      console.error("Error connecting to database:", error);
      throw error;
    }
  } catch (error) {
    console.error("Fatal database initialization error:", error);
    // Don't throw - allow application to continue without database
    console.warn("Application will run without database functionality");
  }
} 