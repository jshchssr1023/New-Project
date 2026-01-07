/**
 * Commitment Service
 *
 * Provides a unified interface for car-to-shop commitments.
 * During the transition period, this service writes to BOTH:
 * - MasterPlanCommitment (new primary source of truth)
 * - CarFlowPlan (legacy, for backward compatibility)
 *
 * Eventually, CarFlowPlan writes will be removed once all consumers
 * are updated to use MasterPlanCommitment.
 */

import { PrismaClient, CommitmentStatus, MasterPlanStatus } from '@prisma/client';

const prisma = new PrismaClient();

// Map legacy status to CommitmentStatus
function mapToCommitmentStatus(legacyStatus: string): CommitmentStatus {
  switch (legacyStatus.toLowerCase()) {
    case 'planned':
      return 'PLANNED';
    case 'scheduled':
      return 'SCHEDULED';
    case 'in progress':
    case 'in_progress':
      return 'IN_PROGRESS';
    case 'complete':
    case 'completed':
      return 'COMPLETE';
    case 'cancelled':
      return 'CANCELLED';
    default:
      return 'PLANNED';
  }
}

// Map CommitmentStatus to legacy status string
function mapToLegacyStatus(status: CommitmentStatus): string {
  switch (status) {
    case 'DRAFT':
    case 'PLANNED':
      return 'Planned';
    case 'SCHEDULED':
      return 'Scheduled';
    case 'IN_PROGRESS':
      return 'In Progress';
    case 'COMPLETE':
      return 'Complete';
    case 'CANCELLED':
      return 'Cancelled';
    case 'DEFERRED':
      return 'Deferred';
    case 'RESCHEDULED':
      return 'Rescheduled';
    default:
      return 'Planned';
  }
}

export interface CreateCommitmentInput {
  carId: string;
  shopId: string;
  customerId?: string;
  plannedMonth: number;
  plannedYear: number;
  workType?: string;
  shopReason?: string;
  estimatedCost?: number;
  priority?: number;
  notes?: string;
  sourceScenarioId?: string;
  companyId: string;
  committedById: string;
}

export interface UpdateCommitmentInput {
  shopId?: string;
  plannedMonth?: number;
  plannedYear?: number;
  status?: string;
  workType?: string;
  shopReason?: string;
  estimatedCost?: number;
  priority?: number;
  notes?: string;
  confirmedByShop?: boolean;
  confirmedByCustomer?: boolean;
  scheduledArrivalDate?: Date;
  scheduledCompletionDate?: Date;
  actualArrivalDate?: Date;
  actualCompletionDate?: Date;
  executionNotes?: string;
}

export interface CommitmentResult {
  id: string;
  carId: string;
  shopId: string;
  customerId?: string | null;
  plannedMonth: number;
  plannedYear: number;
  status: string;
  workType: string;
  shopReason: string;
  estimatedCost?: number | null;
  priority: number;
  notes: string;
  confirmedByShop: boolean;
  confirmedByCustomer: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class CommitmentService {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || prisma;
  }

  /**
   * Get or create the active MasterPlan for a company
   */
  private async getOrCreateActiveMasterPlan(companyId: string): Promise<string> {
    // Try to find an active master plan
    let masterPlan = await this.prisma.masterPlan.findFirst({
      where: {
        companyId,
        status: 'ACTIVE',
      },
    });

    if (!masterPlan) {
      // Create a new master plan
      const now = new Date();
      const planningHorizonStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const planningHorizonEnd = new Date(now.getFullYear() + 1, 11, 31);

      masterPlan = await this.prisma.masterPlan.create({
        data: {
          name: `Master Plan ${now.getFullYear()}`,
          description: 'Auto-created master plan',
          version: 1,
          status: 'ACTIVE',
          validFrom: now,
          planningHorizonStart,
          planningHorizonEnd,
          companyId,
          snapshotTakenAt: now,
          carCount: 0,
          shopCount: 0,
        },
      });
    }

    return masterPlan.id;
  }

