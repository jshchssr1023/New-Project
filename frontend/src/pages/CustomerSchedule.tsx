/**
 * CustomerSchedule.tsx - Customer-facing schedule view from MasterPlan
 *
 * Displays a clean, printable view of all scheduled services for a customer
 * based on MasterPlanCommitments. Designed for sharing with customers.
 */

import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PDFDownloadLink } from '@react-pdf/renderer';
import {
  CalendarDaysIcon,
  TruckIcon,
  BuildingStorefrontIcon,
  ArrowLeftIcon,
  DocumentArrowDownIcon,
  PrinterIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import { useCustomerSchedule, useActiveMasterPlan } from '../hooks/useQueryWithCompany';
import { CustomerSchedulePDF } from '../components/ExportPdfButton';
import type { MasterPlanCommitment, CommitmentStatus } from '../types';

// Status display configuration
const statusConfig: Record<CommitmentStatus, { label: string; color: string; bgColor: string }> = {
  committed: { label: 'Committed', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  scheduled: { label: 'Scheduled', color: 'text-indigo-700', bgColor: 'bg-indigo-50' },
  in_transit: { label: 'In Transit', color: 'text-amber-700', bgColor: 'bg-amber-50' },
  arrived: { label: 'Arrived', color: 'text-orange-700', bgColor: 'bg-orange-50' },
  in_progress: { label: 'In Progress', color: 'text-purple-700', bgColor: 'bg-purple-50' },
  released: { label: 'Completed', color: 'text-green-700', bgColor: 'bg-green-50' },
};

export default function CustomerSchedule() {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();

  const { data: activePlan } = useActiveMasterPlan();
  const { data: commitments, isLoading, error } = useCustomerSchedule(customerId);

  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // Get customer name from first commitment
  const customerName = commitments?.[0]?.customer?.name || 'Customer';

  // Get unique months
  const months = useMemo(() => {
    if (!commitments) return [];
    const monthSet = new Set(commitments.map((c) => c.scheduledMonth));
    return Array.from(monthSet).sort();
  }, [commitments]);

  // Filter commitments
  const filteredCommitments = useMemo(() => {
    if (!commitments) return [];
    let filtered = commitments;
    if (selectedMonth !== 'all') {
      filtered = filtered.filter((c) => c.scheduledMonth === selectedMonth);
    }
    if (selectedStatus !== 'all') {
      filtered = filtered.filter((c) => c.status === selectedStatus);
    }
    return filtered;
  }, [commitments, selectedMonth, selectedStatus]);

  // Group by month
  const groupedByMonth = useMemo(() => {
    const groups: Record<string, MasterPlanCommitment[]> = {};
    filteredCommitments.forEach((c) => {
      if (!groups[c.scheduledMonth]) {
        groups[c.scheduledMonth] = [];
      }
      groups[c.scheduledMonth].push(c);
    });
    return groups;
  }, [filteredCommitments]);

  const formatMonth = (monthKey: string) => {
    const [year, month] = monthKey.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const parseWorkTypes = (workTypesJson: string): string[] => {
    try {
      return JSON.parse(workTypesJson);
    } catch {
      return [workTypesJson];
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rail-600 mx-auto"></div>
          <p className="mt-4 text-steel-600">Loading schedule...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-red-600">Failed to load customer schedule</p>
          <button onClick={() => navigate(-1)} className="mt-4 btn-secondary">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 print:space-y-2">
      {/* Header - Hidden during print */}
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-steel-100 rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="h-5 w-5 text-steel-600" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-steel-900">Customer Schedule</h1>
            <p className="text-sm text-steel-500">
              {customerName} | {filteredCommitments.length} scheduled services
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={handlePrint} className="btn-secondary">
            <PrinterIcon className="h-4 w-4 mr-2" />
            Print
          </button>
          {commitments && commitments.length > 0 && activePlan && (
            <PDFDownloadLink
              document={
                <CustomerSchedulePDF
                  customerName={customerName}
                  commitments={filteredCommitments}
                  planName={activePlan.planName}
                />
              }
              fileName={`${customerName.replace(/\s+/g, '_')}_Schedule.pdf`}
              className="btn-primary"
            >
              {({ loading }) => (
                <>
                  <DocumentArrowDownIcon className="h-4 w-4 mr-2" />
                  {loading ? 'Generating...' : 'Download PDF'}
                </>
              )}
            </PDFDownloadLink>
          )}
        </div>
      </div>

      {/* Print Header */}
      <div className="hidden print:block">
        <h1 className="text-2xl font-bold text-steel-900">{customerName}</h1>
        <p className="text-sm text-steel-600">
          Qualification Schedule | {activePlan?.planName} | Generated: {new Date().toLocaleDateString()}
        </p>
      </div>

      {/* Filters - Hidden during print */}
      <div className="card p-3 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <FunnelIcon className="h-4 w-4 text-steel-400" />
            <span className="text-sm font-medium text-steel-600">Filter:</span>
          </div>

          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="input text-sm py-1.5"
          >
            <option value="all">All Months</option>
            {months.map((month) => (
              <option key={month} value={month}>
                {formatMonth(month)}
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
        </div>
      </div>

      {/* Schedule by Month */}
      {Object.keys(groupedByMonth).length === 0 ? (
        <div className="card p-12 text-center">
          <CalendarDaysIcon className="h-12 w-12 text-steel-300 mx-auto mb-4" />
          <p className="text-steel-500">No scheduled services found</p>
        </div>
      ) : (
        Object.entries(groupedByMonth)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, monthCommitments]) => (
            <div key={month} className="card overflow-hidden print:break-inside-avoid">
              <div className="bg-rail-50 px-4 py-3 border-b border-rail-100">
                <div className="flex items-center gap-2">
                  <CalendarDaysIcon className="h-5 w-5 text-rail-600" />
                  <h2 className="font-semibold text-rail-900">{formatMonth(month)}</h2>
                  <span className="text-sm text-rail-600">({monthCommitments.length} cars)</span>
                </div>
              </div>

              <div className="divide-y divide-steel-100">
                {monthCommitments.map((commitment) => {
                  const workTypes = parseWorkTypes(commitment.workTypes);
                  const status = statusConfig[commitment.status];

                  return (
                    <div key={commitment.id} className="p-4 hover:bg-steel-50 print:hover:bg-white">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className="bg-steel-100 rounded-lg p-2 print:bg-steel-50">
                            <TruckIcon className="h-5 w-5 text-steel-600" />
                          </div>
                          <div>
                            <p className="font-medium text-steel-900">{commitment.car.railcarNumber}</p>
                            <p className="text-sm text-steel-500">{commitment.car.carType}</p>
                            {commitment.car.commodity && (
                              <p className="text-xs text-steel-400 mt-0.5">{commitment.car.commodity}</p>
                            )}
                          </div>
                        </div>

                        <div className="text-right">
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${status?.bgColor} ${status?.color}`}>
                            {status?.label}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                        <div className="flex items-center gap-1.5">
                          <BuildingStorefrontIcon className="h-4 w-4 text-steel-400" />
                          <span className="text-steel-700">{commitment.shop.name}</span>
                          <span className="text-steel-400">({commitment.shop.code})</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-steel-500">Work:</span>
                          <span className="text-steel-700 capitalize">{workTypes.join(', ')}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
      )}

      {/* Footer for print */}
      <div className="hidden print:block text-center text-xs text-steel-500 mt-8">
        <p>For questions about this schedule, please contact your AITX representative.</p>
        <p>{activePlan?.planName} | AITX Chronos Scheduler</p>
      </div>
    </div>
  );
}
