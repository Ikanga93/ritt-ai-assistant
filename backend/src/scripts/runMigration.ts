// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Script to run database migrations
 * This will create the order_queue table in the database
 */

import { AppDataSource } from '../database.js';
import * as logger from '../utils/logger.js';

async function runMigrations() {
  try {
    // Initialize the data source
    if (!AppDataSource.isInitialized) {
      logger.info('Initializing database connection', { context: 'migration' });
      await AppDataSource.initialize();
    }
    
    // Run migrations
    logger.info('Running database migrations', { context: 'migration' });
    const migrations = await AppDataSource.runMigrations();
    
    logger.info(`Successfully ran ${migrations.length} migrations`, { 
      context: 'migration',
      data: { 
        migrations: migrations.map(m => m.name)
      }
    });
    
    // Close the connection
    await AppDataSource.destroy();
    logger.info('Database connection closed', { context: 'migration' });
    
    process.exit(0);
  } catch (error) {
    logger.error('Error running migrations', { context: 'migration', error });
    
    // Close the connection if it's open
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    
    process.exit(1);
  }
}

// Run the migrations
runMigrations();
