// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Custom server setup for the LiveKit agent
 */

import express from 'express';
import { WorkerOptions, cli } from '@livekit/agents';
import { fileURLToPath } from 'node:url';


// Create an Express app
const app = express();

// Use PORT environment variable provided by Render or default to 8081
const port = process.env.PORT || 8081;

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
  console.log('Shutting down server...');
  server.close(() => {
    console.log('Express server closed');
    process.exit(0);
  });
});
