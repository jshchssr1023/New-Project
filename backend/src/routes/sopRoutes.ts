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
import { authenticate, AuthRequest } from '../middleware/auth';
import { ScenarioService, createScenarioService } from '../services/scenarioService';
import { DEFAULT_PRIORITY } from '../constants/defaults';

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
  const prisma: any = req.app.locals.prisma;
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
    // SECURITY: Pass companyId to verify ownership
    const scenario = await service.getScenario(req.params.id, req.user!.companyId);

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
    // SECURITY: Pass companyId to verify ownership
    const cloned = await service.cloneScenario(req.params.id, name, req.user!.id, req.user!.companyId);

    res.status(201).json(cloned);
  } catch (error: any) {
    console.error('Clone scenario error:', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
      return;
    }
    if (error.message.includes('Access denied')) {
      res.status(403).json({ message: error.message });
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
    // SECURITY: Pass companyId to verify ownership
    await service.deleteScenario(req.params.id, req.user!.companyId);
    res.status(204).send();
  } catch (error: any) {
    console.error('Delete scenario error:', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
      return;
    }
    if (error.message.includes('Access denied')) {
      res.status(403).json({ message: error.message });
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
    // SECURITY: Pass companyId to verify ownership of both scenarios
    const comparison = await service.compareScenarios(a as string, b as string, req.user!.companyId);

    res.json(comparison);
  } catch (error: any) {
    console.error('Compare scenarios error:', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
      return;
    }
    if (error.message.includes('Access denied')) {
      res.status(403).json({ message: error.message });
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
  const prisma: any = req.app.locals.prisma;

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
  const prisma: any = req.app.locals.prisma;
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
  const prisma: any = req.app.locals.prisma;
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

      // Advance to next month (month is 1-indexed from split, but Date constructor expects 0-indexed)
      const [year, month] = currentMonth.split('-').map(Number);
      // Subtract 1 from month to convert to 0-indexed, then add 1 to get next month
      const nextDate = new Date(year, month, 1); // month (1-indexed) becomes next month in 0-indexed Date
      // The above is correct because: month=3 (March in YYYY-03) -> Date(year, 3, 1) = April 1st
      // Then getMonth() returns 3 (April in 0-indexed), +1 = 4, which is wrong for "next month after March"
      // FIX: Use month-1 to get current month, then advance properly
      const currentDate = new Date(year, month - 1, 1); // Correct: month-1 for 0-indexed
      currentDate.setMonth(currentDate.getMonth() + 1); // Advance by 1 month
      currentMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
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

// =============================================================================
// S&OP MONTHLY ALLOCATION ROUTES
// =============================================================================

/**
 * GET /api/sop/allocations - Get saved S&OP monthly allocations
 */
router.get('/allocations', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

  try {
    // Get all SOPAssignments grouped by shop and month
    const assignments = await prisma.sOPAssignment.findMany({
      where: {
        scenario: {
          companyId: req.user!.companyId,
          isBaseline: true, // Only get baseline scenario allocations
        },
      },
      include: {
        shop: {
          select: {
            id: true,
            name: true,
            code: true,
            isAitxInternal: true,
            qualCapacity: true,
          },
        },
      },
    });

    // Build allocation map by shop and month
    const allocationMap: Record<string, Record<string, number>> = {};

    assignments.forEach((assignment) => {
      const shopId = assignment.shopId;
      const monthKey = assignment.monthKey;

      if (!allocationMap[shopId]) {
        allocationMap[shopId] = {};
      }
      allocationMap[shopId][monthKey] = (allocationMap[shopId][monthKey] || 0) + 1;
    });

    res.json({
      allocations: allocationMap,
      lastUpdated: assignments.length > 0
        ? Math.max(...assignments.map(a => a.updatedAt.getTime()))
        : null,
    });
  } catch (error: any) {
    console.error('Get allocations error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

/**
 * POST /api/sop/allocations - Save S&OP monthly allocations
 *
 * This endpoint saves the S&OP allocation plan by creating SOPAssignment records.
 * It creates a baseline scenario if one doesn't exist.
 */
router.post('/allocations', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const { allocations, shopCapacities } = req.body;

  // allocations format: { monthKey: { shopId: numberOfCars } }
  // shopCapacities format: { shopId: { monthlyCapacity: number, isAITX: boolean } }

  if (!allocations || typeof allocations !== 'object') {
    res.status(400).json({ message: 'allocations object is required' });
    return;
  }

  try {
    // Get or create baseline scenario for S&OP allocations
    let baselineScenario = await prisma.scenario.findFirst({
      where: {
        companyId: req.user!.companyId,
        isBaseline: true,
        name: 'S&OP Baseline',
      },
    });

    if (!baselineScenario) {
      baselineScenario = await prisma.scenario.create({
        data: {
          projectNumber: `SOP-${new Date().getFullYear()}`,
          name: 'S&OP Baseline',
          description: 'Baseline S&OP allocation scenario for 18-month planning',
          isBaseline: true,
          status: 'active',
          companyId: req.user!.companyId,
          createdBy: req.user!.id,
        },
      });
    }

    // Get all available cars for allocation
    const availableCars = await prisma.car.findMany({
      where: {
        companyId: req.user!.companyId,
        status: { in: ['available', 'scheduled'] },
      },
      orderBy: { railcarNumber: 'asc' },
    });

    // Clear existing allocations for this scenario
    await prisma.sOPAssignment.deleteMany({
      where: { scenarioId: baselineScenario.id },
    });

    // Create new allocations
    const createdAssignments: any[] = [];
    const errors: { monthKey: string; shopId: string; error: string }[] = [];
    let carIndex = 0;

    // Process allocations by month
    for (const [monthKey, shopAllocations] of Object.entries(allocations)) {
      if (!shopAllocations || typeof shopAllocations !== 'object') continue;

      for (const [shopId, carCount] of Object.entries(shopAllocations as Record<string, number>)) {
        const count = Number(carCount);
        if (isNaN(count) || count <= 0) continue;

        // Verify shop exists
        const shop = await prisma.shop.findFirst({
          where: {
            id: shopId,
            companyId: req.user!.companyId,
          },
        });

        if (!shop) {
          errors.push({ monthKey, shopId, error: 'Shop not found' });
          continue;
        }

        // Create allocation records
        for (let i = 0; i < count && carIndex < availableCars.length; i++) {
          const car = availableCars[carIndex++];

          try {
            const assignment = await prisma.sOPAssignment.create({
              data: {
                scenarioId: baselineScenario.id,
                carId: car.id,
                shopId: shop.id,
                workTypes: JSON.stringify(['qualification']),
                status: 'PLANNED',
                monthKey,
                priority: DEFAULT_PRIORITY,
              },
            });
            createdAssignments.push(assignment);
          } catch (err: any) {
            errors.push({ monthKey, shopId, error: err.message });
          }
        }
      }
    }

    // Update shop capacity slots
    if (shopCapacities && typeof shopCapacities === 'object') {
      for (const [shopId, capacity] of Object.entries(shopCapacities as Record<string, { monthlyCapacity?: number }>)) {
        const monthlyCapacity = capacity?.monthlyCapacity;
        if (monthlyCapacity !== undefined) {
          // Update shop's qualification capacity
          await prisma.shop.update({
            where: { id: shopId },
            data: { qualCapacity: monthlyCapacity },
          }).catch(() => {}); // Ignore errors if shop doesn't exist
        }
      }
    }

    // Emit WebSocket event
    const websocket = req.app.locals.websocket;
    if (websocket) {
      websocket.emitToCompany(req.user!.companyId, 'plan:updated', {
        scenarioId: baselineScenario.id,
        assignmentsCreated: createdAssignments.length,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      message: `Saved ${createdAssignments.length} allocations`,
      scenarioId: baselineScenario.id,
      created: createdAssignments.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Save allocations error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

/**
 * PUT /api/sop/allocations/capacity - Update shop capacities
 */
router.put('/allocations/capacity', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const { shopCapacities } = req.body;

  if (!shopCapacities || typeof shopCapacities !== 'object') {
    res.status(400).json({ message: 'shopCapacities object is required' });
    return;
  }

  try {
    const updatedShops: string[] = [];

    for (const [shopId, updates] of Object.entries(shopCapacities as Record<string, {
      qualCapacity?: number;
      assignCapacity?: number;
      returnCapacity?: number;
      repairCapacity?: number;
      utilizationTarget?: number;
    }>)) {
      try {
        await prisma.shop.updateMany({
          where: {
            id: shopId,
            companyId: req.user!.companyId,
          },
          data: {
            ...(updates.qualCapacity !== undefined && { qualCapacity: updates.qualCapacity }),
            ...(updates.assignCapacity !== undefined && { assignCapacity: updates.assignCapacity }),
            ...(updates.returnCapacity !== undefined && { returnCapacity: updates.returnCapacity }),
            ...(updates.repairCapacity !== undefined && { repairCapacity: updates.repairCapacity }),
            ...(updates.utilizationTarget !== undefined && { utilizationTarget: updates.utilizationTarget }),
          },
        });
        updatedShops.push(shopId);
      } catch (err) {
        console.error(`Failed to update shop ${shopId}:`, err);
      }
    }

    // Emit WebSocket event
    const websocket = req.app.locals.websocket;
    if (websocket) {
      websocket.emitToCompany(req.user!.companyId, 'shop:capacityChanged', {
        shopIds: updatedShops,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      message: `Updated ${updatedShops.length} shop capacities`,
      updatedShops,
    });
  } catch (error: any) {
    console.error('Update capacity error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

// =============================================================================
// DEMAND REGISTRY ROUTES
// =============================================================================

/**
 * GET /api/sop/demand-registry - Get demand registry data
 *
 * Returns all cars that are due based on:
 * - tankQualDueDate (qualifications due this year or rolling 3 months)
 * - contractExpiration (returns within 6-month horizon)
 * - reasonShopped = 'assignment' (pre-delivery prep)
 */
router.get('/demand-registry', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const { year, includeRolling3Months } = req.query;

  try {
    const filterYear = year ? parseInt(year as string) : new Date().getFullYear();
    const now = new Date();
    const yearEnd = new Date(filterYear, 11, 31, 23, 59, 59);
    const sixMonthsOut = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate());
    const rolling3MonthCutoff = includeRolling3Months !== 'false'
      ? new Date(now.getFullYear(), now.getMonth() + 3, now.getDate())
      : yearEnd;

    // Get cars with qualification due dates, contract expirations, or assignment reason
    const cars = await prisma.car.findMany({
      where: {
        companyId: req.user!.companyId,
        OR: [
          // Qualifications due this year or overdue
          {
            tankQualDueDate: {
              lte: rolling3MonthCutoff,
            },
          },
          // Returns in next 6 months
          {
            contractExpiration: {
              lte: sixMonthsOut,
            },
          },
          // Pre-delivery assignments
          {
            reasonsShopped: {
              contains: 'assignment',
              mode: 'insensitive',
            },
          },
        ],
        status: {
          notIn: ['retired', 'scrapped'],
        },
      },
      include: {
        assignedShop: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: [
        { tankQualDueDate: 'asc' },
        { contractExpiration: 'asc' },
      ],
    });

    // Build demand register items
    const items: {
      carId: string;
      railcarNumber: string;
      workType: string;
      dueDate: string | null;
      daysUntilDue: number;
      isOverdue: boolean;
      customer: string;
      commodity: string;
      isTankCar: boolean;
      planningState: string;
      assignedShopId: string | null;
      assignedShopName: string | null;
      scheduledMonth: string | null;
    }[] = [];

    const addedCarIds = new Set<string>();

    cars.forEach((car: any) => {
      // Process qualifications
      if (car.tankQualDueDate) {
        const qualDueDate = new Date(car.tankQualDueDate);
        const daysUntil = Math.floor((qualDueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const isInFilterYear = qualDueDate <= yearEnd;
        const isInRolling3Months = qualDueDate <= rolling3MonthCutoff;
        const isOverdue = daysUntil < 0;

        if (isInFilterYear || isInRolling3Months || isOverdue) {
          items.push({
            carId: car.id,
            railcarNumber: car.railcarNumber,
            workType: 'qualification',
            dueDate: car.tankQualDueDate?.toISOString() || null,
            daysUntilDue: daysUntil,
            isOverdue,
            customer: car.customer || '',
            commodity: car.commodity || '',
            isTankCar: car.isTankCar || false,
            planningState: car.status || 'not_planned',
            assignedShopId: car.assignedShopId,
            assignedShopName: car.assignedShop?.name || null,
            scheduledMonth: car.projectedCompletionMonth || null,
          });
          addedCarIds.add(car.id);
        }
      }

      // Process returns (lease expirations)
      if (car.contractExpiration && !addedCarIds.has(car.id)) {
        const leaseEndDate = new Date(car.contractExpiration);
        const daysUntil = Math.floor((leaseEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const isInHorizon = leaseEndDate <= sixMonthsOut;
        const isOverdue = daysUntil < 0;

        if (isInHorizon || isOverdue) {
          items.push({
            carId: car.id,
            railcarNumber: car.railcarNumber,
            workType: 'return',
            dueDate: car.contractExpiration?.toISOString() || null,
            daysUntilDue: daysUntil,
            isOverdue,
            customer: car.customer || '',
            commodity: car.commodity || '',
            isTankCar: car.isTankCar || false,
            planningState: car.status || 'not_planned',
            assignedShopId: car.assignedShopId,
            assignedShopName: car.assignedShop?.name || null,
            scheduledMonth: car.projectedCompletionMonth || null,
          });
          addedCarIds.add(car.id);
        }
      }

      // Process assignments
      if (car.reasonsShopped?.toLowerCase().includes('assignment') && !addedCarIds.has(car.id)) {
        const dueDate = car.nextServiceDue ? new Date(car.nextServiceDue) : now;
        const daysUntil = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        items.push({
          carId: car.id,
          railcarNumber: car.railcarNumber,
          workType: 'assignment',
          dueDate: car.nextServiceDue?.toISOString() || null,
          daysUntilDue: daysUntil,
          isOverdue: daysUntil < 0,
          customer: car.customer || '',
          commodity: car.commodity || '',
          isTankCar: car.isTankCar || false,
          planningState: car.status || 'not_planned',
          assignedShopId: car.assignedShopId,
          assignedShopName: car.assignedShop?.name || null,
          scheduledMonth: car.projectedCompletionMonth || null,
        });
      }
    });

    // Sort by overdue first, then by days until due
    items.sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      return a.daysUntilDue - b.daysUntilDue;
    });

    // Calculate summaries
    const summaries: Record<string, {
      total: number;
      overdue: number;
      notPlanned: number;
      planned: number;
      scheduled: number;
    }> = {
      qualification: { total: 0, overdue: 0, notPlanned: 0, planned: 0, scheduled: 0 },
      assignment: { total: 0, overdue: 0, notPlanned: 0, planned: 0, scheduled: 0 },
      return: { total: 0, overdue: 0, notPlanned: 0, planned: 0, scheduled: 0 },
    };

    items.forEach((item) => {
      const summary = summaries[item.workType];
      if (summary) {
        summary.total++;
        if (item.isOverdue) summary.overdue++;
        if (!item.assignedShopId) summary.notPlanned++;
        else if (item.planningState === 'scheduled') summary.scheduled++;
        else summary.planned++;
      }
    });

    res.json({
      items,
      summaries: Object.entries(summaries)
        .filter(([, s]) => s.total > 0)
        .map(([workType, stats]) => ({ workType, ...stats })),
      totalNotPlanned: items.filter((i) => !i.assignedShopId).length,
      totalPlanned: items.filter((i) => i.assignedShopId && i.planningState !== 'scheduled').length,
      totalScheduled: items.filter((i) => i.planningState === 'scheduled').length,
      totalOverdue: items.filter((i) => i.isOverdue).length,
      filterYear,
    });
  } catch (error: any) {
    console.error('Get demand registry error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/sop/system-metrics - Get system-wide S&OP metrics
 */
router.get('/system-metrics', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

  try {
    // Get car counts by status
    const carCounts = await prisma.car.groupBy({
      by: ['status'],
      where: {
        companyId: req.user!.companyId,
      },
      _count: true,
    });

    // Get shop capacities
    const shops = await prisma.shop.findMany({
      where: {
        companyId: req.user!.companyId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        isAitxInternal: true,
        capacity: true,
        qualCapacity: true,
      },
    });

    // Calculate AITX vs 3P capacity
    let aitxMonthly = 0;
    let thirdPartyMonthly = 0;

    shops.forEach((shop: any) => {
      const monthlyCapacity = shop.capacity || shop.qualCapacity || 0;
      if (shop.isAitxInternal) {
        aitxMonthly += monthlyCapacity;
      } else {
        thirdPartyMonthly += monthlyCapacity;
      }
    });

    const totalMonthly = aitxMonthly + thirdPartyMonthly;
    const totalAnnual = totalMonthly * 12;

    // Estimate demand from cars needing work
    const carsNeedingWork = await prisma.car.count({
      where: {
        companyId: req.user!.companyId,
        status: { in: ['available', 'scheduled', 'urgent'] },
        OR: [
          { tankQualDueDate: { not: null } },
          { contractExpiration: { not: null } },
          { reasonsShopped: { contains: 'assignment', mode: 'insensitive' } },
        ],
      },
    });

    const capacitySurplusDeficit = totalAnnual - carsNeedingWork;
    const utilizationRate = totalAnnual > 0 ? carsNeedingWork / totalAnnual : 0;

    res.json({
      totalAnnualDemand: carsNeedingWork,
      monthlyDemand: Math.round(carsNeedingWork / 12),
      aitxAnnualCapacity: aitxMonthly * 12,
      aitxMonthlyCapacity: aitxMonthly,
      thirdPartyAnnualCapacity: thirdPartyMonthly * 12,
      thirdPartyMonthlyCapacity: thirdPartyMonthly,
      totalSystemCapacity: totalAnnual,
      monthlyCapacity: totalMonthly,
      capacitySurplusDeficit,
      systemUtilizationRate: utilizationRate,
      aitxPercentage: totalMonthly > 0 ? aitxMonthly / totalMonthly : 0,
      thirdPartyPercentage: totalMonthly > 0 ? thirdPartyMonthly / totalMonthly : 0,
      capacityStatus: capacitySurplusDeficit >= 0 ? 'Sufficient' : 'SHORTAGE',
      surplusStatus: capacitySurplusDeficit >= 0 ? 'Surplus' : 'DEFICIT',
      utilizationStatus: utilizationRate <= 0.9 ? 'Healthy' : 'Over-Utilized',
      shopCount: shops.length,
      aitxShopCount: shops.filter((s: any) => s.isAitxInternal).length,
      thirdPartyShopCount: shops.filter((s: any) => !s.isAitxInternal).length,
    });
  } catch (error: any) {
    console.error('Get system metrics error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/sop/network-hierarchy - Get shop networks with hierarchy
 *
 * Returns networks organized by parent company with expandable shop locations
 */
router.get('/network-hierarchy', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

  try {
    // Get all shops, grouped by network
    const shops = await prisma.shop.findMany({
      where: {
        companyId: req.user!.companyId,
        isActive: true,
      },
      include: {
        parentShop: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        childShops: {
          select: {
            id: true,
            name: true,
            code: true,
            city: true,
            state: true,
            capacity: true,
            tankQualified: true,
          },
        },
      },
      orderBy: [
        { network: 'asc' },
        { name: 'asc' },
      ],
    });

    // Group shops by network
    const networkMap = new Map<string, {
      id: string;
      name: string;
      isAitxInternal: boolean;
      shops: any[];
      totalMonthlyCapacity: number;
      totalAnnualCapacity: number;
    }>();

    // First pass: create networks from parent shops
    shops.forEach((shop: any) => {
      if (shop.isParent || (shop.childShops && shop.childShops.length > 0)) {
        const networkId = shop.network || shop.code || shop.id;
        if (!networkMap.has(networkId)) {
          networkMap.set(networkId, {
            id: networkId,
            name: shop.name,
            isAitxInternal: shop.isAitxInternal || false,
            shops: [],
            totalMonthlyCapacity: 0,
            totalAnnualCapacity: 0,
          });
        }
      }
    });

    // Second pass: assign shops to networks
    shops.forEach((shop: any) => {
      const networkId = shop.network || (shop.parentShop?.code) || 'Other';

      if (!networkMap.has(networkId)) {
        networkMap.set(networkId, {
          id: networkId,
          name: networkId,
          isAitxInternal: shop.isAitxInternal || false,
          shops: [],
          totalMonthlyCapacity: 0,
          totalAnnualCapacity: 0,
        });
      }

      const network = networkMap.get(networkId)!;
      const monthlyCapacity = shop.capacity || 0;

      network.shops.push({
        id: shop.id,
        code: shop.code,
        name: shop.name,
        city: shop.city || '',
        state: shop.state || '',
        monthlyCapacity,
        annualCapacity: monthlyCapacity * 12,
        tankQualified: shop.tankQualified || false,
        isParent: shop.isParent || false,
      });

      network.totalMonthlyCapacity += monthlyCapacity;
      network.totalAnnualCapacity += monthlyCapacity * 12;
    });

    // Convert to array and sort
    const networks = Array.from(networkMap.values()).sort((a, b) => {
      // AITX first, then alphabetically
      if (a.isAitxInternal && !b.isAitxInternal) return -1;
      if (!a.isAitxInternal && b.isAitxInternal) return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({
      networks,
      totalNetworks: networks.length,
      totalShops: shops.length,
      aitxNetworks: networks.filter((n) => n.isAitxInternal).length,
      thirdPartyNetworks: networks.filter((n) => !n.isAitxInternal).length,
    });
  } catch (error: any) {
    console.error('Get network hierarchy error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

export default router;
