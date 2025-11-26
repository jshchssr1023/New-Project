// Audit Log API Routes
import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth';
import auditService from '../services/auditService';

const router = Router();

// Apply auth to all routes
router.use(authenticateToken);

// Get audit logs (admin only)
router.get('/', requireRole('admin'), async (req, res) => {
  try {
    const user = (req as any).user;
    const {
      entityType,
      entityId,
      userId,
      action,
      startDate,
      endDate,
      page = '1',
      pageSize = '50',
    } = req.query;

    const result = await auditService.getAuditLogs(user.companyId, {
      entityType: entityType as string,
      entityId: entityId as string,
      userId: userId as string,
      action: action as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      page: parseInt(page as string),
      pageSize: parseInt(pageSize as string),
    });

    res.json(result);
  } catch (error) {
    console.error('Failed to get audit logs:', error);
    res.status(500).json({ message: 'Failed to get audit logs' });
  }
});

// Get audit history for a specific entity
router.get('/entity/:entityType/:entityId', async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const user = (req as any).user;

    // Only admins can view full audit history
    // Regular users can only view history of entities they own
    const history = await auditService.getEntityHistory(user.companyId, entityType, entityId);

    res.json(history);
  } catch (error) {
    console.error('Failed to get entity history:', error);
    res.status(500).json({ message: 'Failed to get entity history' });
  }
});

// Get recent activity summary (admin only)
router.get('/summary', requireRole('admin'), async (req, res) => {
  try {
    const user = (req as any).user;
    const { days = '7' } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days as string));

    const logs = await auditService.getAuditLogs(user.companyId, {
      startDate,
      pageSize: 1000, // Get more for summary
    });

    // Build summary
    const actionCounts: Record<string, number> = {};
    const entityCounts: Record<string, number> = {};
    const userActivity: Record<string, number> = {};

    for (const log of logs.data) {
      actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
      entityCounts[log.entityType] = (entityCounts[log.entityType] || 0) + 1;
      userActivity[log.userEmail] = (userActivity[log.userEmail] || 0) + 1;
    }

    // Sort users by activity
    const topUsers = Object.entries(userActivity)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([email, count]) => ({ email, count }));

    res.json({
      totalActions: logs.total,
      period: {
        start: startDate.toISOString(),
        end: new Date().toISOString(),
        days: parseInt(days as string),
      },
      byAction: actionCounts,
      byEntity: entityCounts,
      topUsers,
      recentActions: logs.data.slice(0, 20),
    });
  } catch (error) {
    console.error('Failed to get audit summary:', error);
    res.status(500).json({ message: 'Failed to get audit summary' });
  }
});

export default router;
