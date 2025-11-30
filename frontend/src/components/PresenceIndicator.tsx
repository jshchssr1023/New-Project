import { useState } from 'react';
import { UserGroupIcon, EyeIcon, CursorArrowRaysIcon } from '@heroicons/react/24/outline';
import { useCollaboration, usePageUsers, UserPresence } from '../contexts/CollaborationContext';

interface PresenceIndicatorProps {
  maxAvatars?: number;
  showDetails?: boolean;
}

// Get initials from name
function getInitials(name: string): string {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// Format activity text
function formatActivity(activity?: string): string {
  if (!activity) return 'Viewing';
  switch (activity) {
    case 'dragging':
      return 'Dragging cars';
    case 'editing':
      return 'Editing';
    case 'selecting':
      return 'Selecting cars';
    default:
      return activity;
  }
}

export default function PresenceIndicator({ maxAvatars = 5, showDetails = true }: PresenceIndicatorProps) {
  const { activeUsers } = useCollaboration();
  const pageUsers = usePageUsers();
  const [isExpanded, setIsExpanded] = useState(false);

  if (activeUsers.length === 0) {
    return null;
  }

  const displayUsers = pageUsers.slice(0, maxAvatars);
  const overflowCount = pageUsers.length - maxAvatars;
  const otherPageUsers = activeUsers.filter(u => !pageUsers.includes(u));

  return (
    <div className="relative">
      {/* Compact view - avatars */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1 px-2 py-1 bg-white border border-steel-200 rounded-full shadow-sm hover:shadow-md transition-shadow"
      >
        <div className="flex -space-x-2">
          {displayUsers.map((user) => (
            <div
              key={user.socketId}
              className="relative"
              title={`${user.userName} - ${formatActivity(user.activity)}`}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-medium border-2 border-white"
                style={{ backgroundColor: user.userColor }}
              >
                {getInitials(user.userName)}
              </div>
              {/* Activity indicator dot */}
              {user.dragState?.isDragging && (
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-amber-400 rounded-full border border-white animate-pulse" />
              )}
            </div>
          ))}
          {overflowCount > 0 && (
            <div className="w-7 h-7 rounded-full flex items-center justify-center bg-steel-200 text-steel-600 text-xs font-medium border-2 border-white">
              +{overflowCount}
            </div>
          )}
        </div>
        {showDetails && (
          <span className="text-xs text-steel-500 ml-1">
            {pageUsers.length} here
          </span>
        )}
      </button>

      {/* Expanded dropdown */}
      {isExpanded && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsExpanded(false)}
          />

          {/* Dropdown panel */}
          <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-lg border border-steel-200 z-50 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 bg-steel-50 border-b border-steel-200">
              <div className="flex items-center gap-2">
                <UserGroupIcon className="w-5 h-5 text-steel-500" />
                <span className="font-medium text-steel-900">Active Users</span>
                <span className="text-xs text-steel-500">({activeUsers.length} online)</span>
              </div>
            </div>

            {/* Users on this page */}
            {pageUsers.length > 0 && (
              <div className="p-2">
                <div className="text-xs font-medium text-steel-500 px-2 py-1 flex items-center gap-1">
                  <EyeIcon className="w-3 h-3" />
                  On this page
                </div>
                {pageUsers.map((user) => (
                  <UserRow key={user.socketId} user={user} />
                ))}
              </div>
            )}

            {/* Users on other pages */}
            {otherPageUsers.length > 0 && (
              <div className="p-2 border-t border-steel-100">
                <div className="text-xs font-medium text-steel-500 px-2 py-1">
                  On other pages
                </div>
                {otherPageUsers.map((user) => (
                  <UserRow key={user.socketId} user={user} showPage />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Individual user row
function UserRow({ user, showPage = false }: { user: UserPresence; showPage?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-steel-50">
      {/* Avatar */}
      <div className="relative">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
          style={{ backgroundColor: user.userColor }}
        >
          {getInitials(user.userName)}
        </div>
        {user.dragState?.isDragging && (
          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-amber-400 rounded-full border-2 border-white animate-pulse" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-steel-900 truncate">
          {user.userName}
        </div>
        <div className="text-xs text-steel-500 flex items-center gap-1">
          {user.dragState?.isDragging ? (
            <>
              <CursorArrowRaysIcon className="w-3 h-3 text-amber-500" />
              <span className="text-amber-600">
                Dragging {user.dragState.carIds.length} car{user.dragState.carIds.length !== 1 ? 's' : ''}
              </span>
            </>
          ) : showPage ? (
            <span className="capitalize">{user.page.replace('/', '') || 'Dashboard'}</span>
          ) : (
            <span>{formatActivity(user.activity)}</span>
          )}
        </div>
      </div>

      {/* Live indicator */}
      <div className="w-2 h-2 bg-green-400 rounded-full" title="Online" />
    </div>
  );
}

// Mini version for inline use
export function PresenceAvatars({ users, size = 'sm' }: { users: UserPresence[]; size?: 'sm' | 'md' }) {
  const sizeClasses = size === 'sm' ? 'w-5 h-5 text-[10px]' : 'w-6 h-6 text-xs';

  return (
    <div className="flex -space-x-1.5">
      {users.slice(0, 3).map((user) => (
        <div
          key={user.socketId}
          className={`${sizeClasses} rounded-full flex items-center justify-center text-white font-medium border border-white`}
          style={{ backgroundColor: user.userColor }}
          title={user.userName}
        >
          {getInitials(user.userName)}
        </div>
      ))}
      {users.length > 3 && (
        <div className={`${sizeClasses} rounded-full flex items-center justify-center bg-steel-300 text-steel-600 font-medium border border-white`}>
          +{users.length - 3}
        </div>
      )}
    </div>
  );
}
