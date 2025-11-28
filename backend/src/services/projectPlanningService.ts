/**
 * projectPlanningService.ts - Project-Based Planning and State Management Module
 *
 * This module implements the Project-Based Planning and State Management features
 * for the Chronos S&OP Engine, providing:
 * - Railcar lifecycle state management
 * - Project batch planning with capacity pre-checks
 * - Shop load synchronization and transactional state management
 * - Integration with the existing Chronos architecture
 *
 * @author AITX Chronos Team
 * @version 1.0.0
 */

// =============================================================================
// SECTION 1 - ENUMERATIONS
// =============================================================================

/**
 * RailcarStatus - Comprehensive lifecycle states for railcar management.
 *
 * Tracks a railcar through its complete operational lifecycle from lease
 * assignment through shop processing and back to availability.
 */
export enum RailcarStatus {
  /** Car is currently on lease to a customer */
  ASSIGNED = 'assigned',

  /** Car has been added to an S&OP project for planning */
  PLANNED = 'planned',

  /** Car has a locked schedule date for shop work */
  SCHEDULED = 'scheduled',

  /** Car is in transit to a shop facility */
  IN_TRANSIT = 'in_transit',

  /** Car has physically arrived and been confirmed at shop */
  IN_SHOP = 'in_shop',

  /** Car is available for next assignment or storage */
  AVAILABLE = 'available',

  /** Car is available but flagged for repair/maintenance */
  BAD_ORDER = 'bad_order',
}

/**
 * WorkType - Types of work that can be performed on a railcar.
 * Aligned with Python ChronosDataStore.WorkType enum.
 */
export enum WorkType {
  QUALIFICATION = 'qualification',
  ASSIGNMENT = 'assignment',
  CLEANING = 'cleaning',
  MINOR_REPAIR = 'minor_repair',
  MAJOR_REPAIR = 'major_repair',
  INSPECTION = 'inspection',
  RETURN_PREP = 'return_prep',
}

/**
 * ShopType - Classification of shop facilities.
 * Aligned with Python ChronosDataStore.ShopType enum.
 */
export enum ShopType {
  AITX_OWNED = 'aitx_owned',
  AITX_PRIMARY = 'aitx_primary',
  AITX_SECONDARY = 'aitx_secondary',
  PARTNER = 'partner',
  THIRD_PARTY = 'third_party',
}

/**
 * CarType - Types of railcars handled by the system.
 * Aligned with Python ChronosDataStore.CarType enum.
 */
export enum CarType {
  TANK = 'tank',
  HOPPER = 'hopper',
  BOXCAR = 'boxcar',
  FLATCAR = 'flatcar',
  GONDOLA = 'gondola',
  INTERMODAL = 'intermodal',
  COVERED_HOPPER = 'covered_hopper',
  REFRIGERATED = 'refrigerated',
}

/**
 * Priority - Scheduling priority levels.
 * Lower value = higher priority.
 */
export enum Priority {
  CRITICAL = 1,
  HIGH = 2,
  MEDIUM = 3,
  LOW = 4,
}

/**
 * AssignmentStatus - Status of a shop assignment record.
 */
export enum AssignmentStatus {
  DRAFT = 'draft',
  PLANNED = 'planned',
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

// =============================================================================
// SECTION 2 - INTERFACES
// =============================================================================

/**
 * ShopCapacity - Shop capacity constraints and slot tracking.
 *
 * Tracks both static capacity limits and dynamic slot availability
 * across the planning horizon. Compatible with Python ShopCapacity dataclass.
 */
export interface ShopCapacity {
  /** Unique shop identifier */
  shopId: string;

  /** Human-readable shop name */
  shopName: string;

  /** Type of shop facility */
  shopType: ShopType;

  /** Shop location code/address */
  location: string;

  /** Monthly qualification capacity (slots) */
  qualCapacity: number;

  /** Monthly assignment capacity (slots) */
  assignCapacity: number;

  /** Monthly returns capacity (slots) */
  returnCapacity: number;

  /** Monthly repair capacity (slots) */
  repairCapacity: number;

  /** List of car types this shop can handle */
  supportedCarTypes: CarType[];

  /** Whether shop is currently operational */
  isActive: boolean;

  /** Shop efficiency rating (0.0 to 1.0) */
  efficiencyRating: number;

  /** Dynamic slot tracking: month_key -> slot_type -> available_count */
  monthlySlots: Record<string, Record<string, number>>;
}

/**
 * ProjectDetails - Project batch planning entity.
 *
 * Defines a planning project that groups multiple railcars
 * for batch scheduling to target shops.
 */
export interface ProjectDetails {
  /** Unique project identifier */
  projectId: string;

  /** Human-readable project name */
  name: string;

  /** List of railcar IDs included in this project */
  railcarIds: string[];

  /** User-specified target shops for this project */
  targetShops: string[];

  /** Project start month in YYYY-MM format */
  startMonth: string;

  /** Number of cars to process per week */
  flowRatePerWeek: number;

  /** Optional: Project priority level */
  priority?: Priority;

  /** Optional: Work types required for this project */
  workTypes?: WorkType[];

  /** Optional: Customer ID associated with this project */
  customerId?: string;

  /** Optional: Notes or description */
  notes?: string;

  /** Optional: Creation timestamp */
  createdAt?: Date;
}

/**
 * ShopAssignment - Transactional record of a shop visit.
 *
 * Captures the complete lifecycle of a railcar's shop visit,
 * from initial planning through completion and departure.
 */
export interface ShopAssignment {
  /** Unique assignment identifier */
  assignmentId: string;

  /** Associated railcar ID */
  railcarId: string;

  /** Assigned shop ID */
  shopId: string;

  /** Shop name (denormalized for convenience) */
  shopName: string;

  /** Associated project ID (if part of a batch) */
  projectId?: string;

  /** Work types to be performed */
  workTypes: WorkType[];

  /** Current status of the assignment */
  status: AssignmentStatus;

  /** Month key for capacity tracking (YYYY-MM) */
  monthKey: string;

  /** Planned arrival date at shop */
  scheduledArrival: Date | null;

  /** Planned completion date */
  scheduledCompletion: Date | null;

  /** Actual arrival date (confirmed) */
  actualArrival: Date | null;

  /** Actual departure date */
  actualDeparture: Date | null;

  /** Estimated cost for this work */
  estimatedCost: number;

  /** Actual cost (if completed) */
  actualCost?: number;

  /** Estimated duration in days */
  estimatedDays: number;

  /** Actual duration in days (calculated) */
  actualDays?: number;

  /** Priority level */
  priority: Priority;

  /** Current or previous customer */
  customerId?: string;

  /** Next customer (for assignment work) */
  nextCustomerId?: string;

