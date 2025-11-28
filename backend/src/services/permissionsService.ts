// Role-based permissions and field-level security service
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Default role hierarchy and permissions
export const ROLES = {
  ADMIN: 'admin',
  PLANNER: 'planner',
  VIEWER: 'viewer',
  APPROVER: 'approver',
  FINANCE: 'finance',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

// Default permissions matrix
export const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  admin: [
    'car:create', 'car:read', 'car:update', 'car:delete', 'car:export',
    'shop:create', 'shop:read', 'shop:update', 'shop:delete', 'shop:export',
    'plan:create', 'plan:read', 'plan:update', 'plan:delete', 'plan:commit', 'plan:export',
    'scenario:create', 'scenario:read', 'scenario:update', 'scenario:delete', 'scenario:commit',
    'user:create', 'user:read', 'user:update', 'user:delete',
    'cost:view', 'cost:edit',
    'audit:read',
    'report:create', 'report:read', 'report:delete', 'report:schedule',
    'settings:read', 'settings:update',
  ],
  planner: [
    'car:create', 'car:read', 'car:update', 'car:export',
    'shop:read', 'shop:export',
    'plan:create', 'plan:read', 'plan:update', 'plan:export',
    'scenario:create', 'scenario:read', 'scenario:update', 'scenario:delete',
    'report:create', 'report:read',
  ],
  viewer: [
    'car:read',
    'shop:read',
    'plan:read',
    'scenario:read',
    'report:read',
  ],
  approver: [
    'car:read', 'car:export',
    'shop:read', 'shop:export',
    'plan:read', 'plan:commit', 'plan:export',
    'scenario:read', 'scenario:commit',
    'cost:view',
    'report:read',
  ],
  finance: [
    'car:read', 'car:export',
    'shop:read', 'shop:export',
    'plan:read', 'plan:export',
    'scenario:read',
    'cost:view', 'cost:edit',
    'report:create', 'report:read',
  ],
};

// Field-level security defaults
export const FIELD_SECURITY_DEFAULTS: Record<string, {
  visibleRoles: string[];
  editableRoles: string[];
  maskType: 'hidden' | 'masked' | 'readonly';
}> = {
  'Shop:laborRate': {
    visibleRoles: ['admin', 'finance'],
    editableRoles: ['admin', 'finance'],
    maskType: 'hidden',
  },
  'Shop:baseCostPerCar': {
    visibleRoles: ['admin', 'finance', 'approver'],
    editableRoles: ['admin', 'finance'],
    maskType: 'hidden',
  },
  'Shop:costIndex': {
    visibleRoles: ['admin', 'finance', 'approver'],
    editableRoles: ['admin', 'finance'],
    maskType: 'hidden',
  },
  'Car:projectedCost': {
    visibleRoles: ['admin', 'finance', 'approver'],
    editableRoles: ['admin', 'finance'],
    maskType: 'masked',
  },
  'PlanAssignment:estimatedCost': {
    visibleRoles: ['admin', 'finance', 'approver'],
    editableRoles: ['admin', 'finance'],
    maskType: 'masked',
  },
};

// Check if user has a specific permission
export async function hasPermission(
  userId: string,
  role: string,
  permission: string,
  companyId: string
): Promise<boolean> {
  // Admins always have all permissions
  if (role === ROLES.ADMIN) return true;

  // Check custom permission override in database
  const customPermission = await prisma.rolePermission.findUnique({
    where: {
      role_permission_companyId: {
        role,
        permission,
        companyId,
      },
    },
  });

  if (customPermission) {
    return customPermission.isGranted;
  }

  // Fall back to default permissions
  const rolePermissions = DEFAULT_PERMISSIONS[role] || [];
  return rolePermissions.includes(permission);
}

// Get all permissions for a role
export async function getRolePermissions(role: string, companyId: string): Promise<string[]> {
  if (role === ROLES.ADMIN) {
    return DEFAULT_PERMISSIONS.admin;
  }

  // Get custom permissions for this role
  const customPermissions = await prisma.rolePermission.findMany({
    where: { role, companyId },
  });

  // Start with default permissions
  const permissions = new Set(DEFAULT_PERMISSIONS[role] || []);

  // Apply custom overrides
  for (const perm of customPermissions) {
    if (perm.isGranted) {
      permissions.add(perm.permission);
    } else {
      permissions.delete(perm.permission);
    }
  }

  return Array.from(permissions);
}

// Set a custom permission override
export async function setPermission(
  role: string,
  permission: string,
  isGranted: boolean,
  companyId: string
): Promise<void> {
  await prisma.rolePermission.upsert({
    where: {
      role_permission_companyId: {
        role,
        permission,
        companyId,
      },
    },
    create: {
      role,
      permission,
      isGranted,
      companyId,
    },
    update: {
      isGranted,
    },
  });
}

