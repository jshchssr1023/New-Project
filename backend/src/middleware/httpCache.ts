import { Request, Response, NextFunction, RequestHandler } from 'express';

// =============================================================================
// HTTP Caching Middleware
// Adds Cache-Control headers to GET endpoints based on data volatility
// =============================================================================

/**
 * Cache duration presets (in seconds)
 */
export const CacheDurations = {
  NONE: 0,           // No caching - real-time data
  SHORT: 30,         // 30 seconds - frequently changing data
  MEDIUM: 300,       // 5 minutes - moderately volatile data
  LONG: 3600,        // 1 hour - relatively stable data
  VERY_LONG: 86400,  // 24 hours - static/reference data
} as const;

export type CacheDuration = (typeof CacheDurations)[keyof typeof CacheDurations];

/**
 * Cache control options
 */
interface CacheOptions {
  /** Max age in seconds */
  maxAge: number;
  /** Whether the response is private (user-specific) */
  isPrivate?: boolean;
  /** Whether to add must-revalidate directive */
  mustRevalidate?: boolean;
  /** Whether to add stale-while-revalidate (in seconds) */
  staleWhileRevalidate?: number;
  /** Whether to add stale-if-error (in seconds) */
  staleIfError?: number;
  /** Whether to add no-store directive (for sensitive data) */
  noStore?: boolean;
  /** ETag mode: 'strong' | 'weak' | false */
  etag?: 'strong' | 'weak' | false;
}

/**
 * Default cache options per data type
 */
export const CachePresets: Record<string, CacheOptions> = {
  // No caching - sensitive or real-time data
  NONE: {
    maxAge: 0,
    isPrivate: true,
    noStore: true,
  },

  // Real-time data - allow short stale-while-revalidate for better UX
  REALTIME: {
    maxAge: 0,
    isPrivate: true,
    staleWhileRevalidate: 30,
    mustRevalidate: true,
  },

  // User-specific data - short cache, private
  USER_DATA: {
    maxAge: CacheDurations.SHORT,
    isPrivate: true,
    mustRevalidate: true,
  },

  // List data - moderate cache with stale-while-revalidate
  LIST_DATA: {
    maxAge: CacheDurations.SHORT,
    isPrivate: true,
    staleWhileRevalidate: 60,
    etag: 'weak',
  },

  // Detail data - slightly longer cache
  DETAIL_DATA: {
    maxAge: CacheDurations.MEDIUM,
    isPrivate: true,
    staleWhileRevalidate: 120,
    etag: 'weak',
  },

  // Analytics/reports - can cache longer
  ANALYTICS: {
    maxAge: CacheDurations.MEDIUM,
    isPrivate: true,
    staleWhileRevalidate: 300,
    staleIfError: 600,
    etag: 'weak',
  },

  // Reference data (shops, regions, etc.) - long cache
  REFERENCE: {
    maxAge: CacheDurations.LONG,
    isPrivate: true,
    staleWhileRevalidate: 3600,
    etag: 'strong',
  },

  // Static configuration - very long cache
  STATIC: {
    maxAge: CacheDurations.VERY_LONG,
    isPrivate: false, // Can be shared
    etag: 'strong',
  },
};

/**
 * Build Cache-Control header value from options
 */
function buildCacheControlHeader(options: CacheOptions): string {
  const directives: string[] = [];

  if (options.noStore) {
    directives.push('no-store');
    directives.push('no-cache');
    return directives.join(', ');
  }

  // Private vs public
  directives.push(options.isPrivate !== false ? 'private' : 'public');

  // Max age
  directives.push(`max-age=${options.maxAge}`);

  // Revalidation
  if (options.mustRevalidate) {
    directives.push('must-revalidate');
  }

  // Stale-while-revalidate (RFC 5861)
  if (options.staleWhileRevalidate !== undefined) {
    directives.push(`stale-while-revalidate=${options.staleWhileRevalidate}`);
  }

  // Stale-if-error (RFC 5861)
  if (options.staleIfError !== undefined) {
    directives.push(`stale-if-error=${options.staleIfError}`);
  }

  return directives.join(', ');
}

/**
 * Create HTTP caching middleware with specified options
 * @param options Cache options or preset name
 * @returns Express middleware function
 */
export function httpCache(options: CacheOptions | keyof typeof CachePresets): RequestHandler {
  const cacheOptions = typeof options === 'string' ? CachePresets[options] : options;

  return (_req: Request, res: Response, next: NextFunction): void => {
    // Only apply caching to GET requests
    if (_req.method !== 'GET') {
      next();
      return;
    }

    // Set Cache-Control header
    const cacheControl = buildCacheControlHeader(cacheOptions);
    res.setHeader('Cache-Control', cacheControl);

    // Set Vary header for proper cache keying
    res.setHeader('Vary', 'Authorization, Accept-Encoding');

    next();
  };
}

/**
 * Middleware to disable caching for sensitive endpoints
 */
export const noCache: RequestHandler = httpCache('NONE');

/**
 * Middleware to apply user-data caching (short cache, private)
 */
export const userDataCache: RequestHandler = httpCache('USER_DATA');

/**
 * Middleware to apply list-data caching
 */
export const listDataCache: RequestHandler = httpCache('LIST_DATA');

/**
 * Middleware to apply detail-data caching
 */
export const detailDataCache: RequestHandler = httpCache('DETAIL_DATA');

/**
 * Middleware to apply analytics/reports caching
 */
export const analyticsCache: RequestHandler = httpCache('ANALYTICS');

/**
 * Middleware to apply reference-data caching
 */
export const referenceCache: RequestHandler = httpCache('REFERENCE');

/**
 * Middleware factory for custom cache duration
 * @param maxAge Maximum cache age in seconds
 * @param isPrivate Whether the cache is private (default: true)
 */
export function cacheFor(maxAge: number, isPrivate = true): RequestHandler {
  return httpCache({
    maxAge,
    isPrivate,
    staleWhileRevalidate: Math.min(maxAge, 60),
    etag: 'weak',
  });
}

/**
 * Set no-cache headers on response (for use in route handlers)
 * Call this for responses that should never be cached
 */
export function setNoCache(res: Response): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

/**
 * Set cache headers on response (for use in route handlers)
 * @param res Express response object
 * @param maxAge Maximum cache age in seconds
 * @param isPrivate Whether the cache is private
 */
export function setCache(res: Response, maxAge: number, isPrivate = true): void {
  const privacy = isPrivate ? 'private' : 'public';
  res.setHeader('Cache-Control', `${privacy}, max-age=${maxAge}`);
}
