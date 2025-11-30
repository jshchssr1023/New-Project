import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// Parse CSV line handling quoted fields with commas
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Shop column mappings - CSV header to shop code
const shopColumnMappings: Record<string, { name: string; code: string; city: string; state: string }> = {
  'AITX Fleet Services of Canada Inc. (Sarnia)': { name: 'AITX Fleet Services of Canada Inc.', code: 'SARNIA', city: 'Sarnia', state: 'ON' },
  'AITX Railcar Services LLC (N Kansas City)': { name: 'AITX Railcar Services LLC', code: 'NKC', city: 'N Kansas City', state: 'MO' },
  'AITX Mini/Mobile Unit 93 (Mounds)': { name: 'AITX Mini/Mobile Unit 93', code: 'MOUNDS', city: 'Mounds', state: 'OK' },
  'AITX Mobile Headquarters (LaPorte)': { name: 'AITX Mobile Headquarters', code: 'LAPORTE', city: 'LaPorte', state: 'TX' },
  'AITX Mobile Operations (Houston)': { name: 'AITX Mobile Operations', code: 'HOUSTON', city: 'Houston', state: 'TX' },
  'AITX Railcar Services LLC (Brookhaven)': { name: 'AITX Railcar Services LLC Brookhaven', code: 'BROOK', city: 'Brookhaven', state: 'MS' },
  'AITX Railcar Services LLC (Bude)': { name: 'AITX Railcar Services LLC Bude', code: 'BUDE', city: 'Bude', state: 'MS' },
  'AITX Railcar Services LLC (Longview)': { name: 'AITX Railcar Services LLC Longview', code: 'LONG', city: 'Longview', state: 'TX' },
  'AITX Railcar Services LLC (Tennille)': { name: 'AITX Railcar Services LLC Tennille', code: 'TENN', city: 'Tennille', state: 'GA' },
  'AITX Repair-KCK MRU (Kansas City)': { name: 'AITX Repair-KCK MRU', code: 'KCK', city: 'Kansas City', state: 'KS' },
  'AITX Repair-Milton, PA MRU': { name: 'AITX Repair-Milton MRU', code: 'MILTON', city: 'Milton', state: 'PA' },
  'AITX Repair-Sweetwater, TX MRU ': { name: 'AITX Repair-Sweetwater MRU', code: 'SWEET', city: 'Sweetwater', state: 'TX' },
};

