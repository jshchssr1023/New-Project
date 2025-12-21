-- CreateTable: ShopCapabilityProfile
-- This table stores shop capability profiles for the shop-first constraint validation architecture.
-- Each shop declares its capabilities (certifications, physical limits, hazmat restrictions, customer restrictions).

CREATE TABLE "ShopCapabilityProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,

    -- Certifications - What work types this shop can perform
    "canPerformTankLining" BOOLEAN NOT NULL DEFAULT 0,
    "canPerformAnnualQuals" BOOLEAN NOT NULL DEFAULT 0,
    "canPerformRule88B" BOOLEAN NOT NULL DEFAULT 0,
    "canPerformSafetyRelief" BOOLEAN NOT NULL DEFAULT 0,
    "canPerformStubSill" BOOLEAN NOT NULL DEFAULT 0,
    "canPerformTankThickness" BOOLEAN NOT NULL DEFAULT 0,
    "canPerformFullQualification" BOOLEAN NOT NULL DEFAULT 1,
    "canPerformPartialQual" BOOLEAN NOT NULL DEFAULT 1,
    "canPerformRepairs" BOOLEAN NOT NULL DEFAULT 1,
    "canPerformServiceEquipment" BOOLEAN NOT NULL DEFAULT 0,

    -- Physical Limits - What car types/sizes this shop can handle
    "allowedAssetClasses" TEXT NOT NULL DEFAULT '[]',
    "maxCarLength" INTEGER,
    "maxCarWeight" INTEGER,
    "hasJacketedCarSupport" BOOLEAN NOT NULL DEFAULT 1,
    "hasLinedCarSupport" BOOLEAN NOT NULL DEFAULT 1,
    "allowedLiningTypes" TEXT NOT NULL DEFAULT '[]',

    -- Hazardous Material Restrictions
    "hazmatCertifications" TEXT NOT NULL DEFAULT '[]',
    "restrictedCommodities" TEXT NOT NULL DEFAULT '[]',
    "allowedCommodities" TEXT NOT NULL DEFAULT '[]',

    -- Customer Restrictions
    "preferredCustomers" TEXT NOT NULL DEFAULT '[]',
    "excludedCustomers" TEXT NOT NULL DEFAULT '[]',
    "isContractShop" BOOLEAN NOT NULL DEFAULT 0,

    -- Capacity Constraints
    "monthlyCapacity" INTEGER NOT NULL DEFAULT 50,
    "maxConcurrentCars" INTEGER NOT NULL DEFAULT 10,
    "preferredWorkloadMix" TEXT NOT NULL DEFAULT '{}',

    -- 3rd Party Commitment Tracking (for S&OP Supply)
    "hasContractualCommitment" BOOLEAN NOT NULL DEFAULT 0,
    "annualCommittedVolume" INTEGER NOT NULL DEFAULT 0,
    "commitmentPenaltyRate" REAL NOT NULL DEFAULT 0,

    -- Audit Fields
    "companyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,

    CONSTRAINT "ShopCapabilityProfile_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex: Unique constraint on shopId
CREATE UNIQUE INDEX "ShopCapabilityProfile_shopId_key" ON "ShopCapabilityProfile"("shopId");

-- CreateIndex: Index on shopId for lookups
CREATE INDEX "ShopCapabilityProfile_shopId_idx" ON "ShopCapabilityProfile"("shopId");

-- CreateIndex: Index on companyId for multi-tenant filtering
CREATE INDEX "ShopCapabilityProfile_companyId_idx" ON "ShopCapabilityProfile"("companyId");

-- AlterTable: Add Draft Mode (Sandbox) Support to Scenario
-- These columns support the draft scenario workflow where planners can test changes in a sandbox.

ALTER TABLE "Scenario" ADD COLUMN "isDraft" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "Scenario" ADD COLUMN "draftExpiresAt" DATETIME;
ALTER TABLE "Scenario" ADD COLUMN "parentMasterPlanId" TEXT;
ALTER TABLE "Scenario" ADD COLUMN "draftKpiSnapshot" TEXT NOT NULL DEFAULT '{}';
