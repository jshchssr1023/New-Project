-- Data Migration: Convert status string values to enum-compatible format
-- This migration converts values with spaces to values without spaces
-- Run this AFTER the Prisma schema migration to update existing data

-- ============================================================================
-- CAR STATUS MIGRATION
-- Convert old format (with spaces) to new format (PascalCase without spaces)
-- ============================================================================

UPDATE Car SET status = 'ToBeRouted' WHERE status = 'To Be Routed';
UPDATE Car SET status = 'UpMarketed' WHERE status = 'Up Marketed';
-- Already correct: Arrived, Complete, Release, Enroute, Reassigned, Released, Scheduled, Other

-- ============================================================================
-- SHOPPING STATUS MIGRATION
-- Convert old format (with spaces) to new format (PascalCase without spaces)
-- ============================================================================

UPDATE Car SET shoppingStatus = 'InShop' WHERE shoppingStatus = 'In Shop';
UPDATE Car SET shoppingStatus = 'MustShop' WHERE shoppingStatus = 'Must Shop';
-- Already correct: Urgent, Upcoming, Compliant, Planned, Unknown

-- ============================================================================
-- CAR FLOW PLAN STATUS MIGRATION
-- Convert old format to new format
-- ============================================================================

UPDATE CarFlowPlan SET status = 'InProgress' WHERE status = 'In Progress';
-- Already correct: Planned, Complete, Cancelled

-- ============================================================================
-- PLAN STATUS MIGRATION
-- Values are already lowercase: draft, active, completed, archived
-- ============================================================================
-- No changes needed - values match

-- ============================================================================
-- SCENARIO STATUS MIGRATION
-- Values are already lowercase: draft, confirmed, archived
-- ============================================================================
-- No changes needed - values match

-- ============================================================================
-- LEASE CONTRACT STATUS MIGRATION
-- Convert to lowercase with underscore format
-- ============================================================================

UPDATE LeaseContract SET status = 'pending_release' WHERE status = 'pending release';
UPDATE LeaseContract SET status = 'pending_release' WHERE status = 'Pending Release';
UPDATE LeaseContract SET status = 'pending_release' WHERE status = 'PENDING_RELEASE';
-- Already correct if lowercase: active, released, renewed, terminated
