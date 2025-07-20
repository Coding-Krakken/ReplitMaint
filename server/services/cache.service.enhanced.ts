import { createClient, RedisClientType } from 'redis';

/**
 * Enhanced Caching Service
 * Implements multi-tier caching with Redis and in-memory fallback
 */
export class EnhancedCacheService {
  private static instance: EnhancedCacheService;
  private redisClient: RedisClientType | null = null;
  private memoryCache: Map<string, { data: any; expires: number; hits: number }> = new Map();
  private isRedisConnected = false;
  private memoryLimit = 1000; // Maximum items in memory cache
  private defaultTTL = 5 * 60; // 5 minutes default TTL
  private cacheStats = {
    hits: 0,
    misses: 0,
    redisHits: 0,
    memoryHits: 0,
    errors: 0
  };

  constructor() {
    this.initializeRedis();
    this.startCleanupInterval();
  }

  static getInstance(): EnhancedCacheService {
    if (!EnhancedCacheService.instance) {
      EnhancedCacheService.instance = new EnhancedCacheService();
    }
    return EnhancedCacheService.instance;
  }

  /**
   * Initialize Redis connection with fallback to memory cache
   */
  private async initializeRedis(): Promise<void> {
    try {
      const redisUrl = process.env.REDIS_URL || process.env.REDISCLOUD_URL;
      
      if (!redisUrl) {
        console.log('[Cache] No Redis URL provided, using memory cache only');
        return;
      }

      this.redisClient = createClient({
        url: redisUrl,
        socket: {
          connectTimeout: 5000
        }
      });

      this.redisClient.on('error', (err) => {
        console.error('[Cache] Redis connection error:', err.message);
        this.isRedisConnected = false;
        this.cacheStats.errors++;
      });

      this.redisClient.on('connect', () => {
        console.log('[Cache] Redis connected successfully');
        this.isRedisConnected = true;
      });

      await this.redisClient.connect();
    } catch (error) {
      console.log('[Cache] Failed to connect to Redis, using memory cache only:', error.message);
      this.isRedisConnected = false;
    }
  }

  /**
   * Get cached data with multi-tier lookup
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      // Try memory cache first (fastest)
      const memoryResult = this.getFromMemory<T>(key);
      if (memoryResult !== null) {
        this.cacheStats.hits++;
        this.cacheStats.memoryHits++;
        return memoryResult;
      }

      // Try Redis if connected
      if (this.isRedisConnected && this.redisClient) {
        const redisResult = await this.redisClient.get(key);
        if (redisResult !== null && typeof redisResult === 'string') {
          const data = JSON.parse(redisResult);
          
          // Store in memory cache for future hits
          this.setInMemory(key, data, this.defaultTTL);
          
          this.cacheStats.hits++;
          this.cacheStats.redisHits++;
          return data;
        }
      }

      this.cacheStats.misses++;
      return null;
    } catch (error) {
      console.error('[Cache] Get error:', error);
      this.cacheStats.errors++;
      return null;
    }
  }

  /**
   * Set cached data in both tiers
   */
  async set(key: string, data: any, ttlSeconds: number = this.defaultTTL): Promise<boolean> {
    try {
      // Always store in memory cache
      this.setInMemory(key, data, ttlSeconds);

      // Store in Redis if connected
      if (this.isRedisConnected && this.redisClient) {
        await this.redisClient.setEx(key, ttlSeconds, JSON.stringify(data));
      }

      return true;
    } catch (error) {
      console.error('[Cache] Set error:', error);
      this.cacheStats.errors++;
      return false;
    }
  }

  /**
   * Delete from both cache tiers
   */
  async delete(key: string): Promise<boolean> {
    try {
      // Delete from memory
      this.memoryCache.delete(key);

      // Delete from Redis if connected
      if (this.isRedisConnected && this.redisClient) {
        await this.redisClient.del(key);
      }

      return true;
    } catch (error) {
      console.error('[Cache] Delete error:', error);
      this.cacheStats.errors++;
      return false;
    }
  }