// Check if a field is visible to a user
export async function isFieldVisible(
  entityType: string,
  fieldName: string,
  role: string,
  companyId: string
): Promise<boolean> {
  if (role === ROLES.ADMIN) return true;

  // Check custom field security in database
  const fieldSecurity = await prisma.fieldSecurity.findUnique({
    where: {
      entityType_fieldName_companyId: {
        entityType,
        fieldName,
        companyId,
      },
    },
  });

  if (fieldSecurity) {
    const visibleRoles = JSON.parse(fieldSecurity.visibleRoles) as string[];
    return visibleRoles.includes(role);
  }

  // Check defaults
  const key = `${entityType}:${fieldName}`;
  const defaultSecurity = FIELD_SECURITY_DEFAULTS[key];
  if (defaultSecurity) {
    return defaultSecurity.visibleRoles.includes(role);
  }

  // If no security defined, field is visible to all
  return true;
}

// Check if a field is editable by a user
export async function isFieldEditable(
  entityType: string,
  fieldName: string,
  role: string,
  companyId: string
): Promise<boolean> {
  if (role === ROLES.ADMIN) return true;

  const fieldSecurity = await prisma.fieldSecurity.findUnique({
    where: {
      entityType_fieldName_companyId: {
        entityType,
        fieldName,
        companyId,
      },
    },
  });

  if (fieldSecurity) {
    const editableRoles = JSON.parse(fieldSecurity.editableRoles) as string[];
    return editableRoles.includes(role);
  }

  const key = `${entityType}:${fieldName}`;
  const defaultSecurity = FIELD_SECURITY_DEFAULTS[key];
  if (defaultSecurity) {
    return defaultSecurity.editableRoles.includes(role);
  }

  return true;
}

// Get field security configuration for an entity
export async function getFieldSecurityConfig(
  entityType: string,
  role: string,
  companyId: string
): Promise<Record<string, { visible: boolean; editable: boolean; maskType: string }>> {
  const result: Record<string, { visible: boolean; editable: boolean; maskType: string }> = {};

  // Get custom configurations
  const customConfigs = await prisma.fieldSecurity.findMany({
    where: { entityType, companyId },
  });

  for (const config of customConfigs) {
    const visibleRoles = JSON.parse(config.visibleRoles) as string[];
    const editableRoles = JSON.parse(config.editableRoles) as string[];

    result[config.fieldName] = {
      visible: role === ROLES.ADMIN || visibleRoles.includes(role),
      editable: role === ROLES.ADMIN || editableRoles.includes(role),
      maskType: config.maskType,
    };
  }

  // Add defaults that aren't overridden
  for (const [key, defaultConfig] of Object.entries(FIELD_SECURITY_DEFAULTS)) {
    const [entity, field] = key.split(':');
    if (entity === entityType && !result[field]) {
      result[field] = {
        visible: role === ROLES.ADMIN || defaultConfig.visibleRoles.includes(role),
        editable: role === ROLES.ADMIN || defaultConfig.editableRoles.includes(role),
        maskType: defaultConfig.maskType,
      };
    }
  }

  return result;
}

// Apply field masking to an entity based on user role
export function applyFieldMasking<T extends Record<string, unknown>>(
  entity: T,
  entityType: string,
  role: string,
  fieldConfig: Record<string, { visible: boolean; editable: boolean; maskType: string }>
): T {
  if (role === ROLES.ADMIN) return entity;

  const masked = { ...entity };

  for (const [field, config] of Object.entries(fieldConfig)) {
    if (!config.visible && field in masked) {
      switch (config.maskType) {
        case 'hidden':
          delete masked[field];
          break;
        case 'masked':
          if (typeof masked[field] === 'number') {
            (masked as any)[field] = 0;
          } else if (typeof masked[field] === 'string') {
            (masked as any)[field] = '***';
          }
          break;
        case 'readonly':
          // Field is visible but read-only - no masking needed
          break;
      }
    }
  }

  return masked;
}

// Set field security configuration
export async function setFieldSecurity(
  entityType: string,
  fieldName: string,
  visibleRoles: string[],
  editableRoles: string[],
  maskType: 'hidden' | 'masked' | 'readonly',
  companyId: string
): Promise<void> {
  await prisma.fieldSecurity.upsert({
    where: {
      entityType_fieldName_companyId: {
        entityType,
        fieldName,
        companyId,
      },
    },
    create: {
      entityType,
      fieldName,
      visibleRoles: JSON.stringify(visibleRoles),
      editableRoles: JSON.stringify(editableRoles),
      maskType,
      companyId,
    },
    update: {
      visibleRoles: JSON.stringify(visibleRoles),
      editableRoles: JSON.stringify(editableRoles),
      maskType,
    },
  });
}

export default {
  ROLES,
  DEFAULT_PERMISSIONS,
  hasPermission,
  getRolePermissions,
  setPermission,
  isFieldVisible,
  isFieldEditable,
  getFieldSecurityConfig,
  applyFieldMasking,
  setFieldSecurity,
};
