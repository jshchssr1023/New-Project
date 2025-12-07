/**
 * Consolidated Car Flow Planning Utilities
 *
 * This module provides unified utilities for S&OP, Car Flow, Qualification Demand,
 * and scheduling integration. Key features include:
 * - 120-Day planning horizon filter
 * - Capacity/Demand visualization helpers
 * - Car-to-shop allocation logic
 * - Scheduling workflow utilities
 * - Critical action items management
 * - Capacity confirmation status tracking
 * - Target vs. Actuals comparison
 * - Qualification deadline prioritization
 */

import type { Car, Shop } from '../types';
import type {
  AITXShop,
  ThirdPartyNetwork,
  MonthlyAllocation,
  SystemMetrics,
  Priority,
} from '../types/sop';

// =============================================================================
// CONSTANTS AND CONFIGURATION
// =============================================================================

/** Default 120-day planning horizon */
export const PLANNING_HORIZON_DAYS = 120;
export const PLANNING_HORIZON_MONTHS = 4; // ~120 days = 4 months

/** Utilization thresholds for visual alerts */
export const UTILIZATION_THRESHOLDS = {
  LOW: 0.50,
  MODERATE: 0.80,
  OPTIMAL: 0.95,
  WARNING: 1.0,
  CRITICAL: 1.0,
} as const;

/** Priority levels for qualification deadlines */
export const QUALIFICATION_PRIORITY = {
  CRITICAL: { daysUntil: 30, color: 'red', label: 'Critical' },
  HIGH: { daysUntil: 60, color: 'orange', label: 'High' },
  MEDIUM: { daysUntil: 90, color: 'yellow', label: 'Medium' },
  LOW: { daysUntil: 120, color: 'green', label: 'Low' },
  NORMAL: { daysUntil: Infinity, color: 'gray', label: 'Normal' },
} as const;

/** Capacity confirmation statuses */
export type CapacityConfirmationStatus = 'pending' | 'requested' | 'confirmed' | 'rejected';

/** Scheduling push statuses */
export type SchedulingPushStatus = 'draft' | 'ready' | 'locked' | 'pushed';

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

export interface PlanningHorizonConfig {
  days: number;
  startDate: Date;
  endDate: Date;
  months: string[];
  is120Day: boolean;
}

export interface UnassignedCar extends Car {
  urgencyScore: number;
  qualificationPriority: keyof typeof QUALIFICATION_PRIORITY;
  daysUntilQualDue: number | null;
  suggestedShops: ShopMatch[];
}

export interface ShopMatch {
  shopId: string;
  shopName: string;
  shopCode: string;
  matchScore: number;
  reasons: string[];
  availableCapacity: number;
  isRecommended: boolean;
}

export interface CapacityAlert {
  shopId: string;
  shopName: string;
  monthKey: string;
  plannedUtilization: number;
  targetUtilization: number;
  deviation: number;
  alertType: 'under' | 'over' | 'critical';
  actionRequired: string;
  linkTo: string;
}

export interface CriticalActionItem {
  id: string;
  type: 'forecast' | 'capacity' | 'qualification' | 'assignment' | 'approval';
  priority: Priority;
  title: string;
  description: string;
  dueDate?: string;
  isBlocking: boolean;
  relatedEntityId?: string;
  relatedEntityType?: string;
  actionLink?: string;
}

export interface ShopConfirmationRequest {
  shopId: string;
  shopName: string;
  monthKey: string;
  requestedCapacity: number;
  status: CapacityConfirmationStatus;
  requestedAt?: string;
  confirmedAt?: string;
  confirmedBy?: string;
  notes?: string;
}

export interface SchedulingOutput {
  id: string;
  status: SchedulingPushStatus;
  planningHorizonStart: string;
  planningHorizonEnd: string;
  assignments: SchedulingAssignment[];
  generatedAt?: string;
  pushedAt?: string;
  pushedBy?: string;
}

