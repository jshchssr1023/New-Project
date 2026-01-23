/**
 * Shop Allocation Validator Service
 *
 * Implements the validation gatekeeper for car-to-shop allocations.
 * Core logic: IF (Car.Reason IN Shop.Capabilities) AND (Shop.Monthly_Capacity > 0) THEN ALLOW ELSE BLOCK
 *
 * This service inverts the traditional model where rules are assigned to cars.
 * Now shops declare their capabilities and the allocation engine validates against them.
 */

import { prisma } from './db';
import logger from '../utils/logger';

type PrismaClient = typeof prisma;

// Types for validation
export interface CarForValidation {
  id: string;
  railcarNumber: string;
  carType: string;
  isTankCar: boolean;
  commodity: string;
  customer: string;
  customerId?: string;
  isJacketed?: boolean;
  isLined?: boolean;
  liningType?: string;
  reasonsShopped?: string;
  shoppingStatus?: string;
}

export interface ShopForValidation {
  id: string;
  code: string;
  name: string;
  region?: string;
  isAitxInternal: boolean;
  tankQualified: boolean;
  capacity: number;
  isActive: boolean;
  capabilityProfile?: ShopCapabilityProfile | null;
}

export interface ShopCapabilityProfile {
  id: string;
  shopId: string;

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
  allowedAssetClasses: string;
  maxCarLength?: number | null;
  maxCarWeight?: number | null;
  hasJacketedCarSupport: boolean;
  hasLinedCarSupport: boolean;
  allowedLiningTypes: string;

  // Hazmat
  hazmatCertifications: string;
  restrictedCommodities: string;
  allowedCommodities: string;

  // Customer
  preferredCustomers: string;
  excludedCustomers: string;
  isContractShop: boolean;

  // Capacity
  monthlyCapacity: number;
  maxConcurrentCars: number;

  // 3P Commitment
  hasContractualCommitment: boolean;
  annualCommittedVolume: number;
  commitmentPenaltyRate: number;
}

export interface ValidationResult {
  isEligible: boolean;
  blockers: ValidationBlocker[];
  warnings: ValidationWarning[];
  score: number; // 0-100 eligibility score
  capacityAvailable: number;
  recommendation: 'recommended' | 'eligible' | 'warning' | 'blocked';
}

export interface ValidationBlocker {
  code: string;
  message: string;
  severity: 'critical' | 'hard';
}

export interface ValidationWarning {
  code: string;
  message: string;
  severity: 'medium' | 'low';
}

export interface AllocationValidationRequest {
  carId: string;
  shopId: string;
  plannedMonth: number;
  plannedYear: number;
  workType?: string;
}

export interface BulkValidationResult {
  carId: string;
  shopId: string;
  result: ValidationResult;
}

// Map shopping reasons to capability requirements
const REASON_TO_CAPABILITY_MAP: Record<string, keyof ShopCapabilityProfile> = {
  'Tank Qualification Due': 'canPerformFullQualification',
  'Tank Qual Due': 'canPerformFullQualification',
  'Full Qualification': 'canPerformFullQualification',
  'Partial Qualification': 'canPerformPartialQual',
  'Rule 88B Due': 'canPerformRule88B',
  'Rule 88B': 'canPerformRule88B',
  'Safety Relief Due': 'canPerformSafetyRelief',
  'Safety Relief': 'canPerformSafetyRelief',
  'Stub Sill Due': 'canPerformStubSill',
  'Stub Sill': 'canPerformStubSill',
  'Tank Thickness Due': 'canPerformTankThickness',
  'Tank Thickness': 'canPerformTankThickness',
  'Tank Lining': 'canPerformTankLining',
  'Interior Lining': 'canPerformTankLining',
  'Service Equipment': 'canPerformServiceEquipment',
  'Annual Qualification': 'canPerformAnnualQuals',
  'Repair': 'canPerformRepairs',
  'Repairs': 'canPerformRepairs',
};

// Asset class normalization
const ASSET_CLASS_ALIASES: Record<string, string> = {
  'tank': 'Tank',
  'tank car': 'Tank',
  'tankcar': 'Tank',
  'hopper': 'Hopper',
  'hopper car': 'Hopper',
  'boxcar': 'Boxcar',
  'box car': 'Boxcar',
  'gondola': 'Gondola',
  'flatcar': 'Flatcar',
  'flat car': 'Flatcar',
};

/**
 * Safely parse JSON fields with fallback to empty array/object
 */
function safeParseJson<T>(jsonString: string | null | undefined, fallback: T): T {
  if (!jsonString) return fallback;
  try {
    return JSON.parse(jsonString);
  } catch {
    return fallback;
  }
}

/**
 * Normalize asset class string to standard format
 */
function normalizeAssetClass(carType: string): string {
  const lower = carType.toLowerCase().trim();
  return ASSET_CLASS_ALIASES[lower] || carType;
}

