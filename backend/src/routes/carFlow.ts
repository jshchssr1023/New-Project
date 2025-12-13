/**
 * Car Flow Planning API Routes
 *
 * Consolidated API for the Car Flow Planning module:
 * - /api/car-flow/scenarios - Scenario management
 * - /api/car-flow/plans - Car Flow Plan (committed assignments)
 * - /api/car-flow/capacity - Capacity calculations
 * - /api/car-flow/sop-commitments - S&OP Supply Commitments
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../services/db';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { requireRole } from '../middleware/requireAdmin';
import { createShoppingStatusService, ShoppingStatus } from '../services/shoppingStatusService';
import logger from '../utils/logger';

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Initialize shopping status service
const shoppingStatusService = createShoppingStatusService(prisma);

// =============================================================================
// SCENARIOS
// =============================================================================

/**
 * GET /api/car-flow/scenarios
 * List scenarios for the current user's company
 */
router.get('/scenarios', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, createdBy } = req.query;

    const scenarios = await prisma.scenario.findMany({
      where: {
        companyId: req.user!.companyId,
        ...(status && { status: status as string }),
        ...(createdBy && { createdBy: createdBy as string }),
      },
      include: {
        creator: {
          select: { id: true, firstName: true, lastName: true, email: true }
        },
        customers: {
          include: {
            customer: {
              select: { id: true, name: true, code: true }
            }
          }
        },
        _count: {
          select: { cars: true }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    res.json(scenarios);
  } catch (error) {
    logger.error('Failed to fetch scenarios', error as Error);
    res.status(500).json({ message: 'Failed to fetch scenarios' });
  }
});

/**
 * POST /api/car-flow/scenarios
 * Create a new scenario
 */
router.post('/scenarios', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, notes, customerIds, carIds } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Scenario name is required' });
    }

    // Create scenario with cars and customer associations
    const scenario = await prisma.scenario.create({
      data: {
        name,
        notes: notes || '',
        status: 'draft',
        companyId: req.user!.companyId,
        createdBy: req.user!.id,
        // Create customer associations if provided
        customers: customerIds?.length > 0 ? {
          create: customerIds.map((customerId: string, index: number) => ({
            customerId,
            isPrimary: index === 0 // First customer is primary
          }))
        } : undefined,
        // Create car assignments if provided
        cars: carIds?.length > 0 ? {
          create: carIds.map((carId: string) => ({
            carId,
            plannedMonth: new Date().getMonth() + 1,
            plannedYear: new Date().getFullYear(),
          }))
        } : undefined
      },
      include: {
        creator: {
          select: { id: true, firstName: true, lastName: true, email: true }
        },
        customers: {
          include: {
            customer: {
              select: { id: true, name: true, code: true }
            }
          }
        },
        cars: {
          include: {
            car: {
              select: { id: true, railcarNumber: true, customer: true, shoppingStatus: true }
            }
          }
        }
      }
    });

    // Log creation
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        userEmail: req.user!.email,
        action: 'create',
        entityType: 'Scenario',
        entityId: scenario.id,
        entityName: scenario.name,
        changes: JSON.stringify({ created: true }),
        companyId: req.user!.companyId
      }
    });

    res.status(201).json(scenario);
  } catch (error) {
    logger.error('Failed to create scenario', error as Error);
    res.status(500).json({ message: 'Failed to create scenario' });
  }
});

/**
 * GET /api/car-flow/scenarios/:id
 * Get scenario details with cars and assignments
 */
router.get('/scenarios/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const scenario = await prisma.scenario.findFirst({
      where: {
        id,
        companyId: req.user!.companyId
      },
      include: {
        creator: {
          select: { id: true, firstName: true, lastName: true, email: true }
        },
        customers: {
          include: {
            customer: {
              select: { id: true, name: true, code: true }
            }
          }
        },
        cars: {
          include: {
            car: {
              select: {
                id: true,
                railcarNumber: true,
                customer: true,
                customerId: true,
                status: true,
                shoppingStatus: true,
                tankQualification: true,
                rule88B: true,
                safetyRelief: true,
                minNoLining: true,
                minWLining: true
              }
            }
          }
        }
      }
    });

    if (!scenario) {
      return res.status(404).json({ message: 'Scenario not found' });
    }

    res.json(scenario);
  } catch (error) {
    logger.error('Failed to fetch scenario', error as Error);
    res.status(500).json({ message: 'Failed to fetch scenario' });
  }
});

