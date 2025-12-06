/**
 * Canonical Schema for Qual Planner Master CSV Import
 *
 * This file defines the authoritative schema derived from the production
 * Qual Planner Master.csv file. All headers, data types, and mappings
 * are defined here and used by the import system.
 *
 * IMPORTANT: This schema was auto-generated from the actual CSV file.
 * Do NOT modify spelling of canonical headers - they match the source system exactly.
 */

// =============================================================================
// CANONICAL HEADERS - Exact headers from the CSV file (preserving misspellings)
// =============================================================================

/**
 * Core car identity and contract fields (columns 1-6)
 */
export const CORE_IDENTITY_HEADERS = [
  'Lessee Name',
  'Car Mark',
  'FMS Lessee Number',
  'Contract',
  'Contract Expiration',
  'Primary Commodity',
] as const;

/**
 * Personnel/Contact fields (columns 7-9)
 */
export const PERSONNEL_HEADERS = [
  'CSR',           // Customer Service Representative
  'CSL',           // Customer Service Lead
  'Commericial',   // NOTE: Misspelled in source - keep as-is
] as const;

/**
 * Region fields (columns 10-11)
 */
export const REGION_HEADERS = [
  'Past Region',
  '2026 Region',
] as const;

/**
 * Tank specification fields (columns 12-18)
 */
export const TANK_SPEC_HEADERS = [
  'Jacketed',
  'Lined',
  'Lining Type',
  'Car Age',
  'Mark',
  'Number',
  'Mark2',
  'Car Type Level 2',
] as const;

/**
 * Tank qualification timing fields (columns 19-28)
 */
export const TANK_QUAL_TIMING_HEADERS = [
  'Min (no lining)',
  'Min w lining',
  'Interior Lining',
  'Rule 88B ',      // NOTE: Has trailing space in source
  'Safety Relief',
  'Service Equipment ',  // NOTE: Has trailing space in source
  'Stub Sill',
  'Tank Thickness',
  'Tank Qualification',
] as const;

/**
 * Portfolio/inventory fields (columns 29-32)
 */
export const PORTFOLIO_HEADERS = [
  'Portfolio',
  'Car',
  'Year',
  'Cars & Year',
] as const;

/**
 * Planning/status fields (columns 33-40)
 */
export const PLANNING_HEADERS = [
  'Full/Partial Qual',
  'Reason Shopped',
  'Perform Tank Qual',
  'Scheduled',
  'Current Status',
  'Adjusted Status',
  'Plan Status',
] as const;

/**
 * Shop columns - each represents a shop location
 * Values in these columns are dates (MM/DD/YYYY) indicating scheduled work
 */
