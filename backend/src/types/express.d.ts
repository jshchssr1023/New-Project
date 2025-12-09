/**
 * Express Type Extensions
 *
 * Extends Express types to include properly typed app.locals
 */

import { PrismaClient } from '@prisma/client';
import { Server } from 'socket.io';
import type WebSocketService from '../services/websocketService';

declare global {
  namespace Express {
    interface Locals {
      prisma: PrismaClient;
      io: Server;
      websocket: typeof WebSocketService;
    }
  }
}

export {};
