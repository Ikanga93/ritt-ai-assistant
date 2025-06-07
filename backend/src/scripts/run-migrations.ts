#!/usr/bin/env tsx

import "reflect-metadata";
import { AppDataSource } from '../database.js';

async function runMigrations() {
  try {
    console.log('🚀 Starting database migration process...');
    
    // Initialize the database connection
    if (!AppDataSource.isInitialized) {
      console.log('📡 Initializing database connection...');
      await AppDataSource.initialize();
      console.log('✅ Database connection established');
    }
    
    // Check if migrations table exists
    try {
      const result = await AppDataSource.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'migrations'
        );
      `);
      console.log('📋 Migrations table exists:', result[0].exists);
    } catch (error: any) {
      console.log('⚠️ Could not check migrations table:', error.message);
    }
    
    // Get pending migrations
    const pendingMigrations = await AppDataSource.showMigrations();
    console.log(`📊 Found ${Array.isArray(pendingMigrations) ? pendingMigrations.length : 0} pending migrations`);
    
    if (!Array.isArray(pendingMigrations) || pendingMigrations.length === 0) {
      console.log('✅ No pending migrations to run');
    } else {
      console.log('🔄 Running pending migrations...');
      
      // Run migrations
      const migrations = await AppDataSource.runMigrations();
      console.log(`✅ Successfully ran ${migrations.length} migrations:`);
      
      migrations.forEach((migration, index) => {
        console.log(`  ${index + 1}. ${migration.name}`);
      });
    }
    
    // Verify tables exist
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
    
    const expectedTables = ['customers', 'restaurants', 'menu_items', 'orders', 'order_items', 'order_queue', 'migrations'];
    const existingTableNames = tables.map((t: any) => t.table_name);
    
    const missingTables = expectedTables.filter(table => !existingTableNames.includes(table));
    
    if (missingTables.length > 0) {
      console.log('❌ Missing tables:', missingTables);
      throw new Error(`Missing required tables: ${missingTables.join(', ')}`);
    } else {
      console.log('✅ All required tables exist');
    }
    
    console.log('🎉 Migration process completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    // Close the database connection
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
      console.log('📡 Database connection closed');
    }
  }
}

// Run migrations if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
}

export { runMigrations }; 