import apiClient from './client';
import type { AnalyticsData } from '../../types';

// SST Status types
export interface SSTStatusCounts {
  draft: number;
  pendingReview: number;
  committed: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  superseded: number;
  total: number;
}

export interface SSTFleetCoverage {
  totalCars: number;
  carsPlanned: number;
  carsNotPlanned: number;
  planningRate: number;
}

export interface SSTTeamBucketBreakdown {
  needsPlanning: number;
  notConfirmed: number;
  confirmed: number;
  total: number;
}

export interface SSTStatusResponse {
  statusCounts: SSTStatusCounts;
  planningStates: {
    needsPlanning: number;
    notConfirmed: number;
    confirmed: number;
    completed: number;
  };
  fleetCoverage: SSTFleetCoverage;
  byTeamBucket: Record<string, SSTTeamBucketBreakdown>;
  byUrgency: Record<string, SSTTeamBucketBreakdown>;
}

export interface PlanToConfirm {
  id: string;
  carId: string;
  railcarNumber: string;
  customer: string;
  carType: string;
  shopId: string;
  shopName: string;
  shopCode: string;
  shopRegion: string;
  isAitxInternal: boolean;
  plannedMonth: number;
  plannedYear: number;
  scheduledMonth: string;
  status: 'DRAFT' | 'PENDING_REVIEW';
  statusLabel: string;
  teamBucket: string;
  urgency: string;
  daysUntilScheduled: number;
  workType: string;
  estimatedDays: number;
  estimatedCost: number;
  createdAt: string;
  updatedAt: string;
  source: string;
  notes: string;
}

export interface PlansToConfirmResponse {
  summary: {
    total: number;
    draft: number;
    pendingReview: number;
    byTeamBucket: Record<string, number>;
  };
  plans: PlanToConfirm[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface ConfirmedPlan {
  id: string;
  carId: string;
  railcarNumber: string;
  customer: string;
  carType: string;
  shopId: string;
  shopName: string;
  shopCode: string;
  shopRegion: string;
  isAitxInternal: boolean;
  plannedMonth: number;
  plannedYear: number;
  scheduledMonth: string;
  status: 'COMMITTED' | 'IN_PROGRESS';
  statusLabel: string;
  teamBucket: string;
  daysUntilScheduled: number;
  daysInProgress: number;
  workType: string;
  estimatedDays: number;
  actualDays: number;
  estimatedCost: number;
  actualCost: number;
  actualArrivalDate: string;
  scheduledCompletionDate: string;
  createdAt: string;
  updatedAt: string;
  source: string;
}

export interface ConfirmedPlansResponse {
  summary: {
    total: number;
    committed: number;
    inProgress: number;
    byShop: Record<string, number>;
    byMonth: Record<string, number>;
  };
  plans: ConfirmedPlan[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

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

  // ==========================================================================
  // SST (Single Source of Truth) Endpoints - UnifiedAssignment based
  // ==========================================================================

  /**
   * Get SST status summary - complete visibility into UnifiedAssignment
   */
  getSSTStatus: async (): Promise<SSTStatusResponse> => {
    const response = await apiClient.get<SSTStatusResponse>('/analytics/sst-status');
    return response.data;
  },

  /**
   * Get plans awaiting confirmation (DRAFT/PENDING_REVIEW)
   */
  getPlansToConfirm: async (params?: {
    status?: 'DRAFT' | 'PENDING_REVIEW';
    teamBucket?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PlansToConfirmResponse> => {
    const response = await apiClient.get<PlansToConfirmResponse>('/analytics/plans-to-confirm', { params });
    return response.data;
  },

  /**
   * Get confirmed/finalized plans (COMMITTED/IN_PROGRESS)
   */
  getConfirmedPlans: async (params?: {
    status?: 'COMMITTED' | 'IN_PROGRESS';
    teamBucket?: string;
    shopId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<ConfirmedPlansResponse> => {
    const response = await apiClient.get<ConfirmedPlansResponse>('/analytics/confirmed-plans', { params });
    return response.data;
  },
};
