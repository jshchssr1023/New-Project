/**
 * masterPlanRoutes.ts - MasterPlan API Routes
 *
 * REST API endpoints for MasterPlan workflow:
 * - Create MasterPlan from approved Scenario
 * - Get active MasterPlan for dashboards
 * - Manage MasterPlanCommitments
 * - Generate customer/shop schedules
 *
 * @author AITX Chronos Team
 * @version 1.0.0
 */

import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import { MasterPlanService, createMasterPlanService, CommitmentStatus } from '../services/masterPlanService';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getMasterPlanService(req: AuthRequest): MasterPlanService {
  const prisma: PrismaClient = req.app.locals.prisma;
  return createMasterPlanService(prisma);
}

// =============================================================================
// MASTERPLAN ROUTES
// =============================================================================

/**
 * GET /api/masterplans - List all MasterPlans for company
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { fiscalYear, status, limit, offset } = req.query;

    const service = getMasterPlanService(req);
    const plans = await service.listMasterPlans(req.user!.companyId, {
      fiscalYear: fiscalYear ? parseInt(fiscalYear as string) : undefined,
      status: status as any,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json(plans);
  } catch (error: any) {
    console.error('List master plans error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/masterplans/active - Get the currently active MasterPlan
 */
router.get('/active', async (req: AuthRequest, res: Response) => {
  try {
    const service = getMasterPlanService(req);
    const plan = await service.getActiveMasterPlan(req.user!.companyId);

    if (!plan) {
      res.status(404).json({ message: 'No active master plan found' });
      return;
    }

    res.json(plan);
  } catch (error: any) {
    console.error('Get active master plan error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/masterplans/:id - Get MasterPlan by ID with all commitments
 */
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const service = getMasterPlanService(req);
    const plan = await service.getMasterPlanById(req.params.id);

    if (!plan) {
      res.status(404).json({ message: 'Master plan not found' });
      return;
    }

    res.json(plan);
  } catch (error: any) {
    console.error('Get master plan error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/masterplans/:id/summary - Get summary statistics for a MasterPlan
 */
router.get('/:id/summary', async (req: AuthRequest, res: Response) => {
  try {
    const service = getMasterPlanService(req);
    const summary = await service.getMasterPlanSummary(req.params.id);

    res.json(summary);
  } catch (error: any) {
    console.error('Get master plan summary error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/masterplans/:id/commitments - Get all commitments for a MasterPlan
 */
router.get('/:id/commitments', async (req: AuthRequest, res: Response) => {
  try {
    const service = getMasterPlanService(req);
    const commitments = await service.getMasterPlanCommitments(req.params.id);

    res.json(commitments);
  } catch (error: any) {
    console.error('Get master plan commitments error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

/**
 * POST /api/masterplans/from-scenario - Create MasterPlan from approved Scenario
 *
 * This is the "Approve Scenario" action that converts a completed scenario
 * into the official MasterPlan.
 */
router.post('/from-scenario', async (req: AuthRequest, res: Response) => {
  try {
    const { scenarioId, planName } = req.body;

    if (!scenarioId) {
      res.status(400).json({ message: 'scenarioId is required' });
      return;
    }

    if (!planName) {
      res.status(400).json({ message: 'planName is required' });
      return;
    }

    const service = getMasterPlanService(req);
    const plan = await service.createMasterPlanFromScenario(
      scenarioId,
      req.user!.id,
      planName
    );

    // Emit WebSocket event
    const websocket = req.app.locals.websocket;
    if (websocket) {
      websocket.emitToCompany(req.user!.companyId, 'masterplan:created', {
        masterPlanId: plan.id,
        planName: plan.planName,
        fiscalYear: plan.fiscalYear,
        version: plan.version,
        commitmentCount: plan.commitments.length,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(201).json(plan);
  } catch (error: any) {
    console.error('Create master plan from scenario error:', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
      return;
    }
    if (error.message.includes('no assignments')) {
      res.status(400).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

/**
 * POST /api/masterplans/:id/approve - Approve a MasterPlan
 */
router.post('/:id/approve', async (req: AuthRequest, res: Response) => {
  try {
    const { activate } = req.body;

    const service = getMasterPlanService(req);
    const plan = await service.approveMasterPlan(
      req.params.id,
      req.user!.id,
      activate === true
    );

    // Emit WebSocket event
    const websocket = req.app.locals.websocket;
    if (websocket) {
      websocket.emitToCompany(req.user!.companyId, 'masterplan:approved', {
        masterPlanId: plan.id,
        status: plan.status,
        timestamp: new Date().toISOString(),
      });
    }

    res.json(plan);
  } catch (error: any) {
    console.error('Approve master plan error:', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
      return;
    }
    if (error.message.includes('Cannot approve')) {
      res.status(400).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

/**
 * POST /api/masterplans/:id/activate - Activate an approved MasterPlan
 */
router.post('/:id/activate', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;

    const plan = await prisma.masterPlan.findUnique({
      where: { id: req.params.id },
    });

    if (!plan) {
      res.status(404).json({ message: 'Master plan not found' });
      return;
    }

    if (plan.status !== 'approved') {
      res.status(400).json({ message: 'Only approved plans can be activated' });
      return;
    }

    // Archive other active plans for this fiscal year
    await prisma.masterPlan.updateMany({
      where: {
        companyId: plan.companyId,
        fiscalYear: plan.fiscalYear,
        status: 'active',
        id: { not: plan.id },
      },
      data: { status: 'archived' },
    });

    const updated = await prisma.masterPlan.update({
      where: { id: req.params.id },
      data: { status: 'active' },
    });

    // Emit WebSocket event
    const websocket = req.app.locals.websocket;
    if (websocket) {
      websocket.emitToCompany(req.user!.companyId, 'masterplan:activated', {
        masterPlanId: updated.id,
        timestamp: new Date().toISOString(),
      });
    }

    res.json(updated);
  } catch (error: any) {
    console.error('Activate master plan error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

/**
 * POST /api/masterplans/:id/archive - Archive a MasterPlan
 */
router.post('/:id/archive', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;

    const updated = await prisma.masterPlan.update({
      where: { id: req.params.id },
      data: { status: 'archived' },
    });

    res.json(updated);
  } catch (error: any) {
    console.error('Archive master plan error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

// =============================================================================
// COMMITMENT ROUTES
// =============================================================================

/**
 * PUT /api/masterplans/:id/commitments/:cid/status - Update commitment status
 */
router.put('/:id/commitments/:cid/status', async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;

    if (!status) {
      res.status(400).json({ message: 'status is required' });
      return;
    }

    const service = getMasterPlanService(req);
    const commitment = await service.updateCommitmentStatus(
      req.params.cid,
      status as CommitmentStatus
    );

    // Emit WebSocket event
    const websocket = req.app.locals.websocket;
    if (websocket) {
      websocket.emitToCompany(req.user!.companyId, 'commitment:statusChanged', {
        commitmentId: commitment.id,
        masterPlanId: commitment.masterPlanId,
        status: commitment.status,
        timestamp: new Date().toISOString(),
      });
    }

    res.json(commitment);
  } catch (error: any) {
    console.error('Update commitment status error:', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
      return;
    }
    if (error.message.includes('Invalid status')) {
      res.status(400).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

// =============================================================================
// SCHEDULE ROUTES (Customer and Shop views)
// =============================================================================

/**
 * GET /api/masterplans/customer/:customerId/schedule - Get customer schedule
 */
router.get('/customer/:customerId/schedule', async (req: AuthRequest, res: Response) => {
  try {
    const { masterPlanId } = req.query;

    const service = getMasterPlanService(req);
    const schedule = await service.getCustomerSchedule(
      req.params.customerId,
      masterPlanId as string | undefined
    );

    res.json(schedule);
  } catch (error: any) {
    console.error('Get customer schedule error:', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/masterplans/shop/:shopId/workorders - Get shop work orders
 */
router.get('/shop/:shopId/workorders', async (req: AuthRequest, res: Response) => {
  try {
    const { month } = req.query;

    if (!month) {
      res.status(400).json({ message: 'month query parameter is required (YYYY-MM format)' });
      return;
    }

    const service = getMasterPlanService(req);
    const workOrders = await service.getShopWorkOrders(
      req.params.shopId,
      month as string
    );

    res.json(workOrders);
  } catch (error: any) {
    console.error('Get shop work orders error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/masterplans/customers - Get all customers with commitments
 */
router.get('/data/customers', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;

    const customers = await prisma.customer.findMany({
      where: {
        companyId: req.user!.companyId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        code: true,
        _count: {
          select: { masterCommitments: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.json(customers);
  } catch (error: any) {
    console.error('Get customers error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/masterplans/shops - Get all shops with commitment counts
 */
router.get('/data/shops', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;

    const shops = await prisma.shop.findMany({
      where: {
        companyId: req.user!.companyId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        code: true,
        region: true,
        qualCapacity: true,
        assignCapacity: true,
      },
      orderBy: { name: 'asc' },
    });

    res.json(shops);
  } catch (error: any) {
    console.error('Get shops error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

export default router;
