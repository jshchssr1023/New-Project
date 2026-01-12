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
    const currentYear = currentDate.getFullYear();

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

    // Get shops with cars that have "Arrived" status (shops currently receiving cars)
    const carsWithArrivedStatus = await prisma.car.findMany({
      where: {
        companyId,
        status: { in: ['Arrived', 'arrived', 'In Shop', 'in_shop'] },
        assignedShopId: { not: null },
      },
      select: { assignedShopId: true },
    });
    const uniqueShopsWithArrivedCars = new Set(carsWithArrivedStatus.map((c: { assignedShopId: string }) => c.assignedShopId));
    const shopsWithCarsCount = uniqueShopsWithArrivedCars.size;

    // ==========================================================================
    // S&OP PLANNING SUMMARY - Calculate from car data and CarFlowPlan
    // ==========================================================================

    // Get all cars with their planning status
    const allCarsForSOP = await prisma.car.findMany({
      where: { companyId },
      select: {
        id: true,
        railcarNumber: true,
        customer: true,
        planStatus: true,
        status: true,
        tankQualDueDate: true,
        contractExpiration: true,
        minNoLining: true,
        minWLining: true,
        interiorLining: true,
        rule88B: true,
        safetyRelief: true,
        serviceEquipment: true,
        stubSill: true,
        tankThickness: true,
        tankQualification: true,
      },
    });

    // Get all active CarFlowPlans
    const activeCarFlowPlans = await prisma.carFlowPlan.findMany({
      where: {
        companyId,
        status: { in: ['Planned', 'In Progress', 'confirmed', 'Confirmed'] },
      },
      select: {
        carId: true,
        status: true,
      },
    });

    // Create a map of carId to CarFlowPlan status
    const carPlanStatusMap = new Map<string, string>();
    activeCarFlowPlans.forEach((plan: { carId: string; status: string }) => {
      carPlanStatusMap.set(plan.carId, plan.status);
    });

    // Calculate S&OP metrics
    let sopNotPlanned = 0;
    let sopOverdue = 0;
    let sopPlanned = 0;
    let sopScheduled = 0;

    allCarsForSOP.forEach((car: any) => {
      const hasCarFlowPlan = carPlanStatusMap.has(car.id);
      const carFlowPlanStatus = carPlanStatusMap.get(car.id) || '';
      const planStatusLower = (car.planStatus || '').toLowerCase().trim();

      // Check if car is scheduled (confirmed status in CarFlowPlan)
      if (carFlowPlanStatus.toLowerCase() === 'confirmed' ||
          carFlowPlanStatus.toLowerCase() === 'in progress' ||
          planStatusLower === 'committed') {
        sopScheduled++;
        return;
      }

      // Check if car has a shopping plan (any active CarFlowPlan)
      if (hasCarFlowPlan || planStatusLower === 'planned') {
        sopPlanned++;
        return;
      }

      // Check if overdue (any qualification date in prior years)
      const qualDates = [
        car.tankQualDueDate,
        car.contractExpiration,
        car.minNoLining,
        car.minWLining,
        car.interiorLining,
        car.rule88B,
        car.safetyRelief,
        car.serviceEquipment,
        car.stubSill,
        car.tankThickness,
        car.tankQualification,
      ].filter(Boolean);

      let isOverdue = false;
      for (const dateStr of qualDates) {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime()) && date.getFullYear() < currentYear) {
          isOverdue = true;
          break;
        }
      }

      if (isOverdue) {
        sopOverdue++;
        return;
      }

      // Check if not planned (planStatus is "Not planned" or empty and no CarFlowPlan)
      if (planStatusLower === 'not planned' || planStatusLower === 'not confirmed' ||
          planStatusLower === 'not committed' || planStatusLower === '' || !hasCarFlowPlan) {
        sopNotPlanned++;
      }
    });

    // ==========================================================================
    // MY QUEUE - Cars with no plan, listed by car number and customer
    // ==========================================================================
    const myQueueCars = await prisma.car.findMany({
      where: {
        companyId,
        OR: [
          { planStatus: { in: ['', 'Not planned', 'Not Planned', 'not planned', 'Not Confirmed', 'Not Committed'] } },
          { planStatus: null },
        ],
        // Exclude cars already in shop or completed
        status: { notIn: ['in_shop', 'In Shop', 'Arrived', 'arrived', 'Complete', 'complete', 'completed'] },
        // Ensure car doesn't have an active CarFlowPlan
        carFlowPlans: {
          none: {
            status: { in: ['Planned', 'In Progress', 'confirmed', 'Confirmed'] },
          },
        },
      },
      orderBy: [
        { railcarNumber: 'asc' },
      ],
      take: 20,
    });

    // Get "In Shop Status" - cars currently in service or arrived at shop
    // Include various status formats: 'Arrived' (from CSV), 'arrived', 'in_shop', 'in_service'
    const inShopCars = await prisma.car.findMany({
      where: {
        companyId,
        OR: [
          { status: { in: ['Arrived', 'arrived', 'in_service', 'in_shop', 'In Shop'] } },
          // Also check if car has an active CarFlowPlan with 'In Progress' status
          { carFlowPlans: { some: { status: 'In Progress' } } },
        ],
      },
      include: {
        assignedShop: {
          select: { name: true, code: true },
        },
        carFlowPlans: {
          where: { status: { in: ['Planned', 'In Progress'] } },
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: {
            shop: {
              select: { name: true, code: true },
            },
          },
        },
      },
      orderBy: { daysInShop: 'desc' },
      take: 20,
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

    // Get shops over capacity using groupBy aggregation (fixes N+1 query)
    const [shops, assignmentCounts] = await Promise.all([
      prisma.shop.findMany({
        where: {
          companyId,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          code: true,
          capacity: true,
        },
      }),
      // SST: Use CarFlowPlan instead of legacy PlanAssignment
      prisma.carFlowPlan.groupBy({
        by: ['shopId'],
        where: {
          plannedMonth: parseInt(currentMonth.split('-')[1]),
          plannedYear: parseInt(currentMonth.split('-')[0]),
          status: { in: ['Planned', 'InProgress'] },
          car: { companyId },
        },
        _count: { id: true },
      }),
    ]);

    // Build Map for O(1) lookup
    const assignmentMap = new Map(
      assignmentCounts.map(a => [a.shopId, a._count.id])
    );

    const capacityAlerts = shops
      .map(shop => {
        const currentLoad = assignmentMap.get(shop.id) || 0;
        return {
          shopName: shop.name,
          shopCode: shop.code,
          capacity: shop.capacity,
          currentLoad,
          overloadPercent: shop.capacity > 0
            ? Math.round(((currentLoad - shop.capacity) / shop.capacity) * 100)
            : 0,
        };
      })
      .filter(shop => shop.currentLoad > shop.capacity);

    // SST: Get monthly service counts from CarFlowPlan
    const carFlowPlans = await prisma.carFlowPlan.findMany({
      where: {
        car: { companyId },
        status: { in: ['Planned', 'InProgress', 'Complete'] },
      },
      select: { plannedMonth: true, plannedYear: true },
    });

    const monthCounts: Record<string, number> = {};
    carFlowPlans.forEach((p) => {
      const monthKey = `${p.plannedYear}-${String(p.plannedMonth).padStart(2, '0')}`;
      monthCounts[monthKey] = (monthCounts[monthKey] || 0) + 1;
    });

    const monthlyServiceCounts = Object.entries(monthCounts)
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);

    // SST: Get shop performance from CarFlowPlan
    const shopsWithPlans = await prisma.shop.findMany({
      where: { companyId, isActive: true },
      include: {
        carFlowPlans: {
          where: { status: { in: ['Planned', 'InProgress', 'Complete'] } },
          include: { car: { select: { estimatedDaysInShop: true } } },
        },
      },
    });

    const shopPerformance = shopsWithPlans.map((shop) => ({
      shopId: shop.id,
      shopName: shop.name,
      utilization: Math.min(100, Math.round((shop.carFlowPlans.length / (shop.capacity * 12)) * 100)),
      avgTurnTime: shop.carFlowPlans.length > 0
        ? Math.round(shop.carFlowPlans.reduce((sum, p) => sum + (p.car?.estimatedDaysInShop || 14), 0) / shop.carFlowPlans.length)
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

    // SST: Upcoming services from CarFlowPlan
    const currentMonthNum = parseInt(currentMonth.split('-')[1]);
    const currentYearNum = parseInt(currentMonth.split('-')[0]);
    const upcomingCarFlowPlans = await prisma.carFlowPlan.findMany({
      where: {
        companyId,
        status: { in: ['Planned', 'Confirmed'] },
        OR: [
          { plannedYear: { gt: currentYearNum } },
          { plannedYear: currentYearNum, plannedMonth: { gte: currentMonthNum } },
        ],
      },
      include: {
        car: { select: { id: true, railcarNumber: true } },
        shop: { select: { name: true } },
      },
      take: 10,
      orderBy: [{ plannedYear: 'asc' }, { plannedMonth: 'asc' }],
    });

    const upcomingServices = upcomingCarFlowPlans.map((p) => ({
      carId: p.car.id,
      vehicleNumber: p.car.railcarNumber,
      railcarNumber: p.car.railcarNumber,
      scheduledDate: `${p.plannedYear}-${String(p.plannedMonth).padStart(2, '0')}-15`,
      shopName: p.shop.name,
    }));

    // ==========================================================================
    // MONTHLY SHOPPINGS BY NETWORK - Stacked bar chart data
    // ==========================================================================
    const carFlowPlansWithShops = await prisma.carFlowPlan.findMany({
      where: {
        companyId,
        status: { in: ['Planned', 'In Progress', 'confirmed', 'Confirmed', 'Complete'] },
        plannedYear: { gte: currentYear - 1, lte: currentYear + 1 },
      },
      include: {
        shop: {
          select: {
            id: true,
            name: true,
            code: true,
            isAitxInternal: true,
            networkId: true,
          },
        },
      },
    });

    // Group by month and network
    const monthlyByNetwork: Record<string, { aitx: number; thirdParty: number; total: number; byShop: Record<string, number> }> = {};

    carFlowPlansWithShops.forEach((plan: any) => {
      const monthKey = `${plan.plannedYear}-${String(plan.plannedMonth).padStart(2, '0')}`;
      if (!monthlyByNetwork[monthKey]) {
        monthlyByNetwork[monthKey] = { aitx: 0, thirdParty: 0, total: 0, byShop: {} };
      }

      monthlyByNetwork[monthKey].total++;
      if (plan.shop?.isAitxInternal) {
        monthlyByNetwork[monthKey].aitx++;
      } else {
        monthlyByNetwork[monthKey].thirdParty++;
      }

      // Track by shop for drill-down
      const shopKey = plan.shop?.name || 'Unknown';
      monthlyByNetwork[monthKey].byShop[shopKey] = (monthlyByNetwork[monthKey].byShop[shopKey] || 0) + 1;
    });

    // Convert to array and sort
    const monthlyShoppings = Object.entries(monthlyByNetwork)
      .map(([month, data]) => ({
        month,
        aitx: data.aitx,
        thirdParty: data.thirdParty,
        total: data.total,
        byShop: data.byShop,
      }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);

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
      // S&OP Planning Summary data
      sopSummary: {
        notPlanned: sopNotPlanned,
        overdue: sopOverdue,
        planned: sopPlanned,
        scheduled: sopScheduled,
      },
      // Monthly shoppings by network for stacked bar chart
      monthlyShoppings,
      // Enhanced dashboard data - My Queue with cars that have no plan
      myQueue: myQueueCars.map((car: any) => ({
        id: car.id,
        railcarNumber: car.railcarNumber,
        customer: car.customer || '',
        planStatus: car.planStatus || 'Not Planned',
        status: car.status,
      })),
      inShopStatus: inShopCars.map((car: any) => {
        // Get the active CarFlowPlan (first one in the filtered array)
        const activeFlowPlan = car.carFlowPlans?.[0];
        // Prefer CarFlowPlan shop over assignedShop (carFlowPlan is the active commitment)
        const shopName = activeFlowPlan?.shop?.name || car.assignedShop?.name || 'Unknown';
        const shopCode = activeFlowPlan?.shop?.code || car.assignedShop?.code || '';

        // Calculate days in shop if not set
        let daysInShop = car.daysInShop || 0;
        if (!daysInShop && car.shopEntryDate) {
          const entryDate = new Date(car.shopEntryDate);
          const now = new Date();
          daysInShop = Math.floor((now.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
        } else if (!daysInShop && car.arrivalDate) {
          const entryDate = new Date(car.arrivalDate);
          const now = new Date();
          daysInShop = Math.floor((now.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
        }

        return {
          id: car.id,
          railcarNumber: car.railcarNumber || car.vehicleNumber,
          customer: car.customer,
          status: car.status,
          shopName,
          shopCode,
          daysInShop,
          shopEntryDate: car.shopEntryDate || car.arrivalDate,
        };
      }),
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
        sopSummary: { notPlanned: 0, overdue: 0, planned: 0, scheduled: 0 },
        monthlyShoppings: [],
      }
    });
  }
});

// SST: Get shop performance details from CarFlowPlan
router.get('/shops/:id', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const { start, end } = req.query;

  try {
    // Parse date range for year/month filtering
    const startYear = start ? parseInt((start as string).split('-')[0]) : null;
    const startMonth = start ? parseInt((start as string).split('-')[1]) : null;
    const endYear = end ? parseInt((end as string).split('-')[0]) : null;
    const endMonth = end ? parseInt((end as string).split('-')[1]) : null;

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

    // Build CarFlowPlan filter for date range
    const planFilter: any = { shopId: shop.id };
    if (startYear && startMonth && endYear && endMonth) {
      planFilter.OR = [
        { plannedYear: { gt: startYear, lt: endYear } },
        { plannedYear: startYear, plannedMonth: { gte: startMonth } },
        { plannedYear: endYear, plannedMonth: { lte: endMonth } },
      ];
    }

    const carFlowPlans = await prisma.carFlowPlan.findMany({
      where: planFilter,
      include: { car: { select: { id: true, railcarNumber: true, estimatedDaysInShop: true } } },
    });

    // Group by month
    const monthlyData: Record<string, { count: number; totalDuration: number }> = {};
    carFlowPlans.forEach((p) => {
      const monthKey = `${p.plannedYear}-${String(p.plannedMonth).padStart(2, '0')}`;
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { count: 0, totalDuration: 0 };
      }
      monthlyData[monthKey].count++;
      monthlyData[monthKey].totalDuration += p.car?.estimatedDaysInShop || 14;
    });

    res.json({
      shop: {
        id: shop.id,
        name: shop.name,
        capacity: shop.capacity,
        costMultiplier: shop.costMultiplier,
        turnTimeMultiplier: shop.turnTimeMultiplier,
      },
      totalServices: carFlowPlans.length,
      averageTurnTime: carFlowPlans.length > 0
        ? carFlowPlans.reduce((sum, p) => sum + (p.car?.estimatedDaysInShop || 14), 0) / carFlowPlans.length
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

// SST: Get car service history from CarFlowPlan
router.get('/cars/:id/history', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

  try {
    const car = await prisma.car.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
      include: {
        carFlowPlans: {
          include: { shop: true },
          orderBy: [{ plannedYear: 'desc' }, { plannedMonth: 'desc' }],
        },
      },
    });

    if (!car) {
      res.status(404).json({ message: 'Car not found' });
      return;
    }

    // Calculate estimated cost from car fields
    const estimatedServiceCost = car.estimatedServiceCost || 0;

    res.json({
      car: {
        id: car.id,
        vehicleNumber: car.vehicleNumber || car.railcarNumber,
        railcarNumber: car.railcarNumber,
        make: car.make,
        model: car.model,
        year: car.year || car.buildYear,
        mileage: car.mileage,
        status: car.status,
      },
      serviceHistory: car.carFlowPlans.map((p) => ({
        id: p.id,
        scheduledMonth: `${p.plannedYear}-${String(p.plannedMonth).padStart(2, '0')}`,
        shopName: p.shop?.name || 'Unknown',
        estimatedCost: estimatedServiceCost * (p.shop?.costMultiplier || 1),
        estimatedDuration: car.estimatedDaysInShop || 14,
        status: p.status,
      })),
      totalServices: car.carFlowPlans.length,
      totalCost: car.carFlowPlans.reduce((sum, p) => sum + estimatedServiceCost * (p.shop?.costMultiplier || 1), 0),
    });
  } catch (error) {
    console.error('Get car history error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// SST: Get cost analysis from CarFlowPlan
router.get('/costs', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

  try {
    const companyId = req.user!.companyId;

    // Get all CarFlowPlans with shop data for cost calculation
    const carFlowPlans = await prisma.carFlowPlan.findMany({
      where: {
        companyId,
        status: { in: ['Planned', 'InProgress', 'Complete'] },
      },
      include: {
        shop: true,
        car: true,
      },
    });

    // Calculate costs using estimated cost from car and shop multiplier
    const totalCost = carFlowPlans.reduce((sum, p) => {
      const baseCost = p.car?.estimatedServiceCost || 0;
      const multiplier = p.shop?.costMultiplier || 1;
      return sum + baseCost * multiplier;
    }, 0);

    // Group by shop
    const byShop: Record<string, number> = {};
    carFlowPlans.forEach((p) => {
      const shopName = p.shop?.name || 'Unknown';
      const baseCost = p.car?.estimatedServiceCost || 0;
      const multiplier = p.shop?.costMultiplier || 1;
      byShop[shopName] = (byShop[shopName] || 0) + baseCost * multiplier;
    });

    // Group by month (year-month format)
    const byMonth: Record<string, number> = {};
    carFlowPlans.forEach((p) => {
      const monthKey = `${p.plannedYear}-${String(p.plannedMonth).padStart(2, '0')}`;
      const baseCost = p.car?.estimatedServiceCost || 0;
      const multiplier = p.shop?.costMultiplier || 1;
      byMonth[monthKey] = (byMonth[monthKey] || 0) + baseCost * multiplier;
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

    // SST: Get completed CarFlowPlans for OTP calculation
    const completedPlans = await prisma.carFlowPlan.findMany({
      where: {
        companyId,
        status: 'Complete',
      },
      include: {
        shop: true,
        car: true,
      },
    });

    // Calculate On-Time Performance (mock - in real app, compare actual vs scheduled)
    const totalCompleted = completedPlans.length;
    const onTimeCount = Math.round(totalCompleted * 0.87); // 87% on-time (simulated)
    const onTimePerformance = totalCompleted > 0 ? (onTimeCount / totalCompleted) * 100 : 0;

    // Calculate MTTR (Mean Time To Repair) - use car's estimatedDaysInShop
    const mttr = completedPlans.length > 0
      ? completedPlans.reduce((sum, p) => sum + (p.car?.estimatedDaysInShop || 14), 0) / completedPlans.length
      : 0;

    // SST: Get shop utilization using CarFlowPlan counts
    const currentMonthNum = parseInt(currentMonth.split('-')[1]);
    const currentYearNum = parseInt(currentMonth.split('-')[0]);

    const [shops, planCounts] = await Promise.all([
      prisma.shop.findMany({
        where: { companyId, isActive: true },
        select: { id: true, capacity: true },
      }),
      prisma.carFlowPlan.groupBy({
        by: ['shopId'],
        where: {
          companyId,
          plannedMonth: currentMonthNum,
          plannedYear: currentYearNum,
          status: { in: ['Planned', 'InProgress'] },
        },
        _count: { id: true },
      }),
    ]);

    const planCountMap = new Map(planCounts.map(p => [p.shopId, p._count.id]));
    const avgUtilization = shops.length > 0
      ? shops.reduce((sum, shop) => {
          const count = planCountMap.get(shop.id) || 0;
          const util = (count / shop.capacity) * 100;
          return sum + Math.min(util, 100);
        }, 0) / shops.length
      : 0;

    // Calculate cost efficiency - use car's estimated cost
    const totalEstimatedCost = completedPlans.reduce((sum, p) => sum + (p.car?.estimatedServiceCost || 0), 0);
    const costVariance = 0.95; // 5% under budget (simulated)

    // Fleet availability
    const [totalCars, availableCars] = await Promise.all([
      prisma.car.count({ where: { companyId } }),
      prisma.car.count({ where: { companyId, status: 'available' } }),
    ]);
    const fleetAvailability = totalCars > 0 ? (availableCars / totalCars) * 100 : 0;

    // Rework rate
    const reworkRate = 2.3; // 2.3% rework (simulated)

    // SST: Get comparison with previous period using CarFlowPlan
    const lastMonthNum = parseInt(lastMonth.split('-')[1]);
    const lastYearNum = parseInt(lastMonth.split('-')[0]);

    const [prevMonthCount, currentMonthCount] = await Promise.all([
      prisma.carFlowPlan.count({
        where: {
          companyId,
          plannedMonth: lastMonthNum,
          plannedYear: lastYearNum,
        },
      }),
      prisma.carFlowPlan.count({
        where: {
          companyId,
          plannedMonth: currentMonthNum,
          plannedYear: currentYearNum,
        },
      }),
    ]);

    const prevMonthAssignments = prevMonthCount;
    const currentMonthAssignments = currentMonthCount;

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
        totalYTD: completedPlans.length,
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

    // SST: Get historical CarFlowPlans for trend analysis
    const sixMonthsAgo = new Date(currentDate.getFullYear(), currentDate.getMonth() - 6, 1);
    const historicalPlans = await prisma.carFlowPlan.groupBy({
      by: ['plannedYear', 'plannedMonth', 'shopId'],
      where: {
        companyId,
        OR: [
          { plannedYear: { gt: sixMonthsAgo.getFullYear() } },
          {
            plannedYear: sixMonthsAgo.getFullYear(),
            plannedMonth: { gte: sixMonthsAgo.getMonth() + 1 },
          },
        ],
      },
      _count: { id: true },
    });

    // Build forecast data
    const forecast = [];
    for (let i = 0; i < forecastMonths; i++) {
      const forecastDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 1);
      const forecastYear = forecastDate.getFullYear();
      const forecastMonth = forecastDate.getMonth() + 1;
      const monthKey = forecastDate.toISOString().slice(0, 7);

      // SST: Get CarFlowPlan counts for this month
      const plannedCounts = await prisma.carFlowPlan.groupBy({
        by: ['shopId'],
        where: {
          companyId,
          plannedYear: forecastYear,
          plannedMonth: forecastMonth,
          status: { in: ['Planned', 'InProgress', 'Confirmed'] },
        },
        _count: { id: true },
      });

      const plannedByShop: Record<string, number> = {};
      plannedCounts.forEach((p: { shopId: string; _count: { id: number } }) => {
        plannedByShop[p.shopId] = p._count.id;
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
