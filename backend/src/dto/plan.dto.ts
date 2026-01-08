// =============================================================================
// Plan Response DTOs
// Define the shape of plan data returned by API endpoints
// =============================================================================

import { ShopSummaryDTO } from './shop.dto';
import { CustomerSummaryDTO } from './car.dto';

/**
 * Minimal plan representation for list views
 */
export interface PlanListItemDTO {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  status: string;
  assignmentCount: number;
  createdAt: string;
  updatedAt: string;
  creator: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

/**
 * Full plan details for single plan view
 */
export interface PlanDetailDTO extends Omit<PlanListItemDTO, 'assignmentCount'> {
  companyId: string;
  assignments: PlanAssignmentDTO[];
}

/**
 * Plan assignment DTO
 */
export interface PlanAssignmentDTO {
  id: string;
  planId: string;
  carId: string;
  shopId: string;
  scheduledMonth: string;
  estimatedCost: number;
  estimatedDuration: number;
  status: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  car?: CarAssignmentSummaryDTO;
  shop?: ShopSummaryDTO;
}

/**
 * Car summary for assignment
 */
export interface CarAssignmentSummaryDTO {
  id: string;
  railcarNumber: string;
  carType: string;
  customer: string;
  status: string;
}

/**
 * Plan grid data for scheduling view
 */
export interface PlanGridDTO {
  shops: ShopSummaryDTO[];
  months: string[];
  assignments: PlanAssignmentDTO[][];
}

// =============================================================================
// Master Plan DTOs
// =============================================================================

/**
 * Master plan list item
 */
export interface MasterPlanListItemDTO {
  id: string;
  version: number;
  name: string;
  description: string;
  validFrom: string;
  validTo: string | null;
  planningHorizonStart: string;
  planningHorizonEnd: string;
  status: string;
  carCount: number;
  shopCount: number;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

/**
 * Master plan detail
 */
export interface MasterPlanDetailDTO extends MasterPlanListItemDTO {
  snapshotTakenAt: string | null;
  parentPlanId: string | null;
  submittedAt: string | null;
  submittedBy: { id: string; firstName: string; lastName: string } | null;
  approvedAt: string | null;
  approvedBy: { id: string; firstName: string; lastName: string } | null;
  rejectionReason: string;
  commitments: MasterPlanCommitmentDTO[];
  childPlans?: MasterPlanListItemDTO[];
}

/**
 * Master plan commitment DTO
 */
export interface MasterPlanCommitmentDTO {
  id: string;
  masterPlanId: string;
  carId: string;
  shopId: string;
  customerId: string | null;
  plannedMonth: number;
  plannedYear: number;
  scheduledArrivalDate: string | null;
  scheduledCompletionDate: string | null;
  status: string;
  scheduledAt: string | null;
  confirmedByShop: boolean;
  confirmedByCustomer: boolean;
  qualificationEntryId: string | null;
  workType: string;
  shopReason: string;
  estimatedCost: number | null;
  estimatedDays: number;
  actualCost: number | null;
  actualDays: number | null;
  priority: number;
  sourceType: string;
  actualArrivalDate: string | null;
  actualCompletionDate: string | null;
  committedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string;
  notes: string;
  createdAt: string;
  // Relations
  car?: CarAssignmentSummaryDTO;
  shop?: ShopSummaryDTO;
  customer?: CustomerSummaryDTO;
}

// =============================================================================
// Car Flow Plan DTOs
// =============================================================================

/**
 * Car flow plan list item
 */
export interface CarFlowPlanListItemDTO {
  id: string;
  carId: string;
  shopId: string;
  customerId: string | null;
  plannedMonth: number;
  plannedYear: number;
  status: string;
  source: string;
  shopReason: string;
  estimatedCost: number | null;
  priority: number;
  committedAt: string;
  createdAt: string;
  updatedAt: string;
  // Summary relations
  car?: CarAssignmentSummaryDTO;
  shop?: ShopSummaryDTO;
  customer?: CustomerSummaryDTO;
}

/**
 * Car flow plan detail
 */
export interface CarFlowPlanDetailDTO extends CarFlowPlanListItemDTO {
  sourceScenarioId: string | null;
  committedById: string;
  notes: string;
  cancelledAt: string | null;
  // Expanded relations
  committedBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
  sourceScenario?: {
    id: string;
    name: string;
    status: string;
  };
}

/**
 * Car flow plan summary grouped by month/shop
 */
export interface CarFlowPlanSummaryDTO {
  monthKey: string; // YYYY-MM
  year: number;
  month: number;
  shopBreakdown: Array<{
    shopId: string;
    shopName: string;
    shopCode: string;
    planned: number;
    inProgress: number;
    complete: number;
    cancelled: number;
    total: number;
  }>;
  totals: {
    planned: number;
    inProgress: number;
    complete: number;
    cancelled: number;
    total: number;
  };
}

// =============================================================================
// Transform Functions
// =============================================================================

/**
 * Transform a Prisma Plan model to PlanListItemDTO
 */
export function toPlanListItemDTO(plan: any): PlanListItemDTO {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    startDate: plan.startDate?.toISOString?.() ?? plan.startDate,
    endDate: plan.endDate?.toISOString?.() ?? plan.endDate,
    status: plan.status,
    assignmentCount: plan._count?.assignments ?? plan.assignmentCount ?? plan.assignments?.length ?? 0,
    createdAt: plan.createdAt?.toISOString?.() ?? plan.createdAt,
    updatedAt: plan.updatedAt?.toISOString?.() ?? plan.updatedAt,
    creator: {
      id: plan.creator?.id ?? '',
      firstName: plan.creator?.firstName ?? '',
      lastName: plan.creator?.lastName ?? '',
    },
  };
}

/**
 * Transform a Prisma Plan model to PlanDetailDTO
 */
export function toPlanDetailDTO(plan: any): PlanDetailDTO {
  const { assignmentCount, ...listItem } = toPlanListItemDTO(plan);
  return {
    ...listItem,
    companyId: plan.companyId,
    assignments: plan.assignments?.map(toAssignmentDTO) ?? [],
  };
}

/**
 * Transform a plan assignment
 */
export function toAssignmentDTO(assignment: any): PlanAssignmentDTO {
  return {
    id: assignment.id,
    planId: assignment.planId,
    carId: assignment.carId,
    shopId: assignment.shopId,
    scheduledMonth: assignment.scheduledMonth,
    estimatedCost: assignment.estimatedCost,
    estimatedDuration: assignment.estimatedDuration,
    status: assignment.status,
    notes: assignment.notes,
    createdAt: assignment.createdAt?.toISOString?.() ?? assignment.createdAt,
    updatedAt: assignment.updatedAt?.toISOString?.() ?? assignment.updatedAt,
    car: assignment.car ? {
      id: assignment.car.id,
      railcarNumber: assignment.car.railcarNumber,
      carType: assignment.car.carType,
      customer: assignment.car.customer,
      status: assignment.car.status,
    } : undefined,
    shop: assignment.shop ? {
      id: assignment.shop.id,
      name: assignment.shop.name,
      code: assignment.shop.code,
      region: assignment.shop.region,
      tankQualified: assignment.shop.tankQualified,
    } : undefined,
  };
}

/**
 * Transform a MasterPlan to list item DTO
 */
export function toMasterPlanListItemDTO(plan: any): MasterPlanListItemDTO {
  return {
    id: plan.id,
    version: plan.version,
    name: plan.name,
    description: plan.description,
    validFrom: plan.validFrom?.toISOString?.() ?? plan.validFrom,
    validTo: plan.validTo?.toISOString?.() ?? plan.validTo ?? null,
    planningHorizonStart: plan.planningHorizonStart?.toISOString?.() ?? plan.planningHorizonStart,
    planningHorizonEnd: plan.planningHorizonEnd?.toISOString?.() ?? plan.planningHorizonEnd,
    status: plan.status,
    carCount: plan.carCount,
    shopCount: plan.shopCount,
    createdAt: plan.createdAt?.toISOString?.() ?? plan.createdAt,
    updatedAt: plan.updatedAt?.toISOString?.() ?? plan.updatedAt,
    createdBy: {
      id: plan.createdBy?.id ?? '',
      firstName: plan.createdBy?.firstName ?? '',
      lastName: plan.createdBy?.lastName ?? '',
    },
  };
}

/**
 * Transform a CarFlowPlan to list item DTO
 */
export function toCarFlowPlanListItemDTO(plan: any): CarFlowPlanListItemDTO {
  return {
    id: plan.id,
    carId: plan.carId,
    shopId: plan.shopId,
    customerId: plan.customerId,
    plannedMonth: plan.plannedMonth,
    plannedYear: plan.plannedYear,
    status: plan.status,
    source: plan.source,
    shopReason: plan.shopReason,
    estimatedCost: plan.estimatedCost,
    priority: plan.priority,
    committedAt: plan.committedAt?.toISOString?.() ?? plan.committedAt,
    createdAt: plan.createdAt?.toISOString?.() ?? plan.createdAt,
    updatedAt: plan.updatedAt?.toISOString?.() ?? plan.updatedAt,
    car: plan.car ? {
      id: plan.car.id,
      railcarNumber: plan.car.railcarNumber,
      carType: plan.car.carType,
      customer: plan.car.customer,
      status: plan.car.status,
    } : undefined,
    shop: plan.shop ? {
      id: plan.shop.id,
      name: plan.shop.name,
      code: plan.shop.code,
      region: plan.shop.region,
      tankQualified: plan.shop.tankQualified,
    } : undefined,
    customer: plan.customer ? {
      id: plan.customer.id,
      name: plan.customer.name,
      code: plan.customer.code,
    } : undefined,
  };
}
