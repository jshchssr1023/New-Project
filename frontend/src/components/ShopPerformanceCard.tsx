import { useState, useEffect } from 'react';
import {
  ChartBarIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  CurrencyDollarIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { shopPerformanceApi, ShopScorecard, ShopPerformanceMetrics } from '../services/api';

interface ShopPerformanceCardProps {
  shopId: string;
  shopName: string;
  compact?: boolean;
  onRefresh?: () => void;
}

// Metric card for displaying individual metrics
function MetricCard({
  label,
  value,
  unit,
  icon: Icon,
  trend,
  trendValue,
  colorClass,
}: {
  label: string;
  value: number;
  unit: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: number;
  colorClass: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-steel-200 p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-steel-500">{label}</span>
        <Icon className={`h-4 w-4 ${colorClass}`} />
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-xl font-bold ${colorClass}`}>{value.toFixed(1)}</span>
        <span className="text-xs text-steel-400">{unit}</span>
      </div>
      {trend && trendValue !== undefined && (
        <div className={`flex items-center gap-1 mt-1 text-xs ${
          trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-steel-500'
        }`}>
          {trend === 'up' ? (
            <ArrowTrendingUpIcon className="h-3 w-3" />
          ) : trend === 'down' ? (
            <ArrowTrendingDownIcon className="h-3 w-3" />
          ) : null}
          <span>{trendValue > 0 ? '+' : ''}{trendValue.toFixed(1)} vs network</span>
        </div>
      )}
    </div>
  );
}

// Performance score gauge
function PerformanceGauge({ score }: { score: number }) {
  const getColor = (s: number) => {
    if (s >= 80) return 'text-green-600';
    if (s >= 60) return 'text-yellow-600';
    if (s >= 40) return 'text-orange-600';
    return 'text-red-600';
  };

  const getBgColor = (s: number) => {
    if (s >= 80) return 'bg-green-100';
    if (s >= 60) return 'bg-yellow-100';
    if (s >= 40) return 'bg-orange-100';
    return 'bg-red-100';
  };

  return (
    <div className="flex flex-col items-center">
      <div className={`relative w-20 h-20 ${getBgColor(score)} rounded-full flex items-center justify-center`}>
        <div className={`text-2xl font-bold ${getColor(score)}`}>
          {score.toFixed(0)}
        </div>
        <div className="absolute -bottom-1 text-xs text-steel-500">/ 100</div>
      </div>
      <span className="mt-2 text-sm font-medium text-steel-700">Performance Score</span>
    </div>
  );
}

export default function ShopPerformanceCard({
  shopId,
  shopName,
  compact = false,
  onRefresh,
}: ShopPerformanceCardProps) {
  const [scorecard, setScorecard] = useState<ShopScorecard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadScorecard();
  }, [shopId]);

  const loadScorecard = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await shopPerformanceApi.getShopScorecard(shopId);
      setScorecard(data);
    } catch (err) {
      setError('Failed to load performance data');
      console.error('Failed to load shop performance:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      await shopPerformanceApi.calculatePerformance(shopId, 'monthly');
      loadScorecard();
      onRefresh?.();
    } catch (err) {
      console.error('Failed to refresh performance:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-steel-50 rounded-lg p-4 animate-pulse">
        <div className="h-6 bg-steel-200 rounded w-1/3 mb-4"></div>
        <div className="grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 bg-steel-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !scorecard) {
    return (
      <div className="bg-steel-50 rounded-lg p-4">
        <p className="text-steel-500 text-sm">{error || 'No performance data available'}</p>
        <button onClick={loadScorecard} className="text-rail-600 text-sm hover:underline mt-2">
          Retry
        </button>
      </div>
    );
  }

  const { metrics, comparison, alerts } = scorecard;

  if (compact) {
    // Compact view for list displays
    return (
      <div className="bg-white rounded-lg border border-steel-200 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ChartBarIcon className="h-5 w-5 text-steel-400" />
            <span className="font-medium text-steel-800">Performance</span>
          </div>
          <div className={`text-lg font-bold ${
            metrics.performanceScore >= 70 ? 'text-green-600' :
            metrics.performanceScore >= 50 ? 'text-yellow-600' : 'text-red-600'
          }`}>
            {metrics.performanceScore.toFixed(0)}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div>
            <span className="text-steel-500">TAT</span>
            <p className="font-medium">{metrics.averageTurnTime.toFixed(1)}d</p>
          </div>
          <div>
            <span className="text-steel-500">OTP</span>
            <p className="font-medium">{metrics.onTimeRate.toFixed(0)}%</p>
          </div>
          <div>
            <span className="text-steel-500">Rework</span>
            <p className="font-medium">{metrics.reworkRate.toFixed(1)}%</p>
          </div>
          <div>
            <span className="text-steel-500">Cost Var</span>
            <p className="font-medium">{metrics.costVariance > 0 ? '+' : ''}{metrics.costVariance.toFixed(0)}%</p>
          </div>
        </div>
        {alerts.length > 0 && (
          <div className="mt-2 flex items-center gap-1 text-xs">
            <ExclamationTriangleIcon className={`h-4 w-4 ${
              alerts.some(a => a.type === 'critical') ? 'text-red-500' : 'text-yellow-500'
            }`} />
            <span className={alerts.some(a => a.type === 'critical') ? 'text-red-600' : 'text-yellow-600'}>
              {alerts.length} alert{alerts.length > 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>
    );
  }

  // Full view
  return (
    <div className="bg-white rounded-lg border border-steel-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-steel-200 flex items-center justify-between bg-steel-50">
        <div className="flex items-center gap-2">
          <ChartBarIcon className="h-5 w-5 text-rail-600" />
          <h3 className="font-semibold text-steel-800">Performance Scorecard</h3>
          <span className="text-sm text-steel-500">- {shopName}</span>
        </div>
        <button
          onClick={handleRefresh}
          className="p-1 text-steel-400 hover:text-steel-600"
          title="Refresh metrics"
        >
          <ArrowPathIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="p-4">
        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="mb-4 space-y-2">
            {alerts.map((alert, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-2 p-3 rounded-lg ${
                  alert.type === 'critical' ? 'bg-red-50 border border-red-200' : 'bg-yellow-50 border border-yellow-200'
                }`}
              >
                <ExclamationTriangleIcon className={`h-5 w-5 flex-shrink-0 ${
                  alert.type === 'critical' ? 'text-red-500' : 'text-yellow-500'
                }`} />
                <span className={`text-sm ${
                  alert.type === 'critical' ? 'text-red-700' : 'text-yellow-700'
                }`}>
                  {alert.message}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Score Gauge */}
          <div className="flex justify-center lg:justify-start">
            <PerformanceGauge score={metrics.performanceScore} />
          </div>

          {/* Metrics Grid */}
          <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-3">
            <MetricCard
              label="Turn Time (TAT)"
              value={metrics.averageTurnTime}
              unit="days"
              icon={ClockIcon}
              trend={comparison.turnTimeVsNetwork < 0 ? 'up' : comparison.turnTimeVsNetwork > 0 ? 'down' : 'neutral'}
              trendValue={-comparison.turnTimeVsNetwork} // Negative because lower is better
              colorClass={metrics.averageTurnTime <= 14 ? 'text-green-600' : metrics.averageTurnTime <= 21 ? 'text-yellow-600' : 'text-red-600'}
            />
            <MetricCard
              label="On-Time Rate"
              value={metrics.onTimeRate}
              unit="%"
              icon={CheckCircleIcon}
              trend={comparison.onTimeVsNetwork > 0 ? 'up' : comparison.onTimeVsNetwork < 0 ? 'down' : 'neutral'}
              trendValue={comparison.onTimeVsNetwork}
              colorClass={metrics.onTimeRate >= 85 ? 'text-green-600' : metrics.onTimeRate >= 70 ? 'text-yellow-600' : 'text-red-600'}
            />
            <MetricCard
              label="Dwell Time"
              value={metrics.averageDwellTime}
              unit="days"
              icon={ClockIcon}
              trend={comparison.dwellTimeVsNetwork < 0 ? 'up' : comparison.dwellTimeVsNetwork > 0 ? 'down' : 'neutral'}
              trendValue={-comparison.dwellTimeVsNetwork}
              colorClass={metrics.averageDwellTime <= 2 ? 'text-green-600' : metrics.averageDwellTime <= 5 ? 'text-yellow-600' : 'text-red-600'}
            />
            <MetricCard
              label="Rework Rate"
              value={metrics.reworkRate}
              unit="%"
              icon={ArrowPathIcon}
              trend={comparison.reworkVsNetwork < 0 ? 'up' : comparison.reworkVsNetwork > 0 ? 'down' : 'neutral'}
              trendValue={-comparison.reworkVsNetwork}
              colorClass={metrics.reworkRate <= 5 ? 'text-green-600' : metrics.reworkRate <= 10 ? 'text-yellow-600' : 'text-red-600'}
            />
            <MetricCard
              label="Cost Variance"
              value={metrics.costVariance}
              unit="%"
              icon={CurrencyDollarIcon}
              trend={Math.abs(comparison.costVarianceVsNetwork) < Math.abs(metrics.costVariance) ? 'down' : 'up'}
              trendValue={-comparison.costVarianceVsNetwork}
              colorClass={Math.abs(metrics.costVariance) <= 10 ? 'text-green-600' : Math.abs(metrics.costVariance) <= 20 ? 'text-yellow-600' : 'text-red-600'}
            />
          </div>
        </div>

        {/* Turn Time by Repair Type */}
        {Object.keys(metrics.turnTimeByRepairType).length > 0 && (
          <div className="mt-4 pt-4 border-t border-steel-200">
            <h4 className="text-sm font-medium text-steel-700 mb-2">Turn Time by Repair Type</h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries(metrics.turnTimeByRepairType).map(([type, days]) => (
                <span
                  key={type}
                  className="px-2 py-1 bg-steel-100 rounded text-xs text-steel-700"
                >
                  {type}: <strong>{(days as number).toFixed(1)} days</strong>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Period Info */}
        <div className="mt-4 pt-3 border-t border-steel-100 flex items-center justify-between text-xs text-steel-500">
          <span>
            Period: {scorecard.periodType === 'estimated' ? 'Estimated' : (
              `${scorecard.periodStart ? new Date(scorecard.periodStart).toLocaleDateString() : 'N/A'} - ${
                scorecard.periodEnd ? new Date(scorecard.periodEnd).toLocaleDateString() : 'N/A'
              }`
            )}
          </span>
          {scorecard.periodType === 'estimated' && (
            <span className="text-yellow-600">Metrics based on shop configuration (no historical data)</span>
          )}
        </div>
      </div>
    </div>
  );
}
