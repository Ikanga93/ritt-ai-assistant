import express from 'express';
import paymentRoutes from './routes/paymentRoutes.js';
import adminRoutes from './routes/admin.js';
import webhookRoutes from './routes/webhooks.js';

const router = express.Router();

// Mount routes
router.use('/payments', paymentRoutes);
router.use('/admin', adminRoutes);
router.use('/webhooks', webhookRoutes);

/**
 * Error handling middleware
 */
router.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default router;
