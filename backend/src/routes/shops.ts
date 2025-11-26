import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Get all shops
router.get('/', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;

  try {
    const shops = await prisma.shop.findMany({
      where: { companyId: req.user!.companyId },
      orderBy: { name: 'asc' },
    });

    res.json(shops);
  } catch (error) {
    console.error('Get shops error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get shop by ID
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;

  try {
    const shop = await prisma.shop.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
    });

    if (!shop) {
      res.status(404).json({ message: 'Shop not found' });
      return;
    }

    res.json(shop);
  } catch (error) {
    console.error('Get shop error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get shop capacity for a month
router.get('/:id/capacity', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
  const { month } = req.query;

  try {
    const shop = await prisma.shop.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
    });

    if (!shop) {
      res.status(404).json({ message: 'Shop not found' });
      return;
    }

    const assignmentCount = await prisma.planAssignment.count({
      where: {
        shopId: req.params.id,
        scheduledMonth: month as string,
      },
    });

    res.json({
      total: shop.capacity,
      used: assignmentCount,
      available: shop.capacity - assignmentCount,
    });
  } catch (error) {
    console.error('Get shop capacity error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create shop
router.post('/', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
  const { name, code, location, capacity, costMultiplier, turnTimeMultiplier, isActive } = req.body;

  try {
    const shop = await prisma.shop.create({
      data: {
        name,
        code,
        location,
        capacity: capacity || 10,
        costMultiplier: costMultiplier || 1.0,
        turnTimeMultiplier: turnTimeMultiplier || 1.0,
        isActive: isActive !== false,
        companyId: req.user!.companyId,
      },
    });

    res.status(201).json(shop);
  } catch (error) {
    console.error('Create shop error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update shop
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
  const { name, code, location, capacity, costMultiplier, turnTimeMultiplier, isActive } = req.body;

  try {
    const result = await prisma.shop.updateMany({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
      data: {
        name,
        code,
        location,
        capacity,
        costMultiplier,
        turnTimeMultiplier,
        isActive,
      },
    });

    if (result.count === 0) {
      res.status(404).json({ message: 'Shop not found' });
      return;
    }

    const updatedShop = await prisma.shop.findUnique({
      where: { id: req.params.id },
    });

    res.json(updatedShop);
  } catch (error) {
    console.error('Update shop error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete shop
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;

  try {
    const result = await prisma.shop.deleteMany({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
    });

    if (result.count === 0) {
      res.status(404).json({ message: 'Shop not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error('Delete shop error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
