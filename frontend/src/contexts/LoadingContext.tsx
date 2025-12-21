/**
 * Global Loading Context
 *
 * Provides centralized loading state management for:
 * - Page transitions
 * - Data imports
 * - Background operations
 * - Offline status detection
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface LoadingTask {
  id: string;
  label: string;
  progress?: number; // 0-100
  isIndeterminate?: boolean;
}

interface LoadingContextType {
  // Global loading state
  isLoading: boolean;
  loadingTasks: LoadingTask[];

  // Offline detection
  isOffline: boolean;
  lastOnlineAt: Date | null;

  // Loading task management
  startLoading: (id: string, label: string, isIndeterminate?: boolean) => void;
  updateProgress: (id: string, progress: number) => void;
  stopLoading: (id: string) => void;

  // Simple loading toggle for quick operations
  setGlobalLoading: (loading: boolean, label?: string) => void;
}

const LoadingContext = createContext<LoadingContextType | null>(null);

export function useLoading() {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }
  return context;
}

interface LoadingProviderProps {
  children: ReactNode;
}

export function LoadingProvider({ children }: LoadingProviderProps) {
  const [loadingTasks, setLoadingTasks] = useState<LoadingTask[]>([]);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [lastOnlineAt, setLastOnlineAt] = useState<Date | null>(
    navigator.onLine ? new Date() : null
  );

  // Offline detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      setLastOnlineAt(new Date());
    };

    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const startLoading = useCallback((id: string, label: string, isIndeterminate = true) => {
    setLoadingTasks(prev => {
      // Don't add duplicate tasks
      if (prev.some(t => t.id === id)) {
        return prev.map(t => t.id === id ? { ...t, label, isIndeterminate } : t);
      }
      return [...prev, { id, label, isIndeterminate, progress: 0 }];
    });
  }, []);

  const updateProgress = useCallback((id: string, progress: number) => {
    setLoadingTasks(prev =>
      prev.map(t => t.id === id ? { ...t, progress: Math.min(100, Math.max(0, progress)), isIndeterminate: false } : t)
    );
  }, []);

  const stopLoading = useCallback((id: string) => {
    setLoadingTasks(prev => prev.filter(t => t.id !== id));
  }, []);

  const setGlobalLoading = useCallback((loading: boolean, label = 'Loading...') => {
    if (loading) {
      startLoading('global', label);
    } else {
      stopLoading('global');
    }
  }, [startLoading, stopLoading]);

  const isLoading = loadingTasks.length > 0;

  return (
    <LoadingContext.Provider
      value={{
        isLoading,
        loadingTasks,
        isOffline,
        lastOnlineAt,
        startLoading,
        updateProgress,
        stopLoading,
        setGlobalLoading,
      }}
    >
      {children}
    </LoadingContext.Provider>
  );
}

export default LoadingContext;
