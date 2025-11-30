/**
 * Public API v1 - Plans Endpoints
 *
 * Provides read access to master plans and commitments.
 */

import { Router, Response } from 'express';
import { ApiAuthRequest, requireApiPermission } from '../../../middleware/apiAuth';
import { prisma } from '../../../services/db';

const router = Router();

/**
 * GET /api/v1/plans
 * List master plans
 */
router.get('/', requireApiPermission('read:plans'), async (req: ApiAuthRequest, res: Response) => {
  const companyId = req.companyId!;
  const { fiscalYear, status } = req.query;

  const where: any = { companyId };

  if (fiscalYear) where.fiscalYear = parseInt(fiscalYear as string);
  if (status) where.status = status;

  try {
    const plans = await prisma.masterPlan.findMany({
      where,
      orderBy: [{ fiscalYear: 'desc' }, { version: 'desc' }],
      include: {
        _count: { select: { commitments: true } },
        approvedBy: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
    });

    res.json({
      data: plans.map((p) => ({
        id: p.id,
        name: p.planName,
        fiscalYear: p.fiscalYear,
        version: p.version,
        status: p.status,
        validFrom: p.validFrom,
        validTo: p.validTo,
        commitmentCount: p._count.commitments,
        approvedAt: p.approvedAt,
        approvedBy: p.approvedBy
          ? `${p.approvedBy.firstName} ${p.approvedBy.lastName}`
          : null,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
    });
  } catch (error) {
    console.error('API v1 plans list error:', error);
    res.status(500).json({ error: 'internal_error', message: 'Failed to fetch plans' });
  }
});

/**
 * GET /api/v1/plans/active
 * Get the current active plan
 */
router.get('/active', requireApiPermission('read:plans'), async (req: ApiAuthRequest, res: Response) => {
  const companyId = req.companyId!;

  try {
    const activePlan = await prisma.masterPlan.findFirst({
      where: { companyId, status: 'active' },
      include: {
        _count: { select: { commitments: true } },
        approvedBy: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    if (!activePlan) {
      return res.status(404).json({ error: 'not_found', message: 'No active plan found' });
    }

    res.json({
      data: {
        id: activePlan.id,
        name: activePlan.planName,
        fiscalYear: activePlan.fiscalYear,
        version: activePlan.version,
        status: activePlan.status,
        validFrom: activePlan.validFrom,
        validTo: activePlan.validTo,
        commitmentCount: activePlan._count.commitments,
        approvedAt: activePlan.approvedAt,
        approvedBy: activePlan.approvedBy
          ? `${activePlan.approvedBy.firstName} ${activePlan.approvedBy.lastName}`
          : null,
      },
    });
  } catch (error) {
    console.error('API v1 active plan error:', error);
    res.status(500).json({ error: 'internal_error', message: 'Failed to fetch active plan' });
  }
});

/**
 * GET /api/v1/plans/:id
 * Get plan details
 */
router.get('/:id', requireApiPermission('read:plans'), async (req: ApiAuthRequest, res: Response) => {
  const companyId = req.companyId!;
  const { id } = req.params;

  try {
    const plan = await prisma.masterPlan.findFirst({
      where: { id, companyId },
      include: {
        _count: { select: { commitments: true } },
        approvedBy: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
    });

    if (!plan) {
      return res.status(404).json({ error: 'not_found', message: 'Plan not found' });
    }

    // Get summary stats
    const [byStatus, byShop, byMonth] = await Promise.all([
      prisma.masterPlanCommitment.groupBy({
        by: ['status'],
        where: { masterPlanId: id },
        _count: true,
      }),
      prisma.masterPlanCommitment.groupBy({
        by: ['shopId'],
        where: { masterPlanId: id },
        _count: true,
      }),
      prisma.masterPlanCommitment.groupBy({
        by: ['scheduledMonth'],
        where: { masterPlanId: id },
        _count: true,
        orderBy: { scheduledMonth: 'asc' },
      }),
    ]);

    res.json({
      data: {
        id: plan.id,
        name: plan.planName,
        fiscalYear: plan.fiscalYear,
        version: plan.version,
        status: plan.status,
        validFrom: plan.validFrom,
        validTo: plan.validTo,
        commitmentCount: plan._count.commitments,
        approvedAt: plan.approvedAt,
        approvedBy: plan.approvedBy
          ? {
              name: `${plan.approvedBy.firstName} ${plan.approvedBy.lastName}`,
              email: plan.approvedBy.email,
            }
          : null,
        summary: {
          byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
          byShop: byShop.length,
          byMonth: byMonth.map((m) => ({ month: m.scheduledMonth, count: m._count })),
        },
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
      },
    });
  } catch (error) {
    console.error('API v1 plan detail error:', error);
    res.status(500).json({ error: 'internal_error', message: 'Failed to fetch plan' });
  }
});

/**
 * GET /api/v1/plans/:id/commitments
 * Get commitments for a plan
 */
router.get('/:id/commitments', requireApiPermission('read:plans'), async (req: ApiAuthRequest, res: Response) => {
  const companyId = req.companyId!;
  const { id } = req.params;
  const {
    page = '1',
    limit = '50',
    shopId,
    customerId,
    status,
    month,
  } = req.query;

  const pageNum = Math.max(1, parseInt(page as string));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
  const skip = (pageNum - 1) * limitNum;

  try {
    // Verify plan exists and belongs to company
    const plan = await prisma.masterPlan.findFirst({
      where: { id, companyId },
      select: { id: true },
    });

    if (!plan) {
      return res.status(404).json({ error: 'not_found', message: 'Plan not found' });
    }

    const where: any = { masterPlanId: id };
    if (shopId) where.shopId = shopId;
    if (customerId) where.customerId = customerId;
    if (status) where.status = status;
    if (month) where.scheduledMonth = month;

    const [commitments, total] = await Promise.all([
      prisma.masterPlanCommitment.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: [{ scheduledMonth: 'asc' }, { priority: 'asc' }],
        include: {
          car: {
            select: { id: true, railcarNumber: true, carType: true, customer: true },
          },
          shop: {
            select: { id: true, name: true, code: true },
          },
          customer: {
            select: { id: true, name: true, code: true },
          },
        },
      }),
      prisma.masterPlanCommitment.count({ where }),
    ]);

    res.json({
      data: commitments.map((c) => ({
        id: c.id,
        scheduledMonth: c.scheduledMonth,
        workTypes: JSON.parse(c.workTypes),
        isBundled: c.isBundled,
        status: c.status,
        priority: c.priority,
        estimatedCost: c.estimatedCost,
        plannedArrival: c.plannedArrival,
        plannedRelease: c.plannedRelease,
        car: c.car,
        shop: c.shop,
        customer: c.customer,
        notes: c.notes,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
        hasMore: pageNum * limitNum < total,
      },
    });
  } catch (error) {
    console.error('API v1 commitments list error:', error);
    res.status(500).json({ error: 'internal_error', message: 'Failed to fetch commitments' });
  }
});

/**
 * GET /api/v1/plans/:id/schedule
 * Get schedule view by month
 */
router.get('/:id/schedule', requireApiPermission('read:plans'), async (req: ApiAuthRequest, res: Response) => {
  const companyId = req.companyId!;
  const { id } = req.params;
  const { shopId } = req.query;

  try {
    const plan = await prisma.masterPlan.findFirst({
      where: { id, companyId },
      select: { id: true, planName: true, validFrom: true, validTo: true },
    });

    if (!plan) {
      return res.status(404).json({ error: 'not_found', message: 'Plan not found' });
    }

    const where: any = { masterPlanId: id };
    if (shopId) where.shopId = shopId;

    const commitments = await prisma.masterPlanCommitment.groupBy({
      by: ['scheduledMonth', 'shopId'],
      where,
      _count: true,
    });

    // Get shop names
    const shopIds = [...new Set(commitments.map((c) => c.shopId))];
    const shops = await prisma.shop.findMany({
      where: { id: { in: shopIds } },
      select: { id: true, name: true, code: true },
    });
    const shopMap = Object.fromEntries(shops.map((s) => [s.id, s]));

    // Group by month
    const schedule: Record<string, any[]> = {};
    commitments.forEach((c) => {
      if (!schedule[c.scheduledMonth]) {
        schedule[c.scheduledMonth] = [];
      }
      schedule[c.scheduledMonth].push({
        shop: shopMap[c.shopId] || { id: c.shopId },
        count: c._count,
      });
    });

    res.json({
      data: {
        plan: {
          id: plan.id,
          name: plan.planName,
          validFrom: plan.validFrom,
          validTo: plan.validTo,
        },
        schedule: Object.entries(schedule)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, shops]) => ({
            month,
            total: shops.reduce((sum, s) => sum + s.count, 0),
            shops,
          })),
      },
    });
  } catch (error) {
    console.error('API v1 plan schedule error:', error);
    res.status(500).json({ error: 'internal_error', message: 'Failed to fetch schedule' });
  }
});

export default router;
