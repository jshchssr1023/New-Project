/**
 * prismaPlanningDataStore.ts - Prisma-backed Planning Data Store
 *
 * Provides persistent data storage using Prisma for:
 * - Fleet/Railcar records (using Car model)
 * - Shop capacities (using Shop and ShopCapacitySlot models)
 * - Shop assignments (using SOPAssignment model)
 *
 * This replaces the in-memory Maps in MasterDataStore with Prisma queries.
 *
 * @author AITX Chronos Team
 * @version 1.0.0
 */

import { prisma } from './db';

// Type definitions for Prisma models (until prisma generate is run with new schema)
interface Car {
  id: string;
  railcarNumber: string;
  carType: string;
  status: string;
  currentLocation: string;
  customer: string;
  assignedShopId: string | null;
  commodity: string;
  homeRegion: string;
  lastServiceDate: Date | null;
  nextServiceDue: Date | null;
  notes: string;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Shop {
  id: string;
  name: string;
  code: string;
  location: string;
  isAitxInternal: boolean;
  isActive: boolean;
  capacity: number;
  qualCapacity: number;
  assignCapacity: number;
  releaseCapacity: number;
  repairCapacity: number;
  efficiencyRating: number;
  capabilities: string;
}

interface SOPAssignment {
  id: string;
  scenarioId: string;
  carId: string;
  shopId: string;
  workTypes: string;
  status: string;
  monthKey: string;
  scheduledArrival: Date | null;
  scheduledCompletion: Date | null;
  actualArrival: Date | null;
  actualDeparture: Date | null;
  estimatedCost: number | null;
  actualCost: number | null;
  estimatedDays: number | null;
  priority: number;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
  car?: Car;
  shop?: Shop;
}

interface ShopCapacitySlot {
  id: string;
  shopId: string;
  monthKey: string;
  slotType: string;
  capacity: number;
  used: number;
}
import {
  RailcarStatus,
  WorkType,
  ShopType,
  CarType,
  Priority,
  AssignmentStatus,
  ShopCapacity,
  ShopAssignment,
  FleetMasterRecord,
  PLANNING_HORIZON_MONTHS,
} from './projectPlanningService';

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Converts a Date to month key format (YYYY-MM).
 */
function toMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Map Prisma Shop to ShopCapacity interface
 */
function mapShopToCapacity(shop: Shop): ShopCapacity {
  return {
    shopId: shop.code,
    shopName: shop.name,
    shopType: shop.isAitxInternal ? ShopType.AITX_OWNED : ShopType.PARTNER,
    location: shop.location,
    qualCapacity: shop.qualCapacity,
    assignCapacity: shop.assignCapacity,
    releaseCapacity: shop.releaseCapacity,
    repairCapacity: shop.repairCapacity,
    supportedCarTypes: shop.capabilities ? JSON.parse(shop.capabilities) : Object.values(CarType),
    isActive: shop.isActive,
    efficiencyRating: shop.efficiencyRating,
    monthlySlots: {},
  };
}

/**
 * Map Prisma Car to FleetMasterRecord interface
 */
function mapCarToFleetRecord(car: Car): FleetMasterRecord {
  return {
    railcarId: car.railcarNumber,
    carType: (car.carType as CarType) || CarType.TANK,
    status: (car.status as RailcarStatus) || RailcarStatus.AVAILABLE,
    currentLocation: car.currentLocation || '',
    customerId: car.customer || undefined,
    assignedShopId: car.assignedShopId || undefined,
    lastCommodity: car.commodity || undefined,
    homeRegion: car.homeRegion || undefined,
    lastServiceDate: car.lastServiceDate || undefined,
    nextServiceDue: car.nextServiceDue || undefined,
    notes: car.notes || '',
    createdAt: car.createdAt,
    updatedAt: car.updatedAt,
  };
}

/**
 * Map Prisma SOPAssignment to ShopAssignment interface
 */
function mapSOPToShopAssignment(
  sop: SOPAssignment & { car?: Car; shop?: Shop }
): ShopAssignment {
  return {
    assignmentId: sop.id,
    railcarId: sop.car?.railcarNumber || sop.carId,
    shopId: sop.shop?.code || sop.shopId,
    shopName: sop.shop?.name || '',
    projectId: sop.scenarioId,
    workTypes: sop.workTypes ? JSON.parse(sop.workTypes) : [],
    status: sop.status as AssignmentStatus,
    monthKey: sop.monthKey,
    scheduledArrival: sop.scheduledArrival,
    scheduledCompletion: sop.scheduledCompletion,
    actualArrival: sop.actualArrival,
    actualDeparture: sop.actualDeparture,
    estimatedCost: sop.estimatedCost || 0,
    actualCost: sop.actualCost || undefined,
    estimatedDays: sop.estimatedDays || 0,
    priority: sop.priority as Priority,
    notes: sop.notes || '',
    createdAt: sop.createdAt,
    updatedAt: sop.updatedAt,
  };
}

// =============================================================================
// PRISMA PLANNING DATA STORE
// =============================================================================

/**
 * PrismaPlanningDataStore - Prisma-backed data store for project planning.
 *
 * Provides database persistence for fleet records, shop capacities,
 * and shop assignments using Prisma ORM.
 */
export class PrismaPlanningDataStore {
  constructor(
    private prisma: any,
    private companyId: string,
    private scenarioId?: string
  ) {}

