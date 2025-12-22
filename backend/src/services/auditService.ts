// Audit logging service for tracking all data changes
import { prisma } from './db';
import { Request } from 'express';
import webhookAlertService from './webhookAlertService';


export interface AuditLogEntry {
  userId: string;
  userEmail?: string;
  action: 'create' | 'update' | 'delete' | 'commit' | 'assign' | 'export' | 'view' | 'import' | 'backup_export' | 'backup_restore';
  entityType: 'Car' | 'Shop' | 'Plan' | 'PlanAssignment' | 'Scenario' | 'User' | 'ReportTemplate' | 'ScheduledReport' | 'System';
  entityId?: string;
  entityName?: string;
  changes?: Record<string, { old?: unknown; new?: unknown }>;
  details?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  companyId: string;
}

// Calculate the changes between two objects
export function calculateChanges(
  oldObj: Record<string, unknown> | null,
  newObj: Record<string, unknown>,
  sensitiveFields: string[] = ['password']
): Record<string, { old?: unknown; new?: unknown }> {
  const changes: Record<string, { old?: unknown; new?: unknown }> = {};
  const allKeys = new Set([
    ...(oldObj ? Object.keys(oldObj) : []),
    ...Object.keys(newObj),
  ]);

  for (const key of allKeys) {
    // Skip sensitive fields
    if (sensitiveFields.includes(key)) continue;
    // Skip internal fields
    if (['id', 'createdAt', 'updatedAt', 'companyId'].includes(key)) continue;

    const oldVal = oldObj?.[key];
    const newVal = newObj[key];

    // Check if values are different
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes[key] = {
        old: oldVal ?? null,
        new: newVal ?? null,
      };
    }
  }

  return changes;
}

// Extract client info from request
function getClientInfo(req?: Request): { ipAddress: string; userAgent: string } {
  if (!req) return { ipAddress: '', userAgent: '' };

  const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || '';
  const userAgent = req.headers['user-agent'] || '';

  return { ipAddress, userAgent };
}

// Log an audit entry
export async function logAudit(
  entry: AuditLogEntry,
  req?: Request
): Promise<void> {
  try {
    const { ipAddress, userAgent } = getClientInfo(req);

    await prisma.auditLog.create({
      data: {
        userId: entry.userId,
        userEmail: entry.userEmail,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        entityName: entry.entityName || '',
        changes: JSON.stringify(entry.changes),
        metadata: JSON.stringify(entry.metadata || {}),
        ipAddress,
        userAgent,
        companyId: entry.companyId,
      },
    });

    // Trigger webhook alerts for significant events
    await triggerWebhookAlert(entry);
  } catch (error) {
    // Log error but don't throw - audit logging should not break main operations
    console.error('Failed to create audit log:', error);
  }
}

// Trigger webhook alerts for significant audit events
async function triggerWebhookAlert(entry: AuditLogEntry): Promise<void> {
  try {
    const isBulkOperation = entry.metadata?.bulkOperation === true;
    const recordCount = (entry.metadata?.count as number) || 1;

    // Alert on bulk delete operations (5+ records)
    if (entry.action === 'delete' && isBulkOperation && recordCount >= 5) {
      await webhookAlertService.alertDataChange(entry.companyId, {
        action: 'Bulk Delete',
        entityType: entry.entityType,
        count: recordCount,
        userId: entry.userId,
        userName: entry.userEmail,
      });
      return;
    }

    // Alert on bulk updates/creates
    if (isBulkOperation && recordCount >= 10) {
      await webhookAlertService.alertDataChange(entry.companyId, {
        action: entry.action === 'create' ? 'Bulk Create' : 'Bulk Update',
        entityType: entry.entityType,
        count: recordCount,
        userId: entry.userId,
        userName: entry.userEmail,
      });
      return;
    }

    // Alert on user role changes (potential security event)
    if (entry.entityType === 'User' && entry.changes.role) {
      const oldRole = entry.changes.role.old as string;
      const newRole = entry.changes.role.new as string;

      // Alert if user is promoted to admin
      if (newRole === 'admin' && oldRole !== 'admin') {
        await webhookAlertService.alertSecurity(entry.companyId, {
          title: 'Admin Privileges Granted',
          message: `User ${entry.entityName || entry.entityId} was granted admin privileges by ${entry.userEmail}`,
          details: {
            targetUser: entry.entityName || entry.entityId,
            previousRole: oldRole,
            newRole,
            changedBy: entry.userEmail,
          },
        });
      }
      return;
    }

    // Alert on Plan commits (important data change)
    if (entry.entityType === 'Plan' && entry.action === 'commit') {
      await webhookAlertService.alertDataChange(entry.companyId, {
        action: 'Plan Committed',
        entityType: 'Plan',
        count: 1,
        userId: entry.userId,
        userName: entry.userEmail,
      });
    }
  } catch (error) {
    // Silent fail - webhook alerting should not break audit logging
    console.error('Failed to trigger webhook alert:', error);
  }
}

// Get audit logs with filtering
export async function getAuditLogs(
  companyId: string,
  options: {
    entityType?: string;
    entityId?: string;
    userId?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    pageSize?: number;
  } = {}
) {
  const {
    entityType,
    entityId,
    userId,
    action,
    startDate,
    endDate,
    page = 1,
    pageSize = 50,
  } = options;

  const where: Record<string, unknown> = { companyId };

  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;
  if (userId) where.userId = userId;
  if (action) where.action = action;

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) (where.createdAt as Record<string, Date>).gte = startDate;
    if (endDate) (where.createdAt as Record<string, Date>).lte = endDate;
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    data: logs.map(log => ({
      ...log,
      changes: JSON.parse(log.changes),
      metadata: JSON.parse(log.metadata),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// Get audit history for a specific entity
export async function getEntityHistory(
  companyId: string,
  entityType: string,
  entityId: string
) {
  const logs = await prisma.auditLog.findMany({
    where: { companyId, entityType, entityId },
    orderBy: { createdAt: 'desc' },
  });

  return logs.map(log => ({
    ...log,
    changes: JSON.parse(log.changes),
    metadata: JSON.parse(log.metadata),
  }));
}

export default {
  logAudit,
  getAuditLogs,
  getEntityHistory,
  calculateChanges,
};
