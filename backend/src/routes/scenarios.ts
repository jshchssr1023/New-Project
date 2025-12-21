import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { recommendShopsForCar, recommendShopsForMultipleCars } from '../services/ruleEngine';
import { createMasterPlanService } from '../services/masterPlanService';
import { prisma } from '../services/db';
import logger from '../utils/logger';
import { DEFAULT_ESTIMATED_COST, DEFAULT_ESTIMATED_DAYS, DEFAULT_PRIORITY } from '../constants/defaults';

const router = Router();

// Safe JSON parse helper - prevents crashes from malformed JSON
function safeJsonParse<T>(jsonString: string | null | undefined, defaultValue: T): T {
  if (!jsonString) return defaultValue;
  try {
    return JSON.parse(jsonString) as T;
  } catch {
    logger.warn('Failed to parse JSON', { jsonString: jsonString.substring(0, 100) });
    return defaultValue;
  }
}

router.use(authenticate);

// Get alternative shop recommendations for car(s)
// Used when a shop is at capacity and alternatives are needed
router.post('/alternative-shops', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const { carIds, excludeShopId, month } = req.body;

  try {
    if (!carIds || !Array.isArray(carIds) || carIds.length === 0) {
      res.status(400).json({ message: 'carIds array is required' });
      return;
    }

    // Get car details
    const cars = await prisma.car.findMany({
      where: {
        id: { in: carIds },
        companyId: req.user!.companyId,
      },
    });

    if (cars.length === 0) {
      res.status(404).json({ message: 'No cars found' });
      return;
    }

    // Get recommendations
    const currentMonth = month || new Date().toISOString().slice(0, 7);
    const allRecommendations = await recommendShopsForMultipleCars(
      prisma,
      req.user!.companyId,
      cars as any,
      currentMonth
    );

    // Filter out the excluded shop and flatten recommendations
    const shopScores = new Map<string, { shop: any; totalScore: number; count: number }>();

    allRecommendations.forEach((rec) => {
      rec.allScores
        .filter((r: any) => r.shopId !== excludeShopId && r.score > 0)
        .forEach((r: any) => {
          const existing = shopScores.get(r.shopId);
          if (existing) {
            existing.totalScore += r.score;
            existing.count += 1;
          } else {
            shopScores.set(r.shopId, {
              shop: r.shop,
              totalScore: r.score,
              count: 1,
            });
          }
        });
    });

    // Sort by average score
    const recommendations = Array.from(shopScores.values())
      .map((item) => ({
        shopId: item.shop.id,
        shopName: item.shop.name,
        shopCode: item.shop.code,
        region: item.shop.region,
        tankQualified: item.shop.tankQualified,
        capacity: item.shop.capacity,
        averageScore: Math.round(item.totalScore / item.count),
        matchCount: item.count,
      }))
      .sort((a, b) => b.averageScore - a.averageScore)
      .slice(0, 5);

    res.json({ recommendations });
  } catch (error) {
    logger.error('Get alternative shops error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get all scenarios
router.get('/', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
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

    // Parse results JSON safely
    const scenariosWithResults = scenarios.map((s) => ({
      ...s,
      results: safeJsonParse(s.results, null),
      carCount: s.cars.length,
    }));

    res.json(scenariosWithResults);
  } catch (error) {
    logger.error('Get scenarios error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get scenario by ID with full details
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

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
      results: safeJsonParse(scenario.results, null),
      cars: scenario.cars.map(c => ({
        ...c,
        suggestedShop: c.suggestedShopId ? shopMap.get(c.suggestedShopId) : null,
        assignedShop: c.assignedShopId ? shopMap.get(c.assignedShopId) : null,
      })),
    });
  } catch (error) {
    logger.error('Get scenario error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create scenario
router.post('/', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
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
    logger.error('Create scenario error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Add cars to scenario
router.post('/:id/cars', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
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

    // Check which cars already exist in scenario (batch query instead of N queries)
    const existingScenarioCars = await prisma.scenarioCar.findMany({
      where: {
        scenarioId: req.params.id,
        carId: { in: cars.map(c => c.id) },
      },
      select: { carId: true },
    });
    const existingCarIds = new Set(existingScenarioCars.map(sc => sc.carId));

    // Parse scheduledMonth (YYYY-MM format) to get plannedMonth and plannedYear
    const [yearStr, monthStr] = (scheduledMonth || '').split('-');
    const plannedYear = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear();
    const plannedMonth = monthStr ? parseInt(monthStr, 10) : new Date().getMonth() + 1;

    // Filter out cars that already exist and prepare batch insert data
    const newCarsData = cars
      .filter(car => !existingCarIds.has(car.id))
      .map(car => {
        const recommendation = recommendations.find(r => r.carId === car.id);
        return {
          scenarioId: req.params.id,
          carId: car.id,
          scheduledMonth: scheduledMonth || '',
          plannedMonth,
          plannedYear,
          suggestedShopId: recommendation?.suggestedShopId || null,
          estimatedCost: recommendation?.allScores?.[0]?.estimatedCost || DEFAULT_ESTIMATED_COST,
          estimatedDays: recommendation?.allScores?.[0]?.estimatedDays || DEFAULT_ESTIMATED_DAYS,
          ruleScore: recommendation?.allScores?.[0]?.score || 0,
          ruleNotes: recommendation?.ruleNotes || '',
        };
      });

    // Batch create all new scenario cars in single query
    if (newCarsData.length > 0) {
      await prisma.scenarioCar.createMany({
        data: newCarsData,
        skipDuplicates: true, // Extra safety against race conditions
      });
    }

    // Fetch the full scenario with all cars and shop data
    const updatedScenario = await prisma.scenario.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
      include: {
        basePlan: {
          select: { id: true, name: true },
        },
        cars: {
          include: { car: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    // Get shop details for suggested/assigned shops
    const shopIds = updatedScenario!.cars
      .flatMap(c => [c.suggestedShopId, c.assignedShopId])
      .filter(Boolean) as string[];

    const shops = await prisma.shop.findMany({
      where: { id: { in: shopIds } },
    });

    const shopMap = new Map(shops.map(s => [s.id, s]));

    res.status(201).json({
      ...updatedScenario,
      results: safeJsonParse(updatedScenario!.results, null),
      cars: updatedScenario!.cars.map(c => ({
        ...c,
        suggestedShop: c.suggestedShopId ? shopMap.get(c.suggestedShopId) : null,
        assignedShop: c.assignedShopId ? shopMap.get(c.assignedShopId) : null,
      })),
    });
  } catch (error) {
    logger.error('Add cars to scenario error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Add cars by customer filter
router.post('/:id/cars/by-customer', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
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

    // Parse scheduledMonth (YYYY-MM format) to get plannedMonth and plannedYear
    const [yearStr, monthStr] = (scheduledMonth || '').split('-');
    const plannedYear = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear();
    const plannedMonth = monthStr ? parseInt(monthStr, 10) : new Date().getMonth() + 1;

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
    await Promise.all(
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
            scheduledMonth: scheduledMonth || '',
            plannedMonth,
            plannedYear,
            suggestedShopId: recommendation?.suggestedShopId || null,
            estimatedCost: recommendation?.allScores?.[0]?.estimatedCost || DEFAULT_ESTIMATED_COST,
            estimatedDays: recommendation?.allScores?.[0]?.estimatedDays || DEFAULT_ESTIMATED_DAYS,
            ruleScore: recommendation?.allScores?.[0]?.score || 0,
            ruleNotes: recommendation?.ruleNotes || '',
          },
        });
      })
    );

    // Fetch the full scenario with all cars and shop data
    const updatedScenario = await prisma.scenario.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
      include: {
        basePlan: {
          select: { id: true, name: true },
        },
        cars: {
          include: { car: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    // Get shop details for suggested/assigned shops
    const shopIds = updatedScenario!.cars
      .flatMap(c => [c.suggestedShopId, c.assignedShopId])
      .filter(Boolean) as string[];

    const allShops = await prisma.shop.findMany({
      where: { id: { in: shopIds } },
    });

    const shopMap = new Map(allShops.map(s => [s.id, s]));

    res.status(201).json({
      ...updatedScenario,
      results: safeJsonParse(updatedScenario!.results, null),
      cars: updatedScenario!.cars.map(c => ({
        ...c,
        suggestedShop: c.suggestedShopId ? shopMap.get(c.suggestedShopId) : null,
        assignedShop: c.assignedShopId ? shopMap.get(c.assignedShopId) : null,
      })),
    });
  } catch (error) {
    logger.error('Add cars by customer error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Remove car from scenario
router.delete('/:id/cars/:carId', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

  try {
    // SECURITY: Verify scenario belongs to user's company before deleting
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

    // Also verify the car belongs to the same company for extra security
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

    await prisma.scenarioCar.deleteMany({
      where: {
        scenarioId: req.params.id,
        carId: req.params.carId,
      },
    });

    res.status(204).send();
  } catch (error) {
    logger.error('Remove car from scenario error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update scenario car (assign shop, change month)
router.put('/:id/cars/:scenarioCarId', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const { assignedShopId, scheduledMonth, estimatedCost, estimatedDays } = req.body;

  try {
    // SECURITY: Verify scenarioCarId belongs to the scenario AND company
    const scenarioCar = await prisma.scenarioCar.findFirst({
      where: { id: req.params.scenarioCarId },
      include: {
        scenario: { select: { companyId: true, id: true } },
      },
    });

    if (!scenarioCar) {
      res.status(404).json({ message: 'Scenario car not found' });
      return;
    }

    // Verify the scenario belongs to the user's company
    if (scenarioCar.scenario.companyId !== req.user!.companyId) {
      logger.warn('Unauthorized scenario car update attempt', {
        userId: req.user!.id,
        scenarioCarId: req.params.scenarioCarId,
        attemptedCompanyId: scenarioCar.scenario.companyId,
        userCompanyId: req.user!.companyId,
      });
      res.status(403).json({ message: 'Unauthorized' });
      return;
    }

    // Verify the scenarioCar belongs to the specified scenario
    if (scenarioCar.scenario.id !== req.params.id) {
      res.status(400).json({ message: 'Scenario car does not belong to this scenario' });
      return;
    }

    await prisma.scenarioCar.update({
      where: { id: req.params.scenarioCarId },
      data: {
        assignedShopId,
        scheduledMonth,
        estimatedCost,
        estimatedDays,
      },
    });

    // Fetch the full scenario with all cars and shop data
    const updatedScenario = await prisma.scenario.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
      include: {
        basePlan: {
          select: { id: true, name: true },
        },
        cars: {
          include: { car: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!updatedScenario) {
      res.status(404).json({ message: 'Scenario not found' });
      return;
    }

    // Get shop details for suggested/assigned shops
    const shopIds = updatedScenario.cars
      .flatMap(c => [c.suggestedShopId, c.assignedShopId])
      .filter(Boolean) as string[];

    const shops = await prisma.shop.findMany({
      where: { id: { in: shopIds } },
    });

    const shopMap = new Map(shops.map(s => [s.id, s]));

    res.json({
      ...updatedScenario,
      results: safeJsonParse(updatedScenario.results, null),
      cars: updatedScenario.cars.map(c => ({
        ...c,
        suggestedShop: c.suggestedShopId ? shopMap.get(c.suggestedShopId) : null,
        assignedShop: c.assignedShopId ? shopMap.get(c.assignedShopId) : null,
      })),
    });
  } catch (error) {
    logger.error('Update scenario car error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get shop recommendations for a scenario car
router.get('/:id/cars/:scenarioCarId/recommendations', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const { month } = req.query;

  try {
    // First lookup the scenarioCar to get the actual car
    const scenarioCar = await prisma.scenarioCar.findFirst({
      where: {
        id: req.params.scenarioCarId,
        scenarioId: req.params.id,
      },
      include: { car: true },
    });

    if (!scenarioCar || !scenarioCar.car) {
      res.status(404).json({ message: 'Scenario car not found' });
      return;
    }

    // Verify company ownership
    if (scenarioCar.car.companyId !== req.user!.companyId) {
      res.status(403).json({ message: 'Unauthorized' });
      return;
    }

    const recommendation = await recommendShopsForCar(
      prisma,
      req.user!.companyId,
      scenarioCar.car as any,
      (month as string) || scenarioCar.scheduledMonth || new Date().toISOString().slice(0, 7)
    );

    res.json(recommendation);
  } catch (error) {
    logger.error('Get recommendations error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Analyze scenario - enhanced shop capacity analysis
router.post('/:id/analyze', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

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
        basePlan: {
          select: { id: true, name: true },
        },
        cars: {
          include: { car: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    // Get shop details for suggested/assigned shops
    const allShopIds = updatedScenario.cars
      .flatMap(c => [c.suggestedShopId, c.assignedShopId])
      .filter(Boolean) as string[];

    const allShops = await prisma.shop.findMany({
      where: { id: { in: allShopIds } },
    });

    const allShopMap = new Map(allShops.map(s => [s.id, s]));

    res.json({
      ...updatedScenario,
      results,
      cars: updatedScenario.cars.map(c => ({
        ...c,
        suggestedShop: c.suggestedShopId ? allShopMap.get(c.suggestedShopId) : null,
        assignedShop: c.assignedShopId ? allShopMap.get(c.assignedShopId) : null,
      })),
    });
  } catch (error) {
    logger.error('Analyze scenario error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Confirm shop assignments - converts ScenarioCar records to SOPAssignment records
// This is the CRITICAL bridge that enables MasterPlan creation
// Called when user clicks "Confirm & Assign to Shops"
router.post('/:id/confirm-assignments', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

  try {
    // Get scenario with all cars and their shop assignments
    const scenario = await prisma.scenario.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
      include: {
        cars: {
          include: { car: true },
        },
        sopAssignments: true,
      },
    });

    if (!scenario) {
      res.status(404).json({ message: 'Scenario not found' });
      return;
    }

    // Get cars with assigned shops (either manually assigned or suggested)
    const carsWithShops = scenario.cars.filter(
      (sc: any) => sc.assignedShopId || sc.suggestedShopId
    );

    if (carsWithShops.length === 0) {
      res.status(400).json({
        message: 'No cars have shop assignments. Please assign shops before confirming.',
      });
      return;
    }

    // Create SOPAssignment records from ScenarioCar records
    const sopAssignmentData = carsWithShops.map((sc: any) => {
      const shopId = sc.assignedShopId || sc.suggestedShopId;

      // Get reasons from car's reasonsShopped field, default to qualification
      let reasonsArray: string[] = [];
      try {
        reasonsArray = JSON.parse(sc.car.reasonsShopped || '[]');
      } catch {
        // Fallback to old reasonShopped field
        if (sc.car.reasonShopped) {
          reasonsArray = sc.car.reasonShopped.split(',').map((r: string) => r.trim().toLowerCase()).filter(Boolean);
        }
      }

      // Default to qualification if no reasons specified
      if (reasonsArray.length === 0) {
        reasonsArray = ['qualification'];
      }

      return {
        scenarioId: scenario.id,
        carId: sc.carId,
        shopId,
        reasonsShopped: JSON.stringify(reasonsArray),
        status: 'PLANNED',
        monthKey: sc.scheduledMonth,
        estimatedCost: sc.estimatedCost || DEFAULT_ESTIMATED_COST,
        estimatedDays: sc.estimatedDays || DEFAULT_ESTIMATED_DAYS,
        priority: DEFAULT_PRIORITY,
        notes: `Confirmed from scenario: ${scenario.name}`,
      };
    });

    // Use transaction to ensure atomic delete and create (prevents race conditions)
    await prisma.$transaction(async (tx: any) => {
      // Delete any existing SOPAssignments for this scenario (replace mode)
      await tx.sOPAssignment.deleteMany({
        where: { scenarioId: scenario.id },
      });

      // Create new SOPAssignments
      await tx.sOPAssignment.createMany({
        data: sopAssignmentData,
      });

      // Update scenario status to indicate assignments are confirmed
      await tx.scenario.update({
        where: { id: scenario.id },
        data: { status: 'completed' },
      });
    });

    // Broadcast update via WebSocket
    const io = req.app.locals.io;
    if (io) {
      io.emit('assignmentsConfirmed', {
        scenarioId: scenario.id,
        assignmentCount: sopAssignmentData.length,
      });
    }

    // Return updated scenario with SOPAssignments
    const updatedScenario = await prisma.scenario.findFirst({
      where: { id: scenario.id },
      include: {
        cars: {
          include: { car: true },
        },
        sopAssignments: {
          include: { car: true, shop: true },
        },
      },
    });

    // Get shop details for response
    const shopIds = updatedScenario!.cars
      .flatMap((c: any) => [c.suggestedShopId, c.assignedShopId])
      .filter(Boolean) as string[];

    const shops = await prisma.shop.findMany({
      where: { id: { in: shopIds } },
    });

    const shopMap = new Map(shops.map((s: any) => [s.id, s]));

    res.status(200).json({
      success: true,
      message: `Created ${sopAssignmentData.length} SOP assignments. Scenario is ready for approval.`,
      scenario: {
        ...updatedScenario,
        results: safeJsonParse(updatedScenario!.results, null),
        cars: updatedScenario!.cars.map((c: any) => ({
          ...c,
          suggestedShop: c.suggestedShopId ? shopMap.get(c.suggestedShopId) : null,
          assignedShop: c.assignedShopId ? shopMap.get(c.assignedShopId) : null,
        })),
      },
      sopAssignmentCount: sopAssignmentData.length,
    });
  } catch (error: any) {
    logger.error('Confirm assignments error', error);
    res.status(500).json({
      message: error.message || 'Failed to confirm assignments',
    });
  }
});

// Approve scenario and create MasterPlan - ONE STEP APPROVAL
// This endpoint now handles everything:
// 1. Creates SOPAssignments from ScenarioCars (if not already created)
// 2. Creates MasterPlan with commitments
// 3. Updates Car.assignedShopId for all assigned cars
// 4. Uses suggestedShopId when assignedShopId is null
router.post('/:id/approve', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const masterPlanService = createMasterPlanService(prisma);
  const { planName, activate } = req.body;

  try {
    // Validate scenario exists and belongs to company
    const scenario = await prisma.scenario.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
      include: {
        cars: {
          include: { car: true },
        },
        sopAssignments: true,
      },
    });

    if (!scenario) {
      res.status(404).json({ message: 'Scenario not found' });
      return;
    }

    // Check if scenario has cars
    if (!scenario.cars || scenario.cars.length === 0) {
      res.status(400).json({
        message: 'Scenario has no cars. Please add cars before approving.',
      });
      return;
    }

    // Get cars with shop assignments (either manually assigned OR suggested)
    const carsWithShops = scenario.cars.filter(
      (sc: any) => sc.assignedShopId || sc.suggestedShopId
    );

    if (carsWithShops.length === 0) {
      res.status(400).json({
        message: 'No cars have shop assignments. Please assign shops or run auto-suggestions before approving.',
      });
      return;
    }

    // =========================================================================
    // STEP 1: Create or update SOPAssignments from ScenarioCars (ONE-STEP)
    // =========================================================================
    logger.info(`Creating SOPAssignments for scenario ${scenario.id}`);

    // Delete existing SOPAssignments (fresh start)
    await prisma.sOPAssignment.deleteMany({
      where: { scenarioId: scenario.id },
    });

    // Create SOPAssignment for each car with a shop
    const sopAssignmentData = carsWithShops.map((sc: any) => {
      // Use assignedShopId if available, otherwise fall back to suggestedShopId
      const shopId = sc.assignedShopId || sc.suggestedShopId;

      // Get reasons from car's reasonsShopped field
      let reasonsArray: string[] = [];
      try {
        reasonsArray = JSON.parse(sc.car.reasonsShopped || '[]');
      } catch {
        // Fallback to old reasonShopped field (singular)
        if (sc.car.reasonShopped) {
          reasonsArray = sc.car.reasonShopped.split(',').map((r: string) => r.trim().toLowerCase()).filter(Boolean);
        }
      }

      // Default to qualification if no reasons specified
      if (reasonsArray.length === 0) {
        reasonsArray = ['qualification'];
      }

      return {
        scenarioId: scenario.id,
        carId: sc.carId,
        shopId,
        reasonsShopped: JSON.stringify(reasonsArray),
        status: 'PLANNED',
        monthKey: sc.scheduledMonth,
        estimatedCost: sc.estimatedCost || DEFAULT_ESTIMATED_COST,
        estimatedDays: sc.estimatedDays || DEFAULT_ESTIMATED_DAYS,
        priority: DEFAULT_PRIORITY,
        notes: `Auto-created during approval: ${scenario.name}`,
      };
    });

    await prisma.sOPAssignment.createMany({
      data: sopAssignmentData,
    });

    logger.info(`Created ${sopAssignmentData.length} SOPAssignments`);

    // =========================================================================
    // STEP 2: Update Car.assignedShopId for all cars being assigned
    // =========================================================================
    logger.info(`Updating Car.assignedShopId for ${carsWithShops.length} cars`);

    for (const sc of carsWithShops) {
      const shopId = sc.assignedShopId || sc.suggestedShopId;
      if (shopId) {
        await prisma.car.update({
          where: { id: sc.carId },
          data: {
            assignedShopId: shopId,
            status: 'scheduled', // Update car status to scheduled
          },
        });
      }
    }

    logger.info(`Updated Car.assignedShopId for all cars`);

    // =========================================================================
    // STEP 3: Refresh scenario and create MasterPlan
    // =========================================================================

    // Re-fetch scenario with the new SOPAssignments
    const updatedScenario = await prisma.scenario.findFirst({
      where: { id: scenario.id },
      include: {
        sopAssignments: {
          include: { car: true, shop: true },
        },
      },
    });

    // Create the MasterPlan from the scenario
    const masterPlan = await masterPlanService.createMasterPlanFromScenario(
      scenario.id,
      req.user!.id,
      planName || `${scenario.projectNumber} - ${scenario.name}`
    );

    // Optionally approve and activate the plan immediately
    if (activate) {
      await masterPlanService.approveMasterPlan(masterPlan.id, req.user!.id, true);
    }

    // Update scenario status
    await prisma.scenario.update({
      where: { id: scenario.id },
      data: { status: 'approved' },
    });

    // Broadcast update via WebSocket
    const io = req.app.locals.io;
    if (io) {
      io.emit('scenarioApproved', {
        scenarioId: scenario.id,
        masterPlanId: masterPlan.id,
        status: activate ? 'active' : 'draft',
        commitmentCount: masterPlan.commitments?.length || sopAssignmentData.length,
      });

      // Also notify dashboard to refresh
      io.emit('dashboardUpdate', {
        type: 'masterPlanCreated',
        masterPlanId: masterPlan.id,
      });
    }

    res.status(201).json({
      success: true,
      message: `MasterPlan created with ${masterPlan.commitments?.length || sopAssignmentData.length} commitments. ${carsWithShops.length} cars updated.`,
      masterPlan: {
        id: masterPlan.id,
        planName: masterPlan.planName,
        fiscalYear: masterPlan.fiscalYear,
        version: masterPlan.version,
        status: masterPlan.status,
        commitmentCount: masterPlan.commitments?.length || sopAssignmentData.length,
      },
      carsUpdated: carsWithShops.length,
    });
  } catch (error: any) {
    logger.error('Approve scenario error', error);
    res.status(500).json({
      message: error.message || 'Failed to approve scenario',
    });
  }
});

// Apply scenario to plan
router.post('/:id/apply', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
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
    logger.error('Apply scenario error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update scenario
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
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
    logger.error('Update scenario error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete scenario
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

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
    logger.error('Delete scenario error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get unique customers from cars
router.get('/meta/customers', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

  try {
    const cars = await prisma.car.findMany({
      where: { companyId: req.user!.companyId },
      select: { customer: true },
      distinct: ['customer'],
    });

    const customers = cars.map(c => c.customer).filter(c => c).sort();
    res.json(customers);
  } catch (error) {
    logger.error('Get customers error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
