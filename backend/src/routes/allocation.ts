/**
 * Allocation Routes
 *
 * API endpoints for the S&OP Master Planning Engine:
 * - Auto-allocation engine
 * - Validation gatekeeper
 * - Urgency queue
 * - Shop capability profiles
 */

import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';
import {
  validateAllocation,
  validateBulkAllocations,
  getEligibleShopsForCar,
} from '../services/shopAllocationValidator';
import {
  runAutoAllocation,
  getUrgencyQueue,
  calculateUrgencyScore,
} from '../services/autoAllocationEngine';

const router = Router();

router.use(authenticate);

// ============================================================================
// AUTO-ALLOCATION ENDPOINTS
// ============================================================================

/**
 * Run the auto-allocation engine
 * POST /api/allocation/auto
 */
router.post('/auto', async (req: AuthRequest, res: Response) => {
  const prisma = req.app.locals.prisma;
  const {
    targetMonth,
    targetYear,
    prioritize3PCommitments = true,
    maxAllocationsPerRun = 100,
    allowOverCapacity = false,
    excludeShopIds = [],
  } = req.body;

  try {
    // Validate required fields
    if (!targetMonth || !targetYear) {
      res.status(400).json({
        message: 'targetMonth and targetYear are required',
      });
      return;
    }

    const result = await runAutoAllocation(prisma, req.user!.companyId, {
      targetMonth,
      targetYear,
      prioritize3PCommitments,
      maxAllocationsPerRun,
      allowOverCapacity,
      excludeShopIds,
    });

    res.json(result);
  } catch (error) {
    logger.error('Auto-allocation error:', error);
    res.status(500).json({ message: 'Failed to run auto-allocation' });
  }
});

/**
 * Get prioritized urgency queue
 * GET /api/allocation/urgency-queue
 */
router.get('/urgency-queue', async (req: AuthRequest, res: Response) => {
  const prisma = req.app.locals.prisma;
  const limit = parseInt(req.query.limit as string) || 100;

  try {
    const queue = await getUrgencyQueue(prisma, req.user!.companyId, limit);

    res.json({
      items: queue,
      total: queue.length,
    });
  } catch (error) {
    logger.error('Get urgency queue error:', error);
    res.status(500).json({ message: 'Failed to get urgency queue' });
  }
});

/**
 * Calculate urgency score for a specific car
 * GET /api/allocation/urgency/:carId
 */
router.get('/urgency/:carId', async (req: AuthRequest, res: Response) => {
  const prisma = req.app.locals.prisma;

  try {
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

    const urgencyScore = calculateUrgencyScore(car);

    res.json({
      carId: car.id,
      railcarNumber: car.railcarNumber,
      urgencyScore,
    });
  } catch (error) {
    logger.error('Get urgency score error:', error);
    res.status(500).json({ message: 'Failed to calculate urgency score' });
  }
});

// ============================================================================
// VALIDATION ENDPOINTS
// ============================================================================

/**
 * Validate a single car-shop allocation
 * POST /api/allocation/validate
 */
router.post('/validate', async (req: AuthRequest, res: Response) => {
  const prisma = req.app.locals.prisma;
  const { carId, shopId, plannedMonth, plannedYear } = req.body;

  try {
    if (!carId || !shopId) {
      res.status(400).json({ message: 'carId and shopId are required' });
      return;
    }

    // Get car
    const car = await prisma.car.findFirst({
      where: {
        id: carId,
        companyId: req.user!.companyId,
      },
    });

    if (!car) {
      res.status(404).json({ message: 'Car not found' });
      return;
    }

    // Get shop with capability profile
    const shop = await prisma.shop.findFirst({
      where: {
        id: shopId,
        companyId: req.user!.companyId,
      },
      include: {
        capabilityProfile: true,
      },
    });

    if (!shop) {
      res.status(404).json({ message: 'Shop not found' });
      return;
    }

    // Get current capacity usage
    const monthKey = plannedMonth && plannedYear
      ? `${plannedYear}-${String(plannedMonth).padStart(2, '0')}`
      : new Date().toISOString().slice(0, 7);

    const usageCount = await prisma.planAssignment.count({
      where: {
        shopId,
        scheduledMonth: monthKey,
      },
    });

    const result = await validateAllocation(
      prisma,
      car,
      shop as any,
      usageCount,
      req.user!.companyId
    );

    res.json({
      carId,
      shopId,
      monthKey,
      ...result,
    });
  } catch (error) {
    logger.error('Validate allocation error:', error);
    res.status(500).json({ message: 'Failed to validate allocation' });
  }
});

