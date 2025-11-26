import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Get all shops with optional filters
router.get('/', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
  const { region, isActive, hasCapacity, month } = req.query;

  try {
    let shops = await prisma.shop.findMany({
      where: {
        companyId: req.user!.companyId,
        ...(region && { region: region as string }),
        ...(isActive !== undefined && { isActive: isActive === 'true' }),
      },
      orderBy: { name: 'asc' },
    });

    // If checking capacity for a specific month
    if (hasCapacity === 'true' && month) {
      const shopIds = shops.map(s => s.id);
      const assignments = await prisma.planAssignment.groupBy({
        by: ['shopId'],
        where: {
          shopId: { in: shopIds },
          scheduledMonth: month as string,
        },
        _count: { id: true },
      });

      const assignmentMap = new Map(assignments.map(a => [a.shopId, a._count.id]));

      shops = shops.map(shop => ({
        ...shop,
        currentLoad: assignmentMap.get(shop.id) || 0,
        availableCapacity: shop.capacity - (assignmentMap.get(shop.id) || 0),
      })) as typeof shops;

      // Filter to only shops with available capacity
      shops = shops.filter((s: any) => s.availableCapacity > 0);
    }

    res.json(shops);
  } catch (error) {
    console.error('Get shops error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get shop by ID with capacity info
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

    // Get monthly capacity for next 12 months
    const now = new Date();
    const months: string[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const assignments = await prisma.planAssignment.groupBy({
      by: ['scheduledMonth'],
      where: {
        shopId: req.params.id,
        scheduledMonth: { in: months },
      },
      _count: { id: true },
    });

    const monthlyCapacity = months.map(month => {
      const assignment = assignments.find(a => a.scheduledMonth === month);
      const used = assignment?._count.id || 0;
      return {
        month,
        capacity: shop.capacity,
        used,
        available: shop.capacity - used,
        utilizationPercent: Math.round((used / shop.capacity) * 100),
      };
    });

    res.json({
      ...shop,
      capabilities: shop.capabilities ? JSON.parse(shop.capabilities) : [],
      certifications: shop.certifications ? JSON.parse(shop.certifications) : [],
      preferredCustomers: shop.preferredCustomers ? JSON.parse(shop.preferredCustomers) : [],
      monthlyCapacity,
    });
  } catch (error) {
    console.error('Get shop error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get shop capacity for a specific month
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
      utilizationPercent: Math.round((assignmentCount / shop.capacity) * 100),
    });
  } catch (error) {
    console.error('Get shop capacity error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get capacity summary for all shops for a date range
router.get('/capacity/summary', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
  const { startMonth, endMonth } = req.query;

  try {
    const shops = await prisma.shop.findMany({
      where: {
        companyId: req.user!.companyId,
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });

    // Generate months in range
    const months: string[] = [];
    if (startMonth && endMonth) {
      const [startYear, startMo] = (startMonth as string).split('-').map(Number);
      const [endYear, endMo] = (endMonth as string).split('-').map(Number);
      let current = new Date(startYear, startMo - 1, 1);
      const end = new Date(endYear, endMo - 1, 1);

      while (current <= end) {
        months.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`);
        current.setMonth(current.getMonth() + 1);
      }
    }

    const assignments = await prisma.planAssignment.groupBy({
      by: ['shopId', 'scheduledMonth'],
      where: {
        shopId: { in: shops.map(s => s.id) },
        ...(months.length > 0 && { scheduledMonth: { in: months } }),
      },
      _count: { id: true },
    });

    const summary = shops.map(shop => {
      const shopAssignments = assignments.filter(a => a.shopId === shop.id);
      const monthlyData: Record<string, { used: number; available: number; percent: number }> = {};

      months.forEach(month => {
        const assignment = shopAssignments.find(a => a.scheduledMonth === month);
        const used = assignment?._count.id || 0;
        monthlyData[month] = {
          used,
          available: shop.capacity - used,
          percent: Math.round((used / shop.capacity) * 100),
        };
      });

      return {
        shopId: shop.id,
        shopName: shop.name,
        shopCode: shop.code,
        region: shop.region,
        capacity: shop.capacity,
        monthlyData,
      };
    });

    res.json(summary);
  } catch (error) {
    console.error('Get capacity summary error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create shop
router.post('/', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
  const {
    name, code, location, city, state, region,
    capacity, baseCostPerCar, costMultiplier, baseTurnTime, turnTimeMultiplier,
    capabilities, certifications, preferredCustomers,
    contactName, contactEmail, contactPhone, notes, isActive
  } = req.body;

  try {
    const shop = await prisma.shop.create({
      data: {
        name,
        code,
        location,
        city: city || '',
        state: state || '',
        region: region || '',
        capacity: capacity || 10,
        baseCostPerCar: baseCostPerCar || 15000,
        costMultiplier: costMultiplier || 1.0,
        baseTurnTime: baseTurnTime || 14,
        turnTimeMultiplier: turnTimeMultiplier || 1.0,
        capabilities: capabilities ? JSON.stringify(capabilities) : '[]',
        certifications: certifications ? JSON.stringify(certifications) : '[]',
        preferredCustomers: preferredCustomers ? JSON.stringify(preferredCustomers) : '[]',
        contactName: contactName || '',
        contactEmail: contactEmail || '',
        contactPhone: contactPhone || '',
        notes: notes || '',
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

// Bulk import shops
router.post('/bulk-import', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
  const { shops } = req.body;

  if (!Array.isArray(shops)) {
    res.status(400).json({ message: 'shops must be an array' });
    return;
  }

  try {
    const results = {
      created: 0,
      updated: 0,
      errors: [] as string[],
    };

    for (const shopData of shops) {
      try {
        const existing = await prisma.shop.findFirst({
          where: {
            code: shopData.code,
            companyId: req.user!.companyId,
          },
        });

        if (existing) {
          await prisma.shop.update({
            where: { id: existing.id },
            data: {
              name: shopData.name,
              location: shopData.location || existing.location,
              city: shopData.city || existing.city,
              state: shopData.state || existing.state,
              region: shopData.region || existing.region,
              capacity: shopData.capacity || existing.capacity,
              baseCostPerCar: shopData.baseCostPerCar || existing.baseCostPerCar,
              baseTurnTime: shopData.baseTurnTime || existing.baseTurnTime,
              capabilities: shopData.capabilities ? JSON.stringify(shopData.capabilities) : existing.capabilities,
              certifications: shopData.certifications ? JSON.stringify(shopData.certifications) : existing.certifications,
              contactName: shopData.contactName || existing.contactName,
              contactEmail: shopData.contactEmail || existing.contactEmail,
              contactPhone: shopData.contactPhone || existing.contactPhone,
              notes: shopData.notes || existing.notes,
              isActive: shopData.isActive !== undefined ? shopData.isActive : existing.isActive,
            },
          });
          results.updated++;
        } else {
          await prisma.shop.create({
            data: {
              name: shopData.name,
              code: shopData.code,
              location: shopData.location || '',
              city: shopData.city || '',
              state: shopData.state || '',
              region: shopData.region || '',
              capacity: shopData.capacity || 10,
              baseCostPerCar: shopData.baseCostPerCar || 15000,
              baseTurnTime: shopData.baseTurnTime || 14,
              capabilities: shopData.capabilities ? JSON.stringify(shopData.capabilities) : '[]',
              certifications: shopData.certifications ? JSON.stringify(shopData.certifications) : '[]',
              contactName: shopData.contactName || '',
              contactEmail: shopData.contactEmail || '',
              contactPhone: shopData.contactPhone || '',
              notes: shopData.notes || '',
              isActive: shopData.isActive !== false,
              companyId: req.user!.companyId,
            },
          });
          results.created++;
        }
      } catch (err: any) {
        results.errors.push(`Error with shop ${shopData.code}: ${err.message}`);
      }
    }

    res.json(results);
  } catch (error) {
    console.error('Bulk import shops error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update shop
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
  const {
    name, code, location, city, state, region,
    capacity, baseCostPerCar, costMultiplier, baseTurnTime, turnTimeMultiplier,
    capabilities, certifications, preferredCustomers,
    contactName, contactEmail, contactPhone, notes, isActive
  } = req.body;

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
        city,
        state,
        region,
        capacity,
        baseCostPerCar,
        costMultiplier,
        baseTurnTime,
        turnTimeMultiplier,
        capabilities: capabilities ? JSON.stringify(capabilities) : undefined,
        certifications: certifications ? JSON.stringify(certifications) : undefined,
        preferredCustomers: preferredCustomers ? JSON.stringify(preferredCustomers) : undefined,
        contactName,
        contactEmail,
        contactPhone,
        notes,
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
    // Check if shop has assignments
    const assignmentCount = await prisma.planAssignment.count({
      where: { shopId: req.params.id },
    });

    if (assignmentCount > 0) {
      res.status(400).json({
        message: 'Cannot delete shop with existing assignments. Deactivate it instead.',
        assignmentCount,
      });
      return;
    }

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

// Get unique regions
router.get('/meta/regions', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;

  try {
    const shops = await prisma.shop.findMany({
      where: { companyId: req.user!.companyId },
      select: { region: true },
      distinct: ['region'],
    });

    const regions = shops.map(s => s.region).filter(r => r);
    res.json(regions);
  } catch (error) {
    console.error('Get regions error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