/**
 * Extract shopping reasons from car data
 */
function extractShoppingReasons(car: CarForValidation): string[] {
  if (!car.reasonsShopped) return [];

  // Handle both comma-separated string and JSON array
  try {
    const parsed = JSON.parse(car.reasonsShopped);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Not JSON, treat as comma-separated string
  }

  return car.reasonsShopped.split(',').map(r => r.trim()).filter(Boolean);
}

/**
 * Validate a single car-shop allocation
 */
export async function validateAllocation(
  prisma: PrismaClient,
  car: CarForValidation,
  shop: ShopForValidation,
  monthCapacityUsed: number,
  companyId: string
): Promise<ValidationResult> {
  const blockers: ValidationBlocker[] = [];
  const warnings: ValidationWarning[] = [];
  let score = 100;

  // Get or use provided capability profile
  let profile = shop.capabilityProfile;
  if (!profile) {
    profile = await prisma.shopCapabilityProfile.findUnique({
      where: { shopId: shop.id }
    }) as ShopCapabilityProfile | null;
  }

  // If no profile exists, use shop's basic fields for validation
  if (!profile) {
    return validateWithBasicShopFields(car, shop, monthCapacityUsed);
  }

  // =========================================================================
  // BLOCKER CHECKS (Hard stops - allocation not allowed)
  // =========================================================================

  // 1. Shop not active
  if (!shop.isActive) {
    blockers.push({
      code: 'SHOP_INACTIVE',
      message: `Shop ${shop.name} is not active`,
      severity: 'critical',
    });
  }

  // 2. Tank car to non-tank-qualified shop
  if (car.isTankCar && !shop.tankQualified) {
    blockers.push({
      code: 'TANK_NOT_QUALIFIED',
      message: `Shop ${shop.name} is not qualified for tank cars`,
      severity: 'critical',
    });
    score -= 100;
  }

  // 3. Capability match for shopping reason
  const shoppingReasons = extractShoppingReasons(car);
  for (const reason of shoppingReasons) {
    const capabilityKey = REASON_TO_CAPABILITY_MAP[reason];
    if (capabilityKey && profile[capabilityKey] === false) {
      blockers.push({
        code: 'MISSING_CAPABILITY',
        message: `Shop ${shop.name} cannot perform: ${reason}`,
        severity: 'hard',
      });
      score -= 50;
    }
  }

  // 4. Asset class compatibility
  const allowedAssetClasses = safeParseJson<string[]>(profile.allowedAssetClasses, []);
  if (allowedAssetClasses.length > 0) {
    const normalizedCarType = normalizeAssetClass(car.carType);
    if (!allowedAssetClasses.includes(normalizedCarType)) {
      blockers.push({
        code: 'ASSET_CLASS_NOT_ALLOWED',
        message: `Shop ${shop.name} does not handle ${car.carType} cars`,
        severity: 'hard',
      });
      score -= 50;
    }
  }

  // 5. Jacketed car support
  if (car.isJacketed && !profile.hasJacketedCarSupport) {
    blockers.push({
      code: 'JACKETED_NOT_SUPPORTED',
      message: `Shop ${shop.name} cannot handle jacketed cars`,
      severity: 'hard',
    });
    score -= 40;
  }

  // 6. Lined car support
  if (car.isLined && !profile.hasLinedCarSupport) {
    blockers.push({
      code: 'LINED_NOT_SUPPORTED',
      message: `Shop ${shop.name} cannot handle lined cars`,
      severity: 'hard',
    });
    score -= 40;
  }

  // 7. Lining type support
  if (car.liningType && car.liningType !== '') {
    const allowedLiningTypes = safeParseJson<string[]>(profile.allowedLiningTypes, []);
    if (allowedLiningTypes.length > 0 && !allowedLiningTypes.includes(car.liningType)) {
      blockers.push({
        code: 'LINING_TYPE_NOT_SUPPORTED',
        message: `Shop ${shop.name} cannot handle ${car.liningType} lining`,
        severity: 'hard',
      });
      score -= 30;
    }
  }

  // 8. Restricted commodity
  const restrictedCommodities = safeParseJson<string[]>(profile.restrictedCommodities, []);
  if (car.commodity && restrictedCommodities.length > 0) {
    const commodityLower = car.commodity.toLowerCase();
    if (restrictedCommodities.some(c => commodityLower.includes(c.toLowerCase()))) {
      blockers.push({
        code: 'COMMODITY_RESTRICTED',
        message: `Shop ${shop.name} cannot handle commodity: ${car.commodity}`,
        severity: 'hard',
      });
      score -= 50;
    }
  }

  // 9. Allowed commodity check (if whitelist is defined)
  const allowedCommodities = safeParseJson<string[]>(profile.allowedCommodities, []);
  if (car.commodity && allowedCommodities.length > 0) {
    const commodityLower = car.commodity.toLowerCase();
    if (!allowedCommodities.some(c => commodityLower.includes(c.toLowerCase()))) {
      blockers.push({
        code: 'COMMODITY_NOT_IN_ALLOWED_LIST',
        message: `Shop ${shop.name} only handles specific commodities`,
        severity: 'hard',
      });
      score -= 40;
    }
  }

  // 10. Excluded customer
  const excludedCustomers = safeParseJson<string[]>(profile.excludedCustomers, []);
  const customerCode = car.customer || '';
  if (excludedCustomers.length > 0 && excludedCustomers.includes(customerCode)) {
    blockers.push({
      code: 'CUSTOMER_EXCLUDED',
      message: `Shop ${shop.name} does not serve customer: ${customerCode}`,
      severity: 'hard',
    });
    score -= 100;
  }

  // 11. Contract shop exclusivity
  if (profile.isContractShop) {
    const preferredCustomers = safeParseJson<string[]>(profile.preferredCustomers, []);
    if (preferredCustomers.length > 0 && !preferredCustomers.includes(customerCode)) {
      blockers.push({
        code: 'CONTRACT_SHOP_EXCLUSIVE',
        message: `Shop ${shop.name} is exclusive to contract customers`,
        severity: 'hard',
      });
      score -= 100;
    }
  }

  // 12. Capacity check
  const capacityAvailable = profile.monthlyCapacity - monthCapacityUsed;
  if (capacityAvailable <= 0) {
    blockers.push({
      code: 'NO_CAPACITY',
      message: `Shop ${shop.name} has no capacity available (${monthCapacityUsed}/${profile.monthlyCapacity})`,
      severity: 'hard',
    });
    score -= 100;
  }

  // =========================================================================
  // WARNING CHECKS (Soft issues - allocation allowed but flagged)
  // =========================================================================

  // 1. Low capacity warning
  if (capacityAvailable > 0 && capacityAvailable <= 2) {
    warnings.push({
      code: 'LOW_CAPACITY',
      message: `Shop ${shop.name} has limited capacity (${capacityAvailable} slots remaining)`,
      severity: 'medium',
    });
    score -= 10;
  }

  // 2. Preferred customer bonus
  const preferredCustomers = safeParseJson<string[]>(profile.preferredCustomers, []);
  if (preferredCustomers.includes(customerCode)) {
    score += 15; // Bonus for preferred customer match
  }

  // 3. 3P commitment incentive
  if (profile.hasContractualCommitment && !shop.isAitxInternal) {
    score += 10; // Slight bonus for filling 3P commitments
  }

  // Normalize score to 0-100 range
  score = Math.max(0, Math.min(100, score));

  // Determine recommendation
  let recommendation: ValidationResult['recommendation'];
  if (blockers.length > 0) {
    recommendation = 'blocked';
  } else if (warnings.length > 0) {
    recommendation = 'warning';
  } else if (score >= 80) {
    recommendation = 'recommended';
  } else {
    recommendation = 'eligible';
  }

  return {
    isEligible: blockers.length === 0,
    blockers,
    warnings,
    score,
    capacityAvailable: Math.max(0, capacityAvailable),
    recommendation,
  };
}