export interface SchedulingAssignment {
  carId: string;
  railcarNumber: string;
  shopId: string;
  shopName: string;
  plannedFlowInDate: string;
  targetCompletionDate: string;
  workScope: string[];
  priority: number;
  estimatedDays: number;
}

export interface TargetVsActual {
  monthKey: string;
  monthLabel: string;
  targetPlanned: number;
  actualFlowIn: number;
  actualCompleted: number;
  variance: number;
  variancePercent: number;
  status: 'on_track' | 'behind' | 'ahead';
}

export interface QualificationDeadline {
  carId: string;
  railcarNumber: string;
  customer: string;
  qualDueDate: string;
  daysUntilDue: number;
  priority: keyof typeof QUALIFICATION_PRIORITY;
  priorityColor: string;
  isOverdue: boolean;
  assignedShopId?: string;
  assignedShopName?: string;
}

// =============================================================================
// PLANNING HORIZON UTILITIES
// =============================================================================

/**
 * Generate 120-day planning horizon configuration
 */
export function get120DayPlanningHorizon(startDate?: Date): PlanningHorizonConfig {
  const start = startDate || new Date();
  const end = new Date(start);
  end.setDate(end.getDate() + PLANNING_HORIZON_DAYS);

  const months: string[] = [];
  const current = new Date(start);
  while (current <= end) {
    const monthName = current.toLocaleString('en-US', { month: 'short' });
    const year = current.getFullYear().toString().slice(-2);
    const monthKey = `${monthName}-${year}`;
    if (!months.includes(monthKey)) {
      months.push(monthKey);
    }
    current.setMonth(current.getMonth() + 1);
  }

  return {
    days: PLANNING_HORIZON_DAYS,
    startDate: start,
    endDate: end,
    months,
    is120Day: true,
  };
}

/**
 * Generate variable month labels with optional 120-day filter
 */
export function generateMonthLabels(
  monthCount: number = 18,
  startDate?: Date,
  use120DayFilter: boolean = false
): string[] {
  const effectiveMonths = use120DayFilter ? PLANNING_HORIZON_MONTHS : monthCount;
  const months: string[] = [];
  const start = startDate || new Date();

  for (let i = 0; i < effectiveMonths; i++) {
    const date = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const monthName = date.toLocaleString('en-US', { month: 'short' });
    const year = date.getFullYear().toString().slice(-2);
    months.push(`${monthName}-${year}`);
  }

  return months;
}

/**
 * Filter allocations to 120-day horizon
 */
export function filterTo120DayHorizon<T extends { month: string }>(
  data: T[],
  startDate?: Date
): T[] {
  const horizon = get120DayPlanningHorizon(startDate);
  return data.filter(item => horizon.months.includes(item.month));
}

/**
 * Check if a month is within 120-day horizon
 */
export function isWithin120DayHorizon(monthKey: string, startDate?: Date): boolean {
  const horizon = get120DayPlanningHorizon(startDate);
  return horizon.months.includes(monthKey);
}

// =============================================================================
// CAPACITY AND DEMAND VISUALIZATION
// =============================================================================

/**
 * Generate capacity alerts when utilization deviates from target
 */
