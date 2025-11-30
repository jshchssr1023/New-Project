/**
 * Public API v1 - Shops Endpoints
 *
 * Provides read access to shop data and capacity information.
 */

import { Router, Response } from 'express';
import { ApiAuthRequest, requireApiPermission } from '../../../middleware/apiAuth';
import { prisma } from '../../../services/db';

const router = Router();

/**
 * GET /api/v1/shops
 * List shops with filtering
 */
router.get('/', requireApiPermission('read:shops'), async (req: ApiAuthRequest, res: Response) => {
  const companyId = req.companyId!;
  const {
    region,
    tankQualified,
    isActive,
    network,
  } = req.query;

  const where: any = { companyId };

  if (region) where.region = region;
  if (tankQualified !== undefined) where.tankQualified = tankQualified === 'true';
  if (isActive !== undefined) where.isActive = isActive === 'true';
  if (network) where.network = network;

  try {
    const shops = await prisma.shop.findMany({
      where,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        code: true,
        location: true,
        city: true,
        state: true,
        region: true,
        network: true,
        servingRailroad: true,
        isAitxInternal: true,
        tankQualified: true,
        networkTier: true,
        shopStatus: true,
        capacity: true,
        currentLoad: true,
        utilizationTarget: true,
        baseCostPerCar: true,
        baseTurnTime: true,
        capabilities: true,
        certifications: true,
        isActive: true,
        qualCapacity: true,
        assignCapacity: true,
        returnCapacity: true,
        repairCapacity: true,
        efficiencyRating: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Parse JSON fields
    const parsed = shops.map((shop) => ({
      ...shop,
      capabilities: shop.capabilities ? JSON.parse(shop.capabilities) : [],
      certifications: shop.certifications ? JSON.parse(shop.certifications) : [],
    }));

    res.json({ data: parsed });
  } catch (error) {
    console.error('API v1 shops list error:', error);
    res.status(500).json({ error: 'internal_error', message: 'Failed to fetch shops' });
  }
});

/**
 * GET /api/v1/shops/:id
 * Get single shop details
 */
router.get('/:id', requireApiPermission('read:shops'), async (req: ApiAuthRequest, res: Response) => {
  const companyId = req.companyId!;
  const { id } = req.params;

  try {
    const shop = await prisma.shop.findFirst({
      where: { id, companyId },
    });

    if (!shop) {
      return res.status(404).json({ error: 'not_found', message: 'Shop not found' });
    }

    res.json({
      data: {
        ...shop,
        capabilities: shop.capabilities ? JSON.parse(shop.capabilities) : [],
        certifications: shop.certifications ? JSON.parse(shop.certifications) : [],
        preferredCustomers: shop.preferredCustomers ? JSON.parse(shop.preferredCustomers) : [],
      },
    });
  } catch (error) {
    console.error('API v1 shop detail error:', error);
    res.status(500).json({ error: 'internal_error', message: 'Failed to fetch shop' });
  }
});

/**
 * GET /api/v1/shops/:id/capacity
 * Get shop capacity by month
 */
router.get('/:id/capacity', requireApiPermission('read:shops'), async (req: ApiAuthRequest, res: Response) => {
  const companyId = req.companyId!;
  const { id } = req.params;
  const { months = '6' } = req.query;

  const monthCount = Math.min(24, Math.max(1, parseInt(months as string)));

  try {
    const shop = await prisma.shop.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        name: true,
        code: true,
        capacity: true,
        qualCapacity: true,
        assignCapacity: true,
        returnCapacity: true,
        repairCapacity: true,
      },
    });

    if (!shop) {
      return res.status(404).json({ error: 'not_found', message: 'Shop not found' });
    }

    // Get capacity slots
    const startMonth = new Date().toISOString().slice(0, 7);
    const slots = await prisma.shopCapacitySlot.findMany({
      where: {
        shopId: id,
        monthKey: { gte: startMonth },
      },
      orderBy: { monthKey: 'asc' },
      take: monthCount * 4, // 4 slot types per month max
    });

    // Get commitments by month
    const commitmentsByMonth = await prisma.masterPlanCommitment.groupBy({
      by: ['scheduledMonth'],
      where: {
        shopId: id,
        masterPlan: { companyId, status: { in: ['active', 'approved'] } },
        scheduledMonth: { gte: startMonth },
      },
      _count: true,
    });

    const commitmentMap = Object.fromEntries(
      commitmentsByMonth.map((c) => [c.scheduledMonth, c._count])
    );

    // Generate monthly capacity view
    const monthlyCapacity = [];
    const now = new Date();
    for (let i = 0; i < monthCount; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthKey = d.toISOString().slice(0, 7);
      const committed = commitmentMap[monthKey] || 0;
      const monthSlots = slots.filter((s) => s.monthKey === monthKey);

      monthlyCapacity.push({
        month: monthKey,
        totalCapacity: shop.capacity,
        committed,
        available: Math.max(0, shop.capacity - committed),
        utilization: shop.capacity > 0 ? Math.round((committed / shop.capacity) * 100) : 0,
        slots: monthSlots.map((s) => ({
          type: s.slotType,
          capacity: s.capacity,
          used: s.used,
          available: s.capacity - s.used,
        })),
      });
    }

    res.json({
      data: {
        shop: {
          id: shop.id,
          name: shop.name,
          code: shop.code,
          monthlyCapacity: shop.capacity,
          capacityByType: {
            qualification: shop.qualCapacity,
            assignment: shop.assignCapacity,
            return: shop.returnCapacity,
            repair: shop.repairCapacity,
          },
        },
        months: monthlyCapacity,
      },
    });
  } catch (error) {
    console.error('API v1 shop capacity error:', error);
    res.status(500).json({ error: 'internal_error', message: 'Failed to fetch shop capacity' });
  }
});

