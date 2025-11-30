import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// CSV file path
const CSV_FILE_PATH = path.join(__dirname, 'Qual Planner Master.csv');

// Helper function to normalize header names for matching
function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Helper function to parse CSV with flexible header matching
function parseCSV(content: string): Record<string, string>[] {
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return [];

  // Parse header - handle potential BOM, quotes, and whitespace
  const headerLine = lines[0].replace(/^\uFEFF/, ''); // Remove BOM if present
  const rawHeaders = headerLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''));

  // Log headers for debugging
  console.log('   CSV Headers found:', rawHeaders.slice(0, 5).join(', '), '...');

  const records: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // Parse values, handling quoted fields
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim().replace(/^"|"$/g, ''));

    const record: Record<string, string> = {};

    rawHeaders.forEach((header, index) => {
      // Store both original and normalized versions
      record[header] = values[index] || '';
      record[normalizeHeader(header)] = values[index] || '';
    });

    records.push(record);
  }

  return records;
}

// Helper function to parse date from various formats
function parseDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;

  // Try parsing various date formats
  const cleaned = dateStr.trim();

  // Try MM/DD/YYYY or M/D/YYYY
  const mdyMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdyMatch) {
    const month = parseInt(mdyMatch[1]) - 1;
    const day = parseInt(mdyMatch[2]);
    let year = parseInt(mdyMatch[3]);
    if (year < 100) year += 2000; // Convert 2-digit year
    return new Date(year, month, day);
  }

  // Try YYYY-MM-DD
  const isoMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
  }

  // Fallback to Date.parse
  const parsed = Date.parse(cleaned);
  if (!isNaN(parsed)) {
    return new Date(parsed);
  }

  return null;
}

// Helper function to parse boolean
function parseBoolean(value: string): boolean {
  const v = value.toLowerCase().trim();
  return v === 'yes' || v === 'y' || v === 'true' || v === '1';
}

// Fallback data for random generation if CSV not found
const carTypes = ['Tank Car', 'Covered Hopper', 'Open Hopper', 'Boxcar', 'Gondola', 'Flatcar', 'Intermodal'];
const commodities = ['Crude Oil', 'Ethanol', 'Corn', 'Wheat', 'Coal', 'Lumber', 'Steel', 'Chemicals', 'Fertilizer', 'Plastics'];
const customers = ['Shell', 'Cargill', 'ADM', 'Koch Industries', 'ExxonMobil', 'Chevron', 'BNSF Logistics', 'UP Fleet', 'CSX Transport', 'CN Rail'];
const reasonsShopped = ['release', 'assignment', 'qualification', 'project', 'repair', 'maintenance'];
const qualificationTypes = ['full', 'partial', ''];
const planStatuses = ['planned', 'in_progress', 'completed', 'pending', ''];

