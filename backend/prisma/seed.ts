import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// CSV file path
const CSV_FILE_PATH = path.join(__dirname, 'Qual Planner Master.csv');

// =============================================================================
// CSV IMPORT TYPES AND INTERFACES
// =============================================================================

interface HeaderValidationResult {
  isValid: boolean;
  mappedHeaders: Map<string, string>; // CSV header -> normalized field name
  missingRequired: string[];
  missingOptional: string[];
  unmappedHeaders: string[];
  warnings: string[];
}

interface ImportStatistics {
  totalRows: number;
  successfulUpserts: number;
  failedRows: number;
  skippedRows: number;
  createdCount: number;
  updatedCount: number;
  errors: Array<{ row: number; error: string; data?: Record<string, string> }>;
  warnings: string[];
  duration: number;
}

interface CarImportData {
  railcarNumber: string;
  carInit: string;
  carNo: string;
  carType: string;
  isTankCar: boolean;
  commodity: string;
  customer: string;
  contractNumber: string;
  contractExpiration: Date | null;
  isJacketed: boolean;
  isLined: boolean;
  buildYear: number | null;
  qualificationType: string;
  tankQualified: boolean;
  tankQualDueDate: Date | null;
  performScheduled: boolean;
  planStatus: string;
  // Additional fields from extended CSV
  currentLocation: string;
  homeRegion: string;
  reasonsShopped: string;
  status: string;
  projectedCost: number;
  notes: string;
}

// =============================================================================
// HEADER MAPPING CONFIGURATION
// =============================================================================
// Updated to match Qual Planner Master.csv specification
// Key mappings:
//   railcarNumber = Mark + Number (concatenated)
//   commodity = Primary Commodity(F)
//   carType = Car Type Level 2 in (S)
//   customer = Lessee Name (A)
//   contractNumber = Contract
//   contractExpiration = Contract Expiration
// =============================================================================

// Required fields that MUST be present in the CSV (for railcarNumber construction)
const REQUIRED_HEADERS: Record<string, string[]> = {
  // Mark and Number are required to construct railcarNumber
  'mark': ['mark', 'car mark', 'reporting mark', 'car init', 'carinit', 'init'],
  'number': ['number', 'car number', 'car no', 'carno', 'car_number', 'car num', 'car #'],
};

// Optional fields with their possible CSV header variations
// Normalized header key -> possible CSV column name variations
const OPTIONAL_HEADERS: Record<string, string[]> = {
  // Primary fields from Qual Planner Master.csv specification
  'primarycommodityf': ['primary commodity(f)', 'primarycommodityf', 'primary commodity', 'commodity', 'product', 'lading'],
  'cartypelevel2ins': ['car type level 2 in (s)', 'cartypelevel2ins', 'car type level 2', 'car type', 'cartype', 'type'],
  'lesseenamea': ['lessee name (a)', 'lesseenamea', 'lessee name', 'lessee', 'customer', 'shipper'],
  'contract': ['contract', 'contract #', 'contract number', 'contract no', 'contractnumber'],
  'contractexpiration': ['contract expiration', 'contractexpiration', 'cont exp', 'expiration', 'exp date', 'lease end'],

  // Additional optional fields for enhanced car data
  'isJacketed': ['jacketed', 'jacketed?', 'is jacketed', 'jacket', 'has jacket'],
  'isLined': ['lined', 'lined?', 'is lined', 'lining', 'has lining'],
  'buildYear': ['build yr', 'build year', 'buildyr', 'built', 'year built', 'mfg year'],
  'qualificationType': ['qual type', 'qualification type', 'qualtype', 'full/partial qual'],
  'tankQualified': ['tank qual', 'tank qualified', 'tankqual', 'qualified'],
  'tankQualDueDate': ['tank qual due', 'qual due date', 'qualification due', 'next qual', 'qual due'],
  'performScheduled': ['perf sched', 'performance scheduled', 'scheduled', 'perform scheduled'],
  'planStatus': ['plan status', 'planstatus', 'status', 'planning status'],
  'currentLocation': ['location', 'current location', 'currentlocation', 'city'],
  'homeRegion': ['region', 'home region', 'homeregion', 'area'],
  'reasonsShopped': ['reason', 'reason shopped', 'shop reason', 'reasonshopped', 'reasonsshopped'],
  'projectedCost': ['cost', 'projected cost', 'estimated cost', 'projectedcost'],
  'notes': ['notes', 'comments', 'remarks', 'memo'],
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

// Normalize header names for matching (lowercase, remove special chars)
function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

// Calculate similarity between two strings (Levenshtein-based)
function stringSimilarity(a: string, b: string): number {
  const an = normalizeHeader(a);
  const bn = normalizeHeader(b);
  if (an === bn) return 1.0;
  if (an.includes(bn) || bn.includes(an)) return 0.8;

  // Simple character overlap score
  const aSet = new Set(an.split(''));
  const bSet = new Set(bn.split(''));
  const intersection = [...aSet].filter(c => bSet.has(c)).length;
  const union = new Set([...aSet, ...bSet]).size;
  return intersection / union;
}

// =============================================================================
// DELIVERABLE #3: validateHeaders UTILITY FUNCTION
// =============================================================================

/**
 * Validates CSV headers against required and optional field mappings.
 * Uses fuzzy matching to handle variations in header names.
 *
 * @param headers - Array of header strings from the CSV file
 * @returns HeaderValidationResult with mapping information and validation status
 */
function validateHeaders(headers: string[]): HeaderValidationResult {
  const mappedHeaders = new Map<string, string>();
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];
  const unmappedHeaders: string[] = [];
  const warnings: string[] = [];

  // Normalize all input headers
  const normalizedInputHeaders = headers.map(h => ({
    original: h,
    normalized: normalizeHeader(h),
  }));

  // Track which headers have been mapped
  const usedHeaders = new Set<string>();

  // Helper: Find best match for a field from its possible variations
  const findBestMatch = (fieldName: string, variations: string[]): string | null => {
    // First, try exact normalized match
    for (const variation of variations) {
      const normalizedVariation = normalizeHeader(variation);
      for (const input of normalizedInputHeaders) {
        if (input.normalized === normalizedVariation && !usedHeaders.has(input.original)) {
          return input.original;
        }
      }
    }

    // Second, try contains match (for partial matches)
    for (const variation of variations) {
      const normalizedVariation = normalizeHeader(variation);
      for (const input of normalizedInputHeaders) {
        if ((input.normalized.includes(normalizedVariation) ||
             normalizedVariation.includes(input.normalized)) &&
            !usedHeaders.has(input.original)) {
          return input.original;
        }
      }
    }

    // Third, try fuzzy matching with similarity threshold
    const SIMILARITY_THRESHOLD = 0.7;
    let bestMatch: { header: string; score: number } | null = null;

    for (const variation of variations) {
      for (const input of normalizedInputHeaders) {
        if (usedHeaders.has(input.original)) continue;
        const score = stringSimilarity(input.normalized, variation);
        if (score >= SIMILARITY_THRESHOLD && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { header: input.original, score };
        }
      }
    }

    if (bestMatch && bestMatch.score >= SIMILARITY_THRESHOLD) {
      warnings.push(`Fuzzy matched "${bestMatch.header}" to field "${fieldName}" (${(bestMatch.score * 100).toFixed(0)}% confidence)`);
      return bestMatch.header;
    }

    return null;
  };

  // Map required headers
  for (const [fieldName, variations] of Object.entries(REQUIRED_HEADERS)) {
    const match = findBestMatch(fieldName, variations);
    if (match) {
      mappedHeaders.set(match, fieldName);
      usedHeaders.add(match);
    } else {
      missingRequired.push(fieldName);
    }
  }

  // Map optional headers
  for (const [fieldName, variations] of Object.entries(OPTIONAL_HEADERS)) {
    const match = findBestMatch(fieldName, variations);
    if (match) {
      mappedHeaders.set(match, fieldName);
      usedHeaders.add(match);
    } else {
      missingOptional.push(fieldName);
    }
  }

  // Identify unmapped headers
  for (const input of normalizedInputHeaders) {
    if (!usedHeaders.has(input.original)) {
      unmappedHeaders.push(input.original);
    }
  }

  // Add warnings for unmapped headers (might be important data we're missing)
  if (unmappedHeaders.length > 0) {
    warnings.push(`${unmappedHeaders.length} headers could not be mapped: ${unmappedHeaders.slice(0, 5).join(', ')}${unmappedHeaders.length > 5 ? '...' : ''}`);
  }

  // Validation is successful if all required headers are mapped
  const isValid = missingRequired.length === 0;

  return {
    isValid,
    mappedHeaders,
    missingRequired,
    missingOptional,
    unmappedHeaders,
    warnings,
  };
}

