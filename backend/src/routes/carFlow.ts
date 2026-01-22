/**
 * Car Flow Routes - Single Source of Truth for Car Flow Planning
 *
 * This module provides the canonical API for:
 * - Car Flow Plans (master schedule for car-shop assignments)
 * - Capacity management (shop capacity by month)
 * - S&OP Commitments (negotiated monthly volumes)
 * - Shopping status (car urgency tracking)
 *
 * ARCHITECTURE NOTE:
 * CarFlowPlan is the SST for planning data. All planning queries should
 * go through this API rather than directly querying PlanAssignment or
 * other legacy tables.
 */

import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../services/db';
import logger from '../utils/logger';
import sstConsolidationService from '../services/sstConsolidationService';

const router = Router();

router.use(authenticate);

// =============================================================================
// TYPES
// =============================================================================

interface BulkPlanAssignment {
  carId: string;
  shopId: string;
  plannedMonth: number;
  plannedYear: number;
  shopReason?: string;
  notes?: string;
}

interface BulkPlanConflict {
  carId: string;
  railcarNumber: string;
  existingShop: string;
  existingMonth: string;
  status: string;
}

// =============================================================================
// CAR FLOW PLANS - Core planning endpoints
// =============================================================================

/**
 * GET /car-flow/plans
 * List car flow plans with optional filtering
 */
