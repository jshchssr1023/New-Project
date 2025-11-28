/**
 * qualificationDocumentGenerator.ts - Dynamic Document Generator
 *
 * Generates Team Plans and Customer PDFs with selectable data:
 * - Select specific cars to include
 * - Select specific shops to include
 * - Filter by month range
 * - Filter by customer
 * - Filter by priority
 *
 * @author AITX Chronos Team
 * @version 1.0.0
 */

import { PrismaClient } from '@prisma/client';

// =============================================================================
// INTERFACES
// =============================================================================

/** Selection criteria for document generation */
export interface DocumentSelectionCriteria {
  scenarioId: string;

  // Car selection
  carIds?: string[]; // Specific car IDs to include
  excludeCarIds?: string[]; // Car IDs to exclude

  // Shop selection
  shopIds?: string[]; // Specific shop IDs to include
  excludeShopIds?: string[]; // Shop IDs to exclude

  // Customer selection
  customerIds?: string[]; // Filter by current/next customer
  excludeCustomerIds?: string[];

  // Month range
  startMonth?: string; // YYYY-MM format
  endMonth?: string;

  // Priority filter
  priorities?: number[]; // 1=critical, 2=high, 3=medium, 4=low

  // Work type filter
  workTypes?: string[];

  // Status filter
  statuses?: string[];

  // Bundled only
  bundledOnly?: boolean;
}

/** Selected assignment with full details */
export interface SelectedAssignment {
  id: string;
  carId: string;
  railcarNumber: string;
  carType: string;
  isTankCar: boolean;
  shopId: string;
  shopName: string;
  shopCode: string;
  shopRegion: string;
  monthKey: string;
  workTypes: string[];
  isBundled: boolean;
  bundleGroupId?: string;
  priority: number;
  priorityLabel: string;
  scheduledArrival?: Date;
  scheduledCompletion?: Date;
  estimatedDays: number;
  estimatedCost: number;
  currentCustomerId?: string;
  currentCustomerName?: string;
  currentCustomerCode?: string;
  nextCustomerId?: string;
  nextCustomerName?: string;
  nextCustomerCode?: string;
  status: string;
  notes: string;
}

/** Selection summary */
export interface SelectionSummary {
  totalAssignments: number;
  totalCars: number;
  totalShops: number;
  totalCustomers: number;
  byMonth: Record<string, number>;
  byShop: Record<string, number>;
  byPriority: Record<string, number>;
  byWorkType: Record<string, number>;
  byCustomer: Record<string, number>;
  totalEstimatedCost: number;
  totalEstimatedDays: number;
}

/** Team plan document structure */
export interface TeamPlanDocument {
  title: string;
  generatedAt: Date;
  scenarioId: string;
  scenarioName: string;
  selectionCriteria: DocumentSelectionCriteria;
  summary: SelectionSummary;
  assignments: SelectedAssignment[];
  byMonth: MonthSection[];
  byShop: ShopSection[];
  markdownContent: string;
  jsonContent: object;
}

/** Month section in team plan */
export interface MonthSection {
  monthKey: string;
  monthLabel: string;
  assignments: SelectedAssignment[];
  shopCapacity: Record<string, { assigned: number; total: number; percent: number }>;
}

/** Shop section in team plan */
export interface ShopSection {
  shopId: string;
  shopName: string;
  shopCode: string;
  region: string;
  assignments: SelectedAssignment[];
  byMonth: Record<string, number>;
  totalCars: number;
  totalCost: number;
}

/** Customer schedule document */
export interface CustomerScheduleDocument {
  title: string;
  generatedAt: Date;
  scenarioId: string;
  scenarioName: string;
  customerId: string;
  customerName: string;
  customerCode: string;
  selectionCriteria: DocumentSelectionCriteria;
  summary: CustomerSummary;
  inboundCars: CustomerCarEntry[]; // Cars being released by this customer
  outboundCars: CustomerCarEntry[]; // Cars being assigned to this customer
  markdownContent: string;
  jsonContent: object;
}

/** Customer summary */
export interface CustomerSummary {
  totalInbound: number;
  totalOutbound: number;
  inboundByMonth: Record<string, number>;
  outboundByMonth: Record<string, number>;
  inboundByShop: Record<string, number>;
  outboundByShop: Record<string, number>;
  totalEstimatedCost: number;
}

/** Car entry for customer schedule */
export interface CustomerCarEntry {
  carId: string;
  railcarNumber: string;
  carType: string;
  direction: 'inbound' | 'outbound';
  plannedDate: Date;
  estimatedCompletionDate?: Date;
  shopId: string;
  shopName: string;
  workTypes: string[];
  priority: number;
  priorityLabel: string;
  status: string;
  estimatedCost: number;
  estimatedDays: number;
  notes: string;
}

/** Shop plan document */
export interface ShopPlanDocument {
  title: string;
  generatedAt: Date;
  scenarioId: string;
  scenarioName: string;
  shopId: string;
  shopName: string;
  shopCode: string;
  region: string;
  selectionCriteria: DocumentSelectionCriteria;
  summary: ShopSummary;
  assignments: SelectedAssignment[];
  byMonth: ShopMonthSection[];
  capacityAnalysis: CapacityAnalysis;
  markdownContent: string;
  jsonContent: object;
}

