/**
 * Local type definitions for Prisma models
 * Used when Prisma client generation is unavailable
 */

// =============================================================================
// ENUMS - Car and Plan Status Types
// =============================================================================
// Note: These enum values must match the Prisma schema exactly.
// SQLite stores enum values as their literal string names.
// =============================================================================

export enum CarStatus {
  ToBeRouted = 'ToBeRouted',
  Arrived = 'Arrived',
  Complete = 'Complete',
  Release = 'Release',
  UpMarketed = 'UpMarketed',
  Enroute = 'Enroute',
  Reassigned = 'Reassigned',
  Released = 'Released',
  Scheduled = 'Scheduled',
  Other = 'Other',
}

export enum ShoppingStatus {
  Urgent = 'Urgent',
  MustShop = 'MustShop',
  Upcoming = 'Upcoming',
  Compliant = 'Compliant',
  InShop = 'InShop',
  Planned = 'Planned',
  Unknown = 'Unknown',
}

export enum PlanStatus {
  draft = 'draft',
  active = 'active',
  completed = 'completed',
  archived = 'archived',
}

export enum ScenarioStatus {
  draft = 'draft',
  confirmed = 'confirmed',
  archived = 'archived',
}

export enum CarFlowPlanStatus {
  Planned = 'Planned',
  InProgress = 'InProgress',
  Complete = 'Complete',
  Cancelled = 'Cancelled',
}

export enum LeaseContractStatus {
  active = 'active',
  pending_release = 'pending_release',
  released = 'released',
  renewed = 'renewed',
  terminated = 'terminated',
}

// =============================================================================
// ENUMS - Master Plan Status Types
// =============================================================================

export enum MasterPlanStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  ACTIVE = 'ACTIVE',
  SUPERSEDED = 'SUPERSEDED',
  ARCHIVED = 'ARCHIVED',
}

export enum CommitmentStatus {
  DRAFT = 'DRAFT',
  PLANNED = 'PLANNED',
  SCHEDULED = 'SCHEDULED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETE = 'COMPLETE',
  CANCELLED = 'CANCELLED',
  DEFERRED = 'DEFERRED',
  RESCHEDULED = 'RESCHEDULED',
}

export enum AssignmentStatus {
  DRAFT = 'DRAFT',
  SCENARIO = 'SCENARIO',
  PENDING_REVIEW = 'PENDING_REVIEW',
  COMMITTED = 'COMMITTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  SUPERSEDED = 'SUPERSEDED',
}

// =============================================================================
// ENUMS - Plan Proposal Status Types
// =============================================================================

export enum ProposalStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  CUSTOMER_APPROVED = 'CUSTOMER_APPROVED',
  CUSTOMER_REJECTED = 'CUSTOMER_REJECTED',
  REVISION_REQUESTED = 'REVISION_REQUESTED',
  SCHEDULED = 'SCHEDULED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

// =============================================================================
// PLAN PROPOSAL - Customer Approval Workflow
// =============================================================================

export interface PlanProposal {
  id: string;
  proposalNumber: string;
  name: string;
  description: string;

  // References
  customerId: string;
  sourceScenarioId: string;

  // Status
  status: ProposalStatus;

  // Versioning
  version: number;
  parentProposalId: string | null;

  // Communication tracking
  sentAt: Date | null;
  sentById: string | null;
  sentToEmail: string;
  sentToName: string;

  // Customer response
  respondedAt: Date | null;
  approvedBy: string;
  approverEmail: string;
  approverTitle: string;
  responseNotes: string;
  rejectionReason: string;

  // Scheduling
  scheduledAt: Date | null;
  scheduledById: string | null;

  // Metrics
  carCount: number;
  totalEstimatedCost: number;
  planningHorizonStart: Date | null;
  planningHorizonEnd: Date | null;
  shopCount: number;

  // Content
  proposalSnapshot: string;
  proposalPdfUrl: string;
  proposalPdfGeneratedAt: Date | null;

  // Expiration
  expiresAt: Date | null;

