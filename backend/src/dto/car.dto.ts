// =============================================================================
// Car Response DTOs
// Define the shape of car data returned by API endpoints
// =============================================================================

/**
 * Minimal car representation for list views
 */
export interface CarListItemDTO {
  id: string;
  railcarNumber: string;
  carType: string;
  isTankCar: boolean;
  commodity: string;
  customer: string;
  customerId: string | null;
  status: string;
  shoppingStatus: string;
  currentLocation: string;
  assignedShopId: string | null;
  projectedCompletionMonth: string;
  portfolio: boolean;
  homeRegion: string;
  updatedAt: string;
}

/**
 * Full car details for single car view
 */
export interface CarDetailDTO extends CarListItemDTO {
  projectNumber: string;
  reasonsShopped: string;
  performedTankQual: boolean;
  projectedCost: number;
  shopEntryDate: string | null;
  arrivalDate: string | null;
  daysInShop: number;
  lastServiceDate: string | null;
  nextServiceDue: string | null;
  originRegion: string;
  notes: string;
  contractNumber: string;
  contractExpiration: string | null;
  isJacketed: boolean;
  isLined: boolean;
  buildYear: number | null;
  qualificationType: string;
  tankQualified: boolean;
  performScheduled: boolean;
  planStatus: string;
  // Reference fields
  csr: string;
  csl: string;
  commercial: string;
  liningType: string;
  carMark: string;
  carNumber: string;
  fmsLesseeNumber: string;
  pastRegion: string;
  region2026: string;
  // Qualification dates
  minNoLining: string | null;
  minWLining: string | null;
  interiorLining: string | null;
  rule88B: string | null;
  safetyRelief: string | null;
  serviceEquipment: string | null;
  stubSill: string | null;
  tankThickness: string | null;
  tankQualification: string | null;
  // Metadata
  createdAt: string;
  // Relations
  customerRef?: CustomerSummaryDTO | null;
  eligibleShops?: ShopEligibilityDTO[];
  activeAssignment?: CarAssignmentDTO | null;
}

/**
 * Customer summary for car relations
 */
export interface CustomerSummaryDTO {
  id: string;
  name: string;
  code: string;
}

/**
 * Shop eligibility for a car
 */
export interface ShopEligibilityDTO {
  shopId: string;
  shopName: string;
  shopCode: string;
  isEligible: boolean;
  notes: string;
}

/**
 * Active assignment for a car
 */
export interface CarAssignmentDTO {
  id: string;
  shopId: string;
  shopName: string;
  shopCode: string;
  plannedMonth: number;
  plannedYear: number;
  status: string;
  workType: string;
  priority: number;
}

/**
 * Car list response with pagination
 */
