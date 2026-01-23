/**
 * Shopping Status Engine Service
 *
 * Calculates and updates the shopping status for railcars based on:
 * - Current status (Arrived, Complete, etc.)
 * - Portfolio flag (active lease)
 * - Qualification dates
 * - Car Flow Plan commitments
 *
 * Shopping Status Values (enum without spaces):
 * - "InShop" - Car is currently at a shop (status = Arrived)
 * - "Compliant" - Car is compliant, no shopping needed
 * - "Planned" - Car is committed in the Car Flow Plan
 * - "Urgent" - Qualification due date is past (before Jan 1 of current year)
 * - "MustShop" - Qualification due this year
 * - "Upcoming" - Qualification due next year
 * - "Unknown" - Data gap, needs review
 */

import { prisma } from './db';
import { Prisma } from '../types/prismaTypes';
import logger from '../utils/logger';

type PrismaClient = typeof prisma;
import {
  CarStatus,
  ShoppingStatus as ShoppingStatusEnum,
  CarFlowPlanStatus
} from '../types/prismaTypes';

// Re-export ShoppingStatus type for backward compatibility
export type ShoppingStatus = ShoppingStatusEnum;

// Car statuses that require qualification date evaluation
const QUALIFICATION_EVAL_STATUSES: CarStatus[] = [
  CarStatus.ToBeRouted,
  CarStatus.Release,
  CarStatus.UpMarketed,
  CarStatus.Enroute,
  CarStatus.Reassigned,
  CarStatus.Released
];

// Qualification date field names on the Car model
const QUALIFICATION_DATE_FIELDS = [
  'minNoLining',
  'minWLining',
  'interiorLining',
  'rule88B',
  'safetyRelief',
  'serviceEquipment',
  'stubSill',
  'tankThickness',
  'tankQualification'
] as const;

type QualificationField = typeof QUALIFICATION_DATE_FIELDS[number];

interface CarForStatusCalculation {
  id: string;
  status: string;
  portfolio: boolean;
  performedTankQual: boolean;
  minNoLining: Date | null;
  minWLining: Date | null;
  interiorLining: Date | null;
  rule88B: Date | null;
  safetyRelief: Date | null;
  serviceEquipment: Date | null;
  stubSill: Date | null;
  tankThickness: Date | null;
  tankQualification: Date | null;
}

interface ShoppingStatusResult {
  status: ShoppingStatus;
  earliestQualDue: Date | null;
  qualificationType: QualificationField | null;
}

/**
 * Get the earliest qualification due date from all qualification fields
 */
function getEarliestQualificationDate(car: CarForStatusCalculation): { date: Date | null; field: QualificationField | null } {
  let earliestDate: Date | null = null;
  let earliestField: QualificationField | null = null;

  for (const field of QUALIFICATION_DATE_FIELDS) {
    const date = car[field];
    if (date && (!earliestDate || date < earliestDate)) {
      earliestDate = date;
      earliestField = field;
    }
  }

  return { date: earliestDate, field: earliestField };
}

/**
 * Calculate shopping status for a single car
 * Follows the decision tree from the spec (Appendix A)
 */
