/**
 * scenarioService.ts - S&OP Scenario Management Service
 *
 * Provides scenario-based planning operations including:
 * - Scenario CRUD operations
 * - Deep cloning of scenarios with all assignments
 * - Scenario comparison for what-if analysis
 *
 * @author AITX Chronos Team
 * @version 1.0.0
 */

import { prisma } from './db';

// Type definitions for new models (until prisma generate is run)
interface Scenario {
  id: string;
  projectNumber: string;
  name: string;
  description: string;
  customerFilter: string;
  basePlanId: string | null;
  status: string;
  results: string | null;
  companyId: string;
  createdBy: string;
  isBaseline: boolean;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  sopAssignments?: SOPAssignment[];
  parent?: { id: string; name: string } | null;
  clones?: { id: string; name: string }[];
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
  car?: any;
  shop?: Shop;
}

interface Shop {
  id: string;
  name: string;
  code: string;
  location: string;
  qualCapacity: number;
  assignCapacity: number;
  returnCapacity: number;
  repairCapacity: number;
  efficiencyRating: number;
  isActive: boolean;
}

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

/**
 * Scenario with its assignments included
 */
export interface ScenarioWithAssignments extends Scenario {
  sopAssignments: SOPAssignment[];
}

/**
 * Shop capacity comparison data
 */
export interface ShopCapacityComparison {
  shopId: string;
  shopName: string;
  monthKey: string;
  scenarioAUsed: number;
  scenarioBUsed: number;
  difference: number;
  percentDifference: number;
}

/**
 * Scenario comparison result
 */
export interface ScenarioComparison {
  scenarioA: {
    id: string;
    name: string;
    totalCars: number;
    totalCost: number;
    avgTurnTime: number;
  };
  scenarioB: {
    id: string;
    name: string;
    totalCars: number;
    totalCost: number;
    avgTurnTime: number;
  };
  carsDifference: number;
  costDifference: number;
  avgTurnTimeDifference: number;
  capacityUtilization: ShopCapacityComparison[];
  timelineDifferences: {
    monthKey: string;
    scenarioACars: number;
    scenarioBCars: number;
    difference: number;
  }[];
}

/**
 * Create scenario input
 */
export interface CreateScenarioInput {
  name: string;
  description?: string;
  projectNumber?: string;
  companyId: string;
  createdBy: string;
  isBaseline?: boolean;
}

// =============================================================================
// SCENARIO SERVICE CLASS
// =============================================================================

/**
 * ScenarioService - Manages S&OP planning scenarios
 */
export class ScenarioService {
  constructor(private prisma: any) {}

  // ===========================================================================
  // SCENARIO CRUD OPERATIONS
  // ===========================================================================

  /**
   * Create a new scenario
   */
  async createScenario(input: CreateScenarioInput): Promise<Scenario> {
    const scenario = await this.prisma.scenario.create({
      data: {
        name: input.name,
        description: input.description || '',
        projectNumber: input.projectNumber || this.generateProjectNumber(),
        isBaseline: input.isBaseline || false,
        companyId: input.companyId,
        createdBy: input.createdBy,
        status: 'draft',
      },
    });

    console.log(`[ScenarioService] Created scenario: ${scenario.id} - ${scenario.name}`);
    return scenario;
  }