/**
 * PATCH /api/car-flow/scenarios/:id
 * Update scenario (draft only)
 */
router.patch('/scenarios/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, notes, status } = req.body;

    // Fetch existing scenario
    const existing = await prisma.scenario.findFirst({
      where: { id, companyId: req.user!.companyId }
    });

    if (!existing) {
      return res.status(404).json({ message: 'Scenario not found' });
    }

    // Check if scenario is editable (only draft scenarios)
    if (existing.status !== 'draft' && !['archived'].includes(status)) {
      return res.status(400).json({
        message: 'Only draft scenarios can be edited'
      });
    }

    // Check for stale data (optimistic locking)
    const clientUpdatedAt = req.body.updatedAt;
    if (clientUpdatedAt && new Date(clientUpdatedAt) < existing.updatedAt) {
      return res.status(409).json({
        message: 'Scenario has been modified by another user. Please refresh and try again.',
        currentUpdatedAt: existing.updatedAt
      });
    }

    const scenario = await prisma.scenario.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(notes !== undefined && { notes }),
        ...(status && { status })
      }
    });

    res.json(scenario);
  } catch (error) {
    logger.error('Failed to update scenario', error as Error);
    res.status(500).json({ message: 'Failed to update scenario' });
  }
});

/**
 * DELETE /api/car-flow/scenarios/:id
 * Delete a draft scenario
 */
router.delete('/scenarios/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Verify scenario exists and is draft
    const scenario = await prisma.scenario.findFirst({
      where: {
        id,
        companyId: req.user!.companyId
      }
    });

    if (!scenario) {
      return res.status(404).json({ message: 'Scenario not found' });
    }

    if (scenario.status !== 'draft') {
      return res.status(400).json({
        message: 'Only draft scenarios can be deleted'
      });
    }

    // Delete scenario (cascade deletes cars and customers)
    await prisma.scenario.delete({
      where: { id }
    });

    res.status(204).send();
  } catch (error) {
    logger.error('Failed to delete scenario', error as Error);
    res.status(500).json({ message: 'Failed to delete scenario' });
  }
});

/**
 * POST /api/car-flow/scenarios/:id/cars
 * Add cars to a scenario
 */
router.post('/scenarios/:id/cars', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { carAssignments } = req.body;
    // carAssignments: Array<{ carId, shopId?, plannedMonth, plannedYear, shopReason? }>

    if (!Array.isArray(carAssignments) || carAssignments.length === 0) {
      return res.status(400).json({ message: 'carAssignments array is required' });
    }

    // Verify scenario exists and is draft
    const scenario = await prisma.scenario.findFirst({
      where: { id, companyId: req.user!.companyId }
    });

    if (!scenario) {
      return res.status(404).json({ message: 'Scenario not found' });
    }

    if (scenario.status !== 'draft') {
      return res.status(400).json({ message: 'Can only add cars to draft scenarios' });
    }

    // Create car assignments
    const scenarioCars = await prisma.scenarioCar.createMany({
      data: carAssignments.map((a: {
        carId: string;
        shopId?: string;
        plannedMonth: number;
        plannedYear: number;
        shopReason?: string;
      }) => ({
        scenarioId: id,
        carId: a.carId,
        shopId: a.shopId || null,
        plannedMonth: a.plannedMonth,
        plannedYear: a.plannedYear,
        shopReason: a.shopReason || '',
      })),
      skipDuplicates: true
    });

    res.status(201).json({ created: scenarioCars.count });
  } catch (error) {
    logger.error('Failed to add cars to scenario', error as Error);
    res.status(500).json({ message: 'Failed to add cars to scenario' });
  }
});

/**
 * DELETE /api/car-flow/scenarios/:id/cars/:carId
 * Remove a car from a scenario
 */
router.delete('/scenarios/:id/cars/:carId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id, carId } = req.params;

    // Verify scenario exists and is draft
    const scenario = await prisma.scenario.findFirst({
      where: { id, companyId: req.user!.companyId }
    });

    if (!scenario) {
      return res.status(404).json({ message: 'Scenario not found' });
    }

    if (scenario.status !== 'draft') {
      return res.status(400).json({ message: 'Can only modify draft scenarios' });
    }

    await prisma.scenarioCar.deleteMany({
      where: { scenarioId: id, carId }
    });

    res.json({ message: 'Car removed from scenario' });
  } catch (error) {
    logger.error('Failed to remove car from scenario', error as Error);
    res.status(500).json({ message: 'Failed to remove car from scenario' });
  }
});

