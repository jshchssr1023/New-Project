/**
 * Scheduler Service
 *
 * Manages cron jobs for scheduled reports and automated tasks.
 * Uses node-cron for scheduling and integrates with PDF and email services.
 *
 * @author AITX Chronos Team
 */

import cron, { ScheduledTask } from 'node-cron';
import { prisma } from './db';
import pdfService from './pdfService';
import emailService, { EmailAttachment, ReportEmailData } from './emailService';
import reportBuilderService from './reportBuilderService';

// =============================================================================
// INTERFACES
// =============================================================================

export interface ScheduledJob {
  id: string;
  name: string;
  cronExpression: string;
  task: ScheduledTask;
  lastRun?: Date;
  nextRun?: Date;
  status: 'active' | 'paused' | 'error';
}

export interface JobExecutionResult {
  success: boolean;
  jobId: string;
  executedAt: Date;
  duration: number;
  error?: string;
  details?: Record<string, unknown>;
}

// =============================================================================
// SCHEDULER SERVICE CLASS
// =============================================================================

class SchedulerService {
  private jobs: Map<string, ScheduledJob> = new Map();
  private isRunning: boolean = false;
  private reportCheckJob: ScheduledTask | null = null;

  constructor() {
    // Using imported prisma instance
  }

  private get prisma() {
    return prisma;
  }

  /**
   * Start the scheduler service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[Scheduler] Already running');
      return;
    }

    console.log('[Scheduler] Starting scheduler service...');

    // Initialize email service
    await emailService.initialize();

    // Start the main report check job (runs every minute)
    this.reportCheckJob = cron.schedule('* * * * *', async () => {
      await this.checkAndRunDueReports();
    });

    this.isRunning = true;
    console.log('[Scheduler] Scheduler service started');
  }

  /**
   * Stop the scheduler service
   */
  stop(): void {
    if (!this.isRunning) {
      console.log('[Scheduler] Already stopped');
      return;
    }

    console.log('[Scheduler] Stopping scheduler service...');

    // Stop the main check job
    if (this.reportCheckJob) {
      this.reportCheckJob.stop();
      this.reportCheckJob = null;
    }

    // Stop all scheduled jobs
    for (const job of this.jobs.values()) {
      job.task.stop();
    }
    this.jobs.clear();

    this.isRunning = false;
    console.log('[Scheduler] Scheduler service stopped');
  }

  /**
   * Check and run all due scheduled reports
   */
  async checkAndRunDueReports(): Promise<void> {
    const now = new Date().toISOString();

    try {
      // Find all due reports
      const dueReports = await this.prisma.scheduledReport.findMany({
        where: {
          isActive: true,
          nextRunAt: { lte: now },
        },
      });

      if (dueReports.length === 0) {
        return; // Nothing to do
      }

      console.log(`[Scheduler] Found ${dueReports.length} due report(s)`);

      // Process each report
      for (const report of dueReports) {
        await this.executeScheduledReport(report.id);
      }
    } catch (error) {
      console.error('[Scheduler] Error checking due reports:', error);
    }
  }

