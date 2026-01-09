import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { carsApi } from '../services/api';
import type { Car, PaginatedResponse, ShoppingStatus } from '../types';

type PlanningStatus = 'needs_planning' | 'already_planned' | 'all';

interface CarsFilters {
  page: number;
  pageSize: number;
  status?: string;
  carType?: string;
  customer?: string;
  reasonsShopped?: string;
  shoppingStatus?: ShoppingStatus;
  planningStatus?: PlanningStatus;
  search?: string;
}

interface UseCarsOptions {
  initialPageSize?: number;
}

export function useCars(options: UseCarsOptions = {}) {
  const { initialPageSize = 25 } = options;
  const queryClient = useQueryClient();

  // Filters state
  const [filters, setFilters] = useState<CarsFilters>({
    page: 1,
    pageSize: initialPageSize,
  });

  // Selection state
  const [selectedCarIds, setSelectedCarIds] = useState<Set<string>>(new Set());

  // Fetch cars query
  const {
    data: carsResponse,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['cars', filters],
    queryFn: () => carsApi.getAll({
      page: filters.page,
      pageSize: filters.pageSize,
      status: filters.status,
      carType: filters.carType,
      customer: filters.customer,
      reasonsShopped: filters.reasonsShopped,
      shoppingStatus: filters.shoppingStatus,
      planningStatus: filters.planningStatus,
      search: filters.search,
    }),
    staleTime: 30000, // 30 seconds
  });

  // Fetch filter options from the entire database (not just current page)
  const { data: filterOptionsData } = useQuery({
    queryKey: ['cars', 'filter-options'],
    queryFn: () => carsApi.getFilterOptions(),
    staleTime: 60000, // 1 minute
  });

  // Mutations with optimistic updates
  const createCarMutation = useMutation({
    mutationFn: (data: Partial<Car>) => carsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cars'] });
    },
  });

  const updateCarMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Car> }) => carsApi.update(id, data),
    onMutate: async ({ id, data }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['cars'] });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData(['cars', filters]);

      // Optimistically update
      queryClient.setQueryData(['cars', filters], (old: PaginatedResponse<Car> | undefined) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map(car => car.id === id ? { ...car, ...data } : car),
        };
      });

      return { previousData };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(['cars', filters], context.previousData);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['cars'] });
    },
  });

  const deleteCarMutation = useMutation({
    mutationFn: (id: string) => carsApi.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['cars'] });
      const previousData = queryClient.getQueryData(['cars', filters]);

      queryClient.setQueryData(['cars', filters], (old: PaginatedResponse<Car> | undefined) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.filter(car => car.id !== id),
          total: old.total - 1,
        };
      });

      return { previousData };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['cars', filters], context.previousData);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['cars'] });
    },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: ({ ids, data }: { ids: string[]; data: Partial<Car> }) =>
      carsApi.bulkUpdate(ids, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cars'] });
      setSelectedCarIds(new Set());
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => carsApi.bulkDelete(ids),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: ['cars'] });
      const previousData = queryClient.getQueryData(['cars', filters]);

      queryClient.setQueryData(['cars', filters], (old: PaginatedResponse<Car> | undefined) => {
        if (!old) return old;
        const idsSet = new Set(ids);
        return {
          ...old,
          data: old.data.filter(car => !idsSet.has(car.id)),
          total: old.total - ids.length,
        };
      });

      return { previousData };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['cars', filters], context.previousData);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['cars'] });
      setSelectedCarIds(new Set());
    },
  });

  const importCarsMutation = useMutation({
    mutationFn: (cars: Partial<Car>[]) => carsApi.bulkImport(cars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cars'] });
    },
  });

  // Filter actions
  const updateFilters = useCallback((newFilters: Partial<CarsFilters>) => {
    setFilters(prev => ({
      ...prev,
      ...newFilters,
      // Reset to page 1 when filters change (except page itself)
      page: newFilters.page !== undefined ? newFilters.page : 1,
    }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({
      page: 1,
      pageSize: initialPageSize,
    });
  }, [initialPageSize]);

  // Selection actions
  const toggleSelection = useCallback((id: string) => {
    setSelectedCarIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (carsResponse?.data) {
      setSelectedCarIds(new Set(carsResponse.data.map(c => c.id)));
    }
  }, [carsResponse?.data]);

  const clearSelection = useCallback(() => {
    setSelectedCarIds(new Set());
  }, []);

  const selectRange = useCallback((startId: string, endId: string) => {
    if (!carsResponse?.data) return;

    const startIdx = carsResponse.data.findIndex(c => c.id === startId);
    const endIdx = carsResponse.data.findIndex(c => c.id === endId);

    if (startIdx === -1 || endIdx === -1) return;

    const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
    const rangeIds = carsResponse.data.slice(from, to + 1).map(c => c.id);

    setSelectedCarIds(prev => new Set([...prev, ...rangeIds]));
  }, [carsResponse?.data]);

  // Filtered data with client-side search and shopping status filter
  const filteredCars = useMemo(() => {
    if (!carsResponse?.data) return [];

    let result = carsResponse.data;

    // Client-side search
    if (filters.search) {
      const term = filters.search.toLowerCase();
      result = result.filter(car =>
        car.railcarNumber?.toLowerCase().includes(term) ||
        car.customer?.toLowerCase().includes(term) ||
        car.projectNumber?.toLowerCase().includes(term) ||
        car.commodity?.toLowerCase().includes(term) ||
        car.carType?.toLowerCase().includes(term)
      );
    }

    // Shopping status filter (client-side)
    if (filters.shoppingStatus) {
      const currentYear = new Date().getFullYear();
      result = result.filter(car => {
        const qualDates = [
          car.minNoLining,
          car.minWLining,
          car.interiorLining,
          car.rule88B,
          car.safetyRelief,
          car.serviceEquipment,
          car.stubSill,
          car.tankThickness,
          car.tankQualification,
        ].filter(Boolean);

        if (qualDates.length === 0) return filters.shoppingStatus === 'Unknown';

        let hasUrgent = false;
        let hasMustShop = false;
        let hasUpcoming = false;

        for (const dateStr of qualDates) {
          if (!dateStr) continue;
          const date = new Date(dateStr);
          if (isNaN(date.getTime())) continue;
          const year = date.getFullYear();

          if (year < currentYear) hasUrgent = true;
          else if (year === currentYear) hasMustShop = true;
          else if (year === currentYear + 1) hasUpcoming = true;
        }

        switch (filters.shoppingStatus) {
          case 'Urgent': return hasUrgent;
          case 'Must Shop': return hasMustShop && !hasUrgent;
          case 'Upcoming': return hasUpcoming && !hasUrgent && !hasMustShop;
          case 'Compliant': return !hasUrgent && !hasMustShop && !hasUpcoming;
          default: return true;
        }
      });
    }

    return result;
  }, [carsResponse?.data, filters.search, filters.shoppingStatus]);

  // Unique values for filter dropdowns (from API - entire database)
  const filterOptions = useMemo(() => {
    return {
      customers: filterOptionsData?.customers || [],
      carTypes: filterOptionsData?.carTypes || [],
      reasons: filterOptionsData?.reasons || [],
      statuses: filterOptionsData?.statuses || [],
    };
  }, [filterOptionsData]);

  return {
    // Data
    cars: filteredCars,
    totalCars: carsResponse?.total || 0,
    totalPages: carsResponse?.totalPages || 1,
    currentPage: filters.page,
    pageSize: filters.pageSize,
    isLoading,
    error,

    // Filters
    filters,
    updateFilters,
    clearFilters,
    filterOptions,

    // Selection
    selectedCarIds,
    toggleSelection,
    selectAll,
    clearSelection,
    selectRange,
    selectedCars: filteredCars.filter(c => selectedCarIds.has(c.id)),

    // Mutations
    createCar: createCarMutation.mutateAsync,
    updateCar: (id: string, data: Partial<Car>) => updateCarMutation.mutateAsync({ id, data }),
    deleteCar: deleteCarMutation.mutateAsync,
    bulkUpdate: (ids: string[], data: Partial<Car>) => bulkUpdateMutation.mutateAsync({ ids, data }),
    bulkDelete: bulkDeleteMutation.mutateAsync,
    importCars: importCarsMutation.mutateAsync,

    // Status
    isCreating: createCarMutation.isPending,
    isUpdating: updateCarMutation.isPending,
    isDeleting: deleteCarMutation.isPending,
    isBulkUpdating: bulkUpdateMutation.isPending,
    isBulkDeleting: bulkDeleteMutation.isPending,
    isImporting: importCarsMutation.isPending,

    // Actions
    refetch,
  };
}
