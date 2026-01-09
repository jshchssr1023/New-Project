import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig, AxiosRequestConfig } from 'axios';

const API_BASE_URL = '/api';

// Retry configuration
export const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};

// Track pending requests for cancellation
const pendingRequests = new Map<string, AbortController>();

/**
 * Generate a unique key for a request
 */
export function getRequestKey(config: AxiosRequestConfig): string {
  return `${config.method}-${config.url}-${JSON.stringify(config.params || {})}`;
}

/**
 * Cancel a pending request if it exists
 */
export function cancelRequest(key: string): void {
  const controller = pendingRequests.get(key);
  if (controller) {
    controller.abort();
    pendingRequests.delete(key);
  }
}

/**
 * Cancel all pending requests
 */
export function cancelAllRequests(): void {
  pendingRequests.forEach((controller) => controller.abort());
  pendingRequests.clear();
}

/**
 * Create an AbortController for request cancellation
 */
export function createAbortController(): AbortController {
  return new AbortController();
}

/**
 * Delay utility for retry backoff
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 */
export function getRetryDelay(attempt: number): number {
  const exponentialDelay = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 1000;
  return Math.min(exponentialDelay + jitter, RETRY_CONFIG.maxDelayMs);
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: AxiosError): boolean {
  // Don't retry if request was cancelled
  if (axios.isCancel(error)) return false;

  // Retry network errors
  if (!error.response) return true;

  // Retry specific status codes
  return RETRY_CONFIG.retryableStatusCodes.includes(error.response.status);
}

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 second default timeout
  withCredentials: true, // Send cookies with every request for httpOnly cookie auth
});

// Request interceptor to handle cancellation
// Note: Auth token is now sent via httpOnly cookie (withCredentials: true)
// The Authorization header is kept as fallback during transition period
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Keep Authorization header as fallback during transition (can be removed later)
    const token = localStorage.getItem('authToken');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Set up request cancellation for duplicate requests
    const requestKey = getRequestKey(config);

    // Cancel previous request with same key (prevents race conditions)
    const existingController = pendingRequests.get(requestKey);
    if (existingController) {
      existingController.abort();
    }

    // Create new AbortController for this request
    const controller = new AbortController();
    config.signal = controller.signal;
    pendingRequests.set(requestKey, controller);

    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);

// Response interceptor to handle auth errors, retries, and cleanup
apiClient.interceptors.response.use(
  (response) => {
    // Clean up pending request tracking on success
    const requestKey = getRequestKey(response.config);
    pendingRequests.delete(requestKey);
    return response;
  },
  async (error: AxiosError) => {
    const config = error.config as InternalAxiosRequestConfig & { _retryCount?: number };

    // Clean up pending request tracking
    if (config) {
      const requestKey = getRequestKey(config);
      pendingRequests.delete(requestKey);
    }

    // Handle 401 unauthorized
    if (error.response?.status === 401) {
      // Store current location for redirect after login
      // Only store if it's a relative path (not external URL)
      const currentPath = window.location.pathname;
      if (currentPath !== '/login' && currentPath.startsWith('/') && !currentPath.includes('//')) {
        sessionStorage.setItem('redirectAfterLogin', currentPath);
      }

      // Clear auth state
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');

      // Only redirect if not already on login page
      if (currentPath !== '/login') {
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }

    // Don't retry cancelled requests
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }

    // Retry logic for retryable errors
    if (config && isRetryableError(error)) {
      config._retryCount = config._retryCount || 0;

      if (config._retryCount < RETRY_CONFIG.maxRetries) {
        config._retryCount++;
        const delayMs = getRetryDelay(config._retryCount);

        console.warn(
          `Request failed, retrying (${config._retryCount}/${RETRY_CONFIG.maxRetries}) after ${delayMs}ms...`,
          { url: config.url, status: error.response?.status }
        );

        await delay(delayMs);

        // Create new AbortController for retry
        const controller = new AbortController();
        config.signal = controller.signal;

        return apiClient.request(config);
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
