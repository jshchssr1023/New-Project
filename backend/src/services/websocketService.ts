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
  | 'dashboard:refresh';

export interface WebSocketPayload {
  event: WebSocketEvent;
  data: Record<string, unknown>;
  timestamp: string;
  userId?: string;
}

class WebSocketService {
  private io: Server | null = null;
  private connectedClients: Map<string, Socket> = new Map();

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

      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
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
}

// Singleton instance
const websocketService = new WebSocketService();
export default websocketService;