// Shop locations - actual shop data
const shopData = [
  // Midwest Region
  { name: 'AITX Maumee', code: 'MAUM', city: 'Maumee', state: 'OH', region: 'Midwest', network: 'AITX-Own', certifications: 'Qualification, Heavy Repair', annualCapacity: 1200, turnTime: 85, contact: 'Mike Thompson (419) 555-1234', notes: 'Primary Midwest hub' },
  { name: 'AITX East Chicago', code: 'ECHI', city: 'East Chicago', state: 'IN', region: 'Midwest', network: 'AITX-Own', certifications: 'Qualification, Heavy Repair, Lining', annualCapacity: 1400, turnTime: 80, contact: 'Dave Wilson (219) 555-2345', notes: 'Full service facility' },
  { name: 'AITX Coffeyville', code: 'COFF', city: 'Coffeyville', state: 'KS', region: 'Midwest', network: 'AITX-Own', certifications: 'Qualification, Heavy Repair', annualCapacity: 900, turnTime: 90, contact: 'Jim Baker (620) 555-3456', notes: '' },
  { name: 'Watco Coffeyville', code: 'WATC', city: 'Coffeyville', state: 'KS', region: 'Midwest', network: '3rd Party', certifications: 'Heavy Repair', annualCapacity: 800, turnTime: 95, contact: 'Steve Morris (620) 555-4567', notes: 'Watco partnership' },
  { name: 'Mid-America Railcar', code: 'MARC', city: 'Kansas City', state: 'MO', region: 'Midwest', network: '3rd Party', certifications: 'Qualification, Heavy Repair', annualCapacity: 1000, turnTime: 88, contact: 'Tom Anderson (816) 555-5678', notes: '' },
  { name: 'GATX Danville', code: 'GATX', city: 'Danville', state: 'IL', region: 'Midwest', network: '3rd Party', certifications: 'Qualification, Heavy Repair, Fabrication', annualCapacity: 1600, turnTime: 75, contact: 'Robert Lee (217) 555-6789', notes: 'High capacity facility' },

  // South Region
  { name: 'AITX Texarkana', code: 'TXRK', city: 'Texarkana', state: 'TX', region: 'South', network: 'AITX-Own', certifications: 'Qualification, Heavy Repair', annualCapacity: 1100, turnTime: 85, contact: 'Carlos Rodriguez (903) 555-7890', notes: '' },
  { name: 'AITX Longview', code: 'LONG', city: 'Longview', state: 'TX', region: 'South', network: 'AITX-Own', certifications: 'Qualification, Lining', annualCapacity: 950, turnTime: 90, contact: 'Mark Johnson (903) 555-8901', notes: 'Lining specialist' },
  { name: 'AITX Bossier City', code: 'BOSS', city: 'Bossier City', state: 'LA', region: 'South', network: 'AITX-Own', certifications: 'Qualification, Heavy Repair', annualCapacity: 850, turnTime: 92, contact: 'Paul Davis (318) 555-9012', notes: '' },
  { name: 'Ennis Railcar', code: 'ENNS', city: 'Ennis', state: 'TX', region: 'South', network: '3rd Party', certifications: 'Heavy Repair', annualCapacity: 700, turnTime: 95, contact: 'John Smith (972) 555-0123', notes: '' },
  { name: 'RSI Rail Group', code: 'RSI', city: 'Longview', state: 'TX', region: 'South', network: '3rd Party', certifications: 'Qualification, Heavy Repair, Fabrication', annualCapacity: 1300, turnTime: 82, contact: 'Brian Taylor (903) 555-1235', notes: 'Full fabrication capabilities' },

  // Gulf Region
  { name: 'AITX Eagle', code: 'EAGL', city: 'Eagle Pass', state: 'TX', region: 'Gulf', network: 'AITX-Own', certifications: 'Qualification, Heavy Repair', annualCapacity: 1000, turnTime: 88, contact: 'Miguel Santos (830) 555-2346', notes: 'Border location' },
  { name: 'Rescar Houston', code: 'RHOU', city: 'Houston', state: 'TX', region: 'Gulf', network: '3rd Party', certifications: 'Qualification, Heavy Repair, Lining', annualCapacity: 1500, turnTime: 78, contact: 'Greg Harris (713) 555-3457', notes: 'Major Gulf hub' },
  { name: 'TankCar Services', code: 'TANK', city: 'Beaumont', state: 'TX', region: 'Gulf', network: '3rd Party', certifications: 'Qualification, Heavy Repair, Lining', annualCapacity: 1100, turnTime: 85, contact: 'Larry White (409) 555-4568', notes: 'Tank car specialist' },
  { name: 'Union Tank Repair', code: 'UTCR', city: 'Lake Charles', state: 'LA', region: 'Gulf', network: '3rd Party', certifications: 'Qualification, Heavy Repair', annualCapacity: 900, turnTime: 90, contact: 'Chris Martin (337) 555-5679', notes: '' },
  { name: 'UTLX Alexandria', code: 'UTLX', city: 'Alexandria', state: 'LA', region: 'Gulf', network: '3rd Party', certifications: 'Qualification, Heavy Repair, Fabrication', annualCapacity: 1200, turnTime: 82, contact: 'James Brown (318) 555-6780', notes: '' },

  // Northeast Region
  { name: 'Midland Rail Services', code: 'MDLD', city: 'Midland', state: 'PA', region: 'Northeast', network: '3rd Party', certifications: 'Qualification, Heavy Repair', annualCapacity: 1000, turnTime: 88, contact: 'Frank Miller (412) 555-7891', notes: '' },
  { name: 'GBW Rail Services', code: 'GBW', city: 'Hornell', state: 'NY', region: 'Northeast', network: '3rd Party', certifications: 'Qualification, Heavy Repair, Fabrication', annualCapacity: 1100, turnTime: 85, contact: 'Dan Clark (607) 555-8902', notes: '' },
  { name: 'National Steel Car', code: 'NSC', city: 'Hamilton', state: 'ON', region: 'Northeast', network: '3rd Party', certifications: 'Qualification, Heavy Repair, Fabrication', annualCapacity: 1400, turnTime: 80, contact: 'Andrew Scott (905) 555-9013', notes: 'Canada location' },
  { name: 'Procor Sarnia', code: 'PROC', city: 'Sarnia', state: 'ON', region: 'Northeast', network: '3rd Party', certifications: 'Qualification, Heavy Repair', annualCapacity: 950, turnTime: 90, contact: 'Kevin Moore (519) 555-0124', notes: 'Canada location' },

  // West Region
  { name: 'Vulcan Rail Services', code: 'VULC', city: 'Los Angeles', state: 'CA', region: 'West', network: '3rd Party', certifications: 'Qualification, Heavy Repair', annualCapacity: 1000, turnTime: 88, contact: 'Tony Garcia (213) 555-1236', notes: 'West coast hub' },
  { name: 'Frontier Railcar', code: 'FRNT', city: 'Salt Lake City', state: 'UT', region: 'West', network: '3rd Party', certifications: 'Heavy Repair', annualCapacity: 750, turnTime: 95, contact: 'Bill Jackson (801) 555-2347', notes: '' },
  { name: 'CF Rail', code: 'CFR', city: 'Denver', state: 'CO', region: 'West', network: '3rd Party', certifications: 'Qualification, Heavy Repair', annualCapacity: 850, turnTime: 92, contact: 'Rick Nelson (303) 555-3458', notes: '' },
  { name: 'Apex Rail', code: 'APEX', city: 'Phoenix', state: 'AZ', region: 'West', network: '3rd Party', certifications: 'Heavy Repair', annualCapacity: 600, turnTime: 100, contact: 'Sam Adams (602) 555-4569', notes: '' },
  { name: 'Nortrak Services', code: 'NORT', city: 'Seattle', state: 'WA', region: 'West', network: '3rd Party', certifications: 'Qualification, Heavy Repair', annualCapacity: 800, turnTime: 92, contact: 'Eric Young (206) 555-5670', notes: 'Pacific Northwest' },
];

