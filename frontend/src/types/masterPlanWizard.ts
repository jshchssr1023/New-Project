/**
 * Master Plan Wizard Types
 *
 * Types for the Gold Standard 3-Step Master Plan Generation Wizard
 */

// =============================================================================
// WIZARD STEP TYPES
// =============================================================================

export type WizardStep = 1 | 2 | 3;

export type WizardStepStatus = 'pending' | 'in_progress' | 'completed' | 'error';

export interface WizardStepConfig {
  step: WizardStep;
  title: string;
  description: string;
  status: WizardStepStatus;
  isLocked: boolean;
}

export interface WizardState {
  currentStep: WizardStep;
  steps: WizardStepConfig[];
  isDemandLocked: boolean;
  isCapacityLocked: boolean;
  isPlanLocked: boolean;
  masterPlanVersionId: string | null;
  versionNumber: string | null;
}

// =============================================================================
// WEEKLY CAPACITY TYPES
// =============================================================================

export interface WeeklyCapacity {
  id: string;
  shopId: string;
  weekStartDate: string;
  weekKey: string;
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
  lockedAt: string | null;
  lockedById: string | null;
  notes: string;
  shop?: {
    id: string;
    name: string;
    code: string;
    network: string;
    isAitxInternal: boolean;
  };
  capacityAudits?: CapacityAudit[];
}

export interface CapacityAudit {
  id: string;
  weeklyCapacityId: string;
  fieldName: string;
  previousValue: number;
  newValue: number;
  justification: string;
  changeCategory: CapacityChangeCategory;
  changedById: string;
  changedByEmail: string;
  requiresApproval: boolean;
  approvedById: string | null;
  approvedAt: string | null;
  approvalStatus: ApprovalStatus;
  createdAt: string;
}

export type CapacityChangeCategory =
  | 'demand_increase'
  | 'demand_decrease'
  | 'resource_constraint'
  | 'maintenance'
  | 'seasonal'
  | 'emergency'
  | 'other';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'auto_approved';

export interface CapacityChangeInput {
  weeklyCapacityId: string;
  fieldName: string;
  newValue: number;
  justification: string;
  changeCategory: CapacityChangeCategory;
}

// =============================================================================
// MASTER PLAN VERSION TYPES
// =============================================================================

export interface MasterPlanVersion {
  id: string;
  masterPlanId: string;
  versionNumber: string;
  versionLabel: string;
  status: MasterPlanVersionStatus;
  isLocked: boolean;
  lockedAt: string | null;
  lockedById: string | null;
  lockedByEmail: string;
  lockReason: string;
  publishedAt: string | null;
  publishedById: string | null;
  publishedByEmail: string;
  planSnapshot: string;
  commitmentCount: number;
  totalCars: number;
  pushedToScheduling: boolean;
  pushedToSchedulingAt: string | null;
  pushResponse: string;
  createdAt: string;
  updatedAt: string;
}

export type MasterPlanVersionStatus =
  | 'draft'
  | 'pending_review'
  | 'locked'
  | 'published'
  | 'superseded';

// =============================================================================
// ALLOCATION TYPES
// =============================================================================

export interface AllocationCell {
  shopId: string;
  weekKey: string;
  workType: WorkType;
  planned: number;
  capacity: number;
  used: number;
  available: number;
  utilizationPercent: number;
  isOverCapacity: boolean;
  isLocked: boolean;
}

export interface AllocationRow {
  shop: {
    id: string;
    name: string;
    code: string;
    network: string;
    isAitxInternal: boolean;
    tankQualified: boolean;
  };
  weeks: Record<string, AllocationCell>;
  totalPlanned: number;
  totalCapacity: number;
  averageUtilization: number;
}

export interface AllocationMatrix {
  shops: AllocationRow[];
  weekKeys: string[];
  totals: {
    byWeek: Record<string, { planned: number; capacity: number; utilization: number }>;
    overall: { planned: number; capacity: number; utilization: number };
  };
}

export type WorkType = 'qualification' | 'assignment' | 'return' | 'repair';

export interface BulkAllocationInput {
  carIds: string[];
  shopId: string;
  weekKey: string;
  workType: WorkType;
  justification: string;
  overrideReason: AllocationOverrideReason;
}

export type AllocationOverrideReason =
  | 'rebalancing'
  | 'customer_request'
  | 'emergency'
  | 'capacity_issue'
  | 'other';

export interface AllocationValidationResult {
  valid: boolean;
  available: number;
  message?: string;
}

// =============================================================================
// INTEGRATION LOG TYPES
// =============================================================================

export interface IntegrationLog {
  id: string;
  integrationType: 'webhook' | 'api_call' | 'data_sync';
  endpoint: string;
  method: string;
  requestPayload: string;
  responseStatus: number;
  responseBody: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number;
  status: IntegrationStatus;
  retryCount: number;
  maxRetries: number;
  errorMessage: string;
  triggerAction: string;
  entityType: string;
  entityId: string;
  triggeredById: string | null;
  triggeredByEmail: string;
  createdAt: string;
}

export type IntegrationStatus = 'pending' | 'success' | 'failed' | 'timeout' | 'retrying';

export interface IntegrationHealthSummary {
  total: number;
  successful: number;
  failed: number;
  successRate: number;
  avgDurationMs: number;
}

