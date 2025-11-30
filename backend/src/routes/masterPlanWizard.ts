/**
 * Master Plan Wizard API Routes
 *
 * Handles the Gold Standard 3-Step Master Plan workflow:
 * - Weekly capacity management with inline auditing
 * - Master plan versioning and locking
 * - Bulk allocation operations
 * - Integration logging and health monitoring
 * - Import validation workflow
 */

import { Router, Request, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import masterPlanWizardService from '../services/masterPlanWizardService';
import importValidationService from '../services/importValidationService';
import shopHistoryService from '../services/shopHistoryService';

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

// =============================================================================
// WEEKLY CAPACITY ROUTES
// =============================================================================

/**
 * GET /api/master-plan-wizard/capacity/weeks
 * Get week keys for a date range
 */
router.get('/capacity/weeks', async (req: Request, res: Response) => {
  try {
    const { startDate, weeks = 16 } = req.query;
    const start = startDate ? new Date(startDate as string) : new Date();
    const weekKeys = masterPlanWizardService.generateWeekKeys(start, Number(weeks));
    res.json({ weekKeys });
  } catch (error) {
    console.error('Error generating week keys:', error);
    res.status(500).json({ error: 'Failed to generate week keys' });
  }
});

/**
 * GET /api/master-plan-wizard/capacity
 * Get weekly capacities for shops
 */
router.get('/capacity', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { shopIds, weekKeys } = req.query;

    if (!shopIds || !weekKeys) {
      return res.status(400).json({ error: 'shopIds and weekKeys are required' });
    }

    const shopIdArray = (shopIds as string).split(',');
    const weekKeyArray = (weekKeys as string).split(',');

    const capacities = await masterPlanWizardService.getWeeklyCapacities(
      shopIdArray,
      weekKeyArray,
      authReq.user.companyId
    );

    res.json({ capacities });
  } catch (error) {
    console.error('Error getting weekly capacities:', error);
    res.status(500).json({ error: 'Failed to get weekly capacities' });
  }
});

/**
 * PUT /api/master-plan-wizard/capacity/:id
 * Update weekly capacity with required justification
 */
router.put('/capacity/:id', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;
    const { fieldName, newValue, justification, changeCategory } = req.body;

    if (!fieldName || newValue === undefined || !justification || !changeCategory) {
      return res.status(400).json({
        error: 'fieldName, newValue, justification, and changeCategory are required',
      });
    }

    const result = await masterPlanWizardService.updateWeeklyCapacity({
      weeklyCapacityId: id,
      fieldName,
      newValue,
      justification,
      changeCategory,
      userId: authReq.user.id,
      userEmail: authReq.user.email,
      companyId: authReq.user.companyId,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ capacity: result.capacity });
  } catch (error) {
    console.error('Error updating weekly capacity:', error);
    res.status(500).json({ error: 'Failed to update weekly capacity' });
  }
});

/**
 * POST /api/master-plan-wizard/capacity/:id/lock
 * Lock weekly capacity
 */
router.post('/capacity/:id/lock', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;

    const capacity = await masterPlanWizardService.lockWeeklyCapacity(
      id,
      authReq.user.id,
      authReq.user.companyId
    );

    res.json({ capacity });
  } catch (error) {
    console.error('Error locking weekly capacity:', error);
    res.status(500).json({ error: 'Failed to lock weekly capacity' });
  }
});

// =============================================================================
// MASTER PLAN VERSION ROUTES
// =============================================================================

/**
 * GET /api/master-plan-wizard/versions/:masterPlanId
 * Get all versions for a master plan
 */
router.get('/versions/:masterPlanId', async (req: Request, res: Response) => {
  try {
    const { masterPlanId } = req.params;
    const versions = await masterPlanWizardService.getMasterPlanVersions(masterPlanId);
    res.json({ versions });
  } catch (error) {
    console.error('Error getting master plan versions:', error);
    res.status(500).json({ error: 'Failed to get versions' });
  }
});

/**
 * POST /api/master-plan-wizard/versions
 * Create a new version of a master plan
 */
