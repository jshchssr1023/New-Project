/**
 * Master Plan Wizard Service
 *
 * Handles the Gold Standard Master Plan workflow:
 * - Weekly capacity management with inline auditing
 * - Master plan versioning and locking
 * - Integration logging for downstream publication
 * - Allocation validation and bulk operations
 */

import { prisma } from './db';
import auditService from './auditService';
import webhookAlertService from './webhookAlertService';

// =============================================================================
// TYPES
// =============================================================================

export interface WeeklyCapacityInput {
  shopId: string;
  weekKey: string;
  weekStartDate: Date;
  qualCapacity?: number;
  assignCapacity?: number;
  releaseCapacity?: number;
  repairCapacity?: number;
}

export interface CapacityChangeInput {
  weeklyCapacityId: string;
  fieldName: string;
  newValue: number;
  justification: string;
  changeCategory: string;
  userId: string;
  userEmail: string;
  companyId: string;
}

export interface MasterPlanVersionInput {
  masterPlanId: string;
  versionLabel?: string;
  planSnapshot: object;
  userId: string;
  userEmail: string;
  companyId: string;
}

export interface IntegrationLogInput {
  integrationType: string;
  endpoint: string;
  method: string;
  requestPayload?: object;
  triggerAction: string;
  entityType: string;
  entityId: string;
  userId?: string;
  userEmail?: string;
  companyId: string;
}

export interface BulkAllocationInput {
  carIds: string[];
  shopId: string;
  weekKey: string;
  workType: string;
  justification: string;
  overrideReason: string;
  userId: string;
  userEmail: string;
  companyId: string;
}

// =============================================================================
// WEEKLY CAPACITY MANAGEMENT
// =============================================================================

/**
 * Generate week keys for a date range (for time-series display)
 */
export function generateWeekKeys(startDate: Date, weeks: number): string[] {
  const weekKeys: string[] = [];
  const current = new Date(startDate);

  // Adjust to Monday
  const day = current.getDay();
  const diff = current.getDate() - day + (day === 0 ? -6 : 1);
  current.setDate(diff);

  for (let i = 0; i < weeks; i++) {
    const year = current.getFullYear();
    const week = getWeekNumber(current);
    weekKeys.push(`${year}-W${week.toString().padStart(2, '0')}`);
    current.setDate(current.getDate() + 7);
  }

  return weekKeys;
}

/**
 * Get ISO week number for a date
 */
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Get Monday of the week for a given date
 */
function getWeekStartDate(weekKey: string): Date {
  const [year, week] = weekKey.split('-W').map(Number);
  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dow = simple.getDay();
  const ISOweekStart = simple;
  if (dow <= 4) {
    ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
  } else {
    ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
  }
  return ISOweekStart;
}

/**
 * Get or create weekly capacity for a shop/week combination
 */
export async function getOrCreateWeeklyCapacity(
  shopId: string,
  weekKey: string,
  companyId: string
): Promise<ReturnType<typeof prisma.weeklyCapacity.findUnique>> {
  let capacity = await prisma.weeklyCapacity.findUnique({
    where: { shopId_weekKey: { shopId, weekKey } },
    include: { shop: true, capacityAudits: { take: 5, orderBy: { createdAt: 'desc' } } },
  });

  if (!capacity) {
    // Get shop defaults
    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new Error(`Shop ${shopId} not found`);

    // Create with shop defaults (convert monthly to weekly: divide by 4)
    capacity = await prisma.weeklyCapacity.create({
      data: {
        shopId,
        weekKey,
        weekStartDate: getWeekStartDate(weekKey),
        qualCapacity: Math.ceil((shop.qualCapacity || 0) / 4),
        assignCapacity: Math.ceil((shop.assignCapacity || 0) / 4),
        releaseCapacity: Math.ceil((shop.releaseCapacity || 0) / 4),
        repairCapacity: Math.ceil((shop.repairCapacity || 0) / 4),
        totalCapacity: Math.ceil((shop.capacity || 0) / 4),
        companyId,
      },
      include: { shop: true, capacityAudits: { take: 5, orderBy: { createdAt: 'desc' } } },
    });
  }

  return capacity;
}