/**
 * Fallback validation when no capability profile exists
 */
function validateWithBasicShopFields(
  car: CarForValidation,
  shop: ShopForValidation,
  monthCapacityUsed: number
): ValidationResult {
  const blockers: ValidationBlocker[] = [];
  const warnings: ValidationWarning[] = [];
  let score = 70; // Start lower when no profile

  // Basic checks
  if (!shop.isActive) {
    blockers.push({
      code: 'SHOP_INACTIVE',
      message: `Shop ${shop.name} is not active`,
      severity: 'critical',
    });
  }

  if (car.isTankCar && !shop.tankQualified) {
    blockers.push({
      code: 'TANK_NOT_QUALIFIED',
      message: `Shop ${shop.name} is not qualified for tank cars`,
      severity: 'critical',
    });
    score -= 100;
  }

  const capacityAvailable = shop.capacity - monthCapacityUsed;
  if (capacityAvailable <= 0) {
    blockers.push({
      code: 'NO_CAPACITY',
      message: `Shop ${shop.name} has no capacity available`,
      severity: 'hard',
    });
    score -= 100;
  }

  warnings.push({
    code: 'NO_CAPABILITY_PROFILE',
    message: `Shop ${shop.name} has no capability profile configured`,
    severity: 'low',
  });

  score = Math.max(0, Math.min(100, score));

  return {
    isEligible: blockers.length === 0,
    blockers,
    warnings,
    score,
    capacityAvailable: Math.max(0, capacityAvailable),
    recommendation: blockers.length > 0 ? 'blocked' : 'warning',
  };
}

