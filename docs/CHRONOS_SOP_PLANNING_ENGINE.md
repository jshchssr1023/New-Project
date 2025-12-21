# Chronos S&OP Master Planning Engine - Implementation Plan

## Overview

This document outlines the implementation plan for transitioning the Chronos Scheduler from a basic data-entry tool into an intelligent, shop-centric S&OP Master Planning Engine.

## Architecture Summary

The system is built on:
- **Backend**: Express.js + Prisma ORM with SQLite
- **Frontend**: React 18 + TypeScript + TailwindCSS
- **Existing Entities**: Shop, Car, Customer, Scenario, MasterPlan, MasterPlanCommitment

---

## 1. Shop-First Constraints Architecture

### 1.1 Shop Capability Profile Schema

**New Database Models:**

```prisma
model ShopCapabilityProfile {
  id                    String   @id @default(uuid())
  shopId                String   @unique
  shop                  Shop     @relation(fields: [shopId], references: [id], onDelete: Cascade)

  // Certifications (what work types this shop can perform)
  canPerformTankLining        Boolean @default(false)
  canPerformAnnualQuals       Boolean @default(false)
  canPerformRule88B           Boolean @default(false)
  canPerformSafetyRelief      Boolean @default(false)
  canPerformStubSill          Boolean @default(false)
  canPerformTankThickness     Boolean @default(false)
  canPerformFullQualification Boolean @default(true)
  canPerformPartialQual       Boolean @default(true)
  canPerformRepairs           Boolean @default(true)

  // Physical limits (what car types this shop can handle)
  allowedAssetClasses   String   @default("[]")  // JSON: ["Tank", "Hopper", "Boxcar"]
  maxCarLength          Int?                      // Max car length in feet
  maxCarWeight          Int?                      // Max car weight in tons
  hasJacketedCarSupport Boolean  @default(true)
  hasLinedCarSupport    Boolean  @default(true)

  // Hazardous material restrictions
  hazmatCertifications  String   @default("[]")  // JSON: ["DOT-111", "DOT-117", "DOT-105"]
  restrictedCommodities String   @default("[]")  // JSON: commodities NOT allowed
  allowedCommodities    String   @default("[]")  // JSON: commodities explicitly allowed (empty = all)

  // Customer restrictions
  preferredCustomers    String   @default("[]")  // JSON: customer codes with priority
  excludedCustomers     String   @default("[]")  // JSON: customers NOT served

  // Capacity constraints
  monthlyCapacity       Int      @default(50)
  maxConcurrentCars     Int      @default(10)

  companyId             String
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@index([shopId])
  @@index([companyId])
}
```

### 1.2 Validation Gatekeeper Service

**File: `backend/src/services/shopAllocationValidator.ts`**

The validation gatekeeper implements the core logic:

```typescript
IF (Car.Reason IN Shop.Capabilities)
   AND (Shop.Monthly_Capacity > 0)
THEN ALLOW
ELSE BLOCK
```

**Validation Checks:**
1. **Capability Match**: Does the shop have the certification for the required work?
2. **Asset Class Match**: Can the shop handle this car type (tank, hopper, etc.)?
3. **Hazmat Compliance**: Is the shop certified for this commodity?
4. **Customer Eligibility**: Is the customer allowed at this shop?
5. **Capacity Available**: Is there capacity remaining for the target month?

---

## 2. Auto-Allocation & S&OP Supply Logic

### 2.1 Contractual Commitment Prioritization

**Priority Order:**
1. **3rd Party (3P) Commitments First**: Fill take-or-pay obligations before AITX
2. **Customer SLA Priority**: Higher priority customers get first allocation
3. **Regulatory Deadline Priority**: Urgent (overdue) > Must Shop (this year) > Upcoming

**Algorithm:**
```typescript
function prioritizeAllocations(unassignedCars: Car[], shops: Shop[]): AllocationPlan {
  // Step 1: Sort cars by urgency score
  const prioritizedCars = sortByUrgencyScore(unassignedCars);

  // Step 2: Get 3P shops with unfilled commitments
  const thirdPartyShops = shops.filter(s => !s.isAitxInternal);
  const aitxShops = shops.filter(s => s.isAitxInternal);

  // Step 3: Fill 3P commitments first
  for (const car of prioritizedCars) {
    const eligible3PShops = thirdPartyShops.filter(s => isEligible(car, s));
    if (hasUnfilledCommitment(eligible3PShops)) {
      allocateTo3P(car, eligible3PShops);
    } else {
      allocateToAITX(car, aitxShops);
    }
  }
}
```

### 2.2 Dynamic Urgency Scoring

**Score Components (0-100 scale):**

| Factor | Weight | Calculation |
|--------|--------|-------------|
| Regulatory Deadline | 40% | Days until due (negative = overdue) |
| Customer Priority | 25% | Customer tier (1-5) |
| Logistical Proximity | 20% | Distance to capable shops |
| Revenue Impact | 15% | Contract value / SLA penalties |

**Shopping Status → Urgency Score:**
- `Urgent` (overdue): 90-100
- `Must Shop` (due this year): 70-89
- `Upcoming` (next year): 40-69
- `Compliant`: 10-39

### 2.3 Utilization Heatmapping

**Color Coding Logic:**
```typescript
function getUtilizationColor(utilization: number): string {
  if (utilization >= 90) return 'red';      // Critical - over capacity
  if (utilization >= 80) return 'yellow';   // Warning - approaching capacity
  if (utilization >= 50) return 'green';    // Healthy utilization
  return 'blue';                            // Under-utilized
}
```

**Display Locations:**
- Car Flow Planning page (capacity bars per shop/month)
- Dashboard (shop performance widget)
- Shop detail cards

---

## 3. Railcar Fleet Page Overhaul

### 3.1 Advanced Attribute Filtering

**New Filter Categories:**

| Filter | Type | Values |
|--------|------|--------|
| Tank Lining Type | Multi-select | Lined, Unlined, Rubber, Epoxy, etc. |
| Material Hauled | Multi-select | Derived from commodity field |
| Gasket Type | Multi-select | From car specifications |
| Asset Class | Multi-select | Tank, Hopper, Boxcar, Gondola |
| Qualification Status | Multi-select | Urgent, Must Shop, Upcoming, Compliant |
| Shopping Reason | Multi-select | Tank Qual, Rule 88B, Safety Relief, etc. |

### 3.2 Collapsible Customer Trees

**Hierarchy Structure:**
```
▼ SHELL OIL (125 cars)
  └─ Summary: 45 Urgent | 30 Must Shop | 50 Compliant
  └─ ▼ Expand to see individual cars...
      └─ SHEX 12345 (Tank, Urgent, Due: 2024-01)
      └─ SHEX 12346 (Tank, Must Shop, Due: 2025-03)

▼ CARGILL (89 cars)
  └─ Summary: 12 Urgent | 22 Must Shop | 55 Compliant
```

### 3.3 Integrated Mini-Gantt Chart

**12-Month Timeline per Car:**

```
Car: SHEX 12345
|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|
 ▓▓▓▓                                            ← Planned shop stay
    ....                                         ← Transit time
        |                                        ← Qual Due marker (red line)
```

**Visual Elements:**
- **Solid bars**: Planned shop stays (with shop name on hover)
- **Dotted lines**: Estimated transit times
- **Red markers**: Qualification due dates ("Qual Due")
- **Diamond markers**: Other milestones (contract expiry, etc.)

---

## 4. Master Planner Dashboard

### 4.1 Total Inventory Funnel

**Funnel Visualization:**

```
┌─────────────────────────────────────┐
│     TOTAL FLEET: 8,247 cars         │  ← Top of funnel
├─────────────────────────────────────┤
│   ┌─────────────────────────────┐   │
│   │  UNASSIGNED: 1,245 cars     │   │  ← Demand
│   └─────────────────────────────┘   │
│         ├── Urgent: 89              │
│         ├── Must Shop: 456          │
│         └── Upcoming: 700           │
├─────────────────────────────────────┤
│   ┌─────────────────────────────┐   │
│   │  NETWORK CAPACITY: 1,890/mo │   │  ← Supply
│   └─────────────────────────────┘   │
│         ├── AITX: 540/mo            │
│         └── 3rd Party: 1,350/mo     │
├─────────────────────────────────────┤
│   COVERAGE RATIO: 152%              │  ← Healthy if > 100%
└─────────────────────────────────────┘
```

### 4.2 Scenario "Draft" Mode (Sandbox)

**Features:**
- **Sandbox Environment**: Changes don't affect production until committed
- **120-Day Horizon**: Focus on actionable timeframe
- **Real-Time KPI Updates**: As cars are moved on the Gantt:
  - System Utilization % recalculates
  - Capacity alerts update
  - Cost projections refresh

**Draft Mode Workflow:**
1. User clicks "Enter Draft Mode"
2. Creates temporary `DraftScenario` with cloned assignments
3. User drags/drops cars on Gantt timeline
4. KPIs update in real-time in sidebar
5. User can "Commit" (save to MasterPlan) or "Discard" (revert)

---

## Implementation Files

### Backend

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Add ShopCapabilityProfile model |
| `services/shopAllocationValidator.ts` | Validation gatekeeper logic |
| `services/autoAllocationEngine.ts` | Auto-allocation with 3P priority |
| `services/urgencyScoringService.ts` | Dynamic urgency calculations |
| `routes/allocation.ts` | New allocation API endpoints |
| `routes/dashboard.ts` | Enhanced dashboard data endpoints |

### Frontend

| File | Purpose |
|------|---------|
| `components/fleet/CustomerTreeView.tsx` | Collapsible customer hierarchy |
| `components/fleet/MiniGanttChart.tsx` | 12-month mini-Gantt per car |
| `components/dashboard/InventoryFunnel.tsx` | Funnel visualization |
| `components/dashboard/UtilizationHeatmap.tsx` | Color-coded capacity bars |
| `components/planning/DraftModeProvider.tsx` | Sandbox state management |
| `pages/FleetPage.tsx` | Overhauled railcar page |
| `pages/MasterPlannerDashboard.tsx` | New dashboard page |

---

## Database Migrations

### Migration 1: Add Shop Capability Profile

```sql
CREATE TABLE ShopCapabilityProfile (
  id TEXT PRIMARY KEY,
  shopId TEXT UNIQUE NOT NULL,
  canPerformTankLining BOOLEAN DEFAULT FALSE,
  canPerformAnnualQuals BOOLEAN DEFAULT FALSE,
  canPerformRule88B BOOLEAN DEFAULT FALSE,
  canPerformSafetyRelief BOOLEAN DEFAULT FALSE,
  canPerformStubSill BOOLEAN DEFAULT FALSE,
  canPerformTankThickness BOOLEAN DEFAULT FALSE,
  canPerformFullQualification BOOLEAN DEFAULT TRUE,
  canPerformPartialQual BOOLEAN DEFAULT TRUE,
  canPerformRepairs BOOLEAN DEFAULT TRUE,
  allowedAssetClasses TEXT DEFAULT '[]',
  maxCarLength INTEGER,
  maxCarWeight INTEGER,
  hasJacketedCarSupport BOOLEAN DEFAULT TRUE,
  hasLinedCarSupport BOOLEAN DEFAULT TRUE,
  hazmatCertifications TEXT DEFAULT '[]',
  restrictedCommodities TEXT DEFAULT '[]',
  allowedCommodities TEXT DEFAULT '[]',
  preferredCustomers TEXT DEFAULT '[]',
  excludedCustomers TEXT DEFAULT '[]',
  monthlyCapacity INTEGER DEFAULT 50,
  maxConcurrentCars INTEGER DEFAULT 10,
  companyId TEXT NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shopId) REFERENCES Shop(id) ON DELETE CASCADE
);
```

### Migration 2: Add Draft Scenario Support

```sql
ALTER TABLE Scenario ADD COLUMN isDraft BOOLEAN DEFAULT FALSE;
ALTER TABLE Scenario ADD COLUMN draftExpiresAt DATETIME;
ALTER TABLE Scenario ADD COLUMN parentMasterPlanId TEXT;
```

---

## API Endpoints

### Allocation API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/allocation/auto` | Run auto-allocation engine |
| POST | `/api/allocation/validate` | Validate car-shop eligibility |
| GET | `/api/allocation/urgency-queue` | Get prioritized unassigned queue |
| POST | `/api/allocation/bulk-assign` | Bulk assign cars to shops |

### Dashboard API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/inventory-funnel` | Get funnel statistics |
| GET | `/api/dashboard/utilization-heatmap` | Get shop utilization data |
| GET | `/api/dashboard/capacity-forecast` | 120-day capacity forecast |

### Fleet API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/fleet/customer-tree` | Get hierarchical customer data |
| GET | `/api/fleet/car/:id/timeline` | Get car's 12-month Gantt data |
| GET | `/api/fleet/filters` | Get all filter options |

---

## Testing Strategy

1. **Unit Tests**: Validation gatekeeper logic
2. **Integration Tests**: Auto-allocation engine
3. **E2E Tests**: Draft mode workflow
4. **Performance Tests**: 8,000+ car hierarchy rendering

---

## Success Metrics

- Auto-allocation reduces manual assignment time by 80%
- 3P commitment fill rate improves to 95%+
- Planner dashboard provides single source of truth
- Gantt view handles 8,000+ cars without performance issues
