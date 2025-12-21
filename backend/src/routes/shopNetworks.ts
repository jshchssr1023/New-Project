/**
 * Shop Networks API Routes
 *
 * Manages 3rd party shop networks for S&OP planning
 * Networks represent groups of shops (e.g., Trinity, Eagle, Greenbrier)
 */

import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';
import { z } from 'zod';

const router = Router();

router.use(authenticate);

// Validation schemas
const createNetworkSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(20).toUpperCase(),
  description: z.string().default(''),
  isAitxInternal: z.boolean().default(false),
  networkTier: z.number().int().min(1).max(5).default(3),
  annualTargetVolume: z.number().int().min(0).default(0),
  annualCommittedVolume: z.number().int().min(0).default(0),
  monthlyBaseCapacity: z.number().int().min(0).default(0),
  costIndex: z.number().min(0).default(1.0),
  hasContractualCommitment: z.boolean().default(false),
  commitmentPenaltyRate: z.number().min(0).default(0),
  contractStartDate: z.string().datetime().optional().nullable(),
  contractEndDate: z.string().datetime().optional().nullable(),
  contactName: z.string().default(''),
  contactEmail: z.string().email().optional().or(z.literal('')).default(''),
  contactPhone: z.string().default(''),
  isActive: z.boolean().default(true),
  notes: z.string().default(''),
  regions: z.array(z.string()).default([]),
});

const updateNetworkSchema = createNetworkSchema.partial();

const importNetworksCsvSchema = z.object({
  networks: z.array(z.object({
    name: z.string(),
    code: z.string(),
    description: z.string().optional(),
    isAitxInternal: z.boolean().optional(),
    networkTier: z.number().optional(),
    annualTargetVolume: z.number().optional(),
    annualCommittedVolume: z.number().optional(),
    monthlyBaseCapacity: z.number().optional(),
    costIndex: z.number().optional(),
    hasContractualCommitment: z.boolean().optional(),
    commitmentPenaltyRate: z.number().optional(),
    contactName: z.string().optional(),
    contactEmail: z.string().optional(),
    contactPhone: z.string().optional(),
    regions: z.array(z.string()).optional(),
  })),
});

