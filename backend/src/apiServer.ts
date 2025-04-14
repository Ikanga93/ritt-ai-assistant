// Restaurant API Server
// Provides API endpoints for restaurant order management

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Import routes
import restaurantOrdersRouter from './api/restaurantOrders.js';
import paymentLogger from './utils/paymentLogger.js';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env.local') });

// Create Express app
const app = express() as Express;

// Middleware
app.use(cors());
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', async () => {
    const duration = Date.now() - start;
    await paymentLogger.info('API_REQUEST', `${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`, {
      data: {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        duration,
        ip: req.ip
      }
    });
  });
  next();
});

// Routes
app.use(restaurantOrdersRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  paymentLogger.error('API_ERROR', `Unhandled API error: ${err.message}`, {
    data: {
      method: req.method,
      path: req.originalUrl,
      error: err.stack
    }
  });
  
  res.status(500).json({
    success: false,
    error: 'Server error'
  });
});

// Start the server
const PORT = process.env.API_PORT || 3334;

export function startApiServer(port: number = Number(PORT)): void {
  app.listen(port, () => {
    console.log(`API server running on port ${port}`);
    paymentLogger.info('API_SERVER', `API server started on port ${port}`, {
      data: { port }
    });
  });
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startApiServer();
}

export default app;