router.get('/plans', async (req: AuthRequest, res: Response) => {
  const { shopId, customerId, year, month, status } = req.query;

  try {
    const where: Record<string, unknown> = {
      car: { companyId: req.user!.companyId },
    };

    if (shopId) where.shopId = shopId as string;
    if (customerId) where.customerId = customerId as string;
    if (year) where.plannedYear = parseInt(year as string);
    if (month) where.plannedMonth = parseInt(month as string);
    if (status) where.status = status as string;

    const plans = await prisma.carFlowPlan.findMany({
      where,
      include: {
        car: {
          select: {
            id: true,
            railcarNumber: true,
            carType: true,
            customer: true,
          },
        },
        shop: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: [
        { plannedYear: 'asc' },
        { plannedMonth: 'asc' },
      ],
    });

    res.json(plans);
  } catch (error) {
    logger.error('Failed to list car flow plans', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * POST /car-flow/plans
 * Create a single car flow plan entry
 * SST: Writes ONLY to UnifiedAssignment (single source of truth)
 */
router.post('/plans', async (req: AuthRequest, res: Response) => {
  const { carId, shopId, plannedMonth, plannedYear, shopReason, notes } = req.body;

  try {
    const companyId = req.user!.companyId;

    // Validate car belongs to company
    const car = await prisma.car.findFirst({
      where: { id: carId, companyId },
    });

    if (!car) {
      return res.status(404).json({ message: 'Car not found' });
    }

    // Validate shop belongs to company
    const shop = await prisma.shop.findFirst({
      where: { id: shopId, companyId },
    });

    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    // SST: Check for existing active assignment in UnifiedAssignment (the SST)
    const existingAssignment = await prisma.unifiedAssignment.findFirst({
      where: {
        carId,
        status: { in: ['DRAFT', 'PENDING_REVIEW', 'COMMITTED', 'IN_PROGRESS'] },
      },
    });

    if (existingAssignment) {
      return res.status(409).json({
        message: 'Car already has an active assignment',
        existingAssignment: { id: existingAssignment.id, status: existingAssignment.status },
      });
    }

    // SST: Create UnifiedAssignment (THE SINGLE SOURCE OF TRUTH)
    const assignment = await prisma.unifiedAssignment.create({
      data: {
        carId,
        shopId,
        plannedMonth,
        plannedYear,
        scheduledMonth: `${plannedYear}-${String(plannedMonth).padStart(2, '0')}`,
        status: 'PENDING_REVIEW', // Plan created = pending review
        sourceType: 'manual',
        workType: 'full_qualification',
        shopReason: shopReason || '',
        notes: notes || '',
        companyId,
      },
      include: {
        car: {
          select: {
            id: true,
            railcarNumber: true,
            carType: true,
            customer: true,
          },
        },
        shop: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    logger.info('Created SST assignment', {
      unifiedAssignmentId: assignment.id,
      carId,
      shopId,
    });

    // SST: Update derived shopping status
    try {
      await sstConsolidationService.updateCarShoppingStatus(carId);
    } catch (statusError) {
      // Log but don't fail the request - the assignment was created successfully
      logger.warn('Failed to update shopping status after plan creation', {
        carId,
        assignmentId: assignment.id,
        error: statusError instanceof Error ? statusError.message : 'Unknown error',
      });
    }

    // Return assignment in a backward-compatible format
    res.status(201).json({
      id: assignment.id,
      carId: assignment.carId,
      shopId: assignment.shopId,
      plannedMonth: assignment.plannedMonth,
      plannedYear: assignment.plannedYear,
      status: assignment.status === 'PENDING_REVIEW' ? 'Planned' : assignment.status,
      source: assignment.sourceType,
      shopReason: assignment.shopReason,
      notes: assignment.notes,
      car: assignment.car,
      shop: assignment.shop,
    });
  } catch (error) {
    logger.error('Failed to create car flow plan', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * POST /car-flow/plans/bulk
 * Bulk create car flow plans with conflict detection
 * SST: Writes ONLY to UnifiedAssignment (single source of truth)
 */
router.post('/plans/bulk', async (req: AuthRequest, res: Response) => {
  const { assignments, overrideConflicts = false } = req.body as {
    assignments: BulkPlanAssignment[];
    overrideConflicts?: boolean;
  };

  if (!Array.isArray(assignments) || assignments.length === 0) {
    return res.status(400).json({ message: 'assignments must be a non-empty array' });
  }

  try {
    const companyId = req.user!.companyId;
    const carIds = assignments.map(a => a.carId);

    // Validate all cars belong to company
    const cars = await prisma.car.findMany({
      where: { id: { in: carIds }, companyId },
      select: { id: true, railcarNumber: true },
    });

    const carMap = new Map(cars.map(c => [c.id, c]));
    const invalidCarIds = carIds.filter(id => !carMap.has(id));

    if (invalidCarIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Some cars not found',
        errors: invalidCarIds.map(id => ({
          carId: id,
          error: 'Car not found or access denied',
          code: 'CAR_NOT_FOUND',
        })),
      });
    }

    // SST: Check for existing active assignments (conflicts) in UnifiedAssignment
    const existingAssignments = await prisma.unifiedAssignment.findMany({
      where: {
        carId: { in: carIds },
        status: { in: ['DRAFT', 'PENDING_REVIEW', 'COMMITTED', 'IN_PROGRESS'] },
      },
      include: {
        car: { select: { railcarNumber: true } },
        shop: { select: { name: true } },
      },
    });

    const conflicts: BulkPlanConflict[] = existingAssignments.map(assignment => ({
      carId: assignment.carId,
      railcarNumber: assignment.car?.railcarNumber || 'Unknown',
      existingShop: assignment.shop?.name || 'Unknown',
      existingMonth: `${assignment.plannedMonth}/${assignment.plannedYear}`,
      status: assignment.status,
    }));

    // If conflicts exist and not overriding, return conflicts
    if (conflicts.length > 0 && !overrideConflicts) {
      return res.json({
        success: false,
        message: `${conflicts.length} cars already have active assignments`,
        conflicts,
        allowOverride: true,
      });
    }

    // SST: Mark existing assignments as superseded if overriding
    if (conflicts.length > 0 && overrideConflicts) {
      await prisma.unifiedAssignment.updateMany({
        where: {
          carId: { in: conflicts.map(c => c.carId) },
          status: { in: ['DRAFT', 'PENDING_REVIEW', 'COMMITTED', 'IN_PROGRESS'] },
        },
        data: { status: 'SUPERSEDED' },
      });
    }

    // Check S&OP capacity warnings using UnifiedAssignment
    const shopMonthKeys = [...new Set(assignments.map(a => `${a.shopId}-${a.plannedYear}-${a.plannedMonth}`))];
    const warnings: {
      shopId: string;
      shopName: string;
      month: string;
      currentUsage: number;
      capacity: number;
      carCount: number;
    }[] = [];

    for (const key of shopMonthKeys) {
      const [shopId, yearStr, monthStr] = key.split('-');
      const year = parseInt(yearStr);
      const month = parseInt(monthStr);

      const commitment = await prisma.sOPCommitment.findFirst({
        where: { shopId, year, month },
        include: { shop: { select: { name: true } } },
      });

      if (commitment) {
        const carsInMonth = assignments.filter(
          a => a.shopId === shopId && a.plannedYear === year && a.plannedMonth === month
        ).length;

        // SST: Count from UnifiedAssignment instead of CarFlowPlan
        const currentUsage = await prisma.unifiedAssignment.count({
          where: {
            shopId,
            plannedYear: year,
            plannedMonth: month,
            status: { in: ['PENDING_REVIEW', 'COMMITTED', 'IN_PROGRESS'] },
          },
        });

        const totalUsage = currentUsage + carsInMonth;
        if (totalUsage > commitment.committedVolume) {
          warnings.push({
            shopId,
            shopName: commitment.shop?.name || 'Unknown',
            month: `${month}/${year}`,
            currentUsage,
            capacity: commitment.committedVolume,
            carCount: carsInMonth,
          });
        }
      }
    }

    // SST: Create UnifiedAssignment records (single source of truth)
    const createdAssignments = await prisma.$transaction(
      assignments.map(assignment =>
        prisma.unifiedAssignment.create({
          data: {
            carId: assignment.carId,
            shopId: assignment.shopId,
            plannedMonth: assignment.plannedMonth,
            plannedYear: assignment.plannedYear,
            scheduledMonth: `${assignment.plannedYear}-${String(assignment.plannedMonth).padStart(2, '0')}`,
            status: 'PENDING_REVIEW', // Bulk plans start as pending review
            sourceType: 'manual',
            workType: 'full_qualification',
            shopReason: assignment.shopReason || '',
            notes: assignment.notes || '',
            companyId,
          },
          include: {
            car: {
              select: {
                id: true,
                railcarNumber: true,
                carType: true,
                customer: true,
              },
            },
            shop: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        })
      )
    );

    logger.info('Bulk created SST assignments', {
      unifiedAssignmentsCreated: createdAssignments.length,
    });

    // SST: Update derived shopping status for all affected cars
    const affectedCarIds = createdAssignments.map(a => a.carId);
    const statusUpdateErrors: string[] = [];
    for (const carId of affectedCarIds) {
      try {
        await sstConsolidationService.updateCarShoppingStatus(carId);
      } catch (statusError) {
        const errorMsg = `Failed to update status for car ${carId}: ${statusError instanceof Error ? statusError.message : 'Unknown error'}`;
        logger.warn('Failed to update shopping status after bulk plan creation', {
          carId,
          error: statusError instanceof Error ? statusError.message : 'Unknown error',
        });
        statusUpdateErrors.push(errorMsg);
      }
    }

    if (statusUpdateErrors.length > 0) {
      logger.warn('Some shopping status updates failed after bulk plan creation', {
        totalAssignments: createdAssignments.length,
        statusUpdateErrors: statusUpdateErrors.length,
        errors: statusUpdateErrors.slice(0, 5),
      });
    }

    // Return in backward-compatible format
    const formattedPlans = createdAssignments.map(a => ({
      id: a.id,
      carId: a.carId,
      shopId: a.shopId,
      plannedMonth: a.plannedMonth,
      plannedYear: a.plannedYear,
      status: a.status === 'PENDING_REVIEW' ? 'Planned' : a.status,
      source: a.sourceType,
      shopReason: a.shopReason,
      notes: a.notes,
      car: a.car,
      shop: a.shop,
    }));

    res.json({
      success: true,
      message: `Created ${createdAssignments.length} assignments`,
      plansCreated: createdAssignments.length,
      plans: formattedPlans,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (error) {
    logger.error('Failed to bulk create car flow plans', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * PATCH /car-flow/plans/:id/cancel
 * Cancel a car flow plan
 * SST: Updates UnifiedAssignment status to CANCELLED (single source of truth)
 */
router.patch('/plans/:id/cancel', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    const companyId = req.user!.companyId;

    // SST: Look up assignment in UnifiedAssignment (the SST)
    const existingAssignment = await prisma.unifiedAssignment.findFirst({
      where: { id, companyId },
      include: {
        car: { select: { id: true, railcarNumber: true, carType: true, customer: true } },
        shop: { select: { id: true, name: true, code: true } },
      },
    });

    if (!existingAssignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    if (existingAssignment.status === 'CANCELLED') {
      return res.status(400).json({ message: 'Assignment is already cancelled' });
    }

    if (existingAssignment.status === 'COMPLETED') {
      return res.status(400).json({ message: 'Cannot cancel completed assignment' });
    }

    // SST: Update UnifiedAssignment status to CANCELLED
    const updatedAssignment = await prisma.unifiedAssignment.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledById: req.user!.id,
      },
      include: {
        car: {
          select: {
            id: true,
            railcarNumber: true,
            carType: true,
            customer: true,
          },
        },
        shop: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    logger.info('SST assignment cancelled', {
      assignmentId: id,
      carId: updatedAssignment.carId,
    });

    // SST: Update derived shopping status (assignment cancelled = recalculate urgency)
    try {
      await sstConsolidationService.updateCarShoppingStatus(existingAssignment.carId);
    } catch (statusError) {
      // Log but don't fail - the cancellation was successful
      logger.warn('Failed to update shopping status after assignment cancellation', {
        carId: existingAssignment.carId,
        assignmentId: id,
        error: statusError instanceof Error ? statusError.message : 'Unknown error',
      });
    }

    // Return in backward-compatible format
    res.json({
      id: updatedAssignment.id,
      carId: updatedAssignment.carId,
      shopId: updatedAssignment.shopId,
      plannedMonth: updatedAssignment.plannedMonth,
      plannedYear: updatedAssignment.plannedYear,
      status: 'Cancelled',
      source: updatedAssignment.sourceType,
      shopReason: updatedAssignment.shopReason,
      notes: updatedAssignment.notes,
      car: updatedAssignment.car,
      shop: updatedAssignment.shop,
    });
  } catch (error) {
    logger.error('Failed to cancel car flow plan', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * PATCH /car-flow/plans/:id/confirm
 * Confirm assignment (status: PENDING_REVIEW → COMMITTED)
 * SST: Updates UnifiedAssignment status (single source of truth)
 */
router.patch('/plans/:id/confirm', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    const companyId = req.user!.companyId;

    // SST: Look up assignment in UnifiedAssignment (the SST)
    const existingAssignment = await prisma.unifiedAssignment.findFirst({
      where: { id, companyId },
    });

    if (!existingAssignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    if (existingAssignment.status !== 'PENDING_REVIEW' && existingAssignment.status !== 'DRAFT') {
      return res.status(400).json({ message: `Cannot confirm assignment with status: ${existingAssignment.status}` });
    }

    // SST: Update UnifiedAssignment status to COMMITTED
    const updatedAssignment = await prisma.unifiedAssignment.update({
      where: { id },
      data: {
        status: 'COMMITTED',
        committedAt: new Date(),
        committedById: req.user!.id,
      },
      include: {
        car: { select: { id: true, railcarNumber: true, carType: true, customer: true } },
        shop: { select: { id: true, name: true, code: true } },
      },
    });

    logger.info('SST assignment confirmed', {
      assignmentId: id,
      carId: updatedAssignment.carId,
    });

    // Return in backward-compatible format
    res.json({
      id: updatedAssignment.id,
      carId: updatedAssignment.carId,
      shopId: updatedAssignment.shopId,
      plannedMonth: updatedAssignment.plannedMonth,
      plannedYear: updatedAssignment.plannedYear,
      status: 'Confirmed',
      source: updatedAssignment.sourceType,
      shopReason: updatedAssignment.shopReason,
      notes: updatedAssignment.notes,
      car: updatedAssignment.car,
      shop: updatedAssignment.shop,
    });
  } catch (error) {
    logger.error('Failed to confirm car flow plan', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * POST /car-flow/plans/:id/schedule
 * Schedule assignment (COMMITTED → IN_PROGRESS)
 * SST: Updates UnifiedAssignment status (single source of truth)
 */
router.post('/plans/:id/schedule', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    const companyId = req.user!.companyId;

    // SST: Look up assignment in UnifiedAssignment (the SST)
    const existingAssignment = await prisma.unifiedAssignment.findFirst({
      where: { id, companyId },
      include: { car: { select: { railcarNumber: true } } },
    });

    if (!existingAssignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    if (existingAssignment.status !== 'COMMITTED') {
      return res.status(400).json({
        message: `Assignment must be COMMITTED to schedule. Current status: ${existingAssignment.status}`,
      });
    }

    // SST: Update UnifiedAssignment status to IN_PROGRESS
    const updatedAssignment = await prisma.unifiedAssignment.update({
      where: { id },
      data: {
        status: 'IN_PROGRESS',
        scheduledAt: new Date(),
      },
      include: {
        car: { select: { id: true, railcarNumber: true, carType: true, customer: true } },
        shop: { select: { id: true, name: true, code: true } },
      },
    });

    logger.info('SST assignment scheduled', {
      assignmentId: id,
      carId: existingAssignment.carId,
      railcarNumber: existingAssignment.car?.railcarNumber,
    });

    res.json({
      success: true,
      message: 'Assignment scheduled',
      assignmentId: id,
      status: 'IN_PROGRESS',
      car: updatedAssignment.car,
      shop: updatedAssignment.shop,
    });
  } catch (error) {
    logger.error('Failed to schedule assignment', error);
    res.status(500).json({
      message: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * POST /car-flow/plans/bulk-schedule
 * Bulk schedule multiple committed assignments
 * SST: Updates UnifiedAssignment status (single source of truth)
 */
router.post('/plans/bulk-schedule', async (req: AuthRequest, res: Response) => {
  const { planIds } = req.body as { planIds: string[] };

  if (!Array.isArray(planIds) || planIds.length === 0) {
    return res.status(400).json({ message: 'planIds must be a non-empty array' });
  }

  try {
    const companyId = req.user!.companyId;

    // SST: Verify all assignments exist and are committed
    const assignments = await prisma.unifiedAssignment.findMany({
      where: {
        id: { in: planIds },
        companyId,
      },
      include: { car: { select: { railcarNumber: true } } },
    });

    const assignmentMap = new Map(assignments.map(a => [a.id, a]));
    const notFound = planIds.filter(id => !assignmentMap.has(id));
    const notCommitted = assignments.filter(a => a.status !== 'COMMITTED');

    if (notFound.length > 0) {
      return res.status(400).json({
        message: 'Some assignments not found',
        notFoundIds: notFound,
      });
    }

    if (notCommitted.length > 0) {
      return res.status(400).json({
        message: 'All assignments must be COMMITTED to schedule',
        invalidAssignments: notCommitted.map(a => ({
          id: a.id,
          status: a.status,
          railcarNumber: a.car?.railcarNumber,
        })),
      });
    }

    // SST: Update all assignments to IN_PROGRESS
    const results: { assignmentId: string; status: string }[] = [];
    const errors: { assignmentId: string; error: string }[] = [];

    for (const assignmentId of planIds) {
      try {
        await prisma.unifiedAssignment.update({
          where: { id: assignmentId },
          data: {
            status: 'IN_PROGRESS',
            scheduledAt: new Date(),
          },
        });
        results.push({ assignmentId, status: 'IN_PROGRESS' });
      } catch (error) {
        errors.push({
          assignmentId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    logger.info('Bulk schedule completed', {
      total: planIds.length,
      scheduled: results.length,
      errors: errors.length,
    });

    res.json({
      success: errors.length === 0,
      message: `Scheduled ${results.length} of ${planIds.length} assignments`,
      scheduled: results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    logger.error('Failed to bulk schedule assignments', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// =============================================================================
// CAPACITY - Shop capacity by month
// =============================================================================

/**
 * GET /car-flow/capacity
 * Get capacity overview for shops
 */
router.get('/capacity', async (req: AuthRequest, res: Response) => {
  const { shopId, year, startMonth, endMonth } = req.query;

  try {
    const currentDate = new Date();
    const targetYear = year ? parseInt(year as string) : currentDate.getFullYear();
    const start = startMonth ? parseInt(startMonth as string) : 1;
    const end = endMonth ? parseInt(endMonth as string) : 12;

    // Get shops
    const shopWhere: Record<string, unknown> = {
      companyId: req.user!.companyId,
      isActive: true,
    };
    if (shopId) shopWhere.id = shopId as string;

    const shops = await prisma.shop.findMany({
      where: shopWhere,
      select: {
        id: true,
        name: true,
        code: true,
        capacity: true,
      },
      orderBy: { name: 'asc' },
    });

    // Get S&OP commitments for capacity
    const commitments = await prisma.sOPCommitment.findMany({
      where: {
        shopId: { in: shops.map(s => s.id) },
        year: targetYear,
        month: { gte: start, lte: end },
      },
    });

    const commitmentMap = new Map<string, number>();
    for (const c of commitments) {
      commitmentMap.set(`${c.shopId}-${c.year}-${c.month}`, c.committedVolume);
    }

    // Get scheduled plans
    const plans = await prisma.carFlowPlan.groupBy({
      by: ['shopId', 'plannedMonth', 'plannedYear'],
      where: {
        shopId: { in: shops.map(s => s.id) },
        plannedYear: targetYear,
        plannedMonth: { gte: start, lte: end },
        status: { in: ['Planned', 'InProgress'] },
      },
      _count: { id: true },
    });

    const planCountMap = new Map<string, number>();
    for (const p of plans) {
      planCountMap.set(`${p.shopId}-${p.plannedYear}-${p.plannedMonth}`, p._count.id);
    }

    // Build response
    let totalCapacity = 0;
    let totalScheduled = 0;

    const shopData = shops.map(shop => {
      const months = [];
      let shopTotalCapacity = 0;
      let shopTotalScheduled = 0;

      for (let month = start; month <= end; month++) {
        const key = `${shop.id}-${targetYear}-${month}`;
        const capacity = commitmentMap.get(key) || shop.capacity || 0;
        const scheduled = planCountMap.get(key) || 0;
        const available = Math.max(0, capacity - scheduled);
        const utilization = capacity > 0 ? Math.round((scheduled / capacity) * 100) : 0;

        months.push({
          month,
          year: targetYear,
          scheduled,
          available,
          utilization,
        });

        shopTotalCapacity += capacity;
        shopTotalScheduled += scheduled;
      }

      totalCapacity += shopTotalCapacity;
      totalScheduled += shopTotalScheduled;

      return {
        id: shop.id,
        name: shop.name,
        code: shop.code,
        capacity: shop.capacity || 0,
        months,
      };
    });

    res.json({
      shops: shopData,
      summary: {
        totalCapacity,
        totalScheduled,
        averageUtilization: totalCapacity > 0
          ? Math.round((totalScheduled / totalCapacity) * 100)
          : 0,
      },
    });
  } catch (error) {
    logger.error('Failed to get capacity', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// =============================================================================
// S&OP COMMITMENTS - Monthly volume commitments
// =============================================================================

/**
 * GET /car-flow/sop-commitments
 * List S&OP commitments
 */
router.get('/sop-commitments', async (req: AuthRequest, res: Response) => {
  const { year, shopId, networkId } = req.query;

  try {
    const where: Record<string, unknown> = {
      shop: { companyId: req.user!.companyId },
    };

    if (year) where.year = parseInt(year as string);
    if (shopId) where.shopId = shopId as string;
    if (networkId) {
      where.shop = {
        ...where.shop as object,
        networkId: networkId as string,
      };
    }

    const commitments = await prisma.sOPCommitment.findMany({
      where,
      include: {
        shop: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: [
        { year: 'asc' },
        { month: 'asc' },
      ],
    });

    res.json(commitments);
  } catch (error) {
    logger.error('Failed to list S&OP commitments', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * POST /car-flow/sop-commitments
 * Create or update a single S&OP commitment
 */
router.post('/sop-commitments', async (req: AuthRequest, res: Response) => {
  const { shopId, year, month, committedVolume } = req.body;

  try {
    // Validate shop belongs to company
    const shop = await prisma.shop.findFirst({
      where: { id: shopId, companyId: req.user!.companyId },
    });

    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    // Upsert the commitment
    const commitment = await prisma.sOPCommitment.upsert({
      where: {
        shopId_year_month: { shopId, year, month },
      },
      create: {
        shopId,
        year,
        month,
        committedVolume,
        companyId: req.user!.companyId,
        committedById: req.user!.id,
        updatedById: req.user!.id,
      },
      update: {
        committedVolume,
        updatedById: req.user!.id,
      },
      include: {
        shop: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    res.json(commitment);
  } catch (error) {
    logger.error('Failed to upsert S&OP commitment', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * POST /car-flow/sop-commitments/batch
 * Batch update S&OP commitments
 */
router.post('/sop-commitments/batch', async (req: AuthRequest, res: Response) => {
  const { commitments } = req.body as {
    commitments: Array<{
      shopId: string;
      year: number;
      month: number;
      committedVolume: number;
    }>;
  };

  if (!Array.isArray(commitments) || commitments.length === 0) {
    return res.status(400).json({ message: 'commitments must be a non-empty array' });
  }

  try {
    const companyId = req.user!.companyId;
    const shopIds = [...new Set(commitments.map(c => c.shopId))];

    // Validate all shops belong to company
    const shops = await prisma.shop.findMany({
      where: { id: { in: shopIds }, companyId },
      select: { id: true },
    });

    const validShopIds = new Set(shops.map(s => s.id));
    const invalidShops = shopIds.filter(id => !validShopIds.has(id));

    if (invalidShops.length > 0) {
      return res.status(400).json({
        message: 'Some shops not found',
        invalidShops,
      });
    }

    // Batch upsert using transaction
    const results = await prisma.$transaction(
      commitments.map(c =>
        prisma.sOPCommitment.upsert({
          where: {
            shopId_year_month: {
              shopId: c.shopId,
              year: c.year,
              month: c.month,
            },
          },
          create: {
            shopId: c.shopId,
            year: c.year,
            month: c.month,
            committedVolume: c.committedVolume,
            companyId,
            committedById: req.user!.id,
            updatedById: req.user!.id,
          },
          update: {
            committedVolume: c.committedVolume,
            updatedById: req.user!.id,
          },
        })
      )
    );

    res.json({ updated: results.length });
  } catch (error) {
    logger.error('Failed to batch update S&OP commitments', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// =============================================================================
// SHOPPING STATUS - Car urgency tracking
// =============================================================================

/**
 * GET /car-flow/shopping-status/stats
 * Get shopping status statistics
 */
router.get('/shopping-status/stats', async (req: AuthRequest, res: Response) => {
  try {
    const companyId = req.user!.companyId;

    // Get counts by shopping status
    const stats = await prisma.car.groupBy({
      by: ['shoppingStatus'],
      where: { companyId },
      _count: { id: true },
    });

    const result = {
      total: 0,
      urgent: 0,
      mustShop: 0,
      upcoming: 0,
      compliant: 0,
      unknown: 0,
    };

    for (const stat of stats) {
      const count = stat._count.id;
      result.total += count;

      switch (stat.shoppingStatus) {
        case 'Urgent':
          result.urgent = count;
          break;
        case 'Must Shop':
        case 'MustShop':
          result.mustShop = count;
          break;
        case 'Upcoming':
          result.upcoming = count;
          break;
        case 'Compliant':
          result.compliant = count;
          break;
        default:
          result.unknown += count;
      }
    }

    res.json(result);
  } catch (error) {
    logger.error('Failed to get shopping status stats', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * POST /car-flow/shopping-status/recalculate
 * Recalculate shopping status for cars using SST-derived algorithm
 *
 * Uses sstConsolidationService.batchUpdateShoppingStatus() which:
 * - Derives status from CarFlowPlan existence + Car.status + nextServiceDue
 * - Ensures consistent status calculation across the application
 */
router.post('/shopping-status/recalculate', async (req: AuthRequest, res: Response) => {
  const { carIds } = req.body as { carIds?: string[] };

  try {
    const companyId = req.user!.companyId;

    if (carIds && carIds.length > 0) {
      // Update specific cars
      let updated = 0;
      for (const carId of carIds) {
        try {
          await sstConsolidationService.updateCarShoppingStatus(carId);
          updated++;
        } catch {
          // Car may not exist or not belong to company, skip
        }
      }
      res.json({
        message: `Recalculated shopping status for ${updated} cars`,
        processed: carIds.length,
        updated,
      });
    } else {
      // Batch update all cars in company
      const result = await sstConsolidationService.batchUpdateShoppingStatus(companyId);
      res.json({
        message: `Recalculated shopping status for ${result.updated} cars`,
        ...result,
      });
    }
  } catch (error) {
    logger.error('Failed to recalculate shopping status', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
