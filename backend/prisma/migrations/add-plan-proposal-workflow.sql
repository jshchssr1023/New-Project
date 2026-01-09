-- =============================================================================
-- Migration: Add PlanProposal entity for customer approval workflow
-- =============================================================================
-- This migration adds the PlanProposal table which tracks proposals sent to
-- customers for approval. This is the key entity enabling the simplified
-- workflow: Create Plan → Send to Customer → Get Approval → Schedule
-- =============================================================================

-- Create the PlanProposal table
CREATE TABLE IF NOT EXISTS "PlanProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "proposalNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',

    -- Customer reference
    "customerId" TEXT NOT NULL,

    -- Source scenario
    "sourceScenarioId" TEXT NOT NULL,

    -- Status workflow
    "status" TEXT NOT NULL DEFAULT 'DRAFT',

    -- Version tracking
    "version" INTEGER NOT NULL DEFAULT 1,
    "parentProposalId" TEXT,

    -- Communication tracking
    "sentAt" DATETIME,
    "sentById" TEXT,
    "sentToEmail" TEXT NOT NULL DEFAULT '',
    "sentToName" TEXT NOT NULL DEFAULT '',

    -- Customer response
    "respondedAt" DATETIME,
    "approvedBy" TEXT NOT NULL DEFAULT '',
    "approverEmail" TEXT NOT NULL DEFAULT '',
    "approverTitle" TEXT NOT NULL DEFAULT '',
    "responseNotes" TEXT NOT NULL DEFAULT '',
    "rejectionReason" TEXT NOT NULL DEFAULT '',

    -- Scheduling
    "scheduledAt" DATETIME,
    "scheduledById" TEXT,

    -- Summary metrics
    "carCount" INTEGER NOT NULL DEFAULT 0,
    "totalEstimatedCost" REAL NOT NULL DEFAULT 0,
    "planningHorizonStart" DATETIME,
    "planningHorizonEnd" DATETIME,
    "shopCount" INTEGER NOT NULL DEFAULT 0,

    -- Proposal content snapshot
    "proposalSnapshot" TEXT NOT NULL DEFAULT '{}',

    -- PDF generation
    "proposalPdfUrl" TEXT NOT NULL DEFAULT '',
    "proposalPdfGeneratedAt" DATETIME,

    -- Expiration
    "expiresAt" DATETIME,

    -- Audit fields
    "createdById" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Foreign keys
    CONSTRAINT "PlanProposal_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlanProposal_sourceScenarioId_fkey" FOREIGN KEY ("sourceScenarioId") REFERENCES "Scenario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlanProposal_parentProposalId_fkey" FOREIGN KEY ("parentProposalId") REFERENCES "PlanProposal" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlanProposal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Create unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS "PlanProposal_proposalNumber_companyId_key" ON "PlanProposal"("proposalNumber", "companyId");

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS "PlanProposal_customerId_idx" ON "PlanProposal"("customerId");
CREATE INDEX IF NOT EXISTS "PlanProposal_sourceScenarioId_idx" ON "PlanProposal"("sourceScenarioId");
CREATE INDEX IF NOT EXISTS "PlanProposal_status_idx" ON "PlanProposal"("status");
CREATE INDEX IF NOT EXISTS "PlanProposal_companyId_status_idx" ON "PlanProposal"("companyId", "status");
CREATE INDEX IF NOT EXISTS "PlanProposal_companyId_customerId_status_idx" ON "PlanProposal"("companyId", "customerId", "status");
CREATE INDEX IF NOT EXISTS "PlanProposal_sentAt_idx" ON "PlanProposal"("sentAt");
CREATE INDEX IF NOT EXISTS "PlanProposal_expiresAt_idx" ON "PlanProposal"("expiresAt");

-- Add trigger for updatedAt
CREATE TRIGGER IF NOT EXISTS "PlanProposal_updatedAt_trigger"
AFTER UPDATE ON "PlanProposal"
FOR EACH ROW
BEGIN
    UPDATE "PlanProposal" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = NEW."id";
END;
