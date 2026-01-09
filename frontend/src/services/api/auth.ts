import apiClient from './client';
import type { User, AuthResponse, LoginCredentials } from '../../types';

// Auth API
// Token is managed via httpOnly cookie - backend sets/clears the cookie automatically
// No localStorage needed for token storage (more secure)
export const authApi = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/login', credentials);
    // httpOnly cookie is set by the backend automatically
    // Return user data for AuthContext to store in state
    return response.data;
  },

  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout');
    // httpOnly cookie is cleared by the backend
  },

  getCurrentUser: async (): Promise<User> => {
    const response = await apiClient.get<User>('/auth/me');
    return response.data;
  },

  refreshToken: async (): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/refresh');
    // httpOnly cookie is refreshed by the backend
    return response.data;
  },
};
