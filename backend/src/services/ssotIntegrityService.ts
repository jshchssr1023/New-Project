/**
 * SSOT Integrity Service
 *
 * Enforces data integrity rules for UnifiedAssignment as the Single Source of Truth:
 * - One active assignment per railcar
 * - Status FSM transitions
 * - Optimistic locking
 * - Capacity synchronization
 * - Audit logging
 */

import { Prisma } from '../types/prismaTypes';
import { prisma } from './db';
import logger from '../utils/logger';

// =============================================================================
// STATUS FSM DEFINITIONS
// =============================================================================

/**
 * Valid UnifiedAssignment status values
 */
export const UA_STATUS = {
  DRAFT: 'DRAFT',
  PENDING_REVIEW: 'PENDING_REVIEW',
  COMMITTED: 'COMMITTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  SUPERSEDED: 'SUPERSEDED',
} as const;

export type UAStatus = typeof UA_STATUS[keyof typeof UA_STATUS];

/**
 * Valid status transitions (FSM)
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  [UA_STATUS.DRAFT]: [UA_STATUS.PENDING_REVIEW, UA_STATUS.COMMITTED, UA_STATUS.IN_PROGRESS, UA_STATUS.CANCELLED],
  [UA_STATUS.PENDING_REVIEW]: [UA_STATUS.DRAFT, UA_STATUS.COMMITTED, UA_STATUS.IN_PROGRESS, UA_STATUS.CANCELLED],
  [UA_STATUS.COMMITTED]: [UA_STATUS.PENDING_REVIEW, UA_STATUS.IN_PROGRESS, UA_STATUS.CANCELLED],
  [UA_STATUS.IN_PROGRESS]: [UA_STATUS.COMPLETED, UA_STATUS.CANCELLED],
  [UA_STATUS.COMPLETED]: [], // Terminal state
  [UA_STATUS.CANCELLED]: [], // Terminal state
  [UA_STATUS.SUPERSEDED]: [], // Terminal state
};

/**
 * Terminal statuses (no longer active)
 */
export const TERMINAL_STATUSES = [UA_STATUS.COMPLETED, UA_STATUS.CANCELLED, UA_STATUS.SUPERSEDED];

/**
 * Active statuses (consume capacity)
 */
export const ACTIVE_STATUSES = [UA_STATUS.DRAFT, UA_STATUS.PENDING_REVIEW, UA_STATUS.COMMITTED, UA_STATUS.IN_PROGRESS];

/**
 * Confirmed statuses (deduct capacity)
 */
export const CONFIRMED_STATUSES = [UA_STATUS.COMMITTED, UA_STATUS.IN_PROGRESS];

/**
 * Planned statuses (visibility only)
 */
export const PLANNED_STATUSES = [UA_STATUS.DRAFT, UA_STATUS.PENDING_REVIEW];

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

/**
 * Check if a status transition is valid
 */
export function isValidTransition(fromStatus: string, toStatus: string): boolean {
  const allowedTransitions = VALID_TRANSITIONS[fromStatus];
  return allowedTransitions?.includes(toStatus) ?? false;
}

/**
 * Get allowed transitions from a status
 */
export function getAllowedTransitions(fromStatus: string): string[] {
  return VALID_TRANSITIONS[fromStatus] || [];
}

/**
 * Check if status is terminal
 */
export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.includes(status as UAStatus);
}

/**
 * Check if status is active (not terminal)
 */
export function isActiveStatus(status: string): boolean {
  return ACTIVE_STATUSES.includes(status as UAStatus);
}

// =============================================================================
// ONE-ACTIVE-PER-CAR ENFORCEMENT
// =============================================================================

/**
 * Check if car already has an active assignment
 */
