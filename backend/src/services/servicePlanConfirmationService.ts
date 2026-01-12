/**
 * servicePlanConfirmationService.ts - Service Plan Confirmation Workflow Service
 *
 * Implements the car-level confirmation workflow as per sprint requirements:
 * - Story 1: Create and manage draft Service Plans (one Final Confirmed per customer)
 * - Story 2: Car-level planning with shop and month assignments
 * - Story 3: Car Matrix as confirmation authority (confirm individual cars)
 * - Story 4: Secondary confirmation for car deletion with audit
 * - Story 5: Final Plan Confirmation workflow
 * - Story 6: Confirmation Summary generation
 * - Story 7: Master Schedule integration (only confirmed cars)
 * - Story 8: Visibility and reporting views
 * - Story 9: Versioning and audit control
 *
 * @author AITX Chronos Team
 * @version 2.0.0
 */

import { prisma } from './db';
import featureFlags from '../config/featureFlags';
import servicePlanMetricsService from './servicePlanMetricsService';
import logger from '../utils/logger';

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

export interface ServicePlanCarInput {
  carId: string;
  assignedShopId?: string;
  plannedMonth?: number;
  plannedYear?: number;
  shopReason?: string;
}

export interface CarConfirmationResult {
  id: string;
  carId: string;
  railcarNumber: string;
  status: string;
  confirmedAt: string;
  confirmedById: string;
}

export interface CarDeletionResult {
  id: string;
  carId: string;
  railcarNumber: string;
  deletedAt: string;
  deletedById: string;
  deleteReason: string;
}

export interface ConfirmationSummary {
  servicePlanId: string;
  planName: string;
  planVersion: number;
  customer: {
    id: string;
    name: string;
    code: string;
  };
  totals: {
    confirmedCars: number;
    pendingCars: number;
    deletedCars: number;
    totalCars: number;
  };
  confirmedCarsByShop: {
    shopId: string;
    shopName: string;
    shopCode: string;
    carCount: number;
    cars: {
      carId: string;
      railcarNumber: string;
      plannedMonth: number;
      plannedYear: number;
    }[];
  }[];
  confirmedCarsByMonth: {
    month: number;
    year: number;
    monthLabel: string;
    carCount: number;
  }[];
  pendingCars: {
    id: string;
    carId: string;
    railcarNumber: string;
    carType: string;
    assignedShopId: string | null;
    assignedShopName: string | null;
    plannedMonth: number | null;
    plannedYear: number | null;
  }[];
}

export interface FinalConfirmationResult {
  servicePlan: any;
  scheduledCars: number;
  archivedDraftPlans: number;
}

export interface PlanReportFilters {
  status?: string;
  customerId?: string;
  plannerId?: string;
  shopId?: string;
  month?: number;
  year?: number;
}

export interface AuditEventInput {
  servicePlanId: string;
  eventType: string;
  planVersion: number;
  servicePlanCarId?: string;
  carId?: string;
  railcarNumber?: string;
  eventDetails: Record<string, any>;
  performedById: string;
  performedByName: string;
  companyId: string;
}

// =============================================================================
// SERVICE PLAN CONFIRMATION SERVICE CLASS
// =============================================================================

export class ServicePlanConfirmationService {
  constructor(private prismaClient: typeof prisma) {}

  // ===========================================================================
  // STORY 1: CREATE AND MANAGE SERVICE PLANS (Customer-Specific)
  // ===========================================================================

  /**
   * Create a new service plan for a customer
   * Validates that customerId is required and enforces one Final Confirmed per customer
   */
  async createServicePlan(input: {
    name: string;
    description?: string;
    customerId: string;  // REQUIRED - Plan belongs to exactly one customer
    projectNumber?: string;
    carFlowRate: number;
    startMonth: number;
    startYear: number;
    endMonth: number;
    endYear: number;
    companyId: string;
    createdById: string;
  }): Promise<any> {
    // Validate required customerId
    if (!input.customerId) {
      throw new Error('Customer ID is required. A Service Plan must belong to exactly one customer.');
    }

    // Calculate total car slots
    const months = this.calculateMonthsBetween(
      input.startMonth, input.startYear,
      input.endMonth, input.endYear
    );
    const totalCarSlots = input.carFlowRate * months;

    const servicePlan = await this.prismaClient.servicePlan.create({
      data: {
        name: input.name,
        description: input.description || '',
        version: 1,
        customerId: input.customerId,
        projectNumber: input.projectNumber || '',
        carFlowRate: input.carFlowRate,
        startMonth: input.startMonth,
        startYear: input.startYear,
        endMonth: input.endMonth,
        endYear: input.endYear,
        totalCarSlots,
        selectedCarCount: 0,
        confirmedCarCount: 0,
        pendingCarCount: 0,
        status: 'draft',
        companyId: input.companyId,
        createdById: input.createdById,
      },
    });

    // Get creator name for audit
    const creator = await this.prismaClient.user.findUnique({
      where: { id: input.createdById },
    });

    // Create audit event
    await this.createAuditEvent({
      servicePlanId: servicePlan.id,
      eventType: 'plan_created',
      planVersion: 1,
      eventDetails: {
        name: input.name,
        customerId: input.customerId,
        carFlowRate: input.carFlowRate,
        dateRange: `${input.startMonth}/${input.startYear} - ${input.endMonth}/${input.endYear}`,
      },
      performedById: input.createdById,
      performedByName: creator ? `${creator.firstName} ${creator.lastName}` : '',
      companyId: input.companyId,
    });

    console.log(`[ServicePlanConfirmation] Created service plan: ${servicePlan.id} for customer: ${input.customerId}`);
    return servicePlan;
  }

