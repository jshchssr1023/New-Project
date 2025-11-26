import { useState, useEffect } from 'react';
import {
  TruckIcon,
  BuildingStorefrontIcon,
  CalendarDaysIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline';
import { analyticsApi } from '../services/api';
import type { AnalyticsData } from '../types';

const defaultStats = [
  { name: 'Total Cars', value: '0', icon: TruckIcon, color: 'bg-rail-500' },
  { name: 'Active Shops', value: '0', icon: BuildingStorefrontIcon, color: 'bg-green-500' },
  { name: 'Active Plans', value: '0', icon: CalendarDaysIcon, color: 'bg-purple-500' },
  { name: 'Cars in Service', value: '0', icon: WrenchScrewdriverIcon, color: 'bg-amber-500' },
];

export default function Dashboard() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

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

  const stats = analytics
    ? [
        { name: 'Total Cars', value: analytics.totalCars.toString(), icon: TruckIcon, color: 'bg-rail-500' },
        { name: 'Active Shops', value: analytics.totalShops.toString(), icon: BuildingStorefrontIcon, color: 'bg-green-500' },
        { name: 'Active Plans', value: analytics.activePlans.toString(), icon: CalendarDaysIcon, color: 'bg-purple-500' },
        { name: 'Cars in Service', value: analytics.carsInService.toString(), icon: WrenchScrewdriverIcon, color: 'bg-amber-500' },
      ]
    : defaultStats;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-steel-900">Dashboard</h1>
        <p className="mt-1 text-sm text-steel-500">
          Overview of your rail car service scheduling operations
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.name} className="card">
            <div className="flex items-center">
              <div className={`${stat.color} rounded-lg p-3`}>
                <stat.icon className="h-6 w-6 text-white" aria-hidden="true" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-steel-500">{stat.name}</p>
                <p className="text-2xl font-semibold text-steel-900">
                  {isLoading ? '...' : stat.value}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Monthly service chart placeholder */}
        <div className="card">
          <h3 className="text-lg font-medium text-steel-900">Monthly Service Volume</h3>
          <div className="mt-4 h-64 flex items-center justify-center bg-steel-50 rounded-lg">
            {isLoading ? (
              <p className="text-steel-500">Loading...</p>
            ) : analytics?.monthlyServiceCounts?.length ? (
              <div className="w-full px-4">
                <div className="flex items-end justify-around h-48 space-x-2">
                  {analytics.monthlyServiceCounts.slice(-6).map((item) => (
                    <div key={item.month} className="flex flex-col items-center">
                      <div
                        className="bg-rail-500 w-12 rounded-t"
                        style={{ height: `${Math.max(item.count * 2, 10)}px` }}
                      />
                      <span className="text-xs text-steel-500 mt-2">{item.month}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-steel-500">No data available</p>
            )}
          </div>
        </div>

        {/* Shop performance placeholder */}
        <div className="card">
          <h3 className="text-lg font-medium text-steel-900">Shop Performance</h3>
          <div className="mt-4 space-y-4">
            {isLoading ? (
              <p className="text-steel-500">Loading...</p>
            ) : analytics?.shopPerformance?.length ? (
              analytics.shopPerformance.slice(0, 5).map((shop) => (
                <div key={shop.shopId} className="flex items-center justify-between">
                  <span className="text-sm text-steel-700">{shop.shopName}</span>
                  <div className="flex items-center space-x-4">
                    <div className="w-32 bg-steel-200 rounded-full h-2">
                      <div
                        className="bg-rail-500 h-2 rounded-full"
                        style={{ width: `${shop.utilization}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-steel-900 w-12">
                      {shop.utilization}%
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-steel-500">No data available</p>
            )}
          </div>
        </div>

        {/* Upcoming services */}
        <div className="card lg:col-span-2">
          <h3 className="text-lg font-medium text-steel-900">Upcoming Services</h3>
          <div className="mt-4">
            {isLoading ? (
              <p className="text-steel-500">Loading...</p>
            ) : analytics?.upcomingServices?.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-steel-200">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                        Vehicle
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                        Shop
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                        Scheduled Date
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-steel-200">
                    {analytics.upcomingServices.slice(0, 5).map((service) => (
                      <tr key={`${service.carId}-${service.scheduledDate}`}>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-steel-900">
                          {service.vehicleNumber}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-steel-700">
                          {service.shopName}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-steel-700">
                          {new Date(service.scheduledDate).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-steel-500">No upcoming services</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