export const SHOP_HEADERS = [
  'AITX Fleet Services of Canada Inc. (Sarnia)',
  'AITX Railcar Services LLC (N Kansas City)',
  'AITX Mini/Mobile Unit 93 (Mounds)',
  'AITX Mobile Headquarters (LaPorte)',
  'AITX Mobile Operations (Houston)',
  'AITX Railcar Services LLC (Brookhaven)',
  'AITX Railcar Services LLC (Bude)',
  'AITX Railcar Services LLC (Longview)',
  'AITX Railcar Services LLC (Tennille)',
  'AITX Repair-KCK MRU (Kansas City)',
  'AITX Repair-Milton, PA MRU',
  'AITX Repair-Sweetwater, TX MRU ',  // NOTE: Trailing space in source
  'Apache Railway - Snowflake AZ (Snowflake)',
  'Blastech Corp (BRANTFORD)',
  'CAD Railway Services (Lachine, Montreal)',
  'CALTRAX, Inc. (Calgary)',
  'CANDO Rail Services (Oakbank)',
  'Cathcart (Amarillo) (Amarillo)',
  'Cathcart (Elk Mills) (Elk Mills)',
  'Cathcart - Hinton (Hinton)',
  'Cathcart (Lynchburg) (Lynchburg)',
  'Cathcart - Kansas City (Kansas City)',
  'Cathcart - Maumee (Maumee)',
  'Cathcart Rail - Hastings (Hastings)',
  'Curry Rail Services - Hollidaysburg PA (Hollidaysburg)',
  'Curry Rail Services Hockley (Hockley)',
  'Curry Rail Services Shoshoni (Shoshoni)',
  'Eagle Railcar (Cairo)',
  'Eagle Railcar (Channelview) (Eastland)',
  'Eagle Railcar (DuBois)',
  'Eagle Railcar (Elkhart)',
  'Eagle Railcar (Fitzgerald)',
  'Eagle Railcar (Gordon)',
  'Eagle Railcar (Junction City)',
  'Eagle Railcar (Longview)',
  'Eagle Railcar-Georgetown/Orange (Georgetown)',
  'Eagle Railcar Services (Orange)',
  'Eagle Railcar Services (Roscoe)',
  'Eagle Railcar (Washington)',
  'Eagle Railcar (Wichita Falls)',
  'Frit Car and Equipment, Inc. (Brewton)',
  'Frit Car and Equipment, Inc. (Bridgeton)',
  'Greenbrier Repair & Services (Cleburne)',
  'Greenbrier Repair & Services (Finley)',
  'Greenbrier Repair-Central (Marmaduke)',
  'Greenbrier Rail Services (Omaha, NE)',
  'H.C. Chandler and Son, Inc. (Plantersville)',
  'Iron Horse Rail Services (Beaumont)',
  'KRS Katahdin Railcar Services  (Bangor)',  // NOTE: Double space in source
  'Midwest Railcar Repair, Inc. (Brandon (Corson))',
  'PSC Repair (Beaumont, TX)',
  'Procor Limited (N. Van)',
  'Procor Limited (Joffre)',
  'Procor Limited (Sarnia)',
  'Procor - Transmark (Lethbridge, AB)',
  'Rescar (Savanna, IL)',
  'TLC Rail Services/Inserv-Wright City (Wright City, OK)',
  'TMC Engineering Services (Houston, TX)',
  'TNT Repair Services (Longview)',
  'Transco (Texarkana)',
  'Transco Rail (Sayre)',
  'Transco Railway (Oelwein)',
  'Transco Railway Products, Inc. (Miles City)',
  'Transco-Sheldon, TX (Houston)',
  'Transitech, Inc. (Fordyce)',
  'Trinity Industries, Inc. (Ft. Worth)',
  'Trinity Industries, Inc. (Saginaw)',
  'Trinity Rail Services (Shell Rock, IA)',
  'Trinity Rail - Sunray (Sunray, TX)',
  'Red River Coatings (Nash, TX)',
  'Rescar #380 (Deer Park)',
  'Texana Midway Tank Cleaning (Texarkana, TX)',
  'VLS RECOVERY SERVICES  - Hockley (hockley)',  // NOTE: Double space in source
  'Column1',  // Empty placeholder column - ignore
] as const;

// =============================================================================
// COMPLETE CANONICAL HEADER LIST
// =============================================================================

export const ALL_CANONICAL_HEADERS = [
  ...CORE_IDENTITY_HEADERS,
  ...PERSONNEL_HEADERS,
  ...REGION_HEADERS,
  ...TANK_SPEC_HEADERS,
  ...TANK_QUAL_TIMING_HEADERS,
  ...PORTFOLIO_HEADERS,
  ...PLANNING_HEADERS,
  ...SHOP_HEADERS,
] as const;

// Total expected columns: 95 (excluding trailing empty Column1)
export const EXPECTED_COLUMN_COUNT = ALL_CANONICAL_HEADERS.length;

// =============================================================================
// REQUIRED VS OPTIONAL FIELDS
// =============================================================================

/**
 * Required fields - import will fail if these are missing
 * Rationale: These are essential for car identity and cannot be derived
 */
export const REQUIRED_HEADERS = [
  'Car Mark',           // Primary identifier (unique key)
  'Lessee Name',        // Customer/owner - critical for planning
] as const;

/**
 * Key planning fields - import will warn if missing but continue
 * Rationale: Important for planning logic but may have valid empty values
 */
export const KEY_PLANNING_HEADERS = [
  'Contract',
  'Contract Expiration',
  'Primary Commodity',
  'Current Status',
  'Plan Status',
  'Full/Partial Qual',
  'Reason Shopped',
] as const;

/**
 * Optional fields - ignored if missing
 * All shop columns and auxiliary fields
 */
export const OPTIONAL_HEADERS = [
  ...PERSONNEL_HEADERS,
  ...REGION_HEADERS,
  ...TANK_SPEC_HEADERS.filter(h => h !== 'Car Type Level 2'),
  ...TANK_QUAL_TIMING_HEADERS,
  ...PORTFOLIO_HEADERS,
  ...SHOP_HEADERS,
] as const;

// =============================================================================
// HEADER NORMALIZATION MAP (Raw -> DB Column Name)
// =============================================================================

/**
 * Maps raw CSV headers to normalized database column names
 * - Converts to snake_case
 * - Removes special characters
 * - Handles leading numbers
 * - Preserves meaning while making SQL-safe
 */