router.post('/versions', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { masterPlanId, versionLabel, planSnapshot } = req.body;

    if (!masterPlanId || !planSnapshot) {
      return res.status(400).json({ error: 'masterPlanId and planSnapshot are required' });
    }

    const result = await masterPlanWizardService.createMasterPlanVersion({
      masterPlanId,
      versionLabel,
      planSnapshot,
      userId: authReq.user.id,
      userEmail: authReq.user.email,
      companyId: authReq.user.companyId,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ version: result.version });
  } catch (error) {
    console.error('Error creating master plan version:', error);
    res.status(500).json({ error: 'Failed to create version' });
  }
});

/**
 * POST /api/master-plan-wizard/versions/:id/lock
 * Lock and confirm a master plan version
 */
router.post('/versions/:id/lock', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;
    const { lockReason } = req.body;

    if (!lockReason) {
      return res.status(400).json({ error: 'lockReason is required' });
    }

    const result = await masterPlanWizardService.lockMasterPlanVersion(
      id,
      lockReason,
      authReq.user.id,
      authReq.user.email,
      authReq.user.companyId
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ version: result.version });
  } catch (error) {
    console.error('Error locking master plan version:', error);
    res.status(500).json({ error: 'Failed to lock version' });
  }
});

/**
 * POST /api/master-plan-wizard/versions/:id/publish
 * Publish master plan to downstream scheduling
 */
router.post('/versions/:id/publish', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;

    const result = await masterPlanWizardService.publishMasterPlanVersion(
      id,
      authReq.user.id,
      authReq.user.email,
      authReq.user.companyId
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      version: result.version,
      integrationLog: result.integrationLog,
    });
  } catch (error) {
    console.error('Error publishing master plan version:', error);
    res.status(500).json({ error: 'Failed to publish version' });
  }
});

// =============================================================================
// BULK ALLOCATION ROUTES
// =============================================================================

/**
 * POST /api/master-plan-wizard/allocations/validate
 * Validate allocation against capacity (hard-stop validation)
 */
router.post('/allocations/validate', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { shopId, weekKey, workType, requestedCount } = req.body;

    if (!shopId || !weekKey || !workType || requestedCount === undefined) {
      return res.status(400).json({
        error: 'shopId, weekKey, workType, and requestedCount are required',
      });
    }

    const result = await masterPlanWizardService.validateAllocation(
      shopId,
      weekKey,
      workType,
      requestedCount,
      authReq.user.companyId
    );

    res.json(result);
  } catch (error) {
    console.error('Error validating allocation:', error);
    res.status(500).json({ error: 'Failed to validate allocation' });
  }
});

/**
 * POST /api/master-plan-wizard/allocations/bulk
 * Bulk allocate cars to a shop
 */
router.post('/allocations/bulk', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { carIds, shopId, weekKey, workType, justification, overrideReason } = req.body;

    if (!carIds?.length || !shopId || !weekKey || !workType || !justification || !overrideReason) {
      return res.status(400).json({
        error: 'carIds, shopId, weekKey, workType, justification, and overrideReason are required',
      });
    }

    const result = await masterPlanWizardService.bulkAllocateCars({
      carIds,
      shopId,
      weekKey,
      workType,
      justification,
      overrideReason,
      userId: authReq.user.id,
      userEmail: authReq.user.email,
      companyId: authReq.user.companyId,
    });

    if (!result.success) {
      return res.status(result.capacityExceeded ? 400 : 500).json({
        error: result.error,
        capacityExceeded: result.capacityExceeded,
      });
    }

    res.json({ allocated: result.allocated });
  } catch (error) {
    console.error('Error bulk allocating cars:', error);
    res.status(500).json({ error: 'Failed to bulk allocate cars' });
  }
});

// =============================================================================
// INTEGRATION HEALTH ROUTES
// =============================================================================

/**
 * GET /api/master-plan-wizard/integrations
 * Get recent integration logs
 */
router.get('/integrations', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { limit = 10 } = req.query;

    const logs = await masterPlanWizardService.getRecentIntegrationLogs(
      authReq.user.companyId,
      Number(limit)
    );

    res.json({ logs });
  } catch (error) {
    console.error('Error getting integration logs:', error);
    res.status(500).json({ error: 'Failed to get integration logs' });
  }
});

/**
 * GET /api/master-plan-wizard/integrations/health
 * Get integration health summary
 */
