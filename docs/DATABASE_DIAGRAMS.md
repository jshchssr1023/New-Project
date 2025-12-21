# Database & System Diagrams

This document contains comprehensive diagrams for understanding the system architecture, data models, workflows, and integrations.

---

## Table of Contents

1. [Entity-Relationship Diagram (ERD)](#entity-relationship-diagram-erd)
2. [State Diagrams](#state-diagrams)
3. [Sequence Diagrams](#sequence-diagrams)
4. [Data Flow Diagrams](#data-flow-diagrams)

---

## Entity-Relationship Diagram (ERD)

### Complete Database Schema

```mermaid
erDiagram
    %% ============================================
    %% CORE ENTITIES
    %% ============================================

    Company ||--o{ User : "has"
    Company ||--o{ Customer : "has"
    Company ||--o{ Car : "owns"
    Company ||--o{ Shop : "manages"
    Company ||--o{ Plan : "creates"
    Company ||--o{ Scenario : "creates"
    Company ||--o{ CarFlowPlan : "tracks"
    Company ||--o{ SOPCommitment : "commits"

    User ||--o{ Scenario : "creates"
    User ||--o{ CarFlowPlan : "commits"
    User ||--o{ AuditLog : "generates"
    User ||--o{ FilterPreset : "saves"

    Customer ||--o{ Car : "leases"
    Customer ||--o{ CarFlowPlan : "owns cars in"
    Customer }o--o{ Scenario : "ScenarioCustomer"

    %% ============================================
    %% CAR MANAGEMENT
    %% ============================================

    Car ||--o| CarFlowPlan : "assigned to (one active)"
    Car }o--o{ Shop : "CarShopEligibility"
    Car ||--o{ ScenarioCar : "included in"
    Car ||--o{ QualificationPlanAssignment : "qualified via"
    Car ||--o{ LeaseQualificationEntry : "queued in"

    %% ============================================
    %% SHOP MANAGEMENT
    %% ============================================

    Shop ||--o| Shop : "parentShopId (network)"
    Shop ||--o{ CarFlowPlan : "receives"
    Shop ||--o{ SOPCommitment : "has monthly"
    Shop ||--o{ ShopCapacitySlot : "capacity by"
    Shop ||--o{ WeeklyCapacity : "weekly slots"
    Shop ||--o{ ShopRule : "recommendation rules"
    Shop ||--o{ PlanAssignment : "assigned to"

    %% ============================================
    %% PLANNING WORKFLOW
    %% ============================================

    Plan ||--o{ PlanAssignment : "contains"
    Plan }o--|| Company : "belongs to"

    Scenario ||--o{ ScenarioCar : "contains"
    Scenario ||--o{ CarFlowPlan : "sourceScenarioId"
    Scenario }o--|| User : "createdBy"

    ScenarioCar }o--|| Car : "references"
    ScenarioCar }o--o| Shop : "assigned to"

    %% ============================================
    %% CARFLOWPLAN - SOURCE OF TRUTH
    %% ============================================

    CarFlowPlan }o--|| Car : "plans"
    CarFlowPlan }o--|| Shop : "at shop"
    CarFlowPlan }o--o| Customer : "for customer"
    CarFlowPlan }o--o| Scenario : "from scenario"
    CarFlowPlan }o--|| User : "committedBy"

    %% ============================================
    %% S&OP CAPACITY
    %% ============================================

    SOPCommitment }o--|| Shop : "for shop"
    SOPCommitment }o--|| Company : "belongs to"

    %% ============================================
    %% ENTITY DEFINITIONS
    %% ============================================

    Company {
        uuid id PK
        string name
        string code UK
        datetime createdAt
    }

    User {
        uuid id PK
        string email UK
        string name
        enum role "admin|planner|viewer"
        uuid companyId FK
    }

    Customer {
        uuid id PK
        string name
        string code UK
        string contactEmail
        uuid companyId FK
    }

    Car {
        uuid id PK
        string railcarNumber UK
        string carType
        string commodity
        enum status "Current Status"
        enum shoppingStatus "Computed"
        boolean isTankCar
        boolean tankQualified
        date minNoLining
        date minWLining
        date interiorLining
        date rule88B
        date safetyRelief
        date serviceEquipment
        date stubSill
        date tankThickness
        date tankQualification
        uuid customerId FK
        uuid assignedShopId FK
        uuid companyId FK
    }

    Shop {
        uuid id PK
        string name
        string code UK
        string location
        string city
        string state
        string region
        boolean isParent
        boolean tankQualified
        int capacity
        int currentLoad
        decimal baseCostPerCar
        int qualCapacity
        int assignCapacity
        uuid parentShopId FK
        uuid companyId FK
    }

    Scenario {
        uuid id PK
        string name
        enum status "draft|confirmed|archived"
        json results
        datetime confirmedAt
        uuid createdById FK
        uuid companyId FK
    }

    ScenarioCar {
        uuid id PK
        uuid scenarioId FK
        uuid carId FK
        uuid shopId FK
        string shopReason
        decimal estimatedCost
        int priority
    }

    CarFlowPlan {
        uuid id PK
        uuid carId FK "UNIQUE active"
        uuid shopId FK
        uuid customerId FK
        int plannedMonth
        int plannedYear
        enum status "Planned|In Progress|Complete|Cancelled"
        string shopReason
        decimal estimatedCost
        int priority
        datetime committedAt
        datetime cancelledAt
        uuid sourceScenarioId FK
        uuid committedById FK
        uuid companyId FK
    }

    SOPCommitment {
        uuid id PK
        uuid shopId FK
        int year
        int month
        int committedVolume
        int currentUsage
        uuid companyId FK
    }

    Plan {
        uuid id PK
        string name
        enum status "draft|active|completed|archived"
        uuid companyId FK
    }

    PlanAssignment {
        uuid id PK
        uuid planId FK
        uuid carId FK
        uuid shopId FK
        enum status "pending|confirmed|in_progress|completed|cancelled"
    }

    AuditLog {
        uuid id PK
        uuid userId FK
        string action
        string entityType
        uuid entityId
        json changes
        datetime createdAt
        uuid companyId FK
    }

    ShopRule {
        uuid id PK
        uuid shopId FK
        string condition
        int priority
    }

    CarShopEligibility {
        uuid id PK
        uuid carId FK
        uuid shopId FK
        boolean eligible
    }
```

### Simplified Core Relationships

```mermaid
erDiagram
    Customer ||--o{ Car : "leases"
    Car ||--o| CarFlowPlan : "one active plan"
    CarFlowPlan }o--|| Shop : "assigned to"
    Shop ||--o{ SOPCommitment : "monthly capacity"
    Scenario ||--o{ ScenarioCar : "draft assignments"
    Scenario ||--o{ CarFlowPlan : "generates on confirm"

    Car {
        string railcarNumber PK
        boolean isTankCar
        enum shoppingStatus
        date[] qualificationDates
    }

    CarFlowPlan {
        uuid carId FK_UK
        uuid shopId FK
        int plannedMonth
        int plannedYear
        enum status
    }

    Shop {
        string code PK
        boolean tankQualified
        int capacity
    }

    SOPCommitment {
        uuid shopId FK
        int year
        int month
        int committedVolume
        int currentUsage
    }
```

### Key Relationship Rules

| Relationship | Cardinality | Business Rule |
|--------------|-------------|---------------|
| Car → CarFlowPlan | 1:0..1 | Each car can have **only ONE active** CarFlowPlan (status != 'Cancelled') |
| Shop → CarFlowPlan | 1:N | A shop can receive many cars |
| Scenario → CarFlowPlan | 1:N | Confirming a scenario creates CarFlowPlans |
| Shop → SOPCommitment | 1:N | One commitment per shop/month (unique constraint) |
| Car → Shop (Tank) | Conditional | Tank cars can ONLY go to tankQualified shops |

---

## State Diagrams

### Car Status State Machine

```mermaid
stateDiagram-v2
    [*] --> ToBeRouted: Car Created/Imported

    ToBeRouted --> Enroute: Routed to Shop
    ToBeRouted --> Released: Early Release
    ToBeRouted --> UpMarketed: Listed for Sale

    Enroute --> Arrived: Arrives at Shop
    Enroute --> Reassigned: Redirect to Different Shop

    Arrived --> Complete: Work Finished
    Arrived --> Reassigned: Shop Transfer

    Complete --> Release: Ready for Return
    Complete --> ToBeRouted: Needs More Work

    Release --> [*]: Returned to Service

    Reassigned --> Enroute: New Route Assigned

    UpMarketed --> Released: Sold/Transferred
    UpMarketed --> ToBeRouted: Removed from Market

    note right of ToBeRouted
        Default status for new cars
        Waiting for shop assignment
    end note

    note right of Arrived
        Car is physically at shop
        Work in progress
    end note

    note right of Complete
        All work finished
        Quality checks passed
    end note
```

### Shopping Status State Machine (Computed from Qualification Dates)

```mermaid
stateDiagram-v2
    [*] --> Unknown: No Qualification Dates

    Unknown --> Compliant: Dates Added (> next year)
    Unknown --> Upcoming: Dates Added (next year)
    Unknown --> MustShop: Dates Added (this year)
    Unknown --> Urgent: Dates Added (past due)

    Compliant --> Upcoming: Time Passes (Jan 1)
    Upcoming --> MustShop: Time Passes (Jan 1)
    MustShop --> Urgent: Date Passes

    Compliant --> Planned: Added to Scenario
    Upcoming --> Planned: Added to Scenario
    MustShop --> Planned: Added to Scenario
    Urgent --> Planned: Added to Scenario

    Planned --> InShop: Scenario Confirmed

    InShop --> Compliant: Work Complete + New Dates
    InShop --> Upcoming: Work Complete + New Dates
    InShop --> MustShop: Work Complete + New Dates

    state "Calculation Logic" as calc {
        [*] --> CheckDates
        CheckDates --> Urgent: earliestDate < currentYear
        CheckDates --> MustShop: earliestDate.year == currentYear
        CheckDates --> Upcoming: earliestDate.year == currentYear + 1
        CheckDates --> Compliant: earliestDate.year > currentYear + 1
    }

    note right of Urgent
        HIGHEST PRIORITY
        Qualification overdue
        Immediate action required
    end note

    note right of MustShop
        HIGH PRIORITY
        Due this calendar year
    end note

    note right of Upcoming
        MEDIUM PRIORITY
        Due next calendar year
    end note

    note right of Compliant
        LOW PRIORITY
        Not due for 2+ years
    end note
```

### Scenario Status State Machine

```mermaid
stateDiagram-v2
    [*] --> Draft: Create Scenario

    Draft --> Draft: Add/Remove Cars
    Draft --> Draft: Assign Shops
    Draft --> Draft: Update Details
    Draft --> Confirmed: Confirm Scenario
    Draft --> Archived: Archive (Discard)

    Confirmed --> Archived: Archive (Historical)

    Archived --> [*]: No Further Changes

    note right of Draft
        EDITABLE STATE
        - Add/remove cars
        - Change shop assignments
        - Modify scenario details
        - Delete scenario
    end note

    note right of Confirmed
        LOCKED STATE
        - Creates CarFlowPlans
        - Updates S&OP usage
        - Cannot modify
        - Read-only access
    end note

    note right of Archived
        HISTORICAL STATE
        - Preserved for audit
        - Cannot be restored
        - Read-only access
    end note
```

### CarFlowPlan Status State Machine

```mermaid
stateDiagram-v2
    [*] --> Planned: Scenario Confirmed / Bulk Create

    Planned --> InProgress: Car Arrives at Shop
    Planned --> Cancelled: Plan Cancelled

    InProgress --> Complete: Work Finished
    InProgress --> Cancelled: Plan Cancelled

    Complete --> [*]: Plan Archived

    Cancelled --> [*]: Freed for Reassignment

    note right of Planned
        COMMITTED STATE
        - Car assigned to shop/month
        - S&OP usage incremented
        - Waiting for car arrival
    end note

    note right of InProgress
        ACTIVE STATE
        - Car physically at shop
        - Work being performed
    end note

    note right of Complete
        FINISHED STATE
        - All work complete
        - Car ready for release
    end note

    note right of Cancelled
        SOFT DELETE
        - S&OP usage decremented
        - Car can be reassigned
        - Preserved for audit
    end note
```

### Plan Status State Machine (Legacy)

```mermaid
stateDiagram-v2
    [*] --> draft: Create Plan

    draft --> active: Activate Plan
    draft --> archived: Discard Plan

    active --> completed: All Assignments Done
    active --> archived: Cancel Plan

    completed --> archived: Archive for History

    archived --> [*]: Final State
```

---

## Sequence Diagrams

### Scenario Confirm Flow (Primary Save Operation)

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant FE as Frontend
    participant API as /api/car-flow/scenarios/:id/confirm
    participant SVC as ScenarioService
    participant DB as Prisma/Database
    participant SS as ShoppingStatusService
    participant AL as AuditLog

    U->>FE: Click "Confirm Scenario"
    FE->>API: POST /scenarios/:id/confirm<br/>{overrideConflicts: false}

    API->>SVC: confirmScenario(id, userId)

    rect rgb(240, 248, 255)
        Note over SVC,DB: Step 1: Fetch & Validate
        SVC->>DB: SELECT Scenario WHERE id=? AND status='draft'
        DB-->>SVC: scenario + scenarioCars[]

        alt Scenario not found or not draft
            SVC-->>API: 404/400 Error
            API-->>FE: Error Response
            FE-->>U: Show Error Toast
        end
    end

    rect rgb(255, 248, 240)
        Note over SVC,DB: Step 2: Check Conflicts
        SVC->>DB: SELECT CarFlowPlan<br/>WHERE carId IN (...) AND status != 'Cancelled'
        DB-->>SVC: existingPlans[]

        alt Conflicts exist AND overrideConflicts=false
            SVC-->>API: 200 {conflicts: [...], allowOverride: true}
            API-->>FE: Conflict Warning
            FE-->>U: Show Conflict Dialog
            U->>FE: Click "Override & Continue"
            FE->>API: POST /confirm {overrideConflicts: true}
            Note over API: Restart flow with override
        end
    end

    rect rgb(240, 255, 240)
        Note over SVC,DB: Step 3: Transaction - Cancel Existing (if override)
        SVC->>DB: BEGIN TRANSACTION

        alt overrideConflicts = true
            SVC->>DB: UPDATE CarFlowPlan SET status='Cancelled'<br/>WHERE carId IN (conflictIds)

            loop For each cancelled plan
                SVC->>DB: UPDATE SOPCommitment<br/>SET currentUsage = currentUsage - 1<br/>WHERE shopId=? AND year=? AND month=?
            end
        end
    end

    rect rgb(255, 240, 255)
        Note over SVC,DB: Step 4: Create CarFlowPlans
        loop For each ScenarioCar with shopId
            SVC->>DB: INSERT CarFlowPlan<br/>(carId, shopId, plannedMonth, plannedYear,<br/>status='Planned', committedById, committedAt)

            SVC->>DB: UPDATE SOPCommitment<br/>SET currentUsage = currentUsage + 1<br/>WHERE shopId=? AND year=? AND month=?
        end
    end

    rect rgb(255, 255, 240)
        Note over SVC,DB: Step 5: Finalize
        SVC->>DB: UPDATE Scenario<br/>SET status='confirmed', confirmedAt=NOW()

        SVC->>DB: COMMIT TRANSACTION
    end

    SVC->>SS: updateBatchShoppingStatus(carIds[])
    SS->>DB: UPDATE Car SET shoppingStatus='InShop'<br/>WHERE id IN (...)

    SVC->>AL: logAction('confirm_scenario', {plansCreated: N})
    AL->>DB: INSERT AuditLog

    SVC-->>API: {success: true, plansCreated: N}
    API-->>FE: 200 OK Response
    FE-->>U: Success Toast + Refresh Grid
```

### Bulk Plan Creation Flow

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant FE as Frontend
    participant API as /api/car-flow/plans/bulk
    participant VAL as Validator
    participant DB as Prisma/Database
    participant SS as ShoppingStatusService

    U->>FE: Select Cars + Assign Shops + Click "Plan"
    FE->>API: POST /plans/bulk<br/>{assignments: [...], overrideConflicts: false}

    rect rgb(240, 248, 255)
        Note over API,DB: Step 1: Batch Fetch (Parallel)
        par Parallel Queries
            API->>DB: SELECT Car WHERE id IN (carIds)
            API->>DB: SELECT Shop WHERE id IN (shopIds)
            API->>DB: SELECT CarFlowPlan WHERE carId IN (...) AND status != 'Cancelled'
            API->>DB: SELECT SOPCommitment WHERE shopId/year IN (...)
        end
        DB-->>API: cars[], shops[], existingPlans[], commitments[]
    end

    rect rgb(255, 248, 240)
        Note over API,VAL: Step 2: Validate Each Assignment
        loop For each assignment
            API->>VAL: validate(car, shop, assignment)

            alt Car not found
                VAL-->>API: ERROR: "Car not found"
            else Shop not found
                VAL-->>API: ERROR: "Shop not found"
            else Tank car + Non-tank shop
                VAL-->>API: HARD ERROR: "Tank car cannot be assigned to non-tank-qualified shop"
            else Car has existing plan
                VAL-->>API: CONFLICT: "Car already planned"
            else Shop over capacity
                VAL-->>API: WARNING: "Shop over capacity"
            else Valid
                VAL-->>API: VALID
            end
        end
    end

    alt Has conflicts AND overrideConflicts=false
        API-->>FE: 200 {conflicts: [...], allowOverride: true}
        FE-->>U: Show Conflict Dialog
        U->>FE: Click Override
        FE->>API: POST /bulk {overrideConflicts: true}
    end

    alt Has hard errors only (no valid assignments)
        API-->>FE: 400 {errors: [...]}
        FE-->>U: Show Error Toast
    end

    rect rgb(240, 255, 240)
        Note over API,DB: Step 3: Create Plans (Transaction)
        API->>DB: BEGIN TRANSACTION (timeout: 30s)

        opt Cancel existing if overriding
            API->>DB: UPDATE CarFlowPlan SET status='Cancelled'
            loop Decrement S&OP
                API->>DB: UPDATE SOPCommitment SET currentUsage -= 1
            end
        end

        loop For each valid assignment
            API->>DB: INSERT CarFlowPlan
            API->>DB: UPDATE SOPCommitment SET currentUsage += 1
        end

        API->>DB: COMMIT
    end

    API->>SS: updateBatchShoppingStatus(carIds)
    SS->>DB: UPDATE Car.shoppingStatus

    API->>DB: INSERT AuditLog

    API-->>FE: 200 {plansCreated: N, skipped: [...], warnings: [...]}
    FE-->>U: Success Toast with Summary
```

### Cancel CarFlowPlan Flow

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant FE as Frontend
    participant API as /api/car-flow/plans/:id/cancel
    participant DB as Prisma/Database
    participant SS as ShoppingStatusService

    U->>FE: Click "Cancel Plan"
    FE->>U: Confirm Dialog
    U->>FE: Confirm
    FE->>API: PATCH /plans/:id/cancel

    API->>DB: SELECT CarFlowPlan WHERE id=?
    DB-->>API: plan

    alt Plan not found
        API-->>FE: 404 Not Found
        FE-->>U: Error Toast
    end

    alt Plan already cancelled
        API-->>FE: 400 Already Cancelled
        FE-->>U: Warning Toast
    end

    rect rgb(255, 240, 240)
        Note over API,DB: Transaction: Cancel + Update S&OP
        API->>DB: BEGIN TRANSACTION

        API->>DB: UPDATE CarFlowPlan<br/>SET status='Cancelled', cancelledAt=NOW()

        API->>DB: UPDATE SOPCommitment<br/>SET currentUsage = currentUsage - 1<br/>WHERE shopId=? AND year=? AND month=?<br/>AND currentUsage > 0

        API->>DB: COMMIT
    end

    API->>SS: updateShoppingStatus(carId)
    SS->>DB: Recalculate and UPDATE Car.shoppingStatus

    API->>DB: INSERT AuditLog

    API-->>FE: 200 OK
    FE-->>U: Success Toast + Refresh
```

### Debugging Save Failures - Common Error Points

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant FE as Frontend
    participant API as API Endpoint
    participant VAL as Validation
    participant DB as Database

    Note over U,DB: Common Failure Points During Save

    rect rgb(255, 200, 200)
        Note right of FE: FAILURE POINT 1: Network Error
        FE-xAPI: Request fails (timeout, 502, etc.)
        FE-->>U: "Network error. Please retry."
    end

    rect rgb(255, 220, 200)
        Note right of API: FAILURE POINT 2: Authentication
        API->>API: Check JWT token
        alt Token expired/invalid
            API-->>FE: 401 Unauthorized
            FE-->>U: Redirect to login
        end
    end

    rect rgb(255, 240, 200)
        Note right of VAL: FAILURE POINT 3: Validation Error
        API->>VAL: Validate request body
        alt Missing required field
            VAL-->>API: Validation error
            API-->>FE: 400 {error: "carId is required"}
            FE-->>U: Show field error
        end
    end

    rect rgb(255, 255, 200)
        Note right of VAL: FAILURE POINT 4: Business Rule Violation
        VAL->>VAL: Check tank car + shop compatibility
        alt Tank car to non-tank shop
            VAL-->>API: HARD ERROR
            API-->>FE: 400 {error: "Tank car cannot...", code: "TANK_CAR_INVALID_SHOP"}
            FE-->>U: Show error with car details
        end
    end

    rect rgb(220, 255, 200)
        Note right of DB: FAILURE POINT 5: Conflict
        API->>DB: Check existing CarFlowPlan
        alt Car already has active plan
            DB-->>API: Conflict exists
            API-->>FE: 200 {conflicts: [...], allowOverride: true}
            FE-->>U: Show conflict dialog
        end
    end

    rect rgb(200, 255, 220)
        Note right of DB: FAILURE POINT 6: Database Error
        API->>DB: BEGIN TRANSACTION
        API->>DB: INSERT CarFlowPlan
        alt Unique constraint violation
            DB-->>API: Error: Duplicate key
            API->>DB: ROLLBACK
            API-->>FE: 500 {error: "Car already has active plan"}
            FE-->>U: Show error toast
        end
        alt Foreign key violation
            DB-->>API: Error: FK constraint
            API->>DB: ROLLBACK
            API-->>FE: 500 {error: "Referenced shop not found"}
            FE-->>U: Show error toast
        end
    end

    rect rgb(200, 240, 255)
        Note right of DB: FAILURE POINT 7: Transaction Timeout
        API->>DB: Long transaction (>30s)
        DB-->>API: Transaction timeout
        API-->>FE: 500 {error: "Operation timed out"}
        FE-->>U: "Request timed out. Please retry."
    end

    Note over U,DB: SUCCESS PATH
    API->>DB: COMMIT
    API-->>FE: 200 OK
    FE-->>U: Success toast
```

---

## Data Flow Diagrams

### System Overview - Data Sources and Destinations

```mermaid
flowchart TB
    subgraph External["External Data Sources"]
        CSV[("CSV/Excel Import")]
        FMS[("FMS System")]
        ShopSys[("Shop Systems")]
        ERP[("ERP/Billing")]
    end

    subgraph App["Application Layer"]
        UI["Frontend UI"]
        API["API Layer"]
        SVC["Business Services"]
    end

    subgraph Data["Data Layer"]
        DB[(SQLite/Prisma)]
        Cache[("Cache")]
    end

    subgraph Output["Data Destinations"]
        Reports["Excel Reports"]
        Audit["Audit Logs"]
        Notif["Notifications"]
        Webhook["Webhooks"]
    end

    %% External Inputs
    CSV -->|"Bulk Import"| API
    FMS -->|"Location Updates"| API
    ShopSys -->|"Arrival/Complete Events"| API
    ERP -->|"Cost Data"| API

    %% User Inputs
    UI -->|"CRUD Operations"| API

    %% Internal Flow
    API --> SVC
    SVC <--> DB
    SVC <--> Cache

    %% Outputs
    SVC --> Reports
    SVC --> Audit
    SVC --> Notif
    SVC --> Webhook
```

### Car Data Flow

```mermaid
flowchart LR
    subgraph Import["Data Import"]
        CSV[("CSV Upload")]
        Manual["Manual Entry"]
    end

    subgraph Transform["Data Processing"]
        Parse["Parse & Validate"]
        Enrich["Enrich Data"]
        CalcStatus["Calculate Shopping Status"]
    end

    subgraph Store["Storage"]
        CarTable[("Car Table")]
        EligTable[("CarShopEligibility")]
    end

    subgraph Use["Usage"]
        Grid["Car Grid Display"]
        Scenario["Scenario Planning"]
        Reports["Reports/Export"]
    end

    CSV --> Parse
    Manual --> Parse

    Parse --> Enrich
    Enrich --> CalcStatus

    CalcStatus -->|"Create/Update"| CarTable
    CalcStatus -->|"Update Eligibility"| EligTable

    CarTable --> Grid
    CarTable --> Scenario
    CarTable --> Reports
    EligTable --> Scenario
```

### Planning Data Flow (Scenario to CarFlowPlan)

```mermaid
flowchart TB
    subgraph Input["User Input"]
        SelectCars["Select Cars"]
        AssignShops["Assign Shops"]
        SetMonth["Set Planned Month"]
    end

    subgraph Draft["Draft Phase"]
        Scenario[("Scenario<br/>status=draft")]
        ScenarioCar[("ScenarioCar<br/>draft assignments")]
    end

    subgraph Confirm["Confirm Phase"]
        Validate{"Validate<br/>Tank Cars?<br/>Conflicts?"}
        TankCheck{"Tank Qualified?"}
        ConflictCheck{"Existing Plan?"}
    end

    subgraph Commit["Commit Phase"]
        Cancel["Cancel Existing Plans"]
        Create["Create CarFlowPlans"]
        UpdateSOP["Update S&OP Usage"]
        UpdateStatus["Update Shopping Status"]
    end

    subgraph Output["Output"]
        CarFlowPlan[("CarFlowPlan<br/>status=Planned")]
        SOPCommit[("SOPCommitment<br/>currentUsage++")]
        AuditLog[("AuditLog")]
    end

    SelectCars --> Scenario
    AssignShops --> ScenarioCar
    SetMonth --> ScenarioCar

    Scenario --> Validate
    ScenarioCar --> Validate

    Validate --> TankCheck
    TankCheck -->|"Tank + Non-Tank Shop"| Error["REJECT"]
    TankCheck -->|"Valid"| ConflictCheck

    ConflictCheck -->|"Has Conflict"| Override{"Override?"}
    Override -->|"No"| ShowConflict["Return Conflicts"]
    Override -->|"Yes"| Cancel
    ConflictCheck -->|"No Conflict"| Create

    Cancel --> Create
    Create --> UpdateSOP
    UpdateSOP --> UpdateStatus

    Create --> CarFlowPlan
    UpdateSOP --> SOPCommit
    UpdateStatus --> AuditLog
```

### S&OP Capacity Data Flow

```mermaid
flowchart TB
    subgraph Inputs["Capacity Inputs"]
        ShopCap["Shop.capacity<br/>(monthly limit)"]
        SOPTarget["SOPCommitment.committedVolume<br/>(planned target)"]
    end

    subgraph Operations["Operations"]
        PlanCreate["CarFlowPlan Created"]
        PlanCancel["CarFlowPlan Cancelled"]
    end

    subgraph Tracking["Usage Tracking"]
        CurrentUsage["SOPCommitment.currentUsage"]
    end

    subgraph Calculations["Calculated Values"]
        Available["Available = committedVolume - currentUsage"]
        Utilization["Utilization % = currentUsage / capacity"]
    end

    subgraph Display["Display"]
        CapMatrix["Capacity Matrix Grid"]
        Warnings["Over-Capacity Warnings"]
    end

    PlanCreate -->|"+1"| CurrentUsage
    PlanCancel -->|"-1"| CurrentUsage

    SOPTarget --> Available
    CurrentUsage --> Available

    CurrentUsage --> Utilization
    ShopCap --> Utilization

    Available --> CapMatrix
    Utilization --> CapMatrix

    Available -->|"< 0"| Warnings
    Utilization -->|"> 100%"| Warnings
```

### Complete Integration Data Flow

```mermaid
flowchart TB
    subgraph External["External Systems"]
        Import["CSV/Excel<br/>Import"]
        FMS["Fleet Management<br/>System"]
        ShopAPI["Shop<br/>Systems"]
        ERP["ERP/Billing"]
    end

    subgraph Backend["Backend Services"]
        subgraph APIs["API Endpoints"]
            CarAPI["/api/cars"]
            ScenarioAPI["/api/car-flow/scenarios"]
            PlanAPI["/api/car-flow/plans"]
            SOPAPI["/api/sop"]
            CapAPI["/api/car-flow/capacity"]
        end

        subgraph Services["Business Logic"]
            CarSvc["CarService"]
            ScenarioSvc["ScenarioService"]
            PlanSvc["CarFlowPlanService"]
            SOPSvc["SOPCommitmentService"]
            StatusSvc["ShoppingStatusService"]
        end
    end

    subgraph Database["Database Tables"]
        Car[("Car")]
        Scenario[("Scenario")]
        ScenarioCar[("ScenarioCar")]
        CarFlowPlan[("CarFlowPlan")]
        SOPCommitment[("SOPCommitment")]
        Shop[("Shop")]
        AuditLog[("AuditLog")]
    end

    subgraph Frontend["Frontend Views"]
        CarGrid["Car Grid"]
        ScenarioView["Scenario Builder"]
        CapMatrix["Capacity Matrix"]
        PlanGrid["Plan Grid"]
        Reports["Reports"]
    end

    %% External to Backend
    Import -->|"POST /cars/bulk-import"| CarAPI
    FMS -->|"PATCH /cars/bulk"| CarAPI
    ShopAPI -->|"PATCH /plans/:id"| PlanAPI
    ERP <-->|"GET /plans/export"| PlanAPI

    %% API to Service
    CarAPI --> CarSvc
    ScenarioAPI --> ScenarioSvc
    PlanAPI --> PlanSvc
    SOPAPI --> SOPSvc
    CapAPI --> SOPSvc

    %% Service to Database
    CarSvc --> Car
    ScenarioSvc --> Scenario
    ScenarioSvc --> ScenarioCar
    PlanSvc --> CarFlowPlan
    SOPSvc --> SOPCommitment

    %% Cross-service dependencies
    ScenarioSvc --> PlanSvc
    PlanSvc --> SOPSvc
    PlanSvc --> StatusSvc
    StatusSvc --> Car

    %% All services write audit
    CarSvc --> AuditLog
    ScenarioSvc --> AuditLog
    PlanSvc --> AuditLog
    SOPSvc --> AuditLog

    %% Frontend reads
    Car --> CarGrid
    Scenario --> ScenarioView
    ScenarioCar --> ScenarioView
    CarFlowPlan --> PlanGrid
    SOPCommitment --> CapMatrix
    Shop --> CapMatrix

    %% Frontend writes
    CarGrid -->|"Select Cars"| ScenarioAPI
    ScenarioView -->|"Confirm"| ScenarioAPI
    CapMatrix -->|"Set Commitment"| SOPAPI
    PlanGrid -->|"Cancel"| PlanAPI
```

---

## Quick Reference

### Status Transition Summary

| Entity | From Status | To Status | Trigger |
|--------|-------------|-----------|---------|
| **Car.status** | To Be Routed | Enroute | Routed to shop |
| | Enroute | Arrived | Arrives at shop |
| | Arrived | Complete | Work finished |
| | Complete | Release | Ready for return |
| **Car.shoppingStatus** | Any | Planned | Added to scenario |
| | Planned | In Shop | Scenario confirmed |
| | In Shop | Compliant/etc | Work complete |
| **Scenario.status** | draft | confirmed | User confirms |
| | draft/confirmed | archived | User archives |
| **CarFlowPlan.status** | (created) | Planned | Created |
| | Planned | In Progress | Car arrives |
| | In Progress | Complete | Work done |
| | Any | Cancelled | User cancels |

### S&OP Usage Rules

| Action | SOPCommitment.currentUsage |
|--------|---------------------------|
| CarFlowPlan created | +1 |
| CarFlowPlan cancelled | -1 |
| Scenario confirmed | +1 per car with shop |
| Existing plan overridden | -1 (old) +1 (new) = net 0 |

### Critical Validation Rules

1. **Tank Car Rule**: `car.isTankCar && !shop.tankQualified` = HARD BLOCK
2. **One Plan Rule**: Each car can have only ONE active CarFlowPlan
3. **Capacity Warning**: `currentUsage > committedVolume` = WARNING (not blocking)
4. **Scenario Lock**: Confirmed scenarios cannot be modified

---

*Generated for the Car Flow Planning System - Last Updated: 2025*