export function calculateShoppingStatus(
  car: CarForStatusCalculation,
  hasCarFlowPlan: boolean
): ShoppingStatusResult {
  const now = new Date();
  const currentYear = now.getFullYear();
  const startOfCurrentYear = new Date(currentYear, 0, 1); // Jan 1 of current year
  const endOfCurrentYear = new Date(currentYear, 11, 31, 23, 59, 59); // Dec 31 of current year
  const endOfNextYear = new Date(currentYear + 1, 11, 31, 23, 59, 59); // Dec 31 of next year

  // Step 1: IF current_status = 'Arrived' → "InShop"
  if (car.status === CarStatus.Arrived) {
    return { status: ShoppingStatusEnum.InShop, earliestQualDue: null, qualificationType: null };
  }

  // Step 2: IF current_status = 'Complete' AND portfolio = TRUE → "Compliant"
  if (car.status === CarStatus.Complete && car.portfolio === true) {
    return { status: ShoppingStatusEnum.Compliant, earliestQualDue: null, qualificationType: null };
  }

  // Step 3: IF car_id EXISTS IN car_flow_plan WHERE status = 'Planned' → "Planned"
  if (hasCarFlowPlan) {
    return { status: ShoppingStatusEnum.Planned, earliestQualDue: null, qualificationType: null };
  }

  // Step 4: IF current_status IN qualification eval statuses
  if (QUALIFICATION_EVAL_STATUSES.includes(car.status as CarStatus)) {
    const { date: earliestQualDue, field: qualField } = getEarliestQualificationDate(car);

    if (earliestQualDue) {
      // Step 4a: IF earliest_qual_due < January 1 of CURRENT_YEAR → "Urgent"
      if (earliestQualDue < startOfCurrentYear) {
        return { status: ShoppingStatusEnum.Urgent, earliestQualDue, qualificationType: qualField };
      }

      // Step 4b: IF earliest_qual_due <= December 31 of CURRENT_YEAR → "MustShop"
      if (earliestQualDue <= endOfCurrentYear) {
        return { status: ShoppingStatusEnum.MustShop, earliestQualDue, qualificationType: qualField };
      }

      // Step 4c: IF earliest_qual_due <= December 31 of NEXT_YEAR → "Upcoming"
      if (earliestQualDue <= endOfNextYear) {
        return { status: ShoppingStatusEnum.Upcoming, earliestQualDue, qualificationType: qualField };
      }

      // Step 4d: ELSE → "Compliant"
      return { status: ShoppingStatusEnum.Compliant, earliestQualDue, qualificationType: qualField };
    }
  }

  // Step 5: IF portfolio = TRUE AND performed_tank_qual = TRUE → "MustShop"
  if (car.portfolio === true && car.performedTankQual === true) {
    return { status: ShoppingStatusEnum.MustShop, earliestQualDue: null, qualificationType: null };
  }

  // Step 6: ELSE → "Unknown" (data gap — flag for review)
  return { status: ShoppingStatusEnum.Unknown, earliestQualDue: null, qualificationType: null };
}

/**
 * Shopping Status Service class for database operations
 */
