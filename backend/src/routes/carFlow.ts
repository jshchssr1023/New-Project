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
 */
router.post('/plans', async (req: AuthRequest, res: Response) => {
  const { carId, shopId, plannedMonth, plannedYear, shopReason, notes } = req.body;

  try {
    // Validate car belongs to company
    const car = await prisma.car.findFirst({
      where: { id: carId, companyId: req.user!.companyId },
    });

    if (!car) {
      return res.status(404).json({ message: 'Car not found' });
    }

    // Validate shop belongs to company
    const shop = await prisma.shop.findFirst({
      where: { id: shopId, companyId: req.user!.companyId },
    });

    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    // Check for existing active plan
    const existingPlan = await prisma.carFlowPlan.findFirst({
      where: {
        carId,
        status: { in: ['Planned', 'InProgress'] },
      },
    });

    if (existingPlan) {
      return res.status(409).json({
        message: 'Car already has an active plan',
        existingPlan,
      });
    }

    const plan = await prisma.carFlowPlan.create({
      data: {
        carId,
        shopId,
        plannedMonth,
        plannedYear,
        status: 'Planned',
        source: 'manual',
        shopReason: shopReason || null,
        notes: notes || null,
        committedById: req.user!.id,
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

    // SST: Update derived shopping status
    try {
      await sstConsolidationService.updateCarShoppingStatus(carId);
    } catch (statusError) {
      // Log but don't fail the request - the plan was created successfully
      logger.warn('Failed to update shopping status after plan creation', {
        carId,
        planId: plan.id,
        error: statusError instanceof Error ? statusError.message : 'Unknown error',
      });
    }

    res.status(201).json(plan);
  } catch (error) {
    logger.error('Failed to create car flow plan', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * POST /car-flow/plans/bulk
 * Bulk create car flow plans with conflict detection
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

    // Check for existing active plans (conflicts)
    const existingPlans = await prisma.carFlowPlan.findMany({
      where: {
        carId: { in: carIds },
        status: { in: ['Planned', 'InProgress'] },
      },
      include: {
        car: { select: { railcarNumber: true } },
        shop: { select: { name: true } },
      },
    });

    const conflicts: BulkPlanConflict[] = existingPlans.map(plan => ({
      carId: plan.carId,
      railcarNumber: plan.car?.railcarNumber || 'Unknown',
      existingShop: plan.shop?.name || 'Unknown',
      existingMonth: `${plan.plannedMonth}/${plan.plannedYear}`,
      status: plan.status,
    }));

    // If conflicts exist and not overriding, return conflicts
    if (conflicts.length > 0 && !overrideConflicts) {
      return res.json({
        success: false,
        message: `${conflicts.length} cars already have active plans`,
        conflicts,
        allowOverride: true,
      });
    }

    // Cancel existing plans if overriding
    if (conflicts.length > 0 && overrideConflicts) {
      await prisma.carFlowPlan.updateMany({
        where: {
          carId: { in: conflicts.map(c => c.carId) },
          status: { in: ['Planned', 'InProgress'] },
        },
        data: { status: 'Cancelled' },
      });
    }

    // Check S&OP capacity warnings
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

        const currentPlans = await prisma.carFlowPlan.count({
          where: {
            shopId,
            plannedYear: year,
            plannedMonth: month,
            status: { in: ['Planned', 'InProgress'] },
          },
        });

        const totalUsage = currentPlans + carsInMonth;
        if (totalUsage > commitment.committedVolume) {
          warnings.push({
            shopId,
            shopName: commitment.shop?.name || 'Unknown',
            month: `${month}/${year}`,
            currentUsage: currentPlans,
            capacity: commitment.committedVolume,
            carCount: carsInMonth,
          });
        }
      }
    }

    // Create all plans
    const createdPlans = await prisma.$transaction(
      assignments.map(assignment =>
        prisma.carFlowPlan.create({
          data: {
            carId: assignment.carId,
            shopId: assignment.shopId,
            plannedMonth: assignment.plannedMonth,
            plannedYear: assignment.plannedYear,
            status: 'Planned',
            source: 'bulk',
            shopReason: assignment.shopReason || null,
            notes: assignment.notes || null,
            committedById: req.user!.id,
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

    // SST: Update derived shopping status for all affected cars
    const affectedCarIds = createdPlans.map(p => p.carId);
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
        totalPlans: createdPlans.length,
        statusUpdateErrors: statusUpdateErrors.length,
        errors: statusUpdateErrors.slice(0, 5),
      });
    }

    res.json({
      success: true,
      message: `Created ${createdPlans.length} plans`,
      plansCreated: createdPlans.length,
      plans: createdPlans,
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
 */
router.patch('/plans/:id/cancel', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    // Verify plan exists and belongs to company
    const existingPlan = await prisma.carFlowPlan.findFirst({
      where: { id },
      include: {
        car: { select: { companyId: true } },
      },
    });

    if (!existingPlan || existingPlan.car?.companyId !== req.user!.companyId) {
      return res.status(404).json({ message: 'Plan not found' });
    }

    if (existingPlan.status === 'Cancelled') {
      return res.status(400).json({ message: 'Plan is already cancelled' });
    }

    if (existingPlan.status === 'Complete') {
      return res.status(400).json({ message: 'Cannot cancel completed plan' });
    }

    const plan = await prisma.carFlowPlan.update({
      where: { id },
      data: { status: 'Cancelled' },
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

    // SST: Update derived shopping status (plan cancelled = recalculate urgency)
    try {
      await sstConsolidationService.updateCarShoppingStatus(existingPlan.carId);
    } catch (statusError) {
      // Log but don't fail - the plan cancellation was successful
      logger.warn('Failed to update shopping status after plan cancellation', {
        carId: existingPlan.carId,
        planId: plan.id,
        error: statusError instanceof Error ? statusError.message : 'Unknown error',
      });
    }

    res.json(plan);
  } catch (error) {
    logger.error('Failed to cancel car flow plan', error);
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
