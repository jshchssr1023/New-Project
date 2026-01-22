# Data Integrity & SSOT Rescue Plan

## Railcar Shop Management System - Complete Migration & Maturation Guide

**Document Version:** 1.0
**Created:** 2026-01-13
**Status:** IMPLEMENTATION READY

---

## Executive Summary

This document provides a comprehensive, step-by-step plan to rescue and mature your railcar shop management system by:

1. **Consolidating** all assignment data into a true Single Source of Truth (`car_schedules`)
2. **Cleaning** duplicate, orphaned, and inconsistent records
3. **Enforcing** data integrity at the database level (PostgreSQL)
4. **Synchronizing** capacity counters with actual assignments
5. **Migrating** from SQLite/Prisma to production-grade PostgreSQL with triggers
6. **Validating** all downstream components use the SSOT exclusively

### Current State Assessment

| Source Table | Records Purpose | Problem |
|--------------|-----------------|---------|
| `CarFlowPlan` | CSV imports, committed plans | Unique constraint on carId (all records), not just active |
| `MasterPlanCommitment` | Versioned plan snapshots | Separate from CarFlowPlan, no cross-table enforcement |
| `UnifiedAssignment` | Consolidation target | Incomplete migration, not yet authoritative |
| `ServicePlanCar` | Customer plan participation | Creates assignments independently |
| `PlanAssignment` | Legacy plan-car links | Not migrated, orphaned records |
| `ScenarioCar` | What-if scenarios | Can create CarFlowPlan entries |

### Target State

- **`car_schedules`** (renamed from `UnifiedAssignment`) is the ONLY authoritative source
- **One active record per railcar** enforced via partial unique index
- **Strict FSM** status transitions enforced via trigger
- **Capacity counters** automatically updated via triggers
- **Full audit trail** preserved - no hard deletes
- **10,000+ railcars / 100+ shops** supported with high concurrency

---

## Table of Contents

