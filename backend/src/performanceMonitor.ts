// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Performance monitoring utility for tracking response times
 * Helps identify bottlenecks in the conversation flow
 */

interface PerformanceMetric {
  operation: string;
  startTime: number;
  endTime?: number;
  duration?: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private activeOperations: Map<string, PerformanceMetric> = new Map();
  private enabled: boolean = true;

  /**
   * Start timing an operation
   * @param operation Name of the operation to time
   * @returns Unique identifier for the operation
   */
  startOperation(operation: string): string {
    if (!this.enabled) return operation;
    
    const id = `${operation}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const metric: PerformanceMetric = {
      operation,
      startTime: performance.now()
    };
    
    this.activeOperations.set(id, metric);
    return id;
  }

  /**
   * End timing an operation
   * @param id Identifier returned from startOperation
   * @returns Duration of the operation in milliseconds
   */
  endOperation(id: string): number {
    if (!this.enabled) return 0;
    
    const metric = this.activeOperations.get(id);
    if (!metric) {
      console.warn(`No active operation found with id ${id}`);
      return 0;
    }
    
    metric.endTime = performance.now();
    metric.duration = metric.endTime - metric.startTime;
    
    this.metrics.push(metric);
    this.activeOperations.delete(id);
    
    return metric.duration;
  }

  /**
   * Measure the execution time of an async function
   * @param operation Name of the operation
   * @param fn Function to measure
   * @returns Result of the function
   */
  async measure<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    if (!this.enabled) return fn();
    
    const id = this.startOperation(operation);
    try {
      const result = await fn();
      const duration = this.endOperation(id);
      console.log(`[PERF] ${operation} completed in ${duration.toFixed(2)}ms`);
      return result;
    } catch (error) {
      this.endOperation(id);
      throw error;
    }
  }

  /**
   * Get performance metrics for all completed operations
   */
  getMetrics(): { operation: string; duration: number }[] {
    return this.metrics
      .filter(m => m.duration !== undefined)
      .map(m => ({
        operation: m.operation,
        duration: m.duration!
      }));
  }

  /**
   * Get the average duration for a specific operation
   * @param operation Name of the operation
   */
  getAverageDuration(operation: string): number {
    const relevantMetrics = this.metrics.filter(
      m => m.operation === operation && m.duration !== undefined
    );
    
    if (relevantMetrics.length === 0) return 0;
    
    const totalDuration = relevantMetrics.reduce(
      (sum, metric) => sum + (metric.duration || 0),
      0
    );
    
    return totalDuration / relevantMetrics.length;
  }

  /**
   * Enable or disable performance monitoring
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
    this.activeOperations.clear();
  }

  /**
   * Print a summary of performance metrics
   */
  printSummary(): void {
    if (this.metrics.length === 0) {
      console.log('[PERF] No performance metrics collected');
      return;
    }

    const operationMap = new Map<string, number[]>();
    
    // Group durations by operation
    this.metrics.forEach(metric => {
      if (metric.duration === undefined) return;
      
      const durations = operationMap.get(metric.operation) || [];
      durations.push(metric.duration);
      operationMap.set(metric.operation, durations);
    });
    
    console.log('\n=== PERFORMANCE SUMMARY ===');
    
    // Calculate and print stats for each operation
    operationMap.forEach((durations, operation) => {
      const count = durations.length;
      const total = durations.reduce((sum, d) => sum + d, 0);
      const avg = total / count;
      const min = Math.min(...durations);
      const max = Math.max(...durations);
      
      console.log(`${operation}:`);
      console.log(`  Count: ${count}`);
      console.log(`  Avg: ${avg.toFixed(2)}ms`);
      console.log(`  Min: ${min.toFixed(2)}ms`);
      console.log(`  Max: ${max.toFixed(2)}ms`);
    });
    
    console.log('===========================\n');
  }
}

// Export a singleton instance
export const performanceMonitor = new PerformanceMonitor();
