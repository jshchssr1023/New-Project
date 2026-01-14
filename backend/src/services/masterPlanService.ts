/**
 * masterPlanService.ts - MasterPlan Workflow Service
 *
 * Provides the business logic for the MasterPlan workflow:
 * - Creating MasterPlans from approved Scenarios ("Approve Scenario" button)
 * - Retrieving active MasterPlans for dashboards and reporting
 * - Managing MasterPlanCommitments for shop work orders
 *
 * BUSINESS FLOW:
 * 1. Planners create and refine Scenarios with SOPAssignments
 * 2. When a Scenario is approved, it becomes a MasterPlan via createMasterPlanFromScenario()
 * 3. Each SOPAssignment is converted to a MasterPlanCommitment
 * 4. The MasterPlan becomes the single source of truth for:
 *    - Customer PDFs (qualification schedules)
 *    - Planning team dashboards
 *    - Shop work orders
 *    - All reporting
 *
 * @author AITX Chronos Team
 * @version 1.0.0
 */

import { PrismaClient } from '@prisma/client';
import { MasterPlan, MasterPlanCommitment, Prisma } from '../types/prismaTypes';
import { z } from 'zod';

// =============================================================================
// ZOD VALIDATION SCHEMAS
// =============================================================================

/**
 * Valid status values for MasterPlan
 * Workflow: draft -> under_review -> approved -> active -> archived
 */
export const MasterPlanStatusSchema = z.enum([
  'DRAFT',
  'PENDING',
  'APPROVED',
  'ACTIVE',
  'SUPERSEDED',
  'ARCHIVED',
]);

export type MasterPlanStatus = z.infer<typeof MasterPlanStatusSchema>;

/**
 * Valid status values for MasterPlanCommitment
 * Workflow: committed -> scheduled -> in_transit -> arrived -> in_progress -> released
 */
export const CommitmentStatusSchema = z.enum([
  'committed',
  'scheduled',
  'in_transit',
  'arrived',
  'in_progress',
  'released',
]);

export type CommitmentStatus = z.infer<typeof CommitmentStatusSchema>;

/**
 * Reasons a car is shopped - can have multiple bundled (Qualification is priority/main cost driver)
 */
export const ReasonsShoppedSchema = z.enum([
  'qualification',
  'assignment',
  'return',
  'repair',
  'maintenance',
]);

export type ReasonShopped = z.infer<typeof ReasonsShoppedSchema>;

/**
 * Schema for creating a MasterPlan from a Scenario
 */
export const CreateMasterPlanInputSchema = z.object({
  scenarioId: z.string().uuid(),
  userId: z.string().uuid(),
  planName: z.string().min(1).max(255),
});

export type CreateMasterPlanInput = z.infer<typeof CreateMasterPlanInputSchema>;

/**
 * Schema for MasterPlan output
 */
export const MasterPlanSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  planName: z.string(),
  fiscalYear: z.number().int().min(2020).max(2100),
  version: z.number().int().min(1),
  status: MasterPlanStatusSchema,
  baseScenarioId: z.string().uuid().nullable(),
  approvedAt: z.date().nullable(),
  approvedById: z.string().uuid().nullable(),
  validFrom: z.date(),
  validTo: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Schema for MasterPlanCommitment
 */