export const HEADER_TO_DB_COLUMN: Record<string, string> = {
  // Core identity
  'Lessee Name': 'lessee_name',
  'Car Mark': 'car_mark',
  'FMS Lessee Number': 'fms_lessee_number',
  'Contract': 'contract_number',
  'Contract Expiration': 'contract_expiration',
  'Primary Commodity': 'primary_commodity',

  // Personnel
  'CSR': 'csr',
  'CSL': 'csl',
  'Commericial': 'commercial',  // Fix spelling in DB column name

  // Region
  'Past Region': 'past_region',
  '2026 Region': 'region_2026',  // Prefix number with descriptive name

  // Tank specs
  'Jacketed': 'is_jacketed',
  'Lined': 'is_lined',
  'Lining Type': 'lining_type',
  'Car Age': 'car_age',
  'Mark': 'mark_prefix',
  'Number': 'car_number',
  'Mark2': 'mark2',
  'Car Type Level 2': 'car_type_level2',

  // Tank qualification timing
  'Min (no lining)': 'min_no_lining',
  'Min w lining': 'min_with_lining',
  'Interior Lining': 'interior_lining',
  'Rule 88B ': 'rule_88b',
  'Safety Relief': 'safety_relief',
  'Service Equipment ': 'service_equipment',
  'Stub Sill': 'stub_sill',
  'Tank Thickness': 'tank_thickness',
  'Tank Qualification': 'tank_qualification',

  // Portfolio
  'Portfolio': 'portfolio',
  'Car': 'car_identifier',
  'Year': 'year',
  'Cars & Year': 'cars_and_year',

  // Planning
  'Full/Partial Qual': 'qual_type',
  'Reason Shopped': 'reason_shopped',
  'Perform Tank Qual': 'perform_tank_qual',
  'Scheduled': 'scheduled_status',
  'Current Status': 'current_status',
  'Adjusted Status': 'adjusted_status',
  'Plan Status': 'plan_status',

  // Note: Shop columns are handled separately in shop_scheduled_dates JSONB field
};

// =============================================================================
// DATA TYPE DEFINITIONS
// =============================================================================

export type DataType = 'string' | 'integer' | 'float' | 'boolean' | 'date' | 'year';

/**
 * Data type for each field (for validation and conversion)
 */
export const FIELD_DATA_TYPES: Record<string, DataType> = {
  // String fields (default)
  lessee_name: 'string',
  car_mark: 'string',
  fms_lessee_number: 'string',
  contract_number: 'string',
  primary_commodity: 'string',
  csr: 'string',
  csl: 'string',
  commercial: 'string',
  past_region: 'string',
  region_2026: 'string',
  lining_type: 'string',
  mark_prefix: 'string',
  car_number: 'string',
  mark2: 'string',
  car_type_level2: 'string',
  interior_lining: 'string',
  tank_qualification: 'string',
  portfolio: 'string',
  car_identifier: 'string',
  cars_and_year: 'string',
  qual_type: 'string',
  reason_shopped: 'string',
  scheduled_status: 'string',
  current_status: 'string',
  adjusted_status: 'string',
  plan_status: 'string',

  // Date fields
  contract_expiration: 'date',

  // Boolean fields
  is_jacketed: 'boolean',
  is_lined: 'boolean',
  perform_tank_qual: 'boolean',

  // Integer/Year fields
  car_age: 'integer',
  year: 'year',
  min_no_lining: 'year',
  min_with_lining: 'year',
  rule_88b: 'year',
  safety_relief: 'year',
  service_equipment: 'year',
  stub_sill: 'year',
  tank_thickness: 'year',
};

// =============================================================================
// SHOP NAME TO CODE MAPPING
// =============================================================================

/**
 * Generates a short code from a shop header name
 * Used to create CarShopEligibility records
 */
export function generateShopCode(shopHeader: string): string {
  // Extract location from parentheses if present
  const locationMatch = shopHeader.match(/\(([^)]+)\)\s*$/);
  const location = locationMatch ? locationMatch[1] : '';

  // Get the company prefix
  const companyParts = shopHeader.split(/[-\s]/).slice(0, 2);
  const companyPrefix = companyParts.join('').replace(/[^A-Za-z]/g, '').substring(0, 4).toUpperCase();

  // Get location code
  const locationCode = location.replace(/[^A-Za-z]/g, '').substring(0, 4).toUpperCase();

  return `${companyPrefix}-${locationCode || 'MAIN'}`;
}

/**
 * Complete shop mapping with codes
 */
export const SHOP_CODE_MAP: Record<string, string> = {};
SHOP_HEADERS.forEach(header => {
  if (header !== 'Column1') {
    SHOP_CODE_MAP[header] = generateShopCode(header);
  }
});