  /** Additional notes */
  notes: string;

  /** Record creation timestamp */
  createdAt: Date;

  /** Last update timestamp */
  updatedAt: Date;
}

/**
 * FleetMasterRecord - Core railcar data with status tracking.
 *
 * Represents a railcar in the fleet master database with
 * current operational status.
 */
export interface FleetMasterRecord {
  /** Unique railcar ID / reporting mark */
  railcarId: string;

  /** Car type classification */
  carType: CarType;

  /** Current operational status */
  status: RailcarStatus;

  /** Current physical location */
  currentLocation: string;

  /** Current customer/lessee (if assigned) */
  customerId?: string;

  /** Current assigned shop (if in shop) */
  assignedShopId?: string;

  /** Current shop assignment ID */
  currentAssignmentId?: string;

  /** Last known commodity carried */
  lastCommodity?: string;

  /** Home region preference */
  homeRegion?: string;

  /** Bad order reason (if BAD_ORDER status) */
  badOrderReason?: string;

  /** Last service date */
  lastServiceDate?: Date;

  /** Next service due date */
  nextServiceDue?: Date;

  /** Notes */
  notes: string;

  /** Record timestamps */
  createdAt: Date;
  updatedAt: Date;
}

/**
 * CapacityCheckResult - Result from capacity pre-check operation.
 */
export interface CapacityCheckResult {
  /** Whether the project can be scheduled without overload */
  passed: boolean;

  /** Month of first capacity overload (if any) */
  firstOverloadMonth: string | null;

  /** Total backlog count if project is forced */
  totalBacklog: number;

  /** Detailed breakdown by month */
  monthlyBreakdown: MonthlyCapacityBreakdown[];

  /** Shops that would exceed capacity */
  overloadedShops: ShopOverloadDetail[];