  /**
   * Clear all cache data
   */
  async clear(): Promise<void> {
    try {
      // Clear memory cache
      this.memoryCache.clear();

      // Clear Redis if connected
      if (this.isRedisConnected && this.redisClient) {
        await this.redisClient.flushDb();
      }
    } catch (error) {
      console.error('[Cache] Clear error:', error);
      this.cacheStats.errors++;
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    stats: typeof this.cacheStats;
    memorySize: number;
    hitRate: number;
    redisConnected: boolean;
  } {
    const total = this.cacheStats.hits + this.cacheStats.misses;
    const hitRate = total > 0 ? Math.round((this.cacheStats.hits / total) * 100) : 0;

    return {
      stats: { ...this.cacheStats },
      memorySize: this.memoryCache.size,
      hitRate,
      redisConnected: this.isRedisConnected
    };
  }

  /**
   * Cached function wrapper for automatic caching
   */
  async cached<T>(
    key: string,
    fetchFunction: () => Promise<T>,
    ttlSeconds: number = this.defaultTTL
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Execute function and cache result
    try {
      const result = await fetchFunction();
      await this.set(key, result, ttlSeconds);
      return result;
    } catch (error) {
      console.error(`[Cache] Error executing cached function for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Cache invalidation with pattern matching
   */
  async invalidatePattern(pattern: string): Promise<number> {
    let invalidated = 0;

    try {
      // Invalidate from memory cache
      for (const key of this.memoryCache.keys()) {
        if (this.matchesPattern(key, pattern)) {
          this.memoryCache.delete(key);
          invalidated++;
        }
      }

      // Invalidate from Redis if connected
      if (this.isRedisConnected && this.redisClient) {
        const keys = await this.redisClient.keys(pattern);
        if (keys.length > 0) {
          await this.redisClient.del(keys);
          invalidated += keys.length;
        }
      }
    } catch (error) {
      console.error('[Cache] Pattern invalidation error:', error);
      this.cacheStats.errors++;
    }

    return invalidated;
  }

  /**
   * Batch operations for efficiency
   */
  async mget<T>(keys: string[]): Promise<{ [key: string]: T | null }> {
    const results: { [key: string]: T | null } = {};

    try {
      // Try Redis first for batch operation
      if (this.isRedisConnected && this.redisClient) {
        const redisResults = await this.redisClient.mGet(keys);
        
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          const value = redisResults[i];
          
          if (value !== null && typeof value === 'string') {
            results[key] = JSON.parse(value);
            this.cacheStats.hits++;
            this.cacheStats.redisHits++;
          } else {
            results[key] = null;
            this.cacheStats.misses++;
          }
        }
      } else {
        // Fallback to individual memory lookups
        for (const key of keys) {
          results[key] = this.getFromMemory<T>(key);
          if (results[key] !== null) {
            this.cacheStats.hits++;
            this.cacheStats.memoryHits++;
          } else {
            this.cacheStats.misses++;
          }
        }
      }
    } catch (error) {
      console.error('[Cache] Batch get error:', error);
      this.cacheStats.errors++;
    }

    return results;
  }

  // Private helper methods

  private getFromMemory<T>(key: string): T | null {
    const entry = this.memoryCache.get(key);
    
    if (!entry) return null;
    
    // Check expiration
    if (Date.now() > entry.expires) {
      this.memoryCache.delete(key);
      return null;
    }
    
    // Update access statistics
    entry.hits++;
    
    return entry.data;
  }

  private setInMemory(key: string, data: any, ttlSeconds: number): void {
    // Enforce memory limit
    if (this.memoryCache.size >= this.memoryLimit) {
      this.evictLeastUsed();
    }

    this.memoryCache.set(key, {
      data,
      expires: Date.now() + (ttlSeconds * 1000),
      hits: 0
    });
  }

  private evictLeastUsed(): void {
    let leastUsedKey = '';
    let leastHits = Number.MAX_SAFE_INTEGER;

    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.hits < leastHits) {
        leastHits = entry.hits;
        leastUsedKey = key;
      }
    }

    if (leastUsedKey) {
      this.memoryCache.delete(leastUsedKey);
    }
  }

  private matchesPattern(key: string, pattern: string): boolean {
    // Simple glob pattern matching (* and ?)
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    return new RegExp(`^${regexPattern}$`).test(key);
  }

  private startCleanupInterval(): void {
    // Clean up expired memory cache entries every 5 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.memoryCache.entries()) {
        if (now > entry.expires) {
          this.memoryCache.delete(key);
        }
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    try {
      if (this.redisClient) {
        await this.redisClient.quit();
      }
      this.memoryCache.clear();
      console.log('[Cache] Cache service shutdown complete');
    } catch (error) {
      console.error('[Cache] Shutdown error:', error);
    }
  }
}

export const enhancedCache = EnhancedCacheService.getInstance();