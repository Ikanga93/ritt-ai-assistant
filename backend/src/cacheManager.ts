// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Cache manager for frequently accessed data
 * Helps optimize response times for voice interactions
 */

// Cache expiration time in milliseconds (5 minutes)
const CACHE_EXPIRATION = 5 * 60 * 1000;

interface CacheItem<T> {
  data: T;
  timestamp: number;
}

class CacheManager {
  private cache: Map<string, CacheItem<any>> = new Map();

  /**
   * Get an item from the cache
   * @param key Cache key
   * @returns Cached data or undefined if not found or expired
   */
  get<T>(key: string): T | undefined {
    const item = this.cache.get(key);
    if (!item) return undefined;

    // Check if the item has expired
    if (Date.now() - item.timestamp > CACHE_EXPIRATION) {
      this.cache.delete(key);
      return undefined;
    }

    return item.data as T;
  }

  /**
   * Store an item in the cache
   * @param key Cache key
   * @param data Data to cache
   */
  set<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Remove an item from the cache
   * @param key Cache key
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all items from the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get or set cache item with a factory function
   * If the item exists in cache, return it
   * If not, call the factory function, cache the result, and return it
   * 
   * @param key Cache key
   * @param factory Function to generate the data if not in cache
   * @returns The cached or newly generated data
   */
  async getOrSet<T>(key: string, factory: () => Promise<T>): Promise<T> {
    const cachedItem = this.get<T>(key);
    if (cachedItem !== undefined) {
      return cachedItem;
    }

    const data = await factory();
    this.set(key, data);
    return data;
  }
}

// Export a singleton instance
export const cacheManager = new CacheManager();