/** Shop summary */
export interface ShopSummary {
  totalCars: number;
  byMonth: Record<string, number>;
  byWorkType: Record<string, number>;
  byPriority: Record<string, number>;
  byCustomer: Record<string, number>;
  bundledCount: number;
  totalEstimatedCost: number;
  averageTurnTime: number;
}

/** Shop month section */
export interface ShopMonthSection {
  monthKey: string;
  monthLabel: string;
  assignments: SelectedAssignment[];
  capacityUsed: number;
  capacityTotal: number;
  utilizationPercent: number;
}

/** Capacity analysis for shop */
export interface CapacityAnalysis {
  byMonth: Record<string, {
    qualCapacity: number;
    qualUsed: number;
    qualAvailable: number;
    utilization: number;
  }>;
  overloadedMonths: string[];
  underutilizedMonths: string[];
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function toMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${year}-${month}`;
}

function parseMonthKey(monthKey: string): Date {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

function getMonthLabel(monthKey: string): string {
  const date = parseMonthKey(monthKey);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getPriorityLabel(priority: number): string {
  switch (priority) {
    case 1: return 'Critical';
    case 2: return 'High';
    case 3: return 'Medium';
    case 4: return 'Low';
    default: return 'Unknown';
  }
}

function formatCurrency(amount: number): string {
  return `$${(amount / 1000).toFixed(1)}K`;
}

// =============================================================================
// DOCUMENT GENERATOR CLASS
// =============================================================================

export class QualificationDocumentGenerator {
  private prisma: PrismaClient;
  private companyId: string;

  constructor(prisma: PrismaClient, companyId: string) {
    this.prisma = prisma;
    this.companyId = companyId;
  }

  // ===========================================================================
  // DATA SELECTION
  // ===========================================================================

  /**
   * Get available cars for selection (from a scenario)
   */
  async getAvailableCars(scenarioId: string): Promise<{
    id: string;
    railcarNumber: string;
    carType: string;
    customer: string;
    shopAssigned: string;
    monthKey: string;
    workTypes: string[];
    priority: number;
  }[]> {
    const assignments = await this.prisma.qualificationPlanAssignment.findMany({
      where: { scenarioId },
      orderBy: [{ monthKey: 'asc' }, { priority: 'asc' }],
    });

    const carIds = [...new Set(assignments.map((a) => a.carId))];
    const shopIds = [...new Set(assignments.map((a) => a.shopId))];
    const customerIds = [...new Set(
      assignments.map((a) => a.currentCustomerId).filter(Boolean) as string[]
    )];

    const [cars, shops, customers] = await Promise.all([
      this.prisma.car.findMany({ where: { id: { in: carIds } } }),
      this.prisma.shop.findMany({ where: { id: { in: shopIds } } }),
      this.prisma.customer.findMany({ where: { id: { in: customerIds } } }),
    ]);

    type CarRec = typeof cars[number];
    type ShopRec = typeof shops[number];
    type CustomerRec = typeof customers[number];

    const carMap = new Map<string, CarRec>(cars.map((c) => [c.id, c]));
    const shopMap = new Map<string, ShopRec>(shops.map((s) => [s.id, s]));
    const customerMap = new Map<string, CustomerRec>(customers.map((c) => [c.id, c]));

    return assignments.map((a) => {
      const car = carMap.get(a.carId);
      const shop = shopMap.get(a.shopId);
      const customer = a.currentCustomerId ? customerMap.get(a.currentCustomerId) : undefined;

      return {
        id: a.carId,
        railcarNumber: car?.railcarNumber ?? 'Unknown',
        carType: car?.carType ?? 'Unknown',
        customer: customer?.name ?? 'N/A',
        shopAssigned: shop?.name ?? 'Unknown',
        monthKey: a.monthKey,
        workTypes: JSON.parse(a.workTypes || '[]'),
        priority: a.priority,
      };
    });
  }

  /**
   * Get available shops for selection (from a scenario)
   */
  async getAvailableShops(scenarioId: string): Promise<{
    id: string;
    name: string;
    code: string;
    region: string;
    assignmentCount: number;
    tankQualified: boolean;
  }[]> {
    const assignments = await this.prisma.qualificationPlanAssignment.findMany({
      where: { scenarioId },
    });

    const shopIds = [...new Set(assignments.map((a) => a.shopId))];
    const shops = await this.prisma.shop.findMany({
      where: { id: { in: shopIds } },
    });

    const shopCounts = new Map<string, number>();
    for (const a of assignments) {
      shopCounts.set(a.shopId, (shopCounts.get(a.shopId) ?? 0) + 1);
    }

    return shops.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      region: s.region,
      assignmentCount: shopCounts.get(s.id) ?? 0,
      tankQualified: s.tankQualified,
    }));
  }

  /**
   * Get available customers for selection (from a scenario)
   */
  async getAvailableCustomers(scenarioId: string): Promise<{
    id: string;
    name: string;
    code: string;
    inboundCount: number;
    outboundCount: number;
  }[]> {
    const assignments = await this.prisma.qualificationPlanAssignment.findMany({
      where: { scenarioId },
    });

    const customerIds = [...new Set([
      ...assignments.map((a) => a.currentCustomerId).filter(Boolean),
      ...assignments.map((a) => a.nextCustomerId).filter(Boolean),
    ])] as string[];

    const customers = await this.prisma.customer.findMany({
      where: { id: { in: customerIds } },
    });

    const inboundCounts = new Map<string, number>();
    const outboundCounts = new Map<string, number>();

    for (const a of assignments) {
      if (a.currentCustomerId) {
        inboundCounts.set(a.currentCustomerId, (inboundCounts.get(a.currentCustomerId) ?? 0) + 1);
      }
      if (a.nextCustomerId) {
        outboundCounts.set(a.nextCustomerId, (outboundCounts.get(a.nextCustomerId) ?? 0) + 1);
      }
    }

    return customers.map((c) => ({
      id: c.id,
      name: c.name,
      code: c.code,
      inboundCount: inboundCounts.get(c.id) ?? 0,
      outboundCount: outboundCounts.get(c.id) ?? 0,
    }));
  }

  /**
   * Get available months for selection (from a scenario)
   */
  async getAvailableMonths(scenarioId: string): Promise<{
    monthKey: string;
    monthLabel: string;
    assignmentCount: number;
  }[]> {
    const assignments = await this.prisma.qualificationPlanAssignment.findMany({
      where: { scenarioId },
    });

    const monthCounts = new Map<string, number>();
    for (const a of assignments) {
      monthCounts.set(a.monthKey, (monthCounts.get(a.monthKey) ?? 0) + 1);
    }

    return Array.from(monthCounts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([monthKey, count]) => ({
        monthKey,
        monthLabel: getMonthLabel(monthKey),
        assignmentCount: count,
      }));
  }

  // ===========================================================================
  // APPLY SELECTION CRITERIA
  // ===========================================================================

  /**
   * Get selected assignments based on criteria
   */
  async getSelectedAssignments(criteria: DocumentSelectionCriteria): Promise<SelectedAssignment[]> {
    // Build where clause
    const where: any = { scenarioId: criteria.scenarioId };

    // Car filter
    if (criteria.carIds && criteria.carIds.length > 0) {
      where.carId = { in: criteria.carIds };
    }
    if (criteria.excludeCarIds && criteria.excludeCarIds.length > 0) {
      where.carId = { ...where.carId, notIn: criteria.excludeCarIds };
    }

    // Shop filter
    if (criteria.shopIds && criteria.shopIds.length > 0) {
      where.shopId = { in: criteria.shopIds };
    }
    if (criteria.excludeShopIds && criteria.excludeShopIds.length > 0) {
      where.shopId = { ...where.shopId, notIn: criteria.excludeShopIds };
    }

    // Customer filter (current or next)
    if (criteria.customerIds && criteria.customerIds.length > 0) {
      where.OR = [
        { currentCustomerId: { in: criteria.customerIds } },
        { nextCustomerId: { in: criteria.customerIds } },
      ];
    }

    // Month range filter
    if (criteria.startMonth) {
      where.monthKey = { ...where.monthKey, gte: criteria.startMonth };
    }
    if (criteria.endMonth) {
      where.monthKey = { ...where.monthKey, lte: criteria.endMonth };
    }

    // Priority filter
    if (criteria.priorities && criteria.priorities.length > 0) {
      where.priority = { in: criteria.priorities };
    }

    // Status filter
    if (criteria.statuses && criteria.statuses.length > 0) {
      where.status = { in: criteria.statuses };
    }

    // Bundled only
    if (criteria.bundledOnly) {
      where.isBundled = true;
    }

    // Fetch assignments
    const assignments = await this.prisma.qualificationPlanAssignment.findMany({
      where,
      orderBy: [{ monthKey: 'asc' }, { priority: 'asc' }],
    });

    // Work type filter (post-fetch since it's JSON)
    let filteredAssignments = assignments;
    if (criteria.workTypes && criteria.workTypes.length > 0) {
      filteredAssignments = assignments.filter((a) => {
        const workTypes = JSON.parse(a.workTypes || '[]');
        return criteria.workTypes!.some((wt) => workTypes.includes(wt));
      });
    }

    // Get related data
    const carIds = [...new Set(filteredAssignments.map((a) => a.carId))];
    const shopIds = [...new Set(filteredAssignments.map((a) => a.shopId))];
    const customerIds = [...new Set([
      ...filteredAssignments.map((a) => a.currentCustomerId).filter(Boolean),
      ...filteredAssignments.map((a) => a.nextCustomerId).filter(Boolean),
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

    // Build selected assignments with full details
    return filteredAssignments.map((a) => {
      const car = carMap.get(a.carId);
      const shop = shopMap.get(a.shopId);
      const currentCustomer = a.currentCustomerId ? customerMap.get(a.currentCustomerId) : undefined;
      const nextCustomer = a.nextCustomerId ? customerMap.get(a.nextCustomerId) : undefined;

      return {
        id: a.id,
        carId: a.carId,
        railcarNumber: car?.railcarNumber ?? 'Unknown',
        carType: car?.carType ?? 'Unknown',
        isTankCar: car?.isTankCar ?? false,
        shopId: a.shopId,
        shopName: shop?.name ?? 'Unknown',
        shopCode: shop?.code ?? 'UNK',
        shopRegion: shop?.region ?? '',
        monthKey: a.monthKey,
        workTypes: JSON.parse(a.workTypes || '[]'),
        isBundled: a.isBundled,
        bundleGroupId: a.bundleGroupId ?? undefined,
        priority: a.priority,
        priorityLabel: getPriorityLabel(a.priority),
        scheduledArrival: a.scheduledArrival ?? undefined,
        scheduledCompletion: a.scheduledCompletion ?? undefined,
        estimatedDays: a.estimatedDays,
        estimatedCost: a.estimatedCost,
        currentCustomerId: a.currentCustomerId ?? undefined,
        currentCustomerName: currentCustomer?.name,
        currentCustomerCode: currentCustomer?.code,
        nextCustomerId: a.nextCustomerId ?? undefined,
        nextCustomerName: nextCustomer?.name,
        nextCustomerCode: nextCustomer?.code,
        status: a.status,
        notes: a.notes,
      };
    });
  }

  /**
   * Calculate selection summary
   */
  private calculateSummary(assignments: SelectedAssignment[]): SelectionSummary {
    const byMonth: Record<string, number> = {};
    const byShop: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    const byWorkType: Record<string, number> = {};
    const byCustomer: Record<string, number> = {};

    const uniqueCars = new Set<string>();
    const uniqueShops = new Set<string>();
    const uniqueCustomers = new Set<string>();

    let totalCost = 0;
    let totalDays = 0;

    for (const a of assignments) {
      // Month
      byMonth[a.monthKey] = (byMonth[a.monthKey] ?? 0) + 1;

      // Shop
      byShop[a.shopName] = (byShop[a.shopName] ?? 0) + 1;
      uniqueShops.add(a.shopId);

      // Priority
      byPriority[a.priorityLabel] = (byPriority[a.priorityLabel] ?? 0) + 1;

      // Work types
      for (const wt of a.workTypes) {
        byWorkType[wt] = (byWorkType[wt] ?? 0) + 1;
      }

      // Customer
      if (a.currentCustomerName) {
        byCustomer[a.currentCustomerName] = (byCustomer[a.currentCustomerName] ?? 0) + 1;
        uniqueCustomers.add(a.currentCustomerId!);
      }

      // Unique cars
      uniqueCars.add(a.carId);

      // Costs and days
      totalCost += a.estimatedCost;
      totalDays += a.estimatedDays;
    }

    return {
      totalAssignments: assignments.length,
      totalCars: uniqueCars.size,
      totalShops: uniqueShops.size,
      totalCustomers: uniqueCustomers.size,
      byMonth,
      byShop,
      byPriority,
      byWorkType,
      byCustomer,
      totalEstimatedCost: totalCost,
      totalEstimatedDays: totalDays,
    };
  }

  // ===========================================================================
  // TEAM PLAN GENERATION
  // ===========================================================================

  /**
   * Generate team plan document with selected data
   */
  async generateTeamPlan(criteria: DocumentSelectionCriteria): Promise<TeamPlanDocument> {
    const scenario = await this.prisma.qualificationScenario.findUnique({
      where: { id: criteria.scenarioId },
    });

    if (!scenario) {
      throw new Error(`Scenario not found: ${criteria.scenarioId}`);
    }

    // Get selected assignments
    const assignments = await this.getSelectedAssignments(criteria);
    const summary = this.calculateSummary(assignments);

    // Get shop capacities for capacity display
    const shopIds = [...new Set(assignments.map((a) => a.shopId))];
    const shops = await this.prisma.shop.findMany({
      where: { id: { in: shopIds } },
    });
    const shopCapacityMap = new Map(shops.map((s) => [s.id, s.qualCapacity]));

    // Group by month
    const byMonth: MonthSection[] = [];
    const monthGroups = new Map<string, SelectedAssignment[]>();
    for (const a of assignments) {
      const list = monthGroups.get(a.monthKey) ?? [];
      list.push(a);
      monthGroups.set(a.monthKey, list);
    }

    for (const [monthKey, monthAssignments] of Array.from(monthGroups.entries()).sort()) {
      const shopCapacity: Record<string, { assigned: number; total: number; percent: number }> = {};

      for (const shop of shops) {
        const assigned = monthAssignments.filter((a) => a.shopId === shop.id).length;
        const total = shop.qualCapacity;
        shopCapacity[shop.name] = {
          assigned,
          total,
          percent: total > 0 ? Math.round((assigned / total) * 100) : 0,
        };
      }

      byMonth.push({
        monthKey,
        monthLabel: getMonthLabel(monthKey),
        assignments: monthAssignments,
        shopCapacity,
      });
    }

    // Group by shop
    const byShop: ShopSection[] = [];
    const shopGroups = new Map<string, SelectedAssignment[]>();
    for (const a of assignments) {
      const list = shopGroups.get(a.shopId) ?? [];
      list.push(a);
      shopGroups.set(a.shopId, list);
    }

    for (const [shopId, shopAssignments] of shopGroups) {
      const first = shopAssignments[0];
      const byMonthBreakdown: Record<string, number> = {};
      let totalCost = 0;

      for (const a of shopAssignments) {
        byMonthBreakdown[a.monthKey] = (byMonthBreakdown[a.monthKey] ?? 0) + 1;
        totalCost += a.estimatedCost;
      }

      byShop.push({
        shopId,
        shopName: first.shopName,
        shopCode: first.shopCode,
        region: first.shopRegion,
        assignments: shopAssignments,
        byMonth: byMonthBreakdown,
        totalCars: shopAssignments.length,
        totalCost,
      });
    }

    // Generate markdown
    const markdownContent = this.generateTeamPlanMarkdown(
      scenario.name,
      criteria,
      summary,
      byMonth,
      byShop
    );

    return {
      title: `Team Plan - ${scenario.name}`,
      generatedAt: new Date(),
      scenarioId: criteria.scenarioId,
      scenarioName: scenario.name,
      selectionCriteria: criteria,
      summary,
      assignments,
      byMonth,
      byShop,
      markdownContent,
      jsonContent: {
        summary,
        byMonth: byMonth.map((m) => ({
          monthKey: m.monthKey,
          monthLabel: m.monthLabel,
          count: m.assignments.length,
          shopCapacity: m.shopCapacity,
        })),
        byShop: byShop.map((s) => ({
          shopId: s.shopId,
          shopName: s.shopName,
          totalCars: s.totalCars,
          byMonth: s.byMonth,
        })),
      },
    };
  }

  /**
   * Generate team plan markdown
   */
  private generateTeamPlanMarkdown(
    scenarioName: string,
    criteria: DocumentSelectionCriteria,
    summary: SelectionSummary,
    byMonth: MonthSection[],
    byShop: ShopSection[]
  ): string {
    const lines: string[] = [];

    lines.push(`# Qualification Team Plan`);
    lines.push(`## ${scenarioName}`);
    lines.push(`**Generated:** ${formatDate(new Date())}`);
    lines.push('');

