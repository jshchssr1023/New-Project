# Database Forensic Audit Report
## Chronos Scheduler - Enterprise Migration Readiness Assessment

**Audit Date:** January 11, 2026
**Auditor:** Senior Database Forensics Expert
**Project:** Chronos Scheduler (AITX Rail Car Service Scheduler)
**Branch:** `claude/audit-database-enterprise-h4CTm`

---

## Executive Summary

This forensic-style investigation traces data flows throughout the Chronos Scheduler application, uncovering storage locations, inconsistencies, and risks to prepare for cloud migration. The system is a **full-stack web application** built with **TypeScript/Express.js + React**, currently using a **local SQLite database**.

### Migration Readiness Score: **6.5/10**

| Category | Score | Assessment |
|----------|-------|------------|
| Schema Design | 8/10 | Well-structured, properly normalized |
| Data Centralization | 5/10 | Multiple storage locations identified |
| Scalability Readiness | 5/10 | SQLite limitations, in-memory caches |
| Security Posture | 6/10 | Good auth, some SQL concerns |
| Audit Trail | 9/10 | Comprehensive AuditLog model |
| Documentation | 7/10 | Existing docs, needs consolidation |

---

## 1. Overall Data Assessment

### 1.1 Current Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CHRONOS SCHEDULER ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────────────────┐ │
│  │   Frontend   │────▶│   Backend    │────▶│        Data Layer            │ │
│  │  React/Vite  │     │  Express.js  │     │                              │ │
│  │              │     │              │     │  ┌────────────────────────┐  │ │
│  │ localStorage │     │  In-Memory   │     │  │   SQLite Database      │  │ │
│  │ sessionStore │     │   Caches     │     │  │   (prisma/dev.db)      │  │ │
│  └──────────────┘     └──────────────┘     │  │   54 Tables            │  │ │
│                                            │  └────────────────────────┘  │ │
│                                            │                              │ │
│                                            │  ┌────────────────────────┐  │ │
│                                            │  │   CSV Import Files     │  │ │
│                                            │  │   (prisma/*.csv)       │  │ │
│                                            │  └────────────────────────┘  │ │
│                                            └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Strengths

| Strength | Details |
|----------|---------|
| **Mature Schema** | 54 well-defined Prisma models covering complex rail car scheduling domain |
| **Multi-Tenancy** | Proper `companyId` isolation across all tables |
| **Audit Trail** | Comprehensive `AuditLog` table tracking all modifications |
| **Indexing Strategy** | 50+ indexes for query optimization |
| **Referential Integrity** | Foreign keys with cascade deletes enabled |
| **Version Control** | MasterPlan versioning for fleet schedules |
| **Soft Deletes** | Implemented for historical preservation |

### 1.3 Weaknesses

| Weakness | Severity | Details |
|----------|----------|---------|
| **Multiple Storage Locations** | HIGH | Data spread across DB, CSV files, in-memory caches, browser storage |
| **Custom ORM Wrapper** | HIGH | `db.ts` reimplements Prisma methods (1000+ lines), creates maintenance burden |
| **SQLite Limitations** | MEDIUM | Single-writer, no concurrent write scaling |
| **In-Memory State** | MEDIUM | Rate limits, caches not persisted across restarts |
| **JSON Fields** | LOW | 15+ fields store JSON arrays (not indexed) |
| **Dual Data Sources** | MEDIUM | `CarFlowPlan` and `MasterPlanCommitment` overlap |

---

## 2. Data Flow Mapping

### 2.1 Data Ingestion Points

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA INGESTION FLOWS                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐                                                         │
│  │  CSV File Upload │──────────────────────────────────────┐                 │
│  │  (Qual Planner)  │                                      │                 │
│  └─────────────────┘                                       ▼                 │
│                                               ┌──────────────────────┐       │
│  ┌─────────────────┐                          │                      │       │
│  │  CSV File Upload │─────────────────────────▶   Import Service     │       │
│  │  (Shop Locations)│                          │  (importExport.ts)   │       │
│  └─────────────────┘                          │                      │       │
│                                               └──────────┬───────────┘       │
│  ┌─────────────────┐                                     │                   │
│  │  API Requests   │──────────────────────────┐          │                   │
│  │  (REST/JSON)    │                          │          ▼                   │
│  └─────────────────┘                          │  ┌───────────────────┐       │
│                                               └─▶│  Prisma/db.ts     │       │
│  ┌─────────────────┐                             │  (Data Layer)     │       │
│  │  WebSocket      │─────────────────────────────▶                   │       │
│  │  (Real-time)    │                             └───────┬───────────┘       │
│  └─────────────────┘                                     │                   │
│                                                          ▼                   │
│  ┌─────────────────┐                             ┌───────────────────┐       │
│  │  User Forms     │─────────────────────────────▶   SQLite DB       │       │
│  │  (UI Input)     │                             │   (dev.db)        │       │
│  └─────────────────┘                             └───────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Storage Location Inventory

#### PRIMARY: SQLite Database
**Location:** `backend/prisma/dev.db`
**Technology:** SQLite 3 via `better-sqlite3` + Prisma ORM
**Tables:** 54 models
**Status:** Main source of truth

```typescript
// Connection (backend/src/services/db.ts:7-10)
const dbPath = path.join(__dirname, '../../prisma/dev.db');
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');  // Write-Ahead Logging
```

#### SECONDARY: CSV Import Files
**Location:** `backend/prisma/`
**Files:**
| File | Size | Purpose |
|------|------|---------|
| `Qual Planner Master.csv` | 3.2 MB | Car fleet data import |
| `cleaned shop locations.csv` | 295 KB | Shop master data |

**Risk:** Data lives in CSV until imported. If import fails, source of truth is unclear.

#### TERTIARY: In-Memory Caches

| Cache | Location | Purpose | TTL | Persistence |
|-------|----------|---------|-----|-------------|
| Rate Limit | `rateLimit.ts:64` | Request throttling | Window-based | DB + in-memory fallback |
| Webhook Config | `webhookAlertService.ts:203` | Webhook endpoints | 5 min | None |
| Performance Scores | `ruleEngine.ts:18` | Shop scoring | 5 min | None |
| API Key Rate Limits | `apiKeyService.ts:46` | Per-key limits | Window-based | None |

**Risk:** Server restart loses in-memory state. Rate limiting fails open if DB unavailable.

```typescript
// Rate limit fallback (rateLimit.ts:63-64)
// In-memory fallback rate limiter when database is unavailable
const inMemoryRateLimits = new Map<string, { count: number; windowStart: number }>();
```

#### QUATERNARY: Browser Storage

| Storage | Location | Data | Risk |
|---------|----------|------|------|
| localStorage | `WebSocketContext.tsx:78` | Auth token | Token exposure if XSS |
| sessionStorage | `Login.tsx:22` | Redirect URL | Low risk, temporary |

### 2.3 "Random Save" Analysis

Investigating why data appears in unexpected locations:

| Symptom | Root Cause | Location |
|---------|------------|----------|
| CSV data not appearing | Import failed silently | `importExport.ts` error handling |
| Rate limits reset on restart | In-memory fallback | `rateLimit.ts:187-191` |
| Webhook configs lost | Not in DB, only cache | `webhookAlertService.ts` |
| Old shop data persists | CSV not re-imported | Seed scripts run once |
| Scenario data duplicated | Dual storage paths | `CarFlowPlan` + `MasterPlanCommitment` |

---

## 3. Structure Audit

### 3.1 Schema Analysis

#### Normalization Assessment: **3NF Compliant**

The schema is properly normalized to Third Normal Form:
- No repeating groups (1NF)
- No partial dependencies (2NF)
- No transitive dependencies (3NF)

**Exception:** JSON fields store denormalized arrays for flexibility.

#### Entity-Relationship Diagram (Text-Based)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CORE ENTITIES                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────┐         ┌──────────┐         ┌──────────┐                    │
│   │ Company  │◄────────│   User   │         │ Customer │                    │
│   │ ──────── │         │ ──────── │         │ ──────── │                    │
│   │ id (PK)  │         │ id (PK)  │         │ id (PK)  │                    │
│   │ name     │         │ email    │         │ name     │                    │
│   │ code (U) │         │ role     │         │ code (U) │                    │
│   └────┬─────┘         │ companyId│         │ companyId│                    │
│        │               └──────────┘         └────┬─────┘                    │
│        │                                         │                          │
│        ▼                                         ▼                          │
│   ┌──────────┐                             ┌──────────┐                     │
│   │   Car    │◄────────────────────────────│LeaseContr│                     │
│   │ ──────── │                             │   act    │                     │
│   │ id (PK)  │                             └──────────┘                     │
│   │ railcar# │                                                              │
│   │ (UNIQUE) │                                                              │
│   │ customerId                                                              │
│   │ companyId│                                                              │
│   └────┬─────┘                                                              │
│        │                                                                    │
│        ├──────────────────┬──────────────────┬──────────────────┐          │
│        ▼                  ▼                  ▼                  ▼          │
│   ┌──────────┐      ┌───────────┐     ┌───────────┐     ┌───────────┐     │
│   │CarFlowPln│      │MasterPlan │     │ScenarioCar│     │ServicePlan│     │
│   │ ──────── │      │Commitment │     │ ──────── │      │   Car    │      │
│   │ carId    │      │ ──────── │      │ carId    │      │ ──────── │      │
│   │ shopId   │      │ carId    │      │ scenarioId│     │ carId    │      │
│   │ status   │      │ shopId   │      │ shopId   │      │ shopId   │      │
│   └──────────┘      │ status   │      └───────────┘     └───────────┘     │
│                     └───────────┘                                          │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                              SHOP ENTITIES                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────┐         ┌───────────┐         ┌───────────┐                 │
│   │   Shop   │◄────────│ShopNetwork│         │SOPCommit- │                 │
│   │ ──────── │         │ ──────── │          │   ment    │                 │
│   │ id (PK)  │         │ id (PK)  │          │ ──────── │                  │
│   │ code (U) │         │ code (U) │          │ shopId   │                  │
│   │ networkId│────────▶│ isAitx   │          │ year/month│                 │
│   │ parentId │         │ tier     │          │ committed │                 │
│   │ tankQual │         └───────────┘         │ current   │                 │
│   └────┬─────┘                               └───────────┘                 │
│        │                                                                    │
│        ├──────────────────┬──────────────────┐                             │
│        ▼                  ▼                  ▼                             │
│   ┌──────────┐      ┌───────────┐     ┌───────────┐                        │
│   │ShopCapab-│      │WeeklyCapac│     │CarShopEli-│                        │
│   │ility     │      │   ity     │     │ gibility  │                        │
│   │ Profile  │      │ ──────── │      │ ──────── │                         │
│   │ ──────── │      │ shopId   │      │ carId    │                         │
│   │ shopId   │      │ weekKey  │      │ shopId   │                         │
│   │ canPerf* │      │ slots    │      │ isEligible│                        │
│   └──────────┘      └───────────┘     └───────────┘                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Index Coverage Analysis

| Table | Indexes | Status | Recommendation |
|-------|---------|--------|----------------|
| Car | 9 indexes | Good | Consider adding `[customerId, status]` |
| Shop | 11 indexes | Good | None |
| CarFlowPlan | 10 indexes | Good | None |
| MasterPlanCommitment | 12 indexes | Good | None |
| User | 2 indexes | OK | Add `[companyId, role]` for RBAC queries |
| AuditLog | 2 indexes | Low | Add `[entityId]` for entity lookups |
| ServicePlanCar | 5 indexes | Good | None |

### 3.3 Foreign Key Constraints

All relationships properly defined with appropriate cascade behavior:

```prisma
// Example cascade patterns (schema.prisma)
CarShopEligibility:
  car    Car  @relation(onDelete: Cascade)   // Delete eligibility if car deleted
  shop   Shop @relation(onDelete: Cascade)   // Delete eligibility if shop deleted

CarFlowPlan:
  sourceScenario Scenario? @relation(onDelete: Cascade)  // Clean up if scenario deleted
  committedBy    User      @relation(onDelete: Cascade)  // Required user reference

SOPCommitment:
  updatedBy User? @relation(onDelete: SetNull)  // Preserve commitment if user deleted
```

### 3.4 Data Type Analysis

| Issue | Tables Affected | Risk | Fix |
|-------|-----------------|------|-----|
| JSON stored as String | Shop, ShopCapabilityProfile, LeaseQualificationEntry | Can't index, parse errors | Migrate to proper JSON type in PostgreSQL |
| Boolean as Int | All tables (SQLite) | None | SQLite stores booleans as 0/1, handled correctly |
| DateTime as String | All tables | Query performance | Native DATETIME in PostgreSQL |
| UUID as String | All tables | Performance | Native UUID in PostgreSQL |

### 3.5 Inconsistencies Found

#### Dual Source of Truth

```
┌─────────────────────────────────────────────────────────────────┐
│              CAR ASSIGNMENT - DUAL DATA SOURCES                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────────────┐    ┌─────────────────────┐            │
│   │    CarFlowPlan      │    │ MasterPlanCommitment│            │
│   │ (CSV Import Source) │    │  (Formal Workflow)  │            │
│   ├─────────────────────┤    ├─────────────────────┤            │
│   │ carId, shopId       │    │ carId, shopId       │            │
│   │ plannedYear/Month   │    │ plannedYear/Month   │            │
│   │ status              │    │ status              │            │
│   │ priority            │    │ priority            │            │
│   │ estimatedCost       │    │ estimatedCost       │            │
│   └─────────────────────┘    └─────────────────────┘            │
│              │                        │                          │
│              └────────────┬───────────┘                          │
│                           ▼                                      │
│              ┌─────────────────────┐                             │
│              │   Shop Schedule     │                             │
│              │   (Must Query Both) │                             │
│              └─────────────────────┘                             │
│                                                                  │
│   PROBLEM: Two tables store same concept with different         │
│   sources. Queries must union both to show complete picture.    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Orphaned Record Risk

| Risk | Detection Query | Prevention |
|------|-----------------|------------|
| Cars without company | `SELECT * FROM Car WHERE companyId IS NULL` | NOT NULL constraint |
| Assignments to deleted cars | `SELECT * FROM CarFlowPlan WHERE carId NOT IN (SELECT id FROM Car)` | FK constraint (enforced) |
| Scenarios without creator | `SELECT * FROM Scenario WHERE createdBy IS NULL` | NOT NULL constraint |

### 3.6 Scalability Issues

| Issue | Current State | Impact at Scale | Mitigation |
|-------|---------------|-----------------|------------|
| SQLite single-writer | WAL mode helps | Bottleneck at 100+ concurrent writes | Migrate to PostgreSQL |
| In-memory caches | Map<> objects | Lost on restart, no cluster sharing | Use Redis |
| JSON field queries | Full text search | O(n) on large datasets | Normalize or use JSONB |
| Large table scans | Car table ~10K rows | OK now, problematic at 100K+ | Pagination implemented |
| Monolithic transactions | Single DB file | Lock contention | Connection pooling |

---

## 4. Setup Forensics

### 4.1 Configuration Analysis

#### Environment Variables (`.env.example`)

| Variable | Purpose | Security | Status |
|----------|---------|----------|--------|
| DATABASE_URL | DB connection | Low | `file:./dev.db` - relative path |
| JWT_SECRET | Token signing | CRITICAL | Must be 32+ chars |
| ALLOWED_ORIGINS | CORS | Medium | Comma-separated list |
| PORT | Server port | Low | Default 4000 |
| LOG_LEVEL | Logging | Low | debug/info/warn/error |
| SMTP_* | Email config | Medium | Optional, cleartext password |
| WEBHOOK_* | Webhooks | Low | Timeout/retry config |

**Issues Found:**
1. `DATABASE_URL` uses relative path - fragile in containerized deployments
2. No explicit `NODE_ENV` validation
3. SMTP password in environment (consider secrets manager)

#### Hardcoded Paths

```typescript
// db.ts:7 - Database path relative to source file
const dbPath = path.join(__dirname, '../../prisma/dev.db');

// seed.ts:10-11 - CSV file paths
const CAR_CSV_FILE_PATH = path.join(__dirname, 'Qual Planner Master.csv');
const SHOP_CSV_FILE_PATH = path.join(__dirname, 'cleaned shop locations.csv');

// importCsv.ts:49 - Another hardcoded path
const csvPath = path.join(__dirname, 'Qual Planner Master.csv');
```

**Recommendation:** Externalize all paths to environment variables.

### 4.2 Security Analysis

#### Authentication

| Component | Implementation | Status |
|-----------|----------------|--------|
| Password Hashing | bcrypt | Good |
| JWT Tokens | 32+ char secret required | Good |
| Token Blacklist | InvalidatedToken table | Good |
| Session Management | Stateless JWT | Good |
| CORS | Configurable origins | Good |

#### Database Security

| Risk | Current State | Severity |
|------|---------------|----------|
| SQL Injection | Table/column whitelist in `db.ts` | Medium (mitigated) |
| Parameterized Queries | Used for values | Good |
| Raw SQL Logging | Enabled with warnings | Medium |
| Connection Encryption | None (SQLite file) | N/A locally |

```typescript
// db.ts:15-28 - SQL injection whitelist mitigation
const ALLOWED_TABLES = new Set([
  'User', 'Company', 'Car', 'Shop', 'Plan', ...
]);

// Column validation (db.ts:30-31)
const VALID_COLUMN_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
```

#### Data Exposure Risks

| Location | Data | Risk | Mitigation |
|----------|------|------|------------|
| CSV files | Car/Shop data | Medium | Move to secure upload path |
| localStorage | JWT token | Medium | HttpOnly cookie alternative |
| Console logs | Debug data | Low | Remove in production |
| Error responses | Stack traces | Medium | Hide in production mode |

### 4.3 Dependency Analysis

#### ORM Architecture Issue

The codebase has **two competing data access patterns**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    DUAL ORM ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────────────┐    ┌─────────────────────┐            │
│   │   Prisma Client     │    │   Custom db.ts      │            │
│   │   (Generated)       │    │   (1000+ lines)     │            │
│   ├─────────────────────┤    ├─────────────────────┤            │
│   │ • Type-safe queries │    │ • Manual SQL        │            │
│   │ • Migrations        │    │ • better-sqlite3    │            │
│   │ • Relations         │    │ • Prisma-like API   │            │
│   │ • Not used runtime! │    │ • Actually used!    │            │
│   └─────────────────────┘    └─────────────────────┘            │
│                                                                  │
│   PROBLEM: Prisma schema defines models but runtime uses        │
│   custom wrapper. No benefit from Prisma Client features.       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Recommendation:** Either fully adopt Prisma Client or document custom ORM as intentional.

#### Key Dependencies

| Package | Version | Risk | Notes |
|---------|---------|------|-------|
| better-sqlite3 | 12.5.0 | Low | Native binding, well-maintained |
| prisma | 5.22.0 | Low | Schema management only |
| jsonwebtoken | 9.0.2 | Low | JWT implementation |
| bcrypt | 5.1.1 | Low | Password hashing |
| socket.io | 4.8.1 | Low | WebSocket support |
| zod | 3.23.8 | Low | Validation schemas |

---

## 5. Cleanup and Refactor Recommendations

### 5.1 Centralization Plan

#### Phase 1: Eliminate CSV Dependencies

```typescript
// BEFORE: CSV files scattered in prisma/
backend/prisma/
├── Qual Planner Master.csv     // 3.2MB
├── cleaned shop locations.csv  // 295KB
├── importCsv.ts                // Manual import
└── importShops.ts              // Manual import

// AFTER: API-driven import with temporary storage
backend/
├── uploads/                    // Temp upload directory (gitignored)
│   └── .gitkeep
├── src/
│   └── services/
│       └── importService.ts    // Unified import handling
```

**Migration Script:**

```typescript
// scripts/migrate-csv-to-db.ts
import { prisma } from '../src/services/db';
import { parseCSV } from '../src/services/importExportService';
import fs from 'fs';
import path from 'path';

async function migrateCsvData() {
  const csvDir = path.join(__dirname, '../prisma');

  // 1. Import cars
  const carCsv = fs.readFileSync(path.join(csvDir, 'Qual Planner Master.csv'), 'utf-8');
  const cars = await parseCSV(carCsv, 'car');

  for (const car of cars) {
    await prisma.car.upsert({
      where: { railcarNumber: car.railcarNumber },
      create: car,
      update: car
    });
  }

  // 2. Archive CSV files
  fs.renameSync(
    path.join(csvDir, 'Qual Planner Master.csv'),
    path.join(csvDir, 'archive/Qual Planner Master.csv.bak')
  );

  console.log('Migration complete');
}
```

#### Phase 2: Consolidate In-Memory Caches

```typescript
// BEFORE: Scattered Map<> caches
// rateLimit.ts:64
const inMemoryRateLimits = new Map<string, { count: number; windowStart: number }>();

// webhookAlertService.ts:203
const configCache = new Map<string, { configs: WebhookConfig[]; expiresAt: number }>();

// ruleEngine.ts:18
const performanceScoreCache = new Map<string, { score: number; timestamp: number }>();

// AFTER: Unified cache service with optional Redis backend
// src/services/cacheService.ts
interface CacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(pattern?: string): Promise<void>;
}

class InMemoryCacheService implements CacheService {
  private cache = new Map<string, { value: any; expiresAt: number }>();
  // ... implementation
}

class RedisCacheService implements CacheService {
  private client: Redis;
  // ... implementation for production
}

export const cacheService = process.env.REDIS_URL
  ? new RedisCacheService()
  : new InMemoryCacheService();
```

#### Phase 3: Unify Data Sources

```typescript
// BEFORE: Two tables for same concept
// CarFlowPlan (CSV imports) + MasterPlanCommitment (workflow)

// AFTER: Single UnifiedAssignment table with source tracking
model UnifiedAssignment {
  id                String    @id @default(uuid())
  carId             String
  shopId            String
  plannedYear       Int
  plannedMonth      Int
  status            String    @default("PLANNED")

  // Source tracking
  source            String    // "csv_import" | "scenario" | "master_plan" | "manual"
  sourceId          String?   // ID of originating record

  // Audit
  createdAt         DateTime  @default(now())
  createdById       String

  // ... other fields
}

// Migration: Merge existing data
async function unifyAssignments() {
  // 1. Copy CarFlowPlan records
  const carFlowPlans = await prisma.carFlowPlan.findMany();
  for (const cfp of carFlowPlans) {
    await prisma.unifiedAssignment.create({
      data: {
        ...cfp,
        source: cfp.source || 'csv_import',
        sourceId: cfp.id
      }
    });
  }

  // 2. Copy MasterPlanCommitment records (avoiding duplicates)
  // ...
}
```

### 5.2 Robustification Recommendations

#### Add Audit Timestamps to All Tables

```prisma
// Add to tables missing timestamps:
model RateLimitEntry {
  // Existing fields...
  createdAt   DateTime @default(now())  // ADD
}

model InvalidatedToken {
  // Existing fields...
  // Already has createdAt, good
}
```

#### Enhanced Validation with Zod Schemas

```typescript
// src/schemas/carSchema.ts
import { z } from 'zod';

export const carCreateSchema = z.object({
  railcarNumber: z.string()
    .min(6, 'Railcar number must be at least 6 characters')
    .max(12, 'Railcar number must be at most 12 characters')
    .regex(/^[A-Z]{2,4}\d{4,8}$/, 'Invalid railcar number format'),

  carType: z.enum(['Tank', 'Hopper', 'Boxcar', 'Gondola', 'Flatcar']),

  customerId: z.string().uuid().optional(),

  status: z.enum([
    'Complete', 'Arrived', 'To Be Routed', 'Enroute',
    'Release', 'Reassigned', 'Up Marketed'
  ]).default('To Be Routed'),

  // Qualification dates
  tankQualification: z.coerce.date().optional(),
  rule88B: z.coerce.date().optional(),
  safetyRelief: z.coerce.date().optional(),
});

export type CarCreate = z.infer<typeof carCreateSchema>;
```

#### Improved Error Handling for Saves

```typescript
// src/services/carService.ts
import { logger } from '../utils/logger';
import { AuditService } from './auditService';

export class CarService {
  async updateCar(id: string, data: CarUpdate, userId: string): Promise<Car> {
    const existing = await prisma.car.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundError('Car', id);
    }

    try {
      const updated = await prisma.$transaction(async (tx) => {
        // 1. Update car
        const car = await tx.car.update({
          where: { id },
          data: {
            ...data,
            updatedAt: new Date()
          }
        });

        // 2. Create audit log
        await tx.auditLog.create({
          data: {
            userId,
            action: 'update',
            entityType: 'Car',
            entityId: id,
            entityName: car.railcarNumber,
            changes: JSON.stringify(
              this.diffObjects(existing, car)
            ),
            companyId: car.companyId
          }
        });

        return car;
      });

      logger.info('Car updated', { carId: id, userId });
      return updated;

    } catch (error) {
      logger.error('Failed to update car', { carId: id, error });
      throw new DatabaseError('Failed to update car', { cause: error });
    }
  }

  private diffObjects(before: any, after: any): Record<string, { old: any; new: any }> {
    const changes: Record<string, { old: any; new: any }> = {};
    for (const key of Object.keys(after)) {
      if (before[key] !== after[key]) {
        changes[key] = { old: before[key], new: after[key] };
      }
    }
    return changes;
  }
}
```

### 5.3 Recommended Tools

| Tool | Purpose | Priority |
|------|---------|----------|
| **pgAdmin / DBeaver** | Database visualization | HIGH |
| **Prisma Studio** | Visual data browser | MEDIUM |
| **dbdiagram.io** | ER diagram generation | MEDIUM |
| **sqlfluff** | SQL linting | LOW |
| **Flyway / Prisma Migrate** | Schema migrations | HIGH |
| **Redis** | Distributed caching | HIGH (for prod) |
| **pg_stat_statements** | Query performance | HIGH (for PostgreSQL) |

---

## 6. Action Plan

### Priority Matrix

```
┌─────────────────────────────────────────────────────────────────┐
│                        PRIORITY MATRIX                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   HIGH IMPACT                                                    │
│        ▲                                                         │
│        │   ┌─────────────────────┐  ┌─────────────────────┐     │
│        │   │ 1. Migrate to       │  │ 2. Unify data       │     │
│        │   │    PostgreSQL       │  │    sources          │     │
│        │   │    (P1-HIGH)        │  │    (P1-HIGH)        │     │
│        │   └─────────────────────┘  └─────────────────────┘     │
│        │                                                         │
│        │   ┌─────────────────────┐  ┌─────────────────────┐     │
│        │   │ 3. Add Redis        │  │ 4. Externalize      │     │
│        │   │    caching          │  │    config           │     │
│        │   │    (P2-MEDIUM)      │  │    (P2-MEDIUM)      │     │
│        │   └─────────────────────┘  └─────────────────────┘     │
│        │                                                         │
│        │   ┌─────────────────────┐  ┌─────────────────────┐     │
│        │   │ 5. Add missing      │  │ 6. Normalize JSON   │     │
│        │   │    indexes          │  │    fields           │     │
│        │   │    (P3-LOW)         │  │    (P3-LOW)         │     │
│        │   └─────────────────────┘  └─────────────────────┘     │
│        │                                                         │
│   LOW IMPACT ───────────────────────────────────────▶ HIGH EFFORT│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Detailed Task List

#### P1 - Critical (Week 1-2)

| Task | Effort | Verification |
|------|--------|--------------|
| 1.1 Document all data storage locations | 4 hrs | Inventory spreadsheet complete |
| 1.2 Create PostgreSQL migration plan | 8 hrs | Migration runbook approved |
| 1.3 Backup existing SQLite database | 1 hr | Verified backup restores |
| 1.4 Test Prisma with PostgreSQL locally | 4 hrs | All tests pass |
| 1.5 Merge CarFlowPlan + MasterPlanCommitment | 16 hrs | Single source works |

#### P2 - High (Week 3-4)

| Task | Effort | Verification |
|------|--------|--------------|
| 2.1 Implement Redis caching layer | 8 hrs | Cache hits logged |
| 2.2 Move CSV files to upload API | 4 hrs | No CSV in repo |
| 2.3 Externalize all hardcoded paths | 2 hrs | Config-driven |
| 2.4 Add missing indexes | 2 hrs | Query performance improved |
| 2.5 Implement connection pooling | 4 hrs | Pool stats visible |

#### P3 - Medium (Week 5-6)

| Task | Effort | Verification |
|------|--------|--------------|
| 3.1 Normalize JSON fields to tables | 16 hrs | No JSON arrays |
| 3.2 Add Zod validation to all routes | 8 hrs | Validation errors consistent |
| 3.3 Enhance audit logging | 4 hrs | All mutations logged |
| 3.4 Create data integrity checks | 4 hrs | Scheduled job runs |
| 3.5 Document migration procedures | 4 hrs | Runbook complete |

### Verification Scripts

```typescript
// scripts/verify-data-integrity.ts
import { prisma } from '../src/services/db';

async function verifyDataIntegrity() {
  const issues: string[] = [];

  // 1. Check for orphaned records
  const orphanedAssignments = await prisma.$queryRaw`
    SELECT id FROM CarFlowPlan
    WHERE carId NOT IN (SELECT id FROM Car)
  `;
  if (orphanedAssignments.length > 0) {
    issues.push(`Found ${orphanedAssignments.length} orphaned CarFlowPlan records`);
  }

  // 2. Check for null companyId
  const nullCompanyCars = await prisma.car.count({
    where: { companyId: null }
  });
  if (nullCompanyCars > 0) {
    issues.push(`Found ${nullCompanyCars} cars with null companyId`);
  }

  // 3. Check for duplicate railcar numbers
  const duplicates = await prisma.$queryRaw`
    SELECT railcarNumber, COUNT(*) as cnt
    FROM Car
    GROUP BY railcarNumber
    HAVING cnt > 1
  `;
  if (duplicates.length > 0) {
    issues.push(`Found ${duplicates.length} duplicate railcar numbers`);
  }

  // 4. Verify index existence
  // (Would use database-specific query)

  console.log('Data Integrity Report:');
  if (issues.length === 0) {
    console.log('  All checks passed!');
  } else {
    issues.forEach(issue => console.log(`  - ${issue}`));
  }
}

verifyDataIntegrity();
```

---

## 7. Migration Prep

### 7.1 Schema Compatibility

| SQLite Feature | PostgreSQL Equivalent | Migration Notes |
|----------------|----------------------|-----------------|
| `TEXT` | `TEXT` | Compatible |
| `INTEGER` (boolean) | `BOOLEAN` | Prisma handles |
| `REAL` | `DOUBLE PRECISION` | Compatible |
| `BLOB` | `BYTEA` | Not used |
| `AUTOINCREMENT` | `SERIAL` | UUIDs used instead |
| `datetime('now')` | `NOW()` | Prisma handles |

### 7.2 Migration Steps

```bash
# 1. Update Prisma schema
# schema.prisma
datasource db {
  provider = "postgresql"  # Changed from "sqlite"
  url      = env("DATABASE_URL")
}

# 2. Create new PostgreSQL database
createdb chronos_scheduler

# 3. Export SQLite data
sqlite3 prisma/dev.db .dump > backup.sql

# 4. Push schema to PostgreSQL
npx prisma db push

# 5. Import data (via migration script)
npx ts-node scripts/migrate-sqlite-to-pg.ts

# 6. Verify data
npx ts-node scripts/verify-data-integrity.ts
```

### 7.3 Cloud Migration Benefits

| Improvement | Before (SQLite) | After (PostgreSQL/Cloud) |
|-------------|-----------------|--------------------------|
| Concurrent writes | 1 (WAL helps) | 100+ |
| Connection pooling | N/A | Yes (PgBouncer) |
| Replication | Manual | Native |
| Backups | File copy | Automated |
| Monitoring | Manual | Built-in |
| JSON queries | String parsing | JSONB indexes |
| Full-text search | Basic | tsvector |

### 7.4 Cloud Provider Options

| Provider | Service | Notes |
|----------|---------|-------|
| **AWS** | RDS PostgreSQL | Managed, auto-backups |
| **GCP** | Cloud SQL | Similar to RDS |
| **Azure** | Azure Database | Good .NET integration |
| **Neon** | Serverless Postgres | Good for dev, scales to zero |
| **Supabase** | PostgreSQL + Auth | Full backend as service |
| **PlanetScale** | MySQL (Vitess) | Requires schema change |

---

## 8. Appendix

### A. Table Summary

| Category | Tables | Count |
|----------|--------|-------|
| **Core Data** | Company, User, Customer, Car, Shop | 5 |
| **Planning** | Plan, PlanAssignment, Scenario, ScenarioCar, ScenarioModification, ScenarioCustomer | 6 |
| **Commitments** | CarFlowPlan, MasterPlan, MasterPlanCommitment, UnifiedAssignment, SOPCommitment | 5 |
| **S&OP** | ShopNetwork, SOPNetworkCommitment, ShopCapabilityProfile | 3 |
| **Qualification** | LeaseContract, LeaseQualificationEntry, QualificationPlanEvent, QualificationScenario, QualificationPlanAssignment, QualificationPlanDocument | 6 |
| **Service Plans** | ServicePlan, ServicePlanCar, PlanOption, PlanOptionAssignment, CapacityReservation, ServicePlanAuditEvent | 6 |
| **Capacity** | ShopCapacitySlot, WeeklyCapacity, CapacityAudit, AllocationOverride | 4 |
| **Rules** | ShopRule, CarShopEligibility | 2 |
| **Audit/System** | AuditLog, ImportSession, IntegrationLog, ShopHistory | 4 |
| **Security** | RolePermission, FieldSecurity, ApiKey, InvalidatedToken, RateLimitEntry | 5 |
| **Reports** | ReportTemplate, ScheduledReport, FilterPreset | 3 |
| **Notifications** | Notification, WebhookConfig | 2 |
| **Other** | ShopPerformance, PlanProposal | 2 |
| **TOTAL** | | **54** |

### B. File References

| File | Purpose | Lines |
|------|---------|-------|
| `backend/prisma/schema.prisma` | Database schema | 2,340 |
| `backend/src/services/db.ts` | Custom ORM wrapper | 1,014 |
| `backend/src/services/importExportService.ts` | CSV handling | ~500 |
| `backend/src/middleware/rateLimit.ts` | Rate limiting | ~230 |
| `backend/src/services/auditService.ts` | Audit logging | ~150 |

### C. Related Documentation

- `DATABASE_INDEX.md` - Table-by-table reference
- `CODE_REVIEW_AUDIT.md` - Previous code review findings
- `QA_AUDIT_REPORT.md` - QA audit (score: 3.75/10)
- `docs/DATABASE_DIAGRAMS.md` - Visual schema diagrams
- `docs/CHRONOS_SOP_PLANNING_ENGINE.md` - Business logic

---

## Conclusion

The Chronos Scheduler database architecture is **well-designed at the schema level** but has **operational fragmentation** that needs addressing before cloud migration. The primary concerns are:

1. **Data scattered across SQLite + CSV + in-memory caches**
2. **Custom ORM wrapper bypassing Prisma Client benefits**
3. **SQLite limitations for production scale**
4. **Dual data sources for car assignments**

Following the action plan above will centralize data, improve scalability, and prepare the system for enterprise-grade cloud deployment.

---

*Report generated: January 11, 2026*
*Next review recommended: After PostgreSQL migration*