  // ===========================================================================
  // FLEET/CAR OPERATIONS
  // ===========================================================================

  /**
   * Get a fleet record by railcar ID.
   */
  async getFleetRecord(railcarId: string): Promise<FleetMasterRecord | null> {
    const car = await this.prisma.car.findFirst({
      where: {
        railcarNumber: railcarId,
        companyId: this.companyId,
      },
    });

    return car ? mapCarToFleetRecord(car) : null;
  }

  /**
   * Get all fleet records.
   */
  async getAllFleetRecords(): Promise<FleetMasterRecord[]> {
    const cars = await this.prisma.car.findMany({
      where: { companyId: this.companyId },
    });

    return cars.map(mapCarToFleetRecord);
  }

  /**
   * Add or update a fleet record.
   */
  async upsertFleetRecord(record: FleetMasterRecord): Promise<FleetMasterRecord> {
    const car = await this.prisma.car.upsert({
      where: {
        railcarNumber_companyId: {
          railcarNumber: record.railcarId,
          companyId: this.companyId,
        },
      },
      create: {
        railcarNumber: record.railcarId,
        carType: record.carType,
        status: record.status,
        currentLocation: record.currentLocation,
        customer: record.customerId || '',
        assignedShopId: record.assignedShopId,
        commodity: record.lastCommodity || '',
        homeRegion: record.homeRegion || '',
        lastServiceDate: record.lastServiceDate,
        nextServiceDue: record.nextServiceDue,
        notes: record.notes,
        companyId: this.companyId,
      },
      update: {
        carType: record.carType,
        status: record.status,
        currentLocation: record.currentLocation,
        customer: record.customerId || '',
        assignedShopId: record.assignedShopId,
        commodity: record.lastCommodity || '',
        homeRegion: record.homeRegion || '',
        lastServiceDate: record.lastServiceDate,
        nextServiceDue: record.nextServiceDue,
        notes: record.notes,
      },
    });

    console.log(`[Prisma] Car.upsert: ${record.railcarId} -> status: ${record.status}`);
    return mapCarToFleetRecord(car);
  }

  /**
   * Update fleet record status.
   */
  async updateFleetStatus(
    railcarId: string,
    status: RailcarStatus
  ): Promise<FleetMasterRecord | null> {
    try {
      const car = await this.prisma.car.update({
        where: {
          railcarNumber_companyId: {
            railcarNumber: railcarId,
            companyId: this.companyId,
          },
        },
        data: { status },
      });

      console.log(`[Prisma] Car.update: ${railcarId} status -> ${status}`);
      return mapCarToFleetRecord(car);
    } catch (error) {
      console.warn(`[Prisma] Car.update: Record not found for ${railcarId}`);
      return null;
    }
  }

