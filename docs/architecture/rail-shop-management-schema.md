# Rail Shop Management System - Database Schema Design

## Overview

This document proposes enhanced database schema for the railcar shop management system, focusing on:
- **ShopTier**: Tiered classification system (Tier 1/2/3) with AAR capabilities
- **ShopHierarchy**: Parent-child relationships with capacity roll-up
- **Shop Monthly Capacity**: Confirmed vs. planned capacity tracking
- **S&OP Target Integration**: Target vs. actual performance tracking

---

## 1. ShopTier Model

Defines the classification tiers for repair shops based on AAR certification levels and capabilities.

### Schema Definition

```prisma
// =============================================================================
// SHOP TIER - AAR Certification-Based Shop Classification
// =============================================================================
// Tier 1: Heavy repair / Full qualification shops (AAR M-1003 certified)
// Tier 2: Light/intermediate repair shops
// Tier 3: Mobile/field service or quick-service/overflow shops
// =============================================================================

model ShopTier {
  id                      String   @id @default(uuid())

  // Core identification
  tierLevel               Int      @unique // 1, 2, or 3
  name                    String   // "Heavy Repair", "Intermediate", "Field Service"
  code                    String   @unique // "TIER1", "TIER2", "TIER3"
  description             String   @default("")

  // AAR Certification Requirements
  aarCertificationRequired Boolean @default(false) // Must have AAR M-1003?
  aarCertificationTypes   String   @default("[]") // JSON: ["M-1003", "M-1002", "S-2043"]
  dotCertificationRequired Boolean @default(false) // DOT tank car certification?

  // Capability Flags (what this tier CAN do)
  canPerformHeavyRepair   Boolean  @default(false) // Major structural repairs
  canPerformWheelWork     Boolean  @default(false) // Wheel replacement/truing
  canPerformTankRequalification Boolean @default(false) // 10-year tank quals
  canPerformPainting      Boolean  @default(false) // Full body painting
  canPerformBlasting      Boolean  @default(false) // Sand/shot blasting
  canPerformWelding       Boolean  @default(false) // Structural welding
  canPerformLiningWork    Boolean  @default(false) // Tank lining application
  canPerformHydroTesting  Boolean  @default(false) // Hydrostatic testing
  canPerformUltrasonicTesting Boolean @default(false) // UT thickness testing
  canPerformRule88B       Boolean  @default(false) // AAR Rule 88B work
  canPerformPreventiveMaint Boolean @default(true) // Routine PM work
  canPerformQuickService  Boolean  @default(true) // Quick turnaround repairs
  canPerformFieldService  Boolean  @default(false) // On-site/mobile service

  // Typical capacity ranges (for planning guidance)
  typicalMinCapacity      Int      @default(0) // Min cars/month for this tier
  typicalMaxCapacity      Int      @default(100) // Max cars/month for this tier
  typicalTurnTimeDays     Int      @default(14) // Expected turn time

  // Overcommit allowance (Tier 1 shops may have flexibility to exceed capacity)
  defaultOvercommitPct    Float    @default(0.0) // Default overcommit % (e.g., 0.10 = 10%)

  // Cost expectations
  laborRateMultiplier     Float    @default(1.0) // vs. baseline
  overheadMultiplier      Float    @default(1.0) // vs. baseline

  // Routing priority (lower = preferred for matching work types)
  routingPriority         Int      @default(5) // 1-10 scale

  // Escalation rules
  canEscalateTo           String   @default("[]") // JSON: tier codes this can escalate to
  canReceiveFrom          String   @default("[]") // JSON: tier codes that can send work here

  // Status
  isActive                Boolean  @default(true)

  // Company ownership (multi-tenant)
  companyId               String
  company                 Company  @relation(fields: [companyId], references: [id])

  // Relations
  shops                   Shop[]   @relation("ShopTier")

  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt

  @@unique([tierLevel, companyId])
  @@index([companyId])
  @@index([tierLevel])
}
```

### Default Tier Definitions

| Tier | Name | Code | Key Capabilities | Typical Capacity | Overcommit |
|------|------|------|------------------|------------------|------------|
| **1** | Heavy Repair / Qualification | `TIER1` | Full AAR M-1003, tank requalification, hydro testing, wheel work, heavy structural | 20-50 cars/month | 10% |
| **2** | Intermediate Repair | `TIER2` | Light structural, component replacement, PM, Rule 88B | 30-80 cars/month | 5% |
| **3** | Field/Quick Service | `TIER3` | Mobile/on-site, quick repairs, overflow, emergency response | 10-30 cars/month | 0% |

### Seed Data SQL

```sql
-- Tier 1: Heavy Repair / Full Qualification (10% overcommit allowed)
INSERT INTO ShopTier (id, tierLevel, name, code, description,
  aarCertificationRequired, aarCertificationTypes, dotCertificationRequired,
  canPerformHeavyRepair, canPerformWheelWork, canPerformTankRequalification,
  canPerformPainting, canPerformBlasting, canPerformWelding, canPerformLiningWork,
  canPerformHydroTesting, canPerformUltrasonicTesting, canPerformRule88B,
  typicalMinCapacity, typicalMaxCapacity, typicalTurnTimeDays, defaultOvercommitPct,
  routingPriority, canEscalateTo, canReceiveFrom, companyId)
VALUES (
  uuid(), 1, 'Heavy Repair / Qualification', 'TIER1',
  'Full-service AAR-certified facility capable of heavy structural repairs, tank requalifications, and wheel work',
  true, '["M-1003", "M-1002"]', true,
  true, true, true, true, true, true, true, true, true, true,
  20, 50, 21, 0.10,  -- 10% overcommit allowance
  1, '[]', '["TIER2", "TIER3"]', '<company_id>'
);

-- Tier 2: Intermediate Repair (5% overcommit allowed)
INSERT INTO ShopTier (id, tierLevel, name, code, description,
  aarCertificationRequired, canPerformHeavyRepair, canPerformWheelWork,
  canPerformTankRequalification, canPerformWelding, canPerformRule88B,
  canPerformPreventiveMaint, typicalMinCapacity, typicalMaxCapacity,
  typicalTurnTimeDays, defaultOvercommitPct, routingPriority,
  canEscalateTo, canReceiveFrom, companyId)
VALUES (
  uuid(), 2, 'Intermediate Repair', 'TIER2',
  'Light-to-medium repair facility for component work, PM, and Rule 88B compliance',
  false, false, false, false, true, true, true,
  30, 80, 14, 0.05,  -- 5% overcommit allowance
  2, '["TIER1"]', '["TIER3"]', '<company_id>'
);

-- Tier 3: Field/Quick Service (no overcommit - already flexible)
INSERT INTO ShopTier (id, tierLevel, name, code, description,
  canPerformFieldService, canPerformQuickService, canPerformPreventiveMaint,
  typicalMinCapacity, typicalMaxCapacity, typicalTurnTimeDays, defaultOvercommitPct,
  routingPriority, canEscalateTo, canReceiveFrom, companyId)
VALUES (
  uuid(), 3, 'Field/Quick Service', 'TIER3',
  'Mobile units, field service crews, and overflow/quick-turnaround locations',
  true, true, true,
  10, 30, 7, 0.00,  -- No overcommit (field service is inherently flexible)
  3, '["TIER2", "TIER1"]', '[]', '<company_id>'
);
```

### Shop Tier Assignments

Current shop network tier classifications:

| Tier | Shops | Capabilities |
|------|-------|--------------|
| **Tier 1** | Trinity, Curry, AITX | Full AAR M-1003, tank requalification, hydro testing, wheel work, heavy structural |
| **Tier 2** | Guardian/Cathcart, Cypress, TMC, Iron Horse | Light structural, component replacement, PM, Rule 88B |
| **Tier 3** | All others | Field service, quick repairs, overflow, emergency response |

```sql
-- Example: Assign existing shops to tiers
UPDATE Shop SET tierId = (SELECT id FROM ShopTier WHERE code = 'TIER1')
WHERE name IN ('Trinity', 'Curry', 'AITX');

UPDATE Shop SET tierId = (SELECT id FROM ShopTier WHERE code = 'TIER2')
WHERE name IN ('Guardian', 'Cathcart', 'Cypress', 'TMC', 'Iron Horse');

UPDATE Shop SET tierId = (SELECT id FROM ShopTier WHERE code = 'TIER3')
WHERE tierId IS NULL;  -- All others default to Tier 3
```

---

## 2. Shop Model Enhancement

Update existing Shop model to reference ShopTier.

### Schema Changes

```prisma
model Shop {
  // ... existing fields ...

  // NEW: Shop Tier Reference (replaces networkTier integer)
  tierId                 String?          // FK to ShopTier
  tier                   ShopTier?        @relation("ShopTier", fields: [tierId], references: [id])

  // DEPRECATED: Keep for migration, then remove
  // networkTier         Int              @default(5)

  // ... rest of existing fields ...
}
```

---

## 3. ShopHierarchy Model

Explicit parent-child relationship tracking with capacity aggregation metadata.

### Schema Definition

```prisma
// =============================================================================
// SHOP HIERARCHY - Parent-Child Relationships with Capacity Roll-Up
// =============================================================================
// Tracks explicit relationships between shops for:
// - Network groupings (corporate → regional → satellite)
// - Contract shop relationships (primary shop → subcontractors)
// - Geographic clusters (main facility → field units)
// =============================================================================

model ShopHierarchy {
  id                      String   @id @default(uuid())

  // Relationship definition
  parentShopId            String
  parentShop              Shop     @relation("HierarchyParent", fields: [parentShopId], references: [id], onDelete: Cascade)
  childShopId             String
  childShop               Shop     @relation("HierarchyChild", fields: [childShopId], references: [id], onDelete: Cascade)

  // Relationship type
  relationshipType        String   @default("NETWORK") // NETWORK, CONTRACT, GEOGRAPHIC, OVERFLOW

  // Capacity aggregation settings
  includeInCapacityRollup Boolean  @default(true) // Roll child capacity to parent?
  capacitySharePercent    Float    @default(100) // % of child capacity available to parent network

  // Routing behavior
  canReceiveOverflow      Boolean  @default(true) // Parent can route overflow to child?
  overflowPriority        Int      @default(5) // Lower = preferred overflow destination

  // Billing relationship
  billingRelationship     String   @default("PASSTHROUGH") // PASSTHROUGH, MARKUP, SEPARATE
  markupPercent           Float    @default(0) // If MARKUP, % added to child's costs

  // Assignment routing rules
  autoRouteFromParent     Boolean  @default(false) // Auto-route qualifying work to child?
  routingCriteria         String   @default("{}") // JSON: conditions for auto-routing

  // Effective dates (for contract/seasonal relationships)
  effectiveFrom           DateTime @default(now())
  effectiveTo             DateTime? // Null = no end date

  // Status
  isActive                Boolean  @default(true)

  // Audit
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
  createdBy               String?

  // Company ownership
  companyId               String
  company                 Company  @relation(fields: [companyId], references: [id])

  @@unique([parentShopId, childShopId])
  @@index([parentShopId])
  @@index([childShopId])
  @@index([companyId])
  @@index([relationshipType])
}
```

### Relationship Types

| Type | Description | Use Case |
|------|-------------|----------|
| `NETWORK` | Corporate network hierarchy | Trinity corporate → Trinity Houston → Trinity field unit |
| `CONTRACT` | Contractual subcontractor | AITX primary shop → 3P contract shop |
| `GEOGRAPHIC` | Regional cluster | Regional hub → local satellites |
| `OVERFLOW` | Temporary overflow agreement | Main shop → overflow partner during peak |

### Required Shop Model Updates

```prisma
model Shop {
  // ... existing fields ...

  // NEW: Enhanced hierarchy relations
  hierarchyAsParent      ShopHierarchy[] @relation("HierarchyParent")
  hierarchyAsChild       ShopHierarchy[] @relation("HierarchyChild")

  // ... rest of existing fields ...
}
```

---

---

## Terminology Standards

> **IMPORTANT**: This document uses consistent terminology throughout. All implementations MUST follow these naming conventions.

| Concept | Standard Term | Description |
|---------|---------------|-------------|
| Physical capacity limit | `monthlyCapacityLimit` | Maximum railcars a shop can handle per month |
| Temporary override | `adjustedCapacityLimit` | Seasonal/maintenance adjustments to capacity |
| Firm commitments | `confirmedRailcars` | Railcars with confirmed shop assignments |
| Forecasted work | `plannedRailcars` | S&OP/forecasted work (visibility only) |
| Total pipeline | `totalCommittedRailcars` | confirmedRailcars + plannedRailcars |
| Open capacity | `remainingAvailableRailcars` | Capacity available for new confirmations |
| Confirmed assignment | `ConfirmedShopVisit` | A railcar confirmed to visit a shop |
| Forecasted assignment | `ForecastedShopVisit` | A planned/forecasted shop visit |
| Time period | `capacityPeriod` | DATE type (first of month, e.g., '2026-01-01') |

**Tracking Unit**: We track **railcars** (not "cars" or "spots"). One railcar = one capacity unit.

---

## 4. ShopMonthlyCapacity Model

Track confirmed vs. planned capacity consumption by period.

### Schema Definition (Prisma)

```prisma
// =============================================================================
// SHOP MONTHLY CAPACITY - Confirmed vs. Planned Railcar Tracking
// =============================================================================
// Separates capacity into:
// - Confirmed: Deducted from available (firm commitments)
// - Planned: Visible but not deducted (forecasted/S&OP targets)
//
// TERMINOLOGY:
// - monthlyCapacityLimit = physical max railcars/month
// - confirmedRailcars = firm commitments (DEDUCTS capacity)
// - plannedRailcars = forecasted (visibility only, NO deduction)
// - remainingAvailableRailcars = limit - confirmed
// =============================================================================

model ShopMonthlyCapacity {
  id                      String   @id @default(uuid())

  // Shop and period (use DATE for first-of-month)
  shopId                  String
  shop                    Shop     @relation("MonthlyCapacity", fields: [shopId], references: [id], onDelete: Cascade)
  capacityPeriod          DateTime // First day of month, e.g., 2026-01-01

  // Capacity limits
  monthlyCapacityLimit    Int      @default(0) // Physical max railcars/month
  adjustedCapacityLimit   Int?     // Temporary override (seasonal, maintenance)
  capacityNotes           String   @default("") // Reason for adjustment

  // Confirmed consumption (DEDUCTED from available)
  confirmedRailcars       Int      @default(0) // # of confirmed railcars
  confirmedRailcarDays    Float    @default(0) // Total confirmed railcar-days
  confirmedLaborHours     Float    @default(0) // Total confirmed labor hours
  completedRailcars       Int      @default(0) // Railcars actually completed (for S&OP actuals)

  // Planned consumption (NOT deducted, visibility only)
  plannedRailcars         Int      @default(0) // # of planned/forecasted railcars
  plannedRailcarDays      Float    @default(0) // Forecasted railcar-days
  plannedLaborHours       Float    @default(0) // Forecasted labor hours

  // =========================================================================
  // CALCULATED FIELDS - Use database-level generated columns in production
  // These are computed automatically; do NOT update manually
  // =========================================================================
  remainingAvailableRailcars Int   @default(0) // effectiveLimit - confirmedRailcars
  totalCommittedRailcars     Int   @default(0) // confirmedRailcars + plannedRailcars
  utilizationPercent         Float @default(0) // (confirmed / limit) * 100
  projectedUtilizationPercent Float @default(0) // (totalCommitted / limit) * 100

  // S&OP target tracking
  sopTargetRailcars       Int      @default(0) // S&OP target for this period
  sopTargetProgress       Float    @default(0) // (completed / sopTarget) * 100
  targetExceedsCapacity   Boolean  @default(false) // WARNING: sopTarget > limit

  // Capacity by work type
  qualRailcarsConfirmed   Int      @default(0) // Qualifications confirmed
  repairRailcarsConfirmed Int      @default(0) // Repairs confirmed
  pmRailcarsConfirmed     Int      @default(0) // PM confirmed

  // Roll-up from children (if parent shop)
  childrenConfirmedRailcars Int    @default(0) // Sum of children's confirmed
  childrenPlannedRailcars   Int    @default(0) // Sum of children's planned
  networkTotalCapacity      Int    @default(0) // Limit + children's limits
  networkAvailableRailcars  Int    @default(0) // Available + children's available

  // Status flags
  isOverCapacity          Boolean  @default(false) // confirmed > limit
  isAtRisk                Boolean  @default(false) // totalCommitted > limit
  requiresAttention       Boolean  @default(false) // Manual flag

  // Optimistic locking for concurrent updates
  version                 Int      @default(0) // Increment on each update

  // Audit
  lastCalculatedAt        DateTime @default(now())
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt

  // Company ownership
  companyId               String
  company                 Company  @relation(fields: [companyId], references: [id])

  @@unique([shopId, capacityPeriod])
  @@index([shopId])
  @@index([capacityPeriod])
  @@index([companyId])
  @@index([isOverCapacity])
  @@index([isAtRisk])
}
```

### PostgreSQL Schema with Generated Columns (Production)

For production deployments, use database-level generated columns for automatic calculation:

```sql
CREATE TABLE shop_monthly_capacity (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id                     UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    capacity_period             DATE NOT NULL,  -- First day of month e.g. '2026-01-01'

    -- Capacity limits
    monthly_capacity_limit      INTEGER NOT NULL CHECK (monthly_capacity_limit >= 0),
    adjusted_capacity_limit     INTEGER CHECK (adjusted_capacity_limit >= 0),
    overcommit_allowance_pct    NUMERIC(5,2) DEFAULT 0,  -- Tier 1 shops may allow 5-15% overcommit
    capacity_notes              TEXT DEFAULT '',

    -- Confirmed (DEDUCTS from available)
    confirmed_railcars          INTEGER NOT NULL DEFAULT 0 CHECK (confirmed_railcars >= 0),
    confirmed_railcar_days      NUMERIC(10,2) DEFAULT 0,
    confirmed_labor_hours       NUMERIC(10,2) DEFAULT 0,
    completed_railcars          INTEGER NOT NULL DEFAULT 0 CHECK (completed_railcars >= 0),

    -- Planned (visibility only)
    planned_railcars            INTEGER NOT NULL DEFAULT 0 CHECK (planned_railcars >= 0),
    planned_railcar_days        NUMERIC(10,2) DEFAULT 0,
    planned_labor_hours         NUMERIC(10,2) DEFAULT 0,

    -- S&OP targets
    sop_target_railcars         INTEGER DEFAULT 0,

    -- Work type breakdown
    qual_railcars_confirmed     INTEGER DEFAULT 0,
    repair_railcars_confirmed   INTEGER DEFAULT 0,
    pm_railcars_confirmed       INTEGER DEFAULT 0,

    -- Network roll-up
    children_confirmed_railcars INTEGER DEFAULT 0,
    children_planned_railcars   INTEGER DEFAULT 0,
    network_total_capacity      INTEGER DEFAULT 0,

    -- Optimistic locking
    version                     BIGINT NOT NULL DEFAULT 0,

    -- Audit
    last_calculated_at          TIMESTAMPTZ DEFAULT now(),
    created_at                  TIMESTAMPTZ DEFAULT now(),
    updated_at                  TIMESTAMPTZ DEFAULT now(),
    company_id                  UUID NOT NULL REFERENCES companies(id),

    -- =========================================================================
    -- GENERATED COLUMNS (computed automatically by PostgreSQL)
    -- =========================================================================
    effective_capacity_limit    INTEGER GENERATED ALWAYS AS (
        COALESCE(adjusted_capacity_limit, monthly_capacity_limit)
    ) STORED,

    max_with_overcommit         INTEGER GENERATED ALWAYS AS (
        ROUND(COALESCE(adjusted_capacity_limit, monthly_capacity_limit) *
              (1 + COALESCE(overcommit_allowance_pct, 0) / 100))
    ) STORED,

    remaining_available_railcars INTEGER GENERATED ALWAYS AS (
        GREATEST(0, COALESCE(adjusted_capacity_limit, monthly_capacity_limit) - confirmed_railcars)
    ) STORED,

    total_committed_railcars    INTEGER GENERATED ALWAYS AS (
        confirmed_railcars + planned_railcars
    ) STORED,

    utilization_percent         NUMERIC(5,2) GENERATED ALWAYS AS (
        CASE WHEN monthly_capacity_limit > 0
             THEN (confirmed_railcars::NUMERIC / monthly_capacity_limit) * 100
             ELSE 0 END
    ) STORED,

    projected_utilization_percent NUMERIC(5,2) GENERATED ALWAYS AS (
        CASE WHEN monthly_capacity_limit > 0
             THEN ((confirmed_railcars + planned_railcars)::NUMERIC / monthly_capacity_limit) * 100
             ELSE 0 END
    ) STORED,

    sop_target_progress         NUMERIC(5,2) GENERATED ALWAYS AS (
        CASE WHEN sop_target_railcars > 0
             THEN (completed_railcars::NUMERIC / sop_target_railcars) * 100
             ELSE 0 END
    ) STORED,

    is_over_capacity            BOOLEAN GENERATED ALWAYS AS (
        confirmed_railcars > COALESCE(adjusted_capacity_limit, monthly_capacity_limit)
    ) STORED,

    is_at_risk                  BOOLEAN GENERATED ALWAYS AS (
        (confirmed_railcars + planned_railcars) > COALESCE(adjusted_capacity_limit, monthly_capacity_limit)
    ) STORED,

    target_exceeds_capacity     BOOLEAN GENERATED ALWAYS AS (
        sop_target_railcars > COALESCE(adjusted_capacity_limit, monthly_capacity_limit)
    ) STORED,

    network_available_railcars  INTEGER GENERATED ALWAYS AS (
        GREATEST(0, COALESCE(adjusted_capacity_limit, monthly_capacity_limit) - confirmed_railcars)
        + GREATEST(0, network_total_capacity - children_confirmed_railcars)
    ) STORED,

    CONSTRAINT one_record_per_period UNIQUE (shop_id, capacity_period)
);

-- Indexes for common queries
CREATE INDEX idx_capacity_shop ON shop_monthly_capacity(shop_id);
CREATE INDEX idx_capacity_period ON shop_monthly_capacity(capacity_period);
CREATE INDEX idx_capacity_company ON shop_monthly_capacity(company_id);
CREATE INDEX idx_capacity_over ON shop_monthly_capacity(is_over_capacity) WHERE is_over_capacity = true;
CREATE INDEX idx_capacity_risk ON shop_monthly_capacity(is_at_risk) WHERE is_at_risk = true;
```

### Capacity Calculation Rules

| Field | Formula | Notes |
|-------|---------|-------|
| `effectiveCapacityLimit` | `COALESCE(adjustedCapacityLimit, monthlyCapacityLimit)` | Use override if set |
| `maxWithOvercommit` | `effectiveLimit * (1 + overcommitAllowancePct/100)` | Tier 1 flexibility |
| `remainingAvailableRailcars` | `MAX(0, effectiveLimit - confirmedRailcars)` | Cannot go negative |
| `totalCommittedRailcars` | `confirmedRailcars + plannedRailcars` | Full pipeline visibility |
| `utilizationPercent` | `(confirmedRailcars / monthlyCapacityLimit) * 100` | Actual utilization |
| `projectedUtilizationPercent` | `(totalCommittedRailcars / monthlyCapacityLimit) * 100` | If all planned converts |
| `sopTargetProgress` | `(completedRailcars / sopTargetRailcars) * 100` | Based on COMPLETED, not confirmed |
| `isOverCapacity` | `confirmedRailcars > effectiveLimit` | Hard violation |
| `isAtRisk` | `totalCommittedRailcars > effectiveLimit` | Soft warning |
| `targetExceedsCapacity` | `sopTargetRailcars > effectiveLimit` | S&OP planning issue |

---

## 5. ConfirmedShopVisit Model (formerly RailcarScheduleEntry)

Confirmed railcar shop assignments that **deduct capacity**.

### Schema Definition

```prisma
// =============================================================================
// CONFIRMED SHOP VISIT - Firm Railcar-to-Shop Assignments
// =============================================================================
// When a railcar is CONFIRMED for a shop visit, it creates a ConfirmedShopVisit
// that DEDUCTS capacity from ShopMonthlyCapacity.
//
// Key distinction from ForecastedShopVisit:
// - ConfirmedShopVisit = DEDUCTS from remainingAvailableRailcars
// - ForecastedShopVisit = visibility only, NO deduction
// =============================================================================

model ConfirmedShopVisit {
  id                      String   @id @default(uuid())

  // Core references
  railcarId               String   // Changed from carId for consistency
  railcar                 Car      @relation("ConfirmedVisits", fields: [railcarId], references: [id], onDelete: Cascade)
  shopId                  String
  shop                    Shop     @relation("ConfirmedVisits", fields: [shopId], references: [id])

  // Schedule period (use DATE for first-of-month)
  visitPeriod             DateTime // First day of target month e.g., 2026-01-01
  scheduledWeek           Int?     // Optional: specific week (1-5)
  scheduledDate           DateTime? // Optional: specific arrival date

  // Work scope
  workType                String   @default("REPAIR") // QUAL, REPAIR, PM, INSPECTION, OTHER
  defectCodes             String   @default("[]") // JSON: AAR defect codes
  workDescription         String   @default("")

  // Estimates vs Actuals (track both for variance analysis)
  estimatedRailcarDays    Float    @default(7)   // Expected duration
  estimatedLaborHours     Float    @default(40)  // Expected labor
  estimatedCost           Float    @default(0)

  actualRailcarDays       Float?   // Filled after completion
  actualLaborHours        Float?   // Filled after completion
  actualCost              Float?   // Filled after completion

  // Priority and urgency
  priority                Int      @default(3) // 1=Critical, 2=High, 3=Normal, 4=Low
  isUrgent                Boolean  @default(false) // Regulatory deadline approaching
  dueDate                 DateTime? // Hard deadline (e.g., qual expiration)

  // Status tracking
  status                  String   @default("SCHEDULED") // SCHEDULED, IN_TRANSIT, ARRIVED, IN_PROGRESS, COMPLETE, CANCELLED
  statusUpdatedAt         DateTime @default(now())

  // Actual dates (filled as railcar progresses)
  actualArrivalDate       DateTime?
  actualStartDate         DateTime?
  actualCompletionDate    DateTime?

  // Routing/logistics
  originYard              String   @default("")
  routingInstructions     String   @default("")
  inTransitSince          DateTime?
  expectedArrival         DateTime?

  // Demurrage risk
  demurrageAlertDate      DateTime? // Alert if not arrived by this date
  demurrageRiskLevel      String   @default("NONE") // NONE, LOW, MEDIUM, HIGH

  // Source of assignment
  sourceType              String   @default("MANUAL") // MANUAL, SOP, AUTO_ALLOCATION, IMPORT
  sourceId                String?  // Reference to source record
  convertedFromForecastId String?  // If converted from ForecastedShopVisit

  // Audit
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
  createdBy               String?
  confirmedAt             DateTime?
  confirmedBy             String?

  // Company ownership
  companyId               String
  company                 Company  @relation(fields: [companyId], references: [id])

  @@unique([railcarId, shopId, visitPeriod])
  @@index([shopId, visitPeriod])
  @@index([railcarId])
  @@index([status])
  @@index([workType])
  @@index([companyId])
  @@index([priority])
  @@index([dueDate])
}
```

---

## 6. ForecastedShopVisit Model (formerly RailcarPlanEntry)

Planned/forecasted railcar assignments (visibility only, **NO capacity deduction**).

### Schema Definition

```prisma
// =============================================================================
// FORECASTED SHOP VISIT - Planned Assignments (NO Capacity Deduction)
// =============================================================================
// Represents planned work from S&OP, fleet forecasting, or advance notifications.
// Shows potential capacity consumption but does NOT deduct from available.
//
// Key distinction from ConfirmedShopVisit:
// - ForecastedShopVisit = visibility only, contributes to plannedRailcars
// - ConfirmedShopVisit = DEDUCTS from remainingAvailableRailcars
// =============================================================================

model ForecastedShopVisit {
  id                      String   @id @default(uuid())

  // Core references (railcar may be specific or NULL for bulk forecasts)
  railcarId               String?  // NULL if generic planned volume
  railcar                 Car?     @relation("ForecastedVisits", fields: [railcarId], references: [id], onDelete: SetNull)
  shopId                  String
  shop                    Shop     @relation("ForecastedVisits", fields: [shopId], references: [id])

  // For generic/bulk planned volumes (when railcarId is NULL)
  forecastedRailcarCount  Int      @default(1) // # of railcars in this forecast
  railcarTypeFilter       String?  // e.g., "TANK" - for generic volume allocation

  // Forecast period
  forecastPeriod          DateTime // First day of target month e.g., 2026-01-01

  // Work scope (forecasted)
  workType                String   @default("REPAIR")
  estimatedRailcarDaysEach Float   @default(7)
  estimatedLaborHoursEach Float    @default(40)
  estimatedCostEach       Float    @default(0)

  // Source of forecast
  forecastSource          String   @default("MANUAL") // MANUAL, SOP, FLEET_FORECAST, QUAL_SCHEDULE, IMPORT
  forecastSourceId        String?  // Reference to source (MasterPlan, SOPCommitment, etc.)
  forecastSourceName      String   @default("") // Display name of source

  // Confidence level
  confidence              String   @default("MEDIUM") // LOW, MEDIUM, HIGH, COMMITTED
  probabilityPercent      Float    @default(50) // 0-100% likelihood of conversion

  // Conversion tracking
  status                  String   @default("FORECASTED") // FORECASTED, CONVERTED, CANCELLED, EXPIRED
  convertedToVisitId      String?  // If converted, link to ConfirmedShopVisit
  convertedAt             DateTime?

  // Notes
  notes                   String   @default("")

  // Audit
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
  createdBy               String?

  // Company ownership
  companyId               String
  company                 Company  @relation(fields: [companyId], references: [id])

  @@index([shopId, forecastPeriod])
  @@index([railcarId])
  @@index([forecastSource])
  @@index([status])
  @@index([companyId])
}
```

---

## 7. SOPShopTarget Model

S&OP targets per shop per period.

### Schema Definition

```prisma
// =============================================================================
// SOP SHOP TARGET - S&OP Targets per Shop per Period
// =============================================================================
// Stores targets from Sales & Operations Planning:
// - Target railcars processed
// - Backlog reduction goals
// - Fleet availability targets
// =============================================================================

model SOPShopTarget {
  id                      String   @id @default(uuid())

  // Shop and period
  shopId                  String
  shop                    Shop     @relation("SOPTargets", fields: [shopId], references: [id], onDelete: Cascade)
  year                    Int
  month                   Int      // 1-12, or 0 for quarterly/annual
  quarter                 Int?     // 1-4 if quarterly target
  isAnnual                Boolean  @default(false)

  // Volume targets
  targetCarsProcessed     Int      @default(0) // Target cars out the door
  targetCarsInbound       Int      @default(0) // Expected inbound volume
  targetQualifications    Int      @default(0) // Target quals completed
  targetRepairs           Int      @default(0) // Target repairs completed

  // Backlog targets
  targetBacklogStart      Int      @default(0) // Expected backlog at period start
  targetBacklogEnd        Int      @default(0) // Target backlog at period end
  backlogReductionGoal    Int      @default(0) // Cars to reduce backlog by

  // Fleet availability targets
  fleetAvailabilityTarget Float    @default(95) // % of fleet available

  // Performance targets
  targetTurnTimeDays      Float    @default(14) // Target avg turn time
  targetOnTimePercent     Float    @default(90) // Target on-time completion
  targetCostPerCar        Float    @default(0) // Target avg cost

  // Actual performance (updated by tracking)
  actualCarsProcessed     Int      @default(0)
  actualQualifications    Int      @default(0)
  actualRepairs           Int      @default(0)
  actualBacklogEnd        Int      @default(0)
  actualTurnTimeDays      Float    @default(0)
  actualOnTimePercent     Float    @default(0)
  actualCostPerCar        Float    @default(0)

  // Status indicators
  isOnTrack               Boolean  @default(true)
  riskLevel               String   @default("NONE") // NONE, LOW, MEDIUM, HIGH, CRITICAL
  varianceNotes           String   @default("")

  // Source and approval
  planVersion             String   @default("") // S&OP plan version
  approvedBy              String?
  approvedAt              DateTime?

  // Audit
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt

  // Company ownership
  companyId               String
  company                 Company  @relation(fields: [companyId], references: [id])

  @@unique([shopId, year, month, quarter])
  @@index([shopId])
  @@index([year, month])
  @@index([companyId])
  @@index([isOnTrack])
  @@index([riskLevel])
}
```

---

## 8. Updated Shop Model (Complete)

### Full Updated Schema

```prisma
model Shop {
  id                 String           @id @default(uuid())
  externalId         Int?
  name               String
  displayName        String           @default("")
  code               String           @unique
  shopType           String           @default("Repair")
  location           String
  address1           String           @default("")
  address2           String           @default("")
  city               String           @default("")
  state              String           @default("")
  zip                String           @default("")
  region             String           @default("")
  network            String           @default("")
  servingRailroad    String           @default("")
  splc               String           @default("")
  scac               String           @default("")

  // Location coordinates
  latitude           Float?
  longitude          Float?

  // Shop Network Reference
  networkId          String?
  shopNetwork        ShopNetwork?     @relation("ShopNetwork", fields: [networkId], references: [id])

  // NEW: Shop Tier Reference
  tierId             String?
  tier               ShopTier?        @relation("ShopTier", fields: [tierId], references: [id])

  // Parent/Child Hierarchy (legacy - keep for backward compat)
  parentShopId       String?
  parentShop         Shop?            @relation("ShopHierarchy", fields: [parentShopId], references: [id], onDelete: Cascade)
  childShops         Shop[]           @relation("ShopHierarchy")
  isParent           Boolean          @default(false)

  // NEW: Enhanced hierarchy relations
  hierarchyAsParent  ShopHierarchy[]  @relation("HierarchyParent")
  hierarchyAsChild   ShopHierarchy[]  @relation("HierarchyChild")

  // Capacity
  annualTargetVolume Int              @default(0)
  isAitxInternal     Boolean          @default(false)
  tankQualified      Boolean          @default(true)
  networkTier        Int              @default(5) // DEPRECATED: Use tierId
  shopStatus         String           @default("active")
  capacity           Int              @default(10)
  currentLoad        Int              @default(0)
  utilizationTarget  Float            @default(0.90)

  // Cost
  baseCostPerCar     Float            @default(15000)
  laborRate          Float            @default(75.0)
  costIndex          Float            @default(1.0)
  baseTurnTime       Int              @default(14)
  turnTimeMultiplier Float            @default(1.0)

  // Capabilities
  capabilities       String           @default("")
  certifications     String           @default("")
  preferredCustomers String           @default("")

  // Contact
  contactName        String           @default("")
  contactEmail       String           @default("")
  contactPhone       String           @default("")
  contactFax         String           @default("")
  website            String           @default("")
  sapVendorId        String           @default("")
  notes              String           @default("")

  // Certification
  certificationClass String           @default("")
  certificationDate  DateTime?
  certificationExp   DateTime?

  // Visibility
  displayOnMap       Boolean          @default(false)
  displayOnPortal    Boolean          @default(false)
  environmentalReview Boolean         @default(false)
  lastVerified       DateTime?

  // Status
  isActive           Boolean          @default(true)
  companyId          String
  company            Company          @relation(fields: [companyId], references: [id])

  // S&OP capacity
  qualCapacity       Int              @default(50)
  assignCapacity     Int              @default(30)
  releaseCapacity    Int              @default(40)
  repairCapacity     Int              @default(20)
  efficiencyRating   Float            @default(0.9)

  // Existing relations
  assignments        PlanAssignment[]
  carEligibilities   CarShopEligibility[]
  capacitySlots      ShopCapacitySlot[]
  qualificationEntries LeaseQualificationEntry[]
  carFlowPlans       CarFlowPlan[]
  sopCommitments     SOPCommitment[]
  weeklyCapacities   WeeklyCapacity[]
  masterPlanCommitments MasterPlanCommitment[]
  unifiedAssignments UnifiedAssignment[]
  capabilityProfile  ShopCapabilityProfile?
  planOptionAssignments PlanOptionAssignment[] @relation("PlanOptionAssignmentShop")
  capacityReservations CapacityReservation[] @relation("CapacityReservationShop")

  // NEW: Enhanced relations
  monthlyCapacity    ShopMonthlyCapacity[] @relation("MonthlyCapacity")
  scheduleEntries    RailcarScheduleEntry[] @relation("ScheduleEntries")
  planEntries        RailcarPlanEntry[] @relation("PlanEntries")
  sopTargets         SOPShopTarget[] @relation("SOPTargets")

  // Timestamps
  createdAt          DateTime         @default(now())
  updatedAt          DateTime         @updatedAt

  @@index([code, companyId])
  @@index([parentShopId])
  @@index([networkId])
  @@index([tierId])
  @@index([region])
  @@index([companyId])
  @@index([isActive])
  @@index([isParent])
  @@index([shopType])
  @@index([externalId])
  @@index([companyId, tankQualified, region])
  @@index([companyId, shopType, isActive])
}
```

---

## 9. Entity Relationship Diagram

```
┌─────────────────┐       ┌──────────────────┐       ┌─────────────────┐
│   ShopTier      │       │      Shop        │       │  ShopNetwork    │
│─────────────────│       │──────────────────│       │─────────────────│
│ id              │◄──────│ tierId           │       │ id              │
│ tierLevel (1-3) │       │ networkId        │──────►│ code            │
│ name            │       │ parentShopId     │       │ name            │
│ capabilities... │       │ code             │       │ annualTarget    │
│ overcommitPct   │       │ monthlyCapLimit  │       └─────────────────┘
└─────────────────┘       │ ...              │
                          └────────┬─────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
              ▼                    ▼                    ▼
┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
│   ShopHierarchy     │ │ ShopMonthlyCapacity │ │   SOPShopTarget     │
│─────────────────────│ │─────────────────────│ │─────────────────────│
│ parentShopId        │ │ shopId              │ │ shopId              │
│ childShopId         │ │ capacityPeriod      │ │ capacityPeriod      │
│ relationshipType    │ │ monthlyCapLimit     │ │ targetRailcars      │
│ capacitySharePercent│ │ confirmedRailcars   │ │ targetBacklogEnd    │
│ canReceiveOverflow  │ │ plannedRailcars     │ │ completedRailcars   │
└─────────────────────┘ │ remainingAvailable  │ │ isOnTrack           │
                        │ utilizationPercent  │ └─────────────────────┘
                        │ version (locking)   │
                        └─────────┬───────────┘
                                  │
                  ┌───────────────┴───────────────┐
                  │                               │
                  ▼                               ▼
    ┌─────────────────────────┐    ┌─────────────────────────┐
    │   ConfirmedShopVisit    │    │   ForecastedShopVisit   │
    │─────────────────────────│    │─────────────────────────│
    │ railcarId (required)    │    │ railcarId (optional)    │
    │ shopId                  │    │ shopId                  │
    │ visitPeriod (DATE)      │    │ forecastPeriod (DATE)   │
    │ workType                │    │ workType                │
    │ status                  │    │ forecastSource          │
    │ estimatedRailcarDays    │    │ confidence              │
    │ actualRailcarDays       │    │ probabilityPercent      │
    │ ══════════════════════  │    │ ══════════════════════  │
    │ ⚡ DEDUCTS CAPACITY     │    │ 👁 VISIBILITY ONLY      │
    └─────────────────────────┘    └─────────────────────────┘
              │                               │
              └───────────────┬───────────────┘
                              ▼
                      ┌───────────────┐
                      │    Railcar    │
                      │───────────────│
                      │ railcarNumber │
                      │ railcarType   │
                      │ shoppingStatus│
                      └───────────────┘
```

---

## 10. Migration Strategy

### Phase 1: Add New Tables (Non-Breaking)
1. Create `ShopTier` table with seed data (including overcommitAllowancePct)
2. Create `ShopHierarchy` table
3. Create `ShopMonthlyCapacity` table with generated columns
4. Create `ConfirmedShopVisit` table
5. Create `ForecastedShopVisit` table
6. Create `SOPShopTarget` table

### Phase 2: Migrate Existing Data
1. Map existing `networkTier` values to new `ShopTier` records
2. Convert existing `parentShopId` relationships to `ShopHierarchy` entries
3. Migrate `CarFlowPlan` confirmed entries to `ConfirmedShopVisit`
4. Calculate initial `ShopMonthlyCapacity` from current data

### Phase 3: Update Application Code
1. Update Shop service to use new tier relation
2. Add hierarchy management service
3. Implement capacity calculation service with optimistic locking
4. Update allocation engine to use new models
5. **Remove dangerous auto-capacity-increase logic**

### Phase 4: Deprecate Old Fields
1. Mark `networkTier` as deprecated
2. Consider removing redundant `parentShopId` after full migration
3. Remove any legacy `year`/`month` fields (use `capacityPeriod` DATE)

---

## Summary

This schema design provides:

| Feature | Model | Key Benefit |
|---------|-------|-------------|
| **Tiered Classification** | `ShopTier` | AAR-aligned capability classification (Tier 1/2/3) with overcommit allowance |
| **Hierarchy Management** | `ShopHierarchy` | Explicit parent-child with capacity roll-up settings |
| **Capacity Tracking** | `ShopMonthlyCapacity` | confirmedRailcars vs. plannedRailcars separation with generated columns |
| **Confirmed Assignments** | `ConfirmedShopVisit` | DEDUCTS capacity, tracks estimates vs actuals |
| **Planned Forecasts** | `ForecastedShopVisit` | S&OP visibility without capacity deduction |
| **S&OP Integration** | `SOPShopTarget` | Target vs. actual tracking per period |

---

## 11. Core Business Logic Rules

### 11.1 Confirm Shop Visit (Capacity Deduction)

When a railcar is **confirmed** for a shop visit, the system must use atomic transactions with optimistic locking.

```
PROCEDURE ConfirmShopVisit(railcarId, shopId, visitPeriod, workType, estimatedRailcarDays)

  // =========================================================================
  // CRITICAL: This entire procedure MUST run in a database transaction
  // with row-level locking to prevent race conditions
  // =========================================================================

  BEGIN TRANSACTION

  // Step 1: Validate inputs (BEFORE acquiring locks)
  1. Verify railcar exists and is not already scheduled for same shop/period
  2. Verify shop exists and is active
  3. Verify shop tier supports requested workType (via ShopTier capabilities)
  4. Verify shop has required certifications for railcar type (via ShopCapabilityProfile)

  // Step 2: Acquire lock and check capacity
  5. SELECT * FROM ShopMonthlyCapacity
     WHERE shopId = shopId AND capacityPeriod = visitPeriod
     FOR UPDATE  // ← CRITICAL: Row-level lock prevents concurrent modifications

  6. IF monthlyCapacity does not exist:
       CREATE ShopMonthlyCapacity {
         shopId, capacityPeriod: visitPeriod,
         monthlyCapacityLimit: shop.capacity,
         version: 0
       }

  7. effectiveLimit = monthlyCapacity.adjustedCapacityLimit ?? monthlyCapacity.monthlyCapacityLimit
  8. maxWithOvercommit = effectiveLimit * (1 + shop.tier.overcommitAllowancePct / 100)
  9. remainingAvailable = effectiveLimit - monthlyCapacity.confirmedRailcars

  // Step 3: Capacity validation
  10. IF remainingAvailable <= 0:
        ROLLBACK
        RETURN ERROR "Shop has no remaining capacity for {visitPeriod}"

  11. IF monthlyCapacity.confirmedRailcars + 1 > maxWithOvercommit:
        ROLLBACK
        RETURN ERROR "Shop at maximum capacity (including overcommit allowance)"

  12. totalAfterConfirm = monthlyCapacity.confirmedRailcars + monthlyCapacity.plannedRailcars + 1
  13. IF totalAfterConfirm > effectiveLimit:
        // WARNING only - do not block (user chose to proceed)
        LOG WARNING "Confirming exceeds planned capacity: {totalAfterConfirm} vs {effectiveLimit}"

  // Step 4: Create ConfirmedShopVisit (deducts capacity)
  14. newVisit = INSERT INTO ConfirmedShopVisit {
        railcarId, shopId, visitPeriod,
        workType, estimatedRailcarDays,
        status: "SCHEDULED",
        confirmedAt: NOW(), confirmedBy: currentUser
      }

  // Step 5: Update capacity counters (ATOMIC with version check)
  15. UPDATE ShopMonthlyCapacity SET
        confirmedRailcars = confirmedRailcars + 1,
        confirmedRailcarDays = confirmedRailcarDays + estimatedRailcarDays,
        version = version + 1,  // ← Optimistic locking
        lastCalculatedAt = NOW()
      WHERE shopId = shopId
        AND capacityPeriod = visitPeriod
        AND version = monthlyCapacity.version  // ← Ensures no concurrent modification

  16. IF rows_affected = 0:
        ROLLBACK
        RETURN ERROR "Concurrent modification detected - please retry"

  // Step 6: If ForecastedShopVisit existed, convert it
  17. existingForecast = SELECT * FROM ForecastedShopVisit
      WHERE railcarId = railcarId AND shopId = shopId AND forecastPeriod = visitPeriod
        AND status = 'FORECASTED'

  18. IF existingForecast:
        UPDATE ForecastedShopVisit SET
          status = "CONVERTED",
          convertedToVisitId = newVisit.id,
          convertedAt = NOW()
        WHERE id = existingForecast.id

        UPDATE ShopMonthlyCapacity SET
          plannedRailcars = plannedRailcars - existingForecast.forecastedRailcarCount
        WHERE shopId = shopId AND capacityPeriod = visitPeriod

        UPDATE newVisit SET convertedFromForecastId = existingForecast.id

  // Step 7: Audit trail
  19. INSERT INTO AuditLog {
        action: "SHOP_VISIT_CONFIRMED",
        entityType: "ConfirmedShopVisit",
        entityId: newVisit.id,
        changes: { railcarId, shopId, visitPeriod, workType },
        userId: currentUser
      }

  COMMIT TRANSACTION

  // Step 8: Post-commit async operations (outside transaction)
  20. ASYNC CALL RecalculateParentCapacity(shopId, visitPeriod)

  RETURN SUCCESS with newVisit.id
END PROCEDURE
```

### TypeScript Implementation Example

```typescript
async function confirmShopVisit(
  railcarId: string,
  shopId: string,
  visitPeriod: Date,
  workType: WorkType,
  estimatedRailcarDays: number
): Promise<ConfirmedShopVisit> {

  return await prisma.$transaction(async (tx) => {
    // Step 1-4: Validations
    const railcar = await tx.car.findUniqueOrThrow({ where: { id: railcarId } });
    const shop = await tx.shop.findUniqueOrThrow({
      where: { id: shopId },
      include: { tier: true }
    });

    // Check for duplicate
    const existing = await tx.confirmedShopVisit.findFirst({
      where: { railcarId, shopId, visitPeriod, status: { not: 'CANCELLED' } }
    });
    if (existing) throw new Error('Railcar already scheduled for this shop/period');

    // Step 5-6: Lock and get capacity
    const [capacity] = await tx.$queryRaw<ShopMonthlyCapacity[]>`
      SELECT * FROM shop_monthly_capacity
      WHERE shop_id = ${shopId} AND capacity_period = ${visitPeriod}
      FOR UPDATE
    `;

    if (!capacity) {
      // Create new capacity record
      await tx.shopMonthlyCapacity.create({
        data: {
          shopId,
          capacityPeriod: visitPeriod,
          monthlyCapacityLimit: shop.capacity,
          version: 0
        }
      });
    }

    const effectiveLimit = capacity?.adjustedCapacityLimit ?? capacity?.monthlyCapacityLimit ?? shop.capacity;
    const overcommitPct = shop.tier?.overcommitAllowancePct ?? 0;
    const maxWithOvercommit = Math.floor(effectiveLimit * (1 + overcommitPct / 100));
    const currentConfirmed = capacity?.confirmedRailcars ?? 0;

    // Step 10-11: Capacity check
    if (currentConfirmed >= effectiveLimit) {
      throw new Error(`Shop has no remaining capacity for ${visitPeriod.toISOString()}`);
    }
    if (currentConfirmed + 1 > maxWithOvercommit) {
      throw new Error('Shop at maximum capacity including overcommit allowance');
    }

    // Step 14: Create visit
    const newVisit = await tx.confirmedShopVisit.create({
      data: {
        railcarId,
        shopId,
        visitPeriod,
        workType,
        estimatedRailcarDays,
        status: 'SCHEDULED',
        confirmedAt: new Date()
      }
    });

    // Step 15: Atomic capacity update with version check
    const updateResult = await tx.shopMonthlyCapacity.updateMany({
      where: {
        shopId,
        capacityPeriod: visitPeriod,
        version: capacity?.version ?? 0
      },
      data: {
        confirmedRailcars: { increment: 1 },
        confirmedRailcarDays: { increment: estimatedRailcarDays },
        version: { increment: 1 },
        lastCalculatedAt: new Date()
      }
    });

    if (updateResult.count === 0) {
      throw new Error('Concurrent modification detected - please retry');
    }

    // Step 17-18: Convert forecast if exists
    const forecast = await tx.forecastedShopVisit.findFirst({
      where: { railcarId, shopId, forecastPeriod: visitPeriod, status: 'FORECASTED' }
    });

    if (forecast) {
      await tx.forecastedShopVisit.update({
        where: { id: forecast.id },
        data: { status: 'CONVERTED', convertedToVisitId: newVisit.id, convertedAt: new Date() }
      });

      await tx.shopMonthlyCapacity.update({
        where: { shopId_capacityPeriod: { shopId, capacityPeriod: visitPeriod } },
        data: { plannedRailcars: { decrement: forecast.forecastedRailcarCount } }
      });
    }

    return newVisit;
  }, {
    isolationLevel: 'Serializable',  // Strongest isolation
    timeout: 10000  // 10 second timeout
  });
}
```

### 11.2 Create Forecasted Shop Visit (No Capacity Deduction)

```
PROCEDURE CreateForecastedShopVisit(railcarId?, shopId, forecastPeriod, workType, source, railcarCount = 1)

  // NOTE: This procedure does NOT require transaction locking since it
  // doesn't deduct capacity - it only updates visibility counters

  // Step 1: Validate
  1. Verify shop exists and is active
  2. IF railcarId provided, verify railcar exists

  // Step 2: Get or create monthly capacity record
  3. GET monthlyCapacity = ShopMonthlyCapacity WHERE shopId, capacityPeriod = forecastPeriod
  4. IF not exists: CREATE with monthlyCapacityLimit from shop

  // Step 3: Create forecast entry (NO capacity deduction)
  5. CREATE ForecastedShopVisit {
        railcarId: railcarId ?? NULL,  // Can be null for bulk/generic forecasts
        forecastedRailcarCount: railcarId ? 1 : railcarCount,
        shopId, forecastPeriod,
        workType, forecastSource: source,
        confidence: "MEDIUM", probabilityPercent: 50,
        status: "FORECASTED"
      }

  // Step 4: Update planned counters (visibility only - NO deduction)
  6. UPDATE ShopMonthlyCapacity SET
        plannedRailcars = plannedRailcars + (railcarId ? 1 : railcarCount),
        // Note: totalCommittedRailcars and projectedUtilizationPercent are GENERATED columns
        // They will auto-calculate based on confirmedRailcars + plannedRailcars
        lastCalculatedAt = NOW()
      WHERE shopId = shopId AND capacityPeriod = forecastPeriod

  // Step 5: Update hierarchy for visibility (async is OK)
  7. ASYNC CALL RecalculateParentPlanned(shopId, forecastPeriod)

  RETURN forecastEntry.id
END PROCEDURE
```

### 11.3 Cancel Shop Visit (Capacity Release)

```
PROCEDURE CancelConfirmedShopVisit(visitId, reason)

  // =========================================================================
  // CRITICAL: Use transaction with locking to safely release capacity
  // =========================================================================

  BEGIN TRANSACTION

  // Step 1: Lock and get visit details
  1. SELECT * FROM ConfirmedShopVisit WHERE id = visitId FOR UPDATE
  2. IF visit.status IN ('COMPLETE', 'CANCELLED'):
       ROLLBACK
       RETURN ERROR "Cannot cancel completed/cancelled visit"

  // Step 2: Lock capacity record
  3. SELECT * FROM ShopMonthlyCapacity
     WHERE shopId = visit.shopId AND capacityPeriod = visit.visitPeriod
     FOR UPDATE

  // Step 3: Update visit status
  4. UPDATE ConfirmedShopVisit SET
        status = "CANCELLED",
        notes = CONCAT(notes, ' | Cancelled: ', reason),
        updatedAt = NOW()
      WHERE id = visitId

  // Step 4: Release capacity (CRITICAL - reverse deduction)
  5. UPDATE ShopMonthlyCapacity SET
        confirmedRailcars = confirmedRailcars - 1,
        confirmedRailcarDays = confirmedRailcarDays - visit.estimatedRailcarDays,
        // Note: remainingAvailableRailcars, utilizationPercent, etc. are GENERATED columns
        version = version + 1,
        lastCalculatedAt = NOW()
      WHERE shopId = visit.shopId
        AND capacityPeriod = visit.visitPeriod
        AND version = capacity.version

  6. IF rows_affected = 0:
       ROLLBACK
       RETURN ERROR "Concurrent modification - please retry"

  // Step 5: Audit
  7. INSERT INTO AuditLog {
       action: "SHOP_VISIT_CANCELLED",
       entityType: "ConfirmedShopVisit",
       entityId: visitId,
       changes: { reason, previousStatus: visit.status },
       userId: currentUser
     }

  COMMIT TRANSACTION

  // Step 6: Async hierarchy update (outside transaction)
  8. ASYNC CALL RecalculateParentCapacity(visit.shopId, visit.visitPeriod)

  RETURN SUCCESS
END PROCEDURE
```

---

## 12. Hierarchy Roll-Up Logic

### 12.1 Capacity Aggregation from Children to Parent

```
PROCEDURE RecalculateParentCapacity(childShopId, year, month)

  // Step 1: Find all parent relationships
  1. GET hierarchies = ShopHierarchy WHERE
       childShopId = childShopId AND
       isActive = TRUE AND
       includeInCapacityRollup = TRUE AND
       effectiveFrom <= NOW() AND (effectiveTo IS NULL OR effectiveTo >= NOW())

  // Step 2: For each parent, recalculate
  2. FOR EACH hierarchy IN hierarchies:

     parentShopId = hierarchy.parentShopId
     sharePercent = hierarchy.capacitySharePercent / 100.0

     // Get child capacity for this period
     childCapacity = ShopMonthlyCapacity WHERE shopId = childShopId, year, month

     // Get or create parent monthly capacity
     parentCapacity = ShopMonthlyCapacity WHERE shopId = parentShopId, year, month
     IF not exists: CREATE parentCapacity

     // Sum all children's capacity for this parent
     allChildRelationships = ShopHierarchy WHERE
       parentShopId = parentShopId AND includeInCapacityRollup = TRUE AND isActive = TRUE

     childrenConfirmedTotal = 0
     childrenPlannedTotal = 0
     childrenBaseTotal = 0

     FOR EACH childRel IN allChildRelationships:
       childCap = ShopMonthlyCapacity WHERE shopId = childRel.childShopId, year, month
       IF childCap exists:
         shareMultiplier = childRel.capacitySharePercent / 100.0
         childrenConfirmedTotal += childCap.confirmedCount * shareMultiplier
         childrenPlannedTotal += childCap.plannedCount * shareMultiplier
         childrenBaseTotal += childCap.baseCapacity * shareMultiplier

     // Update parent with network totals
     UPDATE ShopMonthlyCapacity SET
       childrenConfirmed = ROUND(childrenConfirmedTotal),
       childrenPlanned = ROUND(childrenPlannedTotal),
       networkTotalCapacity = baseCapacity + ROUND(childrenBaseTotal),
       networkAvailable = availableCapacity + ROUND(childrenBaseTotal - childrenConfirmedTotal)
     WHERE shopId = parentShopId, year, month

  // Step 3: Recursively update grandparents
  3. FOR EACH hierarchy IN hierarchies:
       parentHierarchies = ShopHierarchy WHERE childShopId = hierarchy.parentShopId
       IF parentHierarchies exists:
         CALL RecalculateParentCapacity(hierarchy.parentShopId, year, month)

END PROCEDURE
```

### 12.2 Network Capacity View Query

```sql
-- Get network-wide capacity view for a parent shop
WITH RECURSIVE ShopTree AS (
  -- Base: the parent shop
  SELECT
    s.id, s.name, s.code, 0 AS depth,
    s.id AS rootId,
    100.0 AS effectiveSharePercent
  FROM Shop s
  WHERE s.id = :parentShopId

  UNION ALL

  -- Recursive: all children
  SELECT
    child.id, child.name, child.code, st.depth + 1,
    st.rootId,
    st.effectiveSharePercent * (h.capacitySharePercent / 100.0)
  FROM ShopTree st
  JOIN ShopHierarchy h ON h.parentShopId = st.id
  JOIN Shop child ON child.id = h.childShopId
  WHERE h.isActive = TRUE
    AND h.includeInCapacityRollup = TRUE
    AND h.effectiveFrom <= CURRENT_DATE
    AND (h.effectiveTo IS NULL OR h.effectiveTo >= CURRENT_DATE)
)
SELECT
  st.id,
  st.name,
  st.code,
  st.depth,
  st.effectiveSharePercent,
  smc.baseCapacity,
  smc.confirmedCount,
  smc.plannedCount,
  smc.availableCapacity,
  ROUND(smc.baseCapacity * st.effectiveSharePercent / 100) AS contributedCapacity,
  ROUND(smc.confirmedCount * st.effectiveSharePercent / 100) AS contributedConfirmed,
  ROUND(smc.availableCapacity * st.effectiveSharePercent / 100) AS contributedAvailable
FROM ShopTree st
LEFT JOIN ShopMonthlyCapacity smc ON smc.shopId = st.id
  AND smc.year = :year AND smc.month = :month
ORDER BY st.depth, st.name;
```

---

## 13. Tier-Based Routing & Capability Matching

### 13.1 Work Type to Tier Matching

```
FUNCTION GetEligibleShops(carId, workType, region?, preferredNetworkId?)

  // Step 1: Determine required capabilities for work type
  1. CASE workType:
       "QUAL" | "QUALIFICATION" → requiredCaps = { canPerformTankRequalification: true, canPerformHydroTesting: true }
       "REPAIR_HEAVY" → requiredCaps = { canPerformHeavyRepair: true, canPerformWelding: true }
       "REPAIR_LIGHT" → requiredCaps = { canPerformRepairs: true }
       "WHEEL" → requiredCaps = { canPerformWheelWork: true }
       "PM" → requiredCaps = { canPerformPreventiveMaint: true }
       "RULE88B" → requiredCaps = { canPerformRule88B: true }
       "LINING" → requiredCaps = { canPerformLiningWork: true }
       DEFAULT → requiredCaps = {}

  // Step 2: Get car details for validation
  2. GET car = Car WHERE id = carId
  3. carRequirements = {
       assetClass: car.carType,
       commodity: car.commodity,
       isHazmat: car.isHazmat,
       customerId: car.customerId
     }

  // Step 3: Find matching tiers
  4. matchingTiers = SELECT * FROM ShopTier WHERE
       isActive = TRUE AND
       (requiredCaps fields all TRUE) AND
       companyId = currentCompanyId
     ORDER BY routingPriority ASC

  // Step 4: Find shops with matching tiers and capabilities
  5. eligibleShops = SELECT s.*, t.tierLevel, t.name as tierName
     FROM Shop s
     JOIN ShopTier t ON s.tierId = t.id
     LEFT JOIN ShopCapabilityProfile cp ON cp.shopId = s.id
     WHERE
       s.isActive = TRUE AND
       s.tierId IN (matchingTiers.ids) AND
       (region IS NULL OR s.region = region) AND
       (preferredNetworkId IS NULL OR s.networkId = preferredNetworkId) AND
       -- Capability profile validation
       (cp.id IS NULL OR (
         carRequirements.assetClass IN (JSON_PARSE(cp.allowedAssetClasses)) AND
         carRequirements.customerId NOT IN (JSON_PARSE(cp.excludedCustomers))
       ))
     ORDER BY
       t.routingPriority ASC,
       s.networkTier ASC,
       s.costIndex ASC

  // Step 5: Check capacity availability for each
  6. FOR EACH shop IN eligibleShops:
       monthlyCapacity = GetMonthlyCapacity(shop.id, targetYear, targetMonth)
       shop.availableCapacity = monthlyCapacity.availableCapacity
       shop.projectedUtilization = monthlyCapacity.projectedUtilization
       shop.canAccept = monthlyCapacity.availableCapacity > 0

  RETURN eligibleShops filtered by canAccept = TRUE
END FUNCTION
```

### 13.2 Tier Escalation Logic

```
PROCEDURE EscalateWorkToHigherTier(scheduleEntryId, reason)

  // Step 1: Get current assignment
  1. GET entry = RailcarScheduleEntry WHERE id = scheduleEntryId
  2. GET currentShop = Shop WHERE id = entry.shopId
  3. GET currentTier = ShopTier WHERE id = currentShop.tierId

  // Step 2: Find escalation targets
  4. escalationTierCodes = JSON_PARSE(currentTier.canEscalateTo)
  5. IF escalationTierCodes IS EMPTY:
       RETURN ERROR "No escalation path defined for tier {currentTier.code}"

  // Step 3: Find available shops in higher tiers
  6. escalationShops = SELECT s.* FROM Shop s
       JOIN ShopTier t ON s.tierId = t.id
       WHERE t.code IN (escalationTierCodes)
         AND s.isActive = TRUE
         AND s.region = currentShop.region  // Prefer same region
       ORDER BY t.tierLevel ASC, s.costIndex ASC

  // Step 4: Check capacity and create new assignment
  7. FOR EACH targetShop IN escalationShops:
       capacity = GetMonthlyCapacity(targetShop.id, entry.scheduledYear, entry.scheduledMonth)
       IF capacity.availableCapacity > 0:
         // Cancel original
         CALL CancelScheduleEntry(entry.id, "Escalated to " + targetShop.code)
         // Create new at higher tier
         newEntry = CALL ConfirmRailcarAssignment(
           entry.carId, targetShop.id, entry.scheduledYear, entry.scheduledMonth,
           entry.workType, entry.estimatedDays
         )
         newEntry.notes = "Escalated from " + currentShop.code + ": " + reason
         RETURN newEntry

  RETURN ERROR "No capacity available in escalation tier shops"
END PROCEDURE
```

---

## 14. S&OP Target Integration

### 14.1 Target Setting from S&OP Process

> **CRITICAL**: S&OP targets should NEVER auto-increase capacity. If targets exceed capacity, flag it as a planning issue that requires manual resolution.

```
PROCEDURE SetSOPTargets(shopId, capacityPeriod, targets)

  // Step 1: Validate inputs
  1. Verify shop exists
  2. Validate targets object has required fields

  // Step 2: Get current capacity for comparison
  3. GET capacity = ShopMonthlyCapacity WHERE shopId, capacityPeriod
  4. effectiveLimit = capacity.adjustedCapacityLimit ?? capacity.monthlyCapacityLimit

  // Step 3: Create or update SOPShopTarget
  5. UPSERT SOPShopTarget {
       shopId, capacityPeriod,
       targetRailcarsProcessed: targets.railcarsProcessed,
       targetQualifications: targets.qualifications,
       targetRepairs: targets.repairs,
       targetBacklogEnd: targets.backlogGoal,
       backlogReductionGoal: targets.backlogReduction,
       targetTurnTimeDays: targets.turnTime,
       targetOnTimePercent: targets.onTimeTarget,
       fleetAvailabilityTarget: targets.fleetAvailability,
       planVersion: targets.planVersion,
       approvedBy: currentUser,
       approvedAt: NOW()
     }

  // Step 4: Sync target to ShopMonthlyCapacity (NO auto-capacity increase!)
  6. UPDATE ShopMonthlyCapacity SET
       sopTargetRailcars = targets.railcarsProcessed
       // ⚠️ REMOVED: baseCapacity = GREATEST(...) - This was DANGEROUS!
       // targetExceedsCapacity is a GENERATED column that auto-flags this issue
     WHERE shopId = shopId AND capacityPeriod = capacityPeriod

  // Step 5: Check for target vs capacity conflicts (FLAG, don't auto-fix!)
  7. IF targets.railcarsProcessed > effectiveLimit:
       // Create explicit warning - do NOT silently increase capacity
       CREATE SOPCapacityWarning {
         shopId, capacityPeriod,
         warningType: "TARGET_EXCEEDS_CAPACITY",
         targetRailcars: targets.railcarsProcessed,
         capacityLimit: effectiveLimit,
         overage: targets.railcarsProcessed - effectiveLimit,
         message: "S&OP target ({targets.railcarsProcessed}) exceeds capacity ({effectiveLimit})",
         requiresResolution: TRUE
       }
       CREATE Notification {
         recipient: shop.manager,
         type: "SOP_CAPACITY_CONFLICT",
         severity: "HIGH",
         message: "S&OP target exceeds shop capacity - manual review required"
       }

  // Step 6: Create forecasted entries for unfilled target gap
  8. currentConfirmed = capacity.confirmedRailcars
  9. currentPlanned = capacity.plannedRailcars
  10. existingCommitment = currentConfirmed + currentPlanned
  11. gap = targets.railcarsProcessed - existingCommitment

  12. IF gap > 0:
        // Create forecasted (not confirmed) entries for the gap
        CREATE ForecastedShopVisit {
          railcarId: NULL,  // Generic volume forecast
          forecastedRailcarCount: gap,
          shopId, forecastPeriod: capacityPeriod,
          workType: "MIXED",
          forecastSource: "SOP",
          forecastSourceId: sopTarget.id,
          forecastSourceName: "S&OP Plan " + targets.planVersion,
          confidence: "COMMITTED",
          probabilityPercent: 90
        }
        UPDATE ShopMonthlyCapacity SET
          plannedRailcars = plannedRailcars + gap
        WHERE shopId = shopId AND capacityPeriod = capacityPeriod

  RETURN { sopTargetId, hasCapacityConflict: targets.railcarsProcessed > effectiveLimit }
END PROCEDURE
```

### 14.2 S&OP Progress Tracking

```
PROCEDURE UpdateSOPProgress(shopId, capacityPeriod)

  // Step 1: Get current actuals from ConfirmedShopVisit
  1. completedCount = SELECT COUNT(*) FROM ConfirmedShopVisit
       WHERE shopId = shopId AND visitPeriod = capacityPeriod
         AND status = 'COMPLETE'

  2. qualCount = SELECT COUNT(*) FROM ConfirmedShopVisit
       WHERE shopId = shopId AND visitPeriod = capacityPeriod
         AND status = 'COMPLETE' AND workType = 'QUAL'

  3. repairCount = SELECT COUNT(*) FROM ConfirmedShopVisit
       WHERE shopId = shopId AND visitPeriod = capacityPeriod
         AND status = 'COMPLETE' AND workType IN ('REPAIR', 'REPAIR_HEAVY', 'REPAIR_LIGHT')

  4. avgTurnTime = SELECT AVG(actualRailcarDays) FROM ConfirmedShopVisit
       WHERE shopId = shopId AND visitPeriod = capacityPeriod
         AND status = 'COMPLETE' AND actualRailcarDays IS NOT NULL

  5. onTimeCount = SELECT COUNT(*) FROM ConfirmedShopVisit
       WHERE shopId = shopId AND visitPeriod = capacityPeriod
         AND status = 'COMPLETE'
         AND (dueDate IS NULL OR actualCompletionDate <= dueDate)

  // Step 2: Calculate performance metrics
  6. onTimePercent = (onTimeCount / completedCount) * 100 IF completedCount > 0 ELSE 0

  // Step 3: Update SOPShopTarget with actuals
  7. GET target = SOPShopTarget WHERE shopId, capacityPeriod
  8. IF target exists:
       // Calculate expected progress based on day of month
       dayOfPeriod = DAY(NOW())
       daysInPeriod = DAY(LAST_DAY(capacityPeriod))
       expectedProgress = target.targetRailcarsProcessed * (dayOfPeriod / daysInPeriod)

       UPDATE SOPShopTarget SET
         actualRailcarsProcessed = completedCount,
         actualQualifications = qualCount,
         actualRepairs = repairCount,
         actualTurnTimeDays = avgTurnTime,
         actualOnTimePercent = onTimePercent,
         isOnTrack = (completedCount >= expectedProgress * 0.9),  // 90% of expected
         riskLevel = CASE
           WHEN completedCount < expectedProgress * 0.5 THEN 'CRITICAL'
           WHEN completedCount < expectedProgress * 0.7 THEN 'HIGH'
           WHEN completedCount < expectedProgress * 0.85 THEN 'MEDIUM'
           WHEN completedCount < expectedProgress * 0.95 THEN 'LOW'
           ELSE 'NONE'
         END,
         updatedAt = NOW()
       WHERE shopId = shopId AND capacityPeriod = capacityPeriod

  // Step 4: Update monthly capacity completed count
  9. UPDATE ShopMonthlyCapacity SET
       completedRailcars = completedCount
       // sopTargetProgress is a GENERATED column based on completedRailcars / sopTargetRailcars
     WHERE shopId = shopId AND capacityPeriod = capacityPeriod

  RETURN { completedCount, target.targetCarsProcessed, isOnTrack: target.isOnTrack }
END PROCEDURE
```

### 14.3 S&OP Warning/Alert Generation

```
PROCEDURE CheckSOPAlerts(shopId, year, month)

  alerts = []

  // Step 1: Get data
  1. GET target = SOPShopTarget WHERE shopId, year, month
  2. GET capacity = ShopMonthlyCapacity WHERE shopId, year, month
  3. GET shop = Shop WHERE id = shopId

  // Step 2: Check planned vs target
  4. IF capacity.totalCommitted > target.targetCarsProcessed * 1.2:
       alerts.push({
         level: "WARNING",
         type: "OVER_TARGET",
         message: "Planned load ({capacity.totalCommitted}) exceeds S&OP target ({target.targetCarsProcessed}) by >20%"
       })

  // Step 3: Check under-commitment
  5. IF capacity.totalCommitted < target.targetCarsProcessed * 0.7 AND daysRemainingInMonth > 10:
       alerts.push({
         level: "WARNING",
         type: "UNDER_COMMITTED",
         message: "Only {capacity.totalCommitted} cars planned/confirmed vs target of {target.targetCarsProcessed}"
       })

  // Step 4: Check capacity risk
  6. IF capacity.projectedUtilization > 100:
       alerts.push({
         level: "CRITICAL",
         type: "OVER_CAPACITY",
         message: "Projected utilization {capacity.projectedUtilization}% exceeds capacity"
       })

  // Step 5: Check progress pace
  7. expectedProgress = (dayOfMonth / daysInMonth) * target.targetCarsProcessed
  8. IF target.actualCarsProcessed < expectedProgress * 0.8:
       alerts.push({
         level: "HIGH",
         type: "BEHIND_PACE",
         message: "Completed {target.actualCarsProcessed} vs expected {expectedProgress} at this point in month"
       })

  // Step 6: Check turn time target
  9. IF target.actualTurnTimeDays > target.targetTurnTimeDays * 1.25:
       alerts.push({
         level: "MEDIUM",
         type: "TURN_TIME",
         message: "Actual turn time {target.actualTurnTimeDays}d exceeds target {target.targetTurnTimeDays}d"
       })

  RETURN alerts
END PROCEDURE
```

---

## 15. UI Component Recommendations

### 15.1 Shop Hierarchy Tree View

```tsx
// Component: ShopHierarchyTree.tsx
interface ShopHierarchyTreeProps {
  rootShopId?: string;  // If null, show all root shops
  showCapacity?: boolean;
  onShopSelect?: (shopId: string) => void;
}

// Features:
// - Expandable/collapsible tree structure
// - Visual indicators for tier (color-coded badges: Tier 1 = green, Tier 2 = yellow, Tier 3 = blue)
// - Capacity bars showing confirmed/planned/available
// - Drag-and-drop for reordering hierarchy (admin only)
// - Quick actions: Add child, Edit, View capacity

// Visual Structure:
// ├── 🏭 Trinity Network (TIER1) [▓▓▓▓▓▓▓░░░ 72%]
// │   ├── 🔧 Trinity Houston (TIER1) [▓▓▓▓▓▓▓▓░░ 85%]
// │   ├── 🔧 Trinity Dallas (TIER2) [▓▓▓▓▓░░░░░ 52%]
// │   │   └── 🚐 Trinity Dallas Mobile (TIER3) [▓▓▓░░░░░░░ 30%]
// │   └── 🔧 Trinity San Antonio (TIER2) [▓▓▓▓▓▓░░░░ 60%]
// └── 🏭 Eagle Railcar Network (TIER1) [▓▓▓▓▓▓▓▓▓░ 90%]
```

### 15.2 Monthly Capacity Dashboard

```tsx
// Component: ShopCapacityDashboard.tsx

// Layout:
// ┌─────────────────────────────────────────────────────────────────────┐
// │  Shop: Trinity Houston          Tier: 1 (Heavy/Qual)    Jan 2024   │
// ├─────────────────────────────────────────────────────────────────────┤
// │  CAPACITY GAUGE                    │  S&OP TARGET PROGRESS          │
// │  ┌────────────────────┐            │  Target: 45 cars               │
// │  │   ████████████░░░  │ 85%        │  Completed: 32 cars (71%)      │
// │  │   42/50 confirmed  │            │  ████████████████░░░░░         │
// │  └────────────────────┘            │  Status: ✅ On Track           │
// │                                    │                                │
// │  Planned: +8 (visibility)          │  Turn Time: 12.5d (target: 14) │
// │  Total Committed: 50 (100%)        │  On-Time: 94% (target: 90%)    │
// ├────────────────────────────────────┴────────────────────────────────┤
// │  12-MONTH CAPACITY TIMELINE                                         │
// │  Jan  Feb  Mar  Apr  May  Jun  Jul  Aug  Sep  Oct  Nov  Dec        │
// │  ███  ███  ██░  ██░  █░░  █░░  ░░░  ░░░  ░░░  ░░░  ░░░  ░░░        │
// │  85%  78%  65%  60%  45%  40%  --   --   --   --   --   --          │
// │  ▲ Current                                                          │
// ├─────────────────────────────────────────────────────────────────────┤
// │  CAPACITY BY WORK TYPE                                              │
// │  Qualifications: ████████░░ 8/10   Repairs: ██████████ 25/25        │
// │  PM Work:        ████░░░░░░ 4/10   Other:   █████░░░░░ 5/10         │
// └─────────────────────────────────────────────────────────────────────┘

// Color Legend:
// - Green (▓): Confirmed capacity used
// - Yellow (░): Planned/forecasted (no deduction)
// - Red border: Over capacity warning
// - Gray: Available capacity
```

### 15.3 Railcar Assignment Wizard

```tsx
// Component: RailcarAssignmentWizard.tsx

// Step 1: Select Railcar(s)
// - Search by car number, customer, shopping status
// - Bulk select from filtered list
// - Show car details: type, commodity, qual dates, current location

// Step 2: Specify Work Scope
// - Work type dropdown (Qual, Repair, PM, etc.)
// - AAR defect code multi-select
// - Estimated days/labor hours
// - Due date (auto-populated from qual expiration if applicable)

// Step 3: Find Eligible Shops
// - Auto-filtered based on:
//   - Tier capabilities matching work type
//   - Car type compatibility
//   - Customer restrictions
//   - Available capacity for target month
// - Sortable by: distance, cost, capacity, tier, network preference
// - Visual capacity indicator per shop

// Step 4: Confirm Assignment
// - Show capacity impact preview
// - Warning if exceeding planned load
// - Option to create as Planned (no deduction) vs Confirmed (deducts)
// - Routing instructions input

// Step 5: Summary & Submit
// - Review all details
// - Create schedule entry + update capacity
// - Generate routing document (optional)
```

### 15.4 Network Capacity Roll-Up View

```tsx
// Component: NetworkCapacityRollup.tsx

// ┌─────────────────────────────────────────────────────────────────────┐
// │  NETWORK: Trinity Railcar Services          Period: Q1 2024        │
// ├─────────────────────────────────────────────────────────────────────┤
// │                                                                     │
// │  NETWORK TOTALS                                                     │
// │  ┌───────────────────────────────────────────────────────────────┐ │
// │  │  Total Capacity: 180 cars/month                               │ │
// │  │  Confirmed: 142 (79%)  Planned: +28  Available: 38            │ │
// │  │  S&OP Target: 165      Progress: 86%                          │ │
// │  └───────────────────────────────────────────────────────────────┘ │
// │                                                                     │
// │  SHOP BREAKDOWN                            Jan    Feb    Mar       │
// │  ─────────────────────────────────────────────────────────────────  │
// │  Trinity Houston (T1)     Cap: 50         42     38     35        │
// │    └─ Contribution: 100%                  ▓▓▓▓▓▓ ▓▓▓▓▓░ ▓▓▓▓░░    │
// │                                                                     │
// │  Trinity Dallas (T2)      Cap: 40         35     32     28        │
// │    └─ Contribution: 100%                  ▓▓▓▓▓▓ ▓▓▓▓▓░ ▓▓▓▓░░    │
// │    └─ Dallas Mobile (T3)  Cap: 15         8      10     12        │
// │       └─ Contribution: 50%                ▓▓▓░░░ ▓▓▓▓░░ ▓▓▓▓▓░    │
// │                                                                     │
// │  Trinity San Antonio (T2) Cap: 35         28     25     22        │
// │    └─ Contribution: 100%                  ▓▓▓▓▓░ ▓▓▓▓░░ ▓▓▓░░░    │
// │                                                                     │
// │  External Overflow (T3)   Cap: 40         29     20     15        │
// │    └─ Contribution: 75%                   ▓▓▓▓░░ ▓▓▓░░░ ▓▓░░░░    │
// │                                                                     │
// └─────────────────────────────────────────────────────────────────────┘
```

### 15.5 S&OP Integration Dashboard

```tsx
// Component: SOPDashboard.tsx

// ┌─────────────────────────────────────────────────────────────────────┐
// │  S&OP PERFORMANCE DASHBOARD              January 2024              │
// ├──────────────────────────┬──────────────────────────────────────────┤
// │  NETWORK SUMMARY         │  ALERTS & ACTIONS                       │
// │  ────────────────────    │  ─────────────────                      │
// │  Target: 450 cars        │  ⚠️ Trinity Houston over capacity       │
// │  Confirmed: 380 (84%)    │     Projected 52/50 for Feb             │
// │  Completed: 285 (63%)    │                                         │
// │  On Track: ✅ Yes        │  ⚠️ Eagle Dallas behind pace            │
// │                          │     12 completed vs 18 expected         │
// │  Fleet Availability      │                                         │
// │  Target: 95%             │  ℹ️ 3P commitment gap: 15 cars          │
// │  Actual: 93.2%           │     Need to fill by month-end           │
// │                          │                                         │
// ├──────────────────────────┴──────────────────────────────────────────┤
// │  TARGET vs ACTUAL BY SHOP                                           │
// │                                                                     │
// │  Shop              Target  Confirmed  Completed  Status  Gap       │
// │  ──────────────────────────────────────────────────────────────    │
// │  Trinity Houston     45      42         32       ✅      +3        │
// │  Trinity Dallas      40      38         28       ✅      +2        │
// │  Eagle Railcar       50      48         30       ⚠️      -8        │
// │  GATX Mobile         25      22         18       ✅      +3        │
// │  3P Network          40      35         22       ⚠️      -5        │
// │                                                                     │
// ├─────────────────────────────────────────────────────────────────────┤
// │  TREND CHART: Last 6 Months                                         │
// │                                                                     │
// │  500│         ┌─Target                                              │
// │     │    ╱────┘                                                     │
// │  400│   ╱  ╱──Actual                                                │
// │     │  ╱──╱                                                         │
// │  300│ ╱                                                             │
// │     └──────────────────────────────────────────                     │
// │       Aug  Sep  Oct  Nov  Dec  Jan                                  │
// └─────────────────────────────────────────────────────────────────────┘
```

### 15.6 UI Polish Items

These enhancements improve usability and provide better visual feedback:

#### 3-Color Capacity Bars

```tsx
// Capacity bar color thresholds (configurable per shop/tier)
interface CapacityBarConfig {
  greenThreshold: number;   // 0-70% = Green (healthy capacity)
  yellowThreshold: number;  // 70-90% = Yellow (approaching limit)
  redThreshold: number;     // 90%+ = Red (at/over capacity)
}

// Default thresholds
const DEFAULT_THRESHOLDS: CapacityBarConfig = {
  greenThreshold: 70,
  yellowThreshold: 90,
  redThreshold: 100  // At 100%+ show solid red
};

// Tier-specific thresholds (Tier 1 can handle more stress)
const TIER_THRESHOLDS: Record<number, CapacityBarConfig> = {
  1: { greenThreshold: 75, yellowThreshold: 95, redThreshold: 110 },  // 10% overcommit
  2: { greenThreshold: 70, yellowThreshold: 90, redThreshold: 100 },
  3: { greenThreshold: 65, yellowThreshold: 85, redThreshold: 100 },
};

// Visual representation:
// ▓▓▓▓▓▓▓░░░ 70% = Green bar
// ▓▓▓▓▓▓▓▓▓░ 85% = Yellow bar (approaching limit)
// ▓▓▓▓▓▓▓▓▓▓ 100% = Red bar (at capacity)
// ▓▓▓▓▓▓▓▓▓▓▓ 105% = Red with warning pulse (over capacity)
```

#### Explanatory Tooltips

```tsx
// Tooltip content for key metrics
const CAPACITY_TOOLTIPS = {
  monthlyCapacityLimit: `
    Maximum railcars this shop can process per month.
    Set during shop onboarding based on physical capacity,
    staffing, and equipment availability.
  `,
  confirmedRailcars: `
    Railcars with firm shop assignments that DEDUCT from
    available capacity. These cars have routing documents
    and are expected to arrive.
  `,
  plannedRailcars: `
    Forecasted/S&OP work for visibility only. Does NOT
    deduct from capacity until converted to confirmed.
    Helps with demand planning and staffing.
  `,
  remainingAvailableRailcars: `
    = monthlyCapacityLimit - confirmedRailcars
    How many more cars can be confirmed this month.
    Does not include planned railcars (visibility only).
  `,
  overcommitAllowance: `
    Tier 1 shops may accept up to X% beyond stated capacity
    for critical work. Requires manager approval. Shows as
    yellow buffer zone on capacity bar.
  `,
  sopTargetRailcars: `
    S&OP target for this month. Used for tracking against
    plan but does NOT automatically increase capacity.
    If target > capacity, a warning is generated.
  `,
};

// Usage in components:
// <Tooltip content={CAPACITY_TOOLTIPS.confirmedRailcars}>
//   <span className="metric-label">Confirmed: {confirmed}</span>
// </Tooltip>
```

#### Best-Fit Recommendation Button

```tsx
// Component: BestFitRecommendation.tsx
interface BestFitProps {
  railcarId: string;
  workType: WorkType;
  targetPeriod: Date;
  preferredRegion?: string;
}

// Algorithm: Find optimal shop for a railcar
async function getBestFitRecommendation(props: BestFitProps): Promise<ShopRecommendation[]> {
  // 1. Filter by capability (must have required tier/certifications)
  // 2. Filter by car compatibility (car type restrictions)
  // 3. Filter by customer preferences (restricted shops)
  // 4. Score by: capacity availability, distance, cost, turn time
  // 5. Return top 3-5 recommendations with scores

  const scoring = {
    capacityWeight: 0.35,   // Prefer shops with available capacity
    distanceWeight: 0.25,   // Minimize travel distance
    costWeight: 0.20,       // Cost efficiency
    turnTimeWeight: 0.15,   // Faster is better
    networkWeight: 0.05,    // Prefer in-network shops
  };

  return rankedShops.slice(0, 5);
}

// UI Integration:
// ┌─────────────────────────────────────────────────┐
// │  🎯 Best-Fit Recommendation                     │
// │                                                 │
// │  For: GATX 12345 | Work: Tank Qual | Feb 2024  │
// │                                                 │
// │  ⭐ Trinity Houston (Tier 1)                   │
// │     Score: 92/100 | 15 available | 180 miles   │
// │     [Select] [Details]                         │
// │                                                 │
// │  2. Eagle Railcar (Tier 1)                     │
// │     Score: 87/100 | 8 available | 220 miles    │
// │     [Select] [Details]                         │
// │                                                 │
// │  3. GATX Dallas (Tier 2)                       │
// │     Score: 74/100 | ⚠️ Requires Tier 1 work    │
// │     [Select] [Details]                         │
// │                                                 │
// └─────────────────────────────────────────────────┘
```

#### 6-Month Trend Sparklines

```tsx
// Component: CapacitySparkline.tsx
interface SparklineProps {
  shopId: string;
  metric: 'confirmedRailcars' | 'completedRailcars' | 'turnTime' | 'utilization';
  months: 6 | 12;
}

// Compact inline visualization for dashboards
// ▁▂▃▅▆▇ (ascending trend - getting busier)
// ▇▆▅▃▂▁ (descending trend - capacity freeing up)
// ▃▅▆▅▃▂ (peak in middle)

// Example in table row:
// │ Shop           │ Capacity │ Trend (6mo)  │ Projection │
// │ Trinity Houston│ 42/50    │ ▃▄▅▆▇▇ ↗    │ 95% Feb    │
// │ Eagle Railcar  │ 35/50    │ ▇▆▅▄▃▂ ↘    │ 60% Feb    │
// │ GATX Dallas    │ 28/40    │ ▄▄▅▄▅▄ →    │ 70% Feb    │

// Tooltip on sparkline shows actual values:
// "Aug: 38 | Sep: 42 | Oct: 45 | Nov: 48 | Dec: 50 | Jan: 52"
```

---

## 16. Rail Industry Best Practices & Integration Points

### 16.1 Railinc/UMLER Integration

```typescript
// Integration with AAR's Railinc UMLER database for car master data

interface UMLERIntegration {
  // Sync car master data from UMLER
  syncCarMaster(carInitials: string, carNumber: string): Promise<UMLERCarData>;

  // Validate car exists and get current status
  validateCar(railcarNumber: string): Promise<{
    exists: boolean;
    currentLocation?: string;
    lastMovement?: Date;
    qualificationDates?: QualDates;
  }>;

  // Get qualification requirements by DOT spec
  getQualRequirements(dotSpec: string): Promise<{
    testInterval: number;  // months
    requiredTests: string[];
    certifications: string[];
  }>;
}

// Scheduled sync job
SCHEDULE DAILY AT 02:00:
  FOR EACH car IN Car WHERE lastUMLERSync < (NOW - 7 DAYS):
    umlerData = UMLERIntegration.syncCarMaster(car.carInitials, car.carNumber)
    UPDATE Car SET
      qualificationDates = umlerData.qualDates,
      dotSpec = umlerData.dotSpec,
      lastUMLERSync = NOW()
```

### 16.2 Qualification Alert System

```typescript
// Proactive alerts for upcoming qualifications

PROCEDURE GenerateQualAlerts():

  // 90-day warning for tank qualifications
  upcomingQuals = SELECT * FROM Car
    WHERE tankQualification BETWEEN NOW() AND NOW() + 90 DAYS
      AND shoppingStatus NOT IN ('InShop', 'Planned')

  FOR EACH car IN upcomingQuals:
    daysUntilDue = DATEDIFF(car.tankQualification, NOW())

    IF daysUntilDue <= 30 AND NOT hasAlert(car.id, 'QUAL_30'):
      CREATE Alert {
        type: "QUAL_DUE_30",
        severity: "HIGH",
        carId: car.id,
        message: "Tank qualification due in {daysUntilDue} days",
        actionRequired: "Schedule for Tier 1 shop"
      }
      // Auto-create planned entry if not exists
      IF NOT RailcarPlanEntry EXISTS for car.id in next 30 days:
        eligibleShops = GetEligibleShops(car.id, "QUAL", car.region)
        IF eligibleShops.length > 0:
          CREATE RailcarPlanEntry {
            carId: car.id,
            shopId: eligibleShops[0].id,
            plannedMonth: MONTH(car.tankQualification),
            workType: "QUAL",
            planSource: "QUAL_SCHEDULE",
            confidence: "HIGH"
          }

    ELSE IF daysUntilDue <= 60 AND NOT hasAlert(car.id, 'QUAL_60'):
      CREATE Alert { type: "QUAL_DUE_60", severity: "MEDIUM", ... }

    ELSE IF daysUntilDue <= 90 AND NOT hasAlert(car.id, 'QUAL_90'):
      CREATE Alert { type: "QUAL_DUE_90", severity: "LOW", ... }
```

### 16.3 Demurrage Risk Monitoring

```typescript
// Monitor in-transit cars for demurrage risk

PROCEDURE CheckDemurrageRisk():

  inTransitCars = SELECT * FROM RailcarScheduleEntry
    WHERE status = 'IN_TRANSIT'
      AND inTransitSince IS NOT NULL

  FOR EACH entry IN inTransitCars:
    daysInTransit = DATEDIFF(NOW(), entry.inTransitSince)
    expectedTransitDays = CalculateTransitTime(entry.originYard, shop.splc)

    IF daysInTransit > expectedTransitDays + 3:
      // High risk - likely incurring demurrage
      UPDATE RailcarScheduleEntry SET
        demurrageRiskLevel = 'HIGH',
        demurrageAlertDate = entry.inTransitSince + expectedTransitDays
      WHERE id = entry.id

      CREATE Alert {
        type: "DEMURRAGE_HIGH",
        severity: "CRITICAL",
        message: "Car {entry.carId} in transit {daysInTransit} days, expected {expectedTransitDays}"
      }

    ELSE IF daysInTransit > expectedTransitDays:
      UPDATE RailcarScheduleEntry SET demurrageRiskLevel = 'MEDIUM'

    ELSE IF daysInTransit > expectedTransitDays - 2:
      UPDATE RailcarScheduleEntry SET demurrageRiskLevel = 'LOW'
```

### 16.4 AAR Compliance Audit Trail

```typescript
// Comprehensive audit trail for AAR compliance

interface AuditEntry {
  id: string;
  timestamp: Date;
  userId: string;
  action: AuditAction;
  entityType: 'Shop' | 'Car' | 'ScheduleEntry' | 'Qualification';
  entityId: string;
  previousValues: Record<string, any>;
  newValues: Record<string, any>;
  ipAddress: string;
  sessionId: string;
}

// Required audit events for AAR compliance:
// - Shop certification changes
// - Qualification date modifications
// - Work completion sign-offs
// - Capacity overrides
// - Assignment changes
// - Tier/capability modifications

TRIGGER ON UPDATE Shop:
  IF OLD.certificationClass != NEW.certificationClass
     OR OLD.certificationExp != NEW.certificationExp
     OR OLD.tierId != NEW.tierId:
    CREATE AuditEntry {
      action: 'SHOP_CERTIFICATION_CHANGE',
      entityType: 'Shop',
      entityId: NEW.id,
      previousValues: { certificationClass: OLD.certificationClass, ... },
      newValues: { certificationClass: NEW.certificationClass, ... }
    }

TRIGGER ON UPDATE RailcarScheduleEntry:
  IF OLD.status != NEW.status AND NEW.status = 'COMPLETE':
    CREATE AuditEntry {
      action: 'WORK_COMPLETED',
      entityType: 'ScheduleEntry',
      entityId: NEW.id,
      newValues: {
        completedAt: NEW.actualCompletionDate,
        completedBy: currentUser,
        actualDays: NEW.actualDays,
        qualificationExtended: (NEW.workType = 'QUAL')
      }
    }
```

---

## 17. Error Handling & Validation

### 17.1 Capacity Validation Rules

```typescript
// Validation rules to prevent invalid states

FUNCTION ValidateCapacityOperation(operation, shopId, year, month):

  errors = []
  warnings = []

  capacity = GetMonthlyCapacity(shopId, year, month)
  shop = GetShop(shopId)

  SWITCH operation.type:

    CASE 'CONFIRM_ASSIGNMENT':
      // Rule 1: Cannot confirm if at hard capacity
      IF capacity.confirmedCount >= capacity.baseCapacity:
        errors.push("Shop at maximum confirmed capacity")

      // Rule 2: Warn if projected exceeds capacity
      IF capacity.totalCommitted + 1 > capacity.baseCapacity:
        warnings.push("This will exceed projected capacity")

      // Rule 3: Validate work type vs tier
      IF NOT TierSupportsWorkType(shop.tierId, operation.workType):
        errors.push("Shop tier does not support {operation.workType}")

      // Rule 4: Check certification validity
      IF shop.certificationExp < NOW():
        errors.push("Shop certification has expired")

      // Rule 5: Validate car eligibility
      eligibility = ValidateCarEligibility(operation.carId, shopId)
      IF NOT eligibility.eligible:
        errors.push(eligibility.reason)

    CASE 'ADJUST_CAPACITY':
      // Rule: Cannot reduce below confirmed
      IF operation.newCapacity < capacity.confirmedCount:
        errors.push("Cannot reduce capacity below confirmed count ({capacity.confirmedCount})")

    CASE 'CANCEL_ASSIGNMENT':
      // Rule: Cannot cancel completed work
      entry = GetScheduleEntry(operation.entryId)
      IF entry.status = 'COMPLETE':
        errors.push("Cannot cancel completed work")

  RETURN { valid: errors.length = 0, errors, warnings }
```

### 17.2 Negative Capacity Prevention

```typescript
// Database constraints and triggers to prevent negative capacity

-- PostgreSQL constraint
ALTER TABLE ShopMonthlyCapacity
  ADD CONSTRAINT check_non_negative_capacity
  CHECK (confirmedCount >= 0 AND plannedCount >= 0 AND availableCapacity >= 0);

-- Trigger to recalculate on any change
CREATE OR REPLACE FUNCTION recalculate_capacity()
RETURNS TRIGGER AS $$
BEGIN
  NEW.availableCapacity := GREATEST(0,
    COALESCE(NEW.adjustedCapacity, NEW.baseCapacity) - NEW.confirmedCount
  );
  NEW.totalCommitted := NEW.confirmedCount + NEW.plannedCount;
  NEW.utilizationPercent := CASE
    WHEN NEW.baseCapacity > 0
    THEN (NEW.confirmedCount::FLOAT / NEW.baseCapacity) * 100
    ELSE 0
  END;
  NEW.projectedUtilization := CASE
    WHEN NEW.baseCapacity > 0
    THEN (NEW.totalCommitted::FLOAT / NEW.baseCapacity) * 100
    ELSE 0
  END;
  NEW.isOverCapacity := NEW.confirmedCount > NEW.baseCapacity;
  NEW.isAtRisk := NEW.totalCommitted > NEW.baseCapacity;
  NEW.lastCalculatedAt := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER capacity_recalc_trigger
  BEFORE INSERT OR UPDATE ON ShopMonthlyCapacity
  FOR EACH ROW EXECUTE FUNCTION recalculate_capacity();
```

---

## 18. Implementation Checklist

### Phase 1: Database (Week 1-2)
- [ ] Create Prisma migration for ShopTier
- [ ] Create Prisma migration for ShopHierarchy
- [ ] Create Prisma migration for ShopMonthlyCapacity
- [ ] Create Prisma migration for RailcarScheduleEntry
- [ ] Create Prisma migration for RailcarPlanEntry
- [ ] Create Prisma migration for SOPShopTarget
- [ ] Add new relations to Shop model
- [ ] Create seed data for default tiers
- [ ] Write data migration script for existing shops

### Phase 2: Backend Services (Week 2-4)
- [ ] ShopTierService (CRUD, validation)
- [ ] ShopHierarchyService (CRUD, tree operations)
- [ ] ShopCapacityService (calculations, roll-up)
- [ ] RailcarScheduleService (confirm, cancel, status updates)
- [ ] RailcarPlanService (create, convert to confirmed)
- [ ] SOPTargetService (set targets, track progress)
- [ ] CapacityCalculationJob (scheduled recalculation)
- [ ] QualificationAlertJob (daily alerts)

### Phase 3: API Endpoints (Week 3-4)
- [ ] GET/POST/PUT/DELETE /shops/:id/tier
- [ ] GET/POST/PUT/DELETE /shops/:id/hierarchy
- [ ] GET/PUT /shops/:id/capacity/:year/:month
- [ ] GET/POST /shops/:id/schedule
- [ ] GET/POST /shops/:id/planned
- [ ] GET/POST/PUT /shops/:id/sop-targets
- [ ] GET /network/:id/capacity-rollup

### Phase 4: Frontend (Week 4-6)
- [ ] ShopHierarchyTree component
- [ ] ShopCapacityDashboard component
- [ ] RailcarAssignmentWizard component
- [ ] NetworkCapacityRollup component
- [ ] SOPDashboard component
- [ ] Integrate with existing ShopManagement page
- [ ] Add capacity views to PlanningGrid

### Phase 5: Testing & Deployment (Week 6-7)
- [ ] Unit tests for capacity calculations
- [ ] Integration tests for hierarchy roll-up
- [ ] E2E tests for assignment workflow
- [ ] Performance testing with large shop networks
- [ ] Documentation updates
- [ ] Deployment to staging
- [ ] UAT with operations team
- [ ] Production deployment
