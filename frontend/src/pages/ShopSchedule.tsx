/**
 * ShopSchedule.tsx - Shop work order view from MasterPlan
 *
 * Displays a printable work queue for a shop based on MasterPlanCommitments.
 * Designed for shop managers to track incoming work.
 */

import { useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { PDFDownloadLink } from '@react-pdf/renderer';
import {
  CalendarDaysIcon,
  TruckIcon,
  UserGroupIcon,
  ArrowLeftIcon,
  DocumentArrowDownIcon,
  PrinterIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { useShopWorkOrders, useActiveMasterPlan } from '../hooks/useQueryWithCompany';
import { ShopWorkOrderPDF } from '../components/ExportPdfButton';
import type { CommitmentStatus } from '../types';

// Status display configuration
const statusConfig: Record<CommitmentStatus, { label: string; color: string; bgColor: string }> = {
  committed: { label: 'Committed', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  scheduled: { label: 'Scheduled', color: 'text-indigo-700', bgColor: 'bg-indigo-100' },
  in_transit: { label: 'In Transit', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  arrived: { label: 'Arrived', color: 'text-orange-700', bgColor: 'bg-orange-100' },
  in_progress: { label: 'In Progress', color: 'text-purple-700', bgColor: 'bg-purple-100' },
  released: { label: 'Released', color: 'text-green-700', bgColor: 'bg-green-100' },
};

// Priority display
const priorityConfig: Record<number, { label: string; color: string; bgColor: string }> = {
  1: { label: 'Critical', color: 'text-red-700', bgColor: 'bg-red-100' },
  2: { label: 'High', color: 'text-orange-700', bgColor: 'bg-orange-100' },
  3: { label: 'Medium', color: 'text-yellow-700', bgColor: 'bg-yellow-100' },
  4: { label: 'Low', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  5: { label: 'Deferred', color: 'text-gray-600', bgColor: 'bg-gray-100' },
};

export default function ShopSchedule() {
  const { shopId } = useParams<{ shopId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Get month from URL or default to current month
  const getCurrentMonth = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  };

  const selectedMonth = searchParams.get('month') || getCurrentMonth();

  const { data: activePlan } = useActiveMasterPlan();
  const { data: workOrders, isLoading, error } = useShopWorkOrders(shopId, selectedMonth);

  // Get shop name from first work order
  const shopName = workOrders?.[0]?.shop?.name || 'Shop';
  const shopCode = workOrders?.[0]?.shop?.code || '';

  // Navigate to adjacent months
  const navigateMonth = (direction: 'prev' | 'next') => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const date = new Date(year, month - 1 + (direction === 'next' ? 1 : -1), 1);
    const newMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    setSearchParams({ month: newMonth });
  };

  const formatMonth = (monthKey: string) => {
    const [year, month] = monthKey.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const parseWorkTypes = (workTypesJson: string): string[] => {
    try {
      return JSON.parse(workTypesJson);
    } catch {
      return [workTypesJson];
    }
  };

  // Sort by priority then arrival date
  const sortedWorkOrders = useMemo(() => {
    if (!workOrders) return [];
    return [...workOrders].sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.plannedArrival && b.plannedArrival) {
        return new Date(a.plannedArrival).getTime() - new Date(b.plannedArrival).getTime();
      }
      return 0;
    });
  }, [workOrders]);

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rail-600 mx-auto"></div>
          <p className="mt-4 text-steel-600">Loading work orders...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <ExclamationTriangleIcon className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-600">Failed to load shop work orders</p>
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
            <h1 className="text-xl font-bold text-steel-900">Shop Work Orders</h1>
            <p className="text-sm text-steel-500">
              {shopName} ({shopCode}) | {sortedWorkOrders.length} work orders
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={handlePrint} className="btn-secondary">
            <PrinterIcon className="h-4 w-4 mr-2" />
            Print
          </button>
          {workOrders && workOrders.length > 0 && activePlan && (
            <PDFDownloadLink
              document={
                <ShopWorkOrderPDF
                  shopName={shopName}
                  shopCode={shopCode}
                  month={selectedMonth}
                  commitments={sortedWorkOrders}
                  planName={activePlan.planName}
                />
              }
              fileName={`${shopCode}_WorkOrders_${selectedMonth}.pdf`}
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
        <h1 className="text-2xl font-bold text-steel-900">{shopName} ({shopCode})</h1>
        <p className="text-sm text-steel-600">
          Work Orders for {formatMonth(selectedMonth)} | {activePlan?.planName} | Generated: {new Date().toLocaleDateString()}
        </p>
      </div>

      {/* Month Navigation */}
      <div className="card p-3 print:hidden">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigateMonth('prev')}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-steel-600 hover:text-steel-900 hover:bg-steel-100 rounded-lg transition-colors"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            Previous
          </button>

          <div className="flex items-center gap-2">
            <CalendarDaysIcon className="h-5 w-5 text-rail-600" />
            <span className="font-semibold text-steel-900">{formatMonth(selectedMonth)}</span>
          </div>

          <button
            onClick={() => navigateMonth('next')}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-steel-600 hover:text-steel-900 hover:bg-steel-100 rounded-lg transition-colors"
          >
            Next
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      {sortedWorkOrders.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:grid-cols-4">
          <div className="card p-3">
            <p className="text-xs text-steel-500">Total Work Orders</p>
            <p className="text-xl font-bold text-steel-900">{sortedWorkOrders.length}</p>
          </div>
          <div className="card p-3">
            <p className="text-xs text-steel-500">Critical/High Priority</p>
            <p className="text-xl font-bold text-red-600">
              {sortedWorkOrders.filter((w) => w.priority <= 2).length}
            </p>
          </div>
          <div className="card p-3">
            <p className="text-xs text-steel-500">In Progress</p>
            <p className="text-xl font-bold text-purple-600">
              {sortedWorkOrders.filter((w) => w.status === 'in_progress').length}
            </p>
          </div>
          <div className="card p-3">
            <p className="text-xs text-steel-500">Unique Customers</p>
            <p className="text-xl font-bold text-steel-900">
              {new Set(sortedWorkOrders.map((w) => w.customerId)).size}
            </p>
          </div>
        </div>
      )}

      {/* Work Orders Table */}
      {sortedWorkOrders.length === 0 ? (
        <div className="card p-12 text-center">
          <TruckIcon className="h-12 w-12 text-steel-300 mx-auto mb-4" />
          <p className="text-steel-500">No work orders for {formatMonth(selectedMonth)}</p>
          <p className="text-sm text-steel-400 mt-1">Try navigating to a different month</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-steel-50 border-b border-steel-200">
                <th className="text-left py-3 px-4 text-xs font-semibold text-steel-600 uppercase">Railcar #</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-steel-600 uppercase">Customer</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-steel-600 uppercase">Work Type</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-steel-600 uppercase">Priority</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-steel-600 uppercase">Planned Arrival</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-steel-600 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-100">
              {sortedWorkOrders.map((order) => {
                const workTypes = parseWorkTypes(order.workTypes);
                const status = statusConfig[order.status];
                const priority = priorityConfig[order.priority];

                return (
                  <tr key={order.id} className="hover:bg-steel-50 print:hover:bg-white">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <TruckIcon className="h-4 w-4 text-steel-400" />
                        <div>
                          <p className="font-medium text-steel-900">{order.car.railcarNumber}</p>
                          <p className="text-xs text-steel-500">{order.car.carType}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <UserGroupIcon className="h-4 w-4 text-steel-400" />
                        <span className="text-steel-700">{order.customer.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {workTypes.map((wt, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 text-xs rounded bg-steel-100 text-steel-700 capitalize"
                          >
                            {wt}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${priority?.bgColor} ${priority?.color}`}>
                        {priority?.label || `P${order.priority}`}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-steel-700">
                      {formatDate(order.plannedArrival)}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${status?.bgColor} ${status?.color}`}>
                        {status?.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer for print */}
      <div className="hidden print:block text-center text-xs text-steel-500 mt-8">
        <p>{shopName} Work Orders | {formatMonth(selectedMonth)}</p>
        <p>{activePlan?.planName} | AITX Chronos Scheduler</p>
      </div>
    </div>
  );
}
