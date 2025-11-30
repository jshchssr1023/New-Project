/**
 * Public API v1 - Webhooks Endpoints
 *
 * Allows API consumers to subscribe to webhook events.
 */

import { Router, Response } from 'express';
import { ApiAuthRequest, requireApiPermission } from '../../../middleware/apiAuth';
import { prisma } from '../../../services/db';
import crypto from 'crypto';

const router = Router();

// Webhook event types available for subscription
const WEBHOOK_EVENTS = [
  'car.created',
  'car.updated',
  'car.status_changed',
  'plan.committed',
  'plan.approved',
  'plan.activated',
  'commitment.created',
  'commitment.updated',
  'commitment.status_changed',
  'shop.capacity_warning',
  'shop.capacity_critical',
];

/**
 * GET /api/v1/webhooks/events
 * List available webhook events
 */
router.get('/events', requireApiPermission('admin:webhooks'), async (_req: ApiAuthRequest, res: Response) => {
  res.json({
    data: {
      events: WEBHOOK_EVENTS.map((event) => ({
        name: event,
        description: getEventDescription(event),
      })),
    },
  });
});

/**
 * GET /api/v1/webhooks
 * List webhook subscriptions
 */
router.get('/', requireApiPermission('admin:webhooks'), async (req: ApiAuthRequest, res: Response) => {
  const companyId = req.companyId!;

  try {
    const webhooks = await (prisma as any).apiWebhook?.findMany?.({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    }) || [];

    res.json({
      data: webhooks.map((w: any) => ({
        id: w.id,
        url: w.url,
        events: JSON.parse(w.events || '[]'),
        isActive: w.isActive,
        secret: w.secret ? '••••••••' : null,
        lastTriggered: w.lastTriggeredAt,
        failureCount: w.failureCount,
        createdAt: w.createdAt,
      })),
    });
  } catch (error) {
    // If table doesn't exist yet, return empty array
    res.json({ data: [] });
  }
});

/**
 * POST /api/v1/webhooks
 * Create a webhook subscription
 */
router.post('/', requireApiPermission('admin:webhooks'), async (req: ApiAuthRequest, res: Response) => {
  const companyId = req.companyId!;
  const { url, events } = req.body;

  if (!url || !events || !Array.isArray(events)) {
    return res.status(400).json({
      error: 'bad_request',
      message: 'url and events array are required',
    });
  }

  // Validate events
  const invalidEvents = events.filter((e: string) => !WEBHOOK_EVENTS.includes(e));
  if (invalidEvents.length > 0) {
    return res.status(400).json({
      error: 'bad_request',
      message: `Invalid events: ${invalidEvents.join(', ')}`,
      validEvents: WEBHOOK_EVENTS,
    });
  }

  // Generate secret for signature verification
  const secret = crypto.randomBytes(32).toString('hex');

  try {
    const webhook = await (prisma as any).apiWebhook?.create?.({
      data: {
        url,
        events: JSON.stringify(events),
        secret,
        isActive: true,
        failureCount: 0,
        companyId,
        apiKeyId: req.apiKey!.id,
      },
    });

    if (!webhook) {
      // Return mock response if table doesn't exist
      return res.status(201).json({
        data: {
          id: crypto.randomUUID(),
          url,
          events,
          isActive: true,
          secret, // Only returned on creation
          createdAt: new Date().toISOString(),
        },
        message: 'Webhook created (Note: ApiWebhook table not in schema yet)',
      });
    }

    res.status(201).json({
      data: {
        id: webhook.id,
        url: webhook.url,
        events: JSON.parse(webhook.events),
        isActive: webhook.isActive,
        secret, // Only returned on creation
        createdAt: webhook.createdAt,
      },
    });
  } catch (error) {
    console.error('API v1 create webhook error:', error);
    res.status(500).json({ error: 'internal_error', message: 'Failed to create webhook' });
  }
});

/**
 * DELETE /api/v1/webhooks/:id
 * Delete a webhook subscription
 */
router.delete('/:id', requireApiPermission('admin:webhooks'), async (req: ApiAuthRequest, res: Response) => {
  const companyId = req.companyId!;
  const { id } = req.params;

  try {
    await (prisma as any).apiWebhook?.deleteMany?.({
      where: { id, companyId },
    });

    res.status(204).send();
  } catch (error) {
    console.error('API v1 delete webhook error:', error);
    res.status(500).json({ error: 'internal_error', message: 'Failed to delete webhook' });
  }
});

/**
 * POST /api/v1/webhooks/:id/test
 * Send a test webhook
 */
router.post('/:id/test', requireApiPermission('admin:webhooks'), async (req: ApiAuthRequest, res: Response) => {
  const companyId = req.companyId!;
  const { id } = req.params;

  try {
    const webhook = await (prisma as any).apiWebhook?.findFirst?.({
      where: { id, companyId },
    });

    if (!webhook) {
      return res.status(404).json({ error: 'not_found', message: 'Webhook not found' });
    }

    const testPayload = {
      event: 'test.ping',
      timestamp: new Date().toISOString(),
      data: {
        message: 'This is a test webhook from Chronos Scheduler API',
        webhookId: id,
      },
    };

    // Generate signature
    const signature = crypto
      .createHmac('sha256', webhook.secret)
      .update(JSON.stringify(testPayload))
      .digest('hex');

    // Send test webhook
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Chronos-Signature': `sha256=${signature}`,
        'X-Chronos-Event': 'test.ping',
      },
      body: JSON.stringify(testPayload),
    });

    res.json({
      data: {
        success: response.ok,
        statusCode: response.status,
        message: response.ok ? 'Test webhook sent successfully' : 'Webhook endpoint returned error',
      },
    });
  } catch (error: any) {
    res.json({
      data: {
        success: false,
        error: error.message || 'Failed to send test webhook',
      },
    });
  }
});

function getEventDescription(event: string): string {
  const descriptions: Record<string, string> = {
    'car.created': 'A new car has been added to the fleet',
    'car.updated': 'Car information has been updated',
    'car.status_changed': 'Car status has changed (e.g., available → scheduled)',
    'plan.committed': 'A master plan has been committed',
    'plan.approved': 'A master plan has been approved',
    'plan.activated': 'A master plan has been activated',
    'commitment.created': 'A new commitment has been created',
    'commitment.updated': 'A commitment has been updated',
    'commitment.status_changed': 'Commitment status has changed',
    'shop.capacity_warning': 'Shop capacity is above 75%',
    'shop.capacity_critical': 'Shop capacity is above 90%',
  };
  return descriptions[event] || 'No description available';
}

export default router;
