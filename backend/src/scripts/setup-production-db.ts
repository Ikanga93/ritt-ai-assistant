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
      
      // If migrations fail, try to create tables manually
      console.log('🔧 Attempting to create tables manually...');
      await createTablesManually();
    }
    
    // Verify all required tables exist
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
    }
    
    console.log('✅ All required tables exist');
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

// Run setup if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupProductionDatabase();
}

export { setupProductionDatabase }; 