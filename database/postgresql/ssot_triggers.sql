-- ============================================================================
-- PostgreSQL SSOT Triggers for UnifiedAssignment
-- Use when migrating from SQLite to PostgreSQL for production
-- ============================================================================

-- ===========================================================================
-- 1. PARTIAL UNIQUE INDEX - One Active Per Car
-- ===========================================================================

-- This is the KEY constraint enforced at database level
CREATE UNIQUE INDEX IF NOT EXISTS idx_ua_one_active_per_car
ON unified_assignment (car_id)
WHERE status NOT IN ('COMPLETED', 'CANCELLED', 'SUPERSEDED');

-- ===========================================================================
-- 2. STATUS FSM VALIDATION TRIGGER
-- ===========================================================================

-- Valid transitions table
CREATE TABLE IF NOT EXISTS schedule_status_transitions (
    from_status VARCHAR(20),
    to_status VARCHAR(20),
    PRIMARY KEY (from_status, to_status)
);

INSERT INTO schedule_status_transitions (from_status, to_status) VALUES
    ('DRAFT', 'PENDING_REVIEW'),
    ('DRAFT', 'COMMITTED'),
    ('DRAFT', 'IN_PROGRESS'),
    ('DRAFT', 'CANCELLED'),
    ('PENDING_REVIEW', 'DRAFT'),
    ('PENDING_REVIEW', 'COMMITTED'),
    ('PENDING_REVIEW', 'IN_PROGRESS'),
    ('PENDING_REVIEW', 'CANCELLED'),
    ('COMMITTED', 'PENDING_REVIEW'),
    ('COMMITTED', 'IN_PROGRESS'),
    ('COMMITTED', 'CANCELLED'),
    ('IN_PROGRESS', 'COMPLETED'),
    ('IN_PROGRESS', 'CANCELLED')
ON CONFLICT DO NOTHING;

-- FSM Trigger Function
CREATE OR REPLACE FUNCTION validate_ua_status_transition()
RETURNS TRIGGER AS $$
BEGIN
    -- Skip validation for new records
    IF TG_OP = 'INSERT' THEN
        -- Set default timestamps
        IF NEW.status = 'COMMITTED' THEN
            NEW.committed_at := COALESCE(NEW.committed_at, NOW());
        END IF;
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
        RAISE EXCEPTION 'Invalid status transition: % → %. Allowed from %: %',
            OLD.status, NEW.status, OLD.status,
            (SELECT string_agg(to_status, ', ')
             FROM schedule_status_transitions
             WHERE from_status = OLD.status)
        USING ERRCODE = 'check_violation';
    END IF;

    -- Set timestamps for specific transitions
    IF NEW.status = 'COMMITTED' AND OLD.status != 'COMMITTED' THEN
        NEW.committed_at := COALESCE(NEW.committed_at, NOW());
    ELSIF NEW.status = 'IN_PROGRESS' THEN
        NEW.actual_start_date := COALESCE(NEW.actual_start_date, NOW());
    ELSIF NEW.status = 'COMPLETED' THEN
        NEW.actual_completion_date := COALESCE(NEW.actual_completion_date, NOW());
    ELSIF NEW.status = 'CANCELLED' THEN
        NEW.cancelled_at := COALESCE(NEW.cancelled_at, NOW());
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_ua_status ON unified_assignment;
CREATE TRIGGER trg_validate_ua_status
BEFORE INSERT OR UPDATE ON unified_assignment
FOR EACH ROW
EXECUTE FUNCTION validate_ua_status_transition();

-- ===========================================================================
-- 3. ONE-ACTIVE ENFORCEMENT TRIGGER (Backup to Index)
-- ===========================================================================

CREATE OR REPLACE FUNCTION enforce_one_active_assignment()
RETURNS TRIGGER AS $$
DECLARE
    v_existing_count INT;
BEGIN
    -- Skip if transitioning TO a terminal state
    IF NEW.status IN ('COMPLETED', 'CANCELLED', 'SUPERSEDED') THEN
        RETURN NEW;
    END IF;

    -- Check for other active assignments for this car
    SELECT COUNT(*) INTO v_existing_count
    FROM unified_assignment
    WHERE car_id = NEW.car_id
      AND id != NEW.id
      AND status NOT IN ('COMPLETED', 'CANCELLED', 'SUPERSEDED');

    IF v_existing_count > 0 THEN
        RAISE EXCEPTION 'Car % already has an active assignment. Cancel or complete existing first.',
            NEW.car_id
        USING ERRCODE = 'unique_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_one_active ON unified_assignment;
CREATE TRIGGER trg_enforce_one_active
BEFORE INSERT OR UPDATE ON unified_assignment
FOR EACH ROW
EXECUTE FUNCTION enforce_one_active_assignment();

