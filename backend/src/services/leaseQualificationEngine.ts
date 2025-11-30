/**
 * leaseQualificationEngine.ts - Lease Release + Qualification Planning Engine
 *
 * This module implements the complete S&OP-style lease qualification planning system:
 * - Lease release tracking and planning
 * - Qualification queue management
 * - Shop capacity planning with car-type rules
 * - Work bundling (Assign + Qual + Repair)
 * - Scenario runner (base, late-release, capacity-shift)
 * - Metrics calculation and comparison
 * - Internal team plans and customer-facing document generation
 *
 * @author AITX Chronos Team
 * @version 1.0.0
 */

import { prisma } from './db';

// =============================================================================
// SECTION 1 - ENUMERATIONS
// =============================================================================

/** Scenario types for qualification planning */
export enum ScenarioType {
  BASE = 'base',
  LATE_RELEASE = 'late_release',
  CAPACITY_SHIFT = 'capacity_shift',
  CUSTOM = 'custom',
}

/** Status of a qualification entry in the queue */
export enum QueueStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  LATE = 'late',
  CANCELLED = 'cancelled',
}

/** Types of work that can be bundled */
export enum WorkType {
  QUALIFICATION = 'qualification',
  ASSIGNMENT = 'assignment',
  CLEANING = 'cleaning',
  MINOR_REPAIR = 'minor_repair',
  MAJOR_REPAIR = 'major_repair',
  INSPECTION = 'inspection',
  RETURN_PREP = 'return_prep',
}

/** Priority levels */
export enum Priority {
  CRITICAL = 1,
  HIGH = 2,
  MEDIUM = 3,
  LOW = 4,
}

/** Event types in the qualification workflow */
export enum EventType {
  RELEASE = 'release',
  TRANSPORT = 'transport',
  SHOP_ARRIVAL = 'shop_arrival',
  QUAL_START = 'qual_start',
  QUAL_COMPLETE = 'qual_complete',
  ASSIGNMENT_START = 'assignment_start',
  DEPARTURE = 'departure',
}

/** Document types */
export enum DocumentType {
  TEAM_PLAN = 'team_plan',
  CUSTOMER_SCHEDULE = 'customer_schedule',
  SUMMARY_REPORT = 'summary_report',
  COMPARISON_REPORT = 'comparison_report',
}

// =============================================================================
// SECTION 2 - INTERFACES
// =============================================================================

/** Lease release entry for planning */
export interface LeaseRelease {
  carId: string;
  railcarNumber: string;
  customerId: string;
  customerName: string;
  leaseEndDate: Date;
  plannedReleaseDate: Date;
  nextCustomerId?: string;
  nextCustomerName?: string;
  commodity: string;
  carType: string;
  isTankCar: boolean;
  homeRegion: string;
  priority: Priority;
}

/** Qualification queue entry */
export interface QualificationQueueEntry {
  id: string;
  carId: string;
  railcarNumber: string;
  customerId: string;
  customerName: string;
  plannedReleaseDate: Date;
  targetMonth: string;
  workTypes: WorkType[];
  isBundled: boolean;
  bundleReason: string;
  assignedShopId?: string;
  assignedShopName?: string;
  priority: Priority;
  queueStatus: QueueStatus;
  daysInQueue: number;
  nextCustomerId?: string;
}

/** Shop capacity snapshot */
export interface ShopCapacitySnapshot {
  shopId: string;
  shopName: string;
  shopCode: string;
  region: string;
  tankQualified: boolean;
  monthlyCapacity: Record<string, MonthlySlots>;
  supportedCarTypes: string[];
  efficiencyRating: number;
}

/** Monthly capacity slots */
export interface MonthlySlots {
  qualification: number;
  assignment: number;
  repair: number;
  used: number;
  available: number;
  utilization: number;
}

/** Scheduled event in the plan */
export interface ScheduledEvent {
  id: string;
  qualEntryId: string;
  carId: string;
  railcarNumber: string;
  eventType: EventType;
  plannedDate: Date;
  shopId?: string;
  shopName?: string;
  estimatedDays: number;
  estimatedCost: number;
  status: string;
}

/** Scenario metrics */
export interface ScenarioMetrics {
  scenarioId: string;
  scenarioName: string;
  scenarioType: ScenarioType;

  // Release compliance
  totalReleases: number;
  onTimeReleases: number;
  lateReleases: number;
  releaseCompliancePercent: number;

  // Qualification plan attainment
  plannedQualifications: number;
  completedQualifications: number;
  qualPlanAttainmentPercent: number;

  // Backlog metrics
  currentBacklog: number;
  projectedBacklog: number;
  backlogByMonth: Record<string, number>;

  // Wait time metrics
  averageWaitDays: number;
  longestWaitDays: number;
  waitTimeByPriority: Record<string, number>;

  // Capacity utilization
  overallUtilizationPercent: number;
  utilizationByShop: Record<string, number>;
  utilizationByMonth: Record<string, number>;

  // Assignment readiness
  carsReadyForAssignment: number;
  carsNotReady: number;
  assignmentReadinessPercent: number;

  // Risk score (0-100, higher = more risk)
  riskScore: number;
  riskFactors: string[];

  // Cost projections
  totalEstimatedCost: number;
  costByMonth: Record<string, number>;
  costByShop: Record<string, number>;
}

/** Scenario comparison result */
export interface ScenarioComparison {
  scenarios: ScenarioMetrics[];
  comparisonTable: string; // Markdown table
  recommendations: string[];
  bestScenarioId: string;
  bestScenarioReason: string;
}

/** Plan assignment for a scenario */
export interface PlanAssignment {
  id: string;
  scenarioId: string;
  carId: string;
  railcarNumber: string;
  shopId: string;
  shopName: string;
  monthKey: string;
  workTypes: WorkType[];
  isBundled: boolean;
  priority: Priority;
  scheduledArrival?: Date;
  scheduledCompletion?: Date;
  estimatedDays: number;
  estimatedCost: number;
  currentCustomerId?: string;
  currentCustomerName?: string;
  nextCustomerId?: string;
  nextCustomerName?: string;
  status: string;
}

/** Team plan structure */
export interface TeamPlan {
  scenarioId: string;
  scenarioName: string;
  generatedAt: Date;
  planningHorizon: { start: string; end: string };

  // By month breakdown
  monthlySchedule: MonthlyPlanSection[];

  // By shop breakdown
  shopSchedule: ShopPlanSection[];

  // Summary statistics
  summary: PlanSummary;

  // Markdown content
  markdownContent: string;
}

/** Monthly section of the plan */
export interface MonthlyPlanSection {
  monthKey: string;
  monthLabel: string;
  totalCars: number;
  assignments: PlanAssignment[];
  capacityStatus: Record<string, { used: number; total: number; percent: number }>;
}

/** Shop section of the plan */
export interface ShopPlanSection {
  shopId: string;
  shopName: string;
  shopCode: string;
  totalCars: number;
  assignments: PlanAssignment[];
  monthlyBreakdown: Record<string, number>;
}

