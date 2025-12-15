/**
 * Demand Registry Page
 *
 * Displays all cars that are due and active based on:
 * - tankQualDueDate (qualifications due this year or rolling 3 months)
 * - contractExpiration (returns within 6-month horizon)
 * - reasonShopped = 'assignment' (pre-delivery prep)
 *
 * Includes counts by work type, planning state, and overdue status.
 */

import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardDocumentListIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  ArrowDownTrayIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CalendarIcon,
  CubeIcon,
  WrenchScrewdriverIcon,
  ArrowUturnLeftIcon,
  TruckIcon,
} from '@heroicons/react/24/outline';
import { sopApi } from '../services/sopApi';
import type { DemandRegisterItem, WorkType, PlanningState } from '../types/sop';

// Work type configuration for display
const WORK_TYPE_CONFIG: Record<
  WorkType,
  { label: string; icon: typeof ClipboardDocumentListIcon; color: string }
> = {
  qualification: {
    label: 'Qualifications',
    icon: CheckCircleIcon,
    color: 'blue',
  },
  assignment: {
    label: 'Assignments',
    icon: TruckIcon,
    color: 'purple',
  },
  return: {
    label: 'Returns',
    icon: ArrowUturnLeftIcon,
    color: 'amber',
  },
  repair: {
    label: 'Repairs',
    icon: WrenchScrewdriverIcon,
    color: 'red',
  },
  maintenance: {
    label: 'Maintenance',
    icon: CubeIcon,
    color: 'green',
  },
  project: {
    label: 'Project',
    icon: ClipboardDocumentListIcon,
    color: 'steel',
  },
};

// Planning state configuration
const PLANNING_STATE_CONFIG: Record<
  PlanningState,
  { label: string; color: string; bgColor: string }
