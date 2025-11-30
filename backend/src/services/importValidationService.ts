/**
 * Import Validation Service
 *
 * Handles 3-step import workflow:
 * Step 1: Upload File
 * Step 2: Preview/Validate Data Errors
 * Step 3: Confirm Field Mapping
 *
 * Generates downloadable Error Report CSV on failure
 */

import { prisma } from './db';
import auditService from './auditService';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// TYPES
// =============================================================================

export interface ValidationError {
  row: number;
  field: string;
  value: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface FieldMapping {
  sourceField: string;
  targetField: string;
  isRequired: boolean;
  transform?: string;
}

export interface ImportSessionData {
  id: string;
  status: string;
  currentStep: number;
  totalRows: number;
  validRows: number;
  errorRows: number;
  warningRows: number;
  validationErrors: ValidationError[];
  validationWarnings: ValidationError[];
  detectedHeaders: string[];
  fieldMappings: Record<string, string>;
  unmappedFields: string[];
  previewData: Record<string, unknown>[];
}

export interface ImportResult {
  success: boolean;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  errors: ValidationError[];
}

// =============================================================================
// FIELD DEFINITIONS
// =============================================================================

const CAR_FIELDS = {
  required: ['railcarNumber'],
  optional: [
    'carType', 'isTankCar', 'commodity', 'customer', 'projectNumber',
    'reasonShopped', 'status', 'currentLocation', 'assignedShopId',
    'projectedCompletionMonth', 'projectedCost', 'homeRegion', 'originRegion',
    'notes', 'contractNumber', 'contractExpiration', 'isJacketed', 'isLined',
    'buildYear', 'qualificationType', 'tankQualified', 'tankQualDueDate',
    'performScheduled', 'planStatus'
  ],
  aliases: {
    'railcarnumber': 'railcarNumber',
    'car_number': 'railcarNumber',
    'car mark': 'railcarNumber',
    'reporting mark': 'railcarNumber',
    'car_type': 'carType',
    'type': 'carType',
    'car type': 'carType',
    'tank_car': 'isTankCar',
    'is_tank': 'isTankCar',
    'lessee': 'customer',
    'lessee name': 'customer',
    'customer_name': 'customer',
    'project': 'projectNumber',
    'project_number': 'projectNumber',
    'reason_shopped': 'reasonShopped',
    'reason': 'reasonShopped',
    'current_location': 'currentLocation',
    'location': 'currentLocation',
    'assigned_shop': 'assignedShopId',
    'shop': 'assignedShopId',
    'completion_month': 'projectedCompletionMonth',
    'projected_month': 'projectedCompletionMonth',
    'cost': 'projectedCost',
    'estimated_cost': 'projectedCost',
    'home_region': 'homeRegion',
    'region': 'homeRegion',
    'contract': 'contractNumber',
    'contract_expiration': 'contractExpiration',
    'lease_end': 'contractExpiration',
    'jacketed': 'isJacketed',
    'lined': 'isLined',
    'build_year': 'buildYear',
    'year_built': 'buildYear',
    'qual_type': 'qualificationType',
    'qualification_type': 'qualificationType',
    'tank_qualified': 'tankQualified',
    'qual_due': 'tankQualDueDate',
    'tank_qual_due': 'tankQualDueDate',
    'qualification_due': 'tankQualDueDate',
  },
};

const SHOP_FIELDS = {
  required: ['name', 'code'],
  optional: [
    'location', 'city', 'state', 'region', 'network', 'servingRailroad',
    'isAitxInternal', 'tankQualified', 'networkTier', 'shopStatus',
    'capacity', 'currentLoad', 'utilizationTarget', 'baseCostPerCar',
    'laborRate', 'costIndex', 'baseTurnTime', 'turnTimeMultiplier',
    'capabilities', 'certifications', 'preferredCustomers',
    'contactName', 'contactEmail', 'contactPhone', 'notes', 'isActive',
    'qualCapacity', 'assignCapacity', 'returnCapacity', 'repairCapacity',
    'efficiencyRating'
  ],
  aliases: {
    'shop_name': 'name',
    'shop_code': 'code',
    'shop code': 'code',
    'city_state': 'location',
    'serving_railroad': 'servingRailroad',
    'railroad': 'servingRailroad',
    'aitx_internal': 'isAitxInternal',
    'is_aitx': 'isAitxInternal',
    'internal': 'isAitxInternal',
    'tank_qualified': 'tankQualified',
    'tank_qual': 'tankQualified',
    'tier': 'networkTier',
    'network_tier': 'networkTier',
    'shop_status': 'shopStatus',
    'monthly_capacity': 'capacity',
    'current_load': 'currentLoad',
    'utilization_target': 'utilizationTarget',
    'util_target': 'utilizationTarget',
    'base_cost': 'baseCostPerCar',
    'cost_per_car': 'baseCostPerCar',
    'labor_rate': 'laborRate',
    'cost_index': 'costIndex',
    'turn_time': 'baseTurnTime',
    'base_turn_time': 'baseTurnTime',
    'turn_multiplier': 'turnTimeMultiplier',
    'contact_name': 'contactName',
    'contact_email': 'contactEmail',
    'contact_phone': 'contactPhone',
    'is_active': 'isActive',
    'active': 'isActive',
    'qual_capacity': 'qualCapacity',
    'qualification_capacity': 'qualCapacity',
    'assign_capacity': 'assignCapacity',
    'assignment_capacity': 'assignCapacity',
    'return_capacity': 'returnCapacity',
    'repair_capacity': 'repairCapacity',
    'efficiency': 'efficiencyRating',
  },
};

const CAPACITY_FIELDS = {
  required: ['shopCode', 'weekKey'],
  optional: [
    'qualCapacity', 'assignCapacity', 'returnCapacity', 'repairCapacity',
    'totalCapacity', 'notes'
  ],
  aliases: {
    'shop_code': 'shopCode',
    'shop': 'shopCode',
    'week': 'weekKey',
    'week_key': 'weekKey',
    'qual_capacity': 'qualCapacity',
    'qualification_capacity': 'qualCapacity',
    'assign_capacity': 'assignCapacity',
    'assignment_capacity': 'assignCapacity',
    'return_capacity': 'returnCapacity',
    'repair_capacity': 'repairCapacity',
    'total_capacity': 'totalCapacity',
    'total': 'totalCapacity',
  },
};

// =============================================================================
// STEP 1: UPLOAD AND CREATE SESSION
// =============================================================================

/**
 * Create import session (Step 1)
 */
export async function createImportSession(
  sessionType: 'cars' | 'shops' | 'capacity',
  fileName: string,
  fileSize: number,
  rawData: string,
  userId: string,
  userEmail: string,
  companyId: string
): Promise<ImportSessionData> {
  // Parse CSV
  const rows = parseCSV(rawData);
  const headers = rows[0] || [];
  const dataRows = rows.slice(1);

  // Create session
  const session = await prisma.importSession.create({
    data: {
      sessionType,
      fileName,
      fileSize,
      status: 'uploaded',
      currentStep: 1,
      totalRows: dataRows.length,
      detectedHeaders: JSON.stringify(headers),
      previewData: JSON.stringify(dataRows.slice(0, 10).map((row) =>
        headers.reduce((obj, h, i) => ({ ...obj, [h]: row[i] }), {})
      )),
      uploadedById: userId,
      uploadedByEmail: userEmail,
      companyId,
    },
  });

  return formatSessionData(session);
}

// =============================================================================
// STEP 2: VALIDATE AND PREVIEW
// =============================================================================

/**
 * Validate import data and generate preview (Step 2)
 */
export async function validateImportSession(
  sessionId: string
): Promise<ImportSessionData> {
  const session = await prisma.importSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) throw new Error('Session not found');