export async function hasActiveAssignment(carId: string, excludeId?: string): Promise<boolean> {
  const where: Prisma.UnifiedAssignmentWhereInput = {
    carId,
    status: { notIn: TERMINAL_STATUSES },
  };

  if (excludeId) {
    where.id = { not: excludeId };
  }

  const count = await prisma.unifiedAssignment.count({ where });
  return count > 0;
}

/**
 * Get the active assignment for a car (if any)
 */
export async function getActiveAssignment(carId: string) {
  return prisma.unifiedAssignment.findFirst({
    where: {
      carId,
      status: { notIn: TERMINAL_STATUSES },
    },
    include: {
      shop: true,
      car: true,
      customer: true,
    },
  });
}

/**
 * Validate that creating/updating an assignment won't violate one-active rule
 */
export async function validateOneActiveRule(
  carId: string,
  targetStatus: string,
  excludeId?: string
): Promise<{ valid: boolean; error?: string; existingId?: string }> {
  // Terminal statuses are always allowed
  if (isTerminalStatus(targetStatus)) {
    return { valid: true };
  }

  // Check for existing active assignment
  const existing = await prisma.unifiedAssignment.findFirst({
    where: {
      carId,
      status: { notIn: TERMINAL_STATUSES },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, status: true },
  });

  if (existing) {
    return {
      valid: false,
      error: `Car already has active assignment (ID: ${existing.id}, Status: ${existing.status}). Cancel or complete existing assignment first.`,
      existingId: existing.id,
    };
  }

  return { valid: true };
}

// =============================================================================
// SSOT CRUD OPERATIONS WITH INTEGRITY ENFORCEMENT
// =============================================================================

interface CreateAssignmentInput {
  carId: string;
  shopId?: string;
  customerId?: string;
  plannedYear: number;
  plannedMonth: number;
  workType?: string;
  status?: string;
  priority?: number;
  shopReason?: string;
  estimatedCost?: number;
  estimatedDays?: number;
  source?: string;
  companyId: string;
  committedById?: string;
}

/**
 * Create a new assignment with full integrity checks
 */
export async function createAssignment(data: CreateAssignmentInput) {
  const targetStatus = data.status || UA_STATUS.DRAFT;

  // Validate one-active rule
  const validation = await validateOneActiveRule(data.carId, targetStatus);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Create with audit
  const assignment = await prisma.unifiedAssignment.create({
    data: {
      carId: data.carId,
      shopId: data.shopId,
      customerId: data.customerId,
      plannedYear: data.plannedYear,
      plannedMonth: data.plannedMonth,
      scheduledMonth: `${data.plannedYear}-${String(data.plannedMonth).padStart(2, '0')}`,
      workType: data.workType || 'full_qualification',
      status: targetStatus,
      priority: data.priority || 3,
      shopReason: data.shopReason || '',
      estimatedCost: data.estimatedCost,
      estimatedDays: data.estimatedDays || 14,
      sourceType: data.source || 'manual',
      companyId: data.companyId,
      committedById: data.committedById,
      committedAt: targetStatus === UA_STATUS.COMMITTED ? new Date() : undefined,
    },
    include: {
      shop: true,
      car: true,
    },
  });

  logger.info('[SSOT] Created assignment', {
    assignmentId: assignment.id,
    carId: data.carId,
    status: targetStatus,
  });

  // Update capacity if shop assigned
  if (data.shopId) {
    await updateCapacityForAssignment(
      data.shopId,
      data.plannedYear,
      data.plannedMonth,
      targetStatus,
      'add'
    );
  }

  // Log audit event
  await logAuditEvent({
    scheduleId: assignment.id,
    carId: data.carId,
    action: 'INSERT',
    newStatus: targetStatus,
    newShopId: data.shopId,
    changedById: data.committedById,
  });

  return assignment;
}

interface UpdateAssignmentInput {
  id: string;
  shopId?: string;
  plannedYear?: number;
  plannedMonth?: number;
  status?: string;
  priority?: number;
  shopReason?: string;
  estimatedCost?: number;
  notes?: string;
  version?: number; // For optimistic locking
  updatedById?: string;
}

