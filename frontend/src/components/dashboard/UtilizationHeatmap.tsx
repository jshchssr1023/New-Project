/**
 * Utilization Heatmap Component
 *
 * Displays shop utilization with color-coded bars:
 * - Green: < 80% (Healthy)
 * - Yellow: 80-89% (Warning - approaching capacity)
 * - Red: >= 90% (Critical - over capacity)
 * - Blue: < 50% (Under-utilized)
 */

import { useState, useEffect } from 'react';
import {
  ChartBarIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  BuildingStorefrontIcon,
} from '@heroicons/react/24/outline';

interface MonthlyData {
  month: string;
  capacity: number;
  used: number;
  available: number;
  utilization: number;
  color: 'green' | 'yellow' | 'red' | 'blue';
}

interface ShopHeatmapData {
  shopId: string;
  shopCode: string;
  shopName: string;
  isAitxInternal: boolean;
  is3rdParty: boolean;
  tankQualified: boolean;
  hasContractualCommitment: boolean;
  monthlyData: MonthlyData[];
}

interface HeatmapSummary {
  totalShops: number;
  aitxShops: number;
  thirdPartyShops: number;
  overCapacityAlerts: number;
  underUtilizedShops: number;
}

interface UtilizationHeatmapProps {
  data?: {
    months: string[];
    shops: ShopHeatmapData[];
    summary: HeatmapSummary;
  };
  isLoading?: boolean;
  compact?: boolean;
  showSummary?: boolean;
  onShopClick?: (shopId: string) => void;
}

const COLOR_CLASSES = {
  green: {
    bg: 'bg-emerald-500',
    bgLight: 'bg-emerald-100',
    text: 'text-emerald-700',
    border: 'border-emerald-300',
  },
  yellow: {
    bg: 'bg-amber-500',
    bgLight: 'bg-amber-100',
    text: 'text-amber-700',
    border: 'border-amber-300',
  },
  red: {
    bg: 'bg-red-500',
    bgLight: 'bg-red-100',
    text: 'text-red-700',
    border: 'border-red-300',
  },
  blue: {
    bg: 'bg-blue-500',
    bgLight: 'bg-blue-100',
    text: 'text-blue-700',
    border: 'border-blue-300',
  },
};

