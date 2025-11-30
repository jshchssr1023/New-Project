/**
 * API Key Management Routes
 *
 * Allows users to manage their API keys through the internal API.
 */

import { Router, Request, Response } from 'express';
import { authenticateToken, AuthRequest, requireRole } from '../middleware/auth';
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  deleteApiKey,
  AVAILABLE_PERMISSIONS,
} from '../services/apiKeyService';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * GET /api/api-keys
 * List API keys for the current user's company
 */
router.get('/', requireRole(['admin']), async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const companyId = authReq.user?.companyId;

  if (!companyId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const keys = await listApiKeys(companyId);
    res.json({ data: keys });
  } catch (error) {
    console.error('Error listing API keys:', error);
    res.status(500).json({ error: 'Failed to list API keys' });
  }
});

/**
 * GET /api/api-keys/permissions
 * List available permissions
 */
router.get('/permissions', requireRole(['admin']), async (_req: Request, res: Response) => {
  const groupedPermissions = {
    read: AVAILABLE_PERMISSIONS.filter((p) => p.startsWith('read:')),
    write: AVAILABLE_PERMISSIONS.filter((p) => p.startsWith('write:')),
    admin: AVAILABLE_PERMISSIONS.filter((p) => p.startsWith('admin:')),
  };

  res.json({
    data: {
      all: AVAILABLE_PERMISSIONS,
      grouped: groupedPermissions,
    },
  });
});

/**
 * POST /api/api-keys
 * Create a new API key
 */
router.post('/', requireRole(['admin']), async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const companyId = authReq.user?.companyId;
  const userId = authReq.user?.id;

  if (!companyId || !userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { name, permissions, rateLimit, rateLimitWindow, expiresAt } = req.body;

  if (!name || !permissions || !Array.isArray(permissions)) {
    return res.status(400).json({ error: 'name and permissions array are required' });
  }

  // Validate permissions
  const invalidPerms = permissions.filter((p: string) => !AVAILABLE_PERMISSIONS.includes(p));
  if (invalidPerms.length > 0) {
    return res.status(400).json({
      error: `Invalid permissions: ${invalidPerms.join(', ')}`,
      validPermissions: AVAILABLE_PERMISSIONS,
    });
  }

  try {
    const result = await createApiKey({
      name,
      permissions,
      rateLimit,
      rateLimitWindow,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      companyId,
      createdById: userId,
    });

    res.status(201).json({
      data: result.apiKey,
      fullKey: result.fullKey,
      message: 'API key created. Save the full key now - it cannot be retrieved later.',
    });
  } catch (error) {
    console.error('Error creating API key:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

/**
 * POST /api/api-keys/:id/revoke
 * Revoke an API key (disable without deleting)
 */
router.post('/:id/revoke', requireRole(['admin']), async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const companyId = authReq.user?.companyId;
  const { id } = req.params;

  if (!companyId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const success = await revokeApiKey(id, companyId);
    if (success) {
      res.json({ message: 'API key revoked successfully' });
    } else {
      res.status(404).json({ error: 'API key not found' });
    }
  } catch (error) {
    console.error('Error revoking API key:', error);
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

/**
 * DELETE /api/api-keys/:id
 * Permanently delete an API key
 */
router.delete('/:id', requireRole(['admin']), async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const companyId = authReq.user?.companyId;
  const { id } = req.params;

  if (!companyId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const success = await deleteApiKey(id, companyId);
    if (success) {
      res.status(204).send();
    } else {
      res.status(404).json({ error: 'API key not found' });
    }
  } catch (error) {
    console.error('Error deleting API key:', error);
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

export default router;
