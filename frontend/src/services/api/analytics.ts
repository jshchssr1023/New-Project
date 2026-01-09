import apiClient from './client';
import type { AnalyticsData } from '../../types';

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
