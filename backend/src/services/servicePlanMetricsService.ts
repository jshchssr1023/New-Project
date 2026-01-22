/**
 * servicePlanMetricsService.ts - Metrics Tracking for Service Plan Confirmation
 *
 * Tracks and records metrics for confirmation workflow actions:
 * - Car confirmations (individual and bulk)
 * - Car deletions
 * - Final plan confirmations
 * - Archive operations
 * - Version changes
 *
 * These metrics can be used for:
 * - Operational dashboards
 * - Performance analytics
 * - Audit compliance
 * - Trend analysis
 */

import { prisma } from './db';
import logger from '../utils/logger';
import featureFlags from '../config/featureFlags';

export interface ConfirmationMetric {
  id?: string;
  eventType: string;
  servicePlanId: string;
  customerId: string;
  userId: string;
  companyId: string;
  carCount?: number;
  durationMs?: number;
  success: boolean;
  errorMessage?: string;
  metadata?: Record<string, any>;
  createdAt?: string;
}

/**
 * Metric event types
 */
export const MetricEventType = {
  CAR_CONFIRMED: 'car_confirmed',
  CAR_BULK_CONFIRMED: 'car_bulk_confirmed',
  CAR_DELETED: 'car_deleted',
  PLAN_FINAL_CONFIRMED: 'plan_final_confirmed',
  PLANS_ARCHIVED: 'plans_archived',
  MASTER_SCHEDULE_SYNC: 'master_schedule_sync',
  VERSION_INCREMENT: 'version_increment',
} as const;

/**
 * Service Plan Metrics Service
 */
