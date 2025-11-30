/**
 * Public API v1 Router
 *
 * Aggregates all v1 API endpoints under /api/v1/
 */

import { Router } from 'express';
import { authenticateApiKey } from '../../../middleware/apiAuth';
import carsRouter from './cars';
import shopsRouter from './shops';
import plansRouter from './plans';
import analyticsRouter from './analytics';
import webhooksRouter from './webhooks';

const router = Router();

// All v1 routes require API key authentication
router.use(authenticateApiKey);

// Mount sub-routers
router.use('/cars', carsRouter);
router.use('/shops', shopsRouter);
router.use('/plans', plansRouter);
router.use('/analytics', analyticsRouter);
router.use('/webhooks', webhooksRouter);

// API info endpoint
router.get('/', (_, res) => {
  res.json({
    version: '1.0.0',
    endpoints: [
      { path: '/cars', description: 'Fleet management' },
      { path: '/shops', description: 'Shop locations and capacity' },
      { path: '/plans', description: 'Master plans and commitments' },
      { path: '/analytics', description: 'Performance metrics' },
      { path: '/webhooks', description: 'Webhook subscriptions' },
    ],
    documentation: 'https://docs.chronos-scheduler.com/api/v1',
    rateLimit: {
      header: 'X-RateLimit-Remaining',
      resetHeader: 'X-RateLimit-Reset',
    },
  });
});

export default router;
