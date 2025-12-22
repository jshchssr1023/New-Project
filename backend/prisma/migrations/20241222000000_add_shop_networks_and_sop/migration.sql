-- CreateTable: ShopNetwork
-- This table stores 3rd party shop networks for S&OP supply tracking

CREATE TABLE IF NOT EXISTS "ShopNetwork" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',

    -- Network classification
    "isAitxInternal" BOOLEAN NOT NULL DEFAULT 0,
    "networkTier" INTEGER NOT NULL DEFAULT 3,

    -- Capacity and commitment
    "annualTargetVolume" INTEGER NOT NULL DEFAULT 0,
    "annualCommittedVolume" INTEGER NOT NULL DEFAULT 0,
    "monthlyBaseCapacity" INTEGER NOT NULL DEFAULT 0,

    -- Financial
    "costIndex" REAL NOT NULL DEFAULT 1.0,
    "hasContractualCommitment" BOOLEAN NOT NULL DEFAULT 0,
    "commitmentPenaltyRate" REAL NOT NULL DEFAULT 0,
    "contractStartDate" DATETIME,
    "contractEndDate" DATETIME,

    -- Contact information
    "contactName" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',

    -- Status
    "isActive" BOOLEAN NOT NULL DEFAULT 1,
    "notes" TEXT NOT NULL DEFAULT '',

    -- Geographic coverage
    "regions" TEXT NOT NULL DEFAULT '[]',

    -- Company ownership
    "companyId" TEXT NOT NULL,

    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,

    CONSTRAINT "ShopNetwork_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex: Unique code per company
CREATE UNIQUE INDEX IF NOT EXISTS "ShopNetwork_code_key" ON "ShopNetwork"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "ShopNetwork_code_companyId_key" ON "ShopNetwork"("code", "companyId");
CREATE INDEX IF NOT EXISTS "ShopNetwork_companyId_idx" ON "ShopNetwork"("companyId");
CREATE INDEX IF NOT EXISTS "ShopNetwork_isActive_idx" ON "ShopNetwork"("isActive");
CREATE INDEX IF NOT EXISTS "ShopNetwork_isAitxInternal_idx" ON "ShopNetwork"("isAitxInternal");

-- AddColumn: Shop.networkId (FK to ShopNetwork)
-- Note: Using ALTER TABLE with SQLite limitations
-- First check if column exists
CREATE TABLE IF NOT EXISTS "_migration_temp" ("done" INTEGER);
INSERT OR IGNORE INTO "_migration_temp" VALUES (1);

-- SQLite doesn't support IF NOT EXISTS for columns, so we use a workaround
-- This will fail silently if column already exists
BEGIN;
SELECT CASE WHEN (SELECT COUNT(*) FROM pragma_table_info('Shop') WHERE name='networkId') = 0
THEN 'ALTER TABLE "Shop" ADD COLUMN "networkId" TEXT' ELSE NULL END;
COMMIT;

-- Actually add the column if it doesn't exist
-- We'll do this conditionally in the next step

-- CreateTable: SOPNetworkCommitment
-- This tracks S&OP commitments at the network level (for 3rd party networks)

CREATE TABLE IF NOT EXISTS "SOPNetworkCommitment" (
    "id" TEXT NOT NULL PRIMARY KEY,

    -- Network reference
    "networkId" TEXT NOT NULL,

    -- Period
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,

    -- Commitment tracking
    "committedVolume" INTEGER NOT NULL DEFAULT 0,
    "actualVolume" INTEGER NOT NULL DEFAULT 0,

    -- Variance tracking
    "variancePercent" REAL NOT NULL DEFAULT 0,
    "isUnderCommitment" BOOLEAN NOT NULL DEFAULT 0,
    "penaltyAmount" REAL NOT NULL DEFAULT 0,

    -- Audit fields
    "notes" TEXT NOT NULL DEFAULT '',
    "companyId" TEXT NOT NULL,

    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,

    CONSTRAINT "SOPNetworkCommitment_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "ShopNetwork" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex: SOPNetworkCommitment
CREATE UNIQUE INDEX IF NOT EXISTS "SOPNetworkCommitment_networkId_year_month_key" ON "SOPNetworkCommitment"("networkId", "year", "month");
CREATE INDEX IF NOT EXISTS "SOPNetworkCommitment_networkId_year_idx" ON "SOPNetworkCommitment"("networkId", "year");
CREATE INDEX IF NOT EXISTS "SOPNetworkCommitment_companyId_year_month_idx" ON "SOPNetworkCommitment"("companyId", "year", "month");

-- CreateTable: SOPCommitment
-- This tracks S&OP supply commitments at the shop level

CREATE TABLE IF NOT EXISTS "SOPCommitment" (
    "id" TEXT NOT NULL PRIMARY KEY,

    -- Shop location (not network/parent)
    "shopId" TEXT NOT NULL,

    -- Period
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,

    -- Committed volume - cars committed to this shop for this month
    "committedVolume" INTEGER NOT NULL DEFAULT 0,

    -- Current usage (updated when CarFlowPlan entries are created/cancelled)
    "currentUsage" INTEGER NOT NULL DEFAULT 0,

    -- Audit fields
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,

    "companyId" TEXT NOT NULL,

    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,

    CONSTRAINT "SOPCommitment_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SOPCommitment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SOPCommitment_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex: SOPCommitment
CREATE UNIQUE INDEX IF NOT EXISTS "SOPCommitment_shopId_year_month_key" ON "SOPCommitment"("shopId", "year", "month");
CREATE INDEX IF NOT EXISTS "SOPCommitment_shopId_year_idx" ON "SOPCommitment"("shopId", "year");
CREATE INDEX IF NOT EXISTS "SOPCommitment_companyId_year_month_idx" ON "SOPCommitment"("companyId", "year", "month");

-- Cleanup temp table
DROP TABLE IF EXISTS "_migration_temp";

-- Add networkId column to Shop table
ALTER TABLE "Shop" ADD COLUMN "networkId" TEXT;
