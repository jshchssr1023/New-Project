/**
 * Shared API Services
 *
 * Contains APIs that support various parts of the application:
 * - Car Flow Plans (master schedule)
 * - Capacity management
 * - S&OP Commitments
 * - Shopping status
 * - Customer data
 */

import apiClient from './api';
import type { Customer } from '../types';

// =============================================================================
// TYPES
// =============================================================================

export interface CarFlowPlan {
  id: string;
  carId: string;
  shopId: string;
  plannedMonth: number;
  plannedYear: number;
  status: 'Planned' | 'InProgress' | 'Complete' | 'Cancelled';
  shopReason?: string;
  notes?: string;
  car?: {
    id: string;
    railcarNumber: string;
    carType?: string;
    customer?: string;
  };
  shop?: {
    id: string;
    name: string;
    code: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CreateCarFlowPlanRequest {
  carId: string;
  shopId: string;
  plannedMonth: number;
  plannedYear: number;
  shopReason?: string;
  notes?: string;
}

export interface SOPCommitment {
  id: string;
  shopId: string;
  year: number;
  month: number;
  committedVolume: number;
  shop?: {
    id: string;
    name: string;
    code: string;
  };
}

export interface CreateSOPCommitmentRequest {
  shopId: string;
  year: number;
  month: number;
  committedVolume: number;
}

export interface CapacityResponse {
  shops: {
    id: string;
    name: string;
    code: string;
    capacity: number;
    months: {
      month: number;
      year: number;
      scheduled: number;
      available: number;
      utilization: number;
    }[];
  }[];
  summary: {
    totalCapacity: number;
    totalScheduled: number;
    averageUtilization: number;
  };
}

export interface ShoppingStatusStats {
  total: number;
  urgent: number;
  mustShop: number;
  upcoming: number;
  compliant: number;
  unknown: number;
}

// Types for bulk plan creation
export interface BulkPlanAssignment {
  carId: string;
  shopId: string;
  plannedMonth: number;
  plannedYear: number;
  shopReason?: string;
  notes?: string;
}

export interface BulkPlanConflict {
  carId: string;
  railcarNumber: string;
  existingShop: string;
  existingMonth: string;
  status: string;
}

export interface BulkPlanResponse {
  success: boolean;
  message: string;
  plansCreated?: number;
  plans?: CarFlowPlan[];
  conflicts?: BulkPlanConflict[];
  allowOverride?: boolean;
  errors?: {
    carId: string;
    railcarNumber?: string;
    error: string;
    code: string;
  }[];
  warnings?: {
    shopId: string;
    shopName: string;
    month: string;
    currentUsage: number;
    capacity: number;
    carCount: number;
  }[];
  skipped?: {
    carId: string;
    railcarNumber?: string;
    error: string;
    code: string;
  }[];
}

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
   * Create a direct Car Flow Plan entry
   */
  create: async (data: CreateCarFlowPlanRequest): Promise<CarFlowPlan> => {
    const response = await apiClient.post<CarFlowPlan>('/car-flow/plans', data);
    return response.data;
  },

  /**
   * Bulk create Car Flow Plan entries
   */
  bulkCreate: async (
    assignments: BulkPlanAssignment[],
    overrideConflicts: boolean = false
  ): Promise<BulkPlanResponse> => {
    const response = await apiClient.post<BulkPlanResponse>('/car-flow/plans/bulk', {
      assignments,
      overrideConflicts
    });
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

export const customersApi = {
  /**
   * Get all active customers
   */
  getAll: async (): Promise<Customer[]> => {
    const response = await apiClient.get<Customer[]>('/service-plans/customers');
    return response.data;
  },
};

// =============================================================================
// COMBINED EXPORT
// =============================================================================

export const carFlowApi = {
  plans: carFlowPlanApi,
  capacity: capacityApi,
  sopCommitments: sopCommitmentApi,
  shoppingStatus: shoppingStatusApi,
  customers: customersApi,
};

export default carFlowApi;
