// Initialize SQLite database schema directly (bypassing Prisma CLI)
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'dev.db');

console.log('Initializing database at:', DB_PATH);

const db = new Database(DB_PATH);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create all tables based on Prisma schema
const schema = `
-- Company
CREATE TABLE IF NOT EXISTS Company (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

-- User
CREATE TABLE IF NOT EXISTS User (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  firstName TEXT NOT NULL,
  lastName TEXT NOT NULL,
  role TEXT DEFAULT 'viewer',
  companyId TEXT NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (companyId) REFERENCES Company(id)
);

-- Customer
CREATE TABLE IF NOT EXISTS Customer (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  contactName TEXT DEFAULT '',
  contactEmail TEXT DEFAULT '',
  contactPhone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  isActive INTEGER DEFAULT 1,
  companyId TEXT NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (companyId) REFERENCES Company(id),
  UNIQUE(code, companyId)
);

-- Shop
CREATE TABLE IF NOT EXISTS Shop (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  location TEXT NOT NULL,
  city TEXT DEFAULT '',
  state TEXT DEFAULT '',
  region TEXT DEFAULT '',
  network TEXT DEFAULT '',
  servingRailroad TEXT DEFAULT '',
  isAitxInternal INTEGER DEFAULT 0,
  tankQualified INTEGER DEFAULT 1,
  networkTier INTEGER DEFAULT 5,
  shopStatus TEXT DEFAULT 'active',
  capacity INTEGER DEFAULT 10,
  currentLoad INTEGER DEFAULT 0,
  utilizationTarget REAL DEFAULT 0.90,
  baseCostPerCar REAL DEFAULT 15000,
  laborRate REAL DEFAULT 75.0,
  costIndex REAL DEFAULT 1.0,
  baseTurnTime INTEGER DEFAULT 14,
  turnTimeMultiplier REAL DEFAULT 1.0,
  capabilities TEXT DEFAULT '',
  certifications TEXT DEFAULT '',
  preferredCustomers TEXT DEFAULT '',
  contactName TEXT DEFAULT '',
  contactEmail TEXT DEFAULT '',
  contactPhone TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  isActive INTEGER DEFAULT 1,
  companyId TEXT NOT NULL,
  qualCapacity INTEGER DEFAULT 50,
  assignCapacity INTEGER DEFAULT 30,
  returnCapacity INTEGER DEFAULT 40,
  repairCapacity INTEGER DEFAULT 20,
  efficiencyRating REAL DEFAULT 0.9,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (companyId) REFERENCES Company(id),
  UNIQUE(code, companyId)
);

-- Car
CREATE TABLE IF NOT EXISTS Car (
  id TEXT PRIMARY KEY,
  railcarNumber TEXT NOT NULL,
  carType TEXT DEFAULT '',
  isTankCar INTEGER DEFAULT 0,
  commodity TEXT DEFAULT '',
  customer TEXT DEFAULT '',
  projectNumber TEXT DEFAULT '',
  reasonsShopped TEXT DEFAULT '',
  status TEXT DEFAULT 'available',
  currentLocation TEXT DEFAULT '',
  assignedShopId TEXT,
  projectedCompletionMonth TEXT DEFAULT '',
  projectedCost REAL DEFAULT 0,
  shopEntryDate TEXT,
  arrivalDate TEXT,
  daysInShop INTEGER DEFAULT 0,
  lastServiceDate TEXT,
  nextServiceDue TEXT,
  homeRegion TEXT DEFAULT '',
  originRegion TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  contractNumber TEXT DEFAULT '',
  contractExpiration TEXT,
  isJacketed INTEGER DEFAULT 0,
  isLined INTEGER DEFAULT 0,
  buildYear INTEGER,
  qualificationType TEXT DEFAULT '',
  tankQualified INTEGER DEFAULT 0,
  tankQualDueDate TEXT,
  performScheduled INTEGER DEFAULT 0,
  planStatus TEXT DEFAULT '',
  portfolio INTEGER DEFAULT 0,
  shoppingStatus TEXT DEFAULT 'Unknown',
  customerId TEXT,
  performedTankQual INTEGER DEFAULT 0,
  companyId TEXT NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (companyId) REFERENCES Company(id),
  UNIQUE(railcarNumber, companyId)
);

-- CarShopEligibility
CREATE TABLE IF NOT EXISTS CarShopEligibility (
  id TEXT PRIMARY KEY,
  carId TEXT NOT NULL,
  shopId TEXT NOT NULL,
  isEligible INTEGER DEFAULT 1,
  notes TEXT DEFAULT '',
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (carId) REFERENCES Car(id) ON DELETE CASCADE,
  FOREIGN KEY (shopId) REFERENCES Shop(id) ON DELETE CASCADE,
  UNIQUE(carId, shopId)
);

-- ShopRule
CREATE TABLE IF NOT EXISTS ShopRule (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  ruleType TEXT NOT NULL,
  priority INTEGER DEFAULT 50,
  isActive INTEGER DEFAULT 1,
  conditions TEXT NOT NULL,
  actions TEXT NOT NULL,
  companyId TEXT NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (companyId) REFERENCES Company(id)
);

-- Plan
CREATE TABLE IF NOT EXISTS Plan (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  startDate TEXT NOT NULL,
  endDate TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  companyId TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (companyId) REFERENCES Company(id),
  FOREIGN KEY (createdBy) REFERENCES User(id)
);

-- PlanAssignment
CREATE TABLE IF NOT EXISTS PlanAssignment (
  id TEXT PRIMARY KEY,
  planId TEXT NOT NULL,
  carId TEXT NOT NULL,
  shopId TEXT NOT NULL,
  scheduledMonth TEXT NOT NULL,
  estimatedCost REAL DEFAULT 0,
  estimatedDuration INTEGER DEFAULT 14,
  status TEXT DEFAULT 'pending',
  notes TEXT DEFAULT '',
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (planId) REFERENCES Plan(id) ON DELETE CASCADE,
  FOREIGN KEY (carId) REFERENCES Car(id),
  FOREIGN KEY (shopId) REFERENCES Shop(id),
  UNIQUE(planId, carId, scheduledMonth)
);

-- Scenario
CREATE TABLE IF NOT EXISTS Scenario (
  id TEXT PRIMARY KEY,
  projectNumber TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  customerFilter TEXT DEFAULT '',
  basePlanId TEXT,
  status TEXT DEFAULT 'draft',
  results TEXT,
  companyId TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  isBaseline INTEGER DEFAULT 0,
  parentId TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (companyId) REFERENCES Company(id),
  FOREIGN KEY (createdBy) REFERENCES User(id),
  FOREIGN KEY (basePlanId) REFERENCES Plan(id),
  FOREIGN KEY (parentId) REFERENCES Scenario(id)
);

-- ScenarioCar
CREATE TABLE IF NOT EXISTS ScenarioCar (
  id TEXT PRIMARY KEY,
  scenarioId TEXT NOT NULL,
  carId TEXT NOT NULL,
  suggestedShopId TEXT,
  assignedShopId TEXT,
  scheduledMonth TEXT NOT NULL,
  estimatedCost REAL DEFAULT 0,
  estimatedDays INTEGER DEFAULT 14,
  ruleScore REAL DEFAULT 0,
  ruleNotes TEXT DEFAULT '',
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (scenarioId) REFERENCES Scenario(id) ON DELETE CASCADE,
  FOREIGN KEY (carId) REFERENCES Car(id),
  UNIQUE(scenarioId, carId)
);

-- ScenarioModification
CREATE TABLE IF NOT EXISTS ScenarioModification (
  id TEXT PRIMARY KEY,
  scenarioId TEXT NOT NULL,
  type TEXT NOT NULL,
  targetId TEXT NOT NULL,
  changes TEXT NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (scenarioId) REFERENCES Scenario(id) ON DELETE CASCADE
);

-- AuditLog
CREATE TABLE IF NOT EXISTS AuditLog (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  userEmail TEXT NOT NULL,
  action TEXT NOT NULL,
  entityType TEXT NOT NULL,
  entityId TEXT NOT NULL,
  entityName TEXT DEFAULT '',
  changes TEXT NOT NULL,
  metadata TEXT DEFAULT '{}',
  ipAddress TEXT DEFAULT '',
  userAgent TEXT DEFAULT '',
  companyId TEXT NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);

-- RolePermission
CREATE TABLE IF NOT EXISTS RolePermission (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  permission TEXT NOT NULL,
  isGranted INTEGER DEFAULT 1,
  companyId TEXT NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(role, permission, companyId)
);

-- FieldSecurity
CREATE TABLE IF NOT EXISTS FieldSecurity (
  id TEXT PRIMARY KEY,
  entityType TEXT NOT NULL,
  fieldName TEXT NOT NULL,
  visibleRoles TEXT NOT NULL,
  editableRoles TEXT NOT NULL,
  maskType TEXT DEFAULT 'hidden',
  companyId TEXT NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(entityType, fieldName, companyId)
);

-- ShopPerformance
CREATE TABLE IF NOT EXISTS ShopPerformance (
  id TEXT PRIMARY KEY,
  shopId TEXT NOT NULL,
  periodStart TEXT NOT NULL,
  periodEnd TEXT NOT NULL,
  periodType TEXT DEFAULT 'monthly',
  averageTurnTime REAL DEFAULT 0,
  turnTimeByRepairType TEXT DEFAULT '{}',
  totalCompleted INTEGER DEFAULT 0,
  onTimeCompleted INTEGER DEFAULT 0,
  onTimeRate REAL DEFAULT 0,
  averageDwellTime REAL DEFAULT 0,
  totalReleased INTEGER DEFAULT 0,
  reworkCount INTEGER DEFAULT 0,
  reworkRate REAL DEFAULT 0,
  totalEstimatedCost REAL DEFAULT 0,
  totalActualCost REAL DEFAULT 0,
  costVariance REAL DEFAULT 0,
  performanceScore REAL DEFAULT 0,
  companyId TEXT NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(shopId, periodStart, periodEnd, periodType)
);

-- ReportTemplate
CREATE TABLE IF NOT EXISTS ReportTemplate (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  entityType TEXT NOT NULL,
  columns TEXT NOT NULL,
  filters TEXT DEFAULT '[]',
  sortConfig TEXT DEFAULT '{}',
  groupBy TEXT DEFAULT '',
  outputFormats TEXT DEFAULT '["csv"]',
  isPublic INTEGER DEFAULT 0,
  createdById TEXT NOT NULL,
  companyId TEXT NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ScheduledReport
CREATE TABLE IF NOT EXISTS ScheduledReport (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  templateId TEXT NOT NULL,
  schedule TEXT NOT NULL,
  timezone TEXT DEFAULT 'America/Chicago',
  outputFormat TEXT DEFAULT 'pdf',
  recipients TEXT NOT NULL,
  isActive INTEGER DEFAULT 1,
  lastRunAt TEXT,
  nextRunAt TEXT,
  lastRunStatus TEXT DEFAULT 'pending',
  lastRunError TEXT DEFAULT '',
  createdById TEXT NOT NULL,
  companyId TEXT NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ShopCapacitySlot
CREATE TABLE IF NOT EXISTS ShopCapacitySlot (
  id TEXT PRIMARY KEY,
  shopId TEXT NOT NULL,
  monthKey TEXT NOT NULL,
  slotType TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  used INTEGER DEFAULT 0,
  FOREIGN KEY (shopId) REFERENCES Shop(id),
  UNIQUE(shopId, monthKey, slotType)
);

-- SOPAssignment
CREATE TABLE IF NOT EXISTS SOPAssignment (
  id TEXT PRIMARY KEY,
  scenarioId TEXT NOT NULL,
  carId TEXT NOT NULL,
  shopId TEXT NOT NULL,
  workTypes TEXT NOT NULL,
  status TEXT DEFAULT 'DRAFT',
  monthKey TEXT NOT NULL,
  scheduledArrival TEXT,
  scheduledCompletion TEXT,
  actualArrival TEXT,
  actualDeparture TEXT,
  estimatedCost REAL,
  actualCost REAL,
  estimatedDays INTEGER,
  priority INTEGER DEFAULT 3,
  notes TEXT DEFAULT '',
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (scenarioId) REFERENCES Scenario(id) ON DELETE CASCADE,
  FOREIGN KEY (carId) REFERENCES Car(id),
  FOREIGN KEY (shopId) REFERENCES Shop(id)
);

-- LeaseContract
CREATE TABLE IF NOT EXISTS LeaseContract (
  id TEXT PRIMARY KEY,
  carId TEXT NOT NULL,
  customerId TEXT NOT NULL,
  contractNumber TEXT NOT NULL,
  startDate TEXT NOT NULL,
  endDate TEXT NOT NULL,
  releaseDate TEXT,
  status TEXT DEFAULT 'active',
  commodity TEXT DEFAULT '',
  releaseReason TEXT DEFAULT '',
  nextCustomerId TEXT,
  isReleaseConfirmed INTEGER DEFAULT 0,
  releaseDelayDays INTEGER DEFAULT 0,
  notes TEXT DEFAULT '',
  companyId TEXT NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (carId) REFERENCES Car(id),
  FOREIGN KEY (customerId) REFERENCES Customer(id),
  FOREIGN KEY (companyId) REFERENCES Company(id),
  UNIQUE(contractNumber, companyId)
);

-- LeaseQualificationEntry
CREATE TABLE IF NOT EXISTS LeaseQualificationEntry (
  id TEXT PRIMARY KEY,
  leaseContractId TEXT,
  carId TEXT NOT NULL,
  customerId TEXT NOT NULL,
  plannedReleaseDate TEXT NOT NULL,
  actualReleaseDate TEXT,
  targetQualMonth TEXT NOT NULL,
  workTypes TEXT NOT NULL,
  isBundled INTEGER DEFAULT 0,
  bundleReason TEXT DEFAULT '',
  assignedShopId TEXT,
  shopAssignmentReason TEXT DEFAULT '',
  queueStatus TEXT DEFAULT 'pending',
  priority INTEGER DEFAULT 3,
  nextCustomerId TEXT,
  nextCommodity TEXT DEFAULT '',
  originalTargetMonth TEXT DEFAULT '',
  wasRescheduled INTEGER DEFAULT 0,
  rescheduleCount INTEGER DEFAULT 0,
  daysInQueue INTEGER DEFAULT 0,
  notes TEXT DEFAULT '',
  companyId TEXT NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (leaseContractId) REFERENCES LeaseContract(id),
  FOREIGN KEY (carId) REFERENCES Car(id),
  FOREIGN KEY (customerId) REFERENCES Customer(id),
  FOREIGN KEY (assignedShopId) REFERENCES Shop(id),
  FOREIGN KEY (companyId) REFERENCES Company(id)
);

-- QualificationPlanEvent
CREATE TABLE IF NOT EXISTS QualificationPlanEvent (
  id TEXT PRIMARY KEY,
  qualEntryId TEXT NOT NULL,
  scenarioId TEXT,
  eventType TEXT NOT NULL,
  plannedDate TEXT NOT NULL,
  actualDate TEXT,
  status TEXT DEFAULT 'planned',
  shopId TEXT,
  shopName TEXT DEFAULT '',
  locationFrom TEXT DEFAULT '',
  locationTo TEXT DEFAULT '',
  estimatedDays INTEGER DEFAULT 0,
  actualDays INTEGER,
  estimatedCost REAL DEFAULT 0,
  actualCost REAL,
  notes TEXT DEFAULT '',
  companyId TEXT NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (qualEntryId) REFERENCES LeaseQualificationEntry(id) ON DELETE CASCADE,
  FOREIGN KEY (companyId) REFERENCES Company(id)
);

-- QualificationScenario
CREATE TABLE IF NOT EXISTS QualificationScenario (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  scenarioType TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  planningHorizonMonths INTEGER DEFAULT 6,
  lateReleasePercent REAL DEFAULT 0,
  capacityAdjustment TEXT DEFAULT '{}',
  parentScenarioId TEXT,
  metricsJson TEXT DEFAULT '{}',
  summaryJson TEXT DEFAULT '{}',
  isApproved INTEGER DEFAULT 0,
  approvedBy TEXT,
  approvedAt TEXT,
  companyId TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parentScenarioId) REFERENCES QualificationScenario(id),
  FOREIGN KEY (companyId) REFERENCES Company(id)
);

-- QualificationPlanAssignment
CREATE TABLE IF NOT EXISTS QualificationPlanAssignment (
  id TEXT PRIMARY KEY,
  scenarioId TEXT NOT NULL,
  carId TEXT NOT NULL,
  shopId TEXT NOT NULL,
  monthKey TEXT NOT NULL,
  workTypes TEXT NOT NULL,
  priority INTEGER DEFAULT 3,
  isBundled INTEGER DEFAULT 0,
  bundleGroupId TEXT,
  scheduledArrival TEXT,
  scheduledCompletion TEXT,
  estimatedDays INTEGER DEFAULT 14,
  estimatedCost REAL DEFAULT 0,
  currentCustomerId TEXT,
  nextCustomerId TEXT,
  status TEXT DEFAULT 'planned',
  notes TEXT DEFAULT '',
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (scenarioId) REFERENCES QualificationScenario(id) ON DELETE CASCADE
);

-- QualificationPlanDocument
CREATE TABLE IF NOT EXISTS QualificationPlanDocument (
  id TEXT PRIMARY KEY,
  scenarioId TEXT NOT NULL,
  documentType TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  contentMarkdown TEXT NOT NULL,
  contentJson TEXT DEFAULT '{}',
  pdfGenerated INTEGER DEFAULT 0,
  pdfUrl TEXT DEFAULT '',
  pdfGeneratedAt TEXT,
  targetCustomerId TEXT,
  targetShopId TEXT,
  companyId TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (companyId) REFERENCES Company(id)
);

-- MasterPlan (Gold Standard feature)
CREATE TABLE IF NOT EXISTS MasterPlan (
  id TEXT PRIMARY KEY,
  companyId TEXT NOT NULL,
  planName TEXT NOT NULL,
  fiscalYear INTEGER NOT NULL,
  version INTEGER DEFAULT 1,
  status TEXT DEFAULT 'draft',
  baseScenarioId TEXT,
  approvedAt TEXT,
  approvedById TEXT,
  validFrom TEXT NOT NULL,
  validTo TEXT NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (companyId) REFERENCES Company(id),
  FOREIGN KEY (baseScenarioId) REFERENCES Scenario(id),
  FOREIGN KEY (approvedById) REFERENCES User(id)
);

-- MasterPlanCommitment (Gold Standard feature)
CREATE TABLE IF NOT EXISTS MasterPlanCommitment (
  id TEXT PRIMARY KEY,
  masterPlanId TEXT NOT NULL,
  carId TEXT NOT NULL,
  shopId TEXT NOT NULL,
  customerId TEXT NOT NULL,
  scheduledMonth TEXT NOT NULL,
  plannedArrival TEXT,
  plannedRelease TEXT,
  workTypes TEXT NOT NULL,
  isBundled INTEGER DEFAULT 0,
  estimatedCost REAL,
  priority INTEGER DEFAULT 3,
  status TEXT DEFAULT 'committed',
  notes TEXT DEFAULT '',
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (masterPlanId) REFERENCES MasterPlan(id) ON DELETE CASCADE,
  FOREIGN KEY (carId) REFERENCES Car(id),
  FOREIGN KEY (shopId) REFERENCES Shop(id),
  FOREIGN KEY (customerId) REFERENCES Customer(id)
);

-- Notification
CREATE TABLE IF NOT EXISTS Notification (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  companyId TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data TEXT,
  link TEXT,
  isRead INTEGER DEFAULT 0,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES User(id),
  FOREIGN KEY (companyId) REFERENCES Company(id)
);

-- RateLimitEntry
CREATE TABLE IF NOT EXISTS RateLimitEntry (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  windowStart TEXT NOT NULL,
  requestCount INTEGER DEFAULT 1,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(identifier, endpoint, windowStart)
);

-- InvalidatedToken (token blacklist)
CREATE TABLE IF NOT EXISTS InvalidatedToken (
  id TEXT PRIMARY KEY,
  tokenHash TEXT NOT NULL UNIQUE,
  userId TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  reason TEXT DEFAULT 'logout',
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

-- WeeklyCapacity
CREATE TABLE IF NOT EXISTS WeeklyCapacity (
  id TEXT PRIMARY KEY,
  shopId TEXT NOT NULL,
  weekStart TEXT NOT NULL,
  capacity INTEGER DEFAULT 0,
  allocated INTEGER DEFAULT 0,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shopId) REFERENCES Shop(id),
  UNIQUE(shopId, weekStart)
);

-- CapacityAudit
CREATE TABLE IF NOT EXISTS CapacityAudit (
  id TEXT PRIMARY KEY,
  shopId TEXT NOT NULL,
  weekStart TEXT NOT NULL,
  action TEXT NOT NULL,
  oldValue INTEGER,
  newValue INTEGER,
  userId TEXT,
  reason TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shopId) REFERENCES Shop(id)
);

-- ShopHistory
CREATE TABLE IF NOT EXISTS ShopHistory (
  id TEXT PRIMARY KEY,
  shopId TEXT NOT NULL,
  field TEXT NOT NULL,
  oldValue TEXT,
  newValue TEXT,
  userId TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shopId) REFERENCES Shop(id)
);

-- MasterPlanVersion
CREATE TABLE IF NOT EXISTS MasterPlanVersion (
  id TEXT PRIMARY KEY,
  masterPlanId TEXT NOT NULL,
  version INTEGER NOT NULL,
  data TEXT,
  createdBy TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (masterPlanId) REFERENCES MasterPlan(id)
);

-- IntegrationLog
CREATE TABLE IF NOT EXISTS IntegrationLog (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  data TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ImportSession
CREATE TABLE IF NOT EXISTS ImportSession (
  id TEXT PRIMARY KEY,
  companyId TEXT NOT NULL,
  userId TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  filename TEXT,
  totalRecords INTEGER DEFAULT 0,
  processedRecords INTEGER DEFAULT 0,
  errorRecords INTEGER DEFAULT 0,
  errors TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  completedAt TEXT,
  FOREIGN KEY (companyId) REFERENCES Company(id)
);

-- AllocationOverride
CREATE TABLE IF NOT EXISTS AllocationOverride (
  id TEXT PRIMARY KEY,
  masterPlanId TEXT NOT NULL,
  carId TEXT NOT NULL,
  shopId TEXT,
  weekStart TEXT,
  reason TEXT,
  userId TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (masterPlanId) REFERENCES MasterPlan(id)
);

-- Webhook
CREATE TABLE IF NOT EXISTS Webhook (
  id TEXT PRIMARY KEY,
  companyId TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  events TEXT NOT NULL,
  secret TEXT,
  isActive INTEGER DEFAULT 1,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (companyId) REFERENCES Company(id)
);

-- WebhookDelivery
CREATE TABLE IF NOT EXISTS WebhookDelivery (
  id TEXT PRIMARY KEY,
  webhookId TEXT NOT NULL,
  event TEXT NOT NULL,
  payload TEXT,
  status TEXT NOT NULL,
  statusCode INTEGER,
  response TEXT,
  attempts INTEGER DEFAULT 1,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (webhookId) REFERENCES Webhook(id)
);

-- ApiKey
CREATE TABLE IF NOT EXISTS ApiKey (
  id TEXT PRIMARY KEY,
  companyId TEXT NOT NULL,
  name TEXT NOT NULL,
  keyHash TEXT NOT NULL UNIQUE,
  keyPrefix TEXT NOT NULL,
  permissions TEXT,
  isActive INTEGER DEFAULT 1,
  lastUsedAt TEXT,
  expiresAt TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (companyId) REFERENCES Company(id)
);

-- CarFlowPlan (Car Flow Planning module)
CREATE TABLE IF NOT EXISTS CarFlowPlan (
  id TEXT PRIMARY KEY,
  carId TEXT NOT NULL,
  shopId TEXT NOT NULL,
  customerId TEXT,
  plannedMonth INTEGER NOT NULL,
  plannedYear INTEGER NOT NULL,
  sourceScenarioId TEXT,
  committedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  committedById TEXT NOT NULL,
  status TEXT DEFAULT 'Planned',
  source TEXT DEFAULT 'csv_import',
  shopReason TEXT DEFAULT '',
  estimatedCost REAL,
  priority INTEGER DEFAULT 3,
  notes TEXT DEFAULT '',
  companyId TEXT NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  cancelledAt TEXT,
  FOREIGN KEY (carId) REFERENCES Car(id),
  FOREIGN KEY (shopId) REFERENCES Shop(id),
  FOREIGN KEY (customerId) REFERENCES Customer(id),
  FOREIGN KEY (sourceScenarioId) REFERENCES Scenario(id),
  FOREIGN KEY (committedById) REFERENCES User(id),
  FOREIGN KEY (companyId) REFERENCES Company(id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_car_company ON Car(companyId);
CREATE INDEX IF NOT EXISTS idx_shop_company ON Shop(companyId);
CREATE INDEX IF NOT EXISTS idx_user_company ON User(companyId);
CREATE INDEX IF NOT EXISTS idx_carshopeligibility_car ON CarShopEligibility(carId);
CREATE INDEX IF NOT EXISTS idx_carshopeligibility_shop ON CarShopEligibility(shopId);
CREATE INDEX IF NOT EXISTS idx_scenario_project ON Scenario(projectNumber, companyId);
CREATE INDEX IF NOT EXISTS idx_shopcapacityslot_shop ON ShopCapacitySlot(shopId, monthKey);
CREATE INDEX IF NOT EXISTS idx_sopassignment_scenario ON SOPAssignment(scenarioId, shopId);
CREATE INDEX IF NOT EXISTS idx_sopassignment_month ON SOPAssignment(scenarioId, monthKey);
CREATE INDEX IF NOT EXISTS idx_sopassignment_car ON SOPAssignment(carId);
CREATE INDEX IF NOT EXISTS idx_leasecontract_customer ON LeaseContract(customerId, status);
CREATE INDEX IF NOT EXISTS idx_leasecontract_enddate ON LeaseContract(endDate);
CREATE INDEX IF NOT EXISTS idx_leasecontract_company ON LeaseContract(companyId, status);
CREATE INDEX IF NOT EXISTS idx_leasequalentry_company ON LeaseQualificationEntry(companyId, queueStatus);
CREATE INDEX IF NOT EXISTS idx_leasequalentry_month ON LeaseQualificationEntry(targetQualMonth);
CREATE INDEX IF NOT EXISTS idx_leasequalentry_car ON LeaseQualificationEntry(carId);
CREATE INDEX IF NOT EXISTS idx_leasequalentry_customer ON LeaseQualificationEntry(customerId);
CREATE INDEX IF NOT EXISTS idx_qualplanevent_entry ON QualificationPlanEvent(qualEntryId, eventType);
CREATE INDEX IF NOT EXISTS idx_qualplanevent_scenario ON QualificationPlanEvent(scenarioId);
CREATE INDEX IF NOT EXISTS idx_qualplanevent_date ON QualificationPlanEvent(plannedDate);
CREATE INDEX IF NOT EXISTS idx_qualscenario_company ON QualificationScenario(companyId, status);
CREATE INDEX IF NOT EXISTS idx_qualscenario_type ON QualificationScenario(scenarioType);
CREATE INDEX IF NOT EXISTS idx_qualplanassign_scenario ON QualificationPlanAssignment(scenarioId, monthKey);
CREATE INDEX IF NOT EXISTS idx_qualplanassign_shop ON QualificationPlanAssignment(scenarioId, shopId);
CREATE INDEX IF NOT EXISTS idx_qualplanassign_car ON QualificationPlanAssignment(carId);
CREATE INDEX IF NOT EXISTS idx_qualplandoc_scenario ON QualificationPlanDocument(scenarioId, documentType);
CREATE INDEX IF NOT EXISTS idx_qualplandoc_company ON QualificationPlanDocument(companyId);
CREATE INDEX IF NOT EXISTS idx_auditlog_company ON AuditLog(companyId, entityType, createdAt);
CREATE INDEX IF NOT EXISTS idx_auditlog_user ON AuditLog(userId, createdAt);
CREATE INDEX IF NOT EXISTS idx_shopperf_shop ON ShopPerformance(shopId, periodType, createdAt);
CREATE INDEX IF NOT EXISTS idx_masterplan_company ON MasterPlan(companyId, status);
CREATE INDEX IF NOT EXISTS idx_masterplan_fiscal ON MasterPlan(fiscalYear, version);
CREATE INDEX IF NOT EXISTS idx_masterplancommit_plan ON MasterPlanCommitment(masterPlanId, scheduledMonth);
CREATE INDEX IF NOT EXISTS idx_masterplancommit_shop ON MasterPlanCommitment(shopId, scheduledMonth);
CREATE INDEX IF NOT EXISTS idx_masterplancommit_car ON MasterPlanCommitment(carId);
CREATE INDEX IF NOT EXISTS idx_masterplancommit_customer ON MasterPlanCommitment(customerId);
CREATE INDEX IF NOT EXISTS idx_notification_user ON Notification(userId);
CREATE INDEX IF NOT EXISTS idx_notification_company ON Notification(companyId);
CREATE INDEX IF NOT EXISTS idx_ratelimit_lookup ON RateLimitEntry(identifier, endpoint, windowStart);
CREATE INDEX IF NOT EXISTS idx_invalidated_token_hash ON InvalidatedToken(tokenHash);
CREATE INDEX IF NOT EXISTS idx_invalidated_token_expires ON InvalidatedToken(expiresAt);
CREATE INDEX IF NOT EXISTS idx_webhook_company ON Webhook(companyId);
CREATE INDEX IF NOT EXISTS idx_webhook_delivery ON WebhookDelivery(webhookId);
CREATE INDEX IF NOT EXISTS idx_apikey_company ON ApiKey(companyId);
CREATE INDEX IF NOT EXISTS idx_carflowplan_car ON CarFlowPlan(carId);
CREATE INDEX IF NOT EXISTS idx_carflowplan_shop ON CarFlowPlan(shopId, plannedYear, plannedMonth);
CREATE INDEX IF NOT EXISTS idx_carflowplan_customer ON CarFlowPlan(customerId);
CREATE INDEX IF NOT EXISTS idx_carflowplan_company ON CarFlowPlan(companyId, status);
`;

// Execute schema
const statements = schema.split(';').filter(s => s.trim());
for (const stmt of statements) {
  if (stmt.trim()) {
    try {
      db.exec(stmt + ';');
    } catch (err) {
      console.error('Error executing:', stmt.substring(0, 50) + '...');
      console.error(err.message);
    }
  }
}

console.log('Database schema created successfully!');

// Verify tables
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log('\nTables created:', tables.length);
tables.forEach(t => console.log('  -', t.name));

db.close();
console.log('\nDatabase initialized and closed.');
