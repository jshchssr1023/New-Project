// =============================================================================
// Scenario Response DTOs
// Define the shape of scenario data returned by API endpoints
// =============================================================================

import { ShopSummaryDTO } from './shop.dto';
import { CustomerSummaryDTO, CarAssignmentSummaryDTO } from './car.dto';

/**
 * Minimal scenario representation for list views
 */
export interface ScenarioListItemDTO {
  id: string;
  name: string;
  description: string;
  status: string;
  projectNumber: string;
  customerFilter: string;
  isBaseline: boolean;
  isDraft: boolean;
  carCount: number;
  basePlan: { id: string; name: string } | null;
  creator: {
    id: string;
    firstName: string;
    lastName: string;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * Full scenario details for single scenario view
 */
export interface ScenarioDetailDTO extends Omit<ScenarioListItemDTO, 'carCount'> {
  notes: string;
  confirmedAt: string | null;
  parentId: string | null;
  draftExpiresAt: string | null;
  parentMasterPlanId: string | null;
  draftKpiSnapshot: Record<string, unknown>;
  results: Record<string, unknown> | null;
  cars: ScenarioCarDTO[];
  modifications: ScenarioModificationDTO[];
  customers: ScenarioCustomerDTO[];
}

/**
 * Scenario car DTO
 */
export interface ScenarioCarDTO {
  id: string;
  scenarioId: string;
  carId: string;
  shopId: string | null;
  suggestedShopId: string | null;
  plannedMonth: number;
  plannedYear: number;
  scheduledMonth: string;
  shopReason: string;
  estimatedCost: number;
  estimatedDays: number;
  ruleScore: number;
  ruleNotes: string;
  createdAt: string;
  updatedAt: string;
  // Relations
  car?: ScenarioCarDetailDTO;
  shop?: ShopSummaryDTO;
  suggestedShop?: ShopSummaryDTO;
}

/**
 * Car details for scenario view
 */
export interface ScenarioCarDetailDTO {
  id: string;
  railcarNumber: string;
  carType: string;
  isTankCar: boolean;
  commodity: string;
  customer: string;
  status: string;
  shoppingStatus: string;
  currentLocation: string;
  homeRegion: string;
  portfolio: boolean;
  // Qualification dates for urgency display
  tankQualification: string | null;
  rule88B: string | null;
  safetyRelief: string | null;
}

/**
 * Scenario modification DTO
 */
export interface ScenarioModificationDTO {
  id: string;
  scenarioId: string;
  type: string;
  targetId: string;
  changes: Record<string, unknown>;
  createdAt: string;
}

/**
 * Scenario customer DTO (multi-customer support)
 */
export interface ScenarioCustomerDTO {
  id: string;
  scenarioId: string;
  customerId: string;
  isPrimary: boolean;
  customer: CustomerSummaryDTO;
}

/**
 * Scenario comparison result DTO
 */
export interface ScenarioComparisonDTO {
  scenarios: Array<{
    id: string;
    name: string;
    status: string;
    carCount: number;
  }>;
  metrics: Array<{
    metric: string;
    label: string;
    values: Array<{
      scenarioId: string;
      value: number | string;
    }>;
  }>;
  differences: Array<{
    carId: string;
    railcarNumber: string;
    field: string;
    scenarioValues: Record<string, unknown>;
  }>;
}

// =============================================================================
// Qualification Scenario DTOs
// =============================================================================

/**
 * Qualification scenario list item
 */
export interface QualificationScenarioListItemDTO {
  id: string;
  name: string;
  description: string;
  scenarioType: string;
  status: string;
  planningHorizonMonths: number;
  lateReleasePercent: number;
  isApproved: boolean;
  parentScenarioId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Qualification scenario detail
 */
export interface QualificationScenarioDetailDTO extends QualificationScenarioListItemDTO {
  capacityAdjustment: Record<string, number>;
  metricsJson: Record<string, unknown>;
  summaryJson: Record<string, unknown>;
  approvedBy: string | null;
  approvedAt: string | null;
  planAssignments: QualificationPlanAssignmentDTO[];
  childScenarios?: QualificationScenarioListItemDTO[];
}

/**
 * Qualification plan assignment DTO
 */
export interface QualificationPlanAssignmentDTO {
  id: string;
  scenarioId: string;
  carId: string;
  shopId: string;
  monthKey: string;
  workTypes: string[];
  priority: number;
  isBundled: boolean;
  bundleGroupId: string | null;
  scheduledArrival: string | null;
  scheduledCompletion: string | null;
  estimatedDays: number;
  estimatedCost: number;
  currentCustomerId: string | null;
  nextCustomerId: string | null;
  status: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Alternative shop recommendation DTO
 */
export interface AlternativeShopRecommendationDTO {
  shopId: string;
  shopName: string;
  shopCode: string;
  region: string;
  tankQualified: boolean;
  capacity: number;
  averageScore: number;
  matchCount: number;
}

/**
 * Scenario confirm result DTO
 */
export interface ScenarioConfirmResultDTO {
  success: boolean;
  scenarioId: string;
  confirmedCount: number;
  carFlowPlans: Array<{
    id: string;
    carId: string;
    shopId: string;
    plannedMonth: number;
    plannedYear: number;
    status: string;
  }>;
  errors?: Array<{
    carId: string;
    message: string;
  }>;
}

// =============================================================================
// Transform Functions
// =============================================================================

/**
 * Parse JSON string safely
 */
function safeParseJson<T>(value: string | null | undefined, defaultValue: T): T {
  if (!value) return defaultValue;
  try {
    return JSON.parse(value) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Transform a Prisma Scenario model to ScenarioListItemDTO
 */
export function toScenarioListItemDTO(scenario: any): ScenarioListItemDTO {
  return {
    id: scenario.id,
    name: scenario.name,
    description: scenario.description,
    status: scenario.status,
    projectNumber: scenario.projectNumber,
    customerFilter: scenario.customerFilter,
    isBaseline: scenario.isBaseline,
    isDraft: scenario.isDraft,
    carCount: scenario.cars?.length ?? scenario.carCount ?? 0,
    basePlan: scenario.basePlan ? {
      id: scenario.basePlan.id,
      name: scenario.basePlan.name,
    } : null,
    creator: {
      id: scenario.creator?.id ?? '',
      firstName: scenario.creator?.firstName ?? '',
      lastName: scenario.creator?.lastName ?? '',
    },
    createdAt: scenario.createdAt?.toISOString?.() ?? scenario.createdAt,
    updatedAt: scenario.updatedAt?.toISOString?.() ?? scenario.updatedAt,
  };
}

/**
 * Transform a Prisma Scenario model to ScenarioDetailDTO
 */
export function toScenarioDetailDTO(scenario: any): ScenarioDetailDTO {
  const { carCount, ...listItem } = toScenarioListItemDTO(scenario);
  return {
    ...listItem,
    notes: scenario.notes,
    confirmedAt: scenario.confirmedAt?.toISOString?.() ?? scenario.confirmedAt ?? null,
    parentId: scenario.parentId,
    draftExpiresAt: scenario.draftExpiresAt?.toISOString?.() ?? scenario.draftExpiresAt ?? null,
    parentMasterPlanId: scenario.parentMasterPlanId,
    draftKpiSnapshot: safeParseJson(scenario.draftKpiSnapshot, {}),
    results: safeParseJson(scenario.results, null),
    cars: scenario.cars?.map(toScenarioCarDTO) ?? [],
    modifications: scenario.modifications?.map(toScenarioModificationDTO) ?? [],
    customers: scenario.customers?.map(toScenarioCustomerDTO) ?? [],
  };
}

/**
 * Transform a scenario car
 */
export function toScenarioCarDTO(scenarioCar: any): ScenarioCarDTO {
  return {
    id: scenarioCar.id,
    scenarioId: scenarioCar.scenarioId,
    carId: scenarioCar.carId,
    shopId: scenarioCar.shopId,
    suggestedShopId: scenarioCar.suggestedShopId,
    plannedMonth: scenarioCar.plannedMonth,
    plannedYear: scenarioCar.plannedYear,
    scheduledMonth: scenarioCar.scheduledMonth,
    shopReason: scenarioCar.shopReason,
    estimatedCost: scenarioCar.estimatedCost,
    estimatedDays: scenarioCar.estimatedDays,
    ruleScore: scenarioCar.ruleScore,
    ruleNotes: scenarioCar.ruleNotes,
    createdAt: scenarioCar.createdAt?.toISOString?.() ?? scenarioCar.createdAt,
    updatedAt: scenarioCar.updatedAt?.toISOString?.() ?? scenarioCar.updatedAt,
    car: scenarioCar.car ? {
      id: scenarioCar.car.id,
      railcarNumber: scenarioCar.car.railcarNumber,
      carType: scenarioCar.car.carType,
      isTankCar: scenarioCar.car.isTankCar,
      commodity: scenarioCar.car.commodity,
      customer: scenarioCar.car.customer,
      status: scenarioCar.car.status,
      shoppingStatus: scenarioCar.car.shoppingStatus,
      currentLocation: scenarioCar.car.currentLocation,
      homeRegion: scenarioCar.car.homeRegion,
      portfolio: scenarioCar.car.portfolio,
      tankQualification: scenarioCar.car.tankQualification?.toISOString?.() ?? scenarioCar.car.tankQualification ?? null,
      rule88B: scenarioCar.car.rule88B?.toISOString?.() ?? scenarioCar.car.rule88B ?? null,
      safetyRelief: scenarioCar.car.safetyRelief?.toISOString?.() ?? scenarioCar.car.safetyRelief ?? null,
    } : undefined,
    shop: scenarioCar.shop ? {
      id: scenarioCar.shop.id,
      name: scenarioCar.shop.name,
      code: scenarioCar.shop.code,
      region: scenarioCar.shop.region,
      tankQualified: scenarioCar.shop.tankQualified,
    } : undefined,
    suggestedShop: scenarioCar.suggestedShop ? {
      id: scenarioCar.suggestedShop.id,
      name: scenarioCar.suggestedShop.name,
      code: scenarioCar.suggestedShop.code,
      region: scenarioCar.suggestedShop.region,
      tankQualified: scenarioCar.suggestedShop.tankQualified,
    } : undefined,
  };
}

/**
 * Transform a scenario modification
 */
export function toScenarioModificationDTO(mod: any): ScenarioModificationDTO {
  return {
    id: mod.id,
    scenarioId: mod.scenarioId,
    type: mod.type,
    targetId: mod.targetId,
    changes: safeParseJson(mod.changes, {}),
    createdAt: mod.createdAt?.toISOString?.() ?? mod.createdAt,
  };
}

/**
 * Transform a scenario customer
 */
export function toScenarioCustomerDTO(sc: any): ScenarioCustomerDTO {
  return {
    id: sc.id,
    scenarioId: sc.scenarioId,
    customerId: sc.customerId,
    isPrimary: sc.isPrimary,
    customer: {
      id: sc.customer?.id ?? '',
      name: sc.customer?.name ?? '',
      code: sc.customer?.code ?? '',
    },
  };
}

/**
 * Transform a qualification scenario to list item
 */
export function toQualificationScenarioListItemDTO(scenario: any): QualificationScenarioListItemDTO {
  return {
    id: scenario.id,
    name: scenario.name,
    description: scenario.description,
    scenarioType: scenario.scenarioType,
    status: scenario.status,
    planningHorizonMonths: scenario.planningHorizonMonths,
    lateReleasePercent: scenario.lateReleasePercent,
    isApproved: scenario.isApproved,
    parentScenarioId: scenario.parentScenarioId,
    createdBy: scenario.createdBy,
    createdAt: scenario.createdAt?.toISOString?.() ?? scenario.createdAt,
    updatedAt: scenario.updatedAt?.toISOString?.() ?? scenario.updatedAt,
  };
}
