import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import { recommendShopsForCar, recommendShopsForMultipleCars } from '../services/ruleEngine';

const router = Router();

router.use(authenticate);

// Get all scenarios
router.get('/', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
  const { customer } = req.query;

  try {
    const scenarios = await prisma.scenario.findMany({
      where: {
        companyId: req.user!.companyId,
        ...(customer && { customerFilter: customer as string }),
      },
      include: {
        basePlan: {
          select: { id: true, name: true },
        },
        cars: {
          include: {
            car: true,
          },
        },
        creator: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Parse results JSON
    const scenariosWithResults = scenarios.map((s) => ({
      ...s,
      results: s.results ? JSON.parse(s.results) : null,
      carCount: s.cars.length,
    }));

    res.json(scenariosWithResults);
  } catch (error) {
    console.error('Get scenarios error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get scenario by ID with full details
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;

  try {
    const scenario = await prisma.scenario.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
      include: {
        basePlan: {
          include: { assignments: true },
        },
        cars: {
          include: {
            car: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        modifications: true,
      },
    });

    if (!scenario) {
      res.status(404).json({ message: 'Scenario not found' });
      return;
    }

    // Get shop details for suggested/assigned shops
    const shopIds = scenario.cars
      .flatMap(c => [c.suggestedShopId, c.assignedShopId])
      .filter(Boolean) as string[];

    const shops = await prisma.shop.findMany({
      where: { id: { in: shopIds } },
    });

    const shopMap = new Map(shops.map(s => [s.id, s]));

    res.json({
      ...scenario,
      results: scenario.results ? JSON.parse(scenario.results) : null,
      cars: scenario.cars.map(c => ({
        ...c,
        suggestedShop: c.suggestedShopId ? shopMap.get(c.suggestedShopId) : null,
        assignedShop: c.assignedShopId ? shopMap.get(c.assignedShopId) : null,
      })),
    });
  } catch (error) {
    console.error('Get scenario error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create scenario
router.post('/', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
  const { projectNumber, name, description, customerFilter, basePlanId } = req.body;

  // Validate required projectNumber
  if (!projectNumber) {
    res.status(400).json({
      message: 'Project Number is required',
      field: 'projectNumber',
      hint: 'Format: Q4-25-001 or similar project identifier',
    });
    return;
  }

  // Validate projectNumber format (flexible pattern)
  const projectNumberPattern = /^[A-Za-z0-9][-A-Za-z0-9_]{2,}$/;
  if (!projectNumberPattern.test(projectNumber)) {
    res.status(400).json({
      message: 'Invalid Project Number format',
      field: 'projectNumber',
      hint: 'Must start with alphanumeric and be at least 3 characters (e.g., Q4-25-001)',
    });
    return;
  }

  if (!name) {
    res.status(400).json({
      message: 'Scenario Name is required',
      field: 'name',
      hint: 'E.g., "Initial Proposal" or "Revised Budget Plan"',
    });
    return;
  }

  try {
    const scenario = await prisma.scenario.create({
      data: {
        projectNumber: projectNumber.toUpperCase(),
        name,
        description: description || '',
        customerFilter: customerFilter || '',
        basePlanId: basePlanId || null,
        companyId: req.user!.companyId,
        createdBy: req.user!.id,
      },
      include: {
        basePlan: {
          select: { id: true, name: true },
        },
        cars: true,
      },
    });

    res.status(201).json(scenario);
  } catch (error) {
    console.error('Create scenario error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Add cars to scenario
router.post('/:id/cars', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
  const { carIds, scheduledMonth, autoSuggestShops } = req.body;

  try {
    const scenario = await prisma.scenario.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
    });

    if (!scenario) {
      res.status(404).json({ message: 'Scenario not found' });
      return;
    }

    // Get cars
    const cars = await prisma.car.findMany({
      where: {
        id: { in: carIds },
        companyId: req.user!.companyId,
      },
    });

    if (cars.length === 0) {
      res.status(400).json({ message: 'No valid cars found' });
      return;
    }

    // Auto-suggest shops if requested
    let recommendations: any[] = [];
    if (autoSuggestShops) {
      recommendations = await recommendShopsForMultipleCars(
        prisma,
        req.user!.companyId,
        cars as any,
        scheduledMonth
      );
    }

    // Create scenario cars
    const createdCars = await Promise.all(
      cars.map(async (car) => {
        const recommendation = recommendations.find(r => r.carId === car.id);

        // Check if car already exists in scenario
        const existing = await prisma.scenarioCar.findFirst({
          where: {
            scenarioId: req.params.id,
            carId: car.id,
          },
        });

        if (existing) {
          return existing;
        }

        return prisma.scenarioCar.create({
          data: {
            scenarioId: req.params.id,
            carId: car.id,
            scheduledMonth,
            suggestedShopId: recommendation?.suggestedShopId || null,
            estimatedCost: recommendation?.allScores?.[0]?.estimatedCost || 15000,
            estimatedDays: recommendation?.allScores?.[0]?.estimatedDays || 14,
            ruleScore: recommendation?.allScores?.[0]?.score || 0,
            ruleNotes: recommendation?.ruleNotes || '',
          },
          include: { car: true },
        });
      })
    );

    res.status(201).json({
      added: createdCars.length,
      cars: createdCars,
      recommendations,
    });
  } catch (error) {
    console.error('Add cars to scenario error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Add cars by customer filter
router.post('/:id/cars/by-customer', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
  const { customer, scheduledMonth, limit, autoSuggestShops } = req.body;

  try {
    const scenario = await prisma.scenario.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
    });

    if (!scenario) {
      res.status(404).json({ message: 'Scenario not found' });
      return;
    }

    // Get cars for customer
    const cars = await prisma.car.findMany({
      where: {
        companyId: req.user!.companyId,
        customer,
        status: { in: ['available', 'scheduled'] },
      },
      take: limit || 300,
      orderBy: { vehicleNumber: 'asc' },
    });

    if (cars.length === 0) {
      res.status(400).json({ message: 'No cars found for customer' });
      return;
    }

    // Update scenario customer filter
    await prisma.scenario.update({
      where: { id: req.params.id },
      data: { customerFilter: customer },
    });

    // Auto-suggest shops if requested
    let recommendations: any[] = [];
    if (autoSuggestShops) {
      recommendations = await recommendShopsForMultipleCars(
        prisma,
        req.user!.companyId,
        cars as any,
        scheduledMonth
      );
    }

    // Create scenario cars
    const createdCars = await Promise.all(
      cars.map(async (car) => {
        const recommendation = recommendations.find(r => r.carId === car.id);

        const existing = await prisma.scenarioCar.findFirst({
          where: {
            scenarioId: req.params.id,
            carId: car.id,
          },
        });

        if (existing) {
          return existing;
        }

        return prisma.scenarioCar.create({
          data: {
            scenarioId: req.params.id,
            carId: car.id,
            scheduledMonth,
            suggestedShopId: recommendation?.suggestedShopId || null,
            estimatedCost: recommendation?.allScores?.[0]?.estimatedCost || 15000,
            estimatedDays: recommendation?.allScores?.[0]?.estimatedDays || 14,
            ruleScore: recommendation?.allScores?.[0]?.score || 0,
            ruleNotes: recommendation?.ruleNotes || '',
          },
        });
      })
    );

    res.status(201).json({
      customer,
      added: createdCars.length,
      totalCars: cars.length,
    });
  } catch (error) {
    console.error('Add cars by customer error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Remove car from scenario
router.delete('/:id/cars/:carId', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;

  try {
    await prisma.scenarioCar.deleteMany({
      where: {
        scenarioId: req.params.id,
        carId: req.params.carId,
      },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Remove car from scenario error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update scenario car (assign shop, change month)
router.put('/:id/cars/:scenarioCarId', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
  const { assignedShopId, scheduledMonth, estimatedCost, estimatedDays } = req.body;

  try {
    const scenarioCar = await prisma.scenarioCar.update({
      where: { id: req.params.scenarioCarId },
      data: {
        assignedShopId,
        scheduledMonth,
        estimatedCost,
        estimatedDays,
      },
      include: { car: true },
    });

    res.json(scenarioCar);
  } catch (error) {
    console.error('Update scenario car error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get shop recommendations for a scenario car
router.get('/:id/cars/:carId/recommendations', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
  const { month } = req.query;

  try {
    const car = await prisma.car.findFirst({
      where: {
        id: req.params.carId,
        companyId: req.user!.companyId,
      },
    });

    if (!car) {
      res.status(404).json({ message: 'Car not found' });
      return;
    }

    const recommendation = await recommendShopsForCar(
      prisma,
      req.user!.companyId,
      car as any,
      (month as string) || new Date().toISOString().slice(0, 7)
    );

    res.json(recommendation);
  } catch (error) {
    console.error('Get recommendations error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Analyze scenario - enhanced shop capacity analysis
router.post('/:id/analyze', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;

  try {
    const scenario = await prisma.scenario.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
      include: {
        cars: {
          include: { car: true },
        },
      },
    });

    if (!scenario) {
      res.status(404).json({ message: 'Scenario not found' });
      return;
    }

    // Set to analyzing
    await prisma.scenario.update({
      where: { id: req.params.id },
      data: { status: 'analyzing' },
    });

    // Get all shops
    const shops = await prisma.shop.findMany({
      where: {
        companyId: req.user!.companyId,
        isActive: true,
      },
    });

    const shopMap = new Map(shops.map(s => [s.id, s]));

    // Get existing plan assignments for context
    const existingAssignments = await prisma.planAssignment.groupBy({
      by: ['shopId', 'scheduledMonth'],
      where: {
        shop: { companyId: req.user!.companyId },
      },
      _count: { id: true },
    });

    const existingLoadMap = new Map<string, number>();
    existingAssignments.forEach(a => {
      const key = `${a.shopId}-${a.scheduledMonth}`;
      existingLoadMap.set(key, a._count.id);
    });

    // Analyze scenario cars by shop
    const scenarioLoadMap = new Map<string, number>();
    const shopMonthlyLoad: Record<string, Record<string, number>> = {};

    scenario.cars.forEach(sc => {
      const shopId = sc.assignedShopId || sc.suggestedShopId;
      if (shopId) {
        const key = `${shopId}-${sc.scheduledMonth}`;
        scenarioLoadMap.set(key, (scenarioLoadMap.get(key) || 0) + 1);

        if (!shopMonthlyLoad[shopId]) {
          shopMonthlyLoad[shopId] = {};
        }
        shopMonthlyLoad[shopId][sc.scheduledMonth] =
          (shopMonthlyLoad[shopId][sc.scheduledMonth] || 0) + 1;
      }
    });

    // Calculate overloads
    const overloadedShops: Array<{
      shopName: string;
      shopCode: string;
      month: string;
      existingLoad: number;
      scenarioLoad: number;
      totalLoad: number;
      capacity: number;
      overloadPercent: number;
    }> = [];

    Object.entries(shopMonthlyLoad).forEach(([shopId, months]) => {
      const shop = shopMap.get(shopId) as any;
      if (!shop) return;

      Object.entries(months).forEach(([month, scenarioCount]) => {
        const existingKey = `${shopId}-${month}`;
        const existingCount = existingLoadMap.get(existingKey) || 0;
        const totalLoad = existingCount + scenarioCount;

        if (totalLoad > shop.capacity) {
          overloadedShops.push({
            shopName: shop.name,
            shopCode: shop.code,
            month,
            existingLoad: existingCount,
            scenarioLoad: scenarioCount,
            totalLoad,
            capacity: shop.capacity,
            overloadPercent: Math.round(((totalLoad - shop.capacity) / shop.capacity) * 100),
          });
        }
      });
    });

    // Sort by severity
    overloadedShops.sort((a, b) => b.overloadPercent - a.overloadPercent);

    // Calculate totals
    const totalCost = scenario.cars.reduce((sum, c) => sum + c.estimatedCost, 0);
    const avgTurnTime = scenario.cars.length > 0
      ? scenario.cars.reduce((sum, c) => sum + c.estimatedDays, 0) / scenario.cars.length
      : 0;

    // Get unique customers
    const customers = [...new Set(scenario.cars.map(c => c.car.customer).filter(Boolean))];

    // Cars without assignments
    const unassignedCars = scenario.cars.filter(c => !c.assignedShopId && !c.suggestedShopId);

    const results = {
      totalCars: scenario.cars.length,
      assignedCars: scenario.cars.filter(c => c.assignedShopId).length,
      suggestedCars: scenario.cars.filter(c => c.suggestedShopId && !c.assignedShopId).length,
      unassignedCars: unassignedCars.length,
      totalCost: Math.round(totalCost),
      averageTurnTime: Math.round(avgTurnTime * 10) / 10,
      customers,
      capacityAnalysis: {
        hasOverload: overloadedShops.length > 0,
        totalOverloadInstances: overloadedShops.length,
        overloadedShops,
        shopMonthlyBreakdown: Object.fromEntries(
          Object.entries(shopMonthlyLoad).map(([shopId, data]) => {
            const shop = shopMap.get(shopId) as any;
            return [
              shop?.name || shopId,
              {
                capacity: shop?.capacity || 0,
                scenarioLoad: data,
              },
            ];
          })
        ),
      },
      unassignedCarNumbers: unassignedCars.map(c => c.car.vehicleNumber),
    };

    // Update scenario with results
    const updatedScenario = await prisma.scenario.update({
      where: { id: req.params.id },
      data: {
        status: 'completed',
        results: JSON.stringify(results),
      },
      include: {
        cars: { include: { car: true } },
      },
    });

    res.json({
      ...updatedScenario,
      results,
    });
  } catch (error) {
    console.error('Analyze scenario error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Apply scenario to plan
router.post('/:id/apply', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
  const { planId } = req.body;

  try {
    const scenario = await prisma.scenario.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
      include: {
        cars: { include: { car: true } },
      },
    });

    if (!scenario) {
      res.status(404).json({ message: 'Scenario not found' });
      return;
    }

    const plan = await prisma.plan.findFirst({
      where: {
        id: planId,
        companyId: req.user!.companyId,
      },
    });

    if (!plan) {
      res.status(404).json({ message: 'Plan not found' });
      return;
    }

    // Create assignments from scenario cars
    const results = {
      created: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const scenarioCar of scenario.cars) {
      const shopId = scenarioCar.assignedShopId || scenarioCar.suggestedShopId;
      if (!shopId) {
        results.skipped++;
        continue;
      }

      try {
        await prisma.planAssignment.create({
          data: {
            planId,
            carId: scenarioCar.carId,
            shopId,
            scheduledMonth: scenarioCar.scheduledMonth,
            estimatedCost: scenarioCar.estimatedCost,
            estimatedDuration: scenarioCar.estimatedDays,
            status: 'pending',
          },
        });
        results.created++;
      } catch (err: any) {
        if (err.code === 'P2002') {
          results.skipped++;
        } else {
          results.errors.push(`${scenarioCar.car.vehicleNumber}: ${err.message}`);
        }
      }
    }

    res.json({
      planId,
      planName: plan.name,
      ...results,
    });
  } catch (error) {
    console.error('Apply scenario error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update scenario
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
  const { name, description, customerFilter } = req.body;

  try {
    const result = await prisma.scenario.updateMany({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
      data: { name, description, customerFilter },
    });

    if (result.count === 0) {
      res.status(404).json({ message: 'Scenario not found' });
      return;
    }

    const updatedScenario = await prisma.scenario.findUnique({
      where: { id: req.params.id },
      include: { cars: true },
    });

    res.json(updatedScenario);
  } catch (error) {
    console.error('Update scenario error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete scenario
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;

  try {
    const result = await prisma.scenario.deleteMany({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
    });

    if (result.count === 0) {
      res.status(404).json({ message: 'Scenario not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error('Delete scenario error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get unique customers from cars
router.get('/meta/customers', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;

  try {
    const cars = await prisma.car.findMany({
      where: { companyId: req.user!.companyId },
      select: { customer: true },
      distinct: ['customer'],
    });

    const customers = cars.map(c => c.customer).filter(c => c).sort();
    res.json(customers);
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
