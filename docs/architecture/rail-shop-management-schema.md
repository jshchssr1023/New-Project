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
