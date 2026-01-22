-- ============================================================================
-- Data Assessment & Diagnostic Queries
-- Run these to identify data integrity issues before migration
-- ============================================================================

-- ===========================================================================
-- SECTION 1: DUPLICATE DETECTION
-- ===========================================================================

-- 1.1 Find railcars with multiple active assignments across ALL source tables
SELECT
    c.railcar_number,
    aa.car_id,
    COUNT(*) as active_count,
    GROUP_CONCAT(DISTINCT aa.source) as sources,
    GROUP_CONCAT(DISTINCT aa.status) as statuses
FROM (
    -- CarFlowPlan active records
    SELECT car_id, 'CarFlowPlan' as source, id, status, planned_year, planned_month, shop_id
    FROM car_flow_plan
    WHERE status IN ('Planned', 'InProgress', 'Confirmed', 'Scheduled')

    UNION ALL

    -- MasterPlanCommitment active records
    SELECT car_id, 'MasterPlanCommitment' as source, id, status, planned_year, planned_month, shop_id
    FROM master_plan_commitment
    WHERE status IN ('DRAFT', 'PLANNED', 'SCHEDULED', 'IN_PROGRESS')

    UNION ALL

    -- UnifiedAssignment active records
    SELECT car_id, 'UnifiedAssignment' as source, id, status, planned_year, planned_month, shop_id
    FROM unified_assignment
    WHERE status IN ('DRAFT', 'PENDING_REVIEW', 'COMMITTED', 'IN_PROGRESS')

    UNION ALL

    -- ServicePlanCar confirmed records
    SELECT car_id, 'ServicePlanCar' as source, id, status,
           COALESCE(user_assigned_year, auto_assigned_year) as planned_year,
           COALESCE(user_assigned_month, auto_assigned_month) as planned_month,
           assigned_shop_id as shop_id
    FROM service_plan_car
    WHERE status IN ('pending', 'confirmed')
) aa
JOIN car c ON c.id = aa.car_id
GROUP BY c.railcar_number, aa.car_id
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC, c.railcar_number;

-- 1.2 Find duplicates within UnifiedAssignment only
SELECT
    c.railcar_number,
    ua.car_id,
    COUNT(*) as duplicate_count,
    GROUP_CONCAT(ua.status) as statuses,
    GROUP_CONCAT(ua.source_type) as sources
FROM unified_assignment ua
JOIN car c ON c.id = ua.car_id
WHERE ua.status NOT IN ('COMPLETED', 'CANCELLED', 'SUPERSEDED')
GROUP BY c.railcar_number, ua.car_id
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

-- ===========================================================================
-- SECTION 2: STATUS INCONSISTENCIES
-- ===========================================================================

-- 2.1 Status mismatches between CarFlowPlan and MasterPlanCommitment
SELECT
    c.railcar_number,
    cfp.id as cfp_id,
    cfp.status as cfp_status,
    mpc.id as mpc_id,
    mpc.status as mpc_status,
    cfp.planned_year || '-' || printf('%02d', cfp.planned_month) as period,
    CASE
        WHEN cfp.shop_id != mpc.shop_id THEN 'SHOP_MISMATCH'
        ELSE 'STATUS_ONLY'
    END as mismatch_type
FROM car_flow_plan cfp
JOIN master_plan_commitment mpc
    ON cfp.car_id = mpc.car_id
    AND cfp.planned_year = mpc.planned_year
    AND cfp.planned_month = mpc.planned_month
JOIN car c ON c.id = cfp.car_id
WHERE cfp.status NOT IN ('Complete', 'Cancelled')
  AND mpc.status NOT IN ('COMPLETE', 'CANCELLED', 'SUPERSEDED', 'DEFERRED')
ORDER BY c.railcar_number;

-- 2.2 Car shoppingStatus out of sync with actual assignments
SELECT
    c.railcar_number,
    c.id as car_id,
    c.shopping_status as stored_status,
    CASE
        WHEN c.status IN ('Arrived', 'InShop') THEN 'InShop'
        WHEN c.status = 'Complete' THEN 'Compliant'
        WHEN EXISTS (
            SELECT 1 FROM unified_assignment ua
            WHERE ua.car_id = c.id
              AND ua.status IN ('DRAFT', 'PENDING_REVIEW', 'COMMITTED', 'IN_PROGRESS')
        ) THEN 'Planned'
        ELSE 'Unknown'
    END as calculated_status,
    CASE
        WHEN c.shopping_status != CASE
            WHEN c.status IN ('Arrived', 'InShop') THEN 'InShop'
            WHEN c.status = 'Complete' THEN 'Compliant'
            WHEN EXISTS (
                SELECT 1 FROM unified_assignment ua
                WHERE ua.car_id = c.id
                  AND ua.status IN ('DRAFT', 'PENDING_REVIEW', 'COMMITTED', 'IN_PROGRESS')
            ) THEN 'Planned'
            ELSE 'Unknown'
        END THEN 'MISMATCH'
        ELSE 'OK'
    END as status
