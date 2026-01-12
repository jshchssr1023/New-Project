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
 *
 * ERROR LOGGING:
 * All operations log errors with context for debugging.
 * Use LOG_LEVEL=debug to see detailed operation logs.
 */

import { prisma } from './db';
import logger from '../utils/logger';

// =============================================================================
// PLAN ASSIGNMENT → CAR FLOW PLAN MIGRATION
// =============================================================================

interface MigrationResult {
  migrated: number;
  skipped: number;
  errors: { id: string; error: string; details?: Record<string, unknown> }[];
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
  const startTime = Date.now();

  logger.info('[SST Migration] Starting PlanAssignment → CarFlowPlan migration', {
    companyId,
    userId,
  });

  try {
    // Get all active PlanAssignments for this company
    const assignments = await prisma.planAssignment.findMany({
      where: {
        plan: { companyId },
        status: { in: ['pending', 'confirmed', 'in_progress'] },
      },
      include: {
        car: { select: { id: true, companyId: true, railcarNumber: true } },
        shop: { select: { id: true, name: true } },
        plan: { select: { companyId: true, name: true } },
      },
    });

    logger.info('[SST Migration] Found assignments to migrate', {
      companyId,
      totalAssignments: assignments.length,
    });

    for (const assignment of assignments) {
      try {
        // Parse scheduledMonth (YYYY-MM format)
        const [yearStr, monthStr] = assignment.scheduledMonth.split('-');
        const plannedYear = parseInt(yearStr);
        const plannedMonth = parseInt(monthStr);

        if (isNaN(plannedYear) || isNaN(plannedMonth)) {
          const errorMsg = `Invalid scheduledMonth format: ${assignment.scheduledMonth}`;
          logger.error('[SST Migration] Failed to parse scheduledMonth', {
            assignmentId: assignment.id,
            carId: assignment.carId,
            railcarNumber: assignment.car?.railcarNumber,
            scheduledMonth: assignment.scheduledMonth,
            error: errorMsg,
          });
          result.errors.push({
            id: assignment.id,
            error: errorMsg,
            details: { scheduledMonth: assignment.scheduledMonth },
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
          logger.debug('[SST Migration] Skipping - CarFlowPlan already exists', {
            assignmentId: assignment.id,
            carId: assignment.carId,
            existingCarFlowPlanId: existing.id,
          });
          result.skipped++;
          continue;
        }

        // Create CarFlowPlan from PlanAssignment
        const newCarFlowPlan = await prisma.carFlowPlan.create({
          data: {
            carId: assignment.carId,
            shopId: assignment.shopId,
            plannedMonth,
            plannedYear,
            status: mapPlanAssignmentStatus(assignment.status),
            source: 'migration',
            estimatedCost: assignment.estimatedCost,
            notes: assignment.notes || null,
            committedById: userId,
          },
        });

        logger.debug('[SST Migration] Created CarFlowPlan from PlanAssignment', {
          assignmentId: assignment.id,
          newCarFlowPlanId: newCarFlowPlan.id,
          carId: assignment.carId,
          railcarNumber: assignment.car?.railcarNumber,
          shopId: assignment.shopId,
          shopName: assignment.shop?.name,
          plannedMonth,
          plannedYear,
        });

        result.migrated++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.error('[SST Migration] Failed to migrate assignment', {
          assignmentId: assignment.id,
          carId: assignment.carId,
          railcarNumber: assignment.car?.railcarNumber,
          shopId: assignment.shopId,
          error: errorMsg,
          stack: error instanceof Error ? error.stack : undefined,
        });
        result.errors.push({
          id: assignment.id,
          error: errorMsg,
          details: {
            carId: assignment.carId,
            shopId: assignment.shopId,
            scheduledMonth: assignment.scheduledMonth,
          },
        });
      }
    }

    const duration = Date.now() - startTime;
    logger.info('[SST Migration] Migration completed', {
      companyId,
      duration: `${duration}ms`,
      migrated: result.migrated,
      skipped: result.skipped,
      errors: result.errors.length,
    });

    if (result.errors.length > 0) {
      logger.warn('[SST Migration] Migration completed with errors', {
        companyId,
        errorCount: result.errors.length,
        errors: result.errors.slice(0, 10), // Log first 10 errors
      });
    }

    return result;
  } catch (error) {
    logger.error('[SST Migration] Migration failed with critical error', {
      companyId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
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
      logger.warn('[SST Migration] Unknown PlanAssignment status, defaulting to Planned', {
        originalStatus: status,
      });
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
  try {
    // First check SOPCommitment (SST)
    const commitment = await prisma.sOPCommitment.findFirst({
      where: { shopId, year, month },
    });

    if (commitment) {
      logger.debug('[SST Capacity] Using SOPCommitment capacity', {
        shopId,
        year,
        month,
        capacity: commitment.committedVolume,
      });
      return {
        capacity: commitment.committedVolume,
        source: 'sop_commitment',
      };
    }

    // Fallback to Shop.capacity
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      select: { capacity: true, name: true },
    });

    if (!shop) {
      logger.warn('[SST Capacity] Shop not found, returning 0 capacity', {
        shopId,
        year,
        month,
      });
      return { capacity: 0, source: 'shop_default' };
    }

    logger.debug('[SST Capacity] No SOPCommitment found, using Shop.capacity fallback', {
      shopId,
      shopName: shop.name,
      year,
      month,
      capacity: shop.capacity || 0,
    });

    return {
      capacity: shop.capacity || 0,
      source: 'shop_default',
    };
  } catch (error) {
    logger.error('[SST Capacity] Failed to get shop month capacity', {
      shopId,
      year,
      month,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * Get current usage for a shop-month from CarFlowPlan (SST for planning).
 */
export async function getShopMonthUsage(
  shopId: string,
  year: number,
  month: number
): Promise<number> {
  try {
    const count = await prisma.carFlowPlan.count({
      where: {
        shopId,
        plannedYear: year,
        plannedMonth: month,
        status: { in: ['Planned', 'InProgress'] },
      },
    });

    logger.debug('[SST Capacity] Got shop month usage', {
      shopId,
      year,
      month,
      usage: count,
    });

    return count;
  } catch (error) {
    logger.error('[SST Capacity] Failed to get shop month usage', {
      shopId,
      year,
      month,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
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
  try {
    const [capacityInfo, used] = await Promise.all([
      getShopMonthCapacity(shopId, year, month),
      getShopMonthUsage(shopId, year, month),
    ]);

    const available = Math.max(0, capacityInfo.capacity - used);
    const utilization = capacityInfo.capacity > 0
      ? Math.round((used / capacityInfo.capacity) * 100)
      : 0;

    const result = {
      capacity: capacityInfo.capacity,
      used,
      available,
      utilization,
      source: capacityInfo.source,
    };

    logger.debug('[SST Capacity] Calculated shop month availability', {
      shopId,
      year,
      month,
      ...result,
    });

    // Warn if over capacity
    if (used > capacityInfo.capacity && capacityInfo.capacity > 0) {
      logger.warn('[SST Capacity] Shop is over capacity!', {
        shopId,
        year,
        month,
        capacity: capacityInfo.capacity,
        used,
        overBy: used - capacityInfo.capacity,
      });
    }

    return result;
  } catch (error) {
    logger.error('[SST Capacity] Failed to get shop month availability', {
      shopId,
      year,
      month,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * Sync SOPCommitment.currentUsage with actual CarFlowPlan count.
 * Call this periodically or after bulk operations.
 */
export async function syncSOPCommitmentUsage(
  companyId: string
): Promise<{ updated: number; checked: number; errors: string[] }> {
  const startTime = Date.now();
  const errors: string[] = [];

  logger.info('[SST Capacity] Starting SOPCommitment usage sync', { companyId });

  try {
    // Get all SOPCommitments for company
    const commitments = await prisma.sOPCommitment.findMany({
      where: { companyId },
      include: { shop: { select: { name: true } } },
    });

    logger.info('[SST Capacity] Found SOPCommitments to check', {
      companyId,
      count: commitments.length,
    });

    let updated = 0;

    for (const commitment of commitments) {
      try {
        const actualUsage = await getShopMonthUsage(
          commitment.shopId,
          commitment.year,
          commitment.month
        );

        if (commitment.currentUsage !== actualUsage) {
          logger.info('[SST Capacity] Updating SOPCommitment currentUsage', {
            commitmentId: commitment.id,
            shopId: commitment.shopId,
            shopName: commitment.shop?.name,
            year: commitment.year,
            month: commitment.month,
            oldUsage: commitment.currentUsage,
            newUsage: actualUsage,
            diff: actualUsage - (commitment.currentUsage || 0),
          });

          await prisma.sOPCommitment.update({
            where: { id: commitment.id },
            data: { currentUsage: actualUsage },
          });
          updated++;
        }
      } catch (error) {
        const errorMsg = `Failed to sync commitment ${commitment.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        logger.error('[SST Capacity] Failed to sync individual commitment', {
          commitmentId: commitment.id,
          shopId: commitment.shopId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        errors.push(errorMsg);
      }
    }

    const duration = Date.now() - startTime;
    logger.info('[SST Capacity] SOPCommitment usage sync completed', {
      companyId,
      duration: `${duration}ms`,
      checked: commitments.length,
      updated,
      errors: errors.length,
    });

    return { updated, checked: commitments.length, errors };
  } catch (error) {
    logger.error('[SST Capacity] SOPCommitment usage sync failed', {
      companyId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
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
  carId?: string; // Optional for logging
}): string {
  const today = new Date();

  // Priority 1: Car is in shop
  if (car.status === 'Arrived' || car.status === 'InShop') {
    logger.debug('[SST Status] Car status = InShop (arrived/in shop)', {
      carId: car.carId,
      carStatus: car.status,
    });
    return 'InShop';
  }

  // Priority 2: Car work is complete
  if (car.status === 'Complete') {
    logger.debug('[SST Status] Car status = Compliant (work complete)', {
      carId: car.carId,
      carStatus: car.status,
    });
    return 'Compliant';
  }

  // Priority 3: Car has active plan
  if (car.hasActiveCarFlowPlan) {
    logger.debug('[SST Status] Car status = Planned (has active CarFlowPlan)', {
      carId: car.carId,
      carStatus: car.status,
    });
    return 'Planned';
  }

  // Priority 4: Calculate urgency from next service due date
  if (car.nextServiceDue) {
    const dueDate = new Date(car.nextServiceDue);
    const daysUntilDue = Math.ceil(
      (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    let derivedStatus: string;
    if (daysUntilDue < 0) {
      derivedStatus = 'Urgent'; // Overdue
    } else if (daysUntilDue <= 30) {
      derivedStatus = 'Urgent'; // Due within 30 days
    } else if (daysUntilDue <= 90) {
      derivedStatus = 'MustShop'; // Due within 90 days
    } else if (daysUntilDue <= 180) {
      derivedStatus = 'Upcoming'; // Due within 180 days
    } else {
      derivedStatus = 'Compliant'; // Not due soon
    }

    logger.debug('[SST Status] Car status derived from nextServiceDue', {
      carId: car.carId,
      carStatus: car.status,
      nextServiceDue: car.nextServiceDue,
      daysUntilDue,
      derivedStatus,
    });

    return derivedStatus;
  }

  logger.debug('[SST Status] Car status = Unknown (no service date, no plan)', {
    carId: car.carId,
    carStatus: car.status,
  });

  return 'Unknown';
}

/**
 * Update shoppingStatus for a single car (derived from current state).
 */
export async function updateCarShoppingStatus(carId: string): Promise<string> {
  try {
    const car = await prisma.car.findUnique({
      where: { id: carId },
      select: {
        id: true,
        railcarNumber: true,
        status: true,
        shoppingStatus: true,
        nextServiceDue: true,
        carFlowPlans: {
          where: { status: { in: ['Planned', 'InProgress'] } },
          take: 1,
          select: { id: true, status: true },
        },
      },
    });

    if (!car) {
      logger.error('[SST Status] Car not found for status update', { carId });
      throw new Error(`Car not found: ${carId}`);
    }

    const newStatus = calculateShoppingStatus({
      status: car.status,
      nextServiceDue: car.nextServiceDue,
      hasActiveCarFlowPlan: car.carFlowPlans.length > 0,
      carId: car.id,
    });

    if (car.shoppingStatus !== newStatus) {
      logger.info('[SST Status] Updating car shoppingStatus', {
        carId: car.id,
        railcarNumber: car.railcarNumber,
        oldStatus: car.shoppingStatus,
        newStatus,
        carStatus: car.status,
        hasActivePlan: car.carFlowPlans.length > 0,
        nextServiceDue: car.nextServiceDue,
      });

      await prisma.car.update({
        where: { id: carId },
        data: { shoppingStatus: newStatus },
      });
    } else {
      logger.debug('[SST Status] Car shoppingStatus unchanged', {
        carId: car.id,
        railcarNumber: car.railcarNumber,
        status: newStatus,
      });
    }

    return newStatus;
  } catch (error) {
    logger.error('[SST Status] Failed to update car shopping status', {
      carId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * Batch update shoppingStatus for all cars in a company.
 */
export async function batchUpdateShoppingStatus(
  companyId: string
): Promise<{ updated: number; checked: number; errors: string[] }> {
  const startTime = Date.now();
  const errors: string[] = [];

  logger.info('[SST Status] Starting batch shoppingStatus update', { companyId });

  try {
    const cars = await prisma.car.findMany({
      where: { companyId },
      select: {
        id: true,
        railcarNumber: true,
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

    logger.info('[SST Status] Found cars to check', {
      companyId,
      count: cars.length,
    });

    let updated = 0;
    const statusChanges: { carId: string; railcarNumber: string | null; from: string | null; to: string }[] = [];

    for (const car of cars) {
      try {
        const newStatus = calculateShoppingStatus({
          status: car.status,
          nextServiceDue: car.nextServiceDue,
          hasActiveCarFlowPlan: car.carFlowPlans.length > 0,
          carId: car.id,
        });

        if (car.shoppingStatus !== newStatus) {
          await prisma.car.update({
            where: { id: car.id },
            data: { shoppingStatus: newStatus },
          });
          updated++;
          statusChanges.push({
            carId: car.id,
            railcarNumber: car.railcarNumber,
            from: car.shoppingStatus,
            to: newStatus,
          });
        }
      } catch (error) {
        const errorMsg = `Failed to update car ${car.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        logger.error('[SST Status] Failed to update individual car', {
          carId: car.id,
          railcarNumber: car.railcarNumber,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        errors.push(errorMsg);
      }
    }

    const duration = Date.now() - startTime;

    // Log summary of status changes
    if (statusChanges.length > 0) {
      // Group by transition type
      const transitions: Record<string, number> = {};
      for (const change of statusChanges) {
        const key = `${change.from || 'null'} → ${change.to}`;
        transitions[key] = (transitions[key] || 0) + 1;
      }

      logger.info('[SST Status] Batch update completed with changes', {
        companyId,
        duration: `${duration}ms`,
        checked: cars.length,
        updated,
        errors: errors.length,
        transitions,
        sampleChanges: statusChanges.slice(0, 5), // Log first 5 changes
      });
    } else {
      logger.info('[SST Status] Batch update completed - no changes needed', {
        companyId,
        duration: `${duration}ms`,
        checked: cars.length,
        updated: 0,
      });
    }

    return { updated, checked: cars.length, errors };
  } catch (error) {
    logger.error('[SST Status] Batch shoppingStatus update failed', {
      companyId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * Hook to call when CarFlowPlan status changes.
 * Ensures Car.shoppingStatus stays in sync.
 */
export async function onCarFlowPlanStatusChange(
  carId: string,
  newPlanStatus: string
): Promise<void> {
  logger.info('[SST Status] CarFlowPlan status change hook triggered', {
    carId,
    newPlanStatus,
  });

  try {
    // Recalculate the car's shopping status
    const newShoppingStatus = await updateCarShoppingStatus(carId);

    // If plan moved to InProgress, also update Car.status
    if (newPlanStatus === 'InProgress') {
      logger.info('[SST Status] Updating Car.status to Arrived (plan InProgress)', {
        carId,
      });
      await prisma.car.update({
        where: { id: carId },
        data: { status: 'Arrived' },
      });
    }

    logger.info('[SST Status] CarFlowPlan status change hook completed', {
      carId,
      newPlanStatus,
      newShoppingStatus,
    });
  } catch (error) {
    logger.error('[SST Status] CarFlowPlan status change hook failed', {
      carId,
      newPlanStatus,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

// =============================================================================
// MASTER PLAN SST - The Single Source of Truth for Scheduled Shoppings
// =============================================================================

/**
 * Get or create the active MasterPlan for a company.
 * The active MasterPlan is the SST for all scheduled shoppings.
 */
export async function getOrCreateActiveMasterPlan(
  companyId: string,
  userId: string
): Promise<{ id: string; name: string; isNew: boolean }> {
  try {
    // Check for existing active plan
    const existingPlan = await prisma.masterPlan.findFirst({
      where: { companyId, status: 'ACTIVE' },
      select: { id: true, name: true },
    });

    if (existingPlan) {
      logger.debug('[SST MasterPlan] Found existing active MasterPlan', {
        planId: existingPlan.id,
        name: existingPlan.name,
      });
      return { ...existingPlan, isNew: false };
    }

    // Create new active plan
    const currentYear = new Date().getFullYear();
    const planName = `Master Plan ${currentYear}`;
    const now = new Date();
    const yearEnd = new Date(currentYear, 11, 31);

    const newPlan = await prisma.masterPlan.create({
      data: {
        name: planName,
        description: `Active master plan for ${currentYear}`,
        status: 'ACTIVE',
        validFrom: now,
        validTo: yearEnd,
        planningHorizonStart: now,
        planningHorizonEnd: yearEnd,
        companyId,
        createdById: userId,
      },
      select: { id: true, name: true },
    });

    logger.info('[SST MasterPlan] Created new active MasterPlan', {
      planId: newPlan.id,
      name: newPlan.name,
      companyId,
    });

    return { ...newPlan, isNew: true };
  } catch (error) {
    logger.error('[SST MasterPlan] Failed to get/create active MasterPlan', {
      companyId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Promote a CarFlowPlan to MasterPlanCommitment.
 * This is the workflow: CarFlowPlan (Confirmed) → MasterPlanCommitment (SCHEDULED)
 */
export async function promoteToMasterPlan(
  carFlowPlanId: string,
  userId: string
): Promise<{ commitmentId: string; masterPlanId: string }> {
  try {
    // Get the CarFlowPlan
    const carFlowPlan = await prisma.carFlowPlan.findUnique({
      where: { id: carFlowPlanId },
      include: {
        car: { select: { id: true, railcarNumber: true, companyId: true } },
        shop: { select: { id: true, name: true } },
        customer: { select: { id: true } },
      },
    });

    if (!carFlowPlan) {
      throw new Error(`CarFlowPlan not found: ${carFlowPlanId}`);
    }

    if (carFlowPlan.status !== 'Confirmed') {
      throw new Error(`CarFlowPlan must be Confirmed to promote. Current status: ${carFlowPlan.status}`);
    }

    // Get or create active MasterPlan
    const masterPlan = await getOrCreateActiveMasterPlan(
      carFlowPlan.car.companyId,
      userId
    );

    // Check if commitment already exists
    const existing = await prisma.masterPlanCommitment.findFirst({
      where: {
        masterPlanId: masterPlan.id,
        carId: carFlowPlan.carId,
        plannedMonth: carFlowPlan.plannedMonth,
        plannedYear: carFlowPlan.plannedYear,
        status: { notIn: ['CANCELLED', 'DEFERRED'] },
      },
    });

    if (existing) {
      logger.warn('[SST MasterPlan] Commitment already exists for this car-month', {
        carFlowPlanId,
        existingCommitmentId: existing.id,
        carId: carFlowPlan.carId,
      });
      return { commitmentId: existing.id, masterPlanId: masterPlan.id };
    }

    // Create MasterPlanCommitment
    const commitment = await prisma.masterPlanCommitment.create({
      data: {
        masterPlanId: masterPlan.id,
        carId: carFlowPlan.carId,
        shopId: carFlowPlan.shopId,
        customerId: carFlowPlan.customerId,
        plannedMonth: carFlowPlan.plannedMonth,
        plannedYear: carFlowPlan.plannedYear,
        status: 'SCHEDULED',
        scheduledAt: new Date(),
        sourceType: 'car_flow_plan',
        shopReason: carFlowPlan.shopReason || '',
      },
    });

    // Update CarFlowPlan status to indicate it's been scheduled
    await prisma.carFlowPlan.update({
      where: { id: carFlowPlanId },
      data: {
        status: 'Scheduled',
        notes: `Promoted to MasterPlanCommitment: ${commitment.id}`,
      },
    });

    logger.info('[SST MasterPlan] Promoted CarFlowPlan to MasterPlanCommitment', {
      carFlowPlanId,
      commitmentId: commitment.id,
      masterPlanId: masterPlan.id,
      carId: carFlowPlan.carId,
      railcarNumber: carFlowPlan.car.railcarNumber,
      plannedMonth: carFlowPlan.plannedMonth,
      plannedYear: carFlowPlan.plannedYear,
    });

    return { commitmentId: commitment.id, masterPlanId: masterPlan.id };
  } catch (error) {
    logger.error('[SST MasterPlan] Failed to promote CarFlowPlan', {
      carFlowPlanId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Get dashboard metrics from the SST (MasterPlan + MasterPlanCommitment).
 * This is the canonical source for scheduled shopping counts.
 */
export async function getDashboardMetrics(companyId: string): Promise<{
  planned: number;       // CarFlowPlan with status Planned
  confirmed: number;     // CarFlowPlan with status Confirmed
  scheduled: number;     // MasterPlanCommitment with status SCHEDULED
  inProgress: number;    // MasterPlanCommitment with status IN_PROGRESS
  completed: number;     // MasterPlanCommitment with status COMPLETE
  byMonth: Record<string, { planned: number; scheduled: number }>;
}> {
  try {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    // Get CarFlowPlan counts (planning stage)
    const [plannedCount, confirmedCount] = await Promise.all([
      prisma.carFlowPlan.count({
        where: { companyId, status: 'Planned' },
      }),
      prisma.carFlowPlan.count({
        where: { companyId, status: 'Confirmed' },
      }),
    ]);

    // Get MasterPlanCommitment counts from active plan (SST for scheduled)
    const activePlan = await prisma.masterPlan.findFirst({
      where: { companyId, status: 'ACTIVE' },
      select: { id: true },
    });

    let scheduledCount = 0;
    let inProgressCount = 0;
    let completedCount = 0;
    const byMonth: Record<string, { planned: number; scheduled: number }> = {};

    if (activePlan) {
      const [scheduled, inProgress, completed] = await Promise.all([
        prisma.masterPlanCommitment.count({
          where: { masterPlanId: activePlan.id, status: 'SCHEDULED' },
        }),
        prisma.masterPlanCommitment.count({
          where: { masterPlanId: activePlan.id, status: 'IN_PROGRESS' },
        }),
        prisma.masterPlanCommitment.count({
          where: { masterPlanId: activePlan.id, status: 'COMPLETE' },
        }),
      ]);

      scheduledCount = scheduled;
      inProgressCount = inProgress;
      completedCount = completed;

      // Get by-month breakdown for next 12 months
      const commitmentsByMonth = await prisma.masterPlanCommitment.groupBy({
        by: ['plannedYear', 'plannedMonth'],
        where: {
          masterPlanId: activePlan.id,
          status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
          OR: [
            { plannedYear: { gt: currentYear } },
            { plannedYear: currentYear, plannedMonth: { gte: currentMonth } },
          ],
        },
        _count: { id: true },
      });

      const plansByMonth = await prisma.carFlowPlan.groupBy({
        by: ['plannedYear', 'plannedMonth'],
        where: {
          companyId,
          status: { in: ['Planned', 'Confirmed'] },
          OR: [
            { plannedYear: { gt: currentYear } },
            { plannedYear: currentYear, plannedMonth: { gte: currentMonth } },
          ],
        },
        _count: { id: true },
      });

      // Merge into byMonth
      commitmentsByMonth.forEach((c) => {
        const key = `${c.plannedYear}-${String(c.plannedMonth).padStart(2, '0')}`;
        if (!byMonth[key]) byMonth[key] = { planned: 0, scheduled: 0 };
        byMonth[key].scheduled = c._count.id;
      });

      plansByMonth.forEach((p) => {
        const key = `${p.plannedYear}-${String(p.plannedMonth).padStart(2, '0')}`;
        if (!byMonth[key]) byMonth[key] = { planned: 0, scheduled: 0 };
        byMonth[key].planned = p._count.id;
      });
    }

    logger.debug('[SST MasterPlan] Dashboard metrics retrieved', {
      companyId,
      planned: plannedCount,
      confirmed: confirmedCount,
      scheduled: scheduledCount,
      inProgress: inProgressCount,
      completed: completedCount,
    });

    return {
      planned: plannedCount,
      confirmed: confirmedCount,
      scheduled: scheduledCount,
      inProgress: inProgressCount,
      completed: completedCount,
      byMonth,
    };
  } catch (error) {
    logger.error('[SST MasterPlan] Failed to get dashboard metrics', {
      companyId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Get upcoming shoppings from the SST (MasterPlanCommitment).
 */
export async function getUpcomingShoppings(
  companyId: string,
  limit: number = 10
): Promise<Array<{
  id: string;
  carId: string;
  railcarNumber: string;
  customer: string | null;
  shopName: string;
  plannedMonth: number;
  plannedYear: number;
  status: string;
}>> {
  try {
    const activePlan = await prisma.masterPlan.findFirst({
      where: { companyId, status: 'ACTIVE' },
      select: { id: true },
    });

    if (!activePlan) {
      return [];
    }

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    const commitments = await prisma.masterPlanCommitment.findMany({
      where: {
        masterPlanId: activePlan.id,
        status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
        OR: [
          { plannedYear: { gt: currentYear } },
          { plannedYear: currentYear, plannedMonth: { gte: currentMonth } },
        ],
      },
      include: {
        car: { select: { id: true, railcarNumber: true, customer: true } },
        shop: { select: { name: true } },
      },
      orderBy: [{ plannedYear: 'asc' }, { plannedMonth: 'asc' }],
      take: limit,
    });

    return commitments.map((c) => ({
      id: c.id,
      carId: c.carId,
      railcarNumber: c.car.railcarNumber || '',
      customer: c.car.customer,
      shopName: c.shop.name,
      plannedMonth: c.plannedMonth,
      plannedYear: c.plannedYear,
      status: c.status,
    }));
  } catch (error) {
    logger.error('[SST MasterPlan] Failed to get upcoming shoppings', {
      companyId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
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
  // MasterPlan SST
  getOrCreateActiveMasterPlan,
  promoteToMasterPlan,
  getDashboardMetrics,
  getUpcomingShoppings,
};