  /**
   * Create a new commitment
   * Writes to both MasterPlanCommitment and CarFlowPlan for backward compatibility
   */
  async createCommitment(input: CreateCommitmentInput): Promise<CommitmentResult> {
    const masterPlanId = await this.getOrCreateActiveMasterPlan(input.companyId);

    // Use a transaction to ensure both writes succeed or fail together
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create MasterPlanCommitment (new primary)
      const commitment = await tx.masterPlanCommitment.create({
        data: {
          masterPlanId,
          carId: input.carId,
          shopId: input.shopId,
          customerId: input.customerId,
          plannedMonth: input.plannedMonth,
          plannedYear: input.plannedYear,
          status: 'PLANNED',
          workType: input.workType || 'full_qualification',
          shopReason: input.shopReason || '',
          estimatedCost: input.estimatedCost,
          priority: input.priority || 3,
          notes: input.notes || '',
          sourceType: input.sourceScenarioId ? 'scenario' : 'manual',
          sourceScenarioId: input.sourceScenarioId,
          committedAt: new Date(),
          committedById: input.committedById,
          companyId: input.companyId,
          confirmedByShop: false,
          confirmedByCustomer: false,
        },
      });

      // 2. Also create CarFlowPlan for backward compatibility
      // This will be removed once all consumers are updated
      try {
        await tx.carFlowPlan.create({
          data: {
            carId: input.carId,
            shopId: input.shopId,
            customerId: input.customerId,
            plannedMonth: input.plannedMonth,
            plannedYear: input.plannedYear,
            status: 'Planned',
            shopReason: input.shopReason || '',
            estimatedCost: input.estimatedCost,
            priority: input.priority || 3,
            notes: input.notes || '',
            sourceScenarioId: input.sourceScenarioId,
            committedAt: new Date(),
            committedById: input.committedById,
            companyId: input.companyId,
          },
        });
      } catch (err: any) {
        // CarFlowPlan has unique constraint on carId
        // If it already exists, update it instead
        if (err.code === 'P2002') {
          await tx.carFlowPlan.update({
            where: { carId: input.carId },
            data: {
              shopId: input.shopId,
              customerId: input.customerId,
              plannedMonth: input.plannedMonth,
              plannedYear: input.plannedYear,
              status: 'Planned',
              shopReason: input.shopReason || '',
              estimatedCost: input.estimatedCost,
              priority: input.priority || 3,
              notes: input.notes || '',
              sourceScenarioId: input.sourceScenarioId,
            },
          });
        } else {
          throw err;
        }
      }

      // Update master plan counts
      const [carCount, shopCountResult] = await Promise.all([
        tx.masterPlanCommitment.count({ where: { masterPlanId } }),
        tx.masterPlanCommitment.groupBy({ by: ['shopId'], where: { masterPlanId } }),
      ]);

      await tx.masterPlan.update({
        where: { id: masterPlanId },
        data: { carCount, shopCount: shopCountResult.length },
      });

      return commitment;
    });

    return {
      id: result.id,
      carId: result.carId,
      shopId: result.shopId,
      customerId: result.customerId,
      plannedMonth: result.plannedMonth,
      plannedYear: result.plannedYear,
      status: result.status,
      workType: result.workType,
      shopReason: result.shopReason,
      estimatedCost: result.estimatedCost,
      priority: result.priority,
      notes: result.notes,
      confirmedByShop: result.confirmedByShop,
      confirmedByCustomer: result.confirmedByCustomer,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    };
  }

  /**
   * Update an existing commitment
   */
  async updateCommitment(
    commitmentId: string,
    companyId: string,
    updates: UpdateCommitmentInput
  ): Promise<CommitmentResult | null> {
    const result = await this.prisma.$transaction(async (tx) => {
      // Find the commitment
      const existing = await tx.masterPlanCommitment.findFirst({
        where: { id: commitmentId, companyId },
      });

      if (!existing) return null;

      // Prepare update data
      const updateData: any = {};
      if (updates.shopId !== undefined) updateData.shopId = updates.shopId;
      if (updates.plannedMonth !== undefined) updateData.plannedMonth = updates.plannedMonth;
      if (updates.plannedYear !== undefined) updateData.plannedYear = updates.plannedYear;
      if (updates.workType !== undefined) updateData.workType = updates.workType;
      if (updates.shopReason !== undefined) updateData.shopReason = updates.shopReason;
      if (updates.estimatedCost !== undefined) updateData.estimatedCost = updates.estimatedCost;
      if (updates.priority !== undefined) updateData.priority = updates.priority;
      if (updates.notes !== undefined) updateData.notes = updates.notes;
      if (updates.confirmedByShop !== undefined) updateData.confirmedByShop = updates.confirmedByShop;
      if (updates.confirmedByCustomer !== undefined) updateData.confirmedByCustomer = updates.confirmedByCustomer;
      if (updates.scheduledArrivalDate !== undefined) updateData.scheduledArrivalDate = updates.scheduledArrivalDate;
      if (updates.scheduledCompletionDate !== undefined) updateData.scheduledCompletionDate = updates.scheduledCompletionDate;
      if (updates.actualArrivalDate !== undefined) updateData.actualArrivalDate = updates.actualArrivalDate;
      if (updates.actualCompletionDate !== undefined) updateData.actualCompletionDate = updates.actualCompletionDate;
      if (updates.executionNotes !== undefined) updateData.executionNotes = updates.executionNotes;

      // Handle status update
      if (updates.status !== undefined) {
        updateData.status = mapToCommitmentStatus(updates.status);

        // Set scheduledAt when moving to SCHEDULED
        if (updateData.status === 'SCHEDULED' && existing.status !== 'SCHEDULED') {
          updateData.scheduledAt = new Date();
        }
      }

      // Update MasterPlanCommitment
      const updated = await tx.masterPlanCommitment.update({
        where: { id: commitmentId },
        data: updateData,
      });

      // Also update CarFlowPlan for backward compatibility
      try {
        const cfpUpdateData: any = {};
        if (updates.shopId !== undefined) cfpUpdateData.shopId = updates.shopId;
        if (updates.plannedMonth !== undefined) cfpUpdateData.plannedMonth = updates.plannedMonth;
        if (updates.plannedYear !== undefined) cfpUpdateData.plannedYear = updates.plannedYear;
        if (updates.shopReason !== undefined) cfpUpdateData.shopReason = updates.shopReason;
        if (updates.estimatedCost !== undefined) cfpUpdateData.estimatedCost = updates.estimatedCost;
        if (updates.priority !== undefined) cfpUpdateData.priority = updates.priority;
        if (updates.notes !== undefined) cfpUpdateData.notes = updates.notes;
        if (updates.status !== undefined) cfpUpdateData.status = mapToLegacyStatus(mapToCommitmentStatus(updates.status));

        await tx.carFlowPlan.updateMany({
          where: { carId: existing.carId, companyId },
          data: cfpUpdateData,
        });
      } catch (err) {
        // Ignore errors on legacy table update
        console.warn('Failed to update CarFlowPlan (legacy):', err);
      }

      return updated;
    });

    if (!result) return null;

    return {
      id: result.id,
      carId: result.carId,
      shopId: result.shopId,
      customerId: result.customerId,
      plannedMonth: result.plannedMonth,
      plannedYear: result.plannedYear,
      status: result.status,
      workType: result.workType,
      shopReason: result.shopReason,
      estimatedCost: result.estimatedCost,
      priority: result.priority,
      notes: result.notes,
      confirmedByShop: result.confirmedByShop,
      confirmedByCustomer: result.confirmedByCustomer,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    };
  }

  /**
   * Cancel a commitment (soft delete)
   */
  async cancelCommitment(
    commitmentId: string,
    companyId: string,
    cancelledById: string,
    reason?: string
  ): Promise<boolean> {
    const result = await this.prisma.$transaction(async (tx) => {
      // Find the commitment
      const existing = await tx.masterPlanCommitment.findFirst({
        where: { id: commitmentId, companyId },
      });

      if (!existing) return false;

      // Update MasterPlanCommitment
      await tx.masterPlanCommitment.update({
        where: { id: commitmentId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledById,
          cancellationReason: reason || '',
        },
      });

      // Also update CarFlowPlan for backward compatibility
      await tx.carFlowPlan.updateMany({
        where: { carId: existing.carId, companyId },
        data: {
          status: 'Cancelled',
          cancelledAt: new Date(),
        },
      });

      return true;
    });

    return result;
  }

  /**
   * Get all commitments for a company
   * Reads from MasterPlanCommitment (new primary source)
   */
  async getCommitments(
    companyId: string,
    filters?: {
      status?: string | string[];
      shopId?: string;
      customerId?: string;
      plannedYear?: number;
      plannedMonth?: number;
      workType?: string;
    }
  ): Promise<CommitmentResult[]> {
    const where: any = { companyId };

    if (filters?.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      where.status = { in: statuses.map(mapToCommitmentStatus) };
    }
    if (filters?.shopId) where.shopId = filters.shopId;
    if (filters?.customerId) where.customerId = filters.customerId;
    if (filters?.plannedYear) where.plannedYear = filters.plannedYear;
    if (filters?.plannedMonth) where.plannedMonth = filters.plannedMonth;
    if (filters?.workType) where.workType = filters.workType;

    // Only get from active master plans
    where.masterPlan = { status: 'ACTIVE' };

    const results = await this.prisma.masterPlanCommitment.findMany({
      where,
      orderBy: [{ plannedYear: 'asc' }, { plannedMonth: 'asc' }],
    });

    return results.map((r) => ({
      id: r.id,
      carId: r.carId,
      shopId: r.shopId,
      customerId: r.customerId,
      plannedMonth: r.plannedMonth,
      plannedYear: r.plannedYear,
      status: r.status,
      workType: r.workType,
      shopReason: r.shopReason,
      estimatedCost: r.estimatedCost,
      priority: r.priority,
      notes: r.notes,
      confirmedByShop: r.confirmedByShop,
      confirmedByCustomer: r.confirmedByCustomer,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  /**
   * Get commitment by car ID
   */
  async getCommitmentByCarId(carId: string, companyId: string): Promise<CommitmentResult | null> {
    const result = await this.prisma.masterPlanCommitment.findFirst({
      where: {
        carId,
        companyId,
        masterPlan: { status: 'ACTIVE' },
        status: { notIn: ['CANCELLED'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!result) return null;

    return {
      id: result.id,
      carId: result.carId,
      shopId: result.shopId,
      customerId: result.customerId,
      plannedMonth: result.plannedMonth,
      plannedYear: result.plannedYear,
      status: result.status,
      workType: result.workType,
      shopReason: result.shopReason,
      estimatedCost: result.estimatedCost,
      priority: result.priority,
      notes: result.notes,
      confirmedByShop: result.confirmedByShop,
      confirmedByCustomer: result.confirmedByCustomer,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    };
  }
}

// Export singleton instance
export const commitmentService = new CommitmentService();
