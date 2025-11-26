import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Get all cars with pagination
router.get('/', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
  const { page = '1', pageSize = '20', status, customer, reasonShopped, carType } = req.query;
  const pageNum = parseInt(page as string);
  const pageSizeNum = parseInt(pageSize as string);

  try {
    const where = {
      companyId: req.user!.companyId,
      ...(status && { status: status as string }),
      ...(customer && { customer: customer as string }),
      ...(reasonShopped && { reasonShopped: reasonShopped as string }),
      ...(carType && { carType: carType as string }),
    };

    const [cars, total] = await Promise.all([
      prisma.car.findMany({
        where,
        skip: (pageNum - 1) * pageSizeNum,
        take: pageSizeNum,
        orderBy: { vehicleNumber: 'asc' },
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
router.get('/export', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
  const { ids, status, customer, reasonShopped, carType } = req.query;

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
      orderBy: { vehicleNumber: 'asc' },
    });

    // Generate CSV content
    const headers = [
      'Vehicle Number', 'Car Type', 'Is Tank Car', 'Commodity', 'Customer',
      'Project Number', 'Reason Shopped', 'Status', 'Current Location',
      'Home Region', 'Origin Region', 'Days In Shop', 'Projected Cost',
      'Last Service Date', 'Next Service Due', 'Notes'
    ];

    const rows = cars.map(car => [
      car.vehicleNumber,
      car.carType,
      car.isTankCar ? 'Yes' : 'No',
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
  const prisma: PrismaClient = req.app.locals.prisma;

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
  const prisma: PrismaClient = req.app.locals.prisma;
  const { vehicleNumber, carType, commodity, customer, projectNumber, reasonShopped, status, notes, lastServiceDate, nextServiceDue } = req.body;

  try {
    const car = await prisma.car.create({
      data: {
        vehicleNumber,
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
  const prisma: PrismaClient = req.app.locals.prisma;
  const { vehicleNumber, carType, commodity, customer, projectNumber, reasonShopped, status, notes, lastServiceDate, nextServiceDue } = req.body;

  try {
    const car = await prisma.car.updateMany({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
      data: {
        vehicleNumber,
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
  const prisma: PrismaClient = req.app.locals.prisma;

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
  const prisma: PrismaClient = req.app.locals.prisma;
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
  const prisma: PrismaClient = req.app.locals.prisma;
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

// Bulk import railcars with detailed results
router.post('/bulk-import', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
  const { cars } = req.body;

  const results = {
    status: 'success' as 'success' | 'partial_success' | 'failed',
    newCarsAdded: 0,
    existingCarsUpdated: 0,
    failedRows: 0,
    errors: [] as { row: number; reason: string }[],
  };

  if (!Array.isArray(cars) || cars.length === 0) {
    res.status(400).json({
      status: 'failed',
      newCarsAdded: 0,
      existingCarsUpdated: 0,
      failedRows: 0,
      errors: [{ row: 0, reason: 'No cars data provided' }],
    });
    return;
  }

  try {
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      const rowNum = i + 2; // Row 1 is header, data starts at row 2

      // Validate required fields
      if (!car.vehicleNumber) {
        results.errors.push({ row: rowNum, reason: 'Missing required field: vehicleNumber' });
        results.failedRows++;
        continue;
      }

      // Validate vehicle number format (basic check)
      if (car.vehicleNumber.length < 4) {
        results.errors.push({ row: rowNum, reason: `Invalid vehicle number: "${car.vehicleNumber}" (too short)` });
        results.failedRows++;
        continue;
      }

      // Validate status if provided
      const validStatuses = ['available', 'in_service', 'in_shop', 'scheduled', 'retired'];
      if (car.status && !validStatuses.includes(car.status.toLowerCase())) {
        results.errors.push({ row: rowNum, reason: `Invalid status: "${car.status}". Must be one of: ${validStatuses.join(', ')}` });
        results.failedRows++;
        continue;
      }

      try {
        // Check if car already exists
        const existingCar = await prisma.car.findFirst({
          where: {
            vehicleNumber: car.vehicleNumber,
            companyId: req.user!.companyId,
          },
        });

        // Determine if it's a tank car
        const isTankCar = car.isTankCar === true ||
                          car.isTankCar === 'true' ||
                          car.isTankCar === 'yes' ||
                          car.isTankCar === '1' ||
                          (car.carType && car.carType.toLowerCase().includes('tank'));

        const carData = {
          vehicleNumber: car.vehicleNumber,
          carType: car.carType || '',
          isTankCar: isTankCar,
          commodity: car.commodity || '',
          customer: car.customer || '',
          projectNumber: car.projectNumber || '',
          reasonShopped: car.reasonShopped || '',
          status: (car.status || 'available').toLowerCase(),
          currentLocation: car.currentLocation || '',
          homeRegion: car.homeRegion || '',
          originRegion: car.originRegion || '',
          projectedCost: car.projectedCost ? parseFloat(car.projectedCost) : 0,
          daysInShop: car.daysInShop ? parseInt(car.daysInShop) : 0,
          notes: car.notes || '',
          lastServiceDate: car.lastServiceDate ? new Date(car.lastServiceDate) : null,
          nextServiceDue: car.nextServiceDue ? new Date(car.nextServiceDue) : null,
        };

        if (existingCar) {
          // Update existing car
          await prisma.car.update({
            where: { id: existingCar.id },
            data: carData,
          });
          results.existingCarsUpdated++;
        } else {
          // Create new car
          await prisma.car.create({
            data: {
              ...carData,
              companyId: req.user!.companyId,
            },
          });
          results.newCarsAdded++;
        }
      } catch (dbError: any) {
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
    });
  }
});

export default router;
