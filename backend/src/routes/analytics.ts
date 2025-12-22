import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Get dashboard analytics
router.get('/dashboard', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

  try {
    const companyId = req.user!.companyId;
    const currentMonth = new Date().toISOString().slice(0, 7);
    const currentDate = new Date();

    // Get counts
    const [totalCars, totalShops, activePlans, carsInService, carsInShop, carsAvailable, carsScheduled, activeScenarios] = await Promise.all([
      prisma.car.count({ where: { companyId } }),
      prisma.shop.count({ where: { companyId, isActive: true } }),
      prisma.plan.count({ where: { companyId, status: 'active' } }),
      prisma.car.count({ where: { companyId, status: 'in_service' } }),
      prisma.car.count({ where: { companyId, status: 'in_shop' } }),
      prisma.car.count({ where: { companyId, status: 'available' } }),
      prisma.car.count({ where: { companyId, status: 'scheduled' } }),
      prisma.scenario.count({ where: { companyId, status: { in: ['draft', 'analyzing'] } } }),
    ]);

    // Calculate cars in queue (available + scheduled)
    const carsInQueue = carsAvailable + carsScheduled;
    const totalCarsInShop = carsInService + carsInShop;

    // Get shops with allocated cars this month
    const shopsWithCarsCount = await prisma.shop.count({
      where: {
        companyId,
        isActive: true,
        assignments: {
          some: {
            scheduledMonth: currentMonth,
          },
        },
      },
    });

    // Get "My Queue" - cars available and due for service this month
    const myQueueCars = await prisma.car.findMany({
      where: {
        companyId,
        status: 'available',
        nextServiceDue: {
          lte: new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).toISOString(),
        },
      },
      orderBy: { nextServiceDue: 'asc' },
      take: 10,
    });

    // Get "In Shop Status" - cars currently in service or in shop
    const inShopCars = await prisma.car.findMany({
      where: {
        companyId,
        status: { in: ['in_service', 'in_shop'] },
      },
      include: {
        assignedShop: {
          select: { name: true, code: true },
        },
      },
      orderBy: { daysInShop: 'desc' },
      take: 10,
    });

    // Get overdue cars (nextServiceDue in the past and still available)
    const overdueCars = await prisma.car.count({
      where: {
        companyId,
        status: 'available',
        nextServiceDue: {
          lt: currentDate.toISOString(),
        },
      },
    });

    // Get shops over capacity
    const shopsOverCapacity = await prisma.shop.findMany({
      where: {
        companyId,
        isActive: true,
      },
      include: {
        assignments: {
          where: {
            scheduledMonth: currentMonth,
          },
        },
      },
    });

    const capacityAlerts = shopsOverCapacity
      .filter(shop => shop.assignments.length > shop.capacity)
      .map(shop => ({
        shopName: shop.name,
        shopCode: shop.code,
        capacity: shop.capacity,
        currentLoad: shop.assignments.length,
        overloadPercent: Math.round(((shop.assignments.length - shop.capacity) / shop.capacity) * 100),
      }));

    // Get monthly service counts
    const assignments = await prisma.planAssignment.findMany({
      where: {
        plan: { companyId },
      },
      select: { scheduledMonth: true },
    });

    const monthCounts: Record<string, number> = {};
    assignments.forEach((a) => {
      monthCounts[a.scheduledMonth] = (monthCounts[a.scheduledMonth] || 0) + 1;
    });

    const monthlyServiceCounts = Object.entries(monthCounts)
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);

    // Get shop performance
    const shops = await prisma.shop.findMany({
      where: { companyId, isActive: true },
      include: {
        assignments: {
          select: { estimatedDuration: true },
        },
      },
    });

    const shopPerformance = shops.map((shop) => ({
      shopId: shop.id,
      shopName: shop.name,
      utilization: Math.min(100, Math.round((shop.assignments.length / (shop.capacity * 12)) * 100)),
      avgTurnTime: shop.assignments.length > 0
        ? Math.round(shop.assignments.reduce((sum, a) => sum + a.estimatedDuration, 0) / shop.assignments.length)
        : 0,
    }));

    // Cost breakdown (simulated)
    const costBreakdown = [
      { category: 'Labor', amount: 450000 },
      { category: 'Parts', amount: 320000 },
      { category: 'Transportation', amount: 180000 },
      { category: 'Inspection', amount: 95000 },
      { category: 'Other', amount: 55000 },
    ];

    // Upcoming services
    const upcomingMonth = new Date().toISOString().slice(0, 7);
    const upcomingAssignments = await prisma.planAssignment.findMany({
      where: {
        plan: { companyId, status: 'active' },
        scheduledMonth: { gte: currentMonth },
        status: 'pending',
      },
      include: {
        car: { select: { id: true, railcarNumber: true } },
        shop: { select: { name: true } },
      },
      take: 10,
      orderBy: { scheduledMonth: 'asc' },
    });

    const upcomingServices = upcomingAssignments.map((a) => ({
      carId: a.car.id,
      vehicleNumber: a.car.railcarNumber,
      railcarNumber: a.car.railcarNumber,
      scheduledDate: `${a.scheduledMonth}-15`,
      shopName: a.shop.name,
    }));

    res.json({
      totalCars,
      totalShops,
      activePlans,
      carsInService,
      carsInQueue,
      totalCarsInShop,
      shopsWithCars: shopsWithCarsCount,
      activeScenarios,
      monthlyServiceCounts,
      shopPerformance,
      costBreakdown,
      upcomingServices,
      // Enhanced dashboard data
      myQueue: myQueueCars.map(car => ({
        id: car.id,
        railcarNumber: car.railcarNumber || car.vehicleNumber,
        customer: car.customer,
        reasonShopped: car.reasonShopped,
        nextServiceDue: car.nextServiceDue,
        daysUntilDue: car.nextServiceDue
          ? Math.ceil((new Date(car.nextServiceDue).getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24))
          : null,
      })),
      inShopStatus: inShopCars.map(car => ({
        id: car.id,
        railcarNumber: car.railcarNumber || car.vehicleNumber,
        customer: car.customer,
        status: car.status,
        shopName: car.assignedShop?.name || 'Unknown',
        shopCode: car.assignedShop?.code || '',
        daysInShop: car.daysInShop,
        shopEntryDate: car.shopEntryDate,
      })),
      alerts: {
        overdueCars,
        capacityAlerts,
        hasAlerts: overdueCars > 0 || capacityAlerts.length > 0,
      },
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    // Return partial data with error flag so dashboard can still show something
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      message: 'Internal server error',
      error: errorMessage,
      // Return safe defaults so dashboard doesn't completely break
      partialData: {
        totalCars: 0,
        totalShops: 0,
        activePlans: 0,
        carsInService: 0,
        carsInQueue: 0,
        totalCarsInShop: 0,
        shopsWithCars: 0,
        activeScenarios: 0,
        monthlyServiceCounts: [],
        shopPerformance: [],
        costBreakdown: [],
        upcomingServices: [],
        myQueue: [],
        inShopStatus: [],
        alerts: { overdueCars: 0, capacityAlerts: [], hasAlerts: false },
      }
    });
  }
});

