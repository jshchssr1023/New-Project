import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import websocketService from '../services/websocketService';

const router = Router();

router.use(authenticate);

// Get all plans
router.get('/', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const { status } = req.query;

  try {
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
  } catch (error) {
    console.error('Get plans error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get plan by ID
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

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
    console.error('Get plan error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get plan grid data
router.get('/:id/grid', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

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
    const startDate = new Date(plan.startDate);
    const endDate = new Date(plan.endDate);
    const months: string[] = [];
    const current = new Date(startDate);
    while (current <= endDate) {
      months.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`);
      current.setMonth(current.getMonth() + 1);
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
    console.error('Get plan grid error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create plan
router.post('/', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const { name, description, startDate, endDate } = req.body;

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
    console.error('Create plan error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update plan
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const { name, description, startDate, endDate, status } = req.body;

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
    console.error('Update plan error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete plan
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

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
    console.error('Delete plan error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Add assignment to plan
router.post('/:id/assignments', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const { carId, shopId, scheduledMonth, estimatedCost, estimatedDuration } = req.body;

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

    const assignment = await prisma.planAssignment.create({
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

    res.status(201).json(assignment);
  } catch (error) {
    console.error('Create assignment error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update assignment
router.put('/:id/assignments/:assignmentId', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const { shopId, scheduledMonth, estimatedCost, estimatedDuration, status } = req.body;

  try {
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
    console.error('Update assignment error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Remove assignment
router.delete('/:id/assignments/:assignmentId', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

  try {
    await prisma.planAssignment.delete({
      where: { id: req.params.assignmentId },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Delete assignment error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Activate plan
router.post('/:id/activate', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

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
    console.error('Activate plan error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Archive plan
router.post('/:id/archive', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

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
    console.error('Archive plan error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Bulk add assignments to plan
router.post('/:id/assignments/bulk', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const { assignments } = req.body;

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

    const results = {
      success: 0,
      failed: 0,
      errors: [] as { carId: string; error: string }[],
    };

    for (const assignment of assignments) {
      try {
        await prisma.planAssignment.create({
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
      } catch (error: any) {
        results.failed++;
        results.errors.push({
          carId: assignment.carId,
          error: error.message || 'Failed to create assignment',
        });
      }
    }

    // Emit WebSocket event for real-time collaboration
    if (results.success > 0) {
      websocketService.emitBulkAssignmentsCreated(
        req.user!.companyId,
        assignments.slice(0, results.success).map((a: any) => ({
          planId: req.params.id,
          carId: a.carId,
          shopId: a.shopId,
          scheduledMonth: a.scheduledMonth,
        })),
        req.user!.id
      );
    }

    res.json({
      message: `Created ${results.success} assignments${results.failed > 0 ? `, ${results.failed} failed` : ''}`,
      ...results,
    });
  } catch (error) {
    console.error('Bulk assignment error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Export plan to Excel (CSV format)
router.get('/:id/export', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

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
    console.error('Export plan error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Generate report with recipient type configuration
router.post('/:id/generate-report', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
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
    console.error('Generate report error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get report data for printing
router.get('/:id/report-data', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
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
    console.error('Get report data error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Export plan to Excel (JSON data for frontend Excel generation)
router.get('/:id/export-data', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

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
    console.error('Export plan data error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
