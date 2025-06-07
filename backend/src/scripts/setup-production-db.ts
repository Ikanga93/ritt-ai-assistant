#!/usr/bin/env node

/**
 * Production Database Setup Script
 * 
 * This script ensures the database is properly set up in production
 * by running migrations and verifying all required tables exist.
 */

import "reflect-metadata";
import { AppDataSource } from '../database.js';

async function setupProductionDatabase() {
  console.log('🚀 Setting up production database...');
  console.log('Environment:', process.env.NODE_ENV);
  console.log('Database URL configured:', !!process.env.DATABASE_URL);
  
  try {
    // Initialize the database connection
    if (!AppDataSource.isInitialized) {
      console.log('📡 Initializing database connection...');
      await AppDataSource.initialize();
      console.log('✅ Database connection established');
    }
    
    // Check database connection
    console.log('🔍 Testing database connection...');
    await AppDataSource.query('SELECT 1 as test');
    console.log('✅ Database connection is working');
    
    // Check if migrations table exists, if not create it
    console.log('📋 Checking migrations table...');
    try {
      const result = await AppDataSource.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'migrations'
        );
      `);
      
      if (!result[0].exists) {
        console.log('📋 Creating migrations table...');
        await AppDataSource.query(`
          CREATE TABLE IF NOT EXISTS "migrations" (
            "id" SERIAL PRIMARY KEY,
            "timestamp" bigint NOT NULL,
            "name" varchar NOT NULL
          );
        `);
        console.log('✅ Migrations table created');
      } else {
        console.log('✅ Migrations table already exists');
      }
    } catch (error: any) {
      console.log('⚠️ Could not check/create migrations table:', error.message);
    }
    
    // Run migrations
    console.log('🔄 Running database migrations...');
    try {
      const migrations = await AppDataSource.runMigrations();
      if (migrations.length > 0) {
        console.log(`✅ Successfully ran ${migrations.length} migrations:`);
        migrations.forEach((migration, index) => {
          console.log(`  ${index + 1}. ${migration.name}`);
        });
      } else {
        console.log('✅ No pending migrations to run');
      }
    } catch (migrationError: any) {
      console.error('❌ Migration error:', migrationError.message);
      console.log('🔧 Migration failed, but continuing with manual table creation...');
      
      // Don't throw here - continue with manual table creation
      // This allows the script to recover from migration failures
    }
    
    // Always verify and create tables manually if needed
    console.log('🔍 Verifying database tables...');
    const tables = await AppDataSource.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    
    console.log('📋 Existing tables:');
    tables.forEach((table: any) => {
      console.log(`  - ${table.table_name}`);
    });
    
    const expectedTables = ['customers', 'restaurants', 'menu_items', 'orders', 'order_items'];
    const existingTableNames = tables.map((t: any) => t.table_name);
    
    const missingTables = expectedTables.filter(table => !existingTableNames.includes(table));
    
    if (missingTables.length > 0) {
      console.log('❌ Missing required tables:', missingTables);
      console.log('🔧 Creating missing tables...');
      await createTablesManually();
      
      // Verify again
      const tablesAfter = await AppDataSource.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name;
      `);
      
      const existingAfter = tablesAfter.map((t: any) => t.table_name);
      const stillMissing = expectedTables.filter(table => !existingAfter.includes(table));
      
      if (stillMissing.length > 0) {
        throw new Error(`Still missing required tables after manual creation: ${stillMissing.join(', ')}`);
      }
    } else {
      console.log('✅ All required tables exist');
      
      // Even if tables exist, ensure they have the right columns
      console.log('🔍 Verifying table schemas...');
      await ensureTableSchemas();
    }
    
    console.log('🎉 Production database setup completed successfully!');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  } finally {
    // Close the database connection
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
      console.log('📡 Database connection closed');
    }
  }
}

