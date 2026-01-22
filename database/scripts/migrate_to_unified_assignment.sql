-- ============================================================================
-- Migration Script: Consolidate to UnifiedAssignment SSOT
-- Run after: 001_ssot_schema_enhancements.sql
-- ============================================================================

-- ===========================================================================
-- STEP 0: Pre-Migration Cleanup
-- ===========================================================================

-- Archive orphaned CarFlowPlan records (missing car)
UPDATE car_flow_plan
SET status = 'Cancelled',
    notes = notes || ' [CLEANUP: Car record deleted - ' || datetime('now') || ']'
WHERE car_id NOT IN (SELECT id FROM car)
  AND status NOT IN ('Complete', 'Cancelled');

-- Archive orphaned CarFlowPlan records (missing shop)
UPDATE car_flow_plan
SET status = 'Cancelled',
    notes = notes || ' [CLEANUP: Shop record deleted - ' || datetime('now') || ']'
WHERE shop_id NOT IN (SELECT id FROM shop)
  AND status NOT IN ('Complete', 'Cancelled')
  AND shop_id IS NOT NULL;

-- ===========================================================================
-- STEP 1: Migrate CarFlowPlan (Highest Priority)
-- ===========================================================================

-- Insert CarFlowPlan records not already in UnifiedAssignment
INSERT INTO unified_assignment (
    id,
    car_id,
    shop_id,
    customer_id,
    planned_year,
    planned_month,
    scheduled_month,
    status,
    source_type,
    source_id,
    migrated_from,
    migrated_at,
    shop_reason,
    estimated_cost,
    estimated_days,
    priority,
    rule_notes,
    committed_at,
    committed_by_id,
    company_id
)
SELECT
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))),2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) ||
    substr(lower(hex(randomblob(2))),2) || '-' ||
    lower(hex(randomblob(6))) as id,
    cfp.car_id,
    cfp.shop_id,
    cfp.customer_id,
    cfp.planned_year,
    cfp.planned_month,
    cfp.planned_year || '-' || printf('%02d', cfp.planned_month) as scheduled_month,
    CASE cfp.status
        WHEN 'Planned' THEN 'PENDING_REVIEW'
        WHEN 'Confirmed' THEN 'COMMITTED'
        WHEN 'Scheduled' THEN 'COMMITTED'
        WHEN 'InProgress' THEN 'IN_PROGRESS'
        WHEN 'Complete' THEN 'COMPLETED'
        WHEN 'Cancelled' THEN 'CANCELLED'
        ELSE 'DRAFT'
    END as status,
    'migration' as source_type,
    cfp.id as source_id,
    'CarFlowPlan' as migrated_from,
    datetime('now') as migrated_at,
    COALESCE(cfp.shop_reason, '') as shop_reason,
    cfp.estimated_cost,
    14 as estimated_days,
    COALESCE(cfp.priority, 3) as priority,
    COALESCE(cfp.notes, '') as rule_notes,
    cfp.committed_at,
    cfp.committed_by_id,
    cfp.company_id
FROM car_flow_plan cfp
WHERE NOT EXISTS (
    -- Skip if already migrated
    SELECT 1 FROM unified_assignment ua
    WHERE ua.source_id = cfp.id
      AND ua.migrated_from = 'CarFlowPlan'
)
AND NOT EXISTS (
    -- Skip if car already has active assignment (avoid duplicates)
    SELECT 1 FROM unified_assignment ua
    WHERE ua.car_id = cfp.car_id
      AND ua.status NOT IN ('COMPLETED', 'CANCELLED', 'SUPERSEDED')
      AND cfp.status NOT IN ('Complete', 'Cancelled')
)
-- Prioritize by status (InProgress > Confirmed > Planned)
ORDER BY
    CASE cfp.status
        WHEN 'InProgress' THEN 1
        WHEN 'Confirmed' THEN 2
        WHEN 'Scheduled' THEN 3
        WHEN 'Planned' THEN 4
        ELSE 5
    END,
    cfp.committed_at DESC;