export default function UtilizationHeatmap({
  data,
  isLoading = false,
  compact = false,
  showSummary = true,
  onShopClick,
}: UtilizationHeatmapProps) {
  const [hoveredCell, setHoveredCell] = useState<{ shopId: string; month: string } | null>(null);
  const [filter, setFilter] = useState<'all' | 'aitx' | '3p' | 'critical'>('all');

  // Filter shops based on selected filter
  const filteredShops = data?.shops.filter(shop => {
    if (filter === 'aitx') return shop.isAitxInternal;
    if (filter === '3p') return shop.is3rdParty;
    if (filter === 'critical') return shop.monthlyData.some(m => m.utilization >= 90);
    return true;
  }) || [];

  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-steel-200 rounded w-48 mb-4" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-8 bg-steel-100 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.shops.length === 0) {
    return (
      <div className="text-center py-8 text-steel-500">
        <ChartBarIcon className="h-12 w-12 mx-auto mb-2 text-steel-300" />
        <p>No utilization data available</p>
      </div>
    );
  }

  const formatMonth = (monthKey: string) => {
    const [year, month] = monthKey.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'short' });
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      {showSummary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-steel-50 rounded-lg p-3 border border-steel-200">
            <div className="flex items-center gap-2">
              <BuildingStorefrontIcon className="h-5 w-5 text-steel-500" />
              <span className="text-sm text-steel-600">Total Shops</span>
            </div>
            <p className="text-2xl font-bold text-steel-900 mt-1">{data.summary.totalShops}</p>
            <p className="text-xs text-steel-500">
              AITX: {data.summary.aitxShops} | 3P: {data.summary.thirdPartyShops}
            </p>
          </div>

          <div className={`rounded-lg p-3 border ${data.summary.overCapacityAlerts > 0 ? 'bg-red-50 border-red-200' : 'bg-steel-50 border-steel-200'}`}>
            <div className="flex items-center gap-2">
              <ExclamationTriangleIcon className={`h-5 w-5 ${data.summary.overCapacityAlerts > 0 ? 'text-red-600' : 'text-steel-500'}`} />
              <span className={`text-sm ${data.summary.overCapacityAlerts > 0 ? 'text-red-700' : 'text-steel-600'}`}>Over Capacity</span>
            </div>
            <p className={`text-2xl font-bold mt-1 ${data.summary.overCapacityAlerts > 0 ? 'text-red-700' : 'text-steel-900'}`}>
              {data.summary.overCapacityAlerts}
            </p>
            <p className="text-xs text-steel-500">shops at 90%+</p>
          </div>

          <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
            <div className="flex items-center gap-2">
              <CheckCircleIcon className="h-5 w-5 text-emerald-600" />
              <span className="text-sm text-emerald-700">Healthy</span>
            </div>
            <p className="text-2xl font-bold text-emerald-700 mt-1">
              {data.summary.totalShops - data.summary.overCapacityAlerts - data.summary.underUtilizedShops}
            </p>
            <p className="text-xs text-steel-500">shops at 50-89%</p>
          </div>

          <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
            <div className="flex items-center gap-2">
              <ArrowTrendingDownIcon className="h-5 w-5 text-blue-600" />
              <span className="text-sm text-blue-700">Under-Utilized</span>
            </div>
            <p className="text-2xl font-bold text-blue-700 mt-1">{data.summary.underUtilizedShops}</p>
            <p className="text-xs text-steel-500">shops below 50%</p>
          </div>
        </div>
      )}

      {/* Filter Buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-steel-500">Filter:</span>
        {[
          { key: 'all', label: 'All Shops' },
          { key: 'aitx', label: 'AITX Only' },
          { key: '3p', label: '3rd Party' },
          { key: 'critical', label: 'Critical Only' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key as typeof filter)}
            className={`px-3 py-1 text-sm rounded-full transition-colors ${
              filter === key
                ? key === 'critical'
                  ? 'bg-red-600 text-white'
                  : 'bg-rail-600 text-white'
                : 'bg-steel-100 text-steel-700 hover:bg-steel-200'
            }`}
          >
            {label}
            {key !== 'all' && (
              <span className="ml-1">
                ({key === 'aitx' ? data.summary.aitxShops :
                  key === '3p' ? data.summary.thirdPartyShops :
                  key === 'critical' ? data.summary.overCapacityAlerts : ''})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Heatmap Grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-steel-200">
              <th className="text-left py-2 px-3 text-xs font-medium text-steel-500 uppercase sticky left-0 bg-white z-10">
                Shop
              </th>
              {data.months.map(month => (
                <th key={month} className="text-center py-2 px-2 text-xs font-medium text-steel-500 uppercase min-w-[60px]">
                  {formatMonth(month)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-steel-100">
            {filteredShops.map(shop => (
              <tr
                key={shop.shopId}
                className="hover:bg-steel-50 cursor-pointer"
                onClick={() => onShopClick?.(shop.shopId)}
              >
                <td className="py-2 px-3 sticky left-0 bg-white z-10">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${shop.isAitxInternal ? 'bg-rail-500' : 'bg-amber-500'}`} />
                    <div>
                      <span className="font-medium text-steel-900">{shop.shopCode}</span>
                      {!compact && (
                        <span className="text-steel-500 ml-1 text-xs">
                          {shop.shopName.substring(0, 20)}
                          {shop.shopName.length > 20 ? '...' : ''}
                        </span>
                      )}
                      {shop.hasContractualCommitment && (
                        <span className="ml-1 text-xs text-amber-600" title="Has contractual commitment">
                          [3P]
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                {shop.monthlyData.map(monthData => {
                  const colors = COLOR_CLASSES[monthData.color];
                  const isHovered = hoveredCell?.shopId === shop.shopId && hoveredCell?.month === monthData.month;

                  return (
                    <td
                      key={monthData.month}
                      className="py-2 px-1 relative"
                      onMouseEnter={() => setHoveredCell({ shopId: shop.shopId, month: monthData.month })}
                      onMouseLeave={() => setHoveredCell(null)}
                    >
                      <div className={`relative h-6 rounded ${colors.bgLight}`}>
                        <div
                          className={`absolute left-0 top-0 h-full rounded ${colors.bg} transition-all`}
                          style={{ width: `${Math.min(monthData.utilization, 100)}%` }}
                        />
                        <span className={`absolute inset-0 flex items-center justify-center text-xs font-medium ${
                          monthData.utilization >= 50 ? 'text-white' : colors.text
                        }`}>
                          {monthData.utilization}%
                        </span>
                      </div>

                      {/* Tooltip */}
                      {isHovered && (
                        <div className="absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-steel-900 text-white text-xs rounded-lg shadow-lg whitespace-nowrap">
                          <p className="font-medium">{shop.shopName}</p>
                          <p>{formatMonth(monthData.month)} {monthData.month.split('-')[0]}</p>
                          <div className="mt-1 pt-1 border-t border-steel-700">
                            <p>Used: {monthData.used} / {monthData.capacity}</p>
                            <p>Available: {monthData.available}</p>
                            <p>Utilization: {monthData.utilization}%</p>
                          </div>
                          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full">
                            <div className="border-8 border-transparent border-t-steel-900" />
                          </div>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 pt-2 border-t border-steel-200">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-blue-500" />
          <span className="text-xs text-steel-600">&lt; 50% Under</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-emerald-500" />
          <span className="text-xs text-steel-600">50-79% Healthy</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-amber-500" />
          <span className="text-xs text-steel-600">80-89% Warning</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-red-500" />
          <span className="text-xs text-steel-600">&gt;= 90% Critical</span>
        </div>
      </div>
    </div>
  );
}
