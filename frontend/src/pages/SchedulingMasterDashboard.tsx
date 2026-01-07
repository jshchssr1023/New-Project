/**
 * Scheduling Master Dashboard
 *
 * The unified single source of truth for car planning and scheduling.
 * Provides a complete view of:
 * - Inventory by work type (Full Qual, Partial Qual, Assignment, Release)
 * - Network commitment tracking (Committed vs Planned vs Scheduled)
 * - Success metrics (Planning rate, Schedule rate, Completion rate)
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CalendarIcon,
  BuildingStorefrontIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  TruckIcon,
  DocumentCheckIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import { carsApi, shopsApi } from '../services/api';
import { sopDashboardApi } from '../services/sopApi';
import type { Car, Shop } from '../types';
import type { WorkType, DemandRegister, DemandRegisterSummary } from '../types/sop';

// Work type configuration for display
const WORK_TYPE_CONFIG: Record<WorkType, { label: string; shortLabel: string; color: string; bgColor: string }> = {
  full_qualification: { label: 'Full Qualifications', shortLabel: 'Full Qual', color: 'text-purple-700', bgColor: 'bg-purple-100' },
  partial_qualification: { label: 'Partial Qualifications', shortLabel: 'Part Qual', color: 'text-indigo-700', bgColor: 'bg-indigo-100' },
  assignment: { label: 'Assignments', shortLabel: 'Assign', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  release: { label: 'Releases', shortLabel: 'Release', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  repair: { label: 'Repairs', shortLabel: 'Repair', color: 'text-gray-700', bgColor: 'bg-gray-100' },
};

// Status configuration
const STATUS_CONFIG = {
  not_planned: { label: 'Not Planned', color: 'text-red-600', bgColor: 'bg-red-50' },
  planned: { label: 'Planned', color: 'text-yellow-600', bgColor: 'bg-yellow-50' },
  scheduled: { label: 'Scheduled', color: 'text-blue-600', bgColor: 'bg-blue-50' },
  in_progress: { label: 'In Progress', color: 'text-purple-600', bgColor: 'bg-purple-50' },
  completed: { label: 'Completed', color: 'text-green-600', bgColor: 'bg-green-50' },
};

interface NetworkCommitment {
  networkId: string;
  networkName: string;
  isAitx: boolean;
  monthlyCommitment: number;
  plannedCount: number;
  scheduledCount: number;
  inProgressCount: number;
  completedCount: number;
  variance: number;
  variancePercent: number;
  status: 'on_track' | 'at_risk' | 'behind';
}

interface SuccessMetrics {
  planningRate: number; // % cars planned before due date
  scheduleRate: number; // % planned cars that are scheduled
  completionRate: number; // % scheduled cars completed on time
  totalCarsNeedingWork: number;
  totalPlanned: number;
  totalScheduled: number;
  totalCompleted: number;
  overdueCars: number;
}

interface WorkTypeInventory {
  workType: WorkType;
  notPlanned: number;
  planned: number;
  scheduled: number;
  inProgress: number;
  completed: number;
  overdue: number;
  total: number;
}

export default function SchedulingMasterDashboard() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // State
  const [cars, setCars] = useState<Car[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [demandRegister, setDemandRegister] = useState<DemandRegister | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWorkType, setSelectedWorkType] = useState<WorkType | null>(null);
  const [selectedYear, setSelectedYear] = useState(currentYear);

  // Fetch data
  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      setError(null);
      try {
        const [carsData, shopsData, dashboardData] = await Promise.all([
          carsApi.getAll(),
          shopsApi.getAll(),
          sopDashboardApi.getDashboardData(selectedYear),
        ]);
        setCars(carsData);
        setShops(shopsData);
        setDemandRegister(dashboardData.demandRegister);
      } catch (err: any) {
        console.error('Error fetching dashboard data:', err);
        setError(err.message || 'Failed to load dashboard data');
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [selectedYear]);

  // Calculate work type inventory from demand register
  const workTypeInventory = useMemo((): WorkTypeInventory[] => {
    if (!demandRegister) return [];

    const workTypes: WorkType[] = ['full_qualification', 'partial_qualification', 'assignment', 'release', 'repair'];

    return workTypes.map(workType => {
      const summary = demandRegister.summaries.find(s => s.workType === workType);
      if (!summary) {
        return {
          workType,
          notPlanned: 0,
          planned: 0,
          scheduled: 0,
          inProgress: 0,
          completed: 0,
          overdue: 0,
          total: 0,
        };
      }

      // Calculate from items
      const items = demandRegister.items.filter(i => i.workType === workType);
      const notPlanned = items.filter(i => i.planningState === 'not_planned').length;
      const planned = items.filter(i => i.planningState === 'planned' || i.planningState === 'tentatively_scheduled' || i.planningState === 'awaiting_confirmation').length;
      const scheduled = items.filter(i => i.planningState === 'scheduled').length;
      const inProgress = items.filter(i => i.planningState === 'in_progress').length;
      const completed = items.filter(i => i.planningState === 'completed').length;
      const overdue = items.filter(i => i.isOverdue).length;

      return {
        workType,
        notPlanned,
        planned,
        scheduled,
        inProgress,
        completed,
        overdue,
        total: summary.total,
      };
    });
  }, [demandRegister]);

  // Calculate network commitments
  const networkCommitments = useMemo((): NetworkCommitment[] => {
    if (!shops.length) return [];

    // Group shops by network
    const networkMap = new Map<string, { name: string; isAitx: boolean; shops: Shop[] }>();

    // Add AITX network
    const aitxShops = shops.filter(s => s.isAitxInternal);
    if (aitxShops.length > 0) {
      networkMap.set('aitx', { name: 'AITX Internal', isAitx: true, shops: aitxShops });
    }

    // Group third-party shops by network
    shops.filter(s => !s.isAitxInternal && s.network).forEach(shop => {
      const networkName = shop.network || 'Other';
      if (!networkMap.has(networkName)) {
        networkMap.set(networkName, { name: networkName, isAitx: false, shops: [] });
      }
      networkMap.get(networkName)!.shops.push(shop);
    });

    return Array.from(networkMap.entries()).map(([networkId, network]) => {
      const monthlyCommitment = network.shops.reduce((sum, s) => sum + (s.capacity || 0), 0);

      // Count cars by status for this network's shops
      const networkShopIds = new Set(network.shops.map(s => s.id));
      const networkCars = cars.filter(c => c.assignedShopId && networkShopIds.has(c.assignedShopId));

      const plannedCount = networkCars.filter(c => c.status === 'planned' || c.status === 'scheduled').length;
      const scheduledCount = networkCars.filter(c => c.status === 'scheduled').length;
      const inProgressCount = networkCars.filter(c => c.status === 'in_shop').length;
      const completedCount = networkCars.filter(c => c.status === 'complete').length;

      const totalPlannedAndScheduled = plannedCount + scheduledCount + inProgressCount;
      const variance = totalPlannedAndScheduled - monthlyCommitment;
      const variancePercent = monthlyCommitment > 0 ? (variance / monthlyCommitment) * 100 : 0;

      let status: 'on_track' | 'at_risk' | 'behind' = 'on_track';
      if (variancePercent < -20) status = 'behind';
      else if (variancePercent < -10) status = 'at_risk';

      return {
        networkId,
        networkName: network.name,
        isAitx: network.isAitx,
        monthlyCommitment,
        plannedCount,
        scheduledCount,
        inProgressCount,
        completedCount,
        variance,
        variancePercent,
        status,
      };
    }).sort((a, b) => (a.isAitx ? -1 : 1) - (b.isAitx ? -1 : 1));
  }, [shops, cars]);

  // Calculate success metrics
  const successMetrics = useMemo((): SuccessMetrics => {
    if (!demandRegister) {
      return {
        planningRate: 0,
        scheduleRate: 0,
        completionRate: 0,
        totalCarsNeedingWork: 0,
        totalPlanned: 0,
        totalScheduled: 0,
        totalCompleted: 0,
        overdueCars: 0,
      };
    }

    const items = demandRegister.items;
    const totalCarsNeedingWork = items.length;
    const overdueCars = items.filter(i => i.isOverdue).length;

    const plannedOrBetter = items.filter(i =>
      ['planned', 'tentatively_scheduled', 'awaiting_confirmation', 'scheduled', 'in_progress', 'completed'].includes(i.planningState)
    ).length;

    const scheduledOrBetter = items.filter(i =>
      ['scheduled', 'in_progress', 'completed'].includes(i.planningState)
    ).length;

    const completed = items.filter(i => i.planningState === 'completed').length;

    // Calculate rates
    const planningRate = totalCarsNeedingWork > 0 ? (plannedOrBetter / totalCarsNeedingWork) * 100 : 0;
    const scheduleRate = plannedOrBetter > 0 ? (scheduledOrBetter / plannedOrBetter) * 100 : 0;
    const completionRate = scheduledOrBetter > 0 ? (completed / scheduledOrBetter) * 100 : 0;

    return {
      planningRate,
      scheduleRate,
      completionRate,
      totalCarsNeedingWork,
      totalPlanned: plannedOrBetter,
      totalScheduled: scheduledOrBetter,
      totalCompleted: completed,
      overdueCars,
    };
  }, [demandRegister]);

  // Handle work type card click
  const handleWorkTypeClick = (workType: WorkType) => {
    setSelectedWorkType(selectedWorkType === workType ? null : workType);
    // Navigate to demand registry filtered by work type
    navigate(`/demand-registry?workType=${workType}`);
  };

  // Render loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <ExclamationTriangleIcon className="h-6 w-6 text-red-500" />
          <div>
            <h3 className="font-medium text-red-800">Error Loading Dashboard</h3>
            <p className="text-sm text-red-600">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scheduling Master</h1>
          <p className="text-sm text-gray-500 mt-1">Single source of truth for car planning and scheduling</p>
        </div>
        <div className="flex items-center gap-4">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          >
            {[currentYear - 1, currentYear, currentYear + 1].map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          <button
            onClick={() => navigate('/car-flow')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Cog6ToothIcon className="h-5 w-5" />
            Open Planner
          </button>
        </div>
      </div>

      {/* Section 1: Work Type Inventory Cards */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <TruckIcon className="h-5 w-5 text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900">Inventory by Work Type</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {workTypeInventory.map((inv) => {
            const config = WORK_TYPE_CONFIG[inv.workType];
            return (
              <button
                key={inv.workType}
                onClick={() => handleWorkTypeClick(inv.workType)}
                className={`p-4 rounded-lg border-2 transition-all hover:shadow-md text-left ${
                  selectedWorkType === inv.workType
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${config.bgColor} ${config.color}`}>
                    {config.shortLabel}
                  </span>
                  {inv.overdue > 0 && (
                    <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">
                      {inv.overdue} overdue
                    </span>
                  )}
                </div>

                <div className="text-2xl font-bold text-gray-900 mb-2">{inv.total}</div>

                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-red-600">Not Planned</span>
                    <span className="font-medium text-red-700">{inv.notPlanned}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-yellow-600">Planned</span>
                    <span className="font-medium text-yellow-700">{inv.planned}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-600">Scheduled</span>
                    <span className="font-medium text-blue-700">{inv.scheduled}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-purple-600">In Progress</span>
                    <span className="font-medium text-purple-700">{inv.inProgress}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-600">Completed</span>
                    <span className="font-medium text-green-700">{inv.completed}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 2: Network Commitment Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BuildingStorefrontIcon className="h-5 w-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900">Network Commitment Tracking</h2>
          </div>
          <span className="text-sm text-gray-500">
            Current Month: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Network</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">Commitment</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">Planned</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">Scheduled</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">In Progress</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">Variance</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {networkCommitments.map((network) => (
                <tr key={network.networkId} className="hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      {network.isAitx && (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded font-medium">AITX</span>
                      )}
                      <span className="font-medium text-gray-900">{network.networkName}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center font-medium text-gray-900">{network.monthlyCommitment}</td>
                  <td className="py-3 px-4 text-center text-yellow-600 font-medium">{network.plannedCount}</td>
                  <td className="py-3 px-4 text-center text-blue-600 font-medium">{network.scheduledCount}</td>
                  <td className="py-3 px-4 text-center text-purple-600 font-medium">{network.inProgressCount}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`inline-flex items-center gap-1 font-medium ${
                      network.variance >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {network.variance >= 0 ? (
                        <ArrowTrendingUpIcon className="h-4 w-4" />
                      ) : (
                        <ArrowTrendingDownIcon className="h-4 w-4" />
                      )}
                      {network.variance >= 0 ? '+' : ''}{network.variance}
                      <span className="text-xs text-gray-400">({network.variancePercent.toFixed(0)}%)</span>
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                      network.status === 'on_track' ? 'bg-green-100 text-green-700' :
                      network.status === 'at_risk' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {network.status === 'on_track' && <CheckCircleIcon className="h-3 w-3" />}
                      {network.status === 'at_risk' && <ClockIcon className="h-3 w-3" />}
                      {network.status === 'behind' && <ExclamationTriangleIcon className="h-3 w-3" />}
                      {network.status === 'on_track' ? 'On Track' : network.status === 'at_risk' ? 'At Risk' : 'Behind'}
                    </span>
                  </td>
                </tr>
              ))}
              {networkCommitments.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-500">
                    No network data available
                  </td>
                </tr>
              )}
            </tbody>
            {networkCommitments.length > 0 && (
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr>
                  <td className="py-3 px-4 font-semibold text-gray-900">Total</td>
                  <td className="py-3 px-4 text-center font-semibold text-gray-900">
                    {networkCommitments.reduce((sum, n) => sum + n.monthlyCommitment, 0)}
                  </td>
                  <td className="py-3 px-4 text-center font-semibold text-yellow-600">
                    {networkCommitments.reduce((sum, n) => sum + n.plannedCount, 0)}
                  </td>
                  <td className="py-3 px-4 text-center font-semibold text-blue-600">
                    {networkCommitments.reduce((sum, n) => sum + n.scheduledCount, 0)}
                  </td>
                  <td className="py-3 px-4 text-center font-semibold text-purple-600">
                    {networkCommitments.reduce((sum, n) => sum + n.inProgressCount, 0)}
                  </td>
                  <td className="py-3 px-4 text-center font-semibold">
                    {(() => {
                      const totalVariance = networkCommitments.reduce((sum, n) => sum + n.variance, 0);
                      return (
                        <span className={totalVariance >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {totalVariance >= 0 ? '+' : ''}{totalVariance}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="py-3 px-4"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Section 3: Success Metrics */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <ChartBarIcon className="h-5 w-5 text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900">Success Metrics</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Planning Rate */}
          <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-blue-700">Planning Rate</span>
              <CalendarIcon className="h-5 w-5 text-blue-500" />
            </div>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold text-blue-900">{successMetrics.planningRate.toFixed(0)}%</span>
              <span className="text-sm text-blue-600 mb-1">of cars planned</span>
            </div>
            <div className="mt-2 h-2 bg-blue-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all"
                style={{ width: `${Math.min(100, successMetrics.planningRate)}%` }}
              />
            </div>
            <div className="mt-2 text-xs text-blue-600">
              {successMetrics.totalPlanned} of {successMetrics.totalCarsNeedingWork} cars
              {successMetrics.overdueCars > 0 && (
                <span className="text-red-600 ml-2">• {successMetrics.overdueCars} overdue</span>
              )}
            </div>
          </div>

          {/* Schedule Rate */}
          <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-purple-700">Schedule Rate</span>
              <DocumentCheckIcon className="h-5 w-5 text-purple-500" />
            </div>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold text-purple-900">{successMetrics.scheduleRate.toFixed(0)}%</span>
              <span className="text-sm text-purple-600 mb-1">of planned are scheduled</span>
            </div>
            <div className="mt-2 h-2 bg-purple-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-600 rounded-full transition-all"
                style={{ width: `${Math.min(100, successMetrics.scheduleRate)}%` }}
              />
            </div>
            <div className="mt-2 text-xs text-purple-600">
              {successMetrics.totalScheduled} of {successMetrics.totalPlanned} planned cars
            </div>
          </div>

          {/* Completion Rate */}
          <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-green-700">Completion Rate</span>
              <CheckCircleIcon className="h-5 w-5 text-green-500" />
            </div>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold text-green-900">{successMetrics.completionRate.toFixed(0)}%</span>
              <span className="text-sm text-green-600 mb-1">completed on time</span>
            </div>
            <div className="mt-2 h-2 bg-green-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-600 rounded-full transition-all"
                style={{ width: `${Math.min(100, successMetrics.completionRate)}%` }}
              />
            </div>
            <div className="mt-2 text-xs text-green-600">
              {successMetrics.totalCompleted} of {successMetrics.totalScheduled} scheduled cars
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <button
          onClick={() => navigate('/demand-registry')}
          className="flex items-center justify-center gap-2 p-4 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all group"
        >
          <TruckIcon className="h-6 w-6 text-gray-400 group-hover:text-blue-500" />
          <span className="font-medium text-gray-700 group-hover:text-blue-600">View Demand Registry</span>
        </button>
        <button
          onClick={() => navigate('/car-flow')}
          className="flex items-center justify-center gap-2 p-4 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all group"
        >
          <CalendarIcon className="h-6 w-6 text-gray-400 group-hover:text-purple-500" />
          <span className="font-medium text-gray-700 group-hover:text-purple-600">Plan & Schedule</span>
        </button>
        <button
          onClick={() => navigate('/shop-networks')}
          className="flex items-center justify-center gap-2 p-4 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all group"
        >
          <BuildingStorefrontIcon className="h-6 w-6 text-gray-400 group-hover:text-green-500" />
          <span className="font-medium text-gray-700 group-hover:text-green-600">Manage Networks</span>
        </button>
        <button
          onClick={() => navigate('/analytics')}
          className="flex items-center justify-center gap-2 p-4 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all group"
        >
          <ChartBarIcon className="h-6 w-6 text-gray-400 group-hover:text-amber-500" />
          <span className="font-medium text-gray-700 group-hover:text-amber-600">View Analytics</span>
        </button>
      </div>
    </div>
  );
}