  // Audit
  createdById: string;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlanProposalWithRelations extends PlanProposal {
  customer?: { id: string; name: string; code: string; contactEmail: string; contactName: string };
  sourceScenario?: { id: string; name: string; status: string };
  parentProposal?: PlanProposal | null;
  childProposals?: PlanProposal[];
}

// =============================================================================
// MASTER PLAN - Versioned Container for Fleet Schedule Snapshots
// =============================================================================

export interface MasterPlan {
  id: string;
  version: number;
  name: string;
  description: string;

  // Temporal versioning
  validFrom: Date;
  validTo: Date | null;

  // Planning horizon
  planningHorizonStart: Date;
  planningHorizonEnd: Date;

  // Status
  status: MasterPlanStatus;

  // Snapshot metadata
  snapshotTakenAt: Date | null;
  carCount: number;
  shopCount: number;

  // Version lineage
  parentPlanId: string | null;

  // Approval workflow
  submittedAt: Date | null;
  submittedById: string | null;
  approvedAt: Date | null;
  approvedById: string | null;
  rejectionReason: string;

  // Audit fields
  createdById: string;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MasterPlanWithRelations extends MasterPlan {
  parentPlan?: MasterPlan | null;
  childPlans?: MasterPlan[];
  commitments?: MasterPlanCommitment[];
  assignments?: UnifiedAssignment[];
}

// =============================================================================
// MASTER PLAN COMMITMENT - Links Cars to a Specific MasterPlan
// =============================================================================

export interface MasterPlanCommitment {
  id: string;
  masterPlanId: string;
  carId: string;
  shopId: string;
  customerId: string | null;

  // Planning period
  plannedMonth: number;
  plannedYear: number;
  scheduledArrivalDate: Date | null;
  scheduledCompletionDate: Date | null;

  // Status
  status: CommitmentStatus;

  // Qualification link
  qualificationEntryId: string | null;

  // Work type
  workType: string;
  shopReason: string;

  // Cost and duration
  estimatedCost: number | null;
  estimatedDays: number;
  actualCost: number | null;
  actualDays: number | null;

  // Priority
  priority: number;

  // Source tracking
  sourceType: string;
  sourceScenarioId: string | null;
  sourceAssignmentId: string | null;

  // Execution tracking
  actualArrivalDate: Date | null;
  actualCompletionDate: Date | null;
  executionNotes: string;

  // Audit fields
  committedAt: Date | null;
  committedById: string | null;
  cancelledAt: Date | null;
  cancelledById: string | null;
  cancellationReason: string;

  notes: string;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MasterPlanCommitmentWithRelations extends MasterPlanCommitment {
  masterPlan?: MasterPlan;
  car?: { id: string; railcarNumber: string; [key: string]: unknown };
  shop?: { id: string; name: string; code: string; [key: string]: unknown };
  customer?: { id: string; name: string; code: string; [key: string]: unknown } | null;
  qualificationEntry?: { id: string; [key: string]: unknown } | null;
}

// =============================================================================
// UNIFIED ASSIGNMENT - Single Polymorphic Assignment Table
// =============================================================================

export interface UnifiedAssignment {
  id: string;
  carId: string;
  shopId: string;
  suggestedShopId: string | null;
  customerId: string | null;

  // Planning period
  plannedMonth: number;
  plannedYear: number;
  scheduledMonth: string;
  scheduledArrivalDate: Date | null;
  scheduledCompletionDate: Date | null;

  // Status
  status: AssignmentStatus;

  // Qualification link
  qualificationEntryId: string | null;

  // Work details
  workType: string;
  shopReason: string;

  // Cost and duration
  estimatedCost: number;
  estimatedDays: number;
  actualCost: number | null;
  actualDays: number | null;

  // Priority
  priority: number;

  // Rule engine
  ruleScore: number;
  ruleNotes: string;

  // Links
  masterPlanId: string | null;
  scenarioId: string | null;
  legacyPlanId: string | null;

  // Source tracking
  sourceType: string;
  originalAssignmentId: string | null;

  // Commitment tracking
  committedAt: Date | null;
  committedById: string | null;

  // Execution tracking
  actualArrivalDate: Date | null;
  actualCompletionDate: Date | null;

  // Cancellation tracking
  cancelledAt: Date | null;
  cancelledById: string | null;
  cancellationReason: string;