/**
 * Validate multiple car-shop allocations in bulk
 * POST /api/allocation/validate/bulk
 */
router.post('/validate/bulk', async (req: AuthRequest, res: Response) => {
  const prisma = req.app.locals.prisma;
  const { allocations } = req.body;

  try {
    if (!Array.isArray(allocations) || allocations.length === 0) {
      res.status(400).json({ message: 'allocations array is required' });
      return;
    }

    const results = await validateBulkAllocations(
      prisma,
      allocations,
      req.user!.companyId
    );

    const summary = {
      total: results.length,
      eligible: results.filter(r => r.result.isEligible).length,
      blocked: results.filter(r => !r.result.isEligible).length,
    };

    res.json({
      results,
      summary,
    });
  } catch (error) {
    logger.error('Bulk validate allocation error:', error);
    res.status(500).json({ message: 'Failed to validate allocations' });
  }
});

/**
 * Get all eligible shops for a specific car
 * GET /api/allocation/eligible-shops/:carId
 */
router.get('/eligible-shops/:carId', async (req: AuthRequest, res: Response) => {
  const prisma = req.app.locals.prisma;
  const { month, year } = req.query;

  try {
    const plannedMonth = month ? parseInt(month as string) : new Date().getMonth() + 1;
    const plannedYear = year ? parseInt(year as string) : new Date().getFullYear();

    const eligibleShops = await getEligibleShopsForCar(
      prisma,
      req.params.carId,
      plannedMonth,
      plannedYear,
      req.user!.companyId
    );

    res.json({
      carId: req.params.carId,
      targetMonth: plannedMonth,
      targetYear: plannedYear,
      shops: eligibleShops.map(es => ({
        id: es.shop.id,
        code: es.shop.code,
        name: es.shop.name,
        isAitxInternal: es.shop.isAitxInternal,
        tankQualified: es.shop.tankQualified,
        ...es.validation,
      })),
    });
  } catch (error) {
    logger.error('Get eligible shops error:', error);
    res.status(500).json({ message: 'Failed to get eligible shops' });
  }
});

// ============================================================================
// BULK ASSIGNMENT ENDPOINTS
// ============================================================================

/**
 * Bulk assign cars to shops
 * POST /api/allocation/bulk-assign
 */
router.post('/bulk-assign', async (req: AuthRequest, res: Response) => {
  const prisma = req.app.locals.prisma;
  const { assignments, scenarioId, validateFirst = true } = req.body;

  try {
    if (!Array.isArray(assignments) || assignments.length === 0) {
      res.status(400).json({ message: 'assignments array is required' });
      return;
    }

    // Validate all assignments first if requested
    if (validateFirst) {
      const validationResults = await validateBulkAllocations(
        prisma,
        assignments.map(a => ({
          carId: a.carId,
          shopId: a.shopId,
          plannedMonth: a.plannedMonth,
          plannedYear: a.plannedYear,
        })),
        req.user!.companyId
      );

      const blocked = validationResults.filter(r => !r.result.isEligible);
      if (blocked.length > 0) {
        res.status(400).json({
          message: `${blocked.length} assignments failed validation`,
          blockedAssignments: blocked,
        });
        return;
      }
    }

    // Create scenario cars or plan assignments
    const created: any[] = [];

    for (const assignment of assignments) {
      const monthKey = `${assignment.plannedYear}-${String(assignment.plannedMonth).padStart(2, '0')}`;

      if (scenarioId) {
        // Add to scenario
        const scenarioCar = await prisma.scenarioCar.upsert({
          where: {
            scenarioId_carId: {
              scenarioId,
              carId: assignment.carId,
            },
          },
          create: {
            scenarioId,
            carId: assignment.carId,
            shopId: assignment.shopId,
            plannedMonth: assignment.plannedMonth,
            plannedYear: assignment.plannedYear,
            scheduledMonth: monthKey,
            shopReason: assignment.shopReason || '',
            estimatedCost: assignment.estimatedCost || 0,
            estimatedDays: assignment.estimatedDays || 14,
          },
          update: {
            shopId: assignment.shopId,
            plannedMonth: assignment.plannedMonth,
            plannedYear: assignment.plannedYear,
            scheduledMonth: monthKey,
            shopReason: assignment.shopReason || '',
          },
        });
        created.push(scenarioCar);
      } else {
        // Direct assignment (for committed plans)
        const car = await prisma.car.update({
          where: { id: assignment.carId },
          data: {
            assignedShopId: assignment.shopId,
            projectedCompletionMonth: monthKey,
            shoppingStatus: 'Planned',
          },
        });
        created.push(car);
      }
    }

    res.json({
      success: true,
      created: created.length,
      assignments: created,
    });
  } catch (error) {
    logger.error('Bulk assign error:', error);
    res.status(500).json({ message: 'Failed to bulk assign cars' });
  }
});

