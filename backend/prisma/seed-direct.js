// Direct seed script using better-sqlite3 (bypasses Prisma CLI requirements)
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'dev.db');
const CSV_FILE_PATH = path.join(__dirname, 'Qual Planner Master.csv');

console.log('Opening database at:', DB_PATH);
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

// Helper function to normalize header names
function normalizeHeader(header) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Helper function to parse CSV
function parseCSV(content) {
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return [];

  const headerLine = lines[0].replace(/^\uFEFF/, '');
  const rawHeaders = headerLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''));

  console.log('   CSV Headers found:', rawHeaders.slice(0, 8).join(', '), '...');

  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const values = [];
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

    const record = {};
    rawHeaders.forEach((header, index) => {
      record[header] = values[index] || '';
      record[normalizeHeader(header)] = values[index] || '';
    });

    records.push(record);
  }

  return records;
}

// Helper to parse date
function parseDate(dateStr) {
  if (!dateStr || dateStr.trim() === '') return null;
  const cleaned = dateStr.trim();

  const mdyMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdyMatch) {
    const month = parseInt(mdyMatch[1]) - 1;
    const day = parseInt(mdyMatch[2]);
    let year = parseInt(mdyMatch[3]);
    if (year < 100) year += 2000;
    return new Date(year, month, day).toISOString();
  }

  const isoMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3])).toISOString();
  }

  const parsed = Date.parse(cleaned);
  if (!isNaN(parsed)) {
    return new Date(parsed).toISOString();
  }

  return null;
}

// Helper to parse boolean
function parseBoolean(value) {
  if (!value) return 0;
  const v = value.toLowerCase().trim();
  return (v === 'yes' || v === 'y' || v === 'true' || v === '1') ? 1 : 0;
}

