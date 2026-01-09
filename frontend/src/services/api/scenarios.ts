import apiClient from './client';
import type { Scenario, Plan, ShopRecommendation } from '../../types';

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

  // Get alternative shop recommendations for car(s)
  getAlternativeShops: async (carIds: string[], excludeShopId?: string): Promise<ShopRecommendation[]> => {
    const response = await apiClient.post<{ recommendations: ShopRecommendation[] }>('/scenarios/alternative-shops', {
      carIds,
      excludeShopId,
    });
    return response.data.recommendations;
  },

  // Confirm shop assignments - converts ScenarioCar to SOPAssignment
  // This is REQUIRED before approving a scenario
  confirmAssignments: async (scenarioId: string): Promise<{
    success: boolean;
    message: string;
    scenario: Scenario;
    sopAssignmentCount: number;
  }> => {
    const response = await apiClient.post(`/scenarios/${scenarioId}/confirm-assignments`);
    return response.data;
  },

  // Approve scenario and create MasterPlan
  approve: async (scenarioId: string, options?: { planName?: string; activate?: boolean }): Promise<{
    success: boolean;
    message: string;
    masterPlan: {
      id: string;
      planName: string;
      fiscalYear: number;
      version: number;
      status: string;
      commitmentCount: number;
    };
  }> => {
    const response = await apiClient.post(`/scenarios/${scenarioId}/approve`, options || {});
    return response.data;
  },
};
