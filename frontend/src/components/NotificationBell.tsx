import { useState, useEffect, useCallback, Fragment } from 'react';
import { Menu, Transition } from '@headlessui/react';
import {
  BellIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
  ExclamationCircleIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import { BellAlertIcon } from '@heroicons/react/24/solid';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useNavigate } from 'react-router-dom';

interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'action_required';
  category: string;
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

const TYPE_ICONS = {
  info: InformationCircleIcon,
  success: CheckCircleIcon,
  warning: ExclamationTriangleIcon,
  error: XCircleIcon,
  action_required: ExclamationCircleIcon,
};

const TYPE_COLORS = {
  info: 'text-blue-500 bg-blue-50',
  success: 'text-green-500 bg-green-50',
  warning: 'text-amber-500 bg-amber-50',
  error: 'text-red-500 bg-red-50',
  action_required: 'text-purple-500 bg-purple-50',
};

export default function NotificationBell() {
  const { subscribe } = useWebSocket();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    try {
      const [notifRes, countRes] = await Promise.all([
        fetch('/api/notifications?limit=10', {
          credentials: 'include',
        }),
        fetch('/api/notifications/unread-count', {
          credentials: 'include',
        }),
      ]);

      if (notifRes.ok) {
        const data = await notifRes.json();
        setNotifications(data.notifications);
      }

      if (countRes.ok) {
        const data = await countRes.json();
        setUnreadCount(data.count);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Subscribe to real-time notifications
  useEffect(() => {
    const unsubscribe = subscribe('notification:new', (payload) => {
      const newNotif = payload.data as unknown as Notification;
      setNotifications(prev => [{ ...newNotif, isRead: false }, ...prev.slice(0, 9)]);
      setUnreadCount(prev => prev + 1);
    });

    return () => unsubscribe();
  }, [subscribe]);

  const markAsRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: 'POST',
        credentials: 'include',
      });

      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await fetch('/api/notifications/read-all', {
        method: 'POST',
        credentials: 'include',
      });

      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const handleNotificationClick = (notif: Notification) => {
    if (!notif.isRead) {
      markAsRead(notif.id);
    }
    if (notif.link) {
      navigate(notif.link);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <Menu as="div" className="relative">
      <Menu.Button className="relative p-2 text-steel-400 hover:text-steel-600 focus:outline-none focus:ring-2 focus:ring-navy-500 focus:ring-offset-2 rounded-full">
        {unreadCount > 0 ? (
          <BellAlertIcon className="h-6 w-6 text-navy-600" />
        ) : (
          <BellIcon className="h-6 w-6" />
        )}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          </span>
        )}
      </Menu.Button>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="absolute right-0 mt-2 w-80 origin-top-right rounded-lg bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-steel-200">
            <h3 className="font-semibold text-steel-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-navy-600 hover:text-navy-700 flex items-center gap-1"
              >
                <CheckIcon className="h-3 w-3" />
                Mark all read
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-steel-500">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <BellIcon className="h-12 w-12 text-steel-300 mx-auto mb-2" />
                <p className="text-sm text-steel-500">No notifications</p>
              </div>
            ) : (
              notifications.map((notif) => {
                const Icon = TYPE_ICONS[notif.type];
                const colorClass = TYPE_COLORS[notif.type];

                return (
                  <Menu.Item key={notif.id}>
                    {({ active }) => (
                      <button
                        onClick={() => handleNotificationClick(notif)}
                        className={`w-full text-left px-4 py-3 flex gap-3 ${
                          active ? 'bg-steel-50' : ''
                        } ${!notif.isRead ? 'bg-navy-50/50' : ''}`}
                      >
                        <div className={`p-2 rounded-full flex-shrink-0 ${colorClass}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${!notif.isRead ? 'font-medium' : ''} text-steel-900 truncate`}>
                            {notif.title}
                          </p>
                          <p className="text-xs text-steel-500 line-clamp-2 mt-0.5">
                            {notif.message}
                          </p>
                          <p className="text-xs text-steel-400 mt-1">
                            {formatTime(notif.createdAt)}
                          </p>
                        </div>
                        {!notif.isRead && (
                          <div className="w-2 h-2 bg-navy-500 rounded-full flex-shrink-0 mt-2" />
                        )}
                      </button>
                    )}
                  </Menu.Item>
                );
              })
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-steel-200 p-2">
              <button
                onClick={() => navigate('/notifications')}
                className="w-full text-center text-sm text-navy-600 hover:text-navy-700 py-2 hover:bg-steel-50 rounded"
              >
                View all notifications
              </button>
            </div>
          )}
        </Menu.Items>
      </Transition>
    </Menu>
  );
}