  /**
   * Check if customer already has a Final Confirmed plan
   */
  async hasCustomerFinalConfirmedPlan(customerId: string, excludePlanId?: string): Promise<boolean> {
    const where: any = {
      customerId,
      status: 'final_confirmed',
    };
    if (excludePlanId) {
      where.id = { not: excludePlanId };
    }

    const count = await this.prismaClient.servicePlan.count({ where });
    return count > 0;
  }

  // ===========================================================================
  // STORY 2: CAR-LEVEL PLANNING
  // ===========================================================================

  /**
   * Add a car to the service plan with shop and month assignment
   */
  async addCarToPlan(
    servicePlanId: string,
    input: ServicePlanCarInput,
    userId: string,
    companyId: string
  ): Promise<any> {
    const servicePlan = await this.validatePlanEditable(servicePlanId, companyId);

    // Check if car already exists
    const existing = await this.prismaClient.servicePlanCar.findFirst({
      where: { servicePlanId, carId: input.carId },
    });

    if (existing) {
      throw new Error('Car is already in this service plan');
    }

    // Get car details
    const car = await this.prismaClient.car.findUnique({ where: { id: input.carId } });
    if (!car) {
      throw new Error(`Car not found: ${input.carId}`);
    }

    // Create service plan car
    const servicePlanCar = await this.prismaClient.servicePlanCar.create({
      data: {
        servicePlanId,
        carId: input.carId,
        status: 'pending',
        assignedShopId: input.assignedShopId || null,
        plannedMonth: input.plannedMonth || null,
        plannedYear: input.plannedYear || null,
        shopReason: input.shopReason || '',
        qualificationDueDate: car.tankQualification,
        contractExpiration: car.contractExpiration,
        shoppingStatus: car.shoppingStatus,
      },
    });

    // Increment version and update counts
    await this.incrementPlanVersion(servicePlanId, userId, companyId);
    await this.updatePlanCarCounts(servicePlanId);

    // Get user for audit
    const user = await this.prismaClient.user.findUnique({ where: { id: userId } });

    // Create audit event
    await this.createAuditEvent({
      servicePlanId,
      eventType: 'car_added',
      planVersion: servicePlan.version + 1,
      servicePlanCarId: servicePlanCar.id,
      carId: input.carId,
      railcarNumber: car.railcarNumber,
      eventDetails: {
        assignedShopId: input.assignedShopId,
        plannedMonth: input.plannedMonth,
        plannedYear: input.plannedYear,
        shopReason: input.shopReason,
      },
      performedById: userId,
      performedByName: user ? `${user.firstName} ${user.lastName}` : '',
      companyId,
    });

    return servicePlanCar;
  }

  /**
   * Update car assignment (shop, month, reason) - only for pending cars
   */
  async updateCarAssignment(
    servicePlanCarId: string,
    updates: {
      assignedShopId?: string;
      plannedMonth?: number;
      plannedYear?: number;
      shopReason?: string;
    },
    userId: string,
    companyId: string
  ): Promise<any> {
    const servicePlanCar = await this.prismaClient.servicePlanCar.findUnique({
      where: { id: servicePlanCarId },
      include: { servicePlan: true, car: true },
    });

    if (!servicePlanCar) {
      throw new Error('Service plan car not found');
    }

    // Verify company access
    if (servicePlanCar.servicePlan.companyId !== companyId) {
      throw new Error('Access denied');
    }

    // ROW-LEVEL LOCK ENFORCEMENT: Only pending cars can be edited
    // Backend enforces this - confirmed cars are immutable
    if (featureFlags.isRowLevelLockEnforcementEnabled()) {
      if (servicePlanCar.status === 'confirmed') {
        throw new Error('ROW_LOCKED: This car is confirmed and locked. No modifications allowed. Confirmed cars are immutable.');
      }
      if (servicePlanCar.status === 'deleted') {
        throw new Error('CAR_DELETED: This car has been deleted and cannot be modified.');
      }
    }

    if (servicePlanCar.status !== 'pending') {
      throw new Error('Only pending cars can be edited. Confirmed cars are locked.');
    }

    // Validate plan is editable
    await this.validatePlanEditable(servicePlanCar.servicePlanId, companyId);

    const previousValues = {
      assignedShopId: servicePlanCar.assignedShopId,
      plannedMonth: servicePlanCar.plannedMonth,
      plannedYear: servicePlanCar.plannedYear,
      shopReason: servicePlanCar.shopReason,
    };

    // Update car
    const updated = await this.prismaClient.servicePlanCar.update({
      where: { id: servicePlanCarId },
      data: {
        assignedShopId: updates.assignedShopId,
        plannedMonth: updates.plannedMonth,
        plannedYear: updates.plannedYear,
        shopReason: updates.shopReason,
      },
    });

    // Increment version
    await this.incrementPlanVersion(servicePlanCar.servicePlanId, userId, companyId);

    // Get user for audit
    const user = await this.prismaClient.user.findUnique({ where: { id: userId } });

    // Create audit event
    await this.createAuditEvent({
      servicePlanId: servicePlanCar.servicePlanId,
      eventType: 'car_updated',
      planVersion: servicePlanCar.servicePlan.version + 1,
      servicePlanCarId,
      carId: servicePlanCar.carId,
      railcarNumber: servicePlanCar.car.railcarNumber,
      eventDetails: {
        previous: previousValues,
        new: updates,
      },
      performedById: userId,
      performedByName: user ? `${user.firstName} ${user.lastName}` : '',
      companyId,
    });

    return updated;
  }