-- Log migration results
INSERT INTO ssot_migration_log (id, source_table, source_id, target_id, migration_action, migration_notes)
SELECT
    lower(hex(randomblob(16))) as id,
    'CarFlowPlan' as source_table,
    cfp.id as source_id,
    ua.id as target_id,
    'CREATED' as migration_action,
    'Migrated from CarFlowPlan status: ' || cfp.status as migration_notes
FROM car_flow_plan cfp
JOIN unified_assignment ua ON ua.source_id = cfp.id AND ua.migrated_from = 'CarFlowPlan'
WHERE NOT EXISTS (
    SELECT 1 FROM ssot_migration_log ml
    WHERE ml.source_table = 'CarFlowPlan' AND ml.source_id = cfp.id
);

-- ===========================================================================
-- STEP 2: Migrate MasterPlanCommitment (Supplement/Merge)
-- ===========================================================================

-- For cars that already have UnifiedAssignment, supplement with MPC data
UPDATE unified_assignment
SET
    scheduled_arrival_date = COALESCE(unified_assignment.scheduled_arrival_date,
        (SELECT mpc.scheduled_arrival_date FROM master_plan_commitment mpc
         WHERE mpc.car_id = unified_assignment.car_id
           AND mpc.planned_year = unified_assignment.planned_year
           AND mpc.planned_month = unified_assignment.planned_month
           AND mpc.status NOT IN ('COMPLETE', 'CANCELLED', 'SUPERSEDED', 'DEFERRED')
         LIMIT 1)),
    scheduled_completion_date = COALESCE(unified_assignment.scheduled_completion_date,
        (SELECT mpc.scheduled_completion_date FROM master_plan_commitment mpc
         WHERE mpc.car_id = unified_assignment.car_id
           AND mpc.planned_year = unified_assignment.planned_year
           AND mpc.planned_month = unified_assignment.planned_month
           AND mpc.status NOT IN ('COMPLETE', 'CANCELLED', 'SUPERSEDED', 'DEFERRED')
         LIMIT 1)),
    qualification_entry_id = COALESCE(unified_assignment.qualification_entry_id,
        (SELECT mpc.qualification_entry_id FROM master_plan_commitment mpc
         WHERE mpc.car_id = unified_assignment.car_id
           AND mpc.planned_year = unified_assignment.planned_year
           AND mpc.planned_month = unified_assignment.planned_month
           AND mpc.status NOT IN ('COMPLETE', 'CANCELLED', 'SUPERSEDED', 'DEFERRED')
         LIMIT 1)),
    migration_notes = COALESCE(unified_assignment.migration_notes, '') || ' Supplemented from MPC'
WHERE EXISTS (
    SELECT 1 FROM master_plan_commitment mpc
    WHERE mpc.car_id = unified_assignment.car_id
      AND mpc.planned_year = unified_assignment.planned_year
      AND mpc.planned_month = unified_assignment.planned_month
      AND mpc.status NOT IN ('COMPLETE', 'CANCELLED', 'SUPERSEDED', 'DEFERRED')
);

-- Insert MPC records for cars without existing assignments
INSERT INTO unified_assignment (
    id,
    car_id,
    shop_id,
    customer_id,
    planned_year,
    planned_month,
    scheduled_month,
    status,
    source_type,
    source_id,
    migrated_from,
    migrated_at,
    work_type,
    shop_reason,
    qualification_entry_id,
    scheduled_arrival_date,
    scheduled_completion_date,
    company_id
)
SELECT
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))),2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) ||
    substr(lower(hex(randomblob(2))),2) || '-' ||
    lower(hex(randomblob(6))) as id,
    mpc.car_id,
    mpc.shop_id,
    mpc.customer_id,
    mpc.planned_year,
    mpc.planned_month,
    mpc.planned_year || '-' || printf('%02d', mpc.planned_month) as scheduled_month,
    CASE mpc.status
        WHEN 'DRAFT' THEN 'DRAFT'
        WHEN 'PLANNED' THEN 'PENDING_REVIEW'
        WHEN 'SCHEDULED' THEN 'COMMITTED'
        WHEN 'IN_PROGRESS' THEN 'IN_PROGRESS'
        ELSE 'DRAFT'
    END as status,
    'migration' as source_type,
    mpc.id as source_id,
    'MasterPlanCommitment' as migrated_from,
    datetime('now') as migrated_at,
    mpc.work_type,
    COALESCE(mpc.shop_reason, '') as shop_reason,
    mpc.qualification_entry_id,
    mpc.scheduled_arrival_date,
    mpc.scheduled_completion_date,
    mpc.company_id
