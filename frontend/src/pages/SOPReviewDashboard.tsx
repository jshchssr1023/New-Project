/**
 * S&OP Review Dashboard - Unified View
 *
 * Comprehensive S&OP dashboard combining:
 * - Executive summary with key metrics
 * - Cars planned vs not planned breakdown
 * - Volumes by month into each shop network
 * - Quick actions and drill-down navigation
 *
 * This is the primary S&OP view for executive review and planning status.
 */

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardDocumentListIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowPathIcon,
  CalendarDaysIcon,
  CubeIcon,
  ArrowTrendingUpIcon,
  BuildingStorefrontIcon,
  BuildingOffice2Icon,
  ChartBarIcon,
  FunnelIcon,
  DocumentChartBarIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import { sopApi } from '../services/sopApi';
import { useShopNetworks } from '../hooks/useShopNetworks';
import { generate18MonthLabels } from '../utils/sopCalculations';
import type { DemandRegister, WorkType, PlanningState } from '../types/sop';

// Status color helpers
function getStatusColor(type: 'good' | 'warning' | 'danger' | 'neutral') {
  switch (type) {
    case 'good':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'warning':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'danger':
      return 'bg-red-100 text-red-800 border-red-200';
    default:
      return 'bg-steel-100 text-steel-800 border-steel-200';
  }
}

function getUtilizationStatus(percent: number): 'good' | 'warning' | 'danger' | 'neutral' {
  if (percent < 50) return 'neutral';
  if (percent < 80) return 'good';
  if (percent <= 100) return 'warning';
  return 'danger';
}

// Work type labels
const WORK_TYPE_LABELS: Record<WorkType, string> = {
  qualification: 'Qualifications',
  full_qualification: 'Full Qualifications',
  partial_qualification: 'Partial Qualifications',
  assignment: 'Assignments',
  return: 'Returns',
  release: 'Releases',
  repair: 'Repairs',
  maintenance: 'Maintenance',
  project: 'Projects',
};

