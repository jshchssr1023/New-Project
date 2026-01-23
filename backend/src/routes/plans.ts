import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/requireAdmin';
import websocketService from '../services/websocketService';
import { recommendShopsForCar } from '../services/ruleEngine';
import { prisma } from '../services/db';
import logger from '../utils/logger';
import sstConsolidationService from '../services/sstConsolidationService';
import auditService from '../services/auditService';

// INPUT VALIDATION SCHEMAS
const CreatePlanSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name too long'),
  description: z.string().max(1000, 'Description too long').optional(),
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid start date'),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid end date'),
});

const UpdatePlanSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid start date').optional(),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid end date').optional(),
  status: z.enum(['draft', 'active', 'completed', 'archived']).optional(),
});

const ScheduleCarSchema = z.object({
  carId: z.string().uuid('Invalid car ID'),
  shopId: z.string().uuid('Invalid shop ID').optional(),
  scheduledMonth: z.string().regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM format'),
  planId: z.string().uuid('Invalid plan ID').optional(),
  estimatedCost: z.number().min(0).optional(),
  estimatedDuration: z.number().int().min(1).max(365).optional(),
  useRuleEngine: z.boolean().optional(),
});

// SECURITY FIX: Added validation schema for /:id/assignments POST
// Previously this endpoint directly destructured req.body without validation
const CreateAssignmentSchema = z.object({
  carId: z.string().uuid('Invalid car ID'),
  shopId: z.string().uuid('Invalid shop ID').optional(),
  scheduledMonth: z.string().regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM format'),
  estimatedCost: z.number().min(0).optional(),
  estimatedDuration: z.number().int().min(1).max(365).optional(),
});

const router = Router();

router.use(authenticate);