/**
 * Update an assignment with FSM and integrity checks
 */
export async function updateAssignment(data: UpdateAssignmentInput) {
  // Get current state with lock
  const current = await prisma.unifiedAssignment.findUnique({
    where: { id: data.id },
  });

  if (!current) {
    throw new Error(`Assignment not found: ${data.id}`);
  }

  // Optimistic locking check
  if (data.version !== undefined && data.version !== current.version) {
    throw new Error(`Concurrent modification detected. Expected version ${data.version}, found ${current.version}`);
  }

  // Status transition validation
  if (data.status && data.status !== current.status) {
    if (!isValidTransition(current.status, data.status)) {
      const allowed = getAllowedTransitions(current.status);
      throw new Error(
        `Invalid status transition: ${current.status} → ${data.status}. ` +
        `Allowed transitions: ${allowed.join(', ') || 'none (terminal state)'}`
      );
    }

    // One-active rule for non-terminal transitions
    const validation = await validateOneActiveRule(current.carId, data.status, data.id);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
  }

  // Prepare update data
  const updateData: Prisma.UnifiedAssignmentUpdateInput = {
    version: { increment: 1 },
  };

  if (data.shopId !== undefined) updateData.shopId = data.shopId;
  if (data.plannedYear !== undefined) updateData.plannedYear = data.plannedYear;
  if (data.plannedMonth !== undefined) updateData.plannedMonth = data.plannedMonth;
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.shopReason !== undefined) updateData.shopReason = data.shopReason;
  if (data.estimatedCost !== undefined) updateData.estimatedCost = data.estimatedCost;
  if (data.notes !== undefined) updateData.ruleNotes = data.notes;

  // Status-specific timestamps
  if (data.status && data.status !== current.status) {
    updateData.status = data.status;

    if (data.status === UA_STATUS.COMMITTED) {
      updateData.committedAt = new Date();
      updateData.committedById = data.updatedById;
    } else if (data.status === UA_STATUS.IN_PROGRESS) {
      updateData.actualStartDate = new Date();
    } else if (data.status === UA_STATUS.COMPLETED) {
      updateData.actualCompletionDate = new Date();
    } else if (data.status === UA_STATUS.CANCELLED) {
      updateData.cancelledAt = new Date();
      updateData.cancelledById = data.updatedById;
    }
  }

  if (data.plannedYear !== undefined && data.plannedMonth !== undefined) {
    updateData.scheduledMonth = `${data.plannedYear}-${String(data.plannedMonth).padStart(2, '0')}`;
  }

  // Execute update
  const updated = await prisma.unifiedAssignment.update({
    where: { id: data.id },
    data: updateData,
    include: { shop: true, car: true },
  });

  logger.info('[SSOT] Updated assignment', {
    assignmentId: data.id,
    oldStatus: current.status,
    newStatus: data.status || current.status,
    changes: Object.keys(updateData),
  });

  // Update capacity if status or shop/period changed
  const statusChanged = data.status && data.status !== current.status;
  const locationChanged =
    (data.shopId !== undefined && data.shopId !== current.shopId) ||
    (data.plannedYear !== undefined && data.plannedYear !== current.plannedYear) ||
    (data.plannedMonth !== undefined && data.plannedMonth !== current.plannedMonth);

  if (statusChanged || locationChanged) {
    // Remove from old location/status
    if (current.shopId) {
      await updateCapacityForAssignment(
        current.shopId,
        current.plannedYear,
        current.plannedMonth,
        current.status,
        'remove'
      );
    }

    // Add to new location/status (if not terminal)
    const newShopId = data.shopId ?? current.shopId;
    const newStatus = data.status ?? current.status;
    if (newShopId && !isTerminalStatus(newStatus)) {
      await updateCapacityForAssignment(
        newShopId,
        data.plannedYear ?? current.plannedYear,
        data.plannedMonth ?? current.plannedMonth,
        newStatus,
        'add'
      );
    }
  }

  // Log audit event
  await logAuditEvent({
    scheduleId: data.id,
    carId: current.carId,
    action: 'UPDATE',
    oldStatus: current.status,
    newStatus: data.status || current.status,
    oldShopId: current.shopId,
    newShopId: data.shopId ?? current.shopId,
    changedById: data.updatedById,
    changedFields: JSON.stringify(updateData),
  });

  return updated;
}

