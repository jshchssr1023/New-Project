// Custom Report Builder and Scheduled Reports API Routes
import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import reportBuilderService, { FilterCriteria, SortConfig } from '../services/reportBuilderService';
import scheduledReportService from '../services/scheduledReportService';
import auditService from '../services/auditService';
import pdfService from '../services/pdfService';
import schedulerService from '../services/schedulerService';
import logger from '../utils/logger';
import { getParam } from '../utils/routeParams';

const router = Router();

// Apply auth to all routes
router.use(authenticate);

// Get available columns for entity type
router.get('/columns/:entityType', async (req, res) => {
  try {
    const entityType = getParam(req.params.entityType);
    const columns = reportBuilderService.getAvailableColumns(entityType);

    if (columns.length === 0) {
      return res.status(400).json({ message: `Unknown entity type: ${entityType}` });
    }

    res.json(columns);
  } catch (error) {
    logger.error('Failed to get columns:', error);
    res.status(500).json({ message: 'Failed to get columns' });
  }
});

// Execute a report query (preview)
router.post('/execute', async (req, res) => {
  try {
    const { entityType, columns, filters, sort, groupBy } = req.body;
    const companyId = (req as any).user.companyId;

    if (!entityType || !columns || columns.length === 0) {
      return res.status(400).json({ message: 'Entity type and columns are required' });
    }

    const result = await reportBuilderService.executeReport(
      { entityType, columns, filters: filters || [], sort, groupBy },
      companyId
    );

    res.json(result);
  } catch (error) {
    logger.error('Failed to execute report:', error);
    res.status(500).json({ message: 'Failed to execute report' });
  }
});

