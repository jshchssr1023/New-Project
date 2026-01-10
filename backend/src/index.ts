import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { prisma } from './services/db';
import logger from './utils/logger';
import { cleanupExpiredTokens } from './middleware/auth';
import { cleanupRateLimitEntries, loginRateLimit, apiRateLimit, initializeRateLimiter } from './middleware/rateLimit';
import { correlationIdMiddleware, CORRELATION_ID_HEADER } from './middleware/correlationId';
import { errorHandler, notFoundHandler } from './utils/errors';
import authRoutes from './routes/auth';
import carsRoutes from './routes/cars';
import shopsRoutes from './routes/shops';
import plansRoutes from './routes/plans';
import analyticsRoutes from './routes/analytics';
import usersRoutes from './routes/users';
import reportsRoutes from './routes/reports';
import auditRoutes from './routes/audit';
import permissionsRoutes from './routes/permissions';
import sopRoutes from './routes/sopRoutes';
import leaseQualificationRoutes from './routes/leaseQualificationRoutes';
import shopRulesRoutes from './routes/shopRules';
import importExportRoutes from './routes/importExport';
import notificationsRoutes from './routes/notifications';
import webhooksRoutes from './routes/webhooks';
import multiYearPlanningRoutes from './routes/multiYearPlanning';
import apiKeysRoutes from './routes/apiKeys';
import carFlowRoutes from './routes/carFlow';
import allocationRoutes from './routes/allocation';
import shopNetworksRoutes from './routes/shopNetworks';
import adminRoutes from './routes/admin';
import publicApiV1 from './routes/api/v1';
import planProposalsRoutes from './routes/planProposals';
import servicePlansRoutes from './routes/servicePlans';
import schedulerService from './services/schedulerService';
import websocketService from './services/websocketService';
import { initializeShoppingStatusJob, getShoppingStatusJob } from './jobs/shoppingStatusJob';

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 4000;

// Initialize WebSocket
const io = websocketService.initialize(httpServer);
app.locals.io = io;
app.locals.websocket = websocketService;

// CORS Configuration - use explicit allowed origins
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
const isProduction = process.env.NODE_ENV === 'production';

app.use(cors({
  origin: (origin, callback) => {
    // In production, reject requests without valid Origin header
    // (except for same-origin requests which don't have Origin)
    if (!origin) {
      if (isProduction) {
        // Allow same-origin requests (no Origin header) but be stricter
        // Only server-to-server or same-origin browser requests lack Origin
        callback(null, true);
        return;
      }
      // In development, allow requests without origin (curl, mobile apps, etc.)
      callback(null, true);
      return;
    }

    // Check against allowed origins
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // In development, allow localhost variants
      if (!isProduction && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))) {
        callback(null, true);
        return;
      }
      logger.warn('CORS blocked request from origin', { origin, isProduction });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Required for cookies to be sent cross-origin
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', CORRELATION_ID_HEADER],
  exposedHeaders: [CORRELATION_ID_HEADER], // Allow client to read correlation ID from responses
}));

// Cookie parser middleware - required for httpOnly cookie authentication
app.use(cookieParser());

// Correlation ID middleware - generates/propagates X-Correlation-ID for request tracing
app.use(correlationIdMiddleware);

// Security headers middleware
app.use(helmet({
  // Enable HSTS in production (tells browsers to only use HTTPS)
  hsts: process.env.NODE_ENV === 'production' ? {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  } : false,
  // Prevent clickjacking
  frameguard: { action: 'deny' },
  // Prevent MIME type sniffing
  noSniff: true,
  // XSS Protection (legacy browsers)
  xssFilter: true,
  // Disable powered-by header
  hidePoweredBy: true,
  // Content Security Policy - configure based on your needs
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  } : false, // Disable CSP in development for easier debugging
  // Referrer Policy
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
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
app.use('/api/analytics', apiRateLimit);
app.use('/api/users', apiRateLimit);
app.use('/api/reports', apiRateLimit);
app.use('/api/audit', apiRateLimit);
app.use('/api/permissions', apiRateLimit);
app.use('/api/sop', apiRateLimit);
app.use('/api/lease-qualification', apiRateLimit);
app.use('/api/shop-rules', apiRateLimit);
app.use('/api/import-export', apiRateLimit);
app.use('/api/notifications', apiRateLimit);
app.use('/api/webhooks', apiRateLimit);
app.use('/api/multi-year-planning', apiRateLimit);
app.use('/api/api-keys', apiRateLimit);
app.use('/api/car-flow', apiRateLimit);
app.use('/api/allocation', apiRateLimit);
app.use('/api/shop-networks', apiRateLimit);
app.use('/api/admin', apiRateLimit);
app.use('/api/proposals', apiRateLimit);
app.use('/api/service-plans', apiRateLimit);
app.use('/api/v1', apiRateLimit);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/cars', carsRoutes);
app.use('/api/shops', shopsRoutes);
app.use('/api/plans', plansRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/permissions', permissionsRoutes);
app.use('/api/sop', sopRoutes);
app.use('/api/lease-qualification', leaseQualificationRoutes);
app.use('/api/shop-rules', shopRulesRoutes);
app.use('/api/import-export', importExportRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/multi-year-planning', multiYearPlanningRoutes);
app.use('/api/api-keys', apiKeysRoutes);
app.use('/api/car-flow', carFlowRoutes);
app.use('/api/allocation', allocationRoutes);
app.use('/api/shop-networks', shopNetworksRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/proposals', planProposalsRoutes);
app.use('/api/service-plans', servicePlansRoutes);

// Public REST API (v1)
app.use('/api/v1', publicApiV1);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    correlationId: req.correlationId,
  });
});

// 404 handler for unknown routes
app.use(notFoundHandler);

// Centralized error handler - formats all errors consistently
app.use(errorHandler);

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

  // Initialize rate limiter (check database availability)
  try {
    await initializeRateLimiter();
  } catch (error) {
    logger.error('Failed to initialize rate limiter', error);
  }

  // Start the scheduler service for scheduled reports
  try {
    await schedulerService.start();
    logger.info('Scheduler service started for scheduled reports');
  } catch (error) {
    logger.error('Failed to start scheduler service', error);
  }

  // Initialize and start shopping status background job
  try {
    const shoppingStatusJob = initializeShoppingStatusJob(prisma, {
      incrementalIntervalMs: 60 * 60 * 1000, // 1 hour
      batchSize: 100,
    });
    shoppingStatusJob.start();
    logger.info('Shopping status job started');
  } catch (error) {
    logger.error('Failed to start shopping status job', error);
  }

  // Start cleanup jobs
  startCleanupJobs();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Shutting down gracefully...');
  schedulerService.stop();
  const shoppingJob = getShoppingStatusJob();
  if (shoppingJob) {
    shoppingJob.stop();
  }
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
