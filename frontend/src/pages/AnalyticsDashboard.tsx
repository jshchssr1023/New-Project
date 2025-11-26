import { useState, useEffect } from 'react';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { analyticsApi } from '../services/api';
import type { AnalyticsData } from '../types';

export default function AnalyticsDashboard() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    loadAnalytics();
  }, [dateRange]);

  const loadAnalytics = async () => {
    try {
      const data = await analyticsApi.getDashboard();
      setAnalytics(data);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async (reportType: string, format: 'csv' | 'xlsx' | 'pdf') => {
    try {
      const blob = await analyticsApi.exportReport(reportType, format);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportType}-report.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to export report:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-steel-900">Analytics Dashboard</h1>
        <div className="card">
          <p className="text-steel-500">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-steel-900">Analytics Dashboard</h1>
          <p className="mt-1 text-sm text-steel-500">
            Comprehensive insights into your service operations
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="input w-40"
            />
            <span className="text-steel-500">to</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="input w-40"
            />
          </div>
          <div className="relative group">
            <button className="btn-secondary flex items-center">
              <ArrowDownTrayIcon className="mr-2 h-5 w-5" />
              Export
            </button>
            <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 hidden group-hover:block z-10">
              <div className="py-1">
                <button
                  onClick={() => handleExport('summary', 'csv')}
                  className="block w-full text-left px-4 py-2 text-sm text-steel-700 hover:bg-steel-100"
                >
                  Export as CSV
                </button>
                <button
                  onClick={() => handleExport('summary', 'xlsx')}
                  className="block w-full text-left px-4 py-2 text-sm text-steel-700 hover:bg-steel-100"
                >
                  Export as Excel
                </button>
                <button
                  onClick={() => handleExport('summary', 'pdf')}
                  className="block w-full text-left px-4 py-2 text-sm text-steel-700 hover:bg-steel-100"
                >
                  Export as PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-sm text-steel-500">Total Fleet Size</p>
          <p className="text-3xl font-bold text-steel-900">{analytics?.totalCars || 0}</p>
          <p className="text-sm text-green-600">+12% from last year</p>
        </div>
        <div className="card">
          <p className="text-sm text-steel-500">Active Service Shops</p>
          <p className="text-3xl font-bold text-steel-900">{analytics?.totalShops || 0}</p>
          <p className="text-sm text-steel-500">Across all regions</p>
        </div>
        <div className="card">
          <p className="text-sm text-steel-500">Services This Year</p>
          <p className="text-3xl font-bold text-steel-900">
            {analytics?.monthlyServiceCounts?.reduce((sum, m) => sum + m.count, 0) || 0}
          </p>
          <p className="text-sm text-steel-500">Year to date</p>
        </div>
        <div className="card">
          <p className="text-sm text-steel-500">Currently In Service</p>
          <p className="text-3xl font-bold text-steel-900">{analytics?.carsInService || 0}</p>
          <p className="text-sm text-amber-600">
            {analytics?.totalCars ? ((analytics.carsInService / analytics.totalCars) * 100).toFixed(1) : 0}% of fleet
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly trend */}
        <div className="card">
          <h3 className="text-lg font-medium text-steel-900 mb-4">Monthly Service Volume</h3>
          <div className="h-64 flex items-end justify-around space-x-2">
            {analytics?.monthlyServiceCounts?.map((item) => {
              const maxCount = Math.max(...(analytics?.monthlyServiceCounts?.map((m) => m.count) || [1]));
              return (
                <div key={item.month} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full bg-rail-500 rounded-t transition-all hover:bg-rail-600"
                    style={{ height: `${(item.count / maxCount) * 200}px` }}
                  />
                  <span className="text-xs text-steel-500 mt-2 rotate-45 origin-left">{item.month}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Cost breakdown */}
        <div className="card">
          <h3 className="text-lg font-medium text-steel-900 mb-4">Cost Breakdown</h3>
          <div className="space-y-4">
            {analytics?.costBreakdown?.map((item) => {
              const totalCost = analytics?.costBreakdown?.reduce((sum, c) => sum + c.amount, 0) || 1;
              const percentage = (item.amount / totalCost) * 100;
              return (
                <div key={item.category}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-steel-700">{item.category}</span>
                    <span className="text-sm font-medium text-steel-900">
                      ${item.amount.toLocaleString()}
                    </span>
                  </div>
                  <div className="w-full bg-steel-200 rounded-full h-2">
                    <div
                      className="bg-rail-500 h-2 rounded-full"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            }) || (
              <p className="text-steel-500">No cost data available</p>
            )}
          </div>
        </div>

        {/* Shop performance */}
        <div className="card lg:col-span-2">
          <h3 className="text-lg font-medium text-steel-900 mb-4">Shop Performance</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-steel-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                    Shop
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                    Utilization
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                    Avg Turn Time
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                    Performance
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-200">
                {analytics?.shopPerformance?.map((shop) => (
                  <tr key={shop.shopId}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-steel-900">
                      {shop.shopName}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <div className="w-24 bg-steel-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              shop.utilization > 80 ? 'bg-green-500' : shop.utilization > 50 ? 'bg-amber-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${shop.utilization}%` }}
                          />
                        </div>
                        <span className="text-sm text-steel-700">{shop.utilization}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-steel-700">
                      {shop.avgTurnTime} days
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                          shop.utilization > 70 && shop.avgTurnTime < 20
                            ? 'bg-green-100 text-green-800'
                            : shop.utilization > 50
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {shop.utilization > 70 && shop.avgTurnTime < 20
                          ? 'Excellent'
                          : shop.utilization > 50
                          ? 'Good'
                          : 'Needs Attention'}
                      </span>
                    </td>
                  </tr>
                )) || (
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-center text-steel-500">
                      No shop performance data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
