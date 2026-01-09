// Import result types for car bulk import
export type CarImportStatus = 'success' | 'partial_success' | 'failed' | 'mapping_required';

export interface CarImportResult {
  status: CarImportStatus;
  newCarsAdded: number;
  existingCarsUpdated: number;
  failedRows: number;
  errors: { row: number; reason: string }[];
  warnings: { row: number; message: string }[];
  // Mapping fields (only present when status is 'mapping_required')
  detected_headers?: string[];
  missing_required_fields?: string[];
  unmapped_headers?: string[];
  suggested_mappings?: Record<string, string[]>;
}

export interface HeaderAnalysisResult {
  status: 'success' | 'mapping_required';
  mappings: Record<string, string>;
  unmappedHeaders: string[];
  missingRequiredFields: string[];
  detectedHeaders: string[];
  suggestions: Record<string, string[]>;
}

// Custom Reports API types
export interface ReportColumn {
  key: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  sortable: boolean;
  filterable: boolean;
  defaultVisible: boolean;
}

export interface FilterCriteria {
  field: string;
  operator: 'equals' | 'notEquals' | 'contains' | 'startsWith' | 'endsWith' | 'greaterThan' | 'lessThan' | 'greaterThanOrEqual' | 'lessThanOrEqual' | 'between' | 'in' | 'isNull' | 'isNotNull';
  value: unknown;
  value2?: unknown;
}

export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  entityType: string;
  columns: string[];
  filters: FilterCriteria[];
  sortConfig: { field: string; direction: 'asc' | 'desc' } | null;
  groupBy: string;
  outputFormats: string[];
  isPublic: boolean;
  createdAt: string;
}

export interface ScheduledReport {
  id: string;
  name: string;
  templateId: string;
  schedule: string;
  timezone: string;
  outputFormat: 'pdf' | 'csv' | 'xlsx';
  recipients: string[];
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastRunStatus: string;
  template: {
    id: string;
    name: string;
    entityType: string;
  } | null;
}

// Shop Performance API types
export interface ShopPerformanceMetrics {
  averageTurnTime: number;
  turnTimeByRepairType: Record<string, number>;
  onTimeRate: number;
  averageDwellTime: number;
  reworkRate: number;
  costVariance: number;
  performanceScore: number;
}

