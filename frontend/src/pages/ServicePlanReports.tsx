/**
 * ServicePlanReports.tsx - Service Plan Reporting Dashboard
 *
 * Story 8: Visibility & Reporting
 * Provides views for:
 * - All Confirmed Plans
 * - All Pending/Draft Plans
 * - Filters by Customer, Month, Planner, Shop
 * - Plan details and scheduling status
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FunnelIcon,
  DocumentTextIcon,
  ClockIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  ChevronRightIcon,
  UserIcon,
  BuildingOfficeIcon,
  CalendarIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';
import {
  servicePlansApi,
  ServicePlan,
  PlanReportFilters,
} from '../services/api/servicePlans';

// Tab types
type ReportTab = 'confirmed' | 'pending';

export default function ServicePlanReports() {
  const navigate = useNavigate();

  // State
  const [activeTab, setActiveTab] = useState<ReportTab>('confirmed');
  const [confirmedPlans, setConfirmedPlans] = useState<ServicePlan[]>([]);
  const [pendingPlans, setPendingPlans] = useState<ServicePlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Filters
  const [filters, setFilters] = useState<PlanReportFilters>({});
  const [showFilters, setShowFilters] = useState(false);

  // Load confirmed plans
  const loadConfirmedPlans = useCallback(async () => {
    try {
      const plans = await servicePlansApi.getConfirmedPlans(filters);
      setConfirmedPlans(plans);
    } catch (err: any) {
      console.error('Failed to load confirmed plans:', err);
    }
  }, [filters]);

  // Load pending plans
  const loadPendingPlans = useCallback(async () => {
    try {
      const plans = await servicePlansApi.getPendingPlans(filters);
      setPendingPlans(plans);
    } catch (err: any) {
      console.error('Failed to load pending plans:', err);
    }
  }, [filters]);

  // Load all data
  const loadAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await Promise.all([loadConfirmedPlans(), loadPendingPlans()]);
    } catch (err: any) {
      setError('Failed to load plans');
    } finally {
      setIsLoading(false);
    }
  }, [loadConfirmedPlans, loadPendingPlans]);

  // Initial load
  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Get filtered plans based on search
  const getFilteredPlans = (plans: ServicePlan[]) => {
    if (!searchQuery) return plans;

    const query = searchQuery.toLowerCase();
    return plans.filter(
      (plan) =>
        plan.name.toLowerCase().includes(query) ||
        plan.customer?.name.toLowerCase().includes(query) ||
        plan.customer?.code.toLowerCase().includes(query)
    );
  };

  // Format date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString();
  };

  // Render plan status badge
  const renderStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; icon: any; label: string }> = {
      draft: { color: 'bg-steel-100 text-steel-600', icon: DocumentTextIcon, label: 'Draft' },
      pending: { color: 'bg-amber-100 text-amber-700', icon: ClockIcon, label: 'Pending' },
      final_confirmed: { color: 'bg-green-100 text-green-700', icon: CheckCircleIcon, label: 'Confirmed' },
      scheduled: { color: 'bg-blue-100 text-blue-700', icon: CheckCircleSolidIcon, label: 'Scheduled' },
      archived: { color: 'bg-steel-200 text-steel-500', icon: DocumentTextIcon, label: 'Archived' },
    };

    const config = statusConfig[status] || statusConfig.draft;
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${config.color}`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </span>
    );
  };

  // Navigate to plan confirmation page
  const handleViewPlan = (planId: string) => {
    navigate(`/service-plan-confirmation/${planId}`);
  };

  // Render plan card
  const renderPlanCard = (plan: ServicePlan) => (
    <div
      key={plan.id}
      className="bg-white rounded-lg border border-steel-200 hover:border-rail-300 hover:shadow-md transition-all cursor-pointer"
      onClick={() => handleViewPlan(plan.id)}
    >
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold text-steel-800">{plan.name}</h3>
            <p className="text-sm text-steel-500 mt-0.5">
              {plan.customer?.name || 'No Customer'}{' '}
              {plan.customer?.code && (
                <span className="text-steel-400">({plan.customer.code})</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {renderStatusBadge(plan.status)}
            <ChevronRightIcon className="w-4 h-4 text-steel-400" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-steel-500 text-xs">Cars</span>
            <p className="font-medium text-steel-800">
              {(plan as any).confirmedCarCount || plan.selectedCarCount || 0}
            </p>
          </div>
          <div>
            <span className="text-steel-500 text-xs">Version</span>
            <p className="font-medium text-steel-800">v{(plan as any).version || 1}</p>
          </div>
          <div>
            <span className="text-steel-500 text-xs">
              {plan.status === 'scheduled' ? 'Scheduled' : 'Updated'}
            </span>
            <p className="font-medium text-steel-800">
              {formatDate((plan as any).scheduledAt || plan.updatedAt)}
            </p>
          </div>
        </div>

        {plan.creator && (
          <div className="mt-3 pt-3 border-t border-steel-100 flex items-center gap-2 text-xs text-steel-500">
            <UserIcon className="w-3.5 h-3.5" />
            <span>
              {plan.creator.firstName} {plan.creator.lastName}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-steel-50">
      {/* Header */}
      <div className="bg-white border-b border-steel-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-steel-800">Service Plan Reports</h1>
              <p className="text-sm text-steel-500 mt-0.5">
                View and manage confirmed and pending service plans
              </p>
            </div>
            <button
              onClick={loadAll}
              disabled={isLoading}
              className="p-2 hover:bg-steel-100 rounded-full text-steel-500 disabled:opacity-50"
              title="Refresh"
            >
              <ArrowPathIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-steel-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('confirmed')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'confirmed'
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-steel-500 hover:text-steel-700'
              }`}
            >
              <CheckCircleSolidIcon className="w-4 h-4" />
              Confirmed Plans
              <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-green-100 text-green-700">
                {confirmedPlans.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'pending'
                  ? 'border-amber-600 text-amber-600'
                  : 'border-transparent text-steel-500 hover:text-steel-700'
              }`}
            >
              <ClockIcon className="w-4 h-4" />
              Pending Plans
              <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700">
                {pendingPlans.length}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-steel-400" />
            <input
              type="text"
              placeholder="Search plans..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-2 border border-steel-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rail-500 focus:border-transparent w-full"
            />
          </div>

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-3 py-2 text-sm border rounded-md flex items-center gap-2 ${
              showFilters
                ? 'border-rail-500 text-rail-600 bg-rail-50'
                : 'border-steel-300 text-steel-600 hover:bg-steel-50'
            }`}
          >
            <FunnelIcon className="w-4 h-4" />
            Filters
          </button>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="mt-4 p-4 bg-white rounded-lg border border-steel-200">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-steel-500 mb-1">Customer ID</label>
                <input
                  type="text"
                  placeholder="Filter by customer..."
                  value={filters.customerId || ''}
                  onChange={(e) => setFilters({ ...filters, customerId: e.target.value || undefined })}
                  className="w-full px-3 py-2 border border-steel-300 rounded-md text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-steel-500 mb-1">Planner ID</label>
                <input
                  type="text"
                  placeholder="Filter by planner..."
                  value={filters.plannerId || ''}
                  onChange={(e) => setFilters({ ...filters, plannerId: e.target.value || undefined })}
                  className="w-full px-3 py-2 border border-steel-300 rounded-md text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-steel-500 mb-1">Month</label>
                <select
                  value={filters.month || ''}
                  onChange={(e) =>
                    setFilters({ ...filters, month: e.target.value ? parseInt(e.target.value) : undefined })
                  }
                  className="w-full px-3 py-2 border border-steel-300 rounded-md text-sm"
                >
                  <option value="">Any month</option>
                  {[...Array(12)].map((_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {new Date(2000, i, 1).toLocaleString('default', { month: 'long' })}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-steel-500 mb-1">Year</label>
                <select
                  value={filters.year || ''}
                  onChange={(e) =>
                    setFilters({ ...filters, year: e.target.value ? parseInt(e.target.value) : undefined })
                  }
                  className="w-full px-3 py-2 border border-steel-300 rounded-md text-sm"
                >
                  <option value="">Any year</option>
                  {[...Array(5)].map((_, i) => {
                    const year = new Date().getFullYear() + i;
                    return (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setFilters({})}
                className="px-3 py-1.5 text-sm text-steel-600 hover:bg-steel-50 rounded"
              >
                Clear Filters
              </button>
              <button
                onClick={loadAll}
                className="px-3 py-1.5 text-sm bg-rail-600 text-white rounded hover:bg-rail-700"
              >
                Apply Filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rail-600 mx-auto"></div>
            <p className="mt-4 text-steel-500">Loading plans...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-500">{error}</p>
            <button
              onClick={loadAll}
              className="mt-4 px-4 py-2 bg-rail-600 text-white rounded-md hover:bg-rail-700"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeTab === 'confirmed' &&
              getFilteredPlans(confirmedPlans).map((plan) => renderPlanCard(plan))}
            {activeTab === 'pending' &&
              getFilteredPlans(pendingPlans).map((plan) => renderPlanCard(plan))}
            {(activeTab === 'confirmed' ? getFilteredPlans(confirmedPlans) : getFilteredPlans(pendingPlans))
              .length === 0 && (
              <div className="col-span-full text-center py-12 text-steel-500">
                {searchQuery
                  ? 'No plans match your search'
                  : activeTab === 'confirmed'
                  ? 'No confirmed plans yet'
                  : 'No pending plans'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