FROM car c
WHERE c.shopping_status IS NOT NULL;

-- ===========================================================================
-- SECTION 3: ORPHANED RECORDS
-- ===========================================================================

-- 3.1 CarFlowPlan with deleted cars
SELECT cfp.id, cfp.car_id, cfp.status, cfp.planned_year, cfp.planned_month
FROM car_flow_plan cfp
LEFT JOIN car c ON c.id = cfp.car_id
WHERE c.id IS NULL;

-- 3.2 CarFlowPlan with deleted shops
SELECT cfp.id, cfp.car_id, cfp.shop_id, cfp.status
FROM car_flow_plan cfp
LEFT JOIN shop s ON s.id = cfp.shop_id
WHERE s.id IS NULL AND cfp.shop_id IS NOT NULL;

-- 3.3 MasterPlanCommitment with no parent MasterPlan
SELECT mpc.id, mpc.car_id, mpc.master_plan_id, mpc.status
FROM master_plan_commitment mpc
LEFT JOIN master_plan mp ON mp.id = mpc.master_plan_id
WHERE mp.id IS NULL;

-- 3.4 ServicePlanCar with archived parent plans
SELECT spc.id, spc.car_id, spc.service_plan_id, sp.status as plan_status
FROM service_plan_car spc
LEFT JOIN service_plan sp ON sp.id = spc.service_plan_id
WHERE sp.id IS NULL OR sp.status = 'archived';

-- 3.5 UnifiedAssignment with deleted references
SELECT ua.id, ua.car_id, ua.shop_id,
    CASE WHEN c.id IS NULL THEN 'CAR_MISSING' ELSE '' END ||
    CASE WHEN s.id IS NULL AND ua.shop_id IS NOT NULL THEN 'SHOP_MISSING' ELSE '' END as issues
FROM unified_assignment ua
LEFT JOIN car c ON c.id = ua.car_id
LEFT JOIN shop s ON s.id = ua.shop_id
WHERE c.id IS NULL OR (s.id IS NULL AND ua.shop_id IS NOT NULL);

-- ===========================================================================
-- SECTION 4: CAPACITY DRIFT DETECTION
-- ===========================================================================

-- 4.1 SOPCommitment currentUsage vs actual CarFlowPlan count
SELECT
    s.name as shop_name,
    sc.year,
    sc.month,
    sc.current_usage as stored_usage,
    (
        SELECT COUNT(*)
        FROM car_flow_plan cfp
        WHERE cfp.shop_id = sc.shop_id
          AND cfp.planned_year = sc.year
          AND cfp.planned_month = sc.month
          AND cfp.status IN ('Confirmed', 'InProgress', 'Scheduled')
    ) as actual_confirmed,
    (
        SELECT COUNT(*)
        FROM car_flow_plan cfp
        WHERE cfp.shop_id = sc.shop_id
          AND cfp.planned_year = sc.year
          AND cfp.planned_month = sc.month
          AND cfp.status IN ('Confirmed', 'InProgress', 'Scheduled')
    ) - COALESCE(sc.current_usage, 0) as drift
FROM sop_commitment sc
JOIN shop s ON s.id = sc.shop_id
WHERE ABS((
    SELECT COUNT(*)
    FROM car_flow_plan cfp
    WHERE cfp.shop_id = sc.shop_id
      AND cfp.planned_year = sc.year
      AND cfp.planned_month = sc.month
      AND cfp.status IN ('Confirmed', 'InProgress', 'Scheduled')
) - COALESCE(sc.current_usage, 0)) > 0
ORDER BY ABS((
    SELECT COUNT(*)
    FROM car_flow_plan cfp
    WHERE cfp.shop_id = sc.shop_id
      AND cfp.planned_year = sc.year
      AND cfp.planned_month = sc.month
      AND cfp.status IN ('Confirmed', 'InProgress', 'Scheduled')
) - COALESCE(sc.current_usage, 0)) DESC;

-- 4.2 UnifiedAssignment capacity vs SOPCommitment
SELECT
    s.name as shop_name,
    ua_agg.planned_year,
    ua_agg.planned_month,
    ua_agg.confirmed_count as ua_confirmed,
    ua_agg.planned_count as ua_planned,
    COALESCE(sc.current_usage, 0) as sop_usage,
    COALESCE(sc.committed_volume, 0) as sop_capacity,
    ua_agg.confirmed_count - COALESCE(sc.current_usage, 0) as drift
FROM (
    SELECT
        shop_id,
        planned_year,
        planned_month,
        SUM(CASE WHEN status IN ('COMMITTED', 'IN_PROGRESS') THEN 1 ELSE 0 END) as confirmed_count,
        SUM(CASE WHEN status IN ('DRAFT', 'PENDING_REVIEW') THEN 1 ELSE 0 END) as planned_count
    FROM unified_assignment
    WHERE status NOT IN ('COMPLETED', 'CANCELLED', 'SUPERSEDED')
    GROUP BY shop_id, planned_year, planned_month
) ua_agg
JOIN shop s ON s.id = ua_agg.shop_id
LEFT JOIN sop_commitment sc
    ON sc.shop_id = ua_agg.shop_id
    AND sc.year = ua_agg.planned_year
    AND sc.month = ua_agg.planned_month;