-- ===========================================================================
-- 4. CAPACITY UPDATE TRIGGER
-- ===========================================================================

CREATE OR REPLACE FUNCTION update_capacity_on_ua_change()
RETURNS TRIGGER AS $$
DECLARE
    v_confirmed_statuses TEXT[] := ARRAY['COMMITTED', 'IN_PROGRESS'];
    v_planned_statuses TEXT[] := ARRAY['DRAFT', 'PENDING_REVIEW'];
    v_terminal_statuses TEXT[] := ARRAY['COMPLETED', 'CANCELLED', 'SUPERSEDED'];
BEGIN
    -- Handle DELETE
    IF TG_OP = 'DELETE' THEN
        IF OLD.shop_id IS NOT NULL THEN
            IF OLD.status = ANY(v_confirmed_statuses) THEN
                UPDATE sop_commitment
                SET current_usage = GREATEST(0, current_usage - 1)
                WHERE shop_id = OLD.shop_id
                  AND year = OLD.planned_year
                  AND month = OLD.planned_month;
            END IF;
        END IF;
        RETURN OLD;
    END IF;

    -- Handle INSERT
    IF TG_OP = 'INSERT' THEN
        IF NEW.shop_id IS NOT NULL AND NEW.status = ANY(v_confirmed_statuses) THEN
            -- Upsert capacity
            INSERT INTO sop_commitment (id, shop_id, year, month, committed_volume, current_usage, company_id)
            SELECT
                gen_random_uuid(), NEW.shop_id, NEW.planned_year, NEW.planned_month,
                COALESCE(s.capacity, 30), 1, NEW.company_id
            FROM shop s WHERE s.id = NEW.shop_id
            ON CONFLICT (shop_id, year, month) DO UPDATE
            SET current_usage = sop_commitment.current_usage + 1;
        END IF;
        RETURN NEW;
    END IF;

    -- Handle UPDATE
    IF TG_OP = 'UPDATE' THEN
        -- Shop or period changed
        IF OLD.shop_id IS DISTINCT FROM NEW.shop_id
           OR OLD.planned_year != NEW.planned_year
           OR OLD.planned_month != NEW.planned_month THEN

            -- Remove from old location
            IF OLD.shop_id IS NOT NULL AND OLD.status = ANY(v_confirmed_statuses) THEN
                UPDATE sop_commitment
                SET current_usage = GREATEST(0, current_usage - 1)
                WHERE shop_id = OLD.shop_id
                  AND year = OLD.planned_year
                  AND month = OLD.planned_month;
            END IF;

            -- Add to new location
            IF NEW.shop_id IS NOT NULL AND NEW.status = ANY(v_confirmed_statuses) THEN
                INSERT INTO sop_commitment (id, shop_id, year, month, committed_volume, current_usage, company_id)
                SELECT
                    gen_random_uuid(), NEW.shop_id, NEW.planned_year, NEW.planned_month,
                    COALESCE(s.capacity, 30), 1, NEW.company_id
                FROM shop s WHERE s.id = NEW.shop_id
                ON CONFLICT (shop_id, year, month) DO UPDATE
                SET current_usage = sop_commitment.current_usage + 1;
            END IF;

        -- Status changed (same location)
        ELSIF OLD.status != NEW.status AND NEW.shop_id IS NOT NULL THEN
            -- Was confirmed, now not
            IF OLD.status = ANY(v_confirmed_statuses) AND NOT (NEW.status = ANY(v_confirmed_statuses)) THEN
                UPDATE sop_commitment
                SET current_usage = GREATEST(0, current_usage - 1)
                WHERE shop_id = NEW.shop_id
                  AND year = NEW.planned_year
                  AND month = NEW.planned_month;
            -- Was not confirmed, now is
            ELSIF NOT (OLD.status = ANY(v_confirmed_statuses)) AND NEW.status = ANY(v_confirmed_statuses) THEN
                INSERT INTO sop_commitment (id, shop_id, year, month, committed_volume, current_usage, company_id)
                SELECT
                    gen_random_uuid(), NEW.shop_id, NEW.planned_year, NEW.planned_month,
                    COALESCE(s.capacity, 30), 1, NEW.company_id
                FROM shop s WHERE s.id = NEW.shop_id
                ON CONFLICT (shop_id, year, month) DO UPDATE
                SET current_usage = sop_commitment.current_usage + 1;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_capacity ON unified_assignment;
CREATE TRIGGER trg_update_capacity
AFTER INSERT OR UPDATE OR DELETE ON unified_assignment
FOR EACH ROW
EXECUTE FUNCTION update_capacity_on_ua_change();

-- ===========================================================================
-- 5. OPTIMISTIC LOCKING TRIGGER
-- ===========================================================================

