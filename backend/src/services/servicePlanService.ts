/**
 * servicePlanService.ts - Service Plan Builder Service
 *
 * Provides service plan operations including:
 * - Service Plan CRUD operations
 * - Car selection and management
 * - Plan Options management with shop assignments
 * - Capacity reservation management
 * - Auto-distribution of cars across months
 * - Option comparison and approval workflow
 *
 * @author AITX Chronos Team
 * @version 1.0.0
 */

import logger from '../utils/logger';

import { prisma } from './db';

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

export interface ServicePlanInput {
  name: string;
  description?: string;
  customerId?: string;
  projectNumber?: string;
  carFlowRate: number;
  startMonth: number;
  startYear: number;
  endMonth: number;
  endYear: number;
  companyId: string;
  createdById: string;
}

export interface ServicePlanCarInput {
  carId: string;
  userAssignedMonth?: number;
  userAssignedYear?: number;
}

export interface PlanOptionInput {
  name: string;
  description?: string;
}

export interface PlanOptionAssignmentInput {
  servicePlanCarId: string;
  shopId: string;
  plannedMonth: number;
  plannedYear: number;
  estimatedCost?: number;
  estimatedDays?: number;
  shopReason?: string;
}

export interface ServicePlanWithDetails {
  id: string;
  name: string;
  description: string;
  customerId: string | null;
  customer?: { id: string; name: string; code: string } | null;
  projectNumber: string;
  carFlowRate: number;
  startMonth: number;
  startYear: number;
  endMonth: number;
  endYear: number;
  status: string;
  approvedOptionId: string | null;
  totalCarSlots: number;
  selectedCarCount: number;
  companyId: string;
  createdById: string;
  creator?: { id: string; firstName: string; lastName: string };
  createdAt: Date;
  updatedAt: Date;
  cars: ServicePlanCarWithDetails[];
  options: PlanOptionWithDetails[];
}

export interface ServicePlanCarWithDetails {
  id: string;
  servicePlanId: string;
  carId: string;
  car: {
    id: string;
    railcarNumber: string;
    carType: string;
    customer: string;
    customerId: string | null;
    shoppingStatus: string;
    tankQualification: Date | null;
    contractExpiration: Date | null;
  };
  autoAssignedMonth: number | null;
  autoAssignedYear: number | null;
  userAssignedMonth: number | null;
  userAssignedYear: number | null;
  qualificationDueDate: Date | null;
  contractExpiration: Date | null;
  shoppingStatus: string;
  addedAt: Date;
}

export interface PlanOptionWithDetails {
  id: string;
  servicePlanId: string;
  name: string;
  description: string;
  totalEstimatedCost: number;
  totalEstimatedDays: number;
  shopCount: number;
  status: string;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
  assignments: PlanOptionAssignmentWithDetails[];
  capacityReservations?: CapacityReservationDetails[];
}

export interface PlanOptionAssignmentWithDetails {
  id: string;
  planOptionId: string;
  servicePlanCarId: string;
  servicePlanCar: ServicePlanCarWithDetails;
  shopId: string;
  shop: {
    id: string;
    name: string;
    code: string;
    location: string;
    capacity: number;
    baseCostPerCar: number;
    baseTurnTime: number;
  };
  suggestedShopId: string | null;
  plannedMonth: number;
  plannedYear: number;
  estimatedCost: number;
  estimatedDays: number;
  shopReason: string;
}

export interface CapacityReservationDetails {
  id: string;
  planOptionId: string;
  shopId: string;
  shop: { id: string; name: string; code: string };
  reservedMonth: number;
  reservedYear: number;
  reservedSlots: number;
  status: string;
}

export interface OptionComparisonResult {
  options: {
    id: string;
    name: string;
    totalCars: number;
    totalCost: number;
    avgCostPerCar: number;
    totalDays: number;
    shopCount: number;
    timeline: {
      month: number;
      year: number;
      monthLabel: string;
      carCount: number;
      shops: { shopId: string; shopName: string; carCount: number }[];
    }[];
  }[];
  cars: {
    carId: string;
    railcarNumber: string;
    carType: string;
    qualDue: Date | null;
    leaseEnd: Date | null;
    optionAssignments: {
      optionId: string;
      optionName: string;
      shopId: string;
      shopName: string;
      plannedMonth: number;
      plannedYear: number;
    }[];
  }[];
}

export interface AvailableCapacity {
  shopId: string;
  shopName: string;
  month: number;
  year: number;
  totalCapacity: number;
  usedCapacity: number;
  reservedCapacity: number;
  availableCapacity: number;
}

// =============================================================================
// SERVICE PLAN SERVICE CLASS
// =============================================================================

export class ServicePlanService {
  constructor(private prismaClient: typeof prisma) {}

  // ===========================================================================
  // SERVICE PLAN CRUD OPERATIONS
  // ===========================================================================

  /**
   * Create a new service plan
   */
  async createServicePlan(input: ServicePlanInput): Promise<ServicePlanWithDetails> {
    // Calculate total car slots
    const months = this.calculateMonthsBetween(
      input.startMonth,
      input.startYear,
      input.endMonth,
      input.endYear
    );
    const totalCarSlots = input.carFlowRate * months;

    const servicePlan = await this.prismaClient.servicePlan.create({
      data: {
        name: input.name,
        description: input.description || '',
        customerId: input.customerId || null,
        projectNumber: input.projectNumber || '',
        carFlowRate: input.carFlowRate,
        startMonth: input.startMonth,
        startYear: input.startYear,
        endMonth: input.endMonth,
        endYear: input.endYear,
        totalCarSlots,
        selectedCarCount: 0,
        status: 'draft',
        companyId: input.companyId,
        createdById: input.createdById,
      },
      include: this.getServicePlanInclude(),
    });

    logger.debug(`[ServicePlanService] Created service plan: ${servicePlan.id} - ${servicePlan.name}`);
    return servicePlan as ServicePlanWithDetails;
  }

