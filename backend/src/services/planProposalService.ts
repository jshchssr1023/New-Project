/**
 * Plan Proposal Service
 *
 * Handles the customer approval workflow for car service plans:
 * 1. Create proposal from scenario (draft)
 * 2. Send proposal to customer
 * 3. Record customer approval/rejection
 * 4. Convert approved proposals to scheduled CarFlowPlans
 */

import { prisma } from './db';
import { ProposalStatus } from '../types/prismaTypes';

type PrismaClient = typeof prisma;

// =============================================================================
// Types
// =============================================================================

interface CreateProposalInput {
  scenarioId: string;
  customerId: string;
  name: string;
  description?: string;
  createdById: string;
  companyId: string;
  expiresAt?: Date;
}

interface SendProposalInput {
  proposalId: string;
  sentById: string;
  sentToEmail: string;
  sentToName: string;
}

interface RecordApprovalInput {
  proposalId: string;
  approvedBy: string;
  approverEmail?: string;
  approverTitle?: string;
  responseNotes?: string;
}

interface RecordRejectionInput {
  proposalId: string;
  rejectionReason: string;
  responseNotes?: string;
}

interface RequestRevisionInput {
  proposalId: string;
  responseNotes: string;
}

interface ScheduleProposalInput {
  proposalId: string;
  scheduledById: string;
}

interface ProposalFilters {
  companyId: string;
  customerId?: string;
  status?: ProposalStatus | ProposalStatus[];
  sentAfter?: Date;
  sentBefore?: Date;
}

// =============================================================================
// Service Functions
// =============================================================================

/**
 * Generate a unique proposal number
 */
