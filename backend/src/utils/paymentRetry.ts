// Payment Retry Utility
// Provides retry mechanisms for payment operations with exponential backoff

import paymentLogger from './paymentLogger.js';
import paymentMonitor from './paymentMonitor.js';

// Default retry configuration
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000, // 1 second
  maxDelayMs: 10000,    // 10 seconds
  backoffFactor: 2,     // Exponential backoff
  jitter: true          // Add randomness to prevent thundering herd
};

// Retry configuration interface
export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
  jitter: boolean;
}

// Calculate delay with exponential backoff and optional jitter
function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffFactor, attempt);
  const delay = Math.min(exponentialDelay, config.maxDelayMs);
  
  if (config.jitter) {
    // Add random jitter (±20%)
    const jitterFactor = 0.8 + (Math.random() * 0.4); // 0.8 to 1.2
    return Math.floor(delay * jitterFactor);
  }
  
  return delay;
}

// Sleep for a given number of milliseconds
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Retry a function with exponential backoff
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    name: string;
    category: string;
    orderId?: string | number;
    paymentId?: string;
    config?: Partial<RetryConfig>;
  }
): Promise<T> {
  // Merge with default config
  const config = { ...DEFAULT_RETRY_CONFIG, ...(options.config || {}) };
  
  // Log retry attempt
  await paymentLogger.info('RETRY', `Starting ${options.name} with retry (max: ${config.maxRetries})`, {
    orderId: options.orderId,
    paymentId: options.paymentId,
    data: { category: options.category }
  });
  
  let lastError: any;
  
  // Try the operation with retries
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      // If this isn't the first attempt, wait before retrying
      if (attempt > 0) {
        const delayMs = calculateDelay(attempt - 1, config);
        
        await paymentLogger.info('RETRY', `Retry attempt ${attempt}/${config.maxRetries} for ${options.name} after ${delayMs}ms delay`, {
          orderId: options.orderId,
          paymentId: options.paymentId,
          data: { category: options.category, attempt, delayMs }
        });
        
        await sleep(delayMs);
      }
      
      // Try the operation
      const result = await operation();
      
      // If successful after retries, log it
      if (attempt > 0) {
        await paymentLogger.info('RETRY_SUCCESS', `${options.name} succeeded after ${attempt} retries`, {
          orderId: options.orderId,
          paymentId: options.paymentId,
          data: { category: options.category, attempts: attempt + 1 }
        });
      }
      
      return result;
    } catch (error) {
      lastError = error;
      
      // Log retry failure
      await paymentLogger.warning('RETRY_ATTEMPT_FAILED', `${options.name} failed on attempt ${attempt + 1}/${config.maxRetries + 1}`, {
        orderId: options.orderId,
        paymentId: options.paymentId,
        data: { 
          category: options.category, 
          attempt: attempt + 1, 
          errorMessage: error instanceof Error ? error.message : String(error)
        }
      });
      
      // If this is the last attempt, track the failure
      if (attempt === config.maxRetries) {
        await paymentMonitor.trackApiError(
          options.category,
          `${options.name} failed after ${config.maxRetries + 1} attempts`,
          {
            orderId: options.orderId,
            paymentId: options.paymentId,
            data: { 
              lastError: error instanceof Error ? error.message : String(error),
              attempts: attempt + 1
            }
          }
        );
      }
    }
  }
  
  // If we get here, all retries failed
  throw lastError;
}

// Graceful degradation for payment operations
export async function withGracefulDegradation<T>(
  primaryOperation: () => Promise<T>,
  fallbackOperation: () => Promise<T>,
  options: {
    name: string;
    category: string;
    orderId?: string | number;
    paymentId?: string;
  }
): Promise<T> {
  try {
    // Try the primary operation first
    return await primaryOperation();
  } catch (error) {
    // Log the failure
    await paymentLogger.warning('DEGRADATION', `Primary ${options.name} failed, falling back to alternative`, {
      orderId: options.orderId,
      paymentId: options.paymentId,
      data: { 
        category: options.category, 
        errorMessage: error instanceof Error ? error.message : String(error)
      }
    });
    
    // Try the fallback operation
    try {
      const result = await fallbackOperation();
      
      // Log successful fallback
      await paymentLogger.info('DEGRADATION_SUCCESS', `Fallback ${options.name} succeeded`, {
        orderId: options.orderId,
        paymentId: options.paymentId,
        data: { category: options.category }
      });
      
      return result;
    } catch (fallbackError) {
      // Log fallback failure
      await paymentLogger.error('DEGRADATION_FAILED', `Both primary and fallback ${options.name} failed`, {
        orderId: options.orderId,
        paymentId: options.paymentId,
        data: { 
          category: options.category, 
          primaryError: error instanceof Error ? error.message : String(error),
          fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        }
      });
      
      // Track the complete failure
      await paymentMonitor.trackApiError(
        options.category,
        `Both primary and fallback ${options.name} failed`,
        {
          orderId: options.orderId,
          paymentId: options.paymentId,
          data: { 
            primaryError: error instanceof Error ? error.message : String(error),
            fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
          }
        }
      );
      
      throw fallbackError;
    }
  }
}

// Export the retry utility
export const paymentRetry = {
  withRetry,
  withGracefulDegradation
};

export default paymentRetry;
