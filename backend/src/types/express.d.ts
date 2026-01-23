/**
 * Express Type Extensions
 *
 * Extends Express types to include properly typed app.locals
 */

import { prisma } from '../services/db';
import { Server } from 'socket.io';
import type WebSocketService from '../services/websocketService';

declare global {
  namespace Express {
    interface Locals {
      prisma: typeof prisma;
      io: Server;
      websocket: typeof WebSocketService;
    }
  }
}

export {};
