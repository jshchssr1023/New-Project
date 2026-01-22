/**
 * Import/Export Service
 *
 * Handles CSV/Excel import/export for cars, shops, and assignments.
 * Supports field mapping, validation, and batch processing.
 */

import { prisma } from './db';
import {
  analyzeHeaders,
  transformCarRecord,
} from '../utils/importTransformers';
import {
  CSV_SHOP_COLUMN_MAPPING,
  resolveShopCodeFromCSVColumn,
  getNetworkForShopCode,
} from '../constants/shopNetworks';

// =============================================================================
// INTERFACES
// =============================================================================

export interface ImportPreview {
  totalRows: number;
  validRows: number;
  errorRows: number;
  headers: string[];
  headerMapping: Record<string, string>;
  unmappedHeaders: string[];
  missingFields: string[];
  sampleData: Record<string, unknown>[];
  errors: { row: number; errors: string[] }[];
}

export interface ImportResult {
  success: boolean;
  imported: number;
  updated: number;
  skipped: number;
  errors: { row: number; identifier: string; error: string }[];
  duration: number;
}

export interface ExportOptions {
  entityType: 'cars' | 'shops' | 'assignments' | 'plans';
  columns?: string[];
  filters?: Record<string, unknown>;
  format: 'csv' | 'xlsx';
  includeHeaders?: boolean;
}

// =============================================================================
// CSV PARSING
// =============================================================================

/**
 * Parse CSV content into rows
 */
function parseCSV(content: string): { headers: string[]; rows: string[][] } {
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++; // Skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(parseRow);

  return { headers, rows };
}

/**
 * Convert rows to objects using headers
 */
function rowsToObjects(headers: string[], rows: string[][]): Record<string, unknown>[] {
  return rows.map(row => {
    const obj: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      obj[header] = row[idx] ?? '';
    });
    return obj;
  });
}

// =============================================================================
// CAR IMPORT
// =============================================================================

/**
 * Preview car import without saving
 */
export async function previewCarImport(
  csvContent: string,
  companyId: string,
  customMappings?: Record<string, string>
): Promise<ImportPreview> {
  const { headers, rows } = parseCSV(csvContent);

  // Analyze headers
  const headerAnalysis = analyzeHeaders(headers);
  const mappings = { ...headerAnalysis.mappings, ...customMappings };

  // Transform and validate each row
  const sampleData: Record<string, unknown>[] = [];
  const errors: { row: number; errors: string[] }[] = [];
  let validRows = 0;

  const objects = rowsToObjects(headers, rows);

  for (let i = 0; i < objects.length; i++) {
    const result = transformCarRecord(objects[i], mappings);

    if (result.success) {
      validRows++;
      if (sampleData.length < 5) {
        sampleData.push(result.data);
      }
    } else {
      errors.push({ row: i + 2, errors: result.errors }); // +2 for 1-indexed + header row
    }
  }

  return {
    totalRows: rows.length,
    validRows,
    errorRows: errors.length,
    headers,
    headerMapping: mappings,
    unmappedHeaders: headerAnalysis.unmappedHeaders,
    missingFields: headerAnalysis.missingRequiredFields,
    sampleData,
    errors: errors.slice(0, 20), // Limit errors shown
  };
}

/**
 * Extended import result with CarFlowPlan info
 */
export interface ExtendedImportResult extends ImportResult {
  carFlowPlansCreated: number;
  shopAssignmentsProcessed: number;
  // New workflow: scenario draft creation
  scenarioDraftId?: string;
  scenarioDraftName?: string;
  scenarioCarsAdded?: number;
}

