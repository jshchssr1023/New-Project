// Seed script to create sample data from CSV for local development
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const path = require('path');
const fs = require('fs');

const db = new Database(path.join(__dirname, 'prisma/dev.db'));

console.log('Creating Gold Standard tables...');

// Add Gold Standard tables
const goldStandardSchema = `
-- WeeklyCapacity (time-series capacity per shop/week)
CREATE TABLE IF NOT EXISTS WeeklyCapacity (
  id TEXT PRIMARY KEY,
  shopId TEXT NOT NULL,
  weekStartDate TEXT NOT NULL,
  weekKey TEXT NOT NULL,
  qualCapacity INTEGER DEFAULT 0,
  assignCapacity INTEGER DEFAULT 0,
  returnCapacity INTEGER DEFAULT 0,
  repairCapacity INTEGER DEFAULT 0,
  totalCapacity INTEGER DEFAULT 0,
  qualUsed INTEGER DEFAULT 0,
  assignUsed INTEGER DEFAULT 0,
  returnUsed INTEGER DEFAULT 0,
  repairUsed INTEGER DEFAULT 0,
  totalUsed INTEGER DEFAULT 0,
  isLocked INTEGER DEFAULT 0,
  lockedAt TEXT,
  lockedById TEXT,
  notes TEXT DEFAULT '',
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shopId) REFERENCES Shop(id) ON DELETE CASCADE,
  UNIQUE(shopId, weekKey)
);

-- CapacityAudit (inline auditing for capacity changes)
CREATE TABLE IF NOT EXISTS CapacityAudit (
  id TEXT PRIMARY KEY,
  weeklyCapacityId TEXT NOT NULL,
  fieldName TEXT NOT NULL,
  previousValue INTEGER NOT NULL,
  newValue INTEGER NOT NULL,
  justification TEXT NOT NULL,
  changeCategory TEXT NOT NULL,
  changedById TEXT NOT NULL,
  changedByEmail TEXT NOT NULL,
  requiresApproval INTEGER DEFAULT 0,
  approvedById TEXT,
  approvedAt TEXT,
  approvalStatus TEXT DEFAULT 'auto_approved',
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (weeklyCapacityId) REFERENCES WeeklyCapacity(id) ON DELETE CASCADE
);

-- MasterPlanVersion (versioning for master plans)
CREATE TABLE IF NOT EXISTS MasterPlanVersion (
  id TEXT PRIMARY KEY,
  masterPlanId TEXT NOT NULL,
  versionNumber TEXT NOT NULL,
  versionLabel TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',
  isLocked INTEGER DEFAULT 0,
  lockedAt TEXT,
  lockedById TEXT,
  lockedByEmail TEXT DEFAULT '',
  lockReason TEXT DEFAULT '',
  publishedAt TEXT,
  publishedById TEXT,
  publishedByEmail TEXT DEFAULT '',
  planSnapshot TEXT NOT NULL,
  commitmentCount INTEGER DEFAULT 0,
  totalCars INTEGER DEFAULT 0,
  pushedToScheduling INTEGER DEFAULT 0,
  pushedToSchedulingAt TEXT,
  pushResponse TEXT DEFAULT '',
  companyId TEXT NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (companyId) REFERENCES Company(id)
);

-- IntegrationLog (API/webhook monitoring)
CREATE TABLE IF NOT EXISTS IntegrationLog (
  id TEXT PRIMARY KEY,
  integrationType TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT DEFAULT 'POST',
  requestPayload TEXT DEFAULT '{}',
  responseStatus INTEGER DEFAULT 0,
  responseBody TEXT DEFAULT '',
  startedAt TEXT NOT NULL,
  completedAt TEXT,
  durationMs INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  retryCount INTEGER DEFAULT 0,
  maxRetries INTEGER DEFAULT 3,
  errorMessage TEXT DEFAULT '',
  triggerAction TEXT NOT NULL,
  entityType TEXT NOT NULL,
  entityId TEXT NOT NULL,
  triggeredById TEXT,
  triggeredByEmail TEXT DEFAULT '',
  companyId TEXT NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (companyId) REFERENCES Company(id)
);

-- ImportSession (3-step import workflow)
CREATE TABLE IF NOT EXISTS ImportSession (
  id TEXT PRIMARY KEY,
  sessionType TEXT NOT NULL,
  fileName TEXT NOT NULL,
  fileSize INTEGER DEFAULT 0,
  status TEXT DEFAULT 'uploaded',
  currentStep INTEGER DEFAULT 1,
  totalRows INTEGER DEFAULT 0,
  validRows INTEGER DEFAULT 0,
  errorRows INTEGER DEFAULT 0,
  warningRows INTEGER DEFAULT 0,
  validationErrors TEXT DEFAULT '[]',
  validationWarnings TEXT DEFAULT '[]',
  rawData TEXT DEFAULT '',
  detectedHeaders TEXT DEFAULT '[]',
  fieldMappings TEXT DEFAULT '{}',
  unmappedFields TEXT DEFAULT '[]',
  previewData TEXT DEFAULT '[]',
  importedCount INTEGER DEFAULT 0,
  updatedCount INTEGER DEFAULT 0,
  skippedCount INTEGER DEFAULT 0,
  errorReportPath TEXT DEFAULT '',
  uploadedById TEXT NOT NULL,
  uploadedByEmail TEXT NOT NULL,
  validatedAt TEXT,
  mappedAt TEXT,
  confirmedAt TEXT,
  completedAt TEXT,
  companyId TEXT NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (companyId) REFERENCES Company(id)
);

-- AllocationOverride (user allocation override records)
CREATE TABLE IF NOT EXISTS AllocationOverride (
  id TEXT PRIMARY KEY,
  shopId TEXT NOT NULL,
  weekKey TEXT NOT NULL,
  workType TEXT NOT NULL,
  originalValue INTEGER NOT NULL,
  overrideValue INTEGER NOT NULL,
  justification TEXT NOT NULL,
  overrideReason TEXT NOT NULL,
  relatedCarIds TEXT DEFAULT '[]',
  carCount INTEGER DEFAULT 0,
  status TEXT DEFAULT 'applied',
  appliedAt TEXT,
  overriddenById TEXT NOT NULL,
  overriddenByEmail TEXT NOT NULL,
  requiresApproval INTEGER DEFAULT 0,
  approvalStatus TEXT DEFAULT 'auto_approved',
  approvedById TEXT,
  approvedAt TEXT,
  companyId TEXT NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shopId) REFERENCES Shop(id),
  FOREIGN KEY (companyId) REFERENCES Company(id)
);

-- ShopHistory (shop versioning and soft-deletes)
CREATE TABLE IF NOT EXISTS ShopHistory (
  id TEXT PRIMARY KEY,
  shopId TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  version INTEGER NOT NULL,
  validFrom TEXT NOT NULL,
  validTo TEXT,
  status TEXT DEFAULT 'active',
  changeReason TEXT DEFAULT '',
  previousShopId TEXT,
  successorShopId TEXT,
  changedById TEXT,
  changedByEmail TEXT DEFAULT '',
  companyId TEXT NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shopId) REFERENCES Shop(id),
  FOREIGN KEY (companyId) REFERENCES Company(id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_weeklycapacity_shop ON WeeklyCapacity(shopId, weekKey);
CREATE INDEX IF NOT EXISTS idx_capacityaudit_wc ON CapacityAudit(weeklyCapacityId);
CREATE INDEX IF NOT EXISTS idx_mpversion_plan ON MasterPlanVersion(masterPlanId, status);
CREATE INDEX IF NOT EXISTS idx_integrationlog_company ON IntegrationLog(companyId, status);
CREATE INDEX IF NOT EXISTS idx_importsession_company ON ImportSession(companyId, status);
CREATE INDEX IF NOT EXISTS idx_allocationoverride_shop ON AllocationOverride(shopId, weekKey);
CREATE INDEX IF NOT EXISTS idx_shophistory_shop ON ShopHistory(shopId, validFrom);
`;