/** Plan summary */
export interface PlanSummary {
  totalCars: number;
  totalBundled: number;
  byWorkType: Record<string, number>;
  byPriority: Record<string, number>;
  byCustomer: Record<string, number>;
  estimatedTotalCost: number;
  averageTurnTime: number;
}

/** Customer schedule structure */
export interface CustomerSchedule {
  customerId: string;
  customerName: string;
  customerCode: string;
  scenarioId: string;
  generatedAt: Date;

  // Inbound cars (coming from customer)
  inboundSchedule: CustomerCarSchedule[];

  // Outbound cars (going to customer)
  outboundSchedule: CustomerCarSchedule[];

  // Summary
  summary: CustomerScheduleSummary;

  // Markdown content
  markdownContent: string;
}

/** Car schedule entry for customer */
export interface CustomerCarSchedule {
  carId: string;
  railcarNumber: string;
  plannedDate: Date;
  shopName: string;
  workTypes: string[];
  estimatedCompletionDate?: Date;
  status: string;
}

/** Customer schedule summary */
export interface CustomerScheduleSummary {
  totalInbound: number;
  totalOutbound: number;
  byMonth: Record<string, { inbound: number; outbound: number }>;
}

// =============================================================================
// SECTION 3 - CONSTANTS
// =============================================================================

/** Work duration in business days by type */
export const WORK_DURATION: Record<string, number> = {
  qualification: 3,
  assignment: 2,
  cleaning: 1,
  minor_repair: 2,
  major_repair: 5,
  inspection: 1,
  return_prep: 1,
};

/** Default costs by work type */
export const WORK_COST: Record<string, number> = {
  qualification: 8000,
  assignment: 5000,
  cleaning: 2000,
  minor_repair: 4000,
  major_repair: 15000,
  inspection: 1500,
  return_prep: 3000,
};

/** Transit time in days */
export const DEFAULT_TRANSIT_DAYS = 7;

/** Planning horizon in months */
export const DEFAULT_PLANNING_HORIZON = 6;

/** Risk thresholds */
export const RISK_THRESHOLDS = {
  backlogHigh: 20,
  backlogCritical: 50,
  utilizationWarning: 85,
  utilizationCritical: 95,
  lateReleaseWarning: 10,
  lateReleaseCritical: 25,
};

// =============================================================================
// SECTION 4 - UTILITY FUNCTIONS
// =============================================================================

/** Generate a unique ID with prefix */
function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}${random}`.toUpperCase();
}

/** Convert Date to month key (YYYY-MM) */
function toMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${year}-${month}`;
}

