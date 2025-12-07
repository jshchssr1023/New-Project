/**
 * Master Plan Audit Log Component
 *
 * A dedicated, non-editable system log tracking all critical Master Plan actions:
 * - Master Plan Lock/Unlock
 * - User Allocation Overrides
 * - Capacity Adjustments
 * - Import/Export Activities
 *
 * Part of the Gold Standard Car Flow Planning upgrade.
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  masterPlanWizardApi,
  MasterPlanAuditEntry,
} from '../services/api';

// =============================================================================
// TYPES
// =============================================================================

interface AuditFilters {
  action?: string;
  category?: string;
  startDate?: string;
  endDate?: string;
  page: number;
  pageSize: number;
}

interface AuditStatistics {
  last30Days: {
    planLocks: number;
    allocationOverrides: number;
    capacityChanges: number;
    imports: number;
    exports: number;
  };
}

// =============================================================================
// ACTION CONFIGURATION
// =============================================================================

const ACTION_CONFIG: Record<
  string,
  { label: string; icon: string; color: string; bgColor: string }
> = {
  plan_locked: {
    label: 'Plan Locked',
    icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
    color: 'text-purple-700',
    bgColor: 'bg-purple-100',
  },
  plan_unlocked: {
    label: 'Plan Unlocked',
    icon: 'M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z',
    color: 'text-gray-700',
    bgColor: 'bg-gray-100',
  },
  plan_published: {
    label: 'Plan Published',
    icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
  },
  allocation_override: {
    label: 'Allocation Override',
    icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4',
    color: 'text-orange-700',
    bgColor: 'bg-orange-100',
  },
  capacity_adjusted: {
    label: 'Capacity Adjusted',
    icon: 'M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
  },
  import_completed: {
    label: 'Import Completed',
    icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
    color: 'text-indigo-700',
    bgColor: 'bg-indigo-100',
  },
  export_generated: {
    label: 'Export Generated',
    icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12',
    color: 'text-teal-700',
    bgColor: 'bg-teal-100',
  },
  commit: {
    label: 'Committed',
    icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
  },
  assign: {
    label: 'Assignment',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
  },
};

const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  plan: { label: 'Plan', color: 'bg-purple-100 text-purple-800' },
  allocation: { label: 'Allocation', color: 'bg-orange-100 text-orange-800' },
  capacity: { label: 'Capacity', color: 'bg-blue-100 text-blue-800' },
  export: { label: 'Export', color: 'bg-teal-100 text-teal-800' },
  import: { label: 'Import', color: 'bg-indigo-100 text-indigo-800' },
  other: { label: 'Other', color: 'bg-gray-100 text-gray-800' },
};

// =============================================================================
// COMPONENT
// =============================================================================

export default function MasterPlanAuditLog() {
  const [filters, setFilters] = useState<AuditFilters>({
    page: 1,
    pageSize: 25,
  });
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);

  // Fetch audit logs
  const {
    data: auditData,
    isLoading: isLoadingAudit,
    error: auditError,
  } = useQuery({
    queryKey: ['masterPlanAuditLogs', filters],
    queryFn: () =>
      masterPlanWizardApi.getAuditLogs({
        action: filters.action,
        startDate: filters.startDate,
        endDate: filters.endDate,
        page: filters.page,
        pageSize: filters.pageSize,
      }),
  });

  // Fetch statistics
  const { data: statisticsData, isLoading: isLoadingStats } = useQuery({
    queryKey: ['masterPlanAuditStatistics'],
    queryFn: () => masterPlanWizardApi.getAuditStatistics(),
  });

  const statistics = statisticsData as AuditStatistics | undefined;

  // Format timestamp
  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // Get relative time
  const getRelativeTime = (timestamp: string): string => {
    const now = new Date();
    const date = new Date(timestamp);
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return formatTimestamp(timestamp);
  };

  // Get action config
  const getActionConfig = (action: string) => {
    return (
      ACTION_CONFIG[action] || {
        label: action.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
        icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
        color: 'text-gray-700',
        bgColor: 'bg-gray-100',
      }
    );
  };

  // Get category config
  const getCategoryConfig = (category: string) => {
    return CATEGORY_CONFIG[category] || CATEGORY_CONFIG.other;
  };

  // Format details for display
  const formatDetails = (entry: MasterPlanAuditEntry): React.ReactNode => {
    const details = entry.details;

    if (entry.source === 'capacity_audit') {
      return (
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Field:</span>
            <span className="font-medium">{(details.field as string) || 'Unknown'}</span>
          </div>
          <div className="flex items-center gap-4">
            <div>
              <span className="text-gray-500">Previous:</span>{' '}
              <span className="font-medium text-red-600">{String(details.previousValue)}</span>
            </div>
            <span className="text-gray-400">→</span>
            <div>
              <span className="text-gray-500">New:</span>{' '}
              <span className="font-medium text-green-600">{String(details.newValue)}</span>
            </div>
          </div>
          {Boolean(details.justification) && (
            <div>
              <span className="text-gray-500">Justification:</span>{' '}
              <span className="italic">"{String(details.justification)}"</span>
            </div>
          )}
          {Boolean(details.changeCategory) && (
            <div>
              <span className="text-gray-500">Category:</span>{' '}
              <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">
                {String(details.changeCategory)}
              </span>
            </div>
          )}
        </div>
      );
    }

    if (entry.source === 'allocation_override') {
      return (
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-gray-500">Work Type:</span>{' '}
              <span className="font-medium capitalize">{String(details.workType)}</span>
            </div>
            <div>
              <span className="text-gray-500">Cars:</span>{' '}
              <span className="font-medium">{String(details.carCount)}</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div>
              <span className="text-gray-500">Original:</span>{' '}
              <span className="font-medium">{String(details.originalValue)}</span>
            </div>
            <span className="text-gray-400">→</span>
            <div>
              <span className="text-gray-500">Override:</span>{' '}
              <span className="font-medium">{String(details.overrideValue)}</span>
            </div>
          </div>
          {Boolean(details.justification) && (
            <div>
              <span className="text-gray-500">Justification:</span>{' '}
              <span className="italic">"{String(details.justification)}"</span>
            </div>
          )}
          {Boolean(details.overrideReason) && (
            <div>
              <span className="text-gray-500">Reason:</span>{' '}
              <span className="px-2 py-0.5 bg-gray-100 rounded text-xs capitalize">
                {String(details.overrideReason).replace(/_/g, ' ')}
              </span>
            </div>
          )}
        </div>
      );
    }

    // Default: show changes from audit log
    if (details.changes && typeof details.changes === 'object') {
      const changes = details.changes as Record<string, { old?: unknown; new?: unknown }>;
      return (
        <div className="space-y-2 text-sm">
          {Object.entries(changes).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-gray-500 capitalize">{key.replace(/_/g, ' ')}:</span>
              {value.old !== undefined && (
                <>
                  <span className="text-red-600 line-through">{String(value.old)}</span>
                  <span className="text-gray-400">→</span>
                </>
              )}
              <span className="text-green-600 font-medium">{String(value.new)}</span>
            </div>
          ))}
          {Boolean(details.metadata) && typeof details.metadata === 'object' && (
            <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
              <pre className="overflow-x-auto">
                {JSON.stringify(details.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      );
    }

    return (
      <pre className="text-xs bg-gray-50 p-2 rounded overflow-x-auto">
        {JSON.stringify(details, null, 2)}
      </pre>
    );
  };

  // Pagination
  const handlePageChange = (newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  };

  // Filter handlers
  const handleCategoryFilter = (category: string) => {
    setFilters((prev) => ({
      ...prev,
      category: prev.category === category ? undefined : category,
      page: 1,
    }));
  };

  const handleDateFilter = (startDate: string, endDate: string) => {
    setFilters((prev) => ({
      ...prev,
      startDate,
      endDate,
      page: 1,
    }));
  };

  const clearFilters = () => {
    setFilters({
      page: 1,
      pageSize: 25,
    });
  };

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Master Plan Audit Log</h1>
            <p className="text-sm text-gray-500 mt-1">
              Non-editable system log tracking all critical Master Plan actions
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">
              System log entries cannot be modified or deleted
            </span>
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="px-6 py-4 bg-white border-b">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Last 30 Days</h3>
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-purple-50 rounded-lg p-3 border border-purple-100">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-purple-100 rounded">
                <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-bold text-purple-900">
                  {isLoadingStats ? '-' : statistics?.last30Days.planLocks || 0}
                </p>
                <p className="text-xs text-purple-600">Plan Locks</p>
              </div>
            </div>
          </div>
          <div className="bg-orange-50 rounded-lg p-3 border border-orange-100">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-orange-100 rounded">
                <svg className="w-4 h-4 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-bold text-orange-900">
                  {isLoadingStats ? '-' : statistics?.last30Days.allocationOverrides || 0}
                </p>
                <p className="text-xs text-orange-600">Allocation Overrides</p>
              </div>
            </div>
          </div>
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-100 rounded">
                <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-900">
                  {isLoadingStats ? '-' : statistics?.last30Days.capacityChanges || 0}
                </p>
                <p className="text-xs text-blue-600">Capacity Changes</p>
              </div>
            </div>
          </div>
          <div className="bg-indigo-50 rounded-lg p-3 border border-indigo-100">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-indigo-100 rounded">
                <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-bold text-indigo-900">
                  {isLoadingStats ? '-' : statistics?.last30Days.imports || 0}
                </p>
                <p className="text-xs text-indigo-600">Imports</p>
              </div>
            </div>
          </div>
          <div className="bg-teal-50 rounded-lg p-3 border border-teal-100">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-teal-100 rounded">
                <svg className="w-4 h-4 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-bold text-teal-900">
                  {isLoadingStats ? '-' : statistics?.last30Days.exports || 0}
                </p>
                <p className="text-xs text-teal-600">Exports</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 bg-white border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Filter by category:</span>
            {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
              <button
                key={key}
                onClick={() => handleCategoryFilter(key)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  filters.category === key
                    ? config.color + ' ring-2 ring-offset-1 ring-gray-400'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {config.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={filters.startDate || ''}
              onChange={(e) =>
                handleDateFilter(e.target.value, filters.endDate || '')
              }
              className="px-2 py-1 text-sm border rounded"
              placeholder="Start Date"
            />
            <span className="text-gray-400">to</span>
            <input
              type="date"
              value={filters.endDate || ''}
              onChange={(e) =>
                handleDateFilter(filters.startDate || '', e.target.value)
              }
              className="px-2 py-1 text-sm border rounded"
              placeholder="End Date"
            />
            {(filters.category || filters.startDate || filters.endDate) && (
              <button
                onClick={clearFilters}
                className="px-2 py-1 text-xs text-red-600 hover:text-red-800"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Audit Log List */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {isLoadingAudit ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : auditError ? (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="mt-2 text-sm text-red-600">Failed to load audit logs</p>
          </div>
        ) : auditData?.data.length === 0 ? (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="mt-2 text-sm text-gray-500">No audit entries found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {auditData?.data.map((entry) => {
              const actionConfig = getActionConfig(entry.action);
              const categoryConfig = getCategoryConfig(entry.category);
              const isExpanded = expandedEntryId === entry.id;

              return (
                <div
                  key={entry.id}
                  className="bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow"
                >
                  <button
                    onClick={() => setExpandedEntryId(isExpanded ? null : entry.id)}
                    className="w-full text-left px-4 py-3"
                  >
                    <div className="flex items-start gap-3">
                      {/* Action Icon */}
                      <div className={`p-2 rounded-lg ${actionConfig.bgColor}`}>
                        <svg
                          className={`w-5 h-5 ${actionConfig.color}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d={actionConfig.icon}
                          />
                        </svg>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">
                            {actionConfig.label}
                          </span>
                          <span className={`px-2 py-0.5 text-xs rounded-full ${categoryConfig.color}`}>
                            {categoryConfig.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-sm text-gray-600">
                            {entry.entityName || entry.entityType}
                          </span>
                          <span className="text-gray-300">|</span>
                          <span className="text-sm text-gray-500">{entry.userEmail}</span>
                        </div>
                      </div>

                      {/* Timestamp */}
                      <div className="text-right">
                        <p className="text-sm text-gray-500">{getRelativeTime(entry.timestamp)}</p>
                        <p className="text-xs text-gray-400">{formatTimestamp(entry.timestamp)}</p>
                      </div>

                      {/* Expand Icon */}
                      <svg
                        className={`w-5 h-5 text-gray-400 transition-transform ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t bg-gray-50">
                      <div className="pt-3">
                        <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
                          Details
                        </h4>
                        {formatDetails(entry)}
                        <div className="mt-3 pt-3 border-t flex items-center gap-4 text-xs text-gray-400">
                          <span>Entry ID: {entry.id.slice(0, 8)}...</span>
                          <span>Entity: {entry.entityType}</span>
                          <span>Source: {entry.source.replace(/_/g, ' ')}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {auditData && auditData.totalPages > 1 && (
        <div className="px-6 py-3 bg-white border-t flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {(filters.page - 1) * filters.pageSize + 1} to{' '}
            {Math.min(filters.page * filters.pageSize, auditData.total)} of {auditData.total} entries
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(filters.page - 1)}
              disabled={filters.page === 1}
              className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {filters.page} of {auditData.totalPages}
            </span>
            <button
              onClick={() => handlePageChange(filters.page + 1)}
              disabled={filters.page === auditData.totalPages}
              className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
