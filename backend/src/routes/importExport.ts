/**
 * Import/Export API Routes
 *
 * Handles file uploads for CSV import and data exports.
 */

import { Router, Request, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import importExportService from '../services/importExportService';
import auditService from '../services/auditService';
import logger from '../utils/logger';

const router = Router();

// Max file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// =============================================================================
// IMPORT ENDPOINTS
// =============================================================================

/**
 * Preview car import (analyze CSV without saving)
 */
router.post('/cars/preview', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const companyId = authReq.user?.companyId;

  if (!companyId) {
    return res.status(403).json({ error: 'Company access required' });
  }

  const { csvContent, customMappings } = req.body;

  if (!csvContent || typeof csvContent !== 'string') {
    return res.status(400).json({ error: 'CSV content required' });
  }

  if (csvContent.length > MAX_FILE_SIZE) {
    return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
  }

  try {
    const preview = await importExportService.previewCarImport(csvContent, companyId, customMappings);
    res.json(preview);
  } catch (error) {
    logger.error('Error previewing import:', error);
    res.status(500).json({ error: 'Failed to preview import' });
  }
});

/**
 * Import cars from CSV
 */
router.post('/cars', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const companyId = authReq.user?.companyId;
  const userId = authReq.user?.id;

  if (!companyId || !userId) {
    return res.status(403).json({ error: 'Company access required' });
  }

  const { csvContent, updateExisting, customMappings, dryRun } = req.body;

  if (!csvContent || typeof csvContent !== 'string') {
    return res.status(400).json({ error: 'CSV content required' });
  }

  if (csvContent.length > MAX_FILE_SIZE) {
    return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
  }

  try {
    const result = await importExportService.importCars(csvContent, companyId, {
      updateExisting: updateExisting !== false,
      customMappings,
      dryRun: dryRun === true,
    });

    // Audit log
    if (!dryRun) {
      await auditService.logAudit({
        action: 'import',
        entityType: 'Car',
        details: {
          imported: result.imported,
          updated: result.updated,
          skipped: result.skipped,
          errors: result.errors.length,
        },
        userId,
        companyId,
      });
    }

    res.json(result);
  } catch (error) {
    logger.error('Error importing cars:', error);
    res.status(500).json({ error: 'Failed to import cars' });
  }
});

/**
 * Import shops from CSV
 */
router.post('/shops', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const companyId = authReq.user?.companyId;
  const userId = authReq.user?.id;

  if (!companyId || !userId) {
    return res.status(403).json({ error: 'Company access required' });
  }

  const { csvContent, updateExisting, dryRun } = req.body;

  if (!csvContent || typeof csvContent !== 'string') {
    return res.status(400).json({ error: 'CSV content required' });
  }

  try {
    const result = await importExportService.importShops(csvContent, companyId, {
      updateExisting: updateExisting !== false,
      dryRun: dryRun === true,
    });

    if (!dryRun) {
      await auditService.logAudit({
        action: 'import',
        entityType: 'Shop',
        details: {
          imported: result.imported,
          updated: result.updated,
          skipped: result.skipped,
          errors: result.errors.length,
        },
        userId,
        companyId,
      });
    }

    res.json(result);
  } catch (error) {
    logger.error('Error importing shops:', error);
    res.status(500).json({ error: 'Failed to import shops' });
  }
});

// =============================================================================
// EXPORT ENDPOINTS
// =============================================================================

/**
 * Export cars to CSV
 */
router.get('/cars/export', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const companyId = authReq.user?.companyId;

  if (!companyId) {
    return res.status(403).json({ error: 'Company access required' });
  }

  try {
    const { columns, status, customer, carType } = req.query;

    const csv = await importExportService.exportCars(companyId, {
      columns: columns ? String(columns).split(',') : undefined,
      filters: {
        status: status || undefined,
        customer: customer || undefined,
        carType: carType || undefined,
      },
    });

    const filename = `cars_export_${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    logger.error('Error exporting cars:', error);
    res.status(500).json({ error: 'Failed to export cars' });
  }
});

/**
 * Export shops to CSV
 */
router.get('/shops/export', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const companyId = authReq.user?.companyId;

  if (!companyId) {
    return res.status(403).json({ error: 'Company access required' });
  }

  try {
    const { activeOnly } = req.query;

    const csv = await importExportService.exportShops(companyId, {
      activeOnly: activeOnly !== 'false',
    });

    const filename = `shops_export_${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    logger.error('Error exporting shops:', error);
    res.status(500).json({ error: 'Failed to export shops' });
  }
});

/**
 * Export assignments to CSV
 */
router.get('/assignments/export', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const companyId = authReq.user?.companyId;

  if (!companyId) {
    return res.status(403).json({ error: 'Company access required' });
  }

  try {
    const { planId, month } = req.query;

    const csv = await importExportService.exportAssignments(
      companyId,
      planId as string | undefined,
      month as string | undefined
    );

    const filename = `assignments_export_${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    logger.error('Error exporting assignments:', error);
    res.status(500).json({ error: 'Failed to export assignments' });
  }
});

// =============================================================================
// TEMPLATE ENDPOINTS
// =============================================================================

/**
 * Download import template
 */
router.get('/template/:entityType', authenticateToken, async (req: Request, res: Response) => {
  const { entityType } = req.params;

  if (entityType !== 'cars' && entityType !== 'shops') {
    return res.status(400).json({ error: 'Invalid entity type. Use "cars" or "shops".' });
  }

  try {
    const template = importExportService.generateImportTemplate(entityType);
    const filename = `${entityType}_import_template.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(template);
  } catch (error) {
    logger.error('Error generating template:', error);
    res.status(500).json({ error: 'Failed to generate template' });
  }
});

