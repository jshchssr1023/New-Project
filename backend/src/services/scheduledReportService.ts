// Scheduled Report Service
// Manages scheduled report jobs with cron-like scheduling
import { PrismaClient } from '@prisma/client';
import reportBuilderService from './reportBuilderService';

const prisma = new PrismaClient();

// Common schedule presets
export const SCHEDULE_PRESETS = {
  DAILY_8AM: { cron: '0 8 * * *', label: 'Daily at 8:00 AM' },
  DAILY_6PM: { cron: '0 18 * * *', label: 'Daily at 6:00 PM' },
  WEEKLY_MONDAY_8AM: { cron: '0 8 * * 1', label: 'Weekly on Monday at 8:00 AM' },
  WEEKLY_FRIDAY_5PM: { cron: '0 17 * * 5', label: 'Weekly on Friday at 5:00 PM' },
  BIWEEKLY_MONDAY: { cron: '0 8 1,15 * *', label: 'Bi-weekly on 1st and 15th at 8:00 AM' },
  MONTHLY_FIRST: { cron: '0 8 1 * *', label: 'Monthly on the 1st at 8:00 AM' },
  MONTHLY_LAST_FRIDAY: { cron: '0 17 * * 5L', label: 'Monthly on last Friday at 5:00 PM' },
  QUARTERLY: { cron: '0 8 1 1,4,7,10 *', label: 'Quarterly (Jan, Apr, Jul, Oct 1st)' },
};

// Parse cron expression to calculate next run time
function parseNextRun(cronExpression: string, timezone: string): Date {
  // Simplified cron parsing for common patterns
  const parts = cronExpression.split(' ');
  if (parts.length !== 5) {
    throw new Error('Invalid cron expression');
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const now = new Date();

  // Simple calculation - in production, use a proper cron library like node-cron or croner
  const nextRun = new Date(now);

  // Set the time
  nextRun.setMinutes(parseInt(minute) || 0);
  nextRun.setHours(parseInt(hour) || 0);
  nextRun.setSeconds(0);
  nextRun.setMilliseconds(0);

  // If time has passed today, move to tomorrow
  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }

  // Handle day of week (1 = Monday, 7 = Sunday)
  if (dayOfWeek !== '*') {
    const targetDay = parseInt(dayOfWeek);
    const currentDay = nextRun.getDay();
    const daysUntilTarget = (targetDay - currentDay + 7) % 7;
    if (daysUntilTarget > 0 || nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + (daysUntilTarget || 7));
    }
  }

  // Handle day of month
  if (dayOfMonth !== '*') {
    const targetDate = parseInt(dayOfMonth);
    if (nextRun.getDate() !== targetDate) {
      nextRun.setDate(targetDate);
      if (nextRun <= now) {
        nextRun.setMonth(nextRun.getMonth() + 1);
      }
    }
  }

  return nextRun;
}

// Create a scheduled report
export async function createScheduledReport(
  name: string,
  templateId: string,
  schedule: string,
  timezone: string,
  outputFormat: 'pdf' | 'csv' | 'xlsx',
  recipients: string[],
  createdById: string,
  companyId: string
) {
  // Validate template exists
  const template = await prisma.reportTemplate.findFirst({
    where: { id: templateId, companyId },
  });

  if (!template) {
    throw new Error('Report template not found');
  }

  // Validate recipients (basic email validation)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const email of recipients) {
    if (!emailRegex.test(email)) {
      throw new Error(`Invalid email address: ${email}`);
    }
  }

  // Calculate next run time
  const nextRunAt = parseNextRun(schedule, timezone);

  return prisma.scheduledReport.create({
    data: {
      name,
      templateId,
      schedule,
      timezone,
      outputFormat,
      recipients: JSON.stringify(recipients),
      isActive: true,
      nextRunAt,
      createdById,
      companyId,
    },
  });
}

// Get scheduled reports
export async function getScheduledReports(companyId: string, userId?: string) {
  const where: Record<string, unknown> = { companyId };
  if (userId) where.createdById = userId;

  const reports = await prisma.scheduledReport.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  return Promise.all(
    reports.map(async (r) => {
      const template = await prisma.reportTemplate.findUnique({
        where: { id: r.templateId },
      });
      return {
        ...r,
        recipients: JSON.parse(r.recipients),
        template: template ? {
          id: template.id,
          name: template.name,
          entityType: template.entityType,
        } : null,
      };
    })
  );
}

// Get a single scheduled report
export async function getScheduledReport(reportId: string, companyId: string) {
  const report = await prisma.scheduledReport.findFirst({
    where: { id: reportId, companyId },
  });

  if (!report) return null;

  const template = await prisma.reportTemplate.findUnique({
    where: { id: report.templateId },
  });

  return {
    ...report,
    recipients: JSON.parse(report.recipients),
    template: template ? {
      id: template.id,
      name: template.name,
      entityType: template.entityType,
      columns: JSON.parse(template.columns),
      filters: JSON.parse(template.filters),
    } : null,
  };
}