  // ===========================================================================
  // STORY 3: CAR MATRIX - CONFIRM CARS
  // ===========================================================================

  /**
   * Confirm a car in the Car Matrix (locks the car)
   * This is the ONLY place where car confirmation can occur
   *
   * ROW-LEVEL LOCK ENFORCEMENT:
   * - Once confirmed, the car's status becomes 'confirmed' and cannot be modified
   * - Backend enforces this lock - not just UI disabling
   * - Any attempt to modify a confirmed car will throw an error
   */
  async confirmCar(
    servicePlanCarId: string,
    userId: string,
    companyId: string
  ): Promise<CarConfirmationResult> {
    const startTime = Date.now();
    let success = false;
    let errorMessage: string | undefined;

    try {
      const servicePlanCar = await this.prismaClient.servicePlanCar.findUnique({
        where: { id: servicePlanCarId },
        include: { servicePlan: true, car: true },
      });

      if (!servicePlanCar) {
        throw new Error('Service plan car not found');
      }

      // Verify company access
      if (servicePlanCar.servicePlan.companyId !== companyId) {
        throw new Error('Access denied');
      }

      // ROW-LEVEL LOCK ENFORCEMENT: Only pending cars can be confirmed
      // This is the backend enforcement - confirmed cars are locked
      if (servicePlanCar.status === 'confirmed') {
        throw new Error('CAR_ALREADY_LOCKED: This car is already confirmed and locked. No further modifications allowed.');
      }

      if (servicePlanCar.status === 'deleted') {
        throw new Error('CAR_DELETED: This car has been deleted and cannot be confirmed.');
      }

      if (servicePlanCar.status !== 'pending') {
        throw new Error(`Car cannot be confirmed. Current status: ${servicePlanCar.status}`);
      }

      // Validate car has required assignment info
      if (!servicePlanCar.assignedShopId || !servicePlanCar.plannedMonth || !servicePlanCar.plannedYear) {
        throw new Error('Car must have shop and month/year assigned before confirmation');
      }

      // Validate plan is editable (not final_confirmed)
      await this.validatePlanEditable(servicePlanCar.servicePlanId, companyId);

      const now = new Date().toISOString();

      // Update car status to confirmed (LOCKED)
      // This creates the row-level lock - status='confirmed' prevents further edits
      const confirmed = await this.prismaClient.servicePlanCar.update({
        where: { id: servicePlanCarId },
        data: {
          status: 'confirmed',
          confirmedAt: now,
          confirmedById: userId,
        },
      });

      // Update plan car counts
      await this.updatePlanCarCounts(servicePlanCar.servicePlanId);

      // Increment version
      await this.incrementPlanVersion(servicePlanCar.servicePlanId, userId, companyId);

      // Get user for audit
      const user = await this.prismaClient.user.findUnique({ where: { id: userId } });

      // Create audit event
      await this.createAuditEvent({
        servicePlanId: servicePlanCar.servicePlanId,
        eventType: 'car_confirmed',
        planVersion: servicePlanCar.servicePlan.version + 1,
        servicePlanCarId,
        carId: servicePlanCar.carId,
        railcarNumber: servicePlanCar.car.railcarNumber,
        eventDetails: {
          assignedShopId: servicePlanCar.assignedShopId,
          plannedMonth: servicePlanCar.plannedMonth,
          plannedYear: servicePlanCar.plannedYear,
          shopReason: servicePlanCar.shopReason,
          previousStatus: 'pending',
          newStatus: 'confirmed',
          lockEnforced: true,
        },
        performedById: userId,
        performedByName: user ? `${user.firstName} ${user.lastName}` : '',
        companyId,
      });

      logger.info(`[ServicePlanConfirmation] Confirmed car ${servicePlanCar.car.railcarNumber} in plan ${servicePlanCar.servicePlanId} (LOCKED)`);

      success = true;

      // Record metrics
      await servicePlanMetricsService.recordCarConfirmation(
        servicePlanCar.servicePlanId,
        servicePlanCar.servicePlan.customerId,
        userId,
        companyId,
        servicePlanCar.carId,
        servicePlanCar.car.railcarNumber,
        true,
        Date.now() - startTime
      );

      return {
        id: confirmed.id,
        carId: confirmed.carId,
        railcarNumber: servicePlanCar.car.railcarNumber,
        status: 'confirmed',
        confirmedAt: now,
        confirmedById: userId,
      };
    } catch (error: any) {
      errorMessage = error.message;

      // Record failure metric
      await servicePlanMetricsService.recordMetric({
        eventType: 'car_confirmed',
        servicePlanId: 'unknown',
        customerId: 'unknown',
        userId,
        companyId,
        carCount: 1,
        durationMs: Date.now() - startTime,
        success: false,
        errorMessage: error.message,
      });

      throw error;
    }
  }

  /**
   * Bulk confirm multiple cars
   */
  async confirmCars(
    servicePlanCarIds: string[],
    userId: string,
    companyId: string
  ): Promise<CarConfirmationResult[]> {
    const results: CarConfirmationResult[] = [];

    for (const id of servicePlanCarIds) {
      try {
        const result = await this.confirmCar(id, userId, companyId);
        results.push(result);
      } catch (error: any) {
        console.error(`[ServicePlanConfirmation] Failed to confirm car ${id}: ${error.message}`);
        // Continue with other cars
      }
    }

    return results;
  }

  // ===========================================================================
  // STORY 4: SECONDARY CONFIRMATION FOR CAR DELETION
  // ===========================================================================

  /**
   * Delete a car from the plan with secondary confirmation
   * Only pending cars can be deleted. Deleted cars retain audit history.
   *
   * ROW-LEVEL LOCK ENFORCEMENT:
   * - Confirmed cars cannot be deleted - they are locked
   * - Only pending cars can be deleted with secondary confirmation
   *
   * SOFT-DELETE:
   * - Cars are marked as 'deleted' with timestamp and reason
   * - Full audit trail is retained
   */
  async deleteCar(
    servicePlanCarId: string,
    deleteReason: string,
    secondaryConfirmation: boolean,  // Must be true to proceed
    userId: string,
    companyId: string
  ): Promise<CarDeletionResult> {
    const startTime = Date.now();

    // Require secondary confirmation
    if (!secondaryConfirmation) {
      throw new Error('Secondary confirmation required. Set secondaryConfirmation to true to proceed.');
    }

    const servicePlanCar = await this.prismaClient.servicePlanCar.findUnique({
      where: { id: servicePlanCarId },
      include: { servicePlan: true, car: true },
    });

    if (!servicePlanCar) {
      throw new Error('Service plan car not found');
    }

    // Verify company access
    if (servicePlanCar.servicePlan.companyId !== companyId) {
      throw new Error('Access denied');
    }

    // ROW-LEVEL LOCK ENFORCEMENT: Only pending cars can be deleted
    // Confirmed cars are locked and cannot be deleted
    if (featureFlags.isRowLevelLockEnforcementEnabled()) {
      if (servicePlanCar.status === 'confirmed') {
        throw new Error('ROW_LOCKED: This car is confirmed and locked. Confirmed cars cannot be deleted.');
      }
      if (servicePlanCar.status === 'deleted') {
        throw new Error('CAR_ALREADY_DELETED: This car has already been deleted.');
      }
    }

    if (servicePlanCar.status !== 'pending') {
      throw new Error('Only pending cars can be deleted. Confirmed cars are locked.');
    }

    // Validate plan is editable
    await this.validatePlanEditable(servicePlanCar.servicePlanId, companyId);

    const now = new Date().toISOString();

    try {
      // Soft-delete: Mark as deleted with audit trail
      const deleted = await this.prismaClient.servicePlanCar.update({
        where: { id: servicePlanCarId },
        data: {
          status: 'deleted',
          deletedAt: now,
          deletedById: userId,
          deleteReason: deleteReason || 'No reason provided',
        },
      });

      // Update plan car counts
      await this.updatePlanCarCounts(servicePlanCar.servicePlanId);

      // Increment version
      await this.incrementPlanVersion(servicePlanCar.servicePlanId, userId, companyId);

      // Get user for audit
      const user = await this.prismaClient.user.findUnique({ where: { id: userId } });

      // Create audit event
      await this.createAuditEvent({
        servicePlanId: servicePlanCar.servicePlanId,
        eventType: 'car_deleted',
        planVersion: servicePlanCar.servicePlan.version + 1,
        servicePlanCarId,
        carId: servicePlanCar.carId,
        railcarNumber: servicePlanCar.car.railcarNumber,
        eventDetails: {
          deleteReason,
          previousStatus: 'pending',
          newStatus: 'deleted',
          assignedShopId: servicePlanCar.assignedShopId,
          plannedMonth: servicePlanCar.plannedMonth,
          plannedYear: servicePlanCar.plannedYear,
          softDelete: true,
        },
        performedById: userId,
        performedByName: user ? `${user.firstName} ${user.lastName}` : '',
        companyId,
      });

      // Record deletion metrics
      await servicePlanMetricsService.recordCarDeletion(
        servicePlanCar.servicePlanId,
        servicePlanCar.servicePlan.customerId,
        userId,
        companyId,
        servicePlanCar.carId,
        servicePlanCar.car.railcarNumber,
        deleteReason || 'No reason provided',
        true,
        Date.now() - startTime
      );

      logger.info(`[ServicePlanConfirmation] Deleted car ${servicePlanCar.car.railcarNumber} from plan ${servicePlanCar.servicePlanId} (soft-delete)`);

      return {
        id: deleted.id,
        carId: deleted.carId,
        railcarNumber: servicePlanCar.car.railcarNumber,
        deletedAt: now,
        deletedById: userId,
        deleteReason: deleteReason || 'No reason provided',
      };
    } catch (error: any) {
      // Record failure metrics
      await servicePlanMetricsService.recordMetric({
        eventType: 'car_deleted',
        servicePlanId: servicePlanCar.servicePlanId,
        customerId: servicePlanCar.servicePlan.customerId,
        userId,
        companyId,
        carCount: 1,
        durationMs: Date.now() - startTime,
        success: false,
        errorMessage: error.message,
      });

      throw error;
    }
  }

  // ===========================================================================
  // STORY 5: FINAL PLAN CONFIRMATION
  // ===========================================================================

