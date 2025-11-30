/**
 * Webhook Alert Service
 *
 * Sends alerts to Slack, Microsoft Teams, and custom webhooks
 * based on audit events and system conditions.
 */

import { prisma } from './db';

// =============================================================================
// TYPES
// =============================================================================

export type WebhookType = 'slack' | 'teams' | 'custom';
export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertCategory = 'security' | 'capacity' | 'performance' | 'system' | 'data_change';

export interface WebhookConfig {
  id: string;
  name: string;
  type: WebhookType;
  url: string;
  isActive: boolean;
  categories: AlertCategory[];
  severities: AlertSeverity[];
  companyId: string;
}

export interface AlertPayload {
  title: string;
  message: string;
  severity: AlertSeverity;
  category: AlertCategory;
  details?: Record<string, unknown>;
  link?: string;
  timestamp?: Date;
}

// =============================================================================
// SLACK MESSAGE FORMATTING
// =============================================================================

function formatSlackMessage(alert: AlertPayload): Record<string, unknown> {
  const colorMap = {
    info: '#2196F3',
    warning: '#FF9800',
    critical: '#F44336',
  };

  const emojiMap = {
    info: ':information_source:',
    warning: ':warning:',
    critical: ':rotating_light:',
  };

  return {
    attachments: [
      {
        color: colorMap[alert.severity],
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `${emojiMap[alert.severity]} ${alert.title}`,
              emoji: true,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: alert.message,
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `*Category:* ${alert.category} | *Severity:* ${alert.severity.toUpperCase()}`,
              },
              {
                type: 'mrkdwn',
                text: `*Time:* ${(alert.timestamp || new Date()).toISOString()}`,
              },
            ],
          },
          ...(alert.link
            ? [
                {
                  type: 'actions',
                  elements: [
                    {
                      type: 'button',
                      text: { type: 'plain_text', text: 'View Details' },
                      url: alert.link,
                    },
                  ],
                },
              ]
            : []),
        ],
      },
    ],
  };
}

// =============================================================================
// TEAMS MESSAGE FORMATTING
// =============================================================================

function formatTeamsMessage(alert: AlertPayload): Record<string, unknown> {
  const colorMap = {
    info: '0078D7',
    warning: 'FFA500',
    critical: 'FF0000',
  };

  return {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: colorMap[alert.severity],
    summary: alert.title,
    sections: [
      {
        activityTitle: alert.title,
        facts: [
          { name: 'Category', value: alert.category },
          { name: 'Severity', value: alert.severity.toUpperCase() },
          { name: 'Time', value: (alert.timestamp || new Date()).toISOString() },
        ],
        text: alert.message,
        markdown: true,
      },
    ],
    potentialAction: alert.link
      ? [
          {
            '@type': 'OpenUri',
            name: 'View Details',
            targets: [{ os: 'default', uri: alert.link }],
          },
        ]
      : [],
  };
}

// =============================================================================
// WEBHOOK SENDING
// =============================================================================

async function sendWebhook(
  config: WebhookConfig,
  alert: AlertPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    let body: Record<string, unknown>;

    switch (config.type) {
      case 'slack':
        body = formatSlackMessage(alert);
        break;
      case 'teams':
        body = formatTeamsMessage(alert);
        break;
      case 'custom':
      default:
        body = {
          title: alert.title,
          message: alert.message,
          severity: alert.severity,
          category: alert.category,
          details: alert.details,
          link: alert.link,
          timestamp: (alert.timestamp || new Date()).toISOString(),
        };
    }

    const response = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    return { success: true };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[WebhookAlert] Failed to send to ${config.name}: ${errMsg}`);
    return { success: false, error: errMsg };
  }
}

// =============================================================================
// MAIN SERVICE FUNCTIONS
// =============================================================================

// In-memory config cache (in production, use Redis)
const configCache = new Map<string, { configs: WebhookConfig[]; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get webhook configurations for a company
 */
async function getWebhookConfigs(companyId: string): Promise<WebhookConfig[]> {
  const cached = configCache.get(companyId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.configs;
  }

  try {
    const configs = await prisma.webhookConfig.findMany({
      where: { companyId, isActive: true },
    });

    const parsed = configs.map(c => ({
      ...c,
      categories: JSON.parse(c.categories) as AlertCategory[],
      severities: JSON.parse(c.severities) as AlertSeverity[],
    }));

    configCache.set(companyId, { configs: parsed, expiresAt: Date.now() + CACHE_TTL });
    return parsed;
  } catch (error) {
    // Table might not exist yet
    return [];
  }
}

/**
 * Clear config cache (call after config changes)
 */
function clearConfigCache(companyId?: string) {
  if (companyId) {
    configCache.delete(companyId);
  } else {
    configCache.clear();
  }
}

/**
 * Send an alert to all matching webhooks
 */
export async function sendAlert(
  companyId: string,
  alert: AlertPayload
): Promise<{ sent: number; failed: number }> {
  const configs = await getWebhookConfigs(companyId);

  // Filter configs that match the alert
  const matchingConfigs = configs.filter(
    c =>
      c.categories.includes(alert.category) &&
      c.severities.includes(alert.severity)
  );

  if (matchingConfigs.length === 0) {
    return { sent: 0, failed: 0 };
  }

  alert.timestamp = alert.timestamp || new Date();

  let sent = 0;
  let failed = 0;

  await Promise.all(
    matchingConfigs.map(async config => {
      const result = await sendWebhook(config, alert);
      if (result.success) {
        sent++;
      } else {
        failed++;
      }
    })
  );

  console.log(`[WebhookAlert] Sent ${sent}, Failed ${failed} for ${alert.title}`);
  return { sent, failed };
}

// =============================================================================
// ALERT TEMPLATES
// =============================================================================

/**
 * Alert for security events (unauthorized access, etc.)
 */
export async function alertSecurity(
  companyId: string,
  data: { title: string; message: string; details?: Record<string, unknown> }
) {
  return sendAlert(companyId, {
    ...data,
    severity: 'critical',
    category: 'security',
    link: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/audit`,
  });
}

