// Simple SQLite database service using better-sqlite3
// This provides a Prisma-like interface for basic operations
import Database from 'better-sqlite3';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const dbPath = path.join(__dirname, '../../prisma/dev.db');
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL'); // Better concurrent access

// =============================================================================
// SECURITY: Whitelist of allowed table and column names to prevent SQL injection
// =============================================================================
const ALLOWED_TABLES = new Set([
  'User', 'Company', 'Car', 'Shop', 'Plan', 'PlanAssignment', 'Scenario',
  'ScenarioCar', 'ScenarioModification', 'ScenarioCustomer', 'Customer', 'ShopRule', 'CarShopEligibility',
  'AuditLog', 'RolePermission', 'FieldSecurity', 'ShopPerformance', 'ReportTemplate',
  'ScheduledReport', 'ShopCapacitySlot', 'FilterPreset', 'LeaseContract',
  'LeaseQualificationEntry', 'QualificationPlanEvent', 'QualificationScenario',
  'QualificationPlanAssignment', 'QualificationPlanDocument', 'MasterPlan',
  'MasterPlanCommitment', 'Notification', 'WeeklyCapacity', 'CapacityAudit',
  'ShopHistory', 'MasterPlanVersion', 'IntegrationLog', 'ImportSession',
  'AllocationOverride', 'RateLimitEntry', 'Webhook', 'WebhookDelivery', 'ApiKey',
  'InvalidatedToken', 'CarFlowPlan', 'SOPCommitment', 'WebhookConfig',
]);

// Column name validation regex - only allows alphanumeric and underscores
const VALID_COLUMN_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Validates a table name against the whitelist
 * @throws Error if table name is not allowed
 */
function validateTableName(tableName: string): void {
  if (!ALLOWED_TABLES.has(tableName)) {
    throw new Error(`SECURITY: Invalid table name "${tableName}" - not in whitelist`);
  }
}

/**
 * Validates a column name to prevent SQL injection
 * @throws Error if column name contains invalid characters
 */
function validateColumnName(columnName: string): void {
  if (!VALID_COLUMN_REGEX.test(columnName)) {
    throw new Error(`SECURITY: Invalid column name "${columnName}" - contains invalid characters`);
  }
}

/**
 * Validates all column names in an object
 */
function validateColumnNames(obj: Record<string, any>): void {
  for (const key of Object.keys(obj)) {
    validateColumnName(key);
  }
}

