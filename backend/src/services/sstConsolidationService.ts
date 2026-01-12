/**
 * SST Consolidation Service
 *
 * This service manages the Single Source of Truth (SST) architecture for:
 * - Planning Data: CarFlowPlan is the SST (PlanAssignment is deprecated)
 * - Capacity Data: SOPCommitment is the SST for monthly capacity
 * - Status Data: Car.shoppingStatus is derived from CarFlowPlan + Car.status
 *
 * MIGRATION GUIDE:
 * 1. Run migratePlanAssignmentsToCarFlowPlan() to copy existing data
 * 2. Update code to use CarFlowPlan via /api/car-flow endpoints
 * 3. Eventually remove PlanAssignment table after migration verification
 */

import { prisma } from './db';
import logger from '../utils/logger';

// =============================================================================
// PLAN ASSIGNMENT → CAR FLOW PLAN MIGRATION
// =============================================================================

interface MigrationResult {
  migrated: number;
  skipped: number;
  errors: { id: string; error: string }[];
}

/**
 * Migrate existing PlanAssignment records to CarFlowPlan.
 * Only migrates active assignments (not cancelled/completed).
 * Creates CarFlowPlan entries with source='migration'.
 */
export async function migratePlanAssignmentsToCarFlowPlan(
  companyId: string,
  userId: string
): Promise<MigrationResult> {
  const result: MigrationResult = { migrated: 0, skipped: 0, errors: [] };

  try {
    // Get all active PlanAssignments for this company
    const assignments = await prisma.planAssignment.findMany({
      where: {
        plan: { companyId },
        status: { in: ['pending', 'confirmed', 'in_progress'] },
      },
      include: {
        car: { select: { id: true, companyId: true } },
        shop: { select: { id: true } },
        plan: { select: { companyId: true } },
      },
    });

    for (const assignment of assignments) {
      try {
        // Parse scheduledMonth (YYYY-MM format)
        const [yearStr, monthStr] = assignment.scheduledMonth.split('-');
        const plannedYear = parseInt(yearStr);
        const plannedMonth = parseInt(monthStr);

        if (isNaN(plannedYear) || isNaN(plannedMonth)) {
          result.errors.push({
            id: assignment.id,
            error: `Invalid scheduledMonth format: ${assignment.scheduledMonth}`,
          });
          continue;
        }

        // Check if CarFlowPlan already exists for this car-shop-month
        const existing = await prisma.carFlowPlan.findFirst({
          where: {
            carId: assignment.carId,
            shopId: assignment.shopId,
            plannedMonth,
            plannedYear,
            status: { in: ['Planned', 'InProgress'] },
          },
        });

        if (existing) {
          result.skipped++;
          continue;
        }

        // Create CarFlowPlan from PlanAssignment
        await prisma.carFlowPlan.create({
          data: {
            carId: assignment.carId,
            shopId: assignment.shopId,
            plannedMonth,
            plannedYear,
            status: mapPlanAssignmentStatus(assignment.status),
            source: 'migration',
            estimatedCost: assignment.estimatedCost,
            notes: assignment.notes || null,
            createdById: userId,
          },
        });

        result.migrated++;
      } catch (error) {
        result.errors.push({
          id: assignment.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    logger.info('PlanAssignment migration completed', {
      companyId,
      ...result,
    });

    return result;
  } catch (error) {
    logger.error('PlanAssignment migration failed', error);
    throw error;
  }
}

function mapPlanAssignmentStatus(status: string): string {
  switch (status) {
    case 'pending':
    case 'confirmed':
      return 'Planned';
    case 'in_progress':
      return 'InProgress';
    case 'completed':
      return 'Complete';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Planned';
  }
}

// =============================================================================
// CAPACITY CONSOLIDATION - SOPCommitment as SST
// =============================================================================

/**
 * Get capacity for a shop-month from the SST (SOPCommitment).
 * Falls back to Shop.capacity if no SOPCommitment exists.
 */
export async function getShopMonthCapacity(
  shopId: string,
  year: number,
  month: number
): Promise<{ capacity: number; source: 'sop_commitment' | 'shop_default' }> {
  // First check SOPCommitment (SST)
  const commitment = await prisma.sOPCommitment.findFirst({
    where: { shopId, year, month },
  });

  if (commitment) {
    return {
      capacity: commitment.committedVolume,
      source: 'sop_commitment',
    };
  }

  // Fallback to Shop.capacity
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { capacity: true },
  });

  return {
    capacity: shop?.capacity || 0,
    source: 'shop_default',
  };
}

/**
 * Get current usage for a shop-month from CarFlowPlan (SST for planning).
 */
export async function getShopMonthUsage(
  shopId: string,
  year: number,
  month: number
): Promise<number> {
  const count = await prisma.carFlowPlan.count({
    where: {
      shopId,
      plannedYear: year,
      plannedMonth: month,
      status: { in: ['Planned', 'InProgress'] },
    },
  });
  return count;
}

/**
 * Get capacity availability for a shop-month.
 */
export async function getShopMonthAvailability(
  shopId: string,
  year: number,
  month: number
): Promise<{
  capacity: number;
  used: number;
  available: number;
  utilization: number;
  source: 'sop_commitment' | 'shop_default';
}> {
  const [capacityInfo, used] = await Promise.all([
    getShopMonthCapacity(shopId, year, month),
    getShopMonthUsage(shopId, year, month),
  ]);

  const available = Math.max(0, capacityInfo.capacity - used);
  const utilization = capacityInfo.capacity > 0
    ? Math.round((used / capacityInfo.capacity) * 100)
    : 0;

  return {
    capacity: capacityInfo.capacity,
    used,
    available,
    utilization,
    source: capacityInfo.source,
  };
}

/**
 * Sync SOPCommitment.currentUsage with actual CarFlowPlan count.
 * Call this periodically or after bulk operations.
 */
export async function syncSOPCommitmentUsage(
  companyId: string
): Promise<{ updated: number }> {
  // Get all SOPCommitments for company
  const commitments = await prisma.sOPCommitment.findMany({
    where: { companyId },
  });

  let updated = 0;

  for (const commitment of commitments) {
    const actualUsage = await getShopMonthUsage(
      commitment.shopId,
      commitment.year,
      commitment.month
    );

    if (commitment.currentUsage !== actualUsage) {
      await prisma.sOPCommitment.update({
        where: { id: commitment.id },
        data: { currentUsage: actualUsage },
      });
      updated++;
    }
  }

  return { updated };
}

// =============================================================================
// STATUS CONSOLIDATION - Derive shoppingStatus from CarFlowPlan + Car.status
// =============================================================================

/**
 * Calculate the derived shoppingStatus for a car.
 * This is the canonical algorithm - shoppingStatus should be computed, not stored.
 */
export function calculateShoppingStatus(car: {
  status: string | null;
  nextServiceDue: Date | null;
  hasActiveCarFlowPlan: boolean;
}): string {
  const today = new Date();

  // Priority 1: Car is in shop
  if (car.status === 'Arrived' || car.status === 'InShop') {
    return 'InShop';
  }

  // Priority 2: Car work is complete
  if (car.status === 'Complete') {
    return 'Compliant';
  }

  // Priority 3: Car has active plan
  if (car.hasActiveCarFlowPlan) {
    return 'Planned';
  }

  // Priority 4: Calculate urgency from next service due date
  if (car.nextServiceDue) {
    const dueDate = new Date(car.nextServiceDue);
    const daysUntilDue = Math.ceil(
      (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysUntilDue < 0) {
      return 'Urgent'; // Overdue
    } else if (daysUntilDue <= 30) {
      return 'Urgent'; // Due within 30 days
    } else if (daysUntilDue <= 90) {
      return 'MustShop'; // Due within 90 days
    } else if (daysUntilDue <= 180) {
      return 'Upcoming'; // Due within 180 days
    } else {
      return 'Compliant'; // Not due soon
    }
  }

  return 'Unknown';
}

/**
 * Update shoppingStatus for a single car (derived from current state).
 */
export async function updateCarShoppingStatus(carId: string): Promise<string> {
  const car = await prisma.car.findUnique({
    where: { id: carId },
    select: {
      id: true,
      status: true,
      nextServiceDue: true,
      carFlowPlans: {
        where: { status: { in: ['Planned', 'InProgress'] } },
        take: 1,
        select: { id: true },
      },
    },
  });

  if (!car) {
    throw new Error(`Car not found: ${carId}`);
  }

  const newStatus = calculateShoppingStatus({
    status: car.status,
    nextServiceDue: car.nextServiceDue,
    hasActiveCarFlowPlan: car.carFlowPlans.length > 0,
  });

  await prisma.car.update({
    where: { id: carId },
    data: { shoppingStatus: newStatus },
  });

  return newStatus;
}

/**
 * Batch update shoppingStatus for all cars in a company.
 */
export async function batchUpdateShoppingStatus(
  companyId: string
): Promise<{ updated: number }> {
  const cars = await prisma.car.findMany({
    where: { companyId },
    select: {
      id: true,
      status: true,
      nextServiceDue: true,
      shoppingStatus: true,
      carFlowPlans: {
        where: { status: { in: ['Planned', 'InProgress'] } },
        take: 1,
        select: { id: true },
      },
    },
  });

  let updated = 0;

  for (const car of cars) {
    const newStatus = calculateShoppingStatus({
      status: car.status,
      nextServiceDue: car.nextServiceDue,
      hasActiveCarFlowPlan: car.carFlowPlans.length > 0,
    });

    if (car.shoppingStatus !== newStatus) {
      await prisma.car.update({
        where: { id: car.id },
        data: { shoppingStatus: newStatus },
      });
      updated++;
    }
  }

  return { updated };
}

/**
 * Hook to call when CarFlowPlan status changes.
 * Ensures Car.shoppingStatus stays in sync.
 */
export async function onCarFlowPlanStatusChange(
  carId: string,
  newPlanStatus: string
): Promise<void> {
  // Recalculate the car's shopping status
  await updateCarShoppingStatus(carId);

  // If plan moved to InProgress, also update Car.status
  if (newPlanStatus === 'InProgress') {
    await prisma.car.update({
      where: { id: carId },
      data: { status: 'Arrived' },
    });
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  // Migration
  migratePlanAssignmentsToCarFlowPlan,
  // Capacity
  getShopMonthCapacity,
  getShopMonthUsage,
  getShopMonthAvailability,
  syncSOPCommitmentUsage,
  // Status
  calculateShoppingStatus,
  updateCarShoppingStatus,
  batchUpdateShoppingStatus,
  onCarFlowPlanStatusChange,
};