    // Selection criteria section
    lines.push('## Selection Criteria');
    if (criteria.carIds && criteria.carIds.length > 0) {
      lines.push(`- **Selected Cars:** ${criteria.carIds.length} cars`);
    }
    if (criteria.shopIds && criteria.shopIds.length > 0) {
      lines.push(`- **Selected Shops:** ${criteria.shopIds.length} shops`);
    }
    if (criteria.startMonth || criteria.endMonth) {
      lines.push(`- **Month Range:** ${criteria.startMonth ?? 'Start'} to ${criteria.endMonth ?? 'End'}`);
    }
    if (criteria.priorities && criteria.priorities.length > 0) {
      lines.push(`- **Priorities:** ${criteria.priorities.map(getPriorityLabel).join(', ')}`);
    }
    lines.push('');

    // Summary section
    lines.push('## Summary');
    lines.push(`- **Total Cars:** ${summary.totalCars}`);
    lines.push(`- **Total Assignments:** ${summary.totalAssignments}`);
    lines.push(`- **Shops Involved:** ${summary.totalShops}`);
    lines.push(`- **Customers Involved:** ${summary.totalCustomers}`);
    lines.push(`- **Estimated Total Cost:** ${formatCurrency(summary.totalEstimatedCost)}`);
    lines.push('');