/**
 * Get weekly capacities for multiple shops across a date range
 */
export async function getWeeklyCapacities(
  shopIds: string[],
  weekKeys: string[],
  companyId: string
) {
  // Ensure all capacity records exist
  const capacities = await Promise.all(
    shopIds.flatMap((shopId) =>
      weekKeys.map((weekKey) => getOrCreateWeeklyCapacity(shopId, weekKey, companyId))
    )
  );

  // Group by shop
  const byShop: Record<string, Record<string, typeof capacities[0]>> = {};
  for (const cap of capacities) {
    if (!cap) continue;
    if (!byShop[cap.shopId]) byShop[cap.shopId] = {};
    byShop[cap.shopId][cap.weekKey] = cap;
  }

  return byShop;
}

/**
 * Update weekly capacity with required audit trail
 */
export async function updateWeeklyCapacity(
  input: CapacityChangeInput
): Promise<{ success: boolean; capacity?: unknown; error?: string }> {
  try {
    // Get current value
    const current = await prisma.weeklyCapacity.findUnique({
      where: { id: input.weeklyCapacityId },
    });

    if (!current) {
      return { success: false, error: 'Capacity record not found' };
    }

    if (current.isLocked) {
      return { success: false, error: 'Capacity is locked and cannot be modified' };
    }

    const previousValue = (current as Record<string, unknown>)[input.fieldName] as number;

    // Validate justification is provided
    if (!input.justification || input.justification.trim().length < 10) {
      return { success: false, error: 'Justification must be at least 10 characters' };
    }

    // Create audit record
    await prisma.capacityAudit.create({
      data: {
        weeklyCapacityId: input.weeklyCapacityId,
        fieldName: input.fieldName,
        previousValue,
        newValue: input.newValue,
        justification: input.justification,
        changeCategory: input.changeCategory,
        changedById: input.userId,
        changedByEmail: input.userEmail,
        companyId: input.companyId,
      },
    });

    // Update capacity
    const updated = await prisma.weeklyCapacity.update({
      where: { id: input.weeklyCapacityId },
      data: {
        [input.fieldName]: input.newValue,
        totalCapacity:
          input.fieldName === 'totalCapacity'
            ? input.newValue
            : current.qualCapacity +
              current.assignCapacity +
              current.releaseCapacity +
              current.repairCapacity -
              previousValue +
              input.newValue,
      },
      include: { shop: true, capacityAudits: { take: 5, orderBy: { createdAt: 'desc' } } },
    });

    // Log to main audit system
    await auditService.logAudit({
      userId: input.userId,
      userEmail: input.userEmail,
      action: 'update',
      entityType: 'Shop',
      entityId: current.shopId,
      entityName: `Weekly Capacity ${current.weekKey}`,
      changes: {
        [input.fieldName]: { old: previousValue, new: input.newValue },
      },
      metadata: {
        weekKey: current.weekKey,
        justification: input.justification,
        changeCategory: input.changeCategory,
      },
      companyId: input.companyId,
    });

    return { success: true, capacity: updated };
  } catch (error) {
    console.error('Error updating weekly capacity:', error);
    return { success: false, error: 'Failed to update capacity' };
  }
}

/**
 * Lock weekly capacity (prevents further edits)
 */
export async function lockWeeklyCapacity(
  weeklyCapacityId: string,
  userId: string,
  companyId: string
) {
  return prisma.weeklyCapacity.update({
    where: { id: weeklyCapacityId },
    data: {
      isLocked: true,
      lockedAt: new Date(),
      lockedById: userId,
    },
  });
}

// =============================================================================
// MASTER PLAN VERSIONING
// =============================================================================

/**
 * Generate version number for a master plan
 */
function generateVersionNumber(masterPlanId: string, existingVersions: number): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const revision = existingVersions + 1;
  return `v${year}.${month}.${revision}`;
}

