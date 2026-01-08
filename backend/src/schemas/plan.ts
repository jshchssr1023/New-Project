import { z } from 'zod';
import {
  UUIDSchema,
  CostSchema,
  NonNegativeNumberSchema,
  MonthSchema,
  YearSchema,
  MonthNumberSchema,
  PrioritySchema,
  WorkTypeSchema,
  IdArraySchema,
} from './common';

// =============================================================================
// Plan Status Schemas
// =============================================================================

export const PlanStatusSchema = z.enum(['draft', 'active', 'completed', 'archived']);

export const AssignmentStatusSchema = z.enum([
  'pending',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
]);

export const MasterPlanStatusSchema = z.enum([
  'DRAFT',
  'PENDING',
  'APPROVED',
  'ACTIVE',
  'SUPERSEDED',
  'ARCHIVED',
]);

export const CommitmentStatusSchema = z.enum([
  'DRAFT',
  'PLANNED',
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETE',
  'CANCELLED',
  'DEFERRED',
  'RESCHEDULED',
]);

// =============================================================================
// Plan Validation Schemas
// =============================================================================

// Create plan schema
export const CreatePlanSchema = z.object({
  name: z.string().min(1, 'Plan name is required').max(200),
  description: z.string().max(2000).default(''),
  startDate: z.string().datetime('Invalid start date'),
  endDate: z.string().datetime('Invalid end date'),
  status: PlanStatusSchema.default('draft'),
}).refine(
  (data) => new Date(data.startDate) < new Date(data.endDate),
  { message: 'Start date must be before end date', path: ['endDate'] }
);

// Update plan schema
export const UpdatePlanSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  status: PlanStatusSchema.optional(),
});

// Plan assignment schema
export const CreatePlanAssignmentSchema = z.object({
  planId: UUIDSchema,
  carId: UUIDSchema,
  shopId: UUIDSchema,
  scheduledMonth: MonthSchema,
  estimatedCost: CostSchema.default(0),
  estimatedDuration: z.coerce.number().int().min(1).max(365).default(14),
  status: AssignmentStatusSchema.default('pending'),
  notes: z.string().max(1000).default(''),
});

// Update plan assignment schema
export const UpdatePlanAssignmentSchema = z.object({
  shopId: UUIDSchema.optional(),
  scheduledMonth: MonthSchema.optional(),
  estimatedCost: CostSchema.optional(),
  estimatedDuration: z.coerce.number().int().min(1).max(365).optional(),
  status: AssignmentStatusSchema.optional(),
  notes: z.string().max(1000).optional(),
});

// Batch assignment creation
export const BatchCreateAssignmentsSchema = z.object({
  planId: UUIDSchema,
  assignments: z.array(z.object({
    carId: UUIDSchema,
    shopId: UUIDSchema,
    scheduledMonth: MonthSchema,
    estimatedCost: CostSchema.default(0),
    estimatedDuration: z.coerce.number().int().default(14),
    notes: z.string().max(1000).default(''),
  })).min(1, 'At least one assignment is required'),
});

// =============================================================================
// Master Plan Schemas
// =============================================================================

// Create master plan schema
export const CreateMasterPlanSchema = z.object({
  name: z.string().min(1, 'Plan name is required').max(200),
  description: z.string().max(2000).default(''),
  validFrom: z.string().datetime('Invalid validFrom date'),
  validTo: z.string().datetime().nullable().optional(),
  planningHorizonStart: z.string().datetime('Invalid planning horizon start date'),
  planningHorizonEnd: z.string().datetime('Invalid planning horizon end date'),
  status: MasterPlanStatusSchema.default('DRAFT'),
  parentPlanId: UUIDSchema.nullable().optional(),
}).refine(
  (data) => new Date(data.planningHorizonStart) < new Date(data.planningHorizonEnd),
  { message: 'Planning horizon start must be before end', path: ['planningHorizonEnd'] }
);

// Update master plan schema
export const UpdateMasterPlanSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  validFrom: z.string().datetime().optional(),
  validTo: z.string().datetime().nullable().optional(),
  planningHorizonStart: z.string().datetime().optional(),
  planningHorizonEnd: z.string().datetime().optional(),
  status: MasterPlanStatusSchema.optional(),
  rejectionReason: z.string().max(1000).optional(),
});

