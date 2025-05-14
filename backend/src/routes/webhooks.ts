/**
 * Webhook Routes
 * Handles incoming webhook events from SendGrid
 */

import express, { Request, Response, NextFunction } from 'express';
import * as logger from '../utils/logger.js';
import { updateEmailDeliveryStatus } from '../services/emailService.js';

const router = express.Router();

/**
 * SendGrid webhook endpoint
 * Receives and processes email event webhooks from SendGrid
 * Documentation: https://docs.sendgrid.com/for-developers/tracking-events/event
 */
router.post('/sendgrid', express.json(), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  // Create a correlation ID for tracking this webhook event
  const correlationId = logger.createCorrelationId();
  
  try {
    // SendGrid sends an array of event objects
    const events = req.body;
    
    if (!Array.isArray(events)) {
      logger.error('Invalid SendGrid webhook payload', { 
        correlationId, 
        context: 'webhooks.sendgrid',
        data: { body: typeof req.body }
      });
      res.status(400).send('Invalid event payload');
      return;
    }
    
    logger.info(`Processing ${events.length} SendGrid events`, {
      correlationId,
      context: 'webhooks.sendgrid'
    });

    // Process each event
    for (const event of events) {
      try {
        const messageId = event.sg_message_id;
        const status = event.event;
        const timestamp = event.timestamp ? new Date(event.timestamp * 1000).getTime() : Date.now();
        const reason = event.reason || '';
        
        await updateEmailDeliveryStatus(messageId, status, timestamp, reason);
      } catch (error) {
        logger.error('Failed to process SendGrid event', {
          correlationId,
          context: 'webhooks.sendgrid',
          error,
          data: { event }
        });
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    logger.error('Error processing SendGrid webhook', {
      correlationId,
      context: 'webhooks.sendgrid',
      error
    });
    res.status(500).send('Internal Server Error');
  }
});

export default router;
