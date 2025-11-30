/**
 * Public API v1 - Cars Endpoints
 *
 * Provides read access to fleet data.
 */

import { Router, Response } from 'express';
import { ApiAuthRequest, requireApiPermission } from '../../../middleware/apiAuth';
import { prisma } from '../../../services/db';

const router = Router();

/**
 * GET /api/v1/cars
 * List cars with pagination and filtering
 */
router.get('/', requireApiPermission('read:cars'), async (req: ApiAuthRequest, res: Response) => {
  const companyId = req.companyId!;
  const {
    page = '1',
    limit = '50',
    status,
    carType,
    customer,
    shopId,
    region,
  } = req.query;

  const pageNum = Math.max(1, parseInt(page as string));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
  const skip = (pageNum - 1) * limitNum;

  const where: any = { companyId };

  if (status) where.status = status;
  if (carType) where.carType = carType;
  if (customer) where.customer = { contains: customer as string };
  if (shopId) where.assignedShopId = shopId;
  if (region) where.homeRegion = region;

  try {
    const [cars, total] = await Promise.all([
      prisma.car.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          railcarNumber: true,
          carType: true,
          isTankCar: true,
          commodity: true,
          customer: true,
          status: true,
          currentLocation: true,
          assignedShopId: true,
          projectedCompletionMonth: true,
          projectedCost: true,
          homeRegion: true,
          qualificationType: true,
          tankQualified: true,
          tankQualDueDate: true,
          lastServiceDate: true,
          nextServiceDue: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.car.count({ where }),
    ]);

    res.json({
      data: cars,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
        hasMore: pageNum * limitNum < total,
      },
    });
  } catch (error) {
    console.error('API v1 cars list error:', error);
    res.status(500).json({ error: 'internal_error', message: 'Failed to fetch cars' });
  }
});

/**
 * GET /api/v1/cars/:id
 * Get single car details
 */
router.get('/:id', requireApiPermission('read:cars'), async (req: ApiAuthRequest, res: Response) => {
  const companyId = req.companyId!;
  const { id } = req.params;

  try {
    const car = await prisma.car.findFirst({
      where: { id, companyId },
      include: {
        shopEligibilities: {
          where: { isEligible: true },
          include: {
            shop: {
              select: { id: true, name: true, code: true },
            },
          },
        },
        masterCommitments: {
          where: {
            masterPlan: { status: 'active' },
          },
          include: {
            shop: {
              select: { id: true, name: true, code: true },
            },
            masterPlan: {
              select: { id: true, planName: true, fiscalYear: true },
            },
          },
          orderBy: { scheduledMonth: 'asc' },
          take: 5,
        },
      },
    });

    if (!car) {
      return res.status(404).json({ error: 'not_found', message: 'Car not found' });
    }

    res.json({ data: car });
  } catch (error) {
    console.error('API v1 car detail error:', error);
    res.status(500).json({ error: 'internal_error', message: 'Failed to fetch car' });
  }
});

/**
 * GET /api/v1/cars/:id/history
 * Get car service history
 */
router.get('/:id/history', requireApiPermission('read:cars'), async (req: ApiAuthRequest, res: Response) => {
  const companyId = req.companyId!;
  const { id } = req.params;

  try {
    // Verify car belongs to company
    const car = await prisma.car.findFirst({
      where: { id, companyId },
      select: { id: true, railcarNumber: true },
    });

    if (!car) {
      return res.status(404).json({ error: 'not_found', message: 'Car not found' });
    }

    // Get commitment history
    const commitments = await prisma.masterPlanCommitment.findMany({
      where: { carId: id },
      include: {
        shop: {
          select: { id: true, name: true, code: true },
        },
        masterPlan: {
          select: { id: true, planName: true, fiscalYear: true, status: true },
        },
      },
      orderBy: { scheduledMonth: 'desc' },
    });

    res.json({
      data: {
        carId: car.id,
        railcarNumber: car.railcarNumber,
        history: commitments.map((c) => ({
          id: c.id,
          scheduledMonth: c.scheduledMonth,
          shop: c.shop,
          workTypes: JSON.parse(c.workTypes),
          status: c.status,
          estimatedCost: c.estimatedCost,
          plan: c.masterPlan,
        })),
      },
    });
  } catch (error) {
    console.error('API v1 car history error:', error);
    res.status(500).json({ error: 'internal_error', message: 'Failed to fetch car history' });
  }
});

/**
 * GET /api/v1/cars/stats
 * Get fleet statistics
 */
router.get('/stats/summary', requireApiPermission('read:cars'), async (req: ApiAuthRequest, res: Response) => {
  const companyId = req.companyId!;

  try {
    const [total, byStatus, byCarType, byRegion] = await Promise.all([
      prisma.car.count({ where: { companyId } }),
      prisma.car.groupBy({
        by: ['status'],
        where: { companyId },
        _count: true,
      }),
      prisma.car.groupBy({
        by: ['carType'],
        where: { companyId },
        _count: true,
      }),
      prisma.car.groupBy({
        by: ['homeRegion'],
        where: { companyId, homeRegion: { not: '' } },
        _count: true,
      }),
    ]);

    res.json({
      data: {
        total,
        byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
        byCarType: Object.fromEntries(byCarType.filter((t) => t.carType).map((t) => [t.carType, t._count])),
        byRegion: Object.fromEntries(byRegion.map((r) => [r.homeRegion, r._count])),
      },
    });
  } catch (error) {
    console.error('API v1 car stats error:', error);
    res.status(500).json({ error: 'internal_error', message: 'Failed to fetch car statistics' });
  }
});

export default router;
