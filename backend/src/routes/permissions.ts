// Role-Based Permissions and Field Security API Routes
import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import permissionsService, { ROLES, DEFAULT_PERMISSIONS, FIELD_SECURITY_DEFAULTS } from '../services/permissionsService';
import { getParam } from '../utils/routeParams';

const router = Router();

// Apply auth to all routes
router.use(authenticate);

// Get available roles
router.get('/roles', (_, res) => {
  res.json({
    roles: Object.values(ROLES),
    descriptions: {
      admin: 'Full system access - can manage users, settings, and all data',
      planner: 'Can create and manage scenarios and plans, but cannot commit without approval',
      viewer: 'Read-only access to all data',
      approver: 'Can view all data and approve/commit plans',
      finance: 'Can view and edit cost-related data',
    },
  });
});

// Get default permissions for a role
router.get('/roles/:role/defaults', (req, res) => {
  const role = getParam(req.params.role);
  const permissions = DEFAULT_PERMISSIONS[role];

  if (!permissions) {
    return res.status(404).json({ message: 'Role not found' });
  }

  res.json({
    role,
    permissions,
  });
});

// Get permissions for a role (with custom overrides)
router.get('/roles/:role', async (req, res) => {
  try {
    const role = getParam(req.params.role);
    const companyId = (req as any).user.companyId;

    const permissions = await permissionsService.getRolePermissions(role, companyId);

    res.json({
      role,
      permissions,
    });
  } catch (error) {
    console.error('Failed to get role permissions:', error);
    res.status(500).json({ message: 'Failed to get role permissions' });
  }
});

// Set permission for a role (admin only)
router.post('/roles/:role/permissions', requireRole('admin'), async (req, res) => {
  try {
    const role = getParam(req.params.role);
    const { permission, isGranted } = req.body;
    const companyId = (req as any).user.companyId;

    if (!permission || typeof isGranted !== 'boolean') {
      return res.status(400).json({ message: 'Permission and isGranted are required' });
    }

    await permissionsService.setPermission(role, permission, isGranted, companyId);

    res.json({ message: 'Permission updated successfully' });
  } catch (error) {
    console.error('Failed to set permission:', error);
    res.status(500).json({ message: 'Failed to set permission' });
  }
});

// Check if current user has a permission
router.get('/check/:permission', async (req, res) => {
  try {
    const permission = getParam(req.params.permission);
    const user = (req as any).user;

    const hasPermission = await permissionsService.hasPermission(
      user.id,
      user.role,
      permission,
      user.companyId
    );

    res.json({ permission, granted: hasPermission });
  } catch (error) {
    console.error('Failed to check permission:', error);
    res.status(500).json({ message: 'Failed to check permission' });
  }
});

// Get current user's permissions
router.get('/my-permissions', async (req, res) => {
  try {
    const user = (req as any).user;
    const permissions = await permissionsService.getRolePermissions(user.role, user.companyId);

    res.json({
      role: user.role,
      permissions,
    });
  } catch (error) {
    console.error('Failed to get user permissions:', error);
    res.status(500).json({ message: 'Failed to get user permissions' });
  }
});

// ============ Field Security ============

// Get field security config for an entity
router.get('/fields/:entityType', async (req, res) => {
  try {
    const entityType = getParam(req.params.entityType);
    const user = (req as any).user;

    const config = await permissionsService.getFieldSecurityConfig(
      entityType,
      user.role,
      user.companyId
    );

    res.json({
      entityType,
      role: user.role,
      fields: config,
    });
  } catch (error) {
    console.error('Failed to get field security:', error);
    res.status(500).json({ message: 'Failed to get field security' });
  }
});

// Set field security (admin only)
router.post('/fields', requireRole('admin'), async (req, res) => {
  try {
    const { entityType, fieldName, visibleRoles, editableRoles, maskType } = req.body;
    const companyId = (req as any).user.companyId;

    if (!entityType || !fieldName || !visibleRoles || !editableRoles) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    await permissionsService.setFieldSecurity(
      entityType,
      fieldName,
      visibleRoles,
      editableRoles,
      maskType || 'hidden',
      companyId
    );

    res.json({ message: 'Field security updated successfully' });
  } catch (error) {
    console.error('Failed to set field security:', error);
    res.status(500).json({ message: 'Failed to set field security' });
  }
});

// Get all field security defaults
router.get('/fields-defaults', (_, res) => {
  res.json(FIELD_SECURITY_DEFAULTS);
});

export default router;
