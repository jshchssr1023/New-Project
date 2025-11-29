import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Get all shops with optional filters
router.get('/', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
  const { region, network, servingRailroad, isActive, hasCapacity, month } = req.query;

  try {
    let shops = await prisma.shop.findMany({
      where: {
        companyId: req.user!.companyId,
        ...(region && { region: region as string }),
        ...(network && { network: network as string }),
        ...(servingRailroad && { servingRailroad: servingRailroad as string }),
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

      const assignmentMap = new Map<string, number>(assignments.map(a => [a.shopId, a._count.id]));

      shops = shops.map(shop => ({
        ...shop,
        currentLoad: assignmentMap.get(shop.id) || 0,
        availableCapacity: (shop.capacity as number) - (assignmentMap.get(shop.id) || 0),
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

// Batch capacity check for multiple shops and months
router.post('/capacity/batch', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
  const { shopIds, months } = req.body;

  try {
    if (!Array.isArray(shopIds) || !Array.isArray(months)) {
      res.status(400).json({ message: 'shopIds and months must be arrays' });
      return;
    }

    // Get shops
    const shops = await prisma.shop.findMany({
      where: {
        id: { in: shopIds },
        companyId: req.user!.companyId,
      },
    });

    // Get all assignments for these shops and months
    const assignments = await prisma.planAssignment.groupBy({
      by: ['shopId', 'scheduledMonth'],
      where: {
        shopId: { in: shopIds },
        scheduledMonth: { in: months },
      },
      _count: { id: true },
    });

    // Build capacity map
    const capacityData: Record<string, Record<string, { capacity: number; used: number; available: number }>> = {};

    shops.forEach(shop => {
      capacityData[shop.id] = {};
      months.forEach(month => {
        const assignment = assignments.find(a => a.shopId === shop.id && a.scheduledMonth === month);
        const used = assignment?._count.id || 0;
        capacityData[shop.id][month] = {
          capacity: shop.capacity,
          used,
          available: shop.capacity - used,
        };
      });
    });

    res.json({
      shops: shops.map(s => ({
        id: s.id,
        name: s.name,
        code: s.code,
        capacity: s.capacity,
      })),
      capacityData,
    });
  } catch (error) {
    console.error('Batch capacity check error:', error);
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
    name, code, location, city, state, region, network, servingRailroad,
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
        network: network || '',
        servingRailroad: servingRailroad || '',
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

// Bulk import shops with detailed results
router.post('/bulk-import', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
  const { shops } = req.body;

  // Valid regions for validation
  const validRegions = ['Midwest', 'South', 'Gulf', 'Northeast', 'West', 'Southeast', 'Southwest'];
  const validNetworks = ['AITX-Own', '3rd Party'];

  if (!Array.isArray(shops)) {
    res.status(400).json({ message: 'shops must be an array' });
    return;
  }

  try {
    const results = {
      status: 'success' as 'success' | 'partial_success' | 'failed',
      newShopsAdded: 0,
      existingShopsUpdated: 0,
      failedRows: 0,
      errors: [] as { row: number; reason: string }[],
    };

    for (let i = 0; i < shops.length; i++) {
      const shopData = shops[i];
      const rowNum = i + 1; // 1-indexed for user display

      try {
        // Validation checks
        if (!shopData.code) {
          results.errors.push({ row: rowNum, reason: "Missing required 'code' field" });
          results.failedRows++;
          continue;
        }

        if (!shopData.name) {
          results.errors.push({ row: rowNum, reason: "Missing required 'name' field" });
          results.failedRows++;
          continue;
        }

        if (shopData.region && !validRegions.includes(shopData.region)) {
          results.errors.push({
            row: rowNum,
            reason: `Invalid region '${shopData.region}' (valid: ${validRegions.join(', ')})`
          });
          results.failedRows++;
          continue;
        }

        if (shopData.network && !validNetworks.includes(shopData.network)) {
          results.errors.push({
            row: rowNum,
            reason: `Invalid network '${shopData.network}' (valid: ${validNetworks.join(', ')})`
          });
          results.failedRows++;
          continue;
        }

        if (shopData.capacity && (isNaN(shopData.capacity) || shopData.capacity < 0)) {
          results.errors.push({ row: rowNum, reason: "Invalid capacity value (must be positive number)" });
          results.failedRows++;
          continue;
        }

        const isAitx = shopData.network === 'AITX-Own';
        const tankQualified = shopData.tankQualified !== undefined ? shopData.tankQualified :
                              shopData.certifications?.includes('Qualification') ?? true;

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
              network: shopData.network || existing.network,
              servingRailroad: shopData.servingRailroad || existing.servingRailroad,
              isAitxInternal: shopData.network ? isAitx : existing.isAitxInternal,
              tankQualified: shopData.tankQualified !== undefined ? shopData.tankQualified : existing.tankQualified,
              networkTier: shopData.networkTier || existing.networkTier,
              shopStatus: shopData.shopStatus || existing.shopStatus,
              capacity: shopData.capacity || existing.capacity,
              utilizationTarget: shopData.utilizationTarget || existing.utilizationTarget,
              baseCostPerCar: shopData.baseCostPerCar || existing.baseCostPerCar,
              laborRate: shopData.laborRate || existing.laborRate,
              costIndex: shopData.costIndex || existing.costIndex,
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
          results.existingShopsUpdated++;
        } else {
          await prisma.shop.create({
            data: {
              name: shopData.name,
              code: shopData.code,
              location: shopData.location || `${shopData.city || ''}, ${shopData.state || ''}`.trim().replace(/^,\s*/, ''),
              city: shopData.city || '',
              state: shopData.state || '',
              region: shopData.region || '',
              network: shopData.network || '',
              servingRailroad: shopData.servingRailroad || '',
              isAitxInternal: isAitx,
              tankQualified,
              networkTier: shopData.networkTier || (isAitx ? 1 : 3),
              shopStatus: shopData.shopStatus || 'active',
              capacity: shopData.capacity || 10,
              utilizationTarget: shopData.utilizationTarget || 0.90,
              baseCostPerCar: shopData.baseCostPerCar || (isAitx ? 20685 : 15000),
              laborRate: shopData.laborRate || (isAitx ? 95 : 75),
              costIndex: shopData.costIndex || (isAitx ? 1.379 : 1.0),
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
          results.newShopsAdded++;
        }
      } catch (err: any) {
        results.errors.push({ row: rowNum, reason: err.message || 'Unknown error' });
        results.failedRows++;
      }
    }

    // Determine overall status
    if (results.failedRows === shops.length) {
      results.status = 'failed';
    } else if (results.failedRows > 0) {
      results.status = 'partial_success';
    }

    res.json(results);
  } catch (error) {
    console.error('Bulk import shops error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Export shops to CSV
router.get('/export', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
  const { format = 'csv', region, network, isActive } = req.query;

  try {
    const shops = await prisma.shop.findMany({
      where: {
        companyId: req.user!.companyId,
        ...(region && { region: region as string }),
        ...(network && { network: network as string }),
        ...(isActive !== undefined && { isActive: isActive === 'true' }),
      },
      orderBy: { name: 'asc' },
    });

    // Generate CSV content
    const headers = [
      'Code', 'Name', 'Location', 'City', 'State', 'Region', 'Network',
      'Serving Railroad', 'Is AITX Internal', 'Tank Qualified', 'Network Tier',
      'Shop Status', 'Capacity', 'Utilization Target', 'Base Cost Per Car',
      'Labor Rate', 'Cost Index', 'Base Turn Time', 'Contact Name',
      'Contact Email', 'Contact Phone', 'Notes', 'Is Active'
    ];

    const rows = shops.map(shop => [
      shop.code,
      shop.name,
      shop.location,
      shop.city,
      shop.state,
      shop.region,
      shop.network,
      shop.servingRailroad,
      shop.isAitxInternal ? 'Yes' : 'No',
      shop.tankQualified ? 'Yes' : 'No',
      shop.networkTier,
      shop.shopStatus,
      shop.capacity,
      shop.utilizationTarget,
      shop.baseCostPerCar,
      shop.laborRate,
      shop.costIndex,
      shop.baseTurnTime,
      shop.contactName,
      shop.contactEmail,
      shop.contactPhone,
      shop.notes,
      shop.isActive ? 'Yes' : 'No',
    ]);

    // Escape CSV values
    const escapeCSV = (val: any): string => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(escapeCSV).join(','))
    ].join('\n');

    const filename = `shops_export_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Export shops error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update shop
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
  const {
    name, code, location, city, state, region, network, servingRailroad,
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
        network,
        servingRailroad,
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

// Get unique networks
router.get('/meta/networks', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;

  try {
    const shops = await prisma.shop.findMany({
      where: { companyId: req.user!.companyId },
      select: { network: true },
      distinct: ['network'],
    });

    const networks = shops.map(s => s.network).filter(n => n);
    res.json(networks);
  } catch (error) {
    console.error('Get networks error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get unique serving railroads
router.get('/meta/railroads', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;

  try {
    const shops = await prisma.shop.findMany({
      where: { companyId: req.user!.companyId },
      select: { servingRailroad: true },
      distinct: ['servingRailroad'],
    });

    const railroads = shops.map(s => s.servingRailroad).filter(r => r);
    res.json(railroads);
  } catch (error) {
    console.error('Get railroads error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get all filter options (regions, networks, railroads) in one call
router.get('/meta/filters', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;

  try {
    const shops = await prisma.shop.findMany({
      where: { companyId: req.user!.companyId },
      select: { region: true, network: true, servingRailroad: true },
    });

    const regions = [...new Set(shops.map(s => s.region).filter(r => r))];
    const networks = [...new Set(shops.map(s => s.network).filter(n => n))];
    const railroads = [...new Set(shops.map(s => s.servingRailroad).filter(r => r))];

    res.json({ regions, networks, railroads });
  } catch (error) {
    console.error('Get filter options error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ============ Performance Scorecard Endpoints ============

import shopPerformanceService from '../services/shopPerformanceService';

// Get performance scorecard for a specific shop
router.get('/:id/performance', async (req: AuthRequest, res: Response) => {
  try {
    const scorecard = await shopPerformanceService.getShopScorecard(
      req.params.id,
      req.user!.companyId
    );
    res.json(scorecard);
  } catch (error) {
    console.error('Get shop performance error:', error);
    res.status(500).json({ message: 'Failed to get shop performance' });
  }
});

// Get performance scorecards for all shops (network overview)
router.get('/performance/network', async (req: AuthRequest, res: Response) => {
  try {
    const networkScorecard = await shopPerformanceService.getNetworkScorecard(
      req.user!.companyId
    );
    res.json(networkScorecard);
  } catch (error) {
    console.error('Get network performance error:', error);
    res.status(500).json({ message: 'Failed to get network performance' });
  }
});

// Calculate/refresh performance metrics for a shop
router.post('/:id/performance/calculate', async (req: AuthRequest, res: Response) => {
  try {
    const { periodType = 'monthly' } = req.body;

    // Calculate period dates
    const now = new Date();
    let periodStart: Date;
    let periodEnd = now;

    switch (periodType) {
      case 'quarterly':
        const quarter = Math.floor(now.getMonth() / 3);
        periodStart = new Date(now.getFullYear(), quarter * 3, 1);
        break;
      case 'yearly':
        periodStart = new Date(now.getFullYear(), 0, 1);
        break;
      case 'monthly':
      default:
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }

    const performance = await shopPerformanceService.calculateShopPerformance(
      req.params.id,
      periodStart,
      periodEnd,
      periodType as 'monthly' | 'quarterly' | 'yearly',
      req.user!.companyId
    );

    res.json(performance);
  } catch (error) {
    console.error('Calculate shop performance error:', error);
    res.status(500).json({ message: 'Failed to calculate shop performance' });
  }
});

// Check if shop has performance concerns (for planning grid alerts)
router.get('/:id/performance/concerns', async (req: AuthRequest, res: Response) => {
  try {
    const scorecard = await shopPerformanceService.getShopScorecard(
      req.params.id,
      req.user!.companyId
    );

    const concerns = shopPerformanceService.hasPerformanceConcerns(scorecard);

    res.json({
      shopId: req.params.id,
      shopName: scorecard.shop.name,
      ...concerns,
      performanceScore: scorecard.metrics.performanceScore,
    });
  } catch (error) {
    console.error('Get shop performance concerns error:', error);
    res.status(500).json({ message: 'Failed to get shop performance concerns' });
  }
});

export default router;
