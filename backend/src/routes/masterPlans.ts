/**
 * MasterPlan API Routes
 *
 * Provides endpoints for the MasterPlan workflow:
 * - Create MasterPlan from approved Scenario
 * - Get active MasterPlan for dashboard/reporting
 * - Approve and activate MasterPlans
 * - Generate Customer PDF schedules
 * - Generate Shop Work Orders
 * - Update commitment status
 *
 * @author AITX Chronos Team
 */

import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { MasterPlanService, createMasterPlanService } from '../services/masterPlanService';
import { pdfService } from '../services/pdfService';
import { emailService } from '../services/emailService';

const router = Router();

router.use(authenticate);

// =============================================================================
// MASTER PLAN CRUD
// =============================================================================

/**
 * GET /api/masterplans
 * List all MasterPlans for the company
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const service = createMasterPlanService(prisma);
  const { fiscalYear, status, limit, offset } = req.query;

  try {
    const plans = await service.listMasterPlans(req.user!.companyId, {
      fiscalYear: fiscalYear ? parseInt(fiscalYear as string) : undefined,
      status: status as any,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json(plans);
  } catch (error) {
    console.error('Get master plans error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /api/masterplans/active
 * Get the currently active MasterPlan for the company
 */
router.get('/active', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const service = createMasterPlanService(prisma);

  try {
    const plan = await service.getActiveMasterPlan(req.user!.companyId);

    if (!plan) {
      res.status(404).json({ message: 'No active master plan found' });
      return;
    }

    res.json(plan);
  } catch (error) {
    console.error('Get active master plan error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /api/masterplans/:id
 * Get a specific MasterPlan by ID
 */
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const service = createMasterPlanService(prisma);

  try {
    const plan = await service.getMasterPlanById(req.params.id);

    if (!plan) {
      res.status(404).json({ message: 'Master plan not found' });
      return;
    }

    res.json(plan);
  } catch (error) {
    console.error('Get master plan error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /api/masterplans/:id/summary
 * Get summary statistics for a MasterPlan
 */
router.get('/:id/summary', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const service = createMasterPlanService(prisma);

  try {
    const summary = await service.getMasterPlanSummary(req.params.id);
    res.json(summary);
  } catch (error) {
    console.error('Get master plan summary error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * POST /api/masterplans/:id/approve
 * Approve a MasterPlan (and optionally activate it)
 */
router.post('/:id/approve', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const service = createMasterPlanService(prisma);
  const { activate } = req.body;

  try {
    const plan = await service.approveMasterPlan(
      req.params.id,
      req.user!.id,
      activate === true
    );

    // Broadcast update via WebSocket
    const io = req.app.locals.io;
    if (io) {
      io.emit('masterPlanUpdated', {
        masterPlanId: plan.id,
        status: plan.status,
        approvedBy: req.user!.id,
      });
    }

    res.json(plan);
  } catch (error: any) {
    console.error('Approve master plan error:', error);
    res.status(400).json({ message: error.message || 'Failed to approve master plan' });
  }
});

// =============================================================================
// COMMITMENT MANAGEMENT
// =============================================================================

/**
 * GET /api/masterplans/:id/commitments
 * Get all commitments for a MasterPlan
 */
router.get('/:id/commitments', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const service = createMasterPlanService(prisma);

  try {
    const commitments = await service.getMasterPlanCommitments(req.params.id);
    res.json(commitments);
  } catch (error) {
    console.error('Get commitments error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * PATCH /api/masterplans/commitments/:commitmentId/status
 * Update commitment status (for tracking fulfillment)
 */
router.patch('/commitments/:commitmentId/status', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const service = createMasterPlanService(prisma);
  const { status } = req.body;

  try {
    const commitment = await service.updateCommitmentStatus(req.params.commitmentId, status);

    // Broadcast update via WebSocket
    const io = req.app.locals.io;
    if (io) {
      io.emit('commitmentStatusUpdated', {
        commitmentId: commitment.id,
        status: commitment.status,
        updatedAt: commitment.updatedAt,
      });
    }

    res.json(commitment);
  } catch (error: any) {
    console.error('Update commitment status error:', error);
    res.status(400).json({ message: error.message || 'Failed to update commitment status' });
  }
});

// =============================================================================
// SHOP WORK ORDERS
// =============================================================================

/**
 * GET /api/masterplans/work-orders/:shopId/:month
 * Get work orders for a specific shop and month
 */
router.get('/work-orders/:shopId/:month', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const service = createMasterPlanService(prisma);
  const { shopId, month } = req.params;

  try {
    const workOrders = await service.getShopWorkOrders(shopId, month);
    res.json(workOrders);
  } catch (error) {
    console.error('Get shop work orders error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /api/masterplans/work-orders/:shopId/:month/pdf
 * Generate and download PDF work orders for a shop
 */
router.get('/work-orders/:shopId/:month/pdf', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const service = createMasterPlanService(prisma);
  const { shopId, month } = req.params;

  try {
    const workOrders = await service.getShopWorkOrders(shopId, month);

    if (workOrders.length === 0) {
      res.status(404).json({ message: 'No work orders found for this shop and month' });
      return;
    }

    const shop = workOrders[0].shop;

    // Generate PDF
    const tableColumns = [
      { header: 'Priority', key: 'priority', width: 0.5 },
      { header: 'Railcar #', key: 'railcarNumber', width: 1 },
      { header: 'Customer', key: 'customer', width: 1.5 },
      { header: 'Car Type', key: 'carType', width: 1 },
      { header: 'Work Types', key: 'workTypes', width: 1.5 },
      { header: 'Est. Arrival', key: 'plannedArrival', width: 1 },
      { header: 'Est. Cost', key: 'estimatedCost', width: 0.8 },
      { header: 'Status', key: 'status', width: 0.8 },
    ];

    const tableData = workOrders.map((wo: any) => {
      let workTypesStr = '';
      try {
        const wt = JSON.parse(wo.reasonsShopped || '[]');
        workTypesStr = Array.isArray(wt) ? wt.join(', ') : (wo.reasonsShopped || '');
      } catch {
        workTypesStr = wo.reasonsShopped || '';
      }

      return {
        priority: `P${wo.priority || 3}`,
        railcarNumber: wo.car?.railcarNumber || '',
        customer: wo.customer?.name || '',
        carType: wo.car?.carType || '',
        workTypes: workTypesStr,
        plannedArrival: wo.plannedArrival
          ? new Date(wo.plannedArrival).toLocaleDateString()
          : 'TBD',
        estimatedCost: wo.estimatedCost ? `$${wo.estimatedCost.toLocaleString()}` : '-',
        status: wo.status || 'committed',
      };
    });

    const pdfBuffer = await pdfService.generateTableReport(
      { columns: tableColumns, data: tableData },
      {
        title: `Work Orders - ${shop.name}`,
        subtitle: `${new Date(month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' })} | ${workOrders.length} Railcars`,
        createdAt: new Date(),
      }
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="work-orders-${shop.code}-${month}.pdf"`
    );
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Generate work order PDF error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * POST /api/masterplans/work-orders/:shopId/:month/send
 * Send work orders to shop via email
 */
router.post('/work-orders/:shopId/:month/send', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const service = createMasterPlanService(prisma);
  const { shopId, month } = req.params;
  const { recipientEmails } = req.body;

  try {
    const workOrders = await service.getShopWorkOrders(shopId, month);

    if (workOrders.length === 0) {
      res.status(404).json({ message: 'No work orders found' });
      return;
    }

    const shop = workOrders[0].shop;

    // Generate PDF
    const tableColumns = [
      { header: 'Priority', key: 'priority', width: 0.5 },
      { header: 'Railcar #', key: 'railcarNumber', width: 1 },
      { header: 'Customer', key: 'customer', width: 1.5 },
      { header: 'Car Type', key: 'carType', width: 1 },
      { header: 'Work Types', key: 'workTypes', width: 1.5 },
      { header: 'Est. Arrival', key: 'plannedArrival', width: 1 },
      { header: 'Status', key: 'status', width: 0.8 },
    ];

    const tableData = workOrders.map((wo: any) => {
      let workTypesStr = '';
      try {
        const wt = JSON.parse(wo.reasonsShopped || '[]');
        workTypesStr = Array.isArray(wt) ? wt.join(', ') : (wo.reasonsShopped || '');
      } catch {
        workTypesStr = wo.reasonsShopped || '';
      }

      return {
        priority: `P${wo.priority || 3}`,
        railcarNumber: wo.car?.railcarNumber || '',
        customer: wo.customer?.name || '',
        carType: wo.car?.carType || '',
        workTypes: workTypesStr,
        plannedArrival: wo.plannedArrival
          ? new Date(wo.plannedArrival).toLocaleDateString()
          : 'TBD',
        status: wo.status,
      };
    });

    const pdfBuffer = await pdfService.generateTableReport(
      { columns: tableColumns, data: tableData },
      {
        title: `Work Orders - ${shop.name}`,
        subtitle: `${new Date(month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' })} | ${workOrders.length} Railcars`,
        createdAt: new Date(),
      }
    );

    // Send email
    const emails = recipientEmails || [];
    if (emails.length === 0) {
      res.status(400).json({ message: 'No recipient emails provided' });
      return;
    }

    const monthLabel = new Date(month + '-01').toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
    });

    const result = await emailService.sendEmail({
      to: emails,
      subject: `[Chronos] Work Orders for ${shop.name} - ${monthLabel}`,
      html: `
        <h2>Work Orders for ${shop.name}</h2>
        <p>Attached are the work orders for <strong>${monthLabel}</strong>.</p>
        <p>Total railcars: <strong>${workOrders.length}</strong></p>
        <p>Please review and confirm receipt.</p>
      `,
      attachments: [
        {
          filename: `work-orders-${shop.code}-${month}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    if (result.success) {
      res.json({
        success: true,
        message: `Work orders sent to ${emails.length} recipient(s)`,
        messageId: result.messageId,
      });
    } else {
      res.status(500).json({ message: result.error || 'Failed to send email' });
    }
  } catch (error) {
    console.error('Send work orders error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// =============================================================================
// CUSTOMER SCHEDULES
// =============================================================================

/**
 * GET /api/masterplans/customer-schedule/:customerId
 * Get schedule commitments for a specific customer
 */
router.get('/customer-schedule/:customerId', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const service = createMasterPlanService(prisma);
  const { customerId } = req.params;
  const { masterPlanId } = req.query;

  try {
    const schedule = await service.getCustomerSchedule(
      customerId,
      masterPlanId as string | undefined
    );
    res.json(schedule);
  } catch (error: any) {
    console.error('Get customer schedule error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/masterplans/customer-schedule/:customerId/pdf
 * Generate and download customer schedule PDF
 */
router.get('/customer-schedule/:customerId/pdf', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const service = createMasterPlanService(prisma);
  const { customerId } = req.params;
  const { masterPlanId } = req.query;

  try {
    const schedule = await service.getCustomerSchedule(
      customerId,
      masterPlanId as string | undefined
    );

    if (schedule.length === 0) {
      res.status(404).json({ message: 'No schedule found for this customer' });
      return;
    }

    const customer = schedule[0].customer;

    // Generate PDF
    const tableColumns = [
      { header: 'Month', key: 'month', width: 1 },
      { header: 'Railcar #', key: 'railcarNumber', width: 1 },
      { header: 'Car Type', key: 'carType', width: 1 },
      { header: 'Shop', key: 'shop', width: 1.5 },
      { header: 'Work Types', key: 'workTypes', width: 1.5 },
      { header: 'Est. Arrival', key: 'plannedArrival', width: 1 },
      { header: 'Est. Release', key: 'plannedRelease', width: 1 },
      { header: 'Status', key: 'status', width: 0.8 },
    ];

    const tableData = schedule.map((commitment: any) => {
      let workTypesStr = '';
      try {
        const wt = JSON.parse(commitment.reasonsShopped || '[]');
        workTypesStr = Array.isArray(wt) ? wt.join(', ') : (commitment.reasonsShopped || '');
      } catch {
        workTypesStr = commitment.reasonsShopped || '';
      }

      return {
        month: commitment.scheduledMonth || '',
        railcarNumber: commitment.car?.railcarNumber || '',
        carType: commitment.car?.carType || '',
        shop: `${commitment.shop?.name || ''} (${commitment.shop?.code || ''})`,
        workTypes: workTypesStr,
        plannedArrival: commitment.plannedArrival
          ? new Date(commitment.plannedArrival).toLocaleDateString()
          : 'TBD',
        plannedRelease: commitment.plannedRelease
          ? new Date(commitment.plannedRelease).toLocaleDateString()
          : 'TBD',
        status: commitment.status || 'committed',
      };
    });

    const pdfBuffer = await pdfService.generateTableReport(
      { columns: tableColumns, data: tableData },
      {
        title: `Qualification Schedule - ${customer.name}`,
        subtitle: `${schedule.length} Railcars Scheduled`,
        createdAt: new Date(),
      }
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="schedule-${customer.code}-${new Date().toISOString().split('T')[0]}.pdf"`
    );
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Generate customer schedule PDF error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * POST /api/masterplans/customer-schedule/:customerId/send
 * Send customer schedule via email
 */
router.post('/customer-schedule/:customerId/send', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const service = createMasterPlanService(prisma);
  const { customerId } = req.params;
  const { recipientEmails, masterPlanId } = req.body;

  try {
    const schedule = await service.getCustomerSchedule(customerId, masterPlanId);

    if (schedule.length === 0) {
      res.status(404).json({ message: 'No schedule found for this customer' });
      return;
    }

    const customer = schedule[0].customer;

    // Generate PDF
    const tableColumns = [
      { header: 'Month', key: 'month', width: 1 },
      { header: 'Railcar #', key: 'railcarNumber', width: 1 },
      { header: 'Car Type', key: 'carType', width: 1 },
      { header: 'Shop', key: 'shop', width: 1.5 },
      { header: 'Work Types', key: 'workTypes', width: 1.5 },
      { header: 'Est. Arrival', key: 'plannedArrival', width: 1 },
      { header: 'Status', key: 'status', width: 0.8 },
    ];

    const tableData = schedule.map((commitment: any) => {
      let workTypesStr = '';
      try {
        const wt = JSON.parse(commitment.reasonsShopped || '[]');
        workTypesStr = Array.isArray(wt) ? wt.join(', ') : (commitment.reasonsShopped || '');
      } catch {
        workTypesStr = commitment.reasonsShopped || '';
      }

      return {
        month: commitment.scheduledMonth || '',
        railcarNumber: commitment.car?.railcarNumber || '',
        carType: commitment.car?.carType || '',
        shop: `${commitment.shop?.name || ''} (${commitment.shop?.code || ''})`,
        workTypes: workTypesStr,
        plannedArrival: commitment.plannedArrival
          ? new Date(commitment.plannedArrival).toLocaleDateString()
          : 'TBD',
        status: commitment.status || 'committed',
      };
    });

    const pdfBuffer = await pdfService.generateTableReport(
      { columns: tableColumns, data: tableData },
      {
        title: `Qualification Schedule - ${customer.name}`,
        subtitle: `${schedule.length} Railcars Scheduled`,
        createdAt: new Date(),
      }
    );

    // Send email
    const emails = recipientEmails || [];
    if (emails.length === 0) {
      res.status(400).json({ message: 'No recipient emails provided' });
      return;
    }

    const result = await emailService.sendEmail({
      to: emails,
      subject: `[Chronos] Qualification Schedule for ${customer.name}`,
      html: `
        <h2>Qualification Schedule for ${customer.name}</h2>
        <p>Attached is your current qualification schedule.</p>
        <p>Total railcars scheduled: <strong>${schedule.length}</strong></p>
        <p>Please contact your account manager if you have any questions.</p>
      `,
      attachments: [
        {
          filename: `schedule-${customer.code}-${new Date().toISOString().split('T')[0]}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    if (result.success) {
      res.json({
        success: true,
        message: `Schedule sent to ${emails.length} recipient(s)`,
        messageId: result.messageId,
      });
    } else {
      res.status(500).json({ message: result.error || 'Failed to send email' });
    }
  } catch (error) {
    console.error('Send customer schedule error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