  notes: string;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UnifiedAssignmentWithRelations extends UnifiedAssignment {
  car?: { id: string; railcarNumber: string; [key: string]: unknown };
  shop?: { id: string; name: string; code: string; [key: string]: unknown };
  customer?: { id: string; name: string; code: string; [key: string]: unknown } | null;
  masterPlan?: MasterPlan | null;
  qualificationEntry?: { id: string; [key: string]: unknown } | null;
}

// =============================================================================
// PRISMA NAMESPACE - Type compatibility for Prisma operations
// =============================================================================

export namespace Prisma {
  // MasterPlan types
  export interface MasterPlanWhereInput {
    id?: string | { in?: string[]; not?: string; equals?: string };
    companyId?: string;
    version?: number | { gte?: number; lte?: number };
    status?: MasterPlanStatus | string | { in?: MasterPlanStatus[] | string[] };
    validFrom?: Date | { gte?: Date; lte?: Date };
    validTo?: Date | { gte?: Date; lte?: Date } | null;
    parentPlanId?: string | null;
    createdById?: string;
    fiscalYear?: number;
    [key: string]: unknown;
  }

  export interface MasterPlanCreateInput {
    id?: string;
    version?: number;
    name: string;
    description?: string;
    validFrom: Date;
    validTo?: Date | null;
    planningHorizonStart: Date;
    planningHorizonEnd: Date;
    status?: MasterPlanStatus;
    createdById: string;
    companyId: string;
    parentPlanId?: string | null;
  }

  export interface MasterPlanUpdateInput {
    name?: string;
    description?: string;
    validFrom?: Date;
    validTo?: Date | null;
    planningHorizonStart?: Date;
    planningHorizonEnd?: Date;
    status?: MasterPlanStatus;
    snapshotTakenAt?: Date | null;
    carCount?: number;
    shopCount?: number;
    submittedAt?: Date | null;
    submittedById?: string | null;
    approvedAt?: Date | null;
    approvedById?: string | null;
    rejectionReason?: string;
  }

  // MasterPlanCommitment types
  export interface MasterPlanCommitmentWhereInput {
    id?: string | { in?: string[]; not?: string; equals?: string };
    masterPlanId?: string;
    carId?: string;
    shopId?: string;
    customerId?: string | null;
    status?: CommitmentStatus | { in?: CommitmentStatus[] };
    qualificationEntryId?: string | null;
    plannedYear?: number | { gte?: number; lte?: number };
    plannedMonth?: number | { gte?: number; lte?: number };
    companyId?: string;
    [key: string]: unknown;
  }

  export interface MasterPlanCommitmentCreateInput {
    id?: string;
    masterPlanId: string;
    carId: string;
    shopId: string;
    customerId?: string | null;
    plannedMonth: number;
    plannedYear: number;
    scheduledArrivalDate?: Date | null;
    scheduledCompletionDate?: Date | null;
    status?: CommitmentStatus;
    qualificationEntryId?: string | null;
    workType?: string;
    shopReason?: string;
    estimatedCost?: number | null;
    estimatedDays?: number;
    priority?: number;
    sourceType?: string;
    sourceScenarioId?: string | null;
    sourceAssignmentId?: string | null;
    notes?: string;
    companyId: string;
  }

  export interface MasterPlanCommitmentCreateManyInput {
    id?: string;
    masterPlanId: string;
    carId: string;
    shopId: string;
    customerId?: string | null;
    plannedMonth: number;
    plannedYear: number;
    scheduledArrivalDate?: Date | null;
    scheduledCompletionDate?: Date | null;
    status?: CommitmentStatus;
    qualificationEntryId?: string | null;
    workType?: string;
    shopReason?: string;
    estimatedCost?: number | null;
    estimatedDays?: number;
    priority?: number;
    sourceType?: string;
    sourceScenarioId?: string | null;
    sourceAssignmentId?: string | null;
    notes?: string;
    companyId: string;
  }

  export interface MasterPlanCommitmentUpdateInput {
    shopId?: string;
    customerId?: string | null;
    plannedMonth?: number;
    plannedYear?: number;
    scheduledArrivalDate?: Date | null;
    scheduledCompletionDate?: Date | null;
    status?: CommitmentStatus;
    qualificationEntryId?: string | null;
    workType?: string;
    shopReason?: string;
    estimatedCost?: number | null;
    estimatedDays?: number;
    actualCost?: number | null;
    actualDays?: number | null;
    priority?: number;
    actualArrivalDate?: Date | null;
    actualCompletionDate?: Date | null;
    executionNotes?: string;
    committedAt?: Date | null;
    committedById?: string | null;
    cancelledAt?: Date | null;
    cancelledById?: string | null;
    cancellationReason?: string;
    notes?: string;
  }