-- ===========================================================================
-- SECTION 5: MISSING LINKAGES
-- ===========================================================================

-- 5.1 Active assignments missing customer
SELECT
    c.railcar_number,
    ua.id as assignment_id,
    ua.status,
    ua.planned_year || '-' || printf('%02d', ua.planned_month) as period,
    c.customer_id as car_customer_id,
    'Missing customer_id on assignment' as issue
FROM unified_assignment ua
JOIN car c ON c.id = ua.car_id
WHERE ua.status NOT IN ('COMPLETED', 'CANCELLED', 'SUPERSEDED')
  AND ua.customer_id IS NULL
  AND c.customer_id IS NOT NULL;

-- 5.2 Assignments missing source tracking
SELECT id, car_id, status, source_type, original_assignment_id
FROM unified_assignment
WHERE (source_type IS NULL OR source_type = '')
  AND status NOT IN ('COMPLETED', 'CANCELLED', 'SUPERSEDED');

-- 5.3 Completed work missing actuals
SELECT
    c.railcar_number,
    ua.id,
    ua.status,
    ua.estimated_cost,
    ua.actual_cost,
    ua.estimated_days,
    ua.actual_days,
    CASE
        WHEN ua.actual_cost IS NULL THEN 'MISSING_ACTUAL_COST '
        ELSE ''
    END ||
    CASE
        WHEN ua.actual_days IS NULL THEN 'MISSING_ACTUAL_DAYS '
        ELSE ''
    END as missing_fields
FROM unified_assignment ua
JOIN car c ON c.id = ua.car_id
WHERE ua.status = 'COMPLETED'
  AND (ua.actual_cost IS NULL OR ua.actual_days IS NULL);

-- ===========================================================================
-- SECTION 6: DATA QUALITY SUMMARY
-- ===========================================================================

-- 6.1 Comprehensive summary report
SELECT 'Total Cars' as metric, COUNT(*) as value FROM car
UNION ALL
SELECT 'Total Unified Assignments', COUNT(*) FROM unified_assignment
UNION ALL
SELECT 'Active UA (not complete/cancelled)', COUNT(*) FROM unified_assignment
    WHERE status NOT IN ('COMPLETED', 'CANCELLED', 'SUPERSEDED')
UNION ALL
SELECT 'Cars with Duplicate Active', COUNT(*) FROM (
    SELECT car_id FROM unified_assignment
    WHERE status NOT IN ('COMPLETED', 'CANCELLED', 'SUPERSEDED')
    GROUP BY car_id HAVING COUNT(*) > 1
)
UNION ALL
SELECT 'Orphaned UA (missing car)', COUNT(*) FROM unified_assignment ua
    LEFT JOIN car c ON c.id = ua.car_id WHERE c.id IS NULL
UNION ALL
SELECT 'CarFlowPlan records', COUNT(*) FROM car_flow_plan
UNION ALL
SELECT 'CFP Active', COUNT(*) FROM car_flow_plan
    WHERE status IN ('Planned', 'Confirmed', 'InProgress')
UNION ALL
SELECT 'MasterPlanCommitment records', COUNT(*) FROM master_plan_commitment
UNION ALL
SELECT 'MPC Active', COUNT(*) FROM master_plan_commitment
    WHERE status NOT IN ('COMPLETE', 'CANCELLED', 'SUPERSEDED', 'DEFERRED')
UNION ALL
SELECT 'ServicePlanCar Confirmed', COUNT(*) FROM service_plan_car
    WHERE status = 'confirmed'
UNION ALL
SELECT 'Shops with SOPCommitment', COUNT(DISTINCT shop_id) FROM sop_commitment;

-- 6.2 Cross-table coverage analysis
SELECT
    'Records to migrate' as category,
    source_table,
    COUNT(*) as count
FROM (
    SELECT 'CarFlowPlan' as source_table, id FROM car_flow_plan
        WHERE status NOT IN ('Complete', 'Cancelled')
          AND id NOT IN (SELECT source_id FROM unified_assignment WHERE migrated_from = 'CarFlowPlan' AND source_id IS NOT NULL)
    UNION ALL
    SELECT 'MasterPlanCommitment', id FROM master_plan_commitment
        WHERE status NOT IN ('COMPLETE', 'CANCELLED', 'SUPERSEDED', 'DEFERRED')
          AND id NOT IN (SELECT source_id FROM unified_assignment WHERE migrated_from = 'MasterPlanCommitment' AND source_id IS NOT NULL)
    UNION ALL
    SELECT 'ServicePlanCar', id FROM service_plan_car
        WHERE status = 'confirmed' AND assigned_shop_id IS NOT NULL
          AND id NOT IN (SELECT source_id FROM unified_assignment WHERE migrated_from = 'ServicePlanCar' AND source_id IS NOT NULL)
) unmigrated
GROUP BY source_table;