export class ShoppingStatusService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Update shopping status for a single car
   */
  async updateCarShoppingStatus(carId: string): Promise<ShoppingStatus> {
    // Fetch car with all qualification fields
    const car = await this.prisma.car.findUnique({
      where: { id: carId },
      select: {
        id: true,
        status: true,
        portfolio: true,
        performedTankQual: true,
        minNoLining: true,
        minWLining: true,
        interiorLining: true,
        rule88B: true,
        safetyRelief: true,
        serviceEquipment: true,
        stubSill: true,
        tankThickness: true,
        tankQualification: true,
      }
    });

    if (!car) {
      throw new Error(`Car not found: ${carId}`);
    }

    // Check if car has an active Car Flow Plan
    const hasCarFlowPlan = await this.prisma.carFlowPlan.findFirst({
      where: {
        carId,
        status: CarFlowPlanStatus.Planned
      }
    }) !== null;

    // Calculate status
    const result = calculateShoppingStatus(car, hasCarFlowPlan);

    // Update car with new shopping status
    await this.prisma.car.update({
      where: { id: carId },
      data: { shoppingStatus: result.status }
    });

    logger.debug('Updated car shopping status', { carId, status: result.status });

    return result.status;
  }

  /**
   * Update shopping status for multiple cars
   */
  async updateBatchShoppingStatus(carIds: string[]): Promise<Map<string, ShoppingStatus>> {
    const results = new Map<string, ShoppingStatus>();

    // Fetch all cars with qualification fields
    const cars = await this.prisma.car.findMany({
      where: { id: { in: carIds } },
      select: {
        id: true,
        status: true,
        portfolio: true,
        performedTankQual: true,
        minNoLining: true,
        minWLining: true,
        interiorLining: true,
        rule88B: true,
        safetyRelief: true,
        serviceEquipment: true,
        stubSill: true,
        tankThickness: true,
        tankQualification: true,
      }
    });

    // Fetch all cars with active Car Flow Plans
    const carsWithPlans = await this.prisma.carFlowPlan.findMany({
      where: {
        carId: { in: carIds },
        status: CarFlowPlanStatus.Planned
      },
      select: { carId: true }
    });
    const carsWithPlansSet = new Set(carsWithPlans.map(p => p.carId));

    // Calculate and update each car
    const updates: Prisma.PrismaPromise<unknown>[] = [];

    for (const car of cars) {
      const hasCarFlowPlan = carsWithPlansSet.has(car.id);
      const result = calculateShoppingStatus(car, hasCarFlowPlan);
      results.set(car.id, result.status);

      updates.push(
        this.prisma.car.update({
          where: { id: car.id },
          data: { shoppingStatus: result.status }
        })
      );
    }

    // Execute all updates in a transaction
    await this.prisma.$transaction(updates);

    logger.info('Batch updated car shopping statuses', { count: carIds.length });

    return results;
  }

  /**
   * Backfill shopping status for all cars in the database
   * Used for migration and data cleanup
   */
  async backfillAllShoppingStatuses(
    companyId: string,
    batchSize: number = 100,
    onProgress?: (processed: number, total: number) => void
  ): Promise<{ processed: number; updated: number }> {
    // Get total count
    const totalCount = await this.prisma.car.count({
      where: { companyId }
    });

    let processed = 0;
    let updated = 0;
    let skip = 0;

    while (processed < totalCount) {
      // Fetch batch of cars
      const cars = await this.prisma.car.findMany({
        where: { companyId },
        select: {
          id: true,
          status: true,
          portfolio: true,
          performedTankQual: true,
          shoppingStatus: true,
          minNoLining: true,
          minWLining: true,
          interiorLining: true,
          rule88B: true,
          safetyRelief: true,
          serviceEquipment: true,
          stubSill: true,
          tankThickness: true,
          tankQualification: true,
        },
        skip,
        take: batchSize,
        orderBy: { id: 'asc' }
      });

      if (cars.length === 0) break;

      // Get all car IDs in this batch
      const carIds = cars.map(c => c.id);

      // Fetch cars with active Car Flow Plans
      const carsWithPlans = await this.prisma.carFlowPlan.findMany({
        where: {
          carId: { in: carIds },
          status: CarFlowPlanStatus.Planned
        },
        select: { carId: true }
      });
      const carsWithPlansSet = new Set(carsWithPlans.map(p => p.carId));

      // Calculate and update
      const updates: Prisma.PrismaPromise<unknown>[] = [];

      for (const car of cars) {
        const hasCarFlowPlan = carsWithPlansSet.has(car.id);
        const result = calculateShoppingStatus(car, hasCarFlowPlan);

        // Only update if status changed
        if (car.shoppingStatus !== result.status) {
          updates.push(
            this.prisma.car.update({
              where: { id: car.id },
              data: { shoppingStatus: result.status }
            })
          );
          updated++;
        }
      }

      // Execute batch updates
      if (updates.length > 0) {
        await this.prisma.$transaction(updates);
      }

      processed += cars.length;
      skip += batchSize;

      // Progress callback
      if (onProgress) {
        onProgress(processed, totalCount);
      }

      logger.debug('Backfill progress', { processed, totalCount, updated });
    }

    logger.info('Completed shopping status backfill', {
      companyId,
      processed,
      updated
    });

    return { processed, updated };
  }

  /**
   * Get shopping status statistics for a company
   */
  async getShoppingStatusStats(companyId: string): Promise<Record<ShoppingStatus, number>> {
    const stats = await this.prisma.car.groupBy({
      by: ['shoppingStatus'],
      where: { companyId },
      _count: { id: true }
    });

    const result: Record<string, number> = {
      [ShoppingStatusEnum.InShop]: 0,
      [ShoppingStatusEnum.Compliant]: 0,
      [ShoppingStatusEnum.Planned]: 0,
      [ShoppingStatusEnum.Urgent]: 0,
      [ShoppingStatusEnum.MustShop]: 0,
      [ShoppingStatusEnum.Upcoming]: 0,
      [ShoppingStatusEnum.Unknown]: 0
    };

    for (const stat of stats) {
      if (stat.shoppingStatus && stat.shoppingStatus in result) {
        result[stat.shoppingStatus] = stat._count.id;
      }
    }

    return result as Record<ShoppingStatus, number>;
  }

  /**
   * Recalculate shopping status when a car's status changes
   * Called by car update hooks
   */
  async onCarStatusChange(carId: string, newStatus: string): Promise<void> {
    // If car status changes to Arrived, InProgress status should be reflected
    // in the Car Flow Plan as well
    if (newStatus === CarStatus.Arrived) {
      // Update any Planned Car Flow Plan to InProgress
      await this.prisma.carFlowPlan.updateMany({
        where: {
          carId,
          status: CarFlowPlanStatus.Planned
        },
        data: {
          status: CarFlowPlanStatus.InProgress
        }
      });
    }

    // If car status changes to Complete, mark Car Flow Plan as Complete
    if (newStatus === CarStatus.Complete) {
      await this.prisma.carFlowPlan.updateMany({
        where: {
          carId,
          status: { in: [CarFlowPlanStatus.Planned, CarFlowPlanStatus.InProgress] }
        },
        data: {
          status: CarFlowPlanStatus.Complete
        }
      });
    }

    // Recalculate shopping status
    await this.updateCarShoppingStatus(carId);
  }
}

/**
 * Create a shopping status service instance
 */
export function createShoppingStatusService(prisma: PrismaClient): ShoppingStatusService {
  return new ShoppingStatusService(prisma);
}

export default ShoppingStatusService;