/**
 * Validate multiple car-shop allocations in bulk
 */
export async function validateBulkAllocations(
  prisma: PrismaClient,
  requests: AllocationValidationRequest[],
  companyId: string
): Promise<BulkValidationResult[]> {
  // Get all unique car and shop IDs
  const carIds = [...new Set(requests.map(r => r.carId))];
  const shopIds = [...new Set(requests.map(r => r.shopId))];

  // Fetch all cars
  const cars = await prisma.car.findMany({
    where: {
      id: { in: carIds },
      companyId,
    },
  });
  const carMap = new Map<string, CarForValidation>(cars.map(c => [c.id as string, c as CarForValidation]));

  // Fetch all shops with capability profiles
  const shops = await prisma.shop.findMany({
    where: {
      id: { in: shopIds },
      companyId,
    },
    include: {
      capabilityProfile: true,
    },
  });
  const shopMap = new Map<string, ShopForValidation>(shops.map(s => [s.id as string, s as unknown as ShopForValidation]));

  // Get capacity usage for each shop-month combination
  const monthKeys = [...new Set(requests.map(r => `${r.plannedYear}-${String(r.plannedMonth).padStart(2, '0')}`))];
  const capacityUsage = await prisma.planAssignment.groupBy({
    by: ['shopId', 'scheduledMonth'],
    where: {
      shopId: { in: shopIds },
      scheduledMonth: { in: monthKeys },
    },
    _count: { id: true },
  });

  const capacityMap = new Map<string, number>();
  capacityUsage.forEach(cu => {
    capacityMap.set(`${cu.shopId}-${cu.scheduledMonth}`, cu._count.id);
  });

  // Validate each request
  const results: BulkValidationResult[] = [];

  for (const request of requests) {
    const car = carMap.get(request.carId);
    const shop = shopMap.get(request.shopId);

    if (!car || !shop) {
      results.push({
        carId: request.carId,
        shopId: request.shopId,
        result: {
          isEligible: false,
          blockers: [{
            code: 'NOT_FOUND',
            message: car ? 'Shop not found' : 'Car not found',
            severity: 'critical',
          }],
          warnings: [],
          score: 0,
          capacityAvailable: 0,
          recommendation: 'blocked',
        },
      });
      continue;
    }

    const monthKey = `${request.plannedYear}-${String(request.plannedMonth).padStart(2, '0')}`;
    const monthCapacityUsed = capacityMap.get(`${shop.id}-${monthKey}`) || 0;

    const result = await validateAllocation(prisma, car, shop, monthCapacityUsed, companyId);
    results.push({
      carId: request.carId,
      shopId: request.shopId,
      result,
    });
  }

  return results;
}

/**
 * Get all eligible shops for a car
 */
export async function getEligibleShopsForCar(
  prisma: PrismaClient,
  carId: string,
  plannedMonth: number,
  plannedYear: number,
  companyId: string
): Promise<Array<{ shop: ShopForValidation; validation: ValidationResult }>> {
  // Get the car
  const car = await prisma.car.findFirst({
    where: { id: carId, companyId },
  }) as CarForValidation | null;

  if (!car) {
    throw new Error(`Car not found: ${carId}`);
  }

  // Get all active shops with capability profiles
  const shops = await prisma.shop.findMany({
    where: {
      companyId,
      isActive: true,
    },
    include: {
      capabilityProfile: true,
    },
  });

  // Get capacity usage for this month
  const monthKey = `${plannedYear}-${String(plannedMonth).padStart(2, '0')}`;
  const capacityUsage = await prisma.planAssignment.groupBy({
    by: ['shopId'],
    where: {
      shopId: { in: shops.map(s => s.id) },
      scheduledMonth: monthKey,
    },
    _count: { id: true },
  });

  const capacityMap = new Map<string, number>();
  capacityUsage.forEach(cu => {
    capacityMap.set(cu.shopId, cu._count.id);
  });

  // Validate each shop
  const results: Array<{ shop: ShopForValidation; validation: ValidationResult }> = [];

  for (const shop of shops) {
    const monthCapacityUsed = capacityMap.get(shop.id) || 0;
    const validation = await validateAllocation(
      prisma,
      car,
      shop as unknown as ShopForValidation,
      monthCapacityUsed,
      companyId
    );

    results.push({
      shop: shop as unknown as ShopForValidation,
      validation,
    });
  }

  // Sort by score descending, eligible first
  results.sort((a, b) => {
    if (a.validation.isEligible !== b.validation.isEligible) {
      return a.validation.isEligible ? -1 : 1;
    }
    return b.validation.score - a.validation.score;
  });

  return results;
}

export default {
  validateAllocation,
  validateBulkAllocations,
  getEligibleShopsForCar,
};