// ============================================================================
// SHOP CAPABILITY PROFILE ENDPOINTS
// ============================================================================

/**
 * Get capability profile for a shop
 * GET /api/allocation/capability-profile/:shopId
 */
router.get('/capability-profile/:shopId', async (req: AuthRequest, res: Response) => {
  const prisma = req.app.locals.prisma;

  try {
    const profile = await prisma.shopCapabilityProfile.findFirst({
      where: {
        shopId: req.params.shopId,
        companyId: req.user!.companyId,
      },
    });

    if (!profile) {
      res.status(404).json({ message: 'Capability profile not found' });
      return;
    }

    // Parse JSON fields
    res.json({
      ...profile,
      allowedAssetClasses: JSON.parse(profile.allowedAssetClasses || '[]'),
      allowedLiningTypes: JSON.parse(profile.allowedLiningTypes || '[]'),
      hazmatCertifications: JSON.parse(profile.hazmatCertifications || '[]'),
      restrictedCommodities: JSON.parse(profile.restrictedCommodities || '[]'),
      allowedCommodities: JSON.parse(profile.allowedCommodities || '[]'),
      preferredCustomers: JSON.parse(profile.preferredCustomers || '[]'),
      excludedCustomers: JSON.parse(profile.excludedCustomers || '[]'),
      preferredWorkloadMix: JSON.parse(profile.preferredWorkloadMix || '{}'),
    });
  } catch (error) {
    logger.error('Get capability profile error:', error);
    res.status(500).json({ message: 'Failed to get capability profile' });
  }
});

/**
 * Create or update capability profile for a shop
 * PUT /api/allocation/capability-profile/:shopId
 */
