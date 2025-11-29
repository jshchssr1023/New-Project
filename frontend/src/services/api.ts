import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import type {
  User,
  Car,
  Shop,
  Plan,
  Scenario,
  AnalyticsData,
  AuthResponse,
  LoginCredentials,
  PaginatedResponse,
  PlanAssignment,
  ShopRecommendation,
  ReportGenerationConfig,
  ReportData,
} from '../types';

// Import result types for car bulk import
export type CarImportStatus = 'success' | 'partial_success' | 'failed' | 'mapping_required';

export interface CarImportResult {
  status: CarImportStatus;
  newCarsAdded: number;
  existingCarsUpdated: number;
  failedRows: number;
  errors: { row: number; reason: string }[];
  warnings: { row: number; message: string }[];
  // Mapping fields (only present when status is 'mapping_required')
  detected_headers?: string[];
  missing_required_fields?: string[];
  unmapped_headers?: string[];
  suggested_mappings?: Record<string, string[]>;
}

export interface HeaderAnalysisResult {
  status: 'success' | 'mapping_required';
  mappings: Record<string, string>;
  unmappedHeaders: string[];
  missingRequiredFields: string[];
  detectedHeaders: string[];
  suggestions: Record<string, string[]>;
}

const API_BASE_URL = '/api';

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('authToken');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);

// Response interceptor to handle auth errors
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/login', credentials);
    localStorage.setItem('authToken', response.data.token);
    localStorage.setItem('user', JSON.stringify(response.data.user));
    return response.data;
  },

  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout');
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
  },

  getCurrentUser: async (): Promise<User> => {
    const response = await apiClient.get<User>('/auth/me');
    return response.data;
  },

  refreshToken: async (): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/refresh');
    localStorage.setItem('authToken', response.data.token);
    return response.data;
  },
};

// Cars API
export const carsApi = {
  getAll: async (params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    carType?: string;
    customer?: string;
    reasonShopped?: string;
  }): Promise<PaginatedResponse<Car>> => {
    const response = await apiClient.get<PaginatedResponse<Car>>('/cars', { params });
    return response.data;
  },

  getById: async (id: string): Promise<Car> => {
    const response = await apiClient.get<Car>(`/cars/${id}`);
    return response.data;
  },

  create: async (car: Partial<Car>): Promise<Car> => {
    const response = await apiClient.post<Car>('/cars', car);
    return response.data;
  },

  update: async (id: string, car: Partial<Car>): Promise<Car> => {
    const response = await apiClient.put<Car>(`/cars/${id}`, car);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/cars/${id}`);
  },

  bulkUpdate: async (carIds: string[], updates: Partial<Car>): Promise<Car[]> => {
    const response = await apiClient.patch<Car[]>('/cars/bulk', { carIds, updates });
    return response.data;
  },

  bulkDelete: async (carIds: string[]): Promise<void> => {
    await apiClient.delete('/cars/bulk', { data: { carIds } });
  },

  // Bulk import cars with data mapping intelligence and detailed results
  bulkImport: async (
    cars: Partial<Car>[],
    fieldMappings?: Record<string, string>
  ): Promise<CarImportResult> => {
    const response = await apiClient.post<CarImportResult>('/cars/bulk-import', {
      cars,
      fieldMappings,
    });
    return response.data;
  },

  // Analyze headers before import (pre-flight check)
  analyzeImportHeaders: async (headers: string[]): Promise<HeaderAnalysisResult> => {
    const response = await apiClient.post<HeaderAnalysisResult>('/cars/bulk-import/analyze', {
      headers,
    });
    return response.data;
  },

  // Export cars to CSV
  // Supports two formats: 'umler' (system abbreviations - default) and 'standard' (human-readable)
  exportCars: async (params?: {
    ids?: string[];
    status?: string;
    customer?: string;
    reasonShopped?: string;
    carType?: string;
    format?: 'umler' | 'standard';
  }): Promise<void> => {
    const queryParams: Record<string, string> = {};
    if (params?.ids?.length) {
      queryParams.ids = params.ids.join(',');
    }
    if (params?.status) queryParams.status = params.status;
    if (params?.customer) queryParams.customer = params.customer;
    if (params?.reasonShopped) queryParams.reasonShopped = params.reasonShopped;
    if (params?.carType) queryParams.carType = params.carType;
    if (params?.format) queryParams.format = params.format;

    const response = await apiClient.get('/cars/export', {
      params: queryParams,
      responseType: 'blob',
    });

    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    const contentDisposition = response.headers['content-disposition'];
    const filename = contentDisposition
      ? contentDisposition.split('filename=')[1]?.replace(/"/g, '')
      : `cars_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};