// Get all plans (list view - limited fields for performance)
router.get('/', async (req: AuthRequest, res: Response) => {
  const { status, detailed } = req.query;

  try {
    // Use select to limit returned fields for list views
    // Full data is only fetched with detailed=true or via GET /:id
    if (detailed === 'true') {
      // Full data for detailed view (e.g., dashboard that needs assignment counts)
      const plans = await prisma.plan.findMany({
        where: {
          companyId: req.user!.companyId,
          ...(status && { status: status as string }),
        },
        include: {
          assignments: {
            include: {
              car: true,
              shop: true,
            },
          },
          creator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      res.json(plans);
      return;
    }

    // List view with assignment count - optimized with select and _count
    const plans = await prisma.plan.findMany({
      where: {
        companyId: req.user!.companyId,
        ...(status && { status: status as string }),
      },
      include: {
        creator: true,
        assignments: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Transform to include assignmentCount
    // FIX: _count is not available in our custom ORM, calculate from assignments array instead
    const plansWithCount = plans.map((plan: any) => ({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      startDate: plan.startDate,
      endDate: plan.endDate,
      status: plan.status,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      creator: plan.creator,
      assignmentCount: Array.isArray(plan.assignments) ? plan.assignments.length : 0,
    }));

    res.json(plansWithCount);
  } catch (error) {
    logger.error('Get plans error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get plan by ID
router.get('/:id', async (req: AuthRequest, res: Response) => {

  try {
    const plan = await prisma.plan.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
      include: {
        assignments: {
          include: {
            car: true,
            shop: true,
          },
        },
      },
    });

    if (!plan) {
      res.status(404).json({ message: 'Plan not found' });
      return;
    }

    res.json(plan);
  } catch (error) {
    logger.error('Get plan error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get plan grid data
router.get('/:id/grid', async (req: AuthRequest, res: Response) => {

  try {
    const plan = await prisma.plan.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
      include: {
        assignments: {
          include: {
            car: true,
            shop: true,
          },
        },
      },
    });

    if (!plan) {
      res.status(404).json({ message: 'Plan not found' });
      return;
    }

    const shops = await prisma.shop.findMany({
      where: {
        companyId: req.user!.companyId,
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });

    // Generate months for the plan duration
    // FIX: Use first day of month to avoid overflow issues with setMonth()
    // Example issue: Jan 31 + 1 month = Mar 3 (overflow) instead of Feb 28/29
    const startDate = new Date(plan.startDate);
    const endDate = new Date(plan.endDate);
    const months: string[] = [];

    // Start from first day of start month to avoid day overflow issues
    let currentYear = startDate.getFullYear();
    let currentMonth = startDate.getMonth();
    const endYear = endDate.getFullYear();
    const endMonth = endDate.getMonth();

    // Iterate by year/month rather than using Date arithmetic to avoid DST/overflow issues
    while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
      months.push(`${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`);
      currentMonth++;
      if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
      }
    }

    // Group assignments by shop
    const assignmentsByShop = shops.map((shop) => {
      return plan.assignments.filter((a) => a.shopId === shop.id);
    });

    res.json({
      shops,
      months,
      assignments: assignmentsByShop,
    });
  } catch (error) {
    logger.error('Get plan grid error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create plan
router.post('/', async (req: AuthRequest, res: Response) => {
  // INPUT VALIDATION
  const validation = CreatePlanSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({
      message: 'Validation failed',
      errors: validation.error.errors,
    });
    return;
  }

  const { name, description, startDate, endDate } = validation.data;

  // Validate date range
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (end <= start) {
    res.status(400).json({ message: 'End date must be after start date' });
    return;
  }

  try {
    const plan = await prisma.plan.create({
      data: {
        name,
        description: description || '',
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        companyId: req.user!.companyId,
        createdBy: req.user!.id,
      },
      include: {
        assignments: true,
      },
    });

    res.status(201).json(plan);
  } catch (error) {
    logger.error('Create plan error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update plan
router.put('/:id', async (req: AuthRequest, res: Response) => {
  // INPUT VALIDATION
  const validation = UpdatePlanSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({
      message: 'Validation failed',
      errors: validation.error.errors,
    });
    return;
  }

  const { name, description, startDate, endDate, status } = validation.data;

  try {
    const result = await prisma.plan.updateMany({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
      data: {
        name,
        description,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        status,
      },
    });

    if (result.count === 0) {
      res.status(404).json({ message: 'Plan not found' });
      return;
    }

    const updatedPlan = await prisma.plan.findUnique({
      where: { id: req.params.id },
      include: { assignments: true },
    });

    res.json(updatedPlan);
  } catch (error) {
    logger.error('Update plan error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete plan
router.delete('/:id', async (req: AuthRequest, res: Response) => {

  try {
    const result = await prisma.plan.deleteMany({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
    });

    if (result.count === 0) {
      res.status(404).json({ message: 'Plan not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    logger.error('Delete plan error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Add assignment to plan
// NOTE: Also creates CarFlowPlan entry (dual-write for SST migration)
// @deprecated Use POST /api/car-flow/plans instead for new implementations
router.post('/:id/assignments', async (req: AuthRequest, res: Response) => {
  // SECURITY FIX: Added input validation - previously directly destructured req.body
  const validation = CreateAssignmentSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({
      message: 'Validation failed',
      errors: validation.error.errors,
    });
    return;
  }

  const { carId, shopId, scheduledMonth, estimatedCost, estimatedDuration } = validation.data;

  try {
    const plan = await prisma.plan.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
    });

    if (!plan) {
      res.status(404).json({ message: 'Plan not found' });
      return;
    }

    // Parse scheduledMonth (YYYY-MM) for CarFlowPlan
    const [yearStr, monthStr] = (scheduledMonth as string).split('-');
    const plannedYear = parseInt(yearStr);
    const plannedMonth = parseInt(monthStr);

    // Create both PlanAssignment (legacy) and CarFlowPlan (SST) in transaction
    // ATOMICITY FIX: SST status update now happens inside transaction
    // Previously updateCarShoppingStatus was called outside transaction, causing stale status on failure
    const [assignment] = await prisma.$transaction(async (tx) => {
      // Create legacy PlanAssignment
      const newAssignment = await tx.planAssignment.create({
        data: {
          planId: req.params.id,
          carId,
          shopId,
          scheduledMonth,
          estimatedCost: estimatedCost || 0,
          estimatedDuration: estimatedDuration || 14,
        },
        include: {
          car: true,
          shop: true,
        },
      });

      // SST: Also create CarFlowPlan entry (if not exists)
      const existingCarFlowPlan = await tx.carFlowPlan.findFirst({
        where: {
          carId,
          status: { in: ['Planned', 'InProgress'] },
        },
      });

      if (!existingCarFlowPlan) {
        await tx.carFlowPlan.create({
          data: {
            carId,
            shopId,
            plannedMonth,
            plannedYear,
            status: 'Planned',
            source: 'master_plan',
            estimatedCost: estimatedCost || null,
            notes: `Created from Plan: ${plan.name}`,
            committedById: req.user!.id,
          },
        });
      }

      // FIX: Update shopping status INSIDE transaction for atomicity
      // If this fails, the entire transaction will be rolled back
      await sstConsolidationService.updateCarShoppingStatus(carId);

      return [newAssignment];
    });

    res.status(201).json(assignment);
  } catch (error) {
    logger.error('Create assignment error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update assignment
router.put('/:id/assignments/:assignmentId', async (req: AuthRequest, res: Response) => {
  const { shopId, scheduledMonth, estimatedCost, estimatedDuration, status } = req.body;

  try {
    // SECURITY FIX: Verify the assignment belongs to a plan owned by the user's company
    const existingAssignment = await prisma.planAssignment.findFirst({
      where: {
        id: req.params.assignmentId,
        plan: {
          id: req.params.id,
          companyId: req.user!.companyId,
        },
      },
    });

    if (!existingAssignment) {
      res.status(404).json({ message: 'Assignment not found' });
      return;
    }

    const assignment = await prisma.planAssignment.update({
      where: { id: req.params.assignmentId },
      data: {
        shopId,
        scheduledMonth,
        estimatedCost,
        estimatedDuration,
        status,
      },
      include: {
        car: true,
        shop: true,
      },
    });

    res.json(assignment);
  } catch (error) {
    logger.error('Update assignment error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Remove assignment
router.delete('/:id/assignments/:assignmentId', async (req: AuthRequest, res: Response) => {

  try {
    // SECURITY FIX: Verify the assignment belongs to a plan owned by the user's company
    const existingAssignment = await prisma.planAssignment.findFirst({
      where: {
        id: req.params.assignmentId,
        plan: {
          id: req.params.id,
          companyId: req.user!.companyId,
        },
      },
    });

    if (!existingAssignment) {
      res.status(404).json({ message: 'Assignment not found' });
      return;
    }

    await prisma.planAssignment.delete({
      where: { id: req.params.assignmentId },
    });

    res.status(204).send();
  } catch (error) {
    logger.error('Delete assignment error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Activate plan
router.post('/:id/activate', async (req: AuthRequest, res: Response) => {

  try {
    const result = await prisma.plan.updateMany({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
      data: { status: 'active' },
    });

    if (result.count === 0) {
      res.status(404).json({ message: 'Plan not found' });
      return;
    }

    const plan = await prisma.plan.findUnique({
      where: { id: req.params.id },
      include: { assignments: true },
    });

    res.json(plan);
  } catch (error) {
    logger.error('Activate plan error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Archive plan
router.post('/:id/archive', async (req: AuthRequest, res: Response) => {

  try {
    const result = await prisma.plan.updateMany({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
      data: { status: 'archived' },
    });

    if (result.count === 0) {
      res.status(404).json({ message: 'Plan not found' });
      return;
    }

    const plan = await prisma.plan.findUnique({
      where: { id: req.params.id },
      include: { assignments: true },
    });

    res.json(plan);
  } catch (error) {
    logger.error('Archive plan error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Schedule car assignment using rule engine
// This is the main scheduling action that locks a car into the schedule
router.post('/schedule-car', async (req: AuthRequest, res: Response) => {
  const { carId, shopId, scheduledMonth, planId, estimatedCost, estimatedDuration, useRuleEngine = true } = req.body;

  if (!carId || !scheduledMonth) {
    res.status(400).json({ message: 'carId and scheduledMonth are required' });
    return;
  }

  try {
    // Get the car
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

    let finalShopId = shopId;
    let recommendation = null;

    // If no shopId provided, use rule engine to recommend
    if (!finalShopId && useRuleEngine) {
      recommendation = await recommendShopsForCar(
        prisma,
        req.user!.companyId,
        {
          id: car.id,
          vehicleNumber: car.railcarNumber || car.vehicleNumber,
          carType: car.carType || '',
          commodity: car.commodity || '',
          customer: car.customer || '',
          homeRegion: car.homeRegion || '',
          reasonShopped: car.reasonShopped || '',
          isTankCar: car.isTankCar || false,
        },
        scheduledMonth
      );

      if (!recommendation.suggestedShopId) {
        res.status(400).json({
          message: 'No suitable shop found for this car',
          recommendation,
        });
        return;
      }

      finalShopId = recommendation.suggestedShopId;
    }

    if (!finalShopId) {
      res.status(400).json({ message: 'shopId is required when useRuleEngine is false' });
      return;
    }

    // Verify shop exists and belongs to company
    const shop = await prisma.shop.findFirst({
      where: {
        id: finalShopId,
        companyId: req.user!.companyId,
      },
    });

    if (!shop) {
      res.status(404).json({ message: 'Shop not found' });
      return;
    }

    // Find or create a plan for this scheduling period
    let targetPlanId = planId;
    if (!targetPlanId) {
      // Find active plan that covers this month
      const monthDate = new Date(scheduledMonth + '-01');
      const existingPlan = await prisma.plan.findFirst({
        where: {
          companyId: req.user!.companyId,
          status: { in: ['active', 'draft'] },
          startDate: { lte: monthDate },
          endDate: { gte: monthDate },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (existingPlan) {
        targetPlanId = existingPlan.id;
      } else {
        // Create a new plan for this period
        const startOfMonth = new Date(scheduledMonth + '-01');
        const endOfMonth = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 12, 0); // 12 month plan

        const newPlan = await prisma.plan.create({
          data: {
            name: `Scheduling Plan ${scheduledMonth}`,
            description: 'Auto-created plan for car scheduling',
            startDate: startOfMonth,
            endDate: endOfMonth,
            status: 'draft',
            companyId: req.user!.companyId,
            createdBy: req.user!.id,
          },
        });
        targetPlanId = newPlan.id;
      }
    }

    // Check if car is already scheduled for this month
    const existingAssignment = await prisma.planAssignment.findFirst({
      where: {
        carId,
        scheduledMonth,
        plan: { companyId: req.user!.companyId },
      },
    });

    if (existingAssignment) {
      res.status(409).json({
        message: 'Car is already scheduled for this month',
        existingAssignment,
      });
      return;
    }

    // Create the assignment
    const assignment = await prisma.planAssignment.create({
      data: {
        planId: targetPlanId,
        carId,
        shopId: finalShopId,
        scheduledMonth,
        estimatedCost: estimatedCost || recommendation?.allScores[0]?.estimatedCost || shop.baseCostPerCar || 0,
        estimatedDuration: estimatedDuration || recommendation?.allScores[0]?.estimatedDays || shop.baseTurnTime || 14,
        status: 'pending',
      },
      include: {
        car: true,
        shop: true,
        plan: true,
      },
    });

    // Update car status to 'scheduled'
    await prisma.car.update({
      where: { id: carId },
      data: { status: 'scheduled' },
    });

    // Emit WebSocket event
    websocketService.emitAssignmentCreated(
      req.user!.companyId,
      {
        planId: targetPlanId,
        carId,
        shopId: finalShopId,
        scheduledMonth,
        userId: req.user!.id,
      }
    );

    res.status(201).json({
      success: true,
      message: 'Car successfully scheduled',
      assignment,
      recommendation: recommendation ? {
        suggestedShopName: recommendation.suggestedShopName,
        score: recommendation.allScores[0]?.score,
        reasons: recommendation.allScores[0]?.reasons,
      } : null,
    });
  } catch (error) {
    logger.error('Schedule car error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Bulk schedule multiple cars using rule engine
router.post('/schedule-cars-bulk', async (req: AuthRequest, res: Response) => {
  const { carIds, scheduledMonth, planId } = req.body;

  if (!Array.isArray(carIds) || carIds.length === 0 || !scheduledMonth) {
    res.status(400).json({ message: 'carIds array and scheduledMonth are required' });
    return;
  }

  try {
    const results = {
      success: 0,
      failed: 0,
      assignments: [] as unknown[],
      errors: [] as { carId: string; error: string }[],
    };

    // Use transaction for bulk operation
    await prisma.$transaction(async (tx) => {
      for (const carId of carIds) {
        try {
          // Get the car
          const car = await tx.car.findFirst({
            where: {
              id: carId,
              companyId: req.user!.companyId,
            },
          });

          if (!car) {
            results.failed++;
            results.errors.push({ carId, error: 'Car not found' });
            continue;
          }

          // Get recommendation from rule engine
          const recommendation = await recommendShopsForCar(
            tx,
            req.user!.companyId,
            {
              id: car.id,
              vehicleNumber: car.railcarNumber || car.vehicleNumber,
              carType: car.carType || '',
              commodity: car.commodity || '',
              customer: car.customer || '',
              homeRegion: car.homeRegion || '',
              reasonShopped: car.reasonShopped || '',
              isTankCar: car.isTankCar || false,
            },
            scheduledMonth
          );

          if (!recommendation.suggestedShopId) {
            results.failed++;
            results.errors.push({ carId, error: 'No suitable shop found' });
            continue;
          }

          // Find or use provided plan
          let targetPlanId = planId;
          if (!targetPlanId) {
            const monthDate = new Date(scheduledMonth + '-01');
            const existingPlan = await tx.plan.findFirst({
              where: {
                companyId: req.user!.companyId,
                status: { in: ['active', 'draft'] },
                startDate: { lte: monthDate },
                endDate: { gte: monthDate },
              },
              orderBy: { createdAt: 'desc' },
            });

            if (existingPlan) {
              targetPlanId = existingPlan.id;
            } else {
              const startOfMonth = new Date(scheduledMonth + '-01');
              const endOfMonth = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 12, 0);

              const newPlan = await tx.plan.create({
                data: {
                  name: `Scheduling Plan ${scheduledMonth}`,
                  description: 'Auto-created plan for bulk car scheduling',
                  startDate: startOfMonth,
                  endDate: endOfMonth,
                  status: 'draft',
                  companyId: req.user!.companyId,
                  createdBy: req.user!.id,
                },
              });
              targetPlanId = newPlan.id;
            }
          }

          // Check for existing assignment
          const existingAssignment = await tx.planAssignment.findFirst({
            where: {
              carId,
              scheduledMonth,
              plan: { companyId: req.user!.companyId },
            },
          });

          if (existingAssignment) {
            results.failed++;
            results.errors.push({ carId, error: 'Already scheduled for this month' });
            continue;
          }

          // Create assignment
          const shop = recommendation.allScores[0];
          const assignment = await tx.planAssignment.create({
            data: {
              planId: targetPlanId,
              carId,
              shopId: recommendation.suggestedShopId,
              scheduledMonth,
              estimatedCost: shop?.estimatedCost || 0,
              estimatedDuration: shop?.estimatedDays || 14,
              status: 'pending',
            },
            include: {
              car: true,
              shop: true,
            },
          });

          // Update car status
          await tx.car.update({
            where: { id: carId },
            data: { status: 'scheduled' },
          });

          results.success++;
          results.assignments.push(assignment);
        } catch (error: unknown) {
          results.failed++;
          const message = error instanceof Error ? error.message : 'Unknown error';
          results.errors.push({ carId, error: message });
        }
      }
    });

    // Emit bulk WebSocket event (outside transaction)
    if (results.success > 0) {
      websocketService.emitBulkAssignmentsCreated(
        req.user!.companyId,
        results.assignments.map((a: { planId: string; carId: string; shopId: string; scheduledMonth: string }) => ({
          planId: a.planId,
          carId: a.carId,
          shopId: a.shopId,
          scheduledMonth: a.scheduledMonth,
        })),
        req.user!.id
      );
    }

    res.json({
      message: `Scheduled ${results.success} cars${results.failed > 0 ? `, ${results.failed} failed` : ''}`,
      ...results,
    });
  } catch (error) {
    logger.error('Bulk schedule cars error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Bulk add assignments to plan with atomicity guarantees
router.post('/:id/assignments/bulk', async (req: AuthRequest, res: Response) => {
  const { assignments, overrideConflicts = false } = req.body;

  if (!Array.isArray(assignments) || assignments.length === 0) {
    res.status(400).json({ message: 'No assignments provided' });
    return;
  }

  try {
    const plan = await prisma.plan.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
    });

    if (!plan) {
      res.status(404).json({ message: 'Plan not found' });
      return;
    }

    // Pre-fetch all cars and shops for validation
    const carIds = assignments.map((a: { carId: string }) => a.carId);
    const shopIds = [...new Set(assignments.map((a: { shopId: string }) => a.shopId))];

    const [cars, shops, existingAssignments] = await Promise.all([
      prisma.car.findMany({
        where: { id: { in: carIds }, companyId: req.user!.companyId },
        select: { id: true, railcarNumber: true, isTankCar: true },
      }),
      prisma.shop.findMany({
        where: { id: { in: shopIds }, companyId: req.user!.companyId },
        select: { id: true, name: true, code: true, tankQualified: true, capacity: true },
      }),
      prisma.planAssignment.findMany({
        where: {
          planId: req.params.id,
          carId: { in: carIds },
        },
        select: { carId: true, scheduledMonth: true },
      }),
    ]);

    const carMap = new Map(cars.map(c => [c.id, c]));
    const shopMap = new Map(shops.map(s => [s.id, s]));
    const existingSet = new Set(existingAssignments.map(a => `${a.carId}-${a.scheduledMonth}`));

    // Validate all assignments before creating any
    const validationErrors: { carId: string; railcarNumber?: string; error: string; code: string }[] = [];
    const validAssignments: typeof assignments = [];

    for (const assignment of assignments) {
      const car = carMap.get(assignment.carId);
      const shop = shopMap.get(assignment.shopId);

      if (!car) {
        validationErrors.push({
          carId: assignment.carId,
          error: 'Car not found or not accessible',
          code: 'CAR_NOT_FOUND',
        });
        continue;
      }

      if (!shop) {
        validationErrors.push({
          carId: assignment.carId,
          railcarNumber: car.railcarNumber,
          error: 'Shop not found or not accessible',
          code: 'SHOP_NOT_FOUND',
        });
        continue;
      }

      // Tank car validation - hard block
      if (car.isTankCar && !shop.tankQualified) {
        validationErrors.push({
          carId: assignment.carId,
          railcarNumber: car.railcarNumber,
          error: `Tank car ${car.railcarNumber} cannot be assigned to non-tank-qualified shop ${shop.name} (${shop.code})`,
          code: 'TANK_CAR_INVALID_SHOP',
        });
        continue;
      }

      // Check for existing assignment
      const existingKey = `${assignment.carId}-${assignment.scheduledMonth}`;
      if (existingSet.has(existingKey) && !overrideConflicts) {
        validationErrors.push({
          carId: assignment.carId,
          railcarNumber: car.railcarNumber,
          error: `Car ${car.railcarNumber} already has an assignment for ${assignment.scheduledMonth}`,
          code: 'DUPLICATE_ASSIGNMENT',
        });
        continue;
      }

      validAssignments.push(assignment);
    }

    // If there are validation errors and we have no valid assignments, return errors
    if (validationErrors.length > 0 && validAssignments.length === 0) {
      res.status(400).json({
        success: false,
        message: 'All assignments failed validation',
        failed: validationErrors.length,
        errors: validationErrors,
      });
      return;
    }

    const results = {
      success: 0,
      failed: validationErrors.length,
      errors: validationErrors,
      created: [] as { id: string; carId: string; shopId: string; scheduledMonth: string }[],
    };

    // Use transaction for atomicity - all or nothing for valid assignments
    await prisma.$transaction(async (tx) => {
      // Delete existing assignments if overriding
      if (overrideConflicts) {
        const existingCarMonths = validAssignments.map((a: { carId: string; scheduledMonth: string }) => ({
          carId: a.carId,
          scheduledMonth: a.scheduledMonth,
        }));

        for (const { carId, scheduledMonth } of existingCarMonths) {
          await tx.planAssignment.deleteMany({
            where: {
              planId: req.params.id,
              carId,
              scheduledMonth,
            },
          });
        }
      }

      // Create all valid assignments
      for (const assignment of validAssignments) {
        const created = await tx.planAssignment.create({
          data: {
            planId: req.params.id,
            carId: assignment.carId,
            shopId: assignment.shopId,
            scheduledMonth: assignment.scheduledMonth,
            estimatedCost: assignment.estimatedCost || 0,
            estimatedDuration: assignment.estimatedDuration || 14,
            status: assignment.status || 'pending',
          },
        });

        results.success++;
        results.created.push({
          id: created.id,
          carId: created.carId,
          shopId: created.shopId,
          scheduledMonth: created.scheduledMonth,
        });
      }
    }, {
      // Transaction options for improved reliability
      maxWait: 10000, // 10 seconds max wait
      timeout: 30000, // 30 seconds timeout
    });

    // Emit WebSocket event for real-time collaboration (outside transaction)
    if (results.success > 0) {
      websocketService.emitBulkAssignmentsCreated(
        req.user!.companyId,
        results.created.map(a => ({
          planId: req.params.id,
          carId: a.carId,
          shopId: a.shopId,
          scheduledMonth: a.scheduledMonth,
        })),
        req.user!.id
      );
    }

    res.json({
      success: results.failed === 0,
      message: `Created ${results.success} assignments${results.failed > 0 ? `, ${results.failed} failed` : ''}`,
      ...results,
    });
  } catch (error) {
    logger.error('Bulk assignment error:', error);

    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes('Unique constraint')) {
        res.status(409).json({
          success: false,
          message: 'Duplicate assignment conflict - one or more cars already assigned for the specified month',
          code: 'DUPLICATE_ASSIGNMENT_CONFLICT',
        });
        return;
      }
      if (error.message.includes('Foreign key constraint')) {
        res.status(400).json({
          success: false,
          message: 'Invalid car or shop reference',
          code: 'INVALID_REFERENCE',
        });
        return;
      }
    }

    res.status(500).json({
      success: false,
      message: 'Failed to save assignments. Please try again.',
      code: 'INTERNAL_ERROR',
    });
  }
});

// Export plan to Excel (CSV format)
router.get('/:id/export', async (req: AuthRequest, res: Response) => {

  try {
    const plan = await prisma.plan.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
      include: {
        assignments: {
          include: {
            car: true,
            shop: true,
          },
          orderBy: [
            { scheduledMonth: 'asc' },
            { shop: { name: 'asc' } },
          ],
        },
      },
    });

    if (!plan) {
      res.status(404).json({ message: 'Plan not found' });
      return;
    }

    // Helper to escape CSV values
    const escapeCSV = (value: string | number | null | undefined): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Build CSV content
    const headers = [
      'Scheduled Month',
      'Railcar Number',
      'Car Type',
      'Customer',
      'Project Number',
      'Reason Shopped',
      'Shop Name',
      'Shop Code',
      'Shop Location',
      'Estimated Cost',
      'Estimated Duration (Days)',
      'Status',
    ];

    const rows = plan.assignments.map((a) => [
      a.scheduledMonth,
      a.car?.vehicleNumber || '',
      a.car?.carType || '',
      a.car?.customer || '',
      a.car?.projectNumber || '',
      a.car?.reasonShopped || '',
      a.shop?.name || '',
      a.shop?.code || '',
      a.shop?.location || '',
      a.estimatedCost,
      a.estimatedDuration,
      a.status,
    ]);

    const csvContent = [
      `Plan: ${plan.name}`,
      `Description: ${plan.description}`,
      `Period: ${new Date(plan.startDate).toLocaleDateString()} - ${new Date(plan.endDate).toLocaleDateString()}`,
      `Total Assignments: ${plan.assignments.length}`,
      '',
      headers.map(escapeCSV).join(','),
      ...rows.map((row) => row.map(escapeCSV).join(',')),
    ].join('\n');

    // Set response headers for file download
    const filename = `${plan.name.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (error) {
    logger.error('Export plan error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Generate report with recipient type configuration
router.post('/:id/generate-report', async (req: AuthRequest, res: Response) => {
  const { recipientType, dateRange, includeConfidentialStatement, hideCostData } = req.body;

  try {
    const plan = await prisma.plan.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
      include: {
        assignments: {
          include: {
            car: true,
            shop: true,
          },
          orderBy: [
            { scheduledMonth: 'asc' },
            { shop: { name: 'asc' } },
          ],
        },
      },
    });

    if (!plan) {
      res.status(404).json({ message: 'Plan not found' });
      return;
    }

    // Format report data based on recipient type
    const reportData = {
      planInfo: {
        name: plan.name,
        description: plan.description,
        startDate: plan.startDate.toISOString(),
        endDate: plan.endDate.toISOString(),
        status: plan.status,
        totalAssignments: plan.assignments.length,
      },
      assignments: plan.assignments.map((a) => ({
        scheduledMonth: a.scheduledMonth,
        railcarNumber: a.car?.railcarNumber || a.car?.vehicleNumber || '',
        carType: a.car?.carType || '',
        customer: a.car?.customer || '',
        projectNumber: a.car?.projectNumber || '',
        reasonShopped: a.car?.reasonShopped || '',
        shopName: a.shop?.name || '',
        shopCode: a.shop?.code || '',
        shopLocation: a.shop?.location || '',
        // Hide cost data for external recipients
        estimatedCost: hideCostData ? 0 : a.estimatedCost,
        estimatedDuration: a.estimatedDuration,
        status: a.status,
      })),
      recipientType: recipientType || 'internal',
      generatedAt: new Date().toISOString(),
    };

    res.json(reportData);
  } catch (error) {
    logger.error('Generate report error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get report data for printing
router.get('/:id/report-data', async (req: AuthRequest, res: Response) => {
  const recipientType = req.query.recipientType as string || 'internal';

  try {
    const plan = await prisma.plan.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
      include: {
        assignments: {
          include: {
            car: true,
            shop: true,
          },
          orderBy: [
            { scheduledMonth: 'asc' },
            { shop: { name: 'asc' } },
          ],
        },
      },
    });

    if (!plan) {
      res.status(404).json({ message: 'Plan not found' });
      return;
    }

    const hideCostData = recipientType === 'external';

    const reportData = {
      planInfo: {
        name: plan.name,
        description: plan.description,
        startDate: plan.startDate.toISOString(),
        endDate: plan.endDate.toISOString(),
        status: plan.status,
        totalAssignments: plan.assignments.length,
      },
      assignments: plan.assignments.map((a) => ({
        scheduledMonth: a.scheduledMonth,
        railcarNumber: a.car?.railcarNumber || a.car?.vehicleNumber || '',
        carType: a.car?.carType || '',
        customer: a.car?.customer || '',
        projectNumber: a.car?.projectNumber || '',
        reasonShopped: a.car?.reasonShopped || '',
        shopName: a.shop?.name || '',
        shopCode: a.shop?.code || '',
        shopLocation: a.shop?.location || '',
        estimatedCost: hideCostData ? 0 : a.estimatedCost,
        estimatedDuration: a.estimatedDuration,
        status: a.status,
      })),
      recipientType,
      generatedAt: new Date().toISOString(),
    };

    res.json(reportData);
  } catch (error) {
    logger.error('Get report data error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Export plan to Excel (JSON data for frontend Excel generation)
router.get('/:id/export-data', async (req: AuthRequest, res: Response) => {

  try {
    const plan = await prisma.plan.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
      include: {
        assignments: {
          include: {
            car: true,
            shop: true,
          },
          orderBy: [
            { scheduledMonth: 'asc' },
            { shop: { name: 'asc' } },
          ],
        },
      },
    });

    if (!plan) {
      res.status(404).json({ message: 'Plan not found' });
      return;
    }

    // Get shops for capacity info
    const shops = await prisma.shop.findMany({
      where: {
        companyId: req.user!.companyId,
        isActive: true,
      },
    });

    // Calculate shop load by month
    const shopMonthlyLoad: Record<string, Record<string, number>> = {};
    plan.assignments.forEach((a) => {
      const shopName = a.shop?.name || 'Unknown';
      if (!shopMonthlyLoad[shopName]) {
        shopMonthlyLoad[shopName] = {};
      }
      shopMonthlyLoad[shopName][a.scheduledMonth] = (shopMonthlyLoad[shopName][a.scheduledMonth] || 0) + 1;
    });

    // Format data for Excel export
    const exportData = {
      planInfo: {
        name: plan.name,
        description: plan.description,
        startDate: plan.startDate,
        endDate: plan.endDate,
        status: plan.status,
        totalAssignments: plan.assignments.length,
      },
      assignments: plan.assignments.map((a) => ({
        scheduledMonth: a.scheduledMonth,
        railcarNumber: a.car?.vehicleNumber || '',
        carType: a.car?.carType || '',
        customer: a.car?.customer || '',
        projectNumber: a.car?.projectNumber || '',
        reasonShopped: a.car?.reasonShopped || '',
        shopName: a.shop?.name || '',
        shopCode: a.shop?.code || '',
        shopLocation: a.shop?.location || '',
        estimatedCost: a.estimatedCost,
        estimatedDuration: a.estimatedDuration,
        status: a.status,
      })),
      shopCapacity: shops.map((s) => ({
        name: s.name,
        code: s.code,
        capacity: s.capacity,
        monthlyLoad: shopMonthlyLoad[s.name] || {},
      })),
    };

    res.json(exportData);
  } catch (error) {
    logger.error('Export plan data error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// =============================================================================
// SST MIGRATION ENDPOINTS
// =============================================================================

/**
 * Migrate PlanAssignment data to CarFlowPlan (SST)
 * This is an admin operation for SST consolidation.
 * SECURITY FIX: Added requireAdmin to prevent unauthorized database-wide migrations
 * @deprecated PlanAssignment is being phased out in favor of CarFlowPlan
 */
router.post('/migrate-to-car-flow-plan', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const result = await sstConsolidationService.migratePlanAssignmentsToCarFlowPlan(
      req.user!.companyId,
      req.user!.id
    );

    res.json({
      message: 'Migration completed',
      ...result,
    });
  } catch (error) {
    logger.error('SST migration error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * Sync all shopping statuses (recalculate from SST)
 * SECURITY FIX: Added requireAdmin to prevent unauthorized database-wide operations
 */
router.post('/sync-shopping-status', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const result = await sstConsolidationService.batchUpdateShoppingStatus(
      req.user!.companyId
    );

    res.json({
      message: 'Shopping status sync completed',
      ...result,
    });
  } catch (error) {
    logger.error('Shopping status sync error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * Sync SOPCommitment usage counts with actual CarFlowPlan data
 * SECURITY FIX: Added requireAdmin to prevent unauthorized database-wide operations
 */
router.post('/sync-sop-usage', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const result = await sstConsolidationService.syncSOPCommitmentUsage(
      req.user!.companyId
    );

    res.json({
      message: 'S&OP usage sync completed',
      ...result,
    });
  } catch (error) {
    logger.error('S&OP usage sync error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
