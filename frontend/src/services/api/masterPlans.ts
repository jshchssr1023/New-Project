import apiClient from './client';
import type {
  MasterPlan,
  MasterPlanWithCommitments,
  MasterPlanCommitment,
  MasterPlanSummary,
  MasterPlanStatus,
  CommitmentStatus,
} from '../../types';
import type {
  WeeklyCapacityData,
  MasterPlanVersionData,
  IntegrationLogData,
  ImportSessionData,
  ShopHistoryEntry,
  MasterPlanAuditEntry,
} from './types';

// Master Plan API
export const masterPlanApi = {
  // Get all MasterPlans
  getAll: async (params?: {
    fiscalYear?: number;
    status?: MasterPlanStatus;
    limit?: number;
    offset?: number;
  }): Promise<MasterPlan[]> => {
    const response = await apiClient.get<MasterPlan[]>('/masterplans', { params });
    return response.data;
  },

  // Get active MasterPlan
  getActive: async (): Promise<MasterPlanWithCommitments> => {
    const response = await apiClient.get<MasterPlanWithCommitments>('/masterplans/active');
    return response.data;
  },

  // Get MasterPlan by ID
  getById: async (id: string): Promise<MasterPlanWithCommitments> => {
    const response = await apiClient.get<MasterPlanWithCommitments>(`/masterplans/${id}`);
    return response.data;
  },

  // Get MasterPlan summary
  getSummary: async (id: string): Promise<MasterPlanSummary> => {
    const response = await apiClient.get<MasterPlanSummary>(`/masterplans/${id}/summary`);
    return response.data;
  },

  // Get MasterPlan commitments
  getCommitments: async (id: string): Promise<MasterPlanCommitment[]> => {
    const response = await apiClient.get<MasterPlanCommitment[]>(`/masterplans/${id}/commitments`);
    return response.data;
  },

  // Create MasterPlan from Scenario (Approve Scenario)
  createFromScenario: async (
    scenarioId: string,
    planName: string
  ): Promise<MasterPlanWithCommitments> => {
    const response = await apiClient.post<MasterPlanWithCommitments>('/masterplans/from-scenario', {
      scenarioId,
      planName,
    });
    return response.data;
  },

  // Approve a MasterPlan
  approve: async (id: string, activate: boolean = false): Promise<MasterPlan> => {
    const response = await apiClient.post<MasterPlan>(`/masterplans/${id}/approve`, { activate });
    return response.data;
  },

  // Activate a MasterPlan
  activate: async (id: string): Promise<MasterPlan> => {
    const response = await apiClient.post<MasterPlan>(`/masterplans/${id}/activate`);
    return response.data;
  },

  // Archive a MasterPlan
  archive: async (id: string): Promise<MasterPlan> => {
    const response = await apiClient.post<MasterPlan>(`/masterplans/${id}/archive`);
    return response.data;
  },

  // Update commitment status
  updateCommitmentStatus: async (
    masterPlanId: string,
    commitmentId: string,
    status: CommitmentStatus
  ): Promise<MasterPlanCommitment> => {
    const response = await apiClient.put<MasterPlanCommitment>(
      `/masterplans/${masterPlanId}/commitments/${commitmentId}/status`,
      { status }
    );
    return response.data;
  },

  // Get customer schedule
  getCustomerSchedule: async (
    customerId: string,
    masterPlanId?: string
  ): Promise<MasterPlanCommitment[]> => {
    const response = await apiClient.get<MasterPlanCommitment[]>(
      `/masterplans/customer/${customerId}/schedule`,
      { params: { masterPlanId } }
    );
    return response.data;
  },

  // Get shop work orders
  getShopWorkOrders: async (shopId: string, month: string): Promise<MasterPlanCommitment[]> => {
    const response = await apiClient.get<MasterPlanCommitment[]>(
      `/masterplans/work-orders/${shopId}/${month}`
    );
    return response.data;
  },

  // Download shop work orders PDF
  downloadShopWorkOrdersPdf: async (shopId: string, month: string): Promise<void> => {
    const response = await apiClient.get(`/masterplans/work-orders/${shopId}/${month}/pdf`, {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `work-orders-${month}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  // Send shop work orders via email
  sendShopWorkOrders: async (shopId: string, month: string, recipientEmails: string[]): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.post(`/masterplans/work-orders/${shopId}/${month}/send`, { recipientEmails });
    return response.data;
  },

  // Download customer schedule PDF
  downloadCustomerSchedulePdf: async (customerId: string, masterPlanId?: string): Promise<void> => {
    const response = await apiClient.get(`/masterplans/customer-schedule/${customerId}/pdf`, {
      responseType: 'blob',
      params: masterPlanId ? { masterPlanId } : undefined,
    });
    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `customer-schedule-${new Date().toISOString().split('T')[0]}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  // Send customer schedule via email
  sendCustomerSchedule: async (customerId: string, recipientEmails: string[], masterPlanId?: string): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.post(`/masterplans/customer-schedule/${customerId}/send`, {
      recipientEmails,
      masterPlanId,
    });
    return response.data;
  },

  // Get customers with commitments
  getCustomers: async (): Promise<Array<{
    id: string;
    name: string;
    code: string;
    _count: { masterCommitments: number };
  }>> => {
    const response = await apiClient.get('/masterplans/data/customers');
    return response.data;
  },

  // Get shops data
  getShops: async (): Promise<Array<{
    id: string;
    name: string;
    code: string;
    region: string;
    qualCapacity: number;
    assignCapacity: number;
  }>> => {
    const response = await apiClient.get('/masterplans/data/shops');
    return response.data;
  },
};

// Master Plan Wizard API (Gold Standard)
export const masterPlanWizardApi = {
  // Weekly Capacity
  getWeekKeys: async (startDate?: string, weeks?: number): Promise<{ weekKeys: string[] }> => {
    const response = await apiClient.get('/master-plan-wizard/capacity/weeks', {
      params: { startDate, weeks },
    });
    return response.data;
  },

  getWeeklyCapacities: async (
    shopIds: string[],
    weekKeys: string[]
  ): Promise<{ capacities: Record<string, Record<string, WeeklyCapacityData>> }> => {
    const response = await apiClient.get('/master-plan-wizard/capacity', {
      params: {
        shopIds: shopIds.join(','),
        weekKeys: weekKeys.join(','),
      },
    });
    return response.data;
  },

  updateWeeklyCapacity: async (
    id: string,
    data: {
      fieldName: string;
      newValue: number;
      justification: string;
      changeCategory: string;
    }
  ): Promise<{ capacity: WeeklyCapacityData }> => {
    const response = await apiClient.put(`/master-plan-wizard/capacity/${id}`, data);
    return response.data;
  },

  lockWeeklyCapacity: async (id: string): Promise<{ capacity: WeeklyCapacityData }> => {
    const response = await apiClient.post(`/master-plan-wizard/capacity/${id}/lock`);
    return response.data;
  },

  // Master Plan Versions
  getMasterPlanVersions: async (masterPlanId: string): Promise<{ versions: MasterPlanVersionData[] }> => {
    const response = await apiClient.get(`/master-plan-wizard/versions/${masterPlanId}`);
    return response.data;
  },

  createMasterPlanVersion: async (data: {
    masterPlanId: string;
    versionLabel?: string;
    planSnapshot: object;
  }): Promise<{ version: MasterPlanVersionData }> => {
    const response = await apiClient.post('/master-plan-wizard/versions', data);
    return response.data;
  },

  lockMasterPlanVersion: async (
    versionId: string,
    lockReason: string
  ): Promise<{ version: MasterPlanVersionData }> => {
    const response = await apiClient.post(`/master-plan-wizard/versions/${versionId}/lock`, {
      lockReason,
    });
    return response.data;
  },

  publishMasterPlanVersion: async (
    versionId: string
  ): Promise<{ version: MasterPlanVersionData; integrationLog: IntegrationLogData }> => {
    const response = await apiClient.post(`/master-plan-wizard/versions/${versionId}/publish`);
    return response.data;
  },

  // Allocation Operations
  validateAllocation: async (data: {
    shopId: string;
    weekKey: string;
    workType: string;
    requestedCount: number;
  }): Promise<{ valid: boolean; available: number; message?: string }> => {
    const response = await apiClient.post('/master-plan-wizard/allocations/validate', data);
    return response.data;
  },

  bulkAllocateCars: async (data: {
    carIds: string[];
    shopId: string;
    weekKey: string;
    workType: string;
    justification: string;
    overrideReason: string;
  }): Promise<{ allocated: number }> => {
    const response = await apiClient.post('/master-plan-wizard/allocations/bulk', data);
    return response.data;
  },

  // Integration Monitoring
  getIntegrationLogs: async (limit?: number): Promise<{ logs: IntegrationLogData[] }> => {
    const response = await apiClient.get('/master-plan-wizard/integrations', {
      params: { limit },
    });
    return response.data;
  },

  getIntegrationHealth: async (): Promise<{
    total: number;
    successful: number;
    failed: number;
    successRate: number;
    avgDurationMs: number;
  }> => {
    const response = await apiClient.get('/master-plan-wizard/integrations/health');
    return response.data;
  },

  // Import Sessions (3-Step Workflow)
  createImportSession: async (data: {
    sessionType: 'cars' | 'shops' | 'capacity';
    fileName: string;
    fileSize: number;
    rawData: string;
  }): Promise<{ session: ImportSessionData }> => {
    const response = await apiClient.post('/master-plan-wizard/import/upload', data);
    return response.data;
  },

  validateImportSession: async (sessionId: string): Promise<{ session: ImportSessionData }> => {
    const response = await apiClient.post(`/master-plan-wizard/import/${sessionId}/validate`);
    return response.data;
  },

  updateFieldMappings: async (
    sessionId: string,
    mappings: Record<string, string>
  ): Promise<{ session: ImportSessionData }> => {
    const response = await apiClient.put(`/master-plan-wizard/import/${sessionId}/mappings`, {
      mappings,
    });
    return response.data;
  },

  executeImport: async (sessionId: string): Promise<{
    result: {
      success: boolean;
      importedCount: number;
      updatedCount: number;
      skippedCount: number;
      errors: Array<{ row: number; field: string; message: string }>;
    };
  }> => {
    const response = await apiClient.post(`/master-plan-wizard/import/${sessionId}/execute`);
    return response.data;
  },

  getImportSession: async (sessionId: string): Promise<{ session: ImportSessionData }> => {
    const response = await apiClient.get(`/master-plan-wizard/import/${sessionId}`);
    return response.data;
  },

  getImportSessions: async (limit?: number): Promise<{ sessions: ImportSessionData[] }> => {
    const response = await apiClient.get('/master-plan-wizard/import', {
      params: { limit },
    });
    return response.data;
  },

  getErrorReportUrl: async (sessionId: string): Promise<{ downloadUrl: string }> => {
    const response = await apiClient.get(`/master-plan-wizard/import/${sessionId}/error-report`);
    return response.data;
  },

  // Shop History
  getShopHistory: async (shopId: string): Promise<{ history: ShopHistoryEntry[] }> => {
    const response = await apiClient.get(`/master-plan-wizard/shops/${shopId}/history`);
    return response.data;
  },

  renameShop: async (
    shopId: string,
    data: { newName: string; newCode?: string; changeReason: string }
  ): Promise<{ shop: unknown }> => {
    const response = await apiClient.post(`/master-plan-wizard/shops/${shopId}/rename`, data);
    return response.data;
  },

  deactivateShop: async (
    shopId: string,
    data: { changeReason: string; successorShopId?: string }
  ): Promise<{ shop: unknown }> => {
    const response = await apiClient.post(`/master-plan-wizard/shops/${shopId}/deactivate`, data);
    return response.data;
  },

  mergeShops: async (data: {
    sourceShopId: string;
    targetShopId: string;
    mergeReason: string;
  }): Promise<{ success: boolean }> => {
    const response = await apiClient.post('/master-plan-wizard/shops/merge', data);
    return response.data;
  },

  getShopNameAtTime: async (shopId: string, timestamp: string): Promise<{ name: string }> => {
    const response = await apiClient.get(`/master-plan-wizard/shops/${shopId}/name-at-time`, {
      params: { timestamp },
    });
    return response.data;
  },

  getPreviousShopNames: async (shopId: string): Promise<{ names: string[] }> => {
    const response = await apiClient.get(`/master-plan-wizard/shops/${shopId}/previous-names`);
    return response.data;
  },

  // Audit Log (Non-Editable System Log)
  getAuditLogs: async (filters?: {
    action?: string;
    userId?: string;
    entityType?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    data: MasterPlanAuditEntry[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> => {
    const response = await apiClient.get('/master-plan-wizard/audit', {
      params: filters,
    });
    return response.data;
  },

  getAuditStatistics: async (): Promise<{
    last30Days: {
      planLocks: number;
      allocationOverrides: number;
      capacityChanges: number;
      imports: number;
      exports: number;
    };
  }> => {
    const response = await apiClient.get('/master-plan-wizard/audit/statistics');
    return response.data;
  },
};