  /**
   * Final confirmation of a service plan
   * - Must have at least one confirmed car
   * - Only planners can perform this action
   * - Sends confirmed cars to Master Schedule (sync or async based on feature flag)
   * - Locks plan structure
   * - Archives other draft plans for same customer using soft-delete pattern
   *
   * FEATURE FLAG: FEATURE_FINAL_CONFIRMATION_ENABLED
   * - When disabled, final confirmation is not allowed
   *
   * SOFT-DELETE: Plans are archived (status='archived') not hard-deleted
   */
  async finalConfirmPlan(
    servicePlanId: string,
    userId: string,
    companyId: string
  ): Promise<FinalConfirmationResult> {
    const startTime = Date.now();

    // Feature flag check
    if (!featureFlags.isFinalConfirmationEnabled()) {
      throw new Error('FEATURE_DISABLED: Final confirmation is currently disabled by system configuration.');
    }

    const servicePlan = await this.prismaClient.servicePlan.findUnique({
      where: { id: servicePlanId },
      include: {
        customer: true,
        cars: {
          include: { car: true },
        },
      },
    });

    if (!servicePlan) {
      throw new Error('Service plan not found');
    }

    // Verify company access
    if (servicePlan.companyId !== companyId) {
      throw new Error('Access denied');
    }

    // Check if plan is already final confirmed
    if (servicePlan.status === 'final_confirmed') {
      throw new Error('Plan is already final confirmed');
    }

    // Check if plan is already scheduled
    if (servicePlan.status === 'scheduled') {
      throw new Error('Plan is already scheduled');
    }

    // Check if customer already has a final confirmed plan
    const hasExisting = await this.hasCustomerFinalConfirmedPlan(servicePlan.customerId, servicePlanId);
    if (hasExisting) {
      throw new Error('Customer already has a Final Confirmed plan. Only one Final Confirmed plan per customer is allowed.');
    }

    // Get confirmed cars
    const confirmedCars = servicePlan.cars.filter((c: any) => c.status === 'confirmed');
    const pendingCars = servicePlan.cars.filter((c: any) => c.status === 'pending');

    // Must have at least one confirmed car
    if (confirmedCars.length === 0) {
      throw new Error('Cannot final confirm: At least one car must be confirmed');
    }

    // Check for edits in progress (pending cars must be confirmed or deleted)
    if (pendingCars.length > 0) {
      throw new Error(`Cannot final confirm: ${pendingCars.length} pending cars must be confirmed or deleted first`);
    }

    const now = new Date().toISOString();
    let scheduledCars = 0;
    let archivedDraftPlans = 0;

    try {
      // 1. Update plan status to final_confirmed
      await this.prismaClient.servicePlan.update({
        where: { id: servicePlanId },
        data: {
          status: 'final_confirmed',
          finalConfirmedAt: now,
          finalConfirmedById: userId,
        },
      });

      // 2. Send confirmed cars to Master Schedule (CarFlowPlan)
      // Sync or async based on feature flag
      const isAsync = featureFlags.isMasterScheduleAsync();
      const masterScheduleStartTime = Date.now();

      for (const spc of confirmedCars) {
        await this.prismaClient.carFlowPlan.create({
          data: {
            carId: spc.carId,
            shopId: spc.assignedShopId,
            customerId: servicePlan.customerId,
            plannedMonth: spc.plannedMonth,
            plannedYear: spc.plannedYear,
            status: 'Planned',
            source: 'service_plan',
            shopReason: spc.shopReason || '',
            priority: 3,
            committedById: userId,
            companyId,
          },
        });

        // Update car status in Car table
        await this.prismaClient.car.update({
          where: { id: spc.carId },
          data: {
            assignedShopId: spc.assignedShopId,
            status: 'To Be Routed',
          },
        });

        scheduledCars++;
      }

      // Record Master Schedule sync metrics
      await servicePlanMetricsService.recordMasterScheduleSync(
        servicePlanId,
        servicePlan.customerId,
        companyId,
        scheduledCars,
        true,
        Date.now() - masterScheduleStartTime,
        isAsync
      );

      // 3. Update plan to scheduled status
      await this.prismaClient.servicePlan.update({
        where: { id: servicePlanId },
        data: {
          status: 'scheduled',
          scheduledAt: now,
        },
      });

      // 4. SOFT-DELETE: Archive other draft plans for the same customer
      // Uses: UPDATE ServicePlan SET status='archived' WHERE customerId=? AND id!=? AND status IN ('draft','pending')
      const otherDraftPlans = await this.prismaClient.servicePlan.findMany({
        where: {
          customerId: servicePlan.customerId,
          id: { not: servicePlanId },
          status: { in: ['draft', 'pending'] },
          companyId,
        },
      });

      for (const plan of otherDraftPlans) {
        if (featureFlags.isSoftDeletePlansEnabled()) {
          // Soft-delete: Mark as archived with timestamp
          await this.prismaClient.servicePlan.update({
            where: { id: plan.id },
            data: {
              status: 'archived',
              // Note: archivedAt and archivedById would need schema update
            },
          });

          // Create audit event for archived plan
          await this.createAuditEvent({
            servicePlanId: plan.id,
            eventType: 'plan_archived',
            planVersion: plan.version,
            eventDetails: {
              reason: 'Another plan was final confirmed for this customer',
              archivedByPlanId: servicePlanId,
              archivedAt: now,
            },
            performedById: userId,
            performedByName: '',
            companyId,
          });
        } else {
          // Simple archive
          await this.prismaClient.servicePlan.update({
            where: { id: plan.id },
            data: { status: 'archived' },
          });
        }
        archivedDraftPlans++;
      }

      // Get user for audit
      const user = await this.prismaClient.user.findUnique({ where: { id: userId } });

      // Create audit event
      await this.createAuditEvent({
        servicePlanId,
        eventType: 'plan_final_confirmed',
        planVersion: servicePlan.version,
        eventDetails: {
          confirmedCarCount: scheduledCars,
          archivedDraftPlans,
          scheduledAt: now,
          masterScheduleAsync: isAsync,
        },
        performedById: userId,
        performedByName: user ? `${user.firstName} ${user.lastName}` : '',
        companyId,
      });

      // Record final confirmation metrics
      await servicePlanMetricsService.recordFinalConfirmation(
        servicePlanId,
        servicePlan.customerId,
        userId,
        companyId,
        scheduledCars,
        archivedDraftPlans,
        true,
        Date.now() - startTime
      );

      logger.info(`[ServicePlanConfirmation] Final confirmed plan ${servicePlanId}: ${scheduledCars} cars scheduled, ${archivedDraftPlans} draft plans archived`);
    } catch (error: any) {
      // Record failure metrics
      await servicePlanMetricsService.recordFinalConfirmation(
        servicePlanId,
        servicePlan.customerId,
        userId,
        companyId,
        0,
        0,
        false,
        Date.now() - startTime,
        error.message
      );

      throw error;
    }

    // Fetch updated plan
    const updatedPlan = await this.prismaClient.servicePlan.findUnique({
      where: { id: servicePlanId },
      include: {
        customer: true,
        creator: { select: { id: true, firstName: true, lastName: true } },
        cars: { include: { car: true } },
      },
    });

    return {
      servicePlan: updatedPlan,
      scheduledCars,
      archivedDraftPlans,
    };
  }

