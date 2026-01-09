import apiClient from './client';
import type { ReportColumn, FilterCriteria, ReportTemplate, ScheduledReport } from './types';

// Custom Reports API
export const reportsApi = {
  getColumns: async (entityType: string): Promise<ReportColumn[]> => {
    const response = await apiClient.get<ReportColumn[]>(`/reports/columns/${entityType}`);
    return response.data;
  },

  executeReport: async (config: {
    entityType: string;
    columns: string[];
    filters?: FilterCriteria[];
    sort?: { field: string; direction: 'asc' | 'desc' };
    groupBy?: string;
  }): Promise<{ data: Record<string, unknown>[]; total: number }> => {
    const response = await apiClient.post('/reports/execute', config);
    return response.data;
  },

  exportCSV: async (config: {
    entityType: string;
    columns: string[];
    filters?: FilterCriteria[];
    sort?: { field: string; direction: 'asc' | 'desc' };
  }): Promise<Blob> => {
    const response = await apiClient.post('/reports/export/csv', config, { responseType: 'blob' });
    return response.data;
  },

  exportExcel: async (config: {
    entityType: string;
    columns: string[];
    filters?: FilterCriteria[];
    sort?: { field: string; direction: 'asc' | 'desc' };
  }): Promise<{ headers: string[]; rows: unknown[][] }> => {
    const response = await apiClient.post('/reports/export/xlsx', config);
    return response.data;
  },

  exportPDF: async (config: {
    entityType: string;
    columns: string[];
    filters?: FilterCriteria[];
    sort?: { field: string; direction: 'asc' | 'desc' };
    title?: string;
  }): Promise<void> => {
    const response = await apiClient.post('/reports/export/pdf', config, { responseType: 'blob' });

    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${config.title || config.entityType}-report-${Date.now()}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  // Templates
  getTemplates: async (): Promise<ReportTemplate[]> => {
    const response = await apiClient.get<ReportTemplate[]>('/reports/templates');
    return response.data;
  },

  getTemplate: async (id: string): Promise<ReportTemplate> => {
    const response = await apiClient.get<ReportTemplate>(`/reports/templates/${id}`);
    return response.data;
  },

  createTemplate: async (template: Partial<ReportTemplate>): Promise<ReportTemplate> => {
    const response = await apiClient.post<ReportTemplate>('/reports/templates', template);
    return response.data;
  },

  updateTemplate: async (id: string, updates: Partial<ReportTemplate>): Promise<void> => {
    await apiClient.put(`/reports/templates/${id}`, updates);
  },

  deleteTemplate: async (id: string): Promise<void> => {
    await apiClient.delete(`/reports/templates/${id}`);
  },

  // Scheduled Reports
  getSchedulePresets: async (): Promise<Record<string, { cron: string; label: string }>> => {
    const response = await apiClient.get('/reports/schedules/presets');
    return response.data;
  },

  getScheduledReports: async (): Promise<ScheduledReport[]> => {
    const response = await apiClient.get<ScheduledReport[]>('/reports/schedules');
    return response.data;
  },

  createScheduledReport: async (report: {
    name: string;
    templateId: string;
    schedule: string;
    timezone?: string;
    outputFormat?: 'pdf' | 'csv' | 'xlsx';
    recipients: string[];
  }): Promise<ScheduledReport> => {
    const response = await apiClient.post<ScheduledReport>('/reports/schedules', report);
    return response.data;
  },

  toggleScheduledReport: async (id: string): Promise<ScheduledReport> => {
    const response = await apiClient.post<ScheduledReport>(`/reports/schedules/${id}/toggle`);
    return response.data;
  },

  deleteScheduledReport: async (id: string): Promise<void> => {
    await apiClient.delete(`/reports/schedules/${id}`);
  },
};