export default function SOPReviewDashboard() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [expandedNetworks, setExpandedNetworks] = useState<Set<string>>(new Set(['aitx']));
  const [showFilters, setShowFilters] = useState(false);

  // Load shop networks from API
  const {
    ALL_NETWORKS,
    AITX_NETWORK,
    THIRD_PARTY_NETWORKS,
    getSystemTotalCapacity,
    isLoading: networksLoading,
  } = useShopNetworks();

  // Generate month labels
  const monthLabels = useMemo(() => {
    return generate18MonthLabels(new Date(selectedYear, 0, 1)).slice(0, 12);
  }, [selectedYear]);

  // Fetch demand register
  const {
    data: demandRegister,
    isLoading: demandLoading,
    error: demandError,
    refetch: refetchDemand,
  } = useQuery({
    queryKey: ['sop-review-demand', selectedYear],
    queryFn: () => sopApi.demandRegistry.getDemandRegister(selectedYear, true),
  });

  // Fetch plan summary
  const {
    data: planSummary,
    isLoading: planLoading,
    error: planError,
    refetch: refetchPlan,
  } = useQuery({
    queryKey: ['sop-review-plan', selectedYear],
    queryFn: () => sopApi.planning.getPlanSummary(selectedYear),
  });

  // Fetch network hierarchy
  const {
    data: networkHierarchy,
    isLoading: networkLoading,
  } = useQuery({
    queryKey: ['sop-network-hierarchy'],
    queryFn: () => sopApi.supplyCapacity.getNetworkHierarchy(),
  });

  const isLoading = demandLoading || planLoading || networkLoading;
  const error = demandError || planError;

  const systemCapacity = getSystemTotalCapacity();

  // Calculate summary metrics
  const summaryMetrics = useMemo(() => {
    if (!demandRegister) {
      return {
        totalDemand: 0,
        notPlanned: 0,
        planned: 0,
        scheduled: 0,
        overdue: 0,
        notPlannedPercent: 0,
        plannedPercent: 0,
        scheduledPercent: 0,
      };
    }

    const total = demandRegister.items.length;
    return {
      totalDemand: total,
      notPlanned: demandRegister.totalNotPlanned,
      planned: demandRegister.totalPlanned,
      scheduled: demandRegister.totalScheduled,
      overdue: demandRegister.totalOverdue,
      notPlannedPercent: total > 0 ? Math.round((demandRegister.totalNotPlanned / total) * 100) : 0,
      plannedPercent: total > 0 ? Math.round((demandRegister.totalPlanned / total) * 100) : 0,
      scheduledPercent: total > 0 ? Math.round((demandRegister.totalScheduled / total) * 100) : 0,
    };
  }, [demandRegister]);

  // Calculate volumes by month by network
  const volumesByMonthNetwork = useMemo(() => {
    if (!planSummary) return {};

    const result: Record<string, Record<string, number>> = {};

    monthLabels.forEach((month) => {
      result[month] = {};
      ALL_NETWORKS.forEach((network) => {
        result[month][network.id] =
          planSummary.allocationsByNetwork[network.id]?.[month] || 0;
      });
      // Add totals
      result[month]['total'] = Object.values(result[month]).reduce((a, b) => a + b, 0);
      result[month]['aitx'] = planSummary.allocationsByNetwork['aitx']?.[month] || 0;
      result[month]['thirdParty'] = ALL_NETWORKS
        .filter((n) => !n.isAitxInternal)
        .reduce((sum, n) => sum + (planSummary.allocationsByNetwork[n.id]?.[month] || 0), 0);
    });

    return result;
  }, [planSummary, monthLabels]);

  // Toggle network expansion
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

  // Refresh all data
  const handleRefresh = () => {
    refetchDemand();
    refetchPlan();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-3 text-sm text-steel-500">Loading S&OP Dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-6 text-center">
        <ExclamationTriangleIcon className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-steel-900 mb-2">Failed to Load Dashboard</h3>
        <p className="text-sm text-steel-600 mb-4">
          {error instanceof Error ? error.message : 'An error occurred while loading the dashboard.'}
        </p>
        <button onClick={handleRefresh} className="btn-primary">
          <ArrowPathIcon className="h-4 w-4 mr-2" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-steel-900">S&OP Review Dashboard</h1>
          <p className="text-sm text-steel-500 mt-1">
            Sales & Operations Planning Overview for FY{selectedYear}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Year Selector */}
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
            className="input py-2"
          >
            {[currentYear - 1, currentYear, currentYear + 1].map((year) => (
              <option key={year} value={year}>
                FY {year}
              </option>
            ))}
          </select>

          <button
            onClick={handleRefresh}
            className="btn-secondary"
            title="Refresh data"
          >
            <ArrowPathIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Executive Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Demand */}
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-100 rounded-lg p-2">
              <ClipboardDocumentListIcon className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-steel-500 uppercase">Total Demand</p>
              <p className="text-2xl font-bold text-steel-900">{summaryMetrics.totalDemand.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Not Planned */}
        <div
          className="card p-4 cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-red-500"
          onClick={() => navigate('/demand-registry?filter=not_planned')}
        >
          <div className="flex items-center gap-3">
            <div className="bg-red-100 rounded-lg p-2">
              <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-steel-500 uppercase">Not Planned</p>
              <p className="text-2xl font-bold text-red-600">{summaryMetrics.notPlanned.toLocaleString()}</p>
              <p className="text-xs text-steel-400">{summaryMetrics.notPlannedPercent}% of total</p>
            </div>
          </div>
        </div>

        {/* Overdue */}
        <div
          className="card p-4 cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-amber-500"
          onClick={() => navigate('/demand-registry?filter=overdue')}
        >
          <div className="flex items-center gap-3">
            <div className="bg-amber-100 rounded-lg p-2">
              <ClockIcon className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-steel-500 uppercase">Overdue</p>
              <p className="text-2xl font-bold text-amber-600">{summaryMetrics.overdue.toLocaleString()}</p>
              <p className="text-xs text-steel-400">Past due date</p>
            </div>
          </div>
        </div>

        {/* Planned */}
        <div
          className="card p-4 cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-blue-500"
          onClick={() => navigate('/demand-registry?filter=planned')}
        >
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 rounded-lg p-2">
              <CubeIcon className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-steel-500 uppercase">Planned</p>
              <p className="text-2xl font-bold text-blue-600">{summaryMetrics.planned.toLocaleString()}</p>
              <p className="text-xs text-steel-400">{summaryMetrics.plannedPercent}% of total</p>
            </div>
          </div>
        </div>

        {/* Scheduled */}
        <div
          className="card p-4 cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-green-500"
          onClick={() => navigate('/demand-registry?filter=scheduled')}
        >
          <div className="flex items-center gap-3">
            <div className="bg-green-100 rounded-lg p-2">
              <CheckCircleIcon className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-steel-500 uppercase">Scheduled</p>
              <p className="text-2xl font-bold text-green-600">{summaryMetrics.scheduled.toLocaleString()}</p>
              <p className="text-xs text-steel-400">{summaryMetrics.scheduledPercent}% of total</p>
            </div>
          </div>
        </div>
      </div>

      {/* Planning Progress Bar */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-steel-900">Planning Progress</h3>
          <span className="text-sm text-steel-500">
            {summaryMetrics.plannedPercent + summaryMetrics.scheduledPercent}% cars have a plan
          </span>
        </div>
        <div className="h-8 bg-steel-100 rounded-full overflow-hidden flex">
          <div
            className="bg-green-500 flex items-center justify-center text-xs font-medium text-white"
            style={{ width: `${summaryMetrics.scheduledPercent}%` }}
          >
            {summaryMetrics.scheduledPercent > 10 && `${summaryMetrics.scheduledPercent}%`}
          </div>
          <div
            className="bg-blue-500 flex items-center justify-center text-xs font-medium text-white"
            style={{ width: `${summaryMetrics.plannedPercent}%` }}
          >
            {summaryMetrics.plannedPercent > 10 && `${summaryMetrics.plannedPercent}%`}
          </div>
          <div
            className="bg-red-500 flex items-center justify-center text-xs font-medium text-white"
            style={{ width: `${summaryMetrics.notPlannedPercent}%` }}
          >
            {summaryMetrics.notPlannedPercent > 10 && `${summaryMetrics.notPlannedPercent}%`}
          </div>
        </div>
        <div className="flex gap-4 mt-2 text-xs">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 bg-green-500 rounded-full"></span>
            Scheduled
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
            Planned
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 bg-red-500 rounded-full"></span>
            Not Planned
          </span>
        </div>
      </div>

      {/* Demand by Work Type */}
      {demandRegister && demandRegister.summaries.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-steel-900 flex items-center gap-2">
              <ChartBarIcon className="h-5 w-5 text-steel-600" />
              Demand by Work Type
            </h3>
            <button
              onClick={() => navigate('/demand-registry')}
              className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              View Details
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {demandRegister.summaries.map((summary) => (
              <div
                key={summary.workType}
                className="bg-steel-50 rounded-lg p-4 hover:bg-steel-100 cursor-pointer transition-colors"
                onClick={() => navigate(`/demand-registry?workType=${summary.workType}`)}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-steel-700">
                    {WORK_TYPE_LABELS[summary.workType] || summary.label}
                  </span>
                  <span className="text-xl font-bold text-steel-900">{summary.total}</span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-red-600">Not Planned:</span>
                    <span className="font-medium text-red-700">{summary.notPlanned}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-amber-600">Overdue:</span>
                    <span className="font-medium text-amber-700">{summary.overdue}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-green-600">Scheduled:</span>
                    <span className="font-medium text-green-700">{summary.scheduled}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* System Capacity Overview */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-steel-900 flex items-center gap-2">
            <BuildingStorefrontIcon className="h-5 w-5 text-steel-600" />
            System Capacity Overview
          </h3>
          <button
            onClick={() => navigate('/sop-capacity')}
            className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
          >
            Manage Capacity
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-steel-50 rounded-lg">
            <p className="text-xs text-steel-500 uppercase">Annual Capacity</p>
            <p className="text-2xl font-bold text-steel-900">{systemCapacity.annual.toLocaleString()}</p>
            <p className="text-xs text-steel-400">cars/year</p>
          </div>
          <div className="text-center p-3 bg-steel-50 rounded-lg">
            <p className="text-xs text-steel-500 uppercase">Monthly Capacity</p>
            <p className="text-2xl font-bold text-steel-900">{systemCapacity.monthly.toLocaleString()}</p>
            <p className="text-xs text-steel-400">cars/month</p>
          </div>
          <div className="text-center p-3 bg-indigo-50 rounded-lg">
            <p className="text-xs text-indigo-500 uppercase">AITX Internal</p>
            <p className="text-2xl font-bold text-indigo-900">{systemCapacity.aitxPercent}%</p>
            <p className="text-xs text-indigo-400">of capacity</p>
          </div>
          <div className="text-center p-3 bg-purple-50 rounded-lg">
            <p className="text-xs text-purple-500 uppercase">3rd Party</p>
            <p className="text-2xl font-bold text-purple-900">{systemCapacity.thirdPartyPercent}%</p>
            <p className="text-xs text-purple-400">of capacity</p>
          </div>
        </div>

        {/* Utilization */}
        {planSummary && (
          <div className="mt-4 pt-4 border-t border-steel-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-steel-600">System Utilization</span>
              <span
                className={`text-sm font-medium px-2 py-0.5 rounded ${getStatusColor(
                  getUtilizationStatus(planSummary.capacityUtilization)
                )}`}
              >
                {planSummary.capacityUtilization.toFixed(1)}%
              </span>
            </div>
            <div className="h-3 bg-steel-100 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  planSummary.capacityUtilization > 100
                    ? 'bg-red-500'
                    : planSummary.capacityUtilization > 80
                    ? 'bg-amber-500'
                    : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(planSummary.capacityUtilization, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Volumes by Month by Network */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-steel-900 flex items-center gap-2">
            <CalendarDaysIcon className="h-5 w-5 text-steel-600" />
            Volumes by Month - Shop Network Allocation
          </h3>
          <button
            onClick={() => navigate('/sop-plan')}
            className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
          >
            View Full Plan
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-steel-200">
                <th className="text-left py-2 px-2 text-xs font-medium text-steel-500 uppercase min-w-[200px]">
                  Network / Shop
                </th>
                {monthLabels.map((month) => (
                  <th
                    key={month}
                    className="text-center py-2 px-2 text-xs font-medium text-steel-500 uppercase"
                  >
                    {month}
                  </th>
                ))}
                <th className="text-center py-2 px-2 text-xs font-medium text-steel-500 uppercase bg-steel-50">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Demand Row */}
              {planSummary && (
                <tr className="border-b border-steel-100 bg-indigo-50">
                  <td className="py-2 px-2 font-medium text-indigo-700">Demand</td>
                  {monthLabels.map((month) => (
                    <td key={month} className="text-center py-2 px-2 font-medium text-indigo-900">
                      {planSummary.demandByMonth[month]?.total || 0}
                    </td>
                  ))}
                  <td className="text-center py-2 px-2 font-bold text-indigo-900 bg-indigo-100">
                    {Object.values(planSummary.demandByMonth).reduce((sum, m) => sum + m.total, 0)}
                  </td>
                </tr>
              )}

              {/* AITX Network */}
              <tr
                className="border-b border-steel-100 bg-rail-50 cursor-pointer hover:bg-rail-100"
                onClick={() => toggleNetwork('aitx')}
              >
                <td className="py-2 px-2 font-medium text-rail-700 flex items-center gap-2">
                  {expandedNetworks.has('aitx') ? (
                    <ChevronDownIcon className="h-4 w-4" />
                  ) : (
                    <ChevronRightIcon className="h-4 w-4" />
                  )}
                  <BuildingOffice2Icon className="h-4 w-4" />
                  AITX Internal
                </td>
                {monthLabels.map((month) => (
                  <td key={month} className="text-center py-2 px-2 text-rail-700">
                    {volumesByMonthNetwork[month]?.['aitx'] || 0}
                  </td>
                ))}
                <td className="text-center py-2 px-2 font-bold text-rail-900 bg-rail-100">
                  {monthLabels.reduce((sum, month) => sum + (volumesByMonthNetwork[month]?.['aitx'] || 0), 0)}
                </td>
              </tr>

              {/* AITX Locations (when expanded) */}
              {expandedNetworks.has('aitx') &&
                AITX_NETWORK.locations.map((location) => (
                  <tr key={location.code} className="border-b border-steel-50 bg-steel-50">
                    <td className="py-1.5 px-2 pl-10 text-xs text-steel-600">
                      {location.city}, {location.state}
                    </td>
                    {monthLabels.map((month) => (
                      <td key={month} className="text-center py-1.5 px-2 text-xs text-steel-500">
                        -
                      </td>
                    ))}
                    <td className="text-center py-1.5 px-2 text-xs text-steel-600 bg-steel-100">
                      {location.monthlyCapacity * 12}
                    </td>
                  </tr>
                ))}

              {/* 3rd Party Networks */}
              {THIRD_PARTY_NETWORKS.map((network) => (
                <>
                  <tr
                    key={network.id}
                    className="border-b border-steel-100 cursor-pointer hover:bg-purple-50"
                    onClick={() => toggleNetwork(network.id)}
                  >
                    <td className="py-2 px-2 font-medium text-steel-700 flex items-center gap-2">
                      {expandedNetworks.has(network.id) ? (
                        <ChevronDownIcon className="h-4 w-4" />
                      ) : (
                        <ChevronRightIcon className="h-4 w-4" />
                      )}
                      <BuildingStorefrontIcon className="h-4 w-4 text-purple-600" />
                      {network.name}
                    </td>
                    {monthLabels.map((month) => (
                      <td key={month} className="text-center py-2 px-2 text-steel-600">
                        {planSummary?.allocationsByNetwork[network.id]?.[month] || 0}
                      </td>
                    ))}
                    <td className="text-center py-2 px-2 font-bold text-steel-900 bg-steel-100">
                      {monthLabels.reduce(
                        (sum, month) =>
                          sum + (planSummary?.allocationsByNetwork[network.id]?.[month] || 0),
                        0
                      )}
                    </td>
                  </tr>

                  {/* Network Locations (when expanded) */}
                  {expandedNetworks.has(network.id) &&
                    network.locations.map((location) => (
                      <tr key={location.code} className="border-b border-steel-50 bg-steel-50">
                        <td className="py-1.5 px-2 pl-10 text-xs text-steel-600">
                          {location.city}, {location.state}
                        </td>
                        {monthLabels.map((month) => (
                          <td key={month} className="text-center py-1.5 px-2 text-xs text-steel-500">
                            -
                          </td>
                        ))}
                        <td className="text-center py-1.5 px-2 text-xs text-steel-600 bg-steel-100">
                          {location.monthlyCapacity * 12}
                        </td>
                      </tr>
                    ))}
                </>
              ))}

              {/* Total Row */}
              {planSummary && (
                <tr className="border-t-2 border-steel-300 bg-steel-100 font-bold">
                  <td className="py-2 px-2 text-steel-900">Total Allocated</td>
                  {monthLabels.map((month) => {
                    const total = ALL_NETWORKS.reduce(
                      (sum, network) =>
                        sum + (planSummary.allocationsByNetwork[network.id]?.[month] || 0),
                      0
                    );
                    return (
                      <td key={month} className="text-center py-2 px-2 text-steel-900">
                        {total}
                      </td>
                    );
                  })}
                  <td className="text-center py-2 px-2 text-steel-900 bg-steel-200">
                    {monthLabels.reduce((grandTotal, month) => {
                      return (
                        grandTotal +
                        ALL_NETWORKS.reduce(
                          (sum, network) =>
                            sum + (planSummary.allocationsByNetwork[network.id]?.[month] || 0),
                          0
                        )
                      );
                    }, 0)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={() => navigate('/demand-registry')}
          className="card p-4 text-left hover:shadow-md transition-shadow group"
        >
          <ClipboardDocumentListIcon className="h-8 w-8 text-indigo-500 mb-2 group-hover:scale-110 transition-transform" />
          <h4 className="font-semibold text-steel-900">Demand Registry</h4>
          <p className="text-xs text-steel-500 mt-1">View and manage car demand</p>
        </button>

        <button
          onClick={() => navigate('/sop-capacity')}
          className="card p-4 text-left hover:shadow-md transition-shadow group"
        >
          <BuildingStorefrontIcon className="h-8 w-8 text-purple-500 mb-2 group-hover:scale-110 transition-transform" />
          <h4 className="font-semibold text-steel-900">Supply Capacity</h4>
          <p className="text-xs text-steel-500 mt-1">Manage shop network capacity</p>
        </button>

        <button
          onClick={() => navigate('/sop-plan')}
          className="card p-4 text-left hover:shadow-md transition-shadow group"
        >
          <CalendarDaysIcon className="h-8 w-8 text-green-500 mb-2 group-hover:scale-110 transition-transform" />
          <h4 className="font-semibold text-steel-900">Monthly Planning</h4>
          <p className="text-xs text-steel-500 mt-1">18-month allocation view</p>
        </button>

        <button
          onClick={() => navigate('/car-flow')}
          className="card p-4 text-left hover:shadow-md transition-shadow group"
        >
          <ArrowTrendingUpIcon className="h-8 w-8 text-amber-500 mb-2 group-hover:scale-110 transition-transform" />
          <h4 className="font-semibold text-steel-900">Car Flow Planning</h4>
          <p className="text-xs text-steel-500 mt-1">Commit cars to shops</p>
        </button>
      </div>
    </div>
  );
}
