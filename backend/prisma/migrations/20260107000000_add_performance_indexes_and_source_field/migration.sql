-- Add performance indexes and source tracking field
-- Migration: 20260107000000_add_performance_indexes_and_source_field

-- =============================================================================
-- REMOVE UNIQUE CONSTRAINT ON CarFlowPlan.carId
-- =============================================================================
-- Allow multiple CarFlowPlan records per car (cancelled, completed history)
-- Business logic enforces one active plan per car

DROP INDEX IF EXISTS "CarFlowPlan_carId_key";

-- =============================================================================
-- ADD SOURCE FIELD TO CarFlowPlan
-- =============================================================================
-- Track where assignments come from: csv_import, scenario, manual, master_plan, migration

ALTER TABLE "CarFlowPlan" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'csv_import';

-- Add index on carId (no longer unique, just for lookups)
CREATE INDEX IF NOT EXISTS "CarFlowPlan_carId_idx" ON "CarFlowPlan"("carId");

-- =============================================================================
-- ADD COMPOSITE INDEXES FOR PERFORMANCE
-- =============================================================================

-- Car: Customer fleet filters (portfolio cars for a customer by shopping status)
CREATE INDEX "Car_customerId_portfolio_shoppingStatus_idx" ON "Car"("customerId", "portfolio", "shoppingStatus");

-- Shop: Shop search/recommendations
CREATE INDEX "Shop_companyId_tankQualified_region_idx" ON "Shop"("companyId", "tankQualified", "region");

-- CarFlowPlan: Monthly shop views
CREATE INDEX "CarFlowPlan_companyId_status_plannedYear_plannedMonth_idx" ON "CarFlowPlan"("companyId", "status", "plannedYear", "plannedMonth");

-- CarFlowPlan: Source tracking
CREATE INDEX "CarFlowPlan_source_idx" ON "CarFlowPlan"("source");

-- MasterPlanCommitment: Monthly shop views
CREATE INDEX "MasterPlanCommitment_companyId_status_plannedYear_plannedMonth_idx" ON "MasterPlanCommitment"("companyId", "status", "plannedYear", "plannedMonth");

-- =============================================================================
-- CREATE ActiveAssignments VIEW
-- =============================================================================
-- Unified view combining CarFlowPlan and MasterPlanCommitment for querying

CREATE VIEW IF NOT EXISTS "ActiveAssignments" AS
SELECT
    cfp.id,
    cfp."carId",
    cfp."shopId",
    cfp."customerId",
    cfp."plannedMonth",
    cfp."plannedYear",
    printf('%04d-%02d', cfp."plannedYear", cfp."plannedMonth") as "scheduledMonth",
    cfp.status,
    cfp.priority,
    cfp."shopReason",
    cfp."estimatedCost",
    cfp."companyId",
    cfp.source,
    'CarFlowPlan' as "sourceTable",
    cfp."createdAt",
    cfp."updatedAt"
FROM "CarFlowPlan" cfp
WHERE cfp.status IN ('Planned', 'In Progress')

UNION ALL

SELECT
    mpc.id,
    mpc."carId",
    mpc."shopId",
    mpc."customerId",
    mpc."plannedMonth",
    mpc."plannedYear",
    printf('%04d-%02d', mpc."plannedYear", mpc."plannedMonth") as "scheduledMonth",
    CASE mpc.status
        WHEN 'PLANNED' THEN 'Planned'
        WHEN 'IN_PROGRESS' THEN 'In Progress'
        WHEN 'DRAFT' THEN 'Draft'
        ELSE mpc.status
    END as status,
    mpc.priority,
    mpc."shopReason",
    mpc."estimatedCost",
    mpc."companyId",
    mpc."sourceType" as source,
    'MasterPlanCommitment' as "sourceTable",
    mpc."createdAt",
    mpc."updatedAt"
FROM "MasterPlanCommitment" mpc
WHERE mpc.status IN ('PLANNED', 'IN_PROGRESS', 'DRAFT')
-- Exclude cars that already exist in CarFlowPlan to avoid duplicates
AND NOT EXISTS (
    SELECT 1 FROM "CarFlowPlan" cfp
    WHERE cfp."carId" = mpc."carId"
    AND cfp.status IN ('Planned', 'In Progress')
);

-- =============================================================================
-- UPDATE EXISTING CarFlowPlan RECORDS WITH SOURCE
-- =============================================================================
-- Set source based on existing data patterns

-- Scenario-sourced records
UPDATE "CarFlowPlan"
SET source = 'scenario'
WHERE "sourceScenarioId" IS NOT NULL AND source = 'csv_import';

-- Records without scenario are likely from CSV import (default already set)