router.put('/capability-profile/:shopId', async (req: AuthRequest, res: Response) => {
  const prisma = req.app.locals.prisma;
  const {
    canPerformTankLining,
    canPerformAnnualQuals,
    canPerformRule88B,
    canPerformSafetyRelief,
    canPerformStubSill,
    canPerformTankThickness,
    canPerformFullQualification,
    canPerformPartialQual,
    canPerformRepairs,
    canPerformServiceEquipment,
    allowedAssetClasses,
    maxCarLength,
    maxCarWeight,
    hasJacketedCarSupport,
    hasLinedCarSupport,
    allowedLiningTypes,
    hazmatCertifications,
    restrictedCommodities,
    allowedCommodities,
    preferredCustomers,
    excludedCustomers,
    isContractShop,
    monthlyCapacity,
    maxConcurrentCars,
    preferredWorkloadMix,
    hasContractualCommitment,
    annualCommittedVolume,
    commitmentPenaltyRate,
  } = req.body;

  try {
    // Verify shop exists
    const shop = await prisma.shop.findFirst({
      where: {
        id: req.params.shopId,
        companyId: req.user!.companyId,
      },
    });

    if (!shop) {
      res.status(404).json({ message: 'Shop not found' });
      return;
    }

    const profile = await prisma.shopCapabilityProfile.upsert({
      where: { shopId: req.params.shopId },
      create: {
        shopId: req.params.shopId,
        companyId: req.user!.companyId,
        canPerformTankLining: canPerformTankLining ?? false,
        canPerformAnnualQuals: canPerformAnnualQuals ?? false,
        canPerformRule88B: canPerformRule88B ?? false,
        canPerformSafetyRelief: canPerformSafetyRelief ?? false,
        canPerformStubSill: canPerformStubSill ?? false,
        canPerformTankThickness: canPerformTankThickness ?? false,
        canPerformFullQualification: canPerformFullQualification ?? true,
        canPerformPartialQual: canPerformPartialQual ?? true,
        canPerformRepairs: canPerformRepairs ?? true,
        canPerformServiceEquipment: canPerformServiceEquipment ?? false,
        allowedAssetClasses: JSON.stringify(allowedAssetClasses || []),
        maxCarLength,
        maxCarWeight,
        hasJacketedCarSupport: hasJacketedCarSupport ?? true,
        hasLinedCarSupport: hasLinedCarSupport ?? true,
        allowedLiningTypes: JSON.stringify(allowedLiningTypes || []),
        hazmatCertifications: JSON.stringify(hazmatCertifications || []),
        restrictedCommodities: JSON.stringify(restrictedCommodities || []),
        allowedCommodities: JSON.stringify(allowedCommodities || []),
        preferredCustomers: JSON.stringify(preferredCustomers || []),
        excludedCustomers: JSON.stringify(excludedCustomers || []),
        isContractShop: isContractShop ?? false,
        monthlyCapacity: monthlyCapacity ?? 50,
        maxConcurrentCars: maxConcurrentCars ?? 10,
        preferredWorkloadMix: JSON.stringify(preferredWorkloadMix || {}),
        hasContractualCommitment: hasContractualCommitment ?? false,
        annualCommittedVolume: annualCommittedVolume ?? 0,
        commitmentPenaltyRate: commitmentPenaltyRate ?? 0,
      },
      update: {
        canPerformTankLining,
        canPerformAnnualQuals,
        canPerformRule88B,
        canPerformSafetyRelief,
        canPerformStubSill,
        canPerformTankThickness,
        canPerformFullQualification,
        canPerformPartialQual,
        canPerformRepairs,
        canPerformServiceEquipment,
        allowedAssetClasses: allowedAssetClasses ? JSON.stringify(allowedAssetClasses) : undefined,
        maxCarLength,
        maxCarWeight,
        hasJacketedCarSupport,
        hasLinedCarSupport,
        allowedLiningTypes: allowedLiningTypes ? JSON.stringify(allowedLiningTypes) : undefined,
        hazmatCertifications: hazmatCertifications ? JSON.stringify(hazmatCertifications) : undefined,
        restrictedCommodities: restrictedCommodities ? JSON.stringify(restrictedCommodities) : undefined,
        allowedCommodities: allowedCommodities ? JSON.stringify(allowedCommodities) : undefined,
        preferredCustomers: preferredCustomers ? JSON.stringify(preferredCustomers) : undefined,
        excludedCustomers: excludedCustomers ? JSON.stringify(excludedCustomers) : undefined,
        isContractShop,
        monthlyCapacity,
        maxConcurrentCars,
        preferredWorkloadMix: preferredWorkloadMix ? JSON.stringify(preferredWorkloadMix) : undefined,
        hasContractualCommitment,
        annualCommittedVolume,
        commitmentPenaltyRate,
      },
    });

    res.json(profile);
  } catch (error) {
    logger.error('Update capability profile error:', error);
    res.status(500).json({ message: 'Failed to update capability profile' });
  }
});

/**
 * Get all shops with capability profiles
 * GET /api/allocation/capability-profiles
 */
