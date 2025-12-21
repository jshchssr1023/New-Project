/**
 * Inventory Funnel Component
 *
 * Provides a "Source of Truth" visualization for the entire fleet:
 * - Total fleet inventory at top
 * - Unassigned demand breakdown
 * - Network capacity summary
 * - Coverage ratio indicator
 */

import {
  TruckIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  CalendarIcon,
  BuildingStorefrontIcon,
  ArrowTrendingUpIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';

interface FunnelData {
  totalFleet: number;
  unassigned: {
    total: number;
    urgent: number;
    mustShop: number;
    upcoming: number;
  };
  networkCapacity: {
    total: number;
    aitx: number;
    thirdParty: number;
  };
  coverageRatio: number; // capacity / demand as percentage
  assigned: {
    inShop: number;
    planned: number;
    inTransit: number;
  };
}

interface InventoryFunnelProps {
  data?: FunnelData;
  isLoading?: boolean;
  onSectionClick?: (section: 'urgent' | 'mustShop' | 'upcoming' | 'aitx' | '3p') => void;
}

export default function InventoryFunnel({
  data,
  isLoading = false,
  onSectionClick,
}: InventoryFunnelProps) {
  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-24 bg-steel-200 rounded-lg" />
        <div className="h-32 bg-steel-200 rounded-lg" />
        <div className="h-32 bg-steel-200 rounded-lg" />
        <div className="h-16 bg-steel-200 rounded-lg" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-8 text-steel-500">
        <TruckIcon className="h-12 w-12 mx-auto mb-2 text-steel-300" />
        <p>No inventory data available</p>
      </div>
    );
  }

  const getCoverageColor = () => {
    if (data.coverageRatio >= 120) return 'text-emerald-600';
    if (data.coverageRatio >= 100) return 'text-green-600';
    if (data.coverageRatio >= 80) return 'text-amber-600';
    return 'text-red-600';
  };

  const getCoverageBg = () => {
    if (data.coverageRatio >= 120) return 'bg-emerald-50 border-emerald-200';
    if (data.coverageRatio >= 100) return 'bg-green-50 border-green-200';
    if (data.coverageRatio >= 80) return 'bg-amber-50 border-amber-200';
    return 'bg-red-50 border-red-200';
  };

  return (
    <div className="space-y-3">
      {/* Top of Funnel - Total Fleet */}
      <div className="bg-steel-800 text-white rounded-t-xl p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-rail-600/20 to-transparent" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 rounded-lg p-2">
              <TruckIcon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-steel-300">Total Fleet</p>
              <p className="text-3xl font-bold">{data.totalFleet.toLocaleString()}</p>
            </div>
          </div>
          <div className="text-right text-sm text-steel-400">
            <p>Cars in inventory</p>
            <p className="text-xs">Source of Truth</p>
          </div>
        </div>
      </div>

      {/* Funnel Body - Two Columns */}
      <div className="grid grid-cols-2 gap-3">
        {/* Left Column - Demand (Unassigned) */}
        <div className="space-y-2">
          <div className="text-center text-xs font-medium text-steel-500 uppercase tracking-wide">
            Demand (Unassigned)
          </div>

          {/* Total Unassigned */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
                <span className="font-medium text-red-700">Unassigned</span>
              </div>
              <span className="text-2xl font-bold text-red-700">{data.unassigned.total.toLocaleString()}</span>
            </div>
          </div>

          {/* Breakdown by Urgency */}
          <div className="space-y-1.5 pl-4 border-l-2 border-red-200">
            {/* Urgent */}
            <button
              onClick={() => onSectionClick?.('urgent')}
              className="w-full flex items-center justify-between p-2 rounded-lg bg-red-100 hover:bg-red-200 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                <span className="text-sm font-medium text-red-800">Urgent</span>
              </div>
              <span className="text-sm font-bold text-red-700">{data.unassigned.urgent}</span>
            </button>

            {/* Must Shop */}
            <button
              onClick={() => onSectionClick?.('mustShop')}
              className="w-full flex items-center justify-between p-2 rounded-lg bg-amber-100 hover:bg-amber-200 transition-colors"
            >
              <div className="flex items-center gap-2">
                <ClockIcon className="h-4 w-4 text-amber-700" />
                <span className="text-sm font-medium text-amber-800">Must Shop</span>
              </div>
              <span className="text-sm font-bold text-amber-700">{data.unassigned.mustShop}</span>
            </button>

            {/* Upcoming */}
            <button
              onClick={() => onSectionClick?.('upcoming')}
              className="w-full flex items-center justify-between p-2 rounded-lg bg-blue-100 hover:bg-blue-200 transition-colors"
            >
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-blue-700" />
                <span className="text-sm font-medium text-blue-800">Upcoming</span>
              </div>
              <span className="text-sm font-bold text-blue-700">{data.unassigned.upcoming}</span>
            </button>
          </div>
        </div>

        {/* Right Column - Supply (Network Capacity) */}
        <div className="space-y-2">
          <div className="text-center text-xs font-medium text-steel-500 uppercase tracking-wide">
            Supply (Capacity/mo)
          </div>

          {/* Total Capacity */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BuildingStorefrontIcon className="h-5 w-5 text-emerald-600" />
                <span className="font-medium text-emerald-700">Network</span>
              </div>
              <span className="text-2xl font-bold text-emerald-700">{data.networkCapacity.total.toLocaleString()}</span>
            </div>
          </div>

          {/* Breakdown by Network Type */}
          <div className="space-y-1.5 pl-4 border-l-2 border-emerald-200">
            {/* AITX Internal */}
            <button
              onClick={() => onSectionClick?.('aitx')}
              className="w-full flex items-center justify-between p-2 rounded-lg bg-rail-100 hover:bg-rail-200 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rail-600" />
                <span className="text-sm font-medium text-rail-800">AITX Internal</span>
              </div>
              <span className="text-sm font-bold text-rail-700">{data.networkCapacity.aitx}/mo</span>
            </button>

            {/* 3rd Party */}
            <button
              onClick={() => onSectionClick?.('3p')}
              className="w-full flex items-center justify-between p-2 rounded-lg bg-amber-100 hover:bg-amber-200 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-600" />
                <span className="text-sm font-medium text-amber-800">3rd Party</span>
              </div>
              <span className="text-sm font-bold text-amber-700">{data.networkCapacity.thirdParty}/mo</span>
            </button>
          </div>
        </div>
      </div>

      {/* Currently Assigned Stats */}
      <div className="bg-steel-50 border border-steel-200 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-steel-700">Currently Assigned</span>
          <span className="text-lg font-bold text-steel-900">
            {(data.assigned.inShop + data.assigned.planned + data.assigned.inTransit).toLocaleString()}
          </span>
        </div>
        <div className="flex gap-4 text-xs">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-steel-600">In Shop: {data.assigned.inShop}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-steel-600">Planned: {data.assigned.planned}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-steel-600">Transit: {data.assigned.inTransit}</span>
          </div>
        </div>
      </div>

      {/* Bottom of Funnel - Coverage Ratio */}
      <div className={`rounded-b-xl p-4 border ${getCoverageBg()}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {data.coverageRatio >= 100 ? (
              <CheckCircleIcon className={`h-8 w-8 ${getCoverageColor()}`} />
            ) : (
              <ExclamationTriangleIcon className={`h-8 w-8 ${getCoverageColor()}`} />
            )}
            <div>
              <p className="text-sm text-steel-600">Coverage Ratio</p>
              <p className={`text-2xl font-bold ${getCoverageColor()}`}>
                {data.coverageRatio}%
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-steel-500">Capacity vs Demand</p>
            <p className={`text-sm font-medium ${getCoverageColor()}`}>
              {data.coverageRatio >= 100 ? 'Sufficient' : 'At Risk'}
            </p>
          </div>
        </div>

        {/* Coverage Bar */}
        <div className="mt-3">
          <div className="h-3 bg-steel-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                data.coverageRatio >= 100 ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
              style={{ width: `${Math.min(data.coverageRatio, 150)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-steel-500 mt-1">
            <span>0%</span>
            <span className="font-medium">100% = Balanced</span>
            <span>150%+</span>
          </div>
        </div>
      </div>
    </div>
  );
}