/**
 * POST /api/car-flow/scenarios/:id/confirm
 * Confirm a scenario and create Car Flow Plan entries
 */
router.post('/scenarios/:id/confirm', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { overrideConflicts } = req.body;

    // Fetch scenario with all cars
    const scenario = await prisma.scenario.findFirst({
      where: { id, companyId: req.user!.companyId },
      include: {
        cars: {
          include: {
            car: {
              select: { id: true, railcarNumber: true, customerId: true }
            }
          }
        }
      }
    });

    if (!scenario) {
      return res.status(404).json({ message: 'Scenario not found' });
    }

    if (scenario.status !== 'draft') {
      return res.status(400).json({ message: 'Scenario is already confirmed' });
    }

    // Check for conflicts - cars already in Car Flow Plan
    const carIds = scenario.cars.map(sc => sc.carId);
    const existingPlans = await prisma.carFlowPlan.findMany({
      where: {
        carId: { in: carIds },
        status: { not: 'Cancelled' }
      },
      include: {
        car: { select: { railcarNumber: true } },
        shop: { select: { name: true, city: true } }
      }
    });

    if (existingPlans.length > 0 && !overrideConflicts) {
      // Return conflict information with soft warning
      const conflicts = existingPlans.map(p => ({
        carId: p.carId,
        railcarNumber: p.car.railcarNumber,
        shopName: `${p.shop.name}, ${p.shop.city}`,
        plannedMonth: p.plannedMonth,
        plannedYear: p.plannedYear,
        committedAt: p.committedAt
      }));

      return res.json({
        message: 'Some cars are already committed to a Car Flow Plan',
        conflicts,
        allowOverride: true // Soft warning - can proceed with overrideConflicts=true
      });
    }

    // If overriding, cancel existing plans for these cars
    if (existingPlans.length > 0 && overrideConflicts) {
      await prisma.carFlowPlan.updateMany({
        where: {
          carId: { in: existingPlans.map(p => p.carId) },
          status: { not: 'Cancelled' }
        },
        data: {
          status: 'Cancelled',
          cancelledAt: new Date()
        }
      });
    }

    // Create Car Flow Plan entries in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create Car Flow Plan entries for each car
      const planEntries = [];
      for (const scenarioCar of scenario.cars) {
        if (!scenarioCar.shopId) {
          continue; // Skip cars without shop assignment
        }

        const entry = await tx.carFlowPlan.create({
          data: {
            carId: scenarioCar.carId,
            shopId: scenarioCar.shopId,
            customerId: scenarioCar.car.customerId,
            plannedMonth: scenarioCar.plannedMonth,
            plannedYear: scenarioCar.plannedYear,
            sourceScenarioId: scenario.id,
            committedById: req.user!.id,
            shopReason: scenarioCar.shopReason,
            estimatedCost: scenarioCar.estimatedCost,
            status: 'Planned',
            companyId: req.user!.companyId
          }
        });
        planEntries.push(entry);

        // Update S&OP Commitment usage
        await tx.sOPCommitment.updateMany({
          where: {
            shopId: scenarioCar.shopId,
            year: scenarioCar.plannedYear,
            month: scenarioCar.plannedMonth
          },
          data: {
            currentUsage: { increment: 1 }
          }
        });
      }

      // Update scenario status
      await tx.scenario.update({
        where: { id },
        data: {
          status: 'confirmed',
          confirmedAt: new Date()
        }
      });

      return planEntries;
    });

    // Update shopping status for all affected cars
    const affectedCarIds = result.map(p => p.carId);
    await shoppingStatusService.updateBatchShoppingStatus(affectedCarIds);

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        userEmail: req.user!.email,
        action: 'confirm_scenario',
        entityType: 'Scenario',
        entityId: scenario.id,
        entityName: scenario.name,
        changes: JSON.stringify({
          carsCommitted: result.length,
          planIds: result.map(p => p.id)
        }),
        companyId: req.user!.companyId
      }
    });

    // TODO: Notify other users with draft scenarios containing these cars
    // This would use the notification system

    res.json({
      message: 'Scenario confirmed and committed to Car Flow Plan',
      scenario: { id: scenario.id, status: 'confirmed' },
      plansCreated: result.length
    });
  } catch (error) {
    logger.error('Failed to confirm scenario', error as Error);
    res.status(500).json({ message: 'Failed to confirm scenario' });
  }
});

/**
 * POST /api/car-flow/scenarios/:id/duplicate
 * Duplicate a scenario
 */
