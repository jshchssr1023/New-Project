/**
 * sopRoutes.ts - S&OP Scheduler API Routes
 *
 * REST API endpoints for the Chronos S&OP Scheduler including:
 * - Scenario management (CRUD, clone, compare)
 * - Shop assignment operations
 * - Capacity checking and shop queries
 *
 * @author AITX Chronos Team
 * @version 1.0.0
 */

import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import { ScenarioService, createScenarioService } from '../services/scenarioService';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get ScenarioService instance from request
 */
function getScenarioService(req: AuthRequest): ScenarioService {
  const prisma: PrismaClient = req.app.locals.prisma;
  return createScenarioService(prisma);
}

// =============================================================================
// SCENARIO ROUTES
// =============================================================================

/**
 * POST /api/sop/scenarios - Create a new scenario
 */
router.post('/scenarios', async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, projectNumber, isBaseline } = req.body;

    if (!name) {
      res.status(400).json({ message: 'Scenario name is required' });
      return;
    }

    const service = getScenarioService(req);
    const scenario = await service.createScenario({
      name,
      description,
      projectNumber,
      isBaseline,
      companyId: req.user!.companyId,
      createdBy: req.user!.id,
    });

    res.status(201).json(scenario);
  } catch (error: any) {
    console.error('Create scenario error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/sop/scenarios - List all scenarios
 */
router.get('/scenarios', async (req: AuthRequest, res: Response) => {
  try {
    const service = getScenarioService(req);
    const scenarios = await service.listScenarios(req.user!.companyId);
    res.json(scenarios);
  } catch (error: any) {
    console.error('List scenarios error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/sop/scenarios/:id - Get scenario details with assignments
 */
router.get('/scenarios/:id', async (req: AuthRequest, res: Response) => {
  try {
    const service = getScenarioService(req);
    const scenario = await service.getScenario(req.params.id);

    if (!scenario) {
      res.status(404).json({ message: 'Scenario not found' });
      return;
    }

    res.json(scenario);
  } catch (error: any) {
    console.error('Get scenario error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

/**
 * POST /api/sop/scenarios/:id/clone - Clone a scenario
 */
router.post('/scenarios/:id/clone', async (req: AuthRequest, res: Response) => {
  try {
    const { name } = req.body;

    if (!name) {
      res.status(400).json({ message: 'New scenario name is required' });
      return;
    }

    const service = getScenarioService(req);
    const cloned = await service.cloneScenario(req.params.id, name, req.user!.id);

    res.status(201).json(cloned);
  } catch (error: any) {
    console.error('Clone scenario error:', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

/**
 * DELETE /api/sop/scenarios/:id - Delete a scenario
 */
router.delete('/scenarios/:id', async (req: AuthRequest, res: Response) => {
  try {
    const service = getScenarioService(req);
    await service.deleteScenario(req.params.id);
    res.status(204).send();
  } catch (error: any) {
    console.error('Delete scenario error:', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
      return;
    }
    if (error.message.includes('clones')) {
      res.status(400).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/sop/scenarios/compare - Compare two scenarios
 */
router.get('/scenarios/compare', async (req: AuthRequest, res: Response) => {
  try {
    const { a, b } = req.query;

    if (!a || !b) {
      res.status(400).json({ message: 'Both scenario IDs (a and b) are required' });
      return;
    }

    const service = getScenarioService(req);
    const comparison = await service.compareScenarios(a as string, b as string);

    res.json(comparison);
  } catch (error: any) {
    console.error('Compare scenarios error:', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

// =============================================================================
// ASSIGNMENT ROUTES
// =============================================================================

/**
 * POST /api/sop/scenarios/:id/assignments - Add car assignment to scenario
 */
router.post('/scenarios/:id/assignments', async (req: AuthRequest, res: Response) => {
  try {
    const { carId, shopId, workTypes, monthKey, estimatedCost, estimatedDays, priority, notes } =
      req.body;

    if (!carId || !shopId || !monthKey) {
      res.status(400).json({ message: 'carId, shopId, and monthKey are required' });
      return;
    }

    const service = getScenarioService(req);
    const assignment = await service.addAssignment(req.params.id, carId, shopId, {
      workTypes: workTypes || ['qualification'],
      monthKey,
      estimatedCost,
      estimatedDays,
      priority,
      notes,
    });

    res.status(201).json(assignment);
  } catch (error: any) {
    console.error('Add assignment error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/sop/scenarios/:id/assignments - Get all assignments for a scenario
 */
router.get('/scenarios/:id/assignments', async (req: AuthRequest, res: Response) => {
  try {
    const service = getScenarioService(req);
    const assignments = await service.getAssignments(req.params.id);
    res.json(assignments);
  } catch (error: any) {
    console.error('Get assignments error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

/**
 * PUT /api/sop/scenarios/:id/assignments/:aid - Update assignment
 */
router.put('/scenarios/:id/assignments/:aid', async (req: AuthRequest, res: Response) => {
  try {
    const {
      shopId,
      workTypes,
      monthKey,
      status,
      scheduledArrival,
      scheduledCompletion,
      estimatedCost,
      estimatedDays,
      priority,
      notes,
    } = req.body;

    const service = getScenarioService(req);
    const assignment = await service.updateAssignment(req.params.aid, {
      shopId,
      workTypes,
      monthKey,
      status,
      scheduledArrival: scheduledArrival ? new Date(scheduledArrival) : undefined,
      scheduledCompletion: scheduledCompletion ? new Date(scheduledCompletion) : undefined,
      estimatedCost,
      estimatedDays,
      priority,
      notes,
    });

    res.json(assignment);
  } catch (error: any) {
    console.error('Update assignment error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

/**
 * DELETE /api/sop/scenarios/:id/assignments/:aid - Remove assignment
 */
router.delete('/scenarios/:id/assignments/:aid', async (req: AuthRequest, res: Response) => {
  try {
    const service = getScenarioService(req);
    await service.removeAssignment(req.params.aid);
    res.status(204).send();
  } catch (error: any) {
    console.error('Remove assignment error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

// =============================================================================
// SHOP ROUTES
// =============================================================================

/**
 * GET /api/sop/shops - List all shops with capacity
 */
router.get('/shops', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;

  try {
    const shops = await prisma.shop.findMany({
      where: {
        companyId: req.user!.companyId,
        isActive: true,
      },
      select: {
        id: true,
        code: true,
        name: true,
        location: true,
        region: true,
        network: true,
        capacity: true,
        qualCapacity: true,
        assignCapacity: true,
        returnCapacity: true,
        repairCapacity: true,
        efficiencyRating: true,
        isAitxInternal: true,
        tankQualified: true,
        baseCostPerCar: true,
        baseTurnTime: true,
      },
      orderBy: { name: 'asc' },
    });

    res.json(shops);
  } catch (error: any) {
    console.error('List shops error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/sop/shops/:id/capacity - Get shop capacity for a month
 */
router.get('/shops/:id/capacity', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
  const { month } = req.query;

  try {
    const shop = await prisma.shop.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
    });

    if (!shop) {
      res.status(404).json({ message: 'Shop not found' });
      return;
    }

    // Get capacity slots for this month
    const slots = await prisma.shopCapacitySlot.findMany({
      where: {
        shopId: shop.id,
        monthKey: month as string,
      },
    });

    // Get current assignments for this shop/month
    const assignmentCount = await prisma.sOPAssignment.count({
      where: {
        shopId: shop.id,
        monthKey: month as string,
        status: { in: ['DRAFT', 'PLANNED', 'SCHEDULED', 'IN_PROGRESS'] },
      },
    });

    // Build capacity response
    const capacityByType: Record<string, { total: number; used: number; available: number }> = {
      qualification: {
        total: shop.qualCapacity,
        used: 0,
        available: shop.qualCapacity,
      },
      assignment: {
        total: shop.assignCapacity,
        used: 0,
        available: shop.assignCapacity,
      },
      return: {
        total: shop.returnCapacity,
        used: 0,
        available: shop.returnCapacity,
      },
      repair: {
        total: shop.repairCapacity,
        used: 0,
        available: shop.repairCapacity,
      },
    };

    // Update with slot data if available
    slots.forEach((slot) => {
      if (capacityByType[slot.slotType]) {
        capacityByType[slot.slotType].used = slot.used;
        capacityByType[slot.slotType].available = slot.capacity - slot.used;
      }
    });

    res.json({
      shopId: shop.id,
      shopName: shop.name,
      monthKey: month,
      totalCapacity: shop.capacity,
      currentLoad: assignmentCount,
      availableCapacity: shop.capacity - assignmentCount,
      utilizationPercent: Math.round((assignmentCount / shop.capacity) * 100),
      byType: capacityByType,
    });
  } catch (error: any) {
    console.error('Get shop capacity error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

// =============================================================================
// CAPACITY CHECK ROUTE
// =============================================================================

/**
 * POST /api/sop/capacity-check - Run capacity pre-check for a project
 */
router.post('/capacity-check', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
  const { carIds, targetShops, startMonth, flowRatePerWeek } = req.body;

  if (!carIds || !Array.isArray(carIds) || carIds.length === 0) {
    res.status(400).json({ message: 'carIds array is required' });
    return;
  }

  if (!targetShops || !Array.isArray(targetShops) || targetShops.length === 0) {
    res.status(400).json({ message: 'targetShops array is required' });
    return;
  }

  if (!startMonth) {
    res.status(400).json({ message: 'startMonth is required (YYYY-MM format)' });
    return;
  }

  try {
    // Get shop capacities
    const shops = await prisma.shop.findMany({
      where: {
        id: { in: targetShops },
        companyId: req.user!.companyId,
        isActive: true,
      },
    });

    if (shops.length === 0) {
      res.status(404).json({ message: 'No valid shops found' });
      return;
    }

    // Calculate flow
    const carsPerMonth = (flowRatePerWeek || 2) * 4;
    const totalCars = carIds.length;
    const monthsNeeded = Math.ceil(totalCars / carsPerMonth);

    // Simulate capacity allocation
    const monthlyBreakdown: {
      monthKey: string;
      carsScheduled: number;
      totalCapacity: number;
      available: number;
      isOverloaded: boolean;
    }[] = [];

    const overloadedShops: {
      shopId: string;
      shopName: string;
      monthKey: string;
      capacity: number;
      projected: number;
      overload: number;
    }[] = [];

    let carsScheduled = 0;
    let currentMonth = startMonth;
    let firstOverloadMonth: string | null = null;
    let totalBacklog = 0;

    for (let i = 0; i < monthsNeeded && carsScheduled < totalCars; i++) {
      const carsThisMonth = Math.min(carsPerMonth, totalCars - carsScheduled);
      let allocated = 0;
      let monthCapacity = 0;

      for (const shop of shops) {
        monthCapacity += shop.qualCapacity;
        const canAllocate = Math.min(shop.qualCapacity, carsThisMonth - allocated);
        allocated += canAllocate;

        if (carsThisMonth > allocated && canAllocate === shop.qualCapacity) {
          if (!firstOverloadMonth) {
            firstOverloadMonth = currentMonth;
          }
          overloadedShops.push({
            shopId: shop.id,
            shopName: shop.name,
            monthKey: currentMonth,
            capacity: shop.qualCapacity,
            projected: carsThisMonth,
            overload: carsThisMonth - allocated,
          });
        }
      }

      const backlog = Math.max(0, carsThisMonth - allocated);
      totalBacklog += backlog;

      monthlyBreakdown.push({
        monthKey: currentMonth,
        carsScheduled: allocated,
        totalCapacity: monthCapacity,
        available: monthCapacity - allocated,
        isOverloaded: backlog > 0,
      });

      carsScheduled += allocated;

      // Advance to next month
      const [year, month] = currentMonth.split('-').map(Number);
      const nextDate = new Date(year, month, 1);
      currentMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
    }

    const passed = firstOverloadMonth === null;

    res.json({
      passed,
      firstOverloadMonth,
      totalBacklog,
      totalCars,
      monthsNeeded,
      monthlyBreakdown,
      overloadedShops,
      message: passed
        ? `All ${totalCars} cars can be scheduled within capacity constraints.`
        : `Capacity overload detected. First overload in ${firstOverloadMonth}. Total backlog: ${totalBacklog} cars.`,
    });
  } catch (error: any) {
    console.error('Capacity check error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

export default router;