1. [Data Assessment & Cleanup Strategy](#1-data-assessment--cleanup-strategy)
2. [Migration & Cutover Plan](#2-migration--cutover-plan)
3. [Enhanced Integrity Triggers & Procedures](#3-enhanced-integrity-triggers--procedures)
4. [Fixes for Existing Components](#4-fixes-for-existing-components)
5. [Rollout & Validation Checklist](#5-rollout--validation-checklist)
6. [Edge Cases & Mitigations](#6-edge-cases--mitigations)
7. [Appendix: Full SQL Scripts](#appendix-full-sql-scripts)

---

## 1. Data Assessment & Cleanup Strategy

### 1.1 Diagnostic Queries

Run these queries to assess current data integrity issues. Execute in this order.

#### 1.1.1 Identify Duplicate Active Assignments

```sql
-- Find railcars with multiple active assignments across ALL source tables
WITH active_car_flow AS (
    SELECT car_id, 'CarFlowPlan' as source, id, status, planned_year, planned_month, shop_id
    FROM car_flow_plan
    WHERE status IN ('Planned', 'InProgress', 'Confirmed', 'Scheduled')
),
active_master_plan AS (
    SELECT car_id, 'MasterPlanCommitment' as source, id, status, planned_year, planned_month, shop_id
    FROM master_plan_commitment
    WHERE status IN ('DRAFT', 'PLANNED', 'SCHEDULED', 'IN_PROGRESS')
),
active_unified AS (
    SELECT car_id, 'UnifiedAssignment' as source, id, status, planned_year, planned_month, shop_id
    FROM unified_assignment
    WHERE status IN ('DRAFT', 'PENDING_REVIEW', 'COMMITTED', 'IN_PROGRESS')
),
active_service_plan AS (
    SELECT car_id, 'ServicePlanCar' as source, id, status,
           COALESCE(user_assigned_year, auto_assigned_year) as planned_year,
           COALESCE(user_assigned_month, auto_assigned_month) as planned_month,
           assigned_shop_id as shop_id
    FROM service_plan_car
    WHERE status IN ('pending', 'confirmed')
),
all_active AS (
    SELECT * FROM active_car_flow
    UNION ALL SELECT * FROM active_master_plan
    UNION ALL SELECT * FROM active_unified
    UNION ALL SELECT * FROM active_service_plan
)
SELECT
    c.railcar_number,
    aa.car_id,
    COUNT(*) as active_count,
    array_agg(DISTINCT aa.source) as sources,
    array_agg(DISTINCT aa.status) as statuses,
    array_agg(DISTINCT aa.shop_id) as shops,
    array_agg(DISTINCT (aa.planned_year || '-' || LPAD(aa.planned_month::text, 2, '0'))) as periods
FROM all_active aa
JOIN car c ON c.id = aa.car_id
GROUP BY c.railcar_number, aa.car_id
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC, c.railcar_number;
```

#### 1.1.2 Status Inconsistencies

```sql
-- Find railcars where status differs between tables for same period
WITH cfp AS (
    SELECT car_id, status, planned_year, planned_month, shop_id, 'CarFlowPlan' as source
    FROM car_flow_plan
    WHERE status NOT IN ('Complete', 'Cancelled')
),
mpc AS (
    SELECT car_id, status, planned_year, planned_month, shop_id, 'MasterPlanCommitment' as source
    FROM master_plan_commitment
    WHERE status NOT IN ('COMPLETE', 'CANCELLED', 'DEFERRED')
)
SELECT
    c.railcar_number,
    cfp.status as cfp_status,
    mpc.status as mpc_status,
    cfp.planned_year, cfp.planned_month,
    CASE
        WHEN cfp.shop_id != mpc.shop_id THEN 'SHOP MISMATCH!'
        ELSE 'Same shop'
    END as shop_status
FROM cfp
JOIN mpc ON cfp.car_id = mpc.car_id
    AND cfp.planned_year = mpc.planned_year
    AND cfp.planned_month = mpc.planned_month
JOIN car c ON c.id = cfp.car_id
WHERE cfp.status !=
    CASE mpc.status
        WHEN 'DRAFT' THEN 'Planned'
        WHEN 'PLANNED' THEN 'Planned'
        WHEN 'SCHEDULED' THEN 'Confirmed'
        WHEN 'IN_PROGRESS' THEN 'InProgress'
    END
ORDER BY c.railcar_number;
```

#### 1.1.3 Orphaned Records

```sql
-- CarFlowPlan records referencing non-existent cars
SELECT cfp.id, cfp.car_id, cfp.status, cfp.planned_year, cfp.planned_month
FROM car_flow_plan cfp
LEFT JOIN car c ON c.id = cfp.car_id
WHERE c.id IS NULL;

-- CarFlowPlan records referencing non-existent shops
SELECT cfp.id, cfp.car_id, cfp.shop_id, cfp.status
FROM car_flow_plan cfp
LEFT JOIN shop s ON s.id = cfp.shop_id
WHERE s.id IS NULL;

-- MasterPlanCommitment with no parent MasterPlan
SELECT mpc.id, mpc.car_id, mpc.master_plan_id
FROM master_plan_commitment mpc
LEFT JOIN master_plan mp ON mp.id = mpc.master_plan_id
WHERE mp.id IS NULL;

-- ServicePlanCar with deleted parent ServicePlan
SELECT spc.id, spc.car_id, spc.service_plan_id
FROM service_plan_car spc
LEFT JOIN service_plan sp ON sp.id = spc.service_plan_id
WHERE sp.id IS NULL OR sp.status = 'archived';
```

#### 1.1.4 Capacity Drift Detection

```sql
-- Calculate actual vs stored capacity usage
WITH actual_usage AS (
    SELECT
        shop_id,
        planned_year,
        planned_month,
        COUNT(*) FILTER (WHERE status IN ('Confirmed', 'Scheduled', 'InProgress')) as confirmed_count,
        COUNT(*) FILTER (WHERE status = 'Planned') as planned_count
    FROM car_flow_plan
    WHERE status NOT IN ('Complete', 'Cancelled')
    GROUP BY shop_id, planned_year, planned_month
),
stored_capacity AS (
    SELECT
        shop_id,
        year as planned_year,
        month as planned_month,
        committed_volume as stored_capacity,
        current_usage as stored_usage
    FROM sop_commitment
)
SELECT
    s.name as shop_name,
    au.planned_year,
    au.planned_month,
    au.confirmed_count as actual_confirmed,
    COALESCE(sc.stored_usage, 0) as stored_usage,
    (au.confirmed_count - COALESCE(sc.stored_usage, 0)) as drift,
    CASE
        WHEN ABS(au.confirmed_count - COALESCE(sc.stored_usage, 0)) > 0 THEN 'DRIFT DETECTED'
        ELSE 'OK'
    END as status
FROM actual_usage au
JOIN shop s ON s.id = au.shop_id
LEFT JOIN stored_capacity sc ON sc.shop_id = au.shop_id
    AND sc.planned_year = au.planned_year
    AND sc.planned_month = au.planned_month
WHERE ABS(au.confirmed_count - COALESCE(sc.stored_usage, 0)) > 0
ORDER BY ABS(au.confirmed_count - COALESCE(sc.stored_usage, 0)) DESC;
```

#### 1.1.5 Missing Linkages

```sql
-- Cars with active assignments but no customer linkage
SELECT
    c.railcar_number,
    cfp.id as assignment_id,
    cfp.status,
    cfp.planned_year,
    cfp.planned_month
FROM car_flow_plan cfp
JOIN car c ON c.id = cfp.car_id
WHERE cfp.status IN ('Planned', 'Confirmed', 'InProgress')
  AND cfp.customer_id IS NULL
  AND c.customer_id IS NOT NULL;

-- Assignments missing source tracking
SELECT
    id,
    car_id,
    status,
    source,
    source_scenario_id
FROM car_flow_plan
WHERE source IS NULL OR source = ''
  AND status NOT IN ('Complete', 'Cancelled');
```

#### 1.1.6 Historical Data Gaps

```sql
-- Completed work with missing actuals
SELECT
    c.railcar_number,
    cfp.id,
    cfp.status,
    cfp.planned_year,
    cfp.planned_month,
    cfp.estimated_cost,
    'Missing actual completion data' as issue
FROM car_flow_plan cfp
JOIN car c ON c.id = cfp.car_id
WHERE cfp.status = 'Complete'
  AND (cfp.committed_at IS NULL OR cfp.estimated_cost IS NULL);

-- Cars showing InShop status but no active assignment
SELECT
    c.railcar_number,
    c.status as car_status,
    c.shopping_status,
    'No active assignment found' as issue
FROM car c
LEFT JOIN car_flow_plan cfp ON cfp.car_id = c.id
    AND cfp.status IN ('Planned', 'InProgress', 'Confirmed')
WHERE c.status IN ('Arrived', 'InShop')
  AND cfp.id IS NULL;
```

### 1.2 Cleanup Rules & Priority

Execute cleanups in this exact order to prevent constraint violations.

#### Priority 1: Remove Orphans (No Dependencies)

```sql
-- Step 1a: Archive orphaned CarFlowPlan records (missing car)
UPDATE car_flow_plan
SET status = 'Cancelled',
    notes = CONCAT(notes, ' [CLEANUP: Car record deleted - ', NOW(), ']')
WHERE car_id NOT IN (SELECT id FROM car)
  AND status NOT IN ('Complete', 'Cancelled');

-- Step 1b: Archive orphaned CarFlowPlan records (missing shop)
UPDATE car_flow_plan
SET status = 'Cancelled',
    notes = CONCAT(notes, ' [CLEANUP: Shop record deleted - ', NOW(), ']')
WHERE shop_id NOT IN (SELECT id FROM shop)
  AND status NOT IN ('Complete', 'Cancelled');
```

#### Priority 2: Resolve Cross-Table Duplicates

```sql
-- Step 2: Mark MasterPlanCommitment as SUPERSEDED when CarFlowPlan is authoritative
-- (This assumes CarFlowPlan has the most recent confirmed data)
WITH duplicates AS (
    SELECT
        mpc.id as mpc_id,
        cfp.id as cfp_id,
        cfp.status as cfp_status,
        cfp.committed_at as cfp_committed,
        mpc.created_at as mpc_created
    FROM master_plan_commitment mpc
    JOIN car_flow_plan cfp ON cfp.car_id = mpc.car_id
        AND cfp.planned_year = mpc.planned_year
        AND cfp.planned_month = mpc.planned_month
    WHERE mpc.status NOT IN ('COMPLETE', 'CANCELLED', 'SUPERSEDED')
      AND cfp.status NOT IN ('Complete', 'Cancelled')
      AND cfp.committed_at > mpc.created_at  -- CarFlowPlan is more recent
)
UPDATE master_plan_commitment
SET status = 'SUPERSEDED',
    execution_notes = CONCAT(execution_notes, ' [SUPERSEDED: Merged to CarFlowPlan - ', NOW(), ']')
WHERE id IN (SELECT mpc_id FROM duplicates);
```

#### Priority 3: Merge ServicePlanCar Confirmations

```sql
-- Step 3: Create CarFlowPlan entries for confirmed ServicePlanCar records that don't have them
INSERT INTO car_flow_plan (
    id, car_id, shop_id, customer_id, planned_month, planned_year,
    status, source, shop_reason, estimated_cost, priority, notes,
    committed_at, committed_by_id, company_id
)
SELECT
    gen_random_uuid(),
    spc.car_id,
    spc.assigned_shop_id,
    sp.customer_id,
    COALESCE(spc.user_assigned_month, spc.auto_assigned_month),
    COALESCE(spc.user_assigned_year, spc.auto_assigned_year),
    'Confirmed',
    'service_plan',
    spc.shop_reason,
    NULL,  -- Estimate TBD
    3,
    CONCAT('Migrated from ServicePlan: ', sp.name),
    spc.confirmed_at,
    spc.confirmed_by_id,
    sp.company_id
FROM service_plan_car spc
JOIN service_plan sp ON sp.id = spc.service_plan_id
WHERE spc.status = 'confirmed'
  AND spc.assigned_shop_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM car_flow_plan cfp
      WHERE cfp.car_id = spc.car_id
        AND cfp.status NOT IN ('Complete', 'Cancelled')
  );
```

#### Priority 4: Archive Stale Records

```sql
-- Step 4: Cancel assignments for past periods that never progressed
UPDATE car_flow_plan
SET status = 'Cancelled',
    notes = CONCAT(notes, ' [AUTO-CANCELLED: Past due date without progress - ', NOW(), ']')
WHERE status = 'Planned'
  AND (planned_year < EXTRACT(YEAR FROM CURRENT_DATE)
       OR (planned_year = EXTRACT(YEAR FROM CURRENT_DATE)
           AND planned_month < EXTRACT(MONTH FROM CURRENT_DATE) - 1))
  AND committed_at < CURRENT_DATE - INTERVAL '60 days';
```

### 1.3 Data Quality Dashboard Query

```sql
-- Comprehensive data quality summary
SELECT
    'Total Cars' as metric,
    COUNT(*)::text as value
FROM car
UNION ALL
SELECT
    'Cars with Active Assignments',
    COUNT(DISTINCT car_id)::text
FROM car_flow_plan WHERE status IN ('Planned', 'Confirmed', 'InProgress')
UNION ALL
SELECT
    'Duplicate Active Assignments',
    COUNT(*)::text
FROM (
    SELECT car_id FROM car_flow_plan
    WHERE status IN ('Planned', 'Confirmed', 'InProgress')
    GROUP BY car_id HAVING COUNT(*) > 1
) dups
UNION ALL
SELECT
    'Orphaned CFP Records',
    COUNT(*)::text
FROM car_flow_plan cfp
LEFT JOIN car c ON c.id = cfp.car_id
WHERE c.id IS NULL
UNION ALL
SELECT
    'Capacity Drift (shops)',
    COUNT(*)::text
FROM (
    SELECT shop_id FROM sop_commitment sc
    WHERE current_usage != (
        SELECT COUNT(*) FROM car_flow_plan cfp
        WHERE cfp.shop_id = sc.shop_id
          AND cfp.planned_year = sc.year
          AND cfp.planned_month = sc.month
          AND cfp.status IN ('Confirmed', 'InProgress')
    )
) drift
UNION ALL
SELECT
    'Missing Customer Links',
    COUNT(*)::text
FROM car_flow_plan cfp
JOIN car c ON c.id = cfp.car_id
WHERE cfp.customer_id IS NULL AND c.customer_id IS NOT NULL
  AND cfp.status NOT IN ('Complete', 'Cancelled');
```

---

## 2. Migration & Cutover Plan

### 2.1 Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    MIGRATION PHASES                              │
├─────────────────────────────────────────────────────────────────┤
│  Phase 1: Schema Preparation (Day 1-2)                          │
│     - Rename UnifiedAssignment → car_schedules                  │
│     - Add missing columns                                        │
│     - Create migration tracking table                            │
├─────────────────────────────────────────────────────────────────┤
│  Phase 2: Shadow Mode (Day 3-7)                                 │
│     - Dual-write to car_schedules                               │
│     - Monitor for discrepancies                                  │
│     - No reads from car_schedules yet                           │
├─────────────────────────────────────────────────────────────────┤
│  Phase 3: Data Migration (Day 8-10)                             │
│     - Migrate CarFlowPlan → car_schedules                       │
│     - Migrate MasterPlanCommitment → car_schedules              │
│     - Migrate historical ServicePlanCar → car_schedules         │
│     - Resolve conflicts using priority rules                     │
├─────────────────────────────────────────────────────────────────┤
│  Phase 4: Cutover (Day 11-12)                                   │
│     - Read-only mode for legacy tables                          │
│     - Switch all reads to car_schedules                         │
│     - Enable SSOT triggers                                       │
├─────────────────────────────────────────────────────────────────┤
│  Phase 5: Validation & Cleanup (Day 13-14)                      │
│     - Verify capacity sync                                       │
│     - Deprecate legacy table writes                             │
│     - Enable full constraint enforcement                         │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Phase 1: Schema Preparation

#### 2.2.1 Rename and Extend Table

```sql
-- Step 1: Rename UnifiedAssignment to car_schedules
ALTER TABLE unified_assignment RENAME TO car_schedules;

-- Step 2: Add SSOT-required columns
ALTER TABLE car_schedules
    ADD COLUMN IF NOT EXISTS event_coordinator_id UUID REFERENCES "user"(id),
    ADD COLUMN IF NOT EXISTS demurrage_risk_level VARCHAR(20) DEFAULT 'LOW',
    ADD COLUMN IF NOT EXISTS qualification_extended BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS aar_job_codes JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS actual_start_date TIMESTAMP,
    ADD COLUMN IF NOT EXISTS actual_completion_date TIMESTAMP,
    ADD COLUMN IF NOT EXISTS source_id UUID,  -- Original ID from source table
    ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS cancelled_by_id UUID REFERENCES "user"(id),
    ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- Step 3: Add audit columns if missing
ALTER TABLE car_schedules
    ADD COLUMN IF NOT EXISTS migrated_from VARCHAR(50),
    ADD COLUMN IF NOT EXISTS migrated_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS migration_notes TEXT;

-- Step 4: Create migration tracking table
CREATE TABLE IF NOT EXISTS ssot_migration_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_table VARCHAR(100) NOT NULL,
    source_id UUID NOT NULL,
    target_id UUID,  -- car_schedules.id
    migration_action VARCHAR(20) NOT NULL, -- 'CREATED', 'MERGED', 'SKIPPED', 'CONFLICT'
    migration_notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(source_table, source_id)
);

-- Step 5: Create indexes for migration queries
CREATE INDEX IF NOT EXISTS idx_car_schedules_car_status
    ON car_schedules(car_id, status);
CREATE INDEX IF NOT EXISTS idx_car_schedules_shop_period
    ON car_schedules(shop_id, planned_year, planned_month);
CREATE INDEX IF NOT EXISTS idx_car_schedules_source
    ON car_schedules(migrated_from, source_id);
```

#### 2.2.2 Prisma Schema Update

```prisma
// In schema.prisma - add to car_schedules (renamed from UnifiedAssignment)

model CarSchedule {
  id                    String           @id @default(uuid())

  // Core relationships
  carId                 String
  car                   Car              @relation(fields: [carId], references: [id])
  shopId                String?          // Nullable early in workflow
  shop                  Shop?            @relation(fields: [shopId], references: [id])
  customerId            String?
  customer              Customer?        @relation(fields: [customerId], references: [id])

  // Planning period
  plannedYear           Int
  plannedMonth          Int              // 1-12

  // Work classification
  workType              String           @default("full_qualification")
  aarJobCodes           Json             @default("[]")

  // Status workflow (enforced via trigger)
  // Draft → Planned → Confirmed → InProgress → Complete/Cancelled
  status                String           @default("Draft")

  // Priority & risk
  priority              Int              @default(3) // 1=Critical, 2=High, 3=Medium, 4=Low
  demurrageRiskLevel    String           @default("LOW") // LOW, MEDIUM, HIGH, CRITICAL
  shopReason            String           @default("")

  // Estimates
  estimatedCost         Float?
  estimatedDays         Int              @default(14)

  // Actuals (filled when Complete)
  actualCost            Float?
  actualDays            Int?
  actualStartDate       DateTime?
  actualCompletionDate  DateTime?

  // Source tracking
  source                String           @default("manual") // manual, csv_import, scenario, service_plan, master_plan, rule_engine, migration
  sourceId              String?          // Original ID from source table
  migratedFrom          String?          // Source table name for migrations
  migratedAt            DateTime?
  migrationNotes        String?

  // Coordination
  eventCoordinatorId    String?
  eventCoordinator      User?            @relation("ScheduleCoordinator", fields: [eventCoordinatorId], references: [id])
  qualificationExtended Boolean          @default(false)

  // Optimistic locking
  version               Int              @default(1)

  // Audit timestamps
  createdAt             DateTime         @default(now())
  committedAt           DateTime?
  committedById         String?
  committedBy           User?            @relation("ScheduleCommitter", fields: [committedById], references: [id])
  updatedAt             DateTime         @updatedAt
  cancelledAt           DateTime?
  cancelledById         String?
  cancelledBy           User?            @relation("ScheduleCanceller", fields: [cancelledById], references: [id])
  cancellationReason    String?

  // Multi-tenant
  companyId             String
  company               Company          @relation(fields: [companyId], references: [id])

  // Notes
  notes                 String           @default("")

  // Link to qualification entry (if from qual engine)
  qualificationEntryId  String?
  qualificationEntry    LeaseQualificationEntry? @relation(fields: [qualificationEntryId], references: [id])

  // Indexes
  @@index([carId, status])
  @@index([shopId, plannedYear, plannedMonth])
  @@index([companyId, status, plannedYear, plannedMonth])
  @@index([status])
  @@index([migratedFrom, sourceId])

  // Map to existing table name
  @@map("car_schedules")
}
```

### 2.3 Phase 2: Shadow Mode Implementation

#### 2.3.1 Dual-Write Middleware (Prisma)

```typescript
// backend/src/middleware/ssotShadowWrite.ts

import { Prisma } from '@prisma/client';
import { prisma } from '../services/db';
import logger from '../utils/logger';

/**
 * Shadow write middleware - writes to car_schedules whenever
 * CarFlowPlan is created/updated (during migration period)
 */
export const ssotShadowWriteMiddleware: Prisma.Middleware = async (params, next) => {
  const result = await next(params);

  // Only intercept CarFlowPlan writes
  if (params.model !== 'CarFlowPlan') {
    return result;
  }

  try {
    if (params.action === 'create') {
      await shadowCreateCarSchedule(result);
    } else if (params.action === 'update') {
      await shadowUpdateCarSchedule(params.args.where, params.args.data, result);
    }
  } catch (error) {
    // Log but don't fail - shadow mode is non-blocking
    logger.error('[SSOT Shadow] Failed to shadow write', {
      model: params.model,
      action: params.action,
      error: error instanceof Error ? error.message : 'Unknown',
    });
  }

  return result;
};

async function shadowCreateCarSchedule(cfp: any) {
  const statusMap: Record<string, string> = {
    'Planned': 'Planned',
    'Confirmed': 'Confirmed',
    'Scheduled': 'Confirmed',
    'InProgress': 'InProgress',
    'Complete': 'Complete',
    'Cancelled': 'Cancelled',
  };

  await prisma.carSchedule.create({
    data: {
      carId: cfp.carId,
      shopId: cfp.shopId,
      customerId: cfp.customerId,
      plannedYear: cfp.plannedYear,
      plannedMonth: cfp.plannedMonth,
      status: statusMap[cfp.status] || 'Draft',
      source: 'shadow_sync',
      sourceId: cfp.id,
      migratedFrom: 'CarFlowPlan',
      migratedAt: new Date(),
      shopReason: cfp.shopReason || '',
      estimatedCost: cfp.estimatedCost,
      priority: cfp.priority || 3,
      notes: cfp.notes || '',
      committedAt: cfp.committedAt,
      committedById: cfp.committedById,
      companyId: cfp.companyId,
    },
  });

  logger.info('[SSOT Shadow] Created shadow car_schedule', {
    sourceId: cfp.id,
    carId: cfp.carId,
  });
}

async function shadowUpdateCarSchedule(where: any, data: any, result: any) {
  const existing = await prisma.carSchedule.findFirst({
    where: {
      sourceId: where.id,
      migratedFrom: 'CarFlowPlan',
    },
  });

  if (!existing) {
    logger.warn('[SSOT Shadow] No shadow record found for update', {
      sourceId: where.id,
    });
    return;
  }

  const statusMap: Record<string, string> = {
    'Planned': 'Planned',
    'Confirmed': 'Confirmed',
    'Scheduled': 'Confirmed',
    'InProgress': 'InProgress',
    'Complete': 'Complete',
    'Cancelled': 'Cancelled',
  };

  await prisma.carSchedule.update({
    where: { id: existing.id },
    data: {
      status: data.status ? statusMap[data.status] : undefined,
      shopId: data.shopId,
      shopReason: data.shopReason,
      estimatedCost: data.estimatedCost,
      notes: data.notes,
      cancelledAt: data.status === 'Cancelled' ? new Date() : undefined,
      version: { increment: 1 },
    },
  });

  logger.info('[SSOT Shadow] Updated shadow car_schedule', {
    scheduleId: existing.id,
    sourceId: where.id,
  });
}
```

#### 2.3.2 Shadow Mode Monitoring

```sql
-- Monitor shadow write discrepancies
CREATE VIEW ssot_shadow_discrepancies AS
SELECT
    cfp.id as cfp_id,
    cs.id as schedule_id,
    cfp.car_id,
    cfp.status as cfp_status,
    cs.status as schedule_status,
    cfp.shop_id as cfp_shop,
    cs.shop_id as schedule_shop,
    CASE
        WHEN cs.id IS NULL THEN 'MISSING_SCHEDULE'
        WHEN cfp.status != cs.status THEN 'STATUS_MISMATCH'
        WHEN cfp.shop_id != cs.shop_id THEN 'SHOP_MISMATCH'
        ELSE 'OK'
    END as discrepancy_type
FROM car_flow_plan cfp
LEFT JOIN car_schedules cs ON cs.source_id = cfp.id::text
    AND cs.migrated_from = 'CarFlowPlan'
WHERE cfp.status NOT IN ('Complete', 'Cancelled')
  AND (cs.id IS NULL
       OR cfp.status != cs.status
       OR cfp.shop_id != cs.shop_id);
```

### 2.4 Phase 3: Data Migration Scripts

#### 2.4.1 Migration Functions

```sql
-- Main migration function with conflict resolution
CREATE OR REPLACE FUNCTION migrate_to_car_schedules(
    p_company_id UUID,
    p_dry_run BOOLEAN DEFAULT true
) RETURNS TABLE(
    source_table TEXT,
    migrated INT,
    skipped INT,
    conflicts INT
) AS $$
DECLARE
    v_cfp_migrated INT := 0;
    v_cfp_skipped INT := 0;
    v_cfp_conflicts INT := 0;
    v_mpc_migrated INT := 0;
    v_mpc_skipped INT := 0;
    v_mpc_conflicts INT := 0;
    v_spc_migrated INT := 0;
    v_spc_skipped INT := 0;
    v_spc_conflicts INT := 0;
BEGIN
    -- Step 1: Migrate CarFlowPlan (highest priority)
    SELECT * INTO v_cfp_migrated, v_cfp_skipped, v_cfp_conflicts
    FROM migrate_car_flow_plans(p_company_id, p_dry_run);

    -- Step 2: Migrate MasterPlanCommitment (merge with existing)
    SELECT * INTO v_mpc_migrated, v_mpc_skipped, v_mpc_conflicts
    FROM migrate_master_plan_commitments(p_company_id, p_dry_run);

    -- Step 3: Migrate ServicePlanCar confirmations
    SELECT * INTO v_spc_migrated, v_spc_skipped, v_spc_conflicts
    FROM migrate_service_plan_cars(p_company_id, p_dry_run);

    RETURN QUERY VALUES
        ('CarFlowPlan', v_cfp_migrated, v_cfp_skipped, v_cfp_conflicts),
        ('MasterPlanCommitment', v_mpc_migrated, v_mpc_skipped, v_mpc_conflicts),
        ('ServicePlanCar', v_spc_migrated, v_spc_skipped, v_spc_conflicts);
END;
$$ LANGUAGE plpgsql;

-- Migrate CarFlowPlan records
CREATE OR REPLACE FUNCTION migrate_car_flow_plans(
    p_company_id UUID,
    p_dry_run BOOLEAN DEFAULT true
) RETURNS TABLE(migrated INT, skipped INT, conflicts INT) AS $$
DECLARE
    v_migrated INT := 0;
    v_skipped INT := 0;
    v_conflicts INT := 0;
    v_cfp RECORD;
    v_existing_id UUID;
    v_new_status TEXT;
BEGIN
    FOR v_cfp IN
        SELECT cfp.*, c.railcar_number
        FROM car_flow_plan cfp
        JOIN car c ON c.id = cfp.car_id
        WHERE cfp.company_id = p_company_id
          AND NOT EXISTS (
              SELECT 1 FROM ssot_migration_log ml
              WHERE ml.source_table = 'CarFlowPlan'
                AND ml.source_id = cfp.id
          )
        ORDER BY
            CASE cfp.status
                WHEN 'InProgress' THEN 1
                WHEN 'Confirmed' THEN 2
                WHEN 'Scheduled' THEN 3
                WHEN 'Planned' THEN 4
                ELSE 5
            END,
            cfp.committed_at DESC NULLS LAST
    LOOP
        -- Map status
        v_new_status := CASE v_cfp.status
            WHEN 'Planned' THEN 'Planned'
            WHEN 'Confirmed' THEN 'Confirmed'
            WHEN 'Scheduled' THEN 'Confirmed'
            WHEN 'InProgress' THEN 'InProgress'
            WHEN 'Complete' THEN 'Complete'
            WHEN 'Cancelled' THEN 'Cancelled'
            ELSE 'Draft'
        END;

        -- Check for existing active schedule for this car
        SELECT id INTO v_existing_id
        FROM car_schedules
        WHERE car_id = v_cfp.car_id
          AND status NOT IN ('Complete', 'Cancelled')
        LIMIT 1;

        IF v_existing_id IS NOT NULL THEN
            -- Conflict: car already has active schedule
            IF v_cfp.status IN ('InProgress', 'Confirmed', 'Scheduled') THEN
                -- This one takes priority - merge
                IF NOT p_dry_run THEN
                    UPDATE car_schedules SET
                        shop_id = v_cfp.shop_id,
                        status = v_new_status,
                        planned_year = v_cfp.planned_year,
                        planned_month = v_cfp.planned_month,
                        shop_reason = COALESCE(v_cfp.shop_reason, shop_reason),
                        estimated_cost = COALESCE(v_cfp.estimated_cost, estimated_cost),
                        source_id = v_cfp.id::text,
                        migrated_from = 'CarFlowPlan',
                        migrated_at = NOW(),
                        migration_notes = CONCAT('Merged from CFP ', v_cfp.id),
                        version = version + 1
                    WHERE id = v_existing_id;

                    INSERT INTO ssot_migration_log (source_table, source_id, target_id, migration_action, migration_notes)
                    VALUES ('CarFlowPlan', v_cfp.id, v_existing_id, 'MERGED',
                            'Merged into existing schedule due to higher status priority');
                END IF;
                v_conflicts := v_conflicts + 1;
            ELSE
                -- Skip - existing is higher priority
                IF NOT p_dry_run THEN
                    INSERT INTO ssot_migration_log (source_table, source_id, target_id, migration_action, migration_notes)
                    VALUES ('CarFlowPlan', v_cfp.id, v_existing_id, 'SKIPPED',
                            'Existing schedule has higher priority');
                END IF;
                v_skipped := v_skipped + 1;
            END IF;
        ELSE
            -- No conflict - create new schedule
            IF NOT p_dry_run THEN
                INSERT INTO car_schedules (
                    id, car_id, shop_id, customer_id, planned_year, planned_month,
                    status, source, source_id, migrated_from, migrated_at,
                    shop_reason, estimated_cost, priority, notes,
                    committed_at, committed_by_id, company_id
                ) VALUES (
                    gen_random_uuid(),
                    v_cfp.car_id,
                    v_cfp.shop_id,
                    v_cfp.customer_id,
                    v_cfp.planned_year,
                    v_cfp.planned_month,
                    v_new_status,
                    'migration',
                    v_cfp.id::text,
                    'CarFlowPlan',
                    NOW(),
                    v_cfp.shop_reason,
                    v_cfp.estimated_cost,
                    COALESCE(v_cfp.priority, 3),
                    v_cfp.notes,
                    v_cfp.committed_at,
                    v_cfp.committed_by_id,
                    v_cfp.company_id
                ) RETURNING id INTO v_existing_id;

                INSERT INTO ssot_migration_log (source_table, source_id, target_id, migration_action, migration_notes)
                VALUES ('CarFlowPlan', v_cfp.id, v_existing_id, 'CREATED', NULL);
            END IF;
            v_migrated := v_migrated + 1;
        END IF;
    END LOOP;

    RETURN QUERY SELECT v_migrated, v_skipped, v_conflicts;
END;
$$ LANGUAGE plpgsql;

-- Migrate MasterPlanCommitment records (merge/supplement only)
CREATE OR REPLACE FUNCTION migrate_master_plan_commitments(
    p_company_id UUID,
    p_dry_run BOOLEAN DEFAULT true
) RETURNS TABLE(migrated INT, skipped INT, conflicts INT) AS $$
DECLARE
    v_migrated INT := 0;
    v_skipped INT := 0;
    v_conflicts INT := 0;
    v_mpc RECORD;
    v_existing_id UUID;
    v_new_status TEXT;
BEGIN
    FOR v_mpc IN
        SELECT mpc.*, mp.company_id
        FROM master_plan_commitment mpc
        JOIN master_plan mp ON mp.id = mpc.master_plan_id
        WHERE mp.company_id = p_company_id
          AND mpc.status NOT IN ('COMPLETE', 'CANCELLED', 'SUPERSEDED', 'DEFERRED')
          AND NOT EXISTS (
              SELECT 1 FROM ssot_migration_log ml
              WHERE ml.source_table = 'MasterPlanCommitment'
                AND ml.source_id = mpc.id
          )
    LOOP
        v_new_status := CASE v_mpc.status
            WHEN 'DRAFT' THEN 'Draft'
            WHEN 'PLANNED' THEN 'Planned'
            WHEN 'SCHEDULED' THEN 'Confirmed'
            WHEN 'IN_PROGRESS' THEN 'InProgress'
            ELSE 'Draft'
        END;

        -- Check for existing schedule
        SELECT id INTO v_existing_id
        FROM car_schedules
        WHERE car_id = v_mpc.car_id
          AND status NOT IN ('Complete', 'Cancelled')
        LIMIT 1;

        IF v_existing_id IS NOT NULL THEN
            -- Supplement existing record with MPC data
            IF NOT p_dry_run THEN
                UPDATE car_schedules SET
                    scheduled_arrival_date = COALESCE(scheduled_arrival_date, v_mpc.scheduled_arrival_date),
                    scheduled_completion_date = COALESCE(scheduled_completion_date, v_mpc.scheduled_completion_date),
                    work_type = COALESCE(NULLIF(work_type, 'full_qualification'), v_mpc.work_type),
                    qualification_entry_id = COALESCE(qualification_entry_id, v_mpc.qualification_entry_id),
                    migration_notes = CONCAT(COALESCE(migration_notes, ''), ' Supplemented from MPC ', v_mpc.id)
                WHERE id = v_existing_id;

                INSERT INTO ssot_migration_log (source_table, source_id, target_id, migration_action, migration_notes)
                VALUES ('MasterPlanCommitment', v_mpc.id, v_existing_id, 'MERGED',
                        'Supplemented existing schedule with MPC details');
            END IF;
            v_conflicts := v_conflicts + 1;
        ELSE
            -- Create new if no existing
            IF NOT p_dry_run THEN
                INSERT INTO car_schedules (
                    id, car_id, shop_id, customer_id, planned_year, planned_month,
                    status, source, source_id, migrated_from, migrated_at,
                    work_type, shop_reason, qualification_entry_id,
                    scheduled_arrival_date, scheduled_completion_date,
                    company_id
                ) VALUES (
                    gen_random_uuid(),
                    v_mpc.car_id,
                    v_mpc.shop_id,
                    v_mpc.customer_id,
                    v_mpc.planned_year,
                    v_mpc.planned_month,
                    v_new_status,
                    'migration',
                    v_mpc.id::text,
                    'MasterPlanCommitment',
                    NOW(),
                    v_mpc.work_type,
                    v_mpc.shop_reason,
                    v_mpc.qualification_entry_id,
                    v_mpc.scheduled_arrival_date,
                    v_mpc.scheduled_completion_date,
                    v_mpc.company_id
                ) RETURNING id INTO v_existing_id;

                INSERT INTO ssot_migration_log (source_table, source_id, target_id, migration_action, migration_notes)
                VALUES ('MasterPlanCommitment', v_mpc.id, v_existing_id, 'CREATED', NULL);
            END IF;
            v_migrated := v_migrated + 1;
        END IF;
    END LOOP;

    RETURN QUERY SELECT v_migrated, v_skipped, v_conflicts;
END;
$$ LANGUAGE plpgsql;

-- Migrate ServicePlanCar confirmed records
CREATE OR REPLACE FUNCTION migrate_service_plan_cars(
    p_company_id UUID,
    p_dry_run BOOLEAN DEFAULT true
) RETURNS TABLE(migrated INT, skipped INT, conflicts INT) AS $$
DECLARE
    v_migrated INT := 0;
    v_skipped INT := 0;
    v_conflicts INT := 0;
    v_spc RECORD;
    v_existing_id UUID;
BEGIN
    FOR v_spc IN
        SELECT spc.*, sp.company_id, sp.customer_id
        FROM service_plan_car spc
        JOIN service_plan sp ON sp.id = spc.service_plan_id
        WHERE sp.company_id = p_company_id
          AND spc.status = 'confirmed'
          AND spc.assigned_shop_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM ssot_migration_log ml
              WHERE ml.source_table = 'ServicePlanCar'
                AND ml.source_id = spc.id
          )
    LOOP
        SELECT id INTO v_existing_id
        FROM car_schedules
        WHERE car_id = v_spc.car_id
          AND status NOT IN ('Complete', 'Cancelled')
        LIMIT 1;

        IF v_existing_id IS NOT NULL THEN
            IF NOT p_dry_run THEN
                INSERT INTO ssot_migration_log (source_table, source_id, target_id, migration_action, migration_notes)
                VALUES ('ServicePlanCar', v_spc.id, v_existing_id, 'SKIPPED',
                        'Car already has active schedule');
            END IF;
            v_skipped := v_skipped + 1;
        ELSE
            IF NOT p_dry_run THEN
                INSERT INTO car_schedules (
                    id, car_id, shop_id, customer_id, planned_year, planned_month,
                    status, source, source_id, migrated_from, migrated_at,
                    shop_reason, company_id, committed_at, committed_by_id
                ) VALUES (
                    gen_random_uuid(),
                    v_spc.car_id,
                    v_spc.assigned_shop_id,
                    v_spc.customer_id,
                    COALESCE(v_spc.user_assigned_year, v_spc.auto_assigned_year),
                    COALESCE(v_spc.user_assigned_month, v_spc.auto_assigned_month),
                    'Confirmed',
                    'migration',
                    v_spc.id::text,
                    'ServicePlanCar',
                    NOW(),
                    v_spc.shop_reason,
                    v_spc.company_id,
                    v_spc.confirmed_at,
                    v_spc.confirmed_by_id
                ) RETURNING id INTO v_existing_id;

                INSERT INTO ssot_migration_log (source_table, source_id, target_id, migration_action, migration_notes)
                VALUES ('ServicePlanCar', v_spc.id, v_existing_id, 'CREATED', NULL);
            END IF;
            v_migrated := v_migrated + 1;
        END IF;
    END LOOP;

    RETURN QUERY SELECT v_migrated, v_skipped, v_conflicts;
END;
$$ LANGUAGE plpgsql;
```

#### 2.4.2 Execute Migration

```sql
-- Step 1: Dry run to see what will be migrated
SELECT * FROM migrate_to_car_schedules('<company_id>', true);

-- Step 2: Review migration plan
SELECT
    source_table,
    migration_action,
    COUNT(*) as count
FROM ssot_migration_log
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY source_table, migration_action;

-- Step 3: Execute actual migration (PRODUCTION!)
BEGIN;
    SELECT * FROM migrate_to_car_schedules('<company_id>', false);

    -- Verify results
    SELECT
        source_table,
        migration_action,
        COUNT(*)
    FROM ssot_migration_log
    GROUP BY source_table, migration_action;

    -- Check for any cars with multiple active schedules (should be 0)
    SELECT car_id, COUNT(*)
    FROM car_schedules
    WHERE status NOT IN ('Complete', 'Cancelled')
    GROUP BY car_id
    HAVING COUNT(*) > 1;

    -- If all looks good:
    COMMIT;
    -- Otherwise:
    -- ROLLBACK;
```

### 2.5 Phase 4: Cutover

#### 2.5.1 Enable Read-Only on Legacy Tables

```sql
-- Create read-only views for legacy table access during transition
CREATE OR REPLACE VIEW v_car_flow_plan_readonly AS
SELECT * FROM car_flow_plan;

-- Revoke direct write access (application-level)
-- In your ORM/API layer, redirect all writes to car_schedules
```

#### 2.5.2 Application Cutover Service

```typescript
// backend/src/services/ssotCutover.ts

import { prisma } from './db';
import logger from '../utils/logger';

/**
 * Feature flags for SSOT cutover
 */
export const SSOT_FLAGS = {
  // Phase 2: Shadow mode
  SHADOW_WRITE_ENABLED: true,

  // Phase 4: Cutover
  READ_FROM_CAR_SCHEDULES: true,  // Flip this to true during cutover
  WRITE_TO_CAR_SCHEDULES: true,   // Flip this to true during cutover
  LEGACY_WRITE_ENABLED: false,     // Flip this to false during cutover

  // Phase 5: Full enforcement
  ENFORCE_ONE_ACTIVE: true,
  ENFORCE_FSM: true,
};

/**
 * Get active schedule for a car (SSOT query)
 */
export async function getActiveSchedule(carId: string) {
  if (SSOT_FLAGS.READ_FROM_CAR_SCHEDULES) {
    return prisma.carSchedule.findFirst({
      where: {
        carId,
        status: { notIn: ['Complete', 'Cancelled'] },
      },
      include: {
        shop: true,
        car: true,
        customer: true,
      },
    });
  }

  // Legacy fallback
  return prisma.carFlowPlan.findFirst({
    where: {
      carId,
      status: { in: ['Planned', 'Confirmed', 'InProgress'] },
    },
    include: {
      shop: true,
      car: true,
      customer: true,
    },
  });
}

/**
 * Create or update schedule (SSOT write)
 */
export async function upsertSchedule(data: {
  carId: string;
  shopId: string;
  plannedYear: number;
  plannedMonth: number;
  status?: string;
  workType?: string;
  companyId: string;
  userId: string;
}) {
  if (!SSOT_FLAGS.WRITE_TO_CAR_SCHEDULES) {
    throw new Error('SSOT writes are disabled');
  }

  // Check for existing active schedule
  const existing = await prisma.carSchedule.findFirst({
    where: {
      carId: data.carId,
      status: { notIn: ['Complete', 'Cancelled'] },
    },
  });

  if (existing && SSOT_FLAGS.ENFORCE_ONE_ACTIVE) {
    // Update existing instead of creating duplicate
    return prisma.carSchedule.update({
      where: { id: existing.id },
      data: {
        shopId: data.shopId,
        plannedYear: data.plannedYear,
        plannedMonth: data.plannedMonth,
        status: data.status || existing.status,
        version: { increment: 1 },
      },
    });
  }

  return prisma.carSchedule.create({
    data: {
      carId: data.carId,
      shopId: data.shopId,
      plannedYear: data.plannedYear,
      plannedMonth: data.plannedMonth,
      status: data.status || 'Draft',
      workType: data.workType || 'full_qualification',
      source: 'manual',
      companyId: data.companyId,
      committedById: data.userId,
      committedAt: new Date(),
    },
  });
}

/**
 * Get shop capacity from SSOT
 */
export async function getShopCapacityFromSSOT(
  shopId: string,
  year: number,
  month: number
): Promise<{ confirmed: number; planned: number; total: number }> {
  const counts = await prisma.carSchedule.groupBy({
    by: ['status'],
    where: {
      shopId,
      plannedYear: year,
      plannedMonth: month,
      status: { notIn: ['Complete', 'Cancelled'] },
    },
    _count: { id: true },
  });

  let confirmed = 0;
  let planned = 0;

  for (const count of counts) {
    if (['Confirmed', 'InProgress'].includes(count.status)) {
      confirmed += count._count.id;
    } else if (['Draft', 'Planned'].includes(count.status)) {
      planned += count._count.id;
    }
  }

  return { confirmed, planned, total: confirmed + planned };
}
```

---

## 3. Enhanced Integrity Triggers & Procedures

### 3.1 One-Active-Per-Car Enforcement

```sql
-- Partial unique index: Only one active schedule per car
CREATE UNIQUE INDEX IF NOT EXISTS idx_car_schedules_one_active_per_car
ON car_schedules (car_id)
WHERE status NOT IN ('Complete', 'Cancelled');

-- Trigger to prevent bypassing via UPDATE
CREATE OR REPLACE FUNCTION enforce_one_active_schedule()
RETURNS TRIGGER AS $$
DECLARE
    v_existing_count INT;
BEGIN
    -- Skip if transitioning TO a terminal state
    IF NEW.status IN ('Complete', 'Cancelled') THEN
        RETURN NEW;
    END IF;

    -- Check for other active schedules for this car
    SELECT COUNT(*) INTO v_existing_count
    FROM car_schedules
    WHERE car_id = NEW.car_id
      AND id != NEW.id
      AND status NOT IN ('Complete', 'Cancelled');

    IF v_existing_count > 0 THEN
        RAISE EXCEPTION 'Car % already has an active schedule. Cancel or complete existing schedule first.',
            NEW.car_id
        USING ERRCODE = 'unique_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_one_active_schedule
BEFORE INSERT OR UPDATE ON car_schedules
FOR EACH ROW
EXECUTE FUNCTION enforce_one_active_schedule();
```

### 3.2 Status FSM Validation

```sql
-- Valid status transitions
CREATE TABLE IF NOT EXISTS schedule_status_transitions (
    from_status VARCHAR(20),
    to_status VARCHAR(20),
    PRIMARY KEY (from_status, to_status)
);

INSERT INTO schedule_status_transitions (from_status, to_status) VALUES
    ('Draft', 'Planned'),
    ('Draft', 'Cancelled'),
    ('Planned', 'Confirmed'),
    ('Planned', 'Draft'),      -- Can downgrade
    ('Planned', 'Cancelled'),
    ('Confirmed', 'InProgress'),
    ('Confirmed', 'Planned'),   -- Can downgrade
    ('Confirmed', 'Cancelled'),
    ('InProgress', 'Complete'),
    ('InProgress', 'Cancelled'),
    -- Allow skipping states for legacy data migration
    ('Draft', 'Confirmed'),
    ('Draft', 'InProgress'),
    ('Planned', 'InProgress')
ON CONFLICT DO NOTHING;

-- FSM Trigger
CREATE OR REPLACE FUNCTION validate_status_transition()
RETURNS TRIGGER AS $$
BEGIN
    -- Skip validation for new records
    IF TG_OP = 'INSERT' THEN
        RETURN NEW;
    END IF;

    -- Skip if status unchanged
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- Check if transition is valid
    IF NOT EXISTS (
        SELECT 1 FROM schedule_status_transitions
        WHERE from_status = OLD.status AND to_status = NEW.status
    ) THEN
        RAISE EXCEPTION 'Invalid status transition: % → %. Allowed transitions from %: %',
            OLD.status, NEW.status, OLD.status,
            (SELECT string_agg(to_status, ', ') FROM schedule_status_transitions WHERE from_status = OLD.status)
        USING ERRCODE = 'check_violation';
    END IF;

    -- Set timestamps for specific transitions
    IF NEW.status = 'Confirmed' AND OLD.status != 'Confirmed' THEN
        NEW.committed_at := COALESCE(NEW.committed_at, NOW());
    ELSIF NEW.status = 'InProgress' THEN
        NEW.actual_start_date := COALESCE(NEW.actual_start_date, NOW());
    ELSIF NEW.status = 'Complete' THEN
        NEW.actual_completion_date := COALESCE(NEW.actual_completion_date, NOW());
    ELSIF NEW.status = 'Cancelled' THEN
        NEW.cancelled_at := COALESCE(NEW.cancelled_at, NOW());
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_status_transition
BEFORE UPDATE ON car_schedules
FOR EACH ROW
EXECUTE FUNCTION validate_status_transition();
```

### 3.3 Capacity Hooks

```sql
-- Auto-update capacity on schedule status changes
CREATE OR REPLACE FUNCTION update_capacity_on_schedule_change()
RETURNS TRIGGER AS $$
DECLARE
    v_old_confirmed BOOLEAN;
    v_new_confirmed BOOLEAN;
    v_old_planned BOOLEAN;
    v_new_planned BOOLEAN;
BEGIN
    -- Determine if old/new states count as confirmed or planned
    v_old_confirmed := (TG_OP = 'UPDATE' OR TG_OP = 'DELETE')
        AND OLD.status IN ('Confirmed', 'InProgress');
    v_new_confirmed := (TG_OP = 'INSERT' OR TG_OP = 'UPDATE')
        AND NEW.status IN ('Confirmed', 'InProgress');

    v_old_planned := (TG_OP = 'UPDATE' OR TG_OP = 'DELETE')
        AND OLD.status IN ('Draft', 'Planned');
    v_new_planned := (TG_OP = 'INSERT' OR TG_OP = 'UPDATE')
        AND NEW.status IN ('Draft', 'Planned');

    -- Handle DELETE
    IF TG_OP = 'DELETE' THEN
        IF v_old_confirmed AND OLD.shop_id IS NOT NULL THEN
            PERFORM adjust_shop_capacity(OLD.shop_id, OLD.planned_year, OLD.planned_month, -1, 0);
        ELSIF v_old_planned AND OLD.shop_id IS NOT NULL THEN
            PERFORM adjust_shop_capacity(OLD.shop_id, OLD.planned_year, OLD.planned_month, 0, -1);
        END IF;
        RETURN OLD;
    END IF;

    -- Handle INSERT
    IF TG_OP = 'INSERT' THEN
        IF v_new_confirmed AND NEW.shop_id IS NOT NULL THEN
            PERFORM adjust_shop_capacity(NEW.shop_id, NEW.planned_year, NEW.planned_month, 1, 0);
        ELSIF v_new_planned AND NEW.shop_id IS NOT NULL THEN
            PERFORM adjust_shop_capacity(NEW.shop_id, NEW.planned_year, NEW.planned_month, 0, 1);
        END IF;
        RETURN NEW;
    END IF;

    -- Handle UPDATE
    IF TG_OP = 'UPDATE' THEN
        -- Shop changed?
        IF OLD.shop_id IS DISTINCT FROM NEW.shop_id
           OR OLD.planned_year != NEW.planned_year
           OR OLD.planned_month != NEW.planned_month THEN
            -- Remove from old shop-period
            IF OLD.shop_id IS NOT NULL THEN
                IF v_old_confirmed THEN
                    PERFORM adjust_shop_capacity(OLD.shop_id, OLD.planned_year, OLD.planned_month, -1, 0);
                ELSIF v_old_planned THEN
                    PERFORM adjust_shop_capacity(OLD.shop_id, OLD.planned_year, OLD.planned_month, 0, -1);
                END IF;
            END IF;
            -- Add to new shop-period
            IF NEW.shop_id IS NOT NULL THEN
                IF v_new_confirmed THEN
                    PERFORM adjust_shop_capacity(NEW.shop_id, NEW.planned_year, NEW.planned_month, 1, 0);
                ELSIF v_new_planned THEN
                    PERFORM adjust_shop_capacity(NEW.shop_id, NEW.planned_year, NEW.planned_month, 0, 1);
                END IF;
            END IF;
        -- Status changed within same shop-period?
        ELSIF OLD.status != NEW.status AND NEW.shop_id IS NOT NULL THEN
            -- Confirmed → non-confirmed
            IF v_old_confirmed AND NOT v_new_confirmed THEN
                PERFORM adjust_shop_capacity(NEW.shop_id, NEW.planned_year, NEW.planned_month, -1, 0);
                IF v_new_planned THEN
                    PERFORM adjust_shop_capacity(NEW.shop_id, NEW.planned_year, NEW.planned_month, 0, 1);
                END IF;
            -- Non-confirmed → confirmed
            ELSIF NOT v_old_confirmed AND v_new_confirmed THEN
                IF v_old_planned THEN
                    PERFORM adjust_shop_capacity(NEW.shop_id, NEW.planned_year, NEW.planned_month, 0, -1);
                END IF;
                PERFORM adjust_shop_capacity(NEW.shop_id, NEW.planned_year, NEW.planned_month, 1, 0);
            -- Terminal state (Complete/Cancelled)
            ELSIF NEW.status IN ('Complete', 'Cancelled') THEN
                IF v_old_confirmed THEN
                    PERFORM adjust_shop_capacity(NEW.shop_id, NEW.planned_year, NEW.planned_month, -1, 0);
                ELSIF v_old_planned THEN
                    PERFORM adjust_shop_capacity(NEW.shop_id, NEW.planned_year, NEW.planned_month, 0, -1);
                END IF;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Helper function to adjust capacity
CREATE OR REPLACE FUNCTION adjust_shop_capacity(
    p_shop_id UUID,
    p_year INT,
    p_month INT,
    p_confirmed_delta INT,
    p_planned_delta INT
) RETURNS VOID AS $$
DECLARE
    v_capacity_period DATE;
BEGIN
    v_capacity_period := make_date(p_year, p_month, 1);

    -- Upsert ShopMonthlyCapacity
    INSERT INTO shop_monthly_capacity (
        id, shop_id, capacity_period, company_id,
        confirmed_railcars, planned_railcars,
        monthly_capacity_limit, last_calculated_at
    )
    SELECT
        gen_random_uuid(),
        p_shop_id,
        v_capacity_period,
        s.company_id,
        GREATEST(0, p_confirmed_delta),
        GREATEST(0, p_planned_delta),
        COALESCE(s.capacity, 30),
        NOW()
    FROM shop s WHERE s.id = p_shop_id
    ON CONFLICT (shop_id, capacity_period) DO UPDATE SET
        confirmed_railcars = GREATEST(0, shop_monthly_capacity.confirmed_railcars + p_confirmed_delta),
        planned_railcars = GREATEST(0, shop_monthly_capacity.planned_railcars + p_planned_delta),
        last_calculated_at = NOW(),
        version = shop_monthly_capacity.version + 1;

    -- Update derived fields
    UPDATE shop_monthly_capacity smc SET
        remaining_available_railcars = GREATEST(0,
            COALESCE(adjusted_capacity_limit, monthly_capacity_limit) - confirmed_railcars),
        total_committed_railcars = confirmed_railcars + planned_railcars,
        utilization_percent = CASE
            WHEN COALESCE(adjusted_capacity_limit, monthly_capacity_limit) > 0
            THEN ROUND((confirmed_railcars::NUMERIC / COALESCE(adjusted_capacity_limit, monthly_capacity_limit)) * 100, 2)
            ELSE 0
        END,
        projected_utilization_percent = CASE
            WHEN COALESCE(adjusted_capacity_limit, monthly_capacity_limit) > 0
            THEN ROUND(((confirmed_railcars + planned_railcars)::NUMERIC / COALESCE(adjusted_capacity_limit, monthly_capacity_limit)) * 100, 2)
            ELSE 0
        END,
        is_over_capacity = confirmed_railcars > COALESCE(adjusted_capacity_limit, monthly_capacity_limit),
        is_at_risk = (confirmed_railcars + planned_railcars) > COALESCE(adjusted_capacity_limit, monthly_capacity_limit)
    WHERE shop_id = p_shop_id AND capacity_period = v_capacity_period;

    -- Also update SOPCommitment.currentUsage
    UPDATE sop_commitment SET
        current_usage = (
            SELECT confirmed_railcars
            FROM shop_monthly_capacity
            WHERE shop_id = p_shop_id AND capacity_period = v_capacity_period
        )
    WHERE shop_id = p_shop_id AND year = p_year AND month = p_month;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_capacity_on_schedule_change
AFTER INSERT OR UPDATE OR DELETE ON car_schedules
FOR EACH ROW
EXECUTE FUNCTION update_capacity_on_schedule_change();
```

### 3.4 Optimistic Locking

```sql
-- Optimistic locking trigger
CREATE OR REPLACE FUNCTION enforce_optimistic_locking()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- Check version matches (if provided in update)
        IF OLD.version != NEW.version - 1 THEN
            -- Auto-increment if not explicitly set
            NEW.version := OLD.version + 1;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_optimistic_locking
BEFORE UPDATE ON car_schedules
FOR EACH ROW
EXECUTE FUNCTION enforce_optimistic_locking();
```

### 3.5 Audit Logging

```sql
-- Audit log table (if not exists)
CREATE TABLE IF NOT EXISTS schedule_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID NOT NULL,
    car_id UUID NOT NULL,
    action VARCHAR(20) NOT NULL, -- INSERT, UPDATE, DELETE
    old_status VARCHAR(20),
    new_status VARCHAR(20),
    old_shop_id UUID,
    new_shop_id UUID,
    changed_fields JSONB,
    changed_by_id UUID,
    changed_at TIMESTAMP DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT
);

CREATE INDEX idx_schedule_audit_log_schedule ON schedule_audit_log(schedule_id);
CREATE INDEX idx_schedule_audit_log_car ON schedule_audit_log(car_id);
CREATE INDEX idx_schedule_audit_log_time ON schedule_audit_log(changed_at);

-- Audit trigger
CREATE OR REPLACE FUNCTION audit_schedule_changes()
RETURNS TRIGGER AS $$
DECLARE
    v_changed_fields JSONB := '{}';
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO schedule_audit_log (
            schedule_id, car_id, action, old_status, old_shop_id
        ) VALUES (
            OLD.id, OLD.car_id, 'DELETE', OLD.status, OLD.shop_id
        );
        RETURN OLD;
    END IF;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO schedule_audit_log (
            schedule_id, car_id, action, new_status, new_shop_id, changed_by_id
        ) VALUES (
            NEW.id, NEW.car_id, 'INSERT', NEW.status, NEW.shop_id, NEW.committed_by_id
        );
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Build changed fields JSON
        IF OLD.status != NEW.status THEN
            v_changed_fields := v_changed_fields || jsonb_build_object('status',
                jsonb_build_object('old', OLD.status, 'new', NEW.status));
        END IF;
        IF OLD.shop_id IS DISTINCT FROM NEW.shop_id THEN
            v_changed_fields := v_changed_fields || jsonb_build_object('shop_id',
                jsonb_build_object('old', OLD.shop_id, 'new', NEW.shop_id));
        END IF;
        IF OLD.planned_year != NEW.planned_year OR OLD.planned_month != NEW.planned_month THEN
            v_changed_fields := v_changed_fields || jsonb_build_object('planned_period',
                jsonb_build_object('old', OLD.planned_year || '-' || OLD.planned_month,
                                   'new', NEW.planned_year || '-' || NEW.planned_month));
        END IF;

        INSERT INTO schedule_audit_log (
            schedule_id, car_id, action,
            old_status, new_status, old_shop_id, new_shop_id,
            changed_fields, changed_by_id
        ) VALUES (
            NEW.id, NEW.car_id, 'UPDATE',
            OLD.status, NEW.status, OLD.shop_id, NEW.shop_id,
            v_changed_fields, COALESCE(NEW.committed_by_id, OLD.committed_by_id)
        );
        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_schedule_changes
AFTER INSERT OR UPDATE OR DELETE ON car_schedules
FOR EACH ROW
EXECUTE FUNCTION audit_schedule_changes();
```

### 3.6 Nightly Jobs

```sql
-- Nightly capacity recalculation job
CREATE OR REPLACE FUNCTION recalculate_all_capacity(p_company_id UUID DEFAULT NULL)
RETURNS TABLE(shop_id UUID, periods_updated INT) AS $$
DECLARE
    v_shop RECORD;
    v_periods_updated INT;
BEGIN
    FOR v_shop IN
        SELECT s.id FROM shop s
        WHERE (p_company_id IS NULL OR s.company_id = p_company_id)
          AND s.is_active = true
    LOOP
        v_periods_updated := 0;

        -- Recalculate for each period with activity
        WITH period_actuals AS (
            SELECT
                cs.planned_year,
                cs.planned_month,
                COUNT(*) FILTER (WHERE cs.status IN ('Confirmed', 'InProgress')) as confirmed,
                COUNT(*) FILTER (WHERE cs.status IN ('Draft', 'Planned')) as planned
            FROM car_schedules cs
            WHERE cs.shop_id = v_shop.id
              AND cs.status NOT IN ('Complete', 'Cancelled')
            GROUP BY cs.planned_year, cs.planned_month
        )
        UPDATE shop_monthly_capacity smc SET
            confirmed_railcars = COALESCE(pa.confirmed, 0),
            planned_railcars = COALESCE(pa.planned, 0),
            remaining_available_railcars = GREATEST(0,
                COALESCE(smc.adjusted_capacity_limit, smc.monthly_capacity_limit) - COALESCE(pa.confirmed, 0)),
            total_committed_railcars = COALESCE(pa.confirmed, 0) + COALESCE(pa.planned, 0),
            last_calculated_at = NOW(),
            version = smc.version + 1
        FROM period_actuals pa
        WHERE smc.shop_id = v_shop.id
          AND EXTRACT(YEAR FROM smc.capacity_period) = pa.planned_year
          AND EXTRACT(MONTH FROM smc.capacity_period) = pa.planned_month;

        GET DIAGNOSTICS v_periods_updated = ROW_COUNT;

        RETURN QUERY SELECT v_shop.id, v_periods_updated;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Hierarchy rollup job
CREATE OR REPLACE FUNCTION recalculate_network_capacity_rollup(p_company_id UUID DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
    -- Reset network totals
    UPDATE shop_monthly_capacity SET
        children_confirmed_railcars = 0,
        children_planned_railcars = 0,
        network_total_capacity = monthly_capacity_limit,
        network_available_railcars = remaining_available_railcars
    WHERE p_company_id IS NULL OR company_id = p_company_id;

    -- Roll up from children to parents (recursive)
    WITH RECURSIVE hierarchy_rollup AS (
        -- Base: Leaf shops (no children)
        SELECT
            sh.parent_shop_id,
            smc.capacity_period,
            smc.confirmed_railcars * (sh.capacity_share_percent / 100.0) as child_confirmed,
            smc.planned_railcars * (sh.capacity_share_percent / 100.0) as child_planned,
            smc.monthly_capacity_limit * (sh.capacity_share_percent / 100.0) as child_capacity,
            smc.remaining_available_railcars * (sh.capacity_share_percent / 100.0) as child_available,
            1 as depth
        FROM shop_hierarchy sh
        JOIN shop_monthly_capacity smc ON smc.shop_id = sh.child_shop_id
        WHERE sh.include_in_capacity_rollup = true
          AND sh.is_active = true
          AND (p_company_id IS NULL OR sh.company_id = p_company_id)

        UNION ALL

        -- Recursive: Roll up the tree
        SELECT
            sh.parent_shop_id,
            hr.capacity_period,
            hr.child_confirmed,
            hr.child_planned,
            hr.child_capacity,
            hr.child_available,
            hr.depth + 1
        FROM hierarchy_rollup hr
        JOIN shop_hierarchy sh ON sh.child_shop_id = hr.parent_shop_id
        WHERE sh.include_in_capacity_rollup = true
          AND sh.is_active = true
          AND hr.depth < 10  -- Prevent infinite loops
    )
    UPDATE shop_monthly_capacity smc SET
        children_confirmed_railcars = agg.total_child_confirmed,
        children_planned_railcars = agg.total_child_planned,
        network_total_capacity = smc.monthly_capacity_limit + agg.total_child_capacity,
        network_available_railcars = smc.remaining_available_railcars + agg.total_child_available
    FROM (
        SELECT
            parent_shop_id,
            capacity_period,
            ROUND(SUM(child_confirmed))::INT as total_child_confirmed,
            ROUND(SUM(child_planned))::INT as total_child_planned,
            ROUND(SUM(child_capacity))::INT as total_child_capacity,
            ROUND(SUM(child_available))::INT as total_child_available
        FROM hierarchy_rollup
        GROUP BY parent_shop_id, capacity_period
    ) agg
    WHERE smc.shop_id = agg.parent_shop_id
      AND smc.capacity_period = agg.capacity_period;
END;
$$ LANGUAGE plpgsql;

-- Alert generation job
CREATE OR REPLACE FUNCTION generate_capacity_alerts(p_company_id UUID DEFAULT NULL)
RETURNS TABLE(alert_type TEXT, shop_name TEXT, period TEXT, message TEXT) AS $$
BEGIN
    -- Over-capacity alerts
    RETURN QUERY
    SELECT
        'OVER_CAPACITY'::TEXT,
        s.name,
        TO_CHAR(smc.capacity_period, 'YYYY-MM'),
        FORMAT('Shop %s is at %s%% capacity (%s confirmed / %s limit)',
            s.name, smc.utilization_percent, smc.confirmed_railcars, smc.monthly_capacity_limit)
    FROM shop_monthly_capacity smc
    JOIN shop s ON s.id = smc.shop_id
    WHERE smc.is_over_capacity = true
      AND (p_company_id IS NULL OR smc.company_id = p_company_id);

    -- At-risk alerts (projected overflow)
    RETURN QUERY
    SELECT
        'AT_RISK'::TEXT,
        s.name,
        TO_CHAR(smc.capacity_period, 'YYYY-MM'),
        FORMAT('Shop %s projected at %s%% with planned work (%s total / %s limit)',
            s.name, smc.projected_utilization_percent, smc.total_committed_railcars, smc.monthly_capacity_limit)
    FROM shop_monthly_capacity smc
    JOIN shop s ON s.id = smc.shop_id
    WHERE smc.is_at_risk = true
      AND smc.is_over_capacity = false
      AND (p_company_id IS NULL OR smc.company_id = p_company_id);

    -- S&OP target behind alerts
    RETURN QUERY
    SELECT
        'SOP_BEHIND'::TEXT,
        s.name,
        TO_CHAR(smc.capacity_period, 'YYYY-MM'),
        FORMAT('Shop %s is at %s%% of S&OP target (%s completed / %s target)',
            s.name, ROUND(smc.sop_target_progress), smc.completed_railcars, smc.sop_target_railcars)
    FROM shop_monthly_capacity smc
    JOIN shop s ON s.id = smc.shop_id
    WHERE smc.sop_target_railcars > 0
      AND smc.sop_target_progress < 75
      AND smc.capacity_period <= CURRENT_DATE
      AND (p_company_id IS NULL OR smc.company_id = p_company_id);
END;
$$ LANGUAGE plpgsql;
```

---

## 4. Fixes for Existing Components

### 4.1 S&OP Target Setting Updates

```typescript
// backend/src/services/sopService.ts - Updated to use SSOT

import { prisma } from './db';
import { getShopCapacityFromSSOT } from './ssotCutover';

/**
 * Get S&OP progress from car_schedules SSOT
 */
export async function getSOPProgressFromSSOT(
  shopId: string,
  year: number,
  month: number
): Promise<{
  target: number;
  confirmed: number;
  completed: number;
  progress: number;
}> {
  const [sopCommitment, capacity] = await Promise.all([
    prisma.sOPCommitment.findFirst({
      where: { shopId, year, month },
    }),
    getShopCapacityFromSSOT(shopId, year, month),
  ]);

  const target = sopCommitment?.committedVolume || 0;

  // Get completed count from car_schedules
  const completed = await prisma.carSchedule.count({
    where: {
      shopId,
      plannedYear: year,
      plannedMonth: month,
      status: 'Complete',
    },
  });

  return {
    target,
    confirmed: capacity.confirmed,
    completed,
    progress: target > 0 ? Math.round((completed / target) * 100) : 0,
  };
}

/**
 * Auto-fill planned entries from S&OP targets (gap-fill)
 * Creates Draft schedules for unfilled capacity
 */
export async function autoFillFromSOPTargets(
  companyId: string,
  year: number,
  month: number
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  // Get all shops with S&OP commitments for this period
  const commitments = await prisma.sOPCommitment.findMany({
    where: { companyId, year, month },
    include: { shop: true },
  });

  for (const commitment of commitments) {
    const capacity = await getShopCapacityFromSSOT(commitment.shopId, year, month);
    const gap = commitment.committedVolume - capacity.total;

    if (gap <= 0) {
      skipped++;
      continue;
    }

    // Get cars that need shopping and aren't scheduled
    const unscheduledCars = await prisma.car.findMany({
      where: {
        companyId,
        shoppingStatus: { in: ['Urgent', 'MustShop', 'Upcoming'] },
        carSchedules: {
          none: {
            status: { notIn: ['Complete', 'Cancelled'] },
          },
        },
      },
      take: gap,
      orderBy: [
        { shoppingStatus: 'asc' }, // Urgent first
        { nextServiceDue: 'asc' },
      ],
    });

    for (const car of unscheduledCars) {
      await prisma.carSchedule.create({
        data: {
          carId: car.id,
          shopId: commitment.shopId,
          plannedYear: year,
          plannedMonth: month,
          status: 'Draft',
          source: 'sop_auto_fill',
          workType: 'full_qualification',
          companyId,
        },
      });
      created++;
    }
  }

  return { created, skipped };
}
```

### 4.2 Routing Wizard Updates

```typescript
// backend/src/services/routingWizardService.ts - SSOT-only queries

import { prisma } from './db';

/**
 * Get eligible shops for a car - queries SSOT for capacity
 */
export async function getEligibleShopsWithCapacity(
  carId: string,
  targetYear: number,
  targetMonth: number
): Promise<Array<{
  shopId: string;
  shopName: string;
  tier: number;
  confirmed: number;
  planned: number;
  available: number;
  capacityLimit: number;
  isRecommended: boolean;
}>> {
  const car = await prisma.car.findUnique({
    where: { id: carId },
    include: {
      carShopEligibility: {
        include: { shop: true },
      },
    },
  });

  if (!car) return [];

  // Get capacity from SSOT for each eligible shop
  const results = [];

  for (const eligibility of car.carShopEligibility) {
    // Query capacity directly from car_schedules (SSOT)
    const capacity = await prisma.carSchedule.groupBy({
      by: ['status'],
      where: {
        shopId: eligibility.shopId,
        plannedYear: targetYear,
        plannedMonth: targetMonth,
        status: { notIn: ['Complete', 'Cancelled'] },
      },
      _count: { id: true },
    });

    let confirmed = 0;
    let planned = 0;

    for (const c of capacity) {
      if (['Confirmed', 'InProgress'].includes(c.status)) {
        confirmed += c._count.id;
      } else {
        planned += c._count.id;
      }
    }

    const limit = eligibility.shop.capacity || 30;
    const available = Math.max(0, limit - confirmed);

    results.push({
      shopId: eligibility.shopId,
      shopName: eligibility.shop.name,
      tier: eligibility.shop.networkTier || 5,
      confirmed,
      planned,
      available,
      capacityLimit: limit,
      isRecommended: available > 0 && eligibility.isPrimary,
    });
  }

  // Sort by tier, then available capacity
  return results.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return b.available - a.available;
  });
}

/**
 * Check if car already has active schedule
 */
export async function hasActiveSchedule(carId: string): Promise<boolean> {
  const count = await prisma.carSchedule.count({
    where: {
      carId,
      status: { notIn: ['Complete', 'Cancelled'] },
    },
  });
  return count > 0;
}

/**
 * Create schedule from wizard (enforces one-active rule)
 */
export async function createScheduleFromWizard(data: {
  carId: string;
  shopId: string;
  plannedYear: number;
  plannedMonth: number;
  workType: string;
  shopReason: string;
  priority: number;
  userId: string;
  companyId: string;
}): Promise<{ success: boolean; scheduleId?: string; error?: string }> {
  // Check for existing
  const hasExisting = await hasActiveSchedule(data.carId);

  if (hasExisting) {
    return {
      success: false,
      error: 'Car already has an active schedule. Cancel or complete existing schedule first.',
    };
  }

  try {
    const schedule = await prisma.carSchedule.create({
      data: {
        carId: data.carId,
        shopId: data.shopId,
        plannedYear: data.plannedYear,
        plannedMonth: data.plannedMonth,
        workType: data.workType,
        shopReason: data.shopReason,
        priority: data.priority,
        status: 'Planned',
        source: 'routing_wizard',
        committedById: data.userId,
        committedAt: new Date(),
        companyId: data.companyId,
      },
    });

    return { success: true, scheduleId: schedule.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
```

### 4.3 Dashboard Updates

```typescript
// backend/src/routes/analytics.ts - Updated dashboard queries

import { Router } from 'express';
import { prisma } from '../services/db';

const router = Router();

/**
 * GET /api/analytics/dashboard
 * Master dashboard - ALL data from car_schedules SSOT
 */
router.get('/dashboard', async (req, res) => {
  const { companyId } = req.query;
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  try {
    // All counts from car_schedules (THE SSOT)
    const [statusCounts, workTypeCounts, upcomingShoppings, capacityAlerts] = await Promise.all([
      // Status breakdown
      prisma.carSchedule.groupBy({
        by: ['status'],
        where: { companyId: companyId as string },
        _count: { id: true },
      }),

      // Work type breakdown (active only)
      prisma.carSchedule.groupBy({
        by: ['workType'],
        where: {
          companyId: companyId as string,
          status: { notIn: ['Complete', 'Cancelled'] },
        },
        _count: { id: true },
      }),

      // Next 10 upcoming
      prisma.carSchedule.findMany({
        where: {
          companyId: companyId as string,
          status: { in: ['Confirmed', 'Planned'] },
          OR: [
            { plannedYear: { gt: currentYear } },
            { plannedYear: currentYear, plannedMonth: { gte: currentMonth } },
          ],
        },
        include: {
          car: { select: { railcarNumber: true } },
          shop: { select: { name: true } },
          customer: { select: { name: true } },
        },
        orderBy: [{ plannedYear: 'asc' }, { plannedMonth: 'asc' }],
        take: 10,
      }),

      // Capacity alerts
      prisma.shopMonthlyCapacity.findMany({
        where: {
          companyId: companyId as string,
          OR: [{ isOverCapacity: true }, { isAtRisk: true }],
        },
        include: { shop: { select: { name: true } } },
      }),
    ]);

    // Transform status counts
    const byStatus: Record<string, number> = {};
    for (const sc of statusCounts) {
      byStatus[sc.status] = sc._count.id;
    }

    // Transform work type counts
    const byWorkType: Record<string, number> = {};
    for (const wc of workTypeCounts) {
      byWorkType[wc.workType] = wc._count.id;
    }

    res.json({
      success: true,
      data: {
        summary: {
          totalActive: (byStatus.Draft || 0) + (byStatus.Planned || 0) +
                       (byStatus.Confirmed || 0) + (byStatus.InProgress || 0),
          draft: byStatus.Draft || 0,
          planned: byStatus.Planned || 0,
          confirmed: byStatus.Confirmed || 0,
          inProgress: byStatus.InProgress || 0,
          completed: byStatus.Complete || 0,
          cancelled: byStatus.Cancelled || 0,
        },
        byWorkType,
        upcomingShoppings: upcomingShoppings.map(s => ({
          id: s.id,
          railcarNumber: s.car.railcarNumber,
          shopName: s.shop?.name || 'TBD',
          customer: s.customer?.name,
          period: `${s.plannedYear}-${String(s.plannedMonth).padStart(2, '0')}`,
          status: s.status,
        })),
        alerts: capacityAlerts.map(a => ({
          shopName: a.shop.name,
          period: a.capacityPeriod,
          type: a.isOverCapacity ? 'OVER_CAPACITY' : 'AT_RISK',
          utilization: a.utilizationPercent,
        })),
        source: 'car_schedules_ssot',
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
```

### 4.4 Frontend Component Updates

```typescript
// frontend/src/services/api/schedules.ts - New SSOT API client

import { apiClient } from './client';

export interface CarSchedule {
  id: string;
  carId: string;
  shopId: string | null;
  customerId: string | null;
  plannedYear: number;
  plannedMonth: number;
  status: 'Draft' | 'Planned' | 'Confirmed' | 'InProgress' | 'Complete' | 'Cancelled';
  workType: string;
  priority: number;
  shopReason: string;
  estimatedCost: number | null;
  estimatedDays: number;
  source: string;
  // Relations (populated)
  car?: { railcarNumber: string; customer: string | null };
  shop?: { name: string; code: string };
  customer?: { name: string };
}

/**
 * Get all active schedules (SSOT)
 */
export async function getActiveSchedules(filters?: {
  companyId?: string;
  shopId?: string;
  status?: string[];
  plannedYear?: number;
  plannedMonth?: number;
}): Promise<CarSchedule[]> {
  const params = new URLSearchParams();
  if (filters?.companyId) params.set('companyId', filters.companyId);
  if (filters?.shopId) params.set('shopId', filters.shopId);
  if (filters?.status) params.set('status', filters.status.join(','));
  if (filters?.plannedYear) params.set('plannedYear', String(filters.plannedYear));
  if (filters?.plannedMonth) params.set('plannedMonth', String(filters.plannedMonth));

  const response = await apiClient.get(`/api/schedules?${params.toString()}`);
  return response.data.data;
}

/**
 * Get schedule for a specific car
 */
export async function getCarSchedule(carId: string): Promise<CarSchedule | null> {
  const response = await apiClient.get(`/api/schedules/car/${carId}/active`);
  return response.data.data;
}

/**
 * Create or update schedule
 */
export async function upsertSchedule(data: Partial<CarSchedule> & {
  carId: string;
  shopId: string;
  plannedYear: number;
  plannedMonth: number;
}): Promise<CarSchedule> {
  const response = await apiClient.post('/api/schedules', data);
  return response.data.data;
}

/**
 * Update schedule status
 */
export async function updateScheduleStatus(
  scheduleId: string,
  status: CarSchedule['status'],
  notes?: string
): Promise<CarSchedule> {
  const response = await apiClient.patch(`/api/schedules/${scheduleId}/status`, {
    status,
    notes,
  });
  return response.data.data;
}

/**
 * Get shop capacity from SSOT
 */
export async function getShopCapacity(
  shopId: string,
  year: number,
  month: number
): Promise<{
  confirmed: number;
  planned: number;
  available: number;
  limit: number;
  utilizationPercent: number;
}> {
  const response = await apiClient.get(
    `/api/schedules/shop/${shopId}/capacity?year=${year}&month=${month}`
  );
  return response.data.data;
}
```

---

## 5. Rollout & Validation Checklist

### 5.1 Pre-Migration Checklist

```markdown
## Pre-Migration Validation

### Data Quality
- [ ] Run all diagnostic queries from Section 1.1
- [ ] Document total duplicate count: ___
- [ ] Document total orphan count: ___
- [ ] Document capacity drift count: ___
- [ ] Review and approve cleanup rules with stakeholders

### Infrastructure
- [ ] PostgreSQL database provisioned (if migrating from SQLite)
- [ ] Backup of current database created
- [ ] Migration scripts tested in staging environment
- [ ] Rollback procedure documented and tested

### Application
- [ ] Shadow write middleware deployed
- [ ] Feature flags configured (SSOT_FLAGS)
- [ ] Monitoring dashboards set up
- [ ] Alerting configured for migration errors

### Team Readiness
- [ ] Operations team notified of migration window
- [ ] Support team briefed on expected behavior changes
- [ ] Rollback decision criteria defined
```

### 5.2 Migration Execution Checklist

```markdown
## Migration Execution

### Phase 1: Schema Preparation
- [ ] Backup database: `pg_dump -Fc mydb > backup_pre_migration.dump`
- [ ] Run schema migration: ALTER TABLE, ADD COLUMN
- [ ] Create migration tracking table
- [ ] Verify indexes created

### Phase 2: Shadow Mode (3-5 days)
- [ ] Enable shadow write middleware
- [ ] Monitor ssot_shadow_discrepancies view daily
- [ ] Fix any systematic discrepancies
- [ ] Verify dual-write is working

### Phase 3: Data Migration
- [ ] Announce maintenance window
- [ ] Run dry-run: `SELECT * FROM migrate_to_car_schedules('<id>', true);`
- [ ] Review dry-run results
- [ ] Execute migration: `SELECT * FROM migrate_to_car_schedules('<id>', false);`
- [ ] Verify migration_log counts
- [ ] Check for cars with multiple active schedules (should be 0)

### Phase 4: Cutover
- [ ] Flip READ_FROM_CAR_SCHEDULES = true
- [ ] Flip WRITE_TO_CAR_SCHEDULES = true
- [ ] Flip LEGACY_WRITE_ENABLED = false
- [ ] Enable database triggers
- [ ] Run full capacity recalculation
- [ ] Verify dashboard data matches expectations

### Phase 5: Validation
- [ ] Run post-migration health checks
- [ ] Verify capacity counters match
- [ ] Test creating new schedule (one-active enforcement)
- [ ] Test status transitions (FSM enforcement)
- [ ] Monitor error rates for 24-48 hours
```

### 5.3 Post-Migration Health Checks

```sql
-- Health Check 1: No duplicate active schedules
SELECT 'DUPLICATE_ACTIVE_CHECK' as check_name,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END as result,
    COUNT(*) as violation_count
FROM (
    SELECT car_id FROM car_schedules
    WHERE status NOT IN ('Complete', 'Cancelled')
    GROUP BY car_id HAVING COUNT(*) > 1
) dups;

-- Health Check 2: Capacity counters in sync
SELECT 'CAPACITY_SYNC_CHECK' as check_name,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END as result,
    COUNT(*) as violation_count
FROM shop_monthly_capacity smc
WHERE confirmed_railcars != (
    SELECT COUNT(*) FROM car_schedules cs
    WHERE cs.shop_id = smc.shop_id
      AND cs.planned_year = EXTRACT(YEAR FROM smc.capacity_period)
      AND cs.planned_month = EXTRACT(MONTH FROM smc.capacity_period)
      AND cs.status IN ('Confirmed', 'InProgress')
);

-- Health Check 3: All legacy sources migrated
SELECT 'MIGRATION_COMPLETE_CHECK' as check_name,
    source_table,
    CASE WHEN unmigrated = 0 THEN 'PASS' ELSE 'FAIL' END as result,
    unmigrated as remaining
FROM (
    SELECT 'CarFlowPlan' as source_table, COUNT(*) as unmigrated
    FROM car_flow_plan cfp
    WHERE cfp.status NOT IN ('Complete', 'Cancelled')
      AND NOT EXISTS (
          SELECT 1 FROM ssot_migration_log ml
          WHERE ml.source_table = 'CarFlowPlan' AND ml.source_id = cfp.id
      )
    UNION ALL
    SELECT 'MasterPlanCommitment', COUNT(*)
    FROM master_plan_commitment mpc
    WHERE mpc.status NOT IN ('COMPLETE', 'CANCELLED', 'SUPERSEDED')
      AND NOT EXISTS (
          SELECT 1 FROM ssot_migration_log ml
          WHERE ml.source_table = 'MasterPlanCommitment' AND ml.source_id = mpc.id
      )
) checks;

-- Health Check 4: FSM transitions valid
SELECT 'FSM_INTEGRITY_CHECK' as check_name,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END as result,
    COUNT(*) as violation_count
FROM schedule_audit_log sal
WHERE sal.action = 'UPDATE'
  AND sal.old_status IS NOT NULL
  AND sal.new_status IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM schedule_status_transitions sst
      WHERE sst.from_status = sal.old_status AND sst.to_status = sal.new_status
  );

-- Health Check 5: All schedules have required fields
SELECT 'REQUIRED_FIELDS_CHECK' as check_name,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END as result,
    COUNT(*) as violation_count
FROM car_schedules cs
WHERE cs.status NOT IN ('Complete', 'Cancelled')
  AND (cs.car_id IS NULL
       OR cs.company_id IS NULL
       OR cs.planned_year IS NULL
       OR cs.planned_month IS NULL);
```

### 5.4 Rollback Plan

```sql
-- ROLLBACK PROCEDURE - Execute in order if critical issues found

-- Step 1: Disable triggers
ALTER TABLE car_schedules DISABLE TRIGGER trg_enforce_one_active_schedule;
ALTER TABLE car_schedules DISABLE TRIGGER trg_validate_status_transition;
ALTER TABLE car_schedules DISABLE TRIGGER trg_update_capacity_on_schedule_change;

-- Step 2: Revert application flags (in code)
-- SSOT_FLAGS.READ_FROM_CAR_SCHEDULES = false
-- SSOT_FLAGS.WRITE_TO_CAR_SCHEDULES = false
-- SSOT_FLAGS.LEGACY_WRITE_ENABLED = true

-- Step 3: Restore capacity from CarFlowPlan counts
UPDATE sop_commitment sc SET
    current_usage = (
        SELECT COUNT(*) FROM car_flow_plan cfp
        WHERE cfp.shop_id = sc.shop_id
          AND cfp.planned_year = sc.year
          AND cfp.planned_month = sc.month
          AND cfp.status IN ('Confirmed', 'InProgress')
    );

-- Step 4: (Optional) Delete migrated schedules to reset
-- DELETE FROM car_schedules WHERE migrated_from IS NOT NULL;

-- Step 5: Restore from backup if needed
-- pg_restore -d mydb backup_pre_migration.dump
```

---

## 6. Edge Cases & Mitigations

### 6.1 Concurrent Assignment Attempts

**Scenario:** Two users try to schedule the same car simultaneously.

**Mitigation:**
```sql
-- Use FOR UPDATE to lock the row during check
CREATE OR REPLACE FUNCTION create_schedule_with_lock(
    p_car_id UUID,
    p_shop_id UUID,
    p_year INT,
    p_month INT,
    p_user_id UUID,
    p_company_id UUID
) RETURNS UUID AS $$
DECLARE
    v_existing_id UUID;
    v_new_id UUID;
BEGIN
    -- Lock check: Acquire advisory lock on car_id
    PERFORM pg_advisory_xact_lock(hashtext(p_car_id::text));

    -- Check for existing with row lock
    SELECT id INTO v_existing_id
    FROM car_schedules
    WHERE car_id = p_car_id
      AND status NOT IN ('Complete', 'Cancelled')
    FOR UPDATE NOWAIT;

    IF v_existing_id IS NOT NULL THEN
        RAISE EXCEPTION 'Car already has active schedule: %', v_existing_id
        USING ERRCODE = 'unique_violation';
    END IF;

    -- Create new schedule
    INSERT INTO car_schedules (
        id, car_id, shop_id, planned_year, planned_month,
        status, committed_by_id, committed_at, company_id
    ) VALUES (
        gen_random_uuid(), p_car_id, p_shop_id, p_year, p_month,
        'Planned', p_user_id, NOW(), p_company_id
    ) RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$ LANGUAGE plpgsql;
```

### 6.2 Legacy Data Gaps

**Scenario:** Historical records missing actuals, customer links, or dates.

**Mitigation:**
```sql
-- Backfill function for common gaps
CREATE OR REPLACE FUNCTION backfill_schedule_gaps(p_company_id UUID)
RETURNS TABLE(field_name TEXT, records_updated INT) AS $$
DECLARE
    v_count INT;
BEGIN
    -- Backfill customer from car
    UPDATE car_schedules cs SET
        customer_id = c.customer_id
    FROM car c
    WHERE cs.car_id = c.id
      AND cs.customer_id IS NULL
      AND c.customer_id IS NOT NULL
      AND cs.company_id = p_company_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN QUERY SELECT 'customer_id'::TEXT, v_count;

    -- Backfill estimated_days based on work_type
    UPDATE car_schedules SET
        estimated_days = CASE work_type
            WHEN 'full_qualification' THEN 21
            WHEN 'partial_qualification' THEN 14
            WHEN 'assignment' THEN 7
            WHEN 'release' THEN 5
            WHEN 'repair' THEN 10
            ELSE 14
        END
    WHERE estimated_days IS NULL OR estimated_days = 0
      AND company_id = p_company_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN QUERY SELECT 'estimated_days'::TEXT, v_count;

    -- Backfill shop_reason for completed records
    UPDATE car_schedules SET
        shop_reason = CASE work_type
            WHEN 'full_qualification' THEN 'Tank qualification due'
            WHEN 'assignment' THEN 'New lessee assignment'
            WHEN 'release' THEN 'Lease termination'
            ELSE 'Scheduled maintenance'
        END
    WHERE shop_reason = '' OR shop_reason IS NULL
      AND status IN ('Complete', 'InProgress')
      AND company_id = p_company_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN QUERY SELECT 'shop_reason'::TEXT, v_count;
END;
$$ LANGUAGE plpgsql;
```

### 6.3 Large-Scale Cleanup Performance

**Scenario:** Cleanup affects 10,000+ records, causing locks.

**Mitigation:**
```sql
-- Batch cleanup with progress tracking
CREATE OR REPLACE FUNCTION batch_cleanup_stale_plans(
    p_company_id UUID,
    p_batch_size INT DEFAULT 500,
    p_max_batches INT DEFAULT 100
) RETURNS TABLE(batch_num INT, records_updated INT) AS $$
DECLARE
    v_batch INT := 0;
    v_count INT;
    v_ids UUID[];
BEGIN
    LOOP
        v_batch := v_batch + 1;

        -- Get next batch of IDs
        SELECT array_agg(id) INTO v_ids
        FROM (
            SELECT id FROM car_schedules
            WHERE company_id = p_company_id
              AND status = 'Planned'
              AND planned_year < EXTRACT(YEAR FROM CURRENT_DATE)
              AND migrated_from IS NULL  -- Don't re-process
            ORDER BY created_at
            LIMIT p_batch_size
            FOR UPDATE SKIP LOCKED
        ) batch;

        EXIT WHEN v_ids IS NULL OR array_length(v_ids, 1) = 0;
        EXIT WHEN v_batch > p_max_batches;

        -- Update batch
        UPDATE car_schedules SET
            status = 'Cancelled',
            cancelled_at = NOW(),
            cancellation_reason = 'Auto-cancelled: Past period without progress'
        WHERE id = ANY(v_ids);

        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT v_batch, v_count;

        -- Commit and pause between batches
        COMMIT;
        PERFORM pg_sleep(0.1);
    END LOOP;
END;
$$ LANGUAGE plpgsql;
```

### 6.4 Shop Deactivation with Active Schedules

**Scenario:** Shop is deactivated but has active schedules.

**Mitigation:**
```sql
-- Trigger to prevent shop deactivation with active schedules
CREATE OR REPLACE FUNCTION prevent_shop_deactivation_with_schedules()
RETURNS TRIGGER AS $$
DECLARE
    v_active_count INT;
BEGIN
    IF OLD.is_active = true AND NEW.is_active = false THEN
        SELECT COUNT(*) INTO v_active_count
        FROM car_schedules
        WHERE shop_id = NEW.id
          AND status NOT IN ('Complete', 'Cancelled');

        IF v_active_count > 0 THEN
            RAISE EXCEPTION 'Cannot deactivate shop with % active schedules. Reassign or cancel first.',
                v_active_count
            USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_shop_deactivation
BEFORE UPDATE ON shop
FOR EACH ROW
EXECUTE FUNCTION prevent_shop_deactivation_with_schedules();
```

### 6.5 Timezone Handling for Multi-Region

**Scenario:** Shops in different timezones; capacity period boundaries unclear.

**Mitigation:**
```sql
-- Store all timestamps in UTC; use shop timezone for display
ALTER TABLE car_schedules
    ADD COLUMN IF NOT EXISTS scheduled_at_utc TIMESTAMP WITH TIME ZONE;

-- View that converts to local time
CREATE OR REPLACE VIEW v_schedules_local AS
SELECT
    cs.*,
    cs.scheduled_at_utc AT TIME ZONE s.timezone as scheduled_at_local,
    EXTRACT(YEAR FROM cs.scheduled_at_utc AT TIME ZONE s.timezone) as local_year,
    EXTRACT(MONTH FROM cs.scheduled_at_utc AT TIME ZONE s.timezone) as local_month
FROM car_schedules cs
JOIN shop s ON s.id = cs.shop_id;
```

---

## Appendix: Full SQL Scripts

### A.1 Complete Schema DDL

```sql
-- car_schedules table (SSOT)
CREATE TABLE IF NOT EXISTS car_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Core relationships
    car_id UUID NOT NULL REFERENCES car(id),
    shop_id UUID REFERENCES shop(id),
    customer_id UUID REFERENCES customer(id),

    -- Planning period
    planned_year INTEGER NOT NULL,
    planned_month INTEGER NOT NULL CHECK (planned_month BETWEEN 1 AND 12),

    -- Work classification
    work_type VARCHAR(50) DEFAULT 'full_qualification',
    aar_job_codes JSONB DEFAULT '[]',

    -- Status (FSM enforced)
    status VARCHAR(20) NOT NULL DEFAULT 'Draft'
        CHECK (status IN ('Draft', 'Planned', 'Confirmed', 'InProgress', 'Complete', 'Cancelled')),

    -- Priority & risk
    priority INTEGER DEFAULT 3 CHECK (priority BETWEEN 1 AND 4),
    demurrage_risk_level VARCHAR(20) DEFAULT 'LOW',
    shop_reason TEXT DEFAULT '',

    -- Estimates
    estimated_cost DECIMAL(12, 2),
    estimated_days INTEGER DEFAULT 14,

    -- Actuals
    actual_cost DECIMAL(12, 2),
    actual_days INTEGER,
    actual_start_date TIMESTAMP,
    actual_completion_date TIMESTAMP,

    -- Scheduling
    scheduled_arrival_date TIMESTAMP,
    scheduled_completion_date TIMESTAMP,

    -- Source tracking
    source VARCHAR(50) DEFAULT 'manual',
    source_id UUID,
    migrated_from VARCHAR(50),
    migrated_at TIMESTAMP,
    migration_notes TEXT,

    -- Coordination
    event_coordinator_id UUID REFERENCES "user"(id),
    qualification_extended BOOLEAN DEFAULT false,
    qualification_entry_id UUID,

    -- Optimistic locking
    version INTEGER DEFAULT 1,

    -- Audit timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    committed_at TIMESTAMP,
    committed_by_id UUID REFERENCES "user"(id),
    updated_at TIMESTAMP DEFAULT NOW(),
    cancelled_at TIMESTAMP,
    cancelled_by_id UUID REFERENCES "user"(id),
    cancellation_reason TEXT,

    -- Multi-tenant
    company_id UUID NOT NULL REFERENCES company(id),

    -- Notes
    notes TEXT DEFAULT ''
);

-- Indexes
CREATE INDEX idx_cs_car_status ON car_schedules(car_id, status);
CREATE INDEX idx_cs_shop_period ON car_schedules(shop_id, planned_year, planned_month);
CREATE INDEX idx_cs_company_status ON car_schedules(company_id, status, planned_year, planned_month);
CREATE INDEX idx_cs_status ON car_schedules(status);
CREATE INDEX idx_cs_source ON car_schedules(migrated_from, source_id);

-- Partial unique index (THE KEY CONSTRAINT)
CREATE UNIQUE INDEX idx_cs_one_active_per_car
ON car_schedules(car_id)
WHERE status NOT IN ('Complete', 'Cancelled');
```

### A.2 Trigger Installation Script

```sql
-- Run this after creating the car_schedules table

-- 1. One-active enforcement
\i triggers/enforce_one_active_schedule.sql

-- 2. Status FSM validation
\i triggers/validate_status_transition.sql

-- 3. Capacity hooks
\i triggers/update_capacity_on_schedule_change.sql

-- 4. Optimistic locking
\i triggers/enforce_optimistic_locking.sql

-- 5. Audit logging
\i triggers/audit_schedule_changes.sql

-- Verify all triggers
SELECT
    tgname as trigger_name,
    tgenabled as enabled,
    pg_get_triggerdef(oid) as definition
FROM pg_trigger
WHERE tgrelid = 'car_schedules'::regclass
ORDER BY tgname;
```

### A.3 Nightly Job Scheduler

```sql
-- pg_cron jobs (requires pg_cron extension)

-- Capacity recalculation at 2:00 AM
SELECT cron.schedule(
    'nightly-capacity-recalc',
    '0 2 * * *',
    $$SELECT recalculate_all_capacity(NULL)$$
);

-- Hierarchy rollup at 2:30 AM
SELECT cron.schedule(
    'nightly-hierarchy-rollup',
    '30 2 * * *',
    $$SELECT recalculate_network_capacity_rollup(NULL)$$
);

-- Alert generation at 3:00 AM
SELECT cron.schedule(
    'nightly-alert-generation',
    '0 3 * * *',
    $$
    INSERT INTO system_alerts (type, shop_name, period, message, created_at)
    SELECT alert_type, shop_name, period, message, NOW()
    FROM generate_capacity_alerts(NULL)
    $$
);

-- Stale record cleanup (weekly, Sunday at 4 AM)
SELECT cron.schedule(
    'weekly-stale-cleanup',
    '0 4 * * 0',
    $$SELECT batch_cleanup_stale_plans(NULL, 1000, 50)$$
);
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-13 | System | Initial comprehensive plan |

---

**END OF DOCUMENT**
