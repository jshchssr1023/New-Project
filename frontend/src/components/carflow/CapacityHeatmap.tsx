/**
 * CapacityHeatmap - Visualization of shop capacity by month
 *
 * Displays a heatmap showing:
 * - S&OP Committed capacity per shop/month
 * - Current planned usage (from Car Flow Plans)
 * - Draft scenario usage (optional)
 * - Available capacity
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BuildingStorefrontIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  MinusCircleIcon,
} from '@heroicons/react/24/outline';
import { capacityApi } from '../../services/carFlowApi';
import type { ShopCapacity, ShopCapacityMonth } from '../../types/carFlow';

interface CapacityHeatmapProps {
  year: number;
  scenarioId?: string | null;
  onCellClick?: (shopId: string, month: number) => void;
  highlightedCells?: Array<{ shopId: string; month: number }>;
  compact?: boolean;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// Get color based on utilization percentage
function getCapacityColor(available: number, committed: number): string {
  if (committed === 0) return 'bg-gray-100 text-gray-500';

  const utilization = 1 - (available / committed);

  if (available < 0) {
    // Over-allocated
    return 'bg-red-200 text-red-800 border-red-300';
  } else if (utilization >= 0.9) {
    // 90%+ utilized - critical
    return 'bg-amber-200 text-amber-800 border-amber-300';
  } else if (utilization >= 0.7) {
    // 70-90% utilized - warning
    return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  } else if (utilization >= 0.3) {
    // 30-70% utilized - normal
    return 'bg-green-100 text-green-800 border-green-200';
  } else {
    // <30% utilized - underutilized
    return 'bg-blue-50 text-blue-700 border-blue-200';
  }
}

function getCapacityIcon(available: number, committed: number) {
  if (committed === 0) return null;
  if (available < 0) {
    return <ExclamationTriangleIcon className="h-3 w-3 text-red-600" />;
  } else if (available === 0) {
    return <MinusCircleIcon className="h-3 w-3 text-amber-600" />;
  } else if (available < committed * 0.3) {
    return <CheckCircleIcon className="h-3 w-3 text-green-600" />;
  }
  return null;
}

export default function CapacityHeatmap({
  year,
  scenarioId,
  onCellClick,
  highlightedCells = [],
  compact = false,
}: CapacityHeatmapProps) {
  // Fetch capacity data
  const { data: capacityData, isLoading, error } = useQuery({
    queryKey: ['capacity', year, scenarioId],
    queryFn: () => capacityApi.getCapacity(year, scenarioId || undefined),
  });

  const capacity = capacityData?.capacity || [];

  // Create lookup for highlighted cells
  const highlightedLookup = useMemo(() => {
    const lookup = new Set<string>();
    highlightedCells.forEach(({ shopId, month }) => {
      lookup.add(`${shopId}-${month}`);
    });
    return lookup;
  }, [highlightedCells]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rail-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
        <ExclamationTriangleIcon className="h-6 w-6 text-red-500 mx-auto mb-2" />
        <p className="text-sm text-red-700">Failed to load capacity data</p>
      </div>
    );
  }

  if (capacity.length === 0) {
    return (
      <div className="bg-steel-50 border border-steel-200 rounded-lg p-6 text-center">
        <BuildingStorefrontIcon className="h-8 w-8 text-steel-400 mx-auto mb-2" />
        <p className="text-sm text-steel-600">No capacity data available for {year}</p>
        <p className="text-xs text-steel-500 mt-1">
          Configure S&OP commitments to see capacity
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className={`min-w-full border-collapse ${compact ? 'text-xs' : 'text-sm'}`}>
        <thead>
          <tr className="bg-steel-50">
            <th className={`sticky left-0 bg-steel-50 border border-steel-200 ${compact ? 'px-2 py-1' : 'px-3 py-2'} text-left font-medium text-steel-700`}>
              Shop
            </th>
            {MONTHS.map((month, idx) => (
              <th
                key={month}
                className={`border border-steel-200 ${compact ? 'px-1 py-1' : 'px-2 py-2'} text-center font-medium text-steel-700`}
              >
                {month}
              </th>
            ))}
            <th className={`border border-steel-200 ${compact ? 'px-2 py-1' : 'px-3 py-2'} text-center font-medium text-steel-700 bg-steel-100`}>
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {capacity.map((shopCapacity) => {
            const monthsData = shopCapacity.months;
            const totalCommitted = Object.values(monthsData).reduce(
              (sum, m) => sum + (m?.committed || 0),
              0
            );
            const totalPlanned = Object.values(monthsData).reduce(
              (sum, m) => sum + (m?.planned || 0) + (m?.draftUsage || 0),
              0
            );

            return (
              <tr key={shopCapacity.shopId} className="hover:bg-steel-50">
                {/* Shop Name */}
                <td
                  className={`sticky left-0 bg-white border border-steel-200 ${compact ? 'px-2 py-1' : 'px-3 py-2'} font-medium text-steel-900 whitespace-nowrap`}
                >
                  <div className="flex items-center gap-2">
                    <BuildingStorefrontIcon className="h-4 w-4 text-steel-400 flex-shrink-0" />
                    <div>
                      <div className="font-medium">{shopCapacity.shop.name}</div>
                      {!compact && (
                        <div className="text-xs text-steel-500">
                          {shopCapacity.shop.city}, {shopCapacity.shop.state}
                        </div>
                      )}
                    </div>
                  </div>
                </td>

                {/* Month Cells */}
                {MONTHS.map((_, monthIdx) => {
                  const monthData = monthsData[monthIdx + 1] || {
                    committed: 0,
                    planned: 0,
                    draftUsage: 0,
                    available: 0,
                  };
                  const isHighlighted = highlightedLookup.has(
                    `${shopCapacity.shopId}-${monthIdx + 1}`
                  );
                  const colorClass = getCapacityColor(
                    monthData.available,
                    monthData.committed
                  );
                  const icon = getCapacityIcon(monthData.available, monthData.committed);

                  return (
                    <td
                      key={monthIdx}
                      onClick={() => onCellClick?.(shopCapacity.shopId, monthIdx + 1)}
                      className={`border border-steel-200 ${compact ? 'px-1 py-1' : 'px-2 py-2'} text-center transition-all ${colorClass} ${
                        onCellClick ? 'cursor-pointer hover:ring-2 hover:ring-rail-400' : ''
                      } ${isHighlighted ? 'ring-2 ring-rail-500 ring-inset' : ''}`}
                    >
                      {monthData.committed > 0 ? (
                        <div className="flex flex-col items-center">
                          <div className="flex items-center gap-1">
                            {icon}
                            <span className="font-semibold">
                              {monthData.planned + monthData.draftUsage}
                            </span>
                          </div>
                          <div className="text-xs opacity-75">
                            / {monthData.committed}
                          </div>
                          {monthData.draftUsage > 0 && (
                            <div className="text-xs text-amber-600 font-medium">
                              +{monthData.draftUsage}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-steel-400">-</span>
                      )}
                    </td>
                  );
                })}

                {/* Total Column */}
                <td
                  className={`border border-steel-200 ${compact ? 'px-2 py-1' : 'px-3 py-2'} text-center bg-steel-50 font-medium`}
                >
                  <div className="text-steel-900">{totalPlanned}</div>
                  <div className="text-xs text-steel-500">/ {totalCommitted}</div>
                </td>
              </tr>
            );
          })}
        </tbody>

        {/* Footer Row with Totals */}
        <tfoot>
          <tr className="bg-steel-100">
            <td
              className={`sticky left-0 bg-steel-100 border border-steel-200 ${compact ? 'px-2 py-1' : 'px-3 py-2'} font-semibold text-steel-900`}
            >
              Monthly Total
            </td>
            {MONTHS.map((_, monthIdx) => {
              const monthTotal = capacity.reduce((sum, shop) => {
                const monthData = shop.months[monthIdx + 1];
                return sum + (monthData?.planned || 0) + (monthData?.draftUsage || 0);
              }, 0);
              const monthCommitted = capacity.reduce((sum, shop) => {
                const monthData = shop.months[monthIdx + 1];
                return sum + (monthData?.committed || 0);
              }, 0);

              return (
                <td
                  key={monthIdx}
                  className={`border border-steel-200 ${compact ? 'px-1 py-1' : 'px-2 py-2'} text-center font-semibold`}
                >
                  <div className="text-steel-900">{monthTotal}</div>
                  <div className="text-xs text-steel-500">/ {monthCommitted}</div>
                </td>
              );
            })}
            <td
              className={`border border-steel-200 ${compact ? 'px-2 py-1' : 'px-3 py-2'} text-center font-semibold bg-steel-200`}
            >
              {capacity.reduce((sum, shop) => {
                return (
                  sum +
                  Object.values(shop.months).reduce(
                    (m, data) => m + (data?.planned || 0) + (data?.draftUsage || 0),
                    0
                  )
                );
              }, 0)}
            </td>
          </tr>
        </tfoot>
      </table>

      {/* Legend */}
      {!compact && (
        <div className="flex items-center gap-4 mt-3 text-xs text-steel-600">
          <span className="font-medium">Legend:</span>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-red-200 border border-red-300"></div>
            <span>Over-allocated</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-amber-200 border border-amber-300"></div>
            <span>90%+</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-yellow-100 border border-yellow-200"></div>
            <span>70-90%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-green-100 border border-green-200"></div>
            <span>30-70%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-blue-50 border border-blue-200"></div>
            <span>&lt;30%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-gray-100 border border-gray-200"></div>
            <span>No commitment</span>
          </div>
        </div>
      )}
    </div>
  );
}
