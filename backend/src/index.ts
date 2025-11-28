import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
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

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Make prisma available to routes
app.locals.prisma = prisma;

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

// Health check
app.get('/api/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal server error', error: err.message });
});

// Start server
app.listen(PORT, () => {
  console.log(`Chronos Scheduler API running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