router.post('/scenarios/:id/duplicate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    // Fetch original scenario
    const original = await prisma.scenario.findFirst({
      where: { id, companyId: req.user!.companyId },
      include: {
        cars: true,
        customers: true
      }
    });

    if (!original) {
      return res.status(404).json({ message: 'Scenario not found' });
    }

    // Create duplicate
    const duplicate = await prisma.scenario.create({
      data: {
        name: name || `${original.name} (Copy)`,
        notes: original.notes,
        status: 'draft',
        companyId: req.user!.companyId,
        createdBy: req.user!.id,
        parentId: original.id,
        customers: {
          create: original.customers.map(c => ({
            customerId: c.customerId,
            isPrimary: c.isPrimary
          }))
        },
        cars: {
          create: original.cars.map(c => ({
            carId: c.carId,
            shopId: c.shopId,
            plannedMonth: c.plannedMonth,
            plannedYear: c.plannedYear,
            shopReason: c.shopReason,
            estimatedCost: c.estimatedCost,
            estimatedDays: c.estimatedDays
          }))
        }
      },
      include: {
        creator: {
          select: { id: true, firstName: true, lastName: true, email: true }
        },
        _count: { select: { cars: true } }
      }
    });

    res.status(201).json(duplicate);
  } catch (error) {
    logger.error('Failed to duplicate scenario', error as Error);
    res.status(500).json({ message: 'Failed to duplicate scenario' });
  }
});

// =============================================================================
// CAR FLOW PLANS
// =============================================================================

/**
 * GET /api/car-flow/plans
 * List Car Flow Plan entries
 */
router.get('/plans', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { shopId, customerId, year, month, status } = req.query;

    const plans = await prisma.carFlowPlan.findMany({
      where: {
        companyId: req.user!.companyId,
        ...(shopId && { shopId: shopId as string }),
        ...(customerId && { customerId: customerId as string }),
        ...(year && { plannedYear: parseInt(year as string) }),
        ...(month && { plannedMonth: parseInt(month as string) }),
        ...(status && { status: status as string }),
      },
      include: {
        car: {
          select: {
            id: true,
            railcarNumber: true,
            customer: true,
            shoppingStatus: true
          }
        },
        shop: {
          select: {
            id: true,
            name: true,
            code: true,
            city: true,
            state: true,
            parentShopId: true
          }
        },
        customer: {
          select: { id: true, name: true, code: true }
        },
        committedBy: {
          select: { id: true, firstName: true, lastName: true }
        }
      },
      orderBy: [
        { plannedYear: 'asc' },
        { plannedMonth: 'asc' },
        { committedAt: 'desc' }
      ]
    });

    res.json(plans);
  } catch (error) {
    logger.error('Failed to fetch car flow plans', error as Error);
    res.status(500).json({ message: 'Failed to fetch car flow plans' });
  }
});

/**
 * POST /api/car-flow/plans
 * Create a direct Car Flow Plan entry (skip scenario)
 */
router.post('/plans', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { carId, shopId, plannedMonth, plannedYear, shopReason, notes } = req.body;

    if (!carId || !shopId || !plannedMonth || !plannedYear) {
      return res.status(400).json({
        message: 'carId, shopId, plannedMonth, and plannedYear are required'
      });
    }

    // Check if car already has an active plan
    const existingPlan = await prisma.carFlowPlan.findFirst({
      where: {
        carId,
        status: { not: 'Cancelled' }
      }
    });

    if (existingPlan) {
      return res.status(409).json({
        message: 'Car already has an active Car Flow Plan',
        existingPlan
      });
    }

    // Get car details
    const car = await prisma.car.findUnique({
      where: { id: carId },
      select: { customerId: true }
    });

    if (!car) {
      return res.status(404).json({ message: 'Car not found' });
    }

    // Create plan entry
    const plan = await prisma.carFlowPlan.create({
      data: {
        carId,
        shopId,
        customerId: car.customerId,
        plannedMonth,
        plannedYear,
        committedById: req.user!.id,
        shopReason: shopReason || '',
        notes: notes || '',
        status: 'Planned',
        companyId: req.user!.companyId
      },
      include: {
        car: { select: { railcarNumber: true } },
        shop: { select: { name: true, city: true } }
      }
    });

    // Update S&OP Commitment usage
    await prisma.sOPCommitment.updateMany({
      where: {
        shopId,
        year: plannedYear,
        month: plannedMonth
      },
      data: {
        currentUsage: { increment: 1 }
      }
    });

    // Update shopping status
    await shoppingStatusService.updateCarShoppingStatus(carId);

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        userEmail: req.user!.email,
        action: 'create',
        entityType: 'CarFlowPlan',
        entityId: plan.id,
        entityName: `${plan.car.railcarNumber} → ${plan.shop.name}`,
        changes: JSON.stringify({ created: true }),
        companyId: req.user!.companyId
      }
    });

    res.status(201).json(plan);
  } catch (error) {
    logger.error('Failed to create car flow plan', error as Error);
    res.status(500).json({ message: 'Failed to create car flow plan' });
  }
});