router.get('/integrations/health', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;

    const summary = await masterPlanWizardService.getIntegrationHealthSummary(
      authReq.user.companyId
    );

    res.json(summary);
  } catch (error) {
    console.error('Error getting integration health:', error);
    res.status(500).json({ error: 'Failed to get integration health' });
  }
});

// =============================================================================
// IMPORT SESSION ROUTES (3-Step Validation Workflow)
// =============================================================================

/**
 * POST /api/master-plan-wizard/import/upload
 * Step 1: Upload file and create import session
 */
router.post('/import/upload', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { sessionType, fileName, fileSize, rawData } = req.body;

    if (!sessionType || !fileName || !rawData) {
      return res.status(400).json({
        error: 'sessionType, fileName, and rawData are required',
      });
    }

    const session = await importValidationService.createImportSession(
      sessionType,
      fileName,
      fileSize || 0,
      rawData,
      authReq.user.id,
      authReq.user.email,
      authReq.user.companyId
    );

    res.json({ session });
  } catch (error) {
    console.error('Error creating import session:', error);
    res.status(500).json({ error: 'Failed to create import session' });
  }
});

/**
 * POST /api/master-plan-wizard/import/:sessionId/validate
 * Step 2: Validate data and generate preview
 */
router.post('/import/:sessionId/validate', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = await importValidationService.validateImportSession(sessionId);

    res.json({ session });
  } catch (error) {
    console.error('Error validating import session:', error);
    res.status(500).json({ error: 'Failed to validate import session' });
  }
});

/**
 * PUT /api/master-plan-wizard/import/:sessionId/mappings
 * Step 3: Update field mappings
 */
router.put('/import/:sessionId/mappings', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { mappings } = req.body;

    if (!mappings) {
      return res.status(400).json({ error: 'mappings are required' });
    }

    const session = await importValidationService.updateFieldMappings(sessionId, mappings);

    res.json({ session });
  } catch (error) {
    console.error('Error updating field mappings:', error);
    res.status(500).json({ error: 'Failed to update field mappings' });
  }
});

/**
 * POST /api/master-plan-wizard/import/:sessionId/execute
 * Execute the import
 */
router.post('/import/:sessionId/execute', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { sessionId } = req.params;

    const result = await importValidationService.executeImport(
      sessionId,
      authReq.user.id,
      authReq.user.email,
      authReq.user.companyId
    );

    res.json({ result });
  } catch (error) {
    console.error('Error executing import:', error);
    res.status(500).json({ error: 'Failed to execute import' });
  }
});

/**
 * GET /api/master-plan-wizard/import/:sessionId
 * Get import session status
 */
router.get('/import/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = await importValidationService.getImportSession(sessionId);

    res.json({ session });
  } catch (error) {
    console.error('Error getting import session:', error);
    res.status(500).json({ error: 'Failed to get import session' });
  }
});

/**
 * GET /api/master-plan-wizard/import/:sessionId/error-report
 * Download error report CSV
 */
router.get('/import/:sessionId/error-report', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const errorReportPath = await importValidationService.getErrorReportPath(sessionId);

    if (!errorReportPath) {
      return res.status(404).json({ error: 'Error report not found' });
    }

    res.json({ downloadUrl: errorReportPath });
  } catch (error) {
    console.error('Error getting error report:', error);
    res.status(500).json({ error: 'Failed to get error report' });
  }
});

/**
 * GET /api/master-plan-wizard/import
 * Get all import sessions
 */
router.get('/import', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { limit = 20 } = req.query;

    const sessions = await importValidationService.getImportSessions(
      authReq.user.companyId,
      Number(limit)
    );

    res.json({ sessions });
  } catch (error) {
    console.error('Error getting import sessions:', error);
    res.status(500).json({ error: 'Failed to get import sessions' });
  }
});

// =============================================================================
// SHOP HISTORY ROUTES
// =============================================================================

/**
 * GET /api/master-plan-wizard/shops/:shopId/history
 * Get shop history
 */
router.get('/shops/:shopId/history', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.params;

    const history = await shopHistoryService.getShopHistory(shopId);

    res.json({ history });
  } catch (error) {
    console.error('Error getting shop history:', error);
    res.status(500).json({ error: 'Failed to get shop history' });
  }
});

/**
 * POST /api/master-plan-wizard/shops/:shopId/rename
 * Rename a shop with version tracking
 */
