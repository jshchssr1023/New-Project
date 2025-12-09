import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { prisma } from './services/db';
import logger from './utils/logger';
import { cleanupExpiredTokens } from './middleware/auth';
import { cleanupRateLimitEntries, loginRateLimit, apiRateLimit } from './middleware/rateLimit';
import authRoutes from './routes/auth';
import carsRoutes from './routes/cars';
import shopsRoutes from './routes/shops';
import plansRoutes from './routes/plans';
import scenariosRoutes from './routes/scenarios';
import analyticsRoutes from './routes/analytics';
import usersRoutes from './routes/users';
import reportsRoutes from './routes/reports';
import auditRoutes from './routes/audit';
import permissionsRoutes from './routes/permissions';
import sopRoutes from './routes/sopRoutes';
import leaseQualificationRoutes from './routes/leaseQualificationRoutes';
import masterPlansRoutes from './routes/masterPlans';
import shopRulesRoutes from './routes/shopRules';
import importExportRoutes from './routes/importExport';
import notificationsRoutes from './routes/notifications';
import webhooksRoutes from './routes/webhooks';
import multiYearPlanningRoutes from './routes/multiYearPlanning';
import apiKeysRoutes from './routes/apiKeys';
import masterPlanWizardRoutes from './routes/masterPlanWizard';
import publicApiV1 from './routes/api/v1';
import schedulerService from './services/schedulerService';
import websocketService from './services/websocketService';

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 4000;

// Initialize WebSocket
const io = websocketService.initialize(httpServer);
app.locals.io = io;
app.locals.websocket = websocketService;

// CORS Configuration - use explicit allowed origins
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      callback(null, true);
      return;
    }
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked request from origin', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));

app.use(express.json({ limit: '10mb' }));

// Make prisma available to routes
app.locals.prisma = prisma;

// Apply login rate limiting to auth routes
app.use('/api/auth/login', loginRateLimit);

// Apply general API rate limiting to all authenticated routes
app.use('/api/cars', apiRateLimit);
app.use('/api/shops', apiRateLimit);
app.use('/api/plans', apiRateLimit);
app.use('/api/scenarios', apiRateLimit);
app.use('/api/analytics', apiRateLimit);
app.use('/api/users', apiRateLimit);
app.use('/api/reports', apiRateLimit);
app.use('/api/audit', apiRateLimit);
app.use('/api/permissions', apiRateLimit);
app.use('/api/sop', apiRateLimit);
app.use('/api/lease-qualification', apiRateLimit);
app.use('/api/masterplans', apiRateLimit);
app.use('/api/shop-rules', apiRateLimit);
app.use('/api/import-export', apiRateLimit);
app.use('/api/notifications', apiRateLimit);
app.use('/api/webhooks', apiRateLimit);
app.use('/api/multi-year-planning', apiRateLimit);
app.use('/api/api-keys', apiRateLimit);
app.use('/api/master-plan-wizard', apiRateLimit);
app.use('/api/v1', apiRateLimit);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/cars', carsRoutes);
app.use('/api/shops', shopsRoutes);
app.use('/api/plans', plansRoutes);
app.use('/api/scenarios', scenariosRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/permissions', permissionsRoutes);
app.use('/api/sop', sopRoutes);
app.use('/api/lease-qualification', leaseQualificationRoutes);
app.use('/api/masterplans', masterPlansRoutes);
app.use('/api/shop-rules', shopRulesRoutes);
app.use('/api/import-export', importExportRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/multi-year-planning', multiYearPlanningRoutes);
app.use('/api/api-keys', apiKeysRoutes);
app.use('/api/master-plan-wizard', masterPlanWizardRoutes);

// Public REST API (v1)
app.use('/api/v1', publicApiV1);

// Health check
app.get('/api/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', err);
  res.status(500).json({ message: 'Internal server error' });
});

// Cleanup jobs - run every hour
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

function startCleanupJobs() {
  setInterval(async () => {
    try {
      await cleanupExpiredTokens();
      await cleanupRateLimitEntries();
    } catch (error) {
      logger.error('Cleanup job failed', error);
    }
  }, CLEANUP_INTERVAL);

  logger.info('Cleanup jobs scheduled', { intervalMs: CLEANUP_INTERVAL });
}

// Start server with WebSocket support
httpServer.listen(PORT, async () => {
  logger.info('Chronos Scheduler API started', { port: PORT });
  logger.info('WebSocket server ready', { port: PORT });

  // Start the scheduler service for scheduled reports
  try {
    await schedulerService.start();
    logger.info('Scheduler service started for scheduled reports');
  } catch (error) {
    logger.error('Failed to start scheduler service', error);
  }

  // Start cleanup jobs
  startCleanupJobs();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Shutting down gracefully...');
  schedulerService.stop();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', reason as Error, { promise: String(promise) });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', error);
  process.exit(1);
});
