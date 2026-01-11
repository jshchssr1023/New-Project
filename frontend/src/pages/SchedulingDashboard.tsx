/**
 * Scheduling Dashboard Page
 *
 * Central hub for scheduling visibility that addresses the UX requirements:
 * - Clear view of what's scheduled vs what needs scheduling
 * - Visual workflow progress tracker (Plan → Communicate → Schedule → Execute → Close Out)
 * - Quick access to PDF export for any plan
 * - Filtering and reporting capabilities
 *
 * This page consolidates scheduling information that was previously scattered
 * across multiple pages into a single, actionable view.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDaysIcon,
  ChartBarIcon,
  DocumentArrowDownIcon,
  ArrowPathIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XMarkIcon,
  ChevronRightIcon,
  ClipboardDocumentListIcon,
  TruckIcon,
  BuildingStorefrontIcon,
} from '@heroicons/react/24/outline';
import {
  WorkflowProgressTracker,
  SchedulingStatusPanel,
  ExportPlanButton,
} from '../components/scheduling';
import type { WorkflowCounts, SchedulingItem, PlanPDFData } from '../components/scheduling';
import { carsApi, shopsApi } from '../services/api';
import proposalsApi from '../services/api/proposals';
import { getShoppingStatus } from '../components/cars/ShoppingStatusBadge';
import type { Car, Shop } from '../types';

interface SchedulingFilters {
  customer: string;
  shop: string;
  month: string;
  status: string;
}

export default function SchedulingDashboard() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data state
  const [cars, setCars] = useState<Car[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [customers, setCustomers] = useState<string[]>([]);

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<SchedulingFilters>({
    customer: '',
    shop: '',
    month: '',
    status: '',
  });
  const [searchQuery, setSearchQuery] = useState('');

  // Selected plan for PDF export
  const [selectedPlanForExport, setSelectedPlanForExport] = useState<PlanPDFData | null>(null);

  // Load data
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [carsRes, shopsRes] = await Promise.all([
        carsApi.getAll({ page: 1, pageSize: 500 }),
        shopsApi.getAll({ isActive: true }),
      ]);

      setCars(carsRes.data);
      setShops(shopsRes);

      // Extract unique customers
      const uniqueCustomers = [...new Set(carsRes.data.map((c: Car) => c.customer).filter(Boolean))].sort();
      setCustomers(uniqueCustomers as string[]);
    } catch (err) {
      console.error('Failed to load scheduling data:', err);
      setError('Failed to load scheduling data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Compute workflow counts using car data and active plans
  const workflowCounts = useMemo<WorkflowCounts>(() => {
    // Count cars with active plans (planned or in progress)
    const carsWithPlans = cars.filter(c => c.activePlan && c.activePlan.status === 'Planned').length;
    const carsInProgress = cars.filter(c => c.activePlan && c.activePlan.status === 'InProgress').length;
    const carsInShop = cars.filter(c => c.status === 'in_shop' || c.status === 'in_service' || c.status === 'Arrived').length;
    const completedCars = cars.filter(c => c.status === 'Complete' || c.status === 'completed').length;

    return {
      plan: carsWithPlans,
      communicate: 0, // Scenarios feature removed
      schedule: carsInProgress,
      execute: carsInShop,
      closeOut: completedCars,
    };
  }, [cars]);

  // Compute needs scheduling items
  const needsSchedulingItems = useMemo<SchedulingItem[]>(() => {
    return cars
      .filter(car => {
        // Filter by status - only include available/unscheduled cars
        if (car.status === 'in_shop' || car.status === 'in_service' || car.status === 'completed' || car.status === 'retired') {
          return false;
        }
        // Filter by shopping status
        const shoppingStatus = getShoppingStatus(car as any);
        return shoppingStatus === 'Urgent' || shoppingStatus === 'Must Shop' || shoppingStatus === 'Upcoming';
      })
      .filter(car => {
        // Apply filters
        if (filters.customer && car.customer !== filters.customer) return false;
        if (searchQuery && !car.railcarNumber.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
      })
      .map(car => {
        const shoppingStatus = getShoppingStatus(car as any);
        let status: SchedulingItem['status'] = 'upcoming';
        if (shoppingStatus === 'Urgent') status = 'urgent';
        else if (shoppingStatus === 'Must Shop') status = 'must_shop';

        return {
          id: car.id,
          carNumber: car.railcarNumber,
          customer: car.customer || 'Unknown',
          status,
          dueDate: (car as any).tankQualification || car.tankQualDueDate,
        };
      });
  }, [cars, filters, searchQuery]);

  // Compute scheduled items
  const scheduledItems = useMemo<SchedulingItem[]>(() => {
    return cars
      .filter(car => {
        // Include scheduled/planned cars
        if (car.status !== 'scheduled' && car.status !== 'planned') {
          return false;
        }
        // Apply filters
        if (filters.customer && car.customer !== filters.customer) return false;
        if (filters.shop && car.assignedShopId !== filters.shop) return false;
        if (searchQuery && !car.railcarNumber.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
      })
      .map(car => ({
        id: car.id,
        carNumber: car.railcarNumber,
        customer: car.customer || 'Unknown',
        status: 'scheduled' as const,
        scheduledMonth: car.activePlan?.plannedDate || (car.activePlan ? `${car.activePlan.plannedMonth}/${car.activePlan.plannedYear}` : ''),
        shopName: car.activePlan?.shopName || shops.find(s => s.id === car.assignedShopId)?.name,
      }));
  }, [cars, shops, filters, searchQuery]);

  // Quick stats
  const quickStats = useMemo(() => {
    const urgentCount = needsSchedulingItems.filter(i => i.status === 'urgent').length;
    const mustShopCount = needsSchedulingItems.filter(i => i.status === 'must_shop').length;
    const upcomingCount = needsSchedulingItems.filter(i => i.status === 'upcoming').length;
    const scheduledCount = scheduledItems.length;

    return { urgentCount, mustShopCount, upcomingCount, scheduledCount };
  }, [needsSchedulingItems, scheduledItems]);

  // Generate months for filter
  const monthOptions = useMemo(() => {
    const months = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
      months.push({
        value: date.toISOString().slice(0, 7),
        label: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      });
    }
    return months;
  }, []);

  // Clear filters
  const clearFilters = () => {
    setFilters({ customer: '', shop: '', month: '', status: '' });
    setSearchQuery('');
  };

  const hasActiveFilters = filters.customer || filters.shop || filters.month || filters.status || searchQuery;

  // Handle item click
  const handleItemClick = (item: SchedulingItem) => {
    navigate(`/cars?search=${item.carNumber}`);
  };

  // Handle view all
  const handleViewAllUnscheduled = () => {
    navigate('/cars?shoppingStatus=Urgent,Must%20Shop,Upcoming');
  };

  const handleViewAllScheduled = () => {
    navigate('/cars?status=scheduled,planned');
  };

  // Handle stage click from workflow tracker
  const handleStageClick = (stage: keyof WorkflowCounts) => {
    switch (stage) {
      case 'plan':
        navigate('/scenarios?status=draft');
        break;
      case 'communicate':
        navigate('/scenarios?status=sent');
        break;
      case 'schedule':
        navigate('/scheduling-queue');
        break;
      case 'execute':
        navigate('/cars?status=in_shop');
        break;
      case 'closeOut':
        navigate('/cars?status=completed');
        break;
    }
  };

  // Create PDF data from scenario
  // Create PDF data from cars with active plans (scenarios removed)
  const createPlanPDFDataFromCars = (carsWithPlans: Car[]): PlanPDFData => {
    const uniqueShops = new Set(carsWithPlans.map(c => c.activePlan?.shopId).filter(Boolean));
    return {
      planName: 'Scheduled Cars Export',
      planNumber: `EXP-${new Date().toISOString().slice(0, 10)}`,
      version: 1,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
      summary: {
        totalCars: carsWithPlans.length,
        totalShops: uniqueShops.size,
        estimatedCost: 0, // Not tracked at car level
        planningHorizonStart: carsWithPlans[0]?.activePlan?.plannedDate,
        planningHorizonEnd: carsWithPlans[carsWithPlans.length - 1]?.activePlan?.plannedDate,
      },
      cars: carsWithPlans.map(car => ({
        id: car.id,
        carNumber: car.railcarNumber || 'Unknown',
        customer: car.customer || 'Unknown',
        scheduledMonth: car.activePlan?.plannedDate || '',
        shopName: car.activePlan?.shopName,
        workType: 'Qualification',
        estimatedCost: 0,
        status: car.activePlan?.status?.toLowerCase() || 'planned',
      })),
    };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <ArrowPathIcon className="h-8 w-8 text-rail-600 mx-auto animate-spin" />
          <p className="mt-3 text-sm text-steel-500">Loading scheduling dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-steel-900">Scheduling Dashboard</h1>
          <p className="text-sm text-steel-500 mt-1">
            Track scheduling progress across all workflow stages
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="inline-flex items-center gap-2 px-3 py-2 border border-steel-300 text-steel-700 rounded-lg hover:bg-steel-50 transition-colors"
          >
            <ArrowPathIcon className="h-4 w-4" />
            Refresh
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
              showFilters || hasActiveFilters
                ? 'bg-rail-100 text-rail-700 border border-rail-300'
                : 'border border-steel-300 text-steel-700 hover:bg-steel-50'
            }`}
          >
            <FunnelIcon className="h-4 w-4" />
            Filters
            {hasActiveFilters && (
              <span className="bg-rail-600 text-white text-xs px-1.5 py-0.5 rounded-full">!</span>
            )}
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
            <p className="text-sm text-red-800">{error}</p>
            <button
              onClick={loadData}
              className="ml-auto text-sm font-medium text-red-600 hover:text-red-800"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Workflow Progress Tracker */}
      <WorkflowProgressTracker
        counts={workflowCounts}
        onStageClick={handleStageClick}
      />

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-steel-50 rounded-lg border border-steel-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-steel-700">Filter Options</h3>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-xs text-steel-500 hover:text-steel-700"
              >
                <XMarkIcon className="h-3 w-3" />
                Clear All
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div>
              <label className="block text-xs font-medium text-steel-600 mb-1">Search</label>
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-steel-400" />
                <input
                  type="text"
                  placeholder="Car number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input w-full pl-9 py-2 text-sm"
                />
              </div>
            </div>

            {/* Customer */}
            <div>
              <label className="block text-xs font-medium text-steel-600 mb-1">Customer</label>
              <select
                value={filters.customer}
                onChange={(e) => setFilters(f => ({ ...f, customer: e.target.value }))}
                className="input w-full text-sm py-2"
              >
                <option value="">All Customers</option>
                {customers.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Shop */}
            <div>
              <label className="block text-xs font-medium text-steel-600 mb-1">Shop</label>
              <select
                value={filters.shop}
                onChange={(e) => setFilters(f => ({ ...f, shop: e.target.value }))}
                className="input w-full text-sm py-2"
              >
                <option value="">All Shops</option>
                {shops.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Month */}
            <div>
              <label className="block text-xs font-medium text-steel-600 mb-1">Month</label>
              <select
                value={filters.month}
                onChange={(e) => setFilters(f => ({ ...f, month: e.target.value }))}
                className="input w-full text-sm py-2"
              >
                <option value="">All Months</option>
                {monthOptions.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Quick Stats Banner */}
      <div className="bg-white rounded-lg border border-steel-200 p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-sm text-steel-500">Needs Scheduling:</span>
              <div className="flex items-center gap-1">
                <span className="px-2 py-1 rounded-lg bg-red-100 text-red-800 text-xs font-bold border border-red-300">
                  {quickStats.urgentCount} Urgent
                </span>
                <span className="px-2 py-1 rounded-lg bg-amber-100 text-amber-800 text-xs font-bold border border-amber-300">
                  {quickStats.mustShopCount} Must Shop
                </span>
                <span className="px-2 py-1 rounded-lg bg-blue-100 text-blue-800 text-xs font-bold border border-blue-300">
                  {quickStats.upcomingCount} Upcoming
                </span>
              </div>
            </div>
            <div className="h-6 w-px bg-steel-200" />
            <div className="flex items-center gap-2">
              <span className="text-sm text-steel-500">Scheduled:</span>
              <span className="px-2 py-1 rounded-lg bg-green-100 text-green-800 text-xs font-bold border border-green-300">
                {quickStats.scheduledCount} Cars
              </span>
            </div>
          </div>
          <button
            onClick={() => navigate('/scenarios')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-rail-600 text-white rounded-lg hover:bg-rail-700 transition-colors text-sm font-medium"
          >
            <ClipboardDocumentListIcon className="h-4 w-4" />
            Create New Plan
          </button>
        </div>
      </div>

      {/* Main Content: Scheduling Status Panel */}
      <SchedulingStatusPanel
        needsScheduling={needsSchedulingItems}
        scheduled={scheduledItems}
        onItemClick={handleItemClick}
        onViewAllUnscheduled={handleViewAllUnscheduled}
        onViewAllScheduled={handleViewAllScheduled}
        maxItems={8}
      />

      {/* Recent Plans Section */}
      <div className="bg-white rounded-lg border border-steel-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-steel-200 bg-steel-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardDocumentListIcon className="h-5 w-5 text-steel-600" />
              <h2 className="font-semibold text-steel-900">Recent Plans</h2>
            </div>
            <button
              onClick={() => navigate('/scenarios')}
              className="text-sm text-rail-600 hover:text-rail-800 font-medium flex items-center gap-1"
            >
              View All
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="text-center py-8">
          <ClipboardDocumentListIcon className="h-12 w-12 text-steel-300 mx-auto mb-2" />
          <p className="text-sm text-steel-500">Use Service Plans to schedule cars</p>
          <button
            onClick={() => navigate('/service-plans')}
            className="mt-3 text-sm font-medium text-rail-600 hover:text-rail-800"
          >
            Go to Service Plans
          </button>
        </div>
      </div>

      {/* Help Section */}
      <div className="bg-indigo-50 rounded-lg border border-indigo-200 p-4">
        <h3 className="font-semibold text-indigo-900 mb-2">Understanding the Workflow</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-sm">
          <div>
            <p className="font-medium text-indigo-800">1. Plan</p>
            <p className="text-indigo-700">Create scenarios by selecting cars and assigning shops</p>
          </div>
          <div>
            <p className="font-medium text-indigo-800">2. Communicate</p>
            <p className="text-indigo-700">Send proposals to customers for approval</p>
          </div>
          <div>
            <p className="font-medium text-indigo-800">3. Schedule</p>
            <p className="text-indigo-700">Convert approved proposals to committed plans</p>
          </div>
          <div>
            <p className="font-medium text-indigo-800">4. Execute</p>
            <p className="text-indigo-700">Track cars as they enter and progress through shops</p>
          </div>
          <div>
            <p className="font-medium text-indigo-800">5. Close Out</p>
            <p className="text-indigo-700">Complete work and archive for reporting</p>
          </div>
        </div>
      </div>
    </div>
  );
}
