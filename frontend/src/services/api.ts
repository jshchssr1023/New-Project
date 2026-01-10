/**
 * API Service - Re-exports from modular API structure
 *
 * This file maintains backwards compatibility with existing imports.
 * The actual API implementations are now split into domain-specific modules:
 *
 * - api/client.ts - Base axios instance, interceptors, retry logic, request cancellation
 * - api/auth.ts - Authentication (login, logout, getCurrentUser, refreshToken)
 * - api/cars.ts - Car management (CRUD, bulk operations, import/export)
 * - api/shops.ts - Shop management (CRUD, capacity, performance)
 * - api/plans.ts - Planning (CRUD, assignments, grid view, reports)
 * - api/analytics.ts - Dashboard and analytics
 * - api/users.ts - User management (admin CRUD, permissions, audit)
 * - api/reports.ts - Custom reports (templates, scheduled reports)
 * - api/sop.ts - S&OP (allocations, lease qualification, shop rules)
 * - api/servicePlans.ts - Service Plan Builder (customer proposals)
 * - api/types.ts - Shared API types
 */

// Re-export everything from the modular structure
export {
  // Client utilities
  default,
  cancelRequest,
  cancelAllRequests,
  createAbortController,
  getRequestKey,
  delay,
  getRetryDelay,
  isRetryableError,
  RETRY_CONFIG,
  // Domain APIs
  authApi,
  carsApi,
  shopsApi,
  shopPerformanceApi,
  plansApi,
  analyticsApi,
  usersApi,
  permissionsApi,
  auditApi,
  reportsApi,
  sopApi,
  leaseQualificationApi,
  shopRulesApi,
} from './api/index';

// Re-export all types
export type {
  CarImportStatus,
  CarImportResult,
  HeaderAnalysisResult,
  ReportColumn,
  FilterCriteria,
  ReportTemplate,
  ScheduledReport,
  ShopPerformanceMetrics,
  ShopScorecard,
  NetworkScorecard,
  AuditLogEntry,
  LeaseRelease,
  QualificationScenario,
  ScenarioMetrics,
  ScenarioComparison,
  AvailableCar,
  AvailableShop,
  AvailableCustomer,
  AvailableMonth,
  DocumentSelectionCriteria,
  GeneratedDocument,
  ShopCapacitySnapshot,
  SOPAllocationData,
  SOPAllocationResponse,
  SOPLoadedAllocations,
  WeeklyCapacityData,
  MasterPlanVersionData,
  IntegrationLogData,
  ImportSessionData,
  ShopHistoryEntry,
  MasterPlanAuditEntry,
  ShopRuleCondition,
  ShopRuleAction,
  ShopRuleSchema,
  ShopRule,
  RuleTestResult,
} from './api/index';