  const headers = JSON.parse(session.detectedHeaders) as string[];
  const previewData = JSON.parse(session.previewData) as Record<string, unknown>[];

  // Get field definitions based on session type
  const fieldDefs = getFieldDefinitions(session.sessionType);

  // Auto-detect field mappings
  const mappings = detectFieldMappings(headers, fieldDefs);

  // Validate data
  const { errors, warnings, validRows, errorRows, warningRows } = validateData(
    previewData,
    mappings,
    fieldDefs,
    session.sessionType
  );

  // Find unmapped fields
  const unmappedFields = headers.filter(
    (h) => !Object.keys(mappings).includes(h.toLowerCase())
  );

  // Update session
  await prisma.importSession.update({
    where: { id: sessionId },
    data: {
      status: 'preview',
      currentStep: 2,
      validRows,
      errorRows,
      warningRows,
      validationErrors: JSON.stringify(errors),
      validationWarnings: JSON.stringify(warnings),
      fieldMappings: JSON.stringify(mappings),
      unmappedFields: JSON.stringify(unmappedFields),
      validatedAt: new Date(),
    },
  });

  return getImportSession(sessionId);
}

// =============================================================================
// STEP 3: CONFIRM MAPPING AND IMPORT
// =============================================================================

/**
 * Update field mappings (Step 3)
 */
export async function updateFieldMappings(
  sessionId: string,
  mappings: Record<string, string>
): Promise<ImportSessionData> {
  await prisma.importSession.update({
    where: { id: sessionId },
    data: {
      status: 'mapping',
      fieldMappings: JSON.stringify(mappings),
      mappedAt: new Date(),
    },
  });

  return getImportSession(sessionId);
}

/**
 * Confirm and execute import (Final step)
 */
export async function executeImport(
  sessionId: string,
  userId: string,
  userEmail: string,
  companyId: string
): Promise<ImportResult> {
  const session = await prisma.importSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) throw new Error('Session not found');

  const mappings = JSON.parse(session.fieldMappings) as Record<string, string>;
  const previewData = JSON.parse(session.previewData) as Record<string, unknown>[];

  // Update status
  await prisma.importSession.update({
    where: { id: sessionId },
    data: {
      status: 'importing',
      currentStep: 3,
      confirmedAt: new Date(),
    },
  });

  let result: ImportResult;

  try {
    // Execute import based on type
    switch (session.sessionType) {
      case 'cars':
        result = await importCars(previewData, mappings, companyId, userId, userEmail);
        break;
      case 'shops':
        result = await importShops(previewData, mappings, companyId, userId, userEmail);
        break;
      case 'capacity':
        result = await importCapacity(previewData, mappings, companyId, userId, userEmail);
        break;
      default:
        throw new Error(`Unknown session type: ${session.sessionType}`);
    }

    // Generate error report if there are errors
    let errorReportUrl = '';
    if (result.errors.length > 0) {
      errorReportUrl = await generateErrorReport(sessionId, result.errors);
    }

    // Update session
    await prisma.importSession.update({
      where: { id: sessionId },
      data: {
        status: result.success ? 'completed' : 'failed',
        importedCount: result.importedCount,
        updatedCount: result.updatedCount,
        skippedCount: result.skippedCount,
        errorReportUrl,
        completedAt: new Date(),
      },
    });

    // Log audit
    await auditService.logAudit({
      userId,
      userEmail,
      action: 'create',
      entityType: session.sessionType === 'cars' ? 'Car' : 'Shop',
      entityId: sessionId,
      entityName: `Import: ${session.fileName}`,
      changes: {
        imported: { new: result.importedCount },
        updated: { new: result.updatedCount },
        skipped: { new: result.skippedCount },
      },
      metadata: {
        bulkOperation: true,
        count: result.importedCount + result.updatedCount,
        fileName: session.fileName,
      },
      companyId,
    });

    return result;
  } catch (error) {
    await prisma.importSession.update({
      where: { id: sessionId },
      data: { status: 'failed' },
    });
    throw error;
  }
}

// =============================================================================
// ERROR REPORT GENERATION
// =============================================================================

/**
 * Generate downloadable error report CSV
 */
export async function generateErrorReport(
  sessionId: string,
  errors: ValidationError[]
): Promise<string> {
  const csvRows = [
    ['Row', 'Field', 'Value', 'Error', 'Severity'],
    ...errors.map((e) => [
      e.row.toString(),
      e.field,
      e.value,
      e.message,
      e.severity,
    ]),
  ];

  const csvContent = csvRows
    .map((row) =>
      row
        .map((cell) => {
          const str = String(cell);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(',')
    )
    .join('\n');

  // Create error reports directory
  const reportsDir = path.join(process.cwd(), 'uploads', 'error-reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const fileName = `error-report-${sessionId}-${Date.now()}.csv`;
  const filePath = path.join(reportsDir, fileName);

  fs.writeFileSync(filePath, csvContent);

  return `/uploads/error-reports/${fileName}`;
}

/**
 * Get error report file path
 */
export async function getErrorReportPath(sessionId: string): Promise<string | null> {
  const session = await prisma.importSession.findUnique({
    where: { id: sessionId },
    select: { errorReportUrl: true },
  });

  return session?.errorReportUrl || null;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Parse CSV string to rows
 */
function parseCSV(content: string): string[][] {
  const rows: string[][] = [];
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    if (!line.trim()) continue;

    const row: string[] = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push(cell.trim());
        cell = '';
      } else {
        cell += char;
      }
    }

    row.push(cell.trim());
    rows.push(row);
  }

  return rows;
}

/**
 * Get field definitions based on session type
 */
function getFieldDefinitions(sessionType: string) {
  switch (sessionType) {
    case 'cars':
      return CAR_FIELDS;
    case 'shops':
      return SHOP_FIELDS;
    case 'capacity':
      return CAPACITY_FIELDS;
    default:
      return CAR_FIELDS;
  }
}

/**
 * Auto-detect field mappings from headers
 */
function detectFieldMappings(
  headers: string[],
  fieldDefs: typeof CAR_FIELDS
): Record<string, string> {
  const mappings: Record<string, string> = {};

  for (const header of headers) {
    const normalizedHeader = header.toLowerCase().trim();

    // Check direct match
    if (fieldDefs.required.includes(header) || fieldDefs.optional.includes(header)) {
      mappings[normalizedHeader] = header;
      continue;
    }

    // Check aliases
    const alias = fieldDefs.aliases[normalizedHeader as keyof typeof fieldDefs.aliases];
    if (alias) {
      mappings[normalizedHeader] = alias;
    }
  }

  return mappings;
}

/**
 * Validate import data
 */
function validateData(
  data: Record<string, unknown>[],
  mappings: Record<string, string>,
  fieldDefs: typeof CAR_FIELDS,
  sessionType: string
): {
  errors: ValidationError[];
  warnings: ValidationError[];
  validRows: number;
  errorRows: number;
  warningRows: number;
} {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  let validRows = 0;
  let errorRows = 0;
  let warningRows = 0;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    let hasError = false;
    let hasWarning = false;

    // Check required fields
    for (const requiredField of fieldDefs.required) {
      const mappedHeader = Object.entries(mappings).find(
        ([, target]) => target === requiredField
      )?.[0];

      if (!mappedHeader || !row[mappedHeader]) {
        errors.push({
          row: i + 2, // +2 for 1-based index and header row
          field: requiredField,
          value: '',
          message: `Required field "${requiredField}" is missing`,
          severity: 'error',
        });
        hasError = true;
      }
    }

    // Type validation for specific fields
    if (sessionType === 'cars') {
      // Validate railcar number format
      const railcarNumber = row['railcarnumber'] || row['railcarNumber'] || row['car_number'];
      if (railcarNumber && !/^[A-Z]{2,4}\d{4,6}$/i.test(String(railcarNumber))) {
        warnings.push({
          row: i + 2,
          field: 'railcarNumber',
          value: String(railcarNumber),
          message: 'Railcar number format may be invalid (expected format: XXXX123456)',
          severity: 'warning',
        });
        hasWarning = true;
      }

      // Validate date formats
      const dateFields = ['tankQualDueDate', 'contractExpiration'];
      for (const df of dateFields) {
        const mappedHeader = Object.entries(mappings).find(
          ([, target]) => target === df
        )?.[0];
        if (mappedHeader && row[mappedHeader]) {
          const dateVal = String(row[mappedHeader]);
          if (dateVal && !isValidDate(dateVal)) {
            errors.push({
              row: i + 2,
              field: df,
              value: dateVal,
              message: `Invalid date format for "${df}"`,
              severity: 'error',
            });
            hasError = true;
          }
        }
      }
    }

    if (hasError) {
      errorRows++;
    } else if (hasWarning) {
      warningRows++;
      validRows++;
    } else {
      validRows++;
    }
  }

  return { errors, warnings, validRows, errorRows, warningRows };
}

/**
 * Check if string is valid date
 */