/**
 * POST /api/car-flow/plans/bulk
 * Create multiple Car Flow Plan entries directly (skip scenario)
 * This is the main endpoint for "Plan Selected Cars" functionality
 */
router.post('/plans/bulk', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { assignments, overrideConflicts } = req.body;
    // assignments: Array<{ carId, shopId, plannedMonth, plannedYear, shopReason?, notes? }>

    if (!Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({
        message: 'assignments array is required with at least one entry'
      });
    }

    // Validate all assignments have required fields
    for (const a of assignments) {
      if (!a.carId || !a.shopId || !a.plannedMonth || !a.plannedYear) {
        return res.status(400).json({
          message: 'Each assignment must have carId, shopId, plannedMonth, and plannedYear'
        });
      }
    }

    const carIds = assignments.map((a: { carId: string }) => a.carId);

    // Check for existing active plans
    const existingPlans = await prisma.carFlowPlan.findMany({
      where: {
        carId: { in: carIds },
        status: { not: 'Cancelled' }
      },
      include: {
        car: { select: { railcarNumber: true } },
        shop: { select: { name: true, city: true } }
      }
    });

    if (existingPlans.length > 0 && !overrideConflicts) {
      // Return conflicts for user to decide
      const conflicts = existingPlans.map(p => ({
        carId: p.carId,
        railcarNumber: p.car.railcarNumber,
        existingShop: `${p.shop.name}, ${p.shop.city}`,
        existingMonth: `${p.plannedYear}-${String(p.plannedMonth).padStart(2, '0')}`,
        status: p.status
      }));

      return res.json({
        success: false,
        message: 'Some cars already have active plans',
        conflicts,
        allowOverride: true
      });
    }

    // If overriding, cancel existing plans
    if (existingPlans.length > 0 && overrideConflicts) {
      await prisma.carFlowPlan.updateMany({
        where: {
          carId: { in: existingPlans.map(p => p.carId) },
          status: { not: 'Cancelled' }
        },
        data: {
          status: 'Cancelled',
          cancelledAt: new Date()
        }
      });

      // Decrement S&OP usage for cancelled plans
      for (const plan of existingPlans) {
        await prisma.sOPCommitment.updateMany({
          where: {
            shopId: plan.shopId,
            year: plan.plannedYear,
            month: plan.plannedMonth
          },
          data: {
            currentUsage: { decrement: 1 }
          }
        });
      }
    }

    // Get car details for all cars
    const cars = await prisma.car.findMany({
      where: { id: { in: carIds } },
      select: { id: true, customerId: true, railcarNumber: true }
    });
    const carMap = new Map(cars.map(c => [c.id, c]));

    // Create all plans in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const createdPlans = [];

      for (const assignment of assignments as Array<{
        carId: string;
        shopId: string;
        plannedMonth: number;
        plannedYear: number;
        shopReason?: string;
        notes?: string;
      }>) {
        const car = carMap.get(assignment.carId);
        if (!car) continue;

        const plan = await tx.carFlowPlan.create({
          data: {
            carId: assignment.carId,
            shopId: assignment.shopId,
            customerId: car.customerId,
            plannedMonth: assignment.plannedMonth,
            plannedYear: assignment.plannedYear,
            committedById: req.user!.id,
            shopReason: assignment.shopReason || '',
            notes: assignment.notes || '',
            status: 'Planned',
            companyId: req.user!.companyId
          },
          include: {
            car: { select: { railcarNumber: true } },
            shop: { select: { name: true, city: true, code: true } }
          }
        });
        createdPlans.push(plan);

        // Update S&OP Commitment usage
        await tx.sOPCommitment.updateMany({
          where: {
            shopId: assignment.shopId,
            year: assignment.plannedYear,
            month: assignment.plannedMonth
          },
          data: {
            currentUsage: { increment: 1 }
          }
        });
      }

      return createdPlans;
    });

    // Update shopping status for all affected cars
    await shoppingStatusService.updateBatchShoppingStatus(carIds);

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        userEmail: req.user!.email,
        action: 'create',
        entityType: 'CarFlowPlan',
        entityId: 'bulk',
        entityName: `Bulk plan: ${result.length} cars`,
        changes: JSON.stringify({
          created: result.length,
          planIds: result.map(p => p.id),
          carNumbers: result.map(p => p.car.railcarNumber)
        }),
        companyId: req.user!.companyId
      }
    });

    res.status(201).json({
      success: true,
      message: `Successfully planned ${result.length} cars`,
      plansCreated: result.length,
      plans: result
    });
  } catch (error) {
    logger.error('Failed to create bulk car flow plans', error as Error);
    res.status(500).json({ message: 'Failed to create car flow plans' });
  }
});