export const MasterPlanCommitmentSchema = z.object({
  id: z.string().uuid(),
  masterPlanId: z.string().uuid(),
  carId: z.string().uuid(),
  shopId: z.string().uuid(),
  customerId: z.string().uuid(),
  scheduledMonth: z.string().regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM format'),
  plannedArrival: z.date().nullable(),
  plannedRelease: z.date().nullable(),
  reasonsShopped: z.string(), // JSON array as string - Standardized across all entities
  isBundled: z.boolean(),
  estimatedCost: z.number().nullable(),
  priority: z.number().int().min(1).max(5),
  status: CommitmentStatusSchema,
  notes: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * MasterPlan with all related data included
 */
export interface MasterPlanWithCommitments extends MasterPlan {
  commitments: MasterPlanCommitmentWithRelations[];
  company?: { id: string; name: string; code: string };
  baseScenario?: { id: string; name: string; projectNumber: string } | null;
  approvedBy?: { id: string; firstName: string; lastName: string; email: string } | null;
}

/**
 * MasterPlanCommitment with related car, shop, and customer data
 */
export interface MasterPlanCommitmentWithRelations extends MasterPlanCommitment {
  car: {
    id: string;
    railcarNumber: string;
    carType: string;
    isTankCar: boolean;
    commodity: string;
    customer: string;
  };
  shop: {
    id: string;
    name: string;
    code: string;
    location: string;
    region: string;
  };
  customer: {
    id: string;
    name: string;
    code: string;
  };
}

/**
 * Summary statistics for a MasterPlan
 */
export interface MasterPlanSummary {
  totalCommitments: number;
  totalEstimatedCost: number;
  commitmentsByMonth: Record<string, number>;
  commitmentsByShop: Record<string, number>;
  commitmentsByStatus: Record<string, number>;
  commitmentsByWorkType: Record<string, number>;
}

// =============================================================================
// MASTER PLAN SERVICE CLASS
// =============================================================================

/**
 * MasterPlanService - Manages the MasterPlan workflow
 *
 * Key responsibilities:
 * - Convert approved Scenarios to MasterPlans
 * - Track commitment status through the fulfillment workflow
 * - Provide data for dashboards, reports, and customer communications
 */
export class MasterPlanService {
  constructor(private prisma: PrismaClient) {}

  // ===========================================================================
  // CORE WORKFLOW METHODS
  // ===========================================================================

  /**
   * Create a MasterPlan from an approved Scenario
   *
   * This is the "Approve Scenario" button logic that:
   * 1. Loads the Scenario with all SOPAssignments
   * 2. Creates or increments version of MasterPlan for the fiscal year
   * 3. Converts each SOPAssignment to a MasterPlanCommitment
   * 4. Archives any previous active plan for the same fiscal year
   *
   * @param scenarioId - The scenario to convert to a master plan
   * @param userId - The user approving the scenario
   * @param planName - Name for the new master plan
   * @returns The newly created MasterPlan with all commitments
   */
  async createMasterPlanFromScenario(
    scenarioId: string,
    userId: string,
    planName: string
  ): Promise<MasterPlanWithCommitments> {
    // Validate inputs
    const input = CreateMasterPlanInputSchema.parse({ scenarioId, userId, planName });

    // Step 1: Load the scenario with all SOPAssignments and related data
    const scenario = await this.prisma.scenario.findUnique({
      where: { id: input.scenarioId },
      include: {
        sopAssignments: {
          include: {
            car: true,
            shop: true,
          },
        },
        company: true,
      },
    });

    if (!scenario) {
      throw new Error(`Scenario not found: ${input.scenarioId}`);
    }

    if (!scenario.sopAssignments || scenario.sopAssignments.length === 0) {
      throw new Error(`Scenario has no assignments: ${input.scenarioId}`);
    }

    // Step 2: Determine fiscal year and date range from assignments
    const monthKeys = scenario.sopAssignments.map((a) => a.monthKey).sort();
    const firstMonth = monthKeys[0]; // e.g., "2026-01"
    const lastMonth = monthKeys[monthKeys.length - 1]; // e.g., "2026-12"

    const fiscalYear = parseInt(firstMonth.split('-')[0], 10);
    const validFrom = new Date(`${firstMonth}-01T00:00:00Z`);

    // validTo is the last day of the last month
    const [lastYear, lastMonthNum] = lastMonth.split('-').map(Number);
    const validTo = new Date(lastYear, lastMonthNum, 0); // Day 0 of next month = last day of this month

    // Step 3: Find the highest existing version for this fiscal year
    const existingPlan = await this.prisma.masterPlan.findFirst({
      where: {
        companyId: scenario.companyId,
        fiscalYear,
      },
      orderBy: { version: 'desc' },
    });

    const newVersion = existingPlan ? existingPlan.version + 1 : 1;

    // Step 4: Archive any currently active plan for this fiscal year
    await this.prisma.masterPlan.updateMany({
      where: {
        companyId: scenario.companyId,
        fiscalYear,
        status: 'active',
      },
      data: {
        status: 'archived',
      },
    });

    // Step 5: Get customer IDs for each car (from the car's customer field)
    // We need to look up or create customer records based on car data
    const customerMap = new Map<string, string>();

    for (const assignment of scenario.sopAssignments) {
      const customerName = assignment.car.customer || 'Unknown';

      if (!customerMap.has(customerName)) {
        // Try to find existing customer
        let customer = await this.prisma.customer.findFirst({
          where: {
            companyId: scenario.companyId,
            name: customerName,
          },
        });

        if (!customer) {
          // Create a placeholder customer if not found
          const code = customerName
            .replace(/\s+/g, '')
            .substring(0, 4)
            .toUpperCase();

          customer = await this.prisma.customer.create({
            data: {
              name: customerName,
              code: `${code}${Date.now() % 10000}`, // Ensure unique code
              companyId: scenario.companyId,
              isActive: true,
            },
          });
        }

        customerMap.set(customerName, customer.id);
      }
    }

    // Step 6: Create the new MasterPlan with all commitments in a transaction
    const masterPlan = await this.prisma.$transaction(async (tx) => {
      // Create the MasterPlan
      const plan = await tx.masterPlan.create({
        data: {
          companyId: scenario.companyId,
          planName: input.planName,
          fiscalYear,
          version: newVersion,
          status: 'draft', // Starts as draft, can be promoted to approved/active
          baseScenarioId: scenario.id,
          validFrom,
          validTo,
        },
      });

      // Create MasterPlanCommitments from SOPAssignments
      const commitmentData: Prisma.MasterPlanCommitmentCreateManyInput[] =
        scenario.sopAssignments.map((assignment) => {
          const customerName = assignment.car.customer || 'Unknown';
          const customerId = customerMap.get(customerName);

          // SAFETY: Ensure customerId exists (should always be true if loop above worked correctly)
          if (!customerId) {
            throw new Error(`Customer not found in map for: ${customerName}. This indicates a data integrity issue.`);
          }

          // Parse reasonsShopped - handle both JSON string and plain string
          // Qualification is the priority/main cost driver when multiple reasons exist
          let reasonsShopped = assignment.reasonsShopped || '[]';
          let reasonsArray: string[] = [];

          try {
            reasonsArray = JSON.parse(reasonsShopped);
          } catch {
            // If not valid JSON, treat as comma-separated or single value
            reasonsArray = reasonsShopped.split(',').map((r) => r.trim()).filter(Boolean);
          }

          // If empty, default to car's reasonsShopped or 'qualification'
          if (reasonsArray.length === 0) {
            try {
              const carReasons = JSON.parse(assignment.car.reasonsShopped || '[]');
              reasonsArray = carReasons.length > 0 ? carReasons : ['qualification'];
            } catch {
              reasonsArray = ['qualification'];
            }
          }

          const isBundled = reasonsArray.length > 1;

          return {
            masterPlanId: plan.id,
            carId: assignment.carId,
            shopId: assignment.shopId,
            customerId,
            scheduledMonth: assignment.monthKey,
            plannedArrival: assignment.scheduledArrival,
            plannedRelease: assignment.scheduledCompletion,
            reasonsShopped: JSON.stringify(reasonsArray), // Standardized field name
            isBundled,
            estimatedCost: assignment.estimatedCost,
            priority: assignment.priority,
            status: 'committed',
            notes: assignment.notes || `Created from scenario: ${scenario.name}`,
          };
        });

      await tx.masterPlanCommitment.createMany({
        data: commitmentData,
      });

      // SST: Also create UnifiedAssignment records (the single source of truth)
      // This ensures all planning data is consolidated in UnifiedAssignment
      const unifiedAssignmentData = scenario.sopAssignments.map((assignment) => {
        const customerName = assignment.car.customer || 'Unknown';
        const custId = customerMap.get(customerName);

        // Parse month from monthKey (e.g., "2026-01")
        const [yStr, mStr] = assignment.monthKey.split('-');
        const pYear = parseInt(yStr, 10);
        const pMonth = parseInt(mStr, 10);

        return {
          carId: assignment.carId,
          shopId: assignment.shopId,
          customerId: custId,
          plannedYear: pYear,
          plannedMonth: pMonth,
          scheduledMonth: assignment.monthKey,
          status: 'COMMITTED', // MasterPlan commitments are committed
          sourceType: 'master_plan',
          workType: 'full_qualification',
          shopReason: assignment.reasonsShopped || '',
          estimatedCost: assignment.estimatedCost || 0,
          estimatedDays: assignment.estimatedDays || 14,
          priority: assignment.priority || 3,
          notes: `Created from MasterPlan: ${input.planName}`,
          companyId: scenario.companyId,
          committedAt: new Date(),
        };
      });

      await tx.unifiedAssignment.createMany({
        data: unifiedAssignmentData,
      });

      return plan;
    });

    console.log(
      `[MasterPlanService] Created MasterPlan ${masterPlan.id} (FY${fiscalYear} v${newVersion}) ` +
        `with ${scenario.sopAssignments.length} commitments from scenario ${scenario.name} (SST synced)`
    );

    // Return the full plan with commitments
    return this.getMasterPlanById(masterPlan.id) as Promise<MasterPlanWithCommitments>;
  }

  // ===========================================================================
  // QUERY METHODS
  // ===========================================================================

  /**
   * Get the currently active MasterPlan for a company
   *
   * Returns the plan with status='active' for the current or upcoming fiscal year.
   * Used by dashboards, reports, and customer-facing documents.
   *
   * @param companyId - The company to get the active plan for
   * @returns The active MasterPlan or null if none exists
   */
  async getActiveMasterPlan(companyId: string): Promise<MasterPlanWithCommitments | null> {
    const plan = await this.prisma.masterPlan.findFirst({
      where: {
        companyId,
        status: 'active',
      },
      include: {
        commitments: {
          include: {
            car: {
              select: {
                id: true,
                railcarNumber: true,
                carType: true,
                isTankCar: true,
                commodity: true,
                customer: true,
              },
            },
            shop: {
              select: {
                id: true,
                name: true,
                code: true,
                location: true,
                region: true,
              },
            },
            customer: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
          orderBy: [{ scheduledMonth: 'asc' }, { priority: 'asc' }],
        },
        company: {
          select: { id: true, name: true, code: true },
        },
        baseScenario: {
          select: { id: true, name: true, projectNumber: true },
        },
        approvedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    return plan as MasterPlanWithCommitments | null;
  }

  /**
   * Get a MasterPlan by ID with all related data
   *
   * @param masterPlanId - The plan ID to retrieve
   * @returns The MasterPlan with commitments or null
   */
  async getMasterPlanById(masterPlanId: string): Promise<MasterPlanWithCommitments | null> {
    const plan = await this.prisma.masterPlan.findUnique({
      where: { id: masterPlanId },
      include: {
        commitments: {
          include: {
            car: {
              select: {
                id: true,
                railcarNumber: true,
                carType: true,
                isTankCar: true,
                commodity: true,
                customer: true,
              },
            },
            shop: {
              select: {
                id: true,
                name: true,
                code: true,
                location: true,
                region: true,
              },
            },
            customer: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
          orderBy: [{ scheduledMonth: 'asc' }, { priority: 'asc' }],
        },
        company: {
          select: { id: true, name: true, code: true },
        },
        baseScenario: {
          select: { id: true, name: true, projectNumber: true },
        },
        approvedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    return plan as MasterPlanWithCommitments | null;
  }

  /**
   * Get all commitments for a MasterPlan
   *
   * @param masterPlanId - The plan to get commitments for
   * @returns Array of commitments with related data
   */
  async getMasterPlanCommitments(
    masterPlanId: string
  ): Promise<MasterPlanCommitmentWithRelations[]> {
    const commitments = await this.prisma.masterPlanCommitment.findMany({
      where: { masterPlanId },
      include: {
        car: {
          select: {
            id: true,
            railcarNumber: true,
            carType: true,
            isTankCar: true,
            commodity: true,
            customer: true,
          },
        },
        shop: {
          select: {
            id: true,
            name: true,
            code: true,
            location: true,
            region: true,
          },
        },
        customer: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: [{ scheduledMonth: 'asc' }, { priority: 'asc' }],
    });

    return commitments as MasterPlanCommitmentWithRelations[];
  }

  /**
   * List all MasterPlans for a company
   *
   * @param companyId - The company to list plans for
   * @param options - Filter and pagination options
   * @returns Array of MasterPlans with summary info
   */
  async listMasterPlans(
    companyId: string,
    options?: {
      fiscalYear?: number;
      status?: MasterPlanStatus;
      limit?: number;
      offset?: number;
    }
  ): Promise<MasterPlan[]> {
    const where: Prisma.MasterPlanWhereInput = {
      companyId,
      ...(options?.fiscalYear && { fiscalYear: options.fiscalYear }),
      ...(options?.status && { status: options.status }),
    };

    const plans = await this.prisma.masterPlan.findMany({
      where,
      include: {
        _count: {
          select: { commitments: true },
        },
        baseScenario: {
          select: { id: true, name: true },
        },
      },
      orderBy: [{ fiscalYear: 'desc' }, { version: 'desc' }],
      ...(options?.limit && { take: options.limit }),
      ...(options?.offset && { skip: options.offset }),
    });

    return plans;
  }

  // ===========================================================================
  // STATUS MANAGEMENT METHODS
  // ===========================================================================

  /**
   * Approve a MasterPlan and optionally activate it
   *
   * @param masterPlanId - The plan to approve
   * @param userId - The user approving the plan
   * @param activate - Whether to also set status to 'active'
   */
  async approveMasterPlan(
    masterPlanId: string,
    userId: string,
    activate: boolean = false
  ): Promise<MasterPlan> {
    const plan = await this.prisma.masterPlan.findUnique({
      where: { id: masterPlanId },
    });

    if (!plan) {
      throw new Error(`MasterPlan not found: ${masterPlanId}`);
    }

    if (plan.status !== 'draft' && plan.status !== 'under_review') {
      throw new Error(`Cannot approve plan with status: ${plan.status}`);
    }

    // If activating, archive any other active plan for this fiscal year
    if (activate) {
      await this.prisma.masterPlan.updateMany({
        where: {
          companyId: plan.companyId,
          fiscalYear: plan.fiscalYear,
          status: 'active',
          id: { not: masterPlanId },
        },
        data: { status: 'archived' },
      });
    }

    const updatedPlan = await this.prisma.masterPlan.update({
      where: { id: masterPlanId },
      data: {
        status: activate ? 'active' : 'approved',
        approvedAt: new Date(),
        approvedById: userId,
      },
    });

    console.log(
      `[MasterPlanService] ${activate ? 'Approved and activated' : 'Approved'} ` +
        `MasterPlan ${masterPlanId} by user ${userId}`
    );

    return updatedPlan;
  }

  /**
   * Update commitment status (for tracking fulfillment workflow)
   *
   * @param commitmentId - The commitment to update
   * @param newStatus - The new status
   */
  async updateCommitmentStatus(
    commitmentId: string,
    newStatus: CommitmentStatus
  ): Promise<MasterPlanCommitment> {
    // Validate the status transition
    const commitment = await this.prisma.masterPlanCommitment.findUnique({
      where: { id: commitmentId },
    });

    if (!commitment) {
      throw new Error(`Commitment not found: ${commitmentId}`);
    }

    // Define valid status transitions
    const validTransitions: Record<string, string[]> = {
      committed: ['scheduled'],
      scheduled: ['in_transit', 'arrived'], // Can skip in_transit
      in_transit: ['arrived'],
      arrived: ['in_progress'],
      in_progress: ['released'],
      released: [], // Terminal state
    };

    const allowedNext = validTransitions[commitment.status] || [];
    if (!allowedNext.includes(newStatus)) {
      throw new Error(
        `Invalid status transition: ${commitment.status} -> ${newStatus}. ` +
          `Allowed: ${allowedNext.join(', ') || 'none'}`
      );
    }

    const updated = await this.prisma.masterPlanCommitment.update({
      where: { id: commitmentId },
      data: { status: newStatus },
    });

    console.log(
      `[MasterPlanService] Updated commitment ${commitmentId} status: ` +
        `${commitment.status} -> ${newStatus}`
    );

    return updated;
  }

  // ===========================================================================
  // ANALYTICS AND REPORTING
  // ===========================================================================

  /**
   * Get summary statistics for a MasterPlan
   *
   * @param masterPlanId - The plan to summarize
   * @returns Summary statistics
   */
  async getMasterPlanSummary(masterPlanId: string): Promise<MasterPlanSummary> {
    const commitments = await this.prisma.masterPlanCommitment.findMany({
      where: { masterPlanId },
      include: {
        shop: { select: { name: true } },
      },
    });

    const summary: MasterPlanSummary = {
      totalCommitments: commitments.length,
      totalEstimatedCost: commitments.reduce((sum, c) => sum + (c.estimatedCost || 0), 0),
      commitmentsByMonth: {},
      commitmentsByShop: {},
      commitmentsByStatus: {},
      commitmentsByWorkType: {},
    };

    for (const commitment of commitments) {
      // By month
      summary.commitmentsByMonth[commitment.scheduledMonth] =
        (summary.commitmentsByMonth[commitment.scheduledMonth] || 0) + 1;

      // By shop
      const shopName = commitment.shop.name;
      summary.commitmentsByShop[shopName] = (summary.commitmentsByShop[shopName] || 0) + 1;

      // By status
      summary.commitmentsByStatus[commitment.status] =
        (summary.commitmentsByStatus[commitment.status] || 0) + 1;

      // By work type (from reasonsShopped)
      try {
        const reasons = JSON.parse(commitment.reasonsShopped) as string[];
        for (const reason of reasons) {
          summary.commitmentsByWorkType[reason] = (summary.commitmentsByWorkType[reason] || 0) + 1;
        }
      } catch {
        summary.commitmentsByWorkType['unknown'] =
          (summary.commitmentsByWorkType['unknown'] || 0) + 1;
      }
    }

    return summary;
  }

  /**
   * Get commitments for a specific shop and month (for shop work orders)
   *
   * SST: Now reads from UnifiedAssignment (single source of truth)
   * for all operational data, supplemented by MasterPlanCommitments
   * for formal versioned plans.
   *
   * @param shopId - The shop to get work orders for
   * @param scheduledMonth - The month in YYYY-MM format
   * @returns Array of commitments for the shop/month
   */
  async getShopWorkOrders(
    shopId: string,
    scheduledMonth: string
  ): Promise<MasterPlanCommitmentWithRelations[]> {
    // Parse the month to get year and month number
    const [yearStr, monthStr] = scheduledMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    // SST: Get work orders from UnifiedAssignment (the single source of truth)
    const unifiedAssignments = await this.prisma.unifiedAssignment.findMany({
      where: {
        shopId,
        plannedYear: year,
        plannedMonth: month,
        status: { in: ['PENDING_REVIEW', 'COMMITTED', 'IN_PROGRESS'] },
      },
      include: {
        car: {
          select: {
            id: true,
            railcarNumber: true,
            carType: true,
            isTankCar: true,
            commodity: true,
            customer: true,
            status: true,
          },
        },
        shop: {
          select: {
            id: true,
            name: true,
            code: true,
            location: true,
            region: true,
          },
        },
        customer: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: [{ priority: 'asc' }, { committedAt: 'asc' }],
    });

    // Map UnifiedAssignment to MasterPlanCommitment-like structure
    const commitments: any[] = unifiedAssignments.map((ua) => {
      // Map SST status to work order status
      let workOrderStatus = 'committed';
      if (ua.status === 'IN_PROGRESS') {
        workOrderStatus = 'in_progress';
      } else if (ua.status === 'COMPLETED') {
        workOrderStatus = 'released';
      } else if (ua.car?.status?.toLowerCase() === 'arrived') {
        workOrderStatus = 'arrived';
      }

      return {
        id: ua.id,
        carId: ua.carId,
        shopId: ua.shopId,
        customerId: ua.customerId,
        scheduledMonth: scheduledMonth,
        priority: ua.priority,
        status: workOrderStatus,
        reasonsShopped: ua.shopReason,
        estimatedCost: ua.estimatedCost,
        plannedArrival: null,
        notes: ua.notes,
        car: ua.car,
        shop: ua.shop,
        customer: ua.customer,
        // Source indicator for debugging
        _source: 'UnifiedAssignment',
      };
    });

    // Sort by priority then by car number
    commitments.sort((a: any, b: any) => {
      if (a.priority !== b.priority) return (a.priority || 3) - (b.priority || 3);
      return (a.car?.railcarNumber || '').localeCompare(b.car?.railcarNumber || '');
    });

    return commitments as MasterPlanCommitmentWithRelations[];
  }

  /**
   * Get commitments for a specific customer (for customer PDF schedules)
   *
   * @param customerId - The customer to get schedules for
   * @param masterPlanId - Optional specific plan, defaults to active plan
   * @returns Array of commitments for the customer
   */
  async getCustomerSchedule(
    customerId: string,
    masterPlanId?: string
  ): Promise<MasterPlanCommitmentWithRelations[]> {
    let planId = masterPlanId;

    if (!planId) {
      // Get the customer's company and find their active plan
      const customer = await this.prisma.customer.findUnique({
        where: { id: customerId },
      });

      if (!customer) {
        throw new Error(`Customer not found: ${customerId}`);
      }

      const activePlan = await this.prisma.masterPlan.findFirst({
        where: {
          companyId: customer.companyId,
          status: 'active',
        },
      });

      if (!activePlan) {
        return [];
      }

      planId = activePlan.id;
    }

    const commitments = await this.prisma.masterPlanCommitment.findMany({
      where: {
        masterPlanId: planId,
        customerId,
      },
      include: {
        car: {
          select: {
            id: true,
            railcarNumber: true,
            carType: true,
            isTankCar: true,
            commodity: true,
            customer: true,
          },
        },
        shop: {
          select: {
            id: true,
            name: true,
            code: true,
            location: true,
            region: true,
          },
        },
        customer: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: [{ scheduledMonth: 'asc' }, { priority: 'asc' }],
    });

    return commitments as MasterPlanCommitmentWithRelations[];
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a MasterPlanService instance
 */
export function createMasterPlanService(prisma: PrismaClient): MasterPlanService {
  return new MasterPlanService(prisma);
}

export default MasterPlanService;