// Helper to convert SQLite rows to proper types
function rowToObject<T>(row: any): T {
  if (!row) return row;
  const result: any = {};
  for (const key of Object.keys(row)) {
    const value = row[key];
    // Convert SQLite integers to booleans for known boolean fields
    if (typeof value === 'number' && ['isActive', 'isTankCar', 'isJacketed', 'isLined', 'tankQualified', 'performScheduled', 'isAitxInternal', 'isEligible', 'isBundled', 'wasRescheduled', 'isReleaseConfirmed', 'isBaseline', 'isApproved', 'pdfGenerated', 'isPublic', 'isGranted'].includes(key)) {
      result[key] = value === 1;
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

function rowsToObjects<T>(rows: any[]): T[] {
  return rows.map(row => rowToObject<T>(row));
}

// Generic query builder
interface WhereClause {
  [key: string]: any;
}

interface OrderByClause {
  [key: string]: 'asc' | 'desc';
}

interface FindManyOptions {
  where?: WhereClause;
  orderBy?: OrderByClause | OrderByClause[];
  take?: number;
  skip?: number;
  include?: { [key: string]: boolean | object };
}

interface FindUniqueOptions {
  where: WhereClause;
  include?: { [key: string]: boolean | object };
}

function buildWhereClause(where: WhereClause | undefined): { sql: string; params: any[] } {
  if (!where || Object.keys(where).length === 0) {
    return { sql: '', params: [] };
  }

  const conditions: string[] = [];
  const params: any[] = [];

  for (const [key, value] of Object.entries(where)) {
    // Handle Prisma compound unique key syntax (e.g., field1_field2_field3: { field1, field2, field3 })
    // These keys contain underscores that match multiple field names in the value object
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const valueKeys = Object.keys(value);
      const isCompoundKey = valueKeys.length > 0 &&
        !['gte', 'lte', 'gt', 'lt', 'contains', 'in', 'not', 'increment', 'decrement'].some(op => op in value) &&
        valueKeys.every(vk => key.includes(vk));

      if (isCompoundKey) {
        // Expand compound key into individual field conditions
        for (const [fieldName, fieldValue] of Object.entries(value)) {
          validateColumnName(fieldName);
          conditions.push(`"${fieldName}" = ?`);
          if (fieldValue instanceof Date) {
            params.push(fieldValue.toISOString());
          } else if (typeof fieldValue === 'boolean') {
            params.push(fieldValue ? 1 : 0);
          } else {
            params.push(fieldValue);
          }
        }
        continue;
      }
    }

    // SECURITY: Validate column name before using in query
    validateColumnName(key);

    if (value === null) {
      conditions.push(`"${key}" IS NULL`);
    } else if (typeof value === 'object' && value !== null) {
      // Handle operators like { gte, lte, contains, etc. }
      if ('gte' in value) {
        conditions.push(`"${key}" >= ?`);
        params.push(value.gte instanceof Date ? value.gte.toISOString() : value.gte);
      }
      if ('lte' in value) {
        conditions.push(`"${key}" <= ?`);
        params.push(value.lte instanceof Date ? value.lte.toISOString() : value.lte);
      }
      if ('gt' in value) {
        conditions.push(`"${key}" > ?`);
        params.push(value.gt instanceof Date ? value.gt.toISOString() : value.gt);
      }
      if ('lt' in value) {
        conditions.push(`"${key}" < ?`);
        params.push(value.lt instanceof Date ? value.lt.toISOString() : value.lt);
      }
      if ('contains' in value) {
        conditions.push(`"${key}" LIKE ?`);
        params.push(`%${value.contains}%`);
      }
      if ('in' in value && Array.isArray(value.in)) {
        // SECURITY FIX: Handle empty array to prevent SQL syntax error
        if (value.in.length === 0) {
          conditions.push('1 = 0'); // Always false - no results
        } else {
          conditions.push(`"${key}" IN (${value.in.map(() => '?').join(', ')})`);
          params.push(...value.in);
        }
      }
      if ('not' in value) {
        if (value.not === null) {
          conditions.push(`"${key}" IS NOT NULL`);
        } else {
          conditions.push(`"${key}" != ?`);
          params.push(value.not);
        }
      }
    } else {
      conditions.push(`"${key}" = ?`);
      params.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
    }
  }

  return {
    sql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params
  };
}

function buildOrderByClause(orderBy: OrderByClause | OrderByClause[] | undefined): string {
  if (!orderBy) return '';

  const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
  const parts = orders.map(o => {
    const [key, dir] = Object.entries(o)[0];
    // SECURITY: Validate column name before using in query
    validateColumnName(key);
    // Validate direction is only 'asc' or 'desc'
    const direction = dir.toUpperCase();
    if (direction !== 'ASC' && direction !== 'DESC') {
      throw new Error(`SECURITY: Invalid ORDER BY direction "${dir}"`);
    }
    return `"${key}" ${direction}`;
  });

  return parts.length > 0 ? `ORDER BY ${parts.join(', ')}` : '';
}

// =============================================================================
// RELATIONSHIP DEFINITIONS - Critical for include functionality
// =============================================================================
interface RelationshipDef {
  table: string;
  foreignKey: string;
  localKey: string;
  type: 'hasMany' | 'belongsTo' | 'hasOne';
}

const relationships: Record<string, Record<string, RelationshipDef>> = {
  Scenario: {
    cars: { table: 'ScenarioCar', foreignKey: 'scenarioId', localKey: 'id', type: 'hasMany' },
    customers: { table: 'ScenarioCustomer', foreignKey: 'scenarioId', localKey: 'id', type: 'hasMany' },
    basePlan: { table: 'Plan', foreignKey: 'id', localKey: 'basePlanId', type: 'belongsTo' },
    creator: { table: 'User', foreignKey: 'id', localKey: 'createdBy', type: 'belongsTo' },
    company: { table: 'Company', foreignKey: 'id', localKey: 'companyId', type: 'belongsTo' },
    parent: { table: 'Scenario', foreignKey: 'id', localKey: 'parentId', type: 'belongsTo' },
    clones: { table: 'Scenario', foreignKey: 'parentId', localKey: 'id', type: 'hasMany' },
    carFlowPlans: { table: 'CarFlowPlan', foreignKey: 'sourceScenarioId', localKey: 'id', type: 'hasMany' },
  },
  ScenarioCar: {
    car: { table: 'Car', foreignKey: 'id', localKey: 'carId', type: 'belongsTo' },
    scenario: { table: 'Scenario', foreignKey: 'id', localKey: 'scenarioId', type: 'belongsTo' },
    suggestedShop: { table: 'Shop', foreignKey: 'id', localKey: 'suggestedShopId', type: 'belongsTo' },
    assignedShop: { table: 'Shop', foreignKey: 'id', localKey: 'assignedShopId', type: 'belongsTo' },
  },
  Car: {
    company: { table: 'Company', foreignKey: 'id', localKey: 'companyId', type: 'belongsTo' },
    customerRef: { table: 'Customer', foreignKey: 'id', localKey: 'customerId', type: 'belongsTo' },
    assignments: { table: 'PlanAssignment', foreignKey: 'carId', localKey: 'id', type: 'hasMany' },
    scenarioCars: { table: 'ScenarioCar', foreignKey: 'carId', localKey: 'id', type: 'hasMany' },
    carFlowPlan: { table: 'CarFlowPlan', foreignKey: 'carId', localKey: 'id', type: 'hasOne' },
    shopEligibilities: { table: 'CarShopEligibility', foreignKey: 'carId', localKey: 'id', type: 'hasMany' },
    masterCommitments: { table: 'MasterPlanCommitment', foreignKey: 'carId', localKey: 'id', type: 'hasMany' },
  },
  Shop: {
    company: { table: 'Company', foreignKey: 'id', localKey: 'companyId', type: 'belongsTo' },
    assignments: { table: 'PlanAssignment', foreignKey: 'shopId', localKey: 'id', type: 'hasMany' },
    carEligibilities: { table: 'CarShopEligibility', foreignKey: 'shopId', localKey: 'id', type: 'hasMany' },
    sopCommitments: { table: 'SOPCommitment', foreignKey: 'shopId', localKey: 'id', type: 'hasMany' },
    masterCommitments: { table: 'MasterPlanCommitment', foreignKey: 'shopId', localKey: 'id', type: 'hasMany' },
    capacitySlots: { table: 'ShopCapacitySlot', foreignKey: 'shopId', localKey: 'id', type: 'hasMany' },
    carFlowPlans: { table: 'CarFlowPlan', foreignKey: 'shopId', localKey: 'id', type: 'hasMany' },
  },
  SOPCommitment: {
    shop: { table: 'Shop', foreignKey: 'id', localKey: 'shopId', type: 'belongsTo' },
    createdBy: { table: 'User', foreignKey: 'id', localKey: 'createdById', type: 'belongsTo' },
    updatedBy: { table: 'User', foreignKey: 'id', localKey: 'updatedById', type: 'belongsTo' },
  },
  ScenarioCustomer: {
    scenario: { table: 'Scenario', foreignKey: 'id', localKey: 'scenarioId', type: 'belongsTo' },
    customer: { table: 'Customer', foreignKey: 'id', localKey: 'customerId', type: 'belongsTo' },
  },
  CarFlowPlan: {
    car: { table: 'Car', foreignKey: 'id', localKey: 'carId', type: 'belongsTo' },
    shop: { table: 'Shop', foreignKey: 'id', localKey: 'shopId', type: 'belongsTo' },
    customer: { table: 'Customer', foreignKey: 'id', localKey: 'customerId', type: 'belongsTo' },
    sourceScenario: { table: 'Scenario', foreignKey: 'id', localKey: 'sourceScenarioId', type: 'belongsTo' },
    committedBy: { table: 'User', foreignKey: 'id', localKey: 'committedById', type: 'belongsTo' },
  },
  Plan: {
    company: { table: 'Company', foreignKey: 'id', localKey: 'companyId', type: 'belongsTo' },
    creator: { table: 'User', foreignKey: 'id', localKey: 'createdBy', type: 'belongsTo' },
    assignments: { table: 'PlanAssignment', foreignKey: 'planId', localKey: 'id', type: 'hasMany' },
    scenarios: { table: 'Scenario', foreignKey: 'basePlanId', localKey: 'id', type: 'hasMany' },
  },
  PlanAssignment: {
    plan: { table: 'Plan', foreignKey: 'id', localKey: 'planId', type: 'belongsTo' },
    car: { table: 'Car', foreignKey: 'id', localKey: 'carId', type: 'belongsTo' },
    shop: { table: 'Shop', foreignKey: 'id', localKey: 'shopId', type: 'belongsTo' },
  },
  MasterPlan: {
    company: { table: 'Company', foreignKey: 'id', localKey: 'companyId', type: 'belongsTo' },
    baseScenario: { table: 'Scenario', foreignKey: 'id', localKey: 'baseScenarioId', type: 'belongsTo' },
    approvedBy: { table: 'User', foreignKey: 'id', localKey: 'approvedById', type: 'belongsTo' },
    commitments: { table: 'MasterPlanCommitment', foreignKey: 'masterPlanId', localKey: 'id', type: 'hasMany' },
  },
  MasterPlanCommitment: {
    masterPlan: { table: 'MasterPlan', foreignKey: 'id', localKey: 'masterPlanId', type: 'belongsTo' },
    car: { table: 'Car', foreignKey: 'id', localKey: 'carId', type: 'belongsTo' },
    shop: { table: 'Shop', foreignKey: 'id', localKey: 'shopId', type: 'belongsTo' },
    customer: { table: 'Customer', foreignKey: 'id', localKey: 'customerId', type: 'belongsTo' },
  },
  Customer: {
    company: { table: 'Company', foreignKey: 'id', localKey: 'companyId', type: 'belongsTo' },
    cars: { table: 'Car', foreignKey: 'customerId', localKey: 'id', type: 'hasMany' },
    leaseContracts: { table: 'LeaseContract', foreignKey: 'customerId', localKey: 'id', type: 'hasMany' },
    masterCommitments: { table: 'MasterPlanCommitment', foreignKey: 'customerId', localKey: 'id', type: 'hasMany' },
  },
  User: {
    company: { table: 'Company', foreignKey: 'id', localKey: 'companyId', type: 'belongsTo' },
    plans: { table: 'Plan', foreignKey: 'createdBy', localKey: 'id', type: 'hasMany' },
    scenarios: { table: 'Scenario', foreignKey: 'createdBy', localKey: 'id', type: 'hasMany' },
  },
};

// =============================================================================
// INCLUDE RESOLVER - Fetches related data based on include option
// =============================================================================
async function resolveIncludes(tableName: string, records: any[], include: any): Promise<any[]> {
  if (!include || typeof include !== 'object' || Object.keys(include).length === 0) {
    return records;
  }

  const tableRels = relationships[tableName];
  if (!tableRels) {
    return records;
  }

  for (const [relationName, includeConfig] of Object.entries(include)) {
    const rel = tableRels[relationName];
    if (!rel) continue;

    // Handle boolean include or object with nested includes
    const nestedInclude = typeof includeConfig === 'object' && includeConfig !== null && !Array.isArray(includeConfig)
      ? (includeConfig as any).include
      : undefined;

    const selectFields = typeof includeConfig === 'object' && includeConfig !== null
      ? (includeConfig as any).select
      : undefined;

    if (rel.type === 'belongsTo') {
      // Fetch single related record for each parent
      const foreignKeyValues = records.map(r => r[rel.localKey]).filter(Boolean);
      if (foreignKeyValues.length === 0) {
        records.forEach(r => r[relationName] = null);
        continue;
      }

      const uniqueValues = [...new Set(foreignKeyValues)];
      const placeholders = uniqueValues.map(() => '?').join(', ');
      const selectClause = selectFields
        ? Object.keys(selectFields).filter(k => selectFields[k]).concat(['id']).join(', ')
        : '*';
      const query = `SELECT ${selectClause} FROM ${rel.table} WHERE ${rel.foreignKey} IN (${placeholders})`;

      let relatedRecords = db.prepare(query).all(...uniqueValues);
      relatedRecords = rowsToObjects(relatedRecords);

      // Resolve nested includes
      if (nestedInclude) {
        relatedRecords = await resolveIncludes(rel.table, relatedRecords, nestedInclude);
      }

      const relatedMap = new Map(relatedRecords.map(r => [r[rel.foreignKey], r]));
      records.forEach(r => {
        r[relationName] = r[rel.localKey] ? relatedMap.get(r[rel.localKey]) || null : null;
      });
    } else if (rel.type === 'hasMany') {
      // Fetch multiple related records for each parent
      const localKeyValues = records.map(r => r[rel.localKey]).filter(Boolean);
      if (localKeyValues.length === 0) {
        records.forEach(r => r[relationName] = []);
        continue;
      }

      const uniqueValues = [...new Set(localKeyValues)];
      const placeholders = uniqueValues.map(() => '?').join(', ');
      const selectClause = selectFields
        ? Object.keys(selectFields).filter(k => selectFields[k]).concat(['id', rel.foreignKey]).join(', ')
        : '*';

      // Handle orderBy in include
      let orderByClause = '';
      if (typeof includeConfig === 'object' && includeConfig !== null && (includeConfig as any).orderBy) {
        orderByClause = buildOrderByClause((includeConfig as any).orderBy);
      }

      const query = `SELECT ${selectClause} FROM ${rel.table} WHERE ${rel.foreignKey} IN (${placeholders}) ${orderByClause}`;

      let relatedRecords = db.prepare(query).all(...uniqueValues);
      relatedRecords = rowsToObjects(relatedRecords);

      // Resolve nested includes
      if (nestedInclude) {
        relatedRecords = await resolveIncludes(rel.table, relatedRecords, nestedInclude);
      }

      // Group by foreign key
      const groupedRecords = new Map<string, any[]>();
      relatedRecords.forEach(r => {
        const key = r[rel.foreignKey];
        if (!groupedRecords.has(key)) {
          groupedRecords.set(key, []);
        }
        groupedRecords.get(key)!.push(r);
      });

      records.forEach(r => {
        r[relationName] = groupedRecords.get(r[rel.localKey]) || [];
      });
    }
  }

  return records;
}

// Create a table handler
function createTableHandler(tableName: string) {
  // SECURITY: Validate table name at handler creation time
  validateTableName(tableName);

  return {
    findMany: async (options: FindManyOptions = {}) => {
      const { sql: whereClause, params } = buildWhereClause(options.where);
      const orderByClause = buildOrderByClause(options.orderBy);
      const limitClause = options.take ? `LIMIT ${options.take}` : '';
      const offsetClause = options.skip ? `OFFSET ${options.skip}` : '';

      const query = `SELECT * FROM "${tableName}" ${whereClause} ${orderByClause} ${limitClause} ${offsetClause}`;
      const rows = db.prepare(query).all(...params);
      let results = rowsToObjects(rows);

      // CRITICAL: Resolve includes to fetch related data
      if (options.include) {
        results = await resolveIncludes(tableName, results, options.include);
      }

      return results;
    },

    findFirst: async (options: FindManyOptions = {}) => {
      const results = await createTableHandler(tableName).findMany({ ...options, take: 1 });
      return results[0] || null;
    },

    findUnique: async (options: FindUniqueOptions) => {
      const { sql: whereClause, params } = buildWhereClause(options.where);
      const query = `SELECT * FROM "${tableName}" ${whereClause} LIMIT 1`;
      const row = db.prepare(query).get(...params);
      if (!row) return null;

      let result = rowToObject(row);

      // CRITICAL: Resolve includes to fetch related data
      if (options.include) {
        const resolved = await resolveIncludes(tableName, [result], options.include);
        result = resolved[0];
      }

      return result;
    },

    create: async (options: { data: any; include?: any }) => {
      const data = { ...options.data };

      // CRITICAL: Generate UUID if no id provided
      if (!data.id) {
        data.id = uuidv4();
      }

      // Add timestamps if not provided
      const now = new Date().toISOString();
      if (!data.createdAt) {
        data.createdAt = now;
      }
      if (!data.updatedAt) {
        data.updatedAt = now;
      }

      // Handle nested create/connect syntax
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'object' && value !== null && 'connect' in value) {
          // Replace { connect: { id: xxx } } with actual id
          const connectValue = value as { connect: { id: string } };
          data[`${key}Id`] = connectValue.connect.id;
          delete data[key];
        }
      }

      const keys = Object.keys(data);
      // SECURITY: Validate all column names
      keys.forEach(validateColumnName);

      const values = keys.map(k => {
        const v = data[k];
        if (typeof v === 'boolean') return v ? 1 : 0;
        if (v instanceof Date) return v.toISOString();
        return v;
      });

      const placeholders = keys.map(() => '?').join(', ');
      const quotedKeys = keys.map(k => `"${k}"`).join(', ');
      const query = `INSERT INTO "${tableName}" (${quotedKeys}) VALUES (${placeholders})`;

      try {
        db.prepare(query).run(...values);
      } catch (error: any) {
        console.error(`[DB] Create error in ${tableName}:`, error.message);
        throw error;
      }

      // Return the created record with includes if requested
      return await createTableHandler(tableName).findUnique({
        where: { id: data.id },
        include: options.include,
      });
    },

    update: async (options: { where: WhereClause; data: any; include?: any }) => {
      const { sql: whereClause, params: whereParams } = buildWhereClause(options.where);
      const data = { ...options.data, updatedAt: new Date().toISOString() };

      const keys = Object.keys(data);
      // SECURITY: Validate all column names
      keys.forEach(validateColumnName);

      const setParts: string[] = [];
      const setValues: any[] = [];

      for (const k of keys) {
        const v = data[k];
        // Handle Prisma increment/decrement syntax: { increment: N } or { decrement: N }
        if (typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date)) {
          if ('increment' in v && typeof v.increment === 'number') {
            setParts.push(`"${k}" = "${k}" + ?`);
            setValues.push(v.increment);
            continue;
          }
          if ('decrement' in v && typeof v.decrement === 'number') {
            setParts.push(`"${k}" = "${k}" - ?`);
            setValues.push(v.decrement);
            continue;
          }
        }
        // Standard value assignment
        setParts.push(`"${k}" = ?`);
        if (typeof v === 'boolean') {
          setValues.push(v ? 1 : 0);
        } else if (v instanceof Date) {
          setValues.push(v.toISOString());
        } else {
          setValues.push(v);
        }
      }

      const query = `UPDATE "${tableName}" SET ${setParts.join(', ')} ${whereClause}`;
      try {
        db.prepare(query).run(...setValues, ...whereParams);
      } catch (error: any) {
        console.error(`[DB] Update error in ${tableName}:`, error.message);
        throw error;
      }

      return await createTableHandler(tableName).findUnique({
        where: options.where,
        include: options.include,
      });
    },

    updateMany: async (options: { where?: WhereClause; data: any }) => {
      const { sql: whereClause, params: whereParams } = buildWhereClause(options.where);
      const data = { ...options.data, updatedAt: new Date().toISOString() };

      const keys = Object.keys(data);
      // SECURITY: Validate all column names
      keys.forEach(validateColumnName);

      const setParts: string[] = [];
      const setValues: any[] = [];

      for (const k of keys) {
        const v = data[k];
        // Handle Prisma increment/decrement syntax: { increment: N } or { decrement: N }
        if (typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date)) {
          if ('increment' in v && typeof v.increment === 'number') {
            setParts.push(`"${k}" = "${k}" + ?`);
            setValues.push(v.increment);
            continue;
          }
          if ('decrement' in v && typeof v.decrement === 'number') {
            setParts.push(`"${k}" = "${k}" - ?`);
            setValues.push(v.decrement);
            continue;
          }
        }
        // Standard value assignment
        setParts.push(`"${k}" = ?`);
        if (typeof v === 'boolean') {
          setValues.push(v ? 1 : 0);
        } else if (v instanceof Date) {
          setValues.push(v.toISOString());
        } else {
          setValues.push(v);
        }
      }

      const query = `UPDATE "${tableName}" SET ${setParts.join(', ')} ${whereClause}`;
      const result = db.prepare(query).run(...setValues, ...whereParams);
      return { count: result.changes };
    },

    createMany: async (options: { data: any[] }) => {
      const now = new Date().toISOString();
      let count = 0;

      for (const item of options.data) {
        // Generate UUID if no id provided
        if (!item.id) {
          item.id = uuidv4();
        }
        // Add timestamps
        if (!item.createdAt) {
          item.createdAt = now;
        }
        if (!item.updatedAt) {
          item.updatedAt = now;
        }

        const keys = Object.keys(item);
        // SECURITY: Validate all column names
        keys.forEach(validateColumnName);

        const values = keys.map(k => {
          const v = item[k];
          if (typeof v === 'boolean') return v ? 1 : 0;
          if (v instanceof Date) return v.toISOString();
          return v;
        });

        const placeholders = keys.map(() => '?').join(', ');
        const quotedKeys = keys.map(k => `"${k}"`).join(', ');
        const query = `INSERT INTO "${tableName}" (${quotedKeys}) VALUES (${placeholders})`;

        try {
          db.prepare(query).run(...values);
          count++;
        } catch (error: any) {
          console.error(`[DB] CreateMany error in ${tableName}:`, error.message);
          // Continue with other records
        }
      }

      return { count };
    },

    delete: async (options: { where: WhereClause }) => {
      const record = await createTableHandler(tableName).findUnique(options);
      const { sql: whereClause, params } = buildWhereClause(options.where);
      const query = `DELETE FROM "${tableName}" ${whereClause}`;
      db.prepare(query).run(...params);
      return record;
    },

    deleteMany: async (options: { where?: WhereClause } = {}) => {
      const { sql: whereClause, params } = buildWhereClause(options.where);
      const query = `DELETE FROM "${tableName}" ${whereClause}`;
      const result = db.prepare(query).run(...params);
      return { count: result.changes };
    },

    count: async (options: { where?: WhereClause } = {}) => {
      const { sql: whereClause, params } = buildWhereClause(options.where);
      const query = `SELECT COUNT(*) as count FROM "${tableName}" ${whereClause}`;
      const result = db.prepare(query).get(...params) as { count: number };
      return result.count;
    },

    upsert: async (options: { where: WhereClause; create: any; update: any }) => {
      const existing = await createTableHandler(tableName).findUnique({ where: options.where });
      if (existing) {
        return await createTableHandler(tableName).update({ where: options.where, data: options.update });
      } else {
        return await createTableHandler(tableName).create({ data: options.create });
      }
    },

    groupBy: async (options: { by: string[]; where?: WhereClause; _count?: { [key: string]: boolean }; _sum?: { [key: string]: boolean }; _avg?: { [key: string]: boolean }; _min?: { [key: string]: boolean }; _max?: { [key: string]: boolean } }) => {
      const { by, where, _count, _sum, _avg, _min, _max } = options;

      // SECURITY: Validate all column names in 'by'
      by.forEach(validateColumnName);

      const groupByColumns = by.map(col => `"${col}"`).join(', ');

      // Build aggregation expressions
      const aggregations: string[] = [];

      if (_count) {
        for (const [field, enabled] of Object.entries(_count)) {
          if (enabled) {
            validateColumnName(field);
            aggregations.push(`COUNT("${field}") as "_count_${field}"`);
          }
        }
      }

      if (_sum) {
        for (const [field, enabled] of Object.entries(_sum)) {
          if (enabled) {
            validateColumnName(field);
            aggregations.push(`SUM("${field}") as "_sum_${field}"`);
          }
        }
      }

      if (_avg) {
        for (const [field, enabled] of Object.entries(_avg)) {
          if (enabled) {
            validateColumnName(field);
            aggregations.push(`AVG("${field}") as "_avg_${field}"`);
          }
        }
      }

      if (_min) {
        for (const [field, enabled] of Object.entries(_min)) {
          if (enabled) {
            validateColumnName(field);
            aggregations.push(`MIN("${field}") as "_min_${field}"`);
          }
        }
      }

      if (_max) {
        for (const [field, enabled] of Object.entries(_max)) {
          if (enabled) {
            validateColumnName(field);
            aggregations.push(`MAX("${field}") as "_max_${field}"`);
          }
        }
      }

      const selectClause = aggregations.length > 0
        ? `${groupByColumns}, ${aggregations.join(', ')}`
        : groupByColumns;

      const { sql: whereClause, params } = buildWhereClause(where);
      const query = `SELECT ${selectClause} FROM "${tableName}" ${whereClause} GROUP BY ${groupByColumns}`;

      const rows = db.prepare(query).all(...params);

      // Transform results to match Prisma's groupBy format
      return rows.map((row: any) => {
        const result: any = {};

        // Add grouped columns
        for (const col of by) {
          result[col] = row[col];
        }

        // Transform aggregation results to Prisma format
        if (_count) {
          result._count = {};
          for (const field of Object.keys(_count)) {
            result._count[field] = row[`_count_${field}`] || 0;
          }
        }

        if (_sum) {
          result._sum = {};
          for (const field of Object.keys(_sum)) {
            result._sum[field] = row[`_sum_${field}`] || 0;
          }
        }

        if (_avg) {
          result._avg = {};
          for (const field of Object.keys(_avg)) {
            result._avg[field] = row[`_avg_${field}`] || 0;
          }
        }

        if (_min) {
          result._min = {};
          for (const field of Object.keys(_min)) {
            result._min[field] = row[`_min_${field}`];
          }
        }

        if (_max) {
          result._max = {};
          for (const field of Object.keys(_max)) {
            result._max[field] = row[`_max_${field}`];
          }
        }

        return result;
      });
    }
  };
}

