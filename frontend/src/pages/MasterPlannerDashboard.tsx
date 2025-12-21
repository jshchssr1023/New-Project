/**
 * Master Planner Dashboard
 *
 * S&OP Master Planning Engine dashboard providing:
 * - Total Inventory Funnel (source of truth for entire fleet)
 * - Utilization Heatmapping for network capacity
 * - Auto-allocation controls
 * - Scenario Draft Mode sandbox
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChartBarIcon,
  TruckIcon,
  BuildingStorefrontIcon,
  PlayIcon,
  PauseIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  Cog6ToothIcon,
  DocumentChartBarIcon,
  LockClosedIcon,
  LockOpenIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { carsApi, shopsApi } from '../services/api';
import type { Car, Shop } from '../types';
import InventoryFunnel from '../components/dashboard/InventoryFunnel';
import UtilizationHeatmap from '../components/dashboard/UtilizationHeatmap';

// API types
interface UrgencyQueueItem {
  car: Car;
  urgencyScore: {
    total: number;
    components: {
      regulatoryDeadline: number;
      customerPriority: number;
      logisticalProximity: number;
      revenueImpact: number;
    };
    shoppingStatus: string;
    daysUntilDue: number | null;
    urgencyLevel: 'critical' | 'high' | 'medium' | 'low';
  };
}

interface AutoAllocationResult {
  success: boolean;
  allocations: any[];
  summary: {
    totalCars: number;
    allocated: number;
    unallocated: number;
    thirdPartyFilled: number;
    aitxFilled: number;
    urgentCarsHandled: number;
  };
  warnings: string[];
}

interface HeatmapData {
  months: string[];
  shops: any[];
  summary: {
    totalShops: number;
    aitxShops: number;
    thirdPartyShops: number;
    overCapacityAlerts: number;
    underUtilizedShops: number;
  };
}

export default function MasterPlannerDashboard() {
  const navigate = useNavigate();

  // Data state
  const [cars, setCars] = useState<Car[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [urgencyQueue, setUrgencyQueue] = useState<UrgencyQueueItem[]>([]);
  const [heatmapData, setHeatmapData] = useState<HeatmapData | null>(null);

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDraftMode, setIsDraftMode] = useState(false);
  const [isRunningAutoAllocation, setIsRunningAutoAllocation] = useState(false);
  const [lastAllocationResult, setLastAllocationResult] = useState<AutoAllocationResult | null>(null);

  // Auto-allocation config
  const [allocationConfig, setAllocationConfig] = useState({
    prioritize3PCommitments: true,
    maxAllocationsPerRun: 100,
    targetMonth: new Date().getMonth() + 1,
    targetYear: new Date().getFullYear(),
  });

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch cars and shops in parallel
      const [carsResponse, shopsResponse] = await Promise.all([
        carsApi.getAll({ pageSize: 2000 }),
        shopsApi.getAll({ isActive: true }),
      ]);

      setCars(carsResponse.data);
      setShops(shopsResponse);

      // Fetch urgency queue
      try {
        const token = localStorage.getItem('token');
        const queueResponse = await fetch('/api/allocation/urgency-queue?limit=50', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        if (queueResponse.ok) {
          const queueData = await queueResponse.json();
          setUrgencyQueue(queueData.items || []);
        }
      } catch (queueErr) {
        console.warn('Could not fetch urgency queue:', queueErr);
      }

      // Fetch heatmap data
      try {
        const token = localStorage.getItem('token');
        const heatmapResponse = await fetch('/api/allocation/utilization-heatmap?months=6', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        if (heatmapResponse.ok) {
          const data = await heatmapResponse.json();
          setHeatmapData(data);
        }
      } catch (heatmapErr) {
        console.warn('Could not fetch heatmap data:', heatmapErr);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      setError('Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Calculate funnel data from cars
  const funnelData = useMemo(() => {
    const unassignedCars = cars.filter(c =>
      !c.assignedShopId &&
      ['Urgent', 'Must Shop', 'Upcoming'].includes(c.shoppingStatus || '')
    );

    const assignedCars = cars.filter(c => c.assignedShopId);
    const inShopCars = cars.filter(c => c.status === 'in_shop' || c.status === 'arrived');
    const plannedCars = cars.filter(c => c.shoppingStatus === 'Planned');
    const transitCars = cars.filter(c => c.status === 'enroute');

    const aitxShops = shops.filter(s => s.isAitxInternal);
    const thirdPartyShops = shops.filter(s => !s.isAitxInternal);

    const aitxCapacity = aitxShops.reduce((sum, s) => sum + (s.capacity || 50), 0);
    const thirdPartyCapacity = thirdPartyShops.reduce((sum, s) => sum + (s.capacity || 50), 0);
    const totalCapacity = aitxCapacity + thirdPartyCapacity;

    const unassignedTotal = unassignedCars.length;
    const coverageRatio = unassignedTotal > 0 ? Math.round((totalCapacity / unassignedTotal) * 100) : 100;

    return {
      totalFleet: cars.length,
      unassigned: {
        total: unassignedTotal,
        urgent: unassignedCars.filter(c => c.shoppingStatus === 'Urgent').length,
        mustShop: unassignedCars.filter(c => c.shoppingStatus === 'Must Shop').length,
        upcoming: unassignedCars.filter(c => c.shoppingStatus === 'Upcoming').length,
      },
      networkCapacity: {
        total: totalCapacity,
        aitx: aitxCapacity,
        thirdParty: thirdPartyCapacity,
      },
      coverageRatio,
      assigned: {
        inShop: inShopCars.length,
        planned: plannedCars.length,
        inTransit: transitCars.length,
      },
    };
  }, [cars, shops]);

  // Run auto-allocation
  const runAutoAllocation = async () => {
    setIsRunningAutoAllocation(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/allocation/auto', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(allocationConfig),
      });

      if (!response.ok) {
        throw new Error('Auto-allocation failed');
      }

      const result: AutoAllocationResult = await response.json();
      setLastAllocationResult(result);

      // Refresh data after allocation
      await fetchData();
    } catch (err) {
      console.error('Auto-allocation error:', err);
      setError('Failed to run auto-allocation');
    } finally {
      setIsRunningAutoAllocation(false);
    }
  };

  // Handle section clicks in funnel
  const handleFunnelSectionClick = (section: string) => {
    switch (section) {
      case 'urgent':
        navigate('/cars?shoppingStatus=Urgent');
        break;
      case 'mustShop':
        navigate('/cars?shoppingStatus=Must Shop');
        break;
      case 'upcoming':
        navigate('/cars?shoppingStatus=Upcoming');
        break;
      case 'aitx':
        navigate('/shops?network=AITX-Own');
        break;
      case '3p':
        navigate('/shops?network=3rd Party');
        break;
    }
  };

  // Handle shop click in heatmap
  const handleShopClick = (shopId: string) => {
    navigate(`/shops/${shopId}`);
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-steel-500">Loading Master Planner Dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-steel-900">Master Planner Dashboard</h1>
          <p className="text-sm text-steel-500">
            S&OP Master Planning Engine | Fleet Source of Truth
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Draft Mode Toggle */}
          <button
            onClick={() => setIsDraftMode(!isDraftMode)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              isDraftMode
                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                : 'bg-steel-100 text-steel-700 hover:bg-steel-200'
            }`}
          >
            {isDraftMode ? (
              <>
                <LockOpenIcon className="h-4 w-4" />
                Draft Mode Active
              </>
            ) : (
              <>
                <LockClosedIcon className="h-4 w-4" />
                Enter Draft Mode
              </>
            )}
          </button>

          {/* Refresh Button */}
          <button
            onClick={fetchData}
            className="p-2 text-steel-500 hover:text-steel-700 hover:bg-steel-100 rounded-lg transition-colors"
          >
            <ArrowPathIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Draft Mode Banner */}
      {isDraftMode && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <SparklesIcon className="h-5 w-5 text-amber-600 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-amber-900">Sandbox Mode Active</h3>
              <p className="text-sm text-amber-700 mt-1">
                You can manipulate the 120-day horizon without affecting production data.
                KPIs will update in real-time as you move cars across the timeline.
              </p>
            </div>
            <button
              onClick={() => setIsDraftMode(false)}
              className="text-sm font-medium text-amber-700 hover:text-amber-900"
            >
              Exit Draft Mode
            </button>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
            <p className="text-sm text-red-700">{error}</p>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-sm font-medium text-red-600 hover:text-red-800"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Inventory Funnel */}
        <div className="lg:col-span-1">
          <div className="card p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-steel-900">Fleet Inventory</h2>
              <DocumentChartBarIcon className="h-5 w-5 text-steel-400" />
            </div>
            <InventoryFunnel
              data={funnelData}
              onSectionClick={handleFunnelSectionClick}
            />
          </div>
        </div>

        {/* Right Column - Auto-Allocation & Urgency Queue */}
        <div className="lg:col-span-2 space-y-6">
          {/* Auto-Allocation Panel */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-steel-900">Auto-Allocation Engine</h2>
                <p className="text-sm text-steel-500">Prioritizes 3P commitments and urgent cars</p>
              </div>
              <button
                onClick={runAutoAllocation}
                disabled={isRunningAutoAllocation}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  isRunningAutoAllocation
                    ? 'bg-steel-200 text-steel-500 cursor-not-allowed'
                    : 'bg-rail-600 text-white hover:bg-rail-700'
                }`}
              >
                {isRunningAutoAllocation ? (
                  <>
                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <PlayIcon className="h-4 w-4" />
                    Run Auto-Allocation
                  </>
                )}
              </button>
            </div>

            {/* Config Options */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-steel-600 mb-1">Target Month</label>
                <select
                  value={allocationConfig.targetMonth}
                  onChange={e => setAllocationConfig({
                    ...allocationConfig,
                    targetMonth: parseInt(e.target.value),
                  })}
                  className="input w-full text-sm py-1.5"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                    <option key={m} value={m}>
                      {new Date(2024, m - 1).toLocaleDateString('en-US', { month: 'short' })}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-steel-600 mb-1">Target Year</label>
                <select
                  value={allocationConfig.targetYear}
                  onChange={e => setAllocationConfig({
                    ...allocationConfig,
                    targetYear: parseInt(e.target.value),
                  })}
                  className="input w-full text-sm py-1.5"
                >
                  {[2024, 2025, 2026, 2027].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-steel-600 mb-1">Max Cars</label>
                <input
                  type="number"
                  value={allocationConfig.maxAllocationsPerRun}
                  onChange={e => setAllocationConfig({
                    ...allocationConfig,
                    maxAllocationsPerRun: parseInt(e.target.value) || 100,
                  })}
                  className="input w-full text-sm py-1.5"
                  min={1}
                  max={500}
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allocationConfig.prioritize3PCommitments}
                    onChange={e => setAllocationConfig({
                      ...allocationConfig,
                      prioritize3PCommitments: e.target.checked,
                    })}
                    className="rounded border-steel-300 text-rail-600"
                  />
                  <span className="text-sm text-steel-700">Prioritize 3P</span>
                </label>
              </div>
            </div>

            {/* Last Result Summary */}
            {lastAllocationResult && (
              <div className={`p-3 rounded-lg ${lastAllocationResult.success ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
                <div className="flex items-start gap-3">
                  {lastAllocationResult.success ? (
                    <CheckCircleIcon className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
                  )}
                  <div className="flex-1">
                    <p className={`font-medium ${lastAllocationResult.success ? 'text-emerald-900' : 'text-red-900'}`}>
                      {lastAllocationResult.success ? 'Allocation Complete' : 'Allocation Failed'}
                    </p>
                    <div className="flex flex-wrap gap-4 mt-1 text-sm">
                      <span className="text-steel-600">
                        Allocated: <strong>{lastAllocationResult.summary.allocated}</strong>
                      </span>
                      <span className="text-steel-600">
                        3P Filled: <strong>{lastAllocationResult.summary.thirdPartyFilled}</strong>
                      </span>
                      <span className="text-steel-600">
                        AITX: <strong>{lastAllocationResult.summary.aitxFilled}</strong>
                      </span>
                      <span className="text-steel-600">
                        Urgent Handled: <strong>{lastAllocationResult.summary.urgentCarsHandled}</strong>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Urgency Queue */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-steel-900">Urgency Queue</h2>
                <p className="text-sm text-steel-500">Top unassigned cars by priority</p>
              </div>
              <button
                onClick={() => navigate('/cars?shoppingStatus=Urgent,Must Shop')}
                className="text-sm text-rail-600 hover:text-rail-800 font-medium"
              >
                View All
              </button>
            </div>

            {urgencyQueue.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-steel-200">
                      <th className="text-left py-2 text-xs font-medium text-steel-500 uppercase">Railcar #</th>
                      <th className="text-left py-2 text-xs font-medium text-steel-500 uppercase">Customer</th>
                      <th className="text-left py-2 text-xs font-medium text-steel-500 uppercase">Status</th>
                      <th className="text-right py-2 text-xs font-medium text-steel-500 uppercase">Days Until Due</th>
                      <th className="text-right py-2 text-xs font-medium text-steel-500 uppercase">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {urgencyQueue.slice(0, 10).map(item => (
                      <tr
                        key={item.car.id}
                        className="hover:bg-steel-50 cursor-pointer"
                        onClick={() => navigate(`/cars?search=${item.car.railcarNumber}`)}
                      >
                        <td className="py-2 font-medium text-steel-900">{item.car.railcarNumber}</td>
                        <td className="py-2 text-steel-700">{item.car.customer || '-'}</td>
                        <td className="py-2">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            item.urgencyScore.urgencyLevel === 'critical' ? 'bg-red-100 text-red-700' :
                            item.urgencyScore.urgencyLevel === 'high' ? 'bg-amber-100 text-amber-700' :
                            item.urgencyScore.urgencyLevel === 'medium' ? 'bg-blue-100 text-blue-700' :
                            'bg-steel-100 text-steel-700'
                          }`}>
                            {item.urgencyScore.shoppingStatus}
                          </span>
                        </td>
                        <td className={`py-2 text-right ${
                          item.urgencyScore.daysUntilDue !== null && item.urgencyScore.daysUntilDue < 0
                            ? 'text-red-600 font-semibold'
                            : 'text-steel-700'
                        }`}>
                          {item.urgencyScore.daysUntilDue !== null
                            ? item.urgencyScore.daysUntilDue < 0
                              ? `${Math.abs(item.urgencyScore.daysUntilDue)} overdue`
                              : item.urgencyScore.daysUntilDue
                            : '-'}
                        </td>
                        <td className="py-2 text-right">
                          <span className={`font-medium ${
                            item.urgencyScore.total >= 80 ? 'text-red-600' :
                            item.urgencyScore.total >= 60 ? 'text-amber-600' :
                            'text-steel-600'
                          }`}>
                            {item.urgencyScore.total}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-steel-500">
                <TruckIcon className="h-12 w-12 mx-auto mb-2 text-steel-300" />
                <p>No cars in urgency queue</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Utilization Heatmap */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-steel-900">Network Utilization</h2>
            <p className="text-sm text-steel-500">Shop capacity heatmap across the planning horizon</p>
          </div>
          <ChartBarIcon className="h-5 w-5 text-steel-400" />
        </div>
        <UtilizationHeatmap
          data={heatmapData || undefined}
          isLoading={!heatmapData}
          showSummary={true}
          onShopClick={handleShopClick}
        />
      </div>
    </div>
  );
}