// Master plan commitment schema
export const CreateMasterPlanCommitmentSchema = z.object({
  masterPlanId: UUIDSchema,
  carId: UUIDSchema,
  shopId: UUIDSchema,
  customerId: UUIDSchema.nullable().optional(),
  plannedMonth: MonthNumberSchema,
  plannedYear: YearSchema,
  scheduledArrivalDate: z.string().datetime().nullable().optional(),
  scheduledCompletionDate: z.string().datetime().nullable().optional(),
  status: CommitmentStatusSchema.default('DRAFT'),
  qualificationEntryId: UUIDSchema.nullable().optional(),
  workType: WorkTypeSchema.default('full_qualification'),
  shopReason: z.string().max(500).default(''),
  estimatedCost: CostSchema.nullable().optional(),
  estimatedDays: z.coerce.number().int().min(1).max(365).default(14),
  priority: PrioritySchema,
  sourceType: z.enum(['manual', 'scenario', 'import', 'system']).default('manual'),
  sourceScenarioId: UUIDSchema.nullable().optional(),
  notes: z.string().max(2000).default(''),
});

// Update master plan commitment schema
export const UpdateMasterPlanCommitmentSchema = z.object({
  shopId: UUIDSchema.optional(),
  customerId: UUIDSchema.nullable().optional(),
  plannedMonth: MonthNumberSchema.optional(),
  plannedYear: YearSchema.optional(),
  scheduledArrivalDate: z.string().datetime().nullable().optional(),
  scheduledCompletionDate: z.string().datetime().nullable().optional(),
  status: CommitmentStatusSchema.optional(),
  workType: WorkTypeSchema.optional(),
  shopReason: z.string().max(500).optional(),
  estimatedCost: CostSchema.nullable().optional(),
  estimatedDays: z.coerce.number().int().min(1).max(365).optional(),
  priority: PrioritySchema.optional(),
  actualArrivalDate: z.string().datetime().nullable().optional(),
  actualCompletionDate: z.string().datetime().nullable().optional(),
  executionNotes: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
  cancellationReason: z.string().max(1000).optional(),
});

// =============================================================================
// Car Flow Plan Schemas
// =============================================================================

export const CarFlowPlanStatusSchema = z.enum(['Planned', 'In Progress', 'Complete', 'Cancelled']);

export const CreateCarFlowPlanSchema = z.object({
  carId: UUIDSchema,
  shopId: UUIDSchema,
  customerId: UUIDSchema.nullable().optional(),
  plannedMonth: MonthNumberSchema,
  plannedYear: YearSchema,
  sourceScenarioId: UUIDSchema.nullable().optional(),
  status: CarFlowPlanStatusSchema.default('Planned'),
  source: z.enum(['csv_import', 'scenario', 'manual', 'master_plan', 'migration']).default('manual'),
  shopReason: z.string().max(500).default(''),
  estimatedCost: CostSchema.nullable().optional(),
  priority: PrioritySchema,
  notes: z.string().max(2000).default(''),
});

export const UpdateCarFlowPlanSchema = z.object({
  shopId: UUIDSchema.optional(),
  customerId: UUIDSchema.nullable().optional(),
  plannedMonth: MonthNumberSchema.optional(),
  plannedYear: YearSchema.optional(),
  status: CarFlowPlanStatusSchema.optional(),
  shopReason: z.string().max(500).optional(),
  estimatedCost: CostSchema.nullable().optional(),
  priority: PrioritySchema.optional(),
  notes: z.string().max(2000).optional(),
});

// Plan query schema
export const PlanQuerySchema = z.object({
  status: PlanStatusSchema.optional(),
  detailed: z.preprocess((val) => val === 'true', z.boolean()).optional(),
});

// Master plan query schema
export const MasterPlanQuerySchema = z.object({
  status: MasterPlanStatusSchema.optional(),
  year: YearSchema.optional(),
  month: MonthNumberSchema.optional(),
  includeCommitments: z.preprocess((val) => val === 'true', z.boolean()).optional(),
});

// Export types
export type CreatePlan = z.infer<typeof CreatePlanSchema>;
export type UpdatePlan = z.infer<typeof UpdatePlanSchema>;
export type CreatePlanAssignment = z.infer<typeof CreatePlanAssignmentSchema>;
export type UpdatePlanAssignment = z.infer<typeof UpdatePlanAssignmentSchema>;
export type CreateMasterPlan = z.infer<typeof CreateMasterPlanSchema>;
export type UpdateMasterPlan = z.infer<typeof UpdateMasterPlanSchema>;
export type CreateMasterPlanCommitment = z.infer<typeof CreateMasterPlanCommitmentSchema>;
export type UpdateMasterPlanCommitment = z.infer<typeof UpdateMasterPlanCommitmentSchema>;
export type CreateCarFlowPlan = z.infer<typeof CreateCarFlowPlanSchema>;
export type UpdateCarFlowPlan = z.infer<typeof UpdateCarFlowPlanSchema>;
export type PlanStatus = z.infer<typeof PlanStatusSchema>;
export type MasterPlanStatus = z.infer<typeof MasterPlanStatusSchema>;
export type CommitmentStatus = z.infer<typeof CommitmentStatusSchema>;
