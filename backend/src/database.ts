import "reflect-metadata";
import { DataSource } from "typeorm";
import * as dotenv from "dotenv";
import * as path from "path";
import { Customer } from "./entities/Customer.js";
import { Restaurant } from "./entities/Restaurant.js";
import { MenuItem } from "./entities/MenuItem.js";
import { Order } from "./entities/Order.js";
import { OrderItem } from "./entities/OrderItem.js";
import { Payment } from "./entities/Payment.js";

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
  synchronize: process.env.NODE_ENV !== "production", // Only synchronize in development
  logging: process.env.NODE_ENV !== "production", // Only log in development
  entities: [Customer, Restaurant, MenuItem, Order, OrderItem, Payment],
  migrations: ["dist/migrations/**/*.js"], // Use compiled migrations
  migrationsRun: process.env.NODE_ENV === "production", // Automatically run migrations in production
  migrationsTableName: "migrations",
  subscribers: ["dist/subscribers/**/*.js"], // Use compiled subscribers
});

// Function to initialize the database connection
export async function initializeDatabase() {
  try {
    await AppDataSource.initialize();
    console.log("Database connection established successfully");

    // Run migrations if not in production (in production, they run automatically)
    if (process.env.NODE_ENV !== "production") {
      await AppDataSource.runMigrations();
      console.log("Database migrations applied successfully");
    }
  } catch (error) {
    console.error("Error during database initialization:", error);
    throw error;
  }
} 