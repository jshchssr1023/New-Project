import apiClient from './client';
import type { Car, PaginatedResponse } from '../../types';
import type { CarImportResult, HeaderAnalysisResult } from './types';

// Cars API
export const carsApi = {
  getAll: async (params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    carType?: string;
    customer?: string;
    reasonsShopped?: string;
    shoppingStatus?: string;
    planningStatus?: string; // 'needs_planning' | 'already_planned' | 'all'
    search?: string;
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
    reasonsShopped?: string;
    carType?: string;
    format?: 'umler' | 'standard';
  }): Promise<void> => {
    const queryParams: Record<string, string> = {};
    if (params?.ids?.length) {
      queryParams.ids = params.ids.join(',');
    }
    if (params?.status) queryParams.status = params.status;
    if (params?.customer) queryParams.customer = params.customer;
    if (params?.reasonsShopped) queryParams.reasonsShopped = params.reasonsShopped;
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
