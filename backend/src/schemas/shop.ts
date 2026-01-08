import { z } from 'zod';
import {
  UUIDSchema,
  CostSchema,
  NonNegativeNumberSchema,
  PercentageSchema,
  JsonArrayStringSchema,
  IdArraySchema,
  MonthSchema,
} from './common';

// =============================================================================
// Shop Status and Type Schemas
// =============================================================================

export const ShopStatusSchema = z.enum(['active', 'probation', 'inactive']);

export const NetworkTierSchema = z.coerce.number().int().min(1).max(5).default(5);

// =============================================================================
// Shop Validation Schemas
// =============================================================================

// Base shop fields
const ShopBaseFields = {
  name: z.string().min(1, 'Shop name is required').max(200),
  code: z.string().min(1, 'Shop code is required').max(50),
  location: z.string().max(200).default(''),
  city: z.string().max(100).default(''),
  state: z.string().max(50).default(''),
  region: z.string().max(100).default(''),
  network: z.string().max(100).default(''),
  servingRailroad: z.string().max(100).default(''),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  networkId: UUIDSchema.nullable().optional(),
  parentShopId: UUIDSchema.nullable().optional(),
  isParent: z.boolean().default(false),
  annualTargetVolume: NonNegativeNumberSchema.default(0),
  isAitxInternal: z.boolean().default(false),
  tankQualified: z.boolean().default(true),
  networkTier: NetworkTierSchema,
  shopStatus: ShopStatusSchema.default('active'),
  capacity: z.coerce.number().int().min(0).default(10),
  currentLoad: NonNegativeNumberSchema.default(0),
  utilizationTarget: z.coerce.number().min(0).max(1).default(0.9),
  baseCostPerCar: CostSchema.default(15000),
  laborRate: CostSchema.default(75),
  costIndex: z.coerce.number().positive().default(1.0),
  baseTurnTime: z.coerce.number().int().min(1).max(365).default(14),
  turnTimeMultiplier: z.coerce.number().positive().default(1.0),
  capabilities: JsonArrayStringSchema.default('[]'),
  certifications: JsonArrayStringSchema.default('[]'),
  preferredCustomers: JsonArrayStringSchema.default('[]'),
  contactName: z.string().max(200).default(''),
  contactEmail: z.string().email().or(z.literal('')).default(''),
  contactPhone: z.string().max(50).default(''),
  notes: z.string().max(2000).default(''),
  isActive: z.boolean().default(true),
  // S&OP capacity fields
  qualCapacity: NonNegativeNumberSchema.default(50),
  assignCapacity: NonNegativeNumberSchema.default(30),
  releaseCapacity: NonNegativeNumberSchema.default(40),
  repairCapacity: NonNegativeNumberSchema.default(20),
  efficiencyRating: z.coerce.number().min(0).max(1).default(0.9),
};

// Create shop schema
export const CreateShopSchema = z.object({
  ...ShopBaseFields,
});

// Update shop schema (all fields optional)
export const UpdateShopSchema = z.object(
  Object.fromEntries(
    Object.entries(ShopBaseFields).map(([key, schema]) => [key, schema.optional()])
  ) as Record<keyof typeof ShopBaseFields, z.ZodTypeAny>
).partial();

// Shop query/filter schema
export const ShopQuerySchema = z.object({
  region: z.string().optional(),
  network: z.string().optional(),
  servingRailroad: z.string().optional(),
  isActive: z.preprocess((val) => val === 'true', z.boolean()).optional(),
  hasCapacity: z.preprocess((val) => val === 'true', z.boolean()).optional(),
  month: MonthSchema.optional(),
  tankQualified: z.preprocess((val) => val === 'true', z.boolean()).optional(),
  isParent: z.preprocess((val) => val === 'true', z.boolean()).optional(),
  isAitxInternal: z.preprocess((val) => val === 'true', z.boolean()).optional(),
});

// Batch capacity check schema
export const BatchCapacityCheckSchema = z.object({
  shopIds: IdArraySchema,
  months: z.array(MonthSchema).min(1, 'At least one month is required'),
});

