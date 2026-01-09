/**
 * Team Leader Dashboard
 *
 * Main dashboard with slicers for filtering, KPI cards, and data visualizations.
 * Supports filtering by year, team, network (AITX/3P), region, and customer.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TruckIcon,
  BuildingStorefrontIcon,
  BeakerIcon,
  WrenchScrewdriverIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  Cog6ToothIcon,
  CalendarDaysIcon,
  DocumentChartBarIcon,
  FunnelIcon,
  XMarkIcon,
  AdjustmentsHorizontalIcon,
  ChartBarIcon,
  UserGroupIcon,
  BuildingOffice2Icon,
  MapPinIcon,
  ClipboardDocumentListIcon,
  CubeIcon,
  ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline';
import { analyticsApi, carsApi, shopsApi } from '../services/api';
import type { AnalyticsData, Car, Shop } from '../types';
import { useCarUpdates, useDashboardUpdates } from '../contexts/WebSocketContext';
import { useActiveMasterPlan, useMasterPlanSummary } from '../hooks/useQueryWithCompany';
import { sopApi } from '../services/sopApi';
import type { DemandRegister } from '../types/sop';
import { ALL_NETWORKS, getSystemTotalCapacity } from '../constants/shopNetworks';

const DAYS_IN_SHOP_THRESHOLD = 10;

// Team filter types
type TeamFilter = 'all' | 'qualification' | 'assignment_release' | 'in_service_repairs';
type NetworkFilter = 'all' | 'aitx' | 'thirdParty';

// Regions available for filtering
const REGIONS = ['Northeast', 'Southeast', 'Midwest', 'Southwest', 'West', 'Canada', 'Mexico'];

interface DashboardFilters {
  year: number;
  team: TeamFilter;
  network: NetworkFilter;
  region: string | null;
  customer: string | null;
}

// Monthly shopping data structure
interface MonthlyShoppingData {
  month: string;
  aitx: number;
  thirdParty: number;
  total: number;
  byShop: Record<string, number>;
}

// My Queue car structure
interface MyQueueCar {
  id: string;
  railcarNumber: string;
  customer: string;
  planStatus: string;
  status: string;
}

// S&OP Summary structure
interface SOPSummary {
  notPlanned: number;
  overdue: number;
  planned: number;
  scheduled: number;
}

export default function Dashboard() {
  const currentYear = new Date().getFullYear();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filteredCars, setFilteredCars] = useState<Car[]>([]);
  const [monthlyShoppings, setMonthlyShoppings] = useState<MonthlyShoppingData[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [customers, setCustomers] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [myQueueSortField, setMyQueueSortField] = useState<'railcarNumber' | 'customer'>('railcarNumber');
  const [myQueueSortAsc, setMyQueueSortAsc] = useState(true);
  const [myQueueFilter, setMyQueueFilter] = useState('');
  const navigate = useNavigate();

  // S&OP Dashboard state - now uses API data
  const [sopSummary, setSopSummary] = useState<SOPSummary | null>(null);
  const [demandRegister, setDemandRegister] = useState<DemandRegister | null>(null);
  const [sopLoading, setSopLoading] = useState(true);
  const [sopError, setSopError] = useState<string | null>(null);

  // Dashboard filters state
  const [filters, setFilters] = useState<DashboardFilters>({
    year: currentYear,
    team: 'all',
    network: 'all',
    region: null,
    customer: null,
  });

  // MasterPlan data using TanStack Query
  const { data: activeMasterPlan, isLoading: isMasterPlanLoading } = useActiveMasterPlan();
  const { data: masterPlanSummary } = useMasterPlanSummary(activeMasterPlan?.id);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.team !== 'all') count++;
    if (filters.network !== 'all') count++;
    if (filters.region) count++;
    if (filters.customer) count++;
    return count;
  }, [filters]);

  const loadAnalytics = useCallback(async () => {
    try {
      setError(null);
      setSopLoading(true);
      const data = await analyticsApi.getDashboard();
      setAnalytics(data);

      // Set S&OP summary from API
      if ((data as any).sopSummary) {
        setSopSummary((data as any).sopSummary);
        setSopLoading(false);
      }

      // Set monthly shoppings from API
      if ((data as any).monthlyShoppings) {
        setMonthlyShoppings((data as any).monthlyShoppings);
      } else {
        loadMonthlyShoppings();
      }
    } catch (err: unknown) {
      console.error('Failed to load analytics:', err);
      setSopLoading(false);
      // Check if we have partial data from the error response
      const errorResponse = err as { response?: { data?: { partialData?: AnalyticsData; error?: string } } };
      if (errorResponse?.response?.data?.partialData) {
        setAnalytics(errorResponse.response.data.partialData);
        setError(`Dashboard loaded with limited data: ${errorResponse.response.data.error || 'Some data unavailable'}`);
      } else {
        // Set default analytics data so the page still renders
        setAnalytics({
          totalCars: 0,
          totalShops: 0,
          activePlans: 0,
          carsInService: 0,
          carsInQueue: 0,
          totalCarsInShop: 0,
          shopsWithCars: 0,
          activeScenarios: 0,
          monthlyServiceCounts: [],
          shopPerformance: [],
          costBreakdown: [],
          upcomingServices: [],
          myQueue: [],
          inShopStatus: [],
          alerts: { overdueCars: 0, capacityAlerts: [], hasAlerts: false },
        });
        setError('Failed to load dashboard data. Please try refreshing the page. The S&OP section below may still show data.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load shops for network filtering
  const loadShops = async () => {
    try {
      const shopsData = await shopsApi.getAll({ isActive: true });
      setShops(shopsData);
    } catch (err) {
      console.error('Failed to load shops:', err);
    }
  };

  // Load unique customers for filter dropdown
  const loadCustomers = async () => {
    try {
      const response = await carsApi.getAll({ page: 1, pageSize: 1000 });
      const uniqueCustomers = [...new Set(response.data.map((c: Car) => c.customer).filter(Boolean))].sort();
      setCustomers(uniqueCustomers as string[]);
    } catch (err) {
      console.error('Failed to load customers:', err);
    }
  };

  // Load cars based on filters
  const loadTeamData = async () => {
    try {
      let statusFilter: string | undefined;

      switch (filters.team) {
        case 'qualification':
          statusFilter = 'planned';
          break;
        case 'assignment_release':
          statusFilter = 'release,assignment';
          break;
        case 'in_service_repairs':
          statusFilter = 'in_shop';
          break;
        default:
          statusFilter = undefined;
      }

      const response = await carsApi.getAll({
        page: 1,
        pageSize: 100,
        status: statusFilter,
        customer: filters.customer || undefined,
      });

      // Apply additional client-side filters
      let cars = response.data;

      // Filter by network (based on assigned shop)
      if (filters.network !== 'all' && shops.length > 0) {
        const networkShopIds = shops
          .filter((s) => (filters.network === 'aitx' ? s.isAitxInternal : !s.isAitxInternal))
          .map((s) => s.id);
        cars = cars.filter((c: Car) => !c.assignedShopId || networkShopIds.includes(c.assignedShopId));
      }

      // Filter by region
      if (filters.region) {
        cars = cars.filter((c: Car) => c.homeRegion === filters.region || c.originRegion === filters.region);
      }

      setFilteredCars(cars);
    } catch (error) {
      console.error('Failed to load team data:', error);
    }
  };

  // Load monthly shoppings fallback (cars with arrived status)
  const loadMonthlyShoppings = async () => {
    try {
      const response = await carsApi.getAll({
        page: 1,
        pageSize: 500,
        status: 'arrived',
      });

      // Group by month
      const monthlyData: Record<string, { total: number; byShop: Record<string, number> }> = {};
      response.data.forEach((car: Car) => {
        const dateStr = car.arrivalDate || car.shopEntryDate;
        if (dateStr) {
          const month = dateStr.slice(0, 7);
          if (!monthlyData[month]) {
            monthlyData[month] = { total: 0, byShop: {} };
          }
          monthlyData[month].total++;
          // Track by shop if available
          const shopName = (car as any).assignedShop?.name || 'Unknown';
          monthlyData[month].byShop[shopName] = (monthlyData[month].byShop[shopName] || 0) + 1;
        }
      });

      const sortedData: MonthlyShoppingData[] = Object.entries(monthlyData)
        .map(([month, data]) => ({
          month,
          aitx: 0, // Fallback doesn't have network info
          thirdParty: data.total, // Put all in 3rd party for fallback
          total: data.total,
          byShop: data.byShop,
        }))
        .sort((a, b) => a.month.localeCompare(b.month))
        .slice(-6);

      setMonthlyShoppings(sortedData);
    } catch (error) {
      console.error('Failed to load monthly shoppings:', error);
    }
  };

  // Load S&OP demand register data
  const loadSOPData = useCallback(async () => {
    try {
      setSopError(null);
      setSopLoading(true);
      const register = await sopApi.demandRegistry.getDemandRegister(currentYear, true);
      setDemandRegister(register);
    } catch (err) {
      console.error('Failed to load S&OP data:', err);
      setSopError('Failed to load S&OP planning data.');
    } finally {
      setSopLoading(false);
    }
  }, [currentYear]);

  // Initial load
  useEffect(() => {
    loadAnalytics();
    loadShops();
    loadCustomers();
    loadSOPData();
  }, [loadAnalytics, loadSOPData]);

  // Reload data when filters change
  useEffect(() => {
    loadTeamData();
  }, [filters, shops]);

  // Real-time updates via WebSocket
  const handleCarUpdate = useCallback(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  useCarUpdates(handleCarUpdate);
  useDashboardUpdates(handleCarUpdate);

  // Reset all filters
  const resetFilters = () => {
    setFilters({
      year: currentYear,
      team: 'all',
      network: 'all',
      region: null,
      customer: null,
    });
  };

  // KPI Card click handlers
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
          description: 'Shops with arrived cars',
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
      {/* Header with Year Selector and Filters Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-steel-900">Team Leader Dashboard</h1>
          <p className="text-sm text-steel-500">
            Rail car service scheduling overview
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Year Selector */}
          <div className="flex items-center gap-2 bg-steel-100 rounded-lg p-1">
            <button
              onClick={() => setFilters((f) => ({ ...f, year: f.year - 1 }))}
              className="p-1.5 rounded hover:bg-steel-200 text-steel-600"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <span className="px-2 text-sm font-semibold text-steel-900 min-w-[60px] text-center">
              {filters.year}
            </span>
            <button
              onClick={() => setFilters((f) => ({ ...f, year: f.year + 1 }))}
              className="p-1.5 rounded hover:bg-steel-200 text-steel-600"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Filters Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              showFilters || activeFilterCount > 0
                ? 'bg-rail-100 text-rail-700 border border-rail-300'
                : 'bg-steel-100 text-steel-700 hover:bg-steel-200'
            }`}
          >
            <FunnelIcon className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-rail-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Slicers Panel */}
      {showFilters && (
        <div className="card p-4 bg-steel-50 border-steel-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AdjustmentsHorizontalIcon className="h-5 w-5 text-steel-500" />
              <h3 className="text-sm font-semibold text-steel-700">Dashboard Filters</h3>
            </div>
            {activeFilterCount > 0 && (
              <button
                onClick={resetFilters}
                className="flex items-center gap-1 text-xs text-steel-500 hover:text-steel-700"
              >
                <XMarkIcon className="h-3 w-3" />
                Clear All
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Network Slicer */}
            <div>
              <label className="block text-xs font-medium text-steel-600 mb-1">
                <BuildingOffice2Icon className="h-3 w-3 inline mr-1" />
                Network
              </label>
              <select
                value={filters.network}
                onChange={(e) => setFilters((f) => ({ ...f, network: e.target.value as NetworkFilter }))}
                className="input w-full text-sm py-1.5"
              >
                <option value="all">All Networks</option>
                <option value="aitx">AITX Internal</option>
                <option value="thirdParty">3rd Party</option>
              </select>
            </div>

            {/* Region Slicer */}
            <div>
              <label className="block text-xs font-medium text-steel-600 mb-1">
                <MapPinIcon className="h-3 w-3 inline mr-1" />
                Region
              </label>
              <select
                value={filters.region || ''}
                onChange={(e) => setFilters((f) => ({ ...f, region: e.target.value || null }))}
                className="input w-full text-sm py-1.5"
              >
                <option value="">All Regions</option>
                {REGIONS.map((region) => (
                  <option key={region} value={region}>{region}</option>
                ))}
              </select>
            </div>

            {/* Customer Slicer */}
            <div>
              <label className="block text-xs font-medium text-steel-600 mb-1">
                <UserGroupIcon className="h-3 w-3 inline mr-1" />
                Customer
              </label>
              <select
                value={filters.customer || ''}
                onChange={(e) => setFilters((f) => ({ ...f, customer: e.target.value || null }))}
                className="input w-full text-sm py-1.5"
              >
                <option value="">All Customers</option>
                {customers.slice(0, 50).map((customer) => (
                  <option key={customer} value={customer}>{customer}</option>
                ))}
              </select>
            </div>

            {/* Team Slicer */}
            <div>
              <label className="block text-xs font-medium text-steel-600 mb-1">
                <UserGroupIcon className="h-3 w-3 inline mr-1" />
                Team View
              </label>
              <select
                value={filters.team}
                onChange={(e) => setFilters((f) => ({ ...f, team: e.target.value as TeamFilter }))}
                className="input w-full text-sm py-1.5"
              >
                <option value="all">All Teams</option>
                <option value="qualification">Qualification</option>
                <option value="assignment_release">Assignment & Release</option>
                <option value="in_service_repairs">In-Service Repairs</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Team Filter Buttons (Quick Access) */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-steel-500">Quick Team Filter:</span>
        <button
          onClick={() => setFilters((f) => ({ ...f, team: 'all' }))}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            filters.team === 'all'
              ? 'bg-rail-600 text-white'
              : 'bg-steel-100 text-steel-700 hover:bg-steel-200'
          }`}
        >
          All Cars
        </button>
        <button
          onClick={() => setFilters((f) => ({ ...f, team: 'qualification' }))}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
            filters.team === 'qualification'
              ? 'bg-indigo-600 text-white'
              : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
          }`}
        >
          <CheckCircleIcon className="h-4 w-4" />
          Qualification
        </button>
        <button
          onClick={() => setFilters((f) => ({ ...f, team: 'assignment_release' }))}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
            filters.team === 'assignment_release'
              ? 'bg-orange-600 text-white'
              : 'bg-orange-50 text-orange-700 hover:bg-orange-100'
          }`}
        >
          <ArrowPathIcon className="h-4 w-4" />
          Assignment & Release
        </button>
        <button
          onClick={() => setFilters((f) => ({ ...f, team: 'in_service_repairs' }))}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
            filters.team === 'in_service_repairs'
              ? 'bg-amber-600 text-white'
              : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
          }`}
        >
          <Cog6ToothIcon className="h-4 w-4" />
          In-Service Repairs
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-center gap-3">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
            <button
              onClick={() => {
                setError(null);
                loadAnalytics();
              }}
              className="ml-auto text-sm font-medium text-red-600 hover:text-red-800"
            >
              Retry
            </button>
          </div>
        </div>
      )}

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

      {/* Active Master Plan Summary */}
      {activeMasterPlan && (
        <div className="card p-4 border-l-4 border-l-rail-500">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="bg-rail-100 rounded-lg p-2">
                <CalendarDaysIcon className="h-5 w-5 text-rail-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-steel-900">Active Master Plan</h3>
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
                    Active
                  </span>
                </div>
                <p className="text-sm text-steel-600 mt-0.5">{activeMasterPlan.planName}</p>
                <p className="text-xs text-steel-500 mt-1">
                  FY{activeMasterPlan.fiscalYear} v{activeMasterPlan.version} |{' '}
                  {activeMasterPlan.commitments?.length || masterPlanSummary?.totalCommitments || 0} commitments
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate('/masterplan')}
              className="flex items-center gap-1 text-sm font-medium text-rail-600 hover:text-rail-800"
            >
              View Plan
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>

          {masterPlanSummary && (
            <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-steel-100">
              <div className="flex items-center gap-2">
                <DocumentChartBarIcon className="h-4 w-4 text-steel-400" />
                <span className="text-sm text-steel-600">
                  <strong className="text-steel-900">{Object.keys(masterPlanSummary.commitmentsByShop || {}).length}</strong> shops
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CalendarDaysIcon className="h-4 w-4 text-steel-400" />
                <span className="text-sm text-steel-600">
                  <strong className="text-steel-900">{Object.keys(masterPlanSummary.commitmentsByMonth || {}).length}</strong> months
                </span>
              </div>
              {masterPlanSummary.commitmentsByStatus?.released !== undefined && (
                <div className="flex items-center gap-2">
                  <CheckCircleIcon className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-steel-600">
                    <strong className="text-green-600">{masterPlanSummary.commitmentsByStatus.released || 0}</strong> released
                  </span>
                </div>
              )}
              {masterPlanSummary.totalEstimatedCost > 0 && (
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-sm text-steel-500">
                    Est. Cost: <strong className="text-steel-900">${(masterPlanSummary.totalEstimatedCost / 1000).toFixed(0)}K</strong>
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* No Active Plan Banner */}
      {!isMasterPlanLoading && !activeMasterPlan && (
        <div className="card p-4 bg-steel-50 border-dashed border-2 border-steel-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CalendarDaysIcon className="h-5 w-5 text-steel-400" />
              <div>
                <p className="text-sm font-medium text-steel-700">No Active Master Plan</p>
                <p className="text-xs text-steel-500">Create one by approving a scenario in Car Flow Planning</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/car-flow')}
              className="btn-secondary text-sm"
            >
              Go to Car Flow
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

      {/* S&OP Planning Summary Section */}
      <div className="card p-4 border-l-4 border-l-indigo-500">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-100 rounded-lg p-2">
              <ClipboardDocumentListIcon className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="font-semibold text-steel-900">S&OP Planning Summary</h3>
              <p className="text-xs text-steel-500">Cars planned vs not planned for {currentYear}</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/sop-review')}
            className="flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
          >
            View Full S&OP Dashboard
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>

        {sopLoading && !sopSummary ? (
          <div className="flex justify-center py-6">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
          </div>
        ) : sopError && !sopSummary ? (
          <div className="text-center py-4 text-sm text-red-600">
            {sopError}
            <button onClick={loadAnalytics} className="ml-2 text-indigo-600 hover:underline">
              Retry
            </button>
          </div>
        ) : sopSummary ? (
          <>
            {/* Planning Status Cards - Using API sopSummary */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <div
                className="bg-red-50 border border-red-200 rounded-lg p-3 cursor-pointer hover:bg-red-100 transition-colors"
                onClick={() => navigate('/cars?planStatus=Not%20Planned')}
              >
                <div className="flex items-center gap-2 mb-1">
                  <ExclamationTriangleIcon className="h-4 w-4 text-red-600" />
                  <span className="text-xs font-medium text-red-700">Not Planned</span>
                </div>
                <p className="text-2xl font-bold text-red-900">{sopSummary.notPlanned}</p>
                <p className="text-xs text-red-600">Cars with no shopping plan</p>
              </div>

              <div
                className="bg-amber-50 border border-amber-200 rounded-lg p-3 cursor-pointer hover:bg-amber-100 transition-colors"
                onClick={() => navigate('/cars?overdue=true')}
              >
                <div className="flex items-center gap-2 mb-1">
                  <ClockIcon className="h-4 w-4 text-amber-600" />
                  <span className="text-xs font-medium text-amber-700">Overdue</span>
                </div>
                <p className="text-2xl font-bold text-amber-900">{sopSummary.overdue}</p>
                <p className="text-xs text-amber-600">Due in prior years</p>
              </div>

              <div
                className="bg-blue-50 border border-blue-200 rounded-lg p-3 cursor-pointer hover:bg-blue-100 transition-colors"
                onClick={() => navigate('/cars?hasActivePlan=true')}
              >
                <div className="flex items-center gap-2 mb-1">
                  <CubeIcon className="h-4 w-4 text-blue-600" />
                  <span className="text-xs font-medium text-blue-700">Planned</span>
                </div>
                <p className="text-2xl font-bold text-blue-900">{sopSummary.planned}</p>
                <p className="text-xs text-blue-600">Have a shopping plan</p>
              </div>

              <div
                className="bg-green-50 border border-green-200 rounded-lg p-3 cursor-pointer hover:bg-green-100 transition-colors"
                onClick={() => navigate('/cars?planStatus=Confirmed')}
              >
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircleIcon className="h-4 w-4 text-green-600" />
                  <span className="text-xs font-medium text-green-700">Scheduled</span>
                </div>
                <p className="text-2xl font-bold text-green-900">{sopSummary.scheduled}</p>
                <p className="text-xs text-green-600">Confirmed status</p>
              </div>
            </div>

            {/* Demand by Work Type */}
            {demandRegister?.summaries && demandRegister.summaries.length > 0 && (
              <div className="border-t border-steel-100 pt-4 mb-4">
                <h4 className="text-sm font-medium text-steel-700 mb-3">Demand by Work Type</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {demandRegister.summaries.map((summary) => (
                    <div key={summary.workType} className="bg-steel-50 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-steel-700">{summary.label}</span>
                        <span className="text-lg font-bold text-steel-900">{summary.total}</span>
                      </div>
                      <div className="mt-2 flex gap-2 text-xs">
                        <span className="text-red-600">{summary.notPlanned} not planned</span>
                        <span className="text-steel-400">|</span>
                        <span className="text-red-600">{summary.overdue} overdue</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* System Capacity Overview */}
            {(() => {
              const capacity = getSystemTotalCapacity();
              const totalDemand = demandRegister?.items?.length || 0;
              const utilization = capacity.annual > 0 ? (totalDemand / capacity.annual) * 100 : 0;
              return (
                <div className="border-t border-steel-100 pt-4">
                  <h4 className="text-sm font-medium text-steel-700 mb-3 flex items-center gap-2">
                    <ArrowTrendingUpIcon className="h-4 w-4" />
                    System Capacity Overview
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="text-center">
                      <p className="text-xs text-steel-500">Total Demand</p>
                      <p className="text-lg font-bold text-steel-900">{totalDemand}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-steel-500">Annual Capacity</p>
                      <p className="text-lg font-bold text-steel-900">{capacity.annual.toLocaleString()}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-steel-500">Utilization</p>
                      <p className={`text-lg font-bold ${utilization > 90 ? 'text-red-600' : utilization > 70 ? 'text-amber-600' : 'text-green-600'}`}>
                        {utilization.toFixed(1)}%
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-steel-500">AITX / 3P Split</p>
                      <p className="text-lg font-bold text-steel-900">{capacity.aitxPercent}% / {capacity.thirdPartyPercent}%</p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Quick Links */}
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-steel-100">
              <button
                onClick={() => navigate('/demand-registry')}
                className="btn-secondary text-xs"
              >
                Demand Registry
              </button>
              <button
                onClick={() => navigate('/sop-capacity')}
                className="btn-secondary text-xs"
              >
                Supply Capacity
              </button>
              <button
                onClick={() => navigate('/car-flow')}
                className="btn-secondary text-xs"
              >
                Car Flow Planning
              </button>
            </div>
          </>
        ) : null}
      </div>

      {/* Team View Results (shown when team filter is active) */}
      {filters.team !== 'all' && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-steel-900">
                {filters.team === 'qualification' && 'Qualification Queue'}
                {filters.team === 'assignment_release' && 'Assignment & Release Cars'}
                {filters.team === 'in_service_repairs' && 'In-Service Repairs'}
              </h3>
              <p className="text-xs text-steel-500">
                {filters.team === 'qualification' && 'Planned cars due for qualification (Full Qual assigned to Qual Team)'}
                {filters.team === 'assignment_release' && 'Cars in release or assignment status'}
                {filters.team === 'in_service_repairs' && 'Cars currently in shop for repairs (Partial Qual assigned here)'}
              </p>
            </div>
            <span className="text-sm font-medium text-steel-600 bg-steel-100 px-2 py-1 rounded">
              {filteredCars.length} cars
            </span>
          </div>
          {filteredCars.length > 0 ? (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-steel-200">
                    <th className="text-left py-2 text-xs font-medium text-steel-500 uppercase">Railcar #</th>
                    <th className="text-left py-2 text-xs font-medium text-steel-500 uppercase">Customer</th>
                    <th className="text-left py-2 text-xs font-medium text-steel-500 uppercase">Status</th>
                    <th className="text-left py-2 text-xs font-medium text-steel-500 uppercase">Qual Type</th>
                    <th className="text-left py-2 text-xs font-medium text-steel-500 uppercase">Reason</th>
                    {filters.team === 'qualification' && (
                      <th className="text-left py-2 text-xs font-medium text-steel-500 uppercase">Tank Qual Due</th>
                    )}
                    {filters.team === 'in_service_repairs' && (
                      <th className="text-right py-2 text-xs font-medium text-steel-500 uppercase">Days In Shop</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {filteredCars.slice(0, 15).map((car) => (
                    <tr
                      key={car.id}
                      className="hover:bg-steel-50 cursor-pointer"
                      onClick={() => navigate(`/cars?search=${encodeURIComponent(car.railcarNumber)}&carId=${car.id}`)}
                    >
                      <td className="py-2 font-medium text-steel-900">{car.railcarNumber}</td>
                      <td className="py-2 text-steel-700">{car.customer || '-'}</td>
                      <td className="py-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          car.status === 'planned' ? 'bg-indigo-100 text-indigo-800' :
                          car.status === 'release' ? 'bg-orange-100 text-orange-800' :
                          car.status === 'assignment' ? 'bg-cyan-100 text-cyan-800' :
                          car.status === 'in_shop' ? 'bg-amber-100 text-amber-800' :
                          'bg-steel-100 text-steel-800'
                        }`}>
                          {car.status?.replace('_', ' ') || '-'}
                        </span>
                      </td>
                      <td className="py-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          car.qualificationType?.toLowerCase().includes('full') ? 'bg-indigo-100 text-indigo-800' :
                          car.qualificationType?.toLowerCase().includes('partial') ? 'bg-amber-100 text-amber-800' :
                          'bg-steel-100 text-steel-600'
                        }`}>
                          {car.qualificationType || car.fullPartialQual || '-'}
                        </span>
                      </td>
                      <td className="py-2 text-steel-700">{car.reasonsShopped || car.reasonShopped || '-'}</td>
                      {filters.team === 'qualification' && (
                        <td className="py-2 text-steel-700">
                          {car.tankQualDueDate
                            ? new Date(car.tankQualDueDate).toLocaleDateString()
                            : car.tankQualification
                            ? new Date(car.tankQualification).toLocaleDateString()
                            : '-'}
                        </td>
                      )}
                      {filters.team === 'in_service_repairs' && (
                        <td className={`py-2 text-right ${getDaysInShopColor(car.daysInShop)}`}>
                          {car.daysInShop}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredCars.length > 15 && (
                <div className="mt-2 pt-2 border-t border-steel-100 text-center">
                  <button
                    onClick={() => navigate(`/cars?status=${filters.team === 'qualification' ? 'planned' : filters.team === 'assignment_release' ? 'release,assignment' : 'in_shop'}`)}
                    className="text-sm text-rail-600 hover:text-rail-800 font-medium"
                  >
                    View all {filteredCars.length} cars
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-steel-500 py-4 text-center">No cars in this category</p>
          )}
        </div>
      )}

      {/* Operational Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* My Queue Widget - Cars with no plan */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ClockIcon className="h-5 w-5 text-rail-500" />
              <h3 className="text-sm font-semibold text-steel-900">My Queue</h3>
            </div>
            <button
              onClick={() => navigate('/cars?planStatus=Not%20Planned')}
              className="text-xs text-rail-600 hover:text-rail-800 font-medium"
            >
              View All
            </button>
          </div>
          <p className="text-xs text-steel-500 mb-2">
            Cars with no shopping plan - requires scheduling
          </p>
          {/* Filter input */}
          <div className="mb-3">
            <input
              type="text"
              placeholder="Filter by car number or customer..."
              value={myQueueFilter}
              onChange={(e) => setMyQueueFilter(e.target.value)}
              className="w-full px-2 py-1 text-sm border border-steel-200 rounded focus:outline-none focus:ring-1 focus:ring-rail-500"
            />
          </div>
          {isLoading ? (
            <div className="text-sm text-steel-500 py-4 text-center">Loading...</div>
          ) : analytics?.myQueue?.length ? (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-steel-200">
                    <th
                      className="text-left py-2 text-xs font-medium text-steel-500 uppercase cursor-pointer hover:text-steel-700"
                      onClick={() => {
                        if (myQueueSortField === 'railcarNumber') {
                          setMyQueueSortAsc(!myQueueSortAsc);
                        } else {
                          setMyQueueSortField('railcarNumber');
                          setMyQueueSortAsc(true);
                        }
                      }}
                    >
                      Railcar # {myQueueSortField === 'railcarNumber' && (myQueueSortAsc ? '↑' : '↓')}
                    </th>
                    <th
                      className="text-left py-2 text-xs font-medium text-steel-500 uppercase cursor-pointer hover:text-steel-700"
                      onClick={() => {
                        if (myQueueSortField === 'customer') {
                          setMyQueueSortAsc(!myQueueSortAsc);
                        } else {
                          setMyQueueSortField('customer');
                          setMyQueueSortAsc(true);
                        }
                      }}
                    >
                      Customer {myQueueSortField === 'customer' && (myQueueSortAsc ? '↑' : '↓')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {(analytics.myQueue as MyQueueCar[])
                    .filter((car) => {
                      if (!myQueueFilter) return true;
                      const filterLower = myQueueFilter.toLowerCase();
                      return (
                        car.railcarNumber?.toLowerCase().includes(filterLower) ||
                        car.customer?.toLowerCase().includes(filterLower)
                      );
                    })
                    .sort((a, b) => {
                      const aVal = myQueueSortField === 'railcarNumber' ? a.railcarNumber : a.customer;
                      const bVal = myQueueSortField === 'railcarNumber' ? b.railcarNumber : b.customer;
                      const comparison = (aVal || '').localeCompare(bVal || '');
                      return myQueueSortAsc ? comparison : -comparison;
                    })
                    .slice(0, 10)
                    .map((car) => (
                      <tr
                        key={car.id}
                        className="hover:bg-steel-50 cursor-pointer"
                        onClick={() => navigate(`/cars?search=${encodeURIComponent(car.railcarNumber)}&carId=${car.id}`)}
                      >
                        <td className="py-2 font-medium text-steel-900">{car.railcarNumber}</td>
                        <td className="py-2 text-steel-700">{car.customer || '-'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-steel-500 py-4 text-center">No cars without plans</p>
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
                      onClick={() => navigate(`/cars?search=${encodeURIComponent(car.railcarNumber)}&carId=${car.id}`)}
                    >
                      <td className="py-2 font-medium text-steel-900">{car.railcarNumber}</td>
                      <td className="py-2 text-steel-700">{car.shopName}</td>
                      <td className="py-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          car.status === 'in_shop' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {car.status?.replace('_', ' ') || '-'}
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
        {/* Monthly Shoppings - Stacked bars by network */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-steel-900">Monthly Shoppings</h3>
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-rail-500 rounded" />
                <span className="text-steel-500">AITX</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-emerald-500 rounded" />
                <span className="text-steel-500">3rd Party</span>
              </div>
            </div>
          </div>
          <p className="text-xs text-steel-500 mb-3">Total cars in plan by month (click month for shop breakdown)</p>
          <div className="h-52 flex items-end justify-around bg-steel-50 rounded-lg p-3">
            {isLoading ? (
              <p className="text-steel-500 text-sm self-center">Loading...</p>
            ) : monthlyShoppings.length > 0 ? (
              monthlyShoppings.slice(-6).map((item) => {
                const maxCount = Math.max(...monthlyShoppings.slice(-6).map((s) => s.total), 1);
                const aitxHeight = (item.aitx / maxCount) * 100;
                const thirdPartyHeight = (item.thirdParty / maxCount) * 100;
                const isSelected = selectedMonth === item.month;
                return (
                  <div
                    key={item.month}
                    className={`flex flex-col items-center cursor-pointer transition-all ${isSelected ? 'scale-105' : 'hover:scale-102'}`}
                    onClick={() => setSelectedMonth(isSelected ? null : item.month)}
                  >
                    <span className="text-xs text-steel-700 font-medium mb-1">{item.total}</span>
                    <div className="flex flex-col w-10">
                      {/* 3rd Party (top) */}
                      {item.thirdParty > 0 && (
                        <div
                          className={`bg-emerald-500 w-full rounded-t transition-all ${isSelected ? 'bg-emerald-600' : 'hover:bg-emerald-600'}`}
                          style={{ height: `${Math.max(thirdPartyHeight * 1.3, item.thirdParty > 0 ? 4 : 0)}px` }}
                          title={`3P: ${item.thirdParty}`}
                        />
                      )}
                      {/* AITX (bottom) */}
                      {item.aitx > 0 && (
                        <div
                          className={`bg-rail-500 w-full transition-all ${item.thirdParty === 0 ? 'rounded-t' : ''} ${isSelected ? 'bg-rail-600' : 'hover:bg-rail-600'}`}
                          style={{ height: `${Math.max(aitxHeight * 1.3, item.aitx > 0 ? 4 : 0)}px` }}
                          title={`AITX: ${item.aitx}`}
                        />
                      )}
                    </div>
                    <span className={`text-xs mt-2 ${isSelected ? 'text-rail-600 font-medium' : 'text-steel-500'}`}>
                      {item.month.slice(5)}
                    </span>
                  </div>
                );
              })
            ) : (
              <p className="text-steel-500 text-sm self-center">No data available</p>
            )}
          </div>

          {/* Month drill-down - Show cars by shop when a month is selected */}
          {selectedMonth && monthlyShoppings.length > 0 && (
            <div className="mt-4 pt-4 border-t border-steel-200">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-steel-700">
                  {selectedMonth} - Cars by Shop
                </h4>
                <button
                  onClick={() => setSelectedMonth(null)}
                  className="text-xs text-steel-500 hover:text-steel-700"
                >
                  Close
                </button>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {(() => {
                  const monthData = monthlyShoppings.find((m) => m.month === selectedMonth);
                  if (!monthData?.byShop) return <p className="text-xs text-steel-500">No shop breakdown available</p>;
                  const shopEntries = Object.entries(monthData.byShop).sort((a, b) => b[1] - a[1]);
                  return shopEntries.map(([shopName, count]) => (
                    <div key={shopName} className="flex items-center justify-between text-sm">
                      <span className="text-steel-700 truncate">{shopName}</span>
                      <span className="font-medium text-steel-900 bg-steel-100 px-2 py-0.5 rounded">{count}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}
        </div>

        {/* Shop Performance */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-steel-900">Shop Performance</h3>
            <button
              onClick={() => navigate('/shops')}
              className="text-xs text-rail-600 hover:text-rail-800 font-medium"
            >
              View All
            </button>
          </div>
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