// =============================================================================
// PRISMA SCHEMA ADDITION (for reference)
// =============================================================================

/**
 * Prisma model definition to add to schema.prisma
 *
 * model QualPlannerRecord {
 *   id                  String    @id @default(uuid())
 *
 *   // Core Identity (unique key)
 *   carMark             String    // Primary unique identifier
 *
 *   // Lessee/Customer
 *   lesseeName          String
 *   fmsLesseeNumber     String    @default("")
 *
 *   // Contract
 *   contractNumber      String    @default("")
 *   contractExpiration  DateTime?
 *
 *   // Commodity
 *   primaryCommodity    String    @default("")
 *
 *   // Personnel
 *   csr                 String    @default("")
 *   csl                 String    @default("")
 *   commercial          String    @default("")
 *
 *   // Region
 *   pastRegion          String    @default("")
 *   region2026          String    @default("")
 *
 *   // Tank Specs
 *   isJacketed          Boolean   @default(false)
 *   isLined             Boolean   @default(false)
 *   liningType          String    @default("")
 *   carAge              Int?
 *   markPrefix          String    @default("")
 *   carNumber           String    @default("")
 *   mark2               String    @default("")
 *   carTypeLevel2       String    @default("")
 *
 *   // Tank Qualification Timing (years)
 *   minNoLining         Int?
 *   minWithLining       Int?
 *   interiorLining      String    @default("")
 *   rule88b             Int?
 *   safetyRelief        Int?
 *   serviceEquipment    Int?
 *   stubSill            Int?
 *   tankThickness       Int?
 *   tankQualification   String    @default("")
 *
 *   // Portfolio
 *   portfolio           String    @default("")
 *   carIdentifier       String    @default("")
 *   year                Int?
 *   carsAndYear         String    @default("")
 *
 *   // Planning
 *   qualType            String    @default("")  // Full/Partial Qual
 *   reasonShopped       String    @default("")
 *   performTankQual     Boolean   @default(false)
 *   scheduledStatus     String    @default("")
 *   currentStatus       String    @default("")
 *   adjustedStatus      String    @default("")
 *   planStatus          String    @default("")
 *
 *   // Shop Scheduled Dates (JSONB - shop name -> date)
 *   shopScheduledDates  String    @default("{}")  // JSON: { "shopCode": "2025-03-15" }
 *
 *   // Import metadata
 *   importSessionId     String?
 *   importedAt          DateTime  @default(now())
 *   lastUpdatedAt       DateTime  @updatedAt
 *
 *   companyId           String
 *
 *   @@unique([carMark, companyId])
 *   @@index([lesseeName])
 *   @@index([currentStatus])
 *   @@index([companyId])
 * }
 */

// =============================================================================
// POSTGRESQL DDL (for migration to PostgreSQL)
// =============================================================================