/**
 * Transition assignment to a new status (convenience method)
 */
export async function transitionStatus(
  id: string,
  newStatus: string,
  userId?: string,
  notes?: string
) {
  return updateAssignment({
    id,
    status: newStatus,
    notes,
    updatedById: userId,
  });
}

// =============================================================================
// CAPACITY SYNCHRONIZATION
// =============================================================================

/**
 * Update capacity counters when assignment changes
 */
async function updateCapacityForAssignment(
  shopId: string,
  year: number,
  month: number,
  status: string,
  operation: 'add' | 'remove'
) {
  const delta = operation === 'add' ? 1 : -1;

  const isConfirmed = CONFIRMED_STATUSES.includes(status as UAStatus);
  const isPlanned = PLANNED_STATUSES.includes(status as UAStatus);

  if (!isConfirmed && !isPlanned) {
    return; // Terminal status - no capacity impact
  }

  // Update SOPCommitment.currentUsage
  if (isConfirmed) {
    await prisma.sOPCommitment.updateMany({
      where: { shopId, year, month },
      data: {
        currentUsage: { increment: delta },
      },
    });
  }

  logger.debug('[SSOT Capacity] Updated capacity', {
    shopId,
    year,
    month,
    status,
    operation,
    delta,
  });
}

/**
 * Full capacity recalculation from SSOT
 */
export async function recalculateCapacityFromSSOT(companyId: string) {
  logger.info('[SSOT Capacity] Starting full recalculation', { companyId });

  // Get all active assignments grouped by shop-period
  const assignments = await prisma.unifiedAssignment.groupBy({
    by: ['shopId', 'plannedYear', 'plannedMonth', 'status'],
    where: {
      companyId,
      status: { notIn: TERMINAL_STATUSES },
      shopId: { not: null },
    },
    _count: { id: true },
  });

  // Build aggregated counts
  const capacityMap = new Map<string, { confirmed: number; planned: number }>();

  for (const agg of assignments) {
    if (!agg.shopId) continue;

    const key = `${agg.shopId}:${agg.plannedYear}:${agg.plannedMonth}`;
    const existing = capacityMap.get(key) || { confirmed: 0, planned: 0 };

    if (CONFIRMED_STATUSES.includes(agg.status as UAStatus)) {
      existing.confirmed += agg._count.id;
    } else if (PLANNED_STATUSES.includes(agg.status as UAStatus)) {
      existing.planned += agg._count.id;
    }

    capacityMap.set(key, existing);
  }

  // Update SOPCommitment records
  let updated = 0;
  for (const [key, counts] of capacityMap) {
    const [shopId, yearStr, monthStr] = key.split(':');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);

    const result = await prisma.sOPCommitment.updateMany({
      where: { shopId, year, month },
      data: { currentUsage: counts.confirmed },
    });

    if (result.count > 0) updated++;
  }

  logger.info('[SSOT Capacity] Recalculation complete', {
    companyId,
    periodsUpdated: updated,
    totalPeriods: capacityMap.size,
  });

  return { updated, total: capacityMap.size };
}

/**
 * Get shop capacity from SSOT
 */
