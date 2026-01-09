/**
 * Admin API Routes
 *
 * Administrative endpoints for system maintenance:
 * - Shopping status recalculation
 * - Database health checks
 * - Background job management
 */

import { Router, Response } from 'express';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { getShoppingStatusJob } from '../jobs/shoppingStatusJob';
import { createActiveAssignmentsService } from '../services/activeAssignmentsService';
import logger from '../utils/logger';

const router = Router();

// All admin routes require authentication and admin role
router.use(authenticate);

/**
 * POST /api/admin/shopping-status/backfill
 * Trigger a full shopping status recalculation
 */
router.post('/shopping-status/backfill', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const job = getShoppingStatusJob();
    if (!job) {
      res.status(503).json({ message: 'Shopping status job not initialized' });
      return;
    }

    // Check if job is already running
    const status = job.getStatus();
    if (status.isRunning) {
      res.status(409).json({ message: 'Job is already running', status });
      return;
    }

    // Run backfill for user's company (or all if admin)
    const companyId = req.body.companyId || req.user?.companyId;

    logger.info('Admin triggered shopping status backfill', {
      userId: req.user?.id,
      companyId,
    });

    // Start backfill asynchronously
    const result = await job.runFullBackfill(companyId);

    res.json({
      message: 'Shopping status backfill completed',
      result,
    });
  } catch (error) {
    logger.error('Error in shopping status backfill', { error });
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /api/admin/shopping-status/status
 * Get the status of the shopping status background job
 */
router.get('/shopping-status/status', requireRole('admin', 'planner'), async (req: AuthRequest, res: Response) => {
  try {
    const job = getShoppingStatusJob();
    if (!job) {
      res.status(503).json({ message: 'Shopping status job not initialized' });
      return;
    }

    const status = job.getStatus();
    res.json(status);
  } catch (error) {
    logger.error('Error getting shopping status job status', { error });
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /api/admin/assignments/stats
 * Get statistics about active assignments
 */
router.get('/assignments/stats', requireRole('admin', 'planner'), async (req: AuthRequest, res: Response) => {
  try {
    const prisma = req.app.locals.prisma;
    const service = createActiveAssignmentsService(prisma);
    const stats = await service.getAssignmentStats(req.user!.companyId);
    res.json(stats);
  } catch (error) {
    logger.error('Error getting assignment stats', { error });
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /api/admin/assignments
 * Get all active assignments (unified view)
 */
router.get('/assignments', requireRole('admin', 'planner'), async (req: AuthRequest, res: Response) => {
  try {
    const prisma = req.app.locals.prisma;
    const service = createActiveAssignmentsService(prisma);

    const { shopId, customerId, year, month, status, source } = req.query;

    const assignments = await service.getActiveAssignments({
      companyId: req.user!.companyId,
      shopId: shopId as string | undefined,
      customerId: customerId as string | undefined,
      plannedYear: year ? parseInt(year as string) : undefined,
      plannedMonth: month ? parseInt(month as string) : undefined,
      status: status ? (status as string).split(',') : undefined,
      source: source ? (source as string).split(',') : undefined,
    });

    res.json(assignments);
  } catch (error) {
    logger.error('Error getting active assignments', { error });
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /api/admin/database/health
 * Check database health and connection
 */
router.get('/database/health', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const prisma = req.app.locals.prisma;

    // Run a simple query to check connection
    const startTime = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const queryTime = Date.now() - startTime;

    // Get table counts
    const [carCount, shopCount, carFlowPlanCount, masterPlanCommitmentCount] = await Promise.all([
      prisma.car.count({ where: { companyId: req.user!.companyId } }),
      prisma.shop.count({ where: { companyId: req.user!.companyId } }),
      prisma.carFlowPlan.count({ where: { companyId: req.user!.companyId } }),
      prisma.masterPlanCommitment.count({ where: { companyId: req.user!.companyId } }),
    ]);

    res.json({
      status: 'healthy',
      queryTimeMs: queryTime,
      tableCounts: {
        cars: carCount,
        shops: shopCount,
        carFlowPlans: carFlowPlanCount,
        masterPlanCommitments: masterPlanCommitmentCount,
      },
    });
  } catch (error) {
    logger.error('Database health check failed', { error });
    res.status(503).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