/**
 * Create a new version of a master plan
 */
export async function createMasterPlanVersion(
  input: MasterPlanVersionInput
): Promise<{ success: boolean; version?: unknown; error?: string }> {
  try {
    // Get existing versions count
    const existingVersions = await prisma.masterPlanVersion.count({
      where: { masterPlanId: input.masterPlanId },
    });

    const versionNumber = generateVersionNumber(input.masterPlanId, existingVersions);

    // Mark previous versions as superseded
    await prisma.masterPlanVersion.updateMany({
      where: {
        masterPlanId: input.masterPlanId,
        status: { in: ['draft', 'locked'] },
      },
      data: { status: 'superseded' },
    });

    // Get commitment count
    const commitments = await prisma.masterPlanCommitment.count({
      where: { masterPlanId: input.masterPlanId },
    });

    // Get unique car count
    const cars = await prisma.masterPlanCommitment.findMany({
      where: { masterPlanId: input.masterPlanId },
      select: { carId: true },
      distinct: ['carId'],
    });

    // Create new version
    const version = await prisma.masterPlanVersion.create({
      data: {
        masterPlanId: input.masterPlanId,
        versionNumber,
        versionLabel: input.versionLabel || '',
        status: 'draft',
        planSnapshot: JSON.stringify(input.planSnapshot),
        commitmentCount: commitments,
        totalCars: cars.length,
        companyId: input.companyId,
      },
    });

    // Log audit
    await auditService.logAudit({
      userId: input.userId,
      userEmail: input.userEmail,
      action: 'create',
      entityType: 'Plan',
      entityId: version.id,
      entityName: `Master Plan Version ${versionNumber}`,
      changes: { version: { new: versionNumber } },
      metadata: { masterPlanId: input.masterPlanId },
      companyId: input.companyId,
    });

    return { success: true, version };
  } catch (error) {
    console.error('Error creating master plan version:', error);
    return { success: false, error: 'Failed to create version' };
  }
}

/**
 * Lock and confirm a master plan version
 */
export async function lockMasterPlanVersion(
  versionId: string,
  lockReason: string,
  userId: string,
  userEmail: string,
  companyId: string
): Promise<{ success: boolean; version?: unknown; error?: string }> {
  try {
    const version = await prisma.masterPlanVersion.findUnique({
      where: { id: versionId },
    });

    if (!version) {
      return { success: false, error: 'Version not found' };
    }

    if (version.isLocked) {
      return { success: false, error: 'Version is already locked' };
    }

    const updated = await prisma.masterPlanVersion.update({
      where: { id: versionId },
      data: {
        status: 'locked',
        isLocked: true,
        lockedAt: new Date(),
        lockedById: userId,
        lockedByEmail: userEmail,
        lockReason,
      },
    });

    // Log audit
    await auditService.logAudit({
      userId,
      userEmail,
      action: 'commit',
      entityType: 'Plan',
      entityId: versionId,
      entityName: `Master Plan Version ${version.versionNumber}`,
      changes: { status: { old: version.status, new: 'locked' } },
      metadata: { lockReason },
      companyId,
    });

    // Trigger webhook alert
    await webhookAlertService.alertDataChange(companyId, {
      action: 'Master Plan Locked',
      entityType: 'MasterPlanVersion',
      count: 1,
      userId,
      userName: userEmail,
    });

    return { success: true, version: updated };
  } catch (error) {
    console.error('Error locking master plan version:', error);
    return { success: false, error: 'Failed to lock version' };
  }
}

/**
 * Publish master plan to downstream scheduling
 */