// Shop data
const shopData = [
  { name: 'AITX Maumee', code: 'MAUM', city: 'Maumee', state: 'OH', region: 'Midwest', network: 'AITX-Own', certifications: 'Qualification, Heavy Repair', annualCapacity: 1200, turnTime: 85, contact: 'Mike Thompson (419) 555-1234', notes: 'Primary Midwest hub' },
  { name: 'AITX East Chicago', code: 'ECHI', city: 'East Chicago', state: 'IN', region: 'Midwest', network: 'AITX-Own', certifications: 'Qualification, Heavy Repair, Lining', annualCapacity: 1400, turnTime: 80, contact: 'Dave Wilson (219) 555-2345', notes: 'Full service facility' },
  { name: 'AITX Coffeyville', code: 'COFF', city: 'Coffeyville', state: 'KS', region: 'Midwest', network: 'AITX-Own', certifications: 'Qualification, Heavy Repair', annualCapacity: 900, turnTime: 90, contact: 'Jim Baker (620) 555-3456', notes: '' },
  { name: 'Watco Coffeyville', code: 'WATC', city: 'Coffeyville', state: 'KS', region: 'Midwest', network: '3rd Party', certifications: 'Heavy Repair', annualCapacity: 800, turnTime: 95, contact: 'Steve Morris (620) 555-4567', notes: 'Watco partnership' },
  { name: 'Mid-America Railcar', code: 'MARC', city: 'Kansas City', state: 'MO', region: 'Midwest', network: '3rd Party', certifications: 'Qualification, Heavy Repair', annualCapacity: 1000, turnTime: 88, contact: 'Tom Anderson (816) 555-5678', notes: '' },
  { name: 'GATX Danville', code: 'GATX', city: 'Danville', state: 'IL', region: 'Midwest', network: '3rd Party', certifications: 'Qualification, Heavy Repair, Fabrication', annualCapacity: 1600, turnTime: 75, contact: 'Robert Lee (217) 555-6789', notes: 'High capacity facility' },
  { name: 'AITX Texarkana', code: 'TXRK', city: 'Texarkana', state: 'TX', region: 'South', network: 'AITX-Own', certifications: 'Qualification, Heavy Repair', annualCapacity: 1100, turnTime: 85, contact: 'Carlos Rodriguez (903) 555-7890', notes: '' },
  { name: 'AITX Longview', code: 'LONG', city: 'Longview', state: 'TX', region: 'South', network: 'AITX-Own', certifications: 'Qualification, Lining', annualCapacity: 950, turnTime: 90, contact: 'Mark Johnson (903) 555-8901', notes: 'Lining specialist' },
  { name: 'AITX Bossier City', code: 'BOSS', city: 'Bossier City', state: 'LA', region: 'South', network: 'AITX-Own', certifications: 'Qualification, Heavy Repair', annualCapacity: 850, turnTime: 92, contact: 'Paul Davis (318) 555-9012', notes: '' },
  { name: 'Ennis Railcar', code: 'ENNS', city: 'Ennis', state: 'TX', region: 'South', network: '3rd Party', certifications: 'Heavy Repair', annualCapacity: 700, turnTime: 95, contact: 'John Smith (972) 555-0123', notes: '' },
  { name: 'RSI Rail Group', code: 'RSI', city: 'Longview', state: 'TX', region: 'South', network: '3rd Party', certifications: 'Qualification, Heavy Repair, Fabrication', annualCapacity: 1300, turnTime: 82, contact: 'Brian Taylor (903) 555-1235', notes: 'Full fabrication capabilities' },
  { name: 'AITX Eagle', code: 'EAGL', city: 'Eagle Pass', state: 'TX', region: 'Gulf', network: 'AITX-Own', certifications: 'Qualification, Heavy Repair', annualCapacity: 1000, turnTime: 88, contact: 'Miguel Santos (830) 555-2346', notes: 'Border location' },
  { name: 'Rescar Houston', code: 'RHOU', city: 'Houston', state: 'TX', region: 'Gulf', network: '3rd Party', certifications: 'Qualification, Heavy Repair, Lining', annualCapacity: 1500, turnTime: 78, contact: 'Greg Harris (713) 555-3457', notes: 'Major Gulf hub' },
  { name: 'TankCar Services', code: 'TANK', city: 'Beaumont', state: 'TX', region: 'Gulf', network: '3rd Party', certifications: 'Qualification, Heavy Repair, Lining', annualCapacity: 1100, turnTime: 85, contact: 'Larry White (409) 555-4568', notes: 'Tank car specialist' },
  { name: 'Union Tank Repair', code: 'UTCR', city: 'Lake Charles', state: 'LA', region: 'Gulf', network: '3rd Party', certifications: 'Qualification, Heavy Repair', annualCapacity: 900, turnTime: 90, contact: 'Chris Martin (337) 555-5679', notes: '' },
  { name: 'UTLX Alexandria', code: 'UTLX', city: 'Alexandria', state: 'LA', region: 'Gulf', network: '3rd Party', certifications: 'Qualification, Heavy Repair, Fabrication', annualCapacity: 1200, turnTime: 82, contact: 'James Brown (318) 555-6780', notes: '' },
  { name: 'Midland Rail Services', code: 'MDLD', city: 'Midland', state: 'PA', region: 'Northeast', network: '3rd Party', certifications: 'Qualification, Heavy Repair', annualCapacity: 1000, turnTime: 88, contact: 'Frank Miller (412) 555-7891', notes: '' },
  { name: 'GBW Rail Services', code: 'GBW', city: 'Hornell', state: 'NY', region: 'Northeast', network: '3rd Party', certifications: 'Qualification, Heavy Repair, Fabrication', annualCapacity: 1100, turnTime: 85, contact: 'Dan Clark (607) 555-8902', notes: '' },
  { name: 'National Steel Car', code: 'NSC', city: 'Hamilton', state: 'ON', region: 'Northeast', network: '3rd Party', certifications: 'Qualification, Heavy Repair, Fabrication', annualCapacity: 1400, turnTime: 80, contact: 'Andrew Scott (905) 555-9013', notes: 'Canada location' },
  { name: 'Procor Sarnia', code: 'PROC', city: 'Sarnia', state: 'ON', region: 'Northeast', network: '3rd Party', certifications: 'Qualification, Heavy Repair', annualCapacity: 950, turnTime: 90, contact: 'Kevin Moore (519) 555-0124', notes: 'Canada location' },
  { name: 'Vulcan Rail Services', code: 'VULC', city: 'Los Angeles', state: 'CA', region: 'West', network: '3rd Party', certifications: 'Qualification, Heavy Repair', annualCapacity: 1000, turnTime: 88, contact: 'Tony Garcia (213) 555-1236', notes: 'West coast hub' },
  { name: 'Frontier Railcar', code: 'FRNT', city: 'Salt Lake City', state: 'UT', region: 'West', network: '3rd Party', certifications: 'Heavy Repair', annualCapacity: 750, turnTime: 95, contact: 'Bill Jackson (801) 555-2347', notes: '' },
  { name: 'CF Rail', code: 'CFR', city: 'Denver', state: 'CO', region: 'West', network: '3rd Party', certifications: 'Qualification, Heavy Repair', annualCapacity: 850, turnTime: 92, contact: 'Rick Nelson (303) 555-3458', notes: '' },
  { name: 'Apex Rail', code: 'APEX', city: 'Phoenix', state: 'AZ', region: 'West', network: '3rd Party', certifications: 'Heavy Repair', annualCapacity: 600, turnTime: 100, contact: 'Sam Adams (602) 555-4569', notes: '' },
  { name: 'Nortrak Services', code: 'NORT', city: 'Seattle', state: 'WA', region: 'West', network: '3rd Party', certifications: 'Qualification, Heavy Repair', annualCapacity: 800, turnTime: 92, contact: 'Eric Young (206) 555-5670', notes: 'Pacific Northwest' },
];