/**
 * PATCH /api/car-flow/plans/:id/cancel
 * Cancel a Car Flow Plan entry
 */
router.patch('/plans/:id/cancel', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const plan = await prisma.carFlowPlan.findFirst({
      where: { id, companyId: req.user!.companyId }
    });

    if (!plan) {
      return res.status(404).json({ message: 'Plan not found' });
    }

    if (plan.status === 'Cancelled') {
      return res.status(400).json({ message: 'Plan is already cancelled' });
    }

    // Update plan status
    const updated = await prisma.carFlowPlan.update({
      where: { id },
      data: {
        status: 'Cancelled',
        cancelledAt: new Date()
      }
    });

    // Restore S&OP Commitment usage
    await prisma.sOPCommitment.updateMany({
      where: {
        shopId: plan.shopId,
        year: plan.plannedYear,
        month: plan.plannedMonth
      },
      data: {
        currentUsage: { decrement: 1 }
      }
    });

    // Update shopping status (car becomes available for re-planning)
    await shoppingStatusService.updateCarShoppingStatus(plan.carId);

    res.json(updated);
  } catch (error) {
    logger.error('Failed to cancel car flow plan', error as Error);
    res.status(500).json({ message: 'Failed to cancel car flow plan' });
  }
});

// =============================================================================
// CAPACITY
// =============================================================================

/**
 * GET /api/car-flow/capacity
 * Get capacity overview for shops
 */
router.get('/capacity', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { shopId, year, startMonth, endMonth } = req.query;
    const yearNum = parseInt(year as string) || new Date().getFullYear();
    const startMonthNum = parseInt(startMonth as string) || 1;
    const endMonthNum = parseInt(endMonth as string) || 12;

    // Build month range
    const months = [];
    for (let m = startMonthNum; m <= endMonthNum; m++) {
      months.push(m);
    }

    // Get S&OP commitments
    const commitments = await prisma.sOPCommitment.findMany({
      where: {
        companyId: req.user!.companyId,
        year: yearNum,
        month: { in: months },
        ...(shopId && { shopId: shopId as string })
      },
      include: {
        shop: {
          select: {
            id: true,
            name: true,
            code: true,
            city: true,
            state: true,
            parentShopId: true,
            isParent: true
          }
        }
      }
    });

    // Get current user's draft scenario usage
    const userDraftScenarios = await prisma.scenario.findMany({
      where: {
        companyId: req.user!.companyId,
        createdBy: req.user!.id,
        status: 'draft'
      },
      select: { id: true }
    });

    const draftScenarioIds = userDraftScenarios.map(s => s.id);

    // Get draft scenario car counts by shop/month
    const draftUsage = await prisma.scenarioCar.groupBy({
      by: ['shopId', 'plannedMonth', 'plannedYear'],
      where: {
        scenarioId: { in: draftScenarioIds },
        plannedYear: yearNum,
        plannedMonth: { in: months },
        shopId: { not: null }
      },
      _count: { id: true }
    });

    // Build capacity map
    const capacityMap = new Map<string, {
      shopId: string;
      shop: { id: string; name: string; code: string; city: string; state: string };
      months: Record<number, {
        committed: number;
        planned: number;
        draftUsage: number;
        available: number;
      }>;
    }>();

    // Initialize from commitments
    for (const commitment of commitments) {
      if (!capacityMap.has(commitment.shopId)) {
        capacityMap.set(commitment.shopId, {
          shopId: commitment.shopId,
          shop: {
            id: commitment.shop.id,
            name: commitment.shop.name,
            code: commitment.shop.code,
            city: commitment.shop.city,
            state: commitment.shop.state
          },
          months: {}
        });
      }

      const entry = capacityMap.get(commitment.shopId)!;
      entry.months[commitment.month] = {
        committed: commitment.committedVolume,
        planned: commitment.currentUsage,
        draftUsage: 0,
        available: commitment.committedVolume - commitment.currentUsage
      };
    }

    // Add draft usage
    for (const draft of draftUsage) {
      if (draft.shopId && capacityMap.has(draft.shopId)) {
        const entry = capacityMap.get(draft.shopId)!;
        if (entry.months[draft.plannedMonth]) {
          entry.months[draft.plannedMonth].draftUsage = draft._count.id;
          entry.months[draft.plannedMonth].available -= draft._count.id;
        }
      }
    }

    res.json({
      year: yearNum,
      months,
      capacity: Array.from(capacityMap.values())
    });
  } catch (error) {
    logger.error('Failed to fetch capacity', error as Error);
    res.status(500).json({ message: 'Failed to fetch capacity' });
  }
});

