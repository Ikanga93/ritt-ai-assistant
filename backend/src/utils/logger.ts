// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Structured logging utility with correlation ID support
 * Provides consistent logging format and error tracking
 */

import { randomUUID } from 'crypto';

// Log levels
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  FATAL = 'FATAL'
}

// Interface for structured log entries
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlationId?: string;
  orderId?: string;
  orderNumber?: string;
  context?: string;
  data?: any;
  error?: any;
}

// Store active correlation IDs
const activeCorrelationIds: Map<string, string> = new Map();

/**
 * Create a new correlation ID for tracking operations
 * @param orderId Optional order ID to associate with this correlation
 * @param orderNumber Optional order number to associate with this correlation
 * @returns The generated correlation ID
 */
export function createCorrelationId(orderId?: string | number, orderNumber?: string): string {
  // Convert orderId to string if it's a number
  const orderIdStr = orderId !== undefined ? String(orderId) : undefined;
  const correlationId = `corr-${randomUUID()}`;
  
  // Store the correlation ID with order information if provided
  if (orderIdStr || orderNumber) {
    activeCorrelationIds.set(correlationId, JSON.stringify({ 
      orderId: orderIdStr, 
      orderNumber,
      createdAt: new Date().toISOString()
    }));
  }
  
  return correlationId;
}

/**
 * Remove a correlation ID from active tracking
 * @param correlationId The correlation ID to remove
 */
export function removeCorrelationId(correlationId: string): void {
  activeCorrelationIds.delete(correlationId);
}

/**
 * Format an error object for logging
 * @param error The error to format
 * @returns A formatted error object
 */
function formatError(error: any): any {
  if (!error) return undefined;
  
  // If it's an Error object, extract useful properties
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause ? formatError(error.cause) : undefined
    };
  }
  
  // If it's already an object, return as is
  return error;
}

/**
 * Create a structured log entry
 * @param level Log level
 * @param message Log message
 * @param options Additional logging options
 * @returns Formatted log entry
 */
function createLogEntry(
  level: LogLevel,
  message: string,
  options?: {
    correlationId?: string;
    orderId?: string | number;
    orderNumber?: string;
    context?: string;
    data?: any;
    error?: any;
  }
): LogEntry {
  // Convert orderId to string if it's a number
  const orderIdStr = options?.orderId !== undefined ? String(options.orderId) : undefined;
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    correlationId: options?.correlationId,
    orderId: orderIdStr,
    orderNumber: options?.orderNumber,
    context: options?.context,
    data: options?.data,
    error: options?.error ? formatError(options.error) : undefined
  };
}

/**
 * Output a log entry to the console
 * @param entry The log entry to output
 */
function outputLogEntry(entry: LogEntry): void {
  // Convert to JSON string for structured logging
  const logString = JSON.stringify(entry);
  
  // Add visual separator and timestamp for better visibility
  const timestamp = new Date().toLocaleTimeString();
  const separator = '='.repeat(80);
  
  // Output to appropriate console method based on level
  switch (entry.level) {
    case LogLevel.DEBUG:
      console.debug(`\n${separator}\n[${timestamp}] DEBUG:\n${logString}\n${separator}\n`);
      break;
    case LogLevel.INFO:
      console.info(`\n${separator}\n[${timestamp}] INFO:\n${logString}\n${separator}\n`);
      break;
    case LogLevel.WARN:
      console.warn(`\n${separator}\n[${timestamp}] WARN:\n${logString}\n${separator}\n`);
      break;
    case LogLevel.ERROR:
    case LogLevel.FATAL:
      console.error(`\n${separator}\n[${timestamp}] ERROR:\n${logString}\n${separator}\n`);
      break;
    default:
      console.log(`\n${separator}\n[${timestamp}] LOG:\n${logString}\n${separator}\n`);
  }
}

/**
 * Log at DEBUG level
 */
export function debug(
  message: string,
  options?: {
    correlationId?: string;
    orderId?: string | number;
    orderNumber?: string;
    context?: string;
    data?: any;
  }
): void {
  const entry = createLogEntry(LogLevel.DEBUG, message, options);
  outputLogEntry(entry);
}

/**
 * Log at INFO level
 */
export function info(
  message: string,
  options?: {
    correlationId?: string;
    orderId?: string | number;
    orderNumber?: string;
    context?: string;
    data?: any;
  }
): void {
  const entry = createLogEntry(LogLevel.INFO, message, options);
  outputLogEntry(entry);
}

/**
 * Log at WARN level
 */
export function warn(
  message: string,
  options?: {
    correlationId?: string;
    orderId?: string | number;
    orderNumber?: string;
    context?: string;
    data?: any;
    error?: any;
  }
): void {
  const entry = createLogEntry(LogLevel.WARN, message, options);
  outputLogEntry(entry);
}

/**
 * Log at ERROR level
 */
export function error(
  message: string,
  options?: {
    correlationId?: string;
    orderId?: string | number;
    orderNumber?: string;
    context?: string;
    data?: any;
    error?: any;
  }
): void {
  const entry = createLogEntry(LogLevel.ERROR, message, options);
  outputLogEntry(entry);
}

/**
 * Log at FATAL level
 */
export function fatal(
  message: string,
  options?: {
    correlationId?: string;
    orderId?: string | number;
    orderNumber?: string;
    context?: string;
    data?: any;
    error?: any;
  }
): void {
  const entry = createLogEntry(LogLevel.FATAL, message, options);
  outputLogEntry(entry);
}

// Default export for convenience
export default {
  createCorrelationId,
  removeCorrelationId,
  debug,
  info,
  warn,
  error,
  fatal
};
