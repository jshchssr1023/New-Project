// =============================================================================
// Shop Response DTOs
// Define the shape of shop data returned by API endpoints
// =============================================================================

/**
 * Minimal shop representation for list views and dropdowns
 */
export interface ShopListItemDTO {
  id: string;
  name: string;
  code: string;
  location: string;
  city: string;
  state: string;
  region: string;
  network: string;
  tankQualified: boolean;
  isAitxInternal: boolean;
  capacity: number;
  currentLoad: number;
  isActive: boolean;
  isParent: boolean;
  networkTier: number;
}

/**
 * Full shop details for single shop view
 */
export interface ShopDetailDTO extends ShopListItemDTO {
  servingRailroad: string;
  latitude: number | null;
  longitude: number | null;
  networkId: string | null;
  parentShopId: string | null;
  annualTargetVolume: number;
  shopStatus: string;
  utilizationTarget: number;
  baseCostPerCar: number;
  laborRate: number;
  costIndex: number;
  baseTurnTime: number;
  turnTimeMultiplier: number;
  capabilities: string[];
  certifications: string[];
  preferredCustomers: string[];
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  notes: string;
  // S&OP capacity fields
  qualCapacity: number;
  assignCapacity: number;
  releaseCapacity: number;
  repairCapacity: number;
  efficiencyRating: number;
  // Metadata
  createdAt: string;
  updatedAt: string;
  // Relations
  monthlyCapacity?: MonthlyCapacityDTO[];
  parentShop?: ShopSummaryDTO | null;
  childShops?: ShopSummaryDTO[];
  shopNetwork?: ShopNetworkSummaryDTO | null;
  capabilityProfile?: ShopCapabilityProfileDTO | null;
}

/**
 * Shop summary for relations
 */
export interface ShopSummaryDTO {
  id: string;
  name: string;
  code: string;
  region: string;
  tankQualified: boolean;
}

/**
 * Monthly capacity data
 */
export interface MonthlyCapacityDTO {
  month: string; // YYYY-MM
  capacity: number;
  used: number;
  available: number;
  utilizationPercent: number;
}

/**
 * Shop network summary
 */
export interface ShopNetworkSummaryDTO {
  id: string;
  name: string;
  code: string;
  isAitxInternal: boolean;
}

/**
 * Shop capability profile
 */
export interface ShopCapabilityProfileDTO {
  id: string;
  // Certifications
  canPerformTankLining: boolean;
  canPerformAnnualQuals: boolean;
  canPerformRule88B: boolean;
  canPerformSafetyRelief: boolean;
  canPerformStubSill: boolean;
  canPerformTankThickness: boolean;
  canPerformFullQualification: boolean;
  canPerformPartialQual: boolean;
  canPerformRepairs: boolean;
  canPerformServiceEquipment: boolean;
  // Physical limits
  allowedAssetClasses: string[];
  maxCarLength: number | null;
  maxCarWeight: number | null;
  hasJacketedCarSupport: boolean;
  hasLinedCarSupport: boolean;
  allowedLiningTypes: string[];
  // Hazmat
  hazmatCertifications: string[];
  restrictedCommodities: string[];
  allowedCommodities: string[];
  // Customer restrictions
  preferredCustomers: string[];
  excludedCustomers: string[];
  isContractShop: boolean;
  // Capacity
  monthlyCapacity: number;
  maxConcurrentCars: number;
  // Commitment
  hasContractualCommitment: boolean;
  annualCommittedVolume: number;
  commitmentPenaltyRate: number;
}

/**
 * Batch capacity check response
 */
export interface BatchCapacityResponseDTO {
  shops: ShopSummaryDTO[];
  capacityData: Record<string, Record<string, MonthlyCapacityDTO>>;
}

/**
 * Shop recommendation from rule engine
 */
export interface ShopRecommendationDTO {
  shopId: string;
  shopName: string;
  shopCode: string;
  region: string;
  tankQualified: boolean;
  capacity: number;
  availableCapacity: number;
  score: number;
  reasons: string[];
  warnings?: string[];
}

/**
 * Shop list response with filters
 */
export interface ShopListResponseDTO {
  data: ShopListItemDTO[];
  filters: {
    region?: string;
    network?: string;
    isActive?: boolean;
    tankQualified?: boolean;
  };
}

// =============================================================================
// Transform Functions
// Convert database models to DTOs
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
 * Transform a Prisma Shop model to ShopListItemDTO
 */
export function toShopListItemDTO(shop: any): ShopListItemDTO {
  return {
    id: shop.id,
    name: shop.name,
    code: shop.code,
    location: shop.location,
    city: shop.city,
    state: shop.state,
    region: shop.region,
    network: shop.network,
    tankQualified: shop.tankQualified,
    isAitxInternal: shop.isAitxInternal,
    capacity: shop.capacity,
    currentLoad: shop.currentLoad ?? 0,
    isActive: shop.isActive,
    isParent: shop.isParent,
    networkTier: shop.networkTier,
  };
}

