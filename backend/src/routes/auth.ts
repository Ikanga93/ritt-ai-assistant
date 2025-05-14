import express from 'express';
import * as logger from '../utils/logger.js';

const router = express.Router();

// Basic health check endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

export default router; 