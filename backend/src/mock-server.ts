import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// Mock data
const mockCompany = {
  id: 'company-1',
  name: 'AITX Corporation',
  code: 'AITX',
};

const mockUser = {
  id: 'user-1',
  email: 'admin@aitx.com',
  firstName: 'Admin',
  lastName: 'User',
  role: 'admin',
  companyId: 'company-1',
};

let mockCars = [
  { id: 'car-1', vehicleNumber: 'AITX123456', carType: 'Tank Car', isTankCar: true, commodity: 'Crude Oil', customer: 'Shell Energy', projectNumber: 'PRJ-2024-001', reasonShopped: 'Annual Inspection', status: 'available', currentLocation: 'Houston, TX', homeRegion: 'Southwest', originRegion: 'Southwest', projectedCost: 15000, daysInShop: 0, notes: '', companyId: 'company-1' },
  { id: 'car-2', vehicleNumber: 'AITX789012', carType: 'Tank Car', isTankCar: true, commodity: 'Ethanol', customer: 'Cargill', projectNumber: 'PRJ-2024-002', reasonShopped: 'Tank Cleaning', status: 'in_service', currentLocation: 'Chicago, IL', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 12000, daysInShop: 5, notes: '', companyId: 'company-1' },
  { id: 'car-3', vehicleNumber: 'AITX345678', carType: 'Covered Hopper', isTankCar: false, commodity: 'Corn', customer: 'ADM', projectNumber: 'PRJ-2024-003', reasonShopped: 'Wheel Repair', status: 'scheduled', currentLocation: 'Kansas City, MO', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 8000, daysInShop: 0, notes: '', companyId: 'company-1' },
  { id: 'car-4', vehicleNumber: 'AITX901234', carType: 'Tank Car', isTankCar: true, commodity: 'LPG', customer: 'ExxonMobil', projectNumber: 'PRJ-2024-004', reasonShopped: 'Valve Replacement', status: 'available', currentLocation: 'Beaumont, TX', homeRegion: 'Southwest', originRegion: 'Southwest', projectedCost: 18000, daysInShop: 0, notes: '', companyId: 'company-1' },
  { id: 'car-5', vehicleNumber: 'AITX567890', carType: 'Boxcar', isTankCar: false, commodity: 'Paper Products', customer: 'Georgia Pacific', projectNumber: 'PRJ-2024-005', reasonShopped: 'DOT Compliance', status: 'in_service', currentLocation: 'Atlanta, GA', homeRegion: 'Southeast', originRegion: 'Southeast', projectedCost: 6000, daysInShop: 10, notes: '', companyId: 'company-1' },
  { id: 'car-6', vehicleNumber: 'AITX112233', carType: 'Tank Car', isTankCar: true, commodity: 'Sulfuric Acid', customer: 'BASF', projectNumber: 'PRJ-2024-006', reasonShopped: 'Safety Retrofit', status: 'scheduled', currentLocation: 'Geismar, LA', homeRegion: 'Southwest', originRegion: 'Southwest', projectedCost: 25000, daysInShop: 0, notes: 'Hazmat car - special handling', companyId: 'company-1' },
  { id: 'car-7', vehicleNumber: 'AITX445566', carType: 'Gondola', isTankCar: false, commodity: 'Scrap Metal', customer: 'Nucor Steel', projectNumber: 'PRJ-2024-007', reasonShopped: 'Frame Repair', status: 'available', currentLocation: 'Birmingham, AL', homeRegion: 'Southeast', originRegion: 'Southeast', projectedCost: 10000, daysInShop: 0, notes: '', companyId: 'company-1' },
  { id: 'car-8', vehicleNumber: 'AITX778899', carType: 'Covered Hopper', isTankCar: false, commodity: 'Wheat', customer: 'Bunge', projectNumber: 'PRJ-2024-008', reasonShopped: 'Corrosion Repair', status: 'retired', currentLocation: 'Wichita, KS', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 0, daysInShop: 0, notes: 'End of life', companyId: 'company-1' },
  { id: 'car-9', vehicleNumber: 'AITX990011', carType: 'Tank Car', isTankCar: true, commodity: 'Vegetable Oil', customer: 'Archer Daniels', projectNumber: 'PRJ-2024-009', reasonShopped: 'Annual Inspection', status: 'available', currentLocation: 'Decatur, IL', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 14000, daysInShop: 0, notes: '', companyId: 'company-1' },
  { id: 'car-10', vehicleNumber: 'AITX223344', carType: 'Flatcar', isTankCar: false, commodity: 'Steel Coils', customer: 'US Steel', projectNumber: 'PRJ-2024-010', reasonShopped: 'Coupler Replacement', status: 'in_service', currentLocation: 'Gary, IN', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 7500, daysInShop: 3, notes: '', companyId: 'company-1' },
];

let mockShops = [
  { id: 'shop-1', name: 'Houston Railcar Services', code: 'HSTN', location: '1234 Industrial Blvd', city: 'Houston', state: 'TX', region: 'Southwest', network: 'AITX-Own', servingRailroad: 'UP', isAitxInternal: true, tankQualified: true, networkTier: 1, shopStatus: 'active', capacity: 25, currentLoad: 18, utilizationTarget: 0.9, baseCostPerCar: 15000, laborRate: 85, costIndex: 1.379, baseTurnTime: 12, capabilities: '["Tank Car","Covered Hopper","Boxcar"]', certifications: '["DOT","AAR","Hazmat"]', contactName: 'John Smith', contactEmail: 'jsmith@aitx.com', contactPhone: '713-555-0100', notes: 'Primary Gulf Coast facility', isActive: true, companyId: 'company-1' },
  { id: 'shop-2', name: 'Chicago Rail Repair', code: 'CHGO', location: '5678 Railway Ave', city: 'Chicago', state: 'IL', region: 'Midwest', network: 'AITX-Own', servingRailroad: 'BNSF', isAitxInternal: true, tankQualified: true, networkTier: 1, shopStatus: 'active', capacity: 30, currentLoad: 22, utilizationTarget: 0.9, baseCostPerCar: 16000, laborRate: 90, costIndex: 1.379, baseTurnTime: 14, capabilities: '["Tank Car","Covered Hopper","Gondola","Flatcar"]', certifications: '["DOT","AAR","FRA"]', contactName: 'Mike Johnson', contactEmail: 'mjohnson@aitx.com', contactPhone: '312-555-0200', notes: 'Midwest hub', isActive: true, companyId: 'company-1' },
  { id: 'shop-3', name: 'Atlanta Tank Services', code: 'ATLA', location: '9012 Terminal Rd', city: 'Atlanta', state: 'GA', region: 'Southeast', network: '3rd Party', servingRailroad: 'NS', isAitxInternal: false, tankQualified: true, networkTier: 2, shopStatus: 'active', capacity: 15, currentLoad: 10, utilizationTarget: 0.85, baseCostPerCar: 13000, laborRate: 70, costIndex: 1.0, baseTurnTime: 16, capabilities: '["Tank Car","Boxcar"]', certifications: '["DOT","AAR"]', contactName: 'Sarah Wilson', contactEmail: 'swilson@atlantatank.com', contactPhone: '404-555-0300', notes: 'Preferred Southeast partner', isActive: true, companyId: 'company-1' },
  { id: 'shop-4', name: 'Kansas City Railworks', code: 'KCMO', location: '3456 Freight Lane', city: 'Kansas City', state: 'MO', region: 'Midwest', network: '3rd Party', servingRailroad: 'UP', isAitxInternal: false, tankQualified: false, networkTier: 3, shopStatus: 'active', capacity: 20, currentLoad: 12, utilizationTarget: 0.8, baseCostPerCar: 11000, laborRate: 65, costIndex: 1.0, baseTurnTime: 18, capabilities: '["Covered Hopper","Gondola","Flatcar"]', certifications: '["AAR","FRA"]', contactName: 'Tom Brown', contactEmail: 'tbrown@kcrailworks.com', contactPhone: '816-555-0400', notes: 'No tank car capability', isActive: true, companyId: 'company-1' },
  { id: 'shop-5', name: 'LA Harbor Rail', code: 'LAHR', location: '7890 Port Way', city: 'Los Angeles', state: 'CA', region: 'West', network: 'AITX-Own', servingRailroad: 'BNSF', isAitxInternal: true, tankQualified: true, networkTier: 1, shopStatus: 'active', capacity: 20, currentLoad: 15, utilizationTarget: 0.9, baseCostPerCar: 18000, laborRate: 95, costIndex: 1.379, baseTurnTime: 14, capabilities: '["Tank Car","Intermodal","Flatcar"]', certifications: '["DOT","AAR","TC (Transport Canada)"]', contactName: 'Lisa Chen', contactEmail: 'lchen@aitx.com', contactPhone: '310-555-0500', notes: 'West Coast operations', isActive: true, companyId: 'company-1' },
];

// Auth endpoints
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (email && password) {
    res.json({
      token: 'mock-jwt-token-12345',
      user: mockUser,
    });
  } else {
    res.status(401).json({ message: 'Invalid credentials' });
  }
});

app.get('/api/auth/me', (req, res) => {
  res.json(mockUser);
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ message: 'Logged out' });
});

// Cars endpoints
app.get('/api/cars', (req, res) => {
  const { page = '1', pageSize = '20', status, customer, carType } = req.query;
  let filtered = [...mockCars];

  if (status) filtered = filtered.filter(c => c.status === status);
  if (customer) filtered = filtered.filter(c => c.customer === customer);
  if (carType) filtered = filtered.filter(c => c.carType === carType);

  const pageNum = parseInt(page as string);
  const pageSizeNum = parseInt(pageSize as string);
  const start = (pageNum - 1) * pageSizeNum;
  const paged = filtered.slice(start, start + pageSizeNum);

  res.json({
    data: paged,
    total: filtered.length,
    page: pageNum,
    pageSize: pageSizeNum,
    totalPages: Math.ceil(filtered.length / pageSizeNum),
  });
});

app.get('/api/cars/export', (req, res) => {
  const headers = ['Vehicle Number', 'Car Type', 'Is Tank Car', 'Commodity', 'Customer', 'Project Number', 'Reason Shopped', 'Status'];
  const rows = mockCars.map(c => [c.vehicleNumber, c.carType, c.isTankCar ? 'Yes' : 'No', c.commodity, c.customer, c.projectNumber, c.reasonShopped, c.status]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="railcars_export.csv"');
  res.send(csv);
});

app.get('/api/cars/:id', (req, res) => {
  const car = mockCars.find(c => c.id === req.params.id);
  if (car) res.json(car);
  else res.status(404).json({ message: 'Car not found' });
});

app.post('/api/cars', (req, res) => {
  const newCar = {
    id: `car-${Date.now()}`,
    ...req.body,
    companyId: 'company-1',
  };
  mockCars.push(newCar);
  res.status(201).json(newCar);
});

app.put('/api/cars/:id', (req, res) => {
  const index = mockCars.findIndex(c => c.id === req.params.id);
  if (index !== -1) {
    mockCars[index] = { ...mockCars[index], ...req.body };
    res.json(mockCars[index]);
  } else {
    res.status(404).json({ message: 'Car not found' });
  }
});

app.delete('/api/cars/:id', (req, res) => {
  mockCars = mockCars.filter(c => c.id !== req.params.id);
  res.status(204).send();
});

app.patch('/api/cars/bulk', (req, res) => {
  const { carIds, updates } = req.body;
  mockCars = mockCars.map(c => carIds.includes(c.id) ? { ...c, ...updates } : c);
  res.json(mockCars.filter(c => carIds.includes(c.id)));
});

app.delete('/api/cars/bulk', (req, res) => {
  const { carIds } = req.body;
  mockCars = mockCars.filter(c => !carIds.includes(c.id));
  res.status(204).send();
});

app.post('/api/cars/bulk-import', (req, res) => {
  const { cars } = req.body;
  const results = {
    status: 'success' as 'success' | 'partial_success' | 'failed',
    newCarsAdded: 0,
    existingCarsUpdated: 0,
    failedRows: 0,
    errors: [] as { row: number; reason: string }[],
  };

  if (!Array.isArray(cars) || cars.length === 0) {
    res.status(400).json({ ...results, status: 'failed', errors: [{ row: 0, reason: 'No cars data provided' }] });
    return;
  }

  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    const rowNum = i + 2;

    if (!car.vehicleNumber) {
      results.errors.push({ row: rowNum, reason: 'Missing required field: vehicleNumber' });
      results.failedRows++;
      continue;
    }

    const existingIndex = mockCars.findIndex(c => c.vehicleNumber === car.vehicleNumber);
    const isTankCar = car.isTankCar === true || car.carType?.toLowerCase().includes('tank');

    const carData = {
      id: existingIndex !== -1 ? mockCars[existingIndex].id : `car-${Date.now()}-${i}`,
      vehicleNumber: car.vehicleNumber,
      carType: car.carType || '',
      isTankCar,
      commodity: car.commodity || '',
      customer: car.customer || '',
      projectNumber: car.projectNumber || '',
      reasonShopped: car.reasonShopped || '',
      status: car.status || 'available',
      currentLocation: car.currentLocation || '',
      homeRegion: car.homeRegion || '',
      originRegion: car.originRegion || '',
      projectedCost: car.projectedCost || 0,
      daysInShop: car.daysInShop || 0,
      notes: car.notes || '',
      companyId: 'company-1',
    };

    if (existingIndex !== -1) {
      mockCars[existingIndex] = carData;
      results.existingCarsUpdated++;
    } else {
      mockCars.push(carData);
      results.newCarsAdded++;
    }
  }

  if (results.failedRows === cars.length) results.status = 'failed';
  else if (results.failedRows > 0) results.status = 'partial_success';

  res.json(results);
});

// Shops endpoints
app.get('/api/shops', (req, res) => {
  res.json(mockShops);
});

app.get('/api/shops/meta/filters', (req, res) => {
  res.json({
    regions: [...new Set(mockShops.map(s => s.region))],
    networks: [...new Set(mockShops.map(s => s.network))],
    railroads: [...new Set(mockShops.map(s => s.servingRailroad))],
  });
});

app.get('/api/shops/export', (req, res) => {
  const headers = ['Code', 'Name', 'City', 'State', 'Region', 'Network', 'Capacity', 'Tank Qualified', 'Status'];
  const rows = mockShops.map(s => [s.code, s.name, s.city, s.state, s.region, s.network, s.capacity, s.tankQualified ? 'Yes' : 'No', s.shopStatus]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="shops_export.csv"');
  res.send(csv);
});

app.get('/api/shops/:id', (req, res) => {
  const shop = mockShops.find(s => s.id === req.params.id);
  if (shop) {
    res.json({
      ...shop,
      capabilities: JSON.parse(shop.capabilities),
      certifications: JSON.parse(shop.certifications),
    });
  } else {
    res.status(404).json({ message: 'Shop not found' });
  }
});

app.post('/api/shops', (req, res) => {
  const newShop = {
    id: `shop-${Date.now()}`,
    ...req.body,
    capabilities: JSON.stringify(req.body.capabilities || []),
    certifications: JSON.stringify(req.body.certifications || []),
    companyId: 'company-1',
  };
  mockShops.push(newShop);
  res.status(201).json(newShop);
});

app.put('/api/shops/:id', (req, res) => {
  const index = mockShops.findIndex(s => s.id === req.params.id);
  if (index !== -1) {
    mockShops[index] = {
      ...mockShops[index],
      ...req.body,
      capabilities: JSON.stringify(req.body.capabilities || []),
      certifications: JSON.stringify(req.body.certifications || []),
    };
    res.json(mockShops[index]);
  } else {
    res.status(404).json({ message: 'Shop not found' });
  }
});

app.delete('/api/shops/:id', (req, res) => {
  mockShops = mockShops.filter(s => s.id !== req.params.id);
  res.status(204).send();
});

app.post('/api/shops/bulk-import', (req, res) => {
  const { shops } = req.body;
  const results = {
    status: 'success' as 'success' | 'partial_success' | 'failed',
    newShopsAdded: 0,
    existingShopsUpdated: 0,
    failedRows: 0,
    errors: [] as { row: number; reason: string }[],
  };

  if (!Array.isArray(shops) || shops.length === 0) {
    res.status(400).json({ ...results, status: 'failed', errors: [{ row: 0, reason: 'No shops data provided' }] });
    return;
  }

  for (let i = 0; i < shops.length; i++) {
    const shop = shops[i];
    const rowNum = i + 2;

    if (!shop.code || !shop.name) {
      results.errors.push({ row: rowNum, reason: 'Missing required fields: code and name' });
      results.failedRows++;
      continue;
    }

    const existingIndex = mockShops.findIndex(s => s.code === shop.code);

    const shopData = {
      id: existingIndex !== -1 ? mockShops[existingIndex].id : `shop-${Date.now()}-${i}`,
      name: shop.name,
      code: shop.code,
      location: shop.location || '',
      city: shop.city || '',
      state: shop.state || '',
      region: shop.region || '',
      network: shop.network || '',
      servingRailroad: shop.servingRailroad || '',
      isAitxInternal: shop.isAitxInternal || false,
      tankQualified: shop.tankQualified !== false,
      networkTier: shop.networkTier || 5,
      shopStatus: shop.shopStatus || 'active',
      capacity: shop.capacity || 10,
      currentLoad: shop.currentLoad || 0,
      utilizationTarget: shop.utilizationTarget || 0.9,
      baseCostPerCar: shop.baseCostPerCar || 15000,
      laborRate: shop.laborRate || 75,
      costIndex: shop.costIndex || 1.0,
      baseTurnTime: shop.baseTurnTime || 14,
      capabilities: JSON.stringify(shop.capabilities || []),
      certifications: JSON.stringify(shop.certifications || []),
      contactName: shop.contactName || '',
      contactEmail: shop.contactEmail || '',
      contactPhone: shop.contactPhone || '',
      notes: shop.notes || '',
      isActive: shop.isActive !== false,
      companyId: 'company-1',
    };

    if (existingIndex !== -1) {
      mockShops[existingIndex] = shopData;
      results.existingShopsUpdated++;
    } else {
      mockShops.push(shopData);
      results.newShopsAdded++;
    }
  }

  if (results.failedRows === shops.length) results.status = 'failed';
  else if (results.failedRows > 0) results.status = 'partial_success';

  res.json(results);
});

// Analytics endpoint
app.get('/api/analytics/dashboard', (req, res) => {
  res.json({
    totalCars: mockCars.length,
    availableCars: mockCars.filter(c => c.status === 'available').length,
    inServiceCars: mockCars.filter(c => c.status === 'in_service').length,
    scheduledCars: mockCars.filter(c => c.status === 'scheduled').length,
    totalShops: mockShops.length,
    activeShops: mockShops.filter(s => s.isActive).length,
    tankQualifiedShops: mockShops.filter(s => s.tankQualified).length,
    avgUtilization: 0.72,
  });
});

// Plans endpoint (minimal)
app.get('/api/plans', (req, res) => {
  res.json([]);
});

// Scenarios endpoint (minimal)
app.get('/api/scenarios', (req, res) => {
  res.json([]);
});

app.get('/api/scenarios/customers', (req, res) => {
  res.json([...new Set(mockCars.map(c => c.customer))]);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Mock API server running on http://localhost:${PORT}`);
  console.log(`\nTest credentials: any email/password combination works`);
  console.log(`\nAvailable endpoints:`);
  console.log(`  POST /api/auth/login`);
  console.log(`  GET  /api/cars`);
  console.log(`  POST /api/cars/bulk-import`);
  console.log(`  GET  /api/cars/export`);
  console.log(`  GET  /api/shops`);
  console.log(`  POST /api/shops/bulk-import`);
  console.log(`  GET  /api/shops/export`);
});
