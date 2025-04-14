// Payment Logger
// Provides structured logging for payment-related actions

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Define log levels
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL'
}

// Define log entry structure
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  orderId?: string | number;
  paymentId?: string;
  errorCode?: string;
  data?: any;
}

// Get the logs directory path
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.join(__dirname, '../../logs');

// Ensure logs directory exists
async function ensureLogsDirectory() {
  try {
    await fs.mkdir(logsDir, { recursive: true });
  } catch (error) {
    console.error('Error creating logs directory:', error);
  }
}

// Initialize the logger
ensureLogsDirectory();

// Get the current date in YYYY-MM-DD format
function getDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// Format a log entry
function formatLogEntry(entry: LogEntry): string {
  return `[${entry.timestamp}] [${entry.level}] [${entry.category}] ${entry.message}${entry.orderId ? ` | OrderID: ${entry.orderId}` : ''}${entry.paymentId ? ` | PaymentID: ${entry.paymentId}` : ''}${entry.data ? ` | Data: ${JSON.stringify(entry.data)}` : ''}\n`;
}

// Write a log entry to file
async function writeToLogFile(entry: LogEntry): Promise<void> {
  try {
    const dateStr = getDateString();
    const logFilePath = path.join(logsDir, `payment-${dateStr}.log`);
    const formattedEntry = formatLogEntry(entry);
    
    // Write to log file
    await fs.appendFile(logFilePath, formattedEntry, 'utf8');
    
    // Also log to console for development
    if (process.env.NODE_ENV !== 'production') {
      console.log(formattedEntry.trim());
    }
  } catch (error) {
    console.error('Error writing to log file:', error);
  }
}

// Create a log entry
export async function log(
  level: LogLevel,
  category: string,
  message: string,
  options?: {
    orderId?: string | number;
    paymentId?: string;
    errorCode?: string;
    data?: any;
  }
): Promise<void> {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    ...options
  };
  
  await writeToLogFile(entry);
}

// Convenience logging methods
export const paymentLogger = {
  debug: (category: string, message: string, options?: any) => log(LogLevel.DEBUG, category, message, options),
  info: (category: string, message: string, options?: any) => log(LogLevel.INFO, category, message, options),
  warning: (category: string, message: string, options?: any) => log(LogLevel.WARNING, category, message, options),
  error: (category: string, message: string, options?: any) => log(LogLevel.ERROR, category, message, options),
  critical: (category: string, message: string, options?: any) => log(LogLevel.CRITICAL, category, message, options)
};

export default paymentLogger;
