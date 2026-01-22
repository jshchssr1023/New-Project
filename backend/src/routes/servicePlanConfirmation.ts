/**
 * servicePlanConfirmation.ts - Service Plan Confirmation API Routes
 *
 * Provides RESTful endpoints for the Service Plan confirmation workflow:
 * - Car Matrix operations (view, confirm cars)
 * - Car deletion with secondary confirmation
 * - Final plan confirmation
 * - Confirmation summary
 * - Reporting views (confirmed/pending plans)
 * - Audit history
 *
 * @author AITX Chronos Team
 * @version 1.0.0
 */

import { Router, Response } from 'express';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { servicePlanConfirmationService } from '../services/servicePlanConfirmationService';
import logger from '../utils/logger';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// =============================================================================
// SERVICE PLAN CRUD WITH CUSTOMER REQUIREMENT
// =============================================================================

/**
 * POST /service-plans/v2
 * Create a new service plan (customer is required)
 */
router.post('/v2', requireRole('admin', 'planner'), async (req: AuthRequest, res: Response) => {
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
    if (!customerId) {
      res.status(400).json({ message: 'Customer ID is required. A Service Plan must belong to exactly one customer.' });
      return;
    }
    if (!carFlowRate || carFlowRate < 1) {
      res.status(400).json({ message: 'Car flow rate must be at least 1' });
      return;
    }
    if (!startMonth || startMonth < 1 || startMonth > 12) {
      res.status(400).json({ message: 'Invalid start month (1-12)' });
      return;
    }
    if (!startYear || startYear < 2020) {
      res.status(400).json({ message: 'Invalid start year' });
      return;
    }
    if (!endMonth || endMonth < 1 || endMonth > 12) {
      res.status(400).json({ message: 'Invalid end month (1-12)' });
      return;
    }
    if (!endYear || endYear < startYear) {
      res.status(400).json({ message: 'Invalid end year' });
      return;
    }

    const servicePlan = await servicePlanConfirmationService.createServicePlan({
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
  } catch (error: any) {
    logger.error('Create service plan (v2) error', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

// =============================================================================
// CAR MATRIX ROUTES (Story 3: Car Matrix as Confirmation Authority)
// =============================================================================

/**
 * GET /service-plans/:id/car-matrix
 * Get Car Matrix data for a service plan
 * The Car Matrix is the ONLY place where confirmation can occur
 */
router.get('/:id/car-matrix', async (req: AuthRequest, res: Response) => {
  try {
    const carMatrix = await servicePlanConfirmationService.getCarMatrix(
      req.params.id,
      req.user!.companyId
    );

    res.json(carMatrix);
  } catch (error: any) {
    logger.error('Get car matrix error', error);
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
 * POST /service-plans/:id/cars/v2
 * Add a car to the service plan with assignment
 */
router.post('/:id/cars/v2', requireRole('admin', 'planner'), async (req: AuthRequest, res: Response) => {
  try {
    const { carId, assignedShopId, plannedMonth, plannedYear, shopReason } = req.body;

    if (!carId) {
      res.status(400).json({ message: 'carId is required' });
      return;
    }

    const car = await servicePlanConfirmationService.addCarToPlan(
      req.params.id,
      { carId, assignedShopId, plannedMonth, plannedYear, shopReason },
      req.user!.id,
      req.user!.companyId
    );

    res.status(201).json(car);
  } catch (error: any) {
    logger.error('Add car to plan (v2) error', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
    } else if (error.message.includes('already in')) {
      res.status(409).json({ message: error.message });
    } else if (error.message.includes('Access denied') || error.message.includes('cannot be modified')) {
      res.status(403).json({ message: error.message });
    } else {
      res.status(500).json({ message: error.message || 'Internal server error' });
    }
  }
});

/**
 * PUT /service-plans/:id/cars/:carId/assignment
 * Update car assignment (shop, month, reason) - only for pending cars
 */
router.put('/:id/cars/:carId/assignment', requireRole('admin', 'planner'), async (req: AuthRequest, res: Response) => {
  try {
    const { assignedShopId, plannedMonth, plannedYear, shopReason } = req.body;

    const updated = await servicePlanConfirmationService.updateCarAssignment(
      req.params.carId,
      { assignedShopId, plannedMonth, plannedYear, shopReason },
      req.user!.id,
      req.user!.companyId
    );

    res.json(updated);
  } catch (error: any) {
    logger.error('Update car assignment error', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
    } else if (error.message.includes('pending') || error.message.includes('locked')) {
      res.status(403).json({ message: error.message });
    } else {
      res.status(500).json({ message: error.message || 'Internal server error' });
    }
  }
});

// =============================================================================
// CAR CONFIRMATION ROUTES (Story 3)
// =============================================================================

/**
 * POST /service-plans/:id/cars/:carId/confirm
 * Confirm a single car in the Car Matrix (locks the car)
 */
router.post('/:id/cars/:carId/confirm', requireRole('admin', 'planner'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await servicePlanConfirmationService.confirmCar(
      req.params.carId,
      req.user!.id,
      req.user!.companyId
    );

    res.json({
      message: `Car ${result.railcarNumber} confirmed successfully`,
      ...result,
    });
  } catch (error: any) {
    logger.error('Confirm car error', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
    } else if (error.message.includes('cannot be confirmed') || error.message.includes('must have')) {
      res.status(400).json({ message: error.message });
    } else if (error.message.includes('Access denied')) {
      res.status(403).json({ message: error.message });
    } else {
      res.status(500).json({ message: error.message || 'Internal server error' });
    }
  }
});

/**
 * POST /service-plans/:id/cars/confirm-bulk
 * Confirm multiple cars at once
 */
router.post('/:id/cars/confirm-bulk', requireRole('admin', 'planner'), async (req: AuthRequest, res: Response) => {
  try {
    const { servicePlanCarIds } = req.body;

    if (!servicePlanCarIds || !Array.isArray(servicePlanCarIds) || servicePlanCarIds.length === 0) {
      res.status(400).json({ message: 'servicePlanCarIds array is required' });
      return;
    }

    const results = await servicePlanConfirmationService.confirmCars(
      servicePlanCarIds,
      req.user!.id,
      req.user!.companyId
    );

    res.json({
      message: `${results.length} cars confirmed successfully`,
      results,
    });
  } catch (error: any) {
    logger.error('Bulk confirm cars error', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

// =============================================================================
// CAR DELETION ROUTES (Story 4: Secondary Confirmation)
// =============================================================================

/**
 * DELETE /service-plans/:id/cars/:carId
 * Delete a car from the plan (requires secondary confirmation)
 */
router.delete('/:id/cars/:carId', requireRole('admin', 'planner'), async (req: AuthRequest, res: Response) => {
  try {
    const { deleteReason, secondaryConfirmation } = req.body;

    // Require secondary confirmation
    if (!secondaryConfirmation) {
      res.status(400).json({
        message: 'Secondary confirmation required',
        requiresConfirmation: true,
        prompt: 'Are you sure you want to delete this car from the plan? This action will retain audit history but remove the car from active planning.',
      });
      return;
    }

    const result = await servicePlanConfirmationService.deleteCar(
      req.params.carId,
      deleteReason || '',
      true,  // secondaryConfirmation already validated
      req.user!.id,
      req.user!.companyId
    );

    res.json({
      message: `Car ${result.railcarNumber} deleted from plan`,
      ...result,
    });
  } catch (error: any) {
    logger.error('Delete car error', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
    } else if (error.message.includes('pending') || error.message.includes('locked')) {
      res.status(403).json({ message: error.message });
    } else {
      res.status(500).json({ message: error.message || 'Internal server error' });
    }
  }
});

// =============================================================================
// CONFIRMATION SUMMARY (Story 6)
// =============================================================================

/**
 * GET /service-plans/:id/confirmation-summary
 * Get confirmation summary for review before final confirmation
 */
router.get('/:id/confirmation-summary', async (req: AuthRequest, res: Response) => {
  try {
    const summary = await servicePlanConfirmationService.getConfirmationSummary(
      req.params.id,
      req.user!.companyId
    );

    res.json(summary);
  } catch (error: any) {
    logger.error('Get confirmation summary error', error);
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
// FINAL PLAN CONFIRMATION (Story 5)
// =============================================================================

/**
 * POST /service-plans/:id/final-confirm
 * Final confirmation of the service plan
 * - Only planners can perform this
 * - Must have at least one confirmed car
 * - No pending cars allowed
 * - Sends confirmed cars to Master Schedule
 */
router.post('/:id/final-confirm', requireRole('admin', 'planner'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await servicePlanConfirmationService.finalConfirmPlan(
      req.params.id,
      req.user!.id,
      req.user!.companyId
    );

    res.json({
      message: `Plan final confirmed. ${result.scheduledCars} cars scheduled to Master Schedule.`,
      ...result,
    });
  } catch (error: any) {
    logger.error('Final confirm plan error', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
    } else if (error.message.includes('already has a Final Confirmed')) {
      res.status(409).json({ message: error.message });
    } else if (error.message.includes('Cannot final confirm') || error.message.includes('pending cars')) {
      res.status(400).json({ message: error.message });
    } else if (error.message.includes('Access denied')) {
      res.status(403).json({ message: error.message });
    } else {
      res.status(500).json({ message: error.message || 'Internal server error' });
    }
  }
});

// =============================================================================
// REPORTING ROUTES (Story 8: Visibility & Reporting)
// =============================================================================

/**
 * GET /service-plans/reports/confirmed
 * Get all confirmed plans with filters
 */
router.get('/reports/confirmed', async (req: AuthRequest, res: Response) => {
  try {
    const { customerId, plannerId, shopId, month, year } = req.query;

    const plans = await servicePlanConfirmationService.getConfirmedPlans(
      req.user!.companyId,
      {
        customerId: customerId as string,
        plannerId: plannerId as string,
        shopId: shopId as string,
        month: month ? parseInt(month as string) : undefined,
        year: year ? parseInt(year as string) : undefined,
      }
    );

    res.json(plans);
  } catch (error) {
    logger.error('Get confirmed plans error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /service-plans/reports/pending
 * Get all pending/draft plans with filters
 */
router.get('/reports/pending', async (req: AuthRequest, res: Response) => {
  try {
    const { customerId, plannerId } = req.query;

    const plans = await servicePlanConfirmationService.getPendingPlans(
      req.user!.companyId,
      {
        customerId: customerId as string,
        plannerId: plannerId as string,
      }
    );

    res.json(plans);
  } catch (error) {
    logger.error('Get pending plans error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /service-plans/:id/report
 * Get detailed plan report
 */
router.get('/:id/report', async (req: AuthRequest, res: Response) => {
  try {
    const report = await servicePlanConfirmationService.getPlanReport(
      req.params.id,
      req.user!.companyId
    );

    res.json(report);
  } catch (error: any) {
    logger.error('Get plan report error', error);
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
// AUDIT ROUTES (Story 9: Versioning & Audit Control)
// =============================================================================

/**
 * GET /service-plans/:id/audit
 * Get audit history for a service plan
 */
router.get('/:id/audit', async (req: AuthRequest, res: Response) => {
  try {
    const { limit, offset, eventType } = req.query;

    const auditEvents = await servicePlanConfirmationService.getAuditHistory(
      req.params.id,
      req.user!.companyId,
      {
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
        eventType: eventType as string,
      }
    );

    res.json(auditEvents);
  } catch (error: any) {
    logger.error('Get audit history error', error);
    if (error.message.includes('not found') || error.message.includes('access denied')) {
      res.status(404).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
});

// =============================================================================
// CUSTOMER CHECK ROUTE
// =============================================================================

/**
 * GET /service-plans/customer/:customerId/has-final-confirmed
 * Check if customer already has a final confirmed plan
 */
router.get('/customer/:customerId/has-final-confirmed', async (req: AuthRequest, res: Response) => {
  try {
    const hasFinalConfirmed = await servicePlanConfirmationService.hasCustomerFinalConfirmedPlan(
      req.params.customerId
    );

    res.json({ hasFinalConfirmed });
  } catch (error) {
    logger.error('Check customer final confirmed error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