FROM master_plan_commitment mpc
WHERE mpc.status NOT IN ('COMPLETE', 'CANCELLED', 'SUPERSEDED', 'DEFERRED')
AND NOT EXISTS (
    SELECT 1 FROM unified_assignment ua
    WHERE ua.car_id = mpc.car_id
      AND ua.status NOT IN ('COMPLETED', 'CANCELLED', 'SUPERSEDED')
)
AND NOT EXISTS (
    SELECT 1 FROM ssot_migration_log ml
    WHERE ml.source_table = 'MasterPlanCommitment' AND ml.source_id = mpc.id
);

-- Log MPC migrations
INSERT INTO ssot_migration_log (id, source_table, source_id, target_id, migration_action, migration_notes)
SELECT
    lower(hex(randomblob(16))) as id,
    'MasterPlanCommitment' as source_table,
    mpc.id as source_id,
    ua.id as target_id,
    CASE
        WHEN ua.migrated_from = 'MasterPlanCommitment' THEN 'CREATED'
        ELSE 'MERGED'
    END as migration_action,
    'Status: ' || mpc.status as migration_notes
FROM master_plan_commitment mpc
LEFT JOIN unified_assignment ua ON ua.source_id = mpc.id AND ua.migrated_from = 'MasterPlanCommitment'
WHERE mpc.status NOT IN ('COMPLETE', 'CANCELLED', 'SUPERSEDED', 'DEFERRED')
AND NOT EXISTS (
    SELECT 1 FROM ssot_migration_log ml
    WHERE ml.source_table = 'MasterPlanCommitment' AND ml.source_id = mpc.id
);

-- ===========================================================================
-- STEP 3: Migrate ServicePlanCar (Confirmed Only)
-- ===========================================================================

INSERT INTO unified_assignment (
    id,
    car_id,
    shop_id,
    customer_id,
    planned_year,
    planned_month,
    scheduled_month,
    status,
    source_type,
    source_id,
    migrated_from,
    migrated_at,
    shop_reason,
    committed_at,
    committed_by_id,
    company_id
)
SELECT
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))),2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) ||
    substr(lower(hex(randomblob(2))),2) || '-' ||
    lower(hex(randomblob(6))) as id,
    spc.car_id,
    spc.assigned_shop_id,
    sp.customer_id,
    COALESCE(spc.user_assigned_year, spc.auto_assigned_year),
    COALESCE(spc.user_assigned_month, spc.auto_assigned_month),
    COALESCE(spc.user_assigned_year, spc.auto_assigned_year) || '-' ||
        printf('%02d', COALESCE(spc.user_assigned_month, spc.auto_assigned_month)) as scheduled_month,
    'COMMITTED' as status,
    'migration' as source_type,
    spc.id as source_id,
    'ServicePlanCar' as migrated_from,
    datetime('now') as migrated_at,
    COALESCE(spc.shop_reason, '') as shop_reason,
    spc.confirmed_at,
    spc.confirmed_by_id,
    sp.company_id
