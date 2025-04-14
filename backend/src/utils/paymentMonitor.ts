// Payment Monitoring System
// Monitors payment-related activities and alerts on failures or unusual patterns

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import paymentLogger, { LogLevel } from './paymentLogger.js';

// Define alert levels
export enum AlertLevel {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL'
}

// Define alert types
export enum AlertType {
  PAYMENT_FAILURE = 'PAYMENT_FAILURE',
  MULTIPLE_FAILURES = 'MULTIPLE_FAILURES',
  API_ERROR = 'API_ERROR',
  UNUSUAL_ACTIVITY = 'UNUSUAL_ACTIVITY',
  WEBHOOK_FAILURE = 'WEBHOOK_FAILURE'
}

// Define alert interface
export interface PaymentAlert {
  id: string;
  timestamp: string;
  level: AlertLevel;
  type: AlertType;
  message: string;
  orderId?: string | number;
  paymentId?: string;
  errorCode?: string;
  data?: any;
  resolved: boolean;
  resolvedAt?: string;
}

// Get the alerts directory path
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const alertsDir = path.join(__dirname, '../../alerts');

// Ensure alerts directory exists
async function ensureAlertsDirectory() {
  try {
    await fs.mkdir(alertsDir, { recursive: true });
  } catch (error) {
    console.error('Error creating alerts directory:', error);
  }
}

// Initialize
ensureAlertsDirectory();

// In-memory storage for active alerts
const activeAlerts: Map<string, PaymentAlert> = new Map();

// Payment failure tracking
const paymentFailures: Map<string, { count: number, lastFailure: string }> = new Map();

// Generate a unique alert ID
function generateAlertId(): string {
  return `alert_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

// Create and save an alert
export async function createAlert(
  level: AlertLevel,
  type: AlertType,
  message: string,
  options?: {
    orderId?: string | number;
    paymentId?: string;
    errorCode?: string;
    data?: any;
  }
): Promise<PaymentAlert> {
  const alertId = generateAlertId();
  const timestamp = new Date().toISOString();
  
  const alert: PaymentAlert = {
    id: alertId,
    timestamp,
    level,
    type,
    message,
    ...options,
    resolved: false
  };
  
  // Save to in-memory storage
  activeAlerts.set(alertId, alert);
  
  // Log the alert
  await paymentLogger.info('ALERT_CREATED', `Payment alert created: ${type} - ${message}`, {
    orderId: options?.orderId,
    paymentId: options?.paymentId,
    data: { alertId, level, type }
  });
  
  // Save to file
  try {
    const alertsFilePath = path.join(alertsDir, 'payment-alerts.json');
    
    // Read existing alerts or create empty array
    let alerts: PaymentAlert[] = [];
    try {
      const data = await fs.readFile(alertsFilePath, 'utf8');
      alerts = JSON.parse(data);
    } catch (error) {
      // File doesn't exist or is invalid, start with empty array
      alerts = [];
    }
    
    // Add new alert
    alerts.push(alert);
    
    // Write back to file
    await fs.writeFile(alertsFilePath, JSON.stringify(alerts, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving alert to file:', error);
  }
  
  // Send notification for critical alerts
  if (level === AlertLevel.CRITICAL) {
    // In a real system, this would send an email, SMS, or other notification
    console.error(`[CRITICAL ALERT] ${type}: ${message}`);
  }
  
  return alert;
}

// Resolve an alert
export async function resolveAlert(alertId: string): Promise<boolean> {
  const alert = activeAlerts.get(alertId);
  if (!alert) {
    return false;
  }
  
  // Update alert
  alert.resolved = true;
  alert.resolvedAt = new Date().toISOString();
  
  // Remove from active alerts
  activeAlerts.delete(alertId);
  
  // Log resolution
  await paymentLogger.info('ALERT_RESOLVED', `Payment alert resolved: ${alert.type} - ${alert.message}`, {
    orderId: alert.orderId,
    paymentId: alert.paymentId,
    data: { alertId, level: alert.level, type: alert.type }
  });
  
  // Update file
  try {
    const alertsFilePath = path.join(alertsDir, 'payment-alerts.json');
    
    // Read existing alerts
    let alerts: PaymentAlert[] = [];
    try {
      const data = await fs.readFile(alertsFilePath, 'utf8');
      alerts = JSON.parse(data);
    } catch (error) {
      return false;
    }
    
    // Update alert in array
    const index = alerts.findIndex(a => a.id === alertId);
    if (index >= 0) {
      alerts[index] = alert;
      
      // Write back to file
      await fs.writeFile(alertsFilePath, JSON.stringify(alerts, null, 2), 'utf8');
    }
  } catch (error) {
    console.error('Error updating alert in file:', error);
    return false;
  }
  
  return true;
}

// Get all active alerts
export function getActiveAlerts(): PaymentAlert[] {
  return Array.from(activeAlerts.values());
}

// Track payment failure
export async function trackPaymentFailure(
  orderId: string | number,
  paymentId: string,
  errorMessage: string
): Promise<void> {
  const key = `${orderId}-${paymentId}`;
  const now = new Date().toISOString();
  
  // Update failure count
  if (paymentFailures.has(key)) {
    const failure = paymentFailures.get(key)!;
    failure.count++;
    failure.lastFailure = now;
    paymentFailures.set(key, failure);
    
    // If multiple failures, create an alert
    if (failure.count >= 3) {
      await createAlert(
        AlertLevel.CRITICAL,
        AlertType.MULTIPLE_FAILURES,
        `Multiple payment failures (${failure.count}) for order #${orderId}`,
        {
          orderId,
          paymentId,
          data: { count: failure.count, lastFailure: now, error: errorMessage }
        }
      );
    }
  } else {
    paymentFailures.set(key, { count: 1, lastFailure: now });
    
    // Create a warning alert for first failure
    await createAlert(
      AlertLevel.WARNING,
      AlertType.PAYMENT_FAILURE,
      `Payment failure for order #${orderId}`,
      {
        orderId,
        paymentId,
        data: { error: errorMessage }
      }
    );
  }
}

// Monitor API errors
export async function trackApiError(
  category: string,
  errorMessage: string,
  options?: {
    orderId?: string | number;
    paymentId?: string;
    errorCode?: string;
    data?: any;
  }
): Promise<void> {
  // Log the API error
  await paymentLogger.error('API_ERROR', `Payment API error in ${category}: ${errorMessage}`, options);
  
  // Create an alert
  await createAlert(
    AlertLevel.WARNING,
    AlertType.API_ERROR,
    `Payment API error in ${category}: ${errorMessage}`,
    options
  );
}

// Monitor webhook failures
export async function trackWebhookFailure(
  eventType: string,
  errorMessage: string,
  options?: {
    paymentId?: string;
    data?: any;
  }
): Promise<void> {
  // Log the webhook failure
  await paymentLogger.error('WEBHOOK_FAILURE', `Webhook failure for ${eventType}: ${errorMessage}`, options);
  
  // Create an alert
  await createAlert(
    AlertLevel.WARNING,
    AlertType.WEBHOOK_FAILURE,
    `Webhook failure for ${eventType}: ${errorMessage}`,
    options
  );
}

// Export the payment monitor
export const paymentMonitor = {
  createAlert,
  resolveAlert,
  getActiveAlerts,
  trackPaymentFailure,
  trackApiError,
  trackWebhookFailure
};

export default paymentMonitor;