const statements = goldStandardSchema.split(';').filter(s => s.trim());
for (const stmt of statements) {
  if (stmt.trim()) {
    try {
      db.exec(stmt + ';');
    } catch (err) {
      // Table might already exist, that's ok
    }
  }
}

console.log('Gold Standard tables ready!');
console.log('');
console.log('Creating sample data...');

// Check if company already exists
const existingCompany = db.prepare('SELECT id FROM Company WHERE code = ?').get('AITX');
let companyId;

if (existingCompany) {
  companyId = existingCompany.id;
  console.log('Company already exists, using existing data');
} else {
  // Create company
  companyId = uuid();
  db.prepare('INSERT INTO Company (id, name, code) VALUES (?, ?, ?)').run(companyId, 'AITX Demo', 'AITX');
  console.log('Created company: AITX Demo');
}

// Check if admin user exists
const existingUser = db.prepare('SELECT id FROM User WHERE email = ?').get('admin@aitx.com');

if (!existingUser) {
  // Create admin user (password: admin123)
  const userId = uuid();
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO User (id, email, password, firstName, lastName, role, companyId) VALUES (?, ?, ?, ?, ?, ?, ?)').run(userId, 'admin@aitx.com', hashedPassword, 'Admin', 'User', 'admin', companyId);
  console.log('Created admin user: admin@aitx.com / admin123');
} else {
  console.log('Admin user already exists');
}

