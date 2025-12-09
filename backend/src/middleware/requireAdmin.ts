/**
 * Admin Role Verification Middleware
 *
 * Ensures that only users with admin role can access certain routes.
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import logger from '../utils/logger';

/**
 * Middleware to require admin role
 */
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  if (req.user.role !== 'admin') {
    logger.warn('Non-admin attempted admin action', {
      userId: req.user.id,
      role: req.user.role,
      path: req.path,
    });
    res.status(403).json({ message: 'Admin access required' });
    return;
  }

  next();
}

/**
 * Middleware to require one of the specified roles
 */
export function requireRoles(...allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn('User lacks required role', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: allowedRoles,
        path: req.path,
      });
      res.status(403).json({
        message: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
      });
      return;
    }

    next();
  };
}

/**
 * Middleware to require approver role (or admin)
 */
export function requireApprover(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  if (req.user.role !== 'admin' && req.user.role !== 'approver') {
    logger.warn('Non-approver attempted approval action', {
      userId: req.user.id,
      role: req.user.role,
      path: req.path,
    });
    res.status(403).json({ message: 'Approver access required' });
    return;
  }

  next();
}

/**
 * Middleware to require planner role (or admin)
 */
export function requirePlanner(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  const allowedRoles = ['admin', 'planner', 'approver'];
  if (!allowedRoles.includes(req.user.role)) {
    logger.warn('User lacks planner access', {
      userId: req.user.id,
      role: req.user.role,
      path: req.path,
    });
    res.status(403).json({ message: 'Planner access required' });
    return;
  }

  next();
}

export default {
  requireAdmin,
  requireRoles,
  requireApprover,
  requirePlanner,
};
