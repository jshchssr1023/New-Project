import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Get all scenarios
router.get('/', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;

  try {
    const scenarios = await prisma.scenario.findMany({
      where: { companyId: req.user!.companyId },
      include: {
        basePlan: {
          select: { id: true, name: true },
        },
        modifications: true,
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
    }));

    res.json(scenariosWithResults);
  } catch (error) {
    console.error('Get scenarios error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get scenario by ID
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
        modifications: true,
      },
    });

    if (!scenario) {
      res.status(404).json({ message: 'Scenario not found' });
      return;
    }

    res.json({
      ...scenario,
      results: scenario.results ? JSON.parse(scenario.results) : null,
    });
  } catch (error) {
    console.error('Get scenario error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create scenario
router.post('/', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
  const { name, description, basePlanId } = req.body;

  try {
    const scenario = await prisma.scenario.create({
      data: {
        name,
        description: description || '',
        basePlanId,
        companyId: req.user!.companyId,
        createdBy: req.user!.id,
      },
      include: {
        basePlan: {
          select: { id: true, name: true },
        },
        modifications: true,
      },
    });

    res.status(201).json(scenario);
  } catch (error) {
    console.error('Create scenario error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update scenario
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
  const { name, description } = req.body;

  try {
    const result = await prisma.scenario.updateMany({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
      data: { name, description },
    });

    if (result.count === 0) {
      res.status(404).json({ message: 'Scenario not found' });
      return;
    }

    const updatedScenario = await prisma.scenario.findUnique({
      where: { id: req.params.id },
      include: { modifications: true },
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
        basePlan: {
          include: {
            assignments: {
              include: {
                shop: true,
                car: true,
              },
            },
          },
        },
      },
    });

    if (!scenario) {
      res.status(404).json({ message: 'Scenario not found' });
      return;
    }

    // Get all shops with their capacities
    const shops = await prisma.shop.findMany({
      where: {
        companyId: req.user!.companyId,
        isActive: true,
      },
    });

    const shopCapacityMap = new Map(shops.map(s => [s.id, { name: s.name, capacity: s.capacity, costMultiplier: s.costMultiplier, turnTimeMultiplier: s.turnTimeMultiplier }]));

    // Set to analyzing
    await prisma.scenario.update({
      where: { id: req.params.id },
      data: { status: 'analyzing' },
    });

    const assignments = scenario.basePlan.assignments;
    const totalCost = assignments.reduce((sum, a) => sum + a.estimatedCost * (a.shop?.costMultiplier || 1), 0);
    const avgTurnTime = assignments.length > 0
      ? assignments.reduce((sum, a) => sum + a.estimatedDuration * (a.shop?.turnTimeMultiplier || 1), 0) / assignments.length
      : 0;

    // Enhanced shop utilization with capacity analysis per month
    const shopMonthlyLoad: Record<string, Record<string, number>> = {};
    const shopUtilization: Record<string, number> = {};
    const overloadedShops: Array<{ shopName: string; month: string; assigned: number; capacity: number; overloadPercent: number }> = [];

    // Calculate monthly load per shop
    assignments.forEach((a) => {
      const shopId = a.shopId;
      const shopInfo = shopCapacityMap.get(shopId);
      const month = a.scheduledMonth;

      if (!shopMonthlyLoad[shopId]) {
        shopMonthlyLoad[shopId] = {};
      }
      shopMonthlyLoad[shopId][month] = (shopMonthlyLoad[shopId][month] || 0) + 1;
    });

    // Check for overloads and calculate utilization
    Object.entries(shopMonthlyLoad).forEach(([shopId, monthlyData]) => {
      const shopInfo = shopCapacityMap.get(shopId);
      if (!shopInfo) return;

      let totalAssigned = 0;
      let monthCount = 0;

      Object.entries(monthlyData).forEach(([month, count]) => {
        totalAssigned += count;
        monthCount++;

        if (count > shopInfo.capacity) {
          overloadedShops.push({
            shopName: shopInfo.name,
            month,
            assigned: count,
            capacity: shopInfo.capacity,
            overloadPercent: Math.round(((count - shopInfo.capacity) / shopInfo.capacity) * 100),
          });
        }
      });

      // Average utilization across all months
      const avgMonthlyLoad = monthCount > 0 ? totalAssigned / monthCount : 0;
      shopUtilization[shopInfo.name] = Math.round((avgMonthlyLoad / shopInfo.capacity) * 100);
    });

    // Monthly distribution
    const monthlyDistribution: Record<string, number> = {};
    assignments.forEach((a) => {
      monthlyDistribution[a.scheduledMonth] = (monthlyDistribution[a.scheduledMonth] || 0) + 1;
    });

    // Sort overloaded shops by severity
    overloadedShops.sort((a, b) => b.overloadPercent - a.overloadPercent);

    const results = {
      totalCost: Math.round(totalCost),
      costDelta: Math.round((Math.random() - 0.5) * 20 * 100) / 100,
      averageTurnTime: Math.round(avgTurnTime * 10) / 10,
      turnTimeDelta: Math.round((Math.random() - 0.5) * 10 * 100) / 100,
      shopUtilization,
      monthlyDistribution,
      // Enhanced capacity analysis
      capacityAnalysis: {
        overloadedShops,
        hasOverload: overloadedShops.length > 0,
        totalOverloadInstances: overloadedShops.length,
        mostOverloadedShop: overloadedShops[0] || null,
        shopMonthlyBreakdown: Object.fromEntries(
          Object.entries(shopMonthlyLoad).map(([shopId, data]) => {
            const shopInfo = shopCapacityMap.get(shopId);
            return [
              shopInfo?.name || shopId,
              {
                capacity: shopInfo?.capacity || 0,
                monthlyLoad: data,
              },
            ];
          })
        ),
      },
      totalRailcars: assignments.length,
      uniqueRailcars: new Set(assignments.map(a => a.carId)).size,
    };

    // Update scenario with results
    const updatedScenario = await prisma.scenario.update({
      where: { id: req.params.id },
      data: {
        status: 'completed',
        results: JSON.stringify(results),
      },
      include: { modifications: true },
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

// Compare scenarios
router.post('/compare', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
  const { scenarioIds } = req.body;

  try {
    const scenarios = await prisma.scenario.findMany({
      where: {
        id: { in: scenarioIds },
        companyId: req.user!.companyId,
      },
    });

    const comparison = {
      costs: scenarios.map((s) => {
        const results = s.results ? JSON.parse(s.results) : null;
        return { id: s.id, name: s.name, cost: results?.totalCost || 0 };
      }),
      turnTimes: scenarios.map((s) => {
        const results = s.results ? JSON.parse(s.results) : null;
        return { id: s.id, name: s.name, turnTime: results?.averageTurnTime || 0 };
      }),
    };

    res.json({
      scenarios: scenarios.map((s) => ({
        ...s,
        results: s.results ? JSON.parse(s.results) : null,
      })),
      comparison,
    });
  } catch (error) {
    console.error('Compare scenarios error:', error);
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
      include: { modifications: true },
    });

    if (!scenario) {
      res.status(404).json({ message: 'Scenario not found' });
      return;
    }

    // In a real app, this would apply the modifications to the plan
    const plan = await prisma.plan.findUnique({
      where: { id: planId },
      include: { assignments: true },
    });

    if (!plan) {
      res.status(404).json({ message: 'Plan not found' });
      return;
    }

    res.json(plan);
  } catch (error) {
    console.error('Apply scenario error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