// Get shop performance details
router.get('/shops/:id', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const { start, end } = req.query;

  try {
    const shop = await prisma.shop.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
      include: {
        assignments: {
          where: {
            scheduledMonth: {
              gte: start as string,
              lte: end as string,
            },
          },
          include: { car: true },
        },
      },
    });

    if (!shop) {
      res.status(404).json({ message: 'Shop not found' });
      return;
    }

    const monthlyData: Record<string, { count: number; totalDuration: number }> = {};
    shop.assignments.forEach((a) => {
      if (!monthlyData[a.scheduledMonth]) {
        monthlyData[a.scheduledMonth] = { count: 0, totalDuration: 0 };
      }
      monthlyData[a.scheduledMonth].count++;
      monthlyData[a.scheduledMonth].totalDuration += a.estimatedDuration;
    });

    res.json({
      shop: {
        id: shop.id,
        name: shop.name,
        capacity: shop.capacity,
        costMultiplier: shop.costMultiplier,
        turnTimeMultiplier: shop.turnTimeMultiplier,
      },
      totalServices: shop.assignments.length,
      averageTurnTime: shop.assignments.length > 0
        ? shop.assignments.reduce((sum, a) => sum + a.estimatedDuration, 0) / shop.assignments.length
        : 0,
      monthlyBreakdown: Object.entries(monthlyData).map(([month, data]) => ({
        month,
        services: data.count,
        avgDuration: data.totalDuration / data.count,
      })),
    });
  } catch (error) {
    console.error('Get shop performance error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get car service history
router.get('/cars/:id/history', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

  try {
    const car = await prisma.car.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
      include: {
        assignments: {
          include: { shop: true },
          orderBy: { scheduledMonth: 'desc' },
        },
      },
    });

    if (!car) {
      res.status(404).json({ message: 'Car not found' });
      return;
    }

    res.json({
      car: {
        id: car.id,
        vehicleNumber: car.vehicleNumber,
        make: car.make,
        model: car.model,
        year: car.year,
        mileage: car.mileage,
        status: car.status,
      },
      serviceHistory: car.assignments.map((a) => ({
        id: a.id,
        scheduledMonth: a.scheduledMonth,
        shopName: a.shop.name,
        estimatedCost: a.estimatedCost,
        estimatedDuration: a.estimatedDuration,
        status: a.status,
      })),
      totalServices: car.assignments.length,
      totalCost: car.assignments.reduce((sum, a) => sum + a.estimatedCost, 0),
    });
  } catch (error) {
    console.error('Get car history error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get cost analysis
router.get('/costs', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const { planId } = req.query;

  try {
    const where = {
      plan: { companyId: req.user!.companyId },
      ...(planId && { planId: planId as string }),
    };

    const assignments = await prisma.planAssignment.findMany({
      where,
      include: {
        shop: true,
        car: true,
      },
    });

    const totalCost = assignments.reduce((sum, a) => sum + a.estimatedCost * a.shop.costMultiplier, 0);

    // Group by shop
    const byShop: Record<string, number> = {};
    assignments.forEach((a) => {
      const shopName = a.shop.name;
      byShop[shopName] = (byShop[shopName] || 0) + a.estimatedCost * a.shop.costMultiplier;
    });

    // Group by month
    const byMonth: Record<string, number> = {};
    assignments.forEach((a) => {
      byMonth[a.scheduledMonth] = (byMonth[a.scheduledMonth] || 0) + a.estimatedCost * a.shop.costMultiplier;
    });

    res.json({
      totalCost: Math.round(totalCost),
      byShop: Object.entries(byShop).map(([shop, cost]) => ({ shop, cost: Math.round(cost) })),
      byMonth: Object.entries(byMonth)
        .map(([month, cost]) => ({ month, cost: Math.round(cost) }))
        .sort((a, b) => a.month.localeCompare(b.month)),
    });
  } catch (error) {
    console.error('Get cost analysis error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Export report
router.get('/export/:reportType', async (req: AuthRequest, res: Response) => {
  const { format } = req.query;
  const { reportType } = req.params;

  // In a real app, this would generate actual reports
  const csvContent = `Report Type,${reportType}\nGenerated,${new Date().toISOString()}\nFormat,${format}`;

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${reportType}-report.csv`);
    res.send(csvContent);
  } else {
    // For xlsx and pdf, you'd use libraries like exceljs or pdfkit
    res.status(501).json({ message: 'Export format not yet implemented' });
  }
});

// =============================================================================
// ADVANCED ANALYTICS - KPIs and Forecasting
// =============================================================================

// Get Key Performance Indicators
router.get('/kpis', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

  try {
    const companyId = req.user!.companyId;
    const currentDate = new Date();
    const currentMonth = currentDate.toISOString().slice(0, 7);
    const lastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
      .toISOString().slice(0, 7);

    // Get completed assignments for OTP calculation
    const completedAssignments = await prisma.planAssignment.findMany({
      where: {
        plan: { companyId },
        status: 'completed',
      },
      include: {
        shop: true,
      },
    });

    // Calculate On-Time Performance (mock - in real app, compare actual vs scheduled)
    const totalCompleted = completedAssignments.length;
    const onTimeCount = Math.round(totalCompleted * 0.87); // 87% on-time (simulated)
    const onTimePerformance = totalCompleted > 0 ? (onTimeCount / totalCompleted) * 100 : 0;

    // Calculate MTTR (Mean Time To Repair)
    const mttr = completedAssignments.length > 0
      ? completedAssignments.reduce((sum, a) => sum + a.estimatedDuration, 0) / completedAssignments.length
      : 0;

    // Get shop utilization
    const shops = await prisma.shop.findMany({
      where: { companyId, isActive: true },
      include: {
        assignments: {
          where: { scheduledMonth: currentMonth },
        },
      },
    });

    const avgUtilization = shops.length > 0
      ? shops.reduce((sum, shop) => {
          const util = (shop.assignments.length / shop.capacity) * 100;
          return sum + Math.min(util, 100);
        }, 0) / shops.length
      : 0;

    // Calculate cost efficiency (actual vs estimated)
    const totalEstimatedCost = completedAssignments.reduce((sum, a) => sum + a.estimatedCost, 0);
    const costVariance = 0.95; // 5% under budget (simulated)

    // Fleet availability
    const [totalCars, availableCars] = await Promise.all([
      prisma.car.count({ where: { companyId } }),
      prisma.car.count({ where: { companyId, status: 'available' } }),
    ]);
    const fleetAvailability = totalCars > 0 ? (availableCars / totalCars) * 100 : 0;

    // Rework rate
    const reworkRate = 2.3; // 2.3% rework (simulated)

    // Get comparison with previous period
    const prevMonthAssignments = await prisma.planAssignment.count({
      where: {
        plan: { companyId },
        scheduledMonth: lastMonth,
      },
    });

    const currentMonthAssignments = await prisma.planAssignment.count({
      where: {
        plan: { companyId },
        scheduledMonth: currentMonth,
      },
    });

    const volumeChange = prevMonthAssignments > 0
      ? ((currentMonthAssignments - prevMonthAssignments) / prevMonthAssignments) * 100
      : 0;

    res.json({
      kpis: {
        onTimePerformance: {
          value: Math.round(onTimePerformance * 10) / 10,
          unit: '%',
          trend: 2.5, // +2.5% vs last month
          status: onTimePerformance >= 90 ? 'good' : onTimePerformance >= 80 ? 'warning' : 'critical',
        },
        mttr: {
          value: Math.round(mttr * 10) / 10,
          unit: 'days',
          trend: -0.5, // -0.5 days (improvement)
          status: mttr <= 14 ? 'good' : mttr <= 21 ? 'warning' : 'critical',
        },
        shopUtilization: {
          value: Math.round(avgUtilization * 10) / 10,
          unit: '%',
          trend: 1.2,
          status: avgUtilization >= 75 && avgUtilization <= 95 ? 'good' : 'warning',
        },
        costEfficiency: {
          value: Math.round(costVariance * 100),
          unit: '%',
          trend: 3.0, // 3% better than last month
          status: costVariance >= 0.95 ? 'good' : costVariance >= 0.90 ? 'warning' : 'critical',
        },
        fleetAvailability: {
          value: Math.round(fleetAvailability * 10) / 10,
          unit: '%',
          trend: -1.2,
          status: fleetAvailability >= 70 ? 'good' : fleetAvailability >= 50 ? 'warning' : 'critical',
        },
        reworkRate: {
          value: reworkRate,
          unit: '%',
          trend: -0.3, // Improved by 0.3%
          status: reworkRate <= 3 ? 'good' : reworkRate <= 5 ? 'warning' : 'critical',
        },
      },
      volumeMetrics: {
        currentMonth: currentMonthAssignments,
        previousMonth: prevMonthAssignments,
        change: Math.round(volumeChange * 10) / 10,
        totalYTD: completedAssignments.length,
        totalEstimatedCost: Math.round(totalEstimatedCost),
      },
    });
  } catch (error) {
    console.error('Get KPIs error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get capacity forecast
router.get('/forecast', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const { months = 6 } = req.query;

  try {
    const companyId = req.user!.companyId;
    const forecastMonths = Math.min(parseInt(months as string) || 6, 24);
    const currentDate = new Date();

    // Get shops with capacity
    const shops = await prisma.shop.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        capacity: true,
        qualCapacity: true,
        assignCapacity: true,
        region: true,
      },
    });

    // Get historical assignments for trend analysis
    const sixMonthsAgo = new Date(currentDate.getFullYear(), currentDate.getMonth() - 6, 1);
    const historicalAssignments = await prisma.planAssignment.groupBy({
      by: ['scheduledMonth', 'shopId'],
      where: {
        plan: { companyId },
        scheduledMonth: { gte: sixMonthsAgo.toISOString().slice(0, 7) },
      },
      _count: true,
    });

    // Build forecast data
    const forecast = [];
    for (let i = 0; i < forecastMonths; i++) {
      const forecastDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 1);
      const monthKey = forecastDate.toISOString().slice(0, 7);

      // Get existing assignments for this month
      const plannedAssignments = await prisma.planAssignment.groupBy({
        by: ['shopId'],
        where: {
          plan: { companyId },
          scheduledMonth: monthKey,
        },
        _count: true,
      });

      const plannedByShop: Record<string, number> = {};
      plannedAssignments.forEach((a: { shopId: string; _count: number }) => {
        plannedByShop[a.shopId] = a._count;
      });

      // Calculate total capacity and utilization
      let totalCapacity = 0;
      let totalPlanned = 0;
      const shopForecasts = shops.map((shop) => {
        const planned = plannedByShop[shop.id] || 0;
        totalCapacity += shop.capacity;
        totalPlanned += planned;

        // Simple forecast based on historical trend (could be ML-based in production)
        const growthFactor = 1 + (i * 0.02); // 2% growth per month
        const projected = Math.round(planned * growthFactor);

        return {
          shopId: shop.id,
          shopName: shop.name,
          shopCode: shop.code,
          region: shop.region,
          capacity: shop.capacity,
          planned,
          projected,
          utilization: Math.round((planned / shop.capacity) * 100),
          projectedUtilization: Math.round((projected / shop.capacity) * 100),
          available: shop.capacity - planned,
        };
      });

      forecast.push({
        month: monthKey,
        label: forecastDate.toLocaleString('default', { month: 'short', year: 'numeric' }),
        totalCapacity,
        totalPlanned,
        totalProjected: Math.round(totalPlanned * (1 + i * 0.02)),
        utilization: Math.round((totalPlanned / totalCapacity) * 100),
        shops: shopForecasts,
      });
    }

    // Aggregate by region
    const regionCapacity: Record<string, { capacity: number; planned: number }> = {};
    shops.forEach((shop) => {
      const region = shop.region || 'Unknown';
      if (!regionCapacity[region]) {
        regionCapacity[region] = { capacity: 0, planned: 0 };
      }
      regionCapacity[region].capacity += shop.capacity;
    });

    res.json({
      forecast,
      summary: {
        totalShops: shops.length,
        totalMonthlyCapacity: shops.reduce((sum, s) => sum + s.capacity, 0),
        regions: Object.entries(regionCapacity).map(([region, data]) => ({
          region,
          ...data,
          utilization: data.capacity > 0 ? Math.round((data.planned / data.capacity) * 100) : 0,
        })),
      },
    });
  } catch (error) {
    console.error('Get forecast error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get shop performance trends
router.get('/trends/shops', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const { period = '6m' } = req.query;

  try {
    const companyId = req.user!.companyId;

    // Calculate date range based on period
    const currentDate = new Date();
    let startDate: Date;
    switch (period) {
      case '1m':
        startDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
        break;
      case '3m':
        startDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 3, 1);
        break;
      case '12m':
        startDate = new Date(currentDate.getFullYear() - 1, currentDate.getMonth(), 1);
        break;
      case '6m':
      default:
        startDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 6, 1);
    }

    // Get shop performance records
    const performances = await prisma.shopPerformance.findMany({
      where: {
        companyId,
        periodStart: { gte: startDate },
      },
      orderBy: { periodStart: 'asc' },
    });

    // Group by shop
    const shopTrends: Record<string, {
      shopId: string;
      periods: Array<{
        date: string;
        turnTime: number;
        onTimeRate: number;
        reworkRate: number;
        costVariance: number;
        score: number;
      }>;
    }> = {};

    // Get shop names
    const shops = await prisma.shop.findMany({
      where: { companyId },
      select: { id: true, name: true, code: true },
    });
    const shopMap = new Map<string, { id: string; name: string; code: string }>(shops.map(s => [s.id, s]));

    performances.forEach((perf) => {
      if (!shopTrends[perf.shopId]) {
        const shop = shopMap.get(perf.shopId);
        shopTrends[perf.shopId] = {
          shopId: perf.shopId,
          periods: [],
        };
      }

      shopTrends[perf.shopId].periods.push({
        date: perf.periodStart.toISOString().slice(0, 7),
        turnTime: perf.averageTurnTime,
        onTimeRate: perf.onTimeRate,
        reworkRate: perf.reworkRate,
        costVariance: perf.costVariance,
        score: perf.performanceScore,
      });
    });

    // If no real performance data, generate sample trends
    if (Object.keys(shopTrends).length === 0) {
      const sampleShops = shops.slice(0, 5);
      sampleShops.forEach((shop, idx) => {
        shopTrends[shop.id] = {
          shopId: shop.id,
          periods: [],
        };

        // Generate 6 months of sample data
        for (let i = 5; i >= 0; i--) {
          const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
          shopTrends[shop.id].periods.push({
            date: date.toISOString().slice(0, 7),
            turnTime: 12 + Math.random() * 6 + idx,
            onTimeRate: 82 + Math.random() * 15,
            reworkRate: 1 + Math.random() * 4,
            costVariance: -5 + Math.random() * 10,
            score: 75 + Math.random() * 20,
          });
        }
      });
    }

    res.json({
      period,
      trends: Object.entries(shopTrends).map(([shopId, data]) => {
        const shop = shopMap.get(shopId);
        return {
          shopId,
          shopName: shop?.name || 'Unknown',
          shopCode: shop?.code || '',
          ...data,
        };
      }),
    });
  } catch (error) {
    console.error('Get shop trends error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get fleet analytics
router.get('/fleet', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

  try {
    const companyId = req.user!.companyId;

    // Get car status distribution
    const statusCounts = await prisma.car.groupBy({
      by: ['status'],
      where: { companyId },
      _count: true,
    });

    // Get car type distribution
    const typeCounts = await prisma.car.groupBy({
      by: ['carType'],
      where: { companyId },
      _count: true,
    });

    // Get region distribution
    const regionCounts = await prisma.car.groupBy({
      by: ['homeRegion'],
      where: { companyId },
      _count: true,
    });

    // Get customer distribution
    const customerCounts = await prisma.car.groupBy({
      by: ['customer'],
      where: { companyId },
      _count: true,
      orderBy: { _count: { customer: 'desc' } },
      take: 10,
    });

    // Get age distribution (by build year)
    const cars = await prisma.car.findMany({
      where: { companyId, buildYear: { not: null } },
      select: { buildYear: true },
    });

    const currentYear = new Date().getFullYear();
    const ageBuckets = {
      '0-5 years': 0,
      '6-10 years': 0,
      '11-20 years': 0,
      '21-30 years': 0,
      '30+ years': 0,
    };

    cars.forEach((car) => {
      const age = currentYear - (car.buildYear || currentYear);
      if (age <= 5) ageBuckets['0-5 years']++;
      else if (age <= 10) ageBuckets['6-10 years']++;
      else if (age <= 20) ageBuckets['11-20 years']++;
      else if (age <= 30) ageBuckets['21-30 years']++;
      else ageBuckets['30+ years']++;
    });

    // Get qualification status
    const [qualifiedCount, unqualifiedCount] = await Promise.all([
      prisma.car.count({ where: { companyId, tankQualified: true } }),
      prisma.car.count({ where: { companyId, tankQualified: false } }),
    ]);

    res.json({
      statusDistribution: statusCounts.map((s: { status: string; _count: number }) => ({
        status: s.status,
        count: s._count,
      })),
      typeDistribution: typeCounts
        .filter((t: { carType: string; _count: number }) => t.carType)
        .map((t: { carType: string; _count: number }) => ({
          type: t.carType,
          count: t._count,
        })),
      regionDistribution: regionCounts
        .filter((r: { homeRegion: string; _count: number }) => r.homeRegion)
        .map((r: { homeRegion: string; _count: number }) => ({
          region: r.homeRegion,
          count: r._count,
        })),
      topCustomers: customerCounts
        .filter((c: { customer: string; _count: number }) => c.customer)
        .map((c: { customer: string; _count: number }) => ({
          customer: c.customer,
          count: c._count,
        })),
      ageDistribution: Object.entries(ageBuckets).map(([range, count]) => ({
        range,
        count,
      })),
      qualificationStatus: {
        qualified: qualifiedCount,
        unqualified: unqualifiedCount,
        total: qualifiedCount + unqualifiedCount,
        rate: qualifiedCount + unqualifiedCount > 0
          ? Math.round((qualifiedCount / (qualifiedCount + unqualifiedCount)) * 100)
          : 0,
      },
    });
  } catch (error) {
    console.error('Get fleet analytics error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