export const POSTGRESQL_DDL = `
-- =============================================================================
-- Chronos Qual Planner Record Table
-- PostgreSQL DDL
-- =============================================================================

-- Drop if exists for clean migration
DROP TABLE IF EXISTS chronos_qual_planner CASCADE;
DROP TABLE IF EXISTS chronos_shop_scheduled_work CASCADE;

-- Main Qual Planner Record table
CREATE TABLE chronos_qual_planner (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Core Identity (unique key per company)
    car_mark VARCHAR(50) NOT NULL,

    -- Lessee/Customer
    lessee_name VARCHAR(255) NOT NULL,
    fms_lessee_number VARCHAR(50) DEFAULT '',

    -- Contract
    contract_number VARCHAR(100) DEFAULT '',
    contract_expiration DATE,

    -- Commodity
    primary_commodity VARCHAR(255) DEFAULT '',

    -- Personnel
    csr VARCHAR(100) DEFAULT '',
    csl VARCHAR(100) DEFAULT '',
    commercial VARCHAR(100) DEFAULT '',  -- Note: Source has "Commericial" typo

    -- Region
    past_region VARCHAR(50) DEFAULT '',
    region_2026 VARCHAR(50) DEFAULT '',

    -- Tank Specs
    is_jacketed BOOLEAN DEFAULT FALSE,
    is_lined BOOLEAN DEFAULT FALSE,
    lining_type VARCHAR(100) DEFAULT '',
    car_age INTEGER,
    mark_prefix VARCHAR(20) DEFAULT '',
    car_number VARCHAR(20) DEFAULT '',
    mark2 VARCHAR(20) DEFAULT '',
    car_type_level2 VARCHAR(100) DEFAULT '',

    -- Tank Qualification Timing (years)
    min_no_lining INTEGER,
    min_with_lining INTEGER,
    interior_lining VARCHAR(100) DEFAULT '',
    rule_88b INTEGER,
    safety_relief INTEGER,
    service_equipment INTEGER,
    stub_sill INTEGER,
    tank_thickness INTEGER,
    tank_qualification VARCHAR(100) DEFAULT '',

    -- Portfolio
    portfolio VARCHAR(100) DEFAULT '',
    car_identifier VARCHAR(100) DEFAULT '',
    year INTEGER,
    cars_and_year VARCHAR(100) DEFAULT '',

    -- Planning
    qual_type VARCHAR(50) DEFAULT '',        -- Full/Partial Qual
    reason_shopped VARCHAR(100) DEFAULT '',
    perform_tank_qual BOOLEAN DEFAULT FALSE,
    scheduled_status VARCHAR(50) DEFAULT '',
    current_status VARCHAR(50) DEFAULT '',
    adjusted_status VARCHAR(50) DEFAULT '',
    plan_status VARCHAR(50) DEFAULT '',

    -- Shop Scheduled Dates (JSONB for flexible shop->date mapping)
    shop_scheduled_dates JSONB DEFAULT '{}',

    -- Import metadata
    import_session_id UUID,
    raw_row_data JSONB,                      -- Store original row for debugging
    import_errors JSONB DEFAULT '[]',        -- Any parsing errors/warnings

    -- Timestamps
    imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Multi-tenancy
    company_id UUID NOT NULL,

    -- Constraints
    CONSTRAINT uq_car_mark_company UNIQUE (car_mark, company_id)
);

-- Indexes for common queries
CREATE INDEX idx_qual_planner_lessee ON chronos_qual_planner(lessee_name);
CREATE INDEX idx_qual_planner_status ON chronos_qual_planner(current_status);
CREATE INDEX idx_qual_planner_company ON chronos_qual_planner(company_id);
CREATE INDEX idx_qual_planner_contract_exp ON chronos_qual_planner(contract_expiration);
CREATE INDEX idx_qual_planner_import_session ON chronos_qual_planner(import_session_id);

-- Shop scheduled dates index for JSONB queries
CREATE INDEX idx_qual_planner_shop_dates ON chronos_qual_planner USING GIN (shop_scheduled_dates);

-- Separate table for shop-scheduled work (normalized view)
-- This table is populated by a trigger or during import for easier querying
CREATE TABLE chronos_shop_scheduled_work (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qual_planner_id UUID NOT NULL REFERENCES chronos_qual_planner(id) ON DELETE CASCADE,
    car_mark VARCHAR(50) NOT NULL,
    shop_name VARCHAR(255) NOT NULL,
    shop_code VARCHAR(20) NOT NULL,
    scheduled_date DATE NOT NULL,
    company_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT uq_car_shop_date UNIQUE (car_mark, shop_code, scheduled_date, company_id)
);

CREATE INDEX idx_shop_work_car ON chronos_shop_scheduled_work(car_mark);
CREATE INDEX idx_shop_work_shop ON chronos_shop_scheduled_work(shop_code);
CREATE INDEX idx_shop_work_date ON chronos_shop_scheduled_work(scheduled_date);
CREATE INDEX idx_shop_work_company ON chronos_shop_scheduled_work(company_id);

-- Function to update last_updated_at on update
CREATE OR REPLACE FUNCTION update_last_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_qual_planner_updated
    BEFORE UPDATE ON chronos_qual_planner
    FOR EACH ROW
    EXECUTE FUNCTION update_last_updated_at();

-- Comment on table
COMMENT ON TABLE chronos_qual_planner IS 'Qual Planner Master data imported from production CSV/Excel';
COMMENT ON COLUMN chronos_qual_planner.car_mark IS 'Primary identifier - railcar mark (e.g., SHQX006002)';
COMMENT ON COLUMN chronos_qual_planner.shop_scheduled_dates IS 'JSONB map of shop_code -> scheduled_date for each shop assignment';
COMMENT ON COLUMN chronos_qual_planner.commercial IS 'Commercial contact (source column is misspelled as "Commericial")';
`;

export default {
  ALL_CANONICAL_HEADERS,
  REQUIRED_HEADERS,
  KEY_PLANNING_HEADERS,
  OPTIONAL_HEADERS,
  HEADER_TO_DB_COLUMN,
  FIELD_DATA_TYPES,
  SHOP_HEADERS,
  SHOP_CODE_MAP,
  EXPECTED_COLUMN_COUNT,
  generateShopCode,
  POSTGRESQL_DDL,
};