// Export a Prisma-like interface
export const prisma = {
  user: createTableHandler('User'),
  company: createTableHandler('Company'),
  car: createTableHandler('Car'),
  shop: createTableHandler('Shop'),
  plan: createTableHandler('Plan'),
  planAssignment: createTableHandler('PlanAssignment'),
  scenario: createTableHandler('Scenario'),
  scenarioCar: createTableHandler('ScenarioCar'),
  scenarioModification: createTableHandler('ScenarioModification'),
  scenarioCustomer: createTableHandler('ScenarioCustomer'),
  customer: createTableHandler('Customer'),
  filterPreset: createTableHandler('FilterPreset'),
  shopRule: createTableHandler('ShopRule'),
  carShopEligibility: createTableHandler('CarShopEligibility'),
  auditLog: createTableHandler('AuditLog'),
  rolePermission: createTableHandler('RolePermission'),
  fieldSecurity: createTableHandler('FieldSecurity'),
  shopPerformance: createTableHandler('ShopPerformance'),
  reportTemplate: createTableHandler('ReportTemplate'),
  scheduledReport: createTableHandler('ScheduledReport'),
  shopCapacitySlot: createTableHandler('ShopCapacitySlot'),
  leaseContract: createTableHandler('LeaseContract'),
  leaseQualificationEntry: createTableHandler('LeaseQualificationEntry'),
  qualificationPlanEvent: createTableHandler('QualificationPlanEvent'),
  qualificationScenario: createTableHandler('QualificationScenario'),
  qualificationPlanAssignment: createTableHandler('QualificationPlanAssignment'),
  qualificationPlanDocument: createTableHandler('QualificationPlanDocument'),

  // MasterPlan tables (Gold Standard feature)
  masterPlan: createTableHandler('MasterPlan'),
  masterPlanCommitment: createTableHandler('MasterPlanCommitment'),

  // Notification table
  notification: createTableHandler('Notification'),

  // SOPAssignment table
  sOPAssignment: createTableHandler('SOPAssignment'),

  // Gold Standard Wizard tables
  weeklyCapacity: createTableHandler('WeeklyCapacity'),
  capacityAudit: createTableHandler('CapacityAudit'),
  shopHistory: createTableHandler('ShopHistory'),
  masterPlanVersion: createTableHandler('MasterPlanVersion'),
  integrationLog: createTableHandler('IntegrationLog'),
  importSession: createTableHandler('ImportSession'),
  allocationOverride: createTableHandler('AllocationOverride'),

  // Rate limiting table
  rateLimitEntry: createTableHandler('RateLimitEntry'),

  // Webhook tables
  webhook: createTableHandler('Webhook'),
  webhookDelivery: createTableHandler('WebhookDelivery'),

  // API Key table
  apiKey: createTableHandler('ApiKey'),

  // Token blacklist table
  invalidatedToken: createTableHandler('InvalidatedToken'),

  // Car Flow Planning tables
  carFlowPlan: createTableHandler('CarFlowPlan'),
  sOPCommitment: createTableHandler('SOPCommitment'),

  // Webhook configuration table
  webhookConfig: createTableHandler('WebhookConfig'),

  // Raw query support - SECURITY: Use parameterized queries only
  // WARNING: These functions should be used sparingly and only with parameterized queries
  $queryRaw: async (query: string, ...params: any[]) => {
    // SECURITY: Log raw query usage for audit
    console.warn('[DB SECURITY] Raw query executed - ensure this is intentional:', query.substring(0, 100));
    if (query.includes('--') || query.includes(';') && params.length === 0) {
      throw new Error('SECURITY: Potential SQL injection detected in raw query');
    }
    return db.prepare(query).all(...params);
  },

  // SECURITY: This function is intentionally restrictive
  $queryRawUnsafe: async (query: string, ...params: any[]) => {
    // SECURITY: Block dangerous patterns
    const dangerousPatterns = [/DROP\s+TABLE/i, /DELETE\s+FROM\s+\w+\s*$/i, /TRUNCATE/i, /ALTER\s+TABLE/i];
    for (const pattern of dangerousPatterns) {
      if (pattern.test(query)) {
        throw new Error('SECURITY: Dangerous SQL pattern blocked in raw query');
      }
    }
    console.warn('[DB SECURITY] Unsafe raw query executed:', query.substring(0, 100));
    return db.prepare(query).all(...params);
  },

  // Transaction support - SQLite transaction with proper async handling
  // Note: better-sqlite3 transactions are synchronous, but we wrap them
  // to provide a consistent async interface with Prisma
  $transaction: async <T>(
    fnOrOperations: ((tx: typeof prisma) => Promise<T>) | Promise<any>[]
  ): Promise<T | any[]> => {
    if (Array.isArray(fnOrOperations)) {
      // Array of promises - resolve them first, then run in transaction
      // Note: The promises have already started executing, so this is
      // more of a "batch commit" pattern than a true transaction
      const results = await Promise.all(fnOrOperations);
      return results;
    } else {
      // Function-based transaction - execute the async function
      // The operations inside will each be atomic, but the whole
      // sequence uses SQLite's implicit transaction handling
      try {
        db.exec('BEGIN IMMEDIATE');
        const result = await fnOrOperations(prisma);
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
  },

  // Execute raw SQL
  $executeRaw: async (query: string, ...params: any[]) => {
    const result = db.prepare(query).run(...params);
    return result.changes;
  },

  $executeRawUnsafe: async (query: string, ...params: any[]) => {
    const result = db.prepare(query).run(...params);
    return result.changes;
  },

  // Disconnect (no-op for better-sqlite3)
  $disconnect: async () => {},

  // Get raw database for direct operations
  $raw: db,
};

export default prisma;