function isValidDate(dateStr: string): boolean {
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

/**
 * Import cars from validated data
 */
async function importCars(
  data: Record<string, unknown>[],
  mappings: Record<string, string>,
  companyId: string,
  userId: string,
  userEmail: string
): Promise<ImportResult> {
  const errors: ValidationError[] = [];
  let importedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];

    try {
      // Build car object from mapped fields
      const carData: Record<string, unknown> = { companyId };

      for (const [sourceField, targetField] of Object.entries(mappings)) {
        if (row[sourceField] !== undefined && row[sourceField] !== '') {
          carData[targetField] = transformValue(targetField, row[sourceField]);
        }
      }

      const railcarNumber = carData.railcarNumber as string;
      if (!railcarNumber) {
        skippedCount++;
        continue;
      }

      // Check if car exists
      const existing = await prisma.car.findFirst({
        where: { railcarNumber, companyId },
      });

      if (existing) {
        await prisma.car.update({
          where: { id: existing.id },
          data: carData,
        });
        updatedCount++;
      } else {
        await prisma.car.create({
          data: carData as Parameters<typeof prisma.car.create>[0]['data'],
        });
        importedCount++;
      }
    } catch (error) {
      errors.push({
        row: i + 2,
        field: 'general',
        value: '',
        message: String(error),
        severity: 'error',
      });
      skippedCount++;
    }
  }

  return {
    success: errors.length === 0,
    importedCount,
    updatedCount,
    skippedCount,
    errors,
  };
}

/**
 * Import shops from validated data
 */
async function importShops(
  data: Record<string, unknown>[],
  mappings: Record<string, string>,
  companyId: string,
  userId: string,
  userEmail: string
): Promise<ImportResult> {
  const errors: ValidationError[] = [];
  let importedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];

    try {
      const shopData: Record<string, unknown> = { companyId };

      for (const [sourceField, targetField] of Object.entries(mappings)) {
        if (row[sourceField] !== undefined && row[sourceField] !== '') {
          shopData[targetField] = transformValue(targetField, row[sourceField]);
        }
      }

      const code = shopData.code as string;
      const name = shopData.name as string;

      if (!code || !name) {
        skippedCount++;
        continue;
      }

      const existing = await prisma.shop.findFirst({
        where: { code, companyId },
      });

      if (existing) {
        await prisma.shop.update({
          where: { id: existing.id },
          data: shopData,
        });
        updatedCount++;
      } else {
        await prisma.shop.create({
          data: shopData as Parameters<typeof prisma.shop.create>[0]['data'],
        });
        importedCount++;
      }
    } catch (error) {
      errors.push({
        row: i + 2,
        field: 'general',
        value: '',
        message: String(error),
        severity: 'error',
      });
      skippedCount++;
    }
  }

  return {
    success: errors.length === 0,
    importedCount,
    updatedCount,
    skippedCount,
    errors,
  };
}

/**
 * Import weekly capacity from validated data
 */
async function importCapacity(
  data: Record<string, unknown>[],
  mappings: Record<string, string>,
  companyId: string,
  userId: string,
  userEmail: string
): Promise<ImportResult> {
  const errors: ValidationError[] = [];
  let importedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];

    try {
      const capacityData: Record<string, unknown> = { companyId };

      for (const [sourceField, targetField] of Object.entries(mappings)) {
        if (row[sourceField] !== undefined && row[sourceField] !== '') {
          capacityData[targetField] = transformValue(targetField, row[sourceField]);
        }
      }

      const shopCode = capacityData.shopCode as string;
      const weekKey = capacityData.weekKey as string;

      if (!shopCode || !weekKey) {
        skippedCount++;
        continue;
      }

      // Find shop by code
      const shop = await prisma.shop.findFirst({
        where: { code: shopCode, companyId },
      });

      if (!shop) {
        errors.push({
          row: i + 2,
          field: 'shopCode',
          value: shopCode,
          message: `Shop with code "${shopCode}" not found`,
          severity: 'error',
        });
        skippedCount++;
        continue;
      }

      const existing = await prisma.weeklyCapacity.findUnique({
        where: { shopId_weekKey: { shopId: shop.id, weekKey } },
      });

      if (existing) {
        if (existing.isLocked) {
          errors.push({
            row: i + 2,
            field: 'weekKey',
            value: weekKey,
            message: `Capacity for week ${weekKey} is locked`,
            severity: 'error',
          });
          skippedCount++;
          continue;
        }

        await prisma.weeklyCapacity.update({
          where: { id: existing.id },
          data: {
            qualCapacity: (capacityData.qualCapacity as number) || existing.qualCapacity,
            assignCapacity: (capacityData.assignCapacity as number) || existing.assignCapacity,
            returnCapacity: (capacityData.returnCapacity as number) || existing.returnCapacity,
            repairCapacity: (capacityData.repairCapacity as number) || existing.repairCapacity,
            totalCapacity: (capacityData.totalCapacity as number) || existing.totalCapacity,
            notes: (capacityData.notes as string) || existing.notes,
          },
        });
        updatedCount++;
      } else {
        // Calculate week start date
        const [year, week] = weekKey.split('-W').map(Number);
        const weekStart = new Date(year, 0, 1 + (week - 1) * 7);

        await prisma.weeklyCapacity.create({
          data: {
            shopId: shop.id,
            weekKey,
            weekStartDate: weekStart,
            qualCapacity: (capacityData.qualCapacity as number) || 0,
            assignCapacity: (capacityData.assignCapacity as number) || 0,
            returnCapacity: (capacityData.returnCapacity as number) || 0,
            repairCapacity: (capacityData.repairCapacity as number) || 0,
            totalCapacity: (capacityData.totalCapacity as number) || 0,
            notes: (capacityData.notes as string) || '',
            companyId,
          },
        });
        importedCount++;
      }
    } catch (error) {
      errors.push({
        row: i + 2,
        field: 'general',
        value: '',
        message: String(error),
        severity: 'error',
      });
      skippedCount++;
    }
  }

  return {
    success: errors.length === 0,
    importedCount,
    updatedCount,
    skippedCount,
    errors,
  };
}