/** Parse month key to Date (first day of month) */
function parseMonthKey(monthKey: string): Date {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

/** Add months to a month key */
function addMonthsToKey(monthKey: string, months: number): string {
  const date = parseMonthKey(monthKey);
  date.setMonth(date.getMonth() + months);
  return toMonthKey(date);
}

/** Add business days to a date */
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

/** Format date for display */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/** Get month label (e.g., "March 2026") */
function getMonthLabel(monthKey: string): string {
  const date = parseMonthKey(monthKey);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** Deep clone an object */
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/** Calculate days between two dates */
function daysBetween(start: Date, end: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((end.getTime() - start.getTime()) / msPerDay);
}

// =============================================================================
// SECTION 5 - LEASE QUALIFICATION ENGINE
// =============================================================================

/**
 * LeaseQualificationEngine - Core engine for qualification planning
 */
export class LeaseQualificationEngine {
  private prisma: any;
  private companyId: string;

  constructor(prisma: any, companyId: string) {
    this.prisma = prisma;
    this.companyId = companyId;
  }

  // ===========================================================================
  // LEASE RELEASE MANAGEMENT
  // ===========================================================================

  /**
   * Get upcoming lease releases within the planning horizon
   */
  async getUpcomingReleases(horizonMonths: number = DEFAULT_PLANNING_HORIZON): Promise<LeaseRelease[]> {
    const today = new Date();
    const endDate = new Date(today);
    endDate.setMonth(endDate.getMonth() + horizonMonths);

    const contracts = await this.prisma.leaseContract.findMany({
      where: {
        companyId: this.companyId,
        status: { in: ['active', 'pending_release'] },
        endDate: { gte: today, lte: endDate },
      },
      include: {
        car: true,
        customer: true,
      },
      orderBy: { endDate: 'asc' },
    });

    return contracts.map((contract) => ({
      carId: contract.carId,
      railcarNumber: contract.car.railcarNumber,
      customerId: contract.customerId,
      customerName: contract.customer.name,
      leaseEndDate: contract.endDate,
      plannedReleaseDate: contract.releaseDate ?? contract.endDate,
      nextCustomerId: contract.nextCustomerId ?? undefined,
      nextCustomerName: undefined, // Would need additional query
      commodity: contract.commodity,
      carType: contract.car.carType,
      isTankCar: contract.car.isTankCar,
      homeRegion: contract.car.homeRegion,
      priority: this.calculateReleasePriority(contract),
    }));
  }

  /**
   * Calculate priority for a lease release
   */
  private calculateReleasePriority(contract: any): Priority {
    const daysUntilRelease = daysBetween(new Date(), contract.endDate);

    if (daysUntilRelease <= 14) return Priority.CRITICAL;
    if (daysUntilRelease <= 30) return Priority.HIGH;
    if (daysUntilRelease <= 60) return Priority.MEDIUM;
    return Priority.LOW;
  }

  /**
   * Create qualification queue entries from lease releases
   */
  async createQualificationEntries(releases: LeaseRelease[]): Promise<QualificationQueueEntry[]> {
    const entries: QualificationQueueEntry[] = [];

    for (const release of releases) {
      // Determine work types needed
      const workTypes = this.determineWorkTypes(release);
      const isBundled = workTypes.length > 1;
      const bundleReason = isBundled
        ? release.nextCustomerId
          ? 'Immediate reassignment - bundled qual + assignment'
          : 'Multiple work types required'
        : '';

      // Calculate target qualification month
      const releaseDate = new Date(release.plannedReleaseDate);
      releaseDate.setDate(releaseDate.getDate() + DEFAULT_TRANSIT_DAYS);
      const targetMonth = toMonthKey(releaseDate);

      // Create or update entry in database
      const entry = await this.prisma.leaseQualificationEntry.upsert({
        where: {
          id: generateId('QUAL'), // This won't match, so it creates
        },
        create: {
          carId: release.carId,
          customerId: release.customerId,
          plannedReleaseDate: release.plannedReleaseDate,
          targetQualMonth: targetMonth,
          workTypes: JSON.stringify(workTypes),
          isBundled,
          bundleReason,
          queueStatus: QueueStatus.PENDING,
          priority: release.priority,
          nextCustomerId: release.nextCustomerId,
          originalTargetMonth: targetMonth,
          companyId: this.companyId,
        },
        update: {
          plannedReleaseDate: release.plannedReleaseDate,
          targetQualMonth: targetMonth,
          workTypes: JSON.stringify(workTypes),
          isBundled,
          bundleReason,
          priority: release.priority,
          nextCustomerId: release.nextCustomerId,
        },
      });

      entries.push({
        id: entry.id,
        carId: release.carId,
        railcarNumber: release.railcarNumber,
        customerId: release.customerId,
        customerName: release.customerName,
        plannedReleaseDate: release.plannedReleaseDate,
        targetMonth,
        workTypes,
        isBundled,
        bundleReason,
        priority: release.priority,
        queueStatus: entry.queueStatus as QueueStatus,
        daysInQueue: entry.daysInQueue,
        nextCustomerId: release.nextCustomerId,
      });
    }

    return entries;
  }

  /**
   * Determine work types needed for a release
   */
  private determineWorkTypes(release: LeaseRelease): WorkType[] {
    const types: WorkType[] = [WorkType.QUALIFICATION];

    // If immediate reassignment, add assignment work
    if (release.nextCustomerId) {
      types.push(WorkType.ASSIGNMENT);
    }

    // Tank cars may need additional cleaning
    if (release.isTankCar && release.commodity) {
      types.push(WorkType.CLEANING);
    }

    return types;
  }

  // ===========================================================================
  // SHOP CAPACITY MANAGEMENT
  // ===========================================================================

  /**
   * Get shop capacity snapshots for planning
   */
  async getShopCapacities(horizonMonths: number = DEFAULT_PLANNING_HORIZON): Promise<ShopCapacitySnapshot[]> {
    const shops = await this.prisma.shop.findMany({
      where: {
        companyId: this.companyId,
        isActive: true,
      },
      include: {
        capacitySlots: true,
      },
    });

    const today = new Date();
    const snapshots: ShopCapacitySnapshot[] = [];

    for (const shop of shops) {
      const monthlyCapacity: Record<string, MonthlySlots> = {};

      // Build capacity for each month in horizon
      for (let i = 0; i < horizonMonths; i++) {
        const monthDate = new Date(today);
        monthDate.setMonth(monthDate.getMonth() + i);
        const monthKey = toMonthKey(monthDate);

        // Find existing slot or use defaults
        const qualSlot = shop.capacitySlots.find(
          (s) => s.monthKey === monthKey && s.slotType === 'qualification'
        );
        const assignSlot = shop.capacitySlots.find(
          (s) => s.monthKey === monthKey && s.slotType === 'assignment'
        );
        const repairSlot = shop.capacitySlots.find(
          (s) => s.monthKey === monthKey && s.slotType === 'repair'
        );

        const qualCap = qualSlot?.capacity ?? shop.qualCapacity;
        const qualUsed = qualSlot?.used ?? 0;
        const assignCap = assignSlot?.capacity ?? shop.assignCapacity;
        const assignUsed = assignSlot?.used ?? 0;
        const repairCap = repairSlot?.capacity ?? shop.repairCapacity;
        const repairUsed = repairSlot?.used ?? 0;

        const totalCap = qualCap + assignCap + repairCap;
        const totalUsed = qualUsed + assignUsed + repairUsed;

        monthlyCapacity[monthKey] = {
          qualification: qualCap - qualUsed,
          assignment: assignCap - assignUsed,
          repair: repairCap - repairUsed,
          used: totalUsed,
          available: totalCap - totalUsed,
          utilization: totalCap > 0 ? (totalUsed / totalCap) * 100 : 0,
        };
      }

      // Parse capabilities
      let supportedCarTypes: string[] = [];
      try {
        supportedCarTypes = shop.capabilities ? JSON.parse(shop.capabilities) : [];
      } catch {
        supportedCarTypes = [];
      }

      snapshots.push({
        shopId: shop.id,
        shopName: shop.name,
        shopCode: shop.code,
        region: shop.region,
        tankQualified: shop.tankQualified,
        monthlyCapacity,
        supportedCarTypes,
        efficiencyRating: shop.efficiencyRating,
      });
    }

    return snapshots;
  }

  /**
   * Find best shop for a qualification entry
   */
  findBestShop(
    entry: QualificationQueueEntry,
    capacities: ShopCapacitySnapshot[],
    carDetails: { carType: string; isTankCar: boolean; homeRegion: string }
  ): { shopId: string; shopName: string; reason: string } | null {
    interface ShopScore {
      shop: ShopCapacitySnapshot;
      score: number;
      reasons: string[];
    }

    const scores: ShopScore[] = [];

    for (const shop of capacities) {
      let score = 0;
      const reasons: string[] = [];

      // Check tank qualification
      if (carDetails.isTankCar && !shop.tankQualified) {
        continue; // Skip non-tank-qualified shops for tank cars
      }

      // Check capacity availability
      const monthCap = shop.monthlyCapacity[entry.targetMonth];
      if (!monthCap || monthCap.qualification <= 0) {
        continue; // No capacity available
      }

      // Score based on available capacity
      score += monthCap.qualification * 2;
      reasons.push(`Capacity: ${monthCap.qualification} slots`);

      // Score based on region match
      if (shop.region === carDetails.homeRegion) {
        score += 20;
        reasons.push('Region match');
      }

      // Score based on efficiency
      score += shop.efficiencyRating * 10;
      reasons.push(`Efficiency: ${(shop.efficiencyRating * 100).toFixed(0)}%`);

      // Score based on car type support
      if (shop.supportedCarTypes.includes(carDetails.carType)) {
        score += 15;
        reasons.push('Car type supported');
      }

      // Prefer lower utilization
      if (monthCap.utilization < 70) {
        score += 10;
        reasons.push('Low utilization');
      }

      scores.push({ shop, score, reasons });
    }

    if (scores.length === 0) {
      return null;
    }

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);
    const best = scores[0];

    return {
      shopId: best.shop.shopId,
      shopName: best.shop.shopName,
      reason: best.reasons.join('; '),
    };
  }

  // ===========================================================================
  // SCENARIO RUNNER
  // ===========================================================================

  /**
   * Create and run a planning scenario
   */
  async runScenario(
    name: string,
    type: ScenarioType,
    params: {
      lateReleasePercent?: number;
      capacityAdjustments?: Record<string, number>;
      planningHorizonMonths?: number;
    } = {}
  ): Promise<ScenarioMetrics> {
    const horizonMonths = params.planningHorizonMonths ?? DEFAULT_PLANNING_HORIZON;

    // Create scenario record
    const scenario = await this.prisma.qualificationScenario.create({
      data: {
        name,
        scenarioType: type,
        status: 'running',
        planningHorizonMonths: horizonMonths,
        lateReleasePercent: params.lateReleasePercent ?? 0,
        capacityAdjustment: JSON.stringify(params.capacityAdjustments ?? {}),
        companyId: this.companyId,
        createdBy: 'system',
      },
    });

    try {
      // Get releases and capacities
      const releases = await this.getUpcomingReleases(horizonMonths);
      let capacities = await this.getShopCapacities(horizonMonths);

      // Apply scenario modifications
      if (type === ScenarioType.LATE_RELEASE && params.lateReleasePercent) {
        this.applyLateReleaseScenario(releases, params.lateReleasePercent);
      }

      if (type === ScenarioType.CAPACITY_SHIFT && params.capacityAdjustments) {
        capacities = this.applyCapacityShiftScenario(capacities, params.capacityAdjustments);
      }

      // Create qualification entries
      const queueEntries = await this.createQualificationEntries(releases);

      // Assign cars to shops
      const assignments = await this.assignCarsToShops(scenario.id, queueEntries, capacities);

      // Calculate metrics
      const metrics = this.calculateScenarioMetrics(
        scenario.id,
        name,
        type,
        releases,
        queueEntries,
        assignments,
        capacities
      );

      // Update scenario with results
      await this.prisma.qualificationScenario.update({
        where: { id: scenario.id },
        data: {
          status: 'completed',
          metricsJson: JSON.stringify(metrics),
          summaryJson: JSON.stringify({
            releaseCompliance: metrics.releaseCompliancePercent,
            qualAttainment: metrics.qualPlanAttainmentPercent,
            backlog: metrics.currentBacklog,
            riskScore: metrics.riskScore,
          }),
        },
      });

      return metrics;
    } catch (error) {
      await this.prisma.qualificationScenario.update({
        where: { id: scenario.id },
        data: { status: 'draft' },
      });
      throw error;
    }
  }

  /**
   * Apply late release scenario modifications
   */
  private applyLateReleaseScenario(releases: LeaseRelease[], latePercent: number): void {
    const numLate = Math.ceil(releases.length * (latePercent / 100));

    // Randomly select releases to delay
    const shuffled = [...releases].sort(() => Math.random() - 0.5);
    for (let i = 0; i < numLate && i < shuffled.length; i++) {
      const release = shuffled[i];
      // Delay by 2-4 weeks
      const delayDays = 14 + Math.floor(Math.random() * 14);
      const originalDate = new Date(release.plannedReleaseDate);
      originalDate.setDate(originalDate.getDate() + delayDays);
      release.plannedReleaseDate = originalDate;
    }
  }

  /**
   * Apply capacity shift scenario modifications
   */
  private applyCapacityShiftScenario(
    capacities: ShopCapacitySnapshot[],
    adjustments: Record<string, number>
  ): ShopCapacitySnapshot[] {
    const adjusted = deepClone(capacities);

    for (const shop of adjusted) {
      const adjustment = adjustments[shop.shopId];
      if (adjustment !== undefined) {
        const factor = 1 + adjustment / 100;
        for (const monthKey of Object.keys(shop.monthlyCapacity)) {
          const month = shop.monthlyCapacity[monthKey];
          month.qualification = Math.floor(month.qualification * factor);
          month.assignment = Math.floor(month.assignment * factor);
          month.repair = Math.floor(month.repair * factor);
          month.available = month.qualification + month.assignment + month.repair;
        }
      }
    }

    return adjusted;
  }

  /**
   * Assign cars to shops based on capacity and rules
   */
  private async assignCarsToShops(
    scenarioId: string,
    entries: QualificationQueueEntry[],
    capacities: ShopCapacitySnapshot[]
  ): Promise<PlanAssignment[]> {
    const assignments: PlanAssignment[] = [];
    const capacityTracker = deepClone(capacities);

    // Sort entries by priority (critical first)
    const sortedEntries = [...entries].sort((a, b) => a.priority - b.priority);

    for (const entry of sortedEntries) {
      // Get car details
      const car = await this.prisma.car.findUnique({ where: { id: entry.carId } });
      if (!car) continue;

      // Find best shop
      const shopMatch = this.findBestShop(entry, capacityTracker, {
        carType: car.carType,
        isTankCar: car.isTankCar,
        homeRegion: car.homeRegion,
      });

      if (!shopMatch) {
        // No capacity available - car goes to backlog
        continue;
      }

      // Calculate timing
      const arrivalDate = new Date(entry.plannedReleaseDate);
      arrivalDate.setDate(arrivalDate.getDate() + DEFAULT_TRANSIT_DAYS);

      const totalDays = entry.workTypes.reduce(
        (sum, wt) => sum + (WORK_DURATION[wt] ?? 3),
        0
      );
      const completionDate = addBusinessDays(arrivalDate, totalDays);

      const totalCost = entry.workTypes.reduce(
        (sum, wt) => sum + (WORK_COST[wt] ?? 5000),
        0
      );

      // Create assignment record
      const assignment = await this.prisma.qualificationPlanAssignment.create({
        data: {
          scenarioId,
          carId: entry.carId,
          shopId: shopMatch.shopId,
          monthKey: entry.targetMonth,
          workTypes: JSON.stringify(entry.workTypes),
          priority: entry.priority,
          isBundled: entry.isBundled,
          scheduledArrival: arrivalDate,
          scheduledCompletion: completionDate,
          estimatedDays: totalDays,
          estimatedCost: totalCost,
          currentCustomerId: entry.customerId,
          nextCustomerId: entry.nextCustomerId,
          status: 'planned',
          notes: shopMatch.reason,
        },
      });

      // Update capacity tracker
      const shopCap = capacityTracker.find((s) => s.shopId === shopMatch.shopId);
      if (shopCap && shopCap.monthlyCapacity[entry.targetMonth]) {
        shopCap.monthlyCapacity[entry.targetMonth].qualification--;
        shopCap.monthlyCapacity[entry.targetMonth].available--;
      }

      // Get customer names
      const currentCustomer = await this.prisma.customer.findUnique({
        where: { id: entry.customerId },
      });
      const nextCustomer = entry.nextCustomerId
        ? await this.prisma.customer.findUnique({ where: { id: entry.nextCustomerId } })
        : null;

      assignments.push({
        id: assignment.id,
        scenarioId,
        carId: entry.carId,
        railcarNumber: entry.railcarNumber,
        shopId: shopMatch.shopId,
        shopName: shopMatch.shopName,
        monthKey: entry.targetMonth,
        workTypes: entry.workTypes,
        isBundled: entry.isBundled,
        priority: entry.priority,
        scheduledArrival: arrivalDate,
        scheduledCompletion: completionDate,
        estimatedDays: totalDays,
        estimatedCost: totalCost,
        currentCustomerId: entry.customerId,
        currentCustomerName: currentCustomer?.name,
        nextCustomerId: entry.nextCustomerId,
        nextCustomerName: nextCustomer?.name ?? undefined,
        status: 'planned',
      });
    }

    return assignments;
  }

  /**
   * Calculate comprehensive scenario metrics
   */
  private calculateScenarioMetrics(
    scenarioId: string,
    scenarioName: string,
    scenarioType: ScenarioType,
    releases: LeaseRelease[],
    queueEntries: QualificationQueueEntry[],
    assignments: PlanAssignment[],
    capacities: ShopCapacitySnapshot[]
  ): ScenarioMetrics {
    const today = new Date();

    // Release compliance
    const totalReleases = releases.length;
    const onTimeReleases = releases.filter(
      (r) => new Date(r.plannedReleaseDate) >= new Date(r.leaseEndDate)
    ).length;
    const lateReleases = totalReleases - onTimeReleases;
    const releaseCompliancePercent = totalReleases > 0
      ? (onTimeReleases / totalReleases) * 100
      : 100;

    // Qualification plan attainment
    const plannedQualifications = queueEntries.length;
    const completedQualifications = assignments.length;
    const qualPlanAttainmentPercent = plannedQualifications > 0
      ? (completedQualifications / plannedQualifications) * 100
      : 100;

    // Backlog
    const currentBacklog = queueEntries.filter(
      (e) => parseMonthKey(e.targetMonth) < today
    ).length;
    const projectedBacklog = plannedQualifications - completedQualifications;

    const backlogByMonth: Record<string, number> = {};
    for (const entry of queueEntries) {
      if (!assignments.some((a) => a.carId === entry.carId)) {
        backlogByMonth[entry.targetMonth] = (backlogByMonth[entry.targetMonth] ?? 0) + 1;
      }
    }

    // Wait time metrics
    const waitTimes = queueEntries.map((e) => e.daysInQueue);
    const averageWaitDays = waitTimes.length > 0
      ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length
      : 0;
    const longestWaitDays = waitTimes.length > 0 ? Math.max(...waitTimes) : 0;

    const waitTimeByPriority: Record<string, number> = {};
    for (const entry of queueEntries) {
      const key = `Priority ${entry.priority}`;
      if (!waitTimeByPriority[key]) {
        waitTimeByPriority[key] = 0;
      }
      waitTimeByPriority[key] = Math.max(waitTimeByPriority[key], entry.daysInQueue);
    }

    // Capacity utilization
    const utilizationByShop: Record<string, number> = {};
    const utilizationByMonth: Record<string, number> = {};
    let totalUtilization = 0;
    let utilizationCount = 0;

    for (const shop of capacities) {
      let shopTotal = 0;
      let shopCount = 0;
      for (const [monthKey, slots] of Object.entries(shop.monthlyCapacity)) {
        const used = slots.used + assignments.filter(
          (a) => a.shopId === shop.shopId && a.monthKey === monthKey
        ).length;
        const total = slots.available + slots.used;
        const util = total > 0 ? (used / total) * 100 : 0;

        utilizationByMonth[monthKey] = Math.max(utilizationByMonth[monthKey] ?? 0, util);
        shopTotal += util;
        shopCount++;
        totalUtilization += util;
        utilizationCount++;
      }
      utilizationByShop[shop.shopName] = shopCount > 0 ? shopTotal / shopCount : 0;
    }

    const overallUtilizationPercent = utilizationCount > 0
      ? totalUtilization / utilizationCount
      : 0;

    // Assignment readiness
    const carsReadyForAssignment = assignments.filter(
      (a) => a.nextCustomerId && a.status === 'planned'
    ).length;
    const carsNotReady = assignments.length - carsReadyForAssignment;
    const assignmentReadinessPercent = assignments.length > 0
      ? (carsReadyForAssignment / assignments.length) * 100
      : 0;

    // Risk calculation
    const riskFactors: string[] = [];
    let riskScore = 0;

    if (projectedBacklog >= RISK_THRESHOLDS.backlogCritical) {
      riskScore += 30;
      riskFactors.push(`Critical backlog: ${projectedBacklog} cars`);
    } else if (projectedBacklog >= RISK_THRESHOLDS.backlogHigh) {
      riskScore += 15;
      riskFactors.push(`High backlog: ${projectedBacklog} cars`);
    }

    if (overallUtilizationPercent >= RISK_THRESHOLDS.utilizationCritical) {
      riskScore += 25;
      riskFactors.push(`Critical capacity utilization: ${overallUtilizationPercent.toFixed(1)}%`);
    } else if (overallUtilizationPercent >= RISK_THRESHOLDS.utilizationWarning) {
      riskScore += 10;
      riskFactors.push(`High capacity utilization: ${overallUtilizationPercent.toFixed(1)}%`);
    }

    const lateReleasePercent = (lateReleases / Math.max(totalReleases, 1)) * 100;
    if (lateReleasePercent >= RISK_THRESHOLDS.lateReleaseCritical) {
      riskScore += 25;
      riskFactors.push(`Critical late releases: ${lateReleasePercent.toFixed(1)}%`);
    } else if (lateReleasePercent >= RISK_THRESHOLDS.lateReleaseWarning) {
      riskScore += 10;
      riskFactors.push(`Elevated late releases: ${lateReleasePercent.toFixed(1)}%`);
    }

    if (longestWaitDays > 30) {
      riskScore += 10;
      riskFactors.push(`Long wait times: ${longestWaitDays} days max`);
    }

    // Cost projections
    const totalEstimatedCost = assignments.reduce((sum, a) => sum + a.estimatedCost, 0);

    const costByMonth: Record<string, number> = {};
    const costByShop: Record<string, number> = {};
    for (const assignment of assignments) {
      costByMonth[assignment.monthKey] = (costByMonth[assignment.monthKey] ?? 0) + assignment.estimatedCost;
      costByShop[assignment.shopName] = (costByShop[assignment.shopName] ?? 0) + assignment.estimatedCost;
    }

    return {
      scenarioId,
      scenarioName,
      scenarioType,
      totalReleases,
      onTimeReleases,
      lateReleases,
      releaseCompliancePercent: Math.round(releaseCompliancePercent * 10) / 10,
      plannedQualifications,
      completedQualifications,
      qualPlanAttainmentPercent: Math.round(qualPlanAttainmentPercent * 10) / 10,
      currentBacklog,
      projectedBacklog,
      backlogByMonth,
      averageWaitDays: Math.round(averageWaitDays * 10) / 10,
      longestWaitDays,
      waitTimeByPriority,
      overallUtilizationPercent: Math.round(overallUtilizationPercent * 10) / 10,
      utilizationByShop,
      utilizationByMonth,
      carsReadyForAssignment,
      carsNotReady,
      assignmentReadinessPercent: Math.round(assignmentReadinessPercent * 10) / 10,
      riskScore: Math.min(riskScore, 100),
      riskFactors,
      totalEstimatedCost,
      costByMonth,
      costByShop,
    };
  }

  // ===========================================================================
  // SCENARIO COMPARISON
  // ===========================================================================

  /**
   * Compare multiple scenarios and generate comparison table
   */
  async compareScenarios(scenarioIds: string[]): Promise<ScenarioComparison> {
    const scenarios = await this.prisma.qualificationScenario.findMany({
      where: {
        id: { in: scenarioIds },
        companyId: this.companyId,
      },
    });

    const metricsArray: ScenarioMetrics[] = [];
    for (const scenario of scenarios) {
      try {
        const metrics = JSON.parse(scenario.metricsJson) as ScenarioMetrics;
        metricsArray.push(metrics);
      } catch {
        // Skip scenarios without valid metrics
      }
    }

    // Generate comparison table
    const comparisonTable = this.generateComparisonTable(metricsArray);

    // Generate recommendations
    const recommendations = this.generateRecommendations(metricsArray);

    // Find best scenario (lowest risk score with acceptable attainment)
    const viable = metricsArray.filter((m) => m.qualPlanAttainmentPercent >= 80);
    const bestScenario = viable.length > 0
      ? viable.reduce((best, curr) => curr.riskScore < best.riskScore ? curr : best)
      : metricsArray.reduce((best, curr) => curr.riskScore < best.riskScore ? curr : best);

    return {
      scenarios: metricsArray,
      comparisonTable,
      recommendations,
      bestScenarioId: bestScenario.scenarioId,
      bestScenarioReason: `Lowest risk score (${bestScenario.riskScore}) with ${bestScenario.qualPlanAttainmentPercent}% plan attainment`,
    };
  }

  /**
   * Generate markdown comparison table
   */
  private generateComparisonTable(metrics: ScenarioMetrics[]): string {
    if (metrics.length === 0) return 'No scenarios to compare.';

    const headers = ['Metric', ...metrics.map((m) => m.scenarioName)];
    const rows: string[][] = [
      ['**Scenario Type**', ...metrics.map((m) => m.scenarioType)],
      ['**Release Compliance**', ...metrics.map((m) => `${m.releaseCompliancePercent}%`)],
      ['**Qual Plan Attainment**', ...metrics.map((m) => `${m.qualPlanAttainmentPercent}%`)],
      ['**Current Backlog**', ...metrics.map((m) => m.currentBacklog.toString())],
      ['**Projected Backlog**', ...metrics.map((m) => m.projectedBacklog.toString())],
      ['**Avg Wait (days)**', ...metrics.map((m) => m.averageWaitDays.toString())],
      ['**Longest Wait (days)**', ...metrics.map((m) => m.longestWaitDays.toString())],
      ['**Capacity Utilization**', ...metrics.map((m) => `${m.overallUtilizationPercent}%`)],
      ['**Assignment Ready**', ...metrics.map((m) => `${m.assignmentReadinessPercent}%`)],
      ['**Risk Score**', ...metrics.map((m) => this.formatRiskScore(m.riskScore))],
      ['**Est. Total Cost**', ...metrics.map((m) => `$${(m.totalEstimatedCost / 1000).toFixed(0)}K`)],
    ];

    // Build markdown table
    const headerRow = `| ${headers.join(' | ')} |`;
    const separatorRow = `| ${headers.map(() => '---').join(' | ')} |`;
    const dataRows = rows.map((row) => `| ${row.join(' | ')} |`);

    return [headerRow, separatorRow, ...dataRows].join('\n');
  }

  /**
   * Format risk score with indicator
   */
  private formatRiskScore(score: number): string {
    if (score >= 50) return `${score} (High)`;
    if (score >= 25) return `${score} (Medium)`;
    return `${score} (Low)`;
  }

  /**
   * Generate recommendations based on scenario comparison
   */
  private generateRecommendations(metrics: ScenarioMetrics[]): string[] {
    const recommendations: string[] = [];

    // Find scenario with best metrics
    const bestRisk = Math.min(...metrics.map((m) => m.riskScore));
    const bestAttainment = Math.max(...metrics.map((m) => m.qualPlanAttainmentPercent));

    for (const m of metrics) {
      if (m.riskScore === bestRisk) {
        recommendations.push(`**${m.scenarioName}** has the lowest risk score (${m.riskScore}).`);
      }
      if (m.qualPlanAttainmentPercent === bestAttainment) {
        recommendations.push(
          `**${m.scenarioName}** achieves the highest plan attainment (${m.qualPlanAttainmentPercent}%).`
        );
      }
    }

    // Add general recommendations
    const avgBacklog = metrics.reduce((sum, m) => sum + m.projectedBacklog, 0) / metrics.length;
    if (avgBacklog > 10) {
      recommendations.push(
        `Consider adding shop capacity or extending planning horizon to reduce projected backlog (avg: ${avgBacklog.toFixed(0)} cars).`
      );
    }

    const avgUtilization = metrics.reduce((sum, m) => sum + m.overallUtilizationPercent, 0) / metrics.length;
    if (avgUtilization > 85) {
      recommendations.push(
        `Shop utilization is high (${avgUtilization.toFixed(1)}%). Consider capacity expansion or work redistribution.`
      );
    }

    return recommendations;
  }

  // ===========================================================================
  // PLAN GENERATION
  // ===========================================================================

  /**
   * Generate internal team plan
   */
  async generateTeamPlan(scenarioId: string): Promise<TeamPlan> {
    const scenario = await this.prisma.qualificationScenario.findUnique({
      where: { id: scenarioId },
    });

    if (!scenario) {
      throw new Error(`Scenario not found: ${scenarioId}`);
    }

    const assignments = await this.prisma.qualificationPlanAssignment.findMany({
      where: { scenarioId },
      orderBy: [{ monthKey: 'asc' }, { priority: 'asc' }],
    });

    // Get all related data
    const carIds = [...new Set(assignments.map((a) => a.carId))];
    const shopIds = [...new Set(assignments.map((a) => a.shopId))];
    const customerIds = [...new Set([
      ...assignments.map((a) => a.currentCustomerId).filter(Boolean),
      ...assignments.map((a) => a.nextCustomerId).filter(Boolean),
    ])] as string[];

    const [cars, shops, customers] = await Promise.all([
      this.prisma.car.findMany({ where: { id: { in: carIds } } }),
      this.prisma.shop.findMany({ where: { id: { in: shopIds } } }),
      this.prisma.customer.findMany({ where: { id: { in: customerIds } } }),
    ]);

    type CarRecord = typeof cars[number];
    type ShopRecord = typeof shops[number];
    type CustomerRecord = typeof customers[number];

    const carMap = new Map<string, CarRecord>(cars.map((c) => [c.id, c]));
    const shopMap = new Map<string, ShopRecord>(shops.map((s) => [s.id, s]));
    const customerMap = new Map<string, CustomerRecord>(customers.map((c) => [c.id, c]));

    // Build plan assignments with full data
    const fullAssignments: PlanAssignment[] = assignments.map((a) => {
      const car = carMap.get(a.carId);
      const shop = shopMap.get(a.shopId);
      const currentCustomer = a.currentCustomerId ? customerMap.get(a.currentCustomerId) : undefined;
      const nextCustomer = a.nextCustomerId ? customerMap.get(a.nextCustomerId) : undefined;

      return {
        id: a.id,
        scenarioId: a.scenarioId,
        carId: a.carId,
        railcarNumber: car?.railcarNumber ?? 'Unknown',
        shopId: a.shopId,
        shopName: shop?.name ?? 'Unknown',
        monthKey: a.monthKey,
        workTypes: JSON.parse(a.workTypes) as WorkType[],
        isBundled: a.isBundled,
        priority: a.priority as Priority,
        scheduledArrival: a.scheduledArrival ?? undefined,
        scheduledCompletion: a.scheduledCompletion ?? undefined,
        estimatedDays: a.estimatedDays,
        estimatedCost: a.estimatedCost,
        currentCustomerId: a.currentCustomerId ?? undefined,
        currentCustomerName: currentCustomer?.name,
        nextCustomerId: a.nextCustomerId ?? undefined,
        nextCustomerName: nextCustomer?.name,
        status: a.status,
      };
    });

    // Group by month
    const monthlySchedule: MonthlyPlanSection[] = [];
    const monthGroups = new Map<string, PlanAssignment[]>();
    for (const assignment of fullAssignments) {
      const list = monthGroups.get(assignment.monthKey) ?? [];
      list.push(assignment);
      monthGroups.set(assignment.monthKey, list);
    }

    for (const [monthKey, monthAssignments] of monthGroups) {
      const capacityStatus: Record<string, { used: number; total: number; percent: number }> = {};
      for (const shop of shops) {
        const shopAssignments = monthAssignments.filter((a) => a.shopId === shop.id);
        const used = shopAssignments.length;
        const total = shop.qualCapacity;
        capacityStatus[shop.name] = {
          used,
          total,
          percent: total > 0 ? Math.round((used / total) * 100) : 0,
        };
      }

      monthlySchedule.push({
        monthKey,
        monthLabel: getMonthLabel(monthKey),
        totalCars: monthAssignments.length,
        assignments: monthAssignments,
        capacityStatus,
      });
    }

    // Group by shop
    const shopSchedule: ShopPlanSection[] = [];
    const shopGroups = new Map<string, PlanAssignment[]>();
    for (const assignment of fullAssignments) {
      const list = shopGroups.get(assignment.shopId) ?? [];
      list.push(assignment);
      shopGroups.set(assignment.shopId, list);
    }

    for (const [shopId, shopAssignments] of shopGroups) {
      const shop = shopMap.get(shopId) as ShopRecord | undefined;
      const monthlyBreakdown: Record<string, number> = {};
      for (const a of shopAssignments) {
        monthlyBreakdown[a.monthKey] = (monthlyBreakdown[a.monthKey] ?? 0) + 1;
      }

      shopSchedule.push({
        shopId,
        shopName: shop?.name ?? 'Unknown',
        shopCode: shop?.code ?? 'UNK',
        totalCars: shopAssignments.length,
        assignments: shopAssignments,
        monthlyBreakdown,
      });
    }

    // Build summary
    const summary: PlanSummary = {
      totalCars: fullAssignments.length,
      totalBundled: fullAssignments.filter((a) => a.isBundled).length,
      byWorkType: {},
      byPriority: {},
      byCustomer: {},
      estimatedTotalCost: fullAssignments.reduce((sum, a) => sum + a.estimatedCost, 0),
      averageTurnTime: fullAssignments.length > 0
        ? fullAssignments.reduce((sum, a) => sum + a.estimatedDays, 0) / fullAssignments.length
        : 0,
    };

    for (const a of fullAssignments) {
      for (const wt of a.workTypes) {
        summary.byWorkType[wt] = (summary.byWorkType[wt] ?? 0) + 1;
      }
      const priorityKey = `Priority ${a.priority}`;
      summary.byPriority[priorityKey] = (summary.byPriority[priorityKey] ?? 0) + 1;
      if (a.currentCustomerName) {
        summary.byCustomer[a.currentCustomerName] = (summary.byCustomer[a.currentCustomerName] ?? 0) + 1;
      }
    }

    // Generate markdown content
    const markdownContent = this.generateTeamPlanMarkdown(
      scenario.name,
      monthlySchedule,
      shopSchedule,
      summary
    );

    // Determine planning horizon
    const monthKeys = [...monthGroups.keys()].sort();

    return {
      scenarioId,
      scenarioName: scenario.name,
      generatedAt: new Date(),
      planningHorizon: {
        start: monthKeys[0] ?? toMonthKey(new Date()),
        end: monthKeys[monthKeys.length - 1] ?? toMonthKey(new Date()),
      },
      monthlySchedule,
      shopSchedule,
      summary,
      markdownContent,
    };
  }

  /**
   * Generate team plan markdown
   */
  private generateTeamPlanMarkdown(
    scenarioName: string,
    monthlySchedule: MonthlyPlanSection[],
    shopSchedule: ShopPlanSection[],
    summary: PlanSummary
  ): string {
    const lines: string[] = [];

    lines.push(`# Qualification Team Plan: ${scenarioName}`);
    lines.push(`**Generated:** ${formatDate(new Date())}`);
    lines.push('');

    // Summary section
    lines.push('## Summary');
    lines.push(`- **Total Cars:** ${summary.totalCars}`);
    lines.push(`- **Bundled Work:** ${summary.totalBundled} cars`);
    lines.push(`- **Estimated Total Cost:** $${(summary.estimatedTotalCost / 1000).toFixed(0)}K`);
    lines.push(`- **Average Turn Time:** ${summary.averageTurnTime.toFixed(1)} days`);
    lines.push('');

    // Work type breakdown
    lines.push('### By Work Type');
    for (const [wt, count] of Object.entries(summary.byWorkType)) {
      lines.push(`- ${wt}: ${count}`);
    }
    lines.push('');

    // Monthly schedule
    lines.push('## Monthly Schedule');
    for (const month of monthlySchedule) {
      lines.push(`### ${month.monthLabel} (${month.totalCars} cars)`);
      lines.push('');
      lines.push('| Car # | Shop | Work Types | Priority | Customer | Est. Days |');
      lines.push('| --- | --- | --- | --- | --- | --- |');
      for (const a of month.assignments) {
        lines.push(
          `| ${a.railcarNumber} | ${a.shopName} | ${a.workTypes.join(', ')} | ${a.priority} | ${a.currentCustomerName ?? '-'} | ${a.estimatedDays} |`
        );
      }
      lines.push('');

      // Capacity status
      lines.push('**Shop Capacity:**');
      for (const [shop, status] of Object.entries(month.capacityStatus)) {
        lines.push(`- ${shop}: ${status.used}/${status.total} (${status.percent}%)`);
      }
      lines.push('');
    }

    // Shop schedule
    lines.push('## By Shop');
    for (const shop of shopSchedule) {
      lines.push(`### ${shop.shopName} (${shop.shopCode}) - ${shop.totalCars} cars`);
      lines.push('');
      const months = Object.entries(shop.monthlyBreakdown)
        .map(([m, c]) => `${getMonthLabel(m)}: ${c}`)
        .join(', ');
      lines.push(`**Monthly Breakdown:** ${months}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Generate customer-facing schedule
   */
  async generateCustomerSchedule(scenarioId: string, customerId: string): Promise<CustomerSchedule> {
    const [scenario, customer] = await Promise.all([
      this.prisma.qualificationScenario.findUnique({ where: { id: scenarioId } }),
      this.prisma.customer.findUnique({ where: { id: customerId } }),
    ]);

    if (!scenario || !customer) {
      throw new Error('Scenario or customer not found');
    }

    const assignments = await this.prisma.qualificationPlanAssignment.findMany({
      where: {
        scenarioId,
        OR: [{ currentCustomerId: customerId }, { nextCustomerId: customerId }],
      },
      orderBy: { scheduledArrival: 'asc' },
    });

    const carIds = [...new Set(assignments.map((a) => a.carId))];
    const shopIds = [...new Set(assignments.map((a) => a.shopId))];

    const [cars, shops] = await Promise.all([
      this.prisma.car.findMany({ where: { id: { in: carIds } } }),
      this.prisma.shop.findMany({ where: { id: { in: shopIds } } }),
    ]);

    type CarRec = typeof cars[number];
    type ShopRec = typeof shops[number];

    const carMap = new Map<string, CarRec>(cars.map((c) => [c.id, c]));
    const shopMap = new Map<string, ShopRec>(shops.map((s) => [s.id, s]));

    const inboundSchedule: CustomerCarSchedule[] = [];
    const outboundSchedule: CustomerCarSchedule[] = [];

    for (const a of assignments) {
      const car = carMap.get(a.carId);
      const shop = shopMap.get(a.shopId);

      const entry: CustomerCarSchedule = {
        carId: a.carId,
        railcarNumber: car?.railcarNumber ?? 'Unknown',
        plannedDate: a.scheduledArrival ?? new Date(),
        shopName: shop?.name ?? 'Unknown',
        workTypes: JSON.parse(a.workTypes),
        estimatedCompletionDate: a.scheduledCompletion ?? undefined,
        status: a.status,
      };

      if (a.currentCustomerId === customerId) {
        inboundSchedule.push(entry);
      }
      if (a.nextCustomerId === customerId) {
        outboundSchedule.push(entry);
      }
    }

    // Build summary
    const summary: CustomerScheduleSummary = {
      totalInbound: inboundSchedule.length,
      totalOutbound: outboundSchedule.length,
      byMonth: {},
    };

    for (const entry of inboundSchedule) {
      const month = toMonthKey(entry.plannedDate);
      if (!summary.byMonth[month]) {
        summary.byMonth[month] = { inbound: 0, outbound: 0 };
      }
      summary.byMonth[month].inbound++;
    }

    for (const entry of outboundSchedule) {
      const month = toMonthKey(entry.plannedDate);
      if (!summary.byMonth[month]) {
        summary.byMonth[month] = { inbound: 0, outbound: 0 };
      }
      summary.byMonth[month].outbound++;
    }

    // Generate markdown
    const markdownContent = this.generateCustomerScheduleMarkdown(
      customer.name,
      inboundSchedule,
      outboundSchedule,
      summary
    );

    return {
      customerId,
      customerName: customer.name,
      customerCode: customer.code,
      scenarioId,
      generatedAt: new Date(),
      inboundSchedule,
      outboundSchedule,
      summary,
      markdownContent,
    };
  }

  /**
   * Generate customer schedule markdown
   */
  private generateCustomerScheduleMarkdown(
    customerName: string,
    inbound: CustomerCarSchedule[],
    outbound: CustomerCarSchedule[],
    summary: CustomerScheduleSummary
  ): string {
    const lines: string[] = [];

    lines.push(`# Railcar Schedule for ${customerName}`);
    lines.push(`**Generated:** ${formatDate(new Date())}`);
    lines.push('');

    // Summary
    lines.push('## Summary');
    lines.push(`- **Cars Being Released:** ${summary.totalInbound}`);
    lines.push(`- **Cars Being Received:** ${summary.totalOutbound}`);
    lines.push('');

    if (Object.keys(summary.byMonth).length > 0) {
      lines.push('### Monthly Overview');
      lines.push('| Month | Releasing | Receiving |');
      lines.push('| --- | --- | --- |');
      for (const [month, counts] of Object.entries(summary.byMonth).sort()) {
        lines.push(`| ${getMonthLabel(month)} | ${counts.inbound} | ${counts.outbound} |`);
      }
      lines.push('');
    }

    // Inbound (releasing)
    if (inbound.length > 0) {
      lines.push('## Cars Being Released');
      lines.push('');
      lines.push('| Car # | Planned Date | Shop | Work | Est. Completion |');
      lines.push('| --- | --- | --- | --- | --- |');
      for (const entry of inbound) {
        lines.push(
          `| ${entry.railcarNumber} | ${formatDate(entry.plannedDate)} | ${entry.shopName} | ${entry.workTypes.join(', ')} | ${entry.estimatedCompletionDate ? formatDate(entry.estimatedCompletionDate) : 'TBD'} |`
        );
      }
      lines.push('');
    }

    // Outbound (receiving)
    if (outbound.length > 0) {
      lines.push('## Cars Being Received');
      lines.push('');
      lines.push('| Car # | Expected Date | Current Shop | Status |');
      lines.push('| --- | --- | --- | --- |');
      for (const entry of outbound) {
        const expectedDate = entry.estimatedCompletionDate ?? entry.plannedDate;
        lines.push(
          `| ${entry.railcarNumber} | ${formatDate(expectedDate)} | ${entry.shopName} | ${entry.status} |`
        );
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  // ===========================================================================
  // DOCUMENT MANAGEMENT
  // ===========================================================================

  /**
   * Save a generated document
   */
  async saveDocument(
    scenarioId: string,
    documentType: DocumentType,
    title: string,
    markdownContent: string,
    contentJson: object,
    options: { targetCustomerId?: string; targetShopId?: string } = {}
  ): Promise<string> {
    const doc = await this.prisma.qualificationPlanDocument.create({
      data: {
        scenarioId,
        documentType,
        title,
        contentMarkdown: markdownContent,
        contentJson: JSON.stringify(contentJson),
        targetCustomerId: options.targetCustomerId,
        targetShopId: options.targetShopId,
        companyId: this.companyId,
        createdBy: 'system',
      },
    });

    return doc.id;
  }

  /**
   * Get all documents for a scenario
   */
  async getScenarioDocuments(scenarioId: string) {
    return this.prisma.qualificationPlanDocument.findMany({
      where: { scenarioId, companyId: this.companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ===========================================================================
  // APPROVAL WORKFLOW
  // ===========================================================================

  /**
   * Approve a scenario (converts to operational plan)
   */
  async approveScenario(scenarioId: string, approvedBy: string): Promise<void> {
    await this.prisma.qualificationScenario.update({
      where: { id: scenarioId },
      data: {
        isApproved: true,
        approvedBy,
        approvedAt: new Date(),
        status: 'approved',
      },
    });

    // Generate team plan document
    const teamPlan = await this.generateTeamPlan(scenarioId);
    await this.saveDocument(
      scenarioId,
      DocumentType.TEAM_PLAN,
      `Team Plan - ${teamPlan.scenarioName}`,
      teamPlan.markdownContent,
      teamPlan
    );
  }

  /**
   * Get the current approved scenario
   */
  async getApprovedScenario() {
    return this.prisma.qualificationScenario.findFirst({
      where: {
        companyId: this.companyId,
        isApproved: true,
        status: 'approved',
      },
      orderBy: { approvedAt: 'desc' },
    });
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new LeaseQualificationEngine instance
 */
export function createLeaseQualificationEngine(
  prisma: any,
  companyId: string
): LeaseQualificationEngine {
  return new LeaseQualificationEngine(prisma, companyId);
}

export default LeaseQualificationEngine;
