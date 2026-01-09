/**
 * SchedulingStatusPanel Component
 *
 * Shows a clear split view of:
 * - Left: Items that NEED scheduling (organized by urgency)
 * - Right: Items that ARE scheduled (organized by month)
 *
 * This addresses the core UX issue: "I need to see what is scheduled vs what is not"
 */

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ExclamationTriangleIcon,
  ClockIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';

export interface SchedulingItem {
  id: string;
  carNumber: string;
  customer: string;
  status: 'urgent' | 'must_shop' | 'upcoming' | 'scheduled' | 'in_progress' | 'completed';
  scheduledMonth?: string;
  dueDate?: string;
  shopName?: string;
}

interface SchedulingStatusPanelProps {
  needsScheduling: SchedulingItem[];
  scheduled: SchedulingItem[];
  onItemClick?: (item: SchedulingItem) => void;
  onViewAllUnscheduled?: () => void;
  onViewAllScheduled?: () => void;
  maxItems?: number;
}

const urgencyConfig = {
  urgent: {
    label: 'Urgent (Overdue)',
    icon: ExclamationTriangleIcon,
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    textColor: 'text-red-700',
    badgeColor: 'bg-red-100 text-red-800 border-red-300',
  },
  must_shop: {
    label: 'Must Shop This Year',
    icon: ClockIcon,
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    textColor: 'text-amber-700',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  upcoming: {
    label: 'Upcoming (Next Year)',
    icon: CalendarIcon,
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    textColor: 'text-blue-700',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-300',
  },
};

export default function SchedulingStatusPanel({
  needsScheduling,
  scheduled,
  onItemClick,
  onViewAllUnscheduled,
  onViewAllScheduled,
  maxItems = 5,
}: SchedulingStatusPanelProps) {
  const navigate = useNavigate();

  // Group unscheduled items by urgency
  const groupedUnscheduled = useMemo(() => {
    const groups: Record<string, SchedulingItem[]> = {
      urgent: [],
      must_shop: [],
      upcoming: [],
    };

    needsScheduling.forEach((item) => {
      if (groups[item.status]) {
        groups[item.status].push(item);
      }
    });

    return groups;
  }, [needsScheduling]);

  // Group scheduled items by month
  const groupedScheduled = useMemo(() => {
    const groups: Record<string, SchedulingItem[]> = {};

    scheduled.forEach((item) => {
      const month = item.scheduledMonth || 'Unassigned';
      if (!groups[month]) {
        groups[month] = [];
      }
      groups[month].push(item);
    });

    // Sort by month
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  }, [scheduled]);

  const handleItemClick = (item: SchedulingItem) => {
    if (onItemClick) {
      onItemClick(item);
    } else {
      navigate(`/cars?search=${item.carNumber}`);
    }
  };

  const handleViewAllUnscheduled = () => {
    if (onViewAllUnscheduled) {
      onViewAllUnscheduled();
    } else {
      navigate('/cars?filter=needs_scheduling');
    }
  };

  const handleViewAllScheduled = () => {
    if (onViewAllScheduled) {
      onViewAllScheduled();
    } else {
      navigate('/car-flow?tab=plans');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Left Panel: Needs Scheduling */}
      <div className="bg-white rounded-lg border border-steel-200 overflow-hidden">
        <div className="bg-red-50 border-b border-red-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
              <h3 className="font-semibold text-red-900">Needs Scheduling</h3>
            </div>
            <span className="px-2 py-1 text-sm font-bold rounded-full bg-red-100 text-red-800 border border-red-300">
              {needsScheduling.length}
            </span>
          </div>
          <p className="text-xs text-red-700 mt-1">
            Cars that require scheduling attention
          </p>
        </div>

        <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
          {Object.entries(groupedUnscheduled).map(([status, items]) => {
            if (items.length === 0) return null;
            const config = urgencyConfig[status as keyof typeof urgencyConfig];

            return (
              <div key={status}>
                <div className={`flex items-center gap-2 mb-2 px-2 py-1 rounded ${config.bgColor}`}>
                  <config.icon className={`h-4 w-4 ${config.textColor}`} />
                  <span className={`text-sm font-medium ${config.textColor}`}>
                    {config.label}
                  </span>
                  <span className={`ml-auto px-1.5 py-0.5 text-xs font-bold rounded-full border ${config.badgeColor}`}>
                    {items.length}
                  </span>
                </div>

                <div className="space-y-1">
                  {items.slice(0, maxItems).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleItemClick(item)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border ${config.borderColor} ${config.bgColor} hover:shadow-sm transition-shadow text-left`}
                    >
                      <div>
                        <span className="font-medium text-steel-900">
                          {item.carNumber}
                        </span>
                        <span className="text-xs text-steel-500 ml-2">
                          {item.customer}
                        </span>
                      </div>
                      {item.dueDate && (
                        <span className="text-xs text-steel-500">
                          Due: {new Date(item.dueDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                        </span>
                      )}
                    </button>
                  ))}

                  {items.length > maxItems && (
                    <button
                      onClick={handleViewAllUnscheduled}
                      className="w-full text-xs text-steel-500 hover:text-rail-600 py-1"
                    >
                      +{items.length - maxItems} more...
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {needsScheduling.length === 0 && (
            <div className="text-center py-8">
              <CheckCircleIcon className="h-12 w-12 text-green-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-green-700">All caught up!</p>
              <p className="text-xs text-steel-500 mt-1">No cars need immediate scheduling</p>
            </div>
          )}
        </div>

        {needsScheduling.length > 0 && (
          <div className="border-t border-steel-200 px-4 py-3">
            <button
              onClick={handleViewAllUnscheduled}
              className="w-full flex items-center justify-center gap-2 text-sm font-medium text-red-700 hover:text-red-800"
            >
              View All Unscheduled
              <ArrowRightIcon className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Right Panel: Scheduled */}
      <div className="bg-white rounded-lg border border-steel-200 overflow-hidden">
        <div className="bg-green-50 border-b border-green-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-600" />
              <h3 className="font-semibold text-green-900">Scheduled</h3>
            </div>
            <span className="px-2 py-1 text-sm font-bold rounded-full bg-green-100 text-green-800 border border-green-300">
              {scheduled.length}
            </span>
          </div>
          <p className="text-xs text-green-700 mt-1">
            Cars with confirmed shop assignments
          </p>
        </div>

        <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
          {groupedScheduled.map(([month, items]) => (
            <div key={month}>
              <div className="flex items-center gap-2 mb-2 px-2 py-1 rounded bg-green-50">
                <CalendarIcon className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-700">
                  {month === 'Unassigned' ? month : new Date(month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </span>
                <span className="ml-auto px-1.5 py-0.5 text-xs font-bold rounded-full border bg-green-100 text-green-800 border-green-300">
                  {items.length}
                </span>
              </div>

              <div className="space-y-1">
                {items.slice(0, maxItems).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-green-200 bg-green-50 hover:shadow-sm transition-shadow text-left"
                  >
                    <div>
                      <span className="font-medium text-steel-900">
                        {item.carNumber}
                      </span>
                      <span className="text-xs text-steel-500 ml-2">
                        {item.customer}
                      </span>
                    </div>
                    {item.shopName && (
                      <span className="text-xs text-green-600 font-medium">
                        {item.shopName}
                      </span>
                    )}
                  </button>
                ))}

                {items.length > maxItems && (
                  <button
                    onClick={handleViewAllScheduled}
                    className="w-full text-xs text-steel-500 hover:text-rail-600 py-1"
                  >
                    +{items.length - maxItems} more...
                  </button>
                )}
              </div>
            </div>
          ))}

          {scheduled.length === 0 && (
            <div className="text-center py-8">
              <CalendarIcon className="h-12 w-12 text-steel-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-steel-600">No scheduled cars</p>
              <p className="text-xs text-steel-500 mt-1">Schedule cars from the needs list</p>
            </div>
          )}
        </div>

        {scheduled.length > 0 && (
          <div className="border-t border-steel-200 px-4 py-3">
            <button
              onClick={handleViewAllScheduled}
              className="w-full flex items-center justify-center gap-2 text-sm font-medium text-green-700 hover:text-green-800"
            >
              View Full Schedule
              <ArrowRightIcon className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Compact version for embedding in other pages
export function SchedulingStatusSummary({
  urgent,
  mustShop,
  upcoming,
  scheduled,
  onClick,
}: {
  urgent: number;
  mustShop: number;
  upcoming: number;
  scheduled: number;
  onClick?: (type: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <span className="text-xs text-steel-500">Needs Scheduling:</span>
        <button
          onClick={() => onClick?.('urgent')}
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-100 border border-red-300 text-red-800 text-xs font-semibold hover:bg-red-200 transition-colors"
          title="Urgent - Overdue"
        >
          <ExclamationTriangleIcon className="h-3 w-3" />
          {urgent}
        </button>
        <button
          onClick={() => onClick?.('must_shop')}
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-100 border border-amber-300 text-amber-800 text-xs font-semibold hover:bg-amber-200 transition-colors"
          title="Must Shop This Year"
        >
          <ClockIcon className="h-3 w-3" />
          {mustShop}
        </button>
        <button
          onClick={() => onClick?.('upcoming')}
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-100 border border-blue-300 text-blue-800 text-xs font-semibold hover:bg-blue-200 transition-colors"
          title="Upcoming (Next Year)"
        >
          <CalendarIcon className="h-3 w-3" />
          {upcoming}
        </button>
      </div>
      <div className="h-4 w-px bg-steel-300" />
      <div className="flex items-center gap-2">
        <span className="text-xs text-steel-500">Scheduled:</span>
        <button
          onClick={() => onClick?.('scheduled')}
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-100 border border-green-300 text-green-800 text-xs font-semibold hover:bg-green-200 transition-colors"
          title="Scheduled for Shop"
        >
          <CheckCircleIcon className="h-3 w-3" />
          {scheduled}
        </button>
      </div>
    </div>
  );
}
