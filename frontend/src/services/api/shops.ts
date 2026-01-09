import apiClient from './client';
import type { Shop } from '../../types';
import type { ShopPerformanceMetrics, ShopScorecard, NetworkScorecard } from './types';

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

// Shop Performance API
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