// Shops API
export const shopsApi = {
  getAll: async (params?: { region?: string; network?: string; servingRailroad?: string; isActive?: boolean }): Promise<Shop[]> => {
    const response = await apiClient.get<Shop[]>('/shops', { params });
    return response.data;
  },

  getById: async (id: string): Promise<Shop> => {
    const response = await apiClient.get<Shop>(`/shops/${id}`);
    return response.data;
  },

  create: async (shop: Partial<Shop>): Promise<Shop> => {
    const response = await apiClient.post<Shop>('/shops', shop);
    return response.data;
  },

  update: async (id: string, shop: Partial<Shop>): Promise<Shop> => {
    const response = await apiClient.put<Shop>(`/shops/${id}`, shop);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/shops/${id}`);
  },

  getCapacity: async (id: string, month: string): Promise<{ total: number; used: number; available: number }> => {
    const response = await apiClient.get<{ total: number; used: number; available: number }>(
      `/shops/${id}/capacity`,
      { params: { month } }
    );
    return response.data;
  },

  // Batch capacity check for multiple shops and months
  getBatchCapacity: async (shopIds: string[], months: string[]): Promise<{
    shops: { id: string; name: string; code: string; capacity: number }[];
    capacityData: Record<string, Record<string, { capacity: number; used: number; available: number }>>;
  }> => {
    const response = await apiClient.post('/shops/capacity/batch', { shopIds, months });
    return response.data;
  },

  // Get filter options (regions, networks, railroads)
  getFilters: async (): Promise<{ regions: string[]; networks: string[]; railroads: string[] }> => {
    const response = await apiClient.get<{ regions: string[]; networks: string[]; railroads: string[] }>('/shops/meta/filters');
    return response.data;
  },

  // Bulk import shops with detailed results
  bulkImport: async (shops: Partial<Shop>[]): Promise<{
    status: 'success' | 'partial_success' | 'failed';
    newShopsAdded: number;
    existingShopsUpdated: number;
    failedRows: number;
    errors: { row: number; reason: string }[];
  }> => {
    const response = await apiClient.post<{
      status: 'success' | 'partial_success' | 'failed';
      newShopsAdded: number;
      existingShopsUpdated: number;
      failedRows: number;
      errors: { row: number; reason: string }[];
    }>('/shops/bulk-import', { shops });
    return response.data;
  },

  // Export shops to CSV
  exportShops: async (params?: {
    region?: string;
    network?: string;
    isActive?: boolean;
  }): Promise<void> => {
    const response = await apiClient.get('/shops/export', {
      params,
      responseType: 'blob',
    });

    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    const contentDisposition = response.headers['content-disposition'];
    const filename = contentDisposition
      ? contentDisposition.split('filename=')[1]?.replace(/"/g, '')
      : `shops_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};

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
};