export interface ShopScorecard {
  shop: {
    id: string;
    name: string;
    code: string;
    network: string;
    region: string;
  };
  metrics: ShopPerformanceMetrics;
  comparison: {
    turnTimeVsNetwork: number;
    onTimeVsNetwork: number;
    dwellTimeVsNetwork: number;
    reworkVsNetwork: number;
    costVarianceVsNetwork: number;
  };
  alerts: { type: 'warning' | 'critical'; message: string }[];
  periodType: string;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface NetworkScorecard {
  shops: ShopScorecard[];
  networkAverages: {
    avgTurnTime: number;
    avgDwellTime: number;
    avgOnTimeRate: number;
    avgReworkRate: number;
    avgCostVariance: number;
  };
  summary: {
    totalShops: number;
    averagePerformanceScore: number;
    shopsWithWarnings: number;
    shopsWithCriticalAlerts: number;
  };
}

// Audit Log API types
export interface AuditLogEntry {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName: string;
  changes: Record<string, { old?: unknown; new?: unknown }>;
  metadata: Record<string, unknown>;
  ipAddress: string;
  createdAt: string;
}

// Lease Qualification Engine types
export interface LeaseRelease {
  carId: string;
  railcarNumber: string;
  customerId: string;
  customerName: string;
  leaseEndDate: string;
  plannedReleaseDate: string;
  nextCustomerId?: string;
  commodity: string;
  carType: string;
  isTankCar: boolean;
  homeRegion: string;
  priority: number;
}

export interface QualificationScenario {
  id: string;
  name: string;
  description: string;
  scenarioType: 'base' | 'late_release' | 'capacity_shift' | 'custom';
  status: string;
  planningHorizonMonths: number;
  lateReleasePercent: number;
  capacityAdjustment: Record<string, number>;
  metricsJson: ScenarioMetrics | null;
  summaryJson: { releaseCompliance: number; qualAttainment: number; backlog: number; riskScore: number } | null;
  isApproved: boolean;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
}

export interface ScenarioMetrics {
  scenarioId: string;
  scenarioName: string;
  scenarioType: string;
  totalReleases: number;
  onTimeReleases: number;
  lateReleases: number;
  releaseCompliancePercent: number;
  plannedQualifications: number;
  completedQualifications: number;
  qualPlanAttainmentPercent: number;
  currentBacklog: number;
  projectedBacklog: number;
  backlogByMonth: Record<string, number>;
  averageWaitDays: number;
  longestWaitDays: number;
  overallUtilizationPercent: number;
  utilizationByShop: Record<string, number>;
  riskScore: number;
  riskFactors: string[];
  totalEstimatedCost: number;
  costByMonth: Record<string, number>;
}

export interface ScenarioComparison {
  scenarios: ScenarioMetrics[];
  comparisonTable: string;
  recommendations: string[];
  bestScenarioId: string;
  bestScenarioReason: string;
}

export interface AvailableCar {
  id: string;
  railcarNumber: string;
  carType: string;
  customer: string;
  shopAssigned: string;
  monthKey: string;
  workTypes: string[];
  priority: number;
}

export interface AvailableShop {
  id: string;
  name: string;
  code: string;
  region: string;
  assignmentCount: number;
  tankQualified: boolean;
}

export interface AvailableCustomer {
  id: string;
  name: string;
  code: string;
  inboundCount: number;
  outboundCount: number;
}

export interface AvailableMonth {
  monthKey: string;
  monthLabel: string;
  assignmentCount: number;
}

export interface DocumentSelectionCriteria {
  scenarioId: string;
  carIds?: string[];
  shopIds?: string[];
  customerIds?: string[];
  startMonth?: string;
  endMonth?: string;
  priorities?: number[];
  workTypes?: string[];
  bundledOnly?: boolean;
}

export interface GeneratedDocument {
  title: string;
  generatedAt: string;
  scenarioId: string;
  scenarioName: string;
  markdownContent: string;
  jsonContent: Record<string, unknown>;
}

export interface ShopCapacitySnapshot {
  shopId: string;
  shopName: string;
  shopCode: string;
  region: string;
  tankQualified: boolean;
  monthlyCapacity: Record<string, {
    qualification: number;
    assignment: number;
    repair: number;
    used: number;
    available: number;
    utilization: number;
  }>;
}

// S&OP API types
export interface SOPAllocationData {
  allocations: Record<string, Record<string, number>>; // monthKey -> shopId -> carCount
  shopCapacities?: Record<string, { monthlyCapacity?: number; isAITX?: boolean }>;
}

export interface SOPAllocationResponse {
  success: boolean;
  message: string;
  scenarioId?: string;
  created?: number;
  errors?: { monthKey: string; shopId: string; error: string }[];
}

export interface SOPLoadedAllocations {
  allocations: Record<string, Record<string, number>>; // shopId -> monthKey -> carCount
  lastUpdated: number | null;
}

// Master Plan Wizard types
export interface WeeklyCapacityData {
  id: string;
  shopId: string;
  weekKey: string;
  weekStartDate: string;
  qualCapacity: number;
  assignCapacity: number;
  releaseCapacity: number;
  repairCapacity: number;
  totalCapacity: number;
  qualUsed: number;
  assignUsed: number;
  releaseUsed: number;
  repairUsed: number;
  totalUsed: number;
  isLocked: boolean;
  shop?: {
    id: string;
    name: string;
    code: string;
    network: string;
    isAitxInternal: boolean;
  };
  capacityAudits?: Array<{
    id: string;
    fieldName: string;
    previousValue: number;
    newValue: number;
    justification: string;
    changeCategory: string;
    changedByEmail: string;
    createdAt: string;
  }>;
}

export interface MasterPlanVersionData {
  id: string;
  masterPlanId: string;
  versionNumber: string;
  versionLabel: string;
  status: string;
  isLocked: boolean;
  lockedAt: string | null;
  lockedByEmail: string;
  lockReason: string;
  publishedAt: string | null;
  publishedByEmail: string;
  commitmentCount: number;
  totalCars: number;
  pushedToScheduling: boolean;
  createdAt: string;
}

export interface IntegrationLogData {
  id: string;
  integrationType: string;
  endpoint: string;
  method: string;
  responseStatus: number;
  startedAt: string;
  completedAt: string | null;
  durationMs: number;
  status: string;
  errorMessage: string;
  triggerAction: string;
  entityType: string;
  entityId: string;
  triggeredByEmail: string;
  createdAt: string;
}

export interface ImportSessionData {
  id: string;
  sessionType: string;
  fileName: string;
  status: string;
  currentStep: number;
  totalRows: number;
  validRows: number;
  errorRows: number;
  warningRows: number;
  validationErrors: Array<{ row: number; field: string; value: string; message: string; severity: string }>;
  validationWarnings: Array<{ row: number; field: string; value: string; message: string; severity: string }>;
  detectedHeaders: string[];
  fieldMappings: Record<string, string>;
  unmappedFields: string[];
  previewData: Record<string, unknown>[];
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  errorReportUrl: string;
}

export interface ShopHistoryEntry {
  id: string;
  shopId: string;
  name: string;
  code: string;
  version: number;
  validFrom: string;
  validTo: string | null;
  status: string;
  changeReason: string;
}

export interface MasterPlanAuditEntry {
  id: string;
  action: string;
  category: 'plan' | 'allocation' | 'capacity' | 'export' | 'import' | 'other';
  userId: string;
  userEmail: string;
  timestamp: string;
  details: Record<string, unknown>;
  entityType: string;
  entityId: string;
  entityName?: string;
  source: 'audit_log' | 'capacity_audit' | 'allocation_override';
}

// Shop Rules types
export interface ShopRuleCondition {
  [key: string]: unknown;
}

export interface ShopRuleAction {
  [key: string]: unknown;
}

export interface ShopRuleSchema {
  label: string;
  description: string;
  conditions: { key: string; type: string; label: string; default: unknown }[];
  actions: { key: string; type: string; label: string; default: unknown }[];
}

export interface ShopRule {
  id: string;
  name: string;
  description: string;
  ruleType: string;
  priority: number;
  isActive: boolean;
  conditions: ShopRuleCondition;
  actions: ShopRuleAction;
  schema?: ShopRuleSchema;
}

export interface RuleTestResult {
  carId: string;
  carNumber: string;
  suggestedShopId: string | null;
  suggestedShopName: string | null;
  allScores: {
    shopId: string;
    shopName: string;
    shopCode: string;
    score: number;
    reasons: string[];
    estimatedCost: number;
    estimatedDays: number;
    capacityAvailable: number;
    isRecommended: boolean;
  }[];
  ruleNotes: string;
}
