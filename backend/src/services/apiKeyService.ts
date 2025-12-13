/**
 * API Key Service
 *
 * Manages API keys for public REST API access.
 * Provides authentication, rate limiting tracking, and key management.
 */

import crypto from 'crypto';
import { prisma } from './db';
import logger, { safeJsonParse } from '../utils/logger';

// =============================================================================
// TYPES
// =============================================================================

export interface ApiKeyData {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string[];
  rateLimit: number;
  rateLimitWindow: number;
  isActive: boolean;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  companyId: string;
}

export interface CreateApiKeyInput {
  name: string;
  permissions: string[];
  rateLimit?: number;
  rateLimitWindow?: number;
  expiresAt?: Date;
  companyId: string;
  createdById: string;
}

export interface ApiKeyValidationResult {
  valid: boolean;
  apiKey?: ApiKeyData;
  error?: string;
}

// Rate limit tracking (in-memory, would use Redis in production)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

// =============================================================================
// SERVICE FUNCTIONS
// =============================================================================

/**
 * Generate a new API key
 * Format: chr_live_xxxxxxxxxxxxxxxxxxxx (32 chars after prefix)
 */
export async function createApiKey(input: CreateApiKeyInput): Promise<{ apiKey: ApiKeyData; fullKey: string }> {
  const keyValue = crypto.randomBytes(24).toString('base64url');
  const fullKey = `chr_live_${keyValue}`;
  const keyPrefix = fullKey.substring(0, 12); // chr_live_xxx
  const keyHash = hashKey(fullKey);

  try {
    const apiKey = await prisma.apiKey.create({
      data: {
        name: input.name,
        keyHash,
        keyPrefix,
        permissions: JSON.stringify(input.permissions),
        rateLimit: input.rateLimit || 1000,
        rateLimitWindow: input.rateLimitWindow || 3600,
        isActive: true,
        expiresAt: input.expiresAt || null,
        companyId: input.companyId,
        createdById: input.createdById,
      },
    });

    logger.info('API key created', { keyId: apiKey.id, name: input.name, companyId: input.companyId });

    return {
      apiKey: {
        id: apiKey.id,
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        permissions: safeJsonParse<string[]>(apiKey.permissions, [], 'apiKey.permissions'),
        rateLimit: apiKey.rateLimit,
        rateLimitWindow: apiKey.rateLimitWindow,
        isActive: apiKey.isActive,
        lastUsedAt: apiKey.lastUsedAt,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
        companyId: apiKey.companyId,
      },
      fullKey, // Only returned once at creation
    };
  } catch (error) {
    logger.error('Failed to create API key', error, { name: input.name, companyId: input.companyId });
    throw new Error('Failed to create API key. Please try again.');
  }
}

/**
 * Validate an API key
 * SECURITY: Does NOT allow fallback to dev mode - always validates properly
 */
export async function validateApiKey(key: string): Promise<ApiKeyValidationResult> {
  if (!key.startsWith('chr_live_')) {
    return { valid: false, error: 'Invalid API key format' };
  }

  const keyHash = hashKey(key);

  try {
    const apiKey = await prisma.apiKey.findFirst({
      where: { keyHash },
    });

    if (!apiKey) {
      logger.warn('API key not found', { keyPrefix: key.substring(0, 12) });
      return { valid: false, error: 'API key not found' };
    }

    if (!apiKey.isActive) {
      logger.warn('Attempted use of disabled API key', { keyId: apiKey.id });
      return { valid: false, error: 'API key is disabled' };
    }

    if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
      logger.warn('Attempted use of expired API key', { keyId: apiKey.id });
      return { valid: false, error: 'API key has expired' };
    }

    // Update last used timestamp
    await prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      valid: true,
      apiKey: {
        id: apiKey.id,
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        permissions: safeJsonParse<string[]>(apiKey.permissions, [], 'apiKey.permissions'),
        rateLimit: apiKey.rateLimit,
        rateLimitWindow: apiKey.rateLimitWindow,
        isActive: apiKey.isActive,
        lastUsedAt: new Date(),
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
        companyId: apiKey.companyId,
      },
    };
  } catch (error) {
    // SECURITY: On database error, reject the key - do NOT allow access
    logger.error('API key validation error - rejecting key for security', error);
    return {
      valid: false,
      error: 'API key validation failed. Please try again.',
    };
  }
}

/**
 * Check rate limit for an API key
 */
export function checkRateLimit(apiKey: ApiKeyData): { allowed: boolean; remaining: number; resetAt: Date } {
  const now = Date.now();
  const windowMs = apiKey.rateLimitWindow * 1000;
  const key = apiKey.id;

  let entry = rateLimitStore.get(key);

  // Reset if window has passed
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    rateLimitStore.set(key, entry);
  }

  entry.count++;

  return {
    allowed: entry.count <= apiKey.rateLimit,
    remaining: Math.max(0, apiKey.rateLimit - entry.count),
    resetAt: new Date(entry.resetAt),
  };
}

/**
 * List API keys for a company
 */
export async function listApiKeys(companyId: string): Promise<ApiKeyData[]> {
  try {
    const keys = await prisma.apiKey.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });

    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      permissions: safeJsonParse<string[]>(k.permissions, [], 'apiKey.permissions'),
      rateLimit: k.rateLimit,
      rateLimitWindow: k.rateLimitWindow,
      isActive: k.isActive,
      lastUsedAt: k.lastUsedAt,
      expiresAt: k.expiresAt,
      createdAt: k.createdAt,
      companyId: k.companyId,
    }));
  } catch (error) {
    logger.error('Failed to list API keys', error, { companyId });
    throw new Error('Failed to retrieve API keys');
  }
}

/**
 * Revoke an API key
 */
export async function revokeApiKey(id: string, companyId: string): Promise<boolean> {
  try {
    const result = await prisma.apiKey.updateMany({
      where: { id, companyId },
      data: { isActive: false },
    });

    if (result.count > 0) {
      logger.info('API key revoked', { keyId: id, companyId });
      return true;
    }

    return false;
  } catch (error) {
    logger.error('Failed to revoke API key', error, { keyId: id, companyId });
    throw new Error('Failed to revoke API key');
  }
}

/**
 * Delete an API key
 */
export async function deleteApiKey(id: string, companyId: string): Promise<boolean> {
  try {
    const result = await prisma.apiKey.deleteMany({
      where: { id, companyId },
    });

    if (result.count > 0) {
      logger.info('API key deleted', { keyId: id, companyId });
      return true;
    }

    return false;
  } catch (error) {
    logger.error('Failed to delete API key', error, { keyId: id, companyId });
    throw new Error('Failed to delete API key');
  }
}

// =============================================================================
// HELPERS
// =============================================================================

function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// =============================================================================
// AVAILABLE PERMISSIONS
// =============================================================================

export const AVAILABLE_PERMISSIONS = [
  // Read permissions
  'read:cars',
  'read:shops',
  'read:plans',
  'read:assignments',
  'read:analytics',
  'read:customers',

  // Write permissions
  'write:cars',
  'write:shops',
  'write:plans',
  'write:assignments',

  // Admin permissions
  'admin:webhooks',
  'admin:users',
];

export default {
  createApiKey,
  validateApiKey,
  checkRateLimit,
  listApiKeys,
  revokeApiKey,
  deleteApiKey,
  AVAILABLE_PERMISSIONS,
};
