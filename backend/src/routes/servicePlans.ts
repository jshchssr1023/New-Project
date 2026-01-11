/**
 * servicePlans.ts - Service Plan Builder API Routes
 *
 * Provides RESTful endpoints for:
 * - Service Plan CRUD operations
 * - Car selection and management
 * - Plan Options management
 * - Capacity checking
 * - Option comparison
 * - Approval workflow
 *
 * @author AITX Chronos Team
 * @version 1.0.0
 */

import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { servicePlanService } from '../services/servicePlanService';
import { servicePlanExportService } from '../services/servicePlanExportService';
import logger from '../utils/logger';
import { prisma } from '../services/db';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// =============================================================================
// CUSTOMER ROUTES
// =============================================================================

/**
 * GET /service-plans/customers
 * Get all active customers for the company
 */
router.get('/customers', async (req: AuthRequest, res: Response) => {
  try {
    const customers = await prisma.customer.findMany({
      where: {
        companyId: req.user!.companyId,
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });
    res.json(customers);
  } catch (error) {
    logger.error('Get customers error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// =============================================================================
// SERVICE PLAN ROUTES
// =============================================================================

/**
 * GET /service-plans
 * List all service plans for the company
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { status, customerId } = req.query;

    const servicePlans = await servicePlanService.listServicePlans(
      req.user!.companyId,
      {
        status: status as string | undefined,
        customerId: customerId as string | undefined,
      }
    );

    res.json(servicePlans);
  } catch (error) {
    logger.error('List service plans error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * POST /service-plans
 * Create a new service plan
 */
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const {
      name,
      description,
      customerId,
      projectNumber,
      carFlowRate,
      startMonth,
      startYear,
      endMonth,
      endYear,
    } = req.body;

    // Validation
    if (!name) {
      res.status(400).json({ message: 'Name is required' });
      return;
    }
    if (!carFlowRate || carFlowRate < 1) {
      res.status(400).json({ message: 'Car flow rate must be at least 1' });
      return;
    }
    if (!startMonth || startMonth < 1 || startMonth > 12) {
      res.status(400).json({ message: 'Invalid start month' });
      return;
    }
    if (!startYear || startYear < 2020) {
      res.status(400).json({ message: 'Invalid start year' });
      return;
    }
    if (!endMonth || endMonth < 1 || endMonth > 12) {
      res.status(400).json({ message: 'Invalid end month' });
      return;
    }
    if (!endYear || endYear < startYear) {
      res.status(400).json({ message: 'Invalid end year' });
      return;
    }

    const servicePlan = await servicePlanService.createServicePlan({
      name,
      description,
      customerId,
      projectNumber,
      carFlowRate,
      startMonth,
      startYear,
      endMonth,
      endYear,
      companyId: req.user!.companyId,
      createdById: req.user!.id,
    });

    res.status(201).json(servicePlan);
  } catch (error) {
    logger.error('Create service plan error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /service-plans/:id
 * Get a service plan by ID with full details
 */
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const servicePlan = await servicePlanService.getServicePlan(
      req.params.id,
      req.user!.companyId
    );

    if (!servicePlan) {
      res.status(404).json({ message: 'Service plan not found' });
      return;
    }

    res.json(servicePlan);
  } catch (error) {
    logger.error('Get service plan error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * PUT /service-plans/:id
 * Update a service plan
 */
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const {
      name,
      description,
      customerId,
      projectNumber,
      carFlowRate,
      startMonth,
      startYear,
      endMonth,
      endYear,
    } = req.body;

    const servicePlan = await servicePlanService.updateServicePlan(
      req.params.id,
      {
        name,
        description,
        customerId,
        projectNumber,
        carFlowRate,
        startMonth,
        startYear,
        endMonth,
        endYear,
        companyId: req.user!.companyId,
        createdById: req.user!.id,
      },
      req.user!.companyId
    );

    res.json(servicePlan);
  } catch (error: any) {
    logger.error('Update service plan error', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
    } else if (error.message.includes('Access denied') || error.message.includes('approved')) {
      res.status(403).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
});

/**
 * DELETE /service-plans/:id
 * Delete a service plan
 */
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await servicePlanService.deleteServicePlan(
      req.params.id,
      req.user!.companyId
    );

    res.status(204).send();
  } catch (error: any) {
    logger.error('Delete service plan error', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
    } else if (error.message.includes('Access denied')) {
      res.status(403).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
});

// =============================================================================
// CAR MANAGEMENT ROUTES
// =============================================================================

/**
 * POST /service-plans/:id/cars
 * Add cars to a service plan by ID array
 */
router.post('/:id/cars', async (req: AuthRequest, res: Response) => {
  try {
    const { carIds } = req.body;

    if (!carIds || !Array.isArray(carIds) || carIds.length === 0) {
      res.status(400).json({ message: 'carIds array is required' });
      return;
    }

    const cars = await servicePlanService.addCarsToServicePlan(
      req.params.id,
      carIds,
      req.user!.companyId
    );

    res.status(201).json({
      message: `Added ${cars.length} cars to the service plan`,
      cars,
    });
  } catch (error: any) {
    logger.error('Add cars to service plan error', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
    } else if (error.message.includes('Access denied') || error.message.includes('approved')) {
      res.status(403).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
});

/**
 * POST /service-plans/:id/cars/by-filter
 * Add cars by filter criteria
 */
router.post('/:id/cars/by-filter', async (req: AuthRequest, res: Response) => {
  try {
    const { customerId, shoppingStatuses, limit } = req.body;

    const cars = await servicePlanService.addCarsByFilter(
      req.params.id,
      {
        customerId,
        shoppingStatuses,
        limit,
      },
      req.user!.companyId
    );

    res.status(201).json({
      message: `Added ${cars.length} cars to the service plan`,
      cars,
    });
  } catch (error: any) {
    logger.error('Add cars by filter error', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
    } else if (error.message.includes('Access denied')) {
      res.status(403).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
});

/**
 * DELETE /service-plans/:id/cars/:carId
 * Remove a car from a service plan
 */
router.delete('/:id/cars/:carId', async (req: AuthRequest, res: Response) => {
  try {
    await servicePlanService.removeCarFromServicePlan(
      req.params.id,
      req.params.carId,
      req.user!.companyId
    );

    res.status(204).send();
  } catch (error: any) {
    logger.error('Remove car from service plan error', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
    } else if (error.message.includes('Access denied') || error.message.includes('does not belong')) {
      res.status(403).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
});

/**
 * PUT /service-plans/:id/cars/:carId/month
 * Update a car's assigned month
 */
router.put('/:id/cars/:carId/month', async (req: AuthRequest, res: Response) => {
  try {
    const { month, year } = req.body;

    if (!month || month < 1 || month > 12) {
      res.status(400).json({ message: 'Invalid month' });
      return;
    }
    if (!year || year < 2020) {
      res.status(400).json({ message: 'Invalid year' });
      return;
    }

    const car = await servicePlanService.updateCarMonthAssignment(
      req.params.carId,
      month,
      year,
      req.user!.companyId
    );

    res.json(car);
  } catch (error: any) {
    logger.error('Update car month error', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
    } else if (error.message.includes('Access denied')) {
      res.status(403).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
});

// =============================================================================
// PLAN OPTIONS ROUTES
// =============================================================================

/**
 * POST /service-plans/:id/options
 * Create a new plan option
 */
router.post('/:id/options', async (req: AuthRequest, res: Response) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      res.status(400).json({ message: 'Name is required' });
      return;
    }

    const option = await servicePlanService.createPlanOption(
      req.params.id,
      { name, description },
      req.user!.companyId
    );

    res.status(201).json(option);
  } catch (error: any) {
    logger.error('Create plan option error', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
    } else if (error.message.includes('Access denied')) {
      res.status(403).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
});

/**
 * PUT /service-plans/:id/options/:optionId
 * Update a plan option
 */
router.put('/:id/options/:optionId', async (req: AuthRequest, res: Response) => {
  try {
    const { name, description } = req.body;

    const option = await servicePlanService.updatePlanOption(
      req.params.optionId,
      { name, description },
      req.user!.companyId
    );

    res.json(option);
  } catch (error: any) {
    logger.error('Update plan option error', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
    } else if (error.message.includes('Access denied')) {
      res.status(403).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
});

/**
 * DELETE /service-plans/:id/options/:optionId
 * Delete a plan option
 */
router.delete('/:id/options/:optionId', async (req: AuthRequest, res: Response) => {
  try {
    await servicePlanService.deletePlanOption(
      req.params.optionId,
      req.user!.companyId
    );

    res.status(204).send();
  } catch (error: any) {
    logger.error('Delete plan option error', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
    } else if (error.message.includes('Access denied')) {
      res.status(403).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
});

// =============================================================================
// ASSIGNMENTS ROUTES
// =============================================================================

/**
 * PUT /service-plans/:id/options/:optionId/assignments
 * Set all assignments for a plan option (bulk operation)
 */
router.put('/:id/options/:optionId/assignments', async (req: AuthRequest, res: Response) => {
  try {
    const { assignments } = req.body;

    if (!assignments || !Array.isArray(assignments)) {
      res.status(400).json({ message: 'assignments array is required' });
      return;
    }

    // Validate each assignment
    for (const a of assignments) {
      if (!a.servicePlanCarId || !a.shopId || !a.plannedMonth || !a.plannedYear) {
        res.status(400).json({
          message: 'Each assignment must have servicePlanCarId, shopId, plannedMonth, and plannedYear',
        });
        return;
      }
    }

    const option = await servicePlanService.setOptionAssignments(
      req.params.optionId,
      assignments,
      req.user!.companyId
    );

    res.json(option);
  } catch (error: any) {
    logger.error('Set option assignments error', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
    } else if (error.message.includes('Access denied')) {
      res.status(403).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
});

/**
 * PUT /service-plans/:id/options/:optionId/assignments/:assignmentId
 * Update a single assignment
 */
router.put('/:id/options/:optionId/assignments/:assignmentId', async (req: AuthRequest, res: Response) => {
  try {
    const {
      shopId,
      plannedMonth,
      plannedYear,
      estimatedCost,
      estimatedDays,
      shopReason,
    } = req.body;

    const assignment = await servicePlanService.updateAssignment(
      req.params.assignmentId,
      {
        shopId,
        plannedMonth,
        plannedYear,
        estimatedCost,
        estimatedDays,
        shopReason,
      },
      req.user!.companyId
    );

    res.json(assignment);
  } catch (error: any) {
    logger.error('Update assignment error', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
    } else if (error.message.includes('Access denied')) {
      res.status(403).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
});

// =============================================================================
// CAPACITY ROUTES
// =============================================================================

/**
 * GET /service-plans/:id/options/:optionId/capacity
 * Get capacity validation for an option
 */
router.get('/:id/options/:optionId/capacity', async (req: AuthRequest, res: Response) => {
  try {
    const validation = await servicePlanService.validateOptionCapacity(req.params.optionId);

    res.json(validation);
  } catch (error: any) {
    logger.error('Get option capacity error', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
});

/**
 * GET /service-plans/capacity/shop/:shopId
 * Get available capacity for a shop in a given month
 */
router.get('/capacity/shop/:shopId', async (req: AuthRequest, res: Response) => {
  try {
    const { month, year, excludeOptionId } = req.query;

    if (!month || !year) {
      res.status(400).json({ message: 'month and year query parameters are required' });
      return;
    }

    const capacity = await servicePlanService.getAvailableCapacity(
      req.params.shopId,
      parseInt(month as string),
      parseInt(year as string),
      excludeOptionId as string | undefined,
      req.user!.companyId
    );

    res.json(capacity);
  } catch (error: any) {
    logger.error('Get shop capacity error', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
});

// =============================================================================
// COMPARISON AND EXPORT ROUTES
// =============================================================================

/**
 * GET /service-plans/:id/compare
 * Get comparison data for all options in a service plan
 */
router.get('/:id/compare', async (req: AuthRequest, res: Response) => {
  try {
    const comparison = await servicePlanService.compareOptions(
      req.params.id,
      req.user!.companyId
    );

    res.json(comparison);
  } catch (error: any) {
    logger.error('Compare options error', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
    } else if (error.message.includes('Access denied')) {
      res.status(403).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
});

/**
 * GET /service-plans/:id/export
 * Export service plan to PDF
 */
router.get('/:id/export', async (req: AuthRequest, res: Response) => {
  try {
    const { branding, includeCarDetails, includeShopDetails } = req.query;

    // Verify access
    const servicePlan = await servicePlanService.getServicePlan(
      req.params.id,
      req.user!.companyId
    );

    if (!servicePlan) {
      res.status(404).json({ message: 'Service plan not found' });
      return;
    }

    const pdfBuffer = await servicePlanExportService.exportServicePlan({
      servicePlanId: req.params.id,
      branding: (branding as 'aitx' | 'customer') || 'aitx',
      includeCarDetails: includeCarDetails !== 'false',
      includeShopDetails: includeShopDetails === 'true',
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="service-plan-${servicePlan.name.replace(/[^a-z0-9]/gi, '-')}.pdf"`
    );
    res.send(pdfBuffer);
  } catch (error: any) {
    logger.error('Export service plan error', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
});

// =============================================================================
// WORKFLOW ROUTES
// =============================================================================

/**
 * POST /service-plans/:id/propose
 * Mark service plan as proposed (sent to customer)
 */
router.post('/:id/propose', async (req: AuthRequest, res: Response) => {
  try {
    const servicePlan = await servicePlanService.proposeServicePlan(
      req.params.id,
      req.user!.id,
      req.user!.companyId
    );

    res.json(servicePlan);
  } catch (error: any) {
    logger.error('Propose service plan error', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
    } else if (error.message.includes('Access denied')) {
      res.status(403).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
});

/**
 * POST /service-plans/:id/approve/:optionId
 * Approve an option and schedule the cars
 */
router.post('/:id/approve/:optionId', async (req: AuthRequest, res: Response) => {
  try {
    const { approvedBy } = req.body;

    if (!approvedBy) {
      res.status(400).json({ message: 'approvedBy (customer contact name) is required' });
      return;
    }

    const servicePlan = await servicePlanService.approveOption(
      req.params.id,
      req.params.optionId,
      approvedBy,
      req.user!.id,
      req.user!.companyId
    );

    res.json({
      message: 'Service plan approved and cars scheduled',
      servicePlan,
    });
  } catch (error: any) {
    logger.error('Approve service plan error', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
    } else if (error.message.includes('Access denied')) {
      res.status(403).json({ message: error.message });
    } else if (error.message.includes('exceeds shop capacity')) {
      res.status(409).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
});

export default router;
