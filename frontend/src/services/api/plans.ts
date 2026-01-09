import apiClient from './client';
import type { Plan, PlanAssignment, Shop, ReportGenerationConfig, ReportData } from '../../types';

// Plans API
export const plansApi = {
  getAll: async (params?: { status?: string }): Promise<Plan[]> => {
    const response = await apiClient.get<Plan[]>('/plans', { params });
    return response.data;
  },

  getById: async (id: string): Promise<Plan> => {
    const response = await apiClient.get<Plan>(`/plans/${id}`);
    return response.data;
  },

  create: async (plan: Partial<Plan>): Promise<Plan> => {
    const response = await apiClient.post<Plan>('/plans', plan);
    return response.data;
  },

  update: async (id: string, plan: Partial<Plan>): Promise<Plan> => {
    const response = await apiClient.put<Plan>(`/plans/${id}`, plan);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/plans/${id}`);
  },

  addAssignment: async (planId: string, assignment: Partial<PlanAssignment>): Promise<PlanAssignment> => {
    const response = await apiClient.post<PlanAssignment>(`/plans/${planId}/assignments`, assignment);
    return response.data;
  },

  updateAssignment: async (
    planId: string,
    assignmentId: string,
    assignment: Partial<PlanAssignment>
  ): Promise<PlanAssignment> => {
    const response = await apiClient.put<PlanAssignment>(
      `/plans/${planId}/assignments/${assignmentId}`,
      assignment
    );
    return response.data;
  },

  removeAssignment: async (planId: string, assignmentId: string): Promise<void> => {
    await apiClient.delete(`/plans/${planId}/assignments/${assignmentId}`);
  },

  // Bulk add assignments (for committing scenarios to plans)
  bulkAddAssignments: async (
    planId: string,
    assignments: Array<{
      carId: string;
      shopId: string;
      scheduledMonth: string;
      estimatedCost?: number;
      estimatedDuration?: number;
      status?: string;
    }>
  ): Promise<{ message: string; success: number; failed: number; errors: { carId: string; error: string }[] }> => {
    const response = await apiClient.post<{
      message: string;
      success: number;
      failed: number;
      errors: { carId: string; error: string }[];
    }>(`/plans/${planId}/assignments/bulk`, { assignments });
    return response.data;
  },

  getGrid: async (planId: string): Promise<{ shops: Shop[]; months: string[]; assignments: PlanAssignment[][] }> => {
    const response = await apiClient.get<{ shops: Shop[]; months: string[]; assignments: PlanAssignment[][] }>(
      `/plans/${planId}/grid`
    );
    return response.data;
  },

  activate: async (id: string): Promise<Plan> => {
    const response = await apiClient.post<Plan>(`/plans/${id}/activate`);
    return response.data;
  },

  archive: async (id: string): Promise<Plan> => {
    const response = await apiClient.post<Plan>(`/plans/${id}/archive`);
    return response.data;
  },

  exportToExcel: async (id: string): Promise<void> => {
    const response = await apiClient.get(`/plans/${id}/export`, {
      responseType: 'blob',
    });
    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    const contentDisposition = response.headers['content-disposition'];
    const filename = contentDisposition
      ? contentDisposition.split('filename=')[1]?.replace(/"/g, '')
      : `plan_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  // Generate report document with recipient type configuration
  generateReport: async (config: ReportGenerationConfig): Promise<ReportData> => {
    const response = await apiClient.post<ReportData>(`/plans/${config.planId}/generate-report`, {
      recipientType: config.recipientType,
      dateRange: config.dateRange,
      includeConfidentialStatement: config.includeConfidentialStatement,
      hideCostData: config.hideCostData,
    });
    return response.data;
  },

  // Get report data for printing
  getReportData: async (id: string, recipientType: 'internal' | 'external' = 'internal'): Promise<ReportData> => {
    const response = await apiClient.get<ReportData>(`/plans/${id}/report-data`, {
      params: { recipientType },
    });
    return response.data;
  },

  // Schedule a single car using rule engine
  // This is the main action to lock a car into the schedule
  scheduleCar: async (params: {
    carId: string;
    scheduledMonth: string;
    shopId?: string;
    planId?: string;
    estimatedCost?: number;
    estimatedDuration?: number;
    useRuleEngine?: boolean;
  }): Promise<{
    success: boolean;
    message: string;
    assignment: PlanAssignment;
    recommendation?: {
      suggestedShopName: string;
      score: number;
      reasons: string[];
    };
  }> => {
    const response = await apiClient.post('/plans/schedule-car', params);
    return response.data;
  },

  // Bulk schedule multiple cars using rule engine
  scheduleCarsBulk: async (params: {
    carIds: string[];
    scheduledMonth: string;
    planId?: string;
  }): Promise<{
    message: string;
    success: number;
    failed: number;
    assignments: PlanAssignment[];
    errors: { carId: string; error: string }[];
  }> => {
    const response = await apiClient.post('/plans/schedule-cars-bulk', params);
    return response.data;
  },
};
