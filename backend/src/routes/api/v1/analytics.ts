/**
 * Public API v1 - Analytics Endpoints
 *
 * Provides read access to performance metrics and analytics.
 */

import { Router, Response } from 'express';
import { ApiAuthRequest, requireApiPermission } from '../../../middleware/apiAuth';
import { prisma } from '../../../services/db';

const router = Router();

/**
 * GET /api/v1/analytics/dashboard
 * Get dashboard summary metrics
 */
router.get('/dashboard', requireApiPermission('read:analytics'), async (req: ApiAuthRequest, res: Response) => {
  const companyId = req.companyId!;

  try {
    const [
      totalCars,
      totalShops,
      activeShops,
      activePlan,
      carsInShop,
      carsScheduled,
    ] = await Promise.all([
      prisma.car.count({ where: { companyId } }),
      prisma.shop.count({ where: { companyId } }),
      prisma.shop.count({ where: { companyId, isActive: true } }),
      prisma.masterPlan.findFirst({
        where: { companyId, status: 'active' },
        include: { _count: { select: { commitments: true } } },
      }),
      prisma.car.count({ where: { companyId, status: 'in_shop' } }),
      prisma.car.count({ where: { companyId, status: 'scheduled' } }),
    ]);

    res.json({
      data: {
        fleet: {
          total: totalCars,
          inShop: carsInShop,
          scheduled: carsScheduled,
          available: totalCars - carsInShop - carsScheduled,
        },
        shops: {
          total: totalShops,
          active: activeShops,
        },
        activePlan: activePlan
          ? {
              id: activePlan.id,
              name: activePlan.planName,
              fiscalYear: activePlan.fiscalYear,
              commitments: activePlan._count.commitments,
            }
          : null,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('API v1 dashboard error:', error);
    res.status(500).json({ error: 'internal_error', message: 'Failed to fetch dashboard' });
  }
});

/**
 * GET /api/v1/analytics/kpis
 * Get key performance indicators
 */
router.get('/kpis', requireApiPermission('read:analytics'), async (req: ApiAuthRequest, res: Response) => {
  const companyId = req.companyId!;
  const { period = '30' } = req.query;

  const periodDays = parseInt(period as string);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - periodDays);

  try {
    // Get recent performance data
    const recentPerformance = await prisma.shopPerformance.findMany({
      where: {
        companyId,
        periodStart: { gte: startDate },
        periodType: 'monthly',
      },
    });

    // Calculate averages
    const avgTurnTime = recentPerformance.length > 0
      ? recentPerformance.reduce((sum, p) => sum + p.averageTurnTime, 0) / recentPerformance.length
      : 0;

    const avgOTP = recentPerformance.length > 0
      ? recentPerformance.reduce((sum, p) => sum + p.onTimeRate, 0) / recentPerformance.length
      : 0;

    const avgReworkRate = recentPerformance.length > 0
      ? recentPerformance.reduce((sum, p) => sum + p.reworkRate, 0) / recentPerformance.length
      : 0;

    // Calculate utilization
    const shops = await prisma.shop.findMany({
      where: { companyId, isActive: true },
      select: { capacity: true, currentLoad: true },
    });

    const totalCapacity = shops.reduce((sum, s) => sum + s.capacity, 0);
    const totalLoad = shops.reduce((sum, s) => sum + s.currentLoad, 0);
    const utilization = totalCapacity > 0 ? (totalLoad / totalCapacity) * 100 : 0;

    res.json({
      data: {
        period: {
          days: periodDays,
          start: startDate.toISOString(),
          end: new Date().toISOString(),
        },
        kpis: {
          meanTurnTime: {
            value: Math.round(avgTurnTime * 10) / 10,
            unit: 'days',
            label: 'Mean Turn Time (MTTR)',
          },
          onTimePerformance: {
            value: Math.round(avgOTP * 10) / 10,
            unit: '%',
            label: 'On-Time Performance',
          },
          reworkRate: {
            value: Math.round(avgReworkRate * 10) / 10,
            unit: '%',
            label: 'Rework Rate',
          },
          shopUtilization: {
            value: Math.round(utilization * 10) / 10,
            unit: '%',
            label: 'Shop Utilization',
          },
          activeShops: {
            value: shops.length,
            unit: 'shops',
            label: 'Active Shops',
          },
        },
      },
    });
  } catch (error) {
    console.error('API v1 KPIs error:', error);
    res.status(500).json({ error: 'internal_error', message: 'Failed to fetch KPIs' });
  }
});

/**
 * GET /api/v1/analytics/capacity
 * Get capacity utilization by shop
 */
router.get('/capacity', requireApiPermission('read:analytics'), async (req: ApiAuthRequest, res: Response) => {
  const companyId = req.companyId!;
  const { months = '3' } = req.query;

  const monthCount = Math.min(12, Math.max(1, parseInt(months as string)));

  try {
    const shops = await prisma.shop.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        region: true,
        capacity: true,
        currentLoad: true,
      },
      orderBy: { name: 'asc' },
    });

    // Get commitments for next N months
    const startMonth = new Date().toISOString().slice(0, 7);
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + monthCount);
    const endMonth = endDate.toISOString().slice(0, 7);

    const commitments = await prisma.masterPlanCommitment.groupBy({
      by: ['shopId', 'scheduledMonth'],
      where: {
        masterPlan: { companyId, status: { in: ['active', 'approved'] } },
        scheduledMonth: { gte: startMonth, lte: endMonth },
      },
      _count: true,
    });

    // Build capacity data
    const shopCapacity = shops.map((shop) => {
      const shopCommitments = commitments.filter((c) => c.shopId === shop.id);
      const monthlyData: Record<string, number> = {};
      shopCommitments.forEach((c) => {
        monthlyData[c.scheduledMonth] = c._count;
      });

      const totalCommitted = Object.values(monthlyData).reduce((sum, v) => sum + v, 0);
      const avgMonthly = monthCount > 0 ? totalCommitted / monthCount : 0;

      return {
        shop: {
          id: shop.id,
          name: shop.name,
          code: shop.code,
          region: shop.region,
        },
        capacity: {
          monthly: shop.capacity,
          total: shop.capacity * monthCount,
        },
        committed: {
          total: totalCommitted,
          avgMonthly: Math.round(avgMonthly * 10) / 10,
        },
        utilization: shop.capacity > 0
          ? Math.round((avgMonthly / shop.capacity) * 1000) / 10
          : 0,
        byMonth: monthlyData,
      };
    });

    res.json({
      data: {
        period: {
          start: startMonth,
          end: endMonth,
          months: monthCount,
        },
        summary: {
          totalCapacity: shops.reduce((sum, s) => sum + s.capacity, 0) * monthCount,
          totalCommitted: shopCapacity.reduce((sum, s) => sum + s.committed.total, 0),
          avgUtilization: shopCapacity.length > 0
            ? Math.round(shopCapacity.reduce((sum, s) => sum + s.utilization, 0) / shopCapacity.length * 10) / 10
            : 0,
        },
        shops: shopCapacity,
      },
    });
  } catch (error) {
    console.error('API v1 capacity error:', error);
    res.status(500).json({ error: 'internal_error', message: 'Failed to fetch capacity' });
  }
});

