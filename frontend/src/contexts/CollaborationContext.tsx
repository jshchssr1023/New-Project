import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { useWebSocket, WebSocketPayload } from './WebSocketContext';
import { useAuth } from './AuthContext';

// User presence type
export interface UserPresence {
  socketId: string;
  userId: string;
  userName: string;
  userColor: string;
  page: string;
  activity?: string;
  cursor?: { x: number; y: number };
  dragState?: {
    isDragging: boolean;
    carIds: string[];
    targetShopId?: string;
    targetMonth?: number;
  };
  lockedCells?: { shopId: string; monthIndex: number }[];
  lastSeen: string;
}

// Cell lock info
export interface CellLock {
  shopId: string;
  monthIndex: number;
  lockedBy: {
    socketId: string;
    userId: string;
    userName: string;
    userColor: string;
  };
}

// Collaboration context value
interface CollaborationContextValue {
  // Presence
  activeUsers: UserPresence[];
  currentPage: string;
  setCurrentPage: (page: string) => void;

  // Drag state
  remoteDraggers: Map<string, { userName: string; userColor: string; carIds: string[] }>;
  notifyDragStart: (carIds: string[], planId: string) => void;
  notifyDragEnd: (success?: boolean, shopId?: string, month?: string) => void;

  // Cell locking
  cellLocks: Map<string, CellLock>;
  lockCell: (shopId: string, monthIndex: number) => Promise<boolean>;
  unlockCell: (shopId: string, monthIndex: number) => void;
  isCellLocked: (shopId: string, monthIndex: number) => CellLock | null;

  // Cursor tracking (optional)
  remoteCursors: Map<string, { userName: string; userColor: string; x: number; y: number }>;
  updateCursor: (x: number, y: number) => void;
}

const CollaborationContext = createContext<CollaborationContextValue | null>(null);

interface CollaborationProviderProps {
  children: ReactNode;
}

