import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Get dashboard analytics
router.get('/dashboard', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;

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
        car: { select: { id: true, vehicleNumber: true, railcarNumber: true } },
        shop: { select: { name: true } },
      },
      take: 10,
      orderBy: { scheduledMonth: 'asc' },
    });

    const upcomingServices = upcomingAssignments.map((a) => ({
      carId: a.car.id,
      vehicleNumber: a.car.railcarNumber || a.car.vehicleNumber,
      railcarNumber: a.car.railcarNumber || a.car.vehicleNumber,
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
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get shop performance details
router.get('/shops/:id', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
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
  const prisma: PrismaClient = req.app.locals.prisma;

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
  const prisma: PrismaClient = req.app.locals.prisma;
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

export default router;