async function generateProposalNumber(companyId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PROP-${year}`;

  // Find the highest proposal number for this year
  const lastProposal = await prisma.planProposal.findFirst({
    where: {
      companyId,
      proposalNumber: {
        startsWith: prefix,
      },
    },
    orderBy: {
      proposalNumber: 'desc',
    },
    select: {
      proposalNumber: true,
    },
  });

  let nextNumber = 1;
  if (lastProposal) {
    const match = lastProposal.proposalNumber.match(/-(\d+)$/);
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1;
    }
  }

  return `${prefix}-${String(nextNumber).padStart(4, '0')}`;
}

/**
 * Create a new proposal from a scenario
 */
export async function createProposal(input: CreateProposalInput) {
  const { scenarioId, customerId, name, description, createdById, companyId, expiresAt } = input;

  // Verify scenario exists and get its data
  const scenario = await prisma.scenario.findUnique({
    where: { id: scenarioId },
    include: {
      cars: {
        include: {
          car: {
            select: {
              id: true,
              railcarNumber: true,
              customer: true,
              customerId: true,
            },
          },
        },
      },
    },
  });

  if (!scenario) {
    throw new Error('Scenario not found');
  }

  // Verify customer exists
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
  });

  if (!customer) {
    throw new Error('Customer not found');
  }

  // Generate proposal number
  const proposalNumber = await generateProposalNumber(companyId);

  // Calculate metrics from scenario
  const carCount = scenario.cars.length;
  const totalEstimatedCost = scenario.cars.reduce((sum, sc) => sum + (sc.estimatedCost || 0), 0);

  // Get unique shops
  const shopIds = [...new Set(scenario.cars.filter((sc) => sc.shopId).map((sc) => sc.shopId))];
  const shopCount = shopIds.length;

  // Calculate planning horizon
  const months = scenario.cars.map((sc) => ({
    year: sc.plannedYear,
    month: sc.plannedMonth,
  }));
  const sortedMonths = months.sort((a, b) => a.year - b.year || a.month - b.month);
  const planningHorizonStart =
    sortedMonths.length > 0
      ? new Date(sortedMonths[0].year, sortedMonths[0].month - 1, 1)
      : null;
  const planningHorizonEnd =
    sortedMonths.length > 0
      ? new Date(
          sortedMonths[sortedMonths.length - 1].year,
          sortedMonths[sortedMonths.length - 1].month - 1,
          1
        )
      : null;

  // Create the proposal
  const proposal = await prisma.planProposal.create({
    data: {
      proposalNumber,
      name,
      description: description || '',
      customerId,
      sourceScenarioId: scenarioId,
      status: 'DRAFT',
      version: 1,
      carCount,
      totalEstimatedCost,
      planningHorizonStart,
      planningHorizonEnd,
      shopCount,
      expiresAt,
      createdById,
      companyId,
    },
    include: {
      customer: true,
      sourceScenario: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
    },
  });

  return proposal;
}

/**
 * Send a proposal to the customer
 */
export async function sendProposal(input: SendProposalInput) {
  const { proposalId, sentById, sentToEmail, sentToName } = input;

  const proposal = await prisma.planProposal.findUnique({
    where: { id: proposalId },
    include: {
      sourceScenario: {
        include: {
          cars: {
            include: {
              car: {
                select: {
                  id: true,
                  railcarNumber: true,
                  carType: true,
                  commodity: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!proposal) {
    throw new Error('Proposal not found');
  }

  if (proposal.status !== 'DRAFT') {
    throw new Error('Only draft proposals can be sent');
  }

  // Create a snapshot of the proposal content
  const proposalSnapshot = JSON.stringify({
    cars: proposal.sourceScenario?.cars.map((sc) => ({
      carId: sc.carId,
      railcarNumber: sc.car.railcarNumber,
      carType: sc.car.carType,
      commodity: sc.car.commodity,
      shopId: sc.shopId,
      plannedMonth: sc.plannedMonth,
      plannedYear: sc.plannedYear,
      estimatedCost: sc.estimatedCost,
      shopReason: sc.shopReason,
    })),
    generatedAt: new Date().toISOString(),
  });

  const updatedProposal = await prisma.planProposal.update({
    where: { id: proposalId },
    data: {
      status: 'SENT',
      sentAt: new Date(),
      sentById,
      sentToEmail,
      sentToName,
      proposalSnapshot,
    },
    include: {
      customer: true,
      sourceScenario: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
    },
  });

  return updatedProposal;
}

/**
 * Record customer approval
 */
export async function recordApproval(input: RecordApprovalInput) {
  const { proposalId, approvedBy, approverEmail, approverTitle, responseNotes } = input;

  const proposal = await prisma.planProposal.findUnique({
    where: { id: proposalId },
  });

  if (!proposal) {
    throw new Error('Proposal not found');
  }

  if (proposal.status !== 'SENT') {
    throw new Error('Only sent proposals can be approved');
  }

  const updatedProposal = await prisma.planProposal.update({
    where: { id: proposalId },
    data: {
      status: 'CUSTOMER_APPROVED',
      respondedAt: new Date(),
      approvedBy,
      approverEmail: approverEmail || '',
      approverTitle: approverTitle || '',
      responseNotes: responseNotes || '',
    },
    include: {
      customer: true,
      sourceScenario: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
    },
  });

  return updatedProposal;
}

/**
 * Record customer rejection
 */
export async function recordRejection(input: RecordRejectionInput) {
  const { proposalId, rejectionReason, responseNotes } = input;

  const proposal = await prisma.planProposal.findUnique({
    where: { id: proposalId },
  });

  if (!proposal) {
    throw new Error('Proposal not found');
  }

  if (proposal.status !== 'SENT') {
    throw new Error('Only sent proposals can be rejected');
  }

  const updatedProposal = await prisma.planProposal.update({
    where: { id: proposalId },
    data: {
      status: 'CUSTOMER_REJECTED',
      respondedAt: new Date(),
      rejectionReason,
      responseNotes: responseNotes || '',
    },
    include: {
      customer: true,
      sourceScenario: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
    },
  });

  return updatedProposal;
}

/**
 * Record customer revision request
 */
export async function requestRevision(input: RequestRevisionInput) {
  const { proposalId, responseNotes } = input;

  const proposal = await prisma.planProposal.findUnique({
    where: { id: proposalId },
  });

  if (!proposal) {
    throw new Error('Proposal not found');
  }

  if (proposal.status !== 'SENT') {
    throw new Error('Only sent proposals can have revisions requested');
  }

  const updatedProposal = await prisma.planProposal.update({
    where: { id: proposalId },
    data: {
      status: 'REVISION_REQUESTED',
      respondedAt: new Date(),
      responseNotes,
    },
    include: {
      customer: true,
      sourceScenario: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
    },
  });

  return updatedProposal;
}

/**
 * Create a revised version of a proposal
 */
export async function createRevision(proposalId: string, createdById: string) {
  const originalProposal = await prisma.planProposal.findUnique({
    where: { id: proposalId },
    include: {
      sourceScenario: true,
    },
  });

  if (!originalProposal) {
    throw new Error('Original proposal not found');
  }

  if (originalProposal.status !== 'REVISION_REQUESTED') {
    throw new Error('Only proposals with revision requested can be revised');
  }

  // Generate new proposal number
  const proposalNumber = await generateProposalNumber(originalProposal.companyId);

  // Create the revised proposal
  const revisedProposal = await prisma.planProposal.create({
    data: {
      proposalNumber,
      name: `${originalProposal.name} (Rev ${originalProposal.version + 1})`,
      description: originalProposal.description,
      customerId: originalProposal.customerId,
      sourceScenarioId: originalProposal.sourceScenarioId,
      status: 'DRAFT',
      version: originalProposal.version + 1,
      parentProposalId: originalProposal.id,
      carCount: originalProposal.carCount,
      totalEstimatedCost: originalProposal.totalEstimatedCost,
      planningHorizonStart: originalProposal.planningHorizonStart,
      planningHorizonEnd: originalProposal.planningHorizonEnd,
      shopCount: originalProposal.shopCount,
      createdById,
      companyId: originalProposal.companyId,
    },
    include: {
      customer: true,
      sourceScenario: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
      parentProposal: true,
    },
  });

  return revisedProposal;
}

/**
 * Schedule an approved proposal - converts to CarFlowPlans
 */
export async function scheduleProposal(input: ScheduleProposalInput) {
  const { proposalId, scheduledById } = input;

  const proposal = await prisma.planProposal.findUnique({
    where: { id: proposalId },
    include: {
      sourceScenario: {
        include: {
          cars: {
            include: {
              car: true,
            },
          },
        },
      },
      customer: true,
    },
  });

  if (!proposal) {
    throw new Error('Proposal not found');
  }

  if (proposal.status !== 'CUSTOMER_APPROVED') {
    throw new Error('Only approved proposals can be scheduled');
  }

  // Get the scenario cars to create CarFlowPlans
  const scenarioCars = proposal.sourceScenario?.cars || [];

  if (scenarioCars.length === 0) {
    throw new Error('No cars in the proposal to schedule');
  }

  // SST: Create UnifiedAssignment records for each car in the scenario
  // UnifiedAssignment is the single source of truth for all assignments
  const unifiedAssignments = await prisma.$transaction(async (tx) => {
    const assignments = [];

    for (const scenarioCar of scenarioCars) {
      if (!scenarioCar.shopId) {
        continue; // Skip cars without shop assignment
      }

      // Check if car already has an active assignment in UnifiedAssignment
      const existingAssignment = await tx.unifiedAssignment.findFirst({
        where: {
          carId: scenarioCar.carId,
          status: {
            in: ['DRAFT', 'PENDING_REVIEW', 'COMMITTED', 'IN_PROGRESS'],
          },
        },
      });

      if (existingAssignment) {
        // Mark the existing assignment as superseded
        await tx.unifiedAssignment.update({
          where: { id: existingAssignment.id },
          data: {
            status: 'SUPERSEDED',
            notes: `Superseded by proposal ${proposal.proposalNumber}`,
          },
        });
      }

      // SST: Create UnifiedAssignment (single source of truth)
      const assignment = await tx.unifiedAssignment.create({
        data: {
          carId: scenarioCar.carId,
          shopId: scenarioCar.shopId,
          customerId: proposal.customerId,
          plannedMonth: scenarioCar.plannedMonth,
          plannedYear: scenarioCar.plannedYear,
          scheduledMonth: `${scenarioCar.plannedYear}-${String(scenarioCar.plannedMonth).padStart(2, '0')}`,
          status: 'COMMITTED', // Customer approved proposals are committed
          sourceType: 'proposal',
          workType: 'full_qualification',
          shopReason: scenarioCar.shopReason || '',
          estimatedCost: scenarioCar.estimatedCost,
          priority: 3,
          committedById: scheduledById,
          committedAt: new Date(),
          companyId: proposal.companyId,
          notes: `Created from proposal ${proposal.proposalNumber}`,
        },
      });

      assignments.push(assignment);

      // Update car's shopping status to Planned
      await tx.car.update({
        where: { id: scenarioCar.carId },
        data: {
          shoppingStatus: 'Planned',
        },
      });
    }

    // Update the proposal status
    await tx.planProposal.update({
      where: { id: proposalId },
      data: {
        status: 'SCHEDULED',
        scheduledAt: new Date(),
        scheduledById,
      },
    });

    // Update the scenario status to confirmed
    await tx.scenario.update({
      where: { id: proposal.sourceScenarioId },
      data: {
        status: 'confirmed',
        confirmedAt: new Date(),
      },
    });

    return assignments;
  });

  return {
    proposal: await prisma.planProposal.findUnique({
      where: { id: proposalId },
      include: {
        customer: true,
        sourceScenario: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
    }),
    assignmentsCreated: unifiedAssignments.length,
    // Legacy field for backward compatibility
    carFlowPlansCreated: unifiedAssignments.length,
  };
}

/**
 * Get a single proposal by ID
 */
export async function getProposal(proposalId: string) {
  return prisma.planProposal.findUnique({
    where: { id: proposalId },
    include: {
      customer: true,
      sourceScenario: {
        include: {
          cars: {
            include: {
              car: {
                select: {
                  id: true,
                  railcarNumber: true,
                  carType: true,
                  commodity: true,
                  customer: true,
                },
              },
            },
          },
        },
      },
      parentProposal: true,
      childProposals: true,
    },
  });
}

/**
 * List proposals with filters
 */
export async function listProposals(filters: ProposalFilters) {
  const { companyId, customerId, status, sentAfter, sentBefore } = filters;

  const where: Record<string, unknown> = { companyId };

  if (customerId) {
    where.customerId = customerId;
  }

  if (status) {
    if (Array.isArray(status)) {
      where.status = { in: status };
    } else {
      where.status = status;
    }
  }

  if (sentAfter || sentBefore) {
    where.sentAt = {};
    if (sentAfter) {
      (where.sentAt as Record<string, Date>).gte = sentAfter;
    }
    if (sentBefore) {
      (where.sentAt as Record<string, Date>).lte = sentBefore;
    }
  }

  return prisma.planProposal.findMany({
    where,
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          code: true,
          contactEmail: true,
          contactName: true,
        },
      },
      sourceScenario: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

/**
 * Get scheduling queue - approved proposals awaiting scheduling
 */
export async function getSchedulingQueue(companyId: string) {
  return prisma.planProposal.findMany({
    where: {
      companyId,
      status: 'CUSTOMER_APPROVED',
    },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          code: true,
          contactEmail: true,
          contactName: true,
        },
      },
      sourceScenario: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
    },
    orderBy: [{ respondedAt: 'asc' }, { createdAt: 'asc' }],
  });
}

/**
 * Cancel a proposal
 */
export async function cancelProposal(proposalId: string) {
  const proposal = await prisma.planProposal.findUnique({
    where: { id: proposalId },
  });

  if (!proposal) {
    throw new Error('Proposal not found');
  }

  if (proposal.status === 'SCHEDULED') {
    throw new Error('Cannot cancel a scheduled proposal');
  }

  return prisma.planProposal.update({
    where: { id: proposalId },
    data: {
      status: 'CANCELLED',
    },
    include: {
      customer: true,
      sourceScenario: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
    },
  });
}

/**
 * Get proposal statistics
 */
export async function getProposalStats(companyId: string) {
  const [total, byStatus] = await Promise.all([
    prisma.planProposal.count({ where: { companyId } }),
    prisma.planProposal.groupBy({
      by: ['status'],
      where: { companyId },
      _count: true,
    }),
  ]);

  const statusCounts = byStatus.reduce(
    (acc, item) => {
      acc[item.status] = item._count;
      return acc;
    },
    {} as Record<string, number>
  );

  return {
    total,
    draft: statusCounts['DRAFT'] || 0,
    sent: statusCounts['SENT'] || 0,
    approved: statusCounts['CUSTOMER_APPROVED'] || 0,
    rejected: statusCounts['CUSTOMER_REJECTED'] || 0,
    revisionRequested: statusCounts['REVISION_REQUESTED'] || 0,
    scheduled: statusCounts['SCHEDULED'] || 0,
    expired: statusCounts['EXPIRED'] || 0,
    cancelled: statusCounts['CANCELLED'] || 0,
    awaitingResponse: statusCounts['SENT'] || 0,
    awaitingScheduling: statusCounts['CUSTOMER_APPROVED'] || 0,
  };
}

export default {
  createProposal,
  sendProposal,
  recordApproval,
  recordRejection,
  requestRevision,
  createRevision,
  scheduleProposal,
  getProposal,
  listProposals,
  getSchedulingQueue,
  cancelProposal,
  getProposalStats,
};
