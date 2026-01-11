// Migration: Add Service Plan Confirmation Workflow
// This migration adds:
// - New columns to ServicePlan for version, confirmation tracking, and car counts
// - New columns to ServicePlanCar for status, assignment, and confirmation tracking
// - New ServicePlanAuditEvent table for audit trail

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../dev.db');

console.log('Running migration: add_service_plan_confirmation');
console.log('Database path:', DB_PATH);

const db = new Database(DB_PATH);

// Enable foreign keys
db.pragma('foreign_keys = ON');

const migration = `
-- ============================================================================
-- ServicePlan: Add version, confirmation tracking, and car count fields
-- ============================================================================

-- Add version column
ALTER TABLE ServicePlan ADD COLUMN version INTEGER DEFAULT 1;

-- Add Final Confirmation tracking columns
ALTER TABLE ServicePlan ADD COLUMN finalConfirmedAt TEXT;
ALTER TABLE ServicePlan ADD COLUMN finalConfirmedById TEXT;

-- Add scheduled tracking
ALTER TABLE ServicePlan ADD COLUMN scheduledAt TEXT;

-- Add car count columns
ALTER TABLE ServicePlan ADD COLUMN confirmedCarCount INTEGER DEFAULT 0;
ALTER TABLE ServicePlan ADD COLUMN pendingCarCount INTEGER DEFAULT 0;

-- ============================================================================
-- ServicePlanCar: Add status, assignment, and confirmation tracking
-- ============================================================================

-- Add status column (pending, confirmed, deleted)
ALTER TABLE ServicePlanCar ADD COLUMN status TEXT DEFAULT 'pending';

-- Add direct assignment columns (for Car Matrix)
ALTER TABLE ServicePlanCar ADD COLUMN assignedShopId TEXT;
ALTER TABLE ServicePlanCar ADD COLUMN plannedMonth INTEGER;
ALTER TABLE ServicePlanCar ADD COLUMN plannedYear INTEGER;
ALTER TABLE ServicePlanCar ADD COLUMN shopReason TEXT DEFAULT '';

-- Add confirmation tracking
ALTER TABLE ServicePlanCar ADD COLUMN confirmedAt TEXT;
ALTER TABLE ServicePlanCar ADD COLUMN confirmedById TEXT;

-- Add soft-delete tracking (for audit)
ALTER TABLE ServicePlanCar ADD COLUMN deletedAt TEXT;
ALTER TABLE ServicePlanCar ADD COLUMN deletedById TEXT;
ALTER TABLE ServicePlanCar ADD COLUMN deleteReason TEXT DEFAULT '';

-- Add updatedAt if not exists
ALTER TABLE ServicePlanCar ADD COLUMN updatedAt TEXT DEFAULT CURRENT_TIMESTAMP;

-- ============================================================================
-- ServicePlanAuditEvent: New table for audit trail
-- ============================================================================

CREATE TABLE IF NOT EXISTS ServicePlanAuditEvent (
  id TEXT PRIMARY KEY,
  servicePlanId TEXT NOT NULL,
  eventType TEXT NOT NULL,
  planVersion INTEGER NOT NULL,
  servicePlanCarId TEXT,
  carId TEXT,
  railcarNumber TEXT,
  eventDetails TEXT DEFAULT '{}',
  performedById TEXT NOT NULL,
  performedByName TEXT DEFAULT '',
  performedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  companyId TEXT NOT NULL,
  FOREIGN KEY (servicePlanId) REFERENCES ServicePlan(id) ON DELETE CASCADE
);

-- Create indexes for ServicePlanAuditEvent
CREATE INDEX IF NOT EXISTS idx_audit_servicePlanId ON ServicePlanAuditEvent(servicePlanId);
CREATE INDEX IF NOT EXISTS idx_audit_eventType ON ServicePlanAuditEvent(eventType);
CREATE INDEX IF NOT EXISTS idx_audit_performedAt ON ServicePlanAuditEvent(performedAt);
CREATE INDEX IF NOT EXISTS idx_audit_companyId ON ServicePlanAuditEvent(companyId);
CREATE INDEX IF NOT EXISTS idx_audit_carId ON ServicePlanAuditEvent(carId);

-- Create indexes for ServicePlanCar status
CREATE INDEX IF NOT EXISTS idx_spc_status ON ServicePlanCar(status);
CREATE INDEX IF NOT EXISTS idx_spc_servicePlanId_status ON ServicePlanCar(servicePlanId, status);

-- Create index for ServicePlan customer+status
CREATE INDEX IF NOT EXISTS idx_sp_customerId_status ON ServicePlan(customerId, status);
`;

// Split by semicolons and execute each statement
const statements = migration.split(';').map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('--'));

let successCount = 0;
let errorCount = 0;

for (const stmt of statements) {
  try {
    db.exec(stmt);
    successCount++;
  } catch (error) {
    // Ignore "duplicate column" errors (column already exists)
    if (error.message.includes('duplicate column name')) {
      console.log(`  Skipped (already exists): ${stmt.substring(0, 60)}...`);
    } else if (error.message.includes('already exists')) {
      console.log(`  Skipped (already exists): ${stmt.substring(0, 60)}...`);
    } else {
      console.error(`  Error executing: ${stmt.substring(0, 60)}...`);
      console.error(`  Error: ${error.message}`);
      errorCount++;
    }
  }
}

console.log(`\nMigration complete. Success: ${successCount}, Errors: ${errorCount}`);

db.close();