/**
 * Transform a Prisma Shop model to ShopDetailDTO
 */
export function toShopDetailDTO(shop: any, options?: {
  monthlyCapacity?: any[];
  parentShop?: any;
  childShops?: any[];
  shopNetwork?: any;
  capabilityProfile?: any;
}): ShopDetailDTO {
  return {
    ...toShopListItemDTO(shop),
    servingRailroad: shop.servingRailroad,
    latitude: shop.latitude,
    longitude: shop.longitude,
    networkId: shop.networkId,
    parentShopId: shop.parentShopId,
    annualTargetVolume: shop.annualTargetVolume,
    shopStatus: shop.shopStatus,
    utilizationTarget: shop.utilizationTarget,
    baseCostPerCar: shop.baseCostPerCar,
    laborRate: shop.laborRate,
    costIndex: shop.costIndex,
    baseTurnTime: shop.baseTurnTime,
    turnTimeMultiplier: shop.turnTimeMultiplier,
    capabilities: safeParseJson(shop.capabilities, []),
    certifications: safeParseJson(shop.certifications, []),
    preferredCustomers: safeParseJson(shop.preferredCustomers, []),
    contactName: shop.contactName,
    contactEmail: shop.contactEmail,
    contactPhone: shop.contactPhone,
    notes: shop.notes,
    qualCapacity: shop.qualCapacity,
    assignCapacity: shop.assignCapacity,
    releaseCapacity: shop.releaseCapacity,
    repairCapacity: shop.repairCapacity,
    efficiencyRating: shop.efficiencyRating,
    createdAt: shop.createdAt?.toISOString?.() ?? shop.createdAt,
    updatedAt: shop.updatedAt?.toISOString?.() ?? shop.updatedAt,
    monthlyCapacity: options?.monthlyCapacity?.map((mc) => ({
      month: mc.month,
      capacity: mc.capacity,
      used: mc.used,
      available: mc.available,
      utilizationPercent: mc.utilizationPercent,
    })),
    parentShop: options?.parentShop ? {
      id: options.parentShop.id,
      name: options.parentShop.name,
      code: options.parentShop.code,
      region: options.parentShop.region,
      tankQualified: options.parentShop.tankQualified,
    } : null,
    childShops: options?.childShops?.map((cs) => ({
      id: cs.id,
      name: cs.name,
      code: cs.code,
      region: cs.region,
      tankQualified: cs.tankQualified,
    })),
    shopNetwork: options?.shopNetwork ? {
      id: options.shopNetwork.id,
      name: options.shopNetwork.name,
      code: options.shopNetwork.code,
      isAitxInternal: options.shopNetwork.isAitxInternal,
    } : null,
    capabilityProfile: options?.capabilityProfile ? toCapabilityProfileDTO(options.capabilityProfile) : null,
  };
}

/**
 * Transform capability profile to DTO
 */
export function toCapabilityProfileDTO(profile: any): ShopCapabilityProfileDTO {
  return {
    id: profile.id,
    canPerformTankLining: profile.canPerformTankLining,
    canPerformAnnualQuals: profile.canPerformAnnualQuals,
    canPerformRule88B: profile.canPerformRule88B,
    canPerformSafetyRelief: profile.canPerformSafetyRelief,
    canPerformStubSill: profile.canPerformStubSill,
    canPerformTankThickness: profile.canPerformTankThickness,
    canPerformFullQualification: profile.canPerformFullQualification,
    canPerformPartialQual: profile.canPerformPartialQual,
    canPerformRepairs: profile.canPerformRepairs,
    canPerformServiceEquipment: profile.canPerformServiceEquipment,
    allowedAssetClasses: safeParseJson(profile.allowedAssetClasses, []),
    maxCarLength: profile.maxCarLength,
    maxCarWeight: profile.maxCarWeight,
    hasJacketedCarSupport: profile.hasJacketedCarSupport,
    hasLinedCarSupport: profile.hasLinedCarSupport,
    allowedLiningTypes: safeParseJson(profile.allowedLiningTypes, []),
    hazmatCertifications: safeParseJson(profile.hazmatCertifications, []),
    restrictedCommodities: safeParseJson(profile.restrictedCommodities, []),
    allowedCommodities: safeParseJson(profile.allowedCommodities, []),
    preferredCustomers: safeParseJson(profile.preferredCustomers, []),
    excludedCustomers: safeParseJson(profile.excludedCustomers, []),
    isContractShop: profile.isContractShop,
    monthlyCapacity: profile.monthlyCapacity,
    maxConcurrentCars: profile.maxConcurrentCars,
    hasContractualCommitment: profile.hasContractualCommitment,
    annualCommittedVolume: profile.annualCommittedVolume,
    commitmentPenaltyRate: profile.commitmentPenaltyRate,
  };
}