  /**
   * Get fleet records by status.
   */
  async getFleetByStatus(status: RailcarStatus): Promise<FleetMasterRecord[]> {
    const cars = await this.prisma.car.findMany({
      where: {
        companyId: this.companyId,
        status,
      },
    });

    return cars.map(mapCarToFleetRecord);
  }

  // ===========================================================================
  // SHOP CAPACITY OPERATIONS
  // ===========================================================================

  /**
   * Get shop capacity by shop code.
   */
  async getShopCapacity(shopCode: string): Promise<ShopCapacity | null> {
    const shop = await this.prisma.shop.findFirst({
      where: {
        code: shopCode,
        companyId: this.companyId,
      },
    });

    if (!shop) return null;

    const capacity = mapShopToCapacity(shop);

    // Load capacity slots for this shop
    const slots = await this.prisma.shopCapacitySlot.findMany({
      where: { shopId: shop.id },
    });

    // Build monthly slots from capacity slot records
    slots.forEach((slot) => {
      if (!capacity.monthlySlots[slot.monthKey]) {
        capacity.monthlySlots[slot.monthKey] = {
          qualification: shop.qualCapacity,
          assignment: shop.assignCapacity,
          release: shop.releaseCapacity,
          repair: shop.repairCapacity,
          total: shop.qualCapacity + shop.assignCapacity,
        };
      }
      capacity.monthlySlots[slot.monthKey][slot.slotType] = slot.capacity - slot.used;
    });

    return capacity;
  }

  /**
   * Get all shop capacities.
   */
  async getAllShopCapacities(): Promise<ShopCapacity[]> {
    const shops = await this.prisma.shop.findMany({
      where: {
        companyId: this.companyId,
        isActive: true,
      },
    });

    return shops.map(mapShopToCapacity);
  }

  /**
   * Get available slots for a shop in a given month.
   */
  async getAvailableSlots(
    shopCode: string,
    monthKey: string,
    slotType: string = 'qualification'
  ): Promise<number> {
    const shop = await this.prisma.shop.findFirst({
      where: {
        code: shopCode,
        companyId: this.companyId,
      },
    });

    if (!shop) return 0;

    const slot = await this.prisma.shopCapacitySlot.findUnique({
      where: {
        shopId_monthKey_slotType: {
          shopId: shop.id,
          monthKey,
          slotType,
        },
      },
    });

    if (slot) {
      return slot.capacity - slot.used;
    }

    // Return default capacity if no slot record exists
    switch (slotType) {
      case 'qualification':
        return shop.qualCapacity;
      case 'assignment':
        return shop.assignCapacity;
      case 'release':
        return shop.releaseCapacity;
      case 'repair':
        return shop.repairCapacity;
      default:
        return shop.qualCapacity + shop.assignCapacity;
    }
  }

  /**
   * Consume a capacity slot.
   */
  async consumeSlot(
    shopCode: string,
    monthKey: string,
    slotType: string,
    count: number = 1
  ): Promise<boolean> {
    const shop = await this.prisma.shop.findFirst({
      where: {
        code: shopCode,
        companyId: this.companyId,
      },
    });

    if (!shop) return false;

    // Get or create the capacity slot
    const capacity = this.getSlotCapacity(shop, slotType);

    const slot = await this.prisma.shopCapacitySlot.upsert({
      where: {
        shopId_monthKey_slotType: {
          shopId: shop.id,
          monthKey,
          slotType,
        },
      },
      create: {
        shopId: shop.id,
        monthKey,
        slotType,
        capacity,
        used: count,
      },
      update: {
        used: { increment: count },
      },
    });

    if (slot.used > slot.capacity) {
      // Rollback if over capacity
      await this.prisma.shopCapacitySlot.update({
        where: { id: slot.id },
        data: { used: { decrement: count } },
      });
      return false;
    }

    console.log(`[Prisma] ShopCapacitySlot.consumeSlot: ${shopCode} ${monthKey} ${slotType} -= ${count}`);
    return true;
  }

