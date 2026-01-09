import apiClient from './client';
import type { User } from '../../types';

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

// Audit Log API
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
    data: Array<{
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
    }>;
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> => {
    const response = await apiClient.get('/audit', { params });
    return response.data;
  },

  getEntityHistory: async (entityType: string, entityId: string): Promise<Array<{
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
  }>> => {
    const response = await apiClient.get(`/audit/entity/${entityType}/${entityId}`);
    return response.data;
  },

  getSummary: async (days: number = 7): Promise<{
    totalActions: number;
    period: { start: string; end: string; days: number };
    byAction: Record<string, number>;
    byEntity: Record<string, number>;
    topUsers: { email: string; count: number }[];
    recentActions: Array<{
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
    }>;
  }> => {
    const response = await apiClient.get('/audit/summary', { params: { days } });
    return response.data;
  },
};
