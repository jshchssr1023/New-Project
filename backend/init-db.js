#!/usr/bin/env node
/**
 * Database initialization script
 * Creates all required tables for Chronos Scheduler
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'dev.db');
console.log('Initializing database at:', dbPath);

// Create new database (or open existing)
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Read and execute migration files in order
const migrationsDir = path.join(__dirname, 'prisma', 'migrations');
const migrationFolders = fs.readdirSync(migrationsDir)
  .filter(f => fs.statSync(path.join(migrationsDir, f)).isDirectory())
  .sort();

console.log('Found migrations:', migrationFolders);

// First, ensure base tables exist (Company, User, Shop, etc.)
// These may need to be created if this is a fresh database

const baseTables = `
-- Company table
CREATE TABLE IF NOT EXISTS "Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL UNIQUE,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- User table
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL UNIQUE,
    "password" TEXT NOT NULL,
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'user',
    "companyId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Customer table
CREATE TABLE IF NOT EXISTS "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT 1,
    "companyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Shop table
CREATE TABLE IF NOT EXISTS "Shop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL UNIQUE,
    "location" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "network" TEXT NOT NULL DEFAULT '',
    "servingRailroad" TEXT NOT NULL DEFAULT '',
    "latitude" REAL,
    "longitude" REAL,
    "parentShopId" TEXT,
    "isParent" BOOLEAN NOT NULL DEFAULT 0,
    "annualTargetVolume" INTEGER NOT NULL DEFAULT 0,
    "isAitxInternal" BOOLEAN NOT NULL DEFAULT 0,
    "tankQualified" BOOLEAN NOT NULL DEFAULT 1,
    "networkTier" INTEGER NOT NULL DEFAULT 5,
    "shopStatus" TEXT NOT NULL DEFAULT 'active',
    "capacity" INTEGER NOT NULL DEFAULT 10,
    "currentLoad" INTEGER NOT NULL DEFAULT 0,
    "utilizationTarget" REAL NOT NULL DEFAULT 0.90,
    "baseCostPerCar" REAL NOT NULL DEFAULT 15000,
    "laborRate" REAL NOT NULL DEFAULT 75.0,
    "costIndex" REAL NOT NULL DEFAULT 1.0,
    "baseTurnTime" INTEGER NOT NULL DEFAULT 14,
    "turnTimeMultiplier" REAL NOT NULL DEFAULT 1.0,
    "capabilities" TEXT NOT NULL DEFAULT '',
    "certifications" TEXT NOT NULL DEFAULT '',
    "preferredCustomers" TEXT NOT NULL DEFAULT '',
    "contactName" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT 1,
    "companyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Shop_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- AuditLog table
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityName" TEXT NOT NULL DEFAULT '',
    "changes" TEXT NOT NULL DEFAULT '{}',
    "companyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ShopNetwork table (3rd party shop networks for S&OP)
CREATE TABLE IF NOT EXISTS "ShopNetwork" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL UNIQUE,
    "description" TEXT NOT NULL DEFAULT '',
    "isAitxInternal" INTEGER NOT NULL DEFAULT 0,
    "networkTier" INTEGER NOT NULL DEFAULT 3,
    "annualTargetVolume" INTEGER NOT NULL DEFAULT 0,
    "annualCommittedVolume" INTEGER NOT NULL DEFAULT 0,
    "monthlyBaseCapacity" INTEGER NOT NULL DEFAULT 0,
    "costIndex" REAL NOT NULL DEFAULT 1.0,
    "hasContractualCommitment" INTEGER NOT NULL DEFAULT 0,
    "commitmentPenaltyRate" REAL NOT NULL DEFAULT 0,
    "contractStartDate" DATETIME,
    "contractEndDate" DATETIME,
    "contactName" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "isActive" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT NOT NULL DEFAULT '',
    "regions" TEXT NOT NULL DEFAULT '[]',
    "companyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShopNetwork_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- SOPNetworkCommitment table (network-level S&OP tracking)
CREATE TABLE IF NOT EXISTS "SOPNetworkCommitment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "networkId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "committedVolume" INTEGER NOT NULL DEFAULT 0,
    "actualVolume" INTEGER NOT NULL DEFAULT 0,
    "variancePercent" REAL NOT NULL DEFAULT 0,
    "isUnderCommitment" INTEGER NOT NULL DEFAULT 0,
    "penaltyAmount" REAL NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "companyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SOPNetworkCommitment_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "ShopNetwork" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- SOPCommitment table (shop-level S&OP tracking)
CREATE TABLE IF NOT EXISTS "SOPCommitment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "committedVolume" INTEGER NOT NULL DEFAULT 0,
    "currentUsage" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SOPCommitment_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SOPCommitment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SOPCommitment_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CarFlowPlan table (committed car assignments)
CREATE TABLE IF NOT EXISTS "CarFlowPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "carId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "customerId" TEXT,
    "plannedMonth" INTEGER NOT NULL,
    "plannedYear" INTEGER NOT NULL,
    "sourceScenarioId" TEXT,
    "committedById" TEXT NOT NULL,
    "committedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopReason" TEXT NOT NULL DEFAULT '',
    "estimatedCost" REAL,
    "notes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'Planned',
    "cancelledAt" DATETIME,
    "companyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Scenario table
CREATE TABLE IF NOT EXISTS "Scenario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "companyId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "parentId" TEXT,
    "confirmedAt" DATETIME,
    "isDraft" INTEGER NOT NULL DEFAULT 0,
    "draftExpiresAt" DATETIME,
    "parentMasterPlanId" TEXT,
    "draftKpiSnapshot" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Scenario_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Scenario_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ScenarioCar table (cars in scenarios)
CREATE TABLE IF NOT EXISTS "ScenarioCar" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scenarioId" TEXT NOT NULL,
    "carId" TEXT NOT NULL,
    "shopId" TEXT,
    "plannedMonth" INTEGER NOT NULL,
    "plannedYear" INTEGER NOT NULL,
    "shopReason" TEXT NOT NULL DEFAULT '',
    "estimatedCost" REAL,
    "estimatedDays" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScenarioCar_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ScenarioCustomer table (customers in scenarios)
CREATE TABLE IF NOT EXISTS "ScenarioCustomer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scenarioId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "isPrimary" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScenarioCustomer_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScenarioCustomer_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Car table (full schema matching Prisma model)
CREATE TABLE IF NOT EXISTS "Car" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "railcarNumber" TEXT NOT NULL UNIQUE,
    "carType" TEXT NOT NULL DEFAULT '',
    "isTankCar" INTEGER NOT NULL DEFAULT 0,
    "commodity" TEXT NOT NULL DEFAULT '',
    "customer" TEXT NOT NULL DEFAULT '',
    "customerId" TEXT,
    "projectNumber" TEXT NOT NULL DEFAULT '',
    "reasonsShopped" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'To Be Routed',
    "shoppingStatus" TEXT NOT NULL DEFAULT 'Unknown',
    "portfolio" INTEGER NOT NULL DEFAULT 0,
    "performScheduled" INTEGER NOT NULL DEFAULT 0,
    "currentLocation" TEXT NOT NULL DEFAULT '',
    "assignedShopId" TEXT,
    "projectedCompletionMonth" TEXT NOT NULL DEFAULT '',
    "projectedCost" REAL NOT NULL DEFAULT 0,
    "shopEntryDate" DATETIME,
    "arrivalDate" DATETIME,
    "daysInShop" INTEGER NOT NULL DEFAULT 0,
    "lastServiceDate" DATETIME,
    "nextServiceDue" DATETIME,
    "homeRegion" TEXT NOT NULL DEFAULT '',
    "originRegion" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "contractNumber" TEXT NOT NULL DEFAULT '',
    "contractExpiration" DATETIME,
    "isJacketed" INTEGER NOT NULL DEFAULT 0,
    "isLined" INTEGER NOT NULL DEFAULT 0,
    "buildYear" INTEGER,
    "qualificationType" TEXT NOT NULL DEFAULT '',
    "tankQualified" INTEGER NOT NULL DEFAULT 0,
    "planStatus" TEXT NOT NULL DEFAULT '',
    "csr" TEXT NOT NULL DEFAULT '',
    "csl" TEXT NOT NULL DEFAULT '',
    "commercial" TEXT NOT NULL DEFAULT '',
    "carMark" TEXT NOT NULL DEFAULT '',
    "carNumber" TEXT NOT NULL DEFAULT '',
    "fmsLesseeNumber" TEXT NOT NULL DEFAULT '',
    "pastRegion" TEXT NOT NULL DEFAULT '',
    "region2026" TEXT NOT NULL DEFAULT '',
    "minNoLining" TEXT,
    "minWLining" TEXT,
    "interiorLining" TEXT,
    "rule88B" TEXT,
    "safetyRelief" TEXT,
    "serviceEquipment" TEXT,
    "stubSill" TEXT,
    "tankThickness" TEXT,
    "tankQualification" TEXT,
    "tankQualDueDate" DATETIME,
    "liningType" TEXT NOT NULL DEFAULT '',
    "lined" INTEGER NOT NULL DEFAULT 0,
    "scheduled" TEXT,
    "fullPartialQual" TEXT NOT NULL DEFAULT '',
    "performTankQual" INTEGER NOT NULL DEFAULT 0,
    "onRent" INTEGER NOT NULL DEFAULT 0,
    "companyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Car_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Add networkId column to Shop if it doesn't exist
-- SQLite doesn't support IF NOT EXISTS for columns, ignore error if exists
`;

console.log('Creating base tables...');
db.exec(baseTables);

// Apply each migration
for (const folder of migrationFolders) {
  const migrationPath = path.join(migrationsDir, folder, 'migration.sql');
  if (fs.existsSync(migrationPath)) {
    console.log('Applying migration:', folder);
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Split into statements and execute individually (skip empty statements)
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const stmt of statements) {
      try {
        // Skip certain statements that might fail
        if (stmt.includes('BEGIN') || stmt.includes('COMMIT') || stmt.includes('SELECT CASE')) {
          continue;
        }
        db.exec(stmt + ';');
      } catch (err) {
        // Ignore errors for "already exists" or "duplicate column"
        if (!err.message.includes('already exists') &&
            !err.message.includes('duplicate column')) {
          console.warn('Warning executing statement:', err.message);
        }
      }
    }
    console.log('  Done.');
  }
}

// Create default company and admin user for development
console.log('Creating default company and admin user...');
const bcrypt = require('bcryptjs');

function hashPassword(password) {
  // Use bcrypt for secure password hashing (matches auth.ts validation)
  return bcrypt.hashSync(password, 10);
}

const defaultCompanyId = 'default-company-id';
const defaultUserId = 'default-admin-id';

try {
  db.exec(`
    INSERT OR IGNORE INTO "Company" ("id", "name", "code", "updatedAt")
    VALUES ('${defaultCompanyId}', 'Demo Company', 'DEMO', datetime('now'));

    INSERT OR IGNORE INTO "User" ("id", "email", "password", "firstName", "lastName", "role", "companyId", "updatedAt")
    VALUES ('${defaultUserId}', 'admin@demo.com', '${hashPassword('admin123')}', 'Admin', 'User', 'admin', '${defaultCompanyId}', datetime('now'));
  `);
  console.log('  Default admin: admin@demo.com / admin123');
} catch (err) {
  console.log('  Default records may already exist:', err.message);
}

// Verify tables exist
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log('\nDatabase tables:');
tables.forEach(t => console.log('  -', t.name));

console.log('\nDatabase initialization complete!');
db.close();
