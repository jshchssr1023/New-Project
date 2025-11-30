import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import {
  analyzeHeaders,
  transformCarRecord,
  normalizeStatus,
  convertToBoolean,
  convertToFloat,
  convertToInt,
  convertToDate,
  mapHeaderToField,
  VALID_STATUSES,
  REQUIRED_FIELDS,
  VALID_SYSTEM_FIELDS,
} from '../utils/importTransformers';

const router = Router();

router.use(authenticate);

// Get all cars with pagination
router.get('/', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const { page = '1', pageSize = '20', status, customer, reasonShopped, carType } = req.query;
  const pageNum = parseInt(page as string);
  const pageSizeNum = parseInt(pageSize as string);

  try {
    // Handle comma-separated status values (e.g., "available,scheduled")
    let statusFilter: any = undefined;
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
      ...(reasonShopped && { reasonShopped: reasonShopped as string }),
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
    console.error('Get cars error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Export railcars to CSV
// Supports two formats: 'standard' (human-readable) and 'umler' (system abbreviations)
router.get('/export', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const { ids, status, customer, reasonShopped, carType, format = 'umler' } = req.query;

  try {
    let where: any = {
      companyId: req.user!.companyId,
      ...(status && { status: status as string }),
      ...(customer && { customer: customer as string }),
      ...(reasonShopped && { reasonShopped: reasonShopped as string }),
      ...(carType && { carType: carType as string }),
    };

    // If specific IDs are provided, filter to those
    if (ids) {
      const idList = (ids as string).split(',');
      where.id = { in: idList };
    }

    const cars = await prisma.car.findMany({
      where,
      orderBy: { railcarNumber: 'asc' },
    });

    // Header formats: UMLER-style abbreviations vs human-readable
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
      car.reasonShopped,
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

    const filename = `railcars_export_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Export cars error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get car by ID
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

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
    console.error('Get car error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create railcar
router.post('/', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const { railcarNumber, vehicleNumber, carType, commodity, customer, projectNumber, reasonShopped, status, notes, lastServiceDate, nextServiceDue } = req.body;

  try {
    const car = await prisma.car.create({
      data: {
        railcarNumber: railcarNumber || vehicleNumber,
        carType: carType || '',
        commodity: commodity || '',
        customer: customer || '',
        projectNumber: projectNumber || '',
        reasonShopped: reasonShopped || '',
        status: status || 'available',
        notes: notes || '',
        lastServiceDate: lastServiceDate ? new Date(lastServiceDate) : null,
        nextServiceDue: nextServiceDue ? new Date(nextServiceDue) : null,
        companyId: req.user!.companyId,
      },
    });

    res.status(201).json(car);
  } catch (error) {
    console.error('Create railcar error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update railcar
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const { railcarNumber, vehicleNumber, carType, commodity, customer, projectNumber, reasonShopped, status, notes, lastServiceDate, nextServiceDue } = req.body;

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
        reasonShopped,
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
    console.error('Update car error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete car
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

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
    console.error('Delete car error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Bulk update cars
router.patch('/bulk', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const { carIds, updates } = req.body;

  try {
    await prisma.car.updateMany({
      where: {
        id: { in: carIds },
        companyId: req.user!.companyId,
      },
      data: updates,
    });

    const updatedCars = await prisma.car.findMany({
      where: { id: { in: carIds } },
    });

    res.json(updatedCars);
  } catch (error) {
    console.error('Bulk update cars error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Bulk delete cars
router.delete('/bulk', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
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
    console.error('Bulk delete cars error:', error);
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
  const prisma: any = req.app.locals.prisma;
  const { cars, fieldMappings } = req.body;

  // Extended result type to include mapping_required status
  type ImportStatus = 'success' | 'partial_success' | 'failed' | 'mapping_required';

  interface ImportResults {
    status: ImportStatus;
    newCarsAdded: number;
    existingCarsUpdated: number;
    failedRows: number;
    errors: { row: number; reason: string }[];
    warnings: { row: number; message: string }[];
    // Mapping fields (only present when status is 'mapping_required')
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
    // Phase 1: Analyze headers from first record if no explicit mappings provided
    const firstRecord = cars[0];
    const detectedHeaders = Object.keys(firstRecord);

    // Check if we need to return mapping_required
    if (!fieldMappings) {
      const headerAnalysis = analyzeHeaders(detectedHeaders);

      // If there are missing required fields or unmapped headers, return mapping_required
      if (headerAnalysis.status === 'mapping_required') {
        // Only return mapping_required if required fields are missing
        // Unmapped headers are OK as long as required fields are present
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

    // Phase 2: Process each car record with transformations
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      const rowNum = i + 2; // Row 1 is header, data starts at row 2

      try {
        // Apply field mappings and transformations
        const transformed = transformCarRecord(car, fieldMappings);

        // Collect warnings
        for (const warning of transformed.warnings) {
          results.warnings.push({ row: rowNum, message: warning });
        }

        // Check for transformation errors
        if (!transformed.success) {
          for (const error of transformed.errors) {
            results.errors.push({ row: rowNum, reason: error });
          }
          results.failedRows++;
          continue;
        }

        const carData = transformed.data;

        // Validate required fields after transformation - support both railcarNumber and vehicleNumber
        const railcarNum = carData.railcarNumber || carData.vehicleNumber;
        if (!railcarNum) {
          results.errors.push({ row: rowNum, reason: 'Missing required field: railcarNumber (or railcar_number)' });
          results.failedRows++;
          continue;
        }

        // Validate railcar number format (basic check)
        const railcarNumStr = String(railcarNum);
        if (railcarNumStr.length < 4) {
          results.errors.push({ row: rowNum, reason: `Invalid railcar number: "${railcarNumStr}" (too short, minimum 4 characters)` });
          results.failedRows++;
          continue;
        }

        // Validate status - the transformer already normalizes it, but double-check
        const status = String(carData.status || 'available');
        if (!VALID_STATUSES.includes(status)) {
          results.errors.push({ row: rowNum, reason: `Invalid status: "${carData.status}". Must be one of: ${VALID_STATUSES.join(', ')}` });
          results.failedRows++;
          continue;
        }

        // Check if car already exists
        const existingCar = await prisma.car.findFirst({
          where: {
            railcarNumber: railcarNumStr,
            companyId: req.user!.companyId,
          },
        });

        // Prepare final data for database
        const dbCarData = {
          railcarNumber: railcarNumStr,
          carType: String(carData.carType || ''),
          isTankCar: Boolean(carData.isTankCar),
          commodity: String(carData.commodity || ''),
          customer: String(carData.customer || ''),
          projectNumber: String(carData.projectNumber || ''),
          reasonShopped: String(carData.reasonShopped || ''),
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

        if (existingCar) {
          // Update existing car
          await prisma.car.update({
            where: { id: existingCar.id },
            data: dbCarData,
          });
          results.existingCarsUpdated++;
        } else {
          // Create new car
          await prisma.car.create({
            data: {
              ...dbCarData,
              companyId: req.user!.companyId,
            },
          });
          results.newCarsAdded++;
        }
      } catch (dbError: any) {
        console.error(`Row ${rowNum} database error:`, dbError);
        results.errors.push({ row: rowNum, reason: `Database error: ${dbError.message}` });
        results.failedRows++;
      }
    }

    // Determine overall status
    if (results.failedRows === cars.length) {
      results.status = 'failed';
    } else if (results.failedRows > 0) {
      results.status = 'partial_success';
    } else {
      results.status = 'success';
    }

    res.json(results);
  } catch (error) {
    console.error('Bulk import cars error:', error);
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

export default router;
