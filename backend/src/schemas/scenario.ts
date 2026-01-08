import { z } from 'zod';
import {
  UUIDSchema,
  CostSchema,
  NonNegativeNumberSchema,
  YearSchema,
  MonthNumberSchema,
  MonthSchema,
  PrioritySchema,
  WorkTypeSchema,
  JsonObjectStringSchema,
  IdArraySchema,
} from './common';

// =============================================================================
// Scenario Status Schemas
// =============================================================================

export const ScenarioStatusSchema = z.enum(['draft', 'confirmed', 'archived']);

export const QualificationScenarioStatusSchema = z.enum([
  'draft',
  'running',
  'completed',
  'approved',
  'archived',
]);

export const ScenarioTypeSchema = z.enum(['base', 'late_release', 'capacity_shift', 'custom']);

// =============================================================================
// Scenario Validation Schemas
// =============================================================================

// Create scenario schema
export const CreateScenarioSchema = z.object({
  name: z.string().min(1, 'Scenario name is required').max(200),
  description: z.string().max(2000).default(''),
  notes: z.string().max(2000).default(''),
  status: ScenarioStatusSchema.default('draft'),
  projectNumber: z.string().max(100).default(''),
  customerFilter: z.string().max(200).default(''),
  basePlanId: UUIDSchema.nullable().optional(),
  isBaseline: z.boolean().default(false),
  parentId: UUIDSchema.nullable().optional(),
  isDraft: z.boolean().default(false),
  parentMasterPlanId: UUIDSchema.nullable().optional(),
});

// Update scenario schema
export const UpdateScenarioSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
  status: ScenarioStatusSchema.optional(),
  projectNumber: z.string().max(100).optional(),
  customerFilter: z.string().max(200).optional(),
  basePlanId: UUIDSchema.nullable().optional(),
  isBaseline: z.boolean().optional(),
  results: JsonObjectStringSchema.nullable().optional(),
});

// Scenario car schema (add car to scenario)
export const AddScenarioCarSchema = z.object({
  scenarioId: UUIDSchema,
  carId: UUIDSchema,
  shopId: UUIDSchema.nullable().optional(),
  suggestedShopId: UUIDSchema.nullable().optional(),
  plannedMonth: MonthNumberSchema,
  plannedYear: YearSchema,
  shopReason: z.string().max(500).default(''),
  estimatedCost: CostSchema.default(0),
  estimatedDays: z.coerce.number().int().min(1).max(365).default(14),
  ruleScore: z.coerce.number().default(0),
  ruleNotes: z.string().max(1000).default(''),
});

// Update scenario car schema
export const UpdateScenarioCarSchema = z.object({
  shopId: UUIDSchema.nullable().optional(),
  plannedMonth: MonthNumberSchema.optional(),
  plannedYear: YearSchema.optional(),
  shopReason: z.string().max(500).optional(),
  estimatedCost: CostSchema.optional(),
  estimatedDays: z.coerce.number().int().min(1).max(365).optional(),
  ruleScore: z.coerce.number().optional(),
  ruleNotes: z.string().max(1000).optional(),
});

// Batch add cars to scenario
export const BatchAddScenarioCarsSchema = z.object({
  scenarioId: UUIDSchema,
  cars: z.array(z.object({
    carId: UUIDSchema,
    shopId: UUIDSchema.nullable().optional(),
    plannedMonth: MonthNumberSchema,
    plannedYear: YearSchema,
    shopReason: z.string().max(500).default(''),
    estimatedCost: CostSchema.default(0),
    estimatedDays: z.coerce.number().int().default(14),
  })).min(1, 'At least one car is required'),
});

// Scenario modification schema
export const ScenarioModificationSchema = z.object({
  scenarioId: UUIDSchema,
  type: z.enum([
    'add_assignment',
    'remove_assignment',
    'modify_assignment',
    'change_shop',
    'change_date',
  ]),
  targetId: UUIDSchema,
  changes: JsonObjectStringSchema,
});

// Scenario customer schema (multi-customer support)
export const ScenarioCustomerSchema = z.object({
  scenarioId: UUIDSchema,
  customerId: UUIDSchema,
  isPrimary: z.boolean().default(false),
});

// =============================================================================
// Qualification Scenario Schemas
// =============================================================================