// =============================================================================
// IMPORT SESSION TYPES
// =============================================================================

export interface ImportSession {
  id: string;
  sessionType: 'cars' | 'shops' | 'capacity' | 'allocations';
  fileName: string;
  fileSize: number;
  status: ImportSessionStatus;
  currentStep: 1 | 2 | 3;
  totalRows: number;
  validRows: number;
  errorRows: number;
  warningRows: number;
  validationErrors: ValidationError[];
  validationWarnings: ValidationError[];
  detectedHeaders: string[];
  fieldMappings: Record<string, string>;
  unmappedFields: string[];
  previewData: Record<string, unknown>[];
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  errorReportUrl: string;
  uploadedAt: string;
  validatedAt: string | null;
  mappedAt: string | null;
  confirmedAt: string | null;
  completedAt: string | null;
}

export type ImportSessionStatus =
  | 'uploaded'
  | 'validating'
  | 'preview'
  | 'mapping'
  | 'confirmed'
  | 'importing'
  | 'completed'
  | 'failed';

export interface ValidationError {
  row: number;
  field: string;
  value: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ImportResult {
  success: boolean;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  errors: ValidationError[];
}

// =============================================================================
// SHOP HISTORY TYPES
// =============================================================================

export interface ShopHistory {
  id: string;
  shopId: string;
  name: string;
  code: string;
  version: number;
  validFrom: string;
  validTo: string | null;
  status: ShopHistoryStatus;
  changeReason: string;
  previousShopId: string | null;
  successorShopId: string | null;
}

export type ShopHistoryStatus = 'active' | 'inactive' | 'renamed' | 'merged';

// =============================================================================
// SCHEDULING OUTPUT TYPES
// =============================================================================

export interface SchedulingOutputItem {
  carId: string;
  railcarNumber: string;
  shopId: string;
  shopName: string;
  shopCode: string;
  weekKey: string;
  workType: WorkType;
  priority: number;
  customer: string;
  commodity: string;
  isTankCar: boolean;
  estimatedDays: number;
  estimatedCost: number;
  flowInDate: string | null;
  targetCompletionDate: string | null;
  status: SchedulingItemStatus;
}

export type SchedulingItemStatus =
  | 'planned'
  | 'confirmed'
  | 'in_transit'
  | 'arrived'
  | 'in_progress'
  | 'completed';

export interface SchedulingOutput {
  versionId: string;
  versionNumber: string;
  generatedAt: string;
  publishedAt: string | null;
  items: SchedulingOutputItem[];
  filters: SchedulingFilter;
  summary: {
    totalCars: number;
    byWorkType: Record<WorkType, number>;
    byShop: Record<string, number>;
    byWeek: Record<string, number>;
  };
}

export interface SchedulingFilter {
  workTypes: WorkType[];
  shops: string[];
  weeks: string[];
  customers: string[];
  statusFilter: SchedulingFilterPreset;
}

export type SchedulingFilterPreset =
  | 'all'
  | 'flow_in_assignments'
  | 'planned_returns'
  | 'lease_qualifications';

// =============================================================================
// AUDIT LOG TYPES
// =============================================================================

export interface MasterPlanAuditEntry {
  id: string;
  action: MasterPlanAuditAction;
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

export type MasterPlanAuditAction =
  | 'plan_created'
  | 'plan_locked'
  | 'plan_unlocked'
  | 'plan_published'
  | 'allocation_override'
  | 'capacity_adjusted'
  | 'import_completed'
  | 'export_generated';

export interface AuditStatistics {
  last30Days: {
    planLocks: number;
    allocationOverrides: number;
    capacityChanges: number;
    imports: number;
    exports: number;
  };
}

// =============================================================================
// DEMAND REGISTER TYPES (Step 1)
// =============================================================================

export interface DemandItem {
  carId: string;
  railcarNumber: string;
  customer: string;
  commodity: string;
  isTankCar: boolean;
  workType: WorkType;
  dueDate: string | null;
  daysUntilDue: number;
  isOverdue: boolean;
  priority: 'critical' | 'high' | 'medium' | 'low';
  planningState: PlanningState;
  assignedShopId: string | null;
  assignedShopName: string | null;
  scheduledWeek: string | null;
}

export type PlanningState =
  | 'not_planned'
  | 'tentatively_scheduled'
  | 'awaiting_confirmation'
  | 'planned'
  | 'scheduled'
  | 'in_progress'
  | 'completed';

export interface DemandSummary {
  total: number;
  byWorkType: Record<WorkType, number>;
  byPriority: Record<string, number>;
  byPlanningState: Record<PlanningState, number>;
  overdue: number;
  criticalNext30Days: number;
}

// =============================================================================
// CONFIRMATION MODAL TYPES
// =============================================================================

export interface ConfirmLockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (lockReason: string) => void;
  versionNumber: string;
  commitmentCount: number;
  totalCars: number;
  isLoading: boolean;
}

export interface CapacityEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (input: CapacityChangeInput) => void;
  currentValue: number;
  fieldName: string;
  shopName: string;
  weekKey: string;
  isLoading: boolean;
}

export interface BulkAllocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (input: BulkAllocationInput) => void;
  selectedCars: { id: string; railcarNumber: string }[];
  availableShops: { id: string; name: string; code: string }[];
  weekKeys: string[];
  isLoading: boolean;
}
