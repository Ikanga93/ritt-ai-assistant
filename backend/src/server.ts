// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Custom server setup for the LiveKit agent
 */

import express from 'express';
import { WorkerOptions, cli } from '@livekit/agents';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import apiRoutes from './routes.js';
import * as logger from './utils/logger.js';
import { startOrderProcessor, stopOrderProcessor } from './workers/orderProcessor.js';
import authRoutes from './routes/auth.js';
import paymentRoutes from './routes/paymentRoutes.js';

// Create an Express app
const app = express();

// Add middleware
app.use(cors());

// Add JSON body parser for all routes
app.use(express.json());

// Apply raw body parser for webhook route before the router
app.use('/api/payments/webhook', 
  express.raw({ type: 'application/json' }),
  (req, res, next) => {
    // Set a flag to indicate this is a webhook request
    req.isWebhook = true;
    next();
  }
);

// Initialize database before registering routes
import { initializeDatabase } from './database.js';

// Initialize the database
initializeDatabase().then(() => {
  logger.info('Database initialized successfully', { context: 'server' });
  
  // Start the order processor worker after database is initialized
  const orderProcessorInterval = startOrderProcessor();
  logger.info('Order processor worker started', { context: 'server' });
}).catch(error => {
  logger.error('Failed to initialize database', { context: 'server', error });
});

// Mount routes
app.use('/api', apiRoutes);

// Configure and start the LiveKit worker
cli.runApp(new WorkerOptions({
  agent: fileURLToPath(new URL('./agent.js', import.meta.url)),
  port: process.env.LIVEKIT_PORT ? parseInt(process.env.LIVEKIT_PORT, 10) : 10002,
  host: '0.0.0.0'
}));

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM signal', { context: 'server' });
  
  // Stop the order processor worker
  stopOrderProcessor();
  logger.info('Order processor worker stopped', { context: 'server' });
  process.exit(0);
});

// Export the app for use in agent.ts
export { app };