// Create qualification scenario schema
export const CreateQualificationScenarioSchema = z.object({
  name: z.string().min(1, 'Scenario name is required').max(200),
  description: z.string().max(2000).default(''),
  scenarioType: ScenarioTypeSchema.default('custom'),
  status: QualificationScenarioStatusSchema.default('draft'),
  planningHorizonMonths: z.coerce.number().int().min(1).max(24).default(6),
  lateReleasePercent: z.coerce.number().min(0).max(100).default(0),
  capacityAdjustment: JsonObjectStringSchema.default('{}'),
  parentScenarioId: UUIDSchema.nullable().optional(),
});

// Update qualification scenario schema
export const UpdateQualificationScenarioSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  status: QualificationScenarioStatusSchema.optional(),
  planningHorizonMonths: z.coerce.number().int().min(1).max(24).optional(),
  lateReleasePercent: z.coerce.number().min(0).max(100).optional(),
  capacityAdjustment: JsonObjectStringSchema.optional(),
  metricsJson: JsonObjectStringSchema.optional(),
  summaryJson: JsonObjectStringSchema.optional(),
  isApproved: z.boolean().optional(),
});

// Qualification plan assignment schema
export const CreateQualificationPlanAssignmentSchema = z.object({
  scenarioId: UUIDSchema,
  carId: UUIDSchema,
  shopId: UUIDSchema,
  monthKey: MonthSchema,
  workTypes: z.string(), // JSON array
  priority: PrioritySchema,
  isBundled: z.boolean().default(false),
  bundleGroupId: UUIDSchema.nullable().optional(),
  scheduledArrival: z.string().datetime().nullable().optional(),
  scheduledCompletion: z.string().datetime().nullable().optional(),
  estimatedDays: z.coerce.number().int().min(1).max(365).default(14),
  estimatedCost: CostSchema.default(0),
  currentCustomerId: UUIDSchema.nullable().optional(),
  nextCustomerId: UUIDSchema.nullable().optional(),
  status: z.enum(['planned', 'confirmed', 'in_progress', 'completed']).default('planned'),
  notes: z.string().max(2000).default(''),
});

// Scenario query schema
export const ScenarioQuerySchema = z.object({
  customer: z.string().optional(),
  status: ScenarioStatusSchema.optional(),
  projectNumber: z.string().optional(),
  isBaseline: z.preprocess((val) => val === 'true', z.boolean()).optional(),
  isDraft: z.preprocess((val) => val === 'true', z.boolean()).optional(),
});

// Alternative shops request schema
export const AlternativeShopsRequestSchema = z.object({
  carIds: IdArraySchema,
  excludeShopId: UUIDSchema.optional(),
  month: MonthSchema.optional(),
});

// Confirm scenario to car flow plan schema
export const ConfirmScenarioSchema = z.object({
  scenarioId: UUIDSchema,
  carIds: IdArraySchema.optional(), // If not provided, confirm all cars
  notes: z.string().max(1000).default(''),
});

// Clone scenario schema
export const CloneScenarioSchema = z.object({
  sourceScenarioId: UUIDSchema,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  includeCars: z.boolean().default(true),
  includeModifications: z.boolean().default(false),
});

// Export types
export type CreateScenario = z.infer<typeof CreateScenarioSchema>;
export type UpdateScenario = z.infer<typeof UpdateScenarioSchema>;
export type AddScenarioCar = z.infer<typeof AddScenarioCarSchema>;
export type UpdateScenarioCar = z.infer<typeof UpdateScenarioCarSchema>;
export type BatchAddScenarioCars = z.infer<typeof BatchAddScenarioCarsSchema>;
export type ScenarioModification = z.infer<typeof ScenarioModificationSchema>;
export type CreateQualificationScenario = z.infer<typeof CreateQualificationScenarioSchema>;
export type UpdateQualificationScenario = z.infer<typeof UpdateQualificationScenarioSchema>;
export type ScenarioQuery = z.infer<typeof ScenarioQuerySchema>;
export type ConfirmScenario = z.infer<typeof ConfirmScenarioSchema>;
export type CloneScenario = z.infer<typeof CloneScenarioSchema>;
export type ScenarioStatus = z.infer<typeof ScenarioStatusSchema>;