export function generateCapacityAlerts(
  allocations: MonthlyAllocation[],
  aitxShops: AITXShop[],
  thirdPartyNetworks: ThirdPartyNetwork[],
  deviationThreshold: number = 0.10
): CapacityAlert[] {
  const alerts: CapacityAlert[] = [];

  allocations.forEach(allocation => {
    allocation.shopAllocations.forEach(shopAlloc => {
      let capacity = 0;
      let targetUtilization = 0.90;
      let shopName = shopAlloc.shopName;

      if (shopAlloc.isAITX) {
        const shop = aitxShops.find(s => s.id === shopAlloc.shopId);
        if (shop) {
          capacity = shop.monthlyCapacity;
          targetUtilization = shop.utilizationTarget;
          shopName = shop.location;
        }
      } else {
        const network = thirdPartyNetworks.find(n => n.id === shopAlloc.shopId);
        if (network) {
          capacity = network.monthlyCapacity;
          targetUtilization = network.availabilityFactor;
          shopName = network.name;
        }
      }

      if (capacity === 0) return;

      const plannedUtilization = shopAlloc.cars / capacity;
      const deviation = plannedUtilization - targetUtilization;

      // Check for significant deviation
      if (Math.abs(deviation) > deviationThreshold) {
        let alertType: 'under' | 'over' | 'critical' = 'under';
        let actionRequired = '';
        let linkTo = '';

        if (plannedUtilization > UTILIZATION_THRESHOLDS.CRITICAL) {
          alertType = 'critical';
          actionRequired = 'Reduce allocation or expand capacity';
          linkTo = `/car-flow?tab=supply&shop=${shopAlloc.shopId}`;
        } else if (deviation > 0) {
          alertType = 'over';
          actionRequired = 'Consider redistributing to other shops';
          linkTo = `/car-flow?tab=plan&month=${allocation.month}`;
        } else {
          alertType = 'under';
          actionRequired = 'Increase allocation or reduce target';
          linkTo = `/car-flow?tab=plan&month=${allocation.month}`;
        }

        alerts.push({
          shopId: shopAlloc.shopId,
          shopName,
          monthKey: allocation.month,
          plannedUtilization,
          targetUtilization,
          deviation,
          alertType,
          actionRequired,
          linkTo,
        });
      }
    });
  });

  return alerts.sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));
}

/**
 * Get utilization color class based on level
 */
export function getUtilizationColorClass(utilization: number): string {
  if (utilization >= UTILIZATION_THRESHOLDS.CRITICAL) {
    return 'bg-red-500 text-white';
  } else if (utilization >= UTILIZATION_THRESHOLDS.OPTIMAL) {
    return 'bg-red-100 text-red-800';
  } else if (utilization >= UTILIZATION_THRESHOLDS.MODERATE) {
    return 'bg-green-100 text-green-800';
  } else if (utilization >= UTILIZATION_THRESHOLDS.LOW) {
    return 'bg-yellow-100 text-yellow-800';
  } else {
    return 'bg-blue-100 text-blue-800';
  }
}

/**
 * Get utilization status label
 */
export function getUtilizationStatusLabel(utilization: number): string {
  if (utilization >= UTILIZATION_THRESHOLDS.CRITICAL) {
    return 'OVERLOADED';
  } else if (utilization >= UTILIZATION_THRESHOLDS.OPTIMAL) {
    return 'Near Capacity';
  } else if (utilization >= UTILIZATION_THRESHOLDS.MODERATE) {
    return 'Optimal';
  } else if (utilization >= UTILIZATION_THRESHOLDS.LOW) {
    return 'Moderate';
  } else {
    return 'Underutilized';
  }
}

// =============================================================================
// CAR-TO-SHOP ALLOCATION UTILITIES
// =============================================================================

/**
 * Calculate urgency score for a car based on multiple factors
 */
