/**
 * Cache Service - Multi-layer caching with Redis
 * Implements caching strategies for performance optimization
 */

import { createClient, RedisClientType } from 'redis';

export interface CacheConfig {
  redis?: {
    url?: string;
    host?: string;
    port?: number;
    password?: string;
    db?: number;
  };
  defaultTTL?: number;
  enableMemoryCache?: boolean;
  maxMemoryCacheSize?: number;
}

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  hits: number;
}

export class CacheService {
  private static instance: CacheService;
  private redisClient: RedisClientType | null = null;
  private memoryCache = new Map<string, CacheEntry>();
  private config: CacheConfig;
  private isRedisAvailable = false;
  private cacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    errors: 0
  };

  private constructor(config: CacheConfig = {}) {
    this.config = {
      defaultTTL: 300, // 5 minutes
      enableMemoryCache: true,
      maxMemoryCacheSize: 100,
      ...config
    };
    
    this.initializeRedis();
    this.setupCleanupInterval();
  }

  public static getInstance(config?: CacheConfig): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService(config);
    }
    return CacheService.instance;
  }

  /**
   * Initialize Redis connection
   */
  private async initializeRedis(): Promise<void> {
    try {
      const redisConfig = this.config.redis;
      
      if (!redisConfig) {
        console.log('[Cache] Redis not configured, using memory cache only');
        return;
      }

      let url = redisConfig.url;
      if (!url && redisConfig.host) {
        url = `redis://${redisConfig.host}:${redisConfig.port || 6379}`;
        if (redisConfig.password) {
          url = `redis://:${redisConfig.password}@${redisConfig.host}:${redisConfig.port || 6379}`;
        }
      }

      if (!url) {
        console.log('[Cache] No Redis URL provided, using memory cache only');
        return;
      }

      this.redisClient = createClient({
        url,
        database: redisConfig.db || 0,
        socket: {
          connectTimeout: 5000,
          reconnectStrategy: (retries) => {
            if (retries < 3) {
              return Math.min(retries * 50, 1000);
            }
            return false;
          }
        }
      });

      this.redisClient.on('error', (error) => {
        console.error('[Cache] Redis error:', error);
        this.isRedisAvailable = false;
        this.cacheStats.errors++;
      });

      this.redisClient.on('connect', () => {
        console.log('[Cache] Redis connected');
        this.isRedisAvailable = true;
      });

      this.redisClient.on('disconnect', () => {
        console.log('[Cache] Redis disconnected');
        this.isRedisAvailable = false;
      });

      await this.redisClient.connect();
      
    } catch (error) {
      console.error('[Cache] Failed to initialize Redis:', error);
      this.isRedisAvailable = false;
    }
  }

  /**
   * Get value from cache with multi-layer strategy
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      // Try memory cache first (fastest)
      if (this.config.enableMemoryCache) {
        const memoryEntry = this.memoryCache.get(key);
        if (memoryEntry && !this.isExpired(memoryEntry)) {
          memoryEntry.hits++;
          this.cacheStats.hits++;
          return memoryEntry.data;
        } else if (memoryEntry) {
          this.memoryCache.delete(key);
        }
      }

      // Try Redis cache (fast)
      if (this.isRedisAvailable && this.redisClient) {
        try {
          const redisValue = await this.redisClient.get(key);
          if (redisValue && typeof redisValue === 'string') {
            const parsed = JSON.parse(redisValue);
            
            // Store in memory cache for next time
            if (this.config.enableMemoryCache) {
              this.setMemoryCache(key, parsed, this.config.defaultTTL!);
            }
            
            this.cacheStats.hits++;
            return parsed;
          }
        } catch (redisError) {
          console.warn('[Cache] Redis get error:', redisError);
          this.isRedisAvailable = false;
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
   * Set value in cache with multi-layer strategy
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const finalTTL = ttl || this.config.defaultTTL!;
    
    try {
      // Set in memory cache
      if (this.config.enableMemoryCache) {
        this.setMemoryCache(key, value, finalTTL);
      }

      // Set in Redis cache
      if (this.isRedisAvailable && this.redisClient) {
        try {
          await this.redisClient.setEx(key, finalTTL, JSON.stringify(value));
        } catch (redisError) {
          console.warn('[Cache] Redis set error:', redisError);
          this.isRedisAvailable = false;
        }
      }

      this.cacheStats.sets++;
      
    } catch (error) {
      console.error('[Cache] Set error:', error);
      this.cacheStats.errors++;
    }
  }

  /**
   * Delete from cache
   */
  async delete(key: string): Promise<void> {
    try {
      // Delete from memory cache
      this.memoryCache.delete(key);

      // Delete from Redis cache
      if (this.isRedisAvailable && this.redisClient) {
        try {
          await this.redisClient.del(key);
        } catch (redisError) {
          console.warn('[Cache] Redis delete error:', redisError);
        }
      }

      this.cacheStats.deletes++;
      
    } catch (error) {
      console.error('[Cache] Delete error:', error);
      this.cacheStats.errors++;
    }
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    try {
      // Clear memory cache
      this.memoryCache.clear();

      // Clear Redis cache
      if (this.isRedisAvailable && this.redisClient) {
        try {
          await this.redisClient.flushDb();
        } catch (redisError) {
          console.warn('[Cache] Redis clear error:', redisError);
        }
      }
      
    } catch (error) {
      console.error('[Cache] Clear error:', error);
    }
  }

  /**
   * Get or set pattern - fetch from cache or execute function and cache result
   */
  async getOrSet<T>(
    key: string, 
    fetchFunction: () => Promise<T>, 
    ttl?: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    
    if (cached !== null) {
      return cached;
    }

    const result = await fetchFunction();
    await this.set(key, result, ttl);
    return result;
  }

  /**
   * Batch get multiple keys
   */
  async getMultiple<T>(keys: string[]): Promise<Map<string, T>> {
    const results = new Map<string, T>();
    
    // Try to get all from memory first
    const missingKeys: string[] = [];
    
    if (this.config.enableMemoryCache) {
      for (const key of keys) {
        const memoryEntry = this.memoryCache.get(key);
        if (memoryEntry && !this.isExpired(memoryEntry)) {
          results.set(key, memoryEntry.data);
          memoryEntry.hits++;
        } else {
          missingKeys.push(key);
          if (memoryEntry) {
            this.memoryCache.delete(key);
          }
        }
      }
    } else {
      missingKeys.push(...keys);
    }

    // Get missing keys from Redis
    if (missingKeys.length > 0 && this.isRedisAvailable && this.redisClient) {
      try {
        const redisValues = await this.redisClient.mGet(missingKeys);
        
        for (let i = 0; i < missingKeys.length; i++) {
          const value = redisValues[i];
          if (value && typeof value === 'string') {
            const parsed = JSON.parse(value);
            results.set(missingKeys[i], parsed);
            
            // Cache in memory for next time
            if (this.config.enableMemoryCache) {
              this.setMemoryCache(missingKeys[i], parsed, this.config.defaultTTL!);
            }
          }
        }
      } catch (error) {
        console.warn('[Cache] Batch Redis get error:', error);
      }
    }

    return results;
  }

  /**
   * Cache with tags for group invalidation
   */
  async setWithTags<T>(key: string, value: T, tags: string[], ttl?: number): Promise<void> {
    await this.set(key, value, ttl);
    
    // Store tag mappings
    for (const tag of tags) {
      const tagKey = `tag:${tag}`;
      const taggedKeys = await this.get<string[]>(tagKey) || [];
      
      if (!taggedKeys.includes(key)) {
        taggedKeys.push(key);
        await this.set(tagKey, taggedKeys, ttl || this.config.defaultTTL!);
      }
    }
  }

  /**
   * Invalidate cache by tags
   */
  async invalidateByTags(tags: string[]): Promise<void> {
    for (const tag of tags) {
      const tagKey = `tag:${tag}`;
      const taggedKeys = await this.get<string[]>(tagKey);
      
      if (taggedKeys) {
        // Delete all keys with this tag
        await Promise.all(taggedKeys.map(key => this.delete(key)));
        // Delete the tag itself
        await this.delete(tagKey);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      ...this.cacheStats,
      memoryCacheSize: this.memoryCache.size,
      redisAvailable: this.isRedisAvailable,
      hitRate: this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) || 0
    };
  }

  /**
   * Set memory cache entry
   */
  private setMemoryCache<T>(key: string, value: T, ttl: number): void {
    // Remove oldest entries if cache is full
    if (this.memoryCache.size >= this.config.maxMemoryCacheSize!) {
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey) {
        this.memoryCache.delete(firstKey);
      }
    }

    this.memoryCache.set(key, {
      data: value,
      timestamp: Date.now(),
      ttl: ttl * 1000, // Convert to milliseconds
      hits: 0
    });
  }

  /**
   * Check if cache entry is expired
   */
  private isExpired(entry: CacheEntry): boolean {
    return Date.now() > entry.timestamp + entry.ttl;
  }

  /**
   * Setup periodic cleanup of expired memory cache entries
   */
  private setupCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.memoryCache.entries()) {
        if (this.isExpired(entry)) {
          this.memoryCache.delete(key);
        }
      }
    }, 60000); // Cleanup every minute
  }

  /**
   * Close connections
   */
  async close(): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.disconnect();
    }
    this.memoryCache.clear();
  }
}

// Helper function to create cache keys
export const createCacheKey = (...parts: (string | number)[]): string => {
  return parts.map(part => String(part)).join(':');
};

// Cache key patterns
export const CACHE_KEYS = {
  WORK_ORDERS: (warehouseId: string) => createCacheKey('work_orders', warehouseId),
  EQUIPMENT: (warehouseId: string) => createCacheKey('equipment', warehouseId), 
  PARTS: (warehouseId: string) => createCacheKey('parts', warehouseId),
  DASHBOARD_STATS: (warehouseId: string) => createCacheKey('dashboard_stats', warehouseId),
  USER_PROFILE: (userId: string) => createCacheKey('user_profile', userId),
  ESCALATION_RULES: (warehouseId: string) => createCacheKey('escalation_rules', warehouseId),
  PM_TEMPLATES: (warehouseId: string) => createCacheKey('pm_templates', warehouseId)
} as const;

// Cache TTL constants (in seconds)
export const CACHE_TTL = {
  SHORT: 60, // 1 minute
  MEDIUM: 300, // 5 minutes  
  LONG: 1800, // 30 minutes
  EXTENDED: 3600 // 1 hour
} as const;