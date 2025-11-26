// Custom Report Builder Service
// Supports custom column selection, filters, and multiple output formats
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Available columns for each entity type
export const ENTITY_COLUMNS: Record<string, {
  key: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  sortable: boolean;
  filterable: boolean;
  defaultVisible: boolean;
}[]> = {
  Car: [
    { key: 'railcarNumber', label: 'Railcar Number', type: 'string', sortable: true, filterable: true, defaultVisible: true },
    { key: 'carType', label: 'Car Type', type: 'string', sortable: true, filterable: true, defaultVisible: true },
    { key: 'isTankCar', label: 'Tank Car', type: 'boolean', sortable: true, filterable: true, defaultVisible: false },
    { key: 'commodity', label: 'Commodity', type: 'string', sortable: true, filterable: true, defaultVisible: true },
    { key: 'customer', label: 'Customer', type: 'string', sortable: true, filterable: true, defaultVisible: true },
    { key: 'projectNumber', label: 'Project Number', type: 'string', sortable: true, filterable: true, defaultVisible: true },
    { key: 'reasonShopped', label: 'Reason Shopped', type: 'string', sortable: true, filterable: true, defaultVisible: true },
    { key: 'status', label: 'Status', type: 'string', sortable: true, filterable: true, defaultVisible: true },
    { key: 'currentLocation', label: 'Current Location', type: 'string', sortable: true, filterable: true, defaultVisible: false },
    { key: 'projectedCompletionMonth', label: 'Projected Completion', type: 'string', sortable: true, filterable: true, defaultVisible: true },
    { key: 'projectedCost', label: 'Projected Cost', type: 'number', sortable: true, filterable: true, defaultVisible: true },
    { key: 'daysInShop', label: 'Days In Shop', type: 'number', sortable: true, filterable: true, defaultVisible: true },
    { key: 'homeRegion', label: 'Home Region', type: 'string', sortable: true, filterable: true, defaultVisible: false },
    { key: 'originRegion', label: 'Origin Region', type: 'string', sortable: true, filterable: true, defaultVisible: false },
    { key: 'shopEntryDate', label: 'Shop Entry Date', type: 'date', sortable: true, filterable: true, defaultVisible: false },
    { key: 'lastServiceDate', label: 'Last Service Date', type: 'date', sortable: true, filterable: true, defaultVisible: false },
    { key: 'nextServiceDue', label: 'Next Service Due', type: 'date', sortable: true, filterable: true, defaultVisible: false },
    { key: 'notes', label: 'Notes', type: 'string', sortable: false, filterable: false, defaultVisible: false },
  ],
  Shop: [
    { key: 'name', label: 'Shop Name', type: 'string', sortable: true, filterable: true, defaultVisible: true },
    { key: 'code', label: 'Shop Code', type: 'string', sortable: true, filterable: true, defaultVisible: true },
    { key: 'location', label: 'Location', type: 'string', sortable: true, filterable: true, defaultVisible: true },
    { key: 'city', label: 'City', type: 'string', sortable: true, filterable: true, defaultVisible: false },
    { key: 'state', label: 'State', type: 'string', sortable: true, filterable: true, defaultVisible: false },
    { key: 'region', label: 'Region', type: 'string', sortable: true, filterable: true, defaultVisible: true },
    { key: 'network', label: 'Network', type: 'string', sortable: true, filterable: true, defaultVisible: true },
    { key: 'servingRailroad', label: 'Serving Railroad', type: 'string', sortable: true, filterable: true, defaultVisible: true },
    { key: 'isAitxInternal', label: 'AITX Internal', type: 'boolean', sortable: true, filterable: true, defaultVisible: false },
    { key: 'tankQualified', label: 'Tank Qualified', type: 'boolean', sortable: true, filterable: true, defaultVisible: true },
    { key: 'networkTier', label: 'Network Tier', type: 'number', sortable: true, filterable: true, defaultVisible: true },
    { key: 'shopStatus', label: 'Shop Status', type: 'string', sortable: true, filterable: true, defaultVisible: true },
    { key: 'capacity', label: 'Monthly Capacity', type: 'number', sortable: true, filterable: true, defaultVisible: true },
    { key: 'currentLoad', label: 'Current Load', type: 'number', sortable: true, filterable: true, defaultVisible: true },
    { key: 'utilizationTarget', label: 'Utilization Target', type: 'number', sortable: true, filterable: true, defaultVisible: false },
    { key: 'baseCostPerCar', label: 'Base Cost/Car', type: 'number', sortable: true, filterable: true, defaultVisible: true },
    { key: 'laborRate', label: 'Labor Rate', type: 'number', sortable: true, filterable: true, defaultVisible: false },
    { key: 'costIndex', label: 'Cost Index', type: 'number', sortable: true, filterable: true, defaultVisible: false },
    { key: 'baseTurnTime', label: 'Base Turn Time', type: 'number', sortable: true, filterable: true, defaultVisible: true },
    { key: 'capabilities', label: 'Capabilities', type: 'string', sortable: false, filterable: true, defaultVisible: false },
    { key: 'certifications', label: 'Certifications', type: 'string', sortable: false, filterable: true, defaultVisible: false },
  ],
  Plan: [
    { key: 'name', label: 'Plan Name', type: 'string', sortable: true, filterable: true, defaultVisible: true },
    { key: 'description', label: 'Description', type: 'string', sortable: false, filterable: true, defaultVisible: true },
    { key: 'startDate', label: 'Start Date', type: 'date', sortable: true, filterable: true, defaultVisible: true },
    { key: 'endDate', label: 'End Date', type: 'date', sortable: true, filterable: true, defaultVisible: true },
    { key: 'status', label: 'Status', type: 'string', sortable: true, filterable: true, defaultVisible: true },
  ],
  Assignment: [
    { key: 'car.railcarNumber', label: 'Railcar Number', type: 'string', sortable: true, filterable: true, defaultVisible: true },
    { key: 'car.carType', label: 'Car Type', type: 'string', sortable: true, filterable: true, defaultVisible: true },
    { key: 'car.customer', label: 'Customer', type: 'string', sortable: true, filterable: true, defaultVisible: true },
    { key: 'shop.name', label: 'Assigned Shop', type: 'string', sortable: true, filterable: true, defaultVisible: true },
    { key: 'shop.region', label: 'Shop Region', type: 'string', sortable: true, filterable: true, defaultVisible: false },
    { key: 'scheduledMonth', label: 'Scheduled Month', type: 'string', sortable: true, filterable: true, defaultVisible: true },
    { key: 'estimatedCost', label: 'Estimated Cost', type: 'number', sortable: true, filterable: true, defaultVisible: true },
    { key: 'estimatedDuration', label: 'Est. Duration (days)', type: 'number', sortable: true, filterable: true, defaultVisible: true },
    { key: 'status', label: 'Status', type: 'string', sortable: true, filterable: true, defaultVisible: true },
    { key: 'notes', label: 'Notes', type: 'string', sortable: false, filterable: false, defaultVisible: false },
  ],
  Scenario: [
    { key: 'projectNumber', label: 'Project Number', type: 'string', sortable: true, filterable: true, defaultVisible: true },
    { key: 'name', label: 'Scenario Name', type: 'string', sortable: true, filterable: true, defaultVisible: true },
    { key: 'description', label: 'Description', type: 'string', sortable: false, filterable: true, defaultVisible: true },
    { key: 'customerFilter', label: 'Customer Filter', type: 'string', sortable: true, filterable: true, defaultVisible: true },
    { key: 'status', label: 'Status', type: 'string', sortable: true, filterable: true, defaultVisible: true },
    { key: 'carCount', label: 'Car Count', type: 'number', sortable: true, filterable: false, defaultVisible: true },
  ],
};

// Filter operators
export type FilterOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'greaterThan'
  | 'lessThan'
  | 'greaterThanOrEqual'
  | 'lessThanOrEqual'
  | 'between'
  | 'in'
  | 'isNull'
  | 'isNotNull';

export interface FilterCriteria {
  field: string;
  operator: FilterOperator;
  value: unknown;
  value2?: unknown; // For 'between' operator
}

export interface SortConfig {
  field: string;
  direction: 'asc' | 'desc';
}

export interface ReportConfig {
  entityType: string;
  columns: string[];
  filters: FilterCriteria[];
  sort?: SortConfig;
  groupBy?: string;
}

// Get available columns for an entity type
export function getAvailableColumns(entityType: string) {
  return ENTITY_COLUMNS[entityType] || [];
}

// Build Prisma where clause from filters
function buildWhereClause(filters: FilterCriteria[]): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  for (const filter of filters) {
    const { field, operator, value, value2 } = filter;

    // Handle nested fields (e.g., 'car.railcarNumber')
    const fieldPath = field.split('.');
    let target = where;

    for (let i = 0; i < fieldPath.length - 1; i++) {
      const key = fieldPath[i];
      if (!target[key]) target[key] = {};
      target = target[key] as Record<string, unknown>;
    }

    const finalField = fieldPath[fieldPath.length - 1];

    switch (operator) {
      case 'equals':
        target[finalField] = value;
        break;
      case 'notEquals':
        target[finalField] = { not: value };
        break;
      case 'contains':
        target[finalField] = { contains: value, mode: 'insensitive' };
        break;
      case 'startsWith':
        target[finalField] = { startsWith: value, mode: 'insensitive' };
        break;
      case 'endsWith':
        target[finalField] = { endsWith: value, mode: 'insensitive' };
        break;
      case 'greaterThan':
        target[finalField] = { gt: value };
        break;
      case 'lessThan':
        target[finalField] = { lt: value };
        break;
      case 'greaterThanOrEqual':
        target[finalField] = { gte: value };
        break;
      case 'lessThanOrEqual':
        target[finalField] = { lte: value };
        break;
      case 'between':
        target[finalField] = { gte: value, lte: value2 };
        break;
      case 'in':
        target[finalField] = { in: value };
        break;
      case 'isNull':
        target[finalField] = null;
        break;
      case 'isNotNull':
        target[finalField] = { not: null };
        break;
    }
  }

  return where;
}

// Execute a report query
export async function executeReport(
  config: ReportConfig,
  companyId: string
): Promise<{ data: Record<string, unknown>[]; total: number }> {
  const { entityType, columns, filters, sort, groupBy } = config;

  // Build where clause
  const baseWhere = buildWhereClause(filters);
  baseWhere.companyId = companyId;

  // Build orderBy
  const orderBy: Record<string, string> | Record<string, string>[] = sort
    ? { [sort.field]: sort.direction }
    : { createdAt: 'desc' };

  // Build select based on columns
  const select: Record<string, boolean | Record<string, boolean>> = {};
  for (const col of columns) {
    const parts = col.split('.');
    if (parts.length === 1) {
      select[parts[0]] = true;
    } else {
      // Handle nested selections
      if (!select[parts[0]]) select[parts[0]] = { select: {} };
      (select[parts[0]] as Record<string, Record<string, boolean>>).select[parts[1]] = true;
    }
  }
  // Always include id
  select.id = true;

  let data: Record<string, unknown>[] = [];
  let total = 0;

  switch (entityType) {
    case 'Car':
      [data, total] = await Promise.all([
        prisma.car.findMany({
          where: baseWhere,
          select: Object.keys(select).length > 1 ? select : undefined,
          orderBy,
        }),
        prisma.car.count({ where: baseWhere }),
      ]);
      break;

    case 'Shop':
      [data, total] = await Promise.all([
        prisma.shop.findMany({
          where: baseWhere,
          select: Object.keys(select).length > 1 ? select : undefined,
          orderBy,
        }),
        prisma.shop.count({ where: baseWhere }),
      ]);
      break;

    case 'Plan':
      [data, total] = await Promise.all([
        prisma.plan.findMany({
          where: baseWhere,
          select: Object.keys(select).length > 1 ? select : undefined,
          orderBy,
        }),
        prisma.plan.count({ where: baseWhere }),
      ]);
      break;

    case 'Assignment':
      [data, total] = await Promise.all([
        prisma.planAssignment.findMany({
          where: baseWhere,
          include: { car: true, shop: true },
          orderBy,
        }),
        prisma.planAssignment.count({ where: baseWhere }),
      ]);
      break;

    case 'Scenario':
      [data, total] = await Promise.all([
        prisma.scenario.findMany({
          where: baseWhere,
          include: { _count: { select: { cars: true } } },
          orderBy,
        }),
        prisma.scenario.count({ where: baseWhere }),
      ]);
      // Map car count
      data = data.map(s => ({
        ...s,
        carCount: (s as Record<string, unknown>)._count?.cars || 0,
      }));
      break;

    default:
      throw new Error(`Unknown entity type: ${entityType}`);
  }

  // Apply grouping if specified
  if (groupBy) {
    const grouped: Record<string, Record<string, unknown>[]> = {};
    for (const row of data) {
      const key = String(getNestedValue(row, groupBy) || 'Ungrouped');
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(row);
    }
    data = Object.entries(grouped).map(([group, items]) => ({
      _group: group,
      _count: items.length,
      items,
    }));
  }

  return { data, total };
}

// Get nested value from object
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// Flatten nested objects for export
function flattenForExport(data: Record<string, unknown>[], columns: string[]): Record<string, unknown>[] {
  return data.map(row => {
    const flat: Record<string, unknown> = {};
    for (const col of columns) {
      flat[col] = getNestedValue(row, col);
    }
    return flat;
  });
}

