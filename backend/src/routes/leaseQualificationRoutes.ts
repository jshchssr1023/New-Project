/**
 * leaseQualificationRoutes.ts - API Routes for Lease Qualification Engine
 *
 * Provides REST endpoints for:
 * - Lease release management
 * - Qualification queue operations
 * - Scenario running and comparison
 * - Document generation with data selection
 * - Plan approval workflow
 *
 * @author AITX Chronos Team
 * @version 1.0.0
 */

import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import {
  LeaseQualificationEngine,
  createLeaseQualificationEngine,
  ScenarioType,
} from '../services/leaseQualificationEngine';
import {
  QualificationDocumentGenerator,
  createQualificationDocumentGenerator,
  DocumentSelectionCriteria,
} from '../services/qualificationDocumentGenerator';
import { getParam } from '../utils/routeParams';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// =============================================================================
// HELPER: Get services with company context
// =============================================================================

function getEngine(req: AuthRequest): LeaseQualificationEngine {
  const prisma: any = req.app.locals.prisma;
  const companyId = req.user!.companyId;
  return createLeaseQualificationEngine(prisma, companyId);
}

function getDocGenerator(req: AuthRequest): QualificationDocumentGenerator {
  const prisma: any = req.app.locals.prisma;
  const companyId = req.user!.companyId;
  return createQualificationDocumentGenerator(prisma, companyId);
}

// =============================================================================
// LEASE RELEASES
// =============================================================================

/**
 * GET /api/lease-qualification/releases
 * Get upcoming lease releases within planning horizon
 */