async function main() {
  console.log('Starting CSV import...');

  const csvPath = path.join(__dirname, 'Qual Planner Master.csv');

  if (!fs.existsSync(csvPath)) {
    console.error('CSV file not found at:', csvPath);
    process.exit(1);
  }

  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n').filter(line => line.trim());

  if (lines.length < 2) {
    console.error('CSV file is empty or has no data rows');
    process.exit(1);
  }

  const headers = parseCSVLine(lines[0]);
  console.log(`Found ${headers.length} columns and ${lines.length - 1} data rows`);

  // Find column indices
  const colIndex: Record<string, number> = {};
  headers.forEach((header, index) => {
    colIndex[header] = index;
  });

  // Clear existing data
  console.log('Clearing existing data...');
  await prisma.qualificationPlanEvent.deleteMany();
  await prisma.qualificationPlanAssignment.deleteMany();
  await prisma.qualificationPlanDocument.deleteMany();
  await prisma.qualificationScenario.deleteMany();
  await prisma.leaseQualificationEntry.deleteMany();
  await prisma.leaseContract.deleteMany();
  await prisma.sOPAssignment.deleteMany();
  await prisma.shopCapacitySlot.deleteMany();
  await prisma.carShopEligibility.deleteMany();
  await prisma.scenarioModification.deleteMany();
  await prisma.scenarioCar.deleteMany();
  await prisma.scenario.deleteMany();
  await prisma.planAssignment.deleteMany();
  await prisma.plan.deleteMany();
  await prisma.car.deleteMany();
  await prisma.shop.deleteMany();
  await prisma.shopRule.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();
  await prisma.company.deleteMany();

  // Create company
  const company = await prisma.company.create({
    data: {
      id: uuidv4(),
      name: 'AITX Rail Services',
      code: 'AITX',
    },
  });
  console.log('Created company:', company.name);

  // Create admin user
  const adminPassword = await bcrypt.hash('password123', 10);
  const admin = await prisma.user.create({
    data: {
      id: uuidv4(),
      email: 'admin@aitx.com',
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      companyId: company.id,
    },
  });
  console.log('Created admin user');

  // Create shops from column headers
  const shopColumns = headers.filter(h =>
    h.includes('AITX') || h.includes('Procor') || h.includes('Eagle') ||
    h.includes('Cathcart') || h.includes('Transco') || h.includes('Trinity') ||
    h.includes('Greenbrier') || h.includes('Curry') || h.includes('Rescar') ||
    h.includes('Rail') || h.includes('Services')
  ).filter(h => !['CSR', 'CSL'].includes(h));

  const shops: Record<string, any> = {};

  for (const shopHeader of shopColumns) {
    // Extract shop name and location from header
    const match = shopHeader.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    let shopName = shopHeader;
    let city = '';

    if (match) {
      shopName = match[1].trim();
      city = match[2].trim();
    }

    // Generate a code from the shop name
    const code = shopName
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(' ')
      .map(w => w[0] || '')
      .join('')
      .substring(0, 6)
      .toUpperCase() || 'SHOP';

    const isAitx = shopHeader.toLowerCase().includes('aitx');

    const shop = await prisma.shop.create({
      data: {
        id: uuidv4(),
        name: shopName,
        code: code + '_' + uuidv4().substring(0, 4),
        location: city,
        city: city,
        state: '',
        region: 'Central',
        network: isAitx ? 'AITX-Own' : '3rd Party',
        isAitxInternal: isAitx,
        tankQualified: true,
        capacity: 50,
        isActive: true,
        companyId: company.id,
      },
    });

    shops[shopHeader] = shop;
  }
  console.log(`Created ${Object.keys(shops).length} shops`);

  // Import cars from CSV rows
  let carCount = 0;
  let eligibilityCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < 10) continue; // Skip incomplete rows

    const getValue = (colName: string): string => {
      const idx = colIndex[colName];
      return idx !== undefined ? (values[idx] || '').trim() : '';
    };

    // Parse car data
    const carMark = getValue('Car Mark');
    if (!carMark) continue; // Skip rows without car mark

    const lesseeName = getValue('Lessee Name');
    const contractNumber = getValue('Contract');
    const contractExpStr = getValue('Contract Expiration');
    const commodity = getValue('Primary Commodity');
    const jacketed = getValue('Jacketed').toLowerCase() === 'jacketed';
    const lined = getValue('Lined').toLowerCase() !== 'unlined' && getValue('Lined') !== '';
    const carType = getValue('Car Type Level 2') || 'Tank Car';
    const yearStr = getValue('Year');
    const buildYear = yearStr ? parseInt(yearStr) : null;
    const qualType = getValue('Full/Partial Qual');
    const reasonShopped = getValue('Reason Shopped');
    const performTankQual = getValue('Perform Tank Qual').toLowerCase() === 'yes';
    const scheduled = getValue('Scheduled');
    const currentStatus = getValue('Current Status');
    const planStatus = getValue('Plan Status');

    // Parse contract expiration date
    let contractExpiration: Date | null = null;
    if (contractExpStr) {
      const parts = contractExpStr.split('/');
      if (parts.length === 3) {
        const month = parseInt(parts[0]) - 1;
        const day = parseInt(parts[1]);
        const year = parseInt(parts[2]);
        contractExpiration = new Date(year, month, day);
      }
    }

    // Map status
    let status = 'available';
    if (currentStatus.toLowerCase().includes('complete')) status = 'in_service';
    else if (currentStatus.toLowerCase().includes('route')) status = 'scheduled';
    else if (currentStatus.toLowerCase().includes('lease')) status = 'in_service';

    // Create car
    const car = await prisma.car.create({
      data: {
        id: uuidv4(),
        railcarNumber: carMark,
        carType: carType,
        isTankCar: carType.toLowerCase().includes('tank'),
        commodity: commodity,
        customer: lesseeName,
        projectNumber: '',
        reasonShopped: reasonShopped,
        status: status,
        currentLocation: '',
        contractNumber: contractNumber,
        contractExpiration: contractExpiration,
        isJacketed: jacketed,
        isLined: lined,
        buildYear: buildYear && !isNaN(buildYear) ? buildYear : null,
        qualificationType: qualType.toLowerCase().includes('full') ? 'full' : qualType.toLowerCase().includes('partial') ? 'partial' : '',
        tankQualified: performTankQual,
        performScheduled: scheduled.toLowerCase().includes('planned') || scheduled.toLowerCase().includes('scheduled'),
        planStatus: planStatus,
        companyId: company.id,
      },
    });
    carCount++;

    // Create shop eligibility records based on date values in shop columns
    for (const shopHeader of Object.keys(shops)) {
      const shopValue = getValue(shopHeader);
      if (shopValue && shopValue.match(/\d+\/\d+\/\d+/)) {
        // Has a date value - car is eligible for this shop
        await prisma.carShopEligibility.create({
          data: {
            id: uuidv4(),
            carId: car.id,
            shopId: shops[shopHeader].id,
            isEligible: true,
            notes: `Scheduled: ${shopValue}`,
          },
        });
        eligibilityCount++;
      }
    }

    if (carCount % 100 === 0) {
      console.log(`Imported ${carCount} cars...`);
    }
  }

  console.log(`\nImport complete!`);
  console.log(`- ${carCount} cars imported`);
  console.log(`- ${eligibilityCount} shop eligibility records created`);
  console.log(`\nLogin: admin@aitx.com / password123`);
}

main()
  .catch((e) => {
    console.error('Error importing CSV:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