/**
 * Get field mappings info
 */
router.get('/mappings', authenticateToken, async (req: Request, res: Response) => {
  const mappingInfo = {
    cars: {
      requiredFields: ['vehicleNumber'],
      optionalFields: [
        'carType', 'isTankCar', 'customer', 'commodity', 'status',
        'currentLocation', 'homeRegion', 'originRegion', 'reasonShopped',
        'projectedCost', 'daysInShop', 'shopEntryDate', 'lastServiceDate',
        'nextServiceDue', 'notes'
      ],
      statusValues: ['available', 'in_service', 'in_shop', 'scheduled', 'retired'],
      booleanValues: ['Yes/No', 'True/False', '1/0', 'Y/N'],
    },
    shops: {
      requiredFields: ['code', 'name'],
      optionalFields: [
        'region', 'address', 'city', 'state', 'capacity',
        'baseCostPerCar', 'baseTurnTime', 'capabilities',
        'certifications', 'preferredCustomers', 'isActive'
      ],
    },
  };

  res.json(mappingInfo);
});

// =============================================================================
// FULL DATA BACKUP ENDPOINTS
// =============================================================================

/**
 * Export full data backup as JSON
 * Includes: cars, shops, networks, assignments, plans, scenarios
 */
router.get('/backup', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const companyId = authReq.user?.companyId;
  const userId = authReq.user?.id;
  const prisma: any = req.app.locals.prisma;

  if (!companyId || !userId) {
    return res.status(403).json({ error: 'Company access required' });
  }

  // Only admins can create backups
  if (authReq.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required for data backup' });
  }

  try {
    // Fetch all data for the company
    const [cars, shops, networks, carFlowPlans, scenarios, customers] = await Promise.all([
      prisma.car.findMany({
        where: { companyId },
        orderBy: { railcarNumber: 'asc' },
      }),
      prisma.shop.findMany({
        where: { companyId },
        include: {
          capabilityProfile: true,
        },
        orderBy: { code: 'asc' },
      }),
      prisma.shopNetwork.findMany({
        where: { companyId },
        include: {
          sopNetworkCommitments: true,
        },
        orderBy: { code: 'asc' },
      }),
      prisma.carFlowPlan.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.scenario.findMany({
        where: { companyId },
        include: {
          cars: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.customer.findMany({
        where: { companyId },
        orderBy: { name: 'asc' },
      }),
    ]);

    const backup = {
      metadata: {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        exportedBy: userId,
        companyId,
        counts: {
          cars: cars.length,
          shops: shops.length,
          networks: networks.length,
          carFlowPlans: carFlowPlans.length,
          scenarios: scenarios.length,
          customers: customers.length,
        },
      },
      data: {
        cars,
        shops,
        networks,
        carFlowPlans,
        scenarios,
        customers,
      },
    };

    // Audit the backup
    await auditService.logAudit({
      action: 'export',
      entityType: 'Plan',
      details: {
        counts: backup.metadata.counts,
        backupType: 'full_system_backup',
      },
      userId,
      companyId,
    });

    const filename = `chronos_backup_${new Date().toISOString().split('T')[0]}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(backup);
  } catch (error) {
    logger.error('Error creating backup:', error);
    res.status(500).json({ error: 'Failed to create backup' });
  }
});

/**
 * Validate backup file structure
 */
router.post('/backup/validate', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;

  if (authReq.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { backup } = req.body;

  if (!backup || typeof backup !== 'object') {
    return res.status(400).json({ error: 'Backup data required' });
  }

  try {
    const validation = {
      isValid: true,
      errors: [] as string[],
      warnings: [] as string[],
      summary: {
        version: backup.metadata?.version || 'unknown',
        exportedAt: backup.metadata?.exportedAt || 'unknown',
        counts: backup.metadata?.counts || {},
      },
    };

    // Check required structure
    if (!backup.metadata) {
      validation.errors.push('Missing metadata section');
      validation.isValid = false;
    }

    if (!backup.data) {
      validation.errors.push('Missing data section');
      validation.isValid = false;
    }

    // Check data arrays
    const expectedArrays = ['cars', 'shops', 'networks', 'carFlowPlans', 'scenarios', 'customers'];
    for (const key of expectedArrays) {
      if (backup.data && !Array.isArray(backup.data[key])) {
        validation.warnings.push(`Missing or invalid ${key} array`);
      }
    }

    // Validate car records structure
    if (Array.isArray(backup.data?.cars) && backup.data.cars.length > 0) {
      const sampleCar = backup.data.cars[0];
      if (!sampleCar.railcarNumber) {
        validation.warnings.push('Car records may be missing railcarNumber field');
      }
    }

    // Validate shop records structure
    if (Array.isArray(backup.data?.shops) && backup.data.shops.length > 0) {
      const sampleShop = backup.data.shops[0];
      if (!sampleShop.code || !sampleShop.name) {
        validation.warnings.push('Shop records may be missing code or name field');
      }
    }

    res.json(validation);
  } catch (error) {
    logger.error('Error validating backup:', error);
    res.status(500).json({ error: 'Failed to validate backup' });
  }
});

export default router;