// =============================================================================
// S&OP COMMITMENTS (Admin only)
// =============================================================================

/**
 * GET /api/car-flow/sop-commitments
 * List S&OP Supply Commitments
 */
router.get('/sop-commitments', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { year, shopId, networkId } = req.query;

    const yearNum = parseInt(year as string) || new Date().getFullYear();

    // Get shop filter (including network children if networkId provided)
    let shopIds: string[] | undefined;
    if (networkId) {
      const networkShops = await prisma.shop.findMany({
        where: { parentShopId: networkId as string },
        select: { id: true }
      });
      shopIds = networkShops.map(s => s.id);
    } else if (shopId) {
      shopIds = [shopId as string];
    }

    const commitments = await prisma.sOPCommitment.findMany({
      where: {
        companyId: req.user!.companyId,
        year: yearNum,
        ...(shopIds && { shopId: { in: shopIds } })
      },
      include: {
        shop: {
          select: {
            id: true,
            name: true,
            code: true,
            city: true,
            state: true,
            parentShopId: true,
            parentShop: {
              select: { id: true, name: true }
            }
          }
        },
        createdBy: {
          select: { firstName: true, lastName: true }
        },
        updatedBy: {
          select: { firstName: true, lastName: true }
        }
      },
      orderBy: [
        { shop: { name: 'asc' } },
        { month: 'asc' }
      ]
    });

    res.json(commitments);
  } catch (error) {
    logger.error('Failed to fetch S&OP commitments', error as Error);
    res.status(500).json({ message: 'Failed to fetch S&OP commitments' });
  }
});

/**
 * POST /api/car-flow/sop-commitments
 * Create or update S&OP Commitment (Admin only)
 */
router.post(
  '/sop-commitments',
  requireRole('admin'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { shopId, year, month, committedVolume } = req.body;

      if (!shopId || !year || !month || committedVolume === undefined) {
        return res.status(400).json({
          message: 'shopId, year, month, and committedVolume are required'
        });
      }

      // Upsert commitment
      const commitment = await prisma.sOPCommitment.upsert({
        where: {
          shopId_year_month: { shopId, year, month }
        },
        create: {
          shopId,
          year,
          month,
          committedVolume,
          createdById: req.user!.id,
          companyId: req.user!.companyId
        },
        update: {
          committedVolume,
          updatedById: req.user!.id
        }
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          userEmail: req.user!.email,
          action: 'update',
          entityType: 'SOPCommitment',
          entityId: commitment.id,
          entityName: `${shopId} ${year}-${month}`,
          changes: JSON.stringify({ committedVolume }),
          companyId: req.user!.companyId
        }
      });

      res.json(commitment);
    } catch (error) {
      logger.error('Failed to update S&OP commitment', error as Error);
      res.status(500).json({ message: 'Failed to update S&OP commitment' });
    }
  }
);

/**
 * POST /api/car-flow/sop-commitments/batch
 * Batch update S&OP Commitments (Admin only)
 */
router.post(
  '/sop-commitments/batch',
  requireRole('admin'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { commitments } = req.body;
      // commitments: Array<{ shopId, year, month, committedVolume }>

      if (!Array.isArray(commitments) || commitments.length === 0) {
        return res.status(400).json({ message: 'commitments array is required' });
      }

      const results = await prisma.$transaction(
        commitments.map((c: { shopId: string; year: number; month: number; committedVolume: number }) =>
          prisma.sOPCommitment.upsert({
            where: {
              shopId_year_month: { shopId: c.shopId, year: c.year, month: c.month }
            },
            create: {
              shopId: c.shopId,
              year: c.year,
              month: c.month,
              committedVolume: c.committedVolume,
              createdById: req.user!.id,
              companyId: req.user!.companyId
            },
            update: {
              committedVolume: c.committedVolume,
              updatedById: req.user!.id
            }
          })
        )
      );

      res.json({ updated: results.length });
    } catch (error) {
      logger.error('Failed to batch update S&OP commitments', error as Error);
      res.status(500).json({ message: 'Failed to batch update S&OP commitments' });
    }
  }
);

