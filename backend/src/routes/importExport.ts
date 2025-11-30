/**
 * Import/Export API Routes
 *
 * Handles file uploads for CSV import and data exports.
 */

import { Router, Request, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import importExportService from '../services/importExportService';
import auditService from '../services/auditService';

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
    console.error('Error previewing import:', error);
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
      await auditService.log({
        action: 'DATA_IMPORT',
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
    console.error('Error importing cars:', error);
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
      await auditService.log({
        action: 'DATA_IMPORT',
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
    console.error('Error importing shops:', error);
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
    console.error('Error exporting cars:', error);
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
    console.error('Error exporting shops:', error);
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
    console.error('Error exporting assignments:', error);
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
    console.error('Error generating template:', error);
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

export default router;