  /**
   * Clone a scenario with all its assignments
   */
  async cloneScenario(scenarioId: string, newName: string, userId: string): Promise<Scenario> {
    // Get the original scenario with all assignments
    const original = await this.prisma.scenario.findUnique({
      where: { id: scenarioId },
      include: {
        sopAssignments: true,
      },
    });

    if (!original) {
      throw new Error(`Scenario not found: ${scenarioId}`);
    }

    // Create the cloned scenario
    const cloned = await this.prisma.scenario.create({
      data: {
        name: newName,
        description: `Cloned from: ${original.name}`,
        projectNumber: original.projectNumber,
        customerFilter: original.customerFilter,
        isBaseline: false,
        parentId: original.id,
        companyId: original.companyId,
        createdBy: userId,
        status: 'draft',
      },
    });

    // Copy all assignments to the new scenario
    if (original.sopAssignments && original.sopAssignments.length > 0) {
      const assignmentData = original.sopAssignments.map((assignment) => ({
        scenarioId: cloned.id,
        carId: assignment.carId,
        shopId: assignment.shopId,
        workTypes: assignment.workTypes,
        status: 'DRAFT',
        monthKey: assignment.monthKey,
        scheduledArrival: assignment.scheduledArrival,
        scheduledCompletion: assignment.scheduledCompletion,
        estimatedCost: assignment.estimatedCost,
        estimatedDays: assignment.estimatedDays,
        priority: assignment.priority,
        notes: `Cloned from scenario: ${original.name}`,
      }));

      await this.prisma.sOPAssignment.createMany({
        data: assignmentData,
      });
    }

    console.log(
      `[ScenarioService] Cloned scenario ${scenarioId} -> ${cloned.id} with ${original.sopAssignments?.length || 0} assignments`
    );

    // Return the cloned scenario with its assignments
    return this.prisma.scenario.findUnique({
      where: { id: cloned.id },
      include: { sopAssignments: true },
    }) as Promise<Scenario>;
  }

  /**
   * Get a scenario by ID with all assignments
   */
  async getScenario(scenarioId: string): Promise<ScenarioWithAssignments | null> {
    const scenario = await this.prisma.scenario.findUnique({
      where: { id: scenarioId },
      include: {
        sopAssignments: {
          include: {
            car: true,
            shop: true,
          },
          orderBy: { monthKey: 'asc' },
        },
        parent: {
          select: { id: true, name: true },
        },
        clones: {
          select: { id: true, name: true },
        },
      },
    });

    return scenario as ScenarioWithAssignments | null;
  }

