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
} from '../types';

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
  getAll: async (params?: { page?: number; pageSize?: number; status?: string }): Promise<PaginatedResponse<Car>> => {
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

  importCars: async (file: File): Promise<{ imported: number; errors: string[] }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post<{ imported: number; errors: string[] }>('/cars/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
};

// Shops API
export const shopsApi = {
  getAll: async (): Promise<Shop[]> => {
    const response = await apiClient.get<Shop[]>('/shops');
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
  addCars: async (id: string, carIds: string[], scheduledMonth: string): Promise<Scenario> => {
    const response = await apiClient.post<Scenario>(`/scenarios/${id}/cars`, { carIds, scheduledMonth });
    return response.data;
  },

  // Add cars by customer filter
  addCarsByCustomer: async (id: string, customer: string, scheduledMonth: string): Promise<Scenario> => {
    const response = await apiClient.post<Scenario>(`/scenarios/${id}/cars/by-customer`, { customer, scheduledMonth });
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

export default apiClient;