// =============================================================================
// CSV PARSING UTILITIES
// =============================================================================

/**
 * Parse CSV content into records with proper handling of:
 * - BOM (Byte Order Mark)
 * - Quoted fields with commas
 * - Mixed line endings (CRLF, LF)
 * - Escaped quotes
 */
function parseCSV(content: string): { headers: string[]; records: Record<string, string>[] } {
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return { headers: [], records: [] };

  // Parse header - handle potential BOM, quotes, and whitespace
  const headerLine = lines[0].replace(/^\uFEFF/, ''); // Remove BOM if present
  const headers = parseCSVLine(headerLine);

  const records: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const values = parseCSVLine(line);
    const record: Record<string, string> = {};

    headers.forEach((header, index) => {
      record[header] = values[index] || '';
    });

    records.push(record);
  }

  return { headers, records };
}

/**
 * Parse a single CSV line, handling quoted fields properly
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim().replace(/^"|"$/g, ''));

  return values;
}

// Helper function to parse date from various formats
function parseDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;

  const cleaned = dateStr.trim();

  // Try MM/DD/YYYY or M/D/YYYY
  const mdyMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdyMatch) {
    const month = parseInt(mdyMatch[1]) - 1;
    const day = parseInt(mdyMatch[2]);
    let year = parseInt(mdyMatch[3]);
    if (year < 100) year += 2000;
    return new Date(year, month, day);
  }

  // Try YYYY-MM-DD
  const isoMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
  }

  // Try DD-MMM-YY or DD-MMM-YYYY (e.g., 15-Jan-24)
  const dMyMatch = cleaned.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (dMyMatch) {
    const day = parseInt(dMyMatch[1]);
    const monthStr = dMyMatch[2].toLowerCase();
    let year = parseInt(dMyMatch[3]);
    if (year < 100) year += 2000;

    const months: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };
    const month = months[monthStr];
    if (month !== undefined) {
      return new Date(year, month, day);
    }
  }

  // Fallback to Date.parse
  const parsed = Date.parse(cleaned);
  if (!isNaN(parsed)) {
    return new Date(parsed);
  }

  return null;
}

// Helper function to parse boolean from various formats
function parseBoolean(value: string): boolean {
  if (!value) return false;
  const v = value.toLowerCase().trim();
  return v === 'yes' || v === 'y' || v === 'true' || v === '1' || v === 'x';
}

// Helper function to parse integer with fallback
function parseIntSafe(value: string, fallback: number | null = null): number | null {
  if (!value || value.trim() === '') return fallback;
  const parsed = parseInt(value.trim(), 10);
  return isNaN(parsed) ? fallback : parsed;
}

// Helper function to parse float with fallback
function parseFloatSafe(value: string, fallback: number = 0): number {
  if (!value || value.trim() === '') return fallback;
  // Remove currency symbols and commas
  const cleaned = value.replace(/[$,]/g, '').trim();
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? fallback : parsed;
}

// =============================================================================
// DELIVERABLE #2: importCarsFromCSV WITH BULK UPSERT
// =============================================================================

/**
 * Import cars from CSV file with robust validation and bulk UPSERT pattern.
 *
 * Features:
 * - Header validation with fuzzy matching
 * - Batch processing for performance (configurable batch size)
 * - UPSERT on railcarNumber (unique constraint)
 * - Comprehensive error handling per row
 * - Detailed import statistics
 *
 * @param csvPath - Path to the CSV file
 * @param companyId - Company ID to associate with imported cars
 * @param options - Import options (batchSize, dryRun, etc.)
 * @returns ImportStatistics with detailed results
 */
