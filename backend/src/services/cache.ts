import Redis from 'ioredis';
import { logger } from '@/services/logger';

// Create Redis client
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
});

redis.on('connect', () => {
  logger.info('Redis cache connected');
});

redis.on('error', (err) => {
  logger.error('Redis cache error:', err);
});

redis.on('close', () => {
  logger.warn('Redis cache connection closed');
});

// Connect to Redis
redis.connect().catch((err) => {
  logger.error('Failed to connect to Redis cache:', err);
});

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
}

/**
 * Cache service for application-level caching
 */
export class CacheService {
  private redis: Redis;
  private defaultTTL: number = 300; // 5 minutes default

  constructor(redisClient: Redis) {
    this.redis = redisClient;
  }

  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      if (!value) {
        return null;
      }
      return JSON.parse(value) as T;
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set a value in cache
   */
  async set(key: string, value: any, options?: CacheOptions): Promise<boolean> {
    try {
      const ttl = options?.ttl || this.defaultTTL;
      const serialized = JSON.stringify(value);
      await this.redis.setex(key, ttl, serialized);
      return true;
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete a value from cache
   */
  async del(key: string): Promise<boolean> {
    try {
      await this.redis.del(key);
      return true;
    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete all keys matching a pattern
   */
  async delPattern(pattern: string): Promise<number> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }
      await this.redis.del(...keys);
      return keys.length;
    } catch (error) {
      logger.error(`Cache delete pattern error for ${pattern}:`, error);
      return 0;
    }
  }

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Cache exists error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get or set - retrieve from cache, or compute and cache if not found
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options?: CacheOptions
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Compute value
    const value = await factory();

    // Cache the result
    await this.set(key, value, options);

    return value;
  }

  /**
   * Invalidate cache keys by pattern
   */
  async invalidate(pattern: string): Promise<void> {
    await this.delPattern(pattern);
    logger.info(`Cache invalidated for pattern: ${pattern}`);
  }
}

// Export singleton instance
export const cache = new CacheService(redis);
export default cache;
