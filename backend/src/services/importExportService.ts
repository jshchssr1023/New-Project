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
  VALID_SYSTEM_FIELDS,
  REQUIRED_FIELDS,
} from '../utils/importTransformers';

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
 * Import cars from CSV
 */
export async function importCars(
  csvContent: string,
  companyId: string,
  options: {
    updateExisting?: boolean;
    customMappings?: Record<string, string>;
    dryRun?: boolean;
  } = {}
): Promise<ImportResult> {
  const startTime = Date.now();
  const { updateExisting = true, customMappings, dryRun = false } = options;

  const { headers, rows } = parseCSV(csvContent);
  const headerAnalysis = analyzeHeaders(headers);
  const mappings = { ...headerAnalysis.mappings, ...customMappings };

  const objects = rowsToObjects(headers, rows);
  const errors: { row: number; identifier: string; error: string }[] = [];
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  // Get existing cars for duplicate detection
  const existingCars = await prisma.car.findMany({
    where: { companyId },
    select: { id: true, vehicleNumber: true },
  });
  const existingByNumber = new Map(existingCars.map(c => [c.vehicleNumber.toLowerCase(), c.id]));

  for (let i = 0; i < objects.length; i++) {
    const result = transformCarRecord(objects[i], mappings);
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
    const vehicleNumber = String(carData.railcarNumber);
    const existingId = existingByNumber.get(vehicleNumber.toLowerCase());

    try {
      if (existingId) {
        if (updateExisting) {
          if (!dryRun) {
            await prisma.car.update({
              where: { id: existingId },
              data: {
                vehicleNumber: vehicleNumber,
                carType: String(carData.carType || ''),
                isTankCar: Boolean(carData.isTankCar),
                commodity: String(carData.commodity || ''),
                customer: String(carData.customer || ''),
                status: String(carData.status || 'available'),
                currentLocation: String(carData.currentLocation || ''),
                homeRegion: String(carData.homeRegion || ''),
                originRegion: String(carData.originRegion || ''),
                reasonShopped: String(carData.reasonShopped || ''),
                projectedCost: Number(carData.projectedCost) || 0,
                daysInShop: Number(carData.daysInShop) || 0,
                shopEntryDate: carData.shopEntryDate as Date | null,
                lastServiceDate: carData.lastServiceDate as Date | null,
                nextServiceDue: carData.nextServiceDue as Date | null,
                notes: String(carData.notes || ''),
              },
            });
          }
          updated++;
        } else {
          skipped++;
        }
      } else {
        if (!dryRun) {
          await prisma.car.create({
            data: {
              vehicleNumber: vehicleNumber,
              carType: String(carData.carType || ''),
              isTankCar: Boolean(carData.isTankCar),
              commodity: String(carData.commodity || ''),
              customer: String(carData.customer || ''),
              status: String(carData.status || 'available'),
              currentLocation: String(carData.currentLocation || ''),
              homeRegion: String(carData.homeRegion || ''),
              originRegion: String(carData.originRegion || ''),
              reasonShopped: String(carData.reasonShopped || ''),
              projectedCost: Number(carData.projectedCost) || 0,
              daysInShop: Number(carData.daysInShop) || 0,
              shopEntryDate: carData.shopEntryDate as Date | null,
              lastServiceDate: carData.lastServiceDate as Date | null,
              nextServiceDue: carData.nextServiceDue as Date | null,
              notes: String(carData.notes || ''),
              companyId,
            },
          });
        }
        imported++;
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push({ row: rowNum, identifier: vehicleNumber, error: errMsg });
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
