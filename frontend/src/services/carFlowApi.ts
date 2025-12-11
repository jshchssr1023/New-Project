/**
 * Car Flow Planning API Service
 *
 * Frontend API client for the Car Flow Planning module
 */

import axios from 'axios';
import {
  Scenario,
  CreateScenarioRequest,
  ScenarioCarAssignment,
  CarFlowPlan,
  CreateCarFlowPlanRequest,
  SOPCommitment,
  CreateSOPCommitmentRequest,
  CapacityResponse,
  ConfirmScenarioResponse,
  ShoppingStatusStats,
  ScenarioStatus,
} from '../types/carFlow';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// =============================================================================
// SCENARIOS
// =============================================================================

export const scenarioApi = {
  /**
   * List all scenarios
   */
  list: async (params?: {
    status?: ScenarioStatus;
    createdBy?: string;
  }): Promise<Scenario[]> => {
    const response = await apiClient.get<Scenario[]>('/car-flow/scenarios', { params });
    return response.data;
  },

  /**
   * Get scenario by ID with cars
   */
  getById: async (id: string): Promise<Scenario> => {
    const response = await apiClient.get<Scenario>(`/car-flow/scenarios/${id}`);
    return response.data;
  },

  /**
   * Create a new scenario
   */
  create: async (data: CreateScenarioRequest): Promise<Scenario> => {
    const response = await apiClient.post<Scenario>('/car-flow/scenarios', data);
    return response.data;
  },

  /**
   * Update a scenario
   */
  update: async (
    id: string,
    data: Partial<Pick<Scenario, 'name' | 'notes' | 'status'>> & { updatedAt?: string }
  ): Promise<Scenario> => {
    const response = await apiClient.patch<Scenario>(`/car-flow/scenarios/${id}`, data);
    return response.data;
  },

  /**
   * Add cars to a scenario
   */
  addCars: async (
    scenarioId: string,
    carAssignments: ScenarioCarAssignment[]
  ): Promise<{ created: number }> => {
    const response = await apiClient.post<{ created: number }>(
      `/car-flow/scenarios/${scenarioId}/cars`,
      { carAssignments }
    );
    return response.data;
  },

  /**
   * Remove a car from a scenario
   */
  removeCar: async (scenarioId: string, carId: string): Promise<void> => {
    await apiClient.delete(`/car-flow/scenarios/${scenarioId}/cars/${carId}`);
  },

  /**
   * Confirm a scenario and create Car Flow Plan entries
   */
  confirm: async (
    scenarioId: string,
    overrideConflicts: boolean = false
  ): Promise<ConfirmScenarioResponse> => {
    const response = await apiClient.post<ConfirmScenarioResponse>(
      `/car-flow/scenarios/${scenarioId}/confirm`,
      { overrideConflicts }
    );
    return response.data;
  },

  /**
   * Duplicate a scenario
   */
  duplicate: async (scenarioId: string, name?: string): Promise<Scenario> => {
    const response = await apiClient.post<Scenario>(
      `/car-flow/scenarios/${scenarioId}/duplicate`,
      { name }
    );
    return response.data;
  },

  /**
   * Delete a scenario
   */
  delete: async (scenarioId: string): Promise<void> => {
    await apiClient.delete(`/car-flow/scenarios/${scenarioId}`);
  },
};

// =============================================================================
// CAR FLOW PLANS
// =============================================================================

export const carFlowPlanApi = {
  /**
   * List Car Flow Plan entries
   */
  list: async (params?: {
    shopId?: string;
    customerId?: string;
    year?: number;
    month?: number;
    status?: string;
  }): Promise<CarFlowPlan[]> => {
    const response = await apiClient.get<CarFlowPlan[]>('/car-flow/plans', { params });
    return response.data;
  },

  /**
   * Create a direct Car Flow Plan entry (skip scenario)
   */
  create: async (data: CreateCarFlowPlanRequest): Promise<CarFlowPlan> => {
    const response = await apiClient.post<CarFlowPlan>('/car-flow/plans', data);
    return response.data;
  },

  /**
   * Cancel a Car Flow Plan entry
   */
  cancel: async (id: string): Promise<CarFlowPlan> => {
    const response = await apiClient.patch<CarFlowPlan>(`/car-flow/plans/${id}/cancel`);
    return response.data;
  },
};

// =============================================================================
// CAPACITY
// =============================================================================

export const capacityApi = {
  /**
   * Get capacity overview for shops
   */
  get: async (params?: {
    shopId?: string;
    year?: number;
    startMonth?: number;
    endMonth?: number;
  }): Promise<CapacityResponse> => {
    const response = await apiClient.get<CapacityResponse>('/car-flow/capacity', { params });
    return response.data;
  },
};

// =============================================================================
// S&OP COMMITMENTS
// =============================================================================

export const sopCommitmentApi = {
  /**
   * List S&OP Supply Commitments
   */
  list: async (params?: {
    year?: number;
    shopId?: string;
    networkId?: string;
  }): Promise<SOPCommitment[]> => {
    const response = await apiClient.get<SOPCommitment[]>('/car-flow/sop-commitments', { params });
    return response.data;
  },

  /**
   * Create or update a single S&OP Commitment
   */
  upsert: async (data: CreateSOPCommitmentRequest): Promise<SOPCommitment> => {
    const response = await apiClient.post<SOPCommitment>('/car-flow/sop-commitments', data);
    return response.data;
  },

  /**
   * Batch update S&OP Commitments
   */
  batchUpdate: async (
    commitments: CreateSOPCommitmentRequest[]
  ): Promise<{ updated: number }> => {
    const response = await apiClient.post<{ updated: number }>(
      '/car-flow/sop-commitments/batch',
      { commitments }
    );
    return response.data;
  },
};

// =============================================================================
// SHOPPING STATUS
// =============================================================================

export const shoppingStatusApi = {
  /**
   * Get shopping status statistics
   */
  getStats: async (): Promise<ShoppingStatusStats> => {
    const response = await apiClient.get<ShoppingStatusStats>('/car-flow/shopping-status/stats');
    return response.data;
  },

  /**
   * Recalculate shopping status for cars
   */
  recalculate: async (
    carIds?: string[]
  ): Promise<{ message: string; updated?: number; processed?: number }> => {
    const response = await apiClient.post<{ message: string; updated?: number; processed?: number }>(
      '/car-flow/shopping-status/recalculate',
      { carIds }
    );
    return response.data;
  },
};

// =============================================================================
// CUSTOMERS
// =============================================================================

export interface Customer {
  id: string;
  name: string;
  code: string;
}

export const customersApi = {
  /**
   * Get all active customers
   */
  getAll: async (): Promise<Customer[]> => {
    const response = await apiClient.get<Customer[]>('/car-flow/customers');
    return response.data;
  },
};

// =============================================================================
// COMBINED EXPORT
// =============================================================================

export const carFlowApi = {
  scenarios: scenarioApi,
  plans: carFlowPlanApi,
  capacity: capacityApi,
  sopCommitments: sopCommitmentApi,
  shoppingStatus: shoppingStatusApi,
  customers: customersApi,
};

export default carFlowApi;