router.get('/releases', async (req: AuthRequest, res: Response) => {
  try {
    const horizonMonths = parseInt(req.query.horizonMonths as string) || 6;
    const engine = getEngine(req);
    const releases = await engine.getUpcomingReleases(horizonMonths);

    res.json({
      success: true,
      data: releases,
      count: releases.length,
      horizonMonths,
    });
  } catch (error: any) {
    console.error('[LeaseQualification] Error fetching releases:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/lease-qualification/releases/queue
 * Create qualification queue entries from releases
 */
router.post('/releases/queue', async (req: AuthRequest, res: Response) => {
  try {
    const { releases } = req.body;

    if (!releases || !Array.isArray(releases)) {
      res.status(400).json({ success: false, message: 'releases array is required' });
      return;
    }

    const engine = getEngine(req);
    const entries = await engine.createQualificationEntries(releases);

    res.status(201).json({
      success: true,
      data: entries,
      count: entries.length,
    });
  } catch (error: any) {
    console.error('[LeaseQualification] Error creating queue entries:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================================================
// SHOP CAPACITY
// =============================================================================

/**
 * GET /api/lease-qualification/capacity
 * Get shop capacity snapshots for planning
 */
router.get('/capacity', async (req: AuthRequest, res: Response) => {
  try {
    const horizonMonths = parseInt(req.query.horizonMonths as string) || 6;
    const engine = getEngine(req);
    const capacities = await engine.getShopCapacities(horizonMonths);

    res.json({
      success: true,
      data: capacities,
      count: capacities.length,
      horizonMonths,
    });
  } catch (error: any) {
    console.error('[LeaseQualification] Error fetching capacity:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================================================
// SCENARIOS
// =============================================================================

/**
 * GET /api/lease-qualification/scenarios
 * List all qualification scenarios
 */
router.get('/scenarios', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: any = req.app.locals.prisma;
    const { companyId } = req.user!;

    const scenarios = await prisma.qualificationScenario.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: scenarios.map((s) => ({
        ...s,
        metricsJson: undefined, // Don't send full metrics in list
        summaryJson: s.summaryJson ? JSON.parse(s.summaryJson) : null,
      })),
      count: scenarios.length,
    });
  } catch (error: any) {
    console.error('[LeaseQualification] Error listing scenarios:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/lease-qualification/scenarios/:id
 * Get scenario details with full metrics
 */
router.get('/scenarios/:id', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: any = req.app.locals.prisma;
    const { companyId } = req.user!;
    const id = getParam(req.params.id);

    const scenario = await prisma.qualificationScenario.findFirst({
      where: { id, companyId },
      include: {
        planAssignments: {
          take: 100, // Limit for performance
          orderBy: [{ monthKey: 'asc' }, { priority: 'asc' }],
        },
      },
    });

    if (!scenario) {
      res.status(404).json({ success: false, message: 'Scenario not found' });
      return;
    }

    res.json({
      success: true,
      data: {
        ...scenario,
        metricsJson: scenario.metricsJson ? JSON.parse(scenario.metricsJson) : null,
        summaryJson: scenario.summaryJson ? JSON.parse(scenario.summaryJson) : null,
        capacityAdjustment: scenario.capacityAdjustment ? JSON.parse(scenario.capacityAdjustment) : {},
      },
    });
  } catch (error: any) {
    console.error('[LeaseQualification] Error fetching scenario:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/lease-qualification/scenarios/run
 * Run a new planning scenario
 */
router.post('/scenarios/run', async (req: AuthRequest, res: Response) => {
  try {
    const { name, type, lateReleasePercent, capacityAdjustments, planningHorizonMonths } = req.body;

    if (!name) {
      res.status(400).json({ success: false, message: 'name is required' });
      return;
    }

    const scenarioType = (type as ScenarioType) || ScenarioType.BASE;
    const engine = getEngine(req);

    const metrics = await engine.runScenario(name, scenarioType, {
      lateReleasePercent,
      capacityAdjustments,
      planningHorizonMonths,
    });

    res.status(201).json({
      success: true,
      data: metrics,
    });
  } catch (error: any) {
    console.error('[LeaseQualification] Error running scenario:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/lease-qualification/scenarios/compare
 * Compare multiple scenarios
 */
router.post('/scenarios/compare', async (req: AuthRequest, res: Response) => {
  try {
    const { scenarioIds } = req.body;

    if (!scenarioIds || !Array.isArray(scenarioIds) || scenarioIds.length < 2) {
      res.status(400).json({ success: false, message: 'At least 2 scenarioIds are required' });
      return;
    }

    const engine = getEngine(req);
    const comparison = await engine.compareScenarios(scenarioIds);

    res.json({
      success: true,
      data: comparison,
    });
  } catch (error: any) {
    console.error('[LeaseQualification] Error comparing scenarios:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/lease-qualification/scenarios/:id/approve
 * Approve a scenario (converts to operational plan)
 */
router.post('/scenarios/:id/approve', async (req: AuthRequest, res: Response) => {
  try {
    const id = getParam(req.params.id);
    const { id: userId, email } = req.user!;

    const engine = getEngine(req);
    await engine.approveScenario(id, userId);

    res.json({
      success: true,
      message: 'Scenario approved and converted to operational plan',
      approvedBy: email,
      approvedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[LeaseQualification] Error approving scenario:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/lease-qualification/scenarios/approved
 * Get the current approved scenario
 */
router.get('/scenarios/approved', async (req: AuthRequest, res: Response) => {
  try {
    const engine = getEngine(req);
    const scenario = await engine.getApprovedScenario();

    if (!scenario) {
      res.status(404).json({ success: false, message: 'No approved scenario found' });
      return;
    }

    res.json({
      success: true,
      data: {
        ...scenario,
        metricsJson: scenario.metricsJson ? JSON.parse(scenario.metricsJson) : null,
        summaryJson: scenario.summaryJson ? JSON.parse(scenario.summaryJson) : null,
      },
    });
  } catch (error: any) {
    console.error('[LeaseQualification] Error fetching approved scenario:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================================================
// DATA SELECTION (for document generation)
// =============================================================================

/**
 * GET /api/lease-qualification/scenarios/:id/available-cars
 * Get available cars for selection in a scenario
 */
router.get('/scenarios/:id/available-cars', async (req: AuthRequest, res: Response) => {
  try {
    const id = getParam(req.params.id);
    const docGen = getDocGenerator(req);
    const cars = await docGen.getAvailableCars(id);

    res.json({
      success: true,
      data: cars,
      count: cars.length,
    });
  } catch (error: any) {
    console.error('[LeaseQualification] Error fetching available cars:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/lease-qualification/scenarios/:id/available-shops
 * Get available shops for selection in a scenario
 */
router.get('/scenarios/:id/available-shops', async (req: AuthRequest, res: Response) => {
  try {
    const id = getParam(req.params.id);
    const docGen = getDocGenerator(req);
    const shops = await docGen.getAvailableShops(id);

    res.json({
      success: true,
      data: shops,
      count: shops.length,
    });
  } catch (error: any) {
    console.error('[LeaseQualification] Error fetching available shops:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/lease-qualification/scenarios/:id/available-customers
 * Get available customers for selection in a scenario
 */
router.get('/scenarios/:id/available-customers', async (req: AuthRequest, res: Response) => {
  try {
    const id = getParam(req.params.id);
    const docGen = getDocGenerator(req);
    const customers = await docGen.getAvailableCustomers(id);

    res.json({
      success: true,
      data: customers,
      count: customers.length,
    });
  } catch (error: any) {
    console.error('[LeaseQualification] Error fetching available customers:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/lease-qualification/scenarios/:id/available-months
 * Get available months for selection in a scenario
 */
router.get('/scenarios/:id/available-months', async (req: AuthRequest, res: Response) => {
  try {
    const id = getParam(req.params.id);
    const docGen = getDocGenerator(req);
    const months = await docGen.getAvailableMonths(id);

    res.json({
      success: true,
      data: months,
      count: months.length,
    });
  } catch (error: any) {
    console.error('[LeaseQualification] Error fetching available months:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/lease-qualification/scenarios/:id/selected-assignments
 * Get assignments based on selection criteria
 */
router.post('/scenarios/:id/selected-assignments', async (req: AuthRequest, res: Response) => {
  try {
    const id = getParam(req.params.id);
    const criteria: DocumentSelectionCriteria = {
      ...req.body,
      scenarioId: id,
    };

    const docGen = getDocGenerator(req);
    const assignments = await docGen.getSelectedAssignments(criteria);

    res.json({
      success: true,
      data: assignments,
      count: assignments.length,
      criteria,
    });
  } catch (error: any) {
    console.error('[LeaseQualification] Error fetching selected assignments:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================================================
// DOCUMENT GENERATION
// =============================================================================

/**
 * POST /api/lease-qualification/documents/team-plan
 * Generate team plan with selected data
 */
router.post('/documents/team-plan', async (req: AuthRequest, res: Response) => {
  try {
    const criteria: DocumentSelectionCriteria = req.body;

    if (!criteria.scenarioId) {
      res.status(400).json({ success: false, message: 'scenarioId is required' });
      return;
    }

    const docGen = getDocGenerator(req);
    const teamPlan = await docGen.generateTeamPlan(criteria);

    // Optionally save document
    const { save } = req.query;
    let documentId: string | undefined;
    if (save === 'true') {
      documentId = await docGen.saveDocument(teamPlan, 'team_plan');
    }

    res.json({
      success: true,
      data: teamPlan,
      documentId,
    });
  } catch (error: any) {
    console.error('[LeaseQualification] Error generating team plan:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/lease-qualification/documents/customer-schedule
 * Generate customer schedule with selected data
 */
router.post('/documents/customer-schedule', async (req: AuthRequest, res: Response) => {
  try {
    const { customerId, ...criteriaRest } = req.body;
    const criteria: DocumentSelectionCriteria = criteriaRest;

    if (!criteria.scenarioId) {
      res.status(400).json({ success: false, message: 'scenarioId is required' });
      return;
    }

    if (!customerId) {
      res.status(400).json({ success: false, message: 'customerId is required' });
      return;
    }

    const docGen = getDocGenerator(req);
    const schedule = await docGen.generateCustomerSchedule(criteria, customerId);

    // Optionally save document
    const { save } = req.query;
    let documentId: string | undefined;
    if (save === 'true') {
      documentId = await docGen.saveDocument(schedule, 'customer_schedule');
    }

    res.json({
      success: true,
      data: schedule,
      documentId,
    });
  } catch (error: any) {
    console.error('[LeaseQualification] Error generating customer schedule:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/lease-qualification/documents/shop-plan
 * Generate shop-specific plan with selected data
 */
router.post('/documents/shop-plan', async (req: AuthRequest, res: Response) => {
  try {
    const { shopId, ...criteriaRest } = req.body;
    const criteria: DocumentSelectionCriteria = criteriaRest;

    if (!criteria.scenarioId) {
      res.status(400).json({ success: false, message: 'scenarioId is required' });
      return;
    }

    if (!shopId) {
      res.status(400).json({ success: false, message: 'shopId is required' });
      return;
    }

    const docGen = getDocGenerator(req);
    const plan = await docGen.generateShopPlan(criteria, shopId);

    // Optionally save document
    const { save } = req.query;
    let documentId: string | undefined;
    if (save === 'true') {
      documentId = await docGen.saveDocument(plan, 'shop_plan');
    }

    res.json({
      success: true,
      data: plan,
      documentId,
    });
  } catch (error: any) {
    console.error('[LeaseQualification] Error generating shop plan:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/lease-qualification/documents
 * List all generated documents for a scenario
 */
router.get('/documents', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: any = req.app.locals.prisma;
    const { companyId } = req.user!;
    const { scenarioId, documentType } = req.query;

    const where: any = { companyId };
    if (scenarioId) where.scenarioId = scenarioId;
    if (documentType) where.documentType = documentType;

    const documents = await prisma.qualificationPlanDocument.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        scenarioId: true,
        documentType: true,
        title: true,
        description: true,
        pdfGenerated: true,
        pdfUrl: true,
        targetCustomerId: true,
        targetShopId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({
      success: true,
      data: documents,
      count: documents.length,
    });
  } catch (error: any) {
    console.error('[LeaseQualification] Error listing documents:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/lease-qualification/documents/:id
 * Get document details including markdown content
 */
router.get('/documents/:id', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: any = req.app.locals.prisma;
    const { companyId } = req.user!;
    const id = getParam(req.params.id);

    const document = await prisma.qualificationPlanDocument.findFirst({
      where: { id, companyId },
    });

    if (!document) {
      res.status(404).json({ success: false, message: 'Document not found' });
      return;
    }

    res.json({
      success: true,
      data: {
        ...document,
        contentJson: document.contentJson ? JSON.parse(document.contentJson) : null,
      },
    });
  } catch (error: any) {
    console.error('[LeaseQualification] Error fetching document:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/lease-qualification/documents/:id/markdown
 * Get just the markdown content for rendering
 */
router.get('/documents/:id/markdown', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: any = req.app.locals.prisma;
    const { companyId } = req.user!;
    const id = getParam(req.params.id);

    const document = await prisma.qualificationPlanDocument.findFirst({
      where: { id, companyId },
      select: { contentMarkdown: true, title: true },
    });

    if (!document) {
      res.status(404).json({ success: false, message: 'Document not found' });
      return;
    }

    // Return as text/markdown
    res.setHeader('Content-Type', 'text/markdown');
    res.send(document.contentMarkdown);
  } catch (error: any) {
    console.error('[LeaseQualification] Error fetching document markdown:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================================================
// LEASE CONTRACTS (CRUD)
// =============================================================================

/**
 * GET /api/lease-qualification/contracts
 * List lease contracts
 */
router.get('/contracts', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: any = req.app.locals.prisma;
    const { companyId } = req.user!;
    const { status, customerId, limit } = req.query;

    const where: any = { companyId };
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;

    const contracts = await prisma.leaseContract.findMany({
      where,
      include: {
        car: { select: { id: true, railcarNumber: true, carType: true, isTankCar: true } },
        customer: { select: { id: true, name: true, code: true } },
      },
      orderBy: { endDate: 'asc' },
      take: parseInt(limit as string) || 100,
    });

    res.json({
      success: true,
      data: contracts,
      count: contracts.length,
    });
  } catch (error: any) {
    console.error('[LeaseQualification] Error listing contracts:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/lease-qualification/contracts
 * Create a new lease contract
 */
router.post('/contracts', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: any = req.app.locals.prisma;
    const { companyId } = req.user!;
    const {
      carId,
      customerId,
      contractNumber,
      startDate,
      endDate,
      commodity,
      releaseReason,
      nextCustomerId,
      notes,
    } = req.body;

    if (!carId || !customerId || !contractNumber || !startDate || !endDate) {
      res.status(400).json({
        success: false,
        message: 'carId, customerId, contractNumber, startDate, and endDate are required',
      });
      return;
    }

    const contract = await prisma.leaseContract.create({
      data: {
        carId,
        customerId,
        contractNumber,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        commodity: commodity || '',
        releaseReason: releaseReason || '',
        nextCustomerId,
        notes: notes || '',
        companyId,
      },
      include: {
        car: { select: { id: true, railcarNumber: true } },
        customer: { select: { id: true, name: true, code: true } },
      },
    });

    res.status(201).json({
      success: true,
      data: contract,
    });
  } catch (error: any) {
    console.error('[LeaseQualification] Error creating contract:', error);

    if (error.code === 'P2002') {
      res.status(409).json({ success: false, message: 'Contract number already exists' });
      return;
    }

    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /api/lease-qualification/contracts/:id
 * Update a lease contract
 */
router.put('/contracts/:id', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: any = req.app.locals.prisma;
    const { companyId } = req.user!;
    const id = getParam(req.params.id);
    const updates = req.body;

    // Verify contract belongs to company
    const existing = await prisma.leaseContract.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      res.status(404).json({ success: false, message: 'Contract not found' });
      return;
    }

    // Process date fields
    if (updates.startDate) updates.startDate = new Date(updates.startDate);
    if (updates.endDate) updates.endDate = new Date(updates.endDate);
    if (updates.releaseDate) updates.releaseDate = new Date(updates.releaseDate);

    const contract = await prisma.leaseContract.update({
      where: { id },
      data: updates,
      include: {
        car: { select: { id: true, railcarNumber: true } },
        customer: { select: { id: true, name: true, code: true } },
      },
    });

    res.json({
      success: true,
      data: contract,
    });
  } catch (error: any) {
    console.error('[LeaseQualification] Error updating contract:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/lease-qualification/contracts/:id/confirm-release
 * Confirm customer has released the car
 */
router.post('/contracts/:id/confirm-release', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: any = req.app.locals.prisma;
    const { companyId } = req.user!;
    const id = getParam(req.params.id);
    const { releaseDate, delayDays } = req.body;

    const contract = await prisma.leaseContract.update({
      where: { id },
      data: {
        isReleaseConfirmed: true,
        releaseDate: releaseDate ? new Date(releaseDate) : new Date(),
        releaseDelayDays: delayDays || 0,
        status: 'released',
      },
    });

    res.json({
      success: true,
      data: contract,
      message: 'Release confirmed',
    });
  } catch (error: any) {
    console.error('[LeaseQualification] Error confirming release:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================================================
// QUALIFICATION QUEUE
// =============================================================================

/**
 * GET /api/lease-qualification/queue
 * Get qualification queue entries
 */
router.get('/queue', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: any = req.app.locals.prisma;
    const { companyId } = req.user!;
    const { status, targetMonth, shopId, customerId, limit } = req.query;

    const where: any = { companyId };
    if (status) where.queueStatus = status;
    if (targetMonth) where.targetQualMonth = targetMonth;
    if (shopId) where.assignedShopId = shopId;
    if (customerId) where.customerId = customerId;

    const entries = await prisma.leaseQualificationEntry.findMany({
      where,
      include: {
        car: { select: { id: true, railcarNumber: true, carType: true, isTankCar: true } },
        customer: { select: { id: true, name: true, code: true } },
        assignedShop: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ priority: 'asc' }, { targetQualMonth: 'asc' }],
      take: parseInt(limit as string) || 100,
    });

    res.json({
      success: true,
      data: entries.map((e) => ({
        ...e,
        workTypes: JSON.parse(e.workTypes || '[]'),
      })),
      count: entries.length,
    });
  } catch (error: any) {
    console.error('[LeaseQualification] Error listing queue:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /api/lease-qualification/queue/:id
 * Update a queue entry (reschedule, change shop, etc.)
 */
router.put('/queue/:id', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: any = req.app.locals.prisma;
    const { companyId } = req.user!;
    const id = getParam(req.params.id);
    const updates = req.body;

    // Verify entry belongs to company
    const existing = await prisma.leaseQualificationEntry.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      res.status(404).json({ success: false, message: 'Queue entry not found' });
      return;
    }

    // Handle rescheduling
    if (updates.targetQualMonth && updates.targetQualMonth !== existing.targetQualMonth) {
      updates.wasRescheduled = true;
      updates.rescheduleCount = (existing.rescheduleCount || 0) + 1;
    }

    // Handle work types (convert array to JSON string)
    if (updates.workTypes && Array.isArray(updates.workTypes)) {
      updates.workTypes = JSON.stringify(updates.workTypes);
      updates.isBundled = updates.workTypes.length > 1;
    }

    const entry = await prisma.leaseQualificationEntry.update({
      where: { id },
      data: updates,
      include: {
        car: { select: { id: true, railcarNumber: true, carType: true } },
        customer: { select: { id: true, name: true, code: true } },
        assignedShop: { select: { id: true, name: true, code: true } },
      },
    });

    res.json({
      success: true,
      data: {
        ...entry,
        workTypes: JSON.parse(entry.workTypes || '[]'),
      },
    });
  } catch (error: any) {
    console.error('[LeaseQualification] Error updating queue entry:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================================================
// INTEGRATION: Bridge to SOPAssignment / Main Planning Flow
// =============================================================================

/**
 * POST /api/lease-qualification/entries/create-sop-assignments
 * Convert scheduled qualification entries to SOPAssignments
 * This bridges the Lease Qualification Engine into the main planning flow
 */
router.post('/entries/create-sop-assignments', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: any = req.app.locals.prisma;
    const { companyId, id: userId } = req.user!;
    const { entryIds, scenarioId, createScenario } = req.body;

    if (!entryIds || !Array.isArray(entryIds) || entryIds.length === 0) {
      res.status(400).json({ success: false, message: 'entryIds array is required' });
      return;
    }

    // Get the qualification entries with shop assignments
    const entries = await prisma.leaseQualificationEntry.findMany({
      where: {
        id: { in: entryIds },
        companyId,
        assignedShopId: { not: null }, // Must have a shop assigned
      },
      include: {
        car: true,
        customer: true,
        assignedShop: true,
      },
    });

    if (entries.length === 0) {
      res.status(400).json({
        success: false,
        message: 'No entries found with shop assignments. Assign shops before creating SOP assignments.',
      });
      return;
    }

    // Create or use existing scenario
    let targetScenarioId = scenarioId;

    if (!targetScenarioId && createScenario) {
      // Auto-create a scenario for these lease releases
      const now = new Date();
      const scenario = await prisma.scenario.create({
        data: {
          projectNumber: `LQ-${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`,
          name: `Lease Releases - ${now.toISOString().slice(0, 10)}`,
          description: 'Auto-generated from Lease Qualification Engine',
          status: 'draft',
          companyId,
          createdBy: userId,
        },
      });
      targetScenarioId = scenario.id;
    }

    if (!targetScenarioId) {
      res.status(400).json({
        success: false,
        message: 'Either scenarioId or createScenario: true is required',
      });
      return;
    }

    // Create SOPAssignment records from qualification entries
    const sopAssignmentData = entries.map((entry: any) => {
      // Parse workTypes from entry
      let reasonsArray: string[] = [];
      try {
        reasonsArray = JSON.parse(entry.workTypes || '[]');
      } catch {
        reasonsArray = ['qualification']; // Default for lease releases
      }

      return {
        scenarioId: targetScenarioId,
        carId: entry.carId,
        shopId: entry.assignedShopId,
        reasonsShopped: JSON.stringify(reasonsArray),
        status: 'PLANNED',
        monthKey: entry.targetQualMonth,
        estimatedCost: 15000, // Default estimate
        estimatedDays: 14,
        priority: entry.priority || 3,
        notes: `From Lease Release: ${entry.customer?.name || ''} - ${entry.bundleReason || ''}`,
      };
    });

    // Create the SOPAssignments
    await prisma.sOPAssignment.createMany({
      data: sopAssignmentData,
      skipDuplicates: true, // Skip if car already in scenario
    });

    // Update entry status to indicate it's been scheduled
    await prisma.leaseQualificationEntry.updateMany({
      where: { id: { in: entryIds } },
      data: { queueStatus: 'scheduled' },
    });

    // Mark scenario as completed (has SOPAssignments, ready for approval)
    await prisma.scenario.update({
      where: { id: targetScenarioId },
      data: { status: 'completed' },
    });

    res.status(201).json({
      success: true,
      message: `Created ${sopAssignmentData.length} SOP assignments`,
      scenarioId: targetScenarioId,
      sopAssignmentCount: sopAssignmentData.length,
      entriesProcessed: entries.length,
    });
  } catch (error: any) {
    console.error('[LeaseQualification] Error creating SOP assignments:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