/**
 * Transform value based on target field type
 */
function transformValue(fieldName: string, value: unknown): unknown {
  const strValue = String(value).trim();

  // Boolean fields
  const booleanFields = [
    'isTankCar', 'isJacketed', 'isLined', 'tankQualified', 'performScheduled',
    'isActive', 'isAitxInternal',
  ];
  if (booleanFields.includes(fieldName)) {
    return strValue.toLowerCase() === 'true' ||
           strValue.toLowerCase() === 'yes' ||
           strValue === '1';
  }

  // Number fields
  const numberFields = [
    'projectedCost', 'buildYear', 'capacity', 'currentLoad', 'networkTier',
    'utilizationTarget', 'baseCostPerCar', 'laborRate', 'costIndex',
    'baseTurnTime', 'turnTimeMultiplier', 'qualCapacity', 'assignCapacity',
    'returnCapacity', 'repairCapacity', 'efficiencyRating', 'totalCapacity',
  ];
  if (numberFields.includes(fieldName)) {
    const num = parseFloat(strValue);
    return isNaN(num) ? 0 : num;
  }

  // Date fields
  const dateFields = ['tankQualDueDate', 'contractExpiration'];
  if (dateFields.includes(fieldName)) {
    const date = new Date(strValue);
    return isNaN(date.getTime()) ? null : date;
  }

  return strValue;
}

/**
 * Get import session by ID
 */
export async function getImportSession(sessionId: string): Promise<ImportSessionData> {
  const session = await prisma.importSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) throw new Error('Session not found');

  return formatSessionData(session);
}

/**
 * Format session data for response
 */
function formatSessionData(session: {
  id: string;
  status: string;
  currentStep: number;
  totalRows: number;
  validRows: number;
  errorRows: number;
  warningRows: number;
  validationErrors: string;
  validationWarnings: string;
  detectedHeaders: string;
  fieldMappings: string;
  unmappedFields: string;
  previewData: string;
}): ImportSessionData {
  return {
    id: session.id,
    status: session.status,
    currentStep: session.currentStep,
    totalRows: session.totalRows,
    validRows: session.validRows,
    errorRows: session.errorRows,
    warningRows: session.warningRows,
    validationErrors: JSON.parse(session.validationErrors || '[]'),
    validationWarnings: JSON.parse(session.validationWarnings || '[]'),
    detectedHeaders: JSON.parse(session.detectedHeaders || '[]'),
    fieldMappings: JSON.parse(session.fieldMappings || '{}'),
    unmappedFields: JSON.parse(session.unmappedFields || '[]'),
    previewData: JSON.parse(session.previewData || '[]'),
  };
}

/**
 * Get all import sessions for a company
 */
export async function getImportSessions(companyId: string, limit: number = 20) {
  const sessions = await prisma.importSession.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return sessions.map(formatSessionData);
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  createImportSession,
  validateImportSession,
  updateFieldMappings,
  executeImport,
  generateErrorReport,
  getErrorReportPath,
  getImportSession,
  getImportSessions,
};