  // UnifiedAssignment types
  export interface UnifiedAssignmentWhereInput {
    id?: string | { in?: string[]; not?: string; equals?: string };
    carId?: string;
    shopId?: string;
    customerId?: string | null;
    status?: AssignmentStatus | { in?: AssignmentStatus[] | readonly string[]; notIn?: AssignmentStatus[] | readonly string[] };
    masterPlanId?: string | null;
    scenarioId?: string | null;
    qualificationEntryId?: string | null;
    plannedYear?: number | { gte?: number; lte?: number };
    plannedMonth?: number | { gte?: number; lte?: number };
    companyId?: string;
    [key: string]: unknown;
  }

  export interface UnifiedAssignmentCreateInput {
    id?: string;
    carId: string;
    shopId: string;
    suggestedShopId?: string | null;
    customerId?: string | null;
    plannedMonth: number;
    plannedYear: number;
    scheduledMonth?: string;
    scheduledArrivalDate?: Date | null;
    scheduledCompletionDate?: Date | null;
    status?: AssignmentStatus;
    qualificationEntryId?: string | null;
    workType?: string;
    shopReason?: string;
    estimatedCost?: number;
    estimatedDays?: number;
    priority?: number;
    ruleScore?: number;
    ruleNotes?: string;
    masterPlanId?: string | null;
    scenarioId?: string | null;
    legacyPlanId?: string | null;
    sourceType?: string;
    originalAssignmentId?: string | null;
    notes?: string;
    companyId: string;
  }

  export interface UnifiedAssignmentUpdateInput {
    shopId?: string;
    suggestedShopId?: string | null;
    customerId?: string | null;
    plannedMonth?: number;
    plannedYear?: number;
    scheduledMonth?: string;
    scheduledArrivalDate?: Date | null;
    scheduledCompletionDate?: Date | null;
    status?: AssignmentStatus;
    qualificationEntryId?: string | null;
    workType?: string;
    shopReason?: string;
    estimatedCost?: number;
    estimatedDays?: number;
    actualCost?: number | null;
    actualDays?: number | null;
    priority?: number;
    ruleScore?: number;
    ruleNotes?: string;
    masterPlanId?: string | null;
    scenarioId?: string | null;
    committedAt?: Date | null;
    committedById?: string | null;
    actualStartDate?: Date | null;
    actualArrivalDate?: Date | null;
    actualCompletionDate?: Date | null;
    cancelledAt?: Date | null;
    cancelledById?: string | null;
    cancellationReason?: string;
    notes?: string;
    version?: number | { increment: number };
  }
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Input type for creating a commitment from a scenario
 */
export interface CreateCommitmentFromScenarioInput {
  masterPlanId: string;
  scenarioId: string;
  carIds: string[];
  committedById: string;
}

/**
 * Input type for promoting an assignment to committed status
 */
export interface PromoteAssignmentInput {
  assignmentId: string;
  masterPlanId: string;
  committedById: string;
}

/**
 * Input type for creating a new master plan version
 */
export interface CreateMasterPlanVersionInput {
  parentPlanId: string;
  name: string;
  description?: string;
  validFrom: Date;
  validTo?: Date | null;
  planningHorizonStart: Date;
  planningHorizonEnd: Date;
  createdById: string;
  companyId: string;
  copyCommitments?: boolean;
}

/**
 * Result type for getting active master plan
 */
export interface ActiveMasterPlanResult {
  masterPlan: MasterPlanWithRelations | null;
  asOfDate: Date;
}

/**
 * Result type for plan comparison
 */
export interface MasterPlanComparison {
  basePlan: MasterPlanWithRelations;
  comparePlan: MasterPlanWithRelations;
  addedCommitments: MasterPlanCommitment[];
  removedCommitments: MasterPlanCommitment[];
  modifiedCommitments: {
    before: MasterPlanCommitment;
    after: MasterPlanCommitment;
    changes: string[];
  }[];
}
