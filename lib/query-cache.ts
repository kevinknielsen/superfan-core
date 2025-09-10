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

  /**
   * Get data from cache if not expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Set data in cache with optional TTL
   */
  set<T>(key: string, data: T, ttl?: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    });
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
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
    };
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

// Auto cleanup every 5 minutes
setInterval(() => {
  queryCache.cleanup();
}, 5 * 60 * 1000);

/**
 * Cache-aware user lookup utility
 * Reduces redundant user table queries across the application
 */
export async function getCachedUser(supabase: any, privyId: string) {
  const cacheKey = cacheKeys.userById(privyId);
  
  // Try cache first
  const cached = queryCache.get(cacheKey);
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
    queryCache.set(cacheKey, data, 5 * 60 * 1000);
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
    // Invalidate all points cache entries for this user
    const keysToDelete = Array.from(queryCache['cache'].keys())
      .filter(key => key.startsWith(`points:${userId}:`));
    
    keysToDelete.forEach(key => queryCache.delete(key));
  }
}
