import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';

// Event types for type safety
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
  | 'collaboration:cursorMove';

export interface WebSocketPayload {
  event: WebSocketEvent;
  data: Record<string, unknown>;
  timestamp: string;
  userId?: string;
}

// Presence types for real-time collaboration
export interface UserPresence {
  socketId: string;
  userId: string;
  userName: string;
  userColor: string;
  companyId: string;
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

// Generate consistent color for user based on their ID
function generateUserColor(userId: string): string {
  const colors = [
    '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
  ];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash = hash & hash;
  }
  return colors[Math.abs(hash) % colors.length];
}

class WebSocketService {
  private io: Server | null = null;
  private connectedClients: Map<string, Socket> = new Map();
  // Presence tracking: socketId -> UserPresence
  private presenceMap: Map<string, UserPresence> = new Map();
  // Cell locks: "companyId:shopId:month" -> socketId
  private cellLocks: Map<string, string> = new Map();

  initialize(httpServer: HttpServer): Server {
    this.io = new Server(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
      path: '/socket.io',
    });

    this.io.on('connection', (socket: Socket) => {
      console.log(`Client connected: ${socket.id}`);
      this.connectedClients.set(socket.id, socket);

      // Join company-specific room for multi-tenant isolation
      socket.on('join:company', (companyId: string) => {
        socket.join(`company:${companyId}`);
        console.log(`Socket ${socket.id} joined company room: ${companyId}`);
      });

      // Join page-specific rooms for targeted updates
      socket.on('join:page', (page: string) => {
        socket.join(`page:${page}`);
        console.log(`Socket ${socket.id} joined page room: ${page}`);
      });

      socket.on('leave:page', (page: string) => {
        socket.leave(`page:${page}`);
      });

      // === Real-time Collaboration: Presence Management ===
      socket.on('presence:join', (data: { userId: string; userName: string; companyId: string; page: string }) => {
        const presence: UserPresence = {
          socketId: socket.id,
          userId: data.userId,
          userName: data.userName,
          userColor: generateUserColor(data.userId),
          companyId: data.companyId,
          page: data.page,
          lastSeen: new Date().toISOString(),
        };
        this.presenceMap.set(socket.id, presence);

        // Notify others in the same company
        socket.to(`company:${data.companyId}`).emit('presence:join', {
          event: 'presence:join',
          data: presence,
          timestamp: new Date().toISOString(),
        });

        // Send current presence list to the new user
        const companyPresence = this.getCompanyPresence(data.companyId);
        socket.emit('presence:list', {
          event: 'presence:list',
          data: { users: companyPresence },
          timestamp: new Date().toISOString(),
        });

        console.log(`Presence: ${data.userName} joined ${data.page}`);
      });

      socket.on('presence:update', (data: { page?: string; activity?: string }) => {
        const presence = this.presenceMap.get(socket.id);
        if (presence) {
          if (data.page) presence.page = data.page;
          if (data.activity !== undefined) presence.activity = data.activity;
          presence.lastSeen = new Date().toISOString();

          socket.to(`company:${presence.companyId}`).emit('presence:update', {
            event: 'presence:update',
            data: { socketId: socket.id, ...data },
            timestamp: new Date().toISOString(),
          });
        }
      });

      // === Real-time Collaboration: Drag-and-Drop Awareness ===
      socket.on('collaboration:dragStart', (data: { carIds: string[]; planId: string }) => {
        const presence = this.presenceMap.get(socket.id);
        if (presence) {
          presence.dragState = {
            isDragging: true,
            carIds: data.carIds,
          };
          presence.lastSeen = new Date().toISOString();

          socket.to(`company:${presence.companyId}`).emit('collaboration:dragStart', {
            event: 'collaboration:dragStart',
            data: {
              socketId: socket.id,
              userId: presence.userId,
              userName: presence.userName,
              userColor: presence.userColor,
              carIds: data.carIds,
              planId: data.planId,
            },
            timestamp: new Date().toISOString(),
          });
        }
      });

      socket.on('collaboration:dragEnd', (data: { success?: boolean; shopId?: string; month?: string }) => {
        const presence = this.presenceMap.get(socket.id);
        if (presence) {
          presence.dragState = undefined;
          presence.lastSeen = new Date().toISOString();

          socket.to(`company:${presence.companyId}`).emit('collaboration:dragEnd', {
            event: 'collaboration:dragEnd',
            data: {
              socketId: socket.id,
              userId: presence.userId,
              success: data.success,
              shopId: data.shopId,
              month: data.month,
            },
            timestamp: new Date().toISOString(),
          });
        }
      });

      // === Real-time Collaboration: Cell Locking ===
      socket.on('collaboration:cellLock', (data: { shopId: string; monthIndex: number }) => {
        const presence = this.presenceMap.get(socket.id);
        if (presence) {
          const lockKey = `${presence.companyId}:${data.shopId}:${data.monthIndex}`;
          const existingLock = this.cellLocks.get(lockKey);

          if (!existingLock || existingLock === socket.id) {
            this.cellLocks.set(lockKey, socket.id);
            presence.lockedCells = presence.lockedCells || [];
            presence.lockedCells.push({ shopId: data.shopId, monthIndex: data.monthIndex });

            socket.to(`company:${presence.companyId}`).emit('collaboration:cellLock', {
              event: 'collaboration:cellLock',
              data: {
                socketId: socket.id,
                userId: presence.userId,
                userName: presence.userName,
                userColor: presence.userColor,
                shopId: data.shopId,
                monthIndex: data.monthIndex,
              },
              timestamp: new Date().toISOString(),
            });

            socket.emit('collaboration:cellLock:ack', { success: true, shopId: data.shopId, monthIndex: data.monthIndex });
          } else {
            // Cell is locked by someone else
            const lockHolder = this.presenceMap.get(existingLock);
            socket.emit('collaboration:cellLock:ack', {
              success: false,
              shopId: data.shopId,
              monthIndex: data.monthIndex,
              lockedBy: lockHolder?.userName || 'Another user',
            });
          }
        }
      });

      socket.on('collaboration:cellUnlock', (data: { shopId: string; monthIndex: number }) => {
        const presence = this.presenceMap.get(socket.id);
        if (presence) {
          const lockKey = `${presence.companyId}:${data.shopId}:${data.monthIndex}`;
          if (this.cellLocks.get(lockKey) === socket.id) {
            this.cellLocks.delete(lockKey);
            presence.lockedCells = presence.lockedCells?.filter(
              c => !(c.shopId === data.shopId && c.monthIndex === data.monthIndex)
            );

            socket.to(`company:${presence.companyId}`).emit('collaboration:cellUnlock', {
              event: 'collaboration:cellUnlock',
              data: { socketId: socket.id, shopId: data.shopId, monthIndex: data.monthIndex },
              timestamp: new Date().toISOString(),
            });
          }
        }
      });

      // === Real-time Collaboration: Cursor Tracking (throttled by client) ===
      socket.on('collaboration:cursorMove', (data: { x: number; y: number; page: string }) => {
        const presence = this.presenceMap.get(socket.id);
        if (presence) {
          presence.cursor = { x: data.x, y: data.y };
          presence.lastSeen = new Date().toISOString();

          // Only broadcast to users on the same page for efficiency
          socket.to(`page:${data.page}`).emit('collaboration:cursorMove', {
            event: 'collaboration:cursorMove',
            data: {
              socketId: socket.id,
              userId: presence.userId,
              userName: presence.userName,
              userColor: presence.userColor,
              x: data.x,
              y: data.y,
            },
            timestamp: new Date().toISOString(),
          });
        }
      });

      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);

        // Clean up presence and locks
        const presence = this.presenceMap.get(socket.id);
        if (presence) {
          // Release all locks held by this user
          presence.lockedCells?.forEach(cell => {
            const lockKey = `${presence.companyId}:${cell.shopId}:${cell.monthIndex}`;
            this.cellLocks.delete(lockKey);
          });

          // Notify others
          this.io?.to(`company:${presence.companyId}`).emit('presence:leave', {
            event: 'presence:leave',
            data: { socketId: socket.id, userId: presence.userId, userName: presence.userName },
            timestamp: new Date().toISOString(),
          });

          this.presenceMap.delete(socket.id);
        }

        this.connectedClients.delete(socket.id);
      });
    });

    console.log('WebSocket service initialized');
    return this.io;
  }

  // Emit to all clients in a company
  emitToCompany(companyId: string, event: WebSocketEvent, data: Record<string, unknown>): void {
    if (!this.io) {
      console.warn('WebSocket not initialized');
      return;
    }

    const payload: WebSocketPayload = {
      event,
      data,
      timestamp: new Date().toISOString(),
    };

    this.io.to(`company:${companyId}`).emit(event, payload);
    console.log(`Emitted ${event} to company ${companyId}`, data);
  }

  // Emit to specific page listeners
  emitToPage(page: string, event: WebSocketEvent, data: Record<string, unknown>): void {
    if (!this.io) {
      console.warn('WebSocket not initialized');
      return;
    }

    const payload: WebSocketPayload = {
      event,
      data,
      timestamp: new Date().toISOString(),
    };

    this.io.to(`page:${page}`).emit(event, payload);
  }

  // Emit to all connected clients
  emitToAll(event: WebSocketEvent, data: Record<string, unknown>): void {
    if (!this.io) {
      console.warn('WebSocket not initialized');
      return;
    }

    const payload: WebSocketPayload = {
      event,
      data,
      timestamp: new Date().toISOString(),
    };

    this.io.emit(event, payload);
  }

  // Car-specific events
  emitCarUpdate(companyId: string, carId: string, changes: Record<string, unknown>): void {
    this.emitToCompany(companyId, 'car:updated', { carId, changes });
  }

  emitCarStatusChange(companyId: string, carId: string, oldStatus: string, newStatus: string): void {
    this.emitToCompany(companyId, 'car:statusChanged', { carId, oldStatus, newStatus });
  }

  // Assignment events
  emitAssignmentCreated(companyId: string, assignment: Record<string, unknown>): void {
    this.emitToCompany(companyId, 'assignment:created', assignment);
  }

  emitAssignmentUpdated(companyId: string, assignmentId: string, changes: Record<string, unknown>): void {
    this.emitToCompany(companyId, 'assignment:updated', { assignmentId, changes });
  }

  // Scenario events
  emitScenarioCommitted(companyId: string, scenarioId: string, result: Record<string, unknown>): void {
    this.emitToCompany(companyId, 'scenario:committed', { scenarioId, ...result });
  }

  // Shop capacity events
  emitCapacityChanged(companyId: string, shopId: string, month: string, newCapacity: Record<string, unknown>): void {
    this.emitToCompany(companyId, 'shop:capacityChanged', { shopId, month, ...newCapacity });
  }

  // MasterPlan events
  emitMasterPlanCreated(companyId: string, masterPlanId: string, data: Record<string, unknown>): void {
    this.emitToCompany(companyId, 'masterPlan:created', { masterPlanId, ...data });
    // Also trigger dashboard refresh
    this.emitToCompany(companyId, 'dashboard:refresh', { reason: 'masterPlan:created', masterPlanId });
  }

  emitMasterPlanApproved(companyId: string, masterPlanId: string, data: Record<string, unknown>): void {
    this.emitToCompany(companyId, 'masterPlan:approved', { masterPlanId, ...data });
    this.emitToCompany(companyId, 'dashboard:refresh', { reason: 'masterPlan:approved', masterPlanId });
  }

  emitMasterPlanActivated(companyId: string, masterPlanId: string, data: Record<string, unknown>): void {
    this.emitToCompany(companyId, 'masterPlan:activated', { masterPlanId, ...data });
    this.emitToCompany(companyId, 'dashboard:refresh', { reason: 'masterPlan:activated', masterPlanId });
  }

  emitScenarioApproved(companyId: string, scenarioId: string, masterPlanId: string, data: Record<string, unknown>): void {
    this.emitToCompany(companyId, 'scenario:approved', { scenarioId, masterPlanId, ...data });
  }

  emitCommitmentStatusChanged(companyId: string, commitmentId: string, oldStatus: string, newStatus: string): void {
    this.emitToCompany(companyId, 'commitment:statusChanged', { commitmentId, oldStatus, newStatus });
    this.emitToCompany(companyId, 'dashboard:refresh', { reason: 'commitment:statusChanged', commitmentId });
  }

  // Dashboard refresh
  emitDashboardRefresh(companyId: string, reason: string): void {
    this.emitToCompany(companyId, 'dashboard:refresh', { reason });
  }

  getConnectedCount(): number {
    return this.connectedClients.size;
  }

  // Get all users in a company
  getCompanyPresence(companyId: string): UserPresence[] {
    const users: UserPresence[] = [];
    this.presenceMap.forEach((presence) => {
      if (presence.companyId === companyId) {
        users.push(presence);
      }
    });
    return users;
  }

  // Get users on a specific page
  getPagePresence(page: string): UserPresence[] {
    const users: UserPresence[] = [];
    this.presenceMap.forEach((presence) => {
      if (presence.page === page) {
        users.push(presence);
      }
    });
    return users;
  }

  // Get cell locks for a company
  getCompanyCellLocks(companyId: string): { shopId: string; monthIndex: number; lockedBy: UserPresence }[] {
    const locks: { shopId: string; monthIndex: number; lockedBy: UserPresence }[] = [];
    this.cellLocks.forEach((socketId, key) => {
      if (key.startsWith(`${companyId}:`)) {
        const [, shopId, monthStr] = key.split(':');
        const presence = this.presenceMap.get(socketId);
        if (presence) {
          locks.push({
            shopId,
            monthIndex: parseInt(monthStr),
            lockedBy: presence,
          });
        }
      }
    });
    return locks;
  }

  // Emit assignment created event (for real-time collaboration)
  emitBulkAssignmentsCreated(companyId: string, assignments: Record<string, unknown>[], userId?: string): void {
    this.emitToCompany(companyId, 'assignment:created', {
      assignments,
      bulk: true,
      userId,
    });
    // Also refresh dashboard
    this.emitToCompany(companyId, 'dashboard:refresh', { reason: 'bulk_assignments', count: assignments.length });
  }

  // Emit to a specific user (by userId)
  emitToUser(userId: string, event: string, data: Record<string, unknown>): void {
    if (!this.io) return;

    // Find all sockets for this user
    for (const [socketId, presence] of this.presenceMap) {
      if (presence.userId === userId) {
        this.io.to(socketId).emit(event, {
          event,
          data,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }
}

// Singleton instance
const websocketService = new WebSocketService();
export default websocketService;
