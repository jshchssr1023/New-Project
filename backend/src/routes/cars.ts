import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../services/db';
import logger from '../utils/logger';
import {
  analyzeHeaders,
  transformCarRecord,
  convertToFloat,
  convertToInt,
  convertToDate,
  VALID_STATUSES,
} from '../utils/importTransformers';

const router = Router();

router.use(authenticate);

// =============================================================================
// BULK OPERATIONS - Must come before /:id routes to avoid conflicts
// =============================================================================

// Bulk update cars
router.patch('/bulk', async (req: AuthRequest, res: Response) => {
  const { carIds, updates } = req.body;

  // Validate input
  if (!Array.isArray(carIds) || carIds.length === 0) {
    return res.status(400).json({ message: 'carIds must be a non-empty array' });
  }

  try {
    await prisma.car.updateMany({
      where: {
        id: { in: carIds },
        companyId: req.user!.companyId,
      },
      data: updates,
    });

    // SECURITY: Always filter by companyId to prevent data leakage
    const updatedCars = await prisma.car.findMany({
      where: {
        id: { in: carIds },
        companyId: req.user!.companyId,
      },
    });

    res.json(updatedCars);
  } catch (error) {
    logger.error('Bulk update cars error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Bulk delete cars
router.delete('/bulk', async (req: AuthRequest, res: Response) => {
  const { carIds } = req.body;

  try {
    await prisma.car.deleteMany({
      where: {
        id: { in: carIds },
        companyId: req.user!.companyId,
      },
    });

    res.status(204).send();
  } catch (error) {
    logger.error('Bulk delete cars error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Analyze headers for import mapping (pre-flight check)
router.post('/bulk-import/analyze', async (req: AuthRequest, res: Response) => {
  const { headers } = req.body;

  if (!Array.isArray(headers) || headers.length === 0) {
    res.status(400).json({
      status: 'failed',
      error: 'No headers provided for analysis',
    });
    return;
  }

  const analysisResult = analyzeHeaders(headers);
  res.json(analysisResult);
});

// Bulk import railcars with data mapping intelligence and detailed results
router.post('/bulk-import', async (req: AuthRequest, res: Response) => {
  const { cars, fieldMappings } = req.body;

  type ImportStatus = 'success' | 'partial_success' | 'failed' | 'mapping_required';

  interface ImportResults {
    status: ImportStatus;
    newCarsAdded: number;
    existingCarsUpdated: number;
    failedRows: number;
    errors: { row: number; reason: string }[];
    warnings: { row: number; message: string }[];
    detected_headers?: string[];
    missing_required_fields?: string[];
    unmapped_headers?: string[];
    suggested_mappings?: Record<string, string[]>;
  }

  const results: ImportResults = {
    status: 'success',
    newCarsAdded: 0,
    existingCarsUpdated: 0,
    failedRows: 0,
    errors: [],
    warnings: [],
  };

  if (!Array.isArray(cars) || cars.length === 0) {
    res.status(400).json({
      status: 'failed',
      newCarsAdded: 0,
      existingCarsUpdated: 0,
      failedRows: 0,
      errors: [{ row: 0, reason: 'No cars data provided' }],
      warnings: [],
    });
    return;
  }

  try {
    const firstRecord = cars[0];
    const detectedHeaders = Object.keys(firstRecord);

    if (!fieldMappings) {
      const headerAnalysis = analyzeHeaders(detectedHeaders);

      if (headerAnalysis.status === 'mapping_required') {
        if (headerAnalysis.missingRequiredFields.length > 0) {
          res.json({
            status: 'mapping_required' as ImportStatus,
            newCarsAdded: 0,
            existingCarsUpdated: 0,
            failedRows: 0,
            errors: [],
            warnings: [],
            detected_headers: headerAnalysis.detectedHeaders,
            missing_required_fields: headerAnalysis.missingRequiredFields,
            unmapped_headers: headerAnalysis.unmappedHeaders,
            suggested_mappings: headerAnalysis.suggestions,
          });
          return;
        }
      }
    }

    // Phase 1: Validate and transform all records first (no DB calls)
    interface ValidatedCar {
      rowNum: number;
      railcarNumber: string;
      dbCarData: {
        railcarNumber: string;
        carType: string;
        isTankCar: boolean;
        commodity: string;
        customer: string;
        projectNumber: string;
        reasonsShopped: string;
        status: string;
        currentLocation: string;
        homeRegion: string;
        originRegion: string;
        projectedCost: number | null;
        daysInShop: number;
        notes: string;
        lastServiceDate: Date | null;
        nextServiceDue: Date | null;
      };
    }

    const validatedCars: ValidatedCar[] = [];
    const railcarNumbers: string[] = [];

    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      const rowNum = i + 2;

      const transformed = transformCarRecord(car, fieldMappings);

      for (const warning of transformed.warnings) {
        results.warnings.push({ row: rowNum, message: warning });
      }

      if (!transformed.success) {
        for (const error of transformed.errors) {
          results.errors.push({ row: rowNum, reason: error });
        }
        results.failedRows++;
        continue;
      }

      const carData = transformed.data;

      const railcarNum = carData.railcarNumber || carData.vehicleNumber;
      if (!railcarNum) {
        results.errors.push({ row: rowNum, reason: 'Missing required field: railcarNumber (or railcar_number)' });
        results.failedRows++;
        continue;
      }

      const railcarNumStr = String(railcarNum);
      if (railcarNumStr.length < 4) {
        results.errors.push({ row: rowNum, reason: `Invalid railcar number: "${railcarNumStr}" (too short, minimum 4 characters)` });
        results.failedRows++;
        continue;
      }

      const status = String(carData.status || 'available');
      if (!VALID_STATUSES.includes(status)) {
        results.errors.push({ row: rowNum, reason: `Invalid status: "${carData.status}". Must be one of: ${VALID_STATUSES.join(', ')}` });
        results.failedRows++;
        continue;
      }

      const dbCarData = {
        railcarNumber: railcarNumStr,
        carType: String(carData.carType || ''),
        isTankCar: Boolean(carData.isTankCar),
        commodity: String(carData.commodity || ''),
        customer: String(carData.customer || ''),
        projectNumber: String(carData.projectNumber || ''),
        reasonsShopped: String(carData.reasonsShopped || carData.reasonShopped || ''),
        status: status,
        currentLocation: String(carData.currentLocation || ''),
        homeRegion: String(carData.homeRegion || ''),
        originRegion: String(carData.originRegion || ''),
        projectedCost: convertToFloat(carData.projectedCost),
        daysInShop: convertToInt(carData.daysInShop),
        notes: String(carData.notes || ''),
        lastServiceDate: convertToDate(carData.lastServiceDate),
        nextServiceDue: convertToDate(carData.nextServiceDue),
      };

      validatedCars.push({ rowNum, railcarNumber: railcarNumStr, dbCarData });
      railcarNumbers.push(railcarNumStr);
    }

    // Phase 2: Batch query for existing cars (single query instead of N queries)
    const existingCars = await prisma.car.findMany({
      where: {
        railcarNumber: { in: railcarNumbers },
        companyId: req.user!.companyId,
      },
      select: { id: true, railcarNumber: true },
    });

    const existingCarMap = new Map(existingCars.map(c => [c.railcarNumber, c.id]));

    // Phase 3: Prepare batch operations
    type CarCreateData = typeof validatedCars[0]['dbCarData'] & { companyId: string };
    const carsToCreate: CarCreateData[] = [];
    const carsToUpdate: Array<{ id: string; data: typeof validatedCars[0]['dbCarData'] }> = [];

    for (const { railcarNumber, dbCarData } of validatedCars) {
      const existingId = existingCarMap.get(railcarNumber);
      if (existingId) {
        carsToUpdate.push({ id: existingId, data: dbCarData });
      } else {
        carsToCreate.push({ ...dbCarData, companyId: req.user!.companyId });
      }
    }

    // Phase 4: Execute batch operations in a transaction
    await prisma.$transaction(async (tx) => {
      // Batch create new cars
      if (carsToCreate.length > 0) {
        await tx.car.createMany({ data: carsToCreate });
        results.newCarsAdded = carsToCreate.length;
      }

      // Update existing cars (within single transaction)
      for (const { id, data } of carsToUpdate) {
        await tx.car.update({ where: { id }, data });
      }
      results.existingCarsUpdated = carsToUpdate.length;
    });

    if (results.failedRows === cars.length) {
      results.status = 'failed';
    } else if (results.failedRows > 0) {
      results.status = 'partial_success';
    } else {
      results.status = 'success';
    }

    res.json(results);
  } catch (error) {
    logger.error('Bulk import cars error', error);
    res.status(500).json({
      status: 'failed',
      newCarsAdded: 0,
      existingCarsUpdated: 0,
      failedRows: cars.length,
      errors: [{ row: 0, reason: 'Internal server error during import' }],
      warnings: [],
    });
  }
});

// =============================================================================
// STANDARD CRUD OPERATIONS
// =============================================================================

// Get all cars with pagination
router.get('/', async (req: AuthRequest, res: Response) => {
  const { page = '1', pageSize = '20', status, customer, reasonShopped, carType } = req.query;
  const pageNum = parseInt(page as string);
  const pageSizeNum = parseInt(pageSize as string);

  try {
    let statusFilter: string | { in: string[] } | undefined = undefined;
    if (status) {
      const statusValues = (status as string).split(',').map(s => s.trim());
      if (statusValues.length === 1) {
        statusFilter = statusValues[0];
      } else {
        statusFilter = { in: statusValues };
      }
    }

    const where = {
      companyId: req.user!.companyId,
      ...(statusFilter && { status: statusFilter }),
      ...(customer && { customer: customer as string }),
      ...(reasonShopped && { reasonsShopped: reasonShopped as string }),
      ...(carType && { carType: carType as string }),
    };

    const [cars, total] = await Promise.all([
      prisma.car.findMany({
        where,
        skip: (pageNum - 1) * pageSizeNum,
        take: pageSizeNum,
        orderBy: { railcarNumber: 'asc' },
      }),
      prisma.car.count({ where }),
    ]);

    res.json({
      data: cars,
      total,
      page: pageNum,
      pageSize: pageSizeNum,
      totalPages: Math.ceil(total / pageSizeNum),
    });
  } catch (error) {
    logger.error('Get cars error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Export railcars to CSV
router.get('/export', async (req: AuthRequest, res: Response) => {
  const { ids, status, customer, reasonShopped, carType, format = 'umler' } = req.query;

  try {
    const where: {
      companyId: string;
      status?: string;
      customer?: string;
      reasonsShopped?: string;
      carType?: string;
      id?: { in: string[] };
    } = {
      companyId: req.user!.companyId,
      ...(status && { status: status as string }),
      ...(customer && { customer: customer as string }),
      ...(reasonShopped && { reasonsShopped: reasonShopped as string }),
      ...(carType && { carType: carType as string }),
    };

    if (ids) {
      const idList = (ids as string).split(',');
      where.id = { in: idList };
    }

    const cars = await prisma.car.findMany({
      where,
      orderBy: { railcarNumber: 'asc' },
    });

    const headerFormats = {
      umler: [
        'car_id', 'car_typ', 'tank_ind', 'commod', 'cust_nm',
        'proj_no', 'shoppi', 'status', 'location_nm',
        'home_reg', 'origina', 'days_ir', 'estimat',
        'arrival_ship_d', 'last_svc_dt', 'next_svc_dt', 'notes'
      ],
      standard: [
        'Railcar Number', 'Car Type', 'Is Tank Car', 'Commodity', 'Customer',
        'Project Number', 'Reason Shopped', 'Status', 'Current Location',
        'Home Region', 'Origin Region', 'Days In Shop', 'Projected Cost',
        'Shop Entry Date', 'Last Service Date', 'Next Service Due', 'Notes'
      ]
    };

    const headers = format === 'standard' ? headerFormats.standard : headerFormats.umler;

    const rows = cars.map(car => [
      car.railcarNumber,
      car.carType,
      car.isTankCar ? 'Y' : 'N',
      car.commodity,
      car.customer,
      car.projectNumber,
      car.reasonsShopped,
      car.status,
      car.currentLocation,
      car.homeRegion,
      car.originRegion,
      car.daysInShop,
      car.projectedCost,
      car.shopEntryDate ? new Date(car.shopEntryDate).toISOString().split('T')[0] : '',
      car.lastServiceDate ? new Date(car.lastServiceDate).toISOString().split('T')[0] : '',
      car.nextServiceDue ? new Date(car.nextServiceDue).toISOString().split('T')[0] : '',
      car.notes,
    ]);

    // Escape CSV values - prevent formula injection
    const escapeCSV = (val: unknown): string => {
      let str = String(val ?? '');
      // Prevent formula injection
      if (/^[=+\-@\t\r]/.test(str)) {
        str = "'" + str;
      }
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(escapeCSV).join(','))
    ].join('\n');

    const filename = `railcars_export_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (error) {
    logger.error('Export cars error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get car by ID - MUST come after /export and /bulk routes
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const car = await prisma.car.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
    });

    if (!car) {
      res.status(404).json({ message: 'Car not found' });
      return;
    }

    res.json(car);
  } catch (error) {
    logger.error('Get car error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create railcar
router.post('/', async (req: AuthRequest, res: Response) => {
  const { railcarNumber, vehicleNumber, carType, commodity, customer, projectNumber, reasonShopped, reasonsShopped, status, notes, lastServiceDate, nextServiceDue } = req.body;

  try {
    const car = await prisma.car.create({
      data: {
        railcarNumber: railcarNumber || vehicleNumber,
        carType: carType || '',
        commodity: commodity || '',
        customer: customer || '',
        projectNumber: projectNumber || '',
        reasonsShopped: reasonsShopped || reasonShopped || '',
        status: status || 'available',
        notes: notes || '',
        lastServiceDate: lastServiceDate ? new Date(lastServiceDate) : null,
        nextServiceDue: nextServiceDue ? new Date(nextServiceDue) : null,
        companyId: req.user!.companyId,
      },
    });

    res.status(201).json(car);
  } catch (error) {
    logger.error('Create railcar error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update railcar
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const { railcarNumber, vehicleNumber, carType, commodity, customer, projectNumber, reasonShopped, reasonsShopped, status, notes, lastServiceDate, nextServiceDue } = req.body;

  try {
    const car = await prisma.car.updateMany({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
      data: {
        railcarNumber: railcarNumber || vehicleNumber,
        carType,
        commodity,
        customer,
        projectNumber,
        reasonsShopped: reasonsShopped || reasonShopped,
        status,
        notes,
        lastServiceDate: lastServiceDate ? new Date(lastServiceDate) : null,
        nextServiceDue: nextServiceDue ? new Date(nextServiceDue) : null,
      },
    });

    if (car.count === 0) {
      res.status(404).json({ message: 'Car not found' });
      return;
    }

    const updatedCar = await prisma.car.findUnique({
      where: { id: req.params.id },
    });

    res.json(updatedCar);
  } catch (error) {
    logger.error('Update car error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete car
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await prisma.car.deleteMany({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
    });

    if (result.count === 0) {
      res.status(404).json({ message: 'Car not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    logger.error('Delete car error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