router.post('/shops/:shopId/rename', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { shopId } = req.params;
    const { newName, newCode, changeReason } = req.body;

    if (!newName || !changeReason) {
      return res.status(400).json({ error: 'newName and changeReason are required' });
    }

    const result = await shopHistoryService.renameShop({
      shopId,
      newName,
      newCode,
      changeReason,
      userId: authReq.user.id,
      userEmail: authReq.user.email,
      companyId: authReq.user.companyId,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ shop: result.shop });
  } catch (error) {
    console.error('Error renaming shop:', error);
    res.status(500).json({ error: 'Failed to rename shop' });
  }
});

/**
 * POST /api/master-plan-wizard/shops/:shopId/deactivate
 * Soft-delete a shop
 */
router.post('/shops/:shopId/deactivate', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { shopId } = req.params;
    const { changeReason, successorShopId } = req.body;

    if (!changeReason) {
      return res.status(400).json({ error: 'changeReason is required' });
    }

    const result = await shopHistoryService.deactivateShop({
      shopId,
      changeReason,
      successorShopId,
      userId: authReq.user.id,
      userEmail: authReq.user.email,
      companyId: authReq.user.companyId,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ shop: result.shop });
  } catch (error) {
    console.error('Error deactivating shop:', error);
    res.status(500).json({ error: 'Failed to deactivate shop' });
  }
});

/**
 * POST /api/master-plan-wizard/shops/merge
 * Merge two shops
 */
router.post('/shops/merge', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { sourceShopId, targetShopId, mergeReason } = req.body;

    if (!sourceShopId || !targetShopId || !mergeReason) {
      return res.status(400).json({
        error: 'sourceShopId, targetShopId, and mergeReason are required',
      });
    }

    const result = await shopHistoryService.mergeShops(
      sourceShopId,
      targetShopId,
      mergeReason,
      authReq.user.id,
      authReq.user.email,
      authReq.user.companyId
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error merging shops:', error);
    res.status(500).json({ error: 'Failed to merge shops' });
  }
});

/**
 * GET /api/master-plan-wizard/shops/:shopId/name-at-time
 * Get shop name at a specific point in time
 */
router.get('/shops/:shopId/name-at-time', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.params;
    const { timestamp } = req.query;

    if (!timestamp) {
      return res.status(400).json({ error: 'timestamp is required' });
    }

    const name = await shopHistoryService.getShopNameAtTime(
      shopId,
      new Date(timestamp as string)
    );

    res.json({ name });
  } catch (error) {
    console.error('Error getting shop name at time:', error);
    res.status(500).json({ error: 'Failed to get shop name' });
  }
});

/**
 * GET /api/master-plan-wizard/shops/:shopId/previous-names
 * Get all previous names for a shop
 */
router.get('/shops/:shopId/previous-names', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.params;

    const names = await shopHistoryService.getPreviousNames(shopId);

    res.json({ names });
  } catch (error) {
    console.error('Error getting previous names:', error);
    res.status(500).json({ error: 'Failed to get previous names' });
  }
});

// =============================================================================
// AUDIT LOG ROUTES
// =============================================================================

/**
 * GET /api/master-plan-wizard/audit
 * Get Master Plan audit logs (non-editable system log)
 */
router.get('/audit', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const {
      action,
      userId,
      entityType,
      startDate,
      endDate,
      page = 1,
      pageSize = 50,
    } = req.query;

    const result = await masterPlanWizardService.getMasterPlanAuditLogs(
      authReq.user.companyId,
      {
        action: action as string | undefined,
        userId: userId as string | undefined,
        entityType: entityType as string | undefined,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        page: Number(page),
        pageSize: Number(pageSize),
      }
    );

    res.json(result);
  } catch (error) {
    console.error('Error getting audit logs:', error);
    res.status(500).json({ error: 'Failed to get audit logs' });
  }
});

/**
 * GET /api/master-plan-wizard/audit/statistics
 * Get audit statistics for the dashboard
 */
router.get('/audit/statistics', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;

    const statistics = await masterPlanWizardService.getAuditStatistics(
      authReq.user.companyId
    );

    res.json(statistics);
  } catch (error) {
    console.error('Error getting audit statistics:', error);
    res.status(500).json({ error: 'Failed to get audit statistics' });
  }
});

export default router;