  /**
   * Release a capacity slot.
   */
  async releaseSlot(
    shopCode: string,
    monthKey: string,
    slotType: string,
    count: number = 1
  ): Promise<void> {
    const shop = await this.prisma.shop.findFirst({
      where: {
        code: shopCode,
        companyId: this.companyId,
      },
    });

    if (!shop) return;

    await this.prisma.shopCapacitySlot.updateMany({
      where: {
        shopId: shop.id,
        monthKey,
        slotType,
      },
      data: {
        used: { decrement: count },
      },
    });

    console.log(`[Prisma] ShopCapacitySlot.releaseSlot: ${shopCode} ${monthKey} ${slotType} += ${count}`);
  }

  /**
   * Get default capacity for a slot type
   */
  private getSlotCapacity(shop: Shop, slotType: string): number {
    switch (slotType) {
      case 'qualification':
        return shop.qualCapacity;
      case 'assignment':
        return shop.assignCapacity;
      case 'release':
        return shop.releaseCapacity;
      case 'repair':
        return shop.repairCapacity;
      default:
        return shop.qualCapacity;
    }
  }

  // ===========================================================================
  // SHOP ASSIGNMENT OPERATIONS (SOP)
  // ===========================================================================

  /**
   * Get shop assignment by ID.
   */
  async getAssignment(assignmentId: string): Promise<ShopAssignment | null> {
    const assignment = await this.prisma.sOPAssignment.findUnique({
      where: { id: assignmentId },
      include: { car: true, shop: true },
    });

    return assignment ? mapSOPToShopAssignment(assignment) : null;
  }

