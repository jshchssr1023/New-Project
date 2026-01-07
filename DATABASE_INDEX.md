# Database Schema Index

## Overview
- **Database**: SQLite (via Prisma ORM)
- **Total Tables**: 42
- **Core Domain**: Railcar fleet management, shop scheduling, S&OP planning

---

## Core Tables (Primary Data)

### 1. Car
**Purpose**: Master record for all railcars in the fleet
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| railcarNumber | String (UNIQUE) | Railcar ID (Mark + Number) |
| carType | String | Tank car, hopper, boxcar, etc. |
| isTankCar | Boolean | Critical for shop qualification |
| commodity | String | What the car carries |
| customer | String | Lessee name (legacy) |
| customerId | FK | Link to Customer table |
| **status** | String | Arrived, Complete, To Be Routed, Release, etc. |
| **shoppingStatus** | String | Urgent, Must Shop, Upcoming, Compliant, In Shop, Planned, Unknown |
| portfolio | Boolean | Active lease flag |
| performedTankQual | Boolean | Needs tank qualification |
| assignedShopId | FK | Current shop assignment |
| daysInShop | Int | Days at current shop |

**Qualification Date Fields** (drive shopping urgency):
- minNoLining, minWLining, interiorLining, rule88B
- safetyRelief, serviceEquipment, stubSill, tankThickness, tankQualification

**Indexes**: status, shoppingStatus, customer, companyId, customerId, portfolio, [companyId + shoppingStatus + status]

---

### 2. Shop
**Purpose**: Service facility master data
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| code | String (UNIQUE) | Shop code |
| name | String | Shop name |
| location | String | Physical location |
| region | String | Geographic region |
| isAitxInternal | Boolean | AITX-owned vs 3rd party |
| tankQualified | Boolean | Can service tank cars |
| capacity | Int | Cars per month |
| currentLoad | Int | Current assignments |
| networkId | FK | 3rd party network reference |
| parentShopId | FK | Parent shop (for hierarchy) |

**Capacity Fields**: qualCapacity, assignCapacity, returnCapacity, repairCapacity

**Indexes**: code, region, companyId, isActive, isParent, parentShopId, networkId

---

### 3. Customer
**Purpose**: Lessee/customer master data
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| code | String | Short code (SHELL, CARG) |
| name | String | Full customer name |
| contactName/Email/Phone | String | Contact info |

**Indexes**: [code + companyId]

---

### 4. CarFlowPlan
**Purpose**: SOURCE OF TRUTH for committed car-to-shop assignments (from CSV imports)
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| carId | FK (UNIQUE) | One active plan per car |
| shopId | FK | Assigned shop |
| customerId | FK | Customer reference |
| plannedMonth | Int | 1-12 |
| plannedYear | Int | e.g., 2026 |
| **status** | String | Planned, In Progress, Complete, Cancelled |
| priority | Int | 1=Critical, 2=High, 3=Medium, 4=Low |
| shopReason | String | Why car needs shopping |
| estimatedCost | Float | Cost estimate |
| sourceScenarioId | FK | If created from scenario |

**Indexes**: [shopId + plannedYear + plannedMonth], customerId, status, companyId

---

### 5. MasterPlan
**Purpose**: Versioned container for fleet schedule snapshots
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| version | Int | Incremental version |
| name | String | Plan name |
| status | Enum | DRAFT, PENDING, APPROVED, ACTIVE, SUPERSEDED, ARCHIVED |
| validFrom/validTo | DateTime | Effective period |
| planningHorizonStart/End | DateTime | Planning window |
| carCount/shopCount | Int | Summary counts |

**Indexes**: [companyId + status], [validFrom + validTo], status

---

### 6. MasterPlanCommitment
**Purpose**: Links cars to a specific MasterPlan (formal workflow)
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| masterPlanId | FK | Parent plan |
| carId | FK | Car being planned |
| shopId | FK | Target shop |
| customerId | FK | Customer reference |
| plannedMonth/Year | Int | Planning period |
| status | Enum | DRAFT, PLANNED, IN_PROGRESS, COMPLETE, CANCELLED |
| qualificationEntryId | FK | Links to qualification requirement |
| workType | String | qualification, assignment, return, repair |
| priority | Int | 1-4 |

**Indexes**: [masterPlanId + status], carId, [shopId + plannedYear + plannedMonth], status

---

## Planning & Scenario Tables

### 7. Scenario
**Purpose**: What-if planning scenarios
| Key Fields | carCount, status (draft/confirmed/archived), customerFilter |

### 8. ScenarioCar
**Purpose**: Cars selected for a scenario with shop assignment
| Key Fields | scenarioId, carId, shopId, plannedMonth, plannedYear, shopReason |

### 9. Plan
**Purpose**: Legacy planning container
| Key Fields | name, startDate, endDate, status |

### 10. PlanAssignment
**Purpose**: Legacy car-to-shop assignments within a Plan
| Key Fields | planId, carId, shopId, scheduledMonth, status |

---

## S&OP Supply Tables

### 11. ShopNetwork
**Purpose**: 3rd party network groups (Trinity, Greenbrier, Eagle)
| Field | Type | Description |
|-------|------|-------------|
| code | String (UNIQUE) | Network code |
| name | String | Network name |
| isAitxInternal | Boolean | AITX vs 3rd party |
| networkTier | Int | 1-5, lower = preferred |
| annualTargetVolume | Int | Annual commitment |
| hasContractualCommitment | Boolean | Take-or-pay flag |

### 12. SOPCommitment
**Purpose**: Monthly committed volume by shop
| Key Fields | shopId, year, month, committedVolume, currentUsage |
| Unique: [shopId + year + month] |

### 13. SOPNetworkCommitment
**Purpose**: Monthly commitment tracking per network
| Key Fields | networkId, year, month, committedVolume, actualVolume |

