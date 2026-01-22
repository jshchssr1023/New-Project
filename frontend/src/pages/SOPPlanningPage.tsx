/**
 * S&OP Planning Page - "The Plan"
 *
 * Monthly planning view showing 18-month horizon with allocations per network/shop.
 * Demand from the registry flows into the plan, constrained by supply capacity.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CalendarDaysIcon,
  CubeIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  AdjustmentsHorizontalIcon,
  BuildingStorefrontIcon,
  BuildingOffice2Icon,
  ClipboardDocumentListIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
} from '@heroicons/react/24/outline';
import { sopApi } from '../services/sopApi';
import { generate18MonthLabels } from '../utils/sopCalculations';
import { useShopNetworks } from '../hooks/useShopNetworks';

type ViewMode = 'summary' | 'detailed';

const MONTH_ABBREV = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// Helper to get utilization color class
function getUtilizationColor(utilization: number): string {
  if (utilization === 0) return 'bg-steel-100 text-steel-600';
  if (utilization < 50) return 'bg-blue-100 text-blue-800';
  if (utilization < 80) return 'bg-yellow-100 text-yellow-800';
  if (utilization <= 95) return 'bg-green-100 text-green-800';
  return 'bg-red-100 text-red-800';
}

// Helper to get status indicator
function getStatusIndicator(value: number, capacity: number) {
  const utilization = capacity > 0 ? (value / capacity) * 100 : 0;
  if (utilization <= 80) {
    return { icon: CheckCircleIcon, color: 'text-green-500', label: 'On Track' };
  }
  if (utilization <= 100) {
    return { icon: ArrowTrendingUpIcon, color: 'text-yellow-500', label: 'Near Capacity' };
  }
  return { icon: ExclamationTriangleIcon, color: 'text-red-500', label: 'Over Capacity' };
}

export default function SOPPlanningPage() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>('summary');
  const [expandedNetworks, setExpandedNetworks] = useState<Set<string>>(new Set(['aitx']));
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [visibleMonthStart, setVisibleMonthStart] = useState(0);

  // Load shop networks from API
  const {
    ALL_NETWORKS,
    AITX_NETWORK,
    THIRD_PARTY_NETWORKS,
    getSystemTotalCapacity,
    isLoading: networksLoading,
  } = useShopNetworks();

  // Generate 18-month labels starting from selected year
  const allMonths = useMemo(() => {
    return generate18MonthLabels(new Date(selectedYear, 0, 1));
  }, [selectedYear]);

  // Show 12 months at a time for better UX
  const visibleMonths = useMemo(() => {
    return allMonths.slice(visibleMonthStart, visibleMonthStart + 12);
  }, [allMonths, visibleMonthStart]);

  // Fetch S&OP plan summary
  const {
    data: planSummary,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['sop-plan-summary', selectedYear],
    queryFn: () => sopApi.planning.getPlanSummary(selectedYear),
  });

  // Get system capacity stats
  const systemCapacity = getSystemTotalCapacity();

  // Navigate months
  const canGoBack = visibleMonthStart > 0;
  const canGoForward = visibleMonthStart + 12 < allMonths.length;

  const goBack = () => {
    if (canGoBack) {
      setVisibleMonthStart((prev) => Math.max(0, prev - 6));
    }
  };

  const goForward = () => {
    if (canGoForward) {
      setVisibleMonthStart((prev) => Math.min(allMonths.length - 12, prev + 6));
    }
  };

  const toggleNetwork = (networkId: string) => {
    setExpandedNetworks((prev) => {
      const next = new Set(prev);
      if (next.has(networkId)) {
        next.delete(networkId);
      } else {
        next.add(networkId);
      }
      return next;
    });
  };

  // Calculate totals for visible months
  const visibleTotals = useMemo(() => {
    if (!planSummary) return null;

    let totalDemand = 0;
    let totalSupply = 0;
    let totalAllocated = 0;

    visibleMonths.forEach((month) => {
      totalDemand += planSummary.demandByMonth[month]?.total || 0;
      totalSupply += planSummary.supplyByMonth[month]?.total || 0;

      ALL_NETWORKS.forEach((network) => {
        totalAllocated +=
          planSummary.allocationsByNetwork[network.id]?.[month] || 0;
      });
    });

    return {
      totalDemand,
      totalSupply,
      totalAllocated,
      utilizationPercent:
        totalSupply > 0 ? Math.round((totalDemand / totalSupply) * 100) : 0,
    };
  }, [planSummary, visibleMonths]);

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
          <p className="text-red-800">Failed to load S&OP plan: {(error as Error).message}</p>
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
        <h1 className="text-2xl font-bold text-steel-900">S&OP Planning - The Plan</h1>
        <p className="text-steel-500 mt-1">
          18-month planning horizon showing demand allocation to networks, constrained by
          supply capacity.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="card p-4 border-l-4 border-l-rail-500">
          <div className="flex items-center gap-3">
            <div className="bg-rail-100 rounded-lg p-2">
              <ClipboardDocumentListIcon className="h-5 w-5 text-rail-600" />
            </div>
            <div>
              <p className="text-xs text-steel-500 uppercase">Total Demand</p>
              <p className="text-xl font-bold text-steel-900">
                {planSummary?.systemMetrics.totalAnnualDemand.toLocaleString() || 0}
              </p>
              <p className="text-xs text-steel-500">
                ~{Math.round(
                  (planSummary?.systemMetrics.totalAnnualDemand || 0) / 12
                )}/mo
              </p>
            </div>
          </div>
        </div>

        <div className="card p-4 border-l-4 border-l-blue-500">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 rounded-lg p-2">
              <CubeIcon className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-steel-500 uppercase">System Capacity</p>
              <p className="text-xl font-bold text-steel-900">
                {planSummary?.systemMetrics.totalSystemCapacity.toLocaleString() || 0}
              </p>
              <p className="text-xs text-steel-500">
                {systemCapacity.monthly}/mo
              </p>
            </div>
          </div>
        </div>

        <div className="card p-4 border-l-4 border-l-emerald-500">
          <div className="flex items-center gap-3">
            <div
              className={`rounded-lg p-2 ${
                (planSummary?.systemMetrics.capacitySurplusDeficit || 0) >= 0
                  ? 'bg-emerald-100'
                  : 'bg-red-100'
              }`}
            >
              {(planSummary?.systemMetrics.capacitySurplusDeficit || 0) >= 0 ? (
                <ArrowTrendingUpIcon className="h-5 w-5 text-emerald-600" />
              ) : (
                <ArrowTrendingDownIcon className="h-5 w-5 text-red-600" />
              )}
            </div>
            <div>
              <p className="text-xs text-steel-500 uppercase">
                {(planSummary?.systemMetrics.capacitySurplusDeficit || 0) >= 0
                  ? 'Surplus'
                  : 'Deficit'}
              </p>
              <p
                className={`text-xl font-bold ${
                  (planSummary?.systemMetrics.capacitySurplusDeficit || 0) >= 0
                    ? 'text-emerald-700'
                    : 'text-red-700'
                }`}
              >
                {Math.abs(
                  planSummary?.systemMetrics.capacitySurplusDeficit || 0
                ).toLocaleString()}
              </p>
              <p className="text-xs text-steel-500">
                {planSummary?.systemMetrics.capacityStatus}
              </p>
            </div>
          </div>
        </div>

        <div className="card p-4 border-l-4 border-l-amber-500">
          <div className="flex items-center gap-3">
            <div className="bg-amber-100 rounded-lg p-2">
              <AdjustmentsHorizontalIcon className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-steel-500 uppercase">Utilization</p>
              <p className="text-xl font-bold text-steel-900">
                {Math.round(
                  (planSummary?.systemMetrics.systemUtilizationRate || 0) * 100
                )}
                %
              </p>
              <p className="text-xs text-steel-500">
                {planSummary?.systemMetrics.utilizationStatus}
              </p>
            </div>
          </div>
        </div>

        <div className="card p-4 border-l-4 border-l-purple-500">
          <div className="flex items-center gap-3">
            <div className="bg-purple-100 rounded-lg p-2">
              <CalendarDaysIcon className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-steel-500 uppercase">Plan Year</p>
              <p className="text-xl font-bold text-steel-900">{selectedYear}</p>
              <p className="text-xs text-steel-500">18-month horizon</p>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between mb-6">
        {/* Year & Month Navigation */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedYear((y) => y - 1)}
              className="btn-secondary p-2"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 px-3 py-2 bg-steel-100 rounded-lg">
              <CalendarDaysIcon className="h-5 w-5 text-steel-500" />
              <span className="font-semibold text-steel-900">{selectedYear}</span>
            </div>
            <button
              onClick={() => setSelectedYear((y) => y + 1)}
              className="btn-secondary p-2"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Month Navigation */}
          <div className="flex items-center gap-2 border-l border-steel-200 pl-4">
            <button
              onClick={goBack}
              disabled={!canGoBack}
              className="btn-secondary p-2 disabled:opacity-50"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <span className="text-sm text-steel-600 min-w-[140px] text-center">
              {visibleMonths[0]} - {visibleMonths[visibleMonths.length - 1]}
            </span>
            <button
              onClick={goForward}
              disabled={!canGoForward}
              className="btn-secondary p-2 disabled:opacity-50"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-steel-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('summary')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                viewMode === 'summary'
                  ? 'bg-white text-steel-900 shadow-sm'
                  : 'text-steel-600 hover:text-steel-900'
              }`}
            >
              Summary View
            </button>
            <button
              onClick={() => setViewMode('detailed')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                viewMode === 'detailed'
                  ? 'bg-white text-steel-900 shadow-sm'
                  : 'text-steel-600 hover:text-steel-900'
              }`}
            >
              Network Detail
            </button>
          </div>

          <button onClick={() => refetch()} className="btn-secondary flex items-center gap-2">
            <ArrowPathIcon className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Planning Grid */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="bg-steel-800 text-white">
                <th className="sticky left-0 z-20 bg-steel-800 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider border-r border-steel-700 min-w-[200px]">
                  {viewMode === 'summary' ? 'Category' : 'Network / Shop'}
                </th>
                {visibleMonths.map((month) => (
                  <th
                    key={month}
                    className="px-2 py-3 text-center text-xs font-semibold uppercase tracking-wider min-w-[70px]"
                  >
                    {month}
                  </th>
                ))}
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider bg-steel-700 border-l border-steel-600 min-w-[80px]">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-200">
              {/* Summary View */}
              {viewMode === 'summary' && planSummary && (
                <>
                  {/* Demand Row */}
                  <tr className="bg-rail-50">
                    <td className="sticky left-0 z-10 bg-rail-50 px-4 py-3 border-r border-steel-200">
                      <div className="flex items-center gap-2">
                        <ClipboardDocumentListIcon className="h-4 w-4 text-rail-600" />
                        <span className="font-semibold text-rail-800">Total Demand</span>
                      </div>
                    </td>
                    {visibleMonths.map((month) => {
                      const demand = planSummary.demandByMonth[month]?.total || 0;
                      return (
                        <td key={month} className="px-2 py-3 text-center">
                          <span className="inline-block px-2 py-1 bg-rail-100 text-rail-800 rounded text-sm font-medium">
                            {demand}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-center bg-rail-100 border-l border-steel-200">
                      <span className="font-bold text-rail-900">
                        {visibleMonths.reduce(
                          (sum, m) => sum + (planSummary.demandByMonth[m]?.total || 0),
                          0
                        )}
                      </span>
                    </td>
                  </tr>

                  {/* Qualifications */}
                  <tr className="hover:bg-steel-50">
                    <td className="sticky left-0 z-10 bg-white px-4 py-2 pl-8 border-r border-steel-200 text-sm text-steel-600">
                      Qualifications
                    </td>
                    {visibleMonths.map((month) => (
                      <td key={month} className="px-2 py-2 text-center text-sm text-steel-600">
                        {planSummary.demandByMonth[month]?.qualifications || 0}
                      </td>
                    ))}
                    <td className="px-4 py-2 text-center bg-steel-50 border-l border-steel-200 text-sm">
                      {visibleMonths.reduce(
                        (sum, m) =>
                          sum + (planSummary.demandByMonth[m]?.qualifications || 0),
                        0
                      )}
                    </td>
                  </tr>

                  {/* Assignments */}
                  <tr className="hover:bg-steel-50">
                    <td className="sticky left-0 z-10 bg-white px-4 py-2 pl-8 border-r border-steel-200 text-sm text-steel-600">
                      Assignments
                    </td>
                    {visibleMonths.map((month) => (
                      <td key={month} className="px-2 py-2 text-center text-sm text-steel-600">
                        {planSummary.demandByMonth[month]?.assignments || 0}
                      </td>
                    ))}
                    <td className="px-4 py-2 text-center bg-steel-50 border-l border-steel-200 text-sm">
                      {visibleMonths.reduce(
                        (sum, m) =>
                          sum + (planSummary.demandByMonth[m]?.assignments || 0),
                        0
                      )}
                    </td>
                  </tr>

                  {/* Returns */}
                  <tr className="hover:bg-steel-50">
                    <td className="sticky left-0 z-10 bg-white px-4 py-2 pl-8 border-r border-steel-200 text-sm text-steel-600">
                      Returns
                    </td>
                    {visibleMonths.map((month) => (
                      <td key={month} className="px-2 py-2 text-center text-sm text-steel-600">
                        {planSummary.demandByMonth[month]?.returns || 0}
                      </td>
                    ))}
                    <td className="px-4 py-2 text-center bg-steel-50 border-l border-steel-200 text-sm">
                      {visibleMonths.reduce(
                        (sum, m) => sum + (planSummary.demandByMonth[m]?.returns || 0),
                        0
                      )}
                    </td>
                  </tr>

                  {/* Supply Row */}
                  <tr className="bg-blue-50">
                    <td className="sticky left-0 z-10 bg-blue-50 px-4 py-3 border-r border-steel-200">
                      <div className="flex items-center gap-2">
                        <CubeIcon className="h-4 w-4 text-blue-600" />
                        <span className="font-semibold text-blue-800">Total Supply</span>
                      </div>
                    </td>
                    {visibleMonths.map((month) => {
                      const supply = planSummary.supplyByMonth[month]?.total || 0;
                      return (
                        <td key={month} className="px-2 py-3 text-center">
                          <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium">
                            {supply}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-center bg-blue-100 border-l border-steel-200">
                      <span className="font-bold text-blue-900">
                        {visibleMonths.reduce(
                          (sum, m) => sum + (planSummary.supplyByMonth[m]?.total || 0),
                          0
                        )}
                      </span>
                    </td>
                  </tr>

                  {/* AITX Supply */}
                  <tr className="hover:bg-steel-50">
                    <td className="sticky left-0 z-10 bg-white px-4 py-2 pl-8 border-r border-steel-200 text-sm text-steel-600">
                      AITX Internal
                    </td>
                    {visibleMonths.map((month) => (
                      <td key={month} className="px-2 py-2 text-center text-sm text-steel-600">
                        {planSummary.supplyByMonth[month]?.aitx || 0}
                      </td>
                    ))}
                    <td className="px-4 py-2 text-center bg-steel-50 border-l border-steel-200 text-sm">
                      {visibleMonths.reduce(
                        (sum, m) => sum + (planSummary.supplyByMonth[m]?.aitx || 0),
                        0
                      )}
                    </td>
                  </tr>

                  {/* 3P Supply */}
                  <tr className="hover:bg-steel-50">
                    <td className="sticky left-0 z-10 bg-white px-4 py-2 pl-8 border-r border-steel-200 text-sm text-steel-600">
                      3rd Party
                    </td>
                    {visibleMonths.map((month) => (
                      <td key={month} className="px-2 py-2 text-center text-sm text-steel-600">
                        {planSummary.supplyByMonth[month]?.thirdParty || 0}
                      </td>
                    ))}
                    <td className="px-4 py-2 text-center bg-steel-50 border-l border-steel-200 text-sm">
                      {visibleMonths.reduce(
                        (sum, m) =>
                          sum + (planSummary.supplyByMonth[m]?.thirdParty || 0),
                        0
                      )}
                    </td>
                  </tr>

                  {/* Utilization Row */}
                  <tr className="bg-steel-100">
                    <td className="sticky left-0 z-10 bg-steel-100 px-4 py-3 border-r border-steel-200">
                      <span className="font-semibold text-steel-800">Utilization %</span>
                    </td>
                    {visibleMonths.map((month) => {
                      const demand = planSummary.demandByMonth[month]?.total || 0;
                      const supply = planSummary.supplyByMonth[month]?.total || 1;
                      const utilization = Math.round((demand / supply) * 100);
                      return (
                        <td key={month} className="px-2 py-3 text-center">
                          <span
                            className={`inline-block px-2 py-1 rounded text-sm font-medium ${getUtilizationColor(
                              utilization
                            )}`}
                          >
                            {utilization}%
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-center bg-steel-200 border-l border-steel-300">
                      <span className="font-bold text-steel-900">
                        {visibleTotals?.utilizationPercent || 0}%
                      </span>
                    </td>
                  </tr>
                </>
              )}

              {/* Detailed Network View */}
              {viewMode === 'detailed' &&
                planSummary &&
                ALL_NETWORKS.map((network) => {
                  const isExpanded = expandedNetworks.has(network.id);
                  const networkAllocations =
                    planSummary.allocationsByNetwork[network.id] || {};
                  const totalMonthlyCapacity = network.locations.reduce(
                    (sum, loc) => sum + loc.monthlyCapacity,
                    0
                  );

                  return (
                    <React.Fragment key={network.id}>
                      {/* Network Header Row */}
                      <tr
                        className={`cursor-pointer ${
                          network.isAitxInternal ? 'bg-blue-50' : 'bg-emerald-50'
                        } hover:bg-opacity-75`}
                        onClick={() => toggleNetwork(network.id)}
                      >
                        <td className="sticky left-0 z-10 px-4 py-3 border-r border-steel-200 bg-inherit">
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronDownIcon className="h-4 w-4 text-steel-500" />
                            ) : (
                              <ChevronUpIcon className="h-4 w-4 text-steel-500" />
                            )}
                            {network.isAitxInternal ? (
                              <BuildingStorefrontIcon className="h-4 w-4 text-blue-600" />
                            ) : (
                              <BuildingOffice2Icon className="h-4 w-4 text-emerald-600" />
                            )}
                            <span className="font-semibold text-steel-900">
                              {network.name}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 text-xs font-medium rounded ${
                                network.isAitxInternal
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {totalMonthlyCapacity}/mo
                            </span>
                          </div>
                        </td>
                        {visibleMonths.map((month) => {
                          const allocated = networkAllocations[month] || 0;
                          const utilization = Math.round(
                            (allocated / totalMonthlyCapacity) * 100
                          );
                          return (
                            <td key={month} className="px-2 py-3 text-center">
                              <span
                                className={`inline-block px-2 py-1 rounded text-sm font-medium ${
                                  network.isAitxInternal
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {allocated}
                              </span>
                            </td>
                          );
                        })}
                        <td
                          className={`px-4 py-3 text-center border-l border-steel-200 ${
                            network.isAitxInternal ? 'bg-blue-100' : 'bg-emerald-100'
                          }`}
                        >
                          <span className="font-bold text-steel-900">
                            {visibleMonths.reduce(
                              (sum, m) => sum + (networkAllocations[m] || 0),
                              0
                            )}
                          </span>
                        </td>
                      </tr>

                      {/* Location Rows */}
                      {isExpanded &&
                        network.locations.map((location) => (
                          <tr
                            key={location.code}
                            className="hover:bg-steel-50 text-sm"
                          >
                            <td className="sticky left-0 z-10 bg-white px-4 py-2 pl-10 border-r border-steel-200">
                              <div className="text-steel-700">{location.name}</div>
                              <div className="text-xs text-steel-500">
                                {location.city}, {location.state} |{' '}
                                {location.monthlyCapacity}/mo
                              </div>
                            </td>
                            {visibleMonths.map((month) => {
                              // Distribute network allocation proportionally to locations
                              const networkTotal = networkAllocations[month] || 0;
                              const locationShare =
                                totalMonthlyCapacity > 0
                                  ? location.monthlyCapacity / totalMonthlyCapacity
                                  : 0;
                              const locationAllocation = Math.round(
                                networkTotal * locationShare
                              );
                              const utilization =
                                location.monthlyCapacity > 0
                                  ? Math.round(
                                      (locationAllocation / location.monthlyCapacity) *
                                        100
                                    )
                                  : 0;
                              return (
                                <td key={month} className="px-2 py-2 text-center">
                                  <span
                                    className={`inline-block min-w-[2rem] px-1.5 py-0.5 rounded text-xs ${getUtilizationColor(
                                      utilization
                                    )}`}
                                  >
                                    {locationAllocation > 0 ? locationAllocation : '-'}
                                  </span>
                                </td>
                              );
                            })}
                            <td className="px-4 py-2 text-center bg-steel-50 border-l border-steel-200">
                              {visibleMonths.reduce((sum, month) => {
                                const networkTotal = networkAllocations[month] || 0;
                                const locationShare =
                                  totalMonthlyCapacity > 0
                                    ? location.monthlyCapacity / totalMonthlyCapacity
                                    : 0;
                                return sum + Math.round(networkTotal * locationShare);
                              }, 0)}
                            </td>
                          </tr>
                        ))}
                    </React.Fragment>
                  );
                })}
            </tbody>
            <tfoot>
              <tr className="bg-steel-800 text-white">
                <td className="sticky left-0 z-10 bg-steel-800 px-4 py-3 font-semibold border-r border-steel-700">
                  Grand Total
                </td>
                {visibleMonths.map((month) => {
                  const demand = planSummary?.demandByMonth[month]?.total || 0;
                  const supply = planSummary?.supplyByMonth[month]?.total || 0;
                  return (
                    <td key={month} className="px-2 py-3 text-center font-semibold">
                      {viewMode === 'summary' ? demand : supply}
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-center font-bold bg-steel-700 border-l border-steel-600">
                  {viewMode === 'summary'
                    ? visibleTotals?.totalDemand || 0
                    : visibleTotals?.totalSupply || 0}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-6 text-sm">
        <span className="text-steel-600 font-medium">Utilization:</span>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-steel-100 rounded border border-steel-200" />
          <span className="text-steel-600">Empty</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-blue-100 rounded border border-blue-300" />
          <span className="text-steel-600">&lt;50%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-yellow-100 rounded border border-yellow-300" />
          <span className="text-steel-600">50-79%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-green-100 rounded border border-green-300" />
          <span className="text-steel-600">80-95%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-red-100 rounded border border-red-400" />
          <span className="text-steel-600">&gt;95%</span>
        </div>
      </div>
    </div>
  );
}
