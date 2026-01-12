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

| Tier | Name | Code | Key Capabilities | Typical Capacity |
|------|------|------|------------------|------------------|
| **1** | Heavy Repair / Qualification | `TIER1` | Full AAR M-1003, tank requalification, hydro testing, wheel work, heavy structural | 20-50 cars/month |
| **2** | Intermediate Repair | `TIER2` | Light structural, component replacement, PM, Rule 88B | 30-80 cars/month |
| **3** | Field/Quick Service | `TIER3` | Mobile/on-site, quick repairs, overflow, emergency response | 10-30 cars/month |

### Seed Data SQL

```sql
-- Tier 1: Heavy Repair / Full Qualification
INSERT INTO ShopTier (id, tierLevel, name, code, description,
  aarCertificationRequired, aarCertificationTypes, dotCertificationRequired,
  canPerformHeavyRepair, canPerformWheelWork, canPerformTankRequalification,
  canPerformPainting, canPerformBlasting, canPerformWelding, canPerformLiningWork,
  canPerformHydroTesting, canPerformUltrasonicTesting, canPerformRule88B,
  typicalMinCapacity, typicalMaxCapacity, typicalTurnTimeDays, routingPriority,
  canEscalateTo, canReceiveFrom, companyId)
VALUES (
  uuid(), 1, 'Heavy Repair / Qualification', 'TIER1',
  'Full-service AAR-certified facility capable of heavy structural repairs, tank requalifications, and wheel work',
  true, '["M-1003", "M-1002"]', true,
  true, true, true, true, true, true, true, true, true, true,
  20, 50, 21, 1,
  '[]', '["TIER2", "TIER3"]', '<company_id>'
);

-- Tier 2: Intermediate Repair
INSERT INTO ShopTier (id, tierLevel, name, code, description,
  aarCertificationRequired, canPerformHeavyRepair, canPerformWheelWork,
  canPerformTankRequalification, canPerformWelding, canPerformRule88B,
  canPerformPreventiveMaint, typicalMinCapacity, typicalMaxCapacity,
  typicalTurnTimeDays, routingPriority, canEscalateTo, canReceiveFrom, companyId)
VALUES (
  uuid(), 2, 'Intermediate Repair', 'TIER2',
  'Light-to-medium repair facility for component work, PM, and Rule 88B compliance',
  false, false, false, false, true, true, true,
  30, 80, 14, 2,
  '["TIER1"]', '["TIER3"]', '<company_id>'
);

-- Tier 3: Field/Quick Service
INSERT INTO ShopTier (id, tierLevel, name, code, description,
  canPerformFieldService, canPerformQuickService, canPerformPreventiveMaint,
  typicalMinCapacity, typicalMaxCapacity, typicalTurnTimeDays, routingPriority,
  canEscalateTo, canReceiveFrom, companyId)
VALUES (
  uuid(), 3, 'Field/Quick Service', 'TIER3',
  'Mobile units, field service crews, and overflow/quick-turnaround locations',
  true, true, true,
  10, 30, 7, 3,
  '["TIER2", "TIER1"]', '[]', '<company_id>'
);
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

## 4. ShopMonthlyCapacity Model

Track confirmed vs. planned capacity consumption by month.

### Schema Definition

```prisma
// =============================================================================
// SHOP MONTHLY CAPACITY - Confirmed vs. Planned Capacity Tracking
// =============================================================================
// Separates capacity into:
// - Confirmed: Deducted from available (firm commitments)
// - Planned: Visible but not deducted (forecasted/S&OP targets)
// =============================================================================

model ShopMonthlyCapacity {
  id                      String   @id @default(uuid())

  // Shop and period
  shopId                  String
  shop                    Shop     @relation("MonthlyCapacity", fields: [shopId], references: [id], onDelete: Cascade)
  year                    Int      // e.g., 2024
  month                   Int      // 1-12

  // Base capacity (from shop settings or S&OP allocation)
  baseCapacity            Int      @default(0) // Total available spots
  adjustedCapacity        Int?     // Override if different from base (seasonal, maintenance)
  capacityNotes           String   @default("") // Reason for adjustment

  // Confirmed consumption (DEDUCTED from available)
  confirmedCount          Int      @default(0) // # of confirmed railcars
  confirmedLaborHours     Float    @default(0) // Total confirmed labor hours
  confirmedDays           Float    @default(0) // Total confirmed car-days

  // Planned consumption (NOT deducted, visibility only)
  plannedCount            Int      @default(0) // # of planned/forecasted railcars
  plannedLaborHours       Float    @default(0) // Forecasted labor hours
  plannedDays             Float    @default(0) // Forecasted car-days

  // Calculated fields (updated by triggers/service)
  availableCapacity       Int      @default(0) // base - confirmed
  totalCommitted          Int      @default(0) // confirmed + planned
  utilizationPercent      Float    @default(0) // confirmed / base * 100
  projectedUtilization    Float    @default(0) // (confirmed + planned) / base * 100

  // S&OP target tracking
  sopTargetCount          Int      @default(0) // S&OP target for this month
  sopTargetProgress       Float    @default(0) // confirmed / sopTarget * 100

  // Capacity by work type
  qualCapacityUsed        Int      @default(0) // Qualifications confirmed
  repairCapacityUsed      Int      @default(0) // Repairs confirmed
  pmCapacityUsed          Int      @default(0) // PM confirmed

  // Roll-up from children (if parent shop)
  childrenConfirmed       Int      @default(0) // Sum of children's confirmed
  childrenPlanned         Int      @default(0) // Sum of children's planned
  networkTotalCapacity    Int      @default(0) // Base + children's base (if aggregating)
  networkAvailable        Int      @default(0) // Available + children's available

  // Status flags
  isOverCapacity          Boolean  @default(false) // confirmed > base
  isAtRisk                Boolean  @default(false) // projected > base
  requiresAttention       Boolean  @default(false) // Manual flag

  // Audit
  lastCalculatedAt        DateTime @default(now())
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt

  // Company ownership
  companyId               String
  company                 Company  @relation(fields: [companyId], references: [id])

  @@unique([shopId, year, month])
  @@index([shopId])
  @@index([year, month])
  @@index([companyId])
  @@index([isOverCapacity])
  @@index([isAtRisk])
}
```

### Capacity Calculation Rules

| Field | Formula |
|-------|---------|
| `availableCapacity` | `max(0, (adjustedCapacity ?? baseCapacity) - confirmedCount)` |
| `totalCommitted` | `confirmedCount + plannedCount` |
| `utilizationPercent` | `(confirmedCount / baseCapacity) * 100` |
| `projectedUtilization` | `(totalCommitted / baseCapacity) * 100` |
| `sopTargetProgress` | `(confirmedCount / sopTargetCount) * 100` (if target > 0) |
| `isOverCapacity` | `confirmedCount > baseCapacity` |
| `isAtRisk` | `totalCommitted > baseCapacity` |

---

## 5. RailcarScheduleEntry Model

Individual railcar scheduling entries (confirmed).

### Schema Definition

```prisma
// =============================================================================
// RAILCAR SCHEDULE ENTRY - Confirmed Shop Assignments
// =============================================================================
// When a railcar is confirmed for a shop visit, it creates a schedule entry
// that deducts capacity from ShopMonthlyCapacity.
// =============================================================================

model RailcarScheduleEntry {
  id                      String   @id @default(uuid())

  // Core references
  carId                   String
  car                     Car      @relation("ScheduleEntries", fields: [carId], references: [id], onDelete: Cascade)
  shopId                  String
  shop                    Shop     @relation("ScheduleEntries", fields: [shopId], references: [id])

  // Schedule details
  scheduledYear           Int
  scheduledMonth          Int      // Target month
  scheduledWeek           Int?     // Optional: specific week (1-5)
  scheduledDate           DateTime? // Optional: specific date

  // Work scope
  workType                String   @default("REPAIR") // QUAL, REPAIR, PM, INSPECTION, OTHER
  defectCodes             String   @default("[]") // JSON: AAR defect codes
  workDescription         String   @default("")
  estimatedDays           Float    @default(7) // Expected duration
  estimatedLaborHours     Float    @default(40) // Expected labor
  estimatedCost           Float    @default(0)

  // Priority and urgency
  priority                Int      @default(3) // 1=Critical, 2=High, 3=Normal, 4=Low
  isUrgent                Boolean  @default(false) // Regulatory deadline approaching
  dueDate                 DateTime? // Hard deadline (e.g., qual expiration)

  // Status tracking
  status                  String   @default("SCHEDULED") // SCHEDULED, IN_TRANSIT, ARRIVED, IN_PROGRESS, COMPLETE, CANCELLED
  statusUpdatedAt         DateTime @default(now())

  // Actual results (filled after completion)
  actualArrivalDate       DateTime?
  actualStartDate         DateTime?
  actualCompletionDate    DateTime?
  actualDays              Float?
  actualLaborHours        Float?
  actualCost              Float?

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
  sourceId                String?  // Reference to source record (CarFlowPlan, SOPCommitment, etc.)

  // Audit
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
  createdBy               String?
  confirmedAt             DateTime?
  confirmedBy             String?

  // Company ownership
  companyId               String
  company                 Company  @relation(fields: [companyId], references: [id])

  @@unique([carId, shopId, scheduledYear, scheduledMonth])
  @@index([shopId, scheduledYear, scheduledMonth])
  @@index([carId])
  @@index([status])
  @@index([workType])
  @@index([companyId])
  @@index([priority])
  @@index([dueDate])
}
```

---

## 6. RailcarPlanEntry Model

Planned/forecasted railcar assignments (visibility only, no capacity deduction).

### Schema Definition

```prisma
// =============================================================================
// RAILCAR PLAN ENTRY - Forecasted/Planned Assignments (No Capacity Deduction)
// =============================================================================
// Represents planned work from S&OP, fleet forecasting, or advance notifications.
// Shows potential capacity consumption but does NOT deduct from available.
// =============================================================================

model RailcarPlanEntry {
  id                      String   @id @default(uuid())

  // Core references (car may be specific or a placeholder)
  carId                   String?  // Null if generic planned volume
  car                     Car?     @relation("PlanEntries", fields: [carId], references: [id], onDelete: SetNull)
  shopId                  String
  shop                    Shop     @relation("PlanEntries", fields: [shopId], references: [id])

  // For generic/bulk planned volumes
  plannedCarCount         Int      @default(1) // If carId is null, this is the count
  carTypeFilter           String?  // e.g., "TANK" - for generic volume allocation

  // Plan period
  plannedYear             Int
  plannedMonth            Int

  // Work scope (forecasted)
  workType                String   @default("REPAIR")
  estimatedDaysPerCar     Float    @default(7)
  estimatedLaborHoursPerCar Float  @default(40)
  estimatedCostPerCar     Float    @default(0)

  // Source of plan
  planSource              String   @default("MANUAL") // MANUAL, SOP, FLEET_FORECAST, QUAL_SCHEDULE, IMPORT
  planSourceId            String?  // Reference to source (MasterPlan, SOPCommitment, etc.)
  planSourceName          String   @default("") // Display name of source

  // Confidence level
  confidence              String   @default("MEDIUM") // LOW, MEDIUM, HIGH, COMMITTED
  probabilityPercent      Float    @default(50) // 0-100% likelihood

  // Conversion tracking
  status                  String   @default("PLANNED") // PLANNED, CONVERTED, CANCELLED, EXPIRED
  convertedToScheduleId   String?  // If converted, link to RailcarScheduleEntry
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

  @@index([shopId, plannedYear, plannedMonth])
  @@index([carId])
  @@index([planSource])
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
└─────────────────┘       │ capacity         │       └─────────────────┘
                          │ ...              │
                          └────────┬─────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
              ▼                    ▼                    ▼
┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
│   ShopHierarchy     │ │ ShopMonthlyCapacity │ │   SOPShopTarget     │
│─────────────────────│ │─────────────────────│ │─────────────────────│
│ parentShopId        │ │ shopId              │ │ shopId              │
│ childShopId         │ │ year, month         │ │ year, month         │
│ relationshipType    │ │ baseCapacity        │ │ targetCarsProcessed │
│ capacitySharePercent│ │ confirmedCount      │ │ targetBacklogEnd    │
│ canReceiveOverflow  │ │ plannedCount        │ │ actualCarsProcessed │
└─────────────────────┘ │ availableCapacity   │ │ isOnTrack           │
                        │ utilizationPercent  │ └─────────────────────┘
                        └─────────┬───────────┘
                                  │
                  ┌───────────────┴───────────────┐
                  │                               │
                  ▼                               ▼
    ┌─────────────────────────┐    ┌─────────────────────────┐
    │  RailcarScheduleEntry   │    │   RailcarPlanEntry      │
    │─────────────────────────│    │─────────────────────────│
    │ carId (required)        │    │ carId (optional)        │
    │ shopId                  │    │ shopId                  │
    │ scheduledYear, Month    │    │ plannedYear, Month      │
    │ workType                │    │ workType                │
    │ status                  │    │ planSource              │
    │ estimatedDays           │    │ confidence              │
    │ DEDUCTS CAPACITY        │    │ NO CAPACITY DEDUCTION   │
    └─────────────────────────┘    └─────────────────────────┘
              │                               │
              └───────────────┬───────────────┘
                              ▼
                      ┌───────────────┐
                      │     Car       │
                      │───────────────│
                      │ railcarNumber │
                      │ carType       │
                      │ shoppingStatus│
                      └───────────────┘
```

---

## 10. Migration Strategy

### Phase 1: Add New Tables (Non-Breaking)
1. Create `ShopTier` table with seed data
2. Create `ShopHierarchy` table
3. Create `ShopMonthlyCapacity` table
4. Create `RailcarScheduleEntry` table
5. Create `RailcarPlanEntry` table
6. Create `SOPShopTarget` table

### Phase 2: Migrate Existing Data
1. Map existing `networkTier` values to new `ShopTier` records
2. Convert existing `parentShopId` relationships to `ShopHierarchy` entries
3. Migrate `CarFlowPlan` confirmed entries to `RailcarScheduleEntry`
4. Calculate initial `ShopMonthlyCapacity` from current data

### Phase 3: Update Application Code
1. Update Shop service to use new tier relation
2. Add hierarchy management service
3. Implement capacity calculation service
4. Update allocation engine to use new models

### Phase 4: Deprecate Old Fields
1. Mark `networkTier` as deprecated
2. Consider removing redundant `parentShopId` after full migration

---

## Summary

This schema design provides:

| Feature | Model | Key Benefit |
|---------|-------|-------------|
| **Tiered Classification** | `ShopTier` | AAR-aligned capability classification (Tier 1/2/3) |
| **Hierarchy Management** | `ShopHierarchy` | Explicit parent-child with capacity roll-up settings |
| **Capacity Tracking** | `ShopMonthlyCapacity` | Confirmed vs. planned separation |
| **Confirmed Assignments** | `RailcarScheduleEntry` | Deducts capacity, full work order tracking |
| **Planned Forecasts** | `RailcarPlanEntry` | S&OP visibility without capacity deduction |
| **S&OP Integration** | `SOPShopTarget` | Target vs. actual tracking per period |

---

## 11. Core Business Logic Rules

### 11.1 Railcar Assignment & Capacity Deduction

When a railcar is **confirmed** for a shop visit, the system must:

```
PROCEDURE ConfirmRailcarAssignment(carId, shopId, year, month, workType, estimatedDays)

  // Step 1: Validate inputs
  1. Verify car exists and is not already scheduled for same shop/month
  2. Verify shop exists and is active
  3. Verify shop tier supports requested workType (via ShopTier capabilities)
  4. Verify shop has required certifications for car type (via ShopCapabilityProfile)

  // Step 2: Check capacity availability
  5. GET monthlyCapacity = ShopMonthlyCapacity WHERE shopId, year, month
  6. IF monthlyCapacity does not exist:
       CREATE monthlyCapacity with baseCapacity = shop.capacity
  7. CALCULATE effectiveCapacity = monthlyCapacity.adjustedCapacity ?? monthlyCapacity.baseCapacity
  8. CALCULATE available = effectiveCapacity - monthlyCapacity.confirmedCount

  // Step 3: Capacity validation (with planned visibility)
  9. IF available <= 0:
       RETURN ERROR "Shop is at capacity for {month}/{year}"
  10. CALCULATE projectedTotal = monthlyCapacity.confirmedCount + monthlyCapacity.plannedCount + 1
  11. IF projectedTotal > effectiveCapacity:
       WARN "Confirming this will exceed planned capacity. {projectedTotal} vs {effectiveCapacity}"

  // Step 4: Create schedule entry (deducts capacity)
  12. CREATE RailcarScheduleEntry {
        carId, shopId, scheduledYear: year, scheduledMonth: month,
        workType, estimatedDays, status: "SCHEDULED",
        confirmedAt: NOW(), confirmedBy: currentUser
      }

  // Step 5: Update capacity counters (CRITICAL - capacity deduction)
  13. UPDATE ShopMonthlyCapacity SET
        confirmedCount = confirmedCount + 1,
        confirmedDays = confirmedDays + estimatedDays,
        availableCapacity = effectiveCapacity - (confirmedCount + 1),
        utilizationPercent = ((confirmedCount + 1) / baseCapacity) * 100,
        totalCommitted = (confirmedCount + 1) + plannedCount,
        projectedUtilization = (totalCommitted / baseCapacity) * 100,
        isOverCapacity = (confirmedCount + 1) > baseCapacity,
        isAtRisk = totalCommitted > baseCapacity,
        lastCalculatedAt = NOW()
      WHERE shopId, year, month

  // Step 6: If plan entry existed, convert it
  14. IF RailcarPlanEntry exists for (carId, shopId, year, month):
        UPDATE RailcarPlanEntry SET
          status = "CONVERTED",
          convertedToScheduleId = newScheduleEntry.id,
          convertedAt = NOW()
        UPDATE ShopMonthlyCapacity SET
          plannedCount = plannedCount - 1
          // Recalculate projectedUtilization

  // Step 7: Update hierarchy roll-up (if child shop)
  15. CALL RecalculateParentCapacity(shopId, year, month)

  // Step 8: Check S&OP target progress
  16. UPDATE SOPShopTarget SET
        actualCarsProcessed = (SELECT COUNT FROM RailcarScheduleEntry
                               WHERE status IN ('COMPLETE') AND shopId, year, month)
      WHERE shopId, year, month

  // Step 9: Audit trail
  17. CREATE AuditLog {
        action: "RAILCAR_CONFIRMED",
        entityType: "RailcarScheduleEntry",
        entityId: newScheduleEntry.id,
        changes: { carId, shopId, month, year, workType },
        userId: currentUser
      }

  RETURN SUCCESS with scheduleEntry.id
END PROCEDURE
```

### 11.2 Planned Entry Creation (No Capacity Deduction)

```
PROCEDURE CreatePlannedEntry(carId?, shopId, year, month, workType, source, count = 1)

  // Step 1: Validate
  1. Verify shop exists and is active
  2. IF carId provided, verify car exists

  // Step 2: Get or create monthly capacity record
  3. GET monthlyCapacity = ShopMonthlyCapacity WHERE shopId, year, month
  4. IF not exists: CREATE with baseCapacity from shop

  // Step 3: Create plan entry (NO capacity deduction)
  5. CREATE RailcarPlanEntry {
        carId: carId ?? NULL,  // Can be null for bulk/generic plans
        plannedCarCount: carId ? 1 : count,
        shopId, plannedYear: year, plannedMonth: month,
        workType, planSource: source,
        confidence: "MEDIUM", probabilityPercent: 50,
        status: "PLANNED"
      }

  // Step 4: Update planned counters (visibility only)
  6. UPDATE ShopMonthlyCapacity SET
        plannedCount = plannedCount + (carId ? 1 : count),
        totalCommitted = confirmedCount + (plannedCount + count),
        projectedUtilization = (totalCommitted / baseCapacity) * 100,
        isAtRisk = totalCommitted > baseCapacity
      WHERE shopId, year, month

  // Step 5: Update hierarchy for visibility
  7. CALL RecalculateParentPlanned(shopId, year, month)

  RETURN planEntry.id
END PROCEDURE
```

### 11.3 Capacity Cancellation/Release

```
PROCEDURE CancelScheduleEntry(scheduleEntryId, reason)

  // Step 1: Get entry details
  1. GET entry = RailcarScheduleEntry WHERE id = scheduleEntryId
  2. IF entry.status IN ('COMPLETE', 'CANCELLED'):
       RETURN ERROR "Cannot cancel completed/cancelled entry"

  // Step 2: Update entry status
  3. UPDATE RailcarScheduleEntry SET
        status = "CANCELLED",
        notes = notes + " | Cancelled: " + reason
      WHERE id = scheduleEntryId

  // Step 3: Release capacity (CRITICAL - reverse deduction)
  4. UPDATE ShopMonthlyCapacity SET
        confirmedCount = confirmedCount - 1,
        confirmedDays = confirmedDays - entry.estimatedDays,
        availableCapacity = availableCapacity + 1,
        utilizationPercent = ((confirmedCount - 1) / baseCapacity) * 100,
        totalCommitted = totalCommitted - 1,
        isOverCapacity = (confirmedCount - 1) > baseCapacity
      WHERE shopId = entry.shopId, year = entry.scheduledYear, month = entry.scheduledMonth

  // Step 4: Update hierarchy
  5. CALL RecalculateParentCapacity(entry.shopId, entry.scheduledYear, entry.scheduledMonth)

  // Step 5: Audit
  6. CREATE AuditLog { action: "SCHEDULE_CANCELLED", ... }

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

```
PROCEDURE SetSOPTargets(shopId, year, month, targets)

  // Step 1: Validate inputs
  1. Verify shop exists
  2. Validate targets object has required fields

  // Step 2: Create or update SOPShopTarget
  3. UPSERT SOPShopTarget {
       shopId, year, month,
       targetCarsProcessed: targets.carsProcessed,
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

  // Step 3: Sync to ShopMonthlyCapacity for quick access
  4. UPDATE ShopMonthlyCapacity SET
       sopTargetCount = targets.carsProcessed,
       baseCapacity = GREATEST(baseCapacity, targets.carsProcessed)  // Ensure capacity >= target
     WHERE shopId, year, month

  // Step 4: Create planned entries for target gap
  5. currentConfirmed = ShopMonthlyCapacity.confirmedCount
  6. gap = targets.carsProcessed - currentConfirmed
  7. IF gap > 0:
       CREATE RailcarPlanEntry {
         carId: NULL,  // Generic volume
         plannedCarCount: gap,
         shopId, plannedYear: year, plannedMonth: month,
         workType: "MIXED",
         planSource: "SOP",
         planSourceId: sopTarget.id,
         planSourceName: "S&OP Plan " + targets.planVersion,
         confidence: "COMMITTED",
         probabilityPercent: 90
       }
       UPDATE ShopMonthlyCapacity SET
         plannedCount = plannedCount + gap

  // Step 5: Check for target conflicts
  8. IF targets.carsProcessed > shop.capacity * 1.1:
       WARN "S&OP target exceeds shop capacity by >10%"
       CREATE Notification for shop manager

  RETURN sopTarget.id
END PROCEDURE
```

### 14.2 S&OP Progress Tracking

```
PROCEDURE UpdateSOPProgress(shopId, year, month)

  // Step 1: Get current actuals
  1. completedCount = SELECT COUNT(*) FROM RailcarScheduleEntry
       WHERE shopId = shopId AND scheduledYear = year AND scheduledMonth = month
         AND status = 'COMPLETE'

  2. qualCount = SELECT COUNT(*) FROM RailcarScheduleEntry
       WHERE shopId = shopId AND scheduledYear = year AND scheduledMonth = month
         AND status = 'COMPLETE' AND workType = 'QUAL'

  3. repairCount = SELECT COUNT(*) FROM RailcarScheduleEntry
       WHERE shopId = shopId AND scheduledYear = year AND scheduledMonth = month
         AND status = 'COMPLETE' AND workType IN ('REPAIR', 'REPAIR_HEAVY', 'REPAIR_LIGHT')

  4. avgTurnTime = SELECT AVG(actualDays) FROM RailcarScheduleEntry
       WHERE shopId = shopId AND scheduledYear = year AND scheduledMonth = month
         AND status = 'COMPLETE' AND actualDays IS NOT NULL

  5. onTimeCount = SELECT COUNT(*) FROM RailcarScheduleEntry
       WHERE shopId = shopId AND scheduledYear = year AND scheduledMonth = month
         AND status = 'COMPLETE'
         AND (dueDate IS NULL OR actualCompletionDate <= dueDate)

  // Step 2: Calculate performance metrics
  6. onTimePercent = (onTimeCount / completedCount) * 100 IF completedCount > 0 ELSE 0

  // Step 3: Update SOPShopTarget
  7. GET target = SOPShopTarget WHERE shopId, year, month
  8. IF target exists:
       UPDATE SOPShopTarget SET
         actualCarsProcessed = completedCount,
         actualQualifications = qualCount,
         actualRepairs = repairCount,
         actualTurnTimeDays = avgTurnTime,
         actualOnTimePercent = onTimePercent,
         isOnTrack = (completedCount >= target.targetCarsProcessed * (dayOfMonth / daysInMonth)),
         riskLevel = CASE
           WHEN completedCount < target.targetCarsProcessed * 0.5 THEN 'HIGH'
           WHEN completedCount < target.targetCarsProcessed * 0.75 THEN 'MEDIUM'
           WHEN completedCount < target.targetCarsProcessed * 0.9 THEN 'LOW'
           ELSE 'NONE'
         END
       WHERE shopId, year, month

  // Step 4: Update monthly capacity S&OP progress
  9. UPDATE ShopMonthlyCapacity SET
       sopTargetProgress = (completedCount / sopTargetCount) * 100
     WHERE shopId, year, month AND sopTargetCount > 0

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