/**
 * Import cars from CSV (Qual Planner Master format)
 *
 * Handles all fields including:
 * - Car identification (Mark + Number → railcarNumber)
 * - Qualification dates (9 date fields)
 * - Reference fields (CSR, CSL, Commercial)
 * - Shop assignments from shop columns
 * - Status calculation (shoppingStatus)
 *
 * NEW WORKFLOW (default):
 * When createAsDraft=true (default), shop assignments are collected and
 * a Scenario (draft) is created instead of committed CarFlowPlans.
 * This allows the plan to go through the proper approval workflow:
 *   Import → Draft Scenario → Send to Customer → Customer Approval → Schedule
 *
 * LEGACY MODE:
 * When createAsDraft=false, CarFlowPlan entries are created directly,
 * bypassing the customer approval workflow.
 */
export async function importCars(
  csvContent: string,
  companyId: string,
  options: {
    updateExisting?: boolean;
    customMappings?: Record<string, string>;
    dryRun?: boolean;
    createCarFlowPlans?: boolean;
    createAsDraft?: boolean; // NEW: Create scenario draft instead of committed CarFlowPlans
    userId?: string; // Required for CarFlowPlan/Scenario creation
    draftName?: string; // Optional name for the draft scenario
    customerFilter?: string; // Optional customer for the draft scenario
  } = {}
): Promise<ExtendedImportResult> {
  const startTime = Date.now();
  const {
    updateExisting = true,
    customMappings,
    dryRun = false,
    createCarFlowPlans = true,
    createAsDraft = true, // NEW DEFAULT: Create drafts instead of committed plans
    userId,
    draftName,
    customerFilter,
  } = options;

  const { headers, rows } = parseCSV(csvContent);
  const headerAnalysis = analyzeHeaders(headers);
  const mappings = { ...headerAnalysis.mappings, ...customMappings };

  const objects = rowsToObjects(headers, rows);
  const errors: { row: number; identifier: string; error: string }[] = [];
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let carFlowPlansCreated = 0;
  let shopAssignmentsProcessed = 0;

  // NEW: Track assignments for draft scenario creation
  let scenarioDraftId: string | undefined;
  let scenarioDraftName: string | undefined;
  let scenarioCarsAdded = 0;
  const pendingAssignments: {
    carId: string;
    shopId: string;
    plannedMonth: number;
    plannedYear: number;
    shopReason: string;
    estimatedCost: number | null;
  }[] = [];

  // Get existing cars for duplicate detection
  const existingCars = await prisma.car.findMany({
    where: { companyId },
    select: { id: true, vehicleNumber: true, railcarNumber: true },
  });
  const existingByNumber = new Map<string, string>(
    existingCars.map((c: { id: string; vehicleNumber: string; railcarNumber: string }) => [
      (c.railcarNumber || c.vehicleNumber).toLowerCase(),
      c.id
    ])
  );

  // Get existing shops for assignment matching
  const existingShops = await prisma.shop.findMany({
    where: { companyId, isActive: true },
    select: { id: true, name: true, code: true, location: true, city: true, state: true },
  });

  // Build comprehensive shop lookup map with multiple matching strategies
  const shopLookup = new Map<string, string>();
  const shopLookupByCity = new Map<string, string>();
  const shopLookupByCode = new Map<string, string>();

  for (const shop of existingShops) {
    // Primary lookups
    shopLookup.set(shop.name.toLowerCase().trim(), shop.id);
    shopLookup.set(shop.code.toLowerCase().trim(), shop.id);

    // By code (separate map for CSV column resolution)
    shopLookupByCode.set(shop.code.toLowerCase().trim(), shop.id);

    // With location
    if (shop.location) {
      shopLookup.set(`${shop.name} (${shop.location})`.toLowerCase().trim(), shop.id);
      shopLookup.set(shop.location.toLowerCase().trim(), shop.id);
    }

    // By city (for partial matching)
    if (shop.city) {
      shopLookupByCity.set(shop.city.toLowerCase().trim(), shop.id);
    }

    // Normalized versions (remove special chars)
    const normalizedName = shop.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    shopLookup.set(normalizedName, shop.id);
  }

  // Add CSV column mappings to shop lookup
  for (const [csvColumn, shopCode] of Object.entries(CSV_SHOP_COLUMN_MAPPING)) {
    const shopId = shopLookupByCode.get(shopCode.toLowerCase());
    if (shopId) {
      shopLookup.set(csvColumn.toLowerCase().trim(), shopId);
      // Also add normalized version
      shopLookup.set(csvColumn.toLowerCase().replace(/\s+/g, ' ').trim(), shopId);
    }
  }

  /**
   * Enhanced shop matching function with fuzzy matching support
   */
  const findShopId = (shopName: string, shopLocation?: string, csvColumnHeader?: string): string | null => {
    // Strategy 1: Direct CSV column header mapping
    if (csvColumnHeader) {
      const shopCode = resolveShopCodeFromCSVColumn(csvColumnHeader);
      if (shopCode) {
        const shopId = shopLookupByCode.get(shopCode.toLowerCase());
        if (shopId) return shopId;
      }
      // Try direct lookup of CSV column header
      const directMatch = shopLookup.get(csvColumnHeader.toLowerCase().trim());
      if (directMatch) return directMatch;
    }

    // Strategy 2: Full name with location
    if (shopLocation) {
      const fullKey = `${shopName} (${shopLocation})`.toLowerCase().trim();
      const shopId = shopLookup.get(fullKey);
      if (shopId) return shopId;
    }

    // Strategy 3: Shop name only
    const nameMatch = shopLookup.get(shopName.toLowerCase().trim());
    if (nameMatch) return nameMatch;

    // Strategy 4: Location/city only
    if (shopLocation) {
      const locationMatch = shopLookup.get(shopLocation.toLowerCase().trim());
      if (locationMatch) return locationMatch;
      const cityMatch = shopLookupByCity.get(shopLocation.toLowerCase().trim());
      if (cityMatch) return cityMatch;
    }

    // Strategy 5: Normalized name (remove special chars)
    const normalizedName = shopName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedMatch = shopLookup.get(normalizedName);
    if (normalizedMatch) return normalizedMatch;

    // Strategy 6: Partial match - check if shop name contains or is contained by any key
    for (const [key, shopId] of shopLookup.entries()) {
      if (key.includes(shopName.toLowerCase()) || shopName.toLowerCase().includes(key)) {
        return shopId;
      }
    }

    // Strategy 7: Extract city from parentheses and try city match
    const cityMatch = shopName.match(/\(([^)]+)\)$/);
    if (cityMatch) {
      const extractedCity = cityMatch[1].toLowerCase().trim();
      const cityShopId = shopLookupByCity.get(extractedCity);
      if (cityShopId) return cityShopId;
    }

    return null;
  };

  for (let i = 0; i < objects.length; i++) {
    // Pass headers to transformCarRecord for shop column extraction
    const result = transformCarRecord(objects[i], mappings, headers);
    const rowNum = i + 2;

    if (!result.success) {
      errors.push({
        row: rowNum,
        identifier: String(result.data.railcarNumber || 'unknown'),
        error: result.errors.join('; '),
      });
      continue;
    }

    const carData = result.data;
    const railcarNumber = String(carData.railcarNumber);
    const existingId = existingByNumber.get(railcarNumber.toLowerCase());

    // Build the car data object for Prisma
    const prismaCarData = {
      railcarNumber: railcarNumber,
      vehicleNumber: railcarNumber, // Backward compatibility
      carMark: String(carData.carMark || ''),
      carNumber: String(carData.carNumber || ''),
      carType: String(carData.carType || ''),
      isTankCar: Boolean(carData.isTankCar),
      commodity: String(carData.commodity || ''),
      customer: String(carData.customer || ''),
      fmsLesseeNumber: String(carData.fmsLesseeNumber || ''),
      contractNumber: String(carData.contractNumber || ''),
      contractExpiration: carData.contractExpiration as Date | null,
      status: String(carData.status || 'To Be Routed'),
      shoppingStatus: String(carData.shoppingStatus || 'Unknown'),
      planStatus: String(carData.planStatus || ''),
      portfolio: Boolean(carData.portfolio),
      performedTankQual: Boolean(carData.performedTankQual),
      performScheduled: Boolean(carData.performScheduled),
      qualificationType: String(carData.qualificationType || ''),
      reasonsShopped: String(carData.reasonsShopped || ''),
      currentLocation: String(carData.currentLocation || ''),
      homeRegion: String(carData.homeRegion || ''),
      originRegion: String(carData.originRegion || ''),
      pastRegion: String(carData.pastRegion || ''),
      region2026: String(carData.region2026 || ''),
      isJacketed: Boolean(carData.isJacketed),
      isLined: Boolean(carData.isLined),
      liningType: String(carData.liningType || ''),
      buildYear: carData.buildYear as number | null,
      csr: String(carData.csr || ''),
      csl: String(carData.csl || ''),
      commercial: String(carData.commercial || ''),
      projectedCost: Number(carData.projectedCost) || 0,
      daysInShop: Number(carData.daysInShop) || 0,
      projectedCompletionMonth: String(carData.projectedCompletionMonth || ''),
      shopEntryDate: carData.shopEntryDate as Date | null,
      arrivalDate: carData.arrivalDate as Date | null,
      lastServiceDate: carData.lastServiceDate as Date | null,
      nextServiceDue: carData.nextServiceDue as Date | null,
      notes: String(carData.notes || ''),
      // Qualification date fields
      minNoLining: carData.minNoLining as Date | null,
      minWLining: carData.minWLining as Date | null,
      interiorLining: carData.interiorLining as Date | null,
      rule88B: carData.rule88B as Date | null,
      safetyRelief: carData.safetyRelief as Date | null,
      serviceEquipment: carData.serviceEquipment as Date | null,
      stubSill: carData.stubSill as Date | null,
      tankThickness: carData.tankThickness as Date | null,
      tankQualification: carData.tankQualification as Date | null,
    };

    try {
      let carId: string;

      if (existingId) {
        if (updateExisting) {
          if (!dryRun) {
            await prisma.car.update({
              where: { id: existingId },
              data: prismaCarData,
            });
          }
          carId = existingId;
          updated++;
        } else {
          carId = existingId;
          skipped++;
        }
      } else {
        if (!dryRun) {
          const newCar = await prisma.car.create({
            data: {
              ...prismaCarData,
              companyId,
            },
          });
          carId = newCar.id;
        } else {
          carId = 'dry-run-id';
        }
        imported++;
      }

      // Process shop assignments
      if (createCarFlowPlans && userId && result.shopAssignments.length > 0 && !dryRun) {
        for (const assignment of result.shopAssignments) {
          shopAssignmentsProcessed++;

          // Use enhanced shop matching with CSV column header
          const shopId = findShopId(
            assignment.shopName,
            assignment.shopLocation,
            assignment.csvColumnHeader
          );

          if (shopId && carId !== 'dry-run-id') {
            // Parse month and year from scheduledMonth (YYYY-MM format)
            const [yearStr, monthStr] = assignment.scheduledMonth.split('-');
            const plannedYear = parseInt(yearStr, 10);
            const plannedMonth = parseInt(monthStr, 10);

            // Check if car is in actionable status (Arrived, Enroute, To Be Routed)
            const statusLower = String(carData.status).toLowerCase();
            const shouldCreatePlan = ['arrived', 'enroute', 'to be routed'].includes(statusLower);

            if (shouldCreatePlan) {
              // NEW: If createAsDraft is true, collect assignments for scenario creation
              if (createAsDraft) {
                pendingAssignments.push({
                  carId,
                  shopId,
                  plannedMonth,
                  plannedYear,
                  shopReason: String(carData.reasonsShopped || carData.qualificationType || ''),
                  estimatedCost: Number(carData.projectedCost) || null,
                });
              } else {
                // SST: Create UnifiedAssignment directly (single source of truth)
                // Check for existing ACTIVE assignment for this car
                const existingActiveAssignment = await prisma.unifiedAssignment.findFirst({
                  where: {
                    carId,
                    status: { in: ['DRAFT', 'PENDING_REVIEW', 'COMMITTED', 'IN_PROGRESS'] },
                  },
                });

                if (!existingActiveAssignment) {
                  await prisma.unifiedAssignment.create({
                    data: {
                      carId,
                      shopId,
                      plannedMonth,
                      plannedYear,
                      scheduledMonth: `${plannedYear}-${String(plannedMonth).padStart(2, '0')}`,
                      status: statusLower === 'arrived' ? 'IN_PROGRESS' : 'COMMITTED',
                      sourceType: 'csv_import',
                      workType: 'full_qualification',
                      shopReason: String(carData.reasonsShopped || carData.qualificationType || ''),
                      estimatedCost: Number(carData.projectedCost) || null,
                      priority: carData.shoppingStatus === 'Urgent' ? 1 :
                                carData.shoppingStatus === 'Must Shop' ? 2 : 3,
                      notes: `Imported from Qual Planner Master CSV`,
                      committedById: userId,
                      committedAt: new Date(),
                      companyId,
                    },
                  });
                  carFlowPlansCreated++;
                }
              }
            }
          }
        }
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push({ row: rowNum, identifier: railcarNumber, error: errMsg });
    }
  }

  // NEW: Create scenario draft with all collected assignments
  if (createAsDraft && pendingAssignments.length > 0 && userId && !dryRun) {
    try {
      // Generate scenario name from options or create default
      const timestamp = new Date().toISOString().slice(0, 10);
      scenarioDraftName = draftName || `CSV Import ${timestamp}`;

      // Create the scenario
      const scenario = await prisma.scenario.create({
        data: {
          name: scenarioDraftName,
          description: `Imported from CSV on ${timestamp}. ${pendingAssignments.length} cars with shop assignments.`,
          projectNumber: `IMPORT-${timestamp}`,
          status: 'draft',
          customerFilter: customerFilter || null,
          createdBy: userId,
          companyId,
        },
      });

      scenarioDraftId = scenario.id;

      // Add all cars to the scenario
      for (const assignment of pendingAssignments) {
        await prisma.scenarioCar.create({
          data: {
            scenarioId: scenario.id,
            carId: assignment.carId,
            assignedShopId: assignment.shopId,
            plannedMonth: assignment.plannedMonth,
            plannedYear: assignment.plannedYear,
            shopReason: assignment.shopReason,
            estimatedCost: assignment.estimatedCost,
          },
        });
        scenarioCarsAdded++;
      }
    } catch (error) {
      console.error('Failed to create scenario draft:', error);
      // Don't fail the import, just note it
      errors.push({
        row: 0,
        identifier: 'SCENARIO_DRAFT',
        error: `Failed to create draft scenario: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  return {
    success: errors.length === 0,
    imported,
    updated,
    skipped,
    errors,
    duration: Date.now() - startTime,
    carFlowPlansCreated,
    shopAssignmentsProcessed,
    // NEW: Include draft scenario info
    scenarioDraftId,
    scenarioDraftName,
    scenarioCarsAdded,
  };
}

// =============================================================================
// SHOP IMPORT
// =============================================================================

/**
 * Import shops from CSV
 */
export async function importShops(
  csvContent: string,
  companyId: string,
  options: { updateExisting?: boolean; dryRun?: boolean } = {}
): Promise<ImportResult> {
  const startTime = Date.now();
  const { updateExisting = true, dryRun = false } = options;

  const { headers, rows } = parseCSV(csvContent);
  const objects = rowsToObjects(headers, rows);

  const errors: { row: number; identifier: string; error: string }[] = [];
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  // Get existing shops
  const existingShops = await prisma.shop.findMany({
    where: { companyId },
    select: { id: true, code: true },
  });
  const existingByCode = new Map(existingShops.map(s => [s.code.toLowerCase(), s.id]));

  for (let i = 0; i < objects.length; i++) {
    const row = objects[i];
    const rowNum = i + 2;

    const code = String(row.code || row.shop_code || row.shopCode || '').trim();
    const name = String(row.name || row.shop_name || row.shopName || '').trim();

    if (!code || !name) {
      errors.push({ row: rowNum, identifier: code || 'unknown', error: 'Missing code or name' });
      continue;
    }

    const shopData = {
      name,
      code,
      region: String(row.region || '').trim(),
      address: String(row.address || '').trim(),
      city: String(row.city || '').trim(),
      state: String(row.state || '').trim(),
      capacity: parseInt(String(row.capacity || '50'), 10),
      baseCostPerCar: parseFloat(String(row.baseCostPerCar || row.cost || '0')),
      baseTurnTime: parseInt(String(row.baseTurnTime || row.turnTime || '14'), 10),
      capabilities: JSON.stringify((String(row.capabilities || '')).split(',').map(s => s.trim()).filter(Boolean)),
      certifications: JSON.stringify((String(row.certifications || '')).split(',').map(s => s.trim()).filter(Boolean)),
      preferredCustomers: JSON.stringify((String(row.preferredCustomers || '')).split(',').map(s => s.trim()).filter(Boolean)),
      isActive: row.isActive !== 'false' && row.isActive !== '0' && row.isActive !== 'no',
    };

    try {
      const existingId = existingByCode.get(code.toLowerCase());

      if (existingId) {
        if (updateExisting) {
          if (!dryRun) {
            await prisma.shop.update({
              where: { id: existingId },
              data: shopData,
            });
          }
          updated++;
        } else {
          skipped++;
        }
      } else {
        if (!dryRun) {
          await prisma.shop.create({
            data: { ...shopData, companyId },
          });
        }
        imported++;
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push({ row: rowNum, identifier: code, error: errMsg });
    }
  }

  return {
    success: errors.length === 0,
    imported,
    updated,
    skipped,
    errors,
    duration: Date.now() - startTime,
  };
}

// =============================================================================
// EXPORT FUNCTIONS
// =============================================================================

/**
 * Export cars to CSV
 */
export async function exportCars(
  companyId: string,
  options: { columns?: string[]; filters?: Record<string, unknown> } = {}
): Promise<string> {
  const { columns, filters } = options;

  const where: Record<string, unknown> = { companyId };
  if (filters?.status) where.status = filters.status;
  if (filters?.customer) where.customer = filters.customer;
  if (filters?.carType) where.carType = filters.carType;

  const cars = await prisma.car.findMany({
    where,
    orderBy: { vehicleNumber: 'asc' },
  });

  const defaultColumns = [
    'vehicleNumber', 'carType', 'isTankCar', 'customer', 'commodity',
    'status', 'currentLocation', 'homeRegion', 'reasonShopped',
    'projectedCost', 'daysInShop', 'lastServiceDate', 'nextServiceDue'
  ];

  const exportColumns = columns || defaultColumns;

  // Build CSV
  const header = exportColumns.join(',');
  const rows = cars.map(car => {
    return exportColumns.map(col => {
      const value = (car as Record<string, unknown>)[col];
      if (value === null || value === undefined) return '';
      if (value instanceof Date) return value.toISOString().split('T')[0];
      if (typeof value === 'boolean') return value ? 'Yes' : 'No';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',');
  });

  return [header, ...rows].join('\n');
}

/**
 * Export shops to CSV
 */
export async function exportShops(
  companyId: string,
  options: { activeOnly?: boolean } = {}
): Promise<string> {
  const { activeOnly = true } = options;

  const where: Record<string, unknown> = { companyId };
  if (activeOnly) where.isActive = true;

  const shops = await prisma.shop.findMany({
    where,
    orderBy: { name: 'asc' },
  });

  const columns = [
    'code', 'name', 'region', 'address', 'city', 'state',
    'capacity', 'baseCostPerCar', 'baseTurnTime',
    'capabilities', 'certifications', 'preferredCustomers', 'isActive'
  ];

  const header = columns.join(',');
  const rows = shops.map(shop => {
    return columns.map(col => {
      let value = (shop as Record<string, unknown>)[col];

      // Parse JSON arrays back to comma-separated strings
      if (['capabilities', 'certifications', 'preferredCustomers'].includes(col)) {
        try {
          const arr = JSON.parse(String(value || '[]'));
          value = Array.isArray(arr) ? arr.join('; ') : '';
        } catch {
          value = '';
        }
      }

      if (value === null || value === undefined) return '';
      if (typeof value === 'boolean') return value ? 'Yes' : 'No';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',');
  });

  return [header, ...rows].join('\n');
}

/**
 * Export plan assignments to CSV
 */
export async function exportAssignments(
  companyId: string,
  planId?: string,
  month?: string
): Promise<string> {
  const where: Record<string, unknown> = {};

  if (planId) {
    where.planId = planId;
  } else {
    where.plan = { companyId };
  }

  if (month) {
    where.scheduledMonth = month;
  }

  const assignments = await prisma.planAssignment.findMany({
    where,
    include: {
      car: { select: { vehicleNumber: true, carType: true, customer: true } },
      shop: { select: { name: true, code: true } },
    },
    orderBy: [{ scheduledMonth: 'asc' }, { createdAt: 'asc' }],
  });

  const columns = [
    'vehicleNumber', 'carType', 'customer', 'shopCode', 'shopName',
    'scheduledMonth', 'status', 'estimatedCost', 'estimatedDays'
  ];

  const header = columns.join(',');
  const rows = assignments.map(a => {
    const data = {
      vehicleNumber: a.car.vehicleNumber,
      carType: a.car.carType,
      customer: a.car.customer,
      shopCode: a.shop.code,
      shopName: a.shop.name,
      scheduledMonth: a.scheduledMonth,
      status: a.status,
      estimatedCost: a.estimatedCost,
      estimatedDays: a.estimatedDays,
    };

    return columns.map(col => {
      const value = (data as Record<string, unknown>)[col];
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',');
  });

  return [header, ...rows].join('\n');
}

/**
 * Generate import template
 */
export function generateImportTemplate(entityType: 'cars' | 'shops'): string {
  if (entityType === 'cars') {
    const headers = [
      'vehicleNumber', 'carType', 'isTankCar', 'customer', 'commodity',
      'status', 'currentLocation', 'homeRegion', 'originRegion',
      'reasonShopped', 'projectedCost', 'daysInShop', 'notes'
    ];
    const example = [
      'AITX123456', 'Tank Car', 'Yes', 'ACME Corp', 'Crude Oil',
      'available', 'Houston TX', 'Gulf Coast', 'Midwest',
      'Annual Inspection', '5000', '14', 'Sample entry'
    ];
    return [headers.join(','), example.join(',')].join('\n');
  }

  if (entityType === 'shops') {
    const headers = [
      'code', 'name', 'region', 'address', 'city', 'state',
      'capacity', 'baseCostPerCar', 'baseTurnTime',
      'capabilities', 'certifications', 'preferredCustomers', 'isActive'
    ];
    const example = [
      'SHOP001', 'Main Repair Shop', 'Gulf Coast', '123 Industrial Ave', 'Houston', 'TX',
      '50', '4500', '14',
      'Tank Car; Box Car; Hopper', 'AAR; DOT', 'ACME Corp; XYZ Inc', 'Yes'
    ];
    return [headers.join(','), example.join(',')].join('\n');
  }

  return '';
}

export default {
  previewCarImport,
  importCars,
  importShops,
  exportCars,
  exportShops,
  exportAssignments,
  generateImportTemplate,
};