async function createTablesManually() {
  console.log('🔧 Creating database tables manually...');
  
  try {
    // Create customers table
    await AppDataSource.query(`
      CREATE TABLE IF NOT EXISTS "customers" (
        "id" SERIAL PRIMARY KEY,
        "name" varchar(255) NOT NULL,
        "email" varchar(255) NOT NULL UNIQUE,
        "phone" varchar(20) NOT NULL,
        "auth0Id" varchar(255),
        "picture" varchar(500),
        "created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Customers table created');
    
    // Create restaurants table
    await AppDataSource.query(`
      CREATE TABLE IF NOT EXISTS "restaurants" (
        "id" SERIAL PRIMARY KEY,
        "name" varchar(255) NOT NULL,
        "address" text NOT NULL,
        "phone" varchar(20),
        "email" varchar(255),
        "is_active" boolean DEFAULT true,
        "created_at" timestamp DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Restaurants table created');
    
    // Create menu_items table
    await AppDataSource.query(`
      CREATE TABLE IF NOT EXISTS "menu_items" (
        "id" SERIAL PRIMARY KEY,
        "name" varchar(255) NOT NULL,
        "description" text,
        "price" decimal(10,2) NOT NULL,
        "restaurant_id" integer NOT NULL,
        "created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id")
      );
    `);
    console.log('✅ Menu items table created');
    
    // Create orders table
    await AppDataSource.query(`
      CREATE TABLE IF NOT EXISTS "orders" (
        "id" SERIAL PRIMARY KEY,
        "order_number" varchar(50) NOT NULL UNIQUE,
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "payment_status" varchar(20) NOT NULL DEFAULT 'pending',
        "subtotal" decimal(10,2) NOT NULL,
        "tax" decimal(10,2) NOT NULL,
        "processing_fee" decimal(10,2),
        "total" decimal(10,2) NOT NULL,
        "customer_id" integer NOT NULL,
        "restaurant_id" integer NOT NULL,
        "customer_name" varchar(255),
        "customer_email" varchar(255),
        "payment_link_url" text,
        "paid_at" timestamp,
        "created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("customer_id") REFERENCES "customers"("id"),
        FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id")
      );
    `);
    console.log('✅ Orders table created');
    
    // Create order_items table
    await AppDataSource.query(`
      CREATE TABLE IF NOT EXISTS "order_items" (
        "id" SERIAL PRIMARY KEY,
        "quantity" integer NOT NULL,
        "price_at_time" decimal(10,2) NOT NULL,
        "special_instructions" text,
        "order_id" integer NOT NULL,
        "menu_item_id" integer,
        "item_name" varchar(255),
        "created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("order_id") REFERENCES "orders"("id"),
        FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id")
      );
    `);
    console.log('✅ Order items table created');
    
    // Create order_queue table if it doesn't exist
    await AppDataSource.query(`
      CREATE TABLE IF NOT EXISTS "order_queue" (
        "id" SERIAL PRIMARY KEY,
        "order_id" integer NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "priority" integer DEFAULT 0,
        "estimated_completion" timestamp,
        "created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("order_id") REFERENCES "orders"("id")
      );
    `);
    console.log('✅ Order queue table created');
    
    console.log('🎉 All tables created manually');
    
  } catch (error) {
    console.error('❌ Error creating tables manually:', error);
    throw error;
  }
}

async function ensureTableSchemas() {
  console.log('🔍 Ensuring table schemas are up to date...');
  
  try {
    // Check if customer_email and customer_name columns exist in orders table
    const orderColumns = await AppDataSource.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'orders' 
      AND column_name IN ('customer_email', 'customer_name')
    `);
    
    const existingColumns = orderColumns.map((col: any) => col.column_name);
    
    if (!existingColumns.includes('customer_email')) {
      console.log('📧 Adding customer_email column to orders table...');
      await AppDataSource.query(`
        ALTER TABLE "orders" ADD COLUMN "customer_email" varchar(255)
      `);
      console.log('✅ customer_email column added');
    }
    
    if (!existingColumns.includes('customer_name')) {
      console.log('👤 Adding customer_name column to orders table...');
      await AppDataSource.query(`
        ALTER TABLE "orders" ADD COLUMN "customer_name" varchar(255)
      `);
      console.log('✅ customer_name column added');
    }
    
    // Check if phone and email columns exist in restaurants table
    const restaurantColumns = await AppDataSource.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'restaurants' 
      AND column_name IN ('phone', 'email', 'is_active')
    `);
    
    const existingRestaurantColumns = restaurantColumns.map((col: any) => col.column_name);
    
    if (!existingRestaurantColumns.includes('phone')) {
      console.log('📞 Adding phone column to restaurants table...');
      await AppDataSource.query(`
        ALTER TABLE "restaurants" ADD COLUMN "phone" varchar(20)
      `);
      console.log('✅ phone column added to restaurants');
    }
    
    if (!existingRestaurantColumns.includes('email')) {
      console.log('📧 Adding email column to restaurants table...');
      await AppDataSource.query(`
        ALTER TABLE "restaurants" ADD COLUMN "email" varchar(255)
      `);
      console.log('✅ email column added to restaurants');
    }
    
    if (!existingRestaurantColumns.includes('is_active')) {
      console.log('✅ Adding is_active column to restaurants table...');
      await AppDataSource.query(`
        ALTER TABLE "restaurants" ADD COLUMN "is_active" boolean DEFAULT true
      `);
      console.log('✅ is_active column added to restaurants');
    }
    
    // Check if auth0Id column exists in customers table
    const customerColumns = await AppDataSource.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'customers' 
      AND column_name = 'auth0Id'
    `);
    
    if (customerColumns.length === 0) {
      console.log('🔐 Adding auth0Id column to customers table...');
      await AppDataSource.query(`
        ALTER TABLE "customers" ADD COLUMN "auth0Id" varchar(255)
      `);
      console.log('✅ auth0Id column added');
    }
    
    // Check if picture column exists in customers table
    const pictureColumns = await AppDataSource.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'customers' 
      AND column_name = 'picture'
    `);
    
    if (pictureColumns.length === 0) {
      console.log('🖼️ Adding picture column to customers table...');
      await AppDataSource.query(`
        ALTER TABLE "customers" ADD COLUMN "picture" varchar(500)
      `);
      console.log('✅ picture column added');
    }
    
    // Check if updated_at column exists in customers table
    const updatedAtColumns = await AppDataSource.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'customers' 
      AND column_name = 'updated_at'
    `);
    
    if (updatedAtColumns.length === 0) {
      console.log('⏰ Adding updated_at column to customers table...');
      await AppDataSource.query(`
        ALTER TABLE "customers" ADD COLUMN "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP
      `);
      console.log('✅ updated_at column added');
    }
    
    console.log('✅ Table schemas verified and updated');
    
  } catch (error) {
    console.error('❌ Error ensuring table schemas:', error);
    // Don't throw - this is not critical
    console.log('⚠️ Continuing despite schema verification errors...');
  }
}

// Run setup if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupProductionDatabase();
}

export { setupProductionDatabase }; 