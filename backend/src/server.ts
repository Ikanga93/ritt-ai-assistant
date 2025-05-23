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

// Server is started in agent.ts to handle both webhook and regular requests
app.post('/', express.raw({ type: 'application/json' }), (req, res, next) => {
  try {
    const sig = req.headers['stripe-signature'];
    if (!sig) {
      res.status(400).json({ error: 'No Stripe signature found' });
      return;
    }

    // Ensure the body is a Buffer
    if (!Buffer.isBuffer(req.body)) {
      res.status(400).json({ error: 'Invalid request body format' });
      return;
    }

    // Forward the raw request to the payment webhook handler
    req.url = '/api/payments/webhook';
    paymentRoutes(req, res, next);
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(400).json({ error: 'Webhook error' });
  }
});

// Add JSON body parser for all other routes
app.use(express.json());

// Register API routes
app.use('/api', apiRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentRoutes);

// Start the Express server
const server = app.listen(parseInt(port.toString(), 10), '0.0.0.0', () => {
  console.log(`Express server is running on port ${port}`);
});

// Configure and start the LiveKit worker
cli.runApp(new WorkerOptions({
  agent: fileURLToPath(new URL('./agent.js', import.meta.url)),
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