// Scenarios API
export const scenariosApi = {
  getAll: async (): Promise<Scenario[]> => {
    const response = await apiClient.get<Scenario[]>('/scenarios');
    return response.data;
  },

  getById: async (id: string): Promise<Scenario> => {
    const response = await apiClient.get<Scenario>(`/scenarios/${id}`);
    return response.data;
  },

  create: async (scenario: Partial<Scenario>): Promise<Scenario> => {
    const response = await apiClient.post<Scenario>('/scenarios', scenario);
    return response.data;
  },

  update: async (id: string, scenario: Partial<Scenario>): Promise<Scenario> => {
    const response = await apiClient.put<Scenario>(`/scenarios/${id}`, scenario);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/scenarios/${id}`);
  },

  // Add cars to scenario
  addCars: async (id: string, carIds: string[], scheduledMonth: string, autoSuggestShops: boolean = true): Promise<Scenario> => {
    const response = await apiClient.post<Scenario>(`/scenarios/${id}/cars`, { carIds, scheduledMonth, autoSuggestShops });
    return response.data;
  },

  // Add cars by customer filter
  addCarsByCustomer: async (id: string, customer: string, scheduledMonth: string, autoSuggestShops: boolean = true): Promise<Scenario> => {
    const response = await apiClient.post<Scenario>(`/scenarios/${id}/cars/by-customer`, { customer, scheduledMonth, autoSuggestShops });
    return response.data;
  },

  // Remove car from scenario
  removeCar: async (id: string, scenarioCarId: string): Promise<void> => {
    await apiClient.delete(`/scenarios/${id}/cars/${scenarioCarId}`);
  },

  // Get shop recommendations for a car
  getRecommendations: async (id: string, scenarioCarId: string): Promise<{ recommendations: ShopRecommendation[] }> => {
    const response = await apiClient.get<{ recommendations: ShopRecommendation[] }>(
      `/scenarios/${id}/cars/${scenarioCarId}/recommendations`
    );
    return response.data;
  },

  // Assign shop to car
  assignShop: async (id: string, scenarioCarId: string, shopId: string): Promise<Scenario> => {
    const response = await apiClient.put<Scenario>(`/scenarios/${id}/cars/${scenarioCarId}`, { assignedShopId: shopId });
    return response.data;
  },

  analyze: async (id: string): Promise<Scenario> => {
    const response = await apiClient.post<Scenario>(`/scenarios/${id}/analyze`);
    return response.data;
  },

  compare: async (scenarioIds: string[]): Promise<{ scenarios: Scenario[]; comparison: Record<string, unknown> }> => {
    const response = await apiClient.post<{ scenarios: Scenario[]; comparison: Record<string, unknown> }>(
      '/scenarios/compare',
      { scenarioIds }
    );
    return response.data;
  },

  applyToPlan: async (scenarioId: string, planId: string): Promise<Plan> => {
    const response = await apiClient.post<Plan>(`/scenarios/${scenarioId}/apply`, { planId });
    return response.data;
  },

  // Get available customers for filtering
  getCustomers: async (): Promise<string[]> => {
    const response = await apiClient.get<string[]>('/scenarios/customers');
    return response.data;
  },
};

// Analytics API
export const analyticsApi = {
  getDashboard: async (): Promise<AnalyticsData> => {
    const response = await apiClient.get<AnalyticsData>('/analytics/dashboard');
    return response.data;
  },

  getShopPerformance: async (shopId: string, dateRange: { start: string; end: string }) => {
    const response = await apiClient.get(`/analytics/shops/${shopId}`, { params: dateRange });
    return response.data;
  },

  getCarServiceHistory: async (carId: string) => {
    const response = await apiClient.get(`/analytics/cars/${carId}/history`);
    return response.data;
  },

  getCostAnalysis: async (params: { planId?: string; dateRange?: { start: string; end: string } }) => {
    const response = await apiClient.get('/analytics/costs', { params });
    return response.data;
  },

  exportReport: async (reportType: string, format: 'csv' | 'xlsx' | 'pdf') => {
    const response = await apiClient.get(`/analytics/export/${reportType}`, {
      params: { format },
      responseType: 'blob',
    });
    return response.data;
  },
};

// Users API (admin only)
export const usersApi = {
  getAll: async (): Promise<User[]> => {
    const response = await apiClient.get<User[]>('/users');
    return response.data;
  },

  getById: async (id: string): Promise<User> => {
    const response = await apiClient.get<User>(`/users/${id}`);
    return response.data;
  },

  create: async (user: Partial<User> & { password: string }): Promise<User> => {
    const response = await apiClient.post<User>('/users', user);
    return response.data;
  },

  update: async (id: string, user: Partial<User>): Promise<User> => {
    const response = await apiClient.put<User>(`/users/${id}`, user);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/users/${id}`);
  },

  updatePassword: async (id: string, passwords: { currentPassword: string; newPassword: string }): Promise<void> => {
    await apiClient.put(`/users/${id}/password`, passwords);
  },
};

// Custom Reports API
export interface ReportColumn {
  key: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  sortable: boolean;
  filterable: boolean;
  defaultVisible: boolean;
}

export interface FilterCriteria {
  field: string;
  operator: 'equals' | 'notEquals' | 'contains' | 'startsWith' | 'endsWith' | 'greaterThan' | 'lessThan' | 'greaterThanOrEqual' | 'lessThanOrEqual' | 'between' | 'in' | 'isNull' | 'isNotNull';
  value: unknown;
  value2?: unknown;
}

export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  entityType: string;
  columns: string[];
  filters: FilterCriteria[];
  sortConfig: { field: string; direction: 'asc' | 'desc' } | null;
  groupBy: string;
  outputFormats: string[];
  isPublic: boolean;
  createdAt: string;
}

export interface ScheduledReport {
  id: string;
  name: string;
  templateId: string;
  schedule: string;
  timezone: string;
  outputFormat: 'pdf' | 'csv' | 'xlsx';
  recipients: string[];
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastRunStatus: string;
  template: {
    id: string;
    name: string;
    entityType: string;
  } | null;
}

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

// Shop Performance API
export interface ShopPerformanceMetrics {
  averageTurnTime: number;
  turnTimeByRepairType: Record<string, number>;
  onTimeRate: number;
  averageDwellTime: number;
  reworkRate: number;
  costVariance: number;
  performanceScore: number;
}

