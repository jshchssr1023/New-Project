/**
 * Webhook Configuration API Routes
 *
 * Manages Slack, Teams, and custom webhook configurations for alerting.
 */

import { Router, Request, Response } from 'express';
import { authenticateToken, AuthRequest, requireRole } from '../middleware/auth';
import webhookAlertService, {
  WebhookConfig,
  AlertCategory,
  AlertSeverity,
  WebhookType,
} from '../services/webhookAlertService';
import logger from '../utils/logger';

const router = Router();

// All routes require admin role
router.use(authenticateToken);
router.use(requireRole('admin'));

/**
 * Get all webhook configs for company
 */
router.get('/', async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const companyId = authReq.user?.companyId;

  if (!companyId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const configs = await webhookAlertService.getWebhookConfigsForCompany(companyId);
    res.json({ configs });
  } catch (error) {
    logger.error('Error fetching webhook configs:', error);
    res.status(500).json({ error: 'Failed to fetch webhook configurations' });
  }
});

/**
 * Create new webhook config
 */
router.post('/', async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const companyId = authReq.user?.companyId;

  if (!companyId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { name, type, url, categories, severities } = req.body;

  // Validate required fields
  if (!name || !type || !url) {
    return res.status(400).json({ error: 'Name, type, and URL are required' });
  }

  // Validate type
  const validTypes: WebhookType[] = ['slack', 'teams', 'custom'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: 'Invalid webhook type. Must be: slack, teams, or custom' });
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  // Validate categories
  const validCategories: AlertCategory[] = ['security', 'capacity', 'performance', 'system', 'data_change'];
  const cats = categories || validCategories;
  if (!Array.isArray(cats) || !cats.every(c => validCategories.includes(c))) {
    return res.status(400).json({ error: 'Invalid categories' });
  }

  // Validate severities
  const validSeverities: AlertSeverity[] = ['info', 'warning', 'critical'];
  const sevs = severities || validSeverities;
  if (!Array.isArray(sevs) || !sevs.every(s => validSeverities.includes(s))) {
    return res.status(400).json({ error: 'Invalid severities' });
  }

  try {
    const config = await webhookAlertService.createWebhookConfig(companyId, {
      name,
      type,
      url,
      categories: cats,
      severities: sevs,
    });

    res.status(201).json({ config });
  } catch (error) {
    logger.error('Error creating webhook config:', error);
    res.status(500).json({ error: 'Failed to create webhook configuration' });
  }
});

/**
 * Update webhook config
 */
router.put('/:id', async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const companyId = authReq.user?.companyId;
  const { id } = req.params;

  if (!companyId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { name, type, url, categories, severities, isActive } = req.body;

  // Validate type if provided
  if (type) {
    const validTypes: WebhookType[] = ['slack', 'teams', 'custom'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid webhook type' });
    }
  }

  // Validate URL if provided
  if (url) {
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }
  }

  // Validate categories if provided
  if (categories) {
    const validCategories: AlertCategory[] = ['security', 'capacity', 'performance', 'system', 'data_change'];
    if (!Array.isArray(categories) || !categories.every(c => validCategories.includes(c))) {
      return res.status(400).json({ error: 'Invalid categories' });
    }
  }

  // Validate severities if provided
  if (severities) {
    const validSeverities: AlertSeverity[] = ['info', 'warning', 'critical'];
    if (!Array.isArray(severities) || !severities.every(s => validSeverities.includes(s))) {
      return res.status(400).json({ error: 'Invalid severities' });
    }
  }

  try {
    const result = await webhookAlertService.updateWebhookConfig(id, companyId, {
      name,
      type,
      url,
      categories,
      severities,
      isActive,
    });

    if (result.count === 0) {
      return res.status(404).json({ error: 'Webhook configuration not found' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error updating webhook config:', error);
    res.status(500).json({ error: 'Failed to update webhook configuration' });
  }
});

/**
 * Delete webhook config
 */
router.delete('/:id', async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const companyId = authReq.user?.companyId;
  const { id } = req.params;

  if (!companyId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await webhookAlertService.deleteWebhookConfig(id, companyId);

    if (result.count === 0) {
      return res.status(404).json({ error: 'Webhook configuration not found' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting webhook config:', error);
    res.status(500).json({ error: 'Failed to delete webhook configuration' });
  }
});

/**
 * Test webhook config
 */
router.post('/:id/test', async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const companyId = authReq.user?.companyId;
  const { id } = req.params;

  if (!companyId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Get the config first
    const configs = await webhookAlertService.getWebhookConfigsForCompany(companyId);
    const config = configs.find(c => c.id === id);

    if (!config) {
      return res.status(404).json({ error: 'Webhook configuration not found' });
    }

    const result = await webhookAlertService.testWebhook(config as WebhookConfig);

    if (result.success) {
      res.json({ success: true, message: 'Test message sent successfully' });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    logger.error('Error testing webhook:', error);
    res.status(500).json({ error: 'Failed to test webhook' });
  }
});

/**
 * Test webhook config by URL (without saving)
 */
router.post('/test-url', async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const companyId = authReq.user?.companyId;

  if (!companyId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { type, url } = req.body;

  if (!type || !url) {
    return res.status(400).json({ error: 'Type and URL are required' });
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  const testConfig: WebhookConfig = {
    id: 'test',
    name: 'Test Webhook',
    type,
    url,
    isActive: true,
    categories: ['system'],
    severities: ['info'],
    companyId,
  };

  try {
    const result = await webhookAlertService.testWebhook(testConfig);

    if (result.success) {
      res.json({ success: true, message: 'Test message sent successfully' });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    logger.error('Error testing webhook URL:', error);
    res.status(500).json({ error: 'Failed to test webhook URL' });
  }
});

/**
 * Get available categories and severities (for UI)
 */
router.get('/options', (_req: Request, res: Response) => {
  res.json({
    categories: [
      { value: 'security', label: 'Security Events', description: 'Unauthorized access, login failures' },
      { value: 'capacity', label: 'Capacity Alerts', description: 'Shop capacity warnings' },
      { value: 'performance', label: 'Performance', description: 'Degraded performance metrics' },
      { value: 'system', label: 'System Events', description: 'System updates, maintenance' },
      { value: 'data_change', label: 'Data Changes', description: 'Bulk operations, deletions' },
    ],
    severities: [
      { value: 'info', label: 'Info', color: 'blue' },
      { value: 'warning', label: 'Warning', color: 'amber' },
      { value: 'critical', label: 'Critical', color: 'red' },
    ],
    types: [
      { value: 'slack', label: 'Slack', icon: 'slack' },
      { value: 'teams', label: 'Microsoft Teams', icon: 'teams' },
      { value: 'custom', label: 'Custom Webhook', icon: 'webhook' },
    ],
  });
});

export default router;
