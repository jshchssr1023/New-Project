/**
 * useQueryWithCompany.ts - TanStack Query hooks with company context
 *
 * Provides custom hooks that automatically inject companyId from AuthContext
 * into all queries, ensuring multi-tenant data isolation.
 */

import { useQuery, useMutation, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { masterPlanApi } from '../services/api';
import type {
  MasterPlan,
  MasterPlanWithCommitments,
  MasterPlanCommitment,
  MasterPlanSummary,
  MasterPlanStatus,
  CommitmentStatus,
} from '../types';

// =============================================================================
// QUERY KEYS
// =============================================================================

export const queryKeys = {
  masterPlans: {
    all: ['masterPlans'] as const,
    lists: () => [...queryKeys.masterPlans.all, 'list'] as const,
    list: (filters: { fiscalYear?: number; status?: MasterPlanStatus }) =>
      [...queryKeys.masterPlans.lists(), filters] as const,
    active: () => [...queryKeys.masterPlans.all, 'active'] as const,
    details: () => [...queryKeys.masterPlans.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.masterPlans.details(), id] as const,
    summary: (id: string) => [...queryKeys.masterPlans.detail(id), 'summary'] as const,
    commitments: (id: string) => [...queryKeys.masterPlans.detail(id), 'commitments'] as const,
  },
  customers: {
    all: ['customers'] as const,
    schedule: (customerId: string, masterPlanId?: string) =>
      [...queryKeys.customers.all, 'schedule', customerId, masterPlanId] as const,
  },
  shops: {
    all: ['shops'] as const,
    workOrders: (shopId: string, month: string) =>
      [...queryKeys.shops.all, 'workOrders', shopId, month] as const,
  },
};

// =============================================================================
// MASTERPLAN QUERIES
// =============================================================================

/**
 * Fetch all MasterPlans with optional filters
 */
export function useMasterPlans(
  filters?: { fiscalYear?: number; status?: MasterPlanStatus },
  options?: Omit<UseQueryOptions<MasterPlan[], Error>, 'queryKey' | 'queryFn'>
) {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.masterPlans.list(filters || {}),
    queryFn: () => masterPlanApi.getAll(filters),
    enabled: !!user?.companyId,
    staleTime: 30000, // 30 seconds
    ...options,
  });
}

/**
 * Fetch the active MasterPlan
 */
export function useActiveMasterPlan(
  options?: Omit<UseQueryOptions<MasterPlanWithCommitments | null, Error>, 'queryKey' | 'queryFn'>
) {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.masterPlans.active(),
    queryFn: async () => {
      try {
        return await masterPlanApi.getActive();
      } catch (error: any) {
        // Return null instead of throwing for 404 (no active plan)
        if (error?.response?.status === 404) {
          return null;
        }
        throw error;
      }
    },
    enabled: !!user?.companyId,
    staleTime: 60000, // 1 minute
    retry: false, // Don't retry - either it exists or it doesn't
    ...options,
  });
}

/**
 * Fetch a specific MasterPlan by ID
 */
export function useMasterPlan(
  id: string | undefined,
  options?: Omit<UseQueryOptions<MasterPlanWithCommitments, Error>, 'queryKey' | 'queryFn'>
) {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.masterPlans.detail(id || ''),
    queryFn: () => masterPlanApi.getById(id!),
    enabled: !!user?.companyId && !!id,
    staleTime: 30000,
    ...options,
  });
}

/**
 * Fetch MasterPlan summary statistics
 */
export function useMasterPlanSummary(
  id: string | undefined,
  options?: Omit<UseQueryOptions<MasterPlanSummary, Error>, 'queryKey' | 'queryFn'>
) {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.masterPlans.summary(id || ''),
    queryFn: () => masterPlanApi.getSummary(id!),
    enabled: !!user?.companyId && !!id,
    staleTime: 60000,
    ...options,
  });
}

/**
 * Fetch customer schedule from MasterPlan
 */
export function useCustomerSchedule(
  customerId: string | undefined,
  masterPlanId?: string,
  options?: Omit<UseQueryOptions<MasterPlanCommitment[], Error>, 'queryKey' | 'queryFn'>
) {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.customers.schedule(customerId || '', masterPlanId),
    queryFn: () => masterPlanApi.getCustomerSchedule(customerId!, masterPlanId),
    enabled: !!user?.companyId && !!customerId,
    staleTime: 60000,
    ...options,
  });
}

/**
 * Fetch shop work orders from MasterPlan
 */
export function useShopWorkOrders(
  shopId: string | undefined,
  month: string | undefined,
  options?: Omit<UseQueryOptions<MasterPlanCommitment[], Error>, 'queryKey' | 'queryFn'>
) {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.shops.workOrders(shopId || '', month || ''),
    queryFn: () => masterPlanApi.getShopWorkOrders(shopId!, month!),
    enabled: !!user?.companyId && !!shopId && !!month,
    staleTime: 60000,
    ...options,
  });
}

// =============================================================================
// MASTERPLAN MUTATIONS
// =============================================================================

/**
 * Create MasterPlan from Scenario
 */
export function useCreateMasterPlanFromScenario() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ scenarioId, planName }: { scenarioId: string; planName: string }) =>
      masterPlanApi.createFromScenario(scenarioId, planName),
    onSuccess: () => {
      // Invalidate all master plan queries
      queryClient.invalidateQueries({ queryKey: queryKeys.masterPlans.all });
    },
  });
}

/**
 * Approve MasterPlan
 */
export function useApproveMasterPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, activate }: { id: string; activate?: boolean }) =>
      masterPlanApi.approve(id, activate),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.masterPlans.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.masterPlans.active() });
      queryClient.invalidateQueries({ queryKey: queryKeys.masterPlans.lists() });
    },
  });
}

/**
 * Activate MasterPlan
 */
export function useActivateMasterPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => masterPlanApi.activate(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.masterPlans.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.masterPlans.active() });
      queryClient.invalidateQueries({ queryKey: queryKeys.masterPlans.lists() });
    },
  });
}

/**
 * Archive MasterPlan
 */
export function useArchiveMasterPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => masterPlanApi.archive(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.masterPlans.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.masterPlans.lists() });
    },
  });
}

/**
 * Update commitment status
 */
export function useUpdateCommitmentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      masterPlanId,
      commitmentId,
      status,
    }: {
      masterPlanId: string;
      commitmentId: string;
      status: CommitmentStatus;
    }) => masterPlanApi.updateCommitmentStatus(masterPlanId, commitmentId, status),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.masterPlans.detail(variables.masterPlanId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.masterPlans.summary(variables.masterPlanId),
      });
    },
  });
}