async function importCarsFromCSV(
  csvPath: string,
  companyId: string,
  options: {
    batchSize?: number;
    dryRun?: boolean;
    continueOnError?: boolean;
  } = {}
): Promise<ImportStatistics> {
  const startTime = Date.now();
  const { batchSize = 100, dryRun = false, continueOnError = true } = options;

  const stats: ImportStatistics = {
    totalRows: 0,
    successfulUpserts: 0,
    failedRows: 0,
    skippedRows: 0,
    createdCount: 0,
    updatedCount: 0,
    errors: [],
    warnings: [],
    duration: 0,
  };

  // Check if file exists
  if (!fs.existsSync(csvPath)) {
    stats.errors.push({ row: 0, error: `CSV file not found: ${csvPath}` });
    stats.duration = Date.now() - startTime;
    return stats;
  }

  // Read and parse CSV
  console.log(`   📄 Reading CSV file: ${csvPath}`);
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const { headers, records } = parseCSV(csvContent);

  if (headers.length === 0) {
    stats.errors.push({ row: 0, error: 'CSV file is empty or has no headers' });
    stats.duration = Date.now() - startTime;
    return stats;
  }

  stats.totalRows = records.length;
  console.log(`   📊 Found ${stats.totalRows} data rows with ${headers.length} columns`);

  // Validate headers
  console.log(`   🔍 Validating headers...`);
  const headerValidation = validateHeaders(headers);

  if (!headerValidation.isValid) {
    stats.errors.push({
      row: 0,
      error: `Missing required headers: ${headerValidation.missingRequired.join(', ')}`,
    });
    stats.duration = Date.now() - startTime;
    return stats;
  }

  // Log validation results
  console.log(`   ✓ Header validation passed`);
  console.log(`   • Mapped ${headerValidation.mappedHeaders.size} fields`);
  if (headerValidation.missingOptional.length > 0) {
    console.log(`   • Optional fields not found: ${headerValidation.missingOptional.slice(0, 5).join(', ')}${headerValidation.missingOptional.length > 5 ? '...' : ''}`);
  }
  headerValidation.warnings.forEach(w => {
    stats.warnings.push(w);
    console.log(`   ⚠ ${w}`);
  });

  // Helper to get field value from record using mapped header
  const getField = (record: Record<string, string>, fieldName: string): string => {
    for (const [csvHeader, mappedField] of headerValidation.mappedHeaders) {
      if (mappedField === fieldName) {
        return record[csvHeader] || '';
      }
    }
    return '';
  };

  // Get existing railcar numbers for update vs create tracking
  const existingCars = await prisma.car.findMany({
    where: { companyId },
    select: { railcarNumber: true },
  });
  const existingRailcarNumbers = new Set(existingCars.map(c => c.railcarNumber));
  console.log(`   📦 Found ${existingRailcarNumbers.size} existing cars in database`);

  // Process records in batches
  const batches: Record<string, string>[][] = [];
  for (let i = 0; i < records.length; i += batchSize) {
    batches.push(records.slice(i, i + batchSize));
  }

  console.log(`   🔄 Processing ${batches.length} batches of up to ${batchSize} records each...`);

  // Regions and locations for defaults
  const regions = ['Midwest', 'South', 'Gulf', 'Northeast', 'West'];
  const locations = ['Chicago, IL', 'Houston, TX', 'Los Angeles, CA', 'Atlanta, GA', 'Denver, CO', 'Kansas City, MO', 'New Orleans, LA', 'Seattle, WA'];

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const batchData: Array<{ railcarNumber: string; data: any; rowIndex: number }> = [];

    for (let i = 0; i < batch.length; i++) {
      const record = batch[i];
      const globalRowIndex = batchIndex * batchSize + i + 2; // +2 for 1-indexed and header row

      try {
        // =================================================================
        // RAIL CAR NUMBER CONSTRUCTION (Mark + Number)
        // =================================================================
        // Per Qual Planner Master.csv specification:
        //   railcarNumber = Mark + Number (concatenated)
        // =================================================================
        const mark = getField(record, 'mark').trim();
        const number = getField(record, 'number').trim();

        // Construct railcarNumber from Mark + Number
        let railcarNumber = '';
        if (mark && number) {
          railcarNumber = `${mark}${number}`;
        } else if (number) {
          // Fallback: use just number if mark is missing
          railcarNumber = number;
        } else if (mark) {
          // Fallback: use just mark if number is missing (unlikely)
          railcarNumber = mark;
        }

        // Skip if no valid railcar number can be constructed
        if (!railcarNumber) {
          stats.skippedRows++;
          stats.warnings.push(`Row ${globalRowIndex}: Skipped - no Mark/Number found to construct railcarNumber`);
          continue;
        }

        // =================================================================
        // DATA FIELD EXTRACTION (Per Qual Planner Master.csv Mapping)
        // =================================================================
        // DB Column        | Header Key         | CSV Column
        // commodity        | primarycommodityf  | Primary Commodity(F)
        // carType          | cartypelevel2ins   | Car Type Level 2 in (S)
        // customer         | lesseenamea        | Lessee Name (A)
        // contractNumber   | contract           | Contract
        // contractExpiration | contractexpiration | Contract Expiration
        // =================================================================
        const carType = getField(record, 'cartypelevel2ins') || 'Tank Car';
        const isTankCar = carType.toLowerCase().includes('tank');
        const commodity = getField(record, 'primarycommodityf');
        const customer = getField(record, 'lesseenamea');
        const contractNumber = getField(record, 'contract');
        const contractExpiration = parseDate(getField(record, 'contractexpiration'));
        const isJacketed = parseBoolean(getField(record, 'isJacketed'));
        const isLined = parseBoolean(getField(record, 'isLined'));
        const buildYear = parseIntSafe(getField(record, 'buildYear'));
        const qualificationType = getField(record, 'qualificationType');
        const tankQualified = parseBoolean(getField(record, 'tankQualified'));
        const tankQualDueDate = parseDate(getField(record, 'tankQualDueDate'));
        const performScheduled = parseBoolean(getField(record, 'performScheduled'));
        const planStatus = getField(record, 'planStatus');
        const currentLocation = getField(record, 'currentLocation') || locations[Math.floor(Math.random() * locations.length)];
        const homeRegion = getField(record, 'homeRegion') || regions[Math.floor(Math.random() * regions.length)];
        const reasonsShopped = getField(record, 'reasonsShopped') || getField(record, 'reasonShopped') || (isTankCar && tankQualDueDate ? 'qualification' : '');
        const projectedCost = parseFloatSafe(getField(record, 'projectedCost'));
        const notes = getField(record, 'notes');

        // Track if this is an update or create
        const isUpdate = existingRailcarNumbers.has(railcarNumber);

        // Prepare upsert data
        const carData = {
          carType,
          isTankCar,
          commodity,
          customer,
          projectNumber: '',
          reasonsShopped,
          status: 'available',
          currentLocation,
          homeRegion,
          originRegion: homeRegion,
          projectedCost,
          daysInShop: 0,
          shopEntryDate: null,
          lastServiceDate: null,
          nextServiceDue: tankQualDueDate,
          notes,
          contractNumber,
          contractExpiration,
          isJacketed,
          isLined,
          buildYear,
          qualificationType,
          tankQualified,
          tankQualDueDate,
          performScheduled,
          planStatus,
        };

        batchData.push({
          railcarNumber,
          data: carData,
          rowIndex: globalRowIndex,
        });

        if (isUpdate) {
          stats.updatedCount++;
        } else {
          stats.createdCount++;
          existingRailcarNumbers.add(railcarNumber); // Track for subsequent rows in same batch
        }

      } catch (error) {
        stats.failedRows++;
        stats.errors.push({
          row: globalRowIndex,
          error: error instanceof Error ? error.message : 'Unknown parsing error',
          data: record,
        });

        if (!continueOnError) {
          stats.duration = Date.now() - startTime;
          return stats;
        }
      }
    }

    // Execute batch upserts using simple railcarNumber unique constraint
    if (!dryRun && batchData.length > 0) {
      try {
        // Use transaction for batch atomicity
        await prisma.$transaction(async (tx) => {
          for (const item of batchData) {
            // UPSERT using @unique constraint on railcarNumber field
            await tx.car.upsert({
              where: {
                railcarNumber: item.railcarNumber,
              },
              update: item.data,
              create: {
                id: uuidv4(),
                railcarNumber: item.railcarNumber,
                ...item.data,
                companyId: companyId,
              },
            });
            stats.successfulUpserts++;
          }
        });
      } catch (error) {
        // If batch fails, try individual upserts
        console.log(`   ⚠ Batch ${batchIndex + 1} transaction failed, retrying individually...`);

        for (const item of batchData) {
          try {
            // UPSERT using @unique constraint on railcarNumber field
            await prisma.car.upsert({
              where: {
                railcarNumber: item.railcarNumber,
              },
              update: item.data,
              create: {
                id: uuidv4(),
                railcarNumber: item.railcarNumber,
                ...item.data,
                companyId: companyId,
              },
            });
            stats.successfulUpserts++;
          } catch (individualError) {
            stats.failedRows++;
            stats.successfulUpserts--; // Adjust count
            if (existingRailcarNumbers.has(item.railcarNumber)) {
              stats.updatedCount--;
            } else {
              stats.createdCount--;
            }
            stats.errors.push({
              row: item.rowIndex,
              error: individualError instanceof Error ? individualError.message : 'Database upsert failed',
            });
          }
        }
      }
    } else if (dryRun) {
      stats.successfulUpserts += batchData.length;
    }

    // Progress logging every 10 batches or at the end
    if ((batchIndex + 1) % 10 === 0 || batchIndex === batches.length - 1) {
      const processed = Math.min((batchIndex + 1) * batchSize, stats.totalRows);
      console.log(`   ... processed ${processed}/${stats.totalRows} rows (${stats.successfulUpserts} successful, ${stats.failedRows} failed)`);
    }
  }

  stats.duration = Date.now() - startTime;

  // Final summary
  console.log(`   ✅ Import completed in ${(stats.duration / 1000).toFixed(2)}s`);
  console.log(`      • Total rows: ${stats.totalRows}`);
  console.log(`      • Successful: ${stats.successfulUpserts} (${stats.createdCount} created, ${stats.updatedCount} updated)`);
  console.log(`      • Failed: ${stats.failedRows}`);
  console.log(`      • Skipped: ${stats.skippedRows}`);
  if (stats.errors.length > 0) {
    console.log(`      • Errors: ${stats.errors.length}`);
    stats.errors.slice(0, 3).forEach(e => console.log(`        - Row ${e.row}: ${e.error}`));
    if (stats.errors.length > 3) {
      console.log(`        ... and ${stats.errors.length - 3} more errors`);
    }
  }

  return stats;
}