export async function publishMasterPlanVersion(
  versionId: string,
  userId: string,
  userEmail: string,
  companyId: string
): Promise<{ success: boolean; version?: unknown; integrationLog?: unknown; error?: string }> {
  try {
    const version = await prisma.masterPlanVersion.findUnique({
      where: { id: versionId },
    });

    if (!version) {
      return { success: false, error: 'Version not found' };
    }

    if (!version.isLocked) {
      return { success: false, error: 'Version must be locked before publishing' };
    }

    // Create integration log entry
    const startedAt = new Date();
    const integrationLog = await prisma.integrationLog.create({
      data: {
        integrationType: 'api_call',
        endpoint: '/api/scheduling/push',
        method: 'POST',
        requestPayload: JSON.stringify({
          versionId,
          versionNumber: version.versionNumber,
          commitmentCount: version.commitmentCount,
        }),
        responseStatus: 0,
        startedAt,
        status: 'pending',
        triggerAction: 'master_plan_publish',
        entityType: 'MasterPlanVersion',
        entityId: versionId,
        triggeredById: userId,
        triggeredByEmail: userEmail,
        companyId,
      },
    });

    // Simulate downstream push (in real system, this would call external API)
    // For now, we mark it as successful
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    await prisma.integrationLog.update({
      where: { id: integrationLog.id },
      data: {
        responseStatus: 200,
        responseBody: JSON.stringify({ success: true, message: 'Pushed to scheduling' }),
        completedAt,
        durationMs,
        status: 'success',
      },
    });

    // Update version
    const updated = await prisma.masterPlanVersion.update({
      where: { id: versionId },
      data: {
        status: 'published',
        publishedAt: new Date(),
        publishedById: userId,
        publishedByEmail: userEmail,
        pushedToScheduling: true,
        pushedToSchedulingAt: new Date(),
        pushResponse: JSON.stringify({ success: true }),
      },
    });

    // Log audit
    await auditService.logAudit({
      userId,
      userEmail,
      action: 'commit',
      entityType: 'Plan',
      entityId: versionId,
      entityName: `Master Plan Version ${version.versionNumber}`,
      changes: { status: { old: 'locked', new: 'published' } },
      metadata: { publishedTo: 'scheduling' },
      companyId,
    });

    return { success: true, version: updated, integrationLog };
  } catch (error) {
    console.error('Error publishing master plan version:', error);
    return { success: false, error: 'Failed to publish version' };
  }
}

/**
 * Get master plan versions
 */
export async function getMasterPlanVersions(masterPlanId: string) {
  return prisma.masterPlanVersion.findMany({
    where: { masterPlanId },
    orderBy: { createdAt: 'desc' },
  });
}

// =============================================================================
// INTEGRATION LOGGING
// =============================================================================

/**
 * Create integration log entry
 */
export async function createIntegrationLog(input: IntegrationLogInput) {
  return prisma.integrationLog.create({
    data: {
      integrationType: input.integrationType,
      endpoint: input.endpoint,
      method: input.method,
      requestPayload: JSON.stringify(input.requestPayload || {}),
      responseStatus: 0,
      startedAt: new Date(),
      status: 'pending',
      triggerAction: input.triggerAction,
      entityType: input.entityType,
      entityId: input.entityId,
      triggeredById: input.userId,
      triggeredByEmail: input.userEmail || '',
      companyId: input.companyId,
    },
  });
}

/**
 * Update integration log with response
 */
export async function updateIntegrationLog(
  logId: string,
  responseStatus: number,
  responseBody: object,
  status: 'success' | 'failed' | 'timeout',
  errorMessage?: string
) {
  const log = await prisma.integrationLog.findUnique({ where: { id: logId } });
  if (!log) return null;

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - log.startedAt.getTime();

  return prisma.integrationLog.update({
    where: { id: logId },
    data: {
      responseStatus,
      responseBody: JSON.stringify(responseBody),
      completedAt,
      durationMs,
      status,
      errorMessage: errorMessage || '',
    },
  });
}

/**
 * Get recent integration logs for health dashboard
 */
