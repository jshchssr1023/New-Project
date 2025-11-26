import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TruckIcon,
  BuildingStorefrontIcon,
  BeakerIcon,
  WrenchScrewdriverIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { analyticsApi } from '../services/api';
import type { AnalyticsData } from '../types';

const DAYS_IN_SHOP_THRESHOLD = 10;

export default function Dashboard() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

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

  // KPI Card click handlers with navigation and filters
  const handleKPIClick = (kpiType: string) => {
    switch (kpiType) {
      case 'carsInQueue':
        navigate('/cars?status=available,scheduled');
        break;
      case 'shopsWithCars':
        navigate('/shops?hasAllocations=true');
        break;
      case 'activeScenarios':
        navigate('/scenarios');
        break;
      case 'carsInShop':
        navigate('/cars?status=in_service,in_shop');
        break;
    }
  };

  const kpiStats = analytics
    ? [
        {
          key: 'carsInQueue',
          name: 'Total Cars in Queue',
          value: analytics.carsInQueue?.toString() || '0',
          description: 'Available + Scheduled',
          icon: TruckIcon,
          color: 'bg-rail-500',
          hoverColor: 'hover:bg-rail-600',
        },
        {
          key: 'shopsWithCars',
          name: 'Shops with Cars',
          value: analytics.shopsWithCars?.toString() || '0',
          description: 'Active allocations',
          icon: BuildingStorefrontIcon,
          color: 'bg-emerald-500',
          hoverColor: 'hover:bg-emerald-600',
        },
        {
          key: 'activeScenarios',
          name: 'Active Scenarios',
          value: analytics.activeScenarios?.toString() || '0',
          description: 'Draft & analyzing',
          icon: BeakerIcon,
          color: 'bg-violet-500',
          hoverColor: 'hover:bg-violet-600',
        },
        {
          key: 'carsInShop',
          name: 'Cars in Shop',
          value: analytics.totalCarsInShop?.toString() || '0',
          description: 'In service + In shop',
          icon: WrenchScrewdriverIcon,
          color: 'bg-amber-500',
          hoverColor: 'hover:bg-amber-600',
        },
      ]
    : [];

  // Days until due color coding
  const getDaysUntilDueColor = (days: number | null) => {
    if (days === null) return 'text-steel-500';
    if (days < 0) return 'text-red-600 font-semibold';
    if (days <= 7) return 'text-amber-600 font-semibold';
    if (days <= 14) return 'text-amber-500';
    return 'text-emerald-600';
  };

  // Days in shop color coding
  const getDaysInShopColor = (days: number) => {
    if (days > DAYS_IN_SHOP_THRESHOLD) return 'text-red-600 font-semibold';
    if (days > 7) return 'text-amber-600';
    return 'text-steel-700';
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-steel-900">Team Leader Dashboard</h1>
        <p className="text-sm text-steel-500">
          Rail car service scheduling overview
        </p>
      </div>

      {/* Alert Banner */}
      {analytics?.alerts?.hasAlerts && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="flex items-start gap-3">
            <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {analytics.alerts.overdueCars > 0 && (
                  <span className="text-sm text-amber-800">
                    <span className="font-semibold">{analytics.alerts.overdueCars}</span> railcars are overdue for service
                  </span>
                )}
                {analytics.alerts.capacityAlerts.length > 0 && (
                  <span className="text-sm text-amber-800">
                    Shop capacity exceeded at{' '}
                    <span className="font-semibold">
                      {analytics.alerts.capacityAlerts.map(a => a.shopName).join(', ')}
                    </span>
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => navigate('/planning')}
              className="flex-shrink-0 text-sm font-medium text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 px-3 py-1 rounded transition-colors"
            >
              Allocate Now
            </button>
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpiStats.map((stat) => (
          <button
            key={stat.key}
            onClick={() => handleKPIClick(stat.key)}
            className="card p-4 text-left transition-all duration-200 hover:shadow-md hover:scale-[1.01] group cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className={`${stat.color} ${stat.hoverColor} rounded-lg p-2.5 transition-colors`}>
                <stat.icon className="h-5 w-5 text-white" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-steel-500 truncate">{stat.name}</p>
                <p className="text-xl font-bold text-steel-900">
                  {isLoading ? '...' : stat.value}
                </p>
                <p className="text-xs text-steel-400">{stat.description}</p>
              </div>
              <ChevronRightIcon className="h-4 w-4 text-steel-400 group-hover:text-steel-600 transition-colors" />
            </div>
          </button>
        ))}
      </div>

      {/* Operational Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* My Queue Widget */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ClockIcon className="h-5 w-5 text-rail-500" />
              <h3 className="text-sm font-semibold text-steel-900">My Queue</h3>
            </div>
            <button
              onClick={() => navigate('/cars?status=available')}
              className="text-xs text-rail-600 hover:text-rail-800 font-medium"
            >
              View All
            </button>
          </div>
          <p className="text-xs text-steel-500 mb-3">
            Railcars ready for immediate action or assignment
          </p>
          {isLoading ? (
            <div className="text-sm text-steel-500 py-4 text-center">Loading...</div>
          ) : analytics?.myQueue?.length ? (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-steel-200">
                    <th className="text-left py-2 text-xs font-medium text-steel-500 uppercase">Railcar #</th>
                    <th className="text-left py-2 text-xs font-medium text-steel-500 uppercase">Customer</th>
                    <th className="text-left py-2 text-xs font-medium text-steel-500 uppercase">Reason</th>
                    <th className="text-right py-2 text-xs font-medium text-steel-500 uppercase">Days Until Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {analytics.myQueue.slice(0, 5).map((car) => (
                    <tr
                      key={car.id}
                      className="hover:bg-steel-50 cursor-pointer"
                      onClick={() => navigate(`/cars?search=${car.railcarNumber}`)}
                    >
                      <td className="py-2 font-medium text-steel-900">{car.railcarNumber}</td>
                      <td className="py-2 text-steel-700">{car.customer || '-'}</td>
                      <td className="py-2 text-steel-700">{car.reasonShopped || '-'}</td>
                      <td className={`py-2 text-right ${getDaysUntilDueColor(car.daysUntilDue)}`}>
                        {car.daysUntilDue !== null ? (
                          car.daysUntilDue < 0 ? `${Math.abs(car.daysUntilDue)} overdue` : car.daysUntilDue
                        ) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-steel-500 py-4 text-center">No cars in queue</p>
          )}
        </div>

        {/* In Shop Status Widget */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <WrenchScrewdriverIcon className="h-5 w-5 text-amber-500" />
              <h3 className="text-sm font-semibold text-steel-900">In Shop Status</h3>
            </div>
            <button
              onClick={() => navigate('/cars?status=in_service,in_shop')}
              className="text-xs text-rail-600 hover:text-rail-800 font-medium"
            >
              View All
            </button>
          </div>
          <p className="text-xs text-steel-500 mb-3">
            Current maintenance progress (red if &gt;{DAYS_IN_SHOP_THRESHOLD} days)
          </p>
          {isLoading ? (
            <div className="text-sm text-steel-500 py-4 text-center">Loading...</div>
          ) : analytics?.inShopStatus?.length ? (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-steel-200">
                    <th className="text-left py-2 text-xs font-medium text-steel-500 uppercase">Railcar #</th>
                    <th className="text-left py-2 text-xs font-medium text-steel-500 uppercase">Shop</th>
                    <th className="text-left py-2 text-xs font-medium text-steel-500 uppercase">Status</th>
                    <th className="text-right py-2 text-xs font-medium text-steel-500 uppercase">Days In Shop</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {analytics.inShopStatus.slice(0, 5).map((car) => (
                    <tr
                      key={car.id}
                      className="hover:bg-steel-50 cursor-pointer"
                      onClick={() => navigate(`/cars?search=${car.railcarNumber}`)}
                    >
                      <td className="py-2 font-medium text-steel-900">{car.railcarNumber}</td>
                      <td className="py-2 text-steel-700">{car.shopName}</td>
                      <td className="py-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          car.status === 'in_shop' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {car.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className={`py-2 text-right ${getDaysInShopColor(car.daysInShop)}`}>
                        {car.daysInShop}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-steel-500 py-4 text-center">No cars currently in shop</p>
          )}
        </div>
      </div>

      {/* Lower Section - Charts and Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly Service Volume */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-steel-900 mb-3">Monthly Service Volume</h3>
          <div className="h-48 flex items-end justify-around bg-steel-50 rounded-lg p-3">
            {isLoading ? (
              <p className="text-steel-500 text-sm self-center">Loading...</p>
            ) : analytics?.monthlyServiceCounts?.length ? (
              analytics.monthlyServiceCounts.slice(-6).map((item) => (
                <div key={item.month} className="flex flex-col items-center">
                  <span className="text-xs text-steel-600 mb-1">{item.count}</span>
                  <div
                    className="bg-rail-500 w-10 rounded-t transition-all hover:bg-rail-600"
                    style={{ height: `${Math.max(item.count * 3, 8)}px` }}
                  />
                  <span className="text-xs text-steel-500 mt-2">
                    {item.month.slice(5)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-steel-500 text-sm self-center">No data available</p>
            )}
          </div>
        </div>

        {/* Shop Performance */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-steel-900 mb-3">Shop Performance</h3>
          <div className="space-y-3">
            {isLoading ? (
              <p className="text-steel-500 text-sm py-4 text-center">Loading...</p>
            ) : analytics?.shopPerformance?.length ? (
              analytics.shopPerformance.slice(0, 5).map((shop) => (
                <div key={shop.shopId} className="flex items-center gap-3">
                  <span className="text-sm text-steel-700 w-32 truncate">{shop.shopName}</span>
                  <div className="flex-1 bg-steel-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        shop.utilization > 95 ? 'bg-red-500' :
                        shop.utilization > 80 ? 'bg-emerald-500' :
                        shop.utilization > 50 ? 'bg-amber-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${Math.min(shop.utilization, 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-steel-900 w-10 text-right">
                    {shop.utilization}%
                  </span>
                </div>
              ))
            ) : (
              <p className="text-steel-500 text-sm py-4 text-center">No data available</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
