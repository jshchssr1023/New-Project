import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';
import auditService, { calculateChanges } from '../services/auditService';
import { getParam } from '../utils/routeParams';

// INPUT VALIDATION SCHEMAS
const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character');

const CreateUserSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: PasswordSchema,
  firstName: z.string().min(1, 'First name is required').max(100, 'First name too long'),
  lastName: z.string().min(1, 'Last name is required').max(100, 'Last name too long'),
  role: z.enum(['admin', 'planner', 'viewer']).optional(),
});

const UpdateUserSchema = z.object({
  email: z.string().email('Invalid email format').optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  role: z.enum(['admin', 'planner', 'viewer']).optional(),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: PasswordSchema,
});

const router = Router();

router.use(authenticate);

// Get all users (admin only)
router.get('/', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

  try {
    const users = await prisma.user.findMany({
      where: { companyId: req.user!.companyId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        companyId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { lastName: 'asc' },
    });

    res.json(users);
  } catch (error) {
    logger.error('Get users error', error as Error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get user by ID
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

  // Users can only view their own profile unless admin
  // SECURITY FIX: Use strict equality (===) instead of non-strict (!=)
  if (getParam(req.params.id) !== req.user!.id && req.user!.role !== 'admin') {
    res.status(403).json({ message: 'Insufficient permissions' });
    return;
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        id: getParam(req.params.id),
        companyId: req.user!.companyId,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        companyId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.json(user);
  } catch (error) {
    logger.error('Get user error', error as Error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create user (admin only)
router.post('/', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

  // INPUT VALIDATION
  const validation = CreateUserSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({
      message: 'Validation failed',
      errors: validation.error.errors,
    });
    return;
  }

  const { email, password, firstName, lastName, role } = validation.data;

  try {
    // Check if email already exists
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      res.status(400).json({ message: 'Email already in use' });
      return;
    }

    // SECURITY FIX: Increased bcrypt rounds from 10 to 12 for stronger hashing
    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        role: role || 'viewer',
        companyId: req.user!.companyId,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        companyId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // AUDIT LOG: User created
    await auditService.logAudit({
      userId: req.user!.id,
      userEmail: req.user!.email,
      action: 'create',
      entityType: 'User',
      entityId: user.id,
      entityName: `${user.firstName} ${user.lastName}`,
      changes: { email: { new: user.email }, role: { new: user.role } },
      companyId: req.user!.companyId,
    }, req);

    res.status(201).json(user);
  } catch (error) {
    logger.error('Create user error', error as Error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update user
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;
  const { firstName, lastName, email, role } = req.body;

  // Users can only update their own profile unless admin
  // Non-admins cannot change roles
  if (getParam(req.params.id) !== req.user!.id && req.user!.role !== 'admin') {
    res.status(403).json({ message: 'Insufficient permissions' });
    return;
  }

  if (role && req.user!.role !== 'admin') {
    res.status(403).json({ message: 'Only admins can change roles' });
    return;
  }

  try {
    const result = await prisma.user.updateMany({
      where: {
        id: getParam(req.params.id),
        companyId: req.user!.companyId,
      },
      data: {
        firstName,
        lastName,
        email,
        ...(role && { role }),
      },
    });

    if (result.count === 0) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const updatedUser = await prisma.user.findUnique({
      where: { id: getParam(req.params.id) },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        companyId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // AUDIT LOG: User updated
    if (updatedUser) {
      await auditService.logAudit({
        userId: req.user!.id,
        userEmail: req.user!.email,
        action: 'update',
        entityType: 'User',
        entityId: updatedUser.id,
        entityName: `${updatedUser.firstName} ${updatedUser.lastName}`,
        changes: calculateChanges({}, { firstName, lastName, email, role }),
        companyId: req.user!.companyId,
      }, req);
    }

    res.json(updatedUser);
  } catch (error) {
    logger.error('Update user error', error as Error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update password
router.put('/:id/password', async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

  // INPUT VALIDATION - Require strong password
  // Admin can change without validation (for resets)
  if (req.user!.role !== 'admin') {
    const validation = ChangePasswordSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        message: 'Validation failed',
        errors: validation.error.errors,
      });
      return;
    }
  }

  const { currentPassword, newPassword } = req.body;

  // Users can only update their own password unless admin
  if (getParam(req.params.id) !== req.user!.id && req.user!.role !== 'admin') {
    res.status(403).json({ message: 'Insufficient permissions' });
    return;
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        id: getParam(req.params.id),
        companyId: req.user!.companyId,
      },
    });

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    // Non-admins must provide current password
    if (req.user!.role !== 'admin') {
      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        res.status(400).json({ message: 'Current password is incorrect' });
        return;
      }
    }

    // SECURITY FIX: Increased bcrypt rounds from 10 to 12 for stronger hashing
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: getParam(req.params.id) },
      data: { password: hashedPassword },
    });

    // AUDIT LOG: Password changed (sensitive - don't log values)
    await auditService.logAudit({
      userId: req.user!.id,
      userEmail: req.user!.email,
      action: 'update',
      entityType: 'User',
      entityId: getParam(req.params.id),
      entityName: user.email,
      changes: { password: { old: '[REDACTED]', new: '[REDACTED]' } },
      companyId: req.user!.companyId,
    }, req);

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    logger.error('Update password error', error as Error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete user (admin only)
router.delete('/:id', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  const prisma: any = req.app.locals.prisma;

  // Prevent self-deletion
  if (getParam(req.params.id) === req.user!.id) {
    res.status(400).json({ message: 'Cannot delete your own account' });
    return;
  }

  try {
    const result = await prisma.user.deleteMany({
      where: {
        id: getParam(req.params.id),
        companyId: req.user!.companyId,
      },
    });

    if (result.count === 0) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    // AUDIT LOG: User deleted
    await auditService.logAudit({
      userId: req.user!.id,
      userEmail: req.user!.email,
      action: 'delete',
      entityType: 'User',
      entityId: getParam(req.params.id),
      companyId: req.user!.companyId,
    }, req);

    res.status(204).send();
  } catch (error) {
    logger.error('Delete user error', error as Error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