  /**
   * List all scenarios for a company
   */
  async listScenarios(companyId: string): Promise<Scenario[]> {
    const scenarios = await this.prisma.scenario.findMany({
      where: { companyId },
      include: {
        sopAssignments: {
          select: { id: true },
        },
        parent: {
          select: { id: true, name: true },
        },
        creator: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Add assignment count to each scenario
    return scenarios.map((s) => ({
      ...s,
      assignmentCount: s.sopAssignments?.length || 0,
    })) as Scenario[];
  }

  /**
   * Delete a scenario and all its assignments
   */
  async deleteScenario(scenarioId: string): Promise<void> {
    // Check if scenario exists
    const scenario = await this.prisma.scenario.findUnique({
      where: { id: scenarioId },
      include: {
        clones: { select: { id: true } },
      },
    });

    if (!scenario) {
      throw new Error(`Scenario not found: ${scenarioId}`);
    }

    // Check if this scenario has clones (can't delete parent with active clones)
    if (scenario.clones && scenario.clones.length > 0) {
      throw new Error(
        `Cannot delete scenario with active clones. Delete the clones first or unlink them.`
      );
    }

    // Delete the scenario (cascade will delete assignments)
    await this.prisma.scenario.delete({
      where: { id: scenarioId },
    });

    console.log(`[ScenarioService] Deleted scenario: ${scenarioId}`);
  }

  // ===========================================================================
  // SCENARIO COMPARISON
  // ===========================================================================

  /**
   * Compare two scenarios
   */
  async compareScenarios(scenarioIdA: string, scenarioIdB: string): Promise<ScenarioComparison> {
    // Fetch both scenarios with their assignments
    const [scenarioA, scenarioB] = await Promise.all([
      this.prisma.scenario.findUnique({
        where: { id: scenarioIdA },
        include: {
          sopAssignments: {
            include: { shop: true },
          },
        },
      }),
      this.prisma.scenario.findUnique({
        where: { id: scenarioIdB },
        include: {
          sopAssignments: {
            include: { shop: true },
          },
        },
      }),
    ]);

    if (!scenarioA) {
      throw new Error(`Scenario A not found: ${scenarioIdA}`);
    }
    if (!scenarioB) {
      throw new Error(`Scenario B not found: ${scenarioIdB}`);
    }

    // Calculate totals for scenario A
    const totalCarsA = scenarioA.sopAssignments?.length || 0;
    const totalCostA = scenarioA.sopAssignments?.reduce(
      (sum, a) => sum + (a.estimatedCost || 0),
      0
    ) || 0;
    const avgTurnTimeA =
      totalCarsA > 0
        ? scenarioA.sopAssignments!.reduce((sum, a) => sum + (a.estimatedDays || 0), 0) / totalCarsA
        : 0;

    // Calculate totals for scenario B
    const totalCarsB = scenarioB.sopAssignments?.length || 0;
    const totalCostB = scenarioB.sopAssignments?.reduce(
      (sum, a) => sum + (a.estimatedCost || 0),
      0
    ) || 0;
    const avgTurnTimeB =
      totalCarsB > 0
        ? scenarioB.sopAssignments!.reduce((sum, a) => sum + (a.estimatedDays || 0), 0) / totalCarsB
        : 0;

    // Calculate capacity utilization differences by shop/month
    const capacityUtilization = this.calculateCapacityDifferences(
      scenarioA.sopAssignments || [],
      scenarioB.sopAssignments || []
    );

    // Calculate timeline differences by month
    const timelineDifferences = this.calculateTimelineDifferences(
      scenarioA.sopAssignments || [],
      scenarioB.sopAssignments || []
    );

    const comparison: ScenarioComparison = {
      scenarioA: {
        id: scenarioA.id,
        name: scenarioA.name,
        totalCars: totalCarsA,
        totalCost: Math.round(totalCostA),
        avgTurnTime: Math.round(avgTurnTimeA * 10) / 10,
      },
      scenarioB: {
        id: scenarioB.id,
        name: scenarioB.name,
        totalCars: totalCarsB,
        totalCost: Math.round(totalCostB),
        avgTurnTime: Math.round(avgTurnTimeB * 10) / 10,
      },
      carsDifference: totalCarsB - totalCarsA,
      costDifference: Math.round(totalCostB - totalCostA),
      avgTurnTimeDifference: Math.round((avgTurnTimeB - avgTurnTimeA) * 10) / 10,
      capacityUtilization,
      timelineDifferences,
    };

    console.log(
      `[ScenarioService] Compared scenarios: ${scenarioIdA} vs ${scenarioIdB}`
    );
    return comparison;
  }

  // ===========================================================================
  // ASSIGNMENT OPERATIONS
  // ===========================================================================

  /**
   * Add an assignment to a scenario
   */
  async addAssignment(
    scenarioId: string,
    carId: string,
    shopId: string,
    data: {
      workTypes: string[];
      monthKey: string;
      estimatedCost?: number;
      estimatedDays?: number;
      priority?: number;
      notes?: string;
    }
  ): Promise<SOPAssignment> {
    const assignment = await this.prisma.sOPAssignment.create({
      data: {
        scenarioId,
        carId,
        shopId,
        workTypes: JSON.stringify(data.workTypes),
        monthKey: data.monthKey,
        estimatedCost: data.estimatedCost || 15000,
        estimatedDays: data.estimatedDays || 14,
        priority: data.priority || 3,
        notes: data.notes || '',
        status: 'DRAFT',
      },
      include: {
        car: true,
        shop: true,
      },
    });

    console.log(
      `[ScenarioService] Added assignment to scenario ${scenarioId}: car=${carId}, shop=${shopId}`
    );
    return assignment;
  }

  /**
   * Update an assignment
   */
  async updateAssignment(
    assignmentId: string,
    updates: {
      shopId?: string;
      workTypes?: string[];
      monthKey?: string;
      status?: string;
      scheduledArrival?: Date;
      scheduledCompletion?: Date;
      estimatedCost?: number;
      estimatedDays?: number;
      priority?: number;
      notes?: string;
    }
  ): Promise<SOPAssignment> {
    const updateData: any = { ...updates };
    if (updates.workTypes) {
      updateData.workTypes = JSON.stringify(updates.workTypes);
    }

    const assignment = await this.prisma.sOPAssignment.update({
      where: { id: assignmentId },
      data: updateData,
      include: {
        car: true,
        shop: true,
      },
    });

    console.log(`[ScenarioService] Updated assignment: ${assignmentId}`);
    return assignment;
  }

  /**
   * Remove an assignment from a scenario
   */
  async removeAssignment(assignmentId: string): Promise<void> {
    await this.prisma.sOPAssignment.delete({
      where: { id: assignmentId },
    });

    console.log(`[ScenarioService] Removed assignment: ${assignmentId}`);
  }

  /**
   * Get assignments for a scenario
   */
  async getAssignments(scenarioId: string): Promise<SOPAssignment[]> {
    return this.prisma.sOPAssignment.findMany({
      where: { scenarioId },
      include: {
        car: true,
        shop: true,
      },
      orderBy: [{ monthKey: 'asc' }, { priority: 'asc' }],
    });
  }

  // ===========================================================================
  // PRIVATE HELPER METHODS
  // ===========================================================================

  /**
   * Generate a project number
   */
  private generateProjectNumber(): string {
    const now = new Date();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    const year = now.getFullYear().toString().slice(-2);
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    return `Q${quarter}-${year}-${random}`;
  }

  /**
   * Calculate capacity utilization differences between two scenarios
   */
  private calculateCapacityDifferences(
    assignmentsA: (SOPAssignment & { shop: Shop })[],
    assignmentsB: (SOPAssignment & { shop: Shop })[]
  ): ShopCapacityComparison[] {
    // Group assignments by shop and month
    const groupA = this.groupByShopMonth(assignmentsA);
    const groupB = this.groupByShopMonth(assignmentsB);

    // Get all unique shop/month combinations
    const allKeys = new Set([...Object.keys(groupA), ...Object.keys(groupB)]);

    const comparisons: ShopCapacityComparison[] = [];

    allKeys.forEach((key) => {
      const [shopId, monthKey] = key.split('|');
      const dataA = groupA[key];
      const dataB = groupB[key];

      const usedA = dataA?.count || 0;
      const usedB = dataB?.count || 0;
      const difference = usedB - usedA;
      const percentDiff = usedA > 0 ? ((usedB - usedA) / usedA) * 100 : usedB > 0 ? 100 : 0;

      comparisons.push({
        shopId,
        shopName: dataA?.shopName || dataB?.shopName || shopId,
        monthKey,
        scenarioAUsed: usedA,
        scenarioBUsed: usedB,
        difference,
        percentDifference: Math.round(percentDiff * 10) / 10,
      });
    });

    // Sort by month then by shop
    return comparisons.sort((a, b) => {
      const monthCmp = a.monthKey.localeCompare(b.monthKey);
      if (monthCmp !== 0) return monthCmp;
      return a.shopName.localeCompare(b.shopName);
    });
  }

  /**
   * Group assignments by shop and month
   */
  private groupByShopMonth(
    assignments: (SOPAssignment & { shop: Shop })[]
  ): Record<string, { count: number; shopName: string }> {
    const grouped: Record<string, { count: number; shopName: string }> = {};

    assignments.forEach((a) => {
      const key = `${a.shopId}|${a.monthKey}`;
      if (!grouped[key]) {
        grouped[key] = { count: 0, shopName: a.shop?.name || a.shopId };
      }
      grouped[key].count++;
    });

    return grouped;
  }

  /**
   * Calculate timeline differences by month
   */
  private calculateTimelineDifferences(
    assignmentsA: SOPAssignment[],
    assignmentsB: SOPAssignment[]
  ): { monthKey: string; scenarioACars: number; scenarioBCars: number; difference: number }[] {
    // Group by month
    const monthsA = this.countByMonth(assignmentsA);
    const monthsB = this.countByMonth(assignmentsB);

    // Get all unique months
    const allMonths = new Set([...Object.keys(monthsA), ...Object.keys(monthsB)]);

    const differences = Array.from(allMonths)
      .sort()
      .map((monthKey) => ({
        monthKey,
        scenarioACars: monthsA[monthKey] || 0,
        scenarioBCars: monthsB[monthKey] || 0,
        difference: (monthsB[monthKey] || 0) - (monthsA[monthKey] || 0),
      }));

    return differences;
  }

  /**
   * Count assignments by month
   */
  private countByMonth(assignments: SOPAssignment[]): Record<string, number> {
    const counts: Record<string, number> = {};
    assignments.forEach((a) => {
      counts[a.monthKey] = (counts[a.monthKey] || 0) + 1;
    });
    return counts;
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a scenario service instance
 */
export function createScenarioService(prisma: any): ScenarioService {
  return new ScenarioService(prisma);
}

export default ScenarioService;
