// Re-export all APIs for backwards compatibility
// This allows imports from '@/services/api' to continue working

// Default export - the axios client instance
export { default } from './client';

// Client utilities
export {
  cancelRequest,
  cancelAllRequests,
  createAbortController,
  getRequestKey,
  delay,
  getRetryDelay,
  isRetryableError,
  RETRY_CONFIG,
} from './client';

// Domain APIs
export { authApi } from './auth';
export { carsApi } from './cars';
export { shopsApi, shopPerformanceApi } from './shops';
export { plansApi } from './plans';
export { scenariosApi } from './scenarios';
export { analyticsApi } from './analytics';
export { usersApi, permissionsApi, auditApi } from './users';
export { reportsApi } from './reports';
export { masterPlanApi, masterPlanWizardApi } from './masterPlans';
export { sopApi, leaseQualificationApi, shopRulesApi } from './sop';

// Proposal & Scheduling Queue API
export { default as proposalsApi } from './proposals';

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
  // Plan Proposal types
  ProposalStatus,
  PlanProposal,
  CreateProposalInput,
  SendProposalInput,
  RecordApprovalInput,
  RecordRejectionInput,
  RequestRevisionInput,
  ProposalStats,
  ScheduleProposalResult,
} from './types';