FROM service_plan_car spc
JOIN service_plan sp ON sp.id = spc.service_plan_id
WHERE spc.status = 'confirmed'
  AND spc.assigned_shop_id IS NOT NULL
  AND COALESCE(spc.user_assigned_year, spc.auto_assigned_year) IS NOT NULL
  AND COALESCE(spc.user_assigned_month, spc.auto_assigned_month) IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM unified_assignment ua
      WHERE ua.car_id = spc.car_id
        AND ua.status NOT IN ('COMPLETED', 'CANCELLED', 'SUPERSEDED')
  )
  AND NOT EXISTS (
      SELECT 1 FROM ssot_migration_log ml
      WHERE ml.source_table = 'ServicePlanCar' AND ml.source_id = spc.id
  );

-- Log ServicePlanCar migrations
INSERT INTO ssot_migration_log (id, source_table, source_id, target_id, migration_action, migration_notes)
SELECT
    lower(hex(randomblob(16))) as id,
    'ServicePlanCar' as source_table,
    spc.id as source_id,
    ua.id as target_id,
    'CREATED' as migration_action,
    'From service plan: ' || sp.name as migration_notes
FROM service_plan_car spc
JOIN service_plan sp ON sp.id = spc.service_plan_id
JOIN unified_assignment ua ON ua.source_id = spc.id AND ua.migrated_from = 'ServicePlanCar'
WHERE NOT EXISTS (
    SELECT 1 FROM ssot_migration_log ml
    WHERE ml.source_table = 'ServicePlanCar' AND ml.source_id = spc.id
);

-- ===========================================================================
-- STEP 4: Backfill Missing Data
-- ===========================================================================

-- Backfill customer_id from car record
UPDATE unified_assignment
SET customer_id = (
    SELECT c.customer_id FROM car c WHERE c.id = unified_assignment.car_id
)
WHERE customer_id IS NULL
  AND EXISTS (
      SELECT 1 FROM car c WHERE c.id = unified_assignment.car_id AND c.customer_id IS NOT NULL
  );

-- Set default estimated_days based on work_type
UPDATE unified_assignment
SET estimated_days = CASE work_type
    WHEN 'full_qualification' THEN 21
    WHEN 'partial_qualification' THEN 14
    WHEN 'assignment' THEN 7
    WHEN 'release' THEN 5
    WHEN 'repair' THEN 10
    ELSE 14
END
WHERE (estimated_days IS NULL OR estimated_days = 0);

-- Set default shop_reason for completed records
UPDATE unified_assignment
SET shop_reason = CASE work_type
    WHEN 'full_qualification' THEN 'Tank qualification due'
    WHEN 'assignment' THEN 'New lessee assignment'
    WHEN 'release' THEN 'Lease termination'
    ELSE 'Scheduled maintenance'
END
WHERE (shop_reason = '' OR shop_reason IS NULL)
  AND status IN ('COMPLETED', 'IN_PROGRESS');

-- ===========================================================================
-- STEP 5: Migration Summary Report
-- ===========================================================================

-- View migration results
SELECT
    source_table,
    migration_action,
    COUNT(*) as count
FROM ssot_migration_log
GROUP BY source_table, migration_action
ORDER BY source_table, migration_action;

-- Verify no duplicate active assignments
SELECT
    'DUPLICATE CHECK' as check_type,
    CASE
        WHEN COUNT(*) = 0 THEN 'PASS - No duplicates'
        ELSE 'FAIL - ' || COUNT(*) || ' cars with duplicates'
    END as result
FROM (
    SELECT car_id
    FROM unified_assignment
    WHERE status NOT IN ('COMPLETED', 'CANCELLED', 'SUPERSEDED')
    GROUP BY car_id
    HAVING COUNT(*) > 1
);

-- Final counts
SELECT 'MIGRATION COMPLETE' as status,
    (SELECT COUNT(*) FROM ssot_migration_log WHERE migration_action = 'CREATED') as created,
    (SELECT COUNT(*) FROM ssot_migration_log WHERE migration_action = 'MERGED') as merged,
    (SELECT COUNT(*) FROM ssot_migration_log WHERE migration_action = 'SKIPPED') as skipped;