export interface CarListResponseDTO {
  data: CarListItemDTO[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  filters: {
    status?: string;
    shoppingStatus?: string;
    customer?: string;
    region?: string;
  };
}

/**
 * Bulk operation result
 */
export interface CarBulkOperationResultDTO {
  success: boolean;
  processed: number;
  failed: number;
  cars: CarListItemDTO[];
  errors?: Array<{
    carId: string;
    message: string;
  }>;
}

/**
 * Car import result
 */
export interface CarImportResultDTO {
  status: 'success' | 'partial_success' | 'failed';
  total: number;
  imported: number;
  updated: number;
  skipped: number;
  errors: Array<{
    row: number;
    field: string;
    message: string;
    value?: string;
  }>;
  warnings: Array<{
    row: number;
    field: string;
    message: string;
  }>;
}

// =============================================================================
// Transform Functions
// Convert database models to DTOs
// =============================================================================

/**
 * Transform a Prisma Car model to CarListItemDTO
 */
export function toCarListItemDTO(car: any): CarListItemDTO {
  return {
    id: car.id,
    railcarNumber: car.railcarNumber,
    carType: car.carType,
    isTankCar: car.isTankCar,
    commodity: car.commodity,
    customer: car.customer,
    customerId: car.customerId,
    status: car.status,
    shoppingStatus: car.shoppingStatus,
    currentLocation: car.currentLocation,
    assignedShopId: car.assignedShopId,
    projectedCompletionMonth: car.projectedCompletionMonth,
    portfolio: car.portfolio,
    homeRegion: car.homeRegion,
    updatedAt: car.updatedAt?.toISOString?.() ?? car.updatedAt,
  };
}

/**
 * Transform a Prisma Car model to CarDetailDTO
 */
export function toCarDetailDTO(car: any, options?: {
  customerRef?: any;
  eligibleShops?: any[];
  activeAssignment?: any;
}): CarDetailDTO {
  return {
    ...toCarListItemDTO(car),
    projectNumber: car.projectNumber,
    reasonsShopped: car.reasonsShopped,
    performedTankQual: car.performedTankQual,
    projectedCost: car.projectedCost,
    shopEntryDate: car.shopEntryDate?.toISOString?.() ?? car.shopEntryDate ?? null,
    arrivalDate: car.arrivalDate?.toISOString?.() ?? car.arrivalDate ?? null,
    daysInShop: car.daysInShop,
    lastServiceDate: car.lastServiceDate?.toISOString?.() ?? car.lastServiceDate ?? null,
    nextServiceDue: car.nextServiceDue?.toISOString?.() ?? car.nextServiceDue ?? null,
    originRegion: car.originRegion,
    notes: car.notes,
    contractNumber: car.contractNumber,
    contractExpiration: car.contractExpiration?.toISOString?.() ?? car.contractExpiration ?? null,
    isJacketed: car.isJacketed,
    isLined: car.isLined,
    buildYear: car.buildYear,
    qualificationType: car.qualificationType,
    tankQualified: car.tankQualified,
    performScheduled: car.performScheduled,
    planStatus: car.planStatus,
    csr: car.csr,
    csl: car.csl,
    commercial: car.commercial,
    liningType: car.liningType,
    carMark: car.carMark,
    carNumber: car.carNumber,
    fmsLesseeNumber: car.fmsLesseeNumber,
    pastRegion: car.pastRegion,
    region2026: car.region2026,
    minNoLining: car.minNoLining?.toISOString?.() ?? car.minNoLining ?? null,
    minWLining: car.minWLining?.toISOString?.() ?? car.minWLining ?? null,
    interiorLining: car.interiorLining?.toISOString?.() ?? car.interiorLining ?? null,
    rule88B: car.rule88B?.toISOString?.() ?? car.rule88B ?? null,
    safetyRelief: car.safetyRelief?.toISOString?.() ?? car.safetyRelief ?? null,
    serviceEquipment: car.serviceEquipment?.toISOString?.() ?? car.serviceEquipment ?? null,
    stubSill: car.stubSill?.toISOString?.() ?? car.stubSill ?? null,
    tankThickness: car.tankThickness?.toISOString?.() ?? car.tankThickness ?? null,
    tankQualification: car.tankQualification?.toISOString?.() ?? car.tankQualification ?? null,
    createdAt: car.createdAt?.toISOString?.() ?? car.createdAt,
    customerRef: options?.customerRef ? {
      id: options.customerRef.id,
      name: options.customerRef.name,
      code: options.customerRef.code,
    } : null,
    eligibleShops: options?.eligibleShops?.map((e) => ({
      shopId: e.shopId,
      shopName: e.shop?.name ?? '',
      shopCode: e.shop?.code ?? '',
      isEligible: e.isEligible,
      notes: e.notes,
    })),
    activeAssignment: options?.activeAssignment ? {
      id: options.activeAssignment.id,
      shopId: options.activeAssignment.shopId,
      shopName: options.activeAssignment.shop?.name ?? '',
      shopCode: options.activeAssignment.shop?.code ?? '',
      plannedMonth: options.activeAssignment.plannedMonth,
      plannedYear: options.activeAssignment.plannedYear,
      status: options.activeAssignment.status,
      workType: options.activeAssignment.workType ?? 'full_qualification',
      priority: options.activeAssignment.priority,
    } : null,
  };
}