// Shop capability profile schema
export const ShopCapabilityProfileSchema = z.object({
  shopId: UUIDSchema,
  // Certifications
  canPerformTankLining: z.boolean().default(false),
  canPerformAnnualQuals: z.boolean().default(false),
  canPerformRule88B: z.boolean().default(false),
  canPerformSafetyRelief: z.boolean().default(false),
  canPerformStubSill: z.boolean().default(false),
  canPerformTankThickness: z.boolean().default(false),
  canPerformFullQualification: z.boolean().default(true),
  canPerformPartialQual: z.boolean().default(true),
  canPerformRepairs: z.boolean().default(true),
  canPerformServiceEquipment: z.boolean().default(false),
  // Physical limits
  allowedAssetClasses: JsonArrayStringSchema.default('[]'),
  maxCarLength: z.coerce.number().int().positive().nullable().optional(),
  maxCarWeight: z.coerce.number().int().positive().nullable().optional(),
  hasJacketedCarSupport: z.boolean().default(true),
  hasLinedCarSupport: z.boolean().default(true),
  allowedLiningTypes: JsonArrayStringSchema.default('[]'),
  // Hazmat restrictions
  hazmatCertifications: JsonArrayStringSchema.default('[]'),
  restrictedCommodities: JsonArrayStringSchema.default('[]'),
  allowedCommodities: JsonArrayStringSchema.default('[]'),
  // Customer restrictions
  preferredCustomers: JsonArrayStringSchema.default('[]'),
  excludedCustomers: JsonArrayStringSchema.default('[]'),
  isContractShop: z.boolean().default(false),
  // Capacity constraints
  monthlyCapacity: NonNegativeNumberSchema.default(50),
  maxConcurrentCars: NonNegativeNumberSchema.default(10),
  preferredWorkloadMix: z.string().default('{}'),
  // 3rd party commitment tracking
  hasContractualCommitment: z.boolean().default(false),
  annualCommittedVolume: NonNegativeNumberSchema.default(0),
  commitmentPenaltyRate: CostSchema.default(0),
});

// JSON array validation schemas for shop capability fields
export const AllowedAssetClassesSchema = z.array(
  z.enum(['Tank', 'Hopper', 'Boxcar', 'Gondola', 'Flatcar', 'Covered Hopper', 'Other'])
);

export const HazmatCertificationsSchema = z.array(z.string().regex(/^DOT-\d+[A-Z]*$/, 'Invalid DOT specification format'));

export const LiningTypesSchema = z.array(
  z.enum(['Rubber', 'Epoxy', 'Glass', 'Polyurethane', 'Phenolic', 'Other'])
);

// Shop network schema
export const ShopNetworkSchema = z.object({
  name: z.string().min(1, 'Network name is required').max(200),
  code: z.string().min(1, 'Network code is required').max(50),
  description: z.string().max(1000).default(''),
  isAitxInternal: z.boolean().default(false),
  networkTier: NetworkTierSchema,
  annualTargetVolume: NonNegativeNumberSchema.default(0),
  annualCommittedVolume: NonNegativeNumberSchema.default(0),
  monthlyBaseCapacity: NonNegativeNumberSchema.default(0),
  costIndex: z.coerce.number().positive().default(1.0),
  hasContractualCommitment: z.boolean().default(false),
  commitmentPenaltyRate: CostSchema.default(0),
  contractStartDate: z.string().datetime().nullable().optional(),
  contractEndDate: z.string().datetime().nullable().optional(),
  contactName: z.string().max(200).default(''),
  contactEmail: z.string().email().or(z.literal('')).default(''),
  contactPhone: z.string().max(50).default(''),
  isActive: z.boolean().default(true),
  notes: z.string().max(2000).default(''),
  regions: JsonArrayStringSchema.default('[]'),
});

// Export types
export type CreateShop = z.infer<typeof CreateShopSchema>;
export type UpdateShop = z.infer<typeof UpdateShopSchema>;
export type ShopQuery = z.infer<typeof ShopQuerySchema>;
export type BatchCapacityCheck = z.infer<typeof BatchCapacityCheckSchema>;
export type ShopCapabilityProfile = z.infer<typeof ShopCapabilityProfileSchema>;
export type ShopNetwork = z.infer<typeof ShopNetworkSchema>;
export type ShopStatus = z.infer<typeof ShopStatusSchema>;
