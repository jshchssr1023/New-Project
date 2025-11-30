// Simple SQLite database service using better-sqlite3
// This provides a Prisma-like interface for basic operations
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(__dirname, '../../prisma/dev.db');
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

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
    if (value === null) {
      conditions.push(`${key} IS NULL`);
    } else if (typeof value === 'object' && value !== null) {
      // Handle operators like { gte, lte, contains, etc. }
      if ('gte' in value) {
        conditions.push(`${key} >= ?`);
        params.push(value.gte);
      }
      if ('lte' in value) {
        conditions.push(`${key} <= ?`);
        params.push(value.lte);
      }
      if ('gt' in value) {
        conditions.push(`${key} > ?`);
        params.push(value.gt);
      }
      if ('lt' in value) {
        conditions.push(`${key} < ?`);
        params.push(value.lt);
      }
      if ('contains' in value) {
        conditions.push(`${key} LIKE ?`);
        params.push(`%${value.contains}%`);
      }
      if ('in' in value && Array.isArray(value.in)) {
        conditions.push(`${key} IN (${value.in.map(() => '?').join(', ')})`);
        params.push(...value.in);
      }
      if ('not' in value) {
        if (value.not === null) {
          conditions.push(`${key} IS NOT NULL`);
        } else {
          conditions.push(`${key} != ?`);
          params.push(value.not);
        }
      }
    } else {
      conditions.push(`${key} = ?`);
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
    return `${key} ${dir.toUpperCase()}`;
  });

  return parts.length > 0 ? `ORDER BY ${parts.join(', ')}` : '';
}

// Create a table handler
function createTableHandler(tableName: string) {
  return {
    findMany: async (options: FindManyOptions = {}) => {
      const { sql: whereClause, params } = buildWhereClause(options.where);
      const orderByClause = buildOrderByClause(options.orderBy);
      const limitClause = options.take ? `LIMIT ${options.take}` : '';
      const offsetClause = options.skip ? `OFFSET ${options.skip}` : '';

      const query = `SELECT * FROM ${tableName} ${whereClause} ${orderByClause} ${limitClause} ${offsetClause}`;
      const rows = db.prepare(query).all(...params);
      return rowsToObjects(rows);
    },

    findFirst: async (options: FindManyOptions = {}) => {
      const results = await createTableHandler(tableName).findMany({ ...options, take: 1 });
      return results[0] || null;
    },

    findUnique: async (options: FindUniqueOptions) => {
      const { sql: whereClause, params } = buildWhereClause(options.where);
      const query = `SELECT * FROM ${tableName} ${whereClause} LIMIT 1`;
      const row = db.prepare(query).get(...params);
      return row ? rowToObject(row) : null;
    },

    create: async (options: { data: any }) => {
      const data = { ...options.data };

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
      const values = keys.map(k => {
        const v = data[k];
        if (typeof v === 'boolean') return v ? 1 : 0;
        if (v instanceof Date) return v.toISOString();
        return v;
      });

      const placeholders = keys.map(() => '?').join(', ');
      const query = `INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders})`;

      db.prepare(query).run(...values);

      // Return the created record
      if (data.id) {
        return await createTableHandler(tableName).findUnique({ where: { id: data.id } });
      }
      return data;
    },

    update: async (options: { where: WhereClause; data: any }) => {
      const { sql: whereClause, params: whereParams } = buildWhereClause(options.where);
      const data = { ...options.data, updatedAt: new Date().toISOString() };

      const setParts = Object.keys(data).map(k => `${k} = ?`);
      const setValues = Object.values(data).map(v => {
        if (typeof v === 'boolean') return v ? 1 : 0;
        if (v instanceof Date) return v.toISOString();
        return v;
      });

      const query = `UPDATE ${tableName} SET ${setParts.join(', ')} ${whereClause}`;
      db.prepare(query).run(...setValues, ...whereParams);

      return await createTableHandler(tableName).findUnique(options);
    },

    delete: async (options: { where: WhereClause }) => {
      const record = await createTableHandler(tableName).findUnique(options);
      const { sql: whereClause, params } = buildWhereClause(options.where);
      const query = `DELETE FROM ${tableName} ${whereClause}`;
      db.prepare(query).run(...params);
      return record;
    },

    deleteMany: async (options: { where?: WhereClause } = {}) => {
      const { sql: whereClause, params } = buildWhereClause(options.where);
      const query = `DELETE FROM ${tableName} ${whereClause}`;
      const result = db.prepare(query).run(...params);
      return { count: result.changes };
    },

    count: async (options: { where?: WhereClause } = {}) => {
      const { sql: whereClause, params } = buildWhereClause(options.where);
      const query = `SELECT COUNT(*) as count FROM ${tableName} ${whereClause}`;
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
  customer: createTableHandler('Customer'),
  shopRule: createTableHandler('ShopRule'),
  carShopEligibility: createTableHandler('CarShopEligibility'),
  auditLog: createTableHandler('AuditLog'),
  rolePermission: createTableHandler('RolePermission'),
  fieldSecurity: createTableHandler('FieldSecurity'),
  shopPerformance: createTableHandler('ShopPerformance'),
  reportTemplate: createTableHandler('ReportTemplate'),
  scheduledReport: createTableHandler('ScheduledReport'),
  shopCapacitySlot: createTableHandler('ShopCapacitySlot'),
  sOPAssignment: createTableHandler('SOPAssignment'),
  leaseContract: createTableHandler('LeaseContract'),
  leaseQualificationEntry: createTableHandler('LeaseQualificationEntry'),
  qualificationPlanEvent: createTableHandler('QualificationPlanEvent'),
  qualificationScenario: createTableHandler('QualificationScenario'),
  qualificationPlanAssignment: createTableHandler('QualificationPlanAssignment'),
  qualificationPlanDocument: createTableHandler('QualificationPlanDocument'),

  // MasterPlan tables (Gold Standard feature)
  masterPlan: createTableHandler('MasterPlan'),
  masterPlanCommitment: createTableHandler('MasterPlanCommitment'),

  // Gold Standard Wizard tables
  weeklyCapacity: createTableHandler('WeeklyCapacity'),
  capacityAudit: createTableHandler('CapacityAudit'),
  shopHistory: createTableHandler('ShopHistory'),
  masterPlanVersion: createTableHandler('MasterPlanVersion'),
  integrationLog: createTableHandler('IntegrationLog'),
  importSession: createTableHandler('ImportSession'),
  allocationOverride: createTableHandler('AllocationOverride'),

  // Raw query support
  $queryRaw: async (query: string, ...params: any[]) => {
    return db.prepare(query).all(...params);
  },

  // Transaction support
  $transaction: async (operations: Promise<any>[]) => {
    return Promise.all(operations);
  },

  // Disconnect (no-op for better-sqlite3)
  $disconnect: async () => {},
};

export default prisma;
