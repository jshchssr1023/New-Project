-- ============================================================================
-- SSOT Schema Enhancements for UnifiedAssignment
-- Migration: 001_ssot_schema_enhancements
-- Description: Add missing columns and indexes to establish UnifiedAssignment as SSOT
-- ============================================================================

-- Add missing SSOT columns to unified_assignment
ALTER TABLE unified_assignment
    ADD COLUMN IF NOT EXISTS event_coordinator_id TEXT,
    ADD COLUMN IF NOT EXISTS demurrage_risk_level TEXT DEFAULT 'LOW',
    ADD COLUMN IF NOT EXISTS qualification_extended BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS aar_job_codes TEXT DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS actual_start_date DATETIME,
    ADD COLUMN IF NOT EXISTS actual_completion_date DATETIME,
    ADD COLUMN IF NOT EXISTS source_id TEXT,
    ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS cancelled_at DATETIME,
    ADD COLUMN IF NOT EXISTS cancelled_by_id TEXT,
    ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
    ADD COLUMN IF NOT EXISTS migrated_from TEXT,
    ADD COLUMN IF NOT EXISTS migrated_at DATETIME,
    ADD COLUMN IF NOT EXISTS migration_notes TEXT;

-- Create migration tracking table
CREATE TABLE IF NOT EXISTS ssot_migration_log (
    id TEXT PRIMARY KEY,
    source_table TEXT NOT NULL,
    source_id TEXT NOT NULL,
    target_id TEXT,
    migration_action TEXT NOT NULL,
    migration_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_migration_log_source
ON ssot_migration_log(source_table, source_id);

-- Performance indexes for SSOT queries
CREATE INDEX IF NOT EXISTS idx_ua_car_status
ON unified_assignment(car_id, status);

CREATE INDEX IF NOT EXISTS idx_ua_shop_period
ON unified_assignment(shop_id, planned_year, planned_month);

CREATE INDEX IF NOT EXISTS idx_ua_company_status_period
ON unified_assignment(company_id, status, planned_year, planned_month);

CREATE INDEX IF NOT EXISTS idx_ua_source
ON unified_assignment(migrated_from, source_id);

-- Status transitions reference table
CREATE TABLE IF NOT EXISTS schedule_status_transitions (
    from_status TEXT,
    to_status TEXT,
    PRIMARY KEY (from_status, to_status)
);

-- Valid FSM transitions
INSERT OR IGNORE INTO schedule_status_transitions (from_status, to_status) VALUES
    ('DRAFT', 'PENDING_REVIEW'),
    ('DRAFT', 'COMMITTED'),
    ('DRAFT', 'CANCELLED'),
    ('PENDING_REVIEW', 'COMMITTED'),
    ('PENDING_REVIEW', 'DRAFT'),
    ('PENDING_REVIEW', 'CANCELLED'),
    ('COMMITTED', 'IN_PROGRESS'),
    ('COMMITTED', 'PENDING_REVIEW'),
    ('COMMITTED', 'CANCELLED'),
    ('IN_PROGRESS', 'COMPLETED'),
    ('IN_PROGRESS', 'CANCELLED'),
    -- Allow skipping states for legacy data
    ('DRAFT', 'IN_PROGRESS'),
    ('PENDING_REVIEW', 'IN_PROGRESS');

-- Audit log table for schedule changes
CREATE TABLE IF NOT EXISTS schedule_audit_log (
    id TEXT PRIMARY KEY,
    schedule_id TEXT NOT NULL,
    car_id TEXT NOT NULL,
    action TEXT NOT NULL,
    old_status TEXT,
    new_status TEXT,
    old_shop_id TEXT,
    new_shop_id TEXT,
    changed_fields TEXT,
    changed_by_id TEXT,
    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_log_schedule ON schedule_audit_log(schedule_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_car ON schedule_audit_log(car_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_time ON schedule_audit_log(changed_at);
