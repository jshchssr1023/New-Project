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

/**
 * Check and update rate limit in database
 */
async function checkRateLimitInDb(
  identifier: string,
  endpoint: string,
  windowStart: Date,
  maxRequests: number
): Promise<{ allowed: boolean; currentCount: number; remaining: number }> {
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
  } catch (error) {
    logger.error('Rate limit check failed', error);
    // SECURITY: Fail closed - deny requests when rate limit check fails
    // This prevents potential DoS bypasses through database errors
    return { allowed: false, currentCount: maxRequests, remaining: 0 };
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
        maxRequests
      );

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

export default {
  createRateLimit,
  loginRateLimit,
  apiRateLimit,
  strictRateLimit,
  cleanupRateLimitEntries,
  RATE_LIMIT_CONFIGS,
};
