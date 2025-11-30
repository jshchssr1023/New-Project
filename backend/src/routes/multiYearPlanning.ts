/**
 * Multi-Year Planning API Routes
 *
 * Provides endpoints for 24-36 month strategic planning projections.
 */

import { Router, Request, Response } from 'express';
import { authenticateToken, AuthRequest, requireRole } from '../middleware/auth';
import { prisma } from '../services/db';
import { createMultiYearPlanningService, MultiYearPlanConfig } from '../services/multiYearPlanningService';

const router = Router();
const planningService = createMultiYearPlanningService(prisma);

router.use(authenticateToken);

/**
 * Get multi-year projection
 */
router.get('/projection', requireRole(['admin', 'planner']), async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const companyId = authReq.user?.companyId;

  if (!companyId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const {
    startMonth,
    horizonMonths = '24',
    growthRate = '0.03',
    inflationRate = '0.025',
  } = req.query;

  // Default to current month if not specified
  const start = (startMonth as string) || new Date().toISOString().slice(0, 7);

  // Validate horizon months (24 or 36)
  const horizon = parseInt(horizonMonths as string);
  if (horizon !== 24 && horizon !== 36 && horizon !== 12) {
    return res.status(400).json({ error: 'Horizon must be 12, 24, or 36 months' });
  }

  const config: MultiYearPlanConfig = {
    companyId,
    startMonth: start,
    horizonMonths: horizon,
    growthRate: parseFloat(growthRate as string),
    inflationRate: parseFloat(inflationRate as string),
  };

  try {
    const projection = await planningService.generateMultiYearProjection(config);
    res.json(projection);
  } catch (error) {
    console.error('Error generating multi-year projection:', error);
    res.status(500).json({ error: 'Failed to generate projection' });
  }
});

/**
 * Get budget projection
 */
router.get('/budget', requireRole(['admin', 'planner', 'finance']), async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const companyId = authReq.user?.companyId;

  if (!companyId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const {
    startMonth,
    horizonMonths = '24',
  } = req.query;

  const start = (startMonth as string) || new Date().toISOString().slice(0, 7);
  const horizon = parseInt(horizonMonths as string);

  try {
    const budget = await planningService.getBudgetProjection(companyId, start, horizon);
    res.json(budget);
  } catch (error) {
    console.error('Error generating budget projection:', error);
    res.status(500).json({ error: 'Failed to generate budget projection' });
  }
});

/**
 * Get fiscal year comparison
 */
router.get('/fiscal-years', requireRole(['admin', 'planner']), async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const companyId = authReq.user?.companyId;

  if (!companyId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Get master plans by fiscal year
    const plans = await prisma.masterPlan.findMany({
      where: { companyId },
      include: {
        _count: { select: { commitments: true } },
      },
      orderBy: [{ fiscalYear: 'desc' }, { version: 'desc' }],
    });

    // Group by fiscal year
    const byYear: Record<number, {
      fiscalYear: number;
      plans: Array<{
        id: string;
        name: string;
        version: number;
        status: string;
        commitmentCount: number;
        validFrom: Date;
        validTo: Date;
      }>;
      totalCommitments: number;
    }> = {};

    plans.forEach((plan) => {
      if (!byYear[plan.fiscalYear]) {
        byYear[plan.fiscalYear] = {
          fiscalYear: plan.fiscalYear,
          plans: [],
          totalCommitments: 0,
        };
      }

      byYear[plan.fiscalYear].plans.push({
        id: plan.id,
        name: plan.planName,
        version: plan.version,
        status: plan.status,
        commitmentCount: plan._count.commitments,
        validFrom: plan.validFrom,
        validTo: plan.validTo,
      });

      if (plan.status === 'active') {
        byYear[plan.fiscalYear].totalCommitments = plan._count.commitments;
      }
    });

    res.json({
      fiscalYears: Object.values(byYear).sort((a, b) => b.fiscalYear - a.fiscalYear),
    });
  } catch (error) {
    console.error('Error fetching fiscal years:', error);
    res.status(500).json({ error: 'Failed to fetch fiscal year data' });
  }
});

