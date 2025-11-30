import { useState, useEffect } from 'react';
import {
  ArrowDownTrayIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ChartBarIcon,
  ClockIcon,
  TruckIcon,
  BuildingStorefrontIcon,
  CurrencyDollarIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext';

interface KPI {
  value: number;
  unit: string;
  trend: number;
  status: 'good' | 'warning' | 'critical';
}

interface KPIsData {
  kpis: {
    onTimePerformance: KPI;
    mttr: KPI;
    shopUtilization: KPI;
    costEfficiency: KPI;
    fleetAvailability: KPI;
    reworkRate: KPI;
  };
  volumeMetrics: {
    currentMonth: number;
    previousMonth: number;
    change: number;
    totalYTD: number;
    totalEstimatedCost: number;
  };
}

interface ForecastMonth {
  month: string;
  label: string;
  totalCapacity: number;
  totalPlanned: number;
  totalProjected: number;
  utilization: number;
  shops: Array<{
    shopId: string;
    shopName: string;
    capacity: number;
    planned: number;
    utilization: number;
    available: number;
  }>;
}

interface FleetData {
  statusDistribution: Array<{ status: string; count: number }>;
  typeDistribution: Array<{ type: string; count: number }>;
  regionDistribution: Array<{ region: string; count: number }>;
  topCustomers: Array<{ customer: string; count: number }>;
  ageDistribution: Array<{ range: string; count: number }>;
  qualificationStatus: { qualified: number; unqualified: number; total: number; rate: number };
}

const STATUS_COLORS: Record<string, string> = {
  good: 'text-green-600 bg-green-100',
  warning: 'text-amber-600 bg-amber-100',
  critical: 'text-red-600 bg-red-100',
};

const KPI_ICONS: Record<string, typeof ClockIcon> = {
  onTimePerformance: CheckCircleIcon,
  mttr: ClockIcon,
  shopUtilization: BuildingStorefrontIcon,
  costEfficiency: CurrencyDollarIcon,
  fleetAvailability: TruckIcon,
  reworkRate: ExclamationTriangleIcon,
};

const KPI_LABELS: Record<string, string> = {
  onTimePerformance: 'On-Time Performance',
  mttr: 'Mean Turn Time',
  shopUtilization: 'Shop Utilization',
  costEfficiency: 'Cost Efficiency',
  fleetAvailability: 'Fleet Availability',
  reworkRate: 'Rework Rate',
};

export default function AnalyticsDashboard() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'forecast' | 'fleet' | 'shops'>('overview');
  const [kpis, setKpis] = useState<KPIsData | null>(null);
  const [forecast, setForecast] = useState<ForecastMonth[]>([]);
  const [fleet, setFleet] = useState<FleetData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [forecastMonths, setForecastMonths] = useState(6);

  useEffect(() => {
    loadData();
  }, [activeTab, forecastMonths]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'overview') {
        const res = await fetch('/api/analytics/kpis', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setKpis(await res.json());
        }
      } else if (activeTab === 'forecast') {
        const res = await fetch(`/api/analytics/forecast?months=${forecastMonths}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setForecast(data.forecast);
        }
      } else if (activeTab === 'fleet') {
        const res = await fetch('/api/analytics/fleet', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setFleet(await res.json());
        }
      }
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const renderTrend = (trend: number, inverse = false) => {
    const isPositive = inverse ? trend < 0 : trend > 0;
    const Icon = isPositive ? ArrowTrendingUpIcon : ArrowTrendingDownIcon;
    const color = isPositive ? 'text-green-600' : 'text-red-600';

    return (
      <span className={`inline-flex items-center gap-1 text-sm ${color}`}>
        <Icon className="h-4 w-4" />
        {Math.abs(trend).toFixed(1)}%
      </span>
    );
  };

  const renderKPICard = (key: string, kpi: KPI) => {
    const Icon = KPI_ICONS[key] || ChartBarIcon;
    const label = KPI_LABELS[key] || key;
    const isInverse = key === 'mttr' || key === 'reworkRate';

    return (
      <div key={key} className="bg-white rounded-xl shadow-sm border border-steel-200 p-5">
        <div className="flex items-start justify-between">
          <div className={`p-2 rounded-lg ${STATUS_COLORS[kpi.status]}`}>
            <Icon className="h-5 w-5" />
          </div>
          {renderTrend(kpi.trend, isInverse)}
        </div>
        <div className="mt-4">
          <p className="text-sm text-steel-500">{label}</p>
          <p className="text-2xl font-bold text-steel-900 mt-1">
            {kpi.value}
            <span className="text-lg text-steel-500 ml-1">{kpi.unit}</span>
          </p>
        </div>
      </div>
    );
  };

  const renderBarChart = (data: Array<{ label: string; value: number }>, maxValue?: number) => {
    const max = maxValue || Math.max(...data.map(d => d.value), 1);
    return (
      <div className="space-y-2">
        {data.map((item, idx) => (
          <div key={idx} className="flex items-center gap-3">
            <span className="text-sm text-steel-600 w-24 truncate">{item.label}</span>
            <div className="flex-1 h-6 bg-steel-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-navy-500 to-navy-600 rounded-full transition-all duration-500"
                style={{ width: `${Math.min((item.value / max) * 100, 100)}%` }}
              />
            </div>
            <span className="text-sm font-medium text-steel-900 w-12 text-right">{item.value}</span>
          </div>
        ))}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-steel-900">Analytics Dashboard</h1>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-navy-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-steel-900">Analytics Dashboard</h1>
          <p className="mt-1 text-sm text-steel-500">
            Advanced insights and forecasting for your operations
          </p>
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2 border border-steel-300 rounded-lg text-steel-700 hover:bg-steel-50">
          <ArrowDownTrayIcon className="h-5 w-5" />
          Export Report
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-steel-200">
        <nav className="flex gap-6">
          {[
            { id: 'overview', label: 'KPIs Overview' },
            { id: 'forecast', label: 'Capacity Forecast' },
            { id: 'fleet', label: 'Fleet Analytics' },
            { id: 'shops', label: 'Shop Performance' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-navy-600 text-navy-600'
                  : 'border-transparent text-steel-500 hover:text-steel-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* KPIs Overview Tab */}
      {activeTab === 'overview' && kpis && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {Object.entries(kpis.kpis).map(([key, kpi]) => renderKPICard(key, kpi))}
          </div>

          {/* Volume Metrics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm border border-steel-200 p-6">
              <h3 className="text-lg font-semibold text-steel-900 mb-4">Monthly Volume</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-steel-50 rounded-lg">
                  <p className="text-sm text-steel-500">Current Month</p>
                  <p className="text-2xl font-bold text-steel-900">{kpis.volumeMetrics.currentMonth}</p>
                </div>
                <div className="p-4 bg-steel-50 rounded-lg">
                  <p className="text-sm text-steel-500">Previous Month</p>
                  <p className="text-2xl font-bold text-steel-900">{kpis.volumeMetrics.previousMonth}</p>
                </div>
                <div className="p-4 bg-steel-50 rounded-lg">
                  <p className="text-sm text-steel-500">YTD Total</p>
                  <p className="text-2xl font-bold text-steel-900">{kpis.volumeMetrics.totalYTD}</p>
                </div>
                <div className="p-4 bg-steel-50 rounded-lg">
                  <p className="text-sm text-steel-500">Month Change</p>
                  <p className={`text-2xl font-bold ${kpis.volumeMetrics.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {kpis.volumeMetrics.change >= 0 ? '+' : ''}{kpis.volumeMetrics.change}%
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-steel-200 p-6">
              <h3 className="text-lg font-semibold text-steel-900 mb-4">Cost Summary</h3>
              <div className="text-center py-8">
                <p className="text-sm text-steel-500">YTD Estimated Cost</p>
                <p className="text-4xl font-bold text-steel-900 mt-2">
                  ${kpis.volumeMetrics.totalEstimatedCost.toLocaleString()}
                </p>
                <p className="text-sm text-green-600 mt-2">5% under budget</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Forecast Tab */}
      {activeTab === 'forecast' && (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <label className="text-sm text-steel-600">Forecast Period:</label>
            <select
              value={forecastMonths}
              onChange={(e) => setForecastMonths(parseInt(e.target.value))}
              className="border border-steel-300 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value={3}>3 Months</option>
              <option value={6}>6 Months</option>
              <option value={12}>12 Months</option>
              <option value={24}>24 Months</option>
            </select>
          </div>

          {/* Capacity Timeline */}
          <div className="bg-white rounded-xl shadow-sm border border-steel-200 p-6">
            <h3 className="text-lg font-semibold text-steel-900 mb-6">Capacity Utilization Forecast</h3>
            <div className="h-64 flex items-end justify-between gap-2">
              {forecast.map((month) => (
                <div key={month.month} className="flex-1 flex flex-col items-center">
                  <div className="w-full flex flex-col items-center">
                    <span className="text-xs text-steel-500 mb-1">{month.utilization}%</span>
                    <div className="w-full bg-steel-100 rounded-t relative" style={{ height: '200px' }}>
                      <div
                        className={`absolute bottom-0 w-full rounded-t transition-all ${
                          month.utilization > 90 ? 'bg-red-500' :
                          month.utilization > 75 ? 'bg-amber-500' : 'bg-green-500'
                        }`}
                        style={{ height: `${Math.min(month.utilization, 100)}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-xs text-steel-600 mt-2 text-center">{month.label}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-center gap-6 mt-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded" />
                <span className="text-xs text-steel-600">Normal (&lt;75%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-amber-500 rounded" />
                <span className="text-xs text-steel-600">High (75-90%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded" />
                <span className="text-xs text-steel-600">Critical (&gt;90%)</span>
              </div>
            </div>
          </div>

          {/* Shop Details Table */}
          {forecast.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-steel-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-steel-200">
                <h3 className="text-lg font-semibold text-steel-900">Shop Capacity Details</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-steel-200">
                  <thead className="bg-steel-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-steel-500 uppercase">Shop</th>
                      {forecast.slice(0, 6).map((month) => (
                        <th key={month.month} className="px-4 py-3 text-center text-xs font-medium text-steel-500 uppercase">
                          {month.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-steel-200">
                    {forecast[0]?.shops.map((shop) => (
                      <tr key={shop.shopId} className="hover:bg-steel-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-steel-900">
                          {shop.shopName}
                        </td>
                        {forecast.slice(0, 6).map((month) => {
                          const shopData = month.shops.find(s => s.shopId === shop.shopId);
                          const util = shopData?.utilization || 0;
                          return (
                            <td key={month.month} className="px-4 py-3 text-center">
                              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                                util > 90 ? 'bg-red-100 text-red-700' :
                                util > 75 ? 'bg-amber-100 text-amber-700' :
                                'bg-green-100 text-green-700'
                              }`}>
                                {util}%
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fleet Analytics Tab */}
      {activeTab === 'fleet' && fleet && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Status Distribution */}
          <div className="bg-white rounded-xl shadow-sm border border-steel-200 p-6">
            <h3 className="text-lg font-semibold text-steel-900 mb-4">Fleet Status</h3>
            {renderBarChart(
              fleet.statusDistribution.map(s => ({ label: s.status, value: s.count }))
            )}
          </div>

          {/* Type Distribution */}
          <div className="bg-white rounded-xl shadow-sm border border-steel-200 p-6">
            <h3 className="text-lg font-semibold text-steel-900 mb-4">Car Types</h3>
            {fleet.typeDistribution.length > 0 ? (
              renderBarChart(
                fleet.typeDistribution.slice(0, 6).map(t => ({ label: t.type, value: t.count }))
              )
            ) : (
              <p className="text-steel-500 text-center py-8">No type data available</p>
            )}
          </div>

          {/* Region Distribution */}
          <div className="bg-white rounded-xl shadow-sm border border-steel-200 p-6">
            <h3 className="text-lg font-semibold text-steel-900 mb-4">By Region</h3>
            {fleet.regionDistribution.length > 0 ? (
              renderBarChart(
                fleet.regionDistribution.map(r => ({ label: r.region, value: r.count }))
              )
            ) : (
              <p className="text-steel-500 text-center py-8">No region data available</p>
            )}
          </div>

          {/* Top Customers */}
          <div className="bg-white rounded-xl shadow-sm border border-steel-200 p-6">
            <h3 className="text-lg font-semibold text-steel-900 mb-4">Top Customers</h3>
            {fleet.topCustomers.length > 0 ? (
              renderBarChart(
                fleet.topCustomers.slice(0, 6).map(c => ({ label: c.customer, value: c.count }))
              )
            ) : (
              <p className="text-steel-500 text-center py-8">No customer data available</p>
            )}
          </div>

          {/* Age Distribution */}
          <div className="bg-white rounded-xl shadow-sm border border-steel-200 p-6">
            <h3 className="text-lg font-semibold text-steel-900 mb-4">Fleet Age Distribution</h3>
            {renderBarChart(
              fleet.ageDistribution.map(a => ({ label: a.range, value: a.count }))
            )}
          </div>

          {/* Qualification Status */}
          <div className="bg-white rounded-xl shadow-sm border border-steel-200 p-6">
            <h3 className="text-lg font-semibold text-steel-900 mb-4">Qualification Status</h3>
            <div className="flex items-center justify-center py-4">
              <div className="relative w-32 h-32">
                <svg className="w-full h-full" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth="12"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="#10B981"
                    strokeWidth="12"
                    strokeDasharray={`${fleet.qualificationStatus.rate * 2.51} 251`}
                    strokeLinecap="round"
                    transform="rotate(-90 50 50)"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold text-steel-900">{fleet.qualificationStatus.rate}%</span>
                </div>
              </div>
              <div className="ml-6 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded" />
                  <span className="text-sm text-steel-600">Qualified: {fleet.qualificationStatus.qualified}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-steel-300 rounded" />
                  <span className="text-sm text-steel-600">Unqualified: {fleet.qualificationStatus.unqualified}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Shop Performance Tab */}
      {activeTab === 'shops' && (
        <div className="bg-white rounded-xl shadow-sm border border-steel-200 p-6">
          <h3 className="text-lg font-semibold text-steel-900 mb-4">Shop Performance Trends</h3>
          <p className="text-steel-500 text-center py-12">
            Shop performance trend charts coming soon. Use the KPIs Overview for current metrics.
          </p>
        </div>
      )}
    </div>
  );
}