    // Work type breakdown
    if (Object.keys(summary.byWorkType).length > 0) {
      lines.push('### By Work Type');
      for (const [wt, count] of Object.entries(summary.byWorkType)) {
        lines.push(`- ${wt}: ${count}`);
      }
      lines.push('');
    }

    // Priority breakdown
    if (Object.keys(summary.byPriority).length > 0) {
      lines.push('### By Priority');
      for (const [priority, count] of Object.entries(summary.byPriority)) {
        lines.push(`- ${priority}: ${count}`);
      }
      lines.push('');
    }

    // Monthly schedule
    lines.push('## Monthly Schedule');
    for (const month of byMonth) {
      lines.push(`### ${month.monthLabel} (${month.assignments.length} cars)`);
      lines.push('');

      // Assignment table
      lines.push('| Car # | Type | Shop | Work Types | Priority | Customer | Days | Cost |');
      lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
      for (const a of month.assignments) {
        lines.push(
          `| ${a.railcarNumber} | ${a.carType} | ${a.shopCode} | ${a.workTypes.join(', ')} | ${a.priorityLabel} | ${a.currentCustomerCode ?? '-'} | ${a.estimatedDays} | ${formatCurrency(a.estimatedCost)} |`
        );
      }
      lines.push('');

      // Capacity status
      lines.push('**Shop Capacity:**');
      for (const [shop, cap] of Object.entries(month.shopCapacity)) {
        const indicator = cap.percent >= 90 ? '🔴' : cap.percent >= 70 ? '🟡' : '🟢';
        lines.push(`- ${indicator} ${shop}: ${cap.assigned}/${cap.total} (${cap.percent}%)`);
      }
      lines.push('');
    }