export async function getShopCapacityFromSSOT(
  shopId: string,
  year: number,
  month: number
): Promise<{
  confirmed: number;
  planned: number;
  total: number;
  limit: number;
  available: number;
  utilizationPercent: number;
}> {
  const [counts, sopCommitment, shop] = await Promise.all([
    prisma.unifiedAssignment.groupBy({
      by: ['status'],
      where: {
        shopId,
        plannedYear: year,
        plannedMonth: month,
        status: { notIn: TERMINAL_STATUSES },
      },
      _count: { id: true },
    }),
    prisma.sOPCommitment.findFirst({
      where: { shopId, year, month },
    }),
    prisma.shop.findUnique({
      where: { id: shopId },
      select: { capacity: true },
    }),
  ]);

  let confirmed = 0;
  let planned = 0;

  for (const count of counts) {
    if (CONFIRMED_STATUSES.includes(count.status as UAStatus)) {
      confirmed += count._count.id;
    } else if (PLANNED_STATUSES.includes(count.status as UAStatus)) {
      planned += count._count.id;
    }
  }

  const limit = sopCommitment?.committedVolume || shop?.capacity || 30;
  const available = Math.max(0, limit - confirmed);
  const utilizationPercent = limit > 0 ? Math.round((confirmed / limit) * 100) : 0;

  return {
    confirmed,
    planned,
    total: confirmed + planned,
    limit,
    available,
    utilizationPercent,
  };
}

// =============================================================================
// AUDIT LOGGING
// =============================================================================

interface AuditEvent {
  scheduleId: string;
  carId: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  oldStatus?: string;
  newStatus?: string;
  oldShopId?: string | null;
  newShopId?: string | null;
  changedFields?: string;
  changedById?: string;
}

async function logAuditEvent(event: AuditEvent) {
  try {
    // Use raw query for SQLite compatibility
    await prisma.$executeRaw`
      INSERT INTO schedule_audit_log (
        id, schedule_id, car_id, action,
        old_status, new_status, old_shop_id, new_shop_id,
        changed_fields, changed_by_id, changed_at
      ) VALUES (
        ${crypto.randomUUID()},
        ${event.scheduleId},
        ${event.carId},
        ${event.action},
        ${event.oldStatus || null},
        ${event.newStatus || null},
        ${event.oldShopId || null},
        ${event.newShopId || null},
        ${event.changedFields || null},
        ${event.changedById || null},
        ${new Date().toISOString()}
      )
    `;
  } catch (error) {
    // Don't fail the main operation for audit logging errors
    logger.error('[SSOT Audit] Failed to log event', {
      event,
      error: error instanceof Error ? error.message : 'Unknown',
    });
  }
}

// =============================================================================
// BULK OPERATIONS
// =============================================================================

/**
 * Cancel all active assignments for a car (for reassignment)
 */
export async function cancelActiveAssignments(
  carId: string,
  reason: string,
  userId?: string
): Promise<number> {
  const active = await prisma.unifiedAssignment.findMany({
    where: {
      carId,
      status: { notIn: TERMINAL_STATUSES },
    },
  });

  for (const assignment of active) {
    await updateAssignment({
      id: assignment.id,
      status: UA_STATUS.CANCELLED,
      notes: reason,
      updatedById: userId,
    });
  }

  logger.info('[SSOT] Cancelled active assignments for car', {
    carId,
    count: active.length,
    reason,
  });

  return active.length;
}

/**
 * Supersede all pending assignments for a car (when new one takes priority)
 */
export async function supersedePendingAssignments(
  carId: string,
  keepId: string,
  userId?: string
): Promise<number> {
  const pending = await prisma.unifiedAssignment.findMany({
    where: {
      carId,
      id: { not: keepId },
      status: { in: [UA_STATUS.DRAFT, UA_STATUS.PENDING_REVIEW] },
    },
  });

  for (const assignment of pending) {
    await prisma.unifiedAssignment.update({
      where: { id: assignment.id },
      data: {
        status: UA_STATUS.SUPERSEDED,
        ruleNotes: `Superseded by assignment ${keepId}`,
        version: { increment: 1 },
      },
    });

    await logAuditEvent({
      scheduleId: assignment.id,
      carId,
      action: 'UPDATE',
      oldStatus: assignment.status,
      newStatus: UA_STATUS.SUPERSEDED,
      changedById: userId,
    });
  }

  return pending.length;
}