### 14. ShopCapabilityProfile
**Purpose**: Shop-first constraints for S&OP (certifications, limits)
| Key Fields | canPerform* flags, allowedAssetClasses, hazmatCertifications |

---

## Qualification Engine Tables

### 15. LeaseContract
**Purpose**: Lease contract tracking for release planning
| Key Fields | carId, customerId, contractNumber, startDate, endDate, status |

### 16. LeaseQualificationEntry
**Purpose**: Qualification queue entry for planning
| Key Fields | carId, customerId, plannedReleaseDate, targetQualMonth, workTypes, queueStatus |

### 17. QualificationPlanEvent
**Purpose**: Scheduled events (release, transport, shop_arrival, etc.)
| Key Fields | qualEntryId, eventType, plannedDate, status |

---

## Support Tables

### 18. User
| Fields | email, password, firstName, lastName, role, companyId |

### 19. Company
| Fields | name, code (UNIQUE) |

### 20. ShopRule
**Purpose**: Rule engine for shop recommendations
| Fields | ruleType, priority, conditions (JSON), actions (JSON) |

### 21. CarShopEligibility
**Purpose**: Junction table - which cars can go to which shops
| Fields | carId, shopId, isEligible |

---

## Audit & System Tables

### 22. AuditLog
| Fields | userId, action, entityType, entityId, changes (JSON), createdAt |

### 23. ImportSession
| Fields | sessionType, fileName, status, validationErrors, fieldMappings |

### 24. Notification
| Fields | userId, type, category, title, message, isRead |

### 25. WebhookConfig
| Fields | type (slack/teams), url, categories, severities |

### 26. ApiKey
| Fields | keyHash, permissions (JSON), rateLimit |

### 27. RateLimitEntry
| Fields | identifier, endpoint, windowStart, requestCount |

---

## Key Relationships Diagram

```
Company
  |-- User (many)
  |-- Car (many)
  |     |-- CarFlowPlan (one, UNIQUE carId)
  |     |-- MasterPlanCommitment (many)
  |     |-- CarShopEligibility (many)
  |     |-- LeaseQualificationEntry (many)
  |
  |-- Shop (many)
  |     |-- CarFlowPlan (many)
  |     |-- MasterPlanCommitment (many)
  |     |-- SOPCommitment (many)
  |     |-- ShopCapabilityProfile (one)
  |
  |-- Customer (many)
  |     |-- Car (many via customerId)
  |     |-- CarFlowPlan (many)
  |
  |-- MasterPlan (many)
  |     |-- MasterPlanCommitment (many)
  |
  |-- Scenario (many)
  |     |-- ScenarioCar (many)
  |     |-- CarFlowPlan (many, if confirmed)
  |
  |-- ShopNetwork (many, for 3rd parties)
        |-- Shop (many)
        |-- SOPNetworkCommitment (many)
```

---

## Data Flow: CSV Import to Display

```
1. CSV Upload
   |
   v
2. ImportSession created (status: uploaded)
   |
   v
3. Headers mapped via importTransformers.ts (1200+ synonyms)
   |
   v
4. Car records UPSERT'd (by railcarNumber)
   |
   v
5. Shopping status calculated (earliest qual date)
   |
   v
6. CarFlowPlan created (if shop column found in CSV)
   |
   v
7. Display:
   - Dashboard: analytics.ts queries Cars, CarFlowPlan
   - Shop Schedule: masterPlanService.ts queries CarFlowPlan + MasterPlanCommitment
   - Cars Page: carsApi queries Car table with filters
```

---

## Potential Performance Issues

### 1. Dual Data Sources
**Issue**: Shop work orders query both `MasterPlanCommitment` AND `CarFlowPlan`
- CSV imports create CarFlowPlan entries
- Formal workflow creates MasterPlanCommitment entries
- Must query both to show complete picture

### 2. Shopping Status Calculation
**Issue**: Calculated at query time in some places, stored in others
- `shoppingStatus` field on Car is denormalized (computed on import)
- Must be recalculated when qualification dates change

### 3. Missing Composite Indexes
Consider adding:
- `CarFlowPlan`: [companyId + status + plannedYear + plannedMonth]
- `MasterPlanCommitment`: [companyId + status + scheduledMonth]

### 4. JSON Fields
These fields store JSON arrays/objects (not indexed):
- Shop.capabilities, Shop.certifications, Shop.preferredCustomers
- ShopCapabilityProfile.allowedAssetClasses, .hazmatCertifications
- LeaseQualificationEntry.workTypes

---

## Table Count Summary

| Category | Tables |
|----------|--------|
| Core Data | Car, Shop, Customer, Company (4) |
| Planning | CarFlowPlan, MasterPlan, MasterPlanCommitment, Scenario, ScenarioCar, Plan, PlanAssignment, UnifiedAssignment (8) |
| S&OP | ShopNetwork, SOPCommitment, SOPNetworkCommitment, ShopCapabilityProfile, SOPCommitment (5) |
| Qualification | LeaseContract, LeaseQualificationEntry, QualificationPlanEvent, QualificationScenario, QualificationPlanAssignment, QualificationPlanDocument (6) |
| Rules & Eligibility | ShopRule, CarShopEligibility (2) |
| Capacity | ShopCapacitySlot, WeeklyCapacity, CapacityAudit (3) |
| Audit & System | AuditLog, ImportSession, Notification, WebhookConfig, ApiKey, RateLimitEntry, InvalidatedToken, IntegrationLog (8) |
| Other | User, RolePermission, FieldSecurity, ShopPerformance, ReportTemplate, ScheduledReport, FilterPreset, ShopHistory, AllocationOverride, ScenarioCustomer, ScenarioModification (11) |

**Total: 42 tables**