export function calculateCarUrgencyScore(car: Car): number {
  let score = 0;

  // Tank qualification due date urgency (highest weight)
  if (car.tankQualDueDate) {
    const daysUntilDue = Math.ceil(
      (new Date(car.tankQualDueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (daysUntilDue < 0) score += 100; // Overdue
    else if (daysUntilDue <= 30) score += 80;
    else if (daysUntilDue <= 60) score += 60;
    else if (daysUntilDue <= 90) score += 40;
    else if (daysUntilDue <= 120) score += 20;
  }

  // Reason shopped priority
  const reasonPriority: Record<string, number> = {
    'qualification': 50,
    'TANK QUALIFICATION': 50,
    'repair': 40,
    'assignment': 30,
    'release': 25,
    'maintenance': 10,
  };
  score += (car.reasonShopped ? reasonPriority[car.reasonShopped] : 0) || 0;

  // Status urgency
  if (car.status === 'available') score += 15;
  if (car.status === 'scheduled') score += 10;

  // Days waiting (if next service due is known)
  if (car.nextServiceDue) {
    const daysOverdue = Math.ceil(
      (Date.now() - new Date(car.nextServiceDue).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysOverdue > 0) score += Math.min(daysOverdue, 30);
  }

  return score;
}

/**
 * Get unassigned cars with urgency scoring and shop suggestions
 */
export function getUnassignedCarsWithUrgency(
  cars: Car[],
  shops: Shop[]
): UnassignedCar[] {
  const unassigned = cars.filter(
    car => (car.status === 'available' || car.status === 'scheduled') && !car.assignedShopId
  );

  return unassigned
    .map(car => {
      const urgencyScore = calculateCarUrgencyScore(car);
      const qualPriority = getQualificationPriority(car.tankQualDueDate);
      const daysUntilQualDue = car.tankQualDueDate
        ? Math.ceil((new Date(car.tankQualDueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null;

      // Generate shop matches
      const suggestedShops = shops
        .filter(shop => {
          // Basic eligibility
          if (!shop.isActive) return false;
          if (car.isTankCar && !shop.tankQualified) return false;
          return true;
        })
        .map(shop => {
          let matchScore = 0;
          const reasons: string[] = [];

          // Capacity available
          const availableCapacity = (shop.capacity || 0) - (shop.currentLoad || 0);
          if (availableCapacity > 0) {
            matchScore += 30;
            reasons.push(`${availableCapacity} slots available`);
          }

          // Tank qualification match
          if (car.isTankCar && shop.tankQualified) {
            matchScore += 25;
            reasons.push('Tank-qualified');
          }

          // Region match
          if (shop.region === car.homeRegion) {
            matchScore += 20;
            reasons.push('Same region');
          }

          // Internal shop preference
          if (shop.isAitxInternal) {
            matchScore += 15;
            reasons.push('AITX Internal');
          }

          // Customer preference
          if (shop.preferredCustomers?.includes(car.customer)) {
            matchScore += 10;
            reasons.push('Preferred for customer');
          }

          return {
            shopId: shop.id,
            shopName: shop.name,
            shopCode: shop.code,
            matchScore,
            reasons,
            availableCapacity: Math.max(0, availableCapacity),
            isRecommended: matchScore >= 60,
          };
        })
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 5);

      return {
        ...car,
        urgencyScore,
        qualificationPriority: qualPriority,
        daysUntilQualDue,
        suggestedShops,
      };
    })
    .sort((a, b) => b.urgencyScore - a.urgencyScore);
}

/**
 * Get qualification priority based on due date
 */
export function getQualificationPriority(
  qualDueDate: string | null | undefined
): keyof typeof QUALIFICATION_PRIORITY {
  if (!qualDueDate) return 'NORMAL';

  const daysUntil = Math.ceil(
    (new Date(qualDueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntil < 0 || daysUntil <= QUALIFICATION_PRIORITY.CRITICAL.daysUntil) return 'CRITICAL';
  if (daysUntil <= QUALIFICATION_PRIORITY.HIGH.daysUntil) return 'HIGH';
  if (daysUntil <= QUALIFICATION_PRIORITY.MEDIUM.daysUntil) return 'MEDIUM';
  if (daysUntil <= QUALIFICATION_PRIORITY.LOW.daysUntil) return 'LOW';
  return 'NORMAL';
}

/**
 * Get qualification priority color
 */
export function getQualificationPriorityColor(priority: keyof typeof QUALIFICATION_PRIORITY): string {
  return QUALIFICATION_PRIORITY[priority].color;
}

// =============================================================================
// CRITICAL ACTION ITEMS
// =============================================================================

/**
 * Generate critical action items based on current planning state
 */
export function generateCriticalActionItems(
  cars: Car[],
  allocations: MonthlyAllocation[],
  metrics: SystemMetrics,
  capacityAlerts: CapacityAlert[]
): CriticalActionItem[] {
  const items: CriticalActionItem[] = [];

  // Check for overdue qualifications
  const overdueQuals = cars.filter(car => {
    if (!car.tankQualDueDate) return false;
    return new Date(car.tankQualDueDate) < new Date();
  });

  if (overdueQuals.length > 0) {
    items.push({
      id: 'overdue-quals',
      type: 'qualification',
      priority: 'HIGH',
      title: `${overdueQuals.length} Overdue Qualifications`,
      description: `Cars with past-due tank qualification dates require immediate attention`,
      isBlocking: true,
      actionLink: '/cars?filter=overdue-qual',
    });
  }

  // Check for upcoming qualification deadlines (within 30 days)
  const urgentQuals = cars.filter(car => {
    if (!car.tankQualDueDate) return false;
    const daysUntil = Math.ceil(
      (new Date(car.tankQualDueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    return daysUntil > 0 && daysUntil <= 30;
  });

  if (urgentQuals.length > 0) {
    items.push({
      id: 'urgent-quals',
      type: 'qualification',
      priority: 'HIGH',
      title: `${urgentQuals.length} Urgent Qualifications Due in 30 Days`,
      description: `Cars requiring qualification within the next 30 days`,
      isBlocking: false,
      actionLink: '/lease-qualification?tab=queue',
    });
  }

  // Check for capacity shortage
  if (metrics.capacityStatus === 'SHORTAGE') {
    items.push({
      id: 'capacity-shortage',
      type: 'capacity',
      priority: 'HIGH',
      title: 'System Capacity Shortage',
      description: `Total demand (${metrics.totalAnnualDemand}) exceeds capacity (${metrics.totalSystemCapacity})`,
      isBlocking: true,
      actionLink: '/car-flow?tab=supply',
    });
  }

  // Check for unallocated demand in 120-day horizon
  const horizon = get120DayPlanningHorizon();
  const horizonAllocations = allocations.filter(a => horizon.months.includes(a.month));
  const totalUnallocated = horizonAllocations.reduce((sum, a) => sum + a.unallocatedDemand, 0);

  if (totalUnallocated > 0) {
    items.push({
      id: 'unallocated-demand',
      type: 'assignment',
      priority: 'MEDIUM',
      title: `${totalUnallocated} Cars Unallocated in 120-Day Window`,
      description: `Cars need shop assignments within the planning horizon`,
      isBlocking: false,
      actionLink: '/car-flow?tab=plan&filter=120day',
    });
  }

  // Add capacity alerts as action items
  capacityAlerts
    .filter(alert => alert.alertType === 'critical')
    .slice(0, 3)
    .forEach((alert, index) => {
      items.push({
        id: `capacity-alert-${index}`,
        type: 'capacity',
        priority: 'HIGH',
        title: `${alert.shopName} Over Capacity (${alert.monthKey})`,
        description: `Planned at ${(alert.plannedUtilization * 100).toFixed(0)}% - ${alert.actionRequired}`,
        isBlocking: false,
        actionLink: alert.linkTo,
      });
    });

  // Check for forecast confirmation needed
  const unconfirmedMonths = horizonAllocations.filter(a => a.systemUtilization > 0.95);
  if (unconfirmedMonths.length > 0) {
    items.push({
      id: 'forecast-confirmation',
      type: 'forecast',
      priority: 'MEDIUM',
      title: 'Confirm High-Utilization Forecasts',
      description: `${unconfirmedMonths.length} months at >95% utilization need verification`,
      isBlocking: false,
      actionLink: '/car-flow?tab=assumptions',
    });
  }

  return items.sort((a, b) => {
    const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    if (a.isBlocking !== b.isBlocking) return a.isBlocking ? -1 : 1;
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

// =============================================================================
// SCHEDULING WORKFLOW UTILITIES
// =============================================================================

/**
 * Generate scheduling output for the scheduling team
 */
export function generateSchedulingOutput(
  allocations: MonthlyAllocation[],
  cars: Car[],
  use120DayFilter: boolean = true
): SchedulingOutput {
  const horizon = get120DayPlanningHorizon();
  const filteredAllocations = use120DayFilter
    ? allocations.filter(a => horizon.months.includes(a.month))
    : allocations;

  const assignments: SchedulingAssignment[] = [];

  // This would typically be populated from actual assignment data
  // For now, we create a structure that can be filled
  filteredAllocations.forEach(allocation => {
    allocation.shopAllocations.forEach(shopAlloc => {
      if (shopAlloc.cars > 0) {
        // Find cars assigned to this shop/month combination
        const assignedCars = cars.filter(
          car => car.assignedShopId === shopAlloc.shopId &&
                 car.projectedCompletionMonth === allocation.month
        );

        assignedCars.forEach(car => {
          assignments.push({
            carId: car.id,
            railcarNumber: car.railcarNumber,
            shopId: shopAlloc.shopId,
            shopName: shopAlloc.shopName,
            plannedFlowInDate: car.shopEntryDate || allocation.month,
            targetCompletionDate: car.projectedCompletionMonth,
            workScope: car.reasonShopped ? [car.reasonShopped] : [],
            priority: calculateCarUrgencyScore(car),
            estimatedDays: car.daysInShop || 14,
          });
        });
      }
    });
  });

  return {
    id: `sched-${Date.now()}`,
    status: 'draft',
    planningHorizonStart: horizon.startDate.toISOString().split('T')[0],
    planningHorizonEnd: horizon.endDate.toISOString().split('T')[0],
    assignments: assignments.sort((a, b) => b.priority - a.priority),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Validate scheduling output before push
 */
export function validateSchedulingOutput(output: SchedulingOutput): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for missing required fields
  output.assignments.forEach(assignment => {
    if (!assignment.railcarNumber) {
      errors.push(`Assignment missing railcar number`);
    }
    if (!assignment.shopId) {
      errors.push(`Assignment for ${assignment.railcarNumber} missing shop ID`);
    }
    if (!assignment.plannedFlowInDate) {
      warnings.push(`Assignment for ${assignment.railcarNumber} missing flow-in date`);
    }
  });

  // Check for duplicate assignments
  const carIds = output.assignments.map(a => a.carId);
  const duplicates = carIds.filter((id, index) => carIds.indexOf(id) !== index);
  if (duplicates.length > 0) {
    errors.push(`Duplicate assignments found for ${duplicates.length} cars`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// =============================================================================
// TARGET VS. ACTUALS COMPARISON
// =============================================================================

/**
 * Calculate target vs. actuals for dashboard drill-down
 */
export function calculateTargetVsActuals(
  allocations: MonthlyAllocation[],
  cars: Car[],
  use120DayFilter: boolean = true
): TargetVsActual[] {
  const horizon = use120DayFilter ? get120DayPlanningHorizon() : null;
  const filteredAllocations = horizon
    ? allocations.filter(a => horizon.months.includes(a.month))
    : allocations;

  return filteredAllocations.map(allocation => {
    // Count actual flow-ins for the month
    const actualFlowIn = cars.filter(car => {
      if (!car.shopEntryDate) return false;
      const entryMonth = new Date(car.shopEntryDate).toLocaleString('en-US', { month: 'short' });
      const entryYear = new Date(car.shopEntryDate).getFullYear().toString().slice(-2);
      return `${entryMonth}-${entryYear}` === allocation.month;
    }).length;

    // Count completions for the month
    const actualCompleted = cars.filter(car => {
      if (car.status !== 'available' && car.status !== 'in_service') return false;
      return car.projectedCompletionMonth === allocation.month;
    }).length;

    const targetPlanned = allocation.totalPlanned;
    const variance = actualFlowIn - targetPlanned;
    const variancePercent = targetPlanned > 0 ? (variance / targetPlanned) * 100 : 0;

    let status: 'on_track' | 'behind' | 'ahead' = 'on_track';
    if (variancePercent < -10) status = 'behind';
    else if (variancePercent > 10) status = 'ahead';

    return {
      monthKey: allocation.month,
      monthLabel: allocation.month,
      targetPlanned,
      actualFlowIn,
      actualCompleted,
      variance,
      variancePercent,
      status,
    };
  });
}

// =============================================================================
// QUALIFICATION DEADLINE UTILITIES
// =============================================================================

/**
 * Get cars filtered by qualification deadline within horizon
 */
export function getQualificationDeadlines(
  cars: Car[],
  use120DayFilter: boolean = true
): QualificationDeadline[] {
  const horizon = get120DayPlanningHorizon();

  return cars
    .filter(car => {
      if (!car.tankQualDueDate) return false;
      if (!use120DayFilter) return true;

      const dueDate = new Date(car.tankQualDueDate);
      return dueDate <= horizon.endDate;
    })
    .map(car => {
      const dueDate = new Date(car.tankQualDueDate!);
      const daysUntilDue = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      const priority = getQualificationPriority(car.tankQualDueDate);

      return {
        carId: car.id,
        railcarNumber: car.railcarNumber,
        customer: car.customer,
        qualDueDate: car.tankQualDueDate!,
        daysUntilDue,
        priority,
        priorityColor: QUALIFICATION_PRIORITY[priority].color,
        isOverdue: daysUntilDue < 0,
        assignedShopId: car.assignedShopId || undefined,
        assignedShopName: undefined, // Would need to be populated with shop lookup
      };
    })
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
}

/**
 * Filter cars by reason shopped (for Lease Qualification focus)
 */
export function filterCarsByReasonShopped(
  cars: Car[],
  reasons: string[]
): Car[] {
  if (reasons.length === 0) return cars;

  const normalizedReasons = reasons.map(r => r.toLowerCase().trim());

  return cars.filter(car => {
    const carReason = (car.reasonShopped || '').toLowerCase().trim();
    return normalizedReasons.some(reason =>
      carReason.includes(reason) || reason.includes(carReason)
    );
  });
}

/**
 * Get unique reason shopped values from car data (dynamic filter population)
 */
export function getUniqueReasonsShopped(cars: Car[]): string[] {
  const reasons = new Set<string>();

  cars.forEach(car => {
    if (car.reasonShopped && car.reasonShopped.trim()) {
      reasons.add(car.reasonShopped.trim());
    }
  });

  return Array.from(reasons).sort();
}

// =============================================================================
// CAPACITY CONFIRMATION UTILITIES
// =============================================================================

/**
 * Create a capacity confirmation request
 */
export function createConfirmationRequest(
  shopId: string,
  shopName: string,
  monthKey: string,
  requestedCapacity: number
): ShopConfirmationRequest {
  return {
    shopId,
    shopName,
    monthKey,
    requestedCapacity,
    status: 'pending',
  };
}

/**
 * Get confirmation status badge color
 */
export function getConfirmationStatusColor(status: CapacityConfirmationStatus): string {
  switch (status) {
    case 'confirmed':
      return 'bg-green-100 text-green-800';
    case 'pending':
      return 'bg-yellow-100 text-yellow-800';
    case 'requested':
      return 'bg-blue-100 text-blue-800';
    case 'rejected':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

// =============================================================================
// EXPORT UTILITIES
// =============================================================================

/**
 * Export scheduling output to structured format for scheduling team
 */
export function exportSchedulingData(output: SchedulingOutput): {
  headers: string[];
  rows: string[][];
} {
  const headers = [
    'Railcar #',
    'Shop',
    'Flow-In Date',
    'Target Completion',
    'Work Scope',
    'Priority',
    'Est. Days',
  ];

  const rows = output.assignments.map(assignment => [
    assignment.railcarNumber,
    assignment.shopName,
    assignment.plannedFlowInDate,
    assignment.targetCompletionDate,
    assignment.workScope.join(', '),
    assignment.priority.toString(),
    assignment.estimatedDays.toString(),
  ]);

  return { headers, rows };
}