// Export report as CSV
router.post('/export/csv', async (req, res) => {
  try {
    const { entityType, columns, filters, sort, groupBy } = req.body;
    const user = (req as any).user;

    if (!entityType || !columns || columns.length === 0) {
      return res.status(400).json({ message: 'Entity type and columns are required' });
    }

    const { data } = await reportBuilderService.executeReport(
      { entityType, columns, filters: filters || [], sort, groupBy },
      user.companyId
    );

    const csv = reportBuilderService.generateCSV(data, columns, entityType);

    // Log export action
    await auditService.logAudit({
      userId: user.id,
      userEmail: user.email,
      action: 'export',
      entityType: entityType,
      entityId: 'bulk',
      entityName: `${entityType} Export`,
      changes: { exportedCount: { new: data.length } },
      metadata: { format: 'csv', columns, filters },
      companyId: user.companyId,
    }, req);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${entityType.toLowerCase()}-report-${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    logger.error('Failed to export CSV:', error);
    res.status(500).json({ message: 'Failed to export CSV' });
  }
});

// Export report as Excel-compatible JSON
router.post('/export/xlsx', async (req, res) => {
  try {
    const { entityType, columns, filters, sort, groupBy } = req.body;
    const user = (req as any).user;

    if (!entityType || !columns || columns.length === 0) {
      return res.status(400).json({ message: 'Entity type and columns are required' });
    }

    const { data } = await reportBuilderService.executeReport(
      { entityType, columns, filters: filters || [], sort, groupBy },
      user.companyId
    );

    const excelData = reportBuilderService.generateExcelData(data, columns, entityType);

    // Log export action
    await auditService.logAudit({
      userId: user.id,
      userEmail: user.email,
      action: 'export',
      entityType: entityType,
      entityId: 'bulk',
      entityName: `${entityType} Export`,
      changes: { exportedCount: { new: data.length } },
      metadata: { format: 'xlsx', columns, filters },
      companyId: user.companyId,
    }, req);

    res.json(excelData);
  } catch (error) {
    logger.error('Failed to export Excel data:', error);
    res.status(500).json({ message: 'Failed to export Excel data' });
  }
});

// Export report as PDF
router.post('/export/pdf', async (req, res) => {
  try {
    const { entityType, columns, filters, sort, groupBy, title } = req.body;
    const user = (req as any).user;

    if (!entityType || !columns || columns.length === 0) {
      return res.status(400).json({ message: 'Entity type and columns are required' });
    }

    const { data } = await reportBuilderService.executeReport(
      { entityType, columns, filters: filters || [], sort, groupBy },
      user.companyId
    );

    // Get column definitions for headers
    const allColumns = reportBuilderService.getAvailableColumns(entityType);
    const headers = columns.map((colKey: string) => {
      const colDef = allColumns.find((c) => c.key === colKey);
      return colDef?.label || colKey;
    });

    // Convert data to rows
    const rows = data.map((row) =>
      columns.map((col: string) => {
        const value = (row as Record<string, unknown>)[col];
        if (value === null || value === undefined) return '-';
        if (typeof value === 'boolean') return value ? 'Yes' : 'No';
        if (value instanceof Date) return value.toLocaleDateString();
        if (typeof value === 'number' && value > 1000) return value.toLocaleString();
        return String(value);
      })
    );

    // Generate PDF
    const pdfBuffer = await pdfService.generateFromReportData(headers, rows, {
      title: title || `${entityType} Report`,
      subtitle: `${data.length} Records`,
      createdAt: new Date(),
    });

    // Log export action
    await auditService.logAudit({
      userId: user.id,
      userEmail: user.email,
      action: 'export',
      entityType: entityType,
      entityId: 'bulk',
      entityName: `${entityType} Export`,
      changes: { exportedCount: { new: data.length } },
      metadata: { format: 'pdf', columns, filters },
      companyId: user.companyId,
    }, req);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${entityType.toLowerCase()}-report-${Date.now()}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    logger.error('Failed to export PDF:', error);
    res.status(500).json({ message: 'Failed to export PDF' });
  }
});

// Get scheduler status
router.get('/scheduler/status', requireRole('admin'), (_, res) => {
  res.json(schedulerService.getStatus());
});

// Trigger a scheduled report immediately (admin only)
router.post('/schedules/:id/trigger', requireRole('admin'), async (req, res) => {
  try {
    const id = getParam(req.params.id);
    const result = await schedulerService.triggerReport(id);
    res.json(result);
  } catch (error) {
    logger.error('Failed to trigger scheduled report:', error);
    res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to trigger report' });
  }
});

// ============ Report Templates ============

// Get all templates
router.get('/templates', async (req, res) => {
  try {
    const user = (req as any).user;
    const templates = await reportBuilderService.getTemplates(user.companyId, user.id);
    res.json(templates);
  } catch (error) {
    logger.error('Failed to get templates:', error);
    res.status(500).json({ message: 'Failed to get templates' });
  }
});

// Get single template
router.get('/templates/:id', async (req, res) => {
  try {
    const id = getParam(req.params.id);
    const companyId = (req as any).user.companyId;
    const template = await reportBuilderService.getTemplate(id, companyId);

    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    res.json(template);
  } catch (error) {
    logger.error('Failed to get template:', error);
    res.status(500).json({ message: 'Failed to get template' });
  }
});

// Create template
router.post('/templates', async (req, res) => {
  try {
    const { name, description, entityType, columns, filters, sort, groupBy, outputFormats, isPublic } = req.body;
    const user = (req as any).user;

    if (!name || !entityType || !columns || columns.length === 0) {
      return res.status(400).json({ message: 'Name, entity type, and columns are required' });
    }

    const template = await reportBuilderService.saveTemplate(
      name,
      description || '',
      { entityType, columns, filters: filters || [], sort, groupBy },
      outputFormats || ['csv'],
      isPublic || false,
      user.id,
      user.companyId
    );

    // Log template creation
    await auditService.logAudit({
      userId: user.id,
      userEmail: user.email,
      action: 'create',
      entityType: 'ReportTemplate',
      entityId: template.id,
      entityName: name,
      changes: { name: { new: name }, entityType: { new: entityType } },
      companyId: user.companyId,
    }, req);

    res.status(201).json(template);
  } catch (error) {
    logger.error('Failed to create template:', error);
    res.status(500).json({ message: 'Failed to create template' });
  }
});

// Update template
router.put('/templates/:id', async (req, res) => {
  try {
    const id = getParam(req.params.id);
    const user = (req as any).user;
    const updates = req.body;

    await reportBuilderService.updateTemplate(id, updates, user.companyId);

    // Log update
    await auditService.logAudit({
      userId: user.id,
      userEmail: user.email,
      action: 'update',
      entityType: 'ReportTemplate',
      entityId: id,
      entityName: updates.name || 'Report Template',
      changes: Object.fromEntries(
        Object.entries(updates).map(([k, v]) => [k, { new: v }])
      ),
      companyId: user.companyId,
    }, req);

    res.json({ message: 'Template updated successfully' });
  } catch (error) {
    logger.error('Failed to update template:', error);
    res.status(500).json({ message: 'Failed to update template' });
  }
});

// Delete template
router.delete('/templates/:id', async (req, res) => {
  try {
    const id = getParam(req.params.id);
    const user = (req as any).user;

    await reportBuilderService.deleteTemplate(id, user.companyId);

    // Log deletion
    await auditService.logAudit({
      userId: user.id,
      userEmail: user.email,
      action: 'delete',
      entityType: 'ReportTemplate',
      entityId: id,
      changes: {},
      companyId: user.companyId,
    }, req);

    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete template:', error);
    res.status(500).json({ message: 'Failed to delete template' });
  }
});

// ============ Scheduled Reports ============

// Get schedule presets
router.get('/schedules/presets', (_, res) => {
  res.json(scheduledReportService.SCHEDULE_PRESETS);
});

// Get all scheduled reports
router.get('/schedules', async (req, res) => {
  try {
    const user = (req as any).user;
    const reports = await scheduledReportService.getScheduledReports(user.companyId);
    res.json(reports);
  } catch (error) {
    logger.error('Failed to get scheduled reports:', error);
    res.status(500).json({ message: 'Failed to get scheduled reports' });
  }
});

// Get single scheduled report
router.get('/schedules/:id', async (req, res) => {
  try {
    const id = getParam(req.params.id);
    const companyId = (req as any).user.companyId;
    const report = await scheduledReportService.getScheduledReport(id, companyId);

    if (!report) {
      return res.status(404).json({ message: 'Scheduled report not found' });
    }

    res.json(report);
  } catch (error) {
    logger.error('Failed to get scheduled report:', error);
    res.status(500).json({ message: 'Failed to get scheduled report' });
  }
});

// Create scheduled report
router.post('/schedules', async (req, res) => {
  try {
    const { name, templateId, schedule, timezone, outputFormat, recipients } = req.body;
    const user = (req as any).user;

    if (!name || !templateId || !schedule || !recipients || recipients.length === 0) {
      return res.status(400).json({ message: 'Name, template, schedule, and recipients are required' });
    }

    const report = await scheduledReportService.createScheduledReport(
      name,
      templateId,
      schedule,
      timezone || 'America/Chicago',
      outputFormat || 'pdf',
      recipients,
      user.id,
      user.companyId
    );

    // Log creation
    await auditService.logAudit({
      userId: user.id,
      userEmail: user.email,
      action: 'create',
      entityType: 'ScheduledReport',
      entityId: report.id,
      entityName: name,
      changes: { name: { new: name }, schedule: { new: schedule }, recipients: { new: recipients } },
      companyId: user.companyId,
    }, req);

    res.status(201).json(report);
  } catch (error) {
    logger.error('Failed to create scheduled report:', error);
    res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to create scheduled report' });
  }
});

// Update scheduled report
router.put('/schedules/:id', async (req, res) => {
  try {
    const id = getParam(req.params.id);
    const user = (req as any).user;
    const updates = req.body;

    await scheduledReportService.updateScheduledReport(id, updates, user.companyId);

    // Log update
    await auditService.logAudit({
      userId: user.id,
      userEmail: user.email,
      action: 'update',
      entityType: 'ScheduledReport',
      entityId: id,
      changes: Object.fromEntries(
        Object.entries(updates).map(([k, v]) => [k, { new: v }])
      ),
      companyId: user.companyId,
    }, req);

    res.json({ message: 'Scheduled report updated successfully' });
  } catch (error) {
    logger.error('Failed to update scheduled report:', error);
    res.status(500).json({ message: 'Failed to update scheduled report' });
  }
});

// Toggle scheduled report
router.post('/schedules/:id/toggle', async (req, res) => {
  try {
    const id = getParam(req.params.id);
    const user = (req as any).user;

    const report = await scheduledReportService.toggleScheduledReport(id, user.companyId);

    // Log toggle
    await auditService.logAudit({
      userId: user.id,
      userEmail: user.email,
      action: 'update',
      entityType: 'ScheduledReport',
      entityId: id,
      changes: { isActive: { new: report.isActive } },
      companyId: user.companyId,
    }, req);

    res.json(report);
  } catch (error) {
    logger.error('Failed to toggle scheduled report:', error);
    res.status(500).json({ message: 'Failed to toggle scheduled report' });
  }
});

// Delete scheduled report
router.delete('/schedules/:id', async (req, res) => {
  try {
    const id = getParam(req.params.id);
    const user = (req as any).user;

    await scheduledReportService.deleteScheduledReport(id, user.companyId);

    // Log deletion
    await auditService.logAudit({
      userId: user.id,
      userEmail: user.email,
      action: 'delete',
      entityType: 'ScheduledReport',
      entityId: id,
      changes: {},
      companyId: user.companyId,
    }, req);

    res.json({ message: 'Scheduled report deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete scheduled report:', error);
    res.status(500).json({ message: 'Failed to delete scheduled report' });
  }
});

// Run scheduled report manually (admin only)
router.post('/schedules/:id/run', requireRole('admin'), async (req, res) => {
  try {
    const id = getParam(req.params.id);
    const result = await scheduledReportService.executeScheduledReport(id);
    res.json(result);
  } catch (error) {
    logger.error('Failed to run scheduled report:', error);
    res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to run scheduled report' });
  }
});

export default router;