  /**
   * Get a service plan by ID
   */
  async getServicePlan(id: string, companyId?: string): Promise<ServicePlanWithDetails | null> {
    const servicePlan = await this.prismaClient.servicePlan.findUnique({
      where: { id },
      include: this.getServicePlanInclude(),
    });

    if (!servicePlan) return null;

    // Security check
    if (companyId && servicePlan.companyId !== companyId) {
      return null;
    }

    // Debug logging
    logger.debug(`[ServicePlanService] getServicePlan ${id}: selectedCarCount=${servicePlan.selectedCarCount}, cars.length=${servicePlan.cars?.length || 0}`);

    return servicePlan as ServicePlanWithDetails;
  }

  /**
   * List all service plans for a company
   */
  async listServicePlans(
    companyId: string,
    options?: { status?: string; customerId?: string }
  ): Promise<ServicePlanWithDetails[]> {
    const where: any = { companyId };
    if (options?.status) where.status = options.status;
    if (options?.customerId) where.customerId = options.customerId;

    const servicePlans = await this.prismaClient.servicePlan.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, code: true } },
        creator: { select: { id: true, firstName: true, lastName: true } },
        cars: { select: { id: true } },
        options: { select: { id: true, name: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return servicePlans.map((sp) => ({
      ...sp,
      selectedCarCount: sp.cars.length,
    })) as ServicePlanWithDetails[];
  }

  /**
   * Update a service plan
   */
  async updateServicePlan(
    id: string,
    updates: Partial<ServicePlanInput>,
    companyId?: string
  ): Promise<ServicePlanWithDetails> {
    // Verify ownership
    const existing = await this.prismaClient.servicePlan.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error(`Service plan not found: ${id}`);
    }

    if (companyId && existing.companyId !== companyId) {
      throw new Error('Access denied: Service plan belongs to another company');
    }

    if (existing.status === 'approved') {
      throw new Error('Cannot modify an approved service plan');
    }

    // Recalculate total slots if date range changed
    let totalCarSlots = existing.totalCarSlots;
    if (updates.carFlowRate || updates.startMonth || updates.startYear || updates.endMonth || updates.endYear) {
      const startMonth = updates.startMonth ?? existing.startMonth;
      const startYear = updates.startYear ?? existing.startYear;
      const endMonth = updates.endMonth ?? existing.endMonth;
      const endYear = updates.endYear ?? existing.endYear;
      const carFlowRate = updates.carFlowRate ?? existing.carFlowRate;
      const months = this.calculateMonthsBetween(startMonth, startYear, endMonth, endYear);
      totalCarSlots = carFlowRate * months;
    }

    const servicePlan = await this.prismaClient.servicePlan.update({
      where: { id },
      data: {
        name: updates.name,
        description: updates.description,
        customerId: updates.customerId,
        projectNumber: updates.projectNumber,
        carFlowRate: updates.carFlowRate,
        startMonth: updates.startMonth,
        startYear: updates.startYear,
        endMonth: updates.endMonth,
        endYear: updates.endYear,
        totalCarSlots,
      },
      include: this.getServicePlanInclude(),
    });

    logger.debug(`[ServicePlanService] Updated service plan: ${id}`);
    return servicePlan as ServicePlanWithDetails;
  }

  /**
   * Delete a service plan
   */
  async deleteServicePlan(id: string, companyId?: string): Promise<void> {
    const existing = await this.prismaClient.servicePlan.findUnique({
      where: { id },
      include: { options: { include: { capacityReservations: true } } },
    });

    if (!existing) {
      throw new Error(`Service plan not found: ${id}`);
    }

    if (companyId && existing.companyId !== companyId) {
      throw new Error('Access denied: Service plan belongs to another company');
    }

    // Release all capacity reservations
    for (const option of existing.options) {
      await this.releaseCapacityReservations(option.id);
    }

    // Delete the plan (cascade will handle related records)
    await this.prismaClient.servicePlan.delete({
      where: { id },
    });

    logger.debug(`[ServicePlanService] Deleted service plan: ${id}`);
  }

  // ===========================================================================
  // CAR MANAGEMENT
  // ===========================================================================

  /**
   * Add cars to a service plan
   */
  async addCarsToServicePlan(
    servicePlanId: string,
    carIds: string[],
    companyId?: string
  ): Promise<ServicePlanCarWithDetails[]> {
    const servicePlan = await this.prismaClient.servicePlan.findUnique({
      where: { id: servicePlanId },
    });

    if (!servicePlan) {
      throw new Error(`Service plan not found: ${servicePlanId}`);
    }

    if (companyId && servicePlan.companyId !== companyId) {
      throw new Error('Access denied');
    }

    if (servicePlan.status === 'approved') {
      throw new Error('Cannot modify an approved service plan');
    }

    // Get existing car IDs
    const existingCars = await this.prismaClient.servicePlanCar.findMany({
      where: { servicePlanId },
      select: { carId: true },
    });
    const existingCarIds = new Set(existingCars.map((c) => c.carId));

    // Filter out already added cars
    const newCarIds = carIds.filter((id) => !existingCarIds.has(id));

    if (newCarIds.length === 0) {
      return [];
    }

    // Get car details for metadata
    const cars = await this.prismaClient.car.findMany({
      where: { id: { in: newCarIds } },
    });

    // Auto-distribute cars across months
    const distribution = this.autoDistributeCars(
      cars,
      servicePlan.startMonth,
      servicePlan.startYear,
      servicePlan.endMonth,
      servicePlan.endYear,
      servicePlan.carFlowRate
    );

    // Create service plan cars
    const createData = cars.map((car) => ({
      servicePlanId,
      carId: car.id,
      autoAssignedMonth: distribution[car.id]?.month || null,
      autoAssignedYear: distribution[car.id]?.year || null,
      qualificationDueDate: car.tankQualification,
      contractExpiration: car.contractExpiration,
      shoppingStatus: car.shoppingStatus,
    }));

    await this.prismaClient.servicePlanCar.createMany({
      data: createData,
    });

    // Update car count
    await this.prismaClient.servicePlan.update({
      where: { id: servicePlanId },
      data: {
        selectedCarCount: {
          increment: newCarIds.length,
        },
      },
    });

    // Fetch and return the created records
    const createdCars = await this.prismaClient.servicePlanCar.findMany({
      where: {
        servicePlanId,
        carId: { in: newCarIds },
      },
      include: {
        car: {
          select: {
            id: true,
            railcarNumber: true,
            carType: true,
            customer: true,
            customerId: true,
            shoppingStatus: true,
            tankQualification: true,
            contractExpiration: true,
          },
        },
      },
    });

    logger.debug(`[ServicePlanService] Added ${newCarIds.length} cars to service plan ${servicePlanId}`);
    return createdCars as ServicePlanCarWithDetails[];
  }

  /**
   * Add cars by filter criteria
   */
  async addCarsByFilter(
    servicePlanId: string,
    filter: {
      customerId?: string;
      shoppingStatuses?: string[];
      limit?: number;
    },
    companyId: string
  ): Promise<ServicePlanCarWithDetails[]> {
    const where: any = { companyId };
    if (filter.customerId) where.customerId = filter.customerId;
    if (filter.shoppingStatuses?.length) {
      where.shoppingStatus = { in: filter.shoppingStatuses };
    }

    const cars = await this.prismaClient.car.findMany({
      where,
      take: filter.limit || 100,
      orderBy: [{ tankQualification: 'asc' }, { shoppingStatus: 'asc' }],
    });

    return this.addCarsToServicePlan(
      servicePlanId,
      cars.map((c) => c.id),
      companyId
    );
  }

  /**
   * Remove a car from a service plan
   */
  async removeCarFromServicePlan(
    servicePlanId: string,
    servicePlanCarId: string,
    companyId?: string
  ): Promise<void> {
    const servicePlanCar = await this.prismaClient.servicePlanCar.findUnique({
      where: { id: servicePlanCarId },
      include: { servicePlan: true },
    });

    if (!servicePlanCar) {
      throw new Error(`Service plan car not found: ${servicePlanCarId}`);
    }

    if (servicePlanCar.servicePlanId !== servicePlanId) {
      throw new Error('Car does not belong to this service plan');
    }

    if (companyId && servicePlanCar.servicePlan.companyId !== companyId) {
      throw new Error('Access denied');
    }

    // Delete the car (cascade will handle option assignments)
    await this.prismaClient.servicePlanCar.delete({
      where: { id: servicePlanCarId },
    });

    // Update car count
    await this.prismaClient.servicePlan.update({
      where: { id: servicePlanId },
      data: {
        selectedCarCount: {
          decrement: 1,
        },
      },
    });

    // Update capacity reservations for all options
    const options = await this.prismaClient.planOption.findMany({
      where: { servicePlanId },
    });

    for (const option of options) {
      await this.updateCapacityReservations(option.id);
    }

    logger.debug(`[ServicePlanService] Removed car ${servicePlanCarId} from service plan ${servicePlanId}`);
  }

  /**
   * Update car month assignment
   */
  async updateCarMonthAssignment(
    servicePlanCarId: string,
    month: number,
    year: number,
    companyId?: string
  ): Promise<ServicePlanCarWithDetails> {
    const servicePlanCar = await this.prismaClient.servicePlanCar.findUnique({
      where: { id: servicePlanCarId },
      include: { servicePlan: true },
    });

    if (!servicePlanCar) {
      throw new Error(`Service plan car not found: ${servicePlanCarId}`);
    }

    if (companyId && servicePlanCar.servicePlan.companyId !== companyId) {
      throw new Error('Access denied');
    }

    const updated = await this.prismaClient.servicePlanCar.update({
      where: { id: servicePlanCarId },
      data: {
        userAssignedMonth: month,
        userAssignedYear: year,
      },
      include: {
        car: {
          select: {
            id: true,
            railcarNumber: true,
            carType: true,
            customer: true,
            customerId: true,
            shoppingStatus: true,
            tankQualification: true,
            contractExpiration: true,
          },
        },
      },
    });

    return updated as ServicePlanCarWithDetails;
  }

  // ===========================================================================
  // PLAN OPTIONS MANAGEMENT
  // ===========================================================================

  /**
   * Create a new plan option
   */
  async createPlanOption(
    servicePlanId: string,
    input: PlanOptionInput,
    companyId?: string
  ): Promise<PlanOptionWithDetails> {
    const servicePlan = await this.prismaClient.servicePlan.findUnique({
      where: { id: servicePlanId },
      include: { options: { select: { displayOrder: true } } },
    });

    if (!servicePlan) {
      throw new Error(`Service plan not found: ${servicePlanId}`);
    }

    if (companyId && servicePlan.companyId !== companyId) {
      throw new Error('Access denied');
    }

    // Get next display order
    const maxOrder = Math.max(0, ...servicePlan.options.map((o) => o.displayOrder));

    const option = await this.prismaClient.planOption.create({
      data: {
        servicePlanId,
        name: input.name,
        description: input.description || '',
        displayOrder: maxOrder + 1,
        status: 'draft',
      },
      include: this.getPlanOptionInclude(),
    });

    logger.debug(`[ServicePlanService] Created plan option: ${option.id} - ${option.name}`);
    return option as PlanOptionWithDetails;
  }

  /**
   * Update a plan option
   */
  async updatePlanOption(
    optionId: string,
    updates: Partial<PlanOptionInput>,
    companyId?: string
  ): Promise<PlanOptionWithDetails> {
    const option = await this.prismaClient.planOption.findUnique({
      where: { id: optionId },
      include: { servicePlan: true },
    });

    if (!option) {
      throw new Error(`Plan option not found: ${optionId}`);
    }

    if (companyId && option.servicePlan.companyId !== companyId) {
      throw new Error('Access denied');
    }

    const updated = await this.prismaClient.planOption.update({
      where: { id: optionId },
      data: updates,
      include: this.getPlanOptionInclude(),
    });

    return updated as PlanOptionWithDetails;
  }

  /**
   * Delete a plan option
   */
  async deletePlanOption(optionId: string, companyId?: string): Promise<void> {
    const option = await this.prismaClient.planOption.findUnique({
      where: { id: optionId },
      include: { servicePlan: true },
    });

    if (!option) {
      throw new Error(`Plan option not found: ${optionId}`);
    }

    if (companyId && option.servicePlan.companyId !== companyId) {
      throw new Error('Access denied');
    }

    // Release capacity reservations
    await this.releaseCapacityReservations(optionId);

    // Delete the option (cascade handles assignments)
    await this.prismaClient.planOption.delete({
      where: { id: optionId },
    });

    logger.debug(`[ServicePlanService] Deleted plan option: ${optionId}`);
  }

  // ===========================================================================
  // ASSIGNMENTS
  // ===========================================================================

  /**
   * Add or update assignments for a plan option
   */
  async setOptionAssignments(
    optionId: string,
    assignments: PlanOptionAssignmentInput[],
    companyId?: string
  ): Promise<PlanOptionWithDetails> {
    const option = await this.prismaClient.planOption.findUnique({
      where: { id: optionId },
      include: { servicePlan: true },
    });

    if (!option) {
      throw new Error(`Plan option not found: ${optionId}`);
    }

    if (companyId && option.servicePlan.companyId !== companyId) {
      throw new Error('Access denied');
    }

    // Delete existing assignments
    await this.prismaClient.planOptionAssignment.deleteMany({
      where: { planOptionId: optionId },
    });

    // Create new assignments
    if (assignments.length > 0) {
      // Get shop details for cost/duration estimates
      const shopIds = [...new Set(assignments.map((a) => a.shopId))];
      const shops = await this.prismaClient.shop.findMany({
        where: { id: { in: shopIds } },
      });
      const shopMap = new Map<string, { id: string; baseCostPerCar?: number; baseTurnTime?: number }>(
        shops.map((s) => [s.id as string, s as { id: string; baseCostPerCar?: number; baseTurnTime?: number }])
      );

      const assignmentData = assignments.map((a) => {
        const shop = shopMap.get(a.shopId);
        return {
          planOptionId: optionId,
          servicePlanCarId: a.servicePlanCarId,
          shopId: a.shopId,
          plannedMonth: a.plannedMonth,
          plannedYear: a.plannedYear,
          estimatedCost: a.estimatedCost ?? shop?.baseCostPerCar ?? 15000,
          estimatedDays: a.estimatedDays ?? shop?.baseTurnTime ?? 14,
          shopReason: a.shopReason || '',
        };
      });

      await this.prismaClient.planOptionAssignment.createMany({
        data: assignmentData,
      });
    }

    // Update option metrics
    await this.updateOptionMetrics(optionId);

    // Update capacity reservations
    await this.updateCapacityReservations(optionId);

    // Return updated option
    const updated = await this.prismaClient.planOption.findUnique({
      where: { id: optionId },
      include: this.getPlanOptionInclude(),
    });

    return updated as PlanOptionWithDetails;
  }

  /**
   * Update a single assignment
   */
  async updateAssignment(
    assignmentId: string,
    updates: Partial<PlanOptionAssignmentInput>,
    companyId?: string
  ): Promise<PlanOptionAssignmentWithDetails> {
    const assignment = await this.prismaClient.planOptionAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        planOption: { include: { servicePlan: true } },
      },
    });

    if (!assignment) {
      throw new Error(`Assignment not found: ${assignmentId}`);
    }

    if (companyId && assignment.planOption.servicePlan.companyId !== companyId) {
      throw new Error('Access denied');
    }

    const updated = await this.prismaClient.planOptionAssignment.update({
      where: { id: assignmentId },
      data: {
        shopId: updates.shopId,
        plannedMonth: updates.plannedMonth,
        plannedYear: updates.plannedYear,
        estimatedCost: updates.estimatedCost,
        estimatedDays: updates.estimatedDays,
        shopReason: updates.shopReason,
      },
      include: this.getAssignmentInclude(),
    });

    // Update option metrics and capacity
    await this.updateOptionMetrics(assignment.planOptionId);
    await this.updateCapacityReservations(assignment.planOptionId);

    return updated as PlanOptionAssignmentWithDetails;
  }

  // ===========================================================================
  // CAPACITY MANAGEMENT
  // ===========================================================================

  /**
   * Get available capacity for a shop in a given month
   */
  async getAvailableCapacity(
    shopId: string,
    month: number,
    year: number,
    excludeOptionId?: string,
    companyId?: string
  ): Promise<AvailableCapacity> {
    const shop = await this.prismaClient.shop.findUnique({
      where: { id: shopId },
    });

    if (!shop) {
      throw new Error(`Shop not found: ${shopId}`);
    }

    // Get existing commitments (CarFlowPlan with status Planned or InProgress)
    const existingCommitments = await this.prismaClient.carFlowPlan.count({
      where: {
        shopId,
        plannedMonth: month,
        plannedYear: year,
        status: { in: ['Planned', 'InProgress'] },
      },
    });

    // Get capacity reservations from other options
    const reservationWhere: any = {
      shopId,
      reservedMonth: month,
      reservedYear: year,
      status: 'active',
    };
    if (excludeOptionId) {
      reservationWhere.planOptionId = { not: excludeOptionId };
    }

    const reservations = await this.prismaClient.capacityReservation.aggregate({
      where: reservationWhere,
      _sum: { reservedSlots: true },
    });

    const reservedCapacity = reservations._sum.reservedSlots || 0;
    const usedCapacity = existingCommitments;
    const totalCapacity = shop.capacity;
    const availableCapacity = totalCapacity - usedCapacity - reservedCapacity;

    return {
      shopId,
      shopName: shop.name,
      month,
      year,
      totalCapacity,
      usedCapacity,
      reservedCapacity,
      availableCapacity: Math.max(0, availableCapacity),
    };
  }

  /**
   * Check if assignments in an option would exceed capacity
   */
  async validateOptionCapacity(
    optionId: string
  ): Promise<{ valid: boolean; conflicts: AvailableCapacity[] }> {
    const option = await this.prismaClient.planOption.findUnique({
      where: { id: optionId },
      include: {
        assignments: {
          include: { shop: true },
        },
      },
    });

    if (!option) {
      throw new Error(`Plan option not found: ${optionId}`);
    }

    // Group assignments by shop/month
    const groups = new Map<string, { shopId: string; month: number; year: number; count: number }>();
    for (const a of option.assignments) {
      const key = `${a.shopId}-${a.plannedYear}-${a.plannedMonth}`;
      const existing = groups.get(key);
      if (existing) {
        existing.count++;
      } else {
        groups.set(key, {
          shopId: a.shopId,
          month: a.plannedMonth,
          year: a.plannedYear,
          count: 1,
        });
      }
    }

    const conflicts: AvailableCapacity[] = [];
    for (const group of groups.values()) {
      const capacity = await this.getAvailableCapacity(
        group.shopId,
        group.month,
        group.year,
        optionId
      );

      if (group.count > capacity.availableCapacity) {
        conflicts.push({
          ...capacity,
          reservedCapacity: capacity.reservedCapacity + group.count,
        });
      }
    }

    return {
      valid: conflicts.length === 0,
      conflicts,
    };
  }

  /**
   * Update capacity reservations for an option
   */
  private async updateCapacityReservations(optionId: string): Promise<void> {
    const option = await this.prismaClient.planOption.findUnique({
      where: { id: optionId },
      include: {
        servicePlan: true,
        assignments: true,
      },
    });

    if (!option) return;

    // Release existing reservations
    await this.prismaClient.capacityReservation.deleteMany({
      where: { planOptionId: optionId },
    });

    // Group assignments by shop/month
    const groups = new Map<string, { shopId: string; month: number; year: number; count: number }>();
    for (const a of option.assignments) {
      const key = `${a.shopId}-${a.plannedYear}-${a.plannedMonth}`;
      const existing = groups.get(key);
      if (existing) {
        existing.count++;
      } else {
        groups.set(key, {
          shopId: a.shopId,
          month: a.plannedMonth,
          year: a.plannedYear,
          count: 1,
        });
      }
    }

    // Create new reservations
    const reservationData = Array.from(groups.values()).map((g) => ({
      planOptionId: optionId,
      shopId: g.shopId,
      reservedMonth: g.month,
      reservedYear: g.year,
      reservedSlots: g.count,
      status: 'active',
      companyId: option.servicePlan.companyId,
    }));

    if (reservationData.length > 0) {
      await this.prismaClient.capacityReservation.createMany({
        data: reservationData,
      });
    }
  }

  /**
   * Release all capacity reservations for an option
   */
  private async releaseCapacityReservations(optionId: string): Promise<void> {
    await this.prismaClient.capacityReservation.updateMany({
      where: { planOptionId: optionId, status: 'active' },
      data: {
        status: 'released',
        releasedAt: new Date(),
      },
    });
  }

  // ===========================================================================
  // COMPARISON AND EXPORT
  // ===========================================================================

  /**
   * Generate option comparison data
   */
  async compareOptions(servicePlanId: string, companyId?: string): Promise<OptionComparisonResult> {
    const servicePlan = await this.prismaClient.servicePlan.findUnique({
      where: { id: servicePlanId },
      include: {
        cars: {
          include: {
            car: {
              select: {
                id: true,
                railcarNumber: true,
                carType: true,
                tankQualification: true,
                contractExpiration: true,
              },
            },
          },
        },
        options: {
          include: {
            assignments: {
              include: {
                shop: { select: { id: true, name: true, code: true } },
                servicePlanCar: {
                  include: {
                    car: { select: { id: true, railcarNumber: true } },
                  },
                },
              },
            },
          },
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    if (!servicePlan) {
      throw new Error(`Service plan not found: ${servicePlanId}`);
    }

    if (companyId && servicePlan.companyId !== companyId) {
      throw new Error('Access denied');
    }

    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Build option summaries
    const options = servicePlan.options.map((opt) => {
      const totalCost = opt.assignments.reduce((sum, a) => sum + a.estimatedCost, 0);
      const totalDays = opt.assignments.reduce((sum, a) => sum + a.estimatedDays, 0);
      const uniqueShops = new Set(opt.assignments.map((a) => a.shopId));

      // Build timeline
      const timelineMap = new Map<string, { shops: Map<string, number> }>();
      for (const a of opt.assignments) {
        const key = `${a.plannedYear}-${a.plannedMonth}`;
        const entry = timelineMap.get(key) || { shops: new Map() };
        const shopCount = entry.shops.get(a.shopId) || 0;
        entry.shops.set(a.shopId, shopCount + 1);
        timelineMap.set(key, entry);
      }

      const timeline = Array.from(timelineMap.entries())
        .map(([key, value]) => {
          const [year, month] = key.split('-').map(Number);
          return {
            month,
            year,
            monthLabel: monthLabels[month - 1],
            carCount: Array.from(value.shops.values()).reduce((a, b) => a + b, 0),
            shops: Array.from(value.shops.entries()).map(([shopId, count]) => {
              const shop = opt.assignments.find((a) => a.shopId === shopId)?.shop;
              return {
                shopId,
                shopName: shop?.name || shopId,
                carCount: count,
              };
            }),
          };
        })
        .sort((a, b) => a.year - b.year || a.month - b.month);

      return {
        id: opt.id,
        name: opt.name,
        totalCars: opt.assignments.length,
        totalCost,
        avgCostPerCar: opt.assignments.length > 0 ? Math.round(totalCost / opt.assignments.length) : 0,
        totalDays,
        shopCount: uniqueShops.size,
        timeline,
      };
    });

    // Build car assignment matrix
    const cars = servicePlan.cars.map((spc) => {
      const optionAssignments = servicePlan.options.map((opt) => {
        const assignment = opt.assignments.find((a) => a.servicePlanCar.carId === spc.carId);
        return {
          optionId: opt.id,
          optionName: opt.name,
          shopId: assignment?.shopId || '',
          shopName: assignment?.shop?.name || '',
          plannedMonth: assignment?.plannedMonth || 0,
          plannedYear: assignment?.plannedYear || 0,
        };
      });

      return {
        carId: spc.carId,
        railcarNumber: spc.car.railcarNumber,
        carType: spc.car.carType,
        qualDue: spc.car.tankQualification,
        leaseEnd: spc.car.contractExpiration,
        optionAssignments,
      };
    });

    return { options, cars };
  }

  // ===========================================================================
  // APPROVAL WORKFLOW
  // ===========================================================================

  /**
   * Approve an option and schedule the cars
   */
  async approveOption(
    servicePlanId: string,
    optionId: string,
    approvedBy: string,
    userId: string,
    companyId?: string
  ): Promise<ServicePlanWithDetails> {
    const servicePlan = await this.prismaClient.servicePlan.findUnique({
      where: { id: servicePlanId },
      include: {
        options: {
          include: {
            assignments: {
              include: {
                servicePlanCar: {
                  include: { car: true },
                },
              },
            },
          },
        },
      },
    });

    if (!servicePlan) {
      throw new Error(`Service plan not found: ${servicePlanId}`);
    }

    if (companyId && servicePlan.companyId !== companyId) {
      throw new Error('Access denied');
    }

    const selectedOption = servicePlan.options.find((o) => o.id === optionId);
    if (!selectedOption) {
      throw new Error(`Option not found: ${optionId}`);
    }

    // Validate capacity
    const validation = await this.validateOptionCapacity(optionId);
    if (!validation.valid) {
      throw new Error('Cannot approve: Option exceeds shop capacity');
    }

    // Start transaction
    await this.prismaClient.$transaction(async (tx) => {
      // Update service plan status
      await tx.servicePlan.update({
        where: { id: servicePlanId },
        data: {
          status: 'approved',
          approvedOptionId: optionId,
          approvedAt: new Date(),
          approvedBy,
        },
      });

      // Update selected option status
      await tx.planOption.update({
        where: { id: optionId },
        data: { status: 'selected' },
      });

      // Update other options to rejected and release their reservations
      const otherOptions = servicePlan.options.filter((o) => o.id !== optionId);
      for (const opt of otherOptions) {
        await tx.planOption.update({
          where: { id: opt.id },
          data: { status: 'rejected' },
        });

        await tx.capacityReservation.updateMany({
          where: { planOptionId: opt.id, status: 'active' },
          data: {
            status: 'released',
            releasedAt: new Date(),
          },
        });
      }

      // Convert reservations to actual commitments (CarFlowPlan)
      for (const assignment of selectedOption.assignments) {
        await tx.carFlowPlan.create({
          data: {
            carId: assignment.servicePlanCar.carId,
            shopId: assignment.shopId,
            customerId: assignment.servicePlanCar.car.customerId,
            plannedMonth: assignment.plannedMonth,
            plannedYear: assignment.plannedYear,
            status: 'Planned',
            source: 'service_plan',
            shopReason: assignment.shopReason,
            estimatedCost: assignment.estimatedCost,
            priority: 3,
            committedById: userId,
            companyId: servicePlan.companyId,
          },
        });

        // Update car status
        await tx.car.update({
          where: { id: assignment.servicePlanCar.carId },
          data: {
            assignedShopId: assignment.shopId,
            status: 'To Be Routed',
          },
        });
      }

      // Convert selected option's reservations to 'converted'
      await tx.capacityReservation.updateMany({
        where: { planOptionId: optionId, status: 'active' },
        data: {
          status: 'converted',
          convertedAt: new Date(),
        },
      });
    });

    logger.debug(`[ServicePlanService] Approved service plan ${servicePlanId} with option ${optionId}`);

    return this.getServicePlan(servicePlanId, companyId) as Promise<ServicePlanWithDetails>;
  }

  /**
   * Mark service plan as proposed (sent to customer)
   * Creates an immutable snapshot of the proposal for historical tracking
   */
  async proposeServicePlan(
    servicePlanId: string,
    proposedById: string,
    sentToEmail?: string,
    sentToName?: string,
    companyId?: string
  ): Promise<ServicePlanWithDetails> {
    const servicePlan = await this.prismaClient.servicePlan.findUnique({
      where: { id: servicePlanId },
      include: this.getServicePlanInclude(),
    });

    if (!servicePlan) {
      throw new Error(`Service plan not found: ${servicePlanId}`);
    }

    if (companyId && servicePlan.companyId !== companyId) {
      throw new Error('Access denied');
    }

    // Get the next snapshot number
    const existingSnapshots = await this.prismaClient.proposalSnapshot.count({
      where: { servicePlanId },
    });
    const snapshotNumber = existingSnapshots + 1;

    // Create snapshot data (immutable record of what was sent)
    const snapshotData = {
      planName: servicePlan.name,
      description: servicePlan.description,
      customer: servicePlan.customer,
      carFlowRate: servicePlan.carFlowRate,
      startMonth: servicePlan.startMonth,
      startYear: servicePlan.startYear,
      endMonth: servicePlan.endMonth,
      endYear: servicePlan.endYear,
      cars: servicePlan.cars.map((c: any) => ({
        id: c.id,
        carId: c.carId,
        railcarNumber: c.car.railcarNumber,
        carType: c.car.carType,
        shoppingStatus: c.shoppingStatus,
        qualificationDueDate: c.qualificationDueDate,
        contractExpiration: c.contractExpiration,
        autoAssignedMonth: c.autoAssignedMonth,
        autoAssignedYear: c.autoAssignedYear,
        userAssignedMonth: c.userAssignedMonth,
        userAssignedYear: c.userAssignedYear,
      })),
      options: servicePlan.options.map((o: any) => ({
        id: o.id,
        name: o.name,
        description: o.description,
        totalEstimatedCost: o.totalEstimatedCost,
        totalEstimatedDays: o.totalEstimatedDays,
        shopCount: o.shopCount,
        assignments: o.assignments.map((a: any) => ({
          carId: a.servicePlanCar.carId,
          railcarNumber: a.servicePlanCar.car.railcarNumber,
          shopId: a.shopId,
          shopName: a.shop.name,
          shopCode: a.shop.code,
          plannedMonth: a.plannedMonth,
          plannedYear: a.plannedYear,
          estimatedCost: a.estimatedCost,
          estimatedDays: a.estimatedDays,
          shopReason: a.shopReason,
        })),
      })),
      summary: {
        totalCars: servicePlan.cars.length,
        totalOptions: servicePlan.options.length,
        totalEstimatedCost: servicePlan.options.reduce((sum: number, o: any) => sum + o.totalEstimatedCost, 0),
      },
      sentAt: new Date().toISOString(),
    };

    // Calculate version string
    const version = snapshotNumber === 1 ? '1.0' : `1.${snapshotNumber - 1}`;

    // Use transaction to ensure atomic update
    const [snapshot, updated] = await this.prismaClient.$transaction([
      // Create the proposal snapshot
      this.prismaClient.proposalSnapshot.create({
        data: {
          servicePlanId,
          snapshotNumber,
          version,
          snapshotType: snapshotNumber === 1 ? 'initial_proposal' : 'revision',
          snapshotData: JSON.stringify(snapshotData),
          sentToCustomer: true,
          sentAt: new Date(),
          sentById: proposedById,
          sentToEmail: sentToEmail || '',
          sentToName: sentToName || '',
          customerResponseStatus: 'pending',
          carCount: servicePlan.cars.length,
          optionCount: servicePlan.options.length,
          totalEstimatedCost: snapshotData.summary.totalEstimatedCost,
          createdById: proposedById,
          companyId: servicePlan.companyId,
        },
      }),
      // Update the service plan
      this.prismaClient.servicePlan.update({
        where: { id: servicePlanId },
        data: {
          status: 'proposed',
          proposedAt: new Date(),
          proposedById,
          customerResponseStatus: 'awaiting_response',
          lastSentAt: new Date(),
          revisionCount: snapshotNumber - 1,
        },
        include: this.getServicePlanInclude(),
      }),
    ]);

    // Update the currentSnapshotId after transaction
    await this.prismaClient.servicePlan.update({
      where: { id: servicePlanId },
      data: { currentSnapshotId: snapshot.id },
    });

    // Log audit event
    await this.logAuditEvent(servicePlanId, 'proposal_sent', servicePlan.version, proposedById, servicePlan.companyId, {
      snapshotId: snapshot.id,
      snapshotNumber,
      sentToEmail,
      sentToName,
      carCount: servicePlan.cars.length,
      optionCount: servicePlan.options.length,
    });

    logger.debug(`[ServicePlanService] Proposed service plan: ${servicePlanId}, snapshot: ${snapshot.id}`);
    return updated as ServicePlanWithDetails;
  }

  /**
   * Record customer feedback on a proposal
   */
  async recordCustomerFeedback(
    servicePlanId: string,
    responseStatus: 'approved' | 'rejected' | 'revision_requested',
    feedback: string,
    respondedBy: string,
    companyId?: string
  ): Promise<ServicePlanWithDetails> {
    const servicePlan = await this.prismaClient.servicePlan.findUnique({
      where: { id: servicePlanId },
    });

    if (!servicePlan) {
      throw new Error(`Service plan not found: ${servicePlanId}`);
    }

    if (companyId && servicePlan.companyId !== companyId) {
      throw new Error('Access denied');
    }

    if (servicePlan.status !== 'proposed') {
      throw new Error('Can only record feedback on proposed plans');
    }

    // Update the current snapshot with customer response
    if (servicePlan.currentSnapshotId) {
      await this.prismaClient.proposalSnapshot.update({
        where: { id: servicePlan.currentSnapshotId },
        data: {
          customerResponseStatus: responseStatus,
          customerRespondedAt: new Date(),
          customerResponseNotes: feedback,
          ...(responseStatus === 'revision_requested' && {
            revisionRequestedAt: new Date(),
            revisionNotes: feedback,
          }),
        },
      });
    }

    // Update the service plan status
    const newStatus = responseStatus === 'approved' ? 'approved' :
                      responseStatus === 'rejected' ? 'cancelled' : 'draft';

    const updated = await this.prismaClient.servicePlan.update({
      where: { id: servicePlanId },
      data: {
        status: newStatus,
        customerResponseStatus: responseStatus,
        customerRespondedAt: new Date(),
        customerFeedback: feedback,
        // If revision requested, go back to draft for editing
        ...(responseStatus === 'revision_requested' && { status: 'draft' }),
      },
      include: this.getServicePlanInclude(),
    });

    // Log audit event
    await this.logAuditEvent(servicePlanId, `customer_${responseStatus}`, servicePlan.version, respondedBy, servicePlan.companyId, {
      feedback,
      previousStatus: servicePlan.status,
      newStatus,
    });

    logger.debug(`[ServicePlanService] Customer feedback recorded: ${servicePlanId}, status: ${responseStatus}`);
    return updated as ServicePlanWithDetails;
  }

  /**
   * Get proposal history (all snapshots) for a service plan
   */
  async getProposalHistory(servicePlanId: string, companyId?: string): Promise<any[]> {
    const servicePlan = await this.prismaClient.servicePlan.findUnique({
      where: { id: servicePlanId },
    });

    if (!servicePlan) {
      throw new Error(`Service plan not found: ${servicePlanId}`);
    }

    if (companyId && servicePlan.companyId !== companyId) {
      throw new Error('Access denied');
    }

    const snapshots = await this.prismaClient.proposalSnapshot.findMany({
      where: { servicePlanId },
      orderBy: { snapshotNumber: 'desc' },
    });

    return snapshots.map((s) => ({
      ...s,
      snapshotData: JSON.parse(s.snapshotData),
    }));
  }

  /**
   * List proposals awaiting customer response
   */
  async listProposalsAwaitingResponse(companyId: string): Promise<ServicePlanWithDetails[]> {
    const servicePlans = await this.prismaClient.servicePlan.findMany({
      where: {
        companyId,
        status: 'proposed',
        customerResponseStatus: 'awaiting_response',
      },
      include: {
        customer: { select: { id: true, name: true, code: true } },
        creator: { select: { id: true, firstName: true, lastName: true } },
        cars: { select: { id: true } },
        options: { select: { id: true, name: true, status: true, totalEstimatedCost: true } },
      },
      orderBy: { lastSentAt: 'desc' },
    });

    return servicePlans.map((sp) => ({
      ...sp,
      selectedCarCount: sp.cars.length,
    })) as ServicePlanWithDetails[];
  }

  /**
   * Log an audit event for a service plan
   */
  private async logAuditEvent(
    servicePlanId: string,
    eventType: string,
    planVersion: number,
    performedById: string,
    companyId: string,
    eventDetails: any,
    servicePlanCarId?: string,
    carId?: string,
    railcarNumber?: string
  ): Promise<void> {
    try {
      // Get user name for audit trail
      const user = await this.prismaClient.user.findUnique({
        where: { id: performedById },
        select: { firstName: true, lastName: true },
      });
      const performedByName = user ? `${user.firstName} ${user.lastName}` : '';

      await this.prismaClient.servicePlanAuditEvent.create({
        data: {
          servicePlanId,
          eventType,
          planVersion,
          servicePlanCarId,
          carId,
          railcarNumber,
          eventDetails: JSON.stringify(eventDetails),
          performedById,
          performedByName,
          companyId,
        },
      });
    } catch (err) {
      logger.error(`[ServicePlanService] Failed to log audit event:`, err);
    }
  }

  // ===========================================================================
  // PRIVATE HELPER METHODS
  // ===========================================================================

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

  /**
   * Auto-distribute cars across months based on qualification dates
   */
  private autoDistributeCars(
    cars: any[],
    startMonth: number,
    startYear: number,
    endMonth: number,
    endYear: number,
    carsPerMonth: number
  ): Record<string, { month: number; year: number }> {
    const distribution: Record<string, { month: number; year: number }> = {};

    // Sort cars by qualification due date (earliest first)
    const sortedCars = [...cars].sort((a, b) => {
      const dateA = a.tankQualification ? new Date(a.tankQualification).getTime() : Infinity;
      const dateB = b.tankQualification ? new Date(b.tankQualification).getTime() : Infinity;
      return dateA - dateB;
    });

    // Generate month slots
    const slots: { month: number; year: number; count: number }[] = [];
    let currentMonth = startMonth;
    let currentYear = startYear;

    while (
      currentYear < endYear ||
      (currentYear === endYear && currentMonth <= endMonth)
    ) {
      slots.push({ month: currentMonth, year: currentYear, count: 0 });
      currentMonth++;
      if (currentMonth > 12) {
        currentMonth = 1;
        currentYear++;
      }
    }

    // Distribute cars across slots
    let slotIndex = 0;
    for (const car of sortedCars) {
      if (slotIndex >= slots.length) {
        // If we've filled all slots, loop back
        slotIndex = 0;
      }

      // Find next slot that isn't full
      let attempts = 0;
      while (slots[slotIndex].count >= carsPerMonth && attempts < slots.length) {
        slotIndex = (slotIndex + 1) % slots.length;
        attempts++;
      }

      if (slots[slotIndex].count < carsPerMonth) {
        distribution[car.id] = {
          month: slots[slotIndex].month,
          year: slots[slotIndex].year,
        };
        slots[slotIndex].count++;
        slotIndex++;
      }
    }

    return distribution;
  }

  /**
   * Update option metrics (totals)
   */
  private async updateOptionMetrics(optionId: string): Promise<void> {
    const assignments = await this.prismaClient.planOptionAssignment.findMany({
      where: { planOptionId: optionId },
    });

    const totalEstimatedCost = assignments.reduce((sum, a) => sum + a.estimatedCost, 0);
    const totalEstimatedDays = assignments.reduce((sum, a) => sum + a.estimatedDays, 0);
    const shopCount = new Set(assignments.map((a) => a.shopId)).size;

    await this.prismaClient.planOption.update({
      where: { id: optionId },
      data: {
        totalEstimatedCost,
        totalEstimatedDays,
        shopCount,
        status: assignments.length > 0 ? 'ready' : 'draft',
      },
    });
  }

  /**
   * Get include object for service plan queries
   */
  private getServicePlanInclude() {
    return {
      customer: { select: { id: true, name: true, code: true } },
      creator: { select: { id: true, firstName: true, lastName: true } },
      cars: {
        include: {
          car: {
            select: {
              id: true,
              railcarNumber: true,
              carType: true,
              customer: true,
              customerId: true,
              shoppingStatus: true,
              tankQualification: true,
              contractExpiration: true,
            },
          },
        },
        orderBy: { addedAt: 'asc' as const },
      },
      options: {
        include: {
          assignments: {
            include: {
              shop: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                  location: true,
                  capacity: true,
                  baseCostPerCar: true,
                  baseTurnTime: true,
                },
              },
              servicePlanCar: {
                include: {
                  car: {
                    select: {
                      id: true,
                      railcarNumber: true,
                      carType: true,
                      customer: true,
                      customerId: true,
                      shoppingStatus: true,
                      tankQualification: true,
                      contractExpiration: true,
                    },
                  },
                },
              },
            },
          },
          capacityReservations: {
            include: {
              shop: { select: { id: true, name: true, code: true } },
            },
          },
        },
        orderBy: { displayOrder: 'asc' as const },
      },
    };
  }

  /**
   * Get include object for plan option queries
   */
  private getPlanOptionInclude() {
    return {
      assignments: {
        include: {
          shop: {
            select: {
              id: true,
              name: true,
              code: true,
              location: true,
              capacity: true,
              baseCostPerCar: true,
              baseTurnTime: true,
            },
          },
          servicePlanCar: {
            include: {
              car: {
                select: {
                  id: true,
                  railcarNumber: true,
                  carType: true,
                  customer: true,
                  customerId: true,
                  shoppingStatus: true,
                  tankQualification: true,
                  contractExpiration: true,
                },
              },
            },
          },
        },
      },
      capacityReservations: {
        include: {
          shop: { select: { id: true, name: true, code: true } },
        },
      },
    };
  }

  /**
   * Get include object for assignment queries
   */
  private getAssignmentInclude() {
    return {
      shop: {
        select: {
          id: true,
          name: true,
          code: true,
          location: true,
          capacity: true,
          baseCostPerCar: true,
          baseTurnTime: true,
        },
      },
      servicePlanCar: {
        include: {
          car: {
            select: {
              id: true,
              railcarNumber: true,
              carType: true,
              customer: true,
              customerId: true,
              shoppingStatus: true,
              tankQualification: true,
              contractExpiration: true,
            },
          },
        },
      },
    };
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

export function createServicePlanService(prismaClient: typeof prisma): ServicePlanService {
  return new ServicePlanService(prismaClient);
}

// Export singleton instance
export const servicePlanService = new ServicePlanService(prisma);

export default ServicePlanService;
