# SSOT Implementation Index

## Quick Reference for Data Integrity & SSOT Migration

**Single Source of Truth Table:** `UnifiedAssignment`

---

## Implementation Files

### Documentation
| File | Purpose |
|------|---------|
| `docs/DATA_INTEGRITY_SSOT_RESCUE_PLAN.md` | Complete migration guide (detailed) |
| `docs/SSOT_IMPLEMENTATION_INDEX.md` | This quick reference |

### Database Scripts
| File | Purpose | When to Run |
|------|---------|-------------|
| `database/migrations/001_ssot_schema_enhancements.sql` | Add SSOT columns to UnifiedAssignment | Before migration |
| `database/scripts/data_assessment_queries.sql` | Diagnostic queries for data issues | Before migration |
| `database/scripts/migrate_to_unified_assignment.sql` | Migration from legacy tables | During migration |

### Services
| File | Purpose |
|------|---------|
| `backend/src/services/ssotIntegrityService.ts` | Core SSOT enforcement (one-active, FSM, capacity) |
| `backend/src/services/ssotBatchJobs.ts` | Nightly jobs (capacity sync, alerts, cleanup) |
| `backend/src/services/sstConsolidationService.ts` | Existing migration utilities (enhanced) |

---

## Status FSM

```
                    ┌─────────────┐
                    │    DRAFT    │
                    └──────┬──────┘
                           │
                           ▼
                ┌──────────────────────┐
                │   PENDING_REVIEW     │
                └──────────┬───────────┘
                           │
                           ▼
                    ┌─────────────┐
        ┌──────────│  COMMITTED  │
        │          └──────┬──────┘
        │                 │
        │                 ▼
        │          ┌─────────────┐
        │          │ IN_PROGRESS │
        │          └──────┬──────┘
        │                 │
        ▼                 ▼
┌─────────────┐    ┌─────────────┐
│  CANCELLED  │    │  COMPLETED  │
└─────────────┘    └─────────────┘
```

**Terminal States:** COMPLETED, CANCELLED, SUPERSEDED

---

## Key Constraints

### One Active Per Car
```typescript
// Only one assignment per car where status NOT IN terminal states
// Enforced via: ssotIntegrityService.validateOneActiveRule()
```

### Capacity Impact
| Status | Deducts Capacity | Visibility |
|--------|------------------|------------|
| DRAFT | No | Yes |
| PENDING_REVIEW | No | Yes |
| COMMITTED | **Yes** | Yes |
| IN_PROGRESS | **Yes** | Yes |
| COMPLETED | No (released) | Historical |
| CANCELLED | No (released) | Historical |

---

## Migration Quick Start

### 1. Run Diagnostic Queries
```bash
sqlite3 prisma/dev.db < database/scripts/data_assessment_queries.sql
```

### 2. Apply Schema Enhancements
```bash
sqlite3 prisma/dev.db < database/migrations/001_ssot_schema_enhancements.sql
```

### 3. Run Migration
```bash
sqlite3 prisma/dev.db < database/scripts/migrate_to_unified_assignment.sql
```

### 4. Verify Results
```sql
-- Check for duplicates (should be 0)
SELECT car_id, COUNT(*)
FROM unified_assignment
WHERE status NOT IN ('COMPLETED', 'CANCELLED', 'SUPERSEDED')
GROUP BY car_id HAVING COUNT(*) > 1;

-- Check migration log
SELECT source_table, migration_action, COUNT(*)
FROM ssot_migration_log
GROUP BY source_table, migration_action;
```

---

## API Usage

### Create Assignment (with enforcement)
```typescript
import { createAssignment } from '@/services/ssotIntegrityService';

const assignment = await createAssignment({
  carId: 'car-uuid',
  shopId: 'shop-uuid',
  plannedYear: 2026,
  plannedMonth: 3,
  workType: 'full_qualification',
  companyId: 'company-uuid',
  committedById: 'user-uuid',
});
```

### Update Status (with FSM validation)
```typescript
import { transitionStatus } from '@/services/ssotIntegrityService';

await transitionStatus(
  'assignment-uuid',
  'COMMITTED',
  'user-uuid',
  'Approved by coordinator'
);
```

### Get Capacity from SSOT
```typescript
import { getShopCapacityFromSSOT } from '@/services/ssotIntegrityService';

const capacity = await getShopCapacityFromSSOT('shop-uuid', 2026, 3);
// { confirmed: 12, planned: 5, total: 17, limit: 20, available: 8, utilizationPercent: 60 }
```

### Run Nightly Jobs
```typescript
import { runNightlyJobs } from '@/services/ssotBatchJobs';

const results = await runNightlyJobs('company-uuid');
```

---

## Legacy Table Mapping

| Legacy Table | Status Mapping | Migration Priority |
|--------------|----------------|-------------------|
| CarFlowPlan.Planned | → PENDING_REVIEW | 1 (highest) |
| CarFlowPlan.Confirmed | → COMMITTED | 1 |
| CarFlowPlan.InProgress | → IN_PROGRESS | 1 |
| MasterPlanCommitment.SCHEDULED | → COMMITTED | 2 |
| MasterPlanCommitment.IN_PROGRESS | → IN_PROGRESS | 2 |
| ServicePlanCar.confirmed | → COMMITTED | 3 |

---

## Monitoring Queries

### Capacity Drift Detection
```sql
SELECT
  s.name, sc.year, sc.month,
  sc.current_usage as stored,
  (SELECT COUNT(*) FROM unified_assignment ua
   WHERE ua.shop_id = sc.shop_id
   AND ua.planned_year = sc.year
   AND ua.planned_month = sc.month
   AND ua.status IN ('COMMITTED', 'IN_PROGRESS')) as actual
FROM sop_commitment sc
JOIN shop s ON s.id = sc.shop_id;
```

### Duplicate Active Assignments
```sql
SELECT car_id, COUNT(*), GROUP_CONCAT(status)
FROM unified_assignment
WHERE status NOT IN ('COMPLETED', 'CANCELLED', 'SUPERSEDED')
GROUP BY car_id
HAVING COUNT(*) > 1;
```

---

## Rollback

If issues occur during migration:

1. **Disable new writes to UnifiedAssignment**
   ```typescript
   // In ssotIntegrityService.ts
   const SSOT_ENABLED = false;
   ```

2. **Restore from migration log**
   ```sql
   -- Delete records created during migration
   DELETE FROM unified_assignment
   WHERE migrated_from IS NOT NULL
   AND migrated_at > '2026-01-13';
   ```

3. **Re-enable legacy table writes**

---

## Health Checks

Run these post-migration:

```sql
-- No duplicate actives
SELECT 'DUPLICATE_CHECK',
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM (SELECT car_id FROM unified_assignment
      WHERE status NOT IN ('COMPLETED','CANCELLED','SUPERSEDED')
      GROUP BY car_id HAVING COUNT(*) > 1);

-- All legacy migrated
SELECT 'MIGRATION_COMPLETE',
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM car_flow_plan
WHERE status NOT IN ('Complete', 'Cancelled')
  AND id NOT IN (SELECT source_id FROM ssot_migration_log
                 WHERE source_table = 'CarFlowPlan');
```

---

## Contact

For issues with this implementation, check:
1. Migration log: `ssot_migration_log` table
2. Audit trail: `schedule_audit_log` table
3. Application logs: Search for `[SSOT]` prefix