/**
 * Alert for capacity issues
 */
export async function alertCapacity(
  companyId: string,
  data: { shopName: string; month: string; utilization: number; shopId: string }
) {
  const severity: AlertSeverity = data.utilization >= 95 ? 'critical' : 'warning';

  return sendAlert(companyId, {
    title: `Shop Capacity Alert: ${data.shopName}`,
    message: `${data.shopName} is at ${data.utilization}% capacity for ${data.month}. ${
      severity === 'critical' ? 'Immediate action required.' : 'Consider redistributing load.'
    }`,
    severity,
    category: 'capacity',
    details: data,
    link: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/shops?id=${data.shopId}`,
  });
}

/**
 * Alert for performance degradation
 */
export async function alertPerformance(
  companyId: string,
  data: { shopName: string; metric: string; value: number; threshold: number; shopId: string }
) {
  return sendAlert(companyId, {
    title: `Performance Alert: ${data.shopName}`,
    message: `${data.metric} for ${data.shopName} is ${data.value}, exceeding threshold of ${data.threshold}.`,
    severity: 'warning',
    category: 'performance',
    details: data,
    link: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/shops?id=${data.shopId}`,
  });
}

/**
 * Alert for data changes (bulk operations, deletions)
 */
export async function alertDataChange(
  companyId: string,
  data: { action: string; entityType: string; count: number; userId: string; userName: string }
) {
  return sendAlert(companyId, {
    title: `Data Change: ${data.action} ${data.entityType}`,
    message: `${data.userName} performed ${data.action} on ${data.count} ${data.entityType} records.`,
    severity: 'info',
    category: 'data_change',
    details: data,
    link: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/audit`,
  });
}

/**
 * Alert for system events
 */
export async function alertSystem(
  companyId: string,
  data: { title: string; message: string; severity?: AlertSeverity }
) {
  return sendAlert(companyId, {
    title: data.title,
    message: data.message,
    severity: data.severity || 'info',
    category: 'system',
  });
}

// =============================================================================
// WEBHOOK CONFIGURATION CRUD
// =============================================================================

export async function createWebhookConfig(
  companyId: string,
  data: {
    name: string;
    type: WebhookType;
    url: string;
    categories: AlertCategory[];
    severities: AlertSeverity[];
  }
) {
  const config = await prisma.webhookConfig.create({
    data: {
      name: data.name,
      type: data.type,
      url: data.url,
      categories: JSON.stringify(data.categories),
      severities: JSON.stringify(data.severities),
      isActive: true,
      companyId,
    },
  });

  clearConfigCache(companyId);
  return config;
}

export async function updateWebhookConfig(
  id: string,
  companyId: string,
  data: Partial<{
    name: string;
    type: WebhookType;
    url: string;
    categories: AlertCategory[];
    severities: AlertSeverity[];
    isActive: boolean;
  }>
) {
  const updateData: Record<string, unknown> = {};
  if (data.name) updateData.name = data.name;
  if (data.type) updateData.type = data.type;
  if (data.url) updateData.url = data.url;
  if (data.categories) updateData.categories = JSON.stringify(data.categories);
  if (data.severities) updateData.severities = JSON.stringify(data.severities);
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  const config = await prisma.webhookConfig.updateMany({
    where: { id, companyId },
    data: updateData,
  });

  clearConfigCache(companyId);
  return config;
}

export async function deleteWebhookConfig(id: string, companyId: string) {
  const result = await prisma.webhookConfig.deleteMany({
    where: { id, companyId },
  });

  clearConfigCache(companyId);
  return result;
}

export async function getWebhookConfigsForCompany(companyId: string) {
  const configs = await prisma.webhookConfig.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
  });

  return configs.map(c => ({
    ...c,
    categories: JSON.parse(c.categories),
    severities: JSON.parse(c.severities),
  }));
}

export async function testWebhook(config: WebhookConfig): Promise<{ success: boolean; error?: string }> {
  return sendWebhook(config, {
    title: 'Webhook Test',
    message: 'This is a test message from AITX Chronos. If you see this, your webhook is configured correctly!',
    severity: 'info',
    category: 'system',
    timestamp: new Date(),
  });
}

export default {
  sendAlert,
  alertSecurity,
  alertCapacity,
  alertPerformance,
  alertDataChange,
  alertSystem,
  createWebhookConfig,
  updateWebhookConfig,
  deleteWebhookConfig,
  getWebhookConfigsForCompany,
  testWebhook,
  clearConfigCache,
};