const carTypes = ['Tank Car', 'Covered Hopper', 'Open Hopper', 'Boxcar', 'Gondola', 'Flatcar', 'Intermodal'];
const commodities = ['Crude Oil', 'Ethanol', 'Corn', 'Wheat', 'Coal', 'Lumber', 'Steel', 'Chemicals', 'Fertilizer', 'Plastics'];
const customers = ['Shell', 'Cargill', 'ADM', 'Koch Industries', 'ExxonMobil', 'Chevron', 'BNSF Logistics', 'UP Fleet', 'CSX Transport', 'CN Rail'];
const regions = ['Midwest', 'South', 'Gulf', 'Northeast', 'West'];
const locations = ['Chicago, IL', 'Houston, TX', 'Los Angeles, CA', 'Atlanta, GA', 'Denver, CO', 'Kansas City, MO', 'New Orleans, LA', 'Seattle, WA'];

async function main() {
  console.log('Starting seed...');

  // Clear existing data
  const tablesToClear = [
    'QualificationPlanDocument', 'QualificationPlanAssignment', 'QualificationScenario',
    'QualificationPlanEvent', 'LeaseQualificationEntry', 'LeaseContract',
    'SOPAssignment', 'ShopCapacitySlot', 'CarShopEligibility',
    'ScenarioModification', 'ScenarioCar', 'Scenario',
    'PlanAssignment', 'Plan', 'Car', 'Shop', 'ShopRule', 'Customer', 'User', 'Company'
  ];

  for (const table of tablesToClear) {
    try {
      db.exec(`DELETE FROM ${table}`);
    } catch (e) {
      // Table might not exist
    }
  }
  console.log('Cleared existing data');

  // Create company
  const companyId = uuidv4();
  db.prepare(`INSERT INTO Company (id, name, code) VALUES (?, ?, ?)`).run(companyId, 'AITX Rail Services', 'AITX');
  console.log('Created company: AITX Rail Services');

  // Create users
  const adminPassword = bcrypt.hashSync('password123', 10);
  const adminId = uuidv4();
  const plannerId = uuidv4();
  const viewerId = uuidv4();

  db.prepare(`INSERT INTO User (id, email, password, firstName, lastName, role, companyId) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(adminId, 'admin@aitx.com', adminPassword, 'Admin', 'User', 'admin', companyId);
  db.prepare(`INSERT INTO User (id, email, password, firstName, lastName, role, companyId) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(plannerId, 'planner@aitx.com', adminPassword, 'Sarah', 'Johnson', 'planner', companyId);
  db.prepare(`INSERT INTO User (id, email, password, firstName, lastName, role, companyId) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(viewerId, 'viewer@aitx.com', adminPassword, 'Mike', 'Williams', 'viewer', companyId);
  console.log('Created users: admin, planner, viewer');

  // Create shops
  const insertShop = db.prepare(`
    INSERT INTO Shop (id, name, code, location, city, state, region, network, isAitxInternal, tankQualified, networkTier, shopStatus, capacity, baseCostPerCar, laborRate, costIndex, baseTurnTime, certifications, contactName, contactPhone, notes, isActive, companyId)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const shopIds = [];
  for (let i = 0; i < shopData.length; i++) {
    const shop = shopData[i];
    const shopId = uuidv4();
    const monthlyCapacity = Math.ceil(shop.annualCapacity / 12);
    const isAitx = shop.network === 'AITX-Own' ? 1 : 0;
    const tankQualified = shop.certifications.includes('Qualification') ? 1 : 0;
    const networkTier = isAitx ? 1 : Math.min(2 + Math.floor(i / 5), 5);
    const contactName = shop.contact.split(' (')[0];
    const contactPhone = shop.contact.includes('(') ? shop.contact.match(/\([\d\)\s-]+/)?.[0]?.replace(/[()]/g, '') || '' : '';

    insertShop.run(
      shopId, shop.name, shop.code, `${shop.city}, ${shop.state}`, shop.city, shop.state, shop.region, shop.network,
      isAitx, tankQualified, networkTier, 'active', monthlyCapacity, isAitx ? 20685 : 15000,
      isAitx ? 95 : 75, isAitx ? 1.379 : 1.0, shop.turnTime, JSON.stringify(shop.certifications.split(', ')),
      contactName, contactPhone, shop.notes, 1, companyId
    );
    shopIds.push({ id: shopId, ...shop, tankQualified: tankQualified === 1 });
  }
  console.log(`Created ${shopIds.length} shops`);

  // Create railcars
  const insertCar = db.prepare(`
    INSERT INTO Car (id, railcarNumber, carType, isTankCar, commodity, customer, projectNumber, reasonsShopped, status, currentLocation, homeRegion, originRegion, projectedCost, daysInShop, notes, contractNumber, contractExpiration, isJacketed, isLined, buildYear, qualificationType, tankQualified, tankQualDueDate, performScheduled, planStatus, companyId)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const cars = [];
  let csvRecords = [];

  // Try to load from CSV
  if (fs.existsSync(CSV_FILE_PATH)) {
    console.log(`Loading cars from CSV: ${CSV_FILE_PATH}`);
    const csvContent = fs.readFileSync(CSV_FILE_PATH, 'utf-8');
    csvRecords = parseCSV(csvContent);
    console.log(`   Found ${csvRecords.length} records in CSV`);

    if (csvRecords.length > 0) {
      console.log('   First record keys:', Object.keys(csvRecords[0]).slice(0, 15).join(', '));
    }

    for (let i = 0; i < csvRecords.length; i++) {
      const record = csvRecords[i];

      // Map CSV columns - using actual CSV headers from user's file
      // Actual headers: Lessee Name, Car Mark, FMS Lessee Number, Contract, Contract Expiration, etc.
      // Also try original expected headers: Car Init, Car No, etc.

      // Get railcar number - try "Car Mark" (full number) or combine "Car Init" + "Car No"
      let railcarNumber = record['carmark'] || record['Car Mark'] || '';
      if (!railcarNumber) {
        const carInit = record['carinit'] || record['Car Init'] || '';
        const carNo = record['carno'] || record['Car No'] || '';
        railcarNumber = carInit && carNo ? `${carInit}${carNo}` : carNo;
      }
      if (!railcarNumber) {
        railcarNumber = `AITX${String(10000 + i)}`;
      }

      const carType = record['cartype'] || record['Car Type'] || record['cartypelevel2'] || record['Car Type Level 2'] || 'Tank Car';
      const isTankCar = carType.toLowerCase().includes('tank') ? 1 : 0;
      const commodity = record['commodity'] || record['Commodity'] || record['primarycommodity'] || record['Primary Commodity'] || '';
      const customer = record['lesseename'] || record['Lessee Name'] || record['lessee'] || record['Lessee'] || '';
      const contractNumber = record['contract'] || record['Contract'] || record['contract'] || record['Contract #'] || '';
      const contractExpiration = parseDate(record['contractexpiration'] || record['Contract Expiration'] || record['contexp'] || record['Cont Exp'] || '');
      const isJacketed = parseBoolean(record['jacketed'] || record['Jacketed?'] || '');
      const isLined = parseBoolean(record['lined'] || record['Lined?'] || '');
      const buildYear = parseInt(record['buildyr'] || record['Build Yr'] || record['buildyear'] || record['Build Year'] || '') || null;
      const qualificationType = record['qualtype'] || record['Qual Type'] || record['fullpartialqual'] || record['Full/Partial Qual'] || '';
      const tankQualified = parseBoolean(record['tankqual'] || record['Tank Qual'] || record['tankqualified'] || record['Tank Qualified'] || '');
      const tankQualDueDate = parseDate(record['tankqualdue'] || record['Tank Qual Due'] || record['tankqualduedate'] || record['Tank Qual Due Date'] || '');
      const performScheduled = parseBoolean(record['perfsched'] || record['Perf Sched'] || record['performscheduled'] || record['Perform Scheduled'] || '');
      const planStatus = record['planstatus'] || record['Plan Status'] || '';

      const region = regions[Math.floor(Math.random() * regions.length)];
      const status = 'available';
      const carId = uuidv4();

      insertCar.run(
        carId, railcarNumber, carType, isTankCar, commodity, customer, '',
        isTankCar && tankQualDueDate ? 'qualification' : '', status,
        locations[Math.floor(Math.random() * locations.length)], region, region,
        0, 0, '', contractNumber, contractExpiration, isJacketed ? 1 : 0, isLined ? 1 : 0,
        buildYear, qualificationType, tankQualified ? 1 : 0, tankQualDueDate,
        performScheduled ? 1 : 0, planStatus, companyId
      );
      cars.push({ id: carId, railcarNumber, isTankCar: isTankCar === 1, homeRegion: region });

      if ((i + 1) % 500 === 0) {
        console.log(`  ... imported ${i + 1}/${csvRecords.length} railcars from CSV`);
      }
    }
    console.log(`Imported ${cars.length} railcars from CSV`);
  } else {
    console.log(`CSV file not found at ${CSV_FILE_PATH}, generating random data...`);

    for (let i = 0; i < 200; i++) {
      const carType = carTypes[Math.floor(Math.random() * carTypes.length)];
      const isTankCar = carType === 'Tank Car' ? 1 : 0;
      const commodity = commodities[Math.floor(Math.random() * commodities.length)];
      const customer = customers[Math.floor(Math.random() * customers.length)];
      const region = regions[Math.floor(Math.random() * regions.length)];
      const buildYear = 1990 + Math.floor(Math.random() * 35);
      const isJacketed = isTankCar && Math.random() > 0.5 ? 1 : 0;
      const isLined = isTankCar && Math.random() > 0.6 ? 1 : 0;
      const tankQualified = isTankCar && Math.random() > 0.2 ? 1 : 0;

      let tankQualDueDate = null;
      if (isTankCar) {
        const qualRand = Math.random();
        if (qualRand < 0.2) {
          tankQualDueDate = new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000).toISOString();
        } else if (qualRand < 0.5) {
          tankQualDueDate = new Date(Date.now() + Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString();
        } else {
          tankQualDueDate = new Date(Date.now() + (90 + Math.random() * 275) * 24 * 60 * 60 * 1000).toISOString();
        }
      }

      const contractExpiration = new Date(Date.now() + Math.random() * 730 * 24 * 60 * 60 * 1000).toISOString();
      const carId = uuidv4();

      insertCar.run(
        carId, `AITX${String(100000 + i).slice(1)}`, carType, isTankCar, commodity, customer,
        `PRJ-${2024}-${String(1000 + Math.floor(Math.random() * 9000))}`,
        ['release', 'assignment', 'qualification', 'project', 'repair', 'maintenance'][Math.floor(Math.random() * 6)],
        'available', locations[Math.floor(Math.random() * locations.length)], region, region,
        12000 + Math.floor(Math.random() * 10000), 0, Math.random() > 0.7 ? 'Priority service required' : '',
        `CTR-${2024}-${String(10000 + i)}`, contractExpiration, isJacketed, isLined, buildYear,
        ['full', 'partial', ''][Math.floor(Math.random() * 3)], tankQualified, tankQualDueDate,
        Math.random() > 0.7 ? 1 : 0, ['planned', 'in_progress', 'completed', 'pending', ''][Math.floor(Math.random() * 5)],
        companyId
      );
      cars.push({ id: carId, railcarNumber: `AITX${String(100000 + i).slice(1)}`, isTankCar: isTankCar === 1, homeRegion: region });

      if ((i + 1) % 50 === 0) {
        console.log(`  ... created ${i + 1}/200 railcars`);
      }
    }
    console.log(`Created ${cars.length} railcars (random data)`);
  }

  // Skip creating car-shop eligibility records for now (too slow)
  console.log('Skipping shop eligibility records (performance optimization)');

  // Create plans
  const plan2024Id = uuidv4();
  const plan2025Id = uuidv4();

  db.prepare(`INSERT INTO Plan (id, name, description, startDate, endDate, status, companyId, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(plan2024Id, '2024 Service Plan', 'Annual service schedule for 2024 fleet maintenance', '2024-01-01T00:00:00Z', '2024-12-31T00:00:00Z', 'active', companyId, plannerId);
  db.prepare(`INSERT INTO Plan (id, name, description, startDate, endDate, status, companyId, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(plan2025Id, '2025 Service Plan', 'Projected service schedule for 2025', '2025-01-01T00:00:00Z', '2025-12-31T00:00:00Z', 'draft', companyId, plannerId);
  console.log('Created 2 plans');

  // Create a sample scenario
  const scenarioId = uuidv4();
  db.prepare(`INSERT INTO Scenario (id, projectNumber, name, description, basePlanId, status, results, companyId, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(scenarioId, 'Q2-25-001', 'High Volume Q2 2025', 'What-if analysis for increased service volume in Q2 2025', plan2025Id, 'completed', JSON.stringify({
      totalCost: 2850000,
      costDelta: 5.2,
      averageTurnTime: 14.3,
      turnTimeDelta: -2.1
    }), companyId, plannerId);
  console.log('Created sample scenario');

  // Create customer records
  const insertCustomer = db.prepare(`INSERT INTO Customer (id, name, code, contactName, contactEmail, contactPhone, address, isActive, companyId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const customerIds = [];
  for (let i = 0; i < customers.length; i++) {
    const name = customers[i];
    const code = name.replace(/\s+/g, '').substring(0, 4).toUpperCase();
    const custId = uuidv4();
    insertCustomer.run(custId, name, code, `Contact for ${name}`, `contact@${code.toLowerCase()}.com`, `(555) ${100 + i}-${1000 + i}`, `${100 + i} Industrial Blvd, Houston, TX`, 1, companyId);
    customerIds.push(custId);
  }
  console.log(`Created ${customerIds.length} customer records`);

  // Create some shop capacity slots
  const now = new Date();
  const capacityMonths = [];
  for (let i = 0; i < 6; i++) {
    const monthDate = new Date(now);
    monthDate.setMonth(monthDate.getMonth() + i);
    const year = monthDate.getFullYear();
    const month = (monthDate.getMonth() + 1).toString().padStart(2, '0');
    capacityMonths.push(`${year}-${month}`);
  }

  const insertCapacity = db.prepare(`INSERT OR REPLACE INTO ShopCapacitySlot (id, shopId, monthKey, slotType, capacity, used) VALUES (?, ?, ?, ?, ?, ?)`);
  let capacityCount = 0;
  for (const shop of shopIds.slice(0, 10)) {
    for (const monthKey of capacityMonths) {
      const shopCapacity = Math.ceil(shop.annualCapacity / 12);
      insertCapacity.run(uuidv4(), shop.id, monthKey, 'qualification', shopCapacity, Math.floor(Math.random() * shopCapacity * 0.3));
      insertCapacity.run(uuidv4(), shop.id, monthKey, 'assignment', Math.floor(shopCapacity * 0.8), Math.floor(Math.random() * shopCapacity * 0.2));
      insertCapacity.run(uuidv4(), shop.id, monthKey, 'repair', Math.floor(shopCapacity * 0.4), Math.floor(Math.random() * shopCapacity * 0.1));
      capacityCount += 3;
    }
  }
  console.log(`Created ${capacityCount} shop capacity slots`);

  console.log('\nSeed completed successfully!');
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
  .finally(() => {
    db.close();
  });