// Check if shops exist
const existingShops = db.prepare('SELECT COUNT(*) as count FROM Shop WHERE companyId = ?').get(companyId);

if (existingShops.count === 0) {
  // Create shops from CSV column headers (these are the actual shop names)
  const shops = [
    { name: 'AITX Fleet Services of Canada Inc.', code: 'AITX-SARNIA', location: 'Sarnia, ON', city: 'Sarnia', state: 'ON', region: 'Canada', network: 'AITX', capacity: 50, isAitxInternal: 1 },
    { name: 'AITX Railcar Services LLC', code: 'AITX-NKC', location: 'N Kansas City, MO', city: 'N Kansas City', state: 'MO', region: 'Midwest', network: 'AITX', capacity: 75, isAitxInternal: 1 },
    { name: 'AITX Mini/Mobile Unit 93', code: 'AITX-MOUNDS', location: 'Mounds, OK', city: 'Mounds', state: 'OK', region: 'Southwest', network: 'AITX', capacity: 30, isAitxInternal: 1 },
    { name: 'AITX Mobile Headquarters', code: 'AITX-LAPORTE', location: 'LaPorte, TX', city: 'LaPorte', state: 'TX', region: 'Southwest', network: 'AITX', capacity: 40, isAitxInternal: 1 },
    { name: 'AITX Mobile Operations', code: 'AITX-HOUSTON', location: 'Houston, TX', city: 'Houston', state: 'TX', region: 'Southwest', network: 'AITX', capacity: 60, isAitxInternal: 1 },
    { name: 'AITX Railcar Services LLC (Brookhaven)', code: 'AITX-BROOK', location: 'Brookhaven, MS', city: 'Brookhaven', state: 'MS', region: 'Southeast', network: 'AITX', capacity: 45, isAitxInternal: 1 },
    { name: 'AITX Railcar Services LLC (Bude)', code: 'AITX-BUDE', location: 'Bude, MS', city: 'Bude', state: 'MS', region: 'Southeast', network: 'AITX', capacity: 35, isAitxInternal: 1 },
    { name: 'AITX Railcar Services LLC (Longview)', code: 'AITX-LONG', location: 'Longview, TX', city: 'Longview', state: 'TX', region: 'Southwest', network: 'AITX', capacity: 55, isAitxInternal: 1 },
    { name: 'AITX Railcar Services LLC (Tennille)', code: 'AITX-TENN', location: 'Tennille, GA', city: 'Tennille', state: 'GA', region: 'Southeast', network: 'AITX', capacity: 40, isAitxInternal: 1 },
    { name: 'Eagle Railcar (Channelview)', code: 'EAGLE-CHAN', location: 'Channelview, TX', city: 'Channelview', state: 'TX', region: 'Southwest', network: 'Eagle', capacity: 80, isAitxInternal: 0 },
    { name: 'Eagle Railcar (Elkhart)', code: 'EAGLE-ELK', location: 'Elkhart, IN', city: 'Elkhart', state: 'IN', region: 'Midwest', network: 'Eagle', capacity: 70, isAitxInternal: 0 },
    { name: 'Trinity Industries Inc.', code: 'TRINITY-FW', location: 'Ft. Worth, TX', city: 'Ft. Worth', state: 'TX', region: 'Southwest', network: 'Trinity', capacity: 100, isAitxInternal: 0 },
    { name: 'Greenbrier Repair & Services (Cleburne)', code: 'GREEN-CLEB', location: 'Cleburne, TX', city: 'Cleburne', state: 'TX', region: 'Southwest', network: 'Greenbrier', capacity: 65, isAitxInternal: 0 },
    { name: 'Procor Limited (Sarnia)', code: 'PROCOR-SAR', location: 'Sarnia, ON', city: 'Sarnia', state: 'ON', region: 'Canada', network: 'Procor', capacity: 50, isAitxInternal: 0 },
    { name: 'Cathcart Rail - Kansas City', code: 'CATH-KC', location: 'Kansas City, MO', city: 'Kansas City', state: 'MO', region: 'Midwest', network: 'Cathcart', capacity: 45, isAitxInternal: 0 },
  ];

  shops.forEach(shop => {
    db.prepare('INSERT INTO Shop (id, name, code, location, city, state, region, network, capacity, isAitxInternal, tankQualified, companyId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      uuid(), shop.name, shop.code, shop.location, shop.city, shop.state, shop.region, shop.network, shop.capacity, shop.isAitxInternal, 1, companyId
    );
  });
  console.log('Created 15 shops');
} else {
  console.log('Shops already exist: ' + existingShops.count);
}

