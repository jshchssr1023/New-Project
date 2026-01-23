import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { authenticate, generateToken, invalidateToken, getTokenFromRequest, AuthRequest } from '../middleware/auth';
import { loginRateLimit, strictRateLimit } from '../middleware/rateLimit';
import { prisma } from '../services/db';
import logger from '../utils/logger';

// SECURITY FIX: Apply rate limiting to login endpoint (imported from middleware)

const router = Router();

// Cookie configuration
const COOKIE_NAME = 'auth_token';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 60 * 60 * 1000, // SECURITY FIX: 1 hour (matches JWT expiration)
  path: '/',
};

// Password validation schema - min 8 chars, 1 uppercase, 1 number, 1 special char
const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character');

// Login request schema
const LoginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

// Registration schema (if registration endpoint exists)
const RegistrationSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: PasswordSchema,
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  companyId: z.string().uuid('Invalid company ID'),
});

// SECURITY FIX: Rate limiting on login to prevent brute force attacks
router.post('/login', loginRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    // Validate request body
    const validationResult = LoginSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({
        message: 'Validation failed',
        errors: validationResult.error.errors,
      });
      return;
    }

    const { email, password } = validationResult.data;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { company: true },
    });

    if (!user) {
      res.status(401).json({ message: 'Invalid email or password' });
      return;
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      res.status(401).json({ message: 'Invalid email or password' });
      return;
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    });

    logger.info('User logged in', { userId: user.id, email: user.email });

    // Set httpOnly cookie with the token
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

    // SECURITY FIX: Only return user data, NOT the token
    // Token is securely stored in httpOnly cookie (set above)
    // Exposing token in response body defeats httpOnly cookie security
    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        companyId: user.companyId,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Login error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/logout', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const token = getTokenFromRequest(req);
    if (token) {
      await invalidateToken(token, req.user!.id, 'logout');
    }

    // Clear the httpOnly cookie
    res.clearCookie(COOKIE_NAME, { path: '/' });

    logger.info('User logged out', { userId: req.user!.id });
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout error', error);
    // Still clear cookie and return success even if blacklisting fails
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.json({ message: 'Logged out successfully' });
  }
});

router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
    });

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      companyId: user.companyId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (error) {
    logger.error('Get user error', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// SECURITY FIX: Add rate limit to token refresh endpoint
// Prevents attackers from continuously refreshing to generate token storms
router.post('/refresh', strictRateLimit, authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Invalidate the old token
    const oldToken = getTokenFromRequest(req);
    if (oldToken) {
      await invalidateToken(oldToken, req.user!.id, 'token_refresh');
    }

    // Generate new token
    const token = generateToken({
      id: req.user!.id,
      email: req.user!.email,
      role: req.user!.role,
      companyId: req.user!.companyId,
    });

    // Set new httpOnly cookie with the token
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

    // SECURITY FIX: Token is in httpOnly cookie, don't expose in response
    res.json({ message: 'Token refreshed successfully' });
  } catch (error) {
    logger.error('Token refresh error', error);
    res.status(500).json({ message: 'Failed to refresh token' });
  }
});

// Password change endpoint
router.post('/change-password', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const ChangePasswordSchema = z.object({
      currentPassword: z.string().min(1, 'Current password is required'),
      newPassword: PasswordSchema,
    });

    const validationResult = ChangePasswordSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({
        message: 'Validation failed',
        errors: validationResult.error.errors,
      });
      return;
    }

    const { currentPassword, newPassword } = validationResult.data;

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
    });

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      res.status(401).json({ message: 'Current password is incorrect' });
      return;
    }

    // SECURITY FIX: Increased bcrypt rounds from 10 to 12 for stronger hashing
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: req.user!.id },
      data: { password: hashedPassword },
    });

    // Invalidate current token after password change
    const token = getTokenFromRequest(req);
    if (token) {
      await invalidateToken(token, req.user!.id, 'password_change');
    }

    // Clear the httpOnly cookie
    res.clearCookie(COOKIE_NAME, { path: '/' });

    logger.info('Password changed', { userId: req.user!.id });
    res.json({ message: 'Password changed successfully. Please log in again.' });
  } catch (error) {
    logger.error('Password change error', error);
    res.status(500).json({ message: 'Failed to change password' });
  }
});

// Export validation schemas for use in other routes (e.g., registration)
export { PasswordSchema, RegistrationSchema };

export default router;