router.get('/capability-profiles', async (req: AuthRequest, res: Response) => {
  const prisma = req.app.locals.prisma;

  try {
    const shops = await prisma.shop.findMany({
      where: {
        companyId: req.user!.companyId,
        isActive: true,
      },
      include: {
        capabilityProfile: true,
      },
      orderBy: { name: 'asc' },
    });

    res.json(shops.map(shop => ({
      id: shop.id,
      code: shop.code,
      name: shop.name,
      isAitxInternal: shop.isAitxInternal,
      tankQualified: shop.tankQualified,
      hasCapabilityProfile: !!shop.capabilityProfile,
      capabilityProfile: shop.capabilityProfile ? {
        ...shop.capabilityProfile,
        allowedAssetClasses: JSON.parse(shop.capabilityProfile.allowedAssetClasses || '[]'),
        preferredCustomers: JSON.parse(shop.capabilityProfile.preferredCustomers || '[]'),
      } : null,
    })));
  } catch (error) {
    logger.error('Get capability profiles error:', error);
    res.status(500).json({ message: 'Failed to get capability profiles' });
  }
});

// ============================================================================
// UTILIZATION HEATMAP ENDPOINT
// ============================================================================

/**
 * Get utilization heatmap data for all shops
 * GET /api/allocation/utilization-heatmap
 */
router.get('/utilization-heatmap', async (req: AuthRequest, res: Response) => {
  const prisma = req.app.locals.prisma;
  const { months = 6 } = req.query;
  const monthCount = parseInt(months as string) || 6;

  try {
    // Generate month keys for the requested period
    const now = new Date();
    const monthKeys: string[] = [];
    for (let i = 0; i < monthCount; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    // Get all active shops with capability profiles
    const shops = await prisma.shop.findMany({
      where: {
        companyId: req.user!.companyId,
        isActive: true,
      },
      include: {
        capabilityProfile: true,
      },
      orderBy: { name: 'asc' },
    });

    // Get assignments for all shops and months
    const assignments = await prisma.planAssignment.groupBy({
      by: ['shopId', 'scheduledMonth'],
      where: {
        shopId: { in: shops.map(s => s.id) },
        scheduledMonth: { in: monthKeys },
      },
      _count: { id: true },
    });

    // Build assignment lookup
    const assignmentMap = new Map<string, number>();
    assignments.forEach(a => {
      assignmentMap.set(`${a.shopId}-${a.scheduledMonth}`, a._count.id);
    });

    // Build heatmap data
    const heatmapData = shops.map(shop => {
      const capacity = shop.capabilityProfile?.monthlyCapacity || shop.capacity || 50;

      const monthlyData = monthKeys.map(month => {
        const used = assignmentMap.get(`${shop.id}-${month}`) || 0;
        const utilization = Math.round((used / capacity) * 100);

        // Determine color based on utilization
        let color: 'green' | 'yellow' | 'red' | 'blue';
        if (utilization >= 90) {
          color = 'red';
        } else if (utilization >= 80) {
          color = 'yellow';
        } else if (utilization >= 50) {
          color = 'green';
        } else {
          color = 'blue';
        }

        return {
          month,
          capacity,
          used,
          available: capacity - used,
          utilization,
          color,
        };
      });

      return {
        shopId: shop.id,
        shopCode: shop.code,
        shopName: shop.name,
        isAitxInternal: shop.isAitxInternal,
        is3rdParty: !shop.isAitxInternal,
        tankQualified: shop.tankQualified,
        hasContractualCommitment: shop.capabilityProfile?.hasContractualCommitment || false,
        monthlyData,
      };
    });

    // Calculate summary statistics
    const summary = {
      totalShops: shops.length,
      aitxShops: shops.filter(s => s.isAitxInternal).length,
      thirdPartyShops: shops.filter(s => !s.isAitxInternal).length,
      overCapacityAlerts: heatmapData.filter(s =>
        s.monthlyData.some(m => m.utilization >= 90)
      ).length,
      underUtilizedShops: heatmapData.filter(s =>
        s.monthlyData.every(m => m.utilization < 50)
      ).length,
    };

    res.json({
      months: monthKeys,
      shops: heatmapData,
      summary,
    });
  } catch (error) {
    logger.error('Get utilization heatmap error:', error);
    res.status(500).json({ message: 'Failed to get utilization heatmap' });
  }
});

export default router;
