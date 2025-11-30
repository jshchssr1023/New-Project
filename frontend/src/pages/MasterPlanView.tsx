/**
 * MasterPlanView.tsx - Read-only MasterPlan visualization page
 *
 * Displays the active MasterPlan with:
 * - Gantt-style timeline view of all commitments
 * - Shop loading/capacity bars
 * - Export PDF button for customer-ready documents
 * - Summary statistics
 */

import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  CalendarIcon,
  BuildingStorefrontIcon,
  TruckIcon,
  ChartBarIcon,
  CheckCircleIcon,
  ClockIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import { useActiveMasterPlan, useMasterPlan, useMasterPlanSummary } from '../hooks/useQueryWithCompany';
import ExportPdfButton from '../components/ExportPdfButton';
import type { MasterPlanCommitment, CommitmentStatus } from '../types';

// Status badge colors and labels
const statusConfig: Record<CommitmentStatus, { label: string; color: string; bgColor: string }> = {
  committed: { label: 'Committed', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  scheduled: { label: 'Scheduled', color: 'text-indigo-700', bgColor: 'bg-indigo-100' },
  in_transit: { label: 'In Transit', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  arrived: { label: 'Arrived', color: 'text-orange-700', bgColor: 'bg-orange-100' },
  in_progress: { label: 'In Progress', color: 'text-purple-700', bgColor: 'bg-purple-100' },
  released: { label: 'Released', color: 'text-green-700', bgColor: 'bg-green-100' },
};

// Priority labels
const priorityLabels: Record<number, { label: string; color: string }> = {
  1: { label: 'Critical', color: 'text-red-600' },
  2: { label: 'High', color: 'text-orange-600' },
  3: { label: 'Medium', color: 'text-yellow-600' },
  4: { label: 'Low', color: 'text-blue-600' },
  5: { label: 'Deferred', color: 'text-gray-500' },
};

// Work type colors for Gantt bars
const workTypeColors: Record<string, string> = {
  qualification: 'bg-indigo-500',
  assignment: 'bg-emerald-500',
  return: 'bg-amber-500',
  repair: 'bg-red-500',
  maintenance: 'bg-purple-500',
};

export default function MasterPlanView() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  // Fetch active plan if no ID provided, otherwise fetch specific plan
  const { data: activePlan, isLoading: isLoadingActive, error: activeError } = useActiveMasterPlan({
    enabled: !id,
  });

  const { data: specificPlan, isLoading: isLoadingSpecific, error: specificError } = useMasterPlan(id, {
    enabled: !!id,
  });

  const masterPlan = id ? specificPlan : activePlan;
  const isLoading = id ? isLoadingSpecific : isLoadingActive;
  const error = id ? specificError : activeError;

  const { data: summary } = useMasterPlanSummary(masterPlan?.id);

  // Filters
  const [selectedShop, setSelectedShop] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'gantt' | 'table'>('gantt');

  // Get unique shops, customers, and months from commitments
  const { shops, customers, months, filteredCommitments } = useMemo(() => {
    if (!masterPlan?.commitments) {
      return { shops: [], customers: [], months: [], filteredCommitments: [] };
    }

    const shopMap = new Map<string, { id: string; name: string; code: string }>();
    const customerMap = new Map<string, { id: string; name: string; code: string }>();
    const monthSet = new Set<string>();

    masterPlan.commitments.forEach((c) => {
      shopMap.set(c.shopId, c.shop);
      customerMap.set(c.customerId, c.customer);
      monthSet.add(c.scheduledMonth);
    });

    const allMonths = Array.from(monthSet).sort();

    // Filter commitments
    let filtered = masterPlan.commitments;
    if (selectedShop !== 'all') {
      filtered = filtered.filter((c) => c.shopId === selectedShop);
    }
    if (selectedStatus !== 'all') {
      filtered = filtered.filter((c) => c.status === selectedStatus);
    }
    if (selectedCustomer !== 'all') {
      filtered = filtered.filter((c) => c.customerId === selectedCustomer);
    }

    return {
      shops: Array.from(shopMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
      customers: Array.from(customerMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
      months: allMonths,
      filteredCommitments: filtered,
    };
  }, [masterPlan, selectedShop, selectedStatus, selectedCustomer]);

  // Group commitments by shop for Gantt view
  const commitmentsByShop = useMemo(() => {
    const map = new Map<string, MasterPlanCommitment[]>();
    filteredCommitments.forEach((c) => {
      if (!map.has(c.shopId)) {
        map.set(c.shopId, []);
      }
      map.get(c.shopId)!.push(c);
    });
    return map;
  }, [filteredCommitments]);

  // Calculate shop loading percentages
  const shopLoading = useMemo(() => {
    const loading: Record<string, Record<string, number>> = {};

    if (!masterPlan?.commitments) return loading;

    masterPlan.commitments.forEach((c) => {
      if (!loading[c.shopId]) {
        loading[c.shopId] = {};
      }
      loading[c.shopId][c.scheduledMonth] = (loading[c.shopId][c.scheduledMonth] || 0) + 1;
    });

    return loading;
  }, [masterPlan]);

  // Format month for display
  const formatMonth = (monthKey: string) => {
    const [year, month] = monthKey.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  };

  // Parse work types from JSON string
  const parseWorkTypes = (workTypesJson: string): string[] => {
    try {
      return JSON.parse(workTypesJson);
    } catch {
      return [workTypesJson];
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rail-600 mx-auto"></div>
          <p className="mt-4 text-steel-600">Loading Master Plan...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    const is404 = (error as any)?.response?.status === 404;
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center max-w-md">
          <ExclamationTriangleIcon className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-steel-900 mb-2">
            {is404 ? 'No Active Master Plan' : 'Error Loading Plan'}
          </h2>
          <p className="text-steel-600 mb-4">
            {is404
              ? 'There is no active master plan for your organization. Create one by approving a scenario in Car Flow Planning.'
              : 'Failed to load the master plan. Please try again.'}
          </p>
          <button
            onClick={() => navigate('/car-flow')}
            className="btn-primary"
          >
            Go to Car Flow Planning
          </button>
        </div>
      </div>
    );
  }

  // No plan found
  if (!masterPlan) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <CalendarIcon className="h-12 w-12 text-steel-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-steel-900 mb-2">No Master Plan Found</h2>
          <p className="text-steel-600">The requested master plan could not be found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-6 w-6 text-rail-600" />
            <h1 className="text-xl font-bold text-steel-900">{masterPlan.planName}</h1>
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
              masterPlan.status === 'active' ? 'bg-green-100 text-green-700' :
              masterPlan.status === 'approved' ? 'bg-blue-100 text-blue-700' :
              masterPlan.status === 'draft' ? 'bg-gray-100 text-gray-700' :
              'bg-amber-100 text-amber-700'
            }`}>
              {masterPlan.status.charAt(0).toUpperCase() + masterPlan.status.slice(1)}
            </span>
          </div>
          <p className="text-sm text-steel-500 mt-1">
            FY{masterPlan.fiscalYear} v{masterPlan.version} | {masterPlan.commitments?.length || 0} commitments |{' '}
            {formatMonth(masterPlan.validFrom.split('T')[0].slice(0, 7))} - {formatMonth(masterPlan.validTo.split('T')[0].slice(0, 7))}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex bg-steel-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('gantt')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === 'gantt' ? 'bg-white text-steel-900 shadow-sm' : 'text-steel-600 hover:text-steel-900'
              }`}
            >
              <ChartBarIcon className="h-4 w-4 inline-block mr-1" />
              Gantt
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === 'table' ? 'bg-white text-steel-900 shadow-sm' : 'text-steel-600 hover:text-steel-900'
              }`}
            >
              <TruckIcon className="h-4 w-4 inline-block mr-1" />
              Table
            </button>
          </div>

          {/* Export PDF Button */}
          <ExportPdfButton masterPlan={masterPlan} />
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="card p-3">
          <div className="flex items-center gap-2">
            <TruckIcon className="h-5 w-5 text-rail-500" />
            <div>
              <p className="text-xs text-steel-500">Total Cars</p>
              <p className="text-lg font-bold text-steel-900">{summary?.totalCommitments || filteredCommitments.length}</p>
            </div>
          </div>
        </div>
        <div className="card p-3">
          <div className="flex items-center gap-2">
            <BuildingStorefrontIcon className="h-5 w-5 text-emerald-500" />
            <div>
              <p className="text-xs text-steel-500">Shops</p>
              <p className="text-lg font-bold text-steel-900">{shops.length}</p>
            </div>
          </div>
        </div>
        <div className="card p-3">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-indigo-500" />
            <div>
              <p className="text-xs text-steel-500">Months</p>
              <p className="text-lg font-bold text-steel-900">{months.length}</p>
            </div>
          </div>
        </div>
        <div className="card p-3">
          <div className="flex items-center gap-2">
            <CheckCircleIcon className="h-5 w-5 text-green-500" />
            <div>
              <p className="text-xs text-steel-500">Released</p>
              <p className="text-lg font-bold text-steel-900">
                {summary?.commitmentsByStatus?.released || masterPlan.commitments?.filter(c => c.status === 'released').length || 0}
              </p>
            </div>
          </div>
        </div>
        <div className="card p-3">
          <div className="flex items-center gap-2">
            <ArrowPathIcon className="h-5 w-5 text-purple-500" />
            <div>
              <p className="text-xs text-steel-500">In Progress</p>
              <p className="text-lg font-bold text-steel-900">
                {summary?.commitmentsByStatus?.in_progress || masterPlan.commitments?.filter(c => c.status === 'in_progress').length || 0}
              </p>
            </div>
          </div>
        </div>
        <div className="card p-3">
          <div className="flex items-center gap-2">
            <ClockIcon className="h-5 w-5 text-amber-500" />
            <div>
              <p className="text-xs text-steel-500">Scheduled</p>
              <p className="text-lg font-bold text-steel-900">
                {summary?.commitmentsByStatus?.scheduled || masterPlan.commitments?.filter(c => c.status === 'scheduled').length || 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <FunnelIcon className="h-4 w-4 text-steel-400" />
            <span className="text-sm font-medium text-steel-600">Filters:</span>
          </div>

          <select
            value={selectedShop}
            onChange={(e) => setSelectedShop(e.target.value)}
            className="input text-sm py-1.5"
          >
            <option value="all">All Shops</option>
            {shops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.name} ({shop.code})
              </option>
            ))}
          </select>

          <select
            value={selectedCustomer}
            onChange={(e) => setSelectedCustomer(e.target.value)}
            className="input text-sm py-1.5"
          >
            <option value="all">All Customers</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="input text-sm py-1.5"
          >
            <option value="all">All Statuses</option>
            {Object.entries(statusConfig).map(([key, config]) => (
              <option key={key} value={key}>
                {config.label}
              </option>
            ))}
          </select>

          {(selectedShop !== 'all' || selectedStatus !== 'all' || selectedCustomer !== 'all') && (
            <button
              onClick={() => {
                setSelectedShop('all');
                setSelectedStatus('all');
                setSelectedCustomer('all');
              }}
              className="text-sm text-rail-600 hover:text-rail-800"
            >
              Clear filters
            </button>
          )}

          <span className="text-sm text-steel-500 ml-auto">
            Showing {filteredCommitments.length} of {masterPlan.commitments?.length || 0} commitments
          </span>
        </div>
      </div>

      {/* Gantt View */}
      {viewMode === 'gantt' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="bg-steel-50 border-b border-steel-200">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-steel-600 uppercase sticky left-0 bg-steel-50 z-10 w-48">
                    Shop
                  </th>
                  {months.map((month) => (
                    <th
                      key={month}
                      className="text-center py-3 px-2 text-xs font-semibold text-steel-600 uppercase min-w-[100px]"
                    >
                      {formatMonth(month)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {shops.map((shop) => {
                  const shopCommitments = commitmentsByShop.get(shop.id) || [];
                  if (shopCommitments.length === 0) return null;

                  return (
                    <tr key={shop.id} className="hover:bg-steel-50/50">
                      <td className="py-3 px-4 sticky left-0 bg-white z-10 border-r border-steel-100">
                        <div className="flex flex-col">
                          <span className="font-medium text-steel-900">{shop.name}</span>
                          <span className="text-xs text-steel-500">{shop.code}</span>
                        </div>
                      </td>
                      {months.map((month) => {
                        const monthCommitments = shopCommitments.filter(
                          (c) => c.scheduledMonth === month
                        );
                        const count = shopLoading[shop.id]?.[month] || 0;

                        return (
                          <td key={month} className="py-2 px-2 align-top">
                            {monthCommitments.length > 0 ? (
                              <div className="space-y-1">
                                {/* Capacity bar */}
                                <div className="h-1.5 bg-steel-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      count > 10 ? 'bg-red-500' :
                                      count > 5 ? 'bg-amber-500' :
                                      'bg-green-500'
                                    }`}
                                    style={{ width: `${Math.min((count / 15) * 100, 100)}%` }}
                                  />
                                </div>
                                {/* Commitment chips */}
                                <div className="flex flex-wrap gap-1">
                                  {monthCommitments.slice(0, 3).map((c) => {
                                    const workTypes = parseWorkTypes(c.workTypes);
                                    const primaryType = workTypes[0] || 'qualification';
                                    return (
                                      <div
                                        key={c.id}
                                        className={`text-xs px-1.5 py-0.5 rounded text-white truncate max-w-[80px] ${
                                          workTypeColors[primaryType] || 'bg-gray-500'
                                        }`}
                                        title={`${c.car.railcarNumber} - ${c.customer.name}`}
                                      >
                                        {c.car.railcarNumber}
                                      </div>
                                    );
                                  })}
                                  {monthCommitments.length > 3 && (
                                    <span className="text-xs text-steel-500">
                                      +{monthCommitments.length - 3}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="h-8" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="border-t border-steel-200 p-3 bg-steel-50">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <span className="font-medium text-steel-600">Work Types:</span>
              {Object.entries(workTypeColors).map(([type, color]) => (
                <div key={type} className="flex items-center gap-1">
                  <div className={`w-3 h-3 rounded ${color}`} />
                  <span className="text-steel-600 capitalize">{type}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-steel-50 border-b border-steel-200">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-steel-600 uppercase">Railcar #</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-steel-600 uppercase">Customer</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-steel-600 uppercase">Shop</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-steel-600 uppercase">Month</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-steel-600 uppercase">Work Type</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-steel-600 uppercase">Priority</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-steel-600 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {filteredCommitments.map((commitment) => {
                  const workTypes = parseWorkTypes(commitment.workTypes);
                  const status = statusConfig[commitment.status];
                  const priority = priorityLabels[commitment.priority];

                  return (
                    <tr key={commitment.id} className="hover:bg-steel-50">
                      <td className="py-3 px-4">
                        <span className="font-medium text-steel-900">{commitment.car.railcarNumber}</span>
                        {commitment.isBundled && (
                          <span className="ml-1 text-xs text-indigo-600">(bundled)</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-steel-700">{commitment.customer.name}</td>
                      <td className="py-3 px-4">
                        <div>
                          <span className="text-steel-900">{commitment.shop.name}</span>
                          <span className="text-xs text-steel-500 ml-1">({commitment.shop.code})</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-steel-700">{formatMonth(commitment.scheduledMonth)}</td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {workTypes.map((wt, i) => (
                            <span
                              key={i}
                              className={`px-1.5 py-0.5 text-xs rounded text-white capitalize ${
                                workTypeColors[wt] || 'bg-gray-500'
                              }`}
                            >
                              {wt}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-sm font-medium ${priority?.color || 'text-steel-600'}`}>
                          {priority?.label || `P${commitment.priority}`}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${status?.bgColor} ${status?.color}`}>
                          {status?.label || commitment.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredCommitments.length === 0 && (
            <div className="py-12 text-center">
              <TruckIcon className="h-12 w-12 text-steel-300 mx-auto mb-4" />
              <p className="text-steel-500">No commitments match your filters</p>
            </div>
          )}
        </div>
      )}

      {/* Shop Loading Summary */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-steel-900 mb-3 flex items-center gap-2">
          <ChartBarIcon className="h-5 w-5 text-rail-500" />
          Shop Loading Overview
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {shops.slice(0, 6).map((shop) => {
            const shopTotal = Object.values(shopLoading[shop.id] || {}).reduce((a, b) => a + b, 0);
            const monthlyAvg = months.length > 0 ? shopTotal / months.length : 0;

            return (
              <div key={shop.id} className="bg-steel-50 rounded-lg p-3">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-medium text-steel-900">{shop.name}</p>
                    <p className="text-xs text-steel-500">{shop.code}</p>
                  </div>
                  <span className="text-lg font-bold text-steel-900">{shopTotal}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-steel-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        monthlyAvg > 10 ? 'bg-red-500' :
                        monthlyAvg > 5 ? 'bg-amber-500' :
                        'bg-green-500'
                      }`}
                      style={{ width: `${Math.min((shopTotal / (months.length * 15)) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-steel-500">{monthlyAvg.toFixed(1)}/mo</span>
                </div>
              </div>
            );
          })}
        </div>
        {shops.length > 6 && (
          <p className="text-sm text-steel-500 mt-3 text-center">
            +{shops.length - 6} more shops
          </p>
        )}
      </div>
    </div>
  );
}