/**
 * GET /api/v1/analytics/trends
 * Get historical trends
 */
router.get('/trends', requireApiPermission('read:analytics'), async (req: ApiAuthRequest, res: Response) => {
  const companyId = req.companyId!;
  const { metric = 'turn_time', months = '12' } = req.query;

  const monthCount = Math.min(24, Math.max(1, parseInt(months as string)));
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - monthCount);

  try {
    const performance = await prisma.shopPerformance.findMany({
      where: {
        companyId,
        periodStart: { gte: startDate },
        periodType: 'monthly',
      },
      orderBy: { periodStart: 'asc' },
    });

    // Group by period
    const byPeriod: Record<string, any[]> = {};
    performance.forEach((p) => {
      const key = p.periodStart.toISOString().slice(0, 7);
      if (!byPeriod[key]) byPeriod[key] = [];
      byPeriod[key].push(p);
    });

    // Calculate trend data
    const trends = Object.entries(byPeriod).map(([period, data]) => {
      const avg = (field: keyof typeof data[0]) =>
        data.reduce((sum, d) => sum + (d[field] as number), 0) / data.length;

      return {
        period,
        turnTime: Math.round(avg('averageTurnTime') * 10) / 10,
        onTimeRate: Math.round(avg('onTimeRate') * 10) / 10,
        reworkRate: Math.round(avg('reworkRate') * 10) / 10,
        dwellTime: Math.round(avg('averageDwellTime') * 10) / 10,
        performanceScore: Math.round(avg('performanceScore') * 10) / 10,
      };
    });

    res.json({
      data: {
        metric,
        months: monthCount,
        trends: trends.sort((a, b) => a.period.localeCompare(b.period)),
      },
    });
  } catch (error) {
    console.error('API v1 trends error:', error);
    res.status(500).json({ error: 'internal_error', message: 'Failed to fetch trends' });
  }
});

export default router;