async function main() {
  console.log('🌱 Starting seed...');

  // Clear existing data (order matters due to foreign key constraints)
  // Delete in order from leaf tables to root tables

  // Qualification planning engine tables (deepest leaves first)
  await prisma.qualificationPlanDocument.deleteMany();
  await prisma.qualificationPlanAssignment.deleteMany();
  await prisma.qualificationScenario.deleteMany();
  await prisma.qualificationPlanEvent.deleteMany();
  await prisma.leaseQualificationEntry.deleteMany();
  await prisma.leaseContract.deleteMany();

  // MasterPlan tables (delete commitments first due to FK)
  await prisma.masterPlanCommitment.deleteMany();
  await prisma.masterPlan.deleteMany();

  // S&OP tables
  await prisma.sOPAssignment.deleteMany();
  await prisma.shopCapacitySlot.deleteMany();

  // Core planning tables
  await prisma.carShopEligibility.deleteMany();
  await prisma.scenarioModification.deleteMany();
  await prisma.scenarioCar.deleteMany();
  await prisma.scenario.deleteMany();
  await prisma.planAssignment.deleteMany();
  await prisma.plan.deleteMany();

  // Master data tables
  await prisma.car.deleteMany();
  await prisma.shop.deleteMany();
  await prisma.shopRule.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();
  await prisma.company.deleteMany();

  console.log('✓ Cleared existing data');

  // Create company
  const company = await prisma.company.create({
    data: {
      id: uuidv4(),
      name: 'AITX Rail Services',
      code: 'AITX',
    },
  });

  console.log('✓ Created company:', company.name);

  // Create users
  const adminPassword = await bcrypt.hash('password123', 10);
  const userPassword = await bcrypt.hash('password123', 10);

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

  const planner = await prisma.user.create({
    data: {
      id: uuidv4(),
      email: 'planner@aitx.com',
      password: userPassword,
      firstName: 'Sarah',
      lastName: 'Johnson',
      role: 'planner',
      companyId: company.id,
    },
  });

  const viewer = await prisma.user.create({
    data: {
      id: uuidv4(),
      email: 'viewer@aitx.com',
      password: userPassword,
      firstName: 'Mike',
      lastName: 'Williams',
      role: 'viewer',
      companyId: company.id,
    },
  });

  console.log('✓ Created users: admin, planner, viewer');

  // Create 25 shops with actual data (sequential to avoid SQLite crashes)
  const shops = [];
  for (let index = 0; index < shopData.length; index++) {
    const shop = shopData[index];
    // Convert annual capacity to monthly (divide by 12)
    const monthlyCapacity = Math.ceil(shop.annualCapacity / 12);
    const isAitx = shop.network === 'AITX-Own';
    // Tank qualified based on certifications (shops with Qualification cert are tank qualified)
    const tankQualified = shop.certifications.includes('Qualification');
    // Network tier: AITX = 1 (preferred), 3P varies by index
    const networkTier = isAitx ? 1 : Math.min(2 + Math.floor(index / 5), 5);

    const createdShop = await prisma.shop.create({
      data: {
        id: uuidv4(),
        name: shop.name,
        code: shop.code,
        location: `${shop.city}, ${shop.state}`,
        city: shop.city,
        state: shop.state,
        region: shop.region,
        network: shop.network,
        isAitxInternal: isAitx,
        tankQualified,
        networkTier,
        shopStatus: 'active',
        capacity: monthlyCapacity,
        utilizationTarget: 0.90,
        baseCostPerCar: isAitx ? 20685 : 15000, // AITX has 37.9% premium
        laborRate: isAitx ? 95 : 75,
        costIndex: isAitx ? 1.379 : 1.0,
        baseTurnTime: shop.turnTime,
        certifications: JSON.stringify(shop.certifications.split(', ')),
        contactName: shop.contact.split(' (')[0],
        contactPhone: shop.contact.includes('(') ? shop.contact.match(/\([\d\)\s-]+/)?.[0]?.replace(/[()]/g, '') || '' : '',
        notes: shop.notes,
        isActive: true,
        companyId: company.id,
      },
    });
    shops.push(createdShop);
  }

  console.log(`✓ Created ${shops.length} shops`);

  // Regions for car locations
  const regions = ['Midwest', 'South', 'Gulf', 'Northeast', 'West'];
  const locations = ['Chicago, IL', 'Houston, TX', 'Los Angeles, CA', 'Atlanta, GA', 'Denver, CO', 'Kansas City, MO', 'New Orleans, LA', 'Seattle, WA'];

  // Create railcars - from CSV if available, otherwise generate random data
  const cars = [];

  // Try to load from CSV file
  let csvRecords: Record<string, string>[] = [];
  if (fs.existsSync(CSV_FILE_PATH)) {
    console.log(`📄 Loading cars from CSV: ${CSV_FILE_PATH}`);
    const csvContent = fs.readFileSync(CSV_FILE_PATH, 'utf-8');
    csvRecords = parseCSV(csvContent);
    console.log(`   Found ${csvRecords.length} records in CSV`);
  } else {
    console.log(`⚠️  CSV file not found at ${CSV_FILE_PATH}, generating random data...`);
  }

  if (csvRecords.length > 0) {
    // Import from CSV
    // Log first record's keys for debugging
    if (csvRecords.length > 0) {
      console.log('   First record keys:', Object.keys(csvRecords[0]).slice(0, 10).join(', '));
    }

    for (let i = 0; i < csvRecords.length; i++) {
      const record = csvRecords[i];

      // Map CSV columns to database fields using normalized header names
      // Original: Car Init, Car No, Car Type, Commodity, Lessee, Contract #, Cont Exp, Jacketed?, Lined?, Build Yr, Qual Type, Tank Qual, Tank Qual Due, Perf Sched, Plan Status
      // Normalized: carinit, carno, cartype, commodity, lessee, contract, contexp, jacketed, lined, buildyr, qualtype, tankqual, tankqualdue, perfsched, planstatus
      const carInit = record['carinit'] || record['Car Init'] || '';
      const carNo = record['carno'] || record['Car No'] || '';
      const railcarNumber = carInit && carNo ? `${carInit}${carNo}` : (carNo || `AITX${String(10000 + i)}`);

      const carType = record['cartype'] || record['Car Type'] || 'Tank Car';
      const isTankCar = carType.toLowerCase().includes('tank');
      const commodity = record['commodity'] || record['Commodity'] || '';
      const customer = record['lessee'] || record['Lessee'] || '';
      const contractNumber = record['contract'] || record['Contract #'] || '';
      const contractExpiration = parseDate(record['contexp'] || record['Cont Exp'] || '');
      const isJacketed = parseBoolean(record['jacketed'] || record['Jacketed?'] || '');
      const isLined = parseBoolean(record['lined'] || record['Lined?'] || '');
      const buildYear = parseInt(record['buildyr'] || record['Build Yr'] || '') || null;
      const qualificationType = record['qualtype'] || record['Qual Type'] || '';
      const tankQualified = parseBoolean(record['tankqual'] || record['Tank Qual'] || '');
      const tankQualDueDate = parseDate(record['tankqualdue'] || record['Tank Qual Due'] || '');
      const performScheduled = parseBoolean(record['perfsched'] || record['Perf Sched'] || '');
      const planStatus = record['planstatus'] || record['Plan Status'] || '';

      // Generate some reasonable defaults for fields not in CSV
      const region = regions[Math.floor(Math.random() * regions.length)];
      const status = 'available'; // Default status

      const createdCar = await prisma.car.create({
        data: {
          id: uuidv4(),
          railcarNumber,
          carType,
          isTankCar,
          commodity,
          customer,
          projectNumber: '',
          reasonShopped: isTankCar && tankQualDueDate ? 'qualification' : '',
          status,
          currentLocation: locations[Math.floor(Math.random() * locations.length)],
          homeRegion: region,
          originRegion: region,
          projectedCost: 0,
          daysInShop: 0,
          shopEntryDate: null,
          lastServiceDate: null,
          nextServiceDue: tankQualDueDate, // Use tank qual due as next service due
          notes: '',
          contractNumber,
          contractExpiration,
          isJacketed,
          isLined,
          buildYear,
          qualificationType,
          tankQualified,
          tankQualDueDate,
          performScheduled,
          planStatus,
          company: { connect: { id: company.id } },
        },
      });
      cars.push(createdCar);

      // Log progress every 100 cars
      if ((i + 1) % 100 === 0) {
        console.log(`  ... imported ${i + 1}/${csvRecords.length} railcars from CSV`);
      }
    }
    console.log(`✓ Imported ${cars.length} railcars from CSV`);
  } else {
    // Generate random data as fallback
    const carStatusesList = ['available', 'in_service', 'in_shop', 'scheduled', 'retired'];
    const statusWeights = [0.5, 0.15, 0.1, 0.2, 0.05];

    for (let i = 0; i < 200; i++) {
      const carType = carTypes[Math.floor(Math.random() * carTypes.length)];
      const isTankCar = carType === 'Tank Car';
      const commodity = commodities[Math.floor(Math.random() * commodities.length)];
      const customer = customers[Math.floor(Math.random() * customers.length)];
      const reasonShopped = reasonsShopped[Math.floor(Math.random() * reasonsShopped.length)];
      const rand = Math.random();
      let statusIndex = 0;
      let cumulative = 0;
      for (let j = 0; j < statusWeights.length; j++) {
        cumulative += statusWeights[j];
        if (rand < cumulative) {
          statusIndex = j;
          break;
        }
      }
      const status = carStatusesList[statusIndex];
      const region = regions[Math.floor(Math.random() * regions.length)];
      const nextServiceDue = new Date(Date.now() + Math.random() * 365 * 24 * 60 * 60 * 1000);
      const isOverdue = Math.random() > 0.85;
      const adjustedNextServiceDue = isOverdue
        ? new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
        : nextServiceDue;
      const daysInShop = status === 'in_shop' ? Math.floor(Math.random() * 20) + 1 : 0;
      const shopEntryDate = status === 'in_shop' ? new Date(Date.now() - daysInShop * 24 * 60 * 60 * 1000) : null;
      const contractExpiration = new Date(Date.now() + Math.random() * 730 * 24 * 60 * 60 * 1000);
      const buildYear = 1990 + Math.floor(Math.random() * 35);
      const isJacketed = isTankCar ? Math.random() > 0.5 : false;
      const isLined = isTankCar ? Math.random() > 0.6 : false;
      const qualificationType = qualificationTypes[Math.floor(Math.random() * qualificationTypes.length)];
      const tankQualified = isTankCar ? Math.random() > 0.2 : false;
      const performScheduled = Math.random() > 0.7;
      const planStatus = planStatuses[Math.floor(Math.random() * planStatuses.length)];

      let tankQualDueDate: Date | null = null;
      if (isTankCar) {
        const qualRand = Math.random();
        if (qualRand < 0.2) {
          tankQualDueDate = new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000);
        } else if (qualRand < 0.5) {
          tankQualDueDate = new Date(Date.now() + Math.random() * 90 * 24 * 60 * 60 * 1000);
        } else {
          tankQualDueDate = new Date(Date.now() + (90 + Math.random() * 275) * 24 * 60 * 60 * 1000);
        }
      }

      const createdCar = await prisma.car.create({
        data: {
          id: uuidv4(),
          railcarNumber: `AITX${String(100000 + i).slice(1)}`,
          carType,
          isTankCar,
          commodity,
          customer,
          projectNumber: `PRJ-${2024}-${String(1000 + Math.floor(Math.random() * 9000))}`,
          reasonShopped,
          status,
          currentLocation: locations[Math.floor(Math.random() * locations.length)],
          homeRegion: region,
          originRegion: region,
          projectedCost: 12000 + Math.floor(Math.random() * 10000),
          daysInShop,
          shopEntryDate,
          lastServiceDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
          nextServiceDue: adjustedNextServiceDue,
          notes: Math.random() > 0.7 ? 'Priority service required' : '',
          contractNumber: `CTR-${2024}-${String(10000 + i)}`,
          contractExpiration,
          isJacketed,
          isLined,
          buildYear,
          qualificationType,
          tankQualified,
          tankQualDueDate,
          performScheduled,
          planStatus,
          company: { connect: { id: company.id } },
        },
      });
      cars.push(createdCar);

      if ((i + 1) % 50 === 0) {
        console.log(`  ... created ${i + 1}/200 railcars`);
      }
    }
    console.log(`✓ Created ${cars.length} railcars (random data)`);
  }

  // Skip shop eligibility records during initial import for performance
  // With 97K cars × 10+ shops = nearly 1 million records - too slow for one-by-one inserts
  // Shop eligibility should be:
  // 1. Imported from CSV if available (dedicated eligibility columns)
  // 2. Calculated on-demand when needed
  // 3. Generated in a background job after import
  console.log(`⏭️  Skipping shop eligibility records (calculate on-demand for large datasets)`);

  // Create 2 plans
  const plan2024 = await prisma.plan.create({
    data: {
      id: uuidv4(),
      name: '2024 Service Plan',
      description: 'Annual service schedule for 2024 fleet maintenance',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
      status: 'active',
      companyId: company.id,
      createdBy: planner.id,
    },
  });

  const plan2025 = await prisma.plan.create({
    data: {
      id: uuidv4(),
      name: '2025 Service Plan',
      description: 'Projected service schedule for 2025',
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-12-31'),
      status: 'draft',
      companyId: company.id,
      createdBy: planner.id,
    },
  });

  console.log('✓ Created 2 plans');

  // Create assignments for 2024 plan
  const activeShops = shops.filter((s) => s.isActive);
  const months2024 = [
    '2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06',
    '2024-07', '2024-08', '2024-09', '2024-10', '2024-11', '2024-12'
  ];
  const months2025 = [
    '2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06',
    '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12'
  ];

  // Distribute cars across shops and months for 2024
  let assignmentCount = 0;
  const usedCarMonths2024 = new Set<string>();

  for (const month of months2024) {
    for (const shop of activeShops) {
      const carsForShop = Math.floor(Math.random() * shop.capacity * 0.8) + 2;
      for (let i = 0; i < carsForShop; i++) {
        const car = cars[Math.floor(Math.random() * cars.length)];
        const key = `${car.id}-${month}`;

        if (!usedCarMonths2024.has(key)) {
          usedCarMonths2024.add(key);
          await prisma.planAssignment.create({
            data: {
              id: uuidv4(),
              planId: plan2024.id,
              carId: car.id,
              shopId: shop.id,
              scheduledMonth: month,
              estimatedCost: 15000 + Math.floor(Math.random() * 20000),
              estimatedDuration: 10 + Math.floor(Math.random() * 10),
              status: month < '2024-11' ? 'completed' : month === '2024-11' ? 'in_progress' : 'pending',
            },
          });
          assignmentCount++;
        }
      }
    }
  }

  console.log(`✓ Created ${assignmentCount} assignments for 2024 plan`);

  // Create fewer assignments for 2025 draft plan
  assignmentCount = 0;
  const usedCarMonths2025 = new Set<string>();

  for (const month of months2025.slice(0, 6)) {
    for (const shop of activeShops.slice(0, 10)) {
      const carsForShop = Math.floor(Math.random() * shop.capacity * 0.5) + 1;
      for (let i = 0; i < carsForShop; i++) {
        const car = cars[Math.floor(Math.random() * cars.length)];
        const key = `${car.id}-${month}`;

        if (!usedCarMonths2025.has(key)) {
          usedCarMonths2025.add(key);
          await prisma.planAssignment.create({
            data: {
              id: uuidv4(),
              planId: plan2025.id,
              carId: car.id,
              shopId: shop.id,
              scheduledMonth: month,
              estimatedCost: 15000 + Math.floor(Math.random() * 20000),
              estimatedDuration: 10 + Math.floor(Math.random() * 10),
              status: 'pending',
            },
          });
          assignmentCount++;
        }
      }
    }
  }

  console.log(`✓ Created ${assignmentCount} assignments for 2025 plan`);

  // Create a sample scenario
  const scenario = await prisma.scenario.create({
    data: {
      id: uuidv4(),
      projectNumber: 'Q2-25-001',
      name: 'High Volume Q2 2025',
      description: 'What-if analysis for increased service volume in Q2 2025',
      basePlanId: plan2025.id,
      status: 'completed',
      results: JSON.stringify({
        totalCost: 2850000,
        costDelta: 5.2,
        averageTurnTime: 14.3,
        turnTimeDelta: -2.1,
        shopUtilization: {
          'Houston Rail Center': 85,
          'Chicago Yards': 78,
          'Los Angeles Terminal': 92,
          'Atlanta Service Hub': 65,
          'Dallas Maintenance': 88,
        },
        monthlyDistribution: {
          '2025-01': 45,
          '2025-02': 52,
          '2025-03': 48,
          '2025-04': 65,
          '2025-05': 72,
          '2025-06': 58,
        },
      }),
      companyId: company.id,
      createdBy: planner.id,
    },
  });

  console.log('✓ Created sample scenario');

  // ==========================================================================
  // LEASE QUALIFICATION ENGINE DATA
  // ==========================================================================

  // Create Customer master records
  const customerRecords = await Promise.all(
    customers.map(async (name, index) => {
      const code = name.replace(/\s+/g, '').substring(0, 4).toUpperCase();
      return prisma.customer.create({
        data: {
          id: uuidv4(),
          name,
          code,
          contactName: `Contact for ${name}`,
          contactEmail: `contact@${code.toLowerCase()}.com`,
          contactPhone: `(555) ${100 + index}-${1000 + index}`,
          address: `${100 + index} Industrial Blvd, Houston, TX`,
          isActive: true,
          companyId: company.id,
        },
      });
    })
  );

  console.log(`✓ Created ${customerRecords.length} customer records`);

  // Create Lease Contracts (upcoming releases within 6 months)
  const now = new Date();
  const leaseContracts = [];

  // Create 40 lease contracts expiring over the next 6 months
  for (let i = 0; i < 40; i++) {
    const car = cars[i]; // Use first 40 cars
    const customer = customerRecords[i % customerRecords.length];

    // Random end date within 1-180 days from now
    const daysUntilEnd = Math.floor(Math.random() * 180) + 1;
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + daysUntilEnd);

    // Start date was 1-3 years ago
    const startDate = new Date(now);
    startDate.setFullYear(startDate.getFullYear() - (1 + Math.floor(Math.random() * 2)));

    // 30% have next customer (immediate reassignment)
    const hasNextCustomer = Math.random() < 0.3;
    const nextCustomer = hasNextCustomer
      ? customerRecords[(i + 3) % customerRecords.length]
      : null;

    const contract = await prisma.leaseContract.create({
      data: {
        id: uuidv4(),
        carId: car.id,
        customerId: customer.id,
        contractNumber: `LC-${2024}-${String(1000 + i)}`,
        startDate,
        endDate,
        status: daysUntilEnd <= 30 ? 'pending_release' : 'active',
        commodity: commodities[i % commodities.length],
        releaseReason: ['qualification', 'assignment', 'return'][i % 3],
        nextCustomerId: nextCustomer?.id || null,
        isReleaseConfirmed: false,
        companyId: company.id,
      },
    });

    leaseContracts.push(contract);
  }

  console.log(`✓ Created ${leaseContracts.length} lease contracts`);

  // Create some S&OP capacity slots for shops (next 6 months)
  const capacityMonths = [];
  for (let i = 0; i < 6; i++) {
    const monthDate = new Date(now);
    monthDate.setMonth(monthDate.getMonth() + i);
    const year = monthDate.getFullYear();
    const month = (monthDate.getMonth() + 1).toString().padStart(2, '0');
    capacityMonths.push(`${year}-${month}`);
  }

  let capacitySlotCount = 0;
  for (const shop of shops.slice(0, 10)) {
    for (const monthKey of capacityMonths) {
      // Qualification slots
      await prisma.shopCapacitySlot.upsert({
        where: {
          shopId_monthKey_slotType: {
            shopId: shop.id,
            monthKey,
            slotType: 'qualification',
          },
        },
        update: {
          capacity: shop.capacity,
          used: Math.floor(Math.random() * shop.capacity * 0.3),
        },
        create: {
          id: uuidv4(),
          shopId: shop.id,
          monthKey,
          slotType: 'qualification',
          capacity: shop.capacity,
          used: Math.floor(Math.random() * shop.capacity * 0.3),
        },
      });

      // Assignment slots
      await prisma.shopCapacitySlot.upsert({
        where: {
          shopId_monthKey_slotType: {
            shopId: shop.id,
            monthKey,
            slotType: 'assignment',
          },
        },
        update: {
          capacity: Math.floor(shop.capacity * 0.8),
          used: Math.floor(Math.random() * shop.capacity * 0.2),
        },
        create: {
          id: uuidv4(),
          shopId: shop.id,
          monthKey,
          slotType: 'assignment',
          capacity: Math.floor(shop.capacity * 0.8),
          used: Math.floor(Math.random() * shop.capacity * 0.2),
        },
      });

      // Repair slots
      await prisma.shopCapacitySlot.upsert({
        where: {
          shopId_monthKey_slotType: {
            shopId: shop.id,
            monthKey,
            slotType: 'repair',
          },
        },
        update: {
          capacity: Math.floor(shop.capacity * 0.4),
          used: Math.floor(Math.random() * shop.capacity * 0.1),
        },
        create: {
          id: uuidv4(),
          shopId: shop.id,
          monthKey,
          slotType: 'repair',
          capacity: Math.floor(shop.capacity * 0.4),
          used: Math.floor(Math.random() * shop.capacity * 0.1),
        },
      });

      capacitySlotCount += 3;
    }
  }

  console.log(`✓ Created ${capacitySlotCount} shop capacity slots`);

  // ==========================================================================
  // MASTER PLAN SEED DATA
  // ==========================================================================
  // Create an approved MasterPlan with 3 sample commitments
  // This demonstrates the MasterPlan workflow for the planning team

  // Get the first 3 cars, shops, and customers for the sample commitments
  const sampleCars = cars.slice(0, 3);
  const sampleShops = shops.slice(0, 3);
  const sampleCustomers = customerRecords.slice(0, 3);

  // Define the plan period (next fiscal year)
  const currentYear = new Date().getFullYear();
  const planFiscalYear = currentYear + 1;
  const planValidFrom = new Date(`${planFiscalYear}-01-01T00:00:00Z`);
  const planValidTo = new Date(`${planFiscalYear}-12-31T23:59:59Z`);

  // Create the MasterPlan
  const masterPlan = await prisma.masterPlan.create({
    data: {
      id: uuidv4(),
      companyId: company.id,
      planName: `${planFiscalYear} Qualification Plan – Final v1`,
      fiscalYear: planFiscalYear,
      version: 1,
      status: 'approved', // Approved but not yet active
      baseScenarioId: scenario.id, // Link to the sample scenario created earlier
      approvedAt: new Date(),
      approvedById: admin.id,
      validFrom: planValidFrom,
      validTo: planValidTo,
    },
  });

  console.log(`✓ Created MasterPlan: ${masterPlan.planName}`);

  // Create 3 sample MasterPlanCommitments
  // These represent committed shop visits for specific cars
  const commitmentData = [
    {
      carIndex: 0,
      shopIndex: 0,
      customerIndex: 0,
      scheduledMonth: `${planFiscalYear}-03`,
      workTypes: ['qualification'],
      priority: 2, // HIGH
      estimatedCost: 18500,
      notes: 'Annual tank qualification due - priority customer',
    },
    {
      carIndex: 1,
      shopIndex: 1,
      customerIndex: 1,
      scheduledMonth: `${planFiscalYear}-04`,
      workTypes: ['qualification', 'repair'],
      priority: 3, // MEDIUM
      estimatedCost: 25000,
      notes: 'Bundled qualification and minor repair work',
    },
    {
      carIndex: 2,
      shopIndex: 2,
      customerIndex: 2,
      scheduledMonth: `${planFiscalYear}-06`,
      workTypes: ['assignment'],
      priority: 4, // LOW
      estimatedCost: 12000,
      notes: 'Assignment work for lease transition',
    },
  ];

  for (const data of commitmentData) {
    const car = sampleCars[data.carIndex];
    const shop = sampleShops[data.shopIndex];
    const customer = sampleCustomers[data.customerIndex];

    // Calculate planned dates within the scheduled month
    const [year, month] = data.scheduledMonth.split('-').map(Number);
    const plannedArrival = new Date(year, month - 1, 5); // 5th of the month
    const plannedRelease = new Date(year, month - 1, 19); // 19th of the month (14 days later)

    await prisma.masterPlanCommitment.create({
      data: {
        id: uuidv4(),
        masterPlanId: masterPlan.id,
        carId: car.id,
        shopId: shop.id,
        customerId: customer.id,
        scheduledMonth: data.scheduledMonth,
        plannedArrival,
        plannedRelease,
        workTypes: JSON.stringify(data.workTypes),
        isBundled: data.workTypes.length > 1,
        estimatedCost: data.estimatedCost,
        priority: data.priority,
        status: 'committed',
        notes: data.notes,
      },
    });
  }

  console.log(`✓ Created 3 MasterPlanCommitments for ${masterPlan.planName}`);

  console.log('\n🎉 Seed completed successfully!');
  console.log('\nLogin credentials:');
  console.log('  Admin: admin@aitx.com / password123');
  console.log('  Planner: planner@aitx.com / password123');
  console.log('  Viewer: viewer@aitx.com / password123');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
