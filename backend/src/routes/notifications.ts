/**
 * Notifications API Routes
 */

import { Router, Request, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import notificationService from '../services/notificationService';
import { getParam } from '../utils/routeParams';

const router = Router();

/**
 * Get notifications for current user
 */
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const userId = authReq.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { isRead, type, category, limit, offset } = req.query;

  try {
    const result = await notificationService.getNotifications(userId, {
      isRead: isRead === 'true' ? true : isRead === 'false' ? false : undefined,
      type: type as 'info' | 'success' | 'warning' | 'error' | 'action_required' | undefined,
      category: category as 'assignment' | 'approval' | 'alert' | 'system' | 'report' | undefined,
      limit: limit ? parseInt(limit as string) : 50,
      offset: offset ? parseInt(offset as string) : 0,
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

/**
 * Get unread count
 */
router.get('/unread-count', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const userId = authReq.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const count = await notificationService.getUnreadCount(userId);
    res.json({ count });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

/**
 * Mark notification as read
 */
router.post('/:id/read', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const userId = authReq.user?.id;
  const id = getParam(req.params.id);

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await notificationService.markAsRead(id, userId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

/**
 * Mark all as read
 */
router.post('/read-all', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const userId = authReq.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await notificationService.markAllAsRead(userId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking all as read:', error);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

/**
 * Delete notification
 */
router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const userId = authReq.user?.id;
  const id = getParam(req.params.id);

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await notificationService.deleteNotification(id, userId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

export default router;
