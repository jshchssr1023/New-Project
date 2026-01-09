import apiClient from './client';
import type { User, AuthResponse, LoginCredentials } from '../../types';

// Auth API
// Note: Token is now stored in httpOnly cookie, managed by backend
// localStorage is kept for backward compatibility during transition
export const authApi = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/login', credentials);
    // Keep localStorage for backward compatibility during transition
    // The httpOnly cookie is set by the backend automatically
    if (response.data.token) {
      localStorage.setItem('authToken', response.data.token);
    }
    localStorage.setItem('user', JSON.stringify(response.data.user));
    return response.data;
  },

  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout');
    // Clear localStorage (httpOnly cookie cleared by backend)
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
  },

  getCurrentUser: async (): Promise<User> => {
    const response = await apiClient.get<User>('/auth/me');
    return response.data;
  },

  refreshToken: async (): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/refresh');
    // Keep localStorage for backward compatibility
    if (response.data.token) {
      localStorage.setItem('authToken', response.data.token);
    }
    return response.data;
  },
};