  // ===========================================================================
  // STORY 6: CONFIRMATION SUMMARY
  // ===========================================================================

  /**
   * Generate confirmation summary for review before final confirmation
   */
  async getConfirmationSummary(
    servicePlanId: string,
    companyId: string
  ): Promise<ConfirmationSummary> {
    const servicePlan = await this.prismaClient.servicePlan.findUnique({
      where: { id: servicePlanId },
      include: {
        customer: true,
        cars: {
          include: {
            car: true,
          },
        },
      },
    });

    if (!servicePlan) {
      throw new Error('Service plan not found');
    }

    if (servicePlan.companyId !== companyId) {
      throw new Error('Access denied');
    }

    // Get shops for confirmed cars
    const confirmedCars = servicePlan.cars.filter((c: any) => c.status === 'confirmed');
    const pendingCars = servicePlan.cars.filter((c: any) => c.status === 'pending');
    const deletedCars = servicePlan.cars.filter((c: any) => c.status === 'deleted');

    // Get unique shop IDs
    const shopIds = [...new Set(confirmedCars.map((c: any) => c.assignedShopId).filter(Boolean))];
    const shops = shopIds.length > 0
      ? await this.prismaClient.shop.findMany({ where: { id: { in: shopIds } } })
      : [];
    const shopMap = new Map<string, { id: string; name: string; code: string }>(
      shops.map((s: any) => [s.id, s])
    );

    // Group confirmed cars by shop
    const carsByShop: Record<string, { shop: any; cars: any[] }> = {};
    for (const spc of confirmedCars) {
      const shopId = spc.assignedShopId;
      if (!carsByShop[shopId]) {
        carsByShop[shopId] = { shop: shopMap.get(shopId), cars: [] };
      }
      carsByShop[shopId].cars.push({
        carId: spc.carId,
        railcarNumber: spc.car.railcarNumber,
        plannedMonth: spc.plannedMonth,
        plannedYear: spc.plannedYear,
      });
    }

    // Group by month
    const carsByMonth: Record<string, { month: number; year: number; count: number }> = {};
    for (const spc of confirmedCars) {
      const key = `${spc.plannedYear}-${spc.plannedMonth}`;
      if (!carsByMonth[key]) {
        carsByMonth[key] = { month: spc.plannedMonth, year: spc.plannedYear, count: 0 };
      }
      carsByMonth[key].count++;
    }

    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    return {
      servicePlanId,
      planName: servicePlan.name,
      planVersion: servicePlan.version,
      customer: {
        id: servicePlan.customer.id,
        name: servicePlan.customer.name,
        code: servicePlan.customer.code,
      },
      totals: {
        confirmedCars: confirmedCars.length,
        pendingCars: pendingCars.length,
        deletedCars: deletedCars.length,
        totalCars: servicePlan.cars.length,
      },
      confirmedCarsByShop: Object.entries(carsByShop).map(([shopId, data]) => ({
        shopId,
        shopName: data.shop?.name || 'Unknown Shop',
        shopCode: data.shop?.code || 'N/A',
        carCount: data.cars.length,
        cars: data.cars,
      })),
      confirmedCarsByMonth: Object.values(carsByMonth)
        .sort((a, b) => a.year - b.year || a.month - b.month)
        .map((m) => ({
          month: m.month,
          year: m.year,
          monthLabel: monthLabels[m.month - 1],
          carCount: m.count,
        })),
      pendingCars: pendingCars.map((spc: any) => ({
        id: spc.id,
        carId: spc.carId,
        railcarNumber: spc.car.railcarNumber,
        carType: spc.car.carType,
        assignedShopId: spc.assignedShopId,
        assignedShopName: spc.assignedShopId ? shopMap.get(spc.assignedShopId)?.name : null,
        plannedMonth: spc.plannedMonth,
        plannedYear: spc.plannedYear,
      })),
    };
  }

  // ===========================================================================
  // STORY 8: VISIBILITY & REPORTING
  // ===========================================================================

