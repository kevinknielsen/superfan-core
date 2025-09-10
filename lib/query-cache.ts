/**
 * Query caching utilities for expensive database operations
 * Implements in-memory caching with TTL for frequently accessed data
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class QueryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly defaultTTL = 30000; // 30 seconds default TTL
  private readonly maxSize: number;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
    this.startCleanupTimer();
  }

  /**
   * Get data from cache if not expired (implements LRU by moving to end)
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Move to end for LRU (delete and re-add)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.data;
  }

  /**
   * Set data in cache with optional TTL and LRU eviction
   */
  set<T>(key: string, data: T, ttl?: number): void {
    // If key exists, delete it first to move to end
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Add new entry
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    });

    // Evict oldest entries if over max size
    while (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
  }

  /**
   * Remove specific key from cache
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache stats for monitoring
   */
  getStats() {
    // Estimate memory usage (rough calculation)
    const estimatedBytes = this.cache.size * 200; // ~200 bytes per entry estimate
    
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      estimatedBytes,
      entries: Array.from(this.cache.keys()),
    };
  }

  /**
   * Delete entries matching a prefix
   */
  deleteByPrefix(prefix: string): void {
    const keysToDelete = Array.from(this.cache.keys()).filter(key => key.startsWith(prefix));
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Delete entries matching a predicate function
   */
  deleteByPattern(predicate: (key: string) => boolean): void {
    const keysToDelete = Array.from(this.cache.keys()).filter(predicate);
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Start the cleanup timer
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) return; // Already started

    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Stop the cleanup timer and clear reference
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

// Singleton cache instance
export const queryCache = new QueryCache();

// Cache key generators for consistent naming
export const cacheKeys = {
  userById: (privyId: string) => `user:${privyId}`,
  userMemberships: (userId: string) => `memberships:${userId}`,
  clubBasicData: () => 'clubs:basic',
  pointsBreakdown: (userId: string, clubId: string) => `points:${userId}:${clubId}`,
  dashboardData: (privyId: string) => `dashboard:${privyId}`,
} as const;

// Cleanup timer is now managed internally by the QueryCache class

/**
 * Cache-aware user lookup utility
 * Reduces redundant user table queries across the application
 */
export async function getCachedUser(supabase: any, privyId: string) {
  const cacheKey = cacheKeys.userById(privyId);
  
  // Try cache first
  let cached = null;
  try {
    cached = queryCache.get(cacheKey);
  } catch (cacheError) {
    console.warn('Cache get operation failed:', cacheError);
    // Continue to fetch from database as if cache miss
  }
  
  if (cached) {
    return { data: cached, error: null };
  }

  // Fetch from database
  const { data, error } = await supabase
    .from('users')
    .select('id, privy_id')
    .eq('privy_id', privyId)
    .single();

  // Cache successful results for 5 minutes (user data is relatively stable)
  if (data && !error) {
    try {
      queryCache.set(cacheKey, data, 5 * 60 * 1000);
    } catch (cacheError) {
      console.warn('Cache set operation failed:', cacheError);
      // Continue without caching - don't affect the returned result
    }
  }

  return { data, error };
}

/**
 * Invalidate user-related cache entries
 * Call this when user data changes
 */
export function invalidateUserCache(privyId: string, userId?: string) {
  queryCache.delete(cacheKeys.userById(privyId));
  queryCache.delete(cacheKeys.dashboardData(privyId));
  
  if (userId) {
    queryCache.delete(cacheKeys.userMemberships(userId));
  }
}

/**
 * Invalidate points-related cache entries
 * Call this when points data changes
 */
export function invalidatePointsCache(userId: string, clubId?: string) {
  if (clubId) {
    queryCache.delete(cacheKeys.pointsBreakdown(userId, clubId));
  } else {
    // Invalidate all points cache entries for this user using public method
    queryCache.deleteByPrefix(`points:${userId}:`);
  }
}
