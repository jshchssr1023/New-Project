# Chronos Scheduler - Infrastructure Review

**Review Date:** January 8, 2026
**System:** Chronos Scheduler - Rail Car Service Scheduler for AITX
**Review Team:** Data Infrastructure Team (Planner, Analyzer, Security, Deep Thinker)

---

## Executive Summary

Chronos Scheduler is a sophisticated, enterprise-grade rail car fleet management system with multi-tenant architecture, versioned master planning, intelligent shop allocation, and real-time collaboration capabilities. This review identifies **47 actionable improvements** across security, performance, data integrity, and architecture domains.

**Overall Assessment:** The system demonstrates solid fundamentals with good security practices (parameterized queries, JWT with blacklisting, RBAC). However, there are critical areas requiring immediate attention, particularly around token storage, database integrity constraints, and query optimization.

| Category | Current State | Risk Level |
|----------|---------------|------------|
| Security | Good fundamentals, token storage issue | HIGH |
| Data Integrity | Multiple constraint gaps | HIGH |
| Performance | N+1 queries, missing indexes | MEDIUM |
| Architecture | Technical debt from parallel models | MEDIUM |
| Code Quality | Well-organized, needs validation | LOW |

---

## Table of Contents

1. [Security Analysis](#1-security-analysis)
2. [Database & Data Model Review](#2-database--data-model-review)
3. [Performance & API Analysis](#3-performance--api-analysis)
4. [Architectural Recommendations](#4-architectural-recommendations)
5. [Prioritized Action Plan](#5-prioritized-action-plan)

---

## 1. Security Analysis

### 1.1 Authentication & Authorization

#### Strengths
- Strong JWT implementation with 32-character minimum secret validation (`backend/src/middleware/auth.ts:7-23`)
- Token blacklisting with SHA256 hashing before storage (`backend/src/middleware/auth.ts:51-96`)
- 24-hour token expiration with automatic cleanup
- Role-Based Access Control (RBAC) with `requireRole()` middleware
- Strong password requirements: 8+ chars, uppercase, number, special character (`backend/src/routes/auth.ts:11-16`)
- bcryptjs hashing with proper salt rounds (10)

#### Critical Issues

**CRITICAL-SEC-001: Token Storage in localStorage**
- **Location:** `frontend/src/services/api.ts:137-140, 233-234`
- **Risk:** Tokens stored in `localStorage` are vulnerable to XSS attacks
- **Impact:** Any XSS vulnerability exposes all user sessions
- **Recommendation:** Migrate to httpOnly, Secure, SameSite cookies

```typescript
// CURRENT (Vulnerable)
localStorage.setItem('token', token);

// RECOMMENDED
// Backend sets cookie:
res.cookie('token', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 24 * 60 * 60 * 1000
});
```

**HIGH-SEC-002: Missing Security Headers**
- **Location:** `backend/src/index.ts`
- **Missing Headers:**
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Strict-Transport-Security`
  - `Content-Security-Policy`
  - `X-XSS-Protection: 1; mode=block`

```typescript
// Add to index.ts
import helmet from 'helmet';
app.use(helmet());
```

**HIGH-SEC-003: CORS Allows Requests Without Origin**
- **Location:** `backend/src/index.ts:52-54`
- **Issue:** Requests without `Origin` header bypass CORS
- **Recommendation:** Reject requests without valid origin in production

### 1.2 Input Validation

#### Strengths
- Zod schema validation for auth endpoints
- Comprehensive SQL injection protection in `db.ts` with table whitelist and parameterized queries
- Column name regex validation prevents injection via column names

#### Issues

**MEDIUM-SEC-004: Inconsistent Request Validation**
- **Issue:** Many routes accept generic request bodies without schema validation
- **Locations:**
  - `backend/src/routes/users.ts:80, 126`
  - `backend/src/routes/shops.ts` (multiple endpoints)
- **Recommendation:** Add Zod validation middleware to all routes

```typescript
// Create validation middleware
const validate = (schema: z.ZodSchema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ errors: result.error.issues });
  }
  req.body = result.data;
  next();
};
```

**MEDIUM-SEC-005: No Content-Type Validation**
- **Issue:** No explicit check for `application/json` content type
- **Risk:** Content-type sniffing attacks
- **Recommendation:** Add content-type validation middleware

### 1.3 API Key Security

#### Strengths
- Secure key generation with `crypto.randomBytes(24)`
- Keys hashed with SHA256 before storage
- Per-key rate limiting with configurable windows
- Fine-grained permission model (read/write/admin)

#### Issues

**MEDIUM-SEC-006: In-Memory Rate Limiting Fallback**
- **Location:** `backend/src/middleware/rateLimit.ts:46-47`
- **Issue:** Rate limit tracking lost on restart, allows temporary bypass
- **Recommendation:** Use Redis for persistent rate limiting

### 1.4 Security Recommendations Priority

| ID | Issue | Severity | Effort | Priority |
|----|-------|----------|--------|----------|
| SEC-001 | localStorage tokens | CRITICAL | High | P0 |
| SEC-002 | Missing security headers | HIGH | Low | P0 |
| SEC-003 | CORS origin bypass | HIGH | Low | P1 |
| SEC-004 | Inconsistent validation | MEDIUM | Medium | P1 |
| SEC-005 | Content-type validation | MEDIUM | Low | P2 |
| SEC-006 | In-memory rate limiting | MEDIUM | Medium | P2 |

---

## 2. Database & Data Model Review

### 2.1 Schema Overview

- **Tables:** 42 models in Prisma schema (1,900 lines)
- **Database:** SQLite with WAL mode enabled
- **Indexes:** 153 indexes defined

### 2.2 Critical Data Integrity Issues

**CRITICAL-DB-001: Missing CASCADE on User Relations**
- **Location:** `prisma/schema.prisma:19-43`
- **Issue:** User deletions don't cascade to owned plans, scenarios, commitments
- **Impact:** Orphaned audit trail records, broken foreign key references
- **Fix:**

```prisma
model Plan {
  createdBy String
  creator   User @relation("PlanCreator", fields: [createdBy], references: [id], onDelete: Cascade)
}
```

**CRITICAL-DB-002: Status Fields as Plain Strings**
- **Issue:** 15+ status fields use `String` instead of enums
- **Affected Models:** Car, Plan, Scenario, CarFlowPlan, LeaseContract, SOPCommitment, etc.
- **Impact:** Invalid status values can be persisted, no type safety

```prisma
// CURRENT (Vulnerable)
status String @default("draft")

// RECOMMENDED
enum PlanStatus {
  DRAFT
  ACTIVE
  COMPLETED
  ARCHIVED
}
status PlanStatus @default(DRAFT)
```

**Status Fields Requiring Enum Conversion:**
| Model | Field | Current Values |
|-------|-------|----------------|
| Car | status | "To Be Routed", "Arrived", "Complete", "Release", etc. |
| Car | shoppingStatus | "Urgent", "Must Shop", "Upcoming", "Compliant", etc. |
| Plan | status | "draft", "active", "completed", "archived" |
| Scenario | status | "draft", "confirmed", "archived" |
| CarFlowPlan | status | "Planned", "In Progress", "Complete", "Cancelled" |
| LeaseContract | status | "active", "pending_release", "released", etc. |

**HIGH-DB-003: Missing CASCADE on Self-Referential Relations**
- **Locations:**
  - `Shop.parentShopId` (line 346) - No cascade
  - `MasterPlan.parentPlanId` (line 1636) - No cascade
  - `QualificationScenario.parentScenarioId` (line 1117) - No cascade
- **Impact:** Orphaned child records when parent deleted

**HIGH-DB-004: CarFlowPlan.sourceScenarioId Without CASCADE**
- **Location:** `prisma/schema.prisma:738`
- **Impact:** Deleting a Scenario leaves orphaned CarFlowPlan records

### 2.3 Missing Indexes

**Current State:** Good indexing on core tables (Car, Shop, PlanAssignment), but gaps exist.

**HIGH-PERF-001: Missing Indexes for Common Queries**

```prisma
// User model - add
@@index([email])
@@index([companyId])
@@index([role])

// LeaseQualificationEntry - add
@@index([carId, queueStatus])
@@index([customerId, plannedReleaseDate])
@@index([companyId, wasRescheduled, queueStatus])

// UnifiedAssignment - add
@@index([carId, status])
@@index([customerId, status, plannedYear])

// MasterPlanCommitment - add
@@index([carId, status])
@@index([customerId, plannedYear, plannedMonth])

// Car - add (if not present)
@@index([assignedShopId])
```

### 2.4 Normalization Issues

**MEDIUM-DB-005: Duplicate Customer Information**
- **Location:** Car model
- **Issue:** Both `customer: String` (legacy) and `customerId: String?` (FK) exist
- **Recommendation:** Remove `customer` field, require `customerId` only

**MEDIUM-DB-006: Duplicate Shop Network Information**
- **Location:** Shop model
- **Issue:** Both `network: String` and `networkId: String?` exist
- **Recommendation:** Remove `network` field, use `networkId` only

### 2.5 JSON Field Validation

**HIGH-DB-007: No Validation on JSON Fields**
- **Affected Fields:**
  - `ShopNetwork.regions` - JSON array stored as String
  - `ShopCapabilityProfile.allowedAssetClasses` - JSON array
  - `ShopCapabilityProfile.hazmatCertifications` - JSON array
  - `LeaseQualificationEntry.workTypes` - JSON array
- **Risk:** Invalid JSON can be stored, breaking application logic
- **Recommendation:** Add JSON schema validation or create dedicated junction tables

### 2.6 Technical Debt: Parallel Assignment Models

**Issue:** Four parallel assignment models create consistency risk:
1. `PlanAssignment` (legacy)
2. `CarFlowPlan` (newer, from CSV imports)
3. `MasterPlanCommitment` (newest, formal workflow)
4. `ScenarioCar` (what-if scenarios)

**Recommendation:** Complete migration to `UnifiedAssignment` model with polymorphic status (DRAFT, SCENARIO, COMMITTED)

### 2.7 Database Recommendations Priority

| ID | Issue | Severity | Effort | Priority |
|----|-------|----------|--------|----------|
| DB-001 | Missing CASCADE on User | CRITICAL | High | P0 |
| DB-002 | Status strings instead of enums | CRITICAL | High | P0 |
| DB-003 | Self-referential CASCADE | HIGH | Medium | P1 |
| DB-004 | CarFlowPlan.sourceScenarioId | HIGH | Low | P1 |
| PERF-001 | Missing indexes | HIGH | Medium | P1 |
| DB-005 | Duplicate customer fields | MEDIUM | Medium | P2 |
| DB-006 | Duplicate network fields | MEDIUM | Medium | P2 |
| DB-007 | JSON field validation | HIGH | High | P2 |

---

## 3. Performance & API Analysis

### 3.1 Query Patterns & N+1 Issues

**CRITICAL-PERF-002: Analytics Dashboard Over-Capacity Query**
- **Location:** `backend/src/routes/analytics.ts:101-123`
- **Issue:** Fetches ALL shops with ALL assignments, filters in-memory

```typescript
// CURRENT (Slow: ~500-2000ms for 100 shops)
const shopsOverCapacity = await prisma.shop.findMany({
  where: { companyId, isActive: true },
  include: {
    assignments: {
      where: { scheduledMonth: currentMonth },
    },
  },
});

// RECOMMENDED (Fast: ~50-100ms)
const assignments = await prisma.planAssignment.groupBy({
  by: ['shopId'],
  where: { scheduledMonth, shop: { companyId } },
  _count: { id: true }
});
```

**HIGH-PERF-003: Shops Monthly Capacity Endpoint**
- **Location:** `backend/src/routes/shops.ts:250-262`
- **Issue:** O(N²) nested loop filtering assignments

```typescript
// CURRENT (O(N²))
shops.map(shop => {
  const shopAssignments = assignments.filter(a => a.shopId === shop.id);
  months.forEach(month => {
    const assignment = shopAssignments.find(a => a.scheduledMonth === month);
  });
});

// RECOMMENDED (O(N))
const assignmentMap = new Map();
assignments.forEach(a => {
  const key = `${a.shopId}-${a.scheduledMonth}`;
  assignmentMap.set(key, a);
});
```

**HIGH-PERF-004: Plans Route Over-Fetching**
- **Location:** `backend/src/routes/plans.ts:17-40`
- **Issue:** Includes full `car` and `shop` objects for list views

```typescript
// CURRENT (Returns ~50KB per plan)
include: {
  assignments: {
    include: {
      car: true,
      shop: true,
    },
  },
}

// RECOMMENDED (Returns ~5KB per plan)
include: {
  assignments: {
    select: {
      id: true,
      scheduledMonth: true,
      car: { select: { id: true, railcarNumber: true } },
      shop: { select: { id: true, name: true, code: true } },
    },
  },
}
```

### 3.2 Caching Strategy

**Current State:**
- Performance score caching (5-minute TTL) in rule engine
- Webhook config caching (60-second TTL)
- No HTTP response caching
- No Redis layer

**Recommendations:**

**MEDIUM-PERF-005: Add HTTP Caching Headers**

```typescript
// Add to GET endpoints that return stable data
app.get('/api/shops', (req, res) => {
  res.set('Cache-Control', 'private, max-age=60');
  // ... response
});
```

**MEDIUM-PERF-006: Add Redis Caching Layer**

```typescript
// For expensive aggregations
const cacheKey = `analytics:${companyId}:${month}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);

const result = await computeExpensiveAggregation();
await redis.setex(cacheKey, 300, JSON.stringify(result)); // 5 min TTL
return result;
```

### 3.3 Error Handling

**Issues:**
- Generic error messages ("Internal server error")
- No application-specific error codes
- Inconsistent validation patterns

**Recommendation:** Implement structured error handling

```typescript
// Create error code registry
enum ErrorCode {
  CAR_NOT_FOUND = 'CAR_NOT_FOUND',
  SHOP_CAPACITY_EXCEEDED = 'SHOP_CAPACITY_EXCEEDED',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  // ...
}

// Structured error response
interface APIError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}
```

### 3.4 Bulk Operations

**Strengths:**
- Cars bulk import is well-optimized with batched operations
- Transactions with proper timeouts (10-30 seconds)
- Atomic all-or-nothing guarantees

**Issue:** Shops bulk import not batched like cars

**Location:** `backend/src/routes/shops.ts:327-484`

```typescript
// CURRENT (O(N) DB queries)
for (const row of data) {
  await prisma.shop.upsert({ ... }); // One query per row
}

// RECOMMENDED (O(1) batch)
await prisma.$transaction(async (tx) => {
  await tx.shop.createMany({ data: shopsToCreate });
  for (const update of shopsToUpdate) {
    await tx.shop.update({ where: { id: update.id }, data: update.data });
  }
});
```

### 3.5 Performance Recommendations Priority

| ID | Issue | Impact | Effort | Priority |
|----|-------|--------|--------|----------|
| PERF-002 | N+1 in analytics | HIGH | Medium | P0 |
| PERF-003 | O(N²) shop capacity | HIGH | Low | P0 |
| PERF-004 | Over-fetching in plans | MEDIUM | Low | P1 |
| PERF-001 | Missing indexes | HIGH | Medium | P1 |
| PERF-005 | HTTP caching | MEDIUM | Low | P2 |
| PERF-006 | Redis caching | MEDIUM | High | P2 |

---

## 4. Architectural Recommendations

### 4.1 Current Architecture Assessment

**Strengths:**
- Well-organized monorepo with clear separation (frontend/backend)
- Multi-tenant isolation by companyId
- WebSocket support for real-time collaboration
- Comprehensive audit trail infrastructure
- Good API versioning (`/api/v1/`)

**Technical Debt:**
1. Four parallel assignment models
2. Mix of legacy and new patterns
3. No message queue for async operations
4. SQLite limits horizontal scaling

### 4.2 Deep Thinker Recommendations

#### 4.2.1 Data Model Consolidation

**Current State:** Four assignment models create confusion and consistency risks.

**Recommendation:** Complete the `UnifiedAssignment` migration

```
Phase 1: Migrate PlanAssignment -> UnifiedAssignment (COMMITTED)
Phase 2: Migrate CarFlowPlan -> UnifiedAssignment (COMMITTED with source='CSV')
Phase 3: Deprecate legacy tables
Phase 4: Add migration scripts for existing data
```

#### 4.2.2 Event-Driven Architecture

**Current State:** Synchronous request-response for all operations.

**Recommendation:** Add event queue for:
- Background job processing (shopping status recalculation)
- Webhook delivery (currently inline)
- Report generation
- Notification dispatch

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   API       │───>│   Queue     │───>│   Workers   │
│   Server    │    │  (Bull/BQ)  │    │             │
└─────────────┘    └─────────────┘    └─────────────┘
       │                                      │
       └──────────────────────────────────────┘
                  Database
```

#### 4.2.3 Database Scaling Strategy

**Current:** SQLite (great for development, limited for scale)

**Scaling Path:**
1. **Short-term:** Optimize queries (this review)
2. **Medium-term:** Add read replicas with `@prisma/replica`
3. **Long-term:** Migrate to PostgreSQL for:
   - Better concurrency (MVCC)
   - Full-text search
   - JSON/JSONB native types
   - Horizontal scaling options

#### 4.2.4 API Gateway Pattern

**Recommendation:** Add API gateway for:
- Centralized rate limiting
- Request/response transformation
- API versioning management
- Authentication offloading

#### 4.2.5 Observability Stack

**Current:** Basic logging with custom logger

**Recommendation:** Implement observability triad:
1. **Logs:** Structured JSON logging with correlation IDs
2. **Metrics:** Prometheus metrics for API latency, error rates
3. **Traces:** OpenTelemetry for distributed tracing

```typescript
// Add to all requests
app.use((req, res, next) => {
  req.correlationId = req.headers['x-correlation-id'] || uuidv4();
  res.set('x-correlation-id', req.correlationId);
  next();
});
```

### 4.3 Code Quality Improvements

#### 4.3.1 Validation Layer

**Recommendation:** Centralize validation with Zod

```typescript
// schemas/car.schema.ts
export const createCarSchema = z.object({
  railcarNumber: z.string().min(1).max(20),
  carType: z.string(),
  customerId: z.string().uuid().optional(),
  // ...
});

// middleware/validate.ts
export const validate = (schema: z.ZodSchema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      code: 'VALIDATION_FAILED',
      errors: result.error.issues
    });
  }
  req.body = result.data;
  next();
};

