/**
 * Data Consolidation Migration Script
 *
 * Purpose: Migrate all active CarFlowPlan records into MasterPlanCommitment
 *
 * This script:
 * 1. Creates a new MasterPlan to hold migrated commitments (if none active exists)
 * 2. Migrates each CarFlowPlan record to a MasterPlanCommitment
 * 3. Maps statuses: Planned → PLANNED, In Progress → IN_PROGRESS, Complete → COMPLETE
 * 4. Preserves all metadata and audit trail
 *
 * Run with: npx ts-node prisma/migrations/consolidate-carflowplan-to-masterplan.ts
 */

import { PrismaClient, CommitmentStatus, MasterPlanStatus } from '@prisma/client';

const prisma = new PrismaClient();

// Map CarFlowPlan status to CommitmentStatus
function mapStatus(carFlowPlanStatus: string): CommitmentStatus {
  switch (carFlowPlanStatus.toLowerCase()) {
    case 'planned':
      return 'PLANNED';
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

// Map old workType values to new ones
function mapWorkType(workType: string | null): string {
  if (!workType) return 'full_qualification';
  const lower = workType.toLowerCase();
  if (lower === 'qualification' || lower === 'qual') return 'full_qualification';
  if (lower === 'return') return 'release';
  if (lower.includes('partial')) return 'partial_qualification';
  return workType;
}

async function migrateCarFlowPlans() {
  console.log('Starting CarFlowPlan → MasterPlanCommitment migration...');

  // Get all companies
  const companies = await prisma.company.findMany();

  for (const company of companies) {
    console.log(`\nProcessing company: ${company.name} (${company.id})`);

    // Get or create an active MasterPlan for this company
    let activeMasterPlan = await prisma.masterPlan.findFirst({
      where: {
        companyId: company.id,
        status: 'ACTIVE',
      },
    });

    if (!activeMasterPlan) {
      // Check for any existing master plan
      activeMasterPlan = await prisma.masterPlan.findFirst({
        where: { companyId: company.id },
        orderBy: { createdAt: 'desc' },
      });

      if (!activeMasterPlan) {
        // Create a new master plan for migration
        const now = new Date();
        const planningHorizonStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const planningHorizonEnd = new Date(now.getFullYear() + 1, now.getMonth(), 0);

        activeMasterPlan = await prisma.masterPlan.create({
          data: {
            name: 'Consolidated Master Plan (Migration)',
            description: 'Created during CarFlowPlan consolidation migration',
            version: 1,
            status: 'ACTIVE',
            validFrom: now,
            planningHorizonStart,
            planningHorizonEnd,
            companyId: company.id,
            snapshotTakenAt: now,
            carCount: 0,
            shopCount: 0,
          },
        });
        console.log(`  Created new MasterPlan: ${activeMasterPlan.id}`);
      } else {
        // Activate the existing plan if not active
        if (activeMasterPlan.status !== 'ACTIVE') {
          await prisma.masterPlan.update({
            where: { id: activeMasterPlan.id },
            data: { status: 'ACTIVE' },
          });
        }
      }
    }

    console.log(`  Using MasterPlan: ${activeMasterPlan.id} (${activeMasterPlan.name})`);

    // Get all CarFlowPlan records for this company
    const carFlowPlans = await prisma.carFlowPlan.findMany({
      where: { companyId: company.id },
      include: {
        car: { select: { id: true, railcarNumber: true } },
        shop: { select: { id: true, name: true } },
        customer: { select: { id: true } },
        committedBy: { select: { id: true } },
      },
    });

    console.log(`  Found ${carFlowPlans.length} CarFlowPlan records to migrate`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const cfp of carFlowPlans) {
      try {
        // Check if a commitment already exists for this car in the master plan
        const existingCommitment = await prisma.masterPlanCommitment.findUnique({
          where: {
            masterPlanId_carId: {
              masterPlanId: activeMasterPlan.id,
              carId: cfp.carId,
            },
          },
        });

        if (existingCommitment) {
          console.log(`    Skipping car ${cfp.car.railcarNumber} - commitment already exists`);
          skipped++;
          continue;
        }

        // Create the MasterPlanCommitment
        await prisma.masterPlanCommitment.create({
          data: {
            masterPlanId: activeMasterPlan.id,
            carId: cfp.carId,
            shopId: cfp.shopId,
            customerId: cfp.customerId,

            // Planning period
            plannedMonth: cfp.plannedMonth,
            plannedYear: cfp.plannedYear,

            // Status mapping
            status: mapStatus(cfp.status),

            // Work details
            workType: mapWorkType(cfp.shopReason),
            shopReason: cfp.shopReason || '',

            // Cost and priority
            estimatedCost: cfp.estimatedCost,
            priority: cfp.priority,

            // Source tracking
            sourceType: cfp.sourceScenarioId ? 'scenario' : 'manual',
            sourceScenarioId: cfp.sourceScenarioId,

            // Audit trail
            committedAt: cfp.committedAt,
            committedById: cfp.committedById,
            cancelledAt: cfp.cancelledAt,

            notes: cfp.notes || '',
            companyId: cfp.companyId,

            // Scheduling confirmation (default to false for migrated records)
            confirmedByShop: false,
            confirmedByCustomer: false,
          },
        });

        migrated++;

        if (migrated % 100 === 0) {
          console.log(`    Migrated ${migrated} records...`);
        }
      } catch (err: any) {
        console.error(`    Error migrating car ${cfp.car.railcarNumber}: ${err.message}`);
        errors++;
      }
    }

    // Update master plan counts
    const commitmentCount = await prisma.masterPlanCommitment.count({
      where: { masterPlanId: activeMasterPlan.id },
    });

    const shopCount = await prisma.masterPlanCommitment.groupBy({
      by: ['shopId'],
      where: { masterPlanId: activeMasterPlan.id },
    });

    await prisma.masterPlan.update({
      where: { id: activeMasterPlan.id },
      data: {
        carCount: commitmentCount,
        shopCount: shopCount.length,
      },
    });

    console.log(`  Migration complete: ${migrated} migrated, ${skipped} skipped, ${errors} errors`);
  }

  console.log('\n=== Migration Summary ===');
  const totalCFP = await prisma.carFlowPlan.count();
  const totalMPC = await prisma.masterPlanCommitment.count();
  console.log(`Total CarFlowPlan records: ${totalCFP}`);
  console.log(`Total MasterPlanCommitment records: ${totalMPC}`);
}

async function main() {
  try {
    await migrateCarFlowPlans();
    console.log('\nMigration completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Verify the migrated data in MasterPlanCommitment table');
    console.log('2. Update API routes to use MasterPlanCommitment');
    console.log('3. After verification, CarFlowPlan table can be deprecated');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
