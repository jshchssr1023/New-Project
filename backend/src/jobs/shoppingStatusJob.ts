/**
 * Shopping Status Recalculation Job
 *
 * Background job that periodically recalculates shopping status for all cars.
 * This ensures the denormalized shoppingStatus field stays in sync with
 * qualification dates and car status changes.
 *
 * Runs:
 * - Every hour for incremental updates (cars modified in last hour)
 * - Daily at 2 AM for full backfill
 */

import { PrismaClient } from '@prisma/client';
import { createShoppingStatusService } from '../services/shoppingStatusService';
import logger from '../utils/logger';

interface JobConfig {
  incrementalIntervalMs: number; // How often to run incremental updates
  fullBackfillCron: string; // Cron expression for full backfill
  batchSize: number; // Number of cars to process at once
}

const DEFAULT_CONFIG: JobConfig = {
  incrementalIntervalMs: 60 * 60 * 1000, // 1 hour
  fullBackfillCron: '0 2 * * *', // 2 AM daily
  batchSize: 100,
};

export class ShoppingStatusJob {
  private prisma: PrismaClient;
  private config: JobConfig;
  private incrementalTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastIncrementalRun: Date | null = null;

  constructor(prisma: PrismaClient, config: Partial<JobConfig> = {}) {
    this.prisma = prisma;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the background job scheduler
   */
  start(): void {
    logger.info('Starting Shopping Status Job scheduler', {
      incrementalInterval: `${this.config.incrementalIntervalMs / 1000 / 60} minutes`,
      batchSize: this.config.batchSize,
    });

    // Run incremental update immediately
    this.runIncrementalUpdate();

    // Schedule periodic incremental updates
    this.incrementalTimer = setInterval(() => {
      this.runIncrementalUpdate();
    }, this.config.incrementalIntervalMs);
  }

  /**
   * Stop the background job scheduler
   */
  stop(): void {
    logger.info('Stopping Shopping Status Job scheduler');
    if (this.incrementalTimer) {
      clearInterval(this.incrementalTimer);
      this.incrementalTimer = null;
    }
  }

  /**
   * Run incremental update - only cars modified since last run
   */
  async runIncrementalUpdate(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Shopping status job already running, skipping');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      const service = createShoppingStatusService(this.prisma);

      // Find cars modified since last run (or last hour if first run)
      const since = this.lastIncrementalRun || new Date(Date.now() - this.config.incrementalIntervalMs);

      // Get cars that have been updated recently OR have qualification dates
      // that might have crossed a threshold (e.g., becoming overdue)
      const carsToUpdate = await this.prisma.car.findMany({
        where: {
          OR: [
            // Cars modified since last run
            { updatedAt: { gte: since } },
            // Cars with qualification dates that might need status change
            // (e.g., dates that just passed current year boundary)
            {
              AND: [
                { shoppingStatus: { in: ['Upcoming', 'Must Shop'] } },
                {
                  OR: [
                    { minNoLining: { lte: new Date() } },
                    { minWLining: { lte: new Date() } },
                    { tankQualification: { lte: new Date() } },
                    { rule88B: { lte: new Date() } },
                    { safetyRelief: { lte: new Date() } },
                    { serviceEquipment: { lte: new Date() } },
                    { stubSill: { lte: new Date() } },
                    { tankThickness: { lte: new Date() } },
                    { interiorLining: { lte: new Date() } },
                  ],
                },
              ],
            },
          ],
        },
        select: { id: true },
        take: this.config.batchSize * 10, // Get more to batch process
      });

      if (carsToUpdate.length === 0) {
        logger.debug('No cars need shopping status update');
        this.lastIncrementalRun = new Date();
        return;
      }

      const carIds = carsToUpdate.map((c) => c.id);

      // Process in batches
      let processed = 0;
      for (let i = 0; i < carIds.length; i += this.config.batchSize) {
        const batch = carIds.slice(i, i + this.config.batchSize);
        await service.updateBatchShoppingStatus(batch);
        processed += batch.length;
      }

      const duration = Date.now() - startTime;
      logger.info('Incremental shopping status update completed', {
        carsProcessed: processed,
        durationMs: duration,
      });

      this.lastIncrementalRun = new Date();
    } catch (error) {
      logger.error('Error in incremental shopping status update', { error });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Run full backfill - recalculate all cars
   */
  async runFullBackfill(companyId?: string): Promise<{ processed: number; updated: number }> {
    if (this.isRunning) {
      logger.warn('Shopping status job already running, skipping full backfill');
      return { processed: 0, updated: 0 };
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      const service = createShoppingStatusService(this.prisma);

      logger.info('Starting full shopping status backfill', { companyId });

      const result = await service.backfillAllShoppingStatuses(companyId, this.config.batchSize);

      const duration = Date.now() - startTime;
      logger.info('Full shopping status backfill completed', {
        processed: result.processed,
        updated: result.updated,
        durationMs: duration,
      });

      return result;
    } catch (error) {
      logger.error('Error in full shopping status backfill', { error });
      return { processed: 0, updated: 0 };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get job status for monitoring
   */
  getStatus(): {
    isRunning: boolean;
    lastRun: Date | null;
    nextRun: Date | null;
  } {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastIncrementalRun,
      nextRun: this.lastIncrementalRun
        ? new Date(this.lastIncrementalRun.getTime() + this.config.incrementalIntervalMs)
        : null,
    };
  }
}

// Singleton instance for global access
let jobInstance: ShoppingStatusJob | null = null;

export function initializeShoppingStatusJob(prisma: PrismaClient, config?: Partial<JobConfig>): ShoppingStatusJob {
  if (jobInstance) {
    jobInstance.stop();
  }
  jobInstance = new ShoppingStatusJob(prisma, config);
  return jobInstance;
}

export function getShoppingStatusJob(): ShoppingStatusJob | null {
  return jobInstance;
}

export default ShoppingStatusJob;
