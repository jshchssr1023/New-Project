/**
 * Notification Service
 *
 * Manages in-app notifications and integrates with email for critical alerts.
 */

import { prisma } from './db';
import emailService from './emailService';
import websocketService from './websocketService';

// =============================================================================
// TYPES
// =============================================================================

export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'action_required';
export type NotificationCategory = 'assignment' | 'approval' | 'alert' | 'system' | 'report';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  message: string;
  link?: string;
  metadata?: Record<string, unknown>;
  companyId: string;
  expiresAt?: Date;
  sendEmail?: boolean;
  emailSubject?: string;
}

export interface NotificationFilters {
  isRead?: boolean;
  type?: NotificationType;
  category?: NotificationCategory;
  limit?: number;
  offset?: number;
}

// =============================================================================
// SERVICE FUNCTIONS
// =============================================================================

/**
 * Create a notification
 */
export async function createNotification(input: CreateNotificationInput) {
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      category: input.category,
      title: input.title,
      message: input.message,
      link: input.link,
      metadata: JSON.stringify(input.metadata || {}),
      companyId: input.companyId,
      expiresAt: input.expiresAt,
    },
  });

  // Send real-time notification via WebSocket
  websocketService.emitToUser(input.userId, 'notification:new', {
    id: notification.id,
    type: notification.type,
    category: notification.category,
    title: notification.title,
    message: notification.message,
    link: notification.link,
    createdAt: notification.createdAt,
  });

  // Send email if requested
  if (input.sendEmail) {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true, firstName: true },
    });

    if (user) {
      await emailService.sendNotificationEmail(
        user.email,
        input.emailSubject || input.title,
        input.title,
        input.message,
        input.link ? `${process.env.FRONTEND_URL || 'http://localhost:5173'}${input.link}` : undefined,
        'View Details'
      );
    }
  }

  return notification;
}

/**
 * Create notifications for multiple users
 */
export async function createBulkNotifications(
  userIds: string[],
  input: Omit<CreateNotificationInput, 'userId'>
) {
  const notifications = await prisma.$transaction(
    userIds.map(userId =>
      prisma.notification.create({
        data: {
          userId,
          type: input.type,
          category: input.category,
          title: input.title,
          message: input.message,
          link: input.link,
          metadata: JSON.stringify(input.metadata || {}),
          companyId: input.companyId,
          expiresAt: input.expiresAt,
        },
      })
    )
  );

  // Send real-time notifications
  userIds.forEach((userId, idx) => {
    websocketService.emitToUser(userId, 'notification:new', {
      id: notifications[idx].id,
      type: input.type,
      category: input.category,
      title: input.title,
      message: input.message,
      link: input.link,
      createdAt: notifications[idx].createdAt,
    });
  });

  return notifications;
}

/**
 * Get notifications for a user
 */
export async function getNotifications(
  userId: string,
  filters: NotificationFilters = {}
) {
  const { isRead, type, category, limit = 50, offset = 0 } = filters;

  const where: Record<string, unknown> = { userId };
  if (isRead !== undefined) where.isRead = isRead;
  if (type) where.type = type;
  if (category) where.category = category;

  // Exclude expired notifications
  where.OR = [
    { expiresAt: null },
    { expiresAt: { gt: new Date() } },
  ];

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({
      where: {
        userId,
        isRead: false,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
    }),
  ]);

  return {
    notifications: notifications.map(n => ({
      ...n,
      metadata: JSON.parse(n.metadata),
    })),
    total,
    unreadCount,
  };
}

/**
 * Get unread count for a user
 */
export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: {
      userId,
      isRead: false,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
  });
}

/**
 * Mark notification as read
 */
export async function markAsRead(notificationId: string, userId: string) {
  return prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { isRead: true, readAt: new Date() },
  });
}

/**
 * Mark all notifications as read
 */
export async function markAllAsRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
}

/**
 * Delete a notification
 */
export async function deleteNotification(notificationId: string, userId: string) {
  return prisma.notification.deleteMany({
    where: { id: notificationId, userId },
  });
}

/**
 * Delete old/read notifications (cleanup)
 */
export async function cleanupNotifications(daysOld: number = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysOld);

  return prisma.notification.deleteMany({
    where: {
      OR: [
        { isRead: true, readAt: { lt: cutoff } },
        { expiresAt: { lt: new Date() } },
      ],
    },
  });
}

// =============================================================================
// NOTIFICATION TEMPLATES
// =============================================================================

/**
 * Notify about new assignment
 */
export async function notifyAssignment(
  userId: string,
  companyId: string,
  data: { carNumber: string; shopName: string; month: string; planId: string }
) {
  return createNotification({
    userId,
    type: 'info',
    category: 'assignment',
    title: 'New Assignment Created',
    message: `Railcar ${data.carNumber} has been assigned to ${data.shopName} for ${data.month}`,
    link: `/planning?planId=${data.planId}`,
    metadata: data,
    companyId,
  });
}

/**
 * Notify about approval request
 */
export async function notifyApprovalRequired(
  userId: string,
  companyId: string,
  data: { planName: string; planId: string; submittedBy: string }
) {
  return createNotification({
    userId,
    type: 'action_required',
    category: 'approval',
    title: 'Plan Approval Required',
    message: `${data.submittedBy} has submitted "${data.planName}" for your approval`,
    link: `/planning?planId=${data.planId}`,
    metadata: data,
    companyId,
    sendEmail: true,
    emailSubject: `Action Required: Plan "${data.planName}" awaits your approval`,
  });
}

/**
 * Notify about plan approval
 */
export async function notifyPlanApproved(
  userId: string,
  companyId: string,
  data: { planName: string; planId: string; approvedBy: string }
) {
  return createNotification({
    userId,
    type: 'success',
    category: 'approval',
    title: 'Plan Approved',
    message: `"${data.planName}" has been approved by ${data.approvedBy}`,
    link: `/planning?planId=${data.planId}`,
    metadata: data,
    companyId,
    sendEmail: true,
  });
}

/**
 * Notify about capacity alert
 */
export async function notifyCapacityAlert(
  userId: string,
  companyId: string,
  data: { shopName: string; month: string; utilization: number; shopId: string }
) {
  const isWarning = data.utilization >= 85;
  return createNotification({
    userId,
    type: isWarning ? 'warning' : 'info',
    category: 'alert',
    title: isWarning ? 'Shop Capacity Warning' : 'High Shop Utilization',
    message: `${data.shopName} is at ${data.utilization}% capacity for ${data.month}`,
    link: `/shops?id=${data.shopId}`,
    metadata: data,
    companyId,
  });
}

/**
 * Notify about report completion
 */
export async function notifyReportReady(
  userId: string,
  companyId: string,
  data: { reportName: string; format: string }
) {
  return createNotification({
    userId,
    type: 'success',
    category: 'report',
    title: 'Report Ready',
    message: `Your "${data.reportName}" report is ready for download`,
    link: '/reports',
    metadata: data,
    companyId,
  });
}

/**
 * Notify about system update
 */
export async function notifySystemMessage(
  userIds: string[],
  companyId: string,
  data: { title: string; message: string; link?: string }
) {
  return createBulkNotifications(userIds, {
    type: 'info',
    category: 'system',
    title: data.title,
    message: data.message,
    link: data.link,
    companyId,
  });
}

export default {
  createNotification,
  createBulkNotifications,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  cleanupNotifications,
  notifyAssignment,
  notifyApprovalRequired,
  notifyPlanApproved,
  notifyCapacityAlert,
  notifyReportReady,
  notifySystemMessage,
};
