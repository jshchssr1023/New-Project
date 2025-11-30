// Seed script to create sample data for local development
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const path = require('path');

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
  // Create some shops
  const shops = [
    { name: 'Chicago Repair Center', code: 'CHI-01', location: 'Chicago, IL', city: 'Chicago', state: 'IL', region: 'Midwest', network: 'Primary', capacity: 50 },
    { name: 'Houston Tank Works', code: 'HOU-01', location: 'Houston, TX', city: 'Houston', state: 'TX', region: 'Southwest', network: 'Primary', capacity: 75 },
    { name: 'Atlanta Rail Services', code: 'ATL-01', location: 'Atlanta, GA', city: 'Atlanta', state: 'GA', region: 'Southeast', network: 'Secondary', capacity: 40 },
    { name: 'Denver Mountain Shop', code: 'DEN-01', location: 'Denver, CO', city: 'Denver', state: 'CO', region: 'Mountain', network: 'Primary', capacity: 35 },
    { name: 'Los Angeles Yard', code: 'LAX-01', location: 'Los Angeles, CA', city: 'Los Angeles', state: 'CA', region: 'West', network: 'Secondary', capacity: 60 },
  ];

  shops.forEach(shop => {
    db.prepare('INSERT INTO Shop (id, name, code, location, city, state, region, network, capacity, isAitxInternal, tankQualified, companyId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(uuid(), shop.name, shop.code, shop.location, shop.city, shop.state, shop.region, shop.network, shop.capacity, 1, 1, companyId);
  });
  console.log('Created 5 shops');
} else {
  console.log('Shops already exist: ' + existingShops.count);
}

// Check if cars exist
const existingCars = db.prepare('SELECT COUNT(*) as count FROM Car WHERE companyId = ?').get(companyId);

if (existingCars.count === 0) {
  // Create some cars
  const customers = ['GATX', 'Union Tank Car', 'Trinity Rail', 'Wells Fargo Rail'];
  const carTypes = ['Tank', 'Covered Hopper', 'Gondola', 'Box'];
  const statuses = ['available', 'scheduled', 'in_shop', 'awaiting_parts'];
  const reasons = ['qualification', 'repair', 'inspection', 'return'];

  for (let i = 1; i <= 50; i++) {
    const carNum = 'AITX' + String(100000 + i).padStart(6, '0');
    db.prepare('INSERT INTO Car (id, railcarNumber, carType, isTankCar, customer, status, reasonShopped, companyId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
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
  console.log('Created 50 railcars');
} else {
  console.log('Cars already exist: ' + existingCars.count);
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