export function CollaborationProvider({ children }: CollaborationProviderProps) {
  const { user } = useAuth();
  const { isConnected, subscribe, emit, joinPage, leavePage } = useWebSocket();

  // State
  const [activeUsers, setActiveUsers] = useState<UserPresence[]>([]);
  const [currentPage, setCurrentPageState] = useState<string>('');
  const [remoteDraggers, setRemoteDraggers] = useState<Map<string, { userName: string; userColor: string; carIds: string[] }>>(new Map());
  const [cellLocks, setCellLocks] = useState<Map<string, CellLock>>(new Map());
  const [remoteCursors, setRemoteCursors] = useState<Map<string, { userName: string; userColor: string; x: number; y: number }>>(new Map());

  // Pending lock callbacks
  const pendingLockCallbacks = useRef<Map<string, (success: boolean) => void>>(new Map());

  // Cursor throttle
  const cursorThrottleRef = useRef<number>(0);

  // Join presence when connected
  useEffect(() => {
    if (isConnected && user && currentPage) {
      emit('presence:join', {
        userId: user.id,
        userName: `${user.firstName} ${user.lastName}`,
        companyId: user.companyId,
        page: currentPage,
      });
    }
  }, [isConnected, user, currentPage, emit]);

  // Subscribe to presence events
  useEffect(() => {
    if (!isConnected) return;

    const unsubscribers = [
      // Presence list (initial load)
      subscribe('presence:list', (payload: WebSocketPayload) => {
        const data = payload.data as { users: UserPresence[] };
        const users = data.users || [];
        setActiveUsers(users.filter(u => u.userId !== user?.id));
      }),

      // User joined
      subscribe('presence:join', (payload: WebSocketPayload) => {
        const newUser = payload.data as unknown as UserPresence;
        if (newUser.userId !== user?.id) {
          setActiveUsers(prev => {
            const exists = prev.find(u => u.socketId === newUser.socketId);
            if (exists) return prev;
            return [...prev, newUser];
          });
        }
      }),

      // User left
      subscribe('presence:leave', (payload: WebSocketPayload) => {
        const { socketId } = payload.data as { socketId: string };
        setActiveUsers(prev => prev.filter(u => u.socketId !== socketId));
        setRemoteDraggers(prev => {
          const next = new Map(prev);
          next.delete(socketId);
          return next;
        });
        setRemoteCursors(prev => {
          const next = new Map(prev);
          next.delete(socketId);
          return next;
        });
        // Also remove any locks held by this user
        setCellLocks(prev => {
          const next = new Map(prev);
          for (const [key, lock] of next.entries()) {
            if (lock.lockedBy.socketId === socketId) {
              next.delete(key);
            }
          }
          return next;
        });
      }),

      // User updated
      subscribe('presence:update', (payload: WebSocketPayload) => {
        const { socketId, page, activity } = payload.data as { socketId: string; page?: string; activity?: string };
        setActiveUsers(prev => prev.map(u => {
          if (u.socketId === socketId) {
            return { ...u, page: page || u.page, activity: activity ?? u.activity };
          }
          return u;
        }));
      }),

      // Drag start from another user
      subscribe('collaboration:dragStart', (payload: WebSocketPayload) => {
        const { socketId, userName, userColor, carIds } = payload.data as {
          socketId: string;
          userName: string;
          userColor: string;
          carIds: string[];
        };
        setRemoteDraggers(prev => {
          const next = new Map(prev);
          next.set(socketId, { userName, userColor, carIds });
          return next;
        });
      }),

      // Drag end from another user
      subscribe('collaboration:dragEnd', (payload: WebSocketPayload) => {
        const { socketId } = payload.data as { socketId: string };
        setRemoteDraggers(prev => {
          const next = new Map(prev);
          next.delete(socketId);
          return next;
        });
      }),

      // Cell lock from another user
      subscribe('collaboration:cellLock', (payload: WebSocketPayload) => {
        const { socketId, userId, userName, userColor, shopId, monthIndex } = payload.data as {
          socketId: string;
          userId: string;
          userName: string;
          userColor: string;
          shopId: string;
          monthIndex: number;
        };
        const key = `${shopId}:${monthIndex}`;
        setCellLocks(prev => {
          const next = new Map(prev);
          next.set(key, {
            shopId,
            monthIndex,
            lockedBy: { socketId, userId, userName, userColor },
          });
          return next;
        });
      }),

      // Cell unlock from another user
      subscribe('collaboration:cellUnlock', (payload: WebSocketPayload) => {
        const { shopId, monthIndex } = payload.data as { shopId: string; monthIndex: number };
        const key = `${shopId}:${monthIndex}`;
        setCellLocks(prev => {
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
      }),

      // Cursor move from another user
      subscribe('collaboration:cursorMove', (payload: WebSocketPayload) => {
        const { socketId, userName, userColor, x, y } = payload.data as {
          socketId: string;
          userName: string;
          userColor: string;
          x: number;
          y: number;
        };
        setRemoteCursors(prev => {
          const next = new Map(prev);
          next.set(socketId, { userName, userColor, x, y });
          return next;
        });
      }),
    ];

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [isConnected, subscribe, user]);

  // Listen for cell lock acknowledgments (via socket directly)
  useEffect(() => {
    if (!isConnected) return;

    const socket = (window as any).__collaborationSocket;
    if (!socket) return;

    const handleLockAck = (data: { success: boolean; shopId: string; monthIndex: number; lockedBy?: string }) => {
      const key = `${data.shopId}:${data.monthIndex}`;
      const callback = pendingLockCallbacks.current.get(key);
      if (callback) {
        callback(data.success);
        pendingLockCallbacks.current.delete(key);
      }
    };

    socket.on('collaboration:cellLock:ack', handleLockAck);
    return () => {
      socket.off('collaboration:cellLock:ack', handleLockAck);
    };
  }, [isConnected]);

  // Set current page and notify
  const setCurrentPage = useCallback((page: string) => {
    if (currentPage && currentPage !== page) {
      leavePage(currentPage);
    }
    setCurrentPageState(page);
    joinPage(page);
    emit('presence:update', { page });
  }, [currentPage, leavePage, joinPage, emit]);

  // Notify drag start
  const notifyDragStart = useCallback((carIds: string[], planId: string) => {
    emit('collaboration:dragStart', { carIds, planId });
  }, [emit]);

  // Notify drag end
  const notifyDragEnd = useCallback((success?: boolean, shopId?: string, month?: string) => {
    emit('collaboration:dragEnd', { success, shopId, month });
  }, [emit]);

  // Lock a cell
  const lockCell = useCallback((shopId: string, monthIndex: number): Promise<boolean> => {
    return new Promise((resolve) => {
      const key = `${shopId}:${monthIndex}`;

      // Check if already locked by someone else
      const existingLock = cellLocks.get(key);
      if (existingLock) {
        resolve(false);
        return;
      }

      pendingLockCallbacks.current.set(key, resolve);
      emit('collaboration:cellLock', { shopId, monthIndex });

      // Timeout after 2 seconds
      setTimeout(() => {
        if (pendingLockCallbacks.current.has(key)) {
          pendingLockCallbacks.current.delete(key);
          resolve(false);
        }
      }, 2000);
    });
  }, [cellLocks, emit]);

  // Unlock a cell
  const unlockCell = useCallback((shopId: string, monthIndex: number) => {
    emit('collaboration:cellUnlock', { shopId, monthIndex });
  }, [emit]);

  // Check if a cell is locked
  const isCellLocked = useCallback((shopId: string, monthIndex: number): CellLock | null => {
    const key = `${shopId}:${monthIndex}`;
    return cellLocks.get(key) || null;
  }, [cellLocks]);

  // Update cursor position (throttled)
  const updateCursor = useCallback((x: number, y: number) => {
    const now = Date.now();
    if (now - cursorThrottleRef.current < 50) return; // 20 FPS max
    cursorThrottleRef.current = now;
    emit('collaboration:cursorMove', { x, y, page: currentPage });
  }, [emit, currentPage]);

  return (
    <CollaborationContext.Provider
      value={{
        activeUsers,
        currentPage,
        setCurrentPage,
        remoteDraggers,
        notifyDragStart,
        notifyDragEnd,
        cellLocks,
        lockCell,
        unlockCell,
        isCellLocked,
        remoteCursors,
        updateCursor,
      }}
    >
      {children}
    </CollaborationContext.Provider>
  );
}

// Hook to use collaboration context
export function useCollaboration(): CollaborationContextValue {
  const context = useContext(CollaborationContext);
  if (!context) {
    throw new Error('useCollaboration must be used within a CollaborationProvider');
  }
  return context;
}

// Hook to get users on the same page
export function usePageUsers(): UserPresence[] {
  const { activeUsers, currentPage } = useCollaboration();
  return activeUsers.filter(u => u.page === currentPage);
}

// Hook to check if a specific car is being dragged by another user
export function useCarDragState(carId: string): { isDragged: boolean; draggedBy?: string; userColor?: string } {
  const { remoteDraggers } = useCollaboration();

  for (const [, dragger] of remoteDraggers) {
    if (dragger.carIds.includes(carId)) {
      return { isDragged: true, draggedBy: dragger.userName, userColor: dragger.userColor };
    }
  }

  return { isDragged: false };
}