export interface ShopScorecard {
  shop: {
    id: string;
    name: string;
    code: string;
    network: string;
    region: string;
  };
  metrics: ShopPerformanceMetrics;
  comparison: {
    turnTimeVsNetwork: number;
    onTimeVsNetwork: number;
    dwellTimeVsNetwork: number;
    reworkVsNetwork: number;
    costVarianceVsNetwork: number;
  };
  alerts: { type: 'warning' | 'critical'; message: string }[];
  periodType: string;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface NetworkScorecard {
  shops: ShopScorecard[];
  networkAverages: {
    avgTurnTime: number;
    avgDwellTime: number;
    avgOnTimeRate: number;
    avgReworkRate: number;
    avgCostVariance: number;
  };
  summary: {
    totalShops: number;
    averagePerformanceScore: number;
    shopsWithWarnings: number;
    shopsWithCriticalAlerts: number;
  };
}

export const shopPerformanceApi = {
  getShopScorecard: async (shopId: string): Promise<ShopScorecard> => {
    const response = await apiClient.get<ShopScorecard>(`/shops/${shopId}/performance`);
    return response.data;
  },

  getNetworkScorecard: async (): Promise<NetworkScorecard> => {
    const response = await apiClient.get<NetworkScorecard>('/shops/performance/network');
    return response.data;
  },

  calculatePerformance: async (shopId: string, periodType: 'monthly' | 'quarterly' | 'yearly' = 'monthly'): Promise<unknown> => {
    const response = await apiClient.post(`/shops/${shopId}/performance/calculate`, { periodType });
    return response.data;
  },

  getPerformanceConcerns: async (shopId: string): Promise<{
    shopId: string;
    shopName: string;
    hasConcerns: boolean;
    severity: 'none' | 'warning' | 'critical';
    reasons: string[];
    performanceScore: number;
  }> => {
    const response = await apiClient.get(`/shops/${shopId}/performance/concerns`);
    return response.data;
  },
};

// Audit Log API
export interface AuditLogEntry {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName: string;
  changes: Record<string, { old?: unknown; new?: unknown }>;
  metadata: Record<string, unknown>;
  ipAddress: string;
  createdAt: string;
}

export const auditApi = {
  getLogs: async (params?: {
    entityType?: string;
    entityId?: string;
    userId?: string;
    action?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    data: AuditLogEntry[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> => {
    const response = await apiClient.get('/audit', { params });
    return response.data;
  },

  getEntityHistory: async (entityType: string, entityId: string): Promise<AuditLogEntry[]> => {
    const response = await apiClient.get<AuditLogEntry[]>(`/audit/entity/${entityType}/${entityId}`);
    return response.data;
  },

  getSummary: async (days: number = 7): Promise<{
    totalActions: number;
    period: { start: string; end: string; days: number };
    byAction: Record<string, number>;
    byEntity: Record<string, number>;
    topUsers: { email: string; count: number }[];
    recentActions: AuditLogEntry[];
  }> => {
    const response = await apiClient.get('/audit/summary', { params: { days } });
    return response.data;
  },
};

// Permissions API
export const permissionsApi = {
  getRoles: async (): Promise<{
    roles: string[];
    descriptions: Record<string, string>;
  }> => {
    const response = await apiClient.get('/permissions/roles');
    return response.data;
  },

  getMyPermissions: async (): Promise<{
    role: string;
    permissions: string[];
  }> => {
    const response = await apiClient.get('/permissions/my-permissions');
    return response.data;
  },

  checkPermission: async (permission: string): Promise<{ permission: string; granted: boolean }> => {
    const response = await apiClient.get(`/permissions/check/${permission}`);
    return response.data;
  },

  getFieldSecurity: async (entityType: string): Promise<{
    entityType: string;
    role: string;
    fields: Record<string, { visible: boolean; editable: boolean; maskType: string }>;
  }> => {
    const response = await apiClient.get(`/permissions/fields/${entityType}`);
    return response.data;
  },
};

// =============================================================================
// LEASE QUALIFICATION ENGINE API
// =============================================================================

export interface LeaseRelease {
  carId: string;
  railcarNumber: string;
  customerId: string;
  customerName: string;
  leaseEndDate: string;
  plannedReleaseDate: string;
  nextCustomerId?: string;
  commodity: string;
  carType: string;
  isTankCar: boolean;
  homeRegion: string;
  priority: number;
}

export interface QualificationScenario {
  id: string;
  name: string;
  description: string;
  scenarioType: 'base' | 'late_release' | 'capacity_shift' | 'custom';
  status: string;
  planningHorizonMonths: number;
  lateReleasePercent: number;
  capacityAdjustment: Record<string, number>;
  metricsJson: ScenarioMetrics | null;
  summaryJson: { releaseCompliance: number; qualAttainment: number; backlog: number; riskScore: number } | null;
  isApproved: boolean;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
}

export interface ScenarioMetrics {
  scenarioId: string;
  scenarioName: string;
  scenarioType: string;
  totalReleases: number;
  onTimeReleases: number;
  lateReleases: number;
  releaseCompliancePercent: number;
  plannedQualifications: number;
  completedQualifications: number;
  qualPlanAttainmentPercent: number;
  currentBacklog: number;
  projectedBacklog: number;
  backlogByMonth: Record<string, number>;
  averageWaitDays: number;
  longestWaitDays: number;
  overallUtilizationPercent: number;
  utilizationByShop: Record<string, number>;
  riskScore: number;
  riskFactors: string[];
  totalEstimatedCost: number;
  costByMonth: Record<string, number>;
}

export interface ScenarioComparison {
  scenarios: ScenarioMetrics[];
  comparisonTable: string;
  recommendations: string[];
  bestScenarioId: string;
  bestScenarioReason: string;
}

export interface AvailableCar {
  id: string;
  railcarNumber: string;
  carType: string;
  customer: string;
  shopAssigned: string;
  monthKey: string;
  workTypes: string[];
  priority: number;
}

export interface AvailableShop {
  id: string;
  name: string;
  code: string;
  region: string;
  assignmentCount: number;
  tankQualified: boolean;
}

export interface AvailableCustomer {
  id: string;
  name: string;
  code: string;
  inboundCount: number;
  outboundCount: number;
}

export interface AvailableMonth {
  monthKey: string;
  monthLabel: string;
  assignmentCount: number;
}

export interface DocumentSelectionCriteria {
  scenarioId: string;
  carIds?: string[];
  shopIds?: string[];
  customerIds?: string[];
  startMonth?: string;
  endMonth?: string;
  priorities?: number[];
  workTypes?: string[];
  bundledOnly?: boolean;
}

export interface GeneratedDocument {
  title: string;
  generatedAt: string;
  scenarioId: string;
  scenarioName: string;
  markdownContent: string;
  jsonContent: Record<string, unknown>;
}

export interface ShopCapacitySnapshot {
  shopId: string;
  shopName: string;
  shopCode: string;
  region: string;
  tankQualified: boolean;
  monthlyCapacity: Record<string, {
    qualification: number;
    assignment: number;
    repair: number;
    used: number;
    available: number;
    utilization: number;
  }>;
}

// S&OP API
export interface SOPAllocationData {
  allocations: Record<string, Record<string, number>>; // monthKey -> shopId -> carCount
  shopCapacities?: Record<string, { monthlyCapacity?: number; isAITX?: boolean }>;
}

export interface SOPAllocationResponse {
  success: boolean;
  message: string;
  scenarioId?: string;
  created?: number;
  errors?: { monthKey: string; shopId: string; error: string }[];
}

export interface SOPLoadedAllocations {
  allocations: Record<string, Record<string, number>>; // shopId -> monthKey -> carCount
  lastUpdated: number | null;
}

export const sopApi = {
  // Get saved allocations
  getAllocations: async (): Promise<SOPLoadedAllocations> => {
    const response = await apiClient.get<SOPLoadedAllocations>('/sop/allocations');
    return response.data;
  },

  // Save monthly allocations
  saveAllocations: async (data: SOPAllocationData): Promise<SOPAllocationResponse> => {
    const response = await apiClient.post<SOPAllocationResponse>('/sop/allocations', data);
    return response.data;
  },

  // Update shop capacities
  updateCapacities: async (shopCapacities: Record<string, {
    qualCapacity?: number;
    assignCapacity?: number;
    returnCapacity?: number;
    repairCapacity?: number;
    utilizationTarget?: number;
  }>): Promise<{ success: boolean; message: string; updatedShops: string[] }> => {
    const response = await apiClient.put('/sop/allocations/capacity', { shopCapacities });
    return response.data;
  },

  // Run capacity check
  checkCapacity: async (data: {
    carIds: string[];
    targetShops: string[];
    startMonth: string;
    flowRatePerWeek?: number;
  }): Promise<{
    passed: boolean;
    firstOverloadMonth: string | null;
    totalBacklog: number;
    totalCars: number;
    monthsNeeded: number;
    monthlyBreakdown: Array<{
      monthKey: string;
      carsScheduled: number;
      totalCapacity: number;
      available: number;
      isOverloaded: boolean;
    }>;
    overloadedShops: Array<{
      shopId: string;
      shopName: string;
      monthKey: string;
      capacity: number;
      projected: number;
      overload: number;
    }>;
    message: string;
  }> => {
    const response = await apiClient.post('/sop/capacity-check', data);
    return response.data;
  },
};

export const leaseQualificationApi = {
  // Releases
  getReleases: async (horizonMonths: number = 6): Promise<{ data: LeaseRelease[]; count: number }> => {
    const response = await apiClient.get('/lease-qualification/releases', { params: { horizonMonths } });
    return response.data;
  },

  // Capacity
  getCapacity: async (horizonMonths: number = 6): Promise<{ data: ShopCapacitySnapshot[]; count: number }> => {
    const response = await apiClient.get('/lease-qualification/capacity', { params: { horizonMonths } });
    return response.data;
  },

  // Scenarios
  getScenarios: async (): Promise<{ data: QualificationScenario[]; count: number }> => {
    const response = await apiClient.get('/lease-qualification/scenarios');
    return response.data;
  },

  getScenario: async (id: string): Promise<{ data: QualificationScenario }> => {
    const response = await apiClient.get(`/lease-qualification/scenarios/${id}`);
    return response.data;
  },

  runScenario: async (params: {
    name: string;
    type?: 'base' | 'late_release' | 'capacity_shift' | 'custom';
    lateReleasePercent?: number;
    capacityAdjustments?: Record<string, number>;
    planningHorizonMonths?: number;
  }): Promise<{ data: ScenarioMetrics }> => {
    const response = await apiClient.post('/lease-qualification/scenarios/run', params);
    return response.data;
  },

  compareScenarios: async (scenarioIds: string[]): Promise<{ data: ScenarioComparison }> => {
    const response = await apiClient.post('/lease-qualification/scenarios/compare', { scenarioIds });
    return response.data;
  },

  approveScenario: async (id: string): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.post(`/lease-qualification/scenarios/${id}/approve`);
    return response.data;
  },

  getApprovedScenario: async (): Promise<{ data: QualificationScenario } | null> => {
    try {
      const response = await apiClient.get('/lease-qualification/scenarios/approved');
      return response.data;
    } catch {
      return null;
    }
  },

  // Selection data for documents
  getAvailableCars: async (scenarioId: string): Promise<{ data: AvailableCar[]; count: number }> => {
    const response = await apiClient.get(`/lease-qualification/scenarios/${scenarioId}/available-cars`);
    return response.data;
  },

  getAvailableShops: async (scenarioId: string): Promise<{ data: AvailableShop[]; count: number }> => {
    const response = await apiClient.get(`/lease-qualification/scenarios/${scenarioId}/available-shops`);
    return response.data;
  },

  getAvailableCustomers: async (scenarioId: string): Promise<{ data: AvailableCustomer[]; count: number }> => {
    const response = await apiClient.get(`/lease-qualification/scenarios/${scenarioId}/available-customers`);
    return response.data;
  },

  getAvailableMonths: async (scenarioId: string): Promise<{ data: AvailableMonth[]; count: number }> => {
    const response = await apiClient.get(`/lease-qualification/scenarios/${scenarioId}/available-months`);
    return response.data;
  },

  // Document generation
  generateTeamPlan: async (criteria: DocumentSelectionCriteria, save: boolean = false): Promise<{ data: GeneratedDocument; documentId?: string }> => {
    const response = await apiClient.post(`/lease-qualification/documents/team-plan?save=${save}`, criteria);
    return response.data;
  },

  generateCustomerSchedule: async (criteria: DocumentSelectionCriteria & { customerId: string }, save: boolean = false): Promise<{ data: GeneratedDocument; documentId?: string }> => {
    const response = await apiClient.post(`/lease-qualification/documents/customer-schedule?save=${save}`, criteria);
    return response.data;
  },

  generateShopPlan: async (criteria: DocumentSelectionCriteria & { shopId: string }, save: boolean = false): Promise<{ data: GeneratedDocument; documentId?: string }> => {
    const response = await apiClient.post(`/lease-qualification/documents/shop-plan?save=${save}`, criteria);
    return response.data;
  },

  // Saved documents
  getDocuments: async (scenarioId?: string): Promise<{ data: Array<{ id: string; scenarioId: string; documentType: string; title: string; createdAt: string }>; count: number }> => {
    const response = await apiClient.get('/lease-qualification/documents', { params: { scenarioId } });
    return response.data;
  },

  getDocument: async (id: string): Promise<{ data: { id: string; title: string; contentMarkdown: string; contentJson: Record<string, unknown> } }> => {
    const response = await apiClient.get(`/lease-qualification/documents/${id}`);
    return response.data;
  },

  // Contracts
  getContracts: async (params?: { status?: string; customerId?: string }): Promise<{ data: Array<{ id: string; contractNumber: string; car: { railcarNumber: string }; customer: { name: string }; endDate: string; status: string }>; count: number }> => {
    const response = await apiClient.get('/lease-qualification/contracts', { params });
    return response.data;
  },

  // Queue
  getQueue: async (params?: { status?: string; targetMonth?: string }): Promise<{ data: Array<{ id: string; car: { railcarNumber: string }; customer: { name: string }; targetQualMonth: string; queueStatus: string; priority: number; workTypes: string[] }>; count: number }> => {
    const response = await apiClient.get('/lease-qualification/queue', { params });
    return response.data;
  },
};

export default apiClient;