  /**
   * Execute a scheduled report
   */
  async executeScheduledReport(reportId: string): Promise<JobExecutionResult> {
    const startTime = Date.now();

    try {
      // Get the report with template
      const report = await this.prisma.scheduledReport.findUnique({
        where: { id: reportId },
      });

      if (!report) {
        return {
          success: false,
          jobId: reportId,
          executedAt: new Date(),
          duration: Date.now() - startTime,
          error: 'Report not found',
        };
      }

      // Get the template
      const template = await reportBuilderService.getTemplate(report.templateId, report.companyId);
      if (!template) {
        throw new Error('Report template not found');
      }

      console.log(`[Scheduler] Executing report: ${report.name}`);

      // Execute the report query
      const { data } = await reportBuilderService.executeReport(
        {
          entityType: template.entityType,
          columns: template.columns,
          filters: template.filters,
          sort: template.sortConfig,
          groupBy: template.groupBy,
        },
        report.companyId
      );

      // Generate the output in the requested format
      let attachment: EmailAttachment;
      const timestamp = new Date().toISOString().split('T')[0];

      switch (report.outputFormat) {
        case 'pdf': {
          const pdfBuffer = await this.generateReportPdf(
            data,
            template.columns,
            template.entityType,
            report.name
          );
          attachment = {
            filename: `${report.name.replace(/\s+/g, '_')}_${timestamp}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          };
          break;
        }

        case 'xlsx': {
          const excelData = reportBuilderService.generateExcelData(data, template.columns, template.entityType);
          // For XLSX, we'll send as JSON that the client can convert
          // In production, you'd use a proper xlsx library here
          const csvContent = this.convertExcelDataToCsv(excelData);
          attachment = {
            filename: `${report.name.replace(/\s+/g, '_')}_${timestamp}.csv`,
            content: csvContent,
            contentType: 'text/csv',
          };
          break;
        }

        case 'csv':
        default: {
          const csv = reportBuilderService.generateCSV(data, template.columns, template.entityType);
          attachment = {
            filename: `${report.name.replace(/\s+/g, '_')}_${timestamp}.csv`,
            content: csv,
            contentType: 'text/csv',
          };
          break;
        }
      }

      // Parse recipients
      const recipients = JSON.parse(report.recipients) as string[];

      // Prepare report data for email
      const reportData: ReportEmailData = {
        reportName: report.name,
        reportType: 'scheduled',
        generatedAt: new Date(),
        recordCount: data.length,
        exportFormat: report.outputFormat as 'pdf' | 'csv' | 'xlsx',
      };

      // Send email
      const emailResult = await emailService.sendReportEmail(recipients, reportData, attachment);

      // Calculate next run time
      const nextRunAt = this.calculateNextRun(report.schedule, report.timezone);

      // Update report status
      await this.prisma.scheduledReport.update({
        where: { id: reportId },
        data: {
          lastRunAt: new Date(),
          lastRunStatus: emailResult.success ? 'success' : 'failed',
          lastRunError: emailResult.error || '',
          nextRunAt,
        },
      });

      const duration = Date.now() - startTime;
      console.log(`[Scheduler] Report executed successfully in ${duration}ms: ${report.name}`);

      return {
        success: true,
        jobId: reportId,
        executedAt: new Date(),
        duration,
        details: {
          recordCount: data.length,
          emailSent: emailResult.success,
          recipients: emailResult.accepted,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const duration = Date.now() - startTime;

      console.error(`[Scheduler] Report execution failed: ${errorMessage}`);

      // Update report status with error
      await this.prisma.scheduledReport.update({
        where: { id: reportId },
        data: {
          lastRunAt: new Date(),
          lastRunStatus: 'failed',
          lastRunError: errorMessage,
        },
      });

      return {
        success: false,
        jobId: reportId,
        executedAt: new Date(),
        duration,
        error: errorMessage,
      };
    }
  }

  /**
   * Generate PDF for a report
   */
  private async generateReportPdf(
    data: Record<string, unknown>[],
    columns: string[],
    entityType: string,
    reportName: string
  ): Promise<Buffer> {
    // Get column definitions for headers
    const allColumns = reportBuilderService.getAvailableColumns(entityType);
    const columnDefs = columns.map((colKey) => {
      const colDef = allColumns.find((c) => c.key === colKey);
      return {
        header: colDef?.label || colKey,
        key: colKey,
      };
    });

    // Convert data to rows
    const headers = columnDefs.map((c) => c.header);
    const rows = data.map((row) =>
      columns.map((col) => this.formatCellValue(row[col]))
    );

    return pdfService.generateFromReportData(headers, rows, {
      title: reportName,
      subtitle: `${entityType} Report - ${data.length} Records`,
      createdAt: new Date(),
    });
  }

  /**
   * Format cell value for display
   */
  private formatCellValue(value: unknown): string {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (value instanceof Date) return value.toLocaleDateString();
    if (typeof value === 'number') {
      // Format currency-like numbers
      if (value > 1000) return value.toLocaleString();
      return value.toString();
    }
    return String(value);
  }

  /**
   * Convert Excel data structure to CSV
   */
  private convertExcelDataToCsv(excelData: { headers: string[]; rows: unknown[][] }): string {
    const { headers, rows } = excelData;

    const escapeCell = (value: unknown): string => {
      const str = String(value ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headerRow = headers.map(escapeCell).join(',');
    const dataRows = rows.map((row) => row.map(escapeCell).join(','));

    return [headerRow, ...dataRows].join('\n');
  }

  /**
   * Calculate the next run time from a cron expression
   */
  private calculateNextRun(cronExpression: string, timezone: string): Date {
    // Parse cron expression parts
    const parts = cronExpression.split(' ');
    if (parts.length !== 5) {
      // Default to tomorrow at 8 AM
      const next = new Date();
      next.setDate(next.getDate() + 1);
      next.setHours(8, 0, 0, 0);
      return next;
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    const now = new Date();
    const next = new Date(now);

    // Set time
    next.setMinutes(parseInt(minute) || 0);
    next.setHours(parseInt(hour) || 0);
    next.setSeconds(0);
    next.setMilliseconds(0);

    // If time has passed today, move to tomorrow
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    // Handle day of week (0 = Sunday, 1 = Monday, etc.)
    if (dayOfWeek !== '*') {
      const targetDay = parseInt(dayOfWeek);
      const currentDay = next.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      next.setDate(next.getDate() + daysUntil);
    }

    // Handle day of month
    if (dayOfMonth !== '*') {
      const targetDate = parseInt(dayOfMonth);
      next.setDate(targetDate);
      if (next <= now) {
        next.setMonth(next.getMonth() + 1);
      }
    }

    return next;
  }

  /**
   * Register a custom scheduled job
   */
  registerJob(
    id: string,
    name: string,
    cronExpression: string,
    handler: () => Promise<void>
  ): boolean {
    if (!cron.validate(cronExpression)) {
      console.error(`[Scheduler] Invalid cron expression: ${cronExpression}`);
      return false;
    }

    // Stop existing job if any
    if (this.jobs.has(id)) {
      this.jobs.get(id)!.task.stop();
    }

    const task = cron.schedule(cronExpression, async () => {
      const job = this.jobs.get(id);
      if (job) {
        job.lastRun = new Date();
        try {
          await handler();
          job.status = 'active';
        } catch (error) {
          console.error(`[Scheduler] Job ${name} failed:`, error);
          job.status = 'error';
        }
      }
    });

    this.jobs.set(id, {
      id,
      name,
      cronExpression,
      task,
      status: 'active',
    });

    console.log(`[Scheduler] Registered job: ${name} (${cronExpression})`);
    return true;
  }

  /**
   * Unregister a scheduled job
   */
  unregisterJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (job) {
      job.task.stop();
      this.jobs.delete(id);
      console.log(`[Scheduler] Unregistered job: ${job.name}`);
      return true;
    }
    return false;
  }

  /**
   * Get all registered jobs
   */
  getJobs(): ScheduledJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    isRunning: boolean;
    jobCount: number;
    emailReady: boolean;
  } {
    return {
      isRunning: this.isRunning,
      jobCount: this.jobs.size,
      emailReady: emailService.isReady(),
    };
  }

  /**
   * Manually trigger a report (for testing or on-demand)
   */
  async triggerReport(reportId: string): Promise<JobExecutionResult> {
    return this.executeScheduledReport(reportId);
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const schedulerService = new SchedulerService();
export default schedulerService;
