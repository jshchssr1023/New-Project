import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Get all users (admin only)
router.get('/', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;

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
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get user by ID
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;

  // Users can only view their own profile unless admin
  if (req.params.id !== req.user!.id && req.user!.role !== 'admin') {
    res.status(403).json({ message: 'Insufficient permissions' });
    return;
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        id: req.params.id,
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
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create user (admin only)
router.post('/', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
  const { email, password, firstName, lastName, role } = req.body;

  try {
    // Check if email already exists
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      res.status(400).json({ message: 'Email already in use' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

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

    res.status(201).json(user);
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update user
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
  const { firstName, lastName, email, role } = req.body;

  // Users can only update their own profile unless admin
  // Non-admins cannot change roles
  if (req.params.id !== req.user!.id && req.user!.role !== 'admin') {
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
        id: req.params.id,
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
      where: { id: req.params.id },
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

    res.json(updatedUser);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update password
router.put('/:id/password', async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;
  const { currentPassword, newPassword } = req.body;

  // Users can only update their own password unless admin
  if (req.params.id !== req.user!.id && req.user!.role !== 'admin') {
    res.status(403).json({ message: 'Insufficient permissions' });
    return;
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        id: req.params.id,
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

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: req.params.id },
      data: { password: hashedPassword },
    });

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete user (admin only)
router.delete('/:id', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  const prisma: PrismaClient = req.app.locals.prisma;

  // Prevent self-deletion
  if (req.params.id === req.user!.id) {
    res.status(400).json({ message: 'Cannot delete your own account' });
    return;
  }

  try {
    const result = await prisma.user.deleteMany({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
      },
    });

    if (result.count === 0) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