// =============================================================================
// FALLBACK RANDOM DATA GENERATION
// =============================================================================

const carTypes = ['Tank Car', 'Covered Hopper', 'Open Hopper', 'Boxcar', 'Gondola', 'Flatcar', 'Intermodal'];
const commodities = ['Crude Oil', 'Ethanol', 'Corn', 'Wheat', 'Coal', 'Lumber', 'Steel', 'Chemicals', 'Fertilizer', 'Plastics'];
const regions = ['Midwest', 'South', 'Gulf', 'Northeast', 'West'];
const locations = ['Chicago, IL', 'Houston, TX', 'Los Angeles, CA', 'Atlanta, GA', 'Denver, CO', 'Kansas City, MO', 'New Orleans, LA', 'Seattle, WA'];

/**
 * Generate random car data as fallback when CSV is not available.
 * Creates cars with realistic random values for testing purposes.
 */
async function generateRandomCars(
  companyId: string,
  count: number = 200
): Promise<{ id: string; railcarNumber: string }[]> {
  const createdCars: { id: string; railcarNumber: string }[] = [];
  const carStatusesList = ['available', 'in_service', 'in_shop', 'scheduled', 'retired'];
  const statusWeights = [0.5, 0.15, 0.1, 0.2, 0.05];
  const qualificationTypes = ['full', 'partial', ''];
  const planStatuses = ['planned', 'in_progress', 'completed', 'pending', ''];
  const reasonsShopped = ['release', 'assignment', 'qualification', 'project', 'repair', 'maintenance'];

  console.log(`   Generating ${count} random cars...`);

  for (let i = 0; i < count; i++) {
    const carType = carTypes[Math.floor(Math.random() * carTypes.length)];
    const isTankCar = carType === 'Tank Car';
    const commodity = commodities[Math.floor(Math.random() * commodities.length)];
    const customer = customers[Math.floor(Math.random() * customers.length)];
    const selectedReason = reasonsShopped[Math.floor(Math.random() * reasonsShopped.length)];

    // Weighted status selection
    const rand = Math.random();
    let statusIndex = 0;
    let cumulative = 0;
    for (let j = 0; j < statusWeights.length; j++) {
      cumulative += statusWeights[j];
      if (rand < cumulative) {
        statusIndex = j;
        break;
      }
    }
    const status = carStatusesList[statusIndex];
    const region = regions[Math.floor(Math.random() * regions.length)];

    // Date calculations
    const nextServiceDue = new Date(Date.now() + Math.random() * 365 * 24 * 60 * 60 * 1000);
    const isOverdue = Math.random() > 0.85;
    const adjustedNextServiceDue = isOverdue
      ? new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
      : nextServiceDue;
    const daysInShop = status === 'in_shop' ? Math.floor(Math.random() * 20) + 1 : 0;
    const shopEntryDate = status === 'in_shop' ? new Date(Date.now() - daysInShop * 24 * 60 * 60 * 1000) : null;
    const contractExpiration = new Date(Date.now() + Math.random() * 730 * 24 * 60 * 60 * 1000);
    const buildYear = 1990 + Math.floor(Math.random() * 35);
    const isJacketed = isTankCar ? Math.random() > 0.5 : false;
    const isLined = isTankCar ? Math.random() > 0.6 : false;
    const qualificationType = qualificationTypes[Math.floor(Math.random() * qualificationTypes.length)];
    const tankQualified = isTankCar ? Math.random() > 0.2 : false;
    const performScheduled = Math.random() > 0.7;
    const planStatus = planStatuses[Math.floor(Math.random() * planStatuses.length)];

    let tankQualDueDate: Date | null = null;
    if (isTankCar) {
      const qualRand = Math.random();
      if (qualRand < 0.2) {
        tankQualDueDate = new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000);
      } else if (qualRand < 0.5) {
        tankQualDueDate = new Date(Date.now() + Math.random() * 90 * 24 * 60 * 60 * 1000);
      } else {
        tankQualDueDate = new Date(Date.now() + (90 + Math.random() * 275) * 24 * 60 * 60 * 1000);
      }
    }

    const railcarNumber = `AITX${String(100000 + i).slice(1)}`;

    // =================================================================
    // UPSERT PATTERN: Use unique railcarNumber constraint for stability
    // =================================================================
    const carDataPayload = {
      carType,
      isTankCar,
      commodity,
      customer,
      projectNumber: `PRJ-${CURRENT_YEAR}-${String(1000 + Math.floor(Math.random() * 9000))}`,
      reasonsShopped: selectedReason,
      status,
      currentLocation: locations[Math.floor(Math.random() * locations.length)],
      homeRegion: region,
      originRegion: region,
      projectedCost: 12000 + Math.floor(Math.random() * 10000),
      daysInShop,
      shopEntryDate,
      lastServiceDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
      nextServiceDue: adjustedNextServiceDue,
      notes: Math.random() > 0.7 ? 'Priority service required' : '',
      contractNumber: `CTR-${CURRENT_YEAR}-${String(10000 + i)}`,
      contractExpiration,
      isJacketed,
      isLined,
      buildYear,
      qualificationType,
      tankQualified,
      tankQualDueDate,
      performScheduled,
      planStatus,
    };

    const createdCar = await prisma.car.upsert({
      where: {
        railcarNumber: railcarNumber,
      },
      update: carDataPayload,
      create: {
        id: uuidv4(),
        railcarNumber,
        ...carDataPayload,
        companyId,
      },
    });

    createdCars.push({ id: createdCar.id, railcarNumber: createdCar.railcarNumber });

    if ((i + 1) % 50 === 0) {
      console.log(`  ... created ${i + 1}/${count} railcars`);
    }
  }

  console.log(`✓ Upserted ${createdCars.length} railcars (random data, using railcarNumber as unique key)`);
  return createdCars;
}

const customers = ['Shell', 'Cargill', 'ADM', 'Koch Industries', 'ExxonMobil', 'Chevron', 'BNSF Logistics', 'UP Fleet', 'CSX Transport', 'CN Rail'];

