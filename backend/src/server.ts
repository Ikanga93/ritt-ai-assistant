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


// Create an Express app
const app = express();

// Add middleware
app.use(express.json());
app.use(cors());

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

// Use PORT environment variable provided by Render or default to 8081
const port = process.env.PORT || 8081;

// Register API routes
app.use('/api', apiRoutes);

// Start the Express server
const server = app.listen(parseInt(port.toString(), 10), '0.0.0.0', () => {
  console.log(`Express server is running on port ${port}`);
});

// Configure and start the LiveKit worker
cli.runApp(new WorkerOptions({
  agent: fileURLToPath(new URL('./agent.js', import.meta.url)),
  port: parseInt(port.toString(), 10) + 1, // Use a different port for the LiveKit worker
  host: '0.0.0.0'
}));

// Handle shutdown gracefully
process.on('SIGINT', () => {
  logger.info('Shutting down server...', { context: 'server' });
  
  // Stop the order processor worker
  stopOrderProcessor();
  logger.info('Order processor worker stopped', { context: 'server' });
  
  server.close(() => {
    logger.info('Express server closed', { context: 'server' });
    process.exit(0);
  });
});
