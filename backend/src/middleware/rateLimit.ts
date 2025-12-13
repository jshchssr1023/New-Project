/**
 * Rate Limiting Middleware
 *
 * Implements rate limiting using database storage for multi-instance support.
 * Provides configurable rate limits per endpoint and user.
 */

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/db';
import logger from '../utils/logger';
import { AuthRequest } from './auth';

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (req: Request) => string; // Custom key generator
  skipFailedRequests?: boolean; // Don't count failed requests
  message?: string; // Custom error message
}

// Default configurations for different endpoints
export const RATE_LIMIT_CONFIGS = {
  login: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 50, // Increased for development
    message: 'Too many login attempts. Please try again in a minute.',
  },
  api: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 1000, // Increased for development
    message: 'Too many requests. Please slow down.',
  },
  strict: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100, // Increased for development
    message: 'Rate limit exceeded for this operation.',
  },
};

/**
 * Get the window start time (rounded to the beginning of the current window)
 */
function getWindowStart(windowMs: number): Date {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  return new Date(windowStart);
}

/**
 * Generate a rate limit key from the request
 * Uses user ID if authenticated, otherwise falls back to IP
 */
function defaultKeyGenerator(req: Request): string {
  const authReq = req as AuthRequest;
  if (authReq.user?.id) {
    return `user:${authReq.user.id}`;
  }
  // Fall back to IP address
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return `ip:${ip}`;
}

// In-memory fallback rate limiter when database is unavailable
const inMemoryRateLimits = new Map<string, { count: number; windowStart: number }>();
let dbAvailable = true;
let dbCheckPending = false;

/**
 * Periodically check if database is available
 */
async function checkDbAvailability(): Promise<boolean> {
  if (dbCheckPending) return dbAvailable;
  dbCheckPending = true;

  try {
    // Try a simple query to check if the table exists
    await prisma.rateLimitEntry.findFirst({ take: 1 });
    dbAvailable = true;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('no such table') || message.includes('does not exist')) {
      logger.warn('RateLimitEntry table not found - using in-memory rate limiting. Run "npx prisma db push" to create the table.');
      dbAvailable = false;
    } else {
      // Other errors - still try to use DB
      dbAvailable = true;
    }
  } finally {
    dbCheckPending = false;
  }

  return dbAvailable;
}

/**
 * Clean up old in-memory rate limit entries
 */
function cleanupInMemoryEntries(windowMs: number): void {
  const now = Date.now();
  for (const [key, value] of inMemoryRateLimits.entries()) {
    if (now - value.windowStart > windowMs * 2) {
      inMemoryRateLimits.delete(key);
    }
  }
}

/**
 * In-memory rate limit check (fallback when DB unavailable)
 */
function checkRateLimitInMemory(
  identifier: string,
  endpoint: string,
  windowMs: number,
  maxRequests: number
): { allowed: boolean; currentCount: number; remaining: number } {
  const key = `${identifier}:${endpoint}`;
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;

  const existing = inMemoryRateLimits.get(key);

  // New window or no existing entry
  if (!existing || existing.windowStart !== windowStart) {
    inMemoryRateLimits.set(key, { count: 1, windowStart });
    return { allowed: true, currentCount: 1, remaining: maxRequests - 1 };
  }

  // Increment existing entry
  existing.count++;
  const allowed = existing.count <= maxRequests;
  const remaining = Math.max(0, maxRequests - existing.count);

  return { allowed, currentCount: existing.count, remaining };
}

/**
 * Check and update rate limit in database
 */