CREATE OR REPLACE FUNCTION enforce_ua_optimistic_locking()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- Auto-increment version
        NEW.version := COALESCE(OLD.version, 0) + 1;
        NEW.updated_at := NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ua_optimistic_lock ON unified_assignment;
CREATE TRIGGER trg_ua_optimistic_lock
BEFORE UPDATE ON unified_assignment
FOR EACH ROW
EXECUTE FUNCTION enforce_ua_optimistic_locking();

-- ===========================================================================
-- 6. AUDIT LOGGING TRIGGER
-- ===========================================================================

CREATE TABLE IF NOT EXISTS schedule_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID NOT NULL,
    car_id UUID NOT NULL,
    action VARCHAR(20) NOT NULL,
    old_status VARCHAR(20),
    new_status VARCHAR(20),
    old_shop_id UUID,
    new_shop_id UUID,
    changed_fields JSONB,
    changed_by_id UUID,
    changed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_schedule ON schedule_audit_log(schedule_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_car ON schedule_audit_log(car_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_time ON schedule_audit_log(changed_at);

CREATE OR REPLACE FUNCTION audit_ua_changes()
RETURNS TRIGGER AS $$
DECLARE
    v_changed_fields JSONB := '{}';
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO schedule_audit_log (schedule_id, car_id, action, old_status, old_shop_id)
        VALUES (OLD.id, OLD.car_id, 'DELETE', OLD.status, OLD.shop_id);
        RETURN OLD;
    END IF;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO schedule_audit_log (schedule_id, car_id, action, new_status, new_shop_id, changed_by_id)
        VALUES (NEW.id, NEW.car_id, 'INSERT', NEW.status, NEW.shop_id, NEW.committed_by_id);
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Build changed fields
        IF OLD.status != NEW.status THEN
            v_changed_fields := v_changed_fields || jsonb_build_object('status',
                jsonb_build_object('old', OLD.status, 'new', NEW.status));
        END IF;
        IF OLD.shop_id IS DISTINCT FROM NEW.shop_id THEN
            v_changed_fields := v_changed_fields || jsonb_build_object('shop_id',
                jsonb_build_object('old', OLD.shop_id, 'new', NEW.shop_id));
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

DROP TRIGGER IF EXISTS trg_audit_ua ON unified_assignment;
CREATE TRIGGER trg_audit_ua
AFTER INSERT OR UPDATE OR DELETE ON unified_assignment
FOR EACH ROW
EXECUTE FUNCTION audit_ua_changes();

-- ===========================================================================
-- 7. SHOP DEACTIVATION PROTECTION
-- ===========================================================================

CREATE OR REPLACE FUNCTION prevent_shop_deactivation_with_assignments()
RETURNS TRIGGER AS $$
DECLARE
    v_active_count INT;
BEGIN
    IF OLD.is_active = true AND NEW.is_active = false THEN
        SELECT COUNT(*) INTO v_active_count
        FROM unified_assignment
        WHERE shop_id = NEW.id
          AND status NOT IN ('COMPLETED', 'CANCELLED', 'SUPERSEDED');

        IF v_active_count > 0 THEN
            RAISE EXCEPTION 'Cannot deactivate shop with % active assignments. Reassign first.',
                v_active_count
            USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_shop_deactivation ON shop;
CREATE TRIGGER trg_shop_deactivation
BEFORE UPDATE ON shop
FOR EACH ROW
EXECUTE FUNCTION prevent_shop_deactivation_with_assignments();

-- ===========================================================================
-- 8. NIGHTLY CAPACITY RECALCULATION FUNCTION
-- ===========================================================================

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

        -- Recalculate each period
        UPDATE sop_commitment sc SET
            current_usage = COALESCE((
                SELECT COUNT(*)
                FROM unified_assignment ua
                WHERE ua.shop_id = sc.shop_id
                  AND ua.planned_year = sc.year
                  AND ua.planned_month = sc.month
                  AND ua.status IN ('COMMITTED', 'IN_PROGRESS')
            ), 0)
        WHERE sc.shop_id = v_shop.id;

        GET DIAGNOSTICS v_periods_updated = ROW_COUNT;

        RETURN QUERY SELECT v_shop.id, v_periods_updated;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ===========================================================================
-- 9. VERIFICATION QUERIES
-- ===========================================================================

-- Verify all triggers are installed
SELECT
    tgname as trigger_name,
    CASE tgenabled WHEN 'O' THEN 'enabled' ELSE 'disabled' END as status,
    tgrelid::regclass as table_name
FROM pg_trigger
WHERE tgrelid IN ('unified_assignment'::regclass, 'shop'::regclass)
  AND NOT tgisinternal
ORDER BY tgrelid, tgname;

-- Verify unique index exists
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'unified_assignment'
  AND indexdef LIKE '%WHERE%';