  /**
   * Get all confirmed plans with filters
   */
  async getConfirmedPlans(companyId: string, filters?: PlanReportFilters): Promise<any[]> {
    const where: any = {
      companyId,
      status: { in: ['final_confirmed', 'scheduled'] },
    };

    if (filters?.customerId) where.customerId = filters.customerId;
    if (filters?.plannerId) where.createdById = filters.plannerId;

    const plans = await this.prismaClient.servicePlan.findMany({
      where,
      include: {
        customer: true,
        creator: { select: { id: true, firstName: true, lastName: true } },
        cars: {
          where: { status: 'confirmed' },
          include: { car: true },
        },
      },
      orderBy: { finalConfirmedAt: 'desc' },
    });

    // Apply shop and month filters if provided
    if (filters?.shopId || filters?.month || filters?.year) {
      return plans.filter((plan: any) => {
        const matchingCars = plan.cars.filter((spc: any) => {
          let match = true;
          if (filters.shopId && spc.assignedShopId !== filters.shopId) match = false;
          if (filters.month && spc.plannedMonth !== filters.month) match = false;
          if (filters.year && spc.plannedYear !== filters.year) match = false;
          return match;
        });
        return matchingCars.length > 0;
      });
    }

    return plans;
  }

  /**
   * Get all pending/draft plans with filters
   */
  async getPendingPlans(companyId: string, filters?: PlanReportFilters): Promise<any[]> {
    const where: any = {
      companyId,
      status: { in: ['draft', 'pending'] },
    };

    if (filters?.customerId) where.customerId = filters.customerId;
    if (filters?.plannerId) where.createdById = filters.plannerId;

    return this.prismaClient.servicePlan.findMany({
      where,
      include: {
        customer: true,
        creator: { select: { id: true, firstName: true, lastName: true } },
        cars: {
          where: { status: { in: ['pending', 'confirmed'] } },
          include: { car: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Get detailed plan report
   */
  async getPlanReport(servicePlanId: string, companyId: string): Promise<any> {
    const plan = await this.prismaClient.servicePlan.findUnique({
      where: { id: servicePlanId },
      include: {
        customer: true,
        creator: { select: { id: true, firstName: true, lastName: true } },
        cars: {
          include: { car: true },
        },
        auditEvents: {
          orderBy: { performedAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!plan) {
      throw new Error('Service plan not found');
    }

    if (plan.companyId !== companyId) {
      throw new Error('Access denied');
    }

    // Get shop details for assigned cars
    const shopIds = [...new Set(plan.cars.map((c: any) => c.assignedShopId).filter(Boolean))];
    const shops = shopIds.length > 0
      ? await this.prismaClient.shop.findMany({ where: { id: { in: shopIds } } })
      : [];
    const shopMap = new Map<string, { id: string; name: string; code: string }>(
      shops.map((s: any) => [s.id, s])
    );

    // Enrich cars with shop details
    const enrichedCars = plan.cars.map((spc: any) => ({
      ...spc,
      assignedShop: spc.assignedShopId ? shopMap.get(spc.assignedShopId) : null,
    }));

    return {
      ...plan,
      cars: enrichedCars,
      summary: {
        totalCars: plan.cars.length,
        confirmedCars: plan.cars.filter((c: any) => c.status === 'confirmed').length,
        pendingCars: plan.cars.filter((c: any) => c.status === 'pending').length,
        deletedCars: plan.cars.filter((c: any) => c.status === 'deleted').length,
      },
    };
  }

  // ===========================================================================
  // STORY 9: VERSIONING & AUDIT CONTROL
  // ===========================================================================

  /**
   * Get audit history for a service plan
   */
  async getAuditHistory(
    servicePlanId: string,
    companyId: string,
    options?: { limit?: number; offset?: number; eventType?: string }
  ): Promise<any[]> {
    const plan = await this.prismaClient.servicePlan.findUnique({
      where: { id: servicePlanId },
    });

    if (!plan || plan.companyId !== companyId) {
      throw new Error('Service plan not found or access denied');
    }

    const where: any = { servicePlanId };
    if (options?.eventType) where.eventType = options.eventType;

    return this.prismaClient.servicePlanAuditEvent.findMany({
      where,
      orderBy: { performedAt: 'desc' },
      take: options?.limit || 100,
      skip: options?.offset || 0,
    });
  }

  // ===========================================================================
  // CAR MATRIX HELPERS
  // ===========================================================================

  /**
   * Get Car Matrix data for a service plan
   * Returns all cars with their status for the Car Matrix view
   */
  async getCarMatrix(servicePlanId: string, companyId: string): Promise<any> {
    const plan = await this.prismaClient.servicePlan.findUnique({
      where: { id: servicePlanId },
      include: {
        customer: true,
        cars: {
          where: { status: { not: 'deleted' } },  // Exclude deleted for active view
          include: { car: true },
        },
      },
    });

    if (!plan) {
      throw new Error('Service plan not found');
    }

    if (plan.companyId !== companyId) {
      throw new Error('Access denied');
    }

    // Get ALL active shops for selection (not just assigned ones)
    const allShops = await this.prismaClient.shop.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: 'asc' },
    });

    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Create shop map for lookups
    const shopMap = new Map<string, { id: string; name: string; code: string }>(
      allShops.map((s: any) => [s.id, s])
    );

    // Separate by status
    const pendingCars = plan.cars.filter((c: any) => c.status === 'pending');
    const confirmedCars = plan.cars.filter((c: any) => c.status === 'confirmed');

    return {
      servicePlanId,
      planName: plan.name,
      planVersion: plan.version,
      planStatus: plan.status,
      customer: plan.customer,
      isEditable: ['draft', 'pending'].includes(plan.status),
      canFinalConfirm: confirmedCars.length > 0 && pendingCars.length === 0,
      summary: {
        totalCars: plan.cars.length,
        pendingCars: pendingCars.length,
        confirmedCars: confirmedCars.length,
      },
      cars: plan.cars.map((spc: any) => ({
        id: spc.id,
        carId: spc.carId,
        railcarNumber: spc.car.railcarNumber,
        carType: spc.car.carType,
        status: spc.status,
        isLocked: spc.status === 'confirmed',
        assignedShopId: spc.assignedShopId,
        assignedShopName: spc.assignedShopId ? shopMap.get(spc.assignedShopId)?.name : null,
        assignedShopCode: spc.assignedShopId ? shopMap.get(spc.assignedShopId)?.code : null,
        plannedMonth: spc.plannedMonth,
        plannedYear: spc.plannedYear,
        plannedMonthLabel: spc.plannedMonth ? monthLabels[spc.plannedMonth - 1] : null,
        shopReason: spc.shopReason,
        qualificationDueDate: spc.qualificationDueDate,
        contractExpiration: spc.contractExpiration,
        shoppingStatus: spc.shoppingStatus,
        confirmedAt: spc.confirmedAt,
        confirmedById: spc.confirmedById,
        addedAt: spc.addedAt,
      })),
      shops: allShops.map((s: any) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        location: s.location,
        capacity: s.capacity,
      })),
    };
  }

  // ===========================================================================
  // PRIVATE HELPER METHODS
  // ===========================================================================

  /**
   * Validate that a plan is editable (not final_confirmed or scheduled)
   */
  private async validatePlanEditable(servicePlanId: string, companyId: string): Promise<any> {
    const plan = await this.prismaClient.servicePlan.findUnique({
      where: { id: servicePlanId },
    });

    if (!plan) {
      throw new Error('Service plan not found');
    }

    if (plan.companyId !== companyId) {
      throw new Error('Access denied');
    }

    if (['final_confirmed', 'scheduled', 'archived'].includes(plan.status)) {
      throw new Error(`Plan cannot be modified. Current status: ${plan.status}`);
    }

    return plan;
  }

  /**
   * Increment plan version (Story 9: Version increments on changes)
   *
   * VERSION INCREMENT POLICY:
   * The plan version is incremented on every material change to ensure audit
   * trail integrity and support for optimistic concurrency control.
   *
   * Material changes that trigger version increment:
   * 1. addCarToPlan - Adding a car to the plan
   * 2. updateCarAssignment - Changing shop/month assignment
   * 3. confirmCar - Confirming a car (locking it)
   * 4. deleteCar - Soft-deleting a car from the plan
   *
   * Version is NOT incremented on:
   * - Read operations (getCarMatrix, getConfirmationSummary, etc.)
   * - Final confirmation (plan is locked after this anyway)
   * - Audit event creation (derived from version)
   *
   * @param servicePlanId - The service plan to increment
   * @param userId - The user making the change (for tracking)
   * @param companyId - The company context
   */
  private async incrementPlanVersion(servicePlanId: string, userId: string, companyId: string): Promise<void> {
    const result = await this.prismaClient.servicePlan.update({
      where: { id: servicePlanId },
      data: {
        version: { increment: 1 },
      },
    });

    logger.debug(`[ServicePlanConfirmation] Version incremented for plan ${servicePlanId}: v${result.version}`);
  }

  /**
   * Update plan car counts
   */
  private async updatePlanCarCounts(servicePlanId: string): Promise<void> {
    const cars = await this.prismaClient.servicePlanCar.findMany({
      where: { servicePlanId },
    });

    const pendingCount = cars.filter((c: any) => c.status === 'pending').length;
    const confirmedCount = cars.filter((c: any) => c.status === 'confirmed').length;
    const totalActive = pendingCount + confirmedCount;

    await this.prismaClient.servicePlan.update({
      where: { id: servicePlanId },
      data: {
        selectedCarCount: totalActive,
        pendingCarCount: pendingCount,
        confirmedCarCount: confirmedCount,
      },
    });
  }

  /**
   * Create audit event
   */
  private async createAuditEvent(input: AuditEventInput): Promise<void> {
    await this.prismaClient.servicePlanAuditEvent.create({
      data: {
        servicePlanId: input.servicePlanId,
        eventType: input.eventType,
        planVersion: input.planVersion,
        servicePlanCarId: input.servicePlanCarId || null,
        carId: input.carId || null,
        railcarNumber: input.railcarNumber || null,
        eventDetails: JSON.stringify(input.eventDetails),
        performedById: input.performedById,
        performedByName: input.performedByName,
        companyId: input.companyId,
      },
    });
  }

  /**
   * Calculate months between two dates
   */
  private calculateMonthsBetween(
    startMonth: number,
    startYear: number,
    endMonth: number,
    endYear: number
  ): number {
    return (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
  }
}

// =============================================================================
// FACTORY FUNCTION AND SINGLETON
// =============================================================================

export function createServicePlanConfirmationService(
  prismaClient: typeof prisma
): ServicePlanConfirmationService {
  return new ServicePlanConfirmationService(prismaClient);
}

export const servicePlanConfirmationService = new ServicePlanConfirmationService(prisma);

export default ServicePlanConfirmationService;
