import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../services/db';
import logger from '../utils/logger';

// SECURITY: Require JWT_SECRET from environment - no fallback
const envJwtSecret = process.env.JWT_SECRET;
if (!envJwtSecret) {
  throw new Error(
    'FATAL: JWT_SECRET environment variable is not set. ' +
    'Please set a secure JWT_SECRET (minimum 32 characters) in your environment.'
  );
}

// Validate minimum secret length
if (envJwtSecret.length < 32) {
  throw new Error(
    'FATAL: JWT_SECRET must be at least 32 characters long for security.'
  );
}

const JWT_SECRET: string = envJwtSecret;

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  companyId: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

interface JwtPayload extends AuthUser {
  iat: number;
  exp: number;
}

/**
 * Hash a token for storage in the blacklist
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Check if a token has been invalidated (blacklisted)
 */
async function isTokenBlacklisted(token: string): Promise<boolean> {
  try {
    const tokenHash = hashToken(token);
    const invalidated = await prisma.invalidatedToken.findUnique({
      where: { tokenHash },
    });
    return invalidated !== null;
  } catch (error) {
    logger.error('Error checking token blacklist', error);
    // On error, reject the token for security
    return true;
  }
}

/**
 * Add a token to the blacklist
 */
export async function invalidateToken(
  token: string,
  userId: string,
  reason: string = 'logout'
): Promise<void> {
  try {
    const decoded = jwt.decode(token) as JwtPayload | null;
    if (!decoded || !decoded.exp) {
      throw new Error('Invalid token format');
    }

    const tokenHash = hashToken(token);
    const expiresAt = new Date(decoded.exp * 1000);

    await prisma.invalidatedToken.create({
      data: {
        tokenHash,
        userId,
        expiresAt,
        reason,
      },
    });

    logger.info('Token invalidated', { userId, reason });
  } catch (error) {
    logger.error('Error invalidating token', error);
    throw error;
  }
}

/**
 * Clean up expired tokens from the blacklist
 * This should be run periodically (e.g., via cron job)
 */
export async function cleanupExpiredTokens(): Promise<number> {
  try {
    const result = await prisma.invalidatedToken.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    if (result.count > 0) {
      logger.info('Cleaned up expired blacklisted tokens', { count: result.count });
    }

    return result.count;
  } catch (error) {
    logger.error('Error cleaning up expired tokens', error);
    return 0;
  }
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ message: 'No token provided' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    // Check if token is blacklisted before verifying
    const blacklisted = await isTokenBlacklisted(token);
    if (blacklisted) {
      res.status(401).json({ message: 'Token has been invalidated' });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      companyId: decoded.companyId,
    };
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ message: 'Token has expired' });
    } else if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ message: 'Invalid token' });
    } else {
      logger.error('Authentication error', error);
      res.status(401).json({ message: 'Authentication failed' });
    }
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: 'Not authenticated' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ message: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

export function generateToken(user: AuthUser): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

// Alias for backwards compatibility
export const authenticateToken = authenticate;

// Type alias for AuthRequest
export type AuthenticatedRequest = AuthRequest;
