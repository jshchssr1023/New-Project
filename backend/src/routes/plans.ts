import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Get all plans
router.get('/', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
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
  const prisma: PrismaClient = req.app.locals.prisma;

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
  const prisma: PrismaClient = req.app.locals.prisma;

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
  const prisma: PrismaClient = req.app.locals.prisma;
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
  const prisma: PrismaClient = req.app.locals.prisma;
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
  const prisma: PrismaClient = req.app.locals.prisma;

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
  const prisma: PrismaClient = req.app.locals.prisma;
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
  const prisma: PrismaClient = req.app.locals.prisma;
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
  const prisma: PrismaClient = req.app.locals.prisma;

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
  const prisma: PrismaClient = req.app.locals.prisma;

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
  const prisma: PrismaClient = req.app.locals.prisma;

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

export default router;