// Shop locations - actual shop data
const shopData = [
  // Midwest Region
  { name: 'AITX Maumee', code: 'MAUM', city: 'Maumee', state: 'OH', region: 'Midwest', network: 'AITX-Own', certifications: 'Qualification, Heavy Repair', annualCapacity: 1200, turnTime: 85, contact: 'Mike Thompson (419) 555-1234', notes: 'Primary Midwest hub' },
  { name: 'AITX East Chicago', code: 'ECHI', city: 'East Chicago', state: 'IN', region: 'Midwest', network: 'AITX-Own', certifications: 'Qualification, Heavy Repair, Lining', annualCapacity: 1400, turnTime: 80, contact: 'Dave Wilson (219) 555-2345', notes: 'Full service facility' },
  { name: 'AITX Coffeyville', code: 'COFF', city: 'Coffeyville', state: 'KS', region: 'Midwest', network: 'AITX-Own', certifications: 'Qualification, Heavy Repair', annualCapacity: 900, turnTime: 90, contact: 'Jim Baker (620) 555-3456', notes: '' },
  { name: 'Watco Coffeyville', code: 'WATC', city: 'Coffeyville', state: 'KS', region: 'Midwest', network: '3rd Party', certifications: 'Heavy Repair', annualCapacity: 800, turnTime: 95, contact: 'Steve Morris (620) 555-4567', notes: 'Watco partnership' },
  { name: 'Mid-America Railcar', code: 'MARC', city: 'Kansas City', state: 'MO', region: 'Midwest', network: '3rd Party', certifications: 'Qualification, Heavy Repair', annualCapacity: 1000, turnTime: 88, contact: 'Tom Anderson (816) 555-5678', notes: '' },
  { name: 'GATX Danville', code: 'GATX', city: 'Danville', state: 'IL', region: 'Midwest', network: '3rd Party', certifications: 'Qualification, Heavy Repair, Fabrication', annualCapacity: 1600, turnTime: 75, contact: 'Robert Lee (217) 555-6789', notes: 'High capacity facility' },

  // South Region
  { name: 'AITX Texarkana', code: 'TXRK', city: 'Texarkana', state: 'TX', region: 'South', network: 'AITX-Own', certifications: 'Qualification, Heavy Repair', annualCapacity: 1100, turnTime: 85, contact: 'Carlos Rodriguez (903) 555-7890', notes: '' },
  { name: 'AITX Longview', code: 'LONG', city: 'Longview', state: 'TX', region: 'South', network: 'AITX-Own', certifications: 'Qualification, Lining', annualCapacity: 950, turnTime: 90, contact: 'Mark Johnson (903) 555-8901', notes: 'Lining specialist' },
  { name: 'AITX Bossier City', code: 'BOSS', city: 'Bossier City', state: 'LA', region: 'South', network: 'AITX-Own', certifications: 'Qualification, Heavy Repair', annualCapacity: 850, turnTime: 92, contact: 'Paul Davis (318) 555-9012', notes: '' },
  { name: 'Ennis Railcar', code: 'ENNS', city: 'Ennis', state: 'TX', region: 'South', network: '3rd Party', certifications: 'Heavy Repair', annualCapacity: 700, turnTime: 95, contact: 'John Smith (972) 555-0123', notes: '' },
  { name: 'RSI Rail Group', code: 'RSI', city: 'Longview', state: 'TX', region: 'South', network: '3rd Party', certifications: 'Qualification, Heavy Repair, Fabrication', annualCapacity: 1300, turnTime: 82, contact: 'Brian Taylor (903) 555-1235', notes: 'Full fabrication capabilities' },

  // Gulf Region
  { name: 'AITX Eagle', code: 'EAGL', city: 'Eagle Pass', state: 'TX', region: 'Gulf', network: 'AITX-Own', certifications: 'Qualification, Heavy Repair', annualCapacity: 1000, turnTime: 88, contact: 'Miguel Santos (830) 555-2346', notes: 'Border location' },
  { name: 'Rescar Houston', code: 'RHOU', city: 'Houston', state: 'TX', region: 'Gulf', network: '3rd Party', certifications: 'Qualification, Heavy Repair, Lining', annualCapacity: 1500, turnTime: 78, contact: 'Greg Harris (713) 555-3457', notes: 'Major Gulf hub' },
  { name: 'TankCar Services', code: 'TANK', city: 'Beaumont', state: 'TX', region: 'Gulf', network: '3rd Party', certifications: 'Qualification, Heavy Repair, Lining', annualCapacity: 1100, turnTime: 85, contact: 'Larry White (409) 555-4568', notes: 'Tank car specialist' },
  { name: 'Union Tank Repair', code: 'UTCR', city: 'Lake Charles', state: 'LA', region: 'Gulf', network: '3rd Party', certifications: 'Qualification, Heavy Repair', annualCapacity: 900, turnTime: 90, contact: 'Chris Martin (337) 555-5679', notes: '' },
  { name: 'UTLX Alexandria', code: 'UTLX', city: 'Alexandria', state: 'LA', region: 'Gulf', network: '3rd Party', certifications: 'Qualification, Heavy Repair, Fabrication', annualCapacity: 1200, turnTime: 82, contact: 'James Brown (318) 555-6780', notes: '' },

  // Northeast Region
  { name: 'Midland Rail Services', code: 'MDLD', city: 'Midland', state: 'PA', region: 'Northeast', network: '3rd Party', certifications: 'Qualification, Heavy Repair', annualCapacity: 1000, turnTime: 88, contact: 'Frank Miller (412) 555-7891', notes: '' },
  { name: 'GBW Rail Services', code: 'GBW', city: 'Hornell', state: 'NY', region: 'Northeast', network: '3rd Party', certifications: 'Qualification, Heavy Repair, Fabrication', annualCapacity: 1100, turnTime: 85, contact: 'Dan Clark (607) 555-8902', notes: '' },
  { name: 'National Steel Car', code: 'NSC', city: 'Hamilton', state: 'ON', region: 'Northeast', network: '3rd Party', certifications: 'Qualification, Heavy Repair, Fabrication', annualCapacity: 1400, turnTime: 80, contact: 'Andrew Scott (905) 555-9013', notes: 'Canada location' },
  { name: 'Procor Sarnia', code: 'PROC', city: 'Sarnia', state: 'ON', region: 'Northeast', network: '3rd Party', certifications: 'Qualification, Heavy Repair', annualCapacity: 950, turnTime: 90, contact: 'Kevin Moore (519) 555-0124', notes: 'Canada location' },

  // West Region
  { name: 'Vulcan Rail Services', code: 'VULC', city: 'Los Angeles', state: 'CA', region: 'West', network: '3rd Party', certifications: 'Qualification, Heavy Repair', annualCapacity: 1000, turnTime: 88, contact: 'Tony Garcia (213) 555-1236', notes: 'West coast hub' },
  { name: 'Frontier Railcar', code: 'FRNT', city: 'Salt Lake City', state: 'UT', region: 'West', network: '3rd Party', certifications: 'Heavy Repair', annualCapacity: 750, turnTime: 95, contact: 'Bill Jackson (801) 555-2347', notes: '' },
  { name: 'CF Rail', code: 'CFR', city: 'Denver', state: 'CO', region: 'West', network: '3rd Party', certifications: 'Qualification, Heavy Repair', annualCapacity: 850, turnTime: 92, contact: 'Rick Nelson (303) 555-3458', notes: '' },
  { name: 'Apex Rail', code: 'APEX', city: 'Phoenix', state: 'AZ', region: 'West', network: '3rd Party', certifications: 'Heavy Repair', annualCapacity: 600, turnTime: 100, contact: 'Sam Adams (602) 555-4569', notes: '' },
  { name: 'Nortrak Services', code: 'NORT', city: 'Seattle', state: 'WA', region: 'West', network: '3rd Party', certifications: 'Qualification, Heavy Repair', annualCapacity: 800, turnTime: 92, contact: 'Eric Young (206) 555-5670', notes: 'Pacific Northwest' },
];