async function checkRateLimitInDb(
  identifier: string,
  endpoint: string,
  windowStart: Date,
  windowMs: number,
  maxRequests: number
): Promise<{ allowed: boolean; currentCount: number; remaining: number }> {
  // Check if DB is available
  if (!dbAvailable) {
    // Try to reconnect periodically (every 60 seconds)
    const lastCheck = (global as any).__rateLimitDbLastCheck || 0;
    if (Date.now() - lastCheck > 60000) {
      (global as any).__rateLimitDbLastCheck = Date.now();
      checkDbAvailability().catch(() => {}); // Fire and forget
    }

    // Use in-memory fallback
    return checkRateLimitInMemory(identifier, endpoint, windowMs, maxRequests);
  }

  try {
    // Use upsert to atomically check and increment
    const result = await prisma.rateLimitEntry.upsert({
      where: {
        identifier_endpoint_windowStart: {
          identifier,
          endpoint,
          windowStart,
        },
      },
      update: {
        requestCount: { increment: 1 },
      },
      create: {
        identifier,
        endpoint,
        windowStart,
        requestCount: 1,
      },
    });

    const allowed = result.requestCount <= maxRequests;
    const remaining = Math.max(0, maxRequests - result.requestCount);

    return { allowed, currentCount: result.requestCount, remaining };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    // If table doesn't exist, switch to in-memory mode
    if (message.includes('no such table') || message.includes('does not exist')) {
      logger.warn('RateLimitEntry table not found - switching to in-memory rate limiting');
      dbAvailable = false;
      return checkRateLimitInMemory(identifier, endpoint, windowMs, maxRequests);
    }

    logger.error('Rate limit check failed', error);
    // For other errors, allow the request (fail open for transient DB issues)
    // but log for monitoring
    return { allowed: true, currentCount: 0, remaining: maxRequests };
  }
}

/**
 * Create a rate limiting middleware with the given configuration
 */
export function createRateLimit(config: RateLimitConfig) {
  const {
    windowMs,
    maxRequests,
    keyGenerator = defaultKeyGenerator,
    message = 'Too many requests. Please try again later.',
  } = config;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const identifier = keyGenerator(req);
      const endpoint = req.route?.path || req.path || 'unknown';
      const windowStart = getWindowStart(windowMs);

      const { allowed, currentCount, remaining } = await checkRateLimitInDb(
        identifier,
        endpoint,
        windowStart,
        windowMs,
        maxRequests
      );

      // Periodically clean up in-memory entries
      if (Math.random() < 0.01) { // 1% chance per request
        cleanupInMemoryEntries(windowMs);
      }

      // Set rate limit headers
      const resetTime = new Date(windowStart.getTime() + windowMs);
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', resetTime.toISOString());

      if (!allowed) {
        const retryAfterSeconds = Math.ceil((resetTime.getTime() - Date.now()) / 1000);
        res.setHeader('Retry-After', retryAfterSeconds);

        logger.warn('Rate limit exceeded', {
          identifier,
          endpoint,
          currentCount,
          maxRequests,
        });

        res.status(429).json({
          message,
          retryAfter: retryAfterSeconds,
          limit: maxRequests,
          windowMs,
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Rate limit middleware error', error);
      // SECURITY: Fail closed - deny requests when rate limit check fails
      // This prevents potential DoS bypasses through database errors
      res.status(503).json({
        message: 'Service temporarily unavailable. Please try again later.',
        retryAfter: 30,
      });
      return;
    }
  };
}

/**
 * Pre-configured rate limiters for common use cases
 */
export const loginRateLimit = createRateLimit(RATE_LIMIT_CONFIGS.login);
export const apiRateLimit = createRateLimit(RATE_LIMIT_CONFIGS.api);
export const strictRateLimit = createRateLimit(RATE_LIMIT_CONFIGS.strict);

/**
 * Clean up old rate limit entries
 * Should be run periodically (e.g., every hour)
 */
export async function cleanupRateLimitEntries(olderThanMs: number = 3600000): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - olderThanMs);
    const result = await prisma.rateLimitEntry.deleteMany({
      where: {
        windowStart: {
          lt: cutoff,
        },
      },
    });

    if (result.count > 0) {
      logger.info('Cleaned up old rate limit entries', { count: result.count });
    }

    return result.count;
  } catch (error) {
    logger.error('Failed to cleanup rate limit entries', error);
    return 0;
  }
}

/**
 * Initialize rate limiter - check database availability
 * Call this on server startup
 */
export async function initializeRateLimiter(): Promise<void> {
  logger.info('Initializing rate limiter...');
  const isDbAvailable = await checkDbAvailability();
  if (isDbAvailable) {
    logger.info('Rate limiter using database storage');
  } else {
    logger.warn('Rate limiter using in-memory storage (database table missing)');
    logger.warn('Run "npx prisma db push" to enable database-backed rate limiting');
  }
}

export default {
  createRateLimit,
  loginRateLimit,
  apiRateLimit,
  strictRateLimit,
  cleanupRateLimitEntries,
  initializeRateLimiter,
  RATE_LIMIT_CONFIGS,
};
