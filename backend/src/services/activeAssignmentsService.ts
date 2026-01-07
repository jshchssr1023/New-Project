/**
 * Active Assignments Service
 *
 * Provides a unified interface for querying active car-to-shop assignments
 * from both CarFlowPlan and MasterPlanCommitment tables.
 *
 * This service consolidates the dual data sources into a single query interface,
 * making it easier to:
 * - Display all active assignments in one view
 * - Prevent duplicate assignments
 * - Track assignment sources
 */

import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';

export interface ActiveAssignment {
  id: string;
  carId: string;
  shopId: string;
  customerId: string | null;
  plannedMonth: number;
  plannedYear: number;
  scheduledMonth: string; // YYYY-MM format
  status: string;
  priority: number;
  shopReason: string;
  estimatedCost: number | null;
  companyId: string;
  source: string; // csv_import, scenario, manual, master_plan
  sourceTable: 'CarFlowPlan' | 'MasterPlanCommitment';
  createdAt: Date;
  updatedAt: Date;
  // Joined data
  car?: {
    id: string;
    railcarNumber: string;
    carType: string;
    customer: string;
    status: string;
  };
  shop?: {
    id: string;
    name: string;
    code: string;
    region: string;
  };
  customer?: {
    id: string;
    name: string;
    code: string;
  } | null;
}

export interface ActiveAssignmentFilters {
  companyId: string;
  shopId?: string;
  customerId?: string;
  plannedYear?: number;
  plannedMonth?: number;
  status?: string[];
  source?: string[];
}