// Update scheduled report
export async function updateScheduledReport(
  reportId: string,
  updates: Partial<{
    name: string;
    schedule: string;
    timezone: string;
    outputFormat: 'pdf' | 'csv' | 'xlsx';
    recipients: string[];
    isActive: boolean;
  }>,
  companyId: string
) {
  const data: Record<string, unknown> = {};

  if (updates.name) data.name = updates.name;
  if (updates.schedule) {
    data.schedule = updates.schedule;
    data.nextRunAt = parseNextRun(updates.schedule, updates.timezone || 'America/Chicago');
  }
  if (updates.timezone) data.timezone = updates.timezone;
  if (updates.outputFormat) data.outputFormat = updates.outputFormat;
  if (updates.recipients) data.recipients = JSON.stringify(updates.recipients);
  if (updates.isActive !== undefined) data.isActive = updates.isActive;

  return prisma.scheduledReport.updateMany({
    where: { id: reportId, companyId },
    data,
  });
}

// Delete scheduled report
export async function deleteScheduledReport(reportId: string, companyId: string) {
  return prisma.scheduledReport.deleteMany({
    where: { id: reportId, companyId },
  });
}

// Toggle scheduled report active status
export async function toggleScheduledReport(reportId: string, companyId: string) {
  const report = await prisma.scheduledReport.findFirst({
    where: { id: reportId, companyId },
  });

  if (!report) throw new Error('Scheduled report not found');

  const newIsActive = !report.isActive;
  let nextRunAt = report.nextRunAt;

  if (newIsActive) {
    // Recalculate next run when reactivating
    nextRunAt = parseNextRun(report.schedule, report.timezone);
  }

  return prisma.scheduledReport.update({
    where: { id: reportId },
    data: {
      isActive: newIsActive,
      nextRunAt,
    },
  });
}

// Execute a scheduled report (called by scheduler/cron job)
export async function executeScheduledReport(reportId: string) {
  const report = await prisma.scheduledReport.findUnique({
    where: { id: reportId },
  });

  if (!report) throw new Error('Scheduled report not found');

  const template = await reportBuilderService.getTemplate(report.templateId, report.companyId);
  if (!template) throw new Error('Report template not found');

  try {
    // Execute the report
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

    // Generate output based on format
    let output: string | { headers: string[]; rows: unknown[][] };

    switch (report.outputFormat) {
      case 'csv':
        output = reportBuilderService.generateCSV(data, template.columns, template.entityType);
        break;
      case 'xlsx':
        output = reportBuilderService.generateExcelData(data, template.columns, template.entityType);
        break;
      case 'pdf':
        // PDF generation would require additional library (e.g., puppeteer, pdfkit)
        // For now, generate CSV as fallback
        output = reportBuilderService.generateCSV(data, template.columns, template.entityType);
        break;
      default:
        output = reportBuilderService.generateCSV(data, template.columns, template.entityType);
    }

    // In production, send email to recipients here
    // For now, log the execution
    console.log(`[ScheduledReport] Executed report ${report.name} for ${JSON.parse(report.recipients).join(', ')}`);

    // Calculate next run time
    const nextRunAt = parseNextRun(report.schedule, report.timezone);

    // Update report status
    await prisma.scheduledReport.update({
      where: { id: reportId },
      data: {
        lastRunAt: new Date(),
        lastRunStatus: 'success',
        lastRunError: '',
        nextRunAt,
      },
    });

    return { success: true, data: output };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Update report status with error
    await prisma.scheduledReport.update({
      where: { id: reportId },
      data: {
        lastRunAt: new Date(),
        lastRunStatus: 'failed',
        lastRunError: errorMessage,
      },
    });

    throw error;
  }
}

// Get reports due to run
export async function getDueReports(): Promise<string[]> {
  const now = new Date();

  const dueReports = await prisma.scheduledReport.findMany({
    where: {
      isActive: true,
      nextRunAt: { lte: now },
    },
    select: { id: true },
  });

  return dueReports.map(r => r.id);
}

// Run due reports (called by scheduler)
export async function runDueReports(): Promise<{ success: number; failed: number }> {
  const dueReportIds = await getDueReports();
  let success = 0;
  let failed = 0;

  for (const reportId of dueReportIds) {
    try {
      await executeScheduledReport(reportId);
      success++;
    } catch (error) {
      console.error(`[ScheduledReport] Failed to run report ${reportId}:`, error);
      failed++;
    }
  }

  return { success, failed };
}

export default {
  SCHEDULE_PRESETS,
  createScheduledReport,
  getScheduledReports,
  getScheduledReport,
  updateScheduledReport,
  deleteScheduledReport,
  toggleScheduledReport,
  executeScheduledReport,
  getDueReports,
  runDueReports,
};
