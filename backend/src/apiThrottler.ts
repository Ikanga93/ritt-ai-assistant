// API Throttler utility to prevent hitting OpenAI rate limits
// Implements token-based rate limiting and request throttling

/**
 * Configuration for the API throttler
 */
interface ThrottlerConfig {
  // Maximum tokens per minute (TPM)
  maxTokensPerMinute: number;
  // Maximum concurrent requests
  maxConcurrentRequests: number;
  // Delay between requests in milliseconds
  requestDelay: number;
  // Whether to enable debug logging
  debug: boolean;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: ThrottlerConfig = {
  maxTokensPerMinute: 9000, // Set below the 10,000 TPM limit to provide a buffer
  maxConcurrentRequests: 3,
  requestDelay: 500, // 500ms delay between requests
  debug: false // Disable debug logging to keep terminal output clean
};

/**
 * API Throttler for managing OpenAI API rate limits
 */
export class ApiThrottler {
  private config: ThrottlerConfig;
  private tokenBucket: number;
  private lastRefillTime: number;
  private activeRequests: number = 0;
  private requestQueue: Array<() => void> = [];

  constructor(config: Partial<ThrottlerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.tokenBucket = this.config.maxTokensPerMinute;
    this.lastRefillTime = Date.now();
    
    // Set up token refill interval (every second)
    setInterval(() => this.refillTokens(), 1000);
    
    if (this.config.debug) {
      console.log(`[THROTTLER] Initialized with config:`, this.config);
    }
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refillTokens(): void {
    const now = Date.now();
    const elapsedMs = now - this.lastRefillTime;
    const refillAmount = Math.floor((elapsedMs / 60000) * this.config.maxTokensPerMinute);
    
    if (refillAmount > 0) {
      this.tokenBucket = Math.min(
        this.config.maxTokensPerMinute,
        this.tokenBucket + refillAmount
      );
      this.lastRefillTime = now;
      
      if (this.config.debug) {
        console.log(`[THROTTLER] Refilled ${refillAmount} tokens. Current: ${this.tokenBucket}`);
      }
    }
  }

  /**
   * Process the next request in the queue if possible
   */
  private processQueue(): void {
    if (this.requestQueue.length === 0 || this.activeRequests >= this.config.maxConcurrentRequests) {
      return;
    }
    
    const nextRequest = this.requestQueue.shift();
    if (nextRequest) {
      this.activeRequests++;
      
      if (this.config.debug) {
        console.log(`[THROTTLER] Processing queued request. Active: ${this.activeRequests}, Queued: ${this.requestQueue.length}`);
      }
      
      // Ensure delay is always positive
      const delay = Math.max(1, this.config.requestDelay);
      setTimeout(() => {
        nextRequest();
      }, delay);
    }
  }

  /**
   * Check if we have enough tokens for a request
   * @param estimatedTokens Estimated token usage for the request
   */
  private hasEnoughTokens(estimatedTokens: number): boolean {
    return this.tokenBucket >= estimatedTokens;
  }

  /**
   * Consume tokens from the bucket
   * @param tokens Number of tokens to consume
   */
  private consumeTokens(tokens: number): void {
    this.tokenBucket -= tokens;
    
    if (this.config.debug) {
      console.log(`[THROTTLER] Consumed ${tokens} tokens. Remaining: ${this.tokenBucket}`);
    }
  }

  /**
   * Throttle an async function based on estimated token usage
   * @param fn Function to throttle
   * @param estimatedTokens Estimated token usage
   * @returns Promise that resolves with the function result
   */
  async throttle<T>(fn: () => Promise<T>, estimatedTokens: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const executeRequest = async () => {
        try {
          if (!this.hasEnoughTokens(estimatedTokens)) {
            if (this.config.debug) {
              console.log(`[THROTTLER] Not enough tokens (${this.tokenBucket}/${estimatedTokens}). Waiting for refill.`);
            }
            
            // Wait for token refill and try again
            // Ensure delay is always positive
            setTimeout(() => {
              this.requestQueue.unshift(executeRequest);
              this.processQueue();
            }, Math.max(1, 1000));
            return;
          }
          
          // Consume tokens
          this.consumeTokens(estimatedTokens);
          
          // Execute the function
          const result = await fn();
          resolve(result);
          
          // Mark request as complete
          this.activeRequests--;
          
          // Process next request in queue
          // Ensure delay is always positive
          setTimeout(() => this.processQueue(), Math.max(1, this.config.requestDelay));
        } catch (error) {
          reject(error);
          this.activeRequests--;
          // Ensure delay is always positive
          setTimeout(() => this.processQueue(), Math.max(1, this.config.requestDelay));
        }
      };
      
      // If we can process immediately, do so
      if (this.activeRequests < this.config.maxConcurrentRequests) {
        executeRequest();
      } else {
        // Otherwise queue the request
        if (this.config.debug) {
          console.log(`[THROTTLER] Max concurrent requests reached. Queueing request.`);
        }
        this.requestQueue.push(executeRequest);
      }
    });
  }

  /**
   * Estimate token count for a text string
   * Very rough approximation: ~4 chars per token for English text
   * @param text Text to estimate tokens for
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Update throttler configuration
   * @param config New configuration values
   */
  updateConfig(config: Partial<ThrottlerConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (this.config.debug) {
      console.log(`[THROTTLER] Configuration updated:`, this.config);
    }
  }
}

// Export a singleton instance with default configuration
export const apiThrottler = new ApiThrottler();