// Get all shop networks
router.get('/', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const { isActive, isAitxInternal, includeShops } = req.query;

  try {
    const networks = await prisma.shopNetwork.findMany({
      where: {
        companyId: req.user!.companyId,
        ...(isActive !== undefined && { isActive: isActive === 'true' }),
        ...(isAitxInternal !== undefined && { isAitxInternal: isAitxInternal === 'true' }),
      },
      include: includeShops === 'true' ? {
        shops: {
          select: {
            id: true,
            name: true,
            code: true,
            city: true,
            state: true,
            region: true,
            capacity: true,
            isActive: true,
            tankQualified: true,
          },
        },
        _count: {
          select: {
            shops: true,
          },
        },
      } : {
        _count: {
          select: {
            shops: true,
          },
        },
      },
      orderBy: [
        { isAitxInternal: 'desc' }, // AITX first
        { networkTier: 'asc' }, // Then by tier
        { name: 'asc' },
      ],
    });

    // Calculate aggregated capacity for each network
    const networksWithCapacity = networks.map((network: any) => ({
      ...network,
      shopCount: network._count.shops,
      totalMonthlyCapacity: includeShops === 'true'
        ? network.shops.reduce((sum: number, shop: any) => sum + (shop.capacity || 0), 0)
        : network.monthlyBaseCapacity,
    }));

    res.json(networksWithCapacity);
  } catch (error) {
    logger.error('Get shop networks error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get network by ID
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

  try {
    const network = await prisma.shopNetwork.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
      include: {
        shops: {
          select: {
            id: true,
            name: true,
            code: true,
            city: true,
            state: true,
            region: true,
            capacity: true,
            isActive: true,
            tankQualified: true,
            latitude: true,
            longitude: true,
          },
          orderBy: { name: 'asc' },
        },
        sopNetworkCommitments: {
          where: {
            year: new Date().getFullYear(),
          },
          orderBy: { month: 'asc' },
        },
      },
    });

    if (!network) {
      res.status(404).json({ message: 'Network not found' });
      return;
    }

    // Calculate total capacity from shops
    const totalMonthlyCapacity = network.shops.reduce(
      (sum: number, shop: any) => sum + (shop.capacity || 0),
      0
    );

    res.json({
      ...network,
      shopCount: network.shops.length,
      totalMonthlyCapacity,
      regions: JSON.parse(network.regions || '[]'),
    });
  } catch (error) {
    logger.error('Get network by ID error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create a new network
router.post('/', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

  try {
    const data = createNetworkSchema.parse(req.body);

    // Check for duplicate code
    const existing = await prisma.shopNetwork.findFirst({
      where: {
        code: data.code,
        companyId: req.user!.companyId,
      },
    });

    if (existing) {
      res.status(400).json({ message: `Network with code "${data.code}" already exists` });
      return;
    }

    const network = await prisma.shopNetwork.create({
      data: {
        ...data,
        regions: JSON.stringify(data.regions),
        contractStartDate: data.contractStartDate ? new Date(data.contractStartDate) : null,
        contractEndDate: data.contractEndDate ? new Date(data.contractEndDate) : null,
        companyId: req.user!.companyId,
      },
    });

    // Broadcast creation
    const io = req.app.locals.io;
    if (io) {
      io.to(`company:${req.user!.companyId}`).emit('shopNetwork:created', network);
    }

    res.status(201).json(network);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Validation error', errors: error.errors });
      return;
    }
    logger.error('Create network error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update a network
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

  try {
    const data = updateNetworkSchema.parse(req.body);

    // Verify network exists
    const existing = await prisma.shopNetwork.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
    });

    if (!existing) {
      res.status(404).json({ message: 'Network not found' });
      return;
    }

    // Check for duplicate code if changing
    if (data.code && data.code !== existing.code) {
      const duplicate = await prisma.shopNetwork.findFirst({
        where: {
          code: data.code,
          companyId: req.user!.companyId,
          id: { not: req.params.id },
        },
      });

      if (duplicate) {
        res.status(400).json({ message: `Network with code "${data.code}" already exists` });
        return;
      }
    }

    const updateData: any = { ...data };
    if (data.regions) {
      updateData.regions = JSON.stringify(data.regions);
    }
    if (data.contractStartDate !== undefined) {
      updateData.contractStartDate = data.contractStartDate ? new Date(data.contractStartDate) : null;
    }
    if (data.contractEndDate !== undefined) {
      updateData.contractEndDate = data.contractEndDate ? new Date(data.contractEndDate) : null;
    }

    const network = await prisma.shopNetwork.update({
      where: { id: req.params.id },
      data: updateData,
    });

    // Broadcast update
    const io = req.app.locals.io;
    if (io) {
      io.to(`company:${req.user!.companyId}`).emit('shopNetwork:updated', network);
    }

    res.json(network);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Validation error', errors: error.errors });
      return;
    }
    logger.error('Update network error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete a network
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

  try {
    // Verify network exists
    const existing = await prisma.shopNetwork.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
      include: {
        _count: {
          select: { shops: true },
        },
      },
    });

    if (!existing) {
      res.status(404).json({ message: 'Network not found' });
      return;
    }

    // Don't allow deletion if shops are assigned
    if (existing._count.shops > 0) {
      res.status(400).json({
        message: `Cannot delete network with ${existing._count.shops} assigned shops. Remove shops from this network first.`
      });
      return;
    }

    await prisma.shopNetwork.delete({
      where: { id: req.params.id },
    });

    // Broadcast deletion
    const io = req.app.locals.io;
    if (io) {
      io.to(`company:${req.user!.companyId}`).emit('shopNetwork:deleted', { id: req.params.id });
    }

    res.status(204).send();
  } catch (error) {
    logger.error('Delete network error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Assign shops to a network
router.post('/:id/shops', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const { shopIds } = req.body;

  try {
    if (!Array.isArray(shopIds) || shopIds.length === 0) {
      res.status(400).json({ message: 'shopIds must be a non-empty array' });
      return;
    }

    // Verify network exists
    const network = await prisma.shopNetwork.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
    });

    if (!network) {
      res.status(404).json({ message: 'Network not found' });
      return;
    }

    // Update shops to belong to this network
    const result = await prisma.shop.updateMany({
      where: {
        id: { in: shopIds },
        companyId: req.user!.companyId,
      },
      data: {
        networkId: req.params.id,
      },
    });

    // Broadcast update
    const io = req.app.locals.io;
    if (io) {
      io.to(`company:${req.user!.companyId}`).emit('shopNetwork:shopsUpdated', {
        networkId: req.params.id,
        shopIds,
      });
    }

    res.json({ message: `${result.count} shops assigned to network`, count: result.count });
  } catch (error) {
    logger.error('Assign shops to network error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Remove shops from a network
router.delete('/:id/shops', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const { shopIds } = req.body;

  try {
    if (!Array.isArray(shopIds) || shopIds.length === 0) {
      res.status(400).json({ message: 'shopIds must be a non-empty array' });
      return;
    }

    // Verify network exists
    const network = await prisma.shopNetwork.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
    });

    if (!network) {
      res.status(404).json({ message: 'Network not found' });
      return;
    }

    // Remove shops from network (set networkId to null)
    const result = await prisma.shop.updateMany({
      where: {
        id: { in: shopIds },
        companyId: req.user!.companyId,
        networkId: req.params.id,
      },
      data: {
        networkId: null,
      },
    });

    res.json({ message: `${result.count} shops removed from network`, count: result.count });
  } catch (error) {
    logger.error('Remove shops from network error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Bulk import networks from CSV data
router.post('/import', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

  try {
    const { networks } = importNetworksCsvSchema.parse(req.body);

    const results = {
      created: 0,
      updated: 0,
      errors: [] as { code: string; error: string }[],
    };

    for (const networkData of networks) {
      try {
        const existing = await prisma.shopNetwork.findFirst({
          where: {
            code: networkData.code.toUpperCase(),
            companyId: req.user!.companyId,
          },
        });

        const data = {
          name: networkData.name,
          code: networkData.code.toUpperCase(),
          description: networkData.description || '',
          isAitxInternal: networkData.isAitxInternal ?? false,
          networkTier: networkData.networkTier ?? 3,
          annualTargetVolume: networkData.annualTargetVolume ?? 0,
          annualCommittedVolume: networkData.annualCommittedVolume ?? 0,
          monthlyBaseCapacity: networkData.monthlyBaseCapacity ?? 0,
          costIndex: networkData.costIndex ?? 1.0,
          hasContractualCommitment: networkData.hasContractualCommitment ?? false,
          commitmentPenaltyRate: networkData.commitmentPenaltyRate ?? 0,
          contactName: networkData.contactName || '',
          contactEmail: networkData.contactEmail || '',
          contactPhone: networkData.contactPhone || '',
          regions: JSON.stringify(networkData.regions || []),
          companyId: req.user!.companyId,
        };

        if (existing) {
          await prisma.shopNetwork.update({
            where: { id: existing.id },
            data,
          });
          results.updated++;
        } else {
          await prisma.shopNetwork.create({ data });
          results.created++;
        }
      } catch (err: any) {
        results.errors.push({
          code: networkData.code,
          error: err.message || 'Unknown error',
        });
      }
    }

    res.json({
      message: `Import complete: ${results.created} created, ${results.updated} updated, ${results.errors.length} errors`,
      ...results,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Validation error', errors: error.errors });
      return;
    }
    logger.error('Import networks error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get network capacity summary for S&OP
router.get('/sop/capacity-summary', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const { year } = req.query;
  const targetYear = year ? parseInt(year as string) : new Date().getFullYear();

  try {
    // Get all active networks with their shops
    const networks = await prisma.shopNetwork.findMany({
      where: {
        companyId: req.user!.companyId,
        isActive: true,
      },
      include: {
        shops: {
          where: { isActive: true },
          select: {
            id: true,
            capacity: true,
          },
        },
        sopNetworkCommitments: {
          where: { year: targetYear },
        },
      },
      orderBy: [
        { isAitxInternal: 'desc' },
        { networkTier: 'asc' },
      ],
    });

    // Calculate capacity summary for each network
    const summary = networks.map((network: any) => {
      const totalMonthlyCapacity = network.shops.reduce(
        (sum: number, shop: any) => sum + (shop.capacity || 0),
        0
      );
      const totalAnnualCapacity = totalMonthlyCapacity * 12;

      // Monthly breakdown
      const monthlyData: Record<number, { committed: number; actual: number }> = {};
      for (let month = 1; month <= 12; month++) {
        const commitment = network.sopNetworkCommitments.find(
          (c: any) => c.month === month
        );
        monthlyData[month] = {
          committed: commitment?.committedVolume || 0,
          actual: commitment?.actualVolume || 0,
        };
      }

      return {
        id: network.id,
        name: network.name,
        code: network.code,
        isAitxInternal: network.isAitxInternal,
        networkTier: network.networkTier,
        shopCount: network.shops.length,
        totalMonthlyCapacity,
        totalAnnualCapacity,
        annualCommittedVolume: network.annualCommittedVolume,
        hasContractualCommitment: network.hasContractualCommitment,
        monthlyData,
      };
    });

    // Calculate totals
    const totals = {
      aitxCapacity: summary
        .filter((n: any) => n.isAitxInternal)
        .reduce((sum: number, n: any) => sum + n.totalAnnualCapacity, 0),
      thirdPartyCapacity: summary
        .filter((n: any) => !n.isAitxInternal)
        .reduce((sum: number, n: any) => sum + n.totalAnnualCapacity, 0),
      totalCapacity: summary.reduce((sum: number, n: any) => sum + n.totalAnnualCapacity, 0),
      totalCommitted: summary.reduce((sum: number, n: any) => sum + n.annualCommittedVolume, 0),
    };

    res.json({ networks: summary, totals, year: targetYear });
  } catch (error) {
    logger.error('Get network capacity summary error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update S&OP commitment for a network
router.post('/:id/sop-commitment', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const { year, month, committedVolume, actualVolume, notes } = req.body;

  try {
    // Verify network exists
    const network = await prisma.shopNetwork.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
    });

    if (!network) {
      res.status(404).json({ message: 'Network not found' });
      return;
    }

    // Upsert commitment
    const commitment = await prisma.sopNetworkCommitment.upsert({
      where: {
        networkId_year_month: {
          networkId: req.params.id,
          year: parseInt(year),
          month: parseInt(month),
        },
      },
      create: {
        networkId: req.params.id,
        year: parseInt(year),
        month: parseInt(month),
        committedVolume: committedVolume ?? 0,
        actualVolume: actualVolume ?? 0,
        notes: notes || '',
        companyId: req.user!.companyId,
      },
      update: {
        ...(committedVolume !== undefined && { committedVolume }),
        ...(actualVolume !== undefined && { actualVolume }),
        ...(notes !== undefined && { notes }),
      },
    });

    // Calculate variance
    if (commitment.committedVolume > 0) {
      const variancePercent = ((commitment.actualVolume - commitment.committedVolume) / commitment.committedVolume) * 100;
      const isUnderCommitment = commitment.actualVolume < commitment.committedVolume && network.hasContractualCommitment;
      const penaltyAmount = isUnderCommitment
        ? (commitment.committedVolume - commitment.actualVolume) * network.commitmentPenaltyRate
        : 0;

      await prisma.sopNetworkCommitment.update({
        where: { id: commitment.id },
        data: {
          variancePercent,
          isUnderCommitment,
          penaltyAmount,
        },
      });
    }

    res.json(commitment);
  } catch (error) {
    logger.error('Update S&OP commitment error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