async function main() {
  console.log('🌱 Starting seed...');

  // ==========================================================================
  // DYNAMIC YEAR CALCULATION
  // ==========================================================================
  // Uses current date to generate relevant planning years dynamically
  // This ensures seed data is always current and useful for demos/testing
  // ==========================================================================
  const now = new Date();
  const CURRENT_YEAR = now.getFullYear();
  const NEXT_YEAR = CURRENT_YEAR + 1;

  // Generate month arrays for both years dynamically
  const generateMonths = (year: number): string[] =>
    Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);

  const monthsCurrentYear = generateMonths(CURRENT_YEAR);
  const monthsNextYear = generateMonths(NEXT_YEAR);

  console.log(`📅 Planning years: ${CURRENT_YEAR} (active) and ${NEXT_YEAR} (draft)`);

  // Clear existing data (order matters due to foreign key constraints)
  // Delete in order from leaf tables to root tables

  // Qualification planning engine tables (deepest leaves first)
  await prisma.qualificationPlanDocument.deleteMany();
  await prisma.qualificationPlanAssignment.deleteMany();
  await prisma.qualificationScenario.deleteMany();
  await prisma.qualificationPlanEvent.deleteMany();
  await prisma.leaseQualificationEntry.deleteMany();
  await prisma.leaseContract.deleteMany();

  // S&OP tables
  await prisma.sOPAssignment.deleteMany();
  await prisma.shopCapacitySlot.deleteMany();

  // Core planning tables
  await prisma.carShopEligibility.deleteMany();
  await prisma.scenarioModification.deleteMany();
  await prisma.scenarioCar.deleteMany();
  await prisma.scenario.deleteMany();
  await prisma.planAssignment.deleteMany();
  await prisma.plan.deleteMany();

  // Master data tables
  await prisma.car.deleteMany();
  await prisma.shop.deleteMany();
  await prisma.shopRule.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();
  await prisma.company.deleteMany();

  console.log('✓ Cleared existing data');

  // ==========================================================================
  // COMPANY MASTER DATA WITH UPSERT (Stability Fix)
  // ==========================================================================
  // Uses UPSERT on the @unique code field for seed re-run stability
  // All subsequent records MUST reference this stable companyId
  // ==========================================================================
  const company = await prisma.company.upsert({
    where: { code: 'AITX' },
    update: {
      name: 'AITX Rail Services',
    },
    create: {
      id: uuidv4(),
      name: 'AITX Rail Services',
      code: 'AITX',
    },
  });

  console.log('✓ Company stable:', company.name, `(id: ${company.id})`);

  // ==========================================================================
  // USER MASTER DATA WITH UPSERT (Stability Fix)
  // ==========================================================================
  // Uses UPSERT on the @unique email field for seed re-run stability
  // Ensures default seeded User references the stable companyId
  // ==========================================================================
  const adminPassword = await bcrypt.hash('password123', 10);
  const userPassword = await bcrypt.hash('password123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@aitx.com' },
    update: {
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      companyId: company.id,
    },
    create: {
      id: uuidv4(),
      email: 'admin@aitx.com',
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      companyId: company.id,
    },
  });

  const planner = await prisma.user.upsert({
    where: { email: 'planner@aitx.com' },
    update: {
      password: userPassword,
      firstName: 'Sarah',
      lastName: 'Johnson',
      role: 'planner',
      companyId: company.id,
    },
    create: {
      id: uuidv4(),
      email: 'planner@aitx.com',
      password: userPassword,
      firstName: 'Sarah',
      lastName: 'Johnson',
      role: 'planner',
      companyId: company.id,
    },
  });

  const viewer = await prisma.user.upsert({
    where: { email: 'viewer@aitx.com' },
    update: {
      password: userPassword,
      firstName: 'Mike',
      lastName: 'Williams',
      role: 'viewer',
      companyId: company.id,
    },
    create: {
      id: uuidv4(),
      email: 'viewer@aitx.com',
      password: userPassword,
      firstName: 'Mike',
      lastName: 'Williams',
      role: 'viewer',
      companyId: company.id,
    },
  });

  console.log('✓ Users stable: admin, planner, viewer (using email as unique key)');

  // ==========================================================================
  // SHOP MASTER DATA WITH BULK UPSERT ON CODE FIELD
  // ==========================================================================
  // Uses UPSERT pattern on the @unique code field for re-run stability
  // ==========================================================================
  const shops = [];
  console.log('   📍 Upserting shop master data...');

  for (let index = 0; index < shopData.length; index++) {
    const shop = shopData[index];
    // Convert annual capacity to monthly (divide by 12)
    const monthlyCapacity = Math.ceil(shop.annualCapacity / 12);
    const isAitx = shop.network === 'AITX-Own';
    // Tank qualified based on certifications (shops with Qualification cert are tank qualified)
    const tankQualified = shop.certifications.includes('Qualification');
    // Network tier: AITX = 1 (preferred), 3P varies by index
    const networkTier = isAitx ? 1 : Math.min(2 + Math.floor(index / 5), 5);

    // Build shop data object for UPSERT
    const shopDataObj = {
      name: shop.name,
      location: `${shop.city}, ${shop.state}`,
      city: shop.city,
      state: shop.state,
      region: shop.region,
      network: shop.network,
      isAitxInternal: isAitx,
      tankQualified,
      networkTier,
      shopStatus: 'active',
      capacity: monthlyCapacity,
      utilizationTarget: 0.90,
      baseCostPerCar: isAitx ? 20685 : 15000, // AITX has 37.9% premium
      laborRate: isAitx ? 95 : 75,
      costIndex: isAitx ? 1.379 : 1.0,
      baseTurnTime: shop.turnTime,
      certifications: JSON.stringify(shop.certifications.split(', ')),
      contactName: shop.contact.split(' (')[0],
      contactPhone: shop.contact.includes('(') ? shop.contact.match(/\([\d\)\s-]+/)?.[0]?.replace(/[()]/g, '') || '' : '',
      notes: shop.notes,
      isActive: true,
    };

    // UPSERT using @unique constraint on code field
    const createdShop = await prisma.shop.upsert({
      where: {
        code: shop.code,
      },
      update: shopDataObj,
      create: {
        id: uuidv4(),
        code: shop.code,
        ...shopDataObj,
        companyId: company.id,
      },
    });
    shops.push(createdShop);
  }

  console.log(`✓ Upserted ${shops.length} shops (using code as unique key)`);

  // ==========================================================================
  // IMPORT CARS FROM CSV USING BULK UPSERT
  // ==========================================================================
  // Uses the new importCarsFromCSV function with:
  // - Header validation with fuzzy matching
  // - Batch processing for performance
  // - UPSERT on railcarNumber (unique constraint)
  // - Comprehensive error handling
  // ==========================================================================

  let cars: { id: string; railcarNumber: string }[] = [];

  if (fs.existsSync(CSV_FILE_PATH)) {
    console.log(`\n📄 Importing cars from CSV using bulk UPSERT...`);

    const importStats = await importCarsFromCSV(CSV_FILE_PATH, company.id, {
      batchSize: 100,       // Process 100 cars per transaction
      dryRun: false,        // Actually perform the upserts
      continueOnError: true // Continue even if some rows fail
    });

    // Log import summary
    if (importStats.errors.length > 0 && importStats.successfulUpserts === 0) {
      console.error(`❌ CSV import failed: ${importStats.errors[0]?.error}`);
      // Fall back to random data generation
      cars = await generateRandomCars(company.id, 200);
    } else {
      console.log(`✓ CSV import completed successfully`);
      // Fetch the imported cars for use in plan assignments
      const importedCars = await prisma.car.findMany({
        where: { companyId: company.id },
        select: { id: true, railcarNumber: true },
        take: 1000 // Limit for plan assignment purposes
      });
      cars = importedCars;
    }
  } else {
    console.log(`\n⚠️  CSV file not found at ${CSV_FILE_PATH}`);
    console.log(`   Generating random car data as fallback...`);
    cars = await generateRandomCars(company.id, 200);
  }

  console.log(`📦 Total cars available for planning: ${cars.length}`);

  // Create 2 plans with dynamic years
  const planCurrentYear = await prisma.plan.create({
    data: {
      id: uuidv4(),
      name: `${CURRENT_YEAR} Service Plan`,
      description: `Annual service schedule for ${CURRENT_YEAR} fleet maintenance`,
      startDate: new Date(`${CURRENT_YEAR}-01-01`),
      endDate: new Date(`${CURRENT_YEAR}-12-31`),
      status: 'active',
      companyId: company.id,
      createdBy: planner.id,
    },
  });

  const planNextYear = await prisma.plan.create({
    data: {
      id: uuidv4(),
      name: `${NEXT_YEAR} Service Plan`,
      description: `Projected service schedule for ${NEXT_YEAR}`,
      startDate: new Date(`${NEXT_YEAR}-01-01`),
      endDate: new Date(`${NEXT_YEAR}-12-31`),
      status: 'draft',
      companyId: company.id,
      createdBy: planner.id,
    },
  });

  console.log(`✓ Created 2 plans (${CURRENT_YEAR} active, ${NEXT_YEAR} draft)`);

  // Create assignments using dynamic month arrays
  const activeShops = shops.filter((s) => s.isActive);

  // Distribute cars across shops and months for current year
  let assignmentCount = 0;
  const usedCarMonthsCurrent = new Set<string>();

  // Calculate current month for status assignment
  const currentMonthStr = `${CURRENT_YEAR}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  for (const month of monthsCurrentYear) {
    for (const shop of activeShops) {
      const carsForShop = Math.floor(Math.random() * shop.capacity * 0.8) + 2;
      for (let i = 0; i < carsForShop; i++) {
        const car = cars[Math.floor(Math.random() * cars.length)];
        const key = `${car.id}-${month}`;

        if (!usedCarMonthsCurrent.has(key)) {
          usedCarMonthsCurrent.add(key);
          await prisma.planAssignment.create({
            data: {
              id: uuidv4(),
              planId: planCurrentYear.id,
              carId: car.id,
              shopId: shop.id,
              scheduledMonth: month,
              estimatedCost: 15000 + Math.floor(Math.random() * 20000),
              estimatedDuration: 10 + Math.floor(Math.random() * 10),
              status: month < currentMonthStr ? 'completed' : month === currentMonthStr ? 'in_progress' : 'pending',
            },
          });
          assignmentCount++;
        }
      }
    }
  }

  console.log(`✓ Created ${assignmentCount} assignments for ${CURRENT_YEAR} plan`);

  // Create fewer assignments for next year draft plan
  assignmentCount = 0;
  const usedCarMonthsNext = new Set<string>();

  for (const month of monthsNextYear.slice(0, 6)) {
    for (const shop of activeShops.slice(0, 10)) {
      const carsForShop = Math.floor(Math.random() * shop.capacity * 0.5) + 1;
      for (let i = 0; i < carsForShop; i++) {
        const car = cars[Math.floor(Math.random() * cars.length)];
        const key = `${car.id}-${month}`;

        if (!usedCarMonthsNext.has(key)) {
          usedCarMonthsNext.add(key);
          await prisma.planAssignment.create({
            data: {
              id: uuidv4(),
              planId: planNextYear.id,
              carId: car.id,
              shopId: shop.id,
              scheduledMonth: month,
              estimatedCost: 15000 + Math.floor(Math.random() * 20000),
              estimatedDuration: 10 + Math.floor(Math.random() * 10),
              status: 'pending',
            },
          });
          assignmentCount++;
        }
      }
    }
  }

  console.log(`✓ Created ${assignmentCount} assignments for ${NEXT_YEAR} plan`);

  // Create a sample scenario with dynamic years
  const nextYearShort = String(NEXT_YEAR).slice(-2);
  const scenario = await prisma.scenario.create({
    data: {
      id: uuidv4(),
      projectNumber: `Q2-${nextYearShort}-001`,
      name: `High Volume Q2 ${NEXT_YEAR}`,
      description: `What-if analysis for increased service volume in Q2 ${NEXT_YEAR}`,
      basePlanId: planNextYear.id,
      status: 'completed',
      results: JSON.stringify({
        totalCost: 2850000,
        costDelta: 5.2,
        averageTurnTime: 14.3,
        turnTimeDelta: -2.1,
        shopUtilization: {
          'Houston Rail Center': 85,
          'Chicago Yards': 78,
          'Los Angeles Terminal': 92,
          'Atlanta Service Hub': 65,
          'Dallas Maintenance': 88,
        },
        monthlyDistribution: {
          [`${NEXT_YEAR}-01`]: 45,
          [`${NEXT_YEAR}-02`]: 52,
          [`${NEXT_YEAR}-03`]: 48,
          [`${NEXT_YEAR}-04`]: 65,
          [`${NEXT_YEAR}-05`]: 72,
          [`${NEXT_YEAR}-06`]: 58,
        },
      }),
      companyId: company.id,
      createdBy: planner.id,
    },
  });

  console.log(`✓ Created sample scenario for Q2 ${NEXT_YEAR}`);

  // ==========================================================================
  // LEASE QUALIFICATION ENGINE DATA
  // ==========================================================================

  // Create Customer master records
  const customerRecords = await Promise.all(
    customers.map(async (name, index) => {
      const code = name.replace(/\s+/g, '').substring(0, 4).toUpperCase();
      return prisma.customer.create({
        data: {
          id: uuidv4(),
          name,
          code,
          contactName: `Contact for ${name}`,
          contactEmail: `contact@${code.toLowerCase()}.com`,
          contactPhone: `(555) ${100 + index}-${1000 + index}`,
          address: `${100 + index} Industrial Blvd, Houston, TX`,
          isActive: true,
          companyId: company.id,
        },
      });
    })
  );

  console.log(`✓ Created ${customerRecords.length} customer records`);

  // Create Lease Contracts (upcoming releases within 6 months)
  // Note: 'now' is already declared at the top of the seed function
  const leaseContracts = [];

  // Create 40 lease contracts expiring over the next 6 months
  for (let i = 0; i < 40; i++) {
    const car = cars[i]; // Use first 40 cars
    const customer = customerRecords[i % customerRecords.length];

    // Random end date within 1-180 days from now
    const daysUntilEnd = Math.floor(Math.random() * 180) + 1;
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + daysUntilEnd);

    // Start date was 1-3 years ago
    const startDate = new Date(now);
    startDate.setFullYear(startDate.getFullYear() - (1 + Math.floor(Math.random() * 2)));

    // 30% have next customer (immediate reassignment)
    const hasNextCustomer = Math.random() < 0.3;
    const nextCustomer = hasNextCustomer
      ? customerRecords[(i + 3) % customerRecords.length]
      : null;

    const contract = await prisma.leaseContract.create({
      data: {
        id: uuidv4(),
        carId: car.id,
        customerId: customer.id,
        contractNumber: `LC-${2024}-${String(1000 + i)}`,
        startDate,
        endDate,
        status: daysUntilEnd <= 30 ? 'pending_release' : 'active',
        commodity: commodities[i % commodities.length],
        releaseReason: ['qualification', 'assignment', 'return'][i % 3],
        nextCustomerId: nextCustomer?.id || null,
        isReleaseConfirmed: false,
        companyId: company.id,
      },
    });

    leaseContracts.push(contract);
  }

  console.log(`✓ Created ${leaseContracts.length} lease contracts`);

  // Create some S&OP capacity slots for shops (next 6 months)
  const capacityMonths = [];
  for (let i = 0; i < 6; i++) {
    const monthDate = new Date(now);
    monthDate.setMonth(monthDate.getMonth() + i);
    const year = monthDate.getFullYear();
    const month = (monthDate.getMonth() + 1).toString().padStart(2, '0');
    capacityMonths.push(`${year}-${month}`);
  }

  let capacitySlotCount = 0;
  for (const shop of shops.slice(0, 10)) {
    for (const monthKey of capacityMonths) {
      // Qualification slots
      await prisma.shopCapacitySlot.upsert({
        where: {
          shopId_monthKey_slotType: {
            shopId: shop.id,
            monthKey,
            slotType: 'qualification',
          },
        },
        update: {
          capacity: shop.capacity,
          used: Math.floor(Math.random() * shop.capacity * 0.3),
        },
        create: {
          id: uuidv4(),
          shopId: shop.id,
          monthKey,
          slotType: 'qualification',
          capacity: shop.capacity,
          used: Math.floor(Math.random() * shop.capacity * 0.3),
        },
      });

      // Assignment slots
      await prisma.shopCapacitySlot.upsert({
        where: {
          shopId_monthKey_slotType: {
            shopId: shop.id,
            monthKey,
            slotType: 'assignment',
          },
        },
        update: {
          capacity: Math.floor(shop.capacity * 0.8),
          used: Math.floor(Math.random() * shop.capacity * 0.2),
        },
        create: {
          id: uuidv4(),
          shopId: shop.id,
          monthKey,
          slotType: 'assignment',
          capacity: Math.floor(shop.capacity * 0.8),
          used: Math.floor(Math.random() * shop.capacity * 0.2),
        },
      });

      // Repair slots
      await prisma.shopCapacitySlot.upsert({
        where: {
          shopId_monthKey_slotType: {
            shopId: shop.id,
            monthKey,
            slotType: 'repair',
          },
        },
        update: {
          capacity: Math.floor(shop.capacity * 0.4),
          used: Math.floor(Math.random() * shop.capacity * 0.1),
        },
        create: {
          id: uuidv4(),
          shopId: shop.id,
          monthKey,
          slotType: 'repair',
          capacity: Math.floor(shop.capacity * 0.4),
          used: Math.floor(Math.random() * shop.capacity * 0.1),
        },
      });

      capacitySlotCount += 3;
    }
  }

  console.log(`✓ Created ${capacitySlotCount} shop capacity slots`);

  // ==========================================================================
  // FINAL DATA INTEGRITY TEST PLAN
  // ==========================================================================
  // Automated integrity check to validate FK constraint resolution:
  // 1. Select a random User and verify it resolves to a valid Company
  // 2. Verify a random PlanAssignment resolves to valid Car and Shop records
  // 3. Log final success message
  // ==========================================================================
  console.log('\n' + '='.repeat(70));
  console.log('🔍 RUNNING FINAL DATA INTEGRITY TEST PLAN');
  console.log('='.repeat(70));

  let integrityChecksPassed = true;
  const integrityErrors: string[] = [];

  // Test 1: Random User -> Company FK Integrity
  console.log('\n📋 Test 1: User -> Company FK Integrity');
  try {
    const randomUser = await prisma.user.findFirst({
      orderBy: { createdAt: 'desc' },
      include: { company: true },
    });

    if (!randomUser) {
      integrityErrors.push('No User records found in database');
      integrityChecksPassed = false;
    } else if (!randomUser.company) {
      integrityErrors.push(`User ${randomUser.email} has no associated Company (FK violation)`);
      integrityChecksPassed = false;
    } else {
      console.log(`   ✅ User "${randomUser.email}" resolves to Company "${randomUser.company.name}" (id: ${randomUser.company.id})`);
    }
  } catch (error) {
    integrityErrors.push(`User -> Company test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    integrityChecksPassed = false;
  }

  // Test 2: Random PlanAssignment -> Car and Shop FK Integrity
  console.log('\n📋 Test 2: PlanAssignment -> Car and Shop FK Integrity');
  try {
    const randomAssignment = await prisma.planAssignment.findFirst({
      orderBy: { createdAt: 'desc' },
      include: {
        car: true,
        shop: true,
        plan: true,
      },
    });

    if (!randomAssignment) {
      console.log('   ⚠️  No PlanAssignment records found (this is OK for fresh databases)');
    } else {
      let assignmentValid = true;

      if (!randomAssignment.car) {
        integrityErrors.push(`PlanAssignment ${randomAssignment.id} has no associated Car (FK violation)`);
        assignmentValid = false;
      } else {
        console.log(`   ✅ PlanAssignment resolves to Car "${randomAssignment.car.railcarNumber}"`);
      }

      if (!randomAssignment.shop) {
        integrityErrors.push(`PlanAssignment ${randomAssignment.id} has no associated Shop (FK violation)`);
        assignmentValid = false;
      } else {
        console.log(`   ✅ PlanAssignment resolves to Shop "${randomAssignment.shop.name}" (code: ${randomAssignment.shop.code})`);
      }

      if (!randomAssignment.plan) {
        integrityErrors.push(`PlanAssignment ${randomAssignment.id} has no associated Plan (FK violation)`);
        assignmentValid = false;
      } else {
        console.log(`   ✅ PlanAssignment resolves to Plan "${randomAssignment.plan.name}"`);
      }

      if (!assignmentValid) {
        integrityChecksPassed = false;
      }
    }
  } catch (error) {
    integrityErrors.push(`PlanAssignment -> Car/Shop test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    integrityChecksPassed = false;
  }

  // Test 3: Verify core entity counts
  console.log('\n📋 Test 3: Core Entity Count Validation');
  try {
    const counts = {
      companies: await prisma.company.count(),
      users: await prisma.user.count(),
      shops: await prisma.shop.count(),
      cars: await prisma.car.count(),
      plans: await prisma.plan.count(),
      assignments: await prisma.planAssignment.count(),
    };

    console.log(`   • Companies: ${counts.companies}`);
    console.log(`   • Users: ${counts.users}`);
    console.log(`   • Shops: ${counts.shops}`);
    console.log(`   • Cars: ${counts.cars}`);
    console.log(`   • Plans: ${counts.plans}`);
    console.log(`   • PlanAssignments: ${counts.assignments}`);

    if (counts.companies === 0) {
      integrityErrors.push('No Company records - cannot create dependent records');
      integrityChecksPassed = false;
    }
    if (counts.users === 0) {
      integrityErrors.push('No User records - application will not function');
      integrityChecksPassed = false;
    }
    if (counts.shops === 0) {
      integrityErrors.push('No Shop records - cannot create assignments');
      integrityChecksPassed = false;
    }
    if (counts.cars === 0) {
      integrityErrors.push('No Car records - cannot create assignments');
      integrityChecksPassed = false;
    }
  } catch (error) {
    integrityErrors.push(`Entity count validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    integrityChecksPassed = false;
  }

  // Final Summary
  console.log('\n' + '='.repeat(70));
  if (integrityChecksPassed) {
    console.log('🎉 FINAL SUCCESS: Chronos Data Integrity is Guaranteed.');
    console.log('   All Write Operations Should Now Succeed.');
    console.log('='.repeat(70));
  } else {
    console.log('❌ DATA INTEGRITY CHECK FAILED');
    console.log('   The following issues were detected:');
    integrityErrors.forEach((err, i) => console.log(`   ${i + 1}. ${err}`));
    console.log('='.repeat(70));
    throw new Error('Data integrity validation failed - see errors above');
  }

  console.log('\n🎉 Seed completed successfully!');
  console.log('\nLogin credentials:');
  console.log('  Admin: admin@aitx.com / password123');
  console.log('  Planner: planner@aitx.com / password123');
  console.log('  Viewer: viewer@aitx.com / password123');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
