import { z } from 'zod';
import {
  UUIDSchema,
  MonthSchema,
  CostSchema,
  NonNegativeNumberSchema,
  OptionalDateSchema,
  OptionalStringSchema,
  PrioritySchema,
  IdArraySchema,
} from './common';

// =============================================================================
// Car Status Enums
// =============================================================================

export const CarStatusSchema = z.enum([
  'Arrived',
  'Complete',
  'To Be Routed',
  'Release',
  'Up Marketed',
  'Enroute',
  'Reassigned',
  'Released',
  'Scheduled',
  'Other',
]);

export const ShoppingStatusSchema = z.enum([
  'Urgent',
  'Must Shop',
  'Upcoming',
  'Compliant',
  'In Shop',
  'Planned',
  'Unknown',
]);

export const QualificationTypeSchema = z.enum(['full', 'partial', '']);

// =============================================================================
// Car Validation Schemas
// =============================================================================

// Base car fields for create/update
const CarBaseFields = {
  railcarNumber: z.string().min(1, 'Railcar number is required').max(50),
  carType: z.string().max(100).default(''),
  isTankCar: z.boolean().default(false),
  commodity: z.string().max(200).default(''),
  customer: z.string().max(200).default(''),
  customerId: UUIDSchema.nullable().optional(),
  projectNumber: z.string().max(100).default(''),
  reasonsShopped: z.string().max(500).default(''),
  status: CarStatusSchema.default('To Be Routed'),
  shoppingStatus: ShoppingStatusSchema.default('Unknown'),
  portfolio: z.boolean().default(false),
  performedTankQual: z.boolean().default(false),
  currentLocation: z.string().max(200).default(''),
  assignedShopId: UUIDSchema.nullable().optional(),
  projectedCompletionMonth: MonthSchema.optional().default(''),
  projectedCost: CostSchema,
  shopEntryDate: OptionalDateSchema,
  arrivalDate: OptionalDateSchema,
  daysInShop: NonNegativeNumberSchema.default(0),
  lastServiceDate: OptionalDateSchema,
  nextServiceDue: OptionalDateSchema,
  homeRegion: z.string().max(100).default(''),
  originRegion: z.string().max(100).default(''),
  notes: z.string().max(2000).default(''),
  contractNumber: z.string().max(100).default(''),
  contractExpiration: OptionalDateSchema,
  isJacketed: z.boolean().default(false),
  isLined: z.boolean().default(false),
  buildYear: z.coerce.number().int().min(1900).max(2100).nullable().optional(),
  qualificationType: QualificationTypeSchema.default(''),
  tankQualified: z.boolean().default(false),
  performScheduled: z.boolean().default(false),
  planStatus: z.string().max(100).default(''),
  // Reference fields
  csr: z.string().max(100).default(''),
  csl: z.string().max(100).default(''),
  commercial: z.string().max(100).default(''),
  liningType: z.string().max(100).default(''),
  carMark: z.string().max(20).default(''),
  carNumber: z.string().max(20).default(''),
  fmsLesseeNumber: z.string().max(50).default(''),
  pastRegion: z.string().max(100).default(''),
  region2026: z.string().max(100).default(''),
  // Qualification date fields
  minNoLining: OptionalDateSchema,
  minWLining: OptionalDateSchema,
  interiorLining: OptionalDateSchema,
  rule88B: OptionalDateSchema,
  safetyRelief: OptionalDateSchema,
  serviceEquipment: OptionalDateSchema,
  stubSill: OptionalDateSchema,
  tankThickness: OptionalDateSchema,
  tankQualification: OptionalDateSchema,
};

// Create car schema (railcarNumber required)
export const CreateCarSchema = z.object({
  ...CarBaseFields,
});

// Update car schema (all fields optional)
export const UpdateCarSchema = z.object(
  Object.fromEntries(
    Object.entries(CarBaseFields).map(([key, schema]) => [key, schema.optional()])
  ) as Record<keyof typeof CarBaseFields, z.ZodTypeAny>
).partial();

// Bulk update schema
export const BulkUpdateCarsSchema = z.object({
  carIds: IdArraySchema,
  updates: z.object({
    status: CarStatusSchema.optional(),
    customer: z.string().max(200).optional(),
    commodity: z.string().max(200).optional(),
    notes: z.string().max(2000).optional(),
    currentLocation: z.string().max(200).optional(),
    homeRegion: z.string().max(100).optional(),
    originRegion: z.string().max(100).optional(),
    reasonsShopped: z.string().max(500).optional(),
    projectNumber: z.string().max(100).optional(),
    carType: z.string().max(100).optional(),
    isTankCar: z.boolean().optional(),
    projectedCost: CostSchema.optional(),
    daysInShop: NonNegativeNumberSchema.optional(),
    lastServiceDate: OptionalDateSchema,
    nextServiceDue: OptionalDateSchema,
  }),
});

// Bulk delete schema
export const BulkDeleteCarsSchema = z.object({
  carIds: IdArraySchema,
});

// Car filter/query schema
export const CarQuerySchema = z.object({
  status: CarStatusSchema.optional(),
  shoppingStatus: ShoppingStatusSchema.optional(),
  customer: z.string().optional(),
  customerId: UUIDSchema.optional(),
  region: z.string().optional(),
  portfolio: z.preprocess((val) => val === 'true', z.boolean()).optional(),
  assignedShopId: UUIDSchema.optional(),
  q: z.string().optional(), // Search query
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

// Car import schema (more lenient for CSV import)
export const CarImportSchema = z.object({
  railcarNumber: z.string().min(1),
  // All other fields are optional with fallback to empty/defaults
}).passthrough();

// Car assignment schema (for assigning cars to shops)
export const CarAssignmentSchema = z.object({
  carId: UUIDSchema,
  shopId: UUIDSchema,
  plannedMonth: z.coerce.number().int().min(1).max(12),
  plannedYear: z.coerce.number().int().min(2000).max(2100),
  workType: z.enum(['full_qualification', 'partial_qualification', 'assignment', 'release', 'repair']).default('full_qualification'),
  shopReason: z.string().max(500).default(''),
  estimatedCost: CostSchema.optional(),
  estimatedDays: z.coerce.number().int().min(1).max(365).default(14),
  priority: PrioritySchema,
  notes: OptionalStringSchema,
});

// Shop eligibility update schema
export const CarShopEligibilitySchema = z.object({
  carId: UUIDSchema,
  shopId: UUIDSchema,
  isEligible: z.boolean().default(true),
  notes: z.string().max(500).default(''),
});

// Export types
export type CreateCar = z.infer<typeof CreateCarSchema>;
export type UpdateCar = z.infer<typeof UpdateCarSchema>;
export type BulkUpdateCars = z.infer<typeof BulkUpdateCarsSchema>;
export type CarQuery = z.infer<typeof CarQuerySchema>;
export type CarAssignment = z.infer<typeof CarAssignmentSchema>;
export type CarStatus = z.infer<typeof CarStatusSchema>;
export type ShoppingStatus = z.infer<typeof ShoppingStatusSchema>;