// =============================================================================
// SHOPPING STATUS
// =============================================================================

/**
 * GET /api/car-flow/shopping-status/stats
 * Get shopping status statistics
 */
router.get('/shopping-status/stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = await shoppingStatusService.getShoppingStatusStats(req.user!.companyId);
    res.json(stats);
  } catch (error) {
    logger.error('Failed to fetch shopping status stats', error as Error);
    res.status(500).json({ message: 'Failed to fetch shopping status stats' });
  }
});

/**
 * POST /api/car-flow/shopping-status/recalculate
 * Recalculate shopping status for specified cars or all cars (Admin only)
 */
router.post(
  '/shopping-status/recalculate',
  requireRole('admin'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { carIds } = req.body;

      if (carIds && Array.isArray(carIds) && carIds.length > 0) {
        // Update specific cars
        const results = await shoppingStatusService.updateBatchShoppingStatus(carIds);
        res.json({
          message: 'Shopping status recalculated',
          updated: results.size
        });
      } else {
        // Backfill all cars
        const result = await shoppingStatusService.backfillAllShoppingStatuses(
          req.user!.companyId,
          100,
          (processed, total) => {
            logger.debug('Backfill progress', { processed, total });
          }
        );
        res.json({
          message: 'Shopping status backfill completed',
          ...result
        });
      }
    } catch (error) {
      logger.error('Failed to recalculate shopping status', error as Error);
      res.status(500).json({ message: 'Failed to recalculate shopping status' });
    }
  }
);

// =============================================================================
// EXPORTS
// =============================================================================

import { scenarioExportService } from '../services/scenarioExportService';

/**
 * GET /api/car-flow/scenarios/:id/export
 * Export a scenario to PDF or CSV
 */
router.get('/scenarios/:id/export', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const format = (req.query.format as string) || 'pdf';
    const branding = (req.query.branding as string) || 'aitx';

    // Verify scenario belongs to user's company
    const scenario = await prisma.scenario.findFirst({
      where: { id, companyId: req.user!.companyId },
    });

    if (!scenario) {
      return res.status(404).json({ message: 'Scenario not found' });
    }

    const buffer = await scenarioExportService.exportScenario({
      scenarioId: id,
      format: format as 'pdf' | 'csv',
      branding: branding as 'aitx' | 'customer',
    });

    const filename = `scenario-${scenario.name.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}`;

    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
    } else {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    }

    res.send(buffer);
  } catch (error) {
    logger.error('Failed to export scenario', error as Error);
    res.status(500).json({ message: 'Failed to export scenario' });
  }
});

/**
 * GET /api/car-flow/plans/export
 * Export Car Flow Plans to PDF or CSV
 */
router.get('/plans/export', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { year, month, shopId, customerId, format = 'pdf', branding = 'aitx' } = req.query;

    const buffer = await scenarioExportService.exportCarFlowPlans({
      year: year ? parseInt(year as string) : undefined,
      month: month ? parseInt(month as string) : undefined,
      shopId: shopId as string | undefined,
      customerId: customerId as string | undefined,
      format: format as 'pdf' | 'csv',
      branding: branding as 'aitx' | 'customer',
    });

    const filename = `car-flow-plan-${new Date().toISOString().split('T')[0]}`;

    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
    } else {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    }

    res.send(buffer);
  } catch (error) {
    logger.error('Failed to export Car Flow Plans', error as Error);
    res.status(500).json({ message: 'Failed to export Car Flow Plans' });
  }
});

// =============================================================================
// CUSTOMERS
// =============================================================================

/**
 * GET /api/car-flow/customers
 * List customers for the current user's company
 */
router.get('/customers', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const customers = await prisma.customer.findMany({
      where: {
        companyId: req.user!.companyId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        code: true,
      },
      orderBy: { name: 'asc' },
    });

    res.json(customers);
  } catch (error) {
    logger.error('Failed to fetch customers', error as Error);
    res.status(500).json({ message: 'Failed to fetch customers' });
  }
});

export default router;