// Generate CSV from report data
export function generateCSV(
  data: Record<string, unknown>[],
  columns: string[],
  entityType: string
): string {
  const columnDefs = ENTITY_COLUMNS[entityType] || [];

  // Header row
  const headers = columns.map(col => {
    const def = columnDefs.find(c => c.key === col);
    return def?.label || col;
  });

  const rows = [headers.join(',')];

  // Data rows
  const flatData = flattenForExport(data, columns);
  for (const row of flatData) {
    const values = columns.map(col => {
      const value = row[col];
      if (value == null) return '';
      if (typeof value === 'string') {
        // Escape quotes and wrap in quotes if contains comma or newline
        const escaped = value.replace(/"/g, '""');
        return escaped.includes(',') || escaped.includes('\n') ? `"${escaped}"` : escaped;
      }
      if (value instanceof Date) {
        return value.toISOString();
      }
      return String(value);
    });
    rows.push(values.join(','));
  }

  return rows.join('\n');
}

// Generate Excel-compatible data (JSON for frontend processing with xlsx library)
export function generateExcelData(
  data: Record<string, unknown>[],
  columns: string[],
  entityType: string
): { headers: string[]; rows: unknown[][] } {
  const columnDefs = ENTITY_COLUMNS[entityType] || [];

  const headers = columns.map(col => {
    const def = columnDefs.find(c => c.key === col);
    return def?.label || col;
  });

  const flatData = flattenForExport(data, columns);
  const rows = flatData.map(row => columns.map(col => row[col]));

  return { headers, rows };
}

// Save report template
export async function saveTemplate(
  name: string,
  description: string,
  config: ReportConfig,
  outputFormats: string[],
  isPublic: boolean,
  createdById: string,
  companyId: string
) {
  return prisma.reportTemplate.create({
    data: {
      name,
      description,
      entityType: config.entityType,
      columns: JSON.stringify(config.columns),
      filters: JSON.stringify(config.filters),
      sortConfig: JSON.stringify(config.sort || {}),
      groupBy: config.groupBy || '',
      outputFormats: JSON.stringify(outputFormats),
      isPublic,
      createdById,
      companyId,
    },
  });
}

// Get report templates
export async function getTemplates(companyId: string, userId: string) {
  const templates = await prisma.reportTemplate.findMany({
    where: {
      companyId,
      OR: [
        { isPublic: true },
        { createdById: userId },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });

  return templates.map(t => ({
    ...t,
    columns: JSON.parse(t.columns),
    filters: JSON.parse(t.filters),
    sortConfig: JSON.parse(t.sortConfig),
    outputFormats: JSON.parse(t.outputFormats),
  }));
}

// Get a single template
export async function getTemplate(templateId: string, companyId: string) {
  const template = await prisma.reportTemplate.findFirst({
    where: { id: templateId, companyId },
  });

  if (!template) return null;

  return {
    ...template,
    columns: JSON.parse(template.columns),
    filters: JSON.parse(template.filters),
    sortConfig: JSON.parse(template.sortConfig),
    outputFormats: JSON.parse(template.outputFormats),
  };
}

// Update template
export async function updateTemplate(
  templateId: string,
  updates: Partial<{
    name: string;
    description: string;
    columns: string[];
    filters: FilterCriteria[];
    sortConfig: SortConfig;
    groupBy: string;
    outputFormats: string[];
    isPublic: boolean;
  }>,
  companyId: string
) {
  const data: Record<string, unknown> = {};
  if (updates.name) data.name = updates.name;
  if (updates.description !== undefined) data.description = updates.description;
  if (updates.columns) data.columns = JSON.stringify(updates.columns);
  if (updates.filters) data.filters = JSON.stringify(updates.filters);
  if (updates.sortConfig) data.sortConfig = JSON.stringify(updates.sortConfig);
  if (updates.groupBy !== undefined) data.groupBy = updates.groupBy;
  if (updates.outputFormats) data.outputFormats = JSON.stringify(updates.outputFormats);
  if (updates.isPublic !== undefined) data.isPublic = updates.isPublic;

  return prisma.reportTemplate.updateMany({
    where: { id: templateId, companyId },
    data,
  });
}

// Delete template
export async function deleteTemplate(templateId: string, companyId: string) {
  return prisma.reportTemplate.deleteMany({
    where: { id: templateId, companyId },
  });
}

export default {
  ENTITY_COLUMNS,
  getAvailableColumns,
  executeReport,
  generateCSV,
  generateExcelData,
  saveTemplate,
  getTemplates,
  getTemplate,
  updateTemplate,
  deleteTemplate,
};