  /** Summary message */
  message: string;
}

/**
 * MonthlyCapacityBreakdown - Capacity status for a specific month.
 */
export interface MonthlyCapacityBreakdown {
  monthKey: string;
  totalCapacity: number;
  usedCapacity: number;
  projectedUsage: number;
  availableAfterProject: number;
  isOverloaded: boolean;
}

/**
 * ShopOverloadDetail - Details about a shop exceeding capacity.
 */
export interface ShopOverloadDetail {
  shopId: string;
  shopName: string;
  monthKey: string;
  capacity: number;
  projected: number;
  overloadAmount: number;
}

/**
 * ShopLoadSummary - Summary of shop load for a given period.
 */
export interface ShopLoadSummary {
  shopId: string;
  shopName: string;
  monthKey: string;
  totalCommitments: number;
  plannedCount: number;
  scheduledCount: number;
  inShopCount: number;
  availableCapacity: number;
  utilizationPercent: number;
}

// =============================================================================
// SECTION 3 - CONSTANTS
// =============================================================================

/** Work duration in business days by type */
export const WORK_DURATION: Record<string, number> = {
  qualification: 3,
  qual: 3,
  cleaning: 1,
  minor_repair: 2,
  major_repair: 5,
  repair: 3,
  assignment: 1,
  assignment_prep: 1,
  inspection: 1,
  return_prep: 1,
};

/** Default monthly capacity values */
export const DEFAULT_MONTHLY_QUAL_CAPACITY = 50;
export const DEFAULT_MONTHLY_ASSIGN_CAPACITY = 30;
export const DEFAULT_MONTHLY_RETURN_CAPACITY = 40;
export const DEFAULT_MONTHLY_REPAIR_CAPACITY = 20;

/** Planning horizon in months */
export const PLANNING_HORIZON_MONTHS = 6;

/** Transit time defaults */
export const DEFAULT_TRANSIT_DAYS = 7;

/** Business days per month (average) */
export const BUSINESS_DAYS_PER_MONTH = 22;

// =============================================================================
// SECTION 4 - UTILITY FUNCTIONS
// =============================================================================

/**
 * Generates a unique ID with a prefix.
 */
function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${prefix}-${timestamp}${random}`.toUpperCase();
}

/**
 * Converts a Date to month key format (YYYY-MM).
 */
function toMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Parses a month key string to a Date (first day of month).
 */
function parseMonthKey(monthKey: string): Date {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

/**
 * Adds months to a month key string.
 */
function addMonthsToKey(monthKey: string, months: number): string {
  const date = parseMonthKey(monthKey);
  date.setMonth(date.getMonth() + months);
  return toMonthKey(date);
}

/**
 * Adds business days to a date.
 */
function addBusinessDays(startDate: Date, days: number): Date {
  const result = new Date(startDate);
  let daysAdded = 0;

  while (daysAdded < days) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      daysAdded++;
    }
  }

  return result;
}

/**
 * Deep clones an object.
 */
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// =============================================================================
// SECTION 5 - MASTER DATA STORE (TypeScript Mock)
// =============================================================================

/**
 * MasterDataStore - Central data management for project planning.
 *
 * Provides in-memory data storage with mock database operations
 * for fleet records, shop capacities, and shop assignments.
 * Designed to integrate with existing Python MasterDataStore patterns.
 */
export class MasterDataStore {
  private fleetMaster: Map<string, FleetMasterRecord> = new Map();
  private shopCapacities: Map<string, ShopCapacity> = new Map();
  private shopAssignments: Map<string, ShopAssignment> = new Map();
  private projects: Map<string, ProjectDetails> = new Map();

  constructor() {
    this.initializeDefaultData();
  }

  /**
   * Initialize with sample data for testing.
   */
  private initializeDefaultData(): void {
    // Initialize sample shop capacities
    const sampleShops: ShopCapacity[] = [
      {
        shopId: 'AITX-BC',
        shopName: 'AITX Bossier City',
        shopType: ShopType.AITX_OWNED,
        location: 'Bossier City, LA',
        qualCapacity: 60,
        assignCapacity: 40,
        returnCapacity: 50,
        repairCapacity: 25,
        supportedCarTypes: Object.values(CarType),
        isActive: true,
        efficiencyRating: 0.95,
        monthlySlots: {},
      },
      {
        shopId: 'AITX-HOU',
        shopName: 'AITX Houston',
        shopType: ShopType.AITX_PRIMARY,
        location: 'Houston, TX',
        qualCapacity: 55,
        assignCapacity: 35,
        returnCapacity: 45,
        repairCapacity: 20,
        supportedCarTypes: Object.values(CarType),
        isActive: true,
        efficiencyRating: 0.92,
        monthlySlots: {},
      },
      {
        shopId: 'PARTNER-DAL',
        shopName: 'Partner Dallas',
        shopType: ShopType.PARTNER,
        location: 'Dallas, TX',
        qualCapacity: 40,
        assignCapacity: 25,
        returnCapacity: 35,
        repairCapacity: 15,
        supportedCarTypes: Object.values(CarType),
        isActive: true,
        efficiencyRating: 0.85,
        monthlySlots: {},
      },
    ];

    for (const shop of sampleShops) {
      this.initializeShopSlots(shop);
      this.shopCapacities.set(shop.shopId, shop);
    }
  }

  /**
   * Initialize monthly slots for a shop across the planning horizon.
   */
  private initializeShopSlots(shop: ShopCapacity): void {
    const today = new Date();
    for (let i = 0; i < PLANNING_HORIZON_MONTHS + 2; i++) {
      const date = new Date(today);
      date.setMonth(date.getMonth() + i);
      const monthKey = toMonthKey(date);

      shop.monthlySlots[monthKey] = {
        qualification: shop.qualCapacity,
        assignment: shop.assignCapacity,
        return: shop.returnCapacity,
        repair: shop.repairCapacity,
        total: shop.qualCapacity + shop.assignCapacity,
      };
    }
  }

  // =========================================================================
  // FLEET MASTER OPERATIONS
  // =========================================================================

  /**
   * Get a fleet record by railcar ID.
   */
  getFleetRecord(railcarId: string): FleetMasterRecord | undefined {
    return this.fleetMaster.get(railcarId);
  }

  /**
   * Get all fleet records.
   */
  getAllFleetRecords(): FleetMasterRecord[] {
    return Array.from(this.fleetMaster.values());
  }

  /**
   * Add or update a fleet record.
   * Simulates: this.db.fleetMaster.upsert(...)
   */
  upsertFleetRecord(record: FleetMasterRecord): FleetMasterRecord {
    record.updatedAt = new Date();
    this.fleetMaster.set(record.railcarId, record);
    console.log(`[DB] FleetMaster.upsert: ${record.railcarId} -> status: ${record.status}`);
    return record;
  }

  /**
   * Update fleet record status.
   * Simulates: this.db.fleetMaster.update({ where: { railcarId }, data: { status } })
   */
  updateFleetStatus(railcarId: string, status: RailcarStatus): FleetMasterRecord | null {
    const record = this.fleetMaster.get(railcarId);
    if (!record) {
      console.warn(`[DB] FleetMaster.update: Record not found for ${railcarId}`);
      return null;
    }

    record.status = status;
    record.updatedAt = new Date();
    this.fleetMaster.set(railcarId, record);
    console.log(`[DB] FleetMaster.update: ${railcarId} status -> ${status}`);
    return record;
  }

  /**
   * Get fleet records by status.
   */
  getFleetByStatus(status: RailcarStatus): FleetMasterRecord[] {
    return Array.from(this.fleetMaster.values()).filter((r) => r.status === status);
  }

  // =========================================================================
  // SHOP CAPACITY OPERATIONS
  // =========================================================================

  /**
   * Get shop capacity by ID.
   */
  getShopCapacity(shopId: string): ShopCapacity | undefined {
    return this.shopCapacities.get(shopId);
  }

  /**
   * Get all shop capacities.
   */
  getAllShopCapacities(): ShopCapacity[] {
    return Array.from(this.shopCapacities.values());
  }

  /**
   * Clone shop capacities for scenario analysis (does not affect live data).
   */
  cloneShopCapacities(): Map<string, ShopCapacity> {
    const cloned = new Map<string, ShopCapacity>();
    for (const [id, shop] of this.shopCapacities) {
      cloned.set(id, deepClone(shop));
    }
    return cloned;
  }

  /**
   * Get available slots for a shop in a given month.
   */
  getAvailableSlots(shopId: string, monthKey: string, slotType: string = 'total'): number {
    const shop = this.shopCapacities.get(shopId);
    if (!shop) return 0;

    if (!shop.monthlySlots[monthKey]) {
      this.ensureMonthSlots(shop, monthKey);
    }

    return shop.monthlySlots[monthKey]?.[slotType] ?? 0;
  }

  /**
   * Consume a capacity slot.
   * Simulates: this.db.shopCapacity.update(...)
   */
  consumeSlot(shopId: string, monthKey: string, slotType: string, count: number = 1): boolean {
    const shop = this.shopCapacities.get(shopId);
    if (!shop) return false;

    if (!shop.monthlySlots[monthKey]) {
      this.ensureMonthSlots(shop, monthKey);
    }

    const available = shop.monthlySlots[monthKey][slotType] ?? 0;
    if (available < count) return false;

    shop.monthlySlots[monthKey][slotType] = available - count;
    if (slotType !== 'total') {
      shop.monthlySlots[monthKey].total = Math.max(0, (shop.monthlySlots[monthKey].total ?? 0) - count);
    }

    console.log(`[DB] ShopCapacity.consumeSlot: ${shopId} ${monthKey} ${slotType} -= ${count}`);
    return true;
  }

  /**
   * Release a capacity slot.
   */
  releaseSlot(shopId: string, monthKey: string, slotType: string, count: number = 1): void {
    const shop = this.shopCapacities.get(shopId);
    if (!shop || !shop.monthlySlots[monthKey]) return;

    const maxCapacity =
      slotType === 'qualification'
        ? shop.qualCapacity
        : slotType === 'assignment'
          ? shop.assignCapacity
          : shop.qualCapacity + shop.assignCapacity;

    const current = shop.monthlySlots[monthKey][slotType] ?? 0;
    shop.monthlySlots[monthKey][slotType] = Math.min(current + count, maxCapacity);

    console.log(`[DB] ShopCapacity.releaseSlot: ${shopId} ${monthKey} ${slotType} += ${count}`);
  }

  /**
   * Ensure month slots exist for a shop.
   */
  private ensureMonthSlots(shop: ShopCapacity, monthKey: string): void {
    if (!shop.monthlySlots[monthKey]) {
      shop.monthlySlots[monthKey] = {
        qualification: shop.qualCapacity,
        assignment: shop.assignCapacity,
        return: shop.returnCapacity,
        repair: shop.repairCapacity,
        total: shop.qualCapacity + shop.assignCapacity,
      };
    }
  }

  // =========================================================================
  // SHOP ASSIGNMENT OPERATIONS
  // =========================================================================

  /**
   * Get shop assignment by ID.
   */
  getAssignment(assignmentId: string): ShopAssignment | undefined {
    return this.shopAssignments.get(assignmentId);
  }

  /**
   * Get assignment by railcar ID.
   */
  getAssignmentByRailcar(railcarId: string): ShopAssignment | undefined {
    return Array.from(this.shopAssignments.values()).find(
      (a) => a.railcarId === railcarId && a.status !== AssignmentStatus.COMPLETED && a.status !== AssignmentStatus.CANCELLED
    );
  }

  /**
   * Create a new shop assignment.
   * Simulates: this.db.shopAssignment.create(...)
   */
  createAssignment(assignment: Omit<ShopAssignment, 'assignmentId' | 'createdAt' | 'updatedAt'>): ShopAssignment {
    const now = new Date();
    const newAssignment: ShopAssignment = {
      ...assignment,
      assignmentId: generateId('ASSGN'),
      createdAt: now,
      updatedAt: now,
    };

    this.shopAssignments.set(newAssignment.assignmentId, newAssignment);
    console.log(`[DB] ShopAssignment.create: ${newAssignment.assignmentId} for car ${newAssignment.railcarId}`);
    return newAssignment;
  }

  /**
   * Update a shop assignment.
   * Simulates: this.db.shopAssignment.update(...)
   */
  updateAssignment(assignmentId: string, updates: Partial<ShopAssignment>): ShopAssignment | null {
    const existing = this.shopAssignments.get(assignmentId);
    if (!existing) {
      console.warn(`[DB] ShopAssignment.update: Assignment not found: ${assignmentId}`);
      return null;
    }

    const updated: ShopAssignment = {
      ...existing,
      ...updates,
      assignmentId: existing.assignmentId,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    };

    this.shopAssignments.set(assignmentId, updated);
    console.log(`[DB] ShopAssignment.update: ${assignmentId} -> status: ${updated.status}`);
    return updated;
  }

  /**
   * Get all assignments for a shop in a given month.
   */
  getAssignmentsByShopMonth(shopId: string, monthKey: string): ShopAssignment[] {
    return Array.from(this.shopAssignments.values()).filter(
      (a) => a.shopId === shopId && a.monthKey === monthKey
    );
  }

  /**
   * Get committed assignments (PLANNED, SCHEDULED, or IN_PROGRESS) for a shop/month.
   */
  getCommittedAssignments(shopId: string, monthKey: string): ShopAssignment[] {
    const committedStatuses = [AssignmentStatus.PLANNED, AssignmentStatus.SCHEDULED, AssignmentStatus.IN_PROGRESS];

    return Array.from(this.shopAssignments.values()).filter(
      (a) => a.shopId === shopId && a.monthKey === monthKey && committedStatuses.includes(a.status)
    );
  }

  /**
   * Get all assignments for a project.
   */
  getAssignmentsByProject(projectId: string): ShopAssignment[] {
    return Array.from(this.shopAssignments.values()).filter((a) => a.projectId === projectId);
  }

  // =========================================================================
  // PROJECT OPERATIONS
  // =========================================================================

  /**
   * Add a project.
   */
  addProject(project: ProjectDetails): ProjectDetails {
    project.createdAt = new Date();
    this.projects.set(project.projectId, project);
    console.log(`[DB] Project.create: ${project.projectId} - ${project.name}`);
    return project;
  }

  /**
   * Get a project by ID.
   */
  getProject(projectId: string): ProjectDetails | undefined {
    return this.projects.get(projectId);
  }

  // =========================================================================
  // TRANSACTION SIMULATION
  // =========================================================================

  /**
   * Begin a transaction (mock).
   * In a real implementation, this would start a database transaction.
   */
  beginTransaction(): void {
    console.log('[DB] BEGIN TRANSACTION');
  }

  /**
   * Commit a transaction (mock).
   */
  commitTransaction(): void {
    console.log('[DB] COMMIT TRANSACTION');
  }

  /**
   * Rollback a transaction (mock).
   */
  rollbackTransaction(): void {
    console.log('[DB] ROLLBACK TRANSACTION');
  }
}

// =============================================================================
// SECTION 6 - CHRONOS ENGINE (Capacity Pre-Check)
// =============================================================================

/**
 * ChronosEngine - Extended with project capacity pre-check capabilities.
 *
 * Provides capacity validation for project planning without affecting
 * the live database capacity values.
 */
export class ChronosEngine {
  constructor(private dataStore: MasterDataStore) {}

  /**
   * Check if a project can be scheduled within capacity constraints.
   *
   * This is the Capacity Pre-Check feature that:
   * - Simulates assigning cars at the specified flow rate
   * - Uses a cloned capacity table (does NOT affect live database)
   * - Returns comprehensive results including pass/fail, first overload month, and backlog
   *
   * @param projectDetails - The project to check
   * @returns CapacityCheckResult with detailed breakdown
   */
  checkProjectCapacity(projectDetails: ProjectDetails): CapacityCheckResult {
    console.log(`[ChronosEngine] checkProjectCapacity: ${projectDetails.projectId}`);
    console.log(`  - Cars: ${projectDetails.railcarIds.length}`);
    console.log(`  - Target Shops: ${projectDetails.targetShops.join(', ')}`);
    console.log(`  - Start Month: ${projectDetails.startMonth}`);
    console.log(`  - Flow Rate: ${projectDetails.flowRatePerWeek} cars/week`);

    // Clone capacity data to avoid affecting live database
    const clonedCapacity = this.dataStore.cloneShopCapacities();

    // Initialize tracking variables
    const monthlyBreakdown: MonthlyCapacityBreakdown[] = [];
    const overloadedShops: ShopOverloadDetail[] = [];
    let firstOverloadMonth: string | null = null;
    let totalBacklog = 0;
    let passed = true;

    // Calculate cars per month from weekly flow rate
    const carsPerMonth = projectDetails.flowRatePerWeek * 4;
    const totalCars = projectDetails.railcarIds.length;
    const monthsNeeded = Math.ceil(totalCars / carsPerMonth);

    // Simulate scheduling across months
    let carsScheduled = 0;
    let currentMonth = projectDetails.startMonth;

    for (let monthIndex = 0; monthIndex < monthsNeeded && carsScheduled < totalCars; monthIndex++) {
      const carsThisMonth = Math.min(carsPerMonth, totalCars - carsScheduled);

      // Try to allocate to target shops
      let carsAllocated = 0;
      let monthCapacity = 0;
      let monthUsed = 0;

      for (const shopId of projectDetails.targetShops) {
        const shop = clonedCapacity.get(shopId);
        if (!shop || !shop.isActive) continue;

        // Ensure month slots exist
        if (!shop.monthlySlots[currentMonth]) {
          shop.monthlySlots[currentMonth] = {
            qualification: shop.qualCapacity,
            assignment: shop.assignCapacity,
            return: shop.returnCapacity,
            repair: shop.repairCapacity,
            total: shop.qualCapacity + shop.assignCapacity,
          };
        }

        const available = shop.monthlySlots[currentMonth].qualification;
        monthCapacity += shop.qualCapacity;
        monthUsed += shop.qualCapacity - available;

        const toAllocate = Math.min(available, carsThisMonth - carsAllocated);

        if (toAllocate > 0) {
          shop.monthlySlots[currentMonth].qualification -= toAllocate;
          shop.monthlySlots[currentMonth].total -= toAllocate;
          carsAllocated += toAllocate;
        }

        // Check for overload
        if (carsThisMonth - carsAllocated > 0 && carsAllocated < carsThisMonth) {
          const overload = carsThisMonth - carsAllocated;
          if (!firstOverloadMonth) {
            firstOverloadMonth = currentMonth;
            passed = false;
          }

          overloadedShops.push({
            shopId: shop.shopId,
            shopName: shop.shopName,
            monthKey: currentMonth,
            capacity: shop.qualCapacity,
            projected: shop.qualCapacity - available + carsThisMonth,
            overloadAmount: overload,
          });
        }
      }

      // Calculate backlog for this month
      const monthBacklog = Math.max(0, carsThisMonth - carsAllocated);
      totalBacklog += monthBacklog;

      // Record monthly breakdown
      const totalCapacityThisMonth = projectDetails.targetShops.reduce((sum, shopId) => {
        const shop = clonedCapacity.get(shopId);
        return sum + (shop?.qualCapacity ?? 0);
      }, 0);

      monthlyBreakdown.push({
        monthKey: currentMonth,
        totalCapacity: totalCapacityThisMonth,
        usedCapacity: monthUsed,
        projectedUsage: carsThisMonth,
        availableAfterProject: totalCapacityThisMonth - monthUsed - carsAllocated,
        isOverloaded: monthBacklog > 0,
      });

      carsScheduled += carsAllocated;
      currentMonth = addMonthsToKey(currentMonth, 1);
    }

    // Build result message
    let message: string;
    if (passed) {
      message = `Project can be scheduled successfully. All ${totalCars} cars fit within capacity constraints.`;
    } else {
      message = `Capacity overload detected. First overload in ${firstOverloadMonth}. Total backlog: ${totalBacklog} cars.`;
    }

    const result: CapacityCheckResult = {
      passed,
      firstOverloadMonth,
      totalBacklog,
      monthlyBreakdown,
      overloadedShops,
      message,
    };

    console.log(`[ChronosEngine] checkProjectCapacity result: ${passed ? 'PASSED' : 'FAILED'}`);
    console.log(`  - First Overload Month: ${firstOverloadMonth ?? 'None'}`);
    console.log(`  - Total Backlog: ${totalBacklog}`);

    return result;
  }

  /**
   * Find the best available shop slot for a car.
   *
   * Prioritizes AITX-owned shops, then checks capacity constraints.
   *
   * @param carType - Type of railcar
   * @param targetMonth - Target month for scheduling
   * @param preferredShops - List of preferred shop IDs (optional)
   * @returns Shop ID and month key if slot found, null otherwise
   */
  findBestShopSlot(
    carType: CarType,
    targetMonth: string,
    preferredShops?: string[]
  ): { shopId: string; monthKey: string } | null {
    const shops = this.dataStore.getAllShopCapacities();

    // Sort shops: AITX-owned first, then by efficiency
    const sortedShops = [...shops].sort((a, b) => {
      const aIsAitx = [ShopType.AITX_OWNED, ShopType.AITX_PRIMARY].includes(a.shopType) ? 0 : 1;
      const bIsAitx = [ShopType.AITX_OWNED, ShopType.AITX_PRIMARY].includes(b.shopType) ? 0 : 1;

      if (aIsAitx !== bIsAitx) return aIsAitx - bIsAitx;
      return b.efficiencyRating - a.efficiencyRating;
    });

    // If preferred shops specified, try them first
    if (preferredShops && preferredShops.length > 0) {
      for (const shopId of preferredShops) {
        const shop = shops.find((s) => s.shopId === shopId);
        if (shop && shop.isActive && shop.supportedCarTypes.includes(carType)) {
          const available = this.dataStore.getAvailableSlots(shopId, targetMonth, 'qualification');
          if (available > 0) {
            return { shopId, monthKey: targetMonth };
          }
        }
      }
    }

    // Try all shops in priority order
    for (const shop of sortedShops) {
      if (!shop.isActive || !shop.supportedCarTypes.includes(carType)) continue;

      const available = this.dataStore.getAvailableSlots(shop.shopId, targetMonth, 'qualification');
      if (available > 0) {
        return { shopId: shop.shopId, monthKey: targetMonth };
      }
    }

    // Try subsequent months if target month is full
    for (let offset = 1; offset < PLANNING_HORIZON_MONTHS; offset++) {
      const nextMonth = addMonthsToKey(targetMonth, offset);

      for (const shop of sortedShops) {
        if (!shop.isActive || !shop.supportedCarTypes.includes(carType)) continue;

        const available = this.dataStore.getAvailableSlots(shop.shopId, nextMonth, 'qualification');
        if (available > 0) {
          return { shopId: shop.shopId, monthKey: nextMonth };
        }
      }
    }

    return null;
  }
}

// =============================================================================
// SECTION 7 - SHOP LOAD SERVICE (Transactional State Manager)
// =============================================================================

/**
 * ShopLoadService - Transactional state manager for railcar lifecycle.
 *
 * Manages the complete car lifecycle and solves the shop loading
 * synchronization problem by tracking committed capacity through
 * ShopAssignment records rather than just shop capacity numbers.
 */
export class ShopLoadService {
  constructor(
    private dataStore: MasterDataStore,
    private chronosEngine: ChronosEngine
  ) {}

  // =========================================================================
  // BATCH ASSIGNMENT: forceProjectToPlanned
  // =========================================================================

  /**
   * Batch assignment: Move all project cars to PLANNED status.
   *
   * This method:
   * 1. Updates FleetMaster.status to PLANNED for each car
   * 2. Creates ShopAssignment records for each car, locking capacity slots
   * 3. Runs within a transaction for atomicity
   *
   * @param projectDetails - The project containing cars to plan
   * @returns Array of created ShopAssignment records
   * @throws Error if capacity check fails or transaction fails
   */
  forceProjectToPlanned(projectDetails: ProjectDetails): ShopAssignment[] {
    console.log(`[ShopLoadService] forceProjectToPlanned: ${projectDetails.projectId}`);

    // First, run capacity pre-check
    const capacityCheck = this.chronosEngine.checkProjectCapacity(projectDetails);

    if (!capacityCheck.passed) {
      console.warn(`[ShopLoadService] Capacity check failed: ${capacityCheck.message}`);
      console.warn(`  - Proceeding anyway (force mode). Backlog: ${capacityCheck.totalBacklog}`);
    }

    // Begin transaction
    this.dataStore.beginTransaction();

    try {
      const assignments: ShopAssignment[] = [];
      const carsPerMonth = projectDetails.flowRatePerWeek * 4;
      let currentMonth = projectDetails.startMonth;
      let carsInCurrentMonth = 0;
      let shopIndex = 0;

      // Calculate work duration
      const workTypes = projectDetails.workTypes ?? [WorkType.QUALIFICATION];
      const totalDays = workTypes.reduce((sum, wt) => sum + (WORK_DURATION[wt] ?? 3), 0);

      for (const railcarId of projectDetails.railcarIds) {
        // Rotate through target shops
        const shopId = projectDetails.targetShops[shopIndex % projectDetails.targetShops.length];
        const shop = this.dataStore.getShopCapacity(shopId);

        if (!shop) {
          console.warn(`[ShopLoadService] Shop not found: ${shopId}`);
          continue;
        }

        // Step 1: Update FleetMaster status to PLANNED
        let fleetRecord = this.dataStore.getFleetRecord(railcarId);

        if (!fleetRecord) {
          // Create new fleet record if doesn't exist
          fleetRecord = {
            railcarId,
            carType: CarType.TANK,
            status: RailcarStatus.PLANNED,
            currentLocation: '',
            notes: `Added via project ${projectDetails.projectId}`,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          this.dataStore.upsertFleetRecord(fleetRecord);
        } else {
          this.dataStore.updateFleetStatus(railcarId, RailcarStatus.PLANNED);
        }

        // Step 2: Calculate scheduled dates
        const monthDate = parseMonthKey(currentMonth);
        const scheduledArrival = new Date(monthDate);
        scheduledArrival.setDate(scheduledArrival.getDate() + Math.floor((carsInCurrentMonth / carsPerMonth) * 28));
        const scheduledCompletion = addBusinessDays(scheduledArrival, totalDays);

        // Step 3: Create ShopAssignment record
        const assignment = this.dataStore.createAssignment({
          railcarId,
          shopId,
          shopName: shop.shopName,
          projectId: projectDetails.projectId,
          workTypes,
          status: AssignmentStatus.PLANNED,
          monthKey: currentMonth,
          scheduledArrival,
          scheduledCompletion,
          actualArrival: null,
          actualDeparture: null,
          estimatedCost: 15000, // Default estimate
          estimatedDays: totalDays,
          priority: projectDetails.priority ?? Priority.MEDIUM,
          customerId: projectDetails.customerId,
          notes: `Project: ${projectDetails.name}`,
        });

        // Step 4: Consume capacity slot
        this.dataStore.consumeSlot(shopId, currentMonth, 'qualification', 1);

        assignments.push(assignment);
        carsInCurrentMonth++;
        shopIndex++;

        // Move to next month if current month allocation is full
        if (carsInCurrentMonth >= carsPerMonth) {
          currentMonth = addMonthsToKey(currentMonth, 1);
          carsInCurrentMonth = 0;
        }
      }

      // Commit transaction
      this.dataStore.commitTransaction();

      console.log(`[ShopLoadService] forceProjectToPlanned complete: ${assignments.length} assignments created`);
      return assignments;
    } catch (error) {
      // Rollback on error
      this.dataStore.rollbackTransaction();
      console.error(`[ShopLoadService] forceProjectToPlanned failed:`, error);
      throw error;
    }
  }

  // =========================================================================
  // SCHEDULE COMMITMENT: moveToScheduled
  // =========================================================================

  /**
   * Commit to a final schedule date for a railcar.
   *
   * Updates:
   * - FleetMaster.status to SCHEDULED
   * - ShopAssignment.scheduledArrival to the specified date
   * - ShopAssignment.status to SCHEDULED
   *
   * @param railcarId - The railcar to schedule
   * @param scheduledDate - The committed arrival date
   * @returns Updated ShopAssignment or null if not found
   */
  moveToScheduled(railcarId: string, scheduledDate: Date): ShopAssignment | null {
    console.log(`[ShopLoadService] moveToScheduled: ${railcarId} -> ${scheduledDate.toISOString()}`);

    // Begin transaction
    this.dataStore.beginTransaction();

    try {
      // Step 1: Update FleetMaster status
      const fleetRecord = this.dataStore.updateFleetStatus(railcarId, RailcarStatus.SCHEDULED);
      if (!fleetRecord) {
        throw new Error(`Fleet record not found for railcar: ${railcarId}`);
      }

      // Step 2: Find and update ShopAssignment
      const assignment = this.dataStore.getAssignmentByRailcar(railcarId);
      if (!assignment) {
        throw new Error(`No active assignment found for railcar: ${railcarId}`);
      }

      // Calculate new completion date based on scheduled arrival
      const workDays = assignment.estimatedDays;
      const scheduledCompletion = addBusinessDays(scheduledDate, workDays);

      // Update assignment
      const updatedAssignment = this.dataStore.updateAssignment(assignment.assignmentId, {
        scheduledArrival: scheduledDate,
        scheduledCompletion,
        status: AssignmentStatus.SCHEDULED,
        monthKey: toMonthKey(scheduledDate),
      });

      // Commit transaction
      this.dataStore.commitTransaction();

      console.log(`[ShopLoadService] moveToScheduled complete: ${railcarId} scheduled for ${scheduledDate.toDateString()}`);
      return updatedAssignment;
    } catch (error) {
      this.dataStore.rollbackTransaction();
      console.error(`[ShopLoadService] moveToScheduled failed:`, error);
      throw error;
    }
  }

  // =========================================================================
  // ARRIVAL CONFIRMATION: confirmArrival
  // =========================================================================

  /**
   * Confirm physical arrival of a railcar at a shop.
   *
   * Updates:
   * - FleetMaster.status to IN_SHOP
   * - ShopAssignment.actualArrival to the specified date
   * - ShopAssignment.status to IN_PROGRESS
   *
   * @param railcarId - The railcar that arrived
   * @param actualArrival - The actual arrival date
   * @returns Updated ShopAssignment or null if not found
   */
  confirmArrival(railcarId: string, actualArrival: Date): ShopAssignment | null {
    console.log(`[ShopLoadService] confirmArrival: ${railcarId} arrived ${actualArrival.toISOString()}`);

    // Begin transaction
    this.dataStore.beginTransaction();

    try {
      // Step 1: Update FleetMaster status
      const fleetRecord = this.dataStore.updateFleetStatus(railcarId, RailcarStatus.IN_SHOP);
      if (!fleetRecord) {
        throw new Error(`Fleet record not found for railcar: ${railcarId}`);
      }

      // Step 2: Find and update ShopAssignment
      const assignment = this.dataStore.getAssignmentByRailcar(railcarId);
      if (!assignment) {
        throw new Error(`No active assignment found for railcar: ${railcarId}`);
      }

      // Update fleet record with shop assignment
      fleetRecord.assignedShopId = assignment.shopId;
      fleetRecord.currentAssignmentId = assignment.assignmentId;
      this.dataStore.upsertFleetRecord(fleetRecord);

      // Update assignment
      const updatedAssignment = this.dataStore.updateAssignment(assignment.assignmentId, {
        actualArrival,
        status: AssignmentStatus.IN_PROGRESS,
      });

      // Commit transaction
      this.dataStore.commitTransaction();

      console.log(`[ShopLoadService] confirmArrival complete: ${railcarId} now IN_SHOP at ${assignment.shopName}`);
      return updatedAssignment;
    } catch (error) {
      this.dataStore.rollbackTransaction();
      console.error(`[ShopLoadService] confirmArrival failed:`, error);
      throw error;
    }
  }

  // =========================================================================
  // DEPARTURE CONFIRMATION: confirmDeparture
  // =========================================================================

  /**
   * Confirm departure of a railcar from a shop.
   *
   * End of shop cycle processing:
   * - Updates ShopAssignment.actualDeparture
   * - Sets ShopAssignment.status to COMPLETED
   * - Calculates actual duration
   * - Sets FleetMaster.status based on reinspection need:
   *   - AVAILABLE if car needs reinspection
   *   - ASSIGNED if car is fully qualified and ready for customer
   *
   * @param railcarId - The railcar departing
   * @param departureDate - The actual departure date
   * @param needsReinspection - True if car needs to return for reinspection
   * @returns Updated ShopAssignment or null if not found
   */
  confirmDeparture(railcarId: string, departureDate: Date, needsReinspection: boolean): ShopAssignment | null {
    console.log(
      `[ShopLoadService] confirmDeparture: ${railcarId} departing ${departureDate.toISOString()}, reinspection: ${needsReinspection}`
    );

    // Begin transaction
    this.dataStore.beginTransaction();

    try {
      // Step 1: Find assignment
      const assignment = this.dataStore.getAssignmentByRailcar(railcarId);
      if (!assignment) {
        throw new Error(`No active assignment found for railcar: ${railcarId}`);
      }

      // Step 2: Calculate actual duration
      let actualDays = 0;
      if (assignment.actualArrival) {
        actualDays = Math.ceil((departureDate.getTime() - assignment.actualArrival.getTime()) / (1000 * 60 * 60 * 24));
      }

      // Step 3: Update ShopAssignment
      const updatedAssignment = this.dataStore.updateAssignment(assignment.assignmentId, {
        actualDeparture: departureDate,
        actualDays,
        status: AssignmentStatus.COMPLETED,
      });

      // Step 4: Determine new fleet status
      // If needs reinspection -> AVAILABLE (ready for next assignment/storage but needs work)
      // If fully qualified -> ASSIGNED (ready for customer service)
      const newStatus = needsReinspection ? RailcarStatus.AVAILABLE : RailcarStatus.ASSIGNED;

      // Step 5: Update FleetMaster
      const fleetRecord = this.dataStore.getFleetRecord(railcarId);
      if (fleetRecord) {
        fleetRecord.status = newStatus;
        fleetRecord.assignedShopId = undefined;
        fleetRecord.currentAssignmentId = undefined;
        fleetRecord.lastServiceDate = departureDate;

        if (needsReinspection) {
          fleetRecord.notes = 'Needs reinspection';
        }

        this.dataStore.upsertFleetRecord(fleetRecord);
      }

      // Step 6: Release capacity slot back to shop
      this.dataStore.releaseSlot(assignment.shopId, assignment.monthKey, 'qualification', 1);

      // Commit transaction
      this.dataStore.commitTransaction();

      console.log(`[ShopLoadService] confirmDeparture complete: ${railcarId} now ${newStatus}`);
      return updatedAssignment;
    } catch (error) {
      this.dataStore.rollbackTransaction();
      console.error(`[ShopLoadService] confirmDeparture failed:`, error);
      throw error;
    }
  }

  // =========================================================================
  // SHOP LOAD QUERY: getShopLoad
  // =========================================================================

  /**
   * Get the true committed load for a shop in a given month.
   *
   * THE FIX: This queries ShopAssignment records to show actual committed load,
   * counting all events where status is PLANNED, SCHEDULED, or IN_SHOP.
   * This solves the shop loading synchronization problem.
   *
   * @param shopName - Name or ID of the shop
   * @param month - Month in YYYY-MM format
   * @returns ShopLoadSummary with detailed breakdown
   */
  getShopLoad(shopName: string, month: string): ShopLoadSummary {
    console.log(`[ShopLoadService] getShopLoad: ${shopName} for ${month}`);

    // Find shop by name or ID
    const shops = this.dataStore.getAllShopCapacities();
    const shop = shops.find((s) => s.shopId === shopName || s.shopName === shopName);

    if (!shop) {
      console.warn(`[ShopLoadService] Shop not found: ${shopName}`);
      return {
        shopId: shopName,
        shopName: shopName,
        monthKey: month,
        totalCommitments: 0,
        plannedCount: 0,
        scheduledCount: 0,
        inShopCount: 0,
        availableCapacity: 0,
        utilizationPercent: 0,
      };
    }

    // Query committed assignments for this shop/month
    const assignments = this.dataStore.getCommittedAssignments(shop.shopId, month);

    // Count by status
    const plannedCount = assignments.filter((a) => a.status === AssignmentStatus.PLANNED).length;
    const scheduledCount = assignments.filter((a) => a.status === AssignmentStatus.SCHEDULED).length;
    const inShopCount = assignments.filter((a) => a.status === AssignmentStatus.IN_PROGRESS).length;
    const totalCommitments = plannedCount + scheduledCount + inShopCount;

    // Calculate available capacity
    const totalCapacity = shop.qualCapacity;
    const availableCapacity = Math.max(0, totalCapacity - totalCommitments);
    const utilizationPercent = totalCapacity > 0 ? (totalCommitments / totalCapacity) * 100 : 0;

    const summary: ShopLoadSummary = {
      shopId: shop.shopId,
      shopName: shop.shopName,
      monthKey: month,
      totalCommitments,
      plannedCount,
      scheduledCount,
      inShopCount,
      availableCapacity,
      utilizationPercent: Math.round(utilizationPercent * 10) / 10,
    };

    console.log(`[ShopLoadService] getShopLoad result:`);
    console.log(`  - Total Commitments: ${totalCommitments}`);
    console.log(`  - Planned: ${plannedCount}, Scheduled: ${scheduledCount}, In Shop: ${inShopCount}`);
    console.log(`  - Available Capacity: ${availableCapacity}/${totalCapacity}`);
    console.log(`  - Utilization: ${summary.utilizationPercent}%`);

    return summary;
  }

  // =========================================================================
  // ADDITIONAL UTILITY METHODS
  // =========================================================================

  /**
   * Get shop load summary for all shops in a given month.
   */
  getAllShopsLoad(month: string): ShopLoadSummary[] {
    const shops = this.dataStore.getAllShopCapacities();
    return shops.map((shop) => this.getShopLoad(shop.shopId, month));
  }

  /**
   * Move a car to IN_TRANSIT status.
   */
  moveToInTransit(railcarId: string): FleetMasterRecord | null {
    console.log(`[ShopLoadService] moveToInTransit: ${railcarId}`);
    return this.dataStore.updateFleetStatus(railcarId, RailcarStatus.IN_TRANSIT);
  }

  /**
   * Mark a car as BAD_ORDER.
   */
  markBadOrder(railcarId: string, reason: string): FleetMasterRecord | null {
    console.log(`[ShopLoadService] markBadOrder: ${railcarId} - ${reason}`);

    const record = this.dataStore.getFleetRecord(railcarId);
    if (!record) return null;

    record.status = RailcarStatus.BAD_ORDER;
    record.badOrderReason = reason;
    return this.dataStore.upsertFleetRecord(record);
  }

  /**
   * Cancel an assignment and release capacity.
   */
  cancelAssignment(assignmentId: string): ShopAssignment | null {
    console.log(`[ShopLoadService] cancelAssignment: ${assignmentId}`);

    this.dataStore.beginTransaction();

    try {
      const assignment = this.dataStore.getAssignment(assignmentId);
      if (!assignment) {
        throw new Error(`Assignment not found: ${assignmentId}`);
      }

      // Update assignment status
      const updated = this.dataStore.updateAssignment(assignmentId, {
        status: AssignmentStatus.CANCELLED,
      });

      // Release capacity slot
      this.dataStore.releaseSlot(assignment.shopId, assignment.monthKey, 'qualification', 1);

      // Update fleet record status back to AVAILABLE
      this.dataStore.updateFleetStatus(assignment.railcarId, RailcarStatus.AVAILABLE);

      this.dataStore.commitTransaction();
      return updated;
    } catch (error) {
      this.dataStore.rollbackTransaction();
      console.error(`[ShopLoadService] cancelAssignment failed:`, error);
      throw error;
    }
  }
}

// =============================================================================
// SECTION 8 - FACTORY FUNCTIONS AND EXPORTS
// =============================================================================

/**
 * Create a fully initialized project planning service instance.
 */
export function createProjectPlanningServices(): {
  dataStore: MasterDataStore;
  chronosEngine: ChronosEngine;
  shopLoadService: ShopLoadService;
} {
  const dataStore = new MasterDataStore();
  const chronosEngine = new ChronosEngine(dataStore);
  const shopLoadService = new ShopLoadService(dataStore, chronosEngine);

  return { dataStore, chronosEngine, shopLoadService };
}

/**
 * Create a sample project for testing.
 */
export function createSampleProject(): ProjectDetails {
  return {
    projectId: generateId('PROJ'),
    name: 'Q1 2026 Qualification Batch',
    railcarIds: [
      'UTLX-10001',
      'UTLX-10002',
      'UTLX-10003',
      'UTLX-10004',
      'UTLX-10005',
      'UTLX-10006',
      'UTLX-10007',
      'UTLX-10008',
      'UTLX-10009',
      'UTLX-10010',
    ],
    targetShops: ['AITX-BC', 'AITX-HOU'],
    startMonth: '2026-03',
    flowRatePerWeek: 2,
    priority: Priority.HIGH,
    workTypes: [WorkType.QUALIFICATION],
    notes: 'Batch qualification project for Q1 2026',
  };
}

// =============================================================================
// MAIN EXECUTION BLOCK (for testing)
// =============================================================================

if (require.main === module) {
  console.log('='.repeat(70));
  console.log('  PROJECT PLANNING SERVICE - TEST EXECUTION');
  console.log('='.repeat(70));
  console.log();

  // Initialize services
  const { dataStore, chronosEngine, shopLoadService } = createProjectPlanningServices();

  // Create sample project
  const project = createSampleProject();
  console.log('Sample Project:', JSON.stringify(project, null, 2));
  console.log();

  // Test 1: Capacity Pre-Check
  console.log('-'.repeat(70));
  console.log('TEST 1: Capacity Pre-Check');
  console.log('-'.repeat(70));
  const capacityResult = chronosEngine.checkProjectCapacity(project);
  console.log('Result:', JSON.stringify(capacityResult, null, 2));
  console.log();

  // Test 2: Force Project to Planned
  console.log('-'.repeat(70));
  console.log('TEST 2: Force Project to Planned');
  console.log('-'.repeat(70));
  const assignments = shopLoadService.forceProjectToPlanned(project);
  console.log(`Created ${assignments.length} assignments`);
  console.log();

  // Test 3: Get Shop Load
  console.log('-'.repeat(70));
  console.log('TEST 3: Get Shop Load');
  console.log('-'.repeat(70));
  const shopLoad = shopLoadService.getShopLoad('AITX-BC', '2026-03');
  console.log('Shop Load:', JSON.stringify(shopLoad, null, 2));
  console.log();

  // Test 4: Lifecycle Transitions
  console.log('-'.repeat(70));
  console.log('TEST 4: Lifecycle Transitions');
  console.log('-'.repeat(70));

  const testCarId = 'UTLX-10001';

  // Move to scheduled
  const scheduled = shopLoadService.moveToScheduled(testCarId, new Date('2026-03-15'));
  console.log(`Scheduled: ${scheduled?.railcarId} -> ${scheduled?.status}`);

  // Confirm arrival
  const arrived = shopLoadService.confirmArrival(testCarId, new Date('2026-03-16'));
  console.log(`Arrived: ${arrived?.railcarId} -> ${arrived?.status}`);

  // Confirm departure
  const departed = shopLoadService.confirmDeparture(testCarId, new Date('2026-03-20'), false);
  console.log(`Departed: ${departed?.railcarId} -> ${departed?.status}`);

  console.log();
  console.log('='.repeat(70));
  console.log('  TEST EXECUTION COMPLETE');
  console.log('='.repeat(70));
}

// Module exports
export default {
  // Enums
  RailcarStatus,
  WorkType,
  ShopType,
  CarType,
  Priority,
  AssignmentStatus,

  // Classes
  MasterDataStore,
  ChronosEngine,
  ShopLoadService,

  // Factory functions
  createProjectPlanningServices,
  createSampleProject,

  // Constants
  WORK_DURATION,
  DEFAULT_MONTHLY_QUAL_CAPACITY,
  DEFAULT_MONTHLY_ASSIGN_CAPACITY,
  PLANNING_HORIZON_MONTHS,
};