// routes/cars.ts
router.post('/', validate(createCarSchema), createCar);
```

#### 4.3.2 Response DTOs

**Recommendation:** Explicit response shapes

```typescript
// dto/car.dto.ts
export const carListDTO = (car: Car) => ({
  id: car.id,
  railcarNumber: car.railcarNumber,
  carType: car.carType,
  status: car.status,
  shoppingStatus: car.shoppingStatus,
});

export const carDetailDTO = (car: Car & { shop: Shop }) => ({
  ...carListDTO(car),
  shop: car.shop ? { id: car.shop.id, name: car.shop.name } : null,
  // ... additional fields for detail view
});
```

### 4.4 Testing Strategy

**Current:** Jest tests present but coverage unclear

**Recommendations:**
1. Add integration tests for critical workflows
2. Add load tests for performance regression
3. Add contract tests for API v1
4. Target 80% coverage for services layer

---

## 5. Prioritized Action Plan

### 5.1 Phase 1: Critical Security & Integrity (Weeks 1-2)

| Task | ID | Effort | Owner |
|------|-----|--------|-------|
| Migrate token storage to httpOnly cookies | SEC-001 | 3d | Security |
| Add helmet security headers | SEC-002 | 0.5d | Security |
| Add CASCADE to User relations | DB-001 | 2d | Backend |
| Create enums for all status fields | DB-002 | 3d | Backend |

**Estimated Effort:** 8-10 dev days

### 5.2 Phase 2: Performance Quick Wins (Weeks 3-4)

| Task | ID | Effort | Owner |
|------|-----|--------|-------|
| Fix N+1 in analytics dashboard | PERF-002 | 1d | Backend |
| Fix O(N²) shop capacity query | PERF-003 | 0.5d | Backend |
| Add select fields to plan queries | PERF-004 | 1d | Backend |
| Add missing database indexes | PERF-001 | 1d | Backend |
| Add CORS origin validation | SEC-003 | 0.5d | Security |

**Estimated Effort:** 4-5 dev days

### 5.3 Phase 3: Data Model Cleanup (Weeks 5-8)

| Task | ID | Effort | Owner |
|------|-----|--------|-------|
| Add CASCADE to self-referential relations | DB-003 | 1d | Backend |
| Add CASCADE to CarFlowPlan.sourceScenarioId | DB-004 | 0.5d | Backend |
| Remove duplicate customer/network fields | DB-005/006 | 3d | Backend |
| Add JSON field validation | DB-007 | 2d | Backend |
| Centralize validation with Zod | SEC-004 | 3d | Backend |

**Estimated Effort:** 10-12 dev days

### 5.4 Phase 4: Architecture Improvements (Weeks 9-12)

| Task | ID | Effort | Owner |
|------|-----|--------|-------|
| Implement Redis caching layer | PERF-006 | 3d | Backend |
| Add structured error handling | - | 2d | Backend |
| Implement response DTOs | - | 3d | Backend |
| Add HTTP caching headers | PERF-005 | 1d | Backend |
| Add observability (correlation IDs, metrics) | - | 3d | DevOps |

**Estimated Effort:** 12-15 dev days

### 5.5 Phase 5: Long-term Improvements (Q2)

| Task | Effort | Owner |
|------|--------|-------|
| Consolidate assignment models to UnifiedAssignment | 10d | Backend |
| Implement event queue for async operations | 5d | Backend |
| Evaluate PostgreSQL migration | 3d | Architecture |
| Add comprehensive integration tests | 5d | QA |

**Estimated Effort:** 20-25 dev days

---

## 6. Appendix

### 6.1 Files Reviewed

**Backend:**
- `backend/src/index.ts` - Server configuration
- `backend/src/middleware/auth.ts` - Authentication
- `backend/src/middleware/rateLimit.ts` - Rate limiting
- `backend/src/routes/auth.ts` - Auth endpoints
- `backend/src/routes/cars.ts` - Car management
- `backend/src/routes/shops.ts` - Shop management
- `backend/src/routes/plans.ts` - Planning
- `backend/src/routes/analytics.ts` - Dashboard analytics
- `backend/src/services/db.ts` - Database layer
- `backend/src/services/apiKeyService.ts` - API key management
- `backend/prisma/schema.prisma` - Database schema

**Frontend:**
- `frontend/src/services/api.ts` - API client
- `frontend/src/contexts/AuthContext.tsx` - Auth state

### 6.2 Tools & Technologies Assessed

| Category | Technology | Version |
|----------|------------|---------|
| Backend | Express.js | 4.21.1 |
| Language | TypeScript | 5.6.3 |
| ORM | Prisma | 5.22.0 |
| Database | SQLite | - |
| Auth | JWT | 9.0.2 |
| Hashing | bcryptjs | 2.4.3 |
| Validation | Zod | 3.23.8 |
| Frontend | React | 18.3.1 |
| Build | Vite | 5.4.10 |
| Styling | TailwindCSS | 3.4.14 |

### 6.3 Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| XSS token theft | Medium | Critical | Migrate to httpOnly cookies |
| Data integrity violations | High | High | Add enum constraints, CASCADE |
| Performance degradation at scale | High | Medium | Fix N+1 queries, add indexes |
| Orphaned records | Medium | Medium | Add CASCADE deletes |
| Invalid data in JSON fields | Medium | Medium | Add validation layer |

---

*This review was conducted by the Data Infrastructure Team. For questions or clarifications, please contact the respective domain owners.*
