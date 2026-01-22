/**
 * API Key Authentication Middleware
 *
 * Provides authentication for public REST API endpoints using API keys.
 * Includes rate limiting and permission checking.
 */

import { Request, Response, NextFunction } from 'express';
import { validateApiKey, checkRateLimit, ApiKeyData } from '../services/apiKeyService';

export interface ApiAuthRequest extends Request {
  apiKey?: ApiKeyData;
  companyId?: string;
}

/**
 * Authenticate requests using API key
 * Expects header: X-API-Key: chr_live_xxxx
 */
export async function authenticateApiKey(
  req: ApiAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiKeyHeader = req.headers['x-api-key'] as string;

  if (!apiKeyHeader) {
    res.status(401).json({
      error: 'unauthorized',
      message: 'API key required. Include X-API-Key header.',
    });
    return;
  }

  const result = await validateApiKey(apiKeyHeader);

  if (!result.valid || !result.apiKey) {
    res.status(401).json({
      error: 'unauthorized',
      message: result.error || 'Invalid API key',
    });
    return;
  }

  // Check rate limit
  const rateLimit = checkRateLimit(result.apiKey);

  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', result.apiKey.rateLimit);
  res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
  res.setHeader('X-RateLimit-Reset', rateLimit.resetAt.toISOString());

  if (!rateLimit.allowed) {
    res.status(429).json({
      error: 'rate_limit_exceeded',
      message: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000),
    });
    return;
  }

  req.apiKey = result.apiKey;
  req.companyId = result.apiKey.companyId;
  next();
}

/**
 * Check if API key has required permission
 */
export function requireApiPermission(...permissions: string[]) {
  return (req: ApiAuthRequest, res: Response, next: NextFunction): void => {
    if (!req.apiKey) {
      res.status(401).json({
        error: 'unauthorized',
        message: 'API key not authenticated',
      });
      return;
    }

    const hasPermission = permissions.some((perm) =>
      req.apiKey!.permissions.includes(perm)
    );

    if (!hasPermission) {
      // SECURITY FIX: Don't expose the API key's permissions in error response
      // This prevents attackers from probing available permissions
      res.status(403).json({
        error: 'forbidden',
        message: 'Insufficient permissions for this operation',
      });
      return;
    }

    next();
  };
}

/**
 * Optional API key authentication - allows both API key and JWT
 */
export async function optionalApiAuth(
  req: ApiAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiKeyHeader = req.headers['x-api-key'] as string;

  if (apiKeyHeader) {
    const result = await validateApiKey(apiKeyHeader);
    if (result.valid && result.apiKey) {
      req.apiKey = result.apiKey;
      req.companyId = result.apiKey.companyId;
    }
  }

  next();
}