export async function getRecentIntegrationLogs(companyId: string, limit: number = 10) {
  return prisma.integrationLog.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Get integration health summary
 */
export async function getIntegrationHealthSummary(companyId: string) {
  const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [total, successful, failed, avgDuration] = await Promise.all([
    prisma.integrationLog.count({
      where: { companyId, createdAt: { gte: last24Hours } },
    }),
    prisma.integrationLog.count({
      where: { companyId, createdAt: { gte: last24Hours }, status: 'success' },
    }),
    prisma.integrationLog.count({
      where: { companyId, createdAt: { gte: last24Hours }, status: 'failed' },
    }),
    prisma.integrationLog.aggregate({
      where: { companyId, createdAt: { gte: last24Hours }, status: 'success' },
      _avg: { durationMs: true },
    }),
  ]);

  return {
    total,
    successful,
    failed,
    successRate: total > 0 ? (successful / total) * 100 : 100,
    avgDurationMs: avgDuration._avg.durationMs || 0,
  };
}

// =============================================================================
// BULK ALLOCATION OPERATIONS
// =============================================================================

/**
 * Bulk allocate cars to a shop with validation
 */
export async function bulkAllocateCars(
  input: BulkAllocationInput
): Promise<{ success: boolean; allocated?: number; error?: string; capacityExceeded?: boolean }> {
  try {
    // Get weekly capacity
    const capacity = await getOrCreateWeeklyCapacity(
      input.shopId,
      input.weekKey,
      input.companyId
    );

    if (!capacity) {
      return { success: false, error: 'Could not get capacity for shop/week' };
    }

    // Calculate available capacity for work type
    const capacityField = `${input.workType}Capacity` as keyof typeof capacity;
    const usedField = `${input.workType}Used` as keyof typeof capacity;
    const available =
      ((capacity[capacityField] as number) || 0) - ((capacity[usedField] as number) || 0);

    // Validate capacity
    if (input.carIds.length > available) {
      return {
        success: false,
        error: `Cannot allocate ${input.carIds.length} cars. Only ${available} slots available.`,
        capacityExceeded: true,
      };
    }

    // Create allocation override record
    await prisma.allocationOverride.create({
      data: {
        shopId: input.shopId,
        weekKey: input.weekKey,
        workType: input.workType,
        originalValue: (capacity[usedField] as number) || 0,
        overrideValue: ((capacity[usedField] as number) || 0) + input.carIds.length,
        justification: input.justification,
        overrideReason: input.overrideReason,
        relatedCarIds: JSON.stringify(input.carIds),
        carCount: input.carIds.length,
        status: 'applied',
        appliedAt: new Date(),
        overriddenById: input.userId,
        overriddenByEmail: input.userEmail,
        requiresApproval: input.carIds.length > 10,
        approvalStatus: input.carIds.length > 10 ? 'pending' : 'auto_approved',
        companyId: input.companyId,
      },
    });

    // Update capacity used
    await prisma.weeklyCapacity.update({
      where: { id: capacity.id },
      data: {
        [usedField]: ((capacity[usedField] as number) || 0) + input.carIds.length,
        totalUsed: (capacity.totalUsed || 0) + input.carIds.length,
      },
    });

    // Update car assignments
    await prisma.car.updateMany({
      where: { id: { in: input.carIds } },
      data: {
        assignedShopId: input.shopId,
        status: 'scheduled',
        reasonShopped: input.workType,
      },
    });

    // Log audit
    await auditService.logAudit({
      userId: input.userId,
      userEmail: input.userEmail,
      action: 'assign',
      entityType: 'Car',
      entityId: input.shopId,
      entityName: `Bulk allocation to shop`,
      changes: {
        carCount: { new: input.carIds.length },
        workType: { new: input.workType },
      },
      metadata: {
        bulkOperation: true,
        count: input.carIds.length,
        weekKey: input.weekKey,
        justification: input.justification,
      },
      companyId: input.companyId,
    });

    return { success: true, allocated: input.carIds.length };
  } catch (error) {
    console.error('Error in bulk allocation:', error);
    return { success: false, error: 'Failed to allocate cars' };
  }
}

/**
 * Validate allocation against capacity (hard-stop validation)
 */
export async function validateAllocation(
  shopId: string,
  weekKey: string,
  workType: string,
  requestedCount: number,
  companyId: string
): Promise<{ valid: boolean; available: number; message?: string }> {
  const capacity = await getOrCreateWeeklyCapacity(shopId, weekKey, companyId);

  if (!capacity) {
    return { valid: false, available: 0, message: 'Capacity record not found' };
  }

  const capacityField = `${workType}Capacity` as keyof typeof capacity;
  const usedField = `${workType}Used` as keyof typeof capacity;
  const total = (capacity[capacityField] as number) || 0;
  const used = (capacity[usedField] as number) || 0;
  const available = total - used;

  if (requestedCount > available) {
    return {
      valid: false,
      available,
      message: `Exceeds capacity: requested ${requestedCount}, available ${available}`,
    };
  }

  return { valid: true, available };
}

// =============================================================================
// MASTER PLAN AUDIT LOG
// =============================================================================

export interface MasterPlanAuditFilters {
  action?: string;
  userId?: string;
  entityType?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  pageSize?: number;
}

/**
 * Get Master Plan audit logs (non-editable system log)
 * Tracks: Master Plan Lock/Unlock, User Allocation Overrides, Capacity Adjustments, Import/Export
 */
export async function getMasterPlanAuditLogs(companyId: string, filters: MasterPlanAuditFilters = {}) {
  const { action, userId, entityType, startDate, endDate, page = 1, pageSize = 50 } = filters;

  // Build where clause for Master Plan related audit entries
  const where: Record<string, unknown> = {
    companyId,
    OR: [
      // Plan lock/unlock events
      { entityType: 'Plan', action: 'commit' },
      // Capacity adjustments via CapacityAudit
      { entityType: 'Plan', metadata: { contains: 'capacityAdjustment' } },
      // Car allocations/overrides
      { entityType: 'Car', action: 'assign' },
      // Import/Export activities
      { action: 'export' },
      { entityType: 'Plan', metadata: { contains: 'import' } },
    ],
  };

  if (action) where.action = action;
  if (userId) where.userId = userId;
  if (entityType) where.entityType = entityType;

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

  // Also get capacity audit entries
  const capacityAudits = await prisma.capacityAudit.findMany({
    where: {
      weeklyCapacity: { shop: { companyId } },
      ...(startDate && { createdAt: { gte: startDate } }),
      ...(endDate && { createdAt: { lte: endDate } }),
    },
    include: {
      weeklyCapacity: {
        include: {
          shop: { select: { name: true, code: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: pageSize,
  });

  // Also get allocation overrides
  const allocationOverrides = await prisma.allocationOverride.findMany({
    where: {
      companyId,
      ...(startDate && { createdAt: { gte: startDate } }),
      ...(endDate && { createdAt: { lte: endDate } }),
    },
    include: {
      shop: { select: { name: true, code: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: pageSize,
  });

  // Transform and merge all audit entries
  const auditEntries = [
    // Regular audit logs
    ...logs.map((log) => ({
      id: log.id,
      action: mapAuditAction(log.action, log.entityType),
      category: getCategoryFromAction(log.action, log.entityType),
      userId: log.userId,
      userEmail: log.userEmail,
      timestamp: log.createdAt.toISOString(),
      entityType: log.entityType,
      entityId: log.entityId,
      entityName: log.entityName,
      details: {
        changes: JSON.parse(log.changes),
        metadata: JSON.parse(log.metadata),
      },
      source: 'audit_log' as const,
    })),
    // Capacity audit entries
    ...capacityAudits.map((audit) => ({
      id: audit.id,
      action: 'capacity_adjusted' as const,
      category: 'capacity' as const,
      userId: audit.changedById,
      userEmail: audit.changedByEmail,
      timestamp: audit.createdAt.toISOString(),
      entityType: 'WeeklyCapacity',
      entityId: audit.weeklyCapacityId,
      entityName: `${audit.weeklyCapacity?.shop?.name || 'Unknown Shop'} - ${audit.weeklyCapacity?.weekKey || 'Unknown Week'}`,
      details: {
        field: audit.fieldName,
        previousValue: audit.previousValue,
        newValue: audit.newValue,
        justification: audit.justification,
        changeCategory: audit.changeCategory,
        approvalStatus: audit.approvalStatus,
      },
      source: 'capacity_audit' as const,
    })),
    // Allocation overrides
    ...allocationOverrides.map((override) => ({
      id: override.id,
      action: 'allocation_override' as const,
      category: 'allocation' as const,
      userId: override.overriddenById,
      userEmail: override.overriddenByEmail,
      timestamp: override.createdAt.toISOString(),
      entityType: 'AllocationOverride',
      entityId: override.id,
      entityName: `${override.shop?.name || 'Unknown Shop'} - ${override.weekKey}`,
      details: {
        workType: override.workType,
        carCount: override.carCount,
        originalValue: override.originalValue,
        overrideValue: override.overrideValue,
        justification: override.justification,
        overrideReason: override.overrideReason,
        status: override.status,
        approvalStatus: override.approvalStatus,
      },
      source: 'allocation_override' as const,
    })),
  ];

  // Sort by timestamp descending and paginate
  auditEntries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const paginatedEntries = auditEntries.slice(0, pageSize);

  return {
    data: paginatedEntries,
    total: total + capacityAudits.length + allocationOverrides.length,
    page,
    pageSize,
    totalPages: Math.ceil((total + capacityAudits.length + allocationOverrides.length) / pageSize),
  };
}

/**
 * Map audit action to Master Plan specific action
 */
function mapAuditAction(action: string, entityType: string): string {
  if (entityType === 'Plan' && action === 'commit') return 'plan_locked';
  if (entityType === 'Car' && action === 'assign') return 'allocation_override';
  if (action === 'export') return 'export_generated';
  return action;
}

/**
 * Get category from audit action for filtering
 */
function getCategoryFromAction(action: string, entityType: string): string {
  if (entityType === 'Plan' && action === 'commit') return 'plan';
  if (entityType === 'Car' && action === 'assign') return 'allocation';
  if (action === 'export') return 'export';
  return 'other';
}

/**
 * Get audit statistics for the dashboard
 */
export async function getAuditStatistics(companyId: string) {
  const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalLocks,
    totalOverrides,
    totalCapacityChanges,
    totalImports,
    totalExports,
  ] = await Promise.all([
    prisma.auditLog.count({
      where: { companyId, entityType: 'Plan', action: 'commit', createdAt: { gte: last30Days } },
    }),
    prisma.allocationOverride.count({
      where: { companyId, createdAt: { gte: last30Days } },
    }),
    prisma.capacityAudit.count({
      where: { weeklyCapacity: { shop: { companyId } }, createdAt: { gte: last30Days } },
    }),
    prisma.importSession.count({
      where: { status: 'completed', createdAt: { gte: last30Days } },
    }),
    prisma.auditLog.count({
      where: { companyId, action: 'export', createdAt: { gte: last30Days } },
    }),
  ]);

  return {
    last30Days: {
      planLocks: totalLocks,
      allocationOverrides: totalOverrides,
      capacityChanges: totalCapacityChanges,
      imports: totalImports,
      exports: totalExports,
    },
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  // Weekly capacity
  generateWeekKeys,
  getOrCreateWeeklyCapacity,
  getWeeklyCapacities,
  updateWeeklyCapacity,
  lockWeeklyCapacity,

  // Master plan versioning
  createMasterPlanVersion,
  lockMasterPlanVersion,
  publishMasterPlanVersion,
  getMasterPlanVersions,

  // Integration logging
  createIntegrationLog,
  updateIntegrationLog,
  getRecentIntegrationLogs,
  getIntegrationHealthSummary,

  // Bulk operations
  bulkAllocateCars,
  validateAllocation,

  // Audit log
  getMasterPlanAuditLogs,
  getAuditStatistics,
};