class ServicePlanMetricsService {
  private metricsBuffer: ConfirmationMetric[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private readonly BUFFER_SIZE = 100;
  private readonly FLUSH_INTERVAL_MS = 5000;

  constructor() {
    // Start flush interval if metrics tracking is enabled
    if (featureFlags.isMetricsTrackingEnabled()) {
      this.startFlushInterval();
    }
  }

  /**
   * Record a confirmation metric
   */
  async recordMetric(metric: ConfirmationMetric): Promise<void> {
    if (!featureFlags.isMetricsTrackingEnabled()) {
      return;
    }

    const enrichedMetric: ConfirmationMetric = {
      ...metric,
      createdAt: new Date().toISOString(),
    };

    // Add to buffer
    this.metricsBuffer.push(enrichedMetric);

    // Log for immediate visibility
    logger.info(`[Metrics] ${metric.eventType}`, {
      servicePlanId: metric.servicePlanId,
      customerId: metric.customerId,
      carCount: metric.carCount,
      success: metric.success,
      durationMs: metric.durationMs,
    });

    // Flush if buffer is full
    if (this.metricsBuffer.length >= this.BUFFER_SIZE) {
      await this.flush();
    }
  }

  /**
   * Record car confirmation metric
   */
  async recordCarConfirmation(
    servicePlanId: string,
    customerId: string,
    userId: string,
    companyId: string,
    carId: string,
    railcarNumber: string,
    success: boolean,
    durationMs: number,
    errorMessage?: string
  ): Promise<void> {
    await this.recordMetric({
      eventType: MetricEventType.CAR_CONFIRMED,
      servicePlanId,
      customerId,
      userId,
      companyId,
      carCount: 1,
      durationMs,
      success,
      errorMessage,
      metadata: { carId, railcarNumber },
    });
  }

  /**
   * Record bulk car confirmation metric
   */
  async recordBulkCarConfirmation(
    servicePlanId: string,
    customerId: string,
    userId: string,
    companyId: string,
    confirmedCount: number,
    totalAttempted: number,
    durationMs: number,
    failedCarIds?: string[]
  ): Promise<void> {
    await this.recordMetric({
      eventType: MetricEventType.CAR_BULK_CONFIRMED,
      servicePlanId,
      customerId,
      userId,
      companyId,
      carCount: confirmedCount,
      durationMs,
      success: confirmedCount === totalAttempted,
      errorMessage: failedCarIds?.length
        ? `Failed to confirm ${failedCarIds.length} cars`
        : undefined,
      metadata: { totalAttempted, failedCarIds },
    });
  }

  /**
   * Record car deletion metric
   */
  async recordCarDeletion(
    servicePlanId: string,
    customerId: string,
    userId: string,
    companyId: string,
    carId: string,
    railcarNumber: string,
    deleteReason: string,
    success: boolean,
    durationMs: number
  ): Promise<void> {
    await this.recordMetric({
      eventType: MetricEventType.CAR_DELETED,
      servicePlanId,
      customerId,
      userId,
      companyId,
      carCount: 1,
      durationMs,
      success,
      metadata: { carId, railcarNumber, deleteReason },
    });
  }

  /**
   * Record final plan confirmation metric
   */
  async recordFinalConfirmation(
    servicePlanId: string,
    customerId: string,
    userId: string,
    companyId: string,
    scheduledCars: number,
    archivedPlans: number,
    success: boolean,
    durationMs: number,
    errorMessage?: string
  ): Promise<void> {
    await this.recordMetric({
      eventType: MetricEventType.PLAN_FINAL_CONFIRMED,
      servicePlanId,
      customerId,
      userId,
      companyId,
      carCount: scheduledCars,
      durationMs,
      success,
      errorMessage,
      metadata: { scheduledCars, archivedPlans },
    });
  }

  /**
   * Record Master Schedule sync metric
   */
  async recordMasterScheduleSync(
    servicePlanId: string,
    customerId: string,
    companyId: string,
    carCount: number,
    success: boolean,
    durationMs: number,
    isAsync: boolean,
    errorMessage?: string
  ): Promise<void> {
    await this.recordMetric({
      eventType: MetricEventType.MASTER_SCHEDULE_SYNC,
      servicePlanId,
      customerId,
      userId: 'system',
      companyId,
      carCount,
      durationMs,
      success,
      errorMessage,
      metadata: { isAsync },
    });
  }

  /**
   * Get aggregated metrics for a time range
   */
  async getMetricsSummary(
    companyId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalConfirmations: number;
    totalDeletions: number;
    totalFinalConfirmations: number;
    avgConfirmationTimeMs: number;
    successRate: number;
  }> {
    // For now, return placeholder data
    // This would be implemented with actual database queries
    // when metrics table is added
    return {
      totalConfirmations: 0,
      totalDeletions: 0,
      totalFinalConfirmations: 0,
      avgConfirmationTimeMs: 0,
      successRate: 100,
    };
  }

  /**
   * Flush metrics buffer to storage
   */
  async flush(): Promise<void> {
    if (this.metricsBuffer.length === 0) {
      return;
    }

    const metricsToFlush = [...this.metricsBuffer];
    this.metricsBuffer = [];

    try {
      // For now, just log the metrics
      // In production, this would write to a metrics table or external service
      logger.debug(`[Metrics] Flushing ${metricsToFlush.length} metrics`);

      // Future: Write to ServicePlanMetric table
      // await prisma.servicePlanMetric.createMany({ data: metricsToFlush });

    } catch (error: any) {
      logger.error('[Metrics] Failed to flush metrics', { error: error.message });
      // Re-add failed metrics to buffer (with limit to prevent memory issues)
      this.metricsBuffer = [
        ...metricsToFlush.slice(-this.BUFFER_SIZE / 2),
        ...this.metricsBuffer,
      ].slice(-this.BUFFER_SIZE);
    }
  }

  /**
   * Start periodic flush interval
   */
  private startFlushInterval(): void {
    if (this.flushInterval) {
      return;
    }

    this.flushInterval = setInterval(async () => {
      await this.flush();
    }, this.FLUSH_INTERVAL_MS);
  }

  /**
   * Stop flush interval and flush remaining metrics
   */
  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    await this.flush();
  }
}

// Singleton instance
export const servicePlanMetricsService = new ServicePlanMetricsService();

export default servicePlanMetricsService;