// =============================================================================
// DASHBOARD QUERIES (FROM SSOT)
// =============================================================================

/**
 * Get dashboard metrics exclusively from UnifiedAssignment SSOT
 */
export async function getDashboardMetricsFromSSOT(companyId: string) {
  const [statusCounts, workTypeCounts, byMonthRaw] = await Promise.all([
    prisma.unifiedAssignment.groupBy({
      by: ['status'],
      where: { companyId },
      _count: { id: true },
    }),
    prisma.unifiedAssignment.groupBy({
      by: ['workType'],
      where: {
        companyId,
        status: { notIn: TERMINAL_STATUSES },
      },
      _count: { id: true },
    }),
    prisma.unifiedAssignment.groupBy({
      by: ['plannedYear', 'plannedMonth', 'status'],
      where: {
        companyId,
        status: { notIn: [UA_STATUS.COMPLETED, UA_STATUS.CANCELLED, UA_STATUS.SUPERSEDED] },
      },
      _count: { id: true },
    }),
  ]);

  // Transform to dashboard format
  const byStatus: Record<string, number> = {};
  for (const sc of statusCounts) {
    byStatus[sc.status] = sc._count.id;
  }

  const byWorkType: Record<string, number> = {};
  for (const wc of workTypeCounts) {
    byWorkType[wc.workType] = wc._count.id;
  }

  // Group by month
  const byMonth: Record<string, { confirmed: number; planned: number }> = {};
  for (const row of byMonthRaw) {
    const key = `${row.plannedYear}-${String(row.plannedMonth).padStart(2, '0')}`;
    if (!byMonth[key]) byMonth[key] = { confirmed: 0, planned: 0 };

    if (CONFIRMED_STATUSES.includes(row.status as UAStatus)) {
      byMonth[key].confirmed += row._count.id;
    } else {
      byMonth[key].planned += row._count.id;
    }
  }

  return {
    summary: {
      draft: byStatus[UA_STATUS.DRAFT] || 0,
      pendingReview: byStatus[UA_STATUS.PENDING_REVIEW] || 0,
      committed: byStatus[UA_STATUS.COMMITTED] || 0,
      inProgress: byStatus[UA_STATUS.IN_PROGRESS] || 0,
      completed: byStatus[UA_STATUS.COMPLETED] || 0,
      cancelled: byStatus[UA_STATUS.CANCELLED] || 0,
      totalActive:
        (byStatus[UA_STATUS.DRAFT] || 0) +
        (byStatus[UA_STATUS.PENDING_REVIEW] || 0) +
        (byStatus[UA_STATUS.COMMITTED] || 0) +
        (byStatus[UA_STATUS.IN_PROGRESS] || 0),
    },
    byWorkType,
    byMonth,
    source: 'unified_assignment_ssot',
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  // Status constants
  UA_STATUS,
  TERMINAL_STATUSES,
  ACTIVE_STATUSES,
  CONFIRMED_STATUSES,
  PLANNED_STATUSES,
  // Validation
  isValidTransition,
  getAllowedTransitions,
  isTerminalStatus,
  isActiveStatus,
  // One-active enforcement
  hasActiveAssignment,
  getActiveAssignment,
  validateOneActiveRule,
  // CRUD operations
  createAssignment,
  updateAssignment,
  transitionStatus,
  // Capacity
  recalculateCapacityFromSSOT,
  getShopCapacityFromSSOT,
  // Bulk operations
  cancelActiveAssignments,
  supersedePendingAssignments,
  // Dashboard
  getDashboardMetricsFromSSOT,
};
