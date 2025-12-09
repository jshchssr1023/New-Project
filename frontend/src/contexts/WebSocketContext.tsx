import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

// Event types matching backend
export type WebSocketEvent =
  | 'car:updated'
  | 'car:created'
  | 'car:deleted'
  | 'car:statusChanged'
  | 'assignment:created'
  | 'assignment:updated'
  | 'assignment:deleted'
  | 'scenario:committed'
  | 'scenario:updated'
  | 'scenario:approved'
  | 'shop:capacityChanged'
  | 'plan:updated'
  | 'masterPlan:created'
  | 'masterPlan:approved'
  | 'masterPlan:activated'
  | 'commitment:statusChanged'
  | 'dashboard:refresh'
  // Real-time collaboration events
  | 'presence:join'
  | 'presence:leave'
  | 'presence:update'
  | 'presence:list'
  | 'collaboration:dragStart'
  | 'collaboration:dragEnd'
  | 'collaboration:cellLock'
  | 'collaboration:cellUnlock'
  | 'collaboration:cursorMove'
  | 'notification:new';

export interface WebSocketPayload {
  event: WebSocketEvent;
  data: Record<string, unknown>;
  timestamp: string;
  userId?: string;
}

type EventHandler = (payload: WebSocketPayload) => void;

interface WebSocketContextValue {
  isConnected: boolean;
  subscribe: (event: WebSocketEvent, handler: EventHandler) => () => void;
  joinPage: (page: string) => void;
  leavePage: (page: string) => void;
  emit: (event: string, data: Record<string, unknown>) => void;
  getSocket: () => Socket | null;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

interface WebSocketProviderProps {
  children: ReactNode;
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef<Map<WebSocketEvent, Set<EventHandler>>>(new Map());

  useEffect(() => {
    // Only connect when user is authenticated
    if (!user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    // Connect to WebSocket server with JWT authentication
    const authToken = localStorage.getItem('authToken');
    const socket = io(window.location.origin, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: {
        token: authToken,
      },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('WebSocket connected');
      setIsConnected(true);

      // Join company room for multi-tenant isolation
      if (user.companyId) {
        socket.emit('join:company', user.companyId);
      }
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
    });

    // Set up listeners for all events
    const events: WebSocketEvent[] = [
      'car:updated',
      'car:created',
      'car:deleted',
      'car:statusChanged',
      'assignment:created',
      'assignment:updated',
      'assignment:deleted',
      'scenario:committed',
      'scenario:updated',
      'scenario:approved',
      'shop:capacityChanged',
      'plan:updated',
      'masterPlan:created',
      'masterPlan:approved',
      'masterPlan:activated',
      'commitment:statusChanged',
      'dashboard:refresh',
      // Real-time collaboration events
      'presence:join',
      'presence:leave',
      'presence:update',
      'presence:list',
      'collaboration:dragStart',
      'collaboration:dragEnd',
      'collaboration:cellLock',
      'collaboration:cellUnlock',
      'collaboration:cursorMove',
    ];

    events.forEach((event) => {
      socket.on(event, (payload: WebSocketPayload) => {
        console.log(`Received ${event}:`, payload);
        const handlers = handlersRef.current.get(event);
        if (handlers) {
          handlers.forEach((handler) => handler(payload));
        }
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  const subscribe = useCallback((event: WebSocketEvent, handler: EventHandler): (() => void) => {
    if (!handlersRef.current.has(event)) {
      handlersRef.current.set(event, new Set());
    }
    handlersRef.current.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      handlersRef.current.get(event)?.delete(handler);
    };
  }, []);

  const joinPage = useCallback((page: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('join:page', page);
    }
  }, []);

  const leavePage = useCallback((page: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('leave:page', page);
    }
  }, []);

  const emit = useCallback((event: string, data: Record<string, unknown>) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    }
  }, []);

  const getSocket = useCallback(() => socketRef.current, []);

  return (
    <WebSocketContext.Provider value={{ isConnected, subscribe, joinPage, leavePage, emit, getSocket }}>
      {children}
    </WebSocketContext.Provider>
  );
}

// Custom hook for using WebSocket
export function useWebSocket(): WebSocketContextValue {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}

// Custom hook for subscribing to specific events with automatic cleanup
export function useWebSocketEvent(event: WebSocketEvent, handler: EventHandler): void {
  const { subscribe } = useWebSocket();

  useEffect(() => {
    const unsubscribe = subscribe(event, handler);
    return unsubscribe;
  }, [event, handler, subscribe]);
}

// Custom hook for subscribing to multiple car-related events
export function useCarUpdates(onUpdate: () => void): void {
  const { subscribe } = useWebSocket();

  useEffect(() => {
    const unsubscribers = [
      subscribe('car:updated', onUpdate),
      subscribe('car:created', onUpdate),
      subscribe('car:deleted', onUpdate),
      subscribe('car:statusChanged', onUpdate),
    ];

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [subscribe, onUpdate]);
}

// Custom hook for subscribing to assignment-related events
export function useAssignmentUpdates(onUpdate: () => void): void {
  const { subscribe } = useWebSocket();

  useEffect(() => {
    const unsubscribers = [
      subscribe('assignment:created', onUpdate),
      subscribe('assignment:updated', onUpdate),
      subscribe('assignment:deleted', onUpdate),
      subscribe('scenario:committed', onUpdate),
    ];

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [subscribe, onUpdate]);
}

// Custom hook for subscribing to dashboard refresh events
export function useDashboardUpdates(onUpdate: () => void): void {
  const { subscribe } = useWebSocket();

  useEffect(() => {
    const unsubscribers = [
      subscribe('dashboard:refresh', onUpdate),
      subscribe('masterPlan:created', onUpdate),
      subscribe('masterPlan:approved', onUpdate),
      subscribe('masterPlan:activated', onUpdate),
      subscribe('commitment:statusChanged', onUpdate),
    ];

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [subscribe, onUpdate]);
}

// Custom hook for subscribing to master plan events
export function useMasterPlanUpdates(onUpdate: () => void): void {
  const { subscribe } = useWebSocket();

  useEffect(() => {
    const unsubscribers = [
      subscribe('masterPlan:created', onUpdate),
      subscribe('masterPlan:approved', onUpdate),
      subscribe('masterPlan:activated', onUpdate),
      subscribe('scenario:approved', onUpdate),
    ];

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [subscribe, onUpdate]);
}