// Import cars from CSV
const existingCars = db.prepare('SELECT COUNT(*) as count FROM Car WHERE companyId = ?').get(companyId);

if (existingCars.count === 0) {
  console.log('Importing cars from CSV...');

  const csvPath = path.join(__dirname, 'prisma', 'Qual Planner Master.csv');

  if (!fs.existsSync(csvPath)) {
    console.log('CSV file not found at: ' + csvPath);
    console.log('Creating sample cars instead...');

    // Fallback: create sample cars
    const customers = ['GATX', 'Union Tank Car', 'Trinity Rail', 'Wells Fargo Rail'];
    const carTypes = ['Tank', 'Covered Hopper', 'Gondola', 'Box'];
    const statuses = ['available', 'scheduled', 'in_shop', 'awaiting_parts'];
    const reasons = ['qualification', 'repair', 'inspection', 'return'];

    for (let i = 1; i <= 500; i++) {
      const carNum = 'AITX' + String(100000 + i).padStart(6, '0');
      db.prepare('INSERT INTO Car (id, railcarNumber, carType, isTankCar, customer, status, reasonsShopped, companyId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
        uuid(),
        carNum,
        carTypes[i % carTypes.length],
        carTypes[i % carTypes.length] === 'Tank' ? 1 : 0,
        customers[i % customers.length],
        statuses[i % statuses.length],
        reasons[i % reasons.length],
        companyId
      );
    }
    console.log('Created 500 sample railcars');
  } else {
    // Parse CSV and import first 500 cars
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n');
    const headers = lines[0].split(',');

    // Find column indexes
    const getIndex = (name) => headers.findIndex(h => h.trim().toLowerCase().includes(name.toLowerCase()));

    const lesseeIdx = getIndex('Lessee Name');
    const carMarkIdx = getIndex('Car Mark');
    const contractIdx = getIndex('Contract');
    const contractExpIdx = getIndex('Contract Expiration');
    const commodityIdx = getIndex('Primary Commodity');
    const jacketedIdx = getIndex('Jacketed');
    const linedIdx = getIndex('Lined');
    const carAgeIdx = getIndex('Car Age');
    const carTypeIdx = getIndex('Car Type Level 2');
    const statusIdx = getIndex('Current Status');
    const reasonIdx = getIndex('Reason Shopped');
    const tankQualIdx = getIndex('Perform Tank Qual');
    const planStatusIdx = getIndex('Plan Status');

    console.log('Found columns:', { lesseeIdx, carMarkIdx, contractIdx, commodityIdx, statusIdx, reasonIdx });

    const insertCar = db.prepare(`
      INSERT INTO Car (id, railcarNumber, carType, isTankCar, customer, commodity, status, reasonsShopped,
        contractNumber, contractExpiration, isJacketed, isLined, buildYear, tankQualified, performScheduled, planStatus, companyId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let imported = 0;
    const seenCars = new Set();

    for (let i = 1; i < lines.length && imported < 500; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      // Parse CSV line (handle commas in quoted fields)
      const values = [];
      let current = '';
      let inQuotes = false;
      for (const char of line) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());

      const carMark = values[carMarkIdx] || '';
      if (!carMark || seenCars.has(carMark)) continue;
      seenCars.add(carMark);

      const customer = values[lesseeIdx] || '';
      const contract = values[contractIdx] || '';
      const contractExp = values[contractExpIdx] || '';
      const commodity = values[commodityIdx] || '';
      const jacketed = (values[jacketedIdx] || '').toLowerCase() === 'jacketed' ? 1 : 0;
      const lined = (values[linedIdx] || '').toLowerCase() !== 'unlined' ? 1 : 0;
      const carAge = parseInt(values[carAgeIdx]) || 0;
      const carType = values[carTypeIdx] || 'General Service Tank';
      const currentStatus = values[statusIdx] || 'Active';
      const reason = values[reasonIdx] || '';
      const tankQual = (values[tankQualIdx] || '').toLowerCase() === 'yes' ? 1 : 0;
      const planStatus = values[planStatusIdx] || '';

      // Map status
      let status = 'available';
      if (currentStatus.toLowerCase().includes('complete')) status = 'completed';
      else if (currentStatus.toLowerCase().includes('arrived')) status = 'in_shop';
      else if (currentStatus.toLowerCase().includes('route')) status = 'in_transit';
      else if (currentStatus.toLowerCase().includes('active')) status = 'available';

      // Calculate build year from age
      const buildYear = carAge > 0 ? (2024 - carAge) : null;

      try {
        insertCar.run(
          uuid(),
          carMark,
          carType,
          1, // isTankCar (most are tank cars in this file)
          customer,
          commodity,
          status,
          reason,
          contract,
          contractExp || null,
          jacketed,
          lined,
          buildYear,
          tankQual,
          tankQual,
          planStatus,
          companyId
        );
        imported++;
      } catch (err) {
        // Skip duplicates
      }
    }

    console.log('Imported ' + imported + ' railcars from CSV');
  }
} else {
  console.log('Cars already exist: ' + existingCars.count);
}

// Create some customers
const existingCustomers = db.prepare('SELECT COUNT(*) as count FROM Customer WHERE companyId = ?').get(companyId);

if (existingCustomers.count === 0) {
  const customers = [
    { name: 'ADM Transportation Company', code: 'ADM' },
    { name: 'GATX Corporation', code: 'GATX' },
    { name: 'Union Tank Car Company', code: 'UTLX' },
    { name: 'Trinity Industries', code: 'TILX' },
    { name: 'Wells Fargo Rail', code: 'WFRX' },
    { name: 'CIT Rail', code: 'CITX' },
    { name: 'Dow Chemical', code: 'DOWX' },
    { name: 'BASF Corporation', code: 'BASF' },
    { name: 'Acme-Hardesty Co', code: 'ACME' },
    { name: 'Cargill Inc', code: 'CARG' },
  ];

  customers.forEach(cust => {
    db.prepare('INSERT INTO Customer (id, name, code, isActive, companyId) VALUES (?, ?, ?, ?, ?)').run(
      uuid(), cust.name, cust.code, 1, companyId
    );
  });
  console.log('Created 10 customers');
}

db.close();

console.log('');
console.log('========================================');
console.log('Setup complete!');
console.log('');
console.log('Login credentials:');
console.log('  Email:    admin@aitx.com');
console.log('  Password: admin123');
console.log('========================================');
