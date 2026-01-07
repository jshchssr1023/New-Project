-- Migration: Add SCHEDULED status and rename return→release terminology
-- This migration:
-- 1. Adds SCHEDULED to CommitmentStatus enum
-- 2. Adds scheduling confirmation fields to MasterPlanCommitment
-- 3. Renames returnCapacity to releaseCapacity in Shop and WeeklyCapacity
-- 4. Renames returnUsed to releaseUsed in WeeklyCapacity
-- 5. Updates work type values from 'return' to 'release' and 'qualification' to 'full_qualification'

-- Note: SQLite doesn't support ALTER TYPE, so we handle enum changes differently
-- For PostgreSQL, uncomment the ALTER TYPE statements below

-- =====================================================================
-- 1. Add SCHEDULED to CommitmentStatus enum (PostgreSQL)
-- =====================================================================
-- ALTER TYPE "CommitmentStatus" ADD VALUE IF NOT EXISTS 'SCHEDULED' AFTER 'PLANNED';

-- =====================================================================
-- 2. Add scheduling confirmation fields to MasterPlanCommitment
-- =====================================================================
ALTER TABLE "MasterPlanCommitment" ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3);
ALTER TABLE "MasterPlanCommitment" ADD COLUMN IF NOT EXISTS "confirmedByShop" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MasterPlanCommitment" ADD COLUMN IF NOT EXISTS "confirmedByCustomer" BOOLEAN NOT NULL DEFAULT false;

-- =====================================================================
-- 3. Rename capacity columns in Shop table
-- =====================================================================
-- Check if column exists before renaming (for idempotency)
ALTER TABLE "Shop" RENAME COLUMN "returnCapacity" TO "releaseCapacity";

-- =====================================================================
-- 4. Rename capacity columns in WeeklyCapacity table
-- =====================================================================
ALTER TABLE "WeeklyCapacity" RENAME COLUMN "returnCapacity" TO "releaseCapacity";
ALTER TABLE "WeeklyCapacity" RENAME COLUMN "returnUsed" TO "releaseUsed";

-- =====================================================================
-- 5. Update work type values in existing data
-- =====================================================================
-- Update MasterPlanCommitment
UPDATE "MasterPlanCommitment" SET "workType" = 'full_qualification' WHERE "workType" = 'qualification';
UPDATE "MasterPlanCommitment" SET "workType" = 'release' WHERE "workType" = 'return';

-- Update UnifiedAssignment
UPDATE "UnifiedAssignment" SET "workType" = 'full_qualification' WHERE "workType" = 'qualification';
UPDATE "UnifiedAssignment" SET "workType" = 'release' WHERE "workType" = 'return';

-- Update CarFlowPlan (if exists)
UPDATE "CarFlowPlan" SET "shopReason" = REPLACE("shopReason", 'return', 'release') WHERE "shopReason" LIKE '%return%';

-- Update LeaseContract
UPDATE "LeaseContract" SET "releaseReason" = 'full_qualification' WHERE "releaseReason" = 'qualification';
UPDATE "LeaseContract" SET "releaseReason" = 'release' WHERE "releaseReason" = 'return';

-- Update AllocationOverride
UPDATE "AllocationOverride" SET "workType" = 'full_qualification' WHERE "workType" = 'qualification';
UPDATE "AllocationOverride" SET "workType" = 'release' WHERE "workType" = 'return';

-- Update ShopCapacitySlot
UPDATE "ShopCapacitySlot" SET "slotType" = 'full_qualification' WHERE "slotType" = 'qualification';
UPDATE "ShopCapacitySlot" SET "slotType" = 'release' WHERE "slotType" = 'return';

-- Update SOPAssignment workTypes JSON
-- Note: This is tricky with JSON - may need application-level migration for complex cases
UPDATE "SOPAssignment" SET "workTypes" = REPLACE("workTypes", '"qualification"', '"full_qualification"');
UPDATE "SOPAssignment" SET "workTypes" = REPLACE("workTypes", '"return"', '"release"');

-- Update LeaseQualificationEntry workTypes JSON
UPDATE "LeaseQualificationEntry" SET "workTypes" = REPLACE("workTypes", '"qualification"', '"full_qualification"');
UPDATE "LeaseQualificationEntry" SET "workTypes" = REPLACE("workTypes", '"return"', '"release"');