    // Shop breakdown
    lines.push('## By Shop');
    for (const shop of byShop) {
      lines.push(`### ${shop.shopName} (${shop.shopCode})`);
      lines.push(`**Region:** ${shop.region}`);
      lines.push(`**Total Cars:** ${shop.totalCars}`);
      lines.push(`**Total Cost:** ${formatCurrency(shop.totalCost)}`);
      lines.push('');

      const monthBreakdown = Object.entries(shop.byMonth)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([m, c]) => `${getMonthLabel(m)}: ${c}`)
        .join(', ');
      lines.push(`**By Month:** ${monthBreakdown}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  // ===========================================================================
  // CUSTOMER SCHEDULE GENERATION
  // ===========================================================================

  /**
   * Generate customer schedule with selected data
   */
  async generateCustomerSchedule(
    criteria: DocumentSelectionCriteria,
    customerId: string
  ): Promise<CustomerScheduleDocument> {
    const [scenario, customer] = await Promise.all([
      this.prisma.qualificationScenario.findUnique({ where: { id: criteria.scenarioId } }),
      this.prisma.customer.findUnique({ where: { id: customerId } }),
    ]);

    if (!scenario || !customer) {
      throw new Error('Scenario or customer not found');
    }

    // Modify criteria to focus on this customer
    const customerCriteria: DocumentSelectionCriteria = {
      ...criteria,
      customerIds: [customerId],
    };

    // Get selected assignments
    const assignments = await this.getSelectedAssignments(customerCriteria);

    // Separate inbound and outbound
    const inboundCars: CustomerCarEntry[] = [];
    const outboundCars: CustomerCarEntry[] = [];

    for (const a of assignments) {
      const entry: CustomerCarEntry = {
        carId: a.carId,
        railcarNumber: a.railcarNumber,
        carType: a.carType,
        direction: 'inbound',
        plannedDate: a.scheduledArrival ?? new Date(),
        estimatedCompletionDate: a.scheduledCompletion,
        shopId: a.shopId,
        shopName: a.shopName,
        workTypes: a.workTypes,
        priority: a.priority,
        priorityLabel: a.priorityLabel,
        status: a.status,
        estimatedCost: a.estimatedCost,
        estimatedDays: a.estimatedDays,
        notes: a.notes,
      };

      if (a.currentCustomerId === customerId) {
        inboundCars.push({ ...entry, direction: 'inbound' });
      }
      if (a.nextCustomerId === customerId) {
        outboundCars.push({ ...entry, direction: 'outbound' });
      }
    }

    // Calculate summary
    const summary: CustomerSummary = {
      totalInbound: inboundCars.length,
      totalOutbound: outboundCars.length,
      inboundByMonth: {},
      outboundByMonth: {},
      inboundByShop: {},
      outboundByShop: {},
      totalEstimatedCost: assignments.reduce((sum, a) => sum + a.estimatedCost, 0),
    };

    for (const car of inboundCars) {
      const month = toMonthKey(car.plannedDate);
      summary.inboundByMonth[month] = (summary.inboundByMonth[month] ?? 0) + 1;
      summary.inboundByShop[car.shopName] = (summary.inboundByShop[car.shopName] ?? 0) + 1;
    }

    for (const car of outboundCars) {
      const month = toMonthKey(car.plannedDate);
      summary.outboundByMonth[month] = (summary.outboundByMonth[month] ?? 0) + 1;
      summary.outboundByShop[car.shopName] = (summary.outboundByShop[car.shopName] ?? 0) + 1;
    }

    // Generate markdown
    const markdownContent = this.generateCustomerScheduleMarkdown(
      customer,
      criteria,
      summary,
      inboundCars,
      outboundCars
    );

    return {
      title: `Railcar Schedule - ${customer.name}`,
      generatedAt: new Date(),
      scenarioId: criteria.scenarioId,
      scenarioName: scenario.name,
      customerId,
      customerName: customer.name,
      customerCode: customer.code,
      selectionCriteria: criteria,
      summary,
      inboundCars,
      outboundCars,
      markdownContent,
      jsonContent: {
        customer: { id: customerId, name: customer.name, code: customer.code },
        summary,
        inbound: inboundCars.map((c) => ({
          railcarNumber: c.railcarNumber,
          plannedDate: formatDate(c.plannedDate),
          shop: c.shopName,
          workTypes: c.workTypes,
        })),
        outbound: outboundCars.map((c) => ({
          railcarNumber: c.railcarNumber,
          expectedDate: c.estimatedCompletionDate ? formatDate(c.estimatedCompletionDate) : 'TBD',
          shop: c.shopName,
        })),
      },
    };
  }

  /**
   * Generate customer schedule markdown
   */
  private generateCustomerScheduleMarkdown(
    customer: { name: string; code: string },
    criteria: DocumentSelectionCriteria,
    summary: CustomerSummary,
    inbound: CustomerCarEntry[],
    outbound: CustomerCarEntry[]
  ): string {
    const lines: string[] = [];

    lines.push(`# Railcar Schedule`);
    lines.push(`## ${customer.name} (${customer.code})`);
    lines.push(`**Generated:** ${formatDate(new Date())}`);
    lines.push('');

    // Summary
    lines.push('## Summary');
    lines.push(`- **Cars Being Released:** ${summary.totalInbound}`);
    lines.push(`- **Cars Being Received:** ${summary.totalOutbound}`);
    lines.push(`- **Estimated Total Cost:** ${formatCurrency(summary.totalEstimatedCost)}`);
    lines.push('');

    // Monthly overview
    const allMonths = [...new Set([
      ...Object.keys(summary.inboundByMonth),
      ...Object.keys(summary.outboundByMonth),
    ])].sort();

    if (allMonths.length > 0) {
      lines.push('### Monthly Overview');
      lines.push('| Month | Releasing | Receiving |');
      lines.push('| --- | --- | --- |');
      for (const month of allMonths) {
        lines.push(`| ${getMonthLabel(month)} | ${summary.inboundByMonth[month] ?? 0} | ${summary.outboundByMonth[month] ?? 0} |`);
      }
      lines.push('');
    }

    // Inbound (releasing)
    if (inbound.length > 0) {
      lines.push('## Cars Being Released');
      lines.push('');
      lines.push('| Car # | Type | Release Date | Shop | Work | Est. Completion | Est. Cost |');
      lines.push('| --- | --- | --- | --- | --- | --- | --- |');
      for (const car of inbound) {
        lines.push(
          `| ${car.railcarNumber} | ${car.carType} | ${formatDate(car.plannedDate)} | ${car.shopName} | ${car.workTypes.join(', ')} | ${car.estimatedCompletionDate ? formatDate(car.estimatedCompletionDate) : 'TBD'} | ${formatCurrency(car.estimatedCost)} |`
        );
      }
      lines.push('');
    }

    // Outbound (receiving)
    if (outbound.length > 0) {
      lines.push('## Cars Being Received');
      lines.push('');
      lines.push('| Car # | Type | Expected Date | Current Shop | Status |');
      lines.push('| --- | --- | --- | --- | --- |');
      for (const car of outbound) {
        const expectedDate = car.estimatedCompletionDate ?? car.plannedDate;
        lines.push(
          `| ${car.railcarNumber} | ${car.carType} | ${formatDate(expectedDate)} | ${car.shopName} | ${car.status} |`
        );
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  // ===========================================================================
  // SHOP PLAN GENERATION
  // ===========================================================================

  /**
   * Generate shop-specific plan with selected data
   */
  async generateShopPlan(
    criteria: DocumentSelectionCriteria,
    shopId: string
  ): Promise<ShopPlanDocument> {
    const [scenario, shop] = await Promise.all([
      this.prisma.qualificationScenario.findUnique({ where: { id: criteria.scenarioId } }),
      this.prisma.shop.findUnique({ where: { id: shopId } }),
    ]);

    if (!scenario || !shop) {
      throw new Error('Scenario or shop not found');
    }

    // Modify criteria to focus on this shop
    const shopCriteria: DocumentSelectionCriteria = {
      ...criteria,
      shopIds: [shopId],
    };

    // Get selected assignments
    const assignments = await this.getSelectedAssignments(shopCriteria);

    // Calculate summary
    const summary: ShopSummary = {
      totalCars: assignments.length,
      byMonth: {},
      byWorkType: {},
      byPriority: {},
      byCustomer: {},
      bundledCount: 0,
      totalEstimatedCost: 0,
      averageTurnTime: 0,
    };

    let totalDays = 0;
    for (const a of assignments) {
      summary.byMonth[a.monthKey] = (summary.byMonth[a.monthKey] ?? 0) + 1;
      summary.byPriority[a.priorityLabel] = (summary.byPriority[a.priorityLabel] ?? 0) + 1;

      for (const wt of a.workTypes) {
        summary.byWorkType[wt] = (summary.byWorkType[wt] ?? 0) + 1;
      }

      if (a.currentCustomerName) {
        summary.byCustomer[a.currentCustomerName] = (summary.byCustomer[a.currentCustomerName] ?? 0) + 1;
      }

      if (a.isBundled) summary.bundledCount++;
      summary.totalEstimatedCost += a.estimatedCost;
      totalDays += a.estimatedDays;
    }

    summary.averageTurnTime = assignments.length > 0 ? totalDays / assignments.length : 0;

    // Group by month with capacity analysis
    const byMonth: ShopMonthSection[] = [];
    const monthGroups = new Map<string, SelectedAssignment[]>();
    for (const a of assignments) {
      const list = monthGroups.get(a.monthKey) ?? [];
      list.push(a);
      monthGroups.set(a.monthKey, list);
    }

    const capacityAnalysis: CapacityAnalysis = {
      byMonth: {},
      overloadedMonths: [],
      underutilizedMonths: [],
    };

    for (const [monthKey, monthAssignments] of Array.from(monthGroups.entries()).sort()) {
      const capacityUsed = monthAssignments.length;
      const capacityTotal = shop.qualCapacity;
      const utilizationPercent = capacityTotal > 0 ? (capacityUsed / capacityTotal) * 100 : 0;

      byMonth.push({
        monthKey,
        monthLabel: getMonthLabel(monthKey),
        assignments: monthAssignments,
        capacityUsed,
        capacityTotal,
        utilizationPercent: Math.round(utilizationPercent),
      });

      capacityAnalysis.byMonth[monthKey] = {
        qualCapacity: capacityTotal,
        qualUsed: capacityUsed,
        qualAvailable: capacityTotal - capacityUsed,
        utilization: utilizationPercent,
      };

      if (utilizationPercent > 100) {
        capacityAnalysis.overloadedMonths.push(monthKey);
      } else if (utilizationPercent < 50) {
        capacityAnalysis.underutilizedMonths.push(monthKey);
      }
    }

    // Generate markdown
    const markdownContent = this.generateShopPlanMarkdown(
      shop,
      criteria,
      summary,
      byMonth,
      capacityAnalysis
    );

    return {
      title: `Shop Plan - ${shop.name}`,
      generatedAt: new Date(),
      scenarioId: criteria.scenarioId,
      scenarioName: scenario.name,
      shopId,
      shopName: shop.name,
      shopCode: shop.code,
      region: shop.region,
      selectionCriteria: criteria,
      summary,
      assignments,
      byMonth,
      capacityAnalysis,
      markdownContent,
      jsonContent: {
        shop: { id: shopId, name: shop.name, code: shop.code, region: shop.region },
        summary,
        capacityAnalysis,
        byMonth: byMonth.map((m) => ({
          monthKey: m.monthKey,
          count: m.assignments.length,
          utilization: m.utilizationPercent,
        })),
      },
    };
  }

  /**
   * Generate shop plan markdown
   */
  private generateShopPlanMarkdown(
    shop: { name: string; code: string; region: string },
    criteria: DocumentSelectionCriteria,
    summary: ShopSummary,
    byMonth: ShopMonthSection[],
    capacityAnalysis: CapacityAnalysis
  ): string {
    const lines: string[] = [];

    lines.push(`# Shop Plan`);
    lines.push(`## ${shop.name} (${shop.code})`);
    lines.push(`**Region:** ${shop.region}`);
    lines.push(`**Generated:** ${formatDate(new Date())}`);
    lines.push('');

    // Summary
    lines.push('## Summary');
    lines.push(`- **Total Cars:** ${summary.totalCars}`);
    lines.push(`- **Bundled Work:** ${summary.bundledCount}`);
    lines.push(`- **Estimated Total Cost:** ${formatCurrency(summary.totalEstimatedCost)}`);
    lines.push(`- **Average Turn Time:** ${summary.averageTurnTime.toFixed(1)} days`);
    lines.push('');

    // Capacity analysis
    lines.push('## Capacity Analysis');
    if (capacityAnalysis.overloadedMonths.length > 0) {
      lines.push(`⚠️ **Overloaded Months:** ${capacityAnalysis.overloadedMonths.map(getMonthLabel).join(', ')}`);
    }
    if (capacityAnalysis.underutilizedMonths.length > 0) {
      lines.push(`📉 **Underutilized Months:** ${capacityAnalysis.underutilizedMonths.map(getMonthLabel).join(', ')}`);
    }
    lines.push('');

    lines.push('| Month | Assigned | Capacity | Utilization |');
    lines.push('| --- | --- | --- | --- |');
    for (const month of byMonth) {
      const indicator = month.utilizationPercent > 100 ? '🔴' : month.utilizationPercent > 80 ? '🟡' : '🟢';
      lines.push(
        `| ${month.monthLabel} | ${month.capacityUsed} | ${month.capacityTotal} | ${indicator} ${month.utilizationPercent}% |`
      );
    }
    lines.push('');

    // Monthly details
    lines.push('## Monthly Schedule');
    for (const month of byMonth) {
      lines.push(`### ${month.monthLabel}`);
      lines.push('');
      lines.push('| Car # | Type | Work Types | Priority | Customer | Days | Cost |');
      lines.push('| --- | --- | --- | --- | --- | --- | --- |');
      for (const a of month.assignments) {
        lines.push(
          `| ${a.railcarNumber} | ${a.carType} | ${a.workTypes.join(', ')} | ${a.priorityLabel} | ${a.currentCustomerCode ?? '-'} | ${a.estimatedDays} | ${formatCurrency(a.estimatedCost)} |`
        );
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  // ===========================================================================
  // SAVE DOCUMENTS
  // ===========================================================================

  /**
   * Save generated document to database
   */
  async saveDocument(
    doc: TeamPlanDocument | CustomerScheduleDocument | ShopPlanDocument,
    documentType: string
  ): Promise<string> {
    const saved = await this.prisma.qualificationPlanDocument.create({
      data: {
        scenarioId: doc.scenarioId,
        documentType,
        title: doc.title,
        contentMarkdown: doc.markdownContent,
        contentJson: JSON.stringify(doc.jsonContent),
        targetCustomerId: (doc as CustomerScheduleDocument).customerId,
        targetShopId: (doc as ShopPlanDocument).shopId,
        companyId: this.companyId,
        createdBy: 'system',
      },
    });

    return saved.id;
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

export function createQualificationDocumentGenerator(
  prisma: PrismaClient,
  companyId: string
): QualificationDocumentGenerator {
  return new QualificationDocumentGenerator(prisma, companyId);
}

export default QualificationDocumentGenerator;
