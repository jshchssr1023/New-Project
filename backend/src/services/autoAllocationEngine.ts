/**
 * Auto-Allocation Engine Service
 *
 * Implements high-velocity automated car-to-shop matching based on:
 * 1. Contractual Commitment Prioritization (3P first for take-or-pay obligations)
 * 2. Dynamic Urgency Scoring (regulatory deadlines, customer priority, proximity)
 * 3. Capability-based validation (shop-first constraints)
 */

import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';
import {
  validateAllocation,
  getEligibleShopsForCar,
  CarForValidation,
  ShopForValidation,
  ValidationResult,
} from './shopAllocationValidator';

// ============================================================================
// TYPES
// ============================================================================

export interface UrgencyScore {
  total: number;                    // 0-100 composite score
  components: {
    regulatoryDeadline: number;     // 0-40 based on days until due
    customerPriority: number;       // 0-25 based on customer tier
    logisticalProximity: number;    // 0-20 based on distance to capable shops
    revenueImpact: number;          // 0-15 based on contract value
  };
  shoppingStatus: string;
  daysUntilDue: number | null;
  urgencyLevel: 'critical' | 'high' | 'medium' | 'low';
}

export interface CarWithUrgency {
  car: CarForValidation;
  urgencyScore: UrgencyScore;
}

export interface ShopWithCapacity {
  shop: ShopForValidation;
  monthlyCapacity: number;
  currentUsage: number;
  availableCapacity: number;
  utilizationPercent: number;
  hasContractualCommitment: boolean;
  unfilledCommitment: number;        // How many more cars needed to meet commitment
  is3rdParty: boolean;
}

export interface AllocationRecommendation {
  carId: string;
  railcarNumber: string;
  recommendedShopId: string | null;
  recommendedShopName: string | null;
  alternativeShops: Array<{
    shopId: string;
    shopName: string;
    score: number;
    is3rdParty: boolean;
  }>;
  urgencyScore: UrgencyScore;
  validationResult: ValidationResult | null;
  allocationReason: string;
  priority: 'fill_3p_commitment' | 'regulatory_urgent' | 'customer_priority' | 'standard';
}

export interface AutoAllocationResult {
  success: boolean;
  allocations: AllocationRecommendation[];
  summary: {
    totalCars: number;
    allocated: number;
    unallocated: number;
    thirdPartyFilled: number;
    aitxFilled: number;
    urgentCarsHandled: number;
  };
  warnings: string[];
}

export interface AllocationConfig {
  prioritize3PCommitments: boolean;   // Fill 3P take-or-pay obligations first
  maxAllocationsPerRun: number;       // Limit for batch processing
  allowOverCapacity: boolean;         // Allow allocations to over-capacity shops (with warning)
  excludeShopIds?: string[];          // Shops to exclude from allocation
  targetMonth: number;
  targetYear: number;
}

// ============================================================================
// URGENCY SCORING
// ============================================================================

/**
 * Shopping status to base urgency score mapping
 */
const SHOPPING_STATUS_SCORES: Record<string, { base: number; level: UrgencyScore['urgencyLevel'] }> = {
  'Urgent': { base: 95, level: 'critical' },
  'Must Shop': { base: 75, level: 'high' },
  'Upcoming': { base: 50, level: 'medium' },
  'Compliant': { base: 20, level: 'low' },
  'In Shop': { base: 10, level: 'low' },
  'Planned': { base: 15, level: 'low' },
  'Unknown': { base: 30, level: 'medium' },
};

/**
 * Customer tier to priority score mapping (higher tier = higher priority)
 */
const CUSTOMER_TIER_SCORES: Record<number, number> = {
  1: 25,  // Tier 1 (Premium)
  2: 20,
  3: 15,
  4: 10,
  5: 5,   // Tier 5 (Standard)
};

/**
 * Calculate the earliest qualification due date from a car's qualification fields
 */
function getEarliestDueDate(car: any): Date | null {
  const qualDates = [
    car.minNoLining,
    car.minWLining,
    car.interiorLining,
    car.rule88B,
    car.safetyRelief,
    car.serviceEquipment,
    car.stubSill,
    car.tankThickness,
    car.tankQualification,
  ].filter(d => d != null).map(d => new Date(d));

  if (qualDates.length === 0) return null;

  return qualDates.reduce((earliest, date) =>
    date < earliest ? date : earliest
  );
}