/**
 * GET /api/v1/shops/:id/performance
 * Get shop performance metrics
 */
router.get('/:id/performance', requireApiPermission('read:shops'), async (req: ApiAuthRequest, res: Response) => {
  const companyId = req.companyId!;
  const { id } = req.params;
  const { periodType = 'monthly' } = req.query;

  try {
    const shop = await prisma.shop.findFirst({
      where: { id, companyId },
      select: { id: true, name: true, code: true },
    });

    if (!shop) {
      return res.status(404).json({ error: 'not_found', message: 'Shop not found' });
    }

    const performance = await prisma.shopPerformance.findMany({
      where: {
        shopId: id,
        companyId,
        periodType: periodType as string,
      },
      orderBy: { periodStart: 'desc' },
      take: 12,
    });

    res.json({
      data: {
        shop,
        metrics: performance.map((p) => ({
          period: {
            start: p.periodStart,
            end: p.periodEnd,
            type: p.periodType,
          },
          turnTime: {
            average: p.averageTurnTime,
            byRepairType: JSON.parse(p.turnTimeByRepairType),
          },
          onTimePerformance: {
            total: p.totalCompleted,
            onTime: p.onTimeCompleted,
            rate: p.onTimeRate,
          },
          dwellTime: p.averageDwellTime,
          quality: {
            released: p.totalReleased,
            rework: p.reworkCount,
            reworkRate: p.reworkRate,
          },
          cost: {
            estimated: p.totalEstimatedCost,
            actual: p.totalActualCost,
            variance: p.costVariance,
          },
          score: p.performanceScore,
        })),
      },
    });
  } catch (error) {
    console.error('API v1 shop performance error:', error);
    res.status(500).json({ error: 'internal_error', message: 'Failed to fetch shop performance' });
  }
});

/**
 * GET /api/v1/shops/regions
 * Get available regions
 */
router.get('/meta/regions', requireApiPermission('read:shops'), async (req: ApiAuthRequest, res: Response) => {
  const companyId = req.companyId!;

  try {
    const regions = await prisma.shop.groupBy({
      by: ['region'],
      where: { companyId, isActive: true, region: { not: '' } },
      _count: true,
    });

    res.json({
      data: regions.map((r) => ({
        region: r.region,
        shopCount: r._count,
      })),
    });
  } catch (error) {
    console.error('API v1 shop regions error:', error);
    res.status(500).json({ error: 'internal_error', message: 'Failed to fetch regions' });
  }
});

export default router;