> = {
  not_planned: { label: 'Not Planned', color: 'text-red-700', bgColor: 'bg-red-100' },
  tentatively_scheduled: {
    label: 'Tentative',
    color: 'text-amber-700',
    bgColor: 'bg-amber-100',
  },
  awaiting_confirmation: {
    label: 'Awaiting Confirm',
    color: 'text-purple-700',
    bgColor: 'bg-purple-100',
  },
  planned: { label: 'Planned', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  scheduled: { label: 'Scheduled', color: 'text-green-700', bgColor: 'bg-green-100' },
  in_progress: { label: 'In Progress', color: 'text-cyan-700', bgColor: 'bg-cyan-100' },
  completed: { label: 'Completed', color: 'text-steel-700', bgColor: 'bg-steel-100' },
};

type SortField = 'daysUntilDue' | 'railcarNumber' | 'customer' | 'dueDate' | 'workType';
type SortDirection = 'asc' | 'desc';

interface Filters {
  workTypes: WorkType[];
  planningStates: PlanningState[];
  isOverdue: boolean | null;
  searchQuery: string;
  isTankCar: boolean | null;
}

export default function DemandRegistryPage() {
  const navigate = useNavigate();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [filters, setFilters] = useState<Filters>({
    workTypes: [],
    planningStates: [],
    isOverdue: null,
    searchQuery: '',
    isTankCar: null,
  });
  const [sortField, setSortField] = useState<SortField>('daysUntilDue');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [expandedSections, setExpandedSections] = useState<Set<WorkType>>(
    new Set(['qualification'])
  );
  const [viewMode, setViewMode] = useState<'table' | 'grouped'>('grouped');

  // Fetch demand register
  const {
    data: demandRegister,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['demand-register', selectedYear],
    queryFn: () => sopApi.demandRegistry.getDemandRegister(selectedYear, true),
  });

  // Filter items
  const filteredItems = useMemo(() => {
    if (!demandRegister) return [];

    let items = [...demandRegister.items];

    // Apply work type filter
    if (filters.workTypes.length > 0) {
      items = items.filter((i) => filters.workTypes.includes(i.workType));
    }

    // Apply planning state filter
    if (filters.planningStates.length > 0) {
      items = items.filter((i) => filters.planningStates.includes(i.planningState));
    }

    // Apply overdue filter
    if (filters.isOverdue !== null) {
      items = items.filter((i) => i.isOverdue === filters.isOverdue);
    }

    // Apply tank car filter
    if (filters.isTankCar !== null) {
      items = items.filter((i) => i.isTankCar === filters.isTankCar);
    }

    // Apply search filter
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      items = items.filter(
        (i) =>
          i.railcarNumber.toLowerCase().includes(query) ||
          i.customer.toLowerCase().includes(query)
      );
    }

    // Sort items
    items.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'daysUntilDue':
          comparison = a.daysUntilDue - b.daysUntilDue;
          break;
        case 'railcarNumber':
          comparison = a.railcarNumber.localeCompare(b.railcarNumber);
          break;
        case 'customer':
          comparison = a.customer.localeCompare(b.customer);
          break;
        case 'dueDate':
          comparison = (a.dueDate || '').localeCompare(b.dueDate || '');
          break;
        case 'workType':
          comparison = a.workType.localeCompare(b.workType);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return items;
  }, [demandRegister, filters, sortField, sortDirection]);

  // Group items by work type
  const groupedItems = useMemo(() => {
    const groups = new Map<WorkType, DemandRegisterItem[]>();
    filteredItems.forEach((item) => {
      if (!groups.has(item.workType)) {
        groups.set(item.workType, []);
      }
      groups.get(item.workType)!.push(item);
    });
    return groups;
  }, [filteredItems]);

  // Summary statistics
  const summaryStats = useMemo(() => {
    if (!demandRegister) return null;

    return {
      total: demandRegister.items.length,
      overdue: demandRegister.totalOverdue,
      notPlanned: demandRegister.totalNotPlanned,
      planned: demandRegister.totalPlanned,
      scheduled: demandRegister.totalScheduled,
      byWorkType: demandRegister.summaries,
    };
  }, [demandRegister]);

  // Toggle work type filter
  const toggleWorkTypeFilter = (type: WorkType) => {
    setFilters((prev) => ({
      ...prev,
      workTypes: prev.workTypes.includes(type)
        ? prev.workTypes.filter((t) => t !== type)
        : [...prev.workTypes, type],
    }));
  };

  // Toggle planning state filter
  const toggleStateFilter = (state: PlanningState) => {
    setFilters((prev) => ({
      ...prev,
      planningStates: prev.planningStates.includes(state)
        ? prev.planningStates.filter((s) => s !== state)
        : [...prev.planningStates, state],
    }));
  };

  // Toggle section expansion
  const toggleSection = (type: WorkType) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Navigate to car details
  const handleCarClick = (railcarNumber: string) => {
    navigate(`/cars?search=${encodeURIComponent(railcarNumber)}`);
  };

  // Clear all filters
  const clearFilters = () => {
    setFilters({
      workTypes: [],
      planningStates: [],
      isOverdue: null,
      searchQuery: '',
      isTankCar: null,
    });
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rail-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Failed to load demand registry: {(error as Error).message}</p>
          <button onClick={() => refetch()} className="btn-secondary mt-2">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-full mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-steel-900">Demand Registry</h1>
        <p className="text-steel-500 mt-1">
          All cars due and active based on qualification dates, contract expirations, and assignments.
        </p>
      </div>

      {/* Summary Cards */}
      {summaryStats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="card p-4 border-l-4 border-l-steel-500">
            <div className="flex items-center gap-3">
              <div className="bg-steel-100 rounded-lg p-2">
                <ClipboardDocumentListIcon className="h-5 w-5 text-steel-600" />
              </div>
              <div>
                <p className="text-xs text-steel-500 uppercase">Total Items</p>
                <p className="text-xl font-bold text-steel-900">
                  {summaryStats.total.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div className="card p-4 border-l-4 border-l-red-500">
            <div className="flex items-center gap-3">
              <div className="bg-red-100 rounded-lg p-2">
                <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-steel-500 uppercase">Overdue</p>
                <p className="text-xl font-bold text-red-600">
                  {summaryStats.overdue.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div className="card p-4 border-l-4 border-l-amber-500">
            <div className="flex items-center gap-3">
              <div className="bg-amber-100 rounded-lg p-2">
                <ClockIcon className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-steel-500 uppercase">Not Planned</p>
                <p className="text-xl font-bold text-amber-600">
                  {summaryStats.notPlanned.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div className="card p-4 border-l-4 border-l-blue-500">
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 rounded-lg p-2">
                <CalendarIcon className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-steel-500 uppercase">Planned</p>
                <p className="text-xl font-bold text-blue-600">
                  {summaryStats.planned.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div className="card p-4 border-l-4 border-l-green-500">
            <div className="flex items-center gap-3">
              <div className="bg-green-100 rounded-lg p-2">
                <CheckCircleIcon className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-steel-500 uppercase">Scheduled</p>
                <p className="text-xl font-bold text-green-600">
                  {summaryStats.scheduled.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Work Type Summary Cards */}
      {summaryStats && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
          {summaryStats.byWorkType.map((summary) => {
            const config = WORK_TYPE_CONFIG[summary.workType];
            const Icon = config.icon;
            const isFiltered = filters.workTypes.includes(summary.workType);

            return (
              <button
                key={summary.workType}
                onClick={() => toggleWorkTypeFilter(summary.workType)}
                className={`card p-3 text-left transition-all ${
                  isFiltered
                    ? `ring-2 ring-${config.color}-500 bg-${config.color}-50`
                    : 'hover:bg-steel-50'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`h-4 w-4 text-${config.color}-600`} />
                  <span className="text-xs font-medium text-steel-600">{config.label}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-lg font-bold text-steel-900">{summary.total}</span>
                  {summary.overdue > 0 && (
                    <span className="text-xs text-red-600 font-medium">
                      {summary.overdue} overdue
                    </span>
                  )}
                </div>
                <div className="text-xs text-steel-500">
                  {summary.notPlanned} not planned
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          {/* Year Selector */}
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-steel-500" />
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="input text-sm"
            >
              {[2024, 2025, 2026].map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-steel-400" />
            <input
              type="text"
              placeholder="Search car # or customer..."
              value={filters.searchQuery}
              onChange={(e) => setFilters((f) => ({ ...f, searchQuery: e.target.value }))}
              className="input pl-9 w-64"
            />
          </div>

          {/* Quick Filters */}
          <div className="flex items-center gap-2 border-l border-steel-200 pl-4">
            <button
              onClick={() =>
                setFilters((f) => ({
                  ...f,
                  isOverdue: f.isOverdue === true ? null : true,
                }))
              }
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filters.isOverdue === true
                  ? 'bg-red-100 text-red-700'
                  : 'bg-steel-100 text-steel-600 hover:bg-steel-200'
              }`}
            >
              Overdue Only
            </button>
            <button
              onClick={() =>
                setFilters((f) => ({
                  ...f,
                  planningStates: f.planningStates.includes('not_planned')
                    ? f.planningStates.filter((s) => s !== 'not_planned')
                    : ['not_planned'],
                }))
              }
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filters.planningStates.includes('not_planned')
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-steel-100 text-steel-600 hover:bg-steel-200'
              }`}
            >
              Not Planned Only
            </button>
            <button
              onClick={() =>
                setFilters((f) => ({
                  ...f,
                  isTankCar: f.isTankCar === true ? null : true,
                }))
              }
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filters.isTankCar === true
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-steel-100 text-steel-600 hover:bg-steel-200'
              }`}
            >
              Tank Cars Only
            </button>
          </div>

          {(filters.workTypes.length > 0 ||
            filters.planningStates.length > 0 ||
            filters.isOverdue !== null ||
            filters.searchQuery ||
            filters.isTankCar !== null) && (
            <button
              onClick={clearFilters}
              className="text-sm text-steel-500 hover:text-steel-700"
            >
              Clear Filters
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-steel-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grouped')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                viewMode === 'grouped'
                  ? 'bg-white text-steel-900 shadow-sm'
                  : 'text-steel-600 hover:text-steel-900'
              }`}
            >
              Grouped
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                viewMode === 'table'
                  ? 'bg-white text-steel-900 shadow-sm'
                  : 'text-steel-600 hover:text-steel-900'
              }`}
            >
              Table
            </button>
          </div>

          <button onClick={() => refetch()} className="btn-secondary flex items-center gap-2">
            <ArrowPathIcon className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Results Count */}
      <div className="mb-4 text-sm text-steel-600">
        Showing {filteredItems.length.toLocaleString()} of{' '}
        {demandRegister?.items.length.toLocaleString() || 0} items
      </div>

      {/* Grouped View */}
      {viewMode === 'grouped' && (
        <div className="space-y-4">
          {Array.from(groupedItems.entries()).map(([workType, items]) => {
            const config = WORK_TYPE_CONFIG[workType];
            const Icon = config.icon;
            const isExpanded = expandedSections.has(workType);
            const overdueCount = items.filter((i) => i.isOverdue).length;
            const notPlannedCount = items.filter(
              (i) => i.planningState === 'not_planned'
            ).length;

            return (
              <div key={workType} className="card overflow-hidden">
                {/* Section Header */}
                <button
                  onClick={() => toggleSection(workType)}
                  className={`w-full flex items-center justify-between px-4 py-3 bg-${config.color}-50 hover:bg-${config.color}-100 transition-colors`}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronUpIcon className="h-5 w-5 text-steel-500" />
                    ) : (
                      <ChevronDownIcon className="h-5 w-5 text-steel-500" />
                    )}
                    <Icon className={`h-5 w-5 text-${config.color}-600`} />
                    <span className="font-semibold text-steel-900">{config.label}</span>
                    <span className="text-steel-500">({items.length})</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    {overdueCount > 0 && (
                      <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded font-medium">
                        {overdueCount} Overdue
                      </span>
                    )}
                    {notPlannedCount > 0 && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">
                        {notPlannedCount} Not Planned
                      </span>
                    )}
                  </div>
                </button>

                {/* Section Content */}
                {isExpanded && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead className="bg-steel-100">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-steel-700 uppercase">
                            Railcar
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-steel-700 uppercase">
                            Customer
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-steel-700 uppercase">
                            Due Date
                          </th>
                          <th className="px-4 py-2 text-center text-xs font-semibold text-steel-700 uppercase">
                            Days
                          </th>
                          <th className="px-4 py-2 text-center text-xs font-semibold text-steel-700 uppercase">
                            Status
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-steel-700 uppercase">
                            Assigned Shop
                          </th>
                          <th className="px-4 py-2 text-center text-xs font-semibold text-steel-700 uppercase">
                            Type
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-steel-100">
                        {items.map((item) => {
                          const stateConfig = PLANNING_STATE_CONFIG[item.planningState];

                          return (
                            <tr
                              key={`${item.carId}-${item.workType}`}
                              className={`hover:bg-steel-50 ${
                                item.isOverdue ? 'bg-red-50' : ''
                              }`}
                            >
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => handleCarClick(item.railcarNumber)}
                                  className="font-medium text-rail-600 hover:text-rail-800 hover:underline"
                                >
                                  {item.railcarNumber}
                                </button>
                              </td>
                              <td className="px-4 py-3 text-sm text-steel-700">
                                {item.customer}
                                {item.isPriorityCustomer && (
                                  <span className="ml-2 px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">
                                    Priority
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-steel-700">
                                {item.dueDate
                                  ? new Date(item.dueDate).toLocaleDateString()
                                  : '-'}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-sm font-medium ${
                                    item.isOverdue
                                      ? 'bg-red-100 text-red-700'
                                      : item.daysUntilDue <= 30
                                      ? 'bg-amber-100 text-amber-700'
                                      : item.daysUntilDue <= 90
                                      ? 'bg-yellow-100 text-yellow-700'
                                      : 'bg-steel-100 text-steel-700'
                                  }`}
                                >
                                  {item.isOverdue
                                    ? `${Math.abs(item.daysUntilDue)}d late`
                                    : `${item.daysUntilDue}d`}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${stateConfig.bgColor} ${stateConfig.color}`}
                                >
                                  {stateConfig.label}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-steel-700">
                                {item.assignedShopName || (
                                  <span className="text-steel-400">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {item.isTankCar ? (
                                  <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded font-medium">
                                    Tank
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 text-xs bg-steel-100 text-steel-600 rounded">
                                    Freight
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {groupedItems.size === 0 && (
            <div className="card p-8 text-center">
              <p className="text-steel-500">No items match your filters.</p>
            </div>
          )}
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-steel-800 text-white">
                <tr>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold uppercase cursor-pointer hover:bg-steel-700"
                    onClick={() => handleSort('railcarNumber')}
                  >
                    Railcar{' '}
                    {sortField === 'railcarNumber' &&
                      (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold uppercase cursor-pointer hover:bg-steel-700"
                    onClick={() => handleSort('customer')}
                  >
                    Customer{' '}
                    {sortField === 'customer' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold uppercase cursor-pointer hover:bg-steel-700"
                    onClick={() => handleSort('workType')}
                  >
                    Work Type{' '}
                    {sortField === 'workType' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold uppercase cursor-pointer hover:bg-steel-700"
                    onClick={() => handleSort('dueDate')}
                  >
                    Due Date{' '}
                    {sortField === 'dueDate' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    className="px-4 py-3 text-center text-xs font-semibold uppercase cursor-pointer hover:bg-steel-700"
                    onClick={() => handleSort('daysUntilDue')}
                  >
                    Days{' '}
                    {sortField === 'daysUntilDue' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase">
                    Assigned Shop
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase">
                    Type
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {filteredItems.slice(0, 200).map((item) => {
                  const stateConfig = PLANNING_STATE_CONFIG[item.planningState];
                  const workTypeConfig = WORK_TYPE_CONFIG[item.workType];

                  return (
                    <tr
                      key={`${item.carId}-${item.workType}`}
                      className={`hover:bg-steel-50 ${item.isOverdue ? 'bg-red-50' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleCarClick(item.railcarNumber)}
                          className="font-medium text-rail-600 hover:text-rail-800 hover:underline"
                        >
                          {item.railcarNumber}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm text-steel-700">
                        {item.customer}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-${workTypeConfig.color}-100 text-${workTypeConfig.color}-700`}
                        >
                          {workTypeConfig.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-steel-700">
                        {item.dueDate
                          ? new Date(item.dueDate).toLocaleDateString()
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-sm font-medium ${
                            item.isOverdue
                              ? 'bg-red-100 text-red-700'
                              : item.daysUntilDue <= 30
                              ? 'bg-amber-100 text-amber-700'
                              : item.daysUntilDue <= 90
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-steel-100 text-steel-700'
                          }`}
                        >
                          {item.isOverdue
                            ? `${Math.abs(item.daysUntilDue)}d late`
                            : `${item.daysUntilDue}d`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${stateConfig.bgColor} ${stateConfig.color}`}
                        >
                          {stateConfig.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-steel-700">
                        {item.assignedShopName || (
                          <span className="text-steel-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {item.isTankCar ? (
                          <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded font-medium">
                            Tank
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 text-xs bg-steel-100 text-steel-600 rounded">
                            Freight
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredItems.length > 200 && (
              <div className="p-4 bg-steel-50 text-center text-sm text-steel-600">
                Showing first 200 of {filteredItems.length.toLocaleString()} items.
                Use filters to narrow results.
              </div>
            )}

            {filteredItems.length === 0 && (
              <div className="p-8 text-center">
                <p className="text-steel-500">No items match your filters.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