/**
 * Calculate days until the earliest due date
 */
function calculateDaysUntilDue(car: any): number | null {
  const earliestDue = getEarliestDueDate(car);
  if (!earliestDue) return null;

  const today = new Date();
  const diffTime = earliestDue.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * Calculate regulatory deadline score (0-40)
 */
function calculateRegulatoryScore(daysUntilDue: number | null): number {
  if (daysUntilDue === null) return 20; // Unknown = medium priority

  if (daysUntilDue < 0) {
    // Overdue - maximum urgency
    return 40;
  } else if (daysUntilDue <= 30) {
    // Due within 30 days
    return 38 - (daysUntilDue * 0.2);
  } else if (daysUntilDue <= 90) {
    // Due within 90 days
    return 30 - ((daysUntilDue - 30) * 0.1);
  } else if (daysUntilDue <= 180) {
    // Due within 6 months
    return 24 - ((daysUntilDue - 90) * 0.05);
  } else if (daysUntilDue <= 365) {
    // Due within 1 year
    return 15 - ((daysUntilDue - 180) * 0.02);
  } else {
    // More than 1 year out
    return 5;
  }
}

/**
 * Calculate customer priority score (0-25)
 */
function calculateCustomerPriorityScore(customerTier: number | undefined): number {
  const tier = customerTier || 5; // Default to standard tier
  return CUSTOMER_TIER_SCORES[tier] || 5;
}

/**
 * Calculate logistical proximity score (0-20)
 * Based on whether the car's home region matches shop regions
 */
function calculateProximityScore(
  car: any,
  eligibleShopCount: number,
  sameRegionShopCount: number
): number {
  if (eligibleShopCount === 0) return 0;

  // Higher score if there are nearby eligible shops
  const proximityRatio = sameRegionShopCount / eligibleShopCount;

  if (sameRegionShopCount > 0) {
    return 10 + (proximityRatio * 10); // 10-20 if same region shops available
  } else if (eligibleShopCount >= 3) {
    return 8; // Multiple options but not in region
  } else if (eligibleShopCount >= 1) {
    return 5; // Limited options
  } else {
    return 0; // No eligible shops
  }
}

/**
 * Calculate revenue impact score (0-15)
 * Based on estimated cost/value of the car service
 */
function calculateRevenueScore(car: any): number {
  const projectedCost = car.projectedCost || car.estimatedCost || 0;

  // Higher cost = higher priority (more revenue at stake)
  if (projectedCost >= 50000) return 15;
  if (projectedCost >= 30000) return 12;
  if (projectedCost >= 20000) return 10;
  if (projectedCost >= 10000) return 7;
  if (projectedCost >= 5000) return 5;
  return 3;
}

/**
 * Calculate complete urgency score for a car
 */
export function calculateUrgencyScore(
  car: any,
  eligibleShopCount: number = 5,
  sameRegionShopCount: number = 2
): UrgencyScore {
  const daysUntilDue = calculateDaysUntilDue(car);
  const shoppingStatus = car.shoppingStatus || 'Unknown';
  const statusInfo = SHOPPING_STATUS_SCORES[shoppingStatus] || SHOPPING_STATUS_SCORES['Unknown'];

  const regulatoryDeadline = calculateRegulatoryScore(daysUntilDue);
  const customerPriority = calculateCustomerPriorityScore(car.customerTier);
  const logisticalProximity = calculateProximityScore(car, eligibleShopCount, sameRegionShopCount);
  const revenueImpact = calculateRevenueScore(car);

  const total = regulatoryDeadline + customerPriority + logisticalProximity + revenueImpact;

  // Determine urgency level based on total score
  let urgencyLevel: UrgencyScore['urgencyLevel'];
  if (total >= 80) {
    urgencyLevel = 'critical';
  } else if (total >= 60) {
    urgencyLevel = 'high';
  } else if (total >= 40) {
    urgencyLevel = 'medium';
  } else {
    urgencyLevel = 'low';
  }

  return {
    total: Math.min(100, Math.max(0, total)),
    components: {
      regulatoryDeadline,
      customerPriority,
      logisticalProximity,
      revenueImpact,
    },
    shoppingStatus,
    daysUntilDue,
    urgencyLevel,
  };
}

// ============================================================================
// SHOP CAPACITY & COMMITMENT TRACKING
// ============================================================================

/**
 * Get shops with their capacity and commitment status
 */
async function getShopsWithCapacity(
  prisma: PrismaClient,
  companyId: string,
  targetMonth: number,
  targetYear: number,
  excludeShopIds: string[] = []
): Promise<ShopWithCapacity[]> {
  const monthKey = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;

  // Get all active shops with capability profiles
  const shops = await prisma.shop.findMany({
    where: {
      companyId,
      isActive: true,
      id: { notIn: excludeShopIds },
    },
    include: {
      capabilityProfile: true,
    },
  });

  // Get current usage for the target month
  const usageData = await prisma.planAssignment.groupBy({
    by: ['shopId'],
    where: {
      shopId: { in: shops.map(s => s.id) },
      scheduledMonth: monthKey,
    },
    _count: { id: true },
  });

  const usageMap = new Map(usageData.map(u => [u.shopId, u._count.id]));

  // Get S&OP commitments for the target month
  const commitments = await prisma.sOPCommitment.findMany({
    where: {
      shopId: { in: shops.map(s => s.id) },
      year: targetYear,
      month: targetMonth,
    },
  });

  const commitmentMap = new Map(commitments.map(c => [c.shopId, c]));

  return shops.map(shop => {
    const profile = shop.capabilityProfile;
    const monthlyCapacity = profile?.monthlyCapacity || shop.capacity || 50;
    const currentUsage = usageMap.get(shop.id) || 0;
    const availableCapacity = monthlyCapacity - currentUsage;
    const commitment = commitmentMap.get(shop.id);

    let unfilledCommitment = 0;
    if (commitment && profile?.hasContractualCommitment) {
      unfilledCommitment = Math.max(0, commitment.committedVolume - currentUsage);
    }

    return {
      shop: shop as unknown as ShopForValidation,
      monthlyCapacity,
      currentUsage,
      availableCapacity: Math.max(0, availableCapacity),
      utilizationPercent: Math.round((currentUsage / monthlyCapacity) * 100),
      hasContractualCommitment: profile?.hasContractualCommitment || false,
      unfilledCommitment,
      is3rdParty: !shop.isAitxInternal,
    };
  });
}

// ============================================================================
// AUTO-ALLOCATION ENGINE
// ============================================================================

/**
 * Run the auto-allocation engine
 */
export async function runAutoAllocation(
  prisma: PrismaClient,
  companyId: string,
  config: AllocationConfig
): Promise<AutoAllocationResult> {
  const warnings: string[] = [];
  const allocations: AllocationRecommendation[] = [];

  try {
    // Step 1: Get unassigned cars that need shopping
    const unassignedCars = await prisma.car.findMany({
      where: {
        companyId,
        OR: [
          { shoppingStatus: 'Urgent' },
          { shoppingStatus: 'Must Shop' },
          { shoppingStatus: 'Upcoming' },
        ],
        assignedShopId: null, // Not already assigned
        status: { notIn: ['Complete', 'In Shop', 'Arrived'] },
      },
      take: config.maxAllocationsPerRun,
    });

    if (unassignedCars.length === 0) {
      return {
        success: true,
        allocations: [],
        summary: {
          totalCars: 0,
          allocated: 0,
          unallocated: 0,
          thirdPartyFilled: 0,
          aitxFilled: 0,
          urgentCarsHandled: 0,
        },
        warnings: ['No unassigned cars found requiring allocation'],
      };
    }

    // Step 2: Get shops with capacity
    const shopsWithCapacity = await getShopsWithCapacity(
      prisma,
      companyId,
      config.targetMonth,
      config.targetYear,
      config.excludeShopIds
    );

    if (shopsWithCapacity.length === 0) {
      return {
        success: false,
        allocations: [],
        summary: {
          totalCars: unassignedCars.length,
          allocated: 0,
          unallocated: unassignedCars.length,
          thirdPartyFilled: 0,
          aitxFilled: 0,
          urgentCarsHandled: 0,
        },
        warnings: ['No active shops with capacity available'],
      };
    }

    // Step 3: Calculate urgency scores for all cars
    const carsWithUrgency: CarWithUrgency[] = unassignedCars.map(car => {
      // Count eligible shops for proximity scoring
      const eligibleShops = shopsWithCapacity.filter(s =>
        s.availableCapacity > 0 &&
        (!car.isTankCar || s.shop.tankQualified)
      );
      const sameRegionShops = eligibleShops.filter(s =>
        s.shop.region === car.homeRegion || s.shop.region === car.originRegion
      );

      return {
        car: car as unknown as CarForValidation,
        urgencyScore: calculateUrgencyScore(
          car,
          eligibleShops.length,
          sameRegionShops.length
        ),
      };
    });

    // Step 4: Sort cars by urgency (highest first)
    carsWithUrgency.sort((a, b) => b.urgencyScore.total - a.urgencyScore.total);

    // Step 5: Separate 3P shops with unfilled commitments
    const thirdPartyWithCommitments = shopsWithCapacity.filter(
      s => s.is3rdParty && s.hasContractualCommitment && s.unfilledCommitment > 0
    );

    // Step 6: Allocate cars
    const runningCapacity = new Map(
      shopsWithCapacity.map(s => [s.shop.id, s.availableCapacity])
    );
    const runningCommitments = new Map(
      thirdPartyWithCommitments.map(s => [s.shop.id, s.unfilledCommitment])
    );

    let allocated = 0;
    let thirdPartyFilled = 0;
    let aitxFilled = 0;
    let urgentCarsHandled = 0;

    for (const { car, urgencyScore } of carsWithUrgency) {
      let recommendedShop: ShopWithCapacity | null = null;
      let allocationReason = 'standard';
      let priority: AllocationRecommendation['priority'] = 'standard';

      // Priority 1: Fill 3P commitments first (if enabled)
      if (config.prioritize3PCommitments) {
        for (const shop of thirdPartyWithCommitments) {
          const remainingCommitment = runningCommitments.get(shop.shop.id) || 0;
          const remainingCapacity = runningCapacity.get(shop.shop.id) || 0;

          if (remainingCommitment > 0 && remainingCapacity > 0) {
            // Validate this car can go to this shop
            const validation = await validateAllocation(
              prisma,
              car,
              shop.shop,
              shop.currentUsage,
              companyId
            );

            if (validation.isEligible) {
              recommendedShop = shop;
              allocationReason = `Fill 3P take-or-pay commitment at ${shop.shop.name}`;
              priority = 'fill_3p_commitment';
              break;
            }
          }
        }
      }

      // Priority 2: If urgent, find the best available shop
      if (!recommendedShop && urgencyScore.urgencyLevel === 'critical') {
        const eligibleShops = await getEligibleShopsForCar(
          prisma,
          car.id,
          config.targetMonth,
          config.targetYear,
          companyId
        );

        // Filter to shops with capacity
        const availableShops = eligibleShops
          .filter(e => {
            const capacity = runningCapacity.get(e.shop.id) || 0;
            return e.validation.isEligible && capacity > 0;
          })
          .sort((a, b) => b.validation.score - a.validation.score);

        if (availableShops.length > 0) {
          const best = availableShops[0];
          recommendedShop = shopsWithCapacity.find(s => s.shop.id === best.shop.id) || null;
          allocationReason = `Urgent allocation (${urgencyScore.daysUntilDue} days until due)`;
          priority = 'regulatory_urgent';
        }
      }

      // Priority 3: Standard allocation - find best fit
      if (!recommendedShop) {
        const eligibleShops = await getEligibleShopsForCar(
          prisma,
          car.id,
          config.targetMonth,
          config.targetYear,
          companyId
        );

        // Filter to shops with capacity and sort by score
        const availableShops = eligibleShops
          .filter(e => {
            const capacity = runningCapacity.get(e.shop.id) || 0;
            return e.validation.isEligible && capacity > 0;
          })
          .sort((a, b) => {
            // Prefer 3P shops slightly to help fill commitments
            const a3PBonus = shopsWithCapacity.find(s => s.shop.id === a.shop.id)?.is3rdParty ? 5 : 0;
            const b3PBonus = shopsWithCapacity.find(s => s.shop.id === b.shop.id)?.is3rdParty ? 5 : 0;
            return (b.validation.score + b3PBonus) - (a.validation.score + a3PBonus);
          });

        if (availableShops.length > 0) {
          const best = availableShops[0];
          recommendedShop = shopsWithCapacity.find(s => s.shop.id === best.shop.id) || null;
          allocationReason = `Best fit shop (score: ${best.validation.score})`;
        }
      }

      // Build alternative shops list
      const eligibleShops = await getEligibleShopsForCar(
        prisma,
        car.id,
        config.targetMonth,
        config.targetYear,
        companyId
      );

      const alternativeShops = eligibleShops
        .filter(e => e.validation.isEligible && e.shop.id !== recommendedShop?.shop.id)
        .slice(0, 3)
        .map(e => ({
          shopId: e.shop.id,
          shopName: e.shop.name,
          score: e.validation.score,
          is3rdParty: !shopsWithCapacity.find(s => s.shop.id === e.shop.id)?.is3rdParty,
        }));

      // Update running capacity
      if (recommendedShop) {
        const currentCapacity = runningCapacity.get(recommendedShop.shop.id) || 0;
        runningCapacity.set(recommendedShop.shop.id, currentCapacity - 1);

        if (recommendedShop.is3rdParty) {
          const currentCommitment = runningCommitments.get(recommendedShop.shop.id) || 0;
          if (currentCommitment > 0) {
            runningCommitments.set(recommendedShop.shop.id, currentCommitment - 1);
          }
          thirdPartyFilled++;
        } else {
          aitxFilled++;
        }

        if (urgencyScore.urgencyLevel === 'critical') {
          urgentCarsHandled++;
        }

        allocated++;
      }

      allocations.push({
        carId: car.id,
        railcarNumber: car.railcarNumber,
        recommendedShopId: recommendedShop?.shop.id || null,
        recommendedShopName: recommendedShop?.shop.name || null,
        alternativeShops,
        urgencyScore,
        validationResult: recommendedShop ? {
          isEligible: true,
          blockers: [],
          warnings: [],
          score: 85,
          capacityAvailable: runningCapacity.get(recommendedShop.shop.id) || 0,
          recommendation: 'recommended',
        } : null,
        allocationReason: recommendedShop ? allocationReason : 'No eligible shop with capacity found',
        priority,
      });
    }

    return {
      success: true,
      allocations,
      summary: {
        totalCars: carsWithUrgency.length,
        allocated,
        unallocated: carsWithUrgency.length - allocated,
        thirdPartyFilled,
        aitxFilled,
        urgentCarsHandled,
      },
      warnings,
    };
  } catch (error) {
    logger.error('Auto-allocation engine error:', error);
    return {
      success: false,
      allocations: [],
      summary: {
        totalCars: 0,
        allocated: 0,
        unallocated: 0,
        thirdPartyFilled: 0,
        aitxFilled: 0,
        urgentCarsHandled: 0,
      },
      warnings: [`Engine error: ${error instanceof Error ? error.message : 'Unknown error'}`],
    };
  }
}

/**
 * Get prioritized unassigned queue with urgency scores
 */
export async function getUrgencyQueue(
  prisma: PrismaClient,
  companyId: string,
  limit: number = 100
): Promise<CarWithUrgency[]> {
  const unassignedCars = await prisma.car.findMany({
    where: {
      companyId,
      OR: [
        { shoppingStatus: 'Urgent' },
        { shoppingStatus: 'Must Shop' },
        { shoppingStatus: 'Upcoming' },
      ],
      assignedShopId: null,
      status: { notIn: ['Complete', 'In Shop', 'Arrived'] },
    },
    include: {
      customerRef: true,
    },
    take: limit * 2, // Get extra for filtering
  });

  const carsWithUrgency: CarWithUrgency[] = unassignedCars.map(car => ({
    car: car as unknown as CarForValidation,
    urgencyScore: calculateUrgencyScore(car),
  }));

  // Sort by urgency score descending
  carsWithUrgency.sort((a, b) => b.urgencyScore.total - a.urgencyScore.total);

  return carsWithUrgency.slice(0, limit);
}

export default {
  runAutoAllocation,
  getUrgencyQueue,
  calculateUrgencyScore,
};
