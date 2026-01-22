/**
 * SSOT Batch Jobs Service
 *
 * Nightly and scheduled jobs for maintaining SSOT integrity:
 * - Capacity recalculation
 * - Hierarchy rollup
 * - Stale record cleanup
 * - Alert generation
 * - Shopping status sync
 */

import { prisma } from './db';
import logger from '../utils/logger';
import {
  recalculateCapacityFromSSOT,
  UA_STATUS,
  TERMINAL_STATUSES,
  CONFIRMED_STATUSES,
} from './ssotIntegrityService';

// =============================================================================
// CAPACITY RECALCULATION
// =============================================================================

/**
 * Full capacity recalculation for all shops
 * Run nightly at 2:00 AM
 */
export async function nightlyCapacityRecalculation(companyId?: string) {
  const startTime = Date.now();
  logger.info('[Batch] Starting nightly capacity recalculation', { companyId });

  try {
    const companies = companyId
      ? [{ id: companyId }]
      : await prisma.company.findMany({ select: { id: true } });

    const results = [];

    for (const company of companies) {
      const result = await recalculateCapacityFromSSOT(company.id);
      results.push({ companyId: company.id, ...result });
    }

    const duration = Date.now() - startTime;
    logger.info('[Batch] Nightly capacity recalculation complete', {
      duration: `${duration}ms`,
      companies: results.length,
      totalUpdated: results.reduce((sum, r) => sum + r.updated, 0),
    });

    return results;
  } catch (error) {
    logger.error('[Batch] Capacity recalculation failed', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    throw error;
  }
}

// =============================================================================
// HIERARCHY ROLLUP
// =============================================================================

/**
 * Recalculate network capacity rollup from child shops to parents
 * Run nightly at 2:30 AM
 */
export async function nightlyHierarchyRollup(companyId?: string) {
  const startTime = Date.now();
  logger.info('[Batch] Starting hierarchy rollup', { companyId });

  try {
    // Get all hierarchies
    const hierarchies = await prisma.shopHierarchy.findMany({
      where: {
        isActive: true,
        includeInCapacityRollup: true,
        ...(companyId ? { companyId } : {}),
      },
      include: {
        parentShop: { select: { id: true, name: true } },
        childShop: { select: { id: true, name: true } },
      },
    });

    // Build parent -> children map
    const parentMap = new Map<string, Array<{ childId: string; sharePercent: number }>>();

    for (const h of hierarchies) {
      const existing = parentMap.get(h.parentShopId) || [];
      existing.push({
        childId: h.childShopId,
        sharePercent: h.capacitySharePercent,
      });
      parentMap.set(h.parentShopId, existing);
    }

    // Get all active periods
    const periods = await prisma.unifiedAssignment.findMany({
      where: {
        status: { notIn: TERMINAL_STATUSES },
      },
      distinct: ['plannedYear', 'plannedMonth'],
      select: { plannedYear: true, plannedMonth: true },
    });

    let updated = 0;

    // For each parent, calculate rolled-up capacity from children
    for (const [parentId, children] of parentMap) {
      for (const period of periods) {
        let childConfirmed = 0;
        let childPlanned = 0;
        let childCapacity = 0;

        for (const child of children) {
          // Get child's capacity from SSOT
          const childCounts = await prisma.unifiedAssignment.groupBy({
            by: ['status'],
            where: {
              shopId: child.childId,
              plannedYear: period.plannedYear,
              plannedMonth: period.plannedMonth,
              status: { notIn: TERMINAL_STATUSES },
            },
            _count: { id: true },
          });

          for (const count of childCounts) {
            const contribution = (count._count.id * child.sharePercent) / 100;
            if (CONFIRMED_STATUSES.includes(count.status as any)) {
              childConfirmed += contribution;
            } else {
              childPlanned += contribution;
            }
          }

          // Get child's capacity limit
          const childSOP = await prisma.sOPCommitment.findFirst({
            where: {
              shopId: child.childId,
              year: period.plannedYear,
              month: period.plannedMonth,
            },
          });

          if (childSOP) {
            childCapacity += (childSOP.committedVolume * child.sharePercent) / 100;
          }
        }

        // Store in parent's capacity record (via custom field or separate table)
        // For now, log the calculation
        logger.debug('[Batch] Hierarchy rollup calculated', {
          parentId,
          year: period.plannedYear,
          month: period.plannedMonth,
          childConfirmed: Math.round(childConfirmed),
          childPlanned: Math.round(childPlanned),
          childCapacity: Math.round(childCapacity),
        });

        updated++;
      }
    }

    const duration = Date.now() - startTime;
    logger.info('[Batch] Hierarchy rollup complete', {
      duration: `${duration}ms`,
      parents: parentMap.size,
      periodsProcessed: updated,
    });

    return { parents: parentMap.size, periodsUpdated: updated };
  } catch (error) {
    logger.error('[Batch] Hierarchy rollup failed', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    throw error;
  }
}

// =============================================================================
// STALE RECORD CLEANUP
// =============================================================================

/**
 * Auto-cancel stale Draft/Planned assignments for past periods
 * Run weekly on Sunday at 4:00 AM
 */
export async function weeklyStaleRecordCleanup(
  companyId?: string,
  dryRun: boolean = false
) {
  const startTime = Date.now();
  logger.info('[Batch] Starting stale record cleanup', { companyId, dryRun });

  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // Find stale records: Draft/Planned for periods more than 2 months ago
    const staleRecords = await prisma.unifiedAssignment.findMany({
      where: {
        status: { in: [UA_STATUS.DRAFT, UA_STATUS.PENDING_REVIEW] },
        ...(companyId ? { companyId } : {}),
        OR: [
          { plannedYear: { lt: currentYear } },
          {
            plannedYear: currentYear,
            plannedMonth: { lt: currentMonth - 1 },
          },
        ],
      },
      include: {
        car: { select: { railcarNumber: true } },
      },
    });

    logger.info('[Batch] Found stale records', { count: staleRecords.length });

    if (dryRun) {
      return {
        dryRun: true,
        wouldCancel: staleRecords.length,
        records: staleRecords.map((r) => ({
          id: r.id,
          railcarNumber: r.car.railcarNumber,
          period: `${r.plannedYear}-${String(r.plannedMonth).padStart(2, '0')}`,
          status: r.status,
        })),
      };
    }

    let cancelled = 0;
    const errors: string[] = [];

    for (const record of staleRecords) {
      try {
        await prisma.unifiedAssignment.update({
          where: { id: record.id },
          data: {
            status: UA_STATUS.CANCELLED,
            cancelledAt: new Date(),
            cancellationReason: 'Auto-cancelled: Past period without progress',
            version: { increment: 1 },
          },
        });
        cancelled++;
      } catch (error) {
        errors.push(`${record.id}: ${error instanceof Error ? error.message : 'Unknown'}`);
      }
    }

    const duration = Date.now() - startTime;
    logger.info('[Batch] Stale record cleanup complete', {
      duration: `${duration}ms`,
      cancelled,
      errors: errors.length,
    });

    return { cancelled, errors };
  } catch (error) {
    logger.error('[Batch] Stale record cleanup failed', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    throw error;
  }
}

// =============================================================================
// ALERT GENERATION
// =============================================================================

interface CapacityAlert {
  type: 'OVER_CAPACITY' | 'AT_RISK' | 'SOP_BEHIND' | 'QUAL_DUE_SOON';
  shopId?: string;
  shopName?: string;
  carId?: string;
  railcarNumber?: string;
  period?: string;
  message: string;
  severity: 'WARNING' | 'CRITICAL';
}

/**
 * Generate capacity and compliance alerts
 * Run nightly at 3:00 AM
 */
export async function nightlyAlertGeneration(companyId?: string): Promise<CapacityAlert[]> {
  const startTime = Date.now();
  logger.info('[Batch] Starting alert generation', { companyId });

  const alerts: CapacityAlert[] = [];
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  try {
    // Get all shops with commitments
    const commitments = await prisma.sOPCommitment.findMany({
      where: {
        ...(companyId ? { companyId } : {}),
        year: { gte: currentYear },
      },
      include: {
        shop: { select: { id: true, name: true } },
      },
    });

    for (const commitment of commitments) {
      // Calculate actual usage from SSOT
      const confirmed = await prisma.unifiedAssignment.count({
        where: {
          shopId: commitment.shopId,
          plannedYear: commitment.year,
          plannedMonth: commitment.month,
          status: { in: [UA_STATUS.COMMITTED, UA_STATUS.IN_PROGRESS] },
        },
      });

      const planned = await prisma.unifiedAssignment.count({
        where: {
          shopId: commitment.shopId,
          plannedYear: commitment.year,
          plannedMonth: commitment.month,
          status: { in: [UA_STATUS.DRAFT, UA_STATUS.PENDING_REVIEW] },
        },
      });

      const total = confirmed + planned;
      const utilizationPercent = commitment.committedVolume > 0
        ? Math.round((confirmed / commitment.committedVolume) * 100)
        : 0;

      // Over capacity alert
      if (confirmed > commitment.committedVolume) {
        alerts.push({
          type: 'OVER_CAPACITY',
          shopId: commitment.shopId,
          shopName: commitment.shop.name,
          period: `${commitment.year}-${String(commitment.month).padStart(2, '0')}`,
          message: `Shop ${commitment.shop.name} is at ${utilizationPercent}% capacity (${confirmed} confirmed / ${commitment.committedVolume} limit)`,
          severity: 'CRITICAL',
        });
      }
      // At risk alert (projected overflow)
      else if (total > commitment.committedVolume) {
        alerts.push({
          type: 'AT_RISK',
          shopId: commitment.shopId,
          shopName: commitment.shop.name,
          period: `${commitment.year}-${String(commitment.month).padStart(2, '0')}`,
          message: `Shop ${commitment.shop.name} projected at ${Math.round((total / commitment.committedVolume) * 100)}% with planned work (${total} total / ${commitment.committedVolume} limit)`,
          severity: 'WARNING',
        });
      }
    }

    // Qualification due soon alerts (90/60/30 days)
    const today = new Date();
    const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysFromNow = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000);
    const ninetyDaysFromNow = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);

    // Check for cars with upcoming qualifications but no active assignment
    const carsNeedingQual = await prisma.car.findMany({
      where: {
        ...(companyId ? { companyId } : {}),
        tankQualification: { lte: ninetyDaysFromNow },
        unifiedAssignments: {
          none: {
            status: { notIn: TERMINAL_STATUSES },
          },
        },
      },
      select: {
        id: true,
        railcarNumber: true,
        tankQualification: true,
      },
      take: 100, // Limit for performance
    });

    for (const car of carsNeedingQual) {
      if (!car.tankQualification) continue;

      const daysUntilDue = Math.ceil(
        (car.tankQualification.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      let severity: 'WARNING' | 'CRITICAL' = 'WARNING';
      if (daysUntilDue <= 30) severity = 'CRITICAL';

      alerts.push({
        type: 'QUAL_DUE_SOON',
        carId: car.id,
        railcarNumber: car.railcarNumber || 'Unknown',
        message: `Car ${car.railcarNumber} qualification due in ${daysUntilDue} days (${car.tankQualification.toISOString().split('T')[0]}) - no active assignment`,
        severity,
      });
    }

    const duration = Date.now() - startTime;
    logger.info('[Batch] Alert generation complete', {
      duration: `${duration}ms`,
      totalAlerts: alerts.length,
      byType: {
        overCapacity: alerts.filter((a) => a.type === 'OVER_CAPACITY').length,
        atRisk: alerts.filter((a) => a.type === 'AT_RISK').length,
        qualDue: alerts.filter((a) => a.type === 'QUAL_DUE_SOON').length,
      },
    });

    return alerts;
  } catch (error) {
    logger.error('[Batch] Alert generation failed', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    throw error;
  }
}

// =============================================================================
// SHOPPING STATUS SYNC
// =============================================================================

/**
 * Sync Car.shoppingStatus based on SSOT assignments
 * Run nightly at 3:30 AM
 */
export async function nightlyShoppingStatusSync(companyId?: string) {
  const startTime = Date.now();
  logger.info('[Batch] Starting shopping status sync', { companyId });

  try {
    const cars = await prisma.car.findMany({
      where: companyId ? { companyId } : {},
      select: {
        id: true,
        railcarNumber: true,
        status: true,
        shoppingStatus: true,
        nextServiceDue: true,
        unifiedAssignments: {
          where: { status: { notIn: TERMINAL_STATUSES } },
          take: 1,
          select: { id: true },
        },
      },
    });

    let updated = 0;
    const today = new Date();

    for (const car of cars) {
      let newStatus: string;

      // Priority 1: Car is in shop
      if (car.status === 'Arrived' || car.status === 'InShop') {
        newStatus = 'InShop';
      }
      // Priority 2: Car work complete
      else if (car.status === 'Complete') {
        newStatus = 'Compliant';
      }
      // Priority 3: Has active assignment
      else if (car.unifiedAssignments.length > 0) {
        newStatus = 'Planned';
      }
      // Priority 4: Calculate from service due date
      else if (car.nextServiceDue) {
        const daysUntilDue = Math.ceil(
          (car.nextServiceDue.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysUntilDue < 0 || daysUntilDue <= 30) {
          newStatus = 'Urgent';
        } else if (daysUntilDue <= 90) {
          newStatus = 'MustShop';
        } else if (daysUntilDue <= 180) {
          newStatus = 'Upcoming';
        } else {
          newStatus = 'Compliant';
        }
      } else {
        newStatus = 'Unknown';
      }

      if (car.shoppingStatus !== newStatus) {
        await prisma.car.update({
          where: { id: car.id },
          data: { shoppingStatus: newStatus },
        });
        updated++;

        logger.debug('[Batch] Updated shopping status', {
          carId: car.id,
          railcarNumber: car.railcarNumber,
          from: car.shoppingStatus,
          to: newStatus,
        });
      }
    }

    const duration = Date.now() - startTime;
    logger.info('[Batch] Shopping status sync complete', {
      duration: `${duration}ms`,
      checked: cars.length,
      updated,
    });

    return { checked: cars.length, updated };
  } catch (error) {
    logger.error('[Batch] Shopping status sync failed', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    throw error;
  }
}

// =============================================================================
// MASTER BATCH RUNNER
// =============================================================================

/**
 * Run all nightly jobs in sequence
 */
export async function runNightlyJobs(companyId?: string) {
  const startTime = Date.now();
  logger.info('[Batch] Starting nightly job runner', { companyId });

  const results: Record<string, any> = {};

  try {
    // 1. Capacity recalculation
    results.capacityRecalc = await nightlyCapacityRecalculation(companyId);

    // 2. Hierarchy rollup
    results.hierarchyRollup = await nightlyHierarchyRollup(companyId);

    // 3. Alert generation
    results.alerts = await nightlyAlertGeneration(companyId);

    // 4. Shopping status sync
    results.shoppingStatusSync = await nightlyShoppingStatusSync(companyId);

    const duration = Date.now() - startTime;
    logger.info('[Batch] Nightly jobs complete', {
      duration: `${duration}ms`,
      results: {
        capacityPeriods: results.capacityRecalc?.length || 0,
        hierarchyParents: results.hierarchyRollup?.parents || 0,
        alerts: results.alerts?.length || 0,
        statusUpdates: results.shoppingStatusSync?.updated || 0,
      },
    });

    return results;
  } catch (error) {
    logger.error('[Batch] Nightly jobs failed', {
      error: error instanceof Error ? error.message : 'Unknown',
      completedJobs: Object.keys(results),
    });
    throw error;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  nightlyCapacityRecalculation,
  nightlyHierarchyRollup,
  weeklyStaleRecordCleanup,
  nightlyAlertGeneration,
  nightlyShoppingStatusSync,
  runNightlyJobs,
};