  /**
   * Get assignment by railcar ID.
   */
  async getAssignmentByRailcar(railcarId: string): Promise<ShopAssignment | null> {
    const car = await this.prisma.car.findFirst({
      where: {
        railcarNumber: railcarId,
        companyId: this.companyId,
      },
    });

    if (!car) return null;

    const assignment = await this.prisma.sOPAssignment.findFirst({
      where: {
        carId: car.id,
        scenarioId: this.scenarioId,
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
      include: { car: true, shop: true },
    });

    return assignment ? mapSOPToShopAssignment(assignment) : null;
  }

  /**
   * Create a new shop assignment.
   */
  async createAssignment(
    assignment: Omit<ShopAssignment, 'assignmentId' | 'createdAt' | 'updatedAt'>
  ): Promise<ShopAssignment> {
    if (!this.scenarioId) {
      throw new Error('scenarioId is required to create assignments');
    }

    // Find the car and shop by their codes
    const car = await this.prisma.car.findFirst({
      where: {
        railcarNumber: assignment.railcarId,
        companyId: this.companyId,
      },
    });

    const shop = await this.prisma.shop.findFirst({
      where: {
        code: assignment.shopId,
        companyId: this.companyId,
      },
    });

    if (!car) throw new Error(`Car not found: ${assignment.railcarId}`);
    if (!shop) throw new Error(`Shop not found: ${assignment.shopId}`);

    const created = await this.prisma.sOPAssignment.create({
      data: {
        scenarioId: this.scenarioId,
        carId: car.id,
        shopId: shop.id,
        workTypes: JSON.stringify(assignment.workTypes),
        status: assignment.status,
        monthKey: assignment.monthKey,
        scheduledArrival: assignment.scheduledArrival,
        scheduledCompletion: assignment.scheduledCompletion,
        actualArrival: assignment.actualArrival,
        actualDeparture: assignment.actualDeparture,
        estimatedCost: assignment.estimatedCost,
        estimatedDays: assignment.estimatedDays,
        priority: assignment.priority,
        notes: assignment.notes,
      },
      include: { car: true, shop: true },
    });

    console.log(`[Prisma] SOPAssignment.create: ${created.id} for car ${assignment.railcarId}`);
    return mapSOPToShopAssignment(created);
  }

  /**
   * Update a shop assignment.
   */
  async updateAssignment(
    assignmentId: string,
    updates: Partial<ShopAssignment>
  ): Promise<ShopAssignment | null> {
    try {
      const updateData: any = {};

      if (updates.status) updateData.status = updates.status;
      if (updates.monthKey) updateData.monthKey = updates.monthKey;
      if (updates.scheduledArrival !== undefined) updateData.scheduledArrival = updates.scheduledArrival;
      if (updates.scheduledCompletion !== undefined) updateData.scheduledCompletion = updates.scheduledCompletion;
      if (updates.actualArrival !== undefined) updateData.actualArrival = updates.actualArrival;
      if (updates.actualDeparture !== undefined) updateData.actualDeparture = updates.actualDeparture;
      if (updates.estimatedCost !== undefined) updateData.estimatedCost = updates.estimatedCost;
      if (updates.actualCost !== undefined) updateData.actualCost = updates.actualCost;
      if (updates.estimatedDays !== undefined) updateData.estimatedDays = updates.estimatedDays;
      if (updates.priority !== undefined) updateData.priority = updates.priority;
      if (updates.notes !== undefined) updateData.notes = updates.notes;
      if (updates.workTypes) updateData.workTypes = JSON.stringify(updates.workTypes);

      const updated = await this.prisma.sOPAssignment.update({
        where: { id: assignmentId },
        data: updateData,
        include: { car: true, shop: true },
      });

      console.log(`[Prisma] SOPAssignment.update: ${assignmentId} -> status: ${updated.status}`);
      return mapSOPToShopAssignment(updated);
    } catch (error) {
      console.warn(`[Prisma] SOPAssignment.update: Assignment not found: ${assignmentId}`);
      return null;
    }
  }

  /**
   * Get all assignments for a shop in a given month.
   */
  async getAssignmentsByShopMonth(shopCode: string, monthKey: string): Promise<ShopAssignment[]> {
    const shop = await this.prisma.shop.findFirst({
      where: {
        code: shopCode,
        companyId: this.companyId,
      },
    });

    if (!shop) return [];

    const assignments = await this.prisma.sOPAssignment.findMany({
      where: {
        shopId: shop.id,
        monthKey,
        ...(this.scenarioId && { scenarioId: this.scenarioId }),
      },
      include: { car: true, shop: true },
    });

    return assignments.map(mapSOPToShopAssignment);
  }

  /**
   * Get committed assignments (PLANNED, SCHEDULED, or IN_PROGRESS) for a shop/month.
   */
  async getCommittedAssignments(shopCode: string, monthKey: string): Promise<ShopAssignment[]> {
    const shop = await this.prisma.shop.findFirst({
      where: {
        code: shopCode,
        companyId: this.companyId,
      },
    });

    if (!shop) return [];

    const assignments = await this.prisma.sOPAssignment.findMany({
      where: {
        shopId: shop.id,
        monthKey,
        status: { in: ['PLANNED', 'SCHEDULED', 'IN_PROGRESS'] },
        ...(this.scenarioId && { scenarioId: this.scenarioId }),
      },
      include: { car: true, shop: true },
    });

    return assignments.map(mapSOPToShopAssignment);
  }

  /**
   * Get all assignments for a scenario.
   */
  async getAssignmentsByScenario(scenarioId: string): Promise<ShopAssignment[]> {
    const assignments = await this.prisma.sOPAssignment.findMany({
      where: { scenarioId },
      include: { car: true, shop: true },
      orderBy: [{ monthKey: 'asc' }, { priority: 'asc' }],
    });

    return assignments.map(mapSOPToShopAssignment);
  }

  // ===========================================================================
  // TRANSACTION SUPPORT
  // ===========================================================================

  /**
   * Execute a function within a transaction.
   */
  async withTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx: any) => {
      return fn(tx);
    });
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a Prisma planning data store instance.
 */
export function createPrismaPlanningDataStore(
  prisma: any,
  companyId: string,
  scenarioId?: string
): PrismaPlanningDataStore {
  return new PrismaPlanningDataStore(prisma, companyId, scenarioId);
}

export default PrismaPlanningDataStore;