export class ActiveAssignmentsService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Get all active assignments (combining CarFlowPlan and MasterPlanCommitment)
   * Automatically deduplicates by carId (CarFlowPlan takes precedence)
   */
  async getActiveAssignments(filters: ActiveAssignmentFilters): Promise<ActiveAssignment[]> {
    const { companyId, shopId, customerId, plannedYear, plannedMonth, status, source } = filters;

    // Build where clause for CarFlowPlan
    const cfpWhere: any = {
      companyId,
      status: { in: status || ['Planned', 'In Progress'] },
    };
    if (shopId) cfpWhere.shopId = shopId;
    if (customerId) cfpWhere.customerId = customerId;
    if (plannedYear) cfpWhere.plannedYear = plannedYear;
    if (plannedMonth) cfpWhere.plannedMonth = plannedMonth;
    if (source) cfpWhere.source = { in: source };

    // Query CarFlowPlan
    const carFlowPlans = await this.prisma.carFlowPlan.findMany({
      where: cfpWhere,
      include: {
        car: {
          select: {
            id: true,
            railcarNumber: true,
            carType: true,
            customer: true,
            status: true,
          },
        },
        shop: {
          select: {
            id: true,
            name: true,
            code: true,
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
      orderBy: [{ priority: 'asc' }, { plannedYear: 'asc' }, { plannedMonth: 'asc' }],
    });

    // Convert to unified format
    const assignments: ActiveAssignment[] = carFlowPlans.map((cfp: any) => ({
      id: cfp.id,
      carId: cfp.carId,
      shopId: cfp.shopId,
      customerId: cfp.customerId,
      plannedMonth: cfp.plannedMonth,
      plannedYear: cfp.plannedYear,
      scheduledMonth: `${cfp.plannedYear}-${String(cfp.plannedMonth).padStart(2, '0')}`,
      status: cfp.status,
      priority: cfp.priority,
      shopReason: cfp.shopReason,
      estimatedCost: cfp.estimatedCost,
      companyId: cfp.companyId,
      source: cfp.source || 'csv_import',
      sourceTable: 'CarFlowPlan' as const,
      createdAt: cfp.createdAt,
      updatedAt: cfp.updatedAt,
      car: cfp.car,
      shop: cfp.shop,
      customer: cfp.customer,
    }));

    // Track which cars already have assignments
    const assignedCarIds = new Set(assignments.map((a) => a.carId));

    // Build where clause for MasterPlanCommitment (excluding cars already in CarFlowPlan)
    const mpcStatusMap: Record<string, string[]> = {
      Planned: ['PLANNED'],
      'In Progress': ['IN_PROGRESS'],
      Draft: ['DRAFT'],
    };
    const mpcStatuses = (status || ['Planned', 'In Progress'])
      .flatMap((s) => mpcStatusMap[s] || [s.toUpperCase()]);

    const mpcWhere: any = {
      companyId,
      status: { in: mpcStatuses },
    };
    if (shopId) mpcWhere.shopId = shopId;
    if (customerId) mpcWhere.customerId = customerId;
    if (plannedYear) mpcWhere.plannedYear = plannedYear;
    if (plannedMonth) mpcWhere.plannedMonth = plannedMonth;

    // Query MasterPlanCommitment
    const masterPlanCommitments = await this.prisma.masterPlanCommitment.findMany({
      where: mpcWhere,
      include: {
        car: {
          select: {
            id: true,
            railcarNumber: true,
            carType: true,
            customer: true,
            status: true,
          },
        },
        shop: {
          select: {
            id: true,
            name: true,
            code: true,
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
      orderBy: [{ priority: 'asc' }, { plannedYear: 'asc' }, { plannedMonth: 'asc' }],
    });

    // Add MasterPlanCommitment records that don't have a CarFlowPlan entry
    for (const mpc of masterPlanCommitments) {
      if (!assignedCarIds.has(mpc.carId)) {
        const statusMap: Record<string, string> = {
          PLANNED: 'Planned',
          IN_PROGRESS: 'In Progress',
          DRAFT: 'Draft',
          COMPLETE: 'Complete',
          CANCELLED: 'Cancelled',
        };

        assignments.push({
          id: mpc.id,
          carId: mpc.carId,
          shopId: mpc.shopId,
          customerId: mpc.customerId,
          plannedMonth: mpc.plannedMonth,
          plannedYear: mpc.plannedYear,
          scheduledMonth: `${mpc.plannedYear}-${String(mpc.plannedMonth).padStart(2, '0')}`,
          status: statusMap[mpc.status] || mpc.status,
          priority: mpc.priority,
          shopReason: mpc.shopReason,
          estimatedCost: mpc.estimatedCost,
          companyId: mpc.companyId,
          source: mpc.sourceType || 'master_plan',
          sourceTable: 'MasterPlanCommitment',
          createdAt: mpc.createdAt,
          updatedAt: mpc.updatedAt,
          car: mpc.car as any,
          shop: mpc.shop as any,
          customer: mpc.customer as any,
        });
      }
    }

    // Sort combined results
    assignments.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.plannedYear !== b.plannedYear) return a.plannedYear - b.plannedYear;
      return a.plannedMonth - b.plannedMonth;
    });

    return assignments;
  }

  /**
   * Get assignments for a specific shop and month
   */
  async getShopMonthAssignments(
    companyId: string,
    shopId: string,
    year: number,
    month: number
  ): Promise<ActiveAssignment[]> {
    return this.getActiveAssignments({
      companyId,
      shopId,
      plannedYear: year,
      plannedMonth: month,
    });
  }

  /**
   * Get assignments for a specific customer
   */
  async getCustomerAssignments(companyId: string, customerId: string): Promise<ActiveAssignment[]> {
    return this.getActiveAssignments({
      companyId,
      customerId,
    });
  }

  /**
   * Check if a car already has an active assignment
   */
  async hasActiveAssignment(carId: string): Promise<boolean> {
    const cfp = await this.prisma.carFlowPlan.findUnique({
      where: { carId },
      select: { status: true },
    });

    if (cfp && ['Planned', 'In Progress'].includes(cfp.status)) {
      return true;
    }

    // Also check MasterPlanCommitment
    const mpc = await this.prisma.masterPlanCommitment.findFirst({
      where: {
        carId,
        status: { in: ['PLANNED', 'IN_PROGRESS'] },
      },
      select: { id: true },
    });

    return !!mpc;
  }

  /**
   * Get summary statistics for active assignments
   */
  async getAssignmentStats(companyId: string): Promise<{
    total: number;
    byStatus: Record<string, number>;
    bySource: Record<string, number>;
    byMonth: Record<string, number>;
  }> {
    const assignments = await this.getActiveAssignments({ companyId });

    const byStatus: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const byMonth: Record<string, number> = {};

    for (const a of assignments) {
      byStatus[a.status] = (byStatus[a.status] || 0) + 1;
      bySource[a.source] = (bySource[a.source] || 0) + 1;
      byMonth[a.scheduledMonth] = (byMonth[a.scheduledMonth] || 0) + 1;
    }

    return {
      total: assignments.length,
      byStatus,
      bySource,
      byMonth,
    };
  }
}

export function createActiveAssignmentsService(prisma: PrismaClient): ActiveAssignmentsService {
  return new ActiveAssignmentsService(prisma);
}

export default ActiveAssignmentsService;
