// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Script to create the order_queue table directly using SQL
 * This bypasses TypeScript build issues with the admin routes
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');

// Load environment variables
const envPath = path.resolve(rootDir, '.env.local');
dotenv.config({ path: envPath });

// Create a PostgreSQL client
const client = new pg.Client({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  ssl: process.env.POSTGRES_SSL === 'true' ? true : false
});

// SQL to create the order_queue table
const createTableSQL = `
CREATE TABLE IF NOT EXISTS order_queue (
    id SERIAL PRIMARY KEY,
    order_data JSONB NOT NULL,
    auth0_user JSONB,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    next_attempt_at TIMESTAMP,
    error_message TEXT,
    correlation_id VARCHAR(100),
    processing_started_at TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_queue_status ON order_queue(status);
CREATE INDEX IF NOT EXISTS idx_order_queue_next_attempt ON order_queue(next_attempt_at);
`;

async function createOrderQueueTable() {
  try {
    console.log('Connecting to PostgreSQL database...');
    await client.connect();
    
    console.log('Creating order_queue table...');
    await client.query(createTableSQL);
    
    console.log('Order queue table created successfully!');
    
    // Next steps
    console.log('\nNext steps:');
    console.log('1. Start the server with: pnpm run dev');
    console.log('2. The order queue system will automatically start processing orders');
    console.log('3. Monitor queue status at: /api/admin/queue/stats');
    
    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('Error creating order queue table:', error);
    
    if (client) {
      await client.end();
    }
    
    process.exit(1);
  }
}

// Run the script
createOrderQueueTable();