/**
 * Get capacity heatmap for multi-year view
 */
router.get('/capacity-heatmap', requireRole(['admin', 'planner']), async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const companyId = authReq.user?.companyId;

  if (!companyId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const {
    startMonth,
    horizonMonths = '24',
  } = req.query;

  const start = (startMonth as string) || new Date().toISOString().slice(0, 7);
  const horizon = parseInt(horizonMonths as string);

  try {
    // Get shops
    const shops = await prisma.shop.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        region: true,
        capacity: true,
      },
      orderBy: { name: 'asc' },
    });

    // Get commitments for the period
    const endDate = new Date(`${start}-01`);
    endDate.setMonth(endDate.getMonth() + horizon);
    const endMonth = endDate.toISOString().slice(0, 7);

    const commitments = await prisma.masterPlanCommitment.groupBy({
      by: ['shopId', 'scheduledMonth'],
      where: {
        masterPlan: {
          companyId,
          status: { in: ['active', 'approved', 'draft'] },
        },
        scheduledMonth: {
          gte: start,
          lte: endMonth,
        },
      },
      _count: true,
    });

    // Build heatmap data
    const commitmentMap: Record<string, Record<string, number>> = {};
    commitments.forEach((c: { shopId: string; scheduledMonth: string; _count: number }) => {
      if (!commitmentMap[c.shopId]) commitmentMap[c.shopId] = {};
      commitmentMap[c.shopId][c.scheduledMonth] = c._count;
    });

    // Generate months array
    const months: string[] = [];
    const startDate = new Date(`${start}-01`);
    for (let i = 0; i < horizon; i++) {
      const d = new Date(startDate);
      d.setMonth(d.getMonth() + i);
      months.push(d.toISOString().slice(0, 7));
    }

    // Build heatmap
    const heatmap = shops.map((shop) => ({
      shopId: shop.id,
      shopName: shop.name,
      shopCode: shop.code,
      region: shop.region,
      capacity: shop.capacity,
      months: months.map((month) => {
        const count = commitmentMap[shop.id]?.[month] || 0;
        const utilization = shop.capacity > 0 ? (count / shop.capacity) * 100 : 0;
        return {
          month,
          count,
          utilization: Math.round(utilization * 10) / 10,
          status: utilization > 90 ? 'critical' : utilization > 75 ? 'warning' : 'normal',
        };
      }),
    }));

    res.json({
      shops: heatmap,
      months,
      totalCapacityPerMonth: shops.reduce((sum, s) => sum + s.capacity, 0),
    });
  } catch (error) {
    console.error('Error generating capacity heatmap:', error);
    res.status(500).json({ error: 'Failed to generate capacity heatmap' });
  }
});

/**
 * Get quarterly summary
 */
router.get('/quarterly-summary', requireRole(['admin', 'planner', 'finance']), async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const companyId = authReq.user?.companyId;

  if (!companyId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const {
    startMonth,
    horizonMonths = '24',
  } = req.query;

  const start = (startMonth as string) || new Date().toISOString().slice(0, 7);
  const horizon = parseInt(horizonMonths as string);

  try {
    const projection = await planningService.generateMultiYearProjection({
      companyId,
      startMonth: start,
      horizonMonths: horizon,
      growthRate: 0.03,
      inflationRate: 0.025,
    });

    res.json({
      quarterlyTrends: projection.quarterlyTrends,
      fiscalYearSummaries: projection.fiscalYearSummaries,
      recommendations: projection.recommendations,
    });
  } catch (error) {
    console.error('Error generating quarterly summary:', error);
    res.status(500).json({ error: 'Failed to generate quarterly summary' });
  }
});

export default router;
