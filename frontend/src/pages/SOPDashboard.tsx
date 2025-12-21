/**
 * S&OP Dashboard - Power BI-style dashboard
 *
 * Replicates the Power BI dashboard with:
 * - Multiple filter slicers
 * - Volume KPI card
 * - Volume by Network pie chart
 * - Volume by Year bar chart
 * - % Volume by Network by Month stacked bar chart
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { carsApi, shopsApi } from '../services/api';
import { Car, Shop } from '../types';
import Slicer, { SlicerBar, SlicerOption } from '../components/ui/Slicer';
import PieChart, { NETWORK_COLORS } from '../components/dashboard/PieChart';
import StackedBarChart from '../components/dashboard/StackedBarChart';
import { BarChart } from '../components/dashboard/BarChart';
import { ALL_NETWORKS } from '../constants/shopNetworks';

// Predefined car types
const CAR_TYPES = [
  'Tank Car',
  'Covered Hopper',
  'Open Hopper',
  'Boxcar',
  'Gondola',
  'Flatcar',
  'Intermodal',
];

// Shop reasons / work types
const SHOP_REASONS = [
  'Qualification',
  'Assignment',
  'Repair',
  'Release',
  'Return',
  'Maintenance',
  'Inspection',
  'Annual Inspection',
  'Wheel Repair',
  'Tank Cleaning',
];

// Plan statuses
const PLAN_STATUSES = ['Committed', 'Not Confirmed', 'Not Committed', 'Scheduled', 'Planned'];

// Car statuses
const CAR_STATUSES = [
  'Arrived',
  'Complete',
  'To Be Routed',
  'Release',
  'In Shop',
  'In Transit',
  'Available',
];

// Months for filtering
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface DashboardFilters {
  lesseeName: string;
  arrivalYear: string;
  carType: string;
  reasonsShopped: string[];
  performTankQual: string;
  qualPlanner: string;
  network: string;
  yearDue: string;
  currentStatus: string;
  planStatus: string;
  tier1Customer: string;
}

export default function SOPDashboard() {
  const [cars, setCars] = useState<Car[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Filter state
  const [filters, setFilters] = useState<DashboardFilters>({
    lesseeName: '',
    arrivalYear: '',
    carType: '',
    reasonsShopped: [],
    performTankQual: 'Yes',
    qualPlanner: '',
    network: '',
    yearDue: '',
    currentStatus: '',
    planStatus: '',
    tier1Customer: '',
  });

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [carsRes, shopsRes] = await Promise.all([
          carsApi.getAll({ pageSize: 10000 }),
          shopsApi.getAll(),
        ]);
        setCars(carsRes.data || []);
        setShops(shopsRes || []);
        setLastRefresh(new Date());
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  // Build filter options from data
  const filterOptions = useMemo(() => {
    const lesseeNames = [...new Set(cars.map((c) => c.customer).filter(Boolean))].sort();
    const years = [...new Set(cars.map((c) => {
      if (c.arrivalDate) return new Date(c.arrivalDate).getFullYear().toString();
      if (c.projectedCompletionMonth) {
        const parts = c.projectedCompletionMonth.split('-');
        return parts[0];
      }
      return null;
    }).filter(Boolean))].sort() as string[];

    // Get qualification years from due dates
    const qualYears = new Set<string>();
    cars.forEach((c) => {
      const dates = [
        c.tankQualDueDate, c.minNoLining, c.minWLining, c.interiorLining,
        c.rule88B, c.safetyRelief, c.serviceEquipment, c.stubSill,
        c.tankThickness, c.tankQualification
      ];
      dates.forEach((d) => {
        if (d) {
          const year = new Date(d).getFullYear();
          if (!isNaN(year)) qualYears.add(year.toString());
        }
      });
    });

    const networks = ALL_NETWORKS.map((n) => n.name);

    return {
      lesseeNames: lesseeNames.map((n) => ({ value: n, label: n })),
      years: years.map((y) => ({ value: y, label: y })),
      carTypes: CAR_TYPES.map((t) => ({ value: t, label: t })),
      shopReasons: SHOP_REASONS.map((r) => ({ value: r, label: r })),
      networks: networks.map((n) => ({ value: n, label: n })),
      qualYears: [...qualYears].sort().map((y) => ({ value: y, label: y })),
      statuses: CAR_STATUSES.map((s) => ({ value: s, label: s })),
      planStatuses: PLAN_STATUSES.map((s) => ({ value: s, label: s })),
      customers: lesseeNames.slice(0, 20).map((n) => ({ value: n, label: n })), // Top 20 as tier 1
    };
  }, [cars]);

  // Create shop network lookup
  const shopNetworkMap = useMemo(() => {
    const map: Record<string, string> = {};
    shops.forEach((shop) => {
      if (shop.network) {
        map[shop.id] = shop.network;
      } else if (shop.isAitxInternal) {
        map[shop.id] = 'AITX';
      } else {
        // Try to determine from shop name
        const networkMatch = ALL_NETWORKS.find((n) =>
          shop.name.toLowerCase().includes(n.name.toLowerCase()) ||
          shop.code.toLowerCase().includes(n.code.toLowerCase())
        );
        map[shop.id] = networkMatch?.name || 'Other';
      }
    });
    return map;
  }, [shops]);

  // Apply filters to cars
  const filteredCars = useMemo(() => {
    return cars.filter((car) => {
      if (filters.lesseeName && car.customer !== filters.lesseeName) return false;

      if (filters.arrivalYear) {
        const carYear = car.arrivalDate
          ? new Date(car.arrivalDate).getFullYear().toString()
          : car.projectedCompletionMonth?.split('-')[0];
        if (carYear !== filters.arrivalYear) return false;
      }

      if (filters.carType && car.carType !== filters.carType) return false;

      if (filters.reasonsShopped.length > 0) {
        const carReasons = car.reasonsShopped?.toLowerCase() || '';
        const hasMatch = filters.reasonsShopped.some((r) =>
          carReasons.includes(r.toLowerCase())
        );
        if (!hasMatch) return false;
      }

      if (filters.performTankQual === 'Yes' && !car.performTankQual) return false;
      if (filters.performTankQual === 'No' && car.performTankQual) return false;

      if (filters.network && car.assignedShopId) {
        const shopNetwork = shopNetworkMap[car.assignedShopId];
        if (shopNetwork !== filters.network) return false;
      }

      if (filters.currentStatus && car.status !== filters.currentStatus) return false;

      if (filters.planStatus && car.planStatus !== filters.planStatus) return false;

      return true;
    });
  }, [cars, filters, shopNetworkMap]);

  // Calculate volume metrics
  const volumeMetrics = useMemo(() => {
    const total = filteredCars.length;

    // Volume by network
    const byNetwork: Record<string, number> = {};
    filteredCars.forEach((car) => {
      let network = 'Other';
      if (car.assignedShopId) {
        network = shopNetworkMap[car.assignedShopId] || 'Other';
      }
      byNetwork[network] = (byNetwork[network] || 0) + 1;
    });

    // Volume by year
    const byYear: Record<string, number> = {};
    filteredCars.forEach((car) => {
      let year = 'Unknown';
      if (car.arrivalDate) {
        year = new Date(car.arrivalDate).getFullYear().toString();
      } else if (car.projectedCompletionMonth) {
        year = car.projectedCompletionMonth.split('-')[0];
      }
      byYear[year] = (byYear[year] || 0) + 1;
    });

    // Volume by network by month
    const byNetworkByMonth: Record<string, Record<string, number>> = {};
    MONTHS.forEach((month) => {
      byNetworkByMonth[month] = {};
      ALL_NETWORKS.forEach((n) => {
        byNetworkByMonth[month][n.name] = 0;
      });
      byNetworkByMonth[month]['Other'] = 0;
    });

    filteredCars.forEach((car) => {
      let month = 'Unknown';
      if (car.projectedCompletionMonth) {
        const monthNum = parseInt(car.projectedCompletionMonth.split('-')[1], 10);
        if (monthNum >= 1 && monthNum <= 12) {
          month = MONTHS[monthNum - 1];
        }
      } else if (car.arrivalDate) {
        const monthNum = new Date(car.arrivalDate).getMonth();
        month = MONTHS[monthNum];
      }

      let network = 'Other';
      if (car.assignedShopId) {
        network = shopNetworkMap[car.assignedShopId] || 'Other';
      }

      if (byNetworkByMonth[month]) {
        byNetworkByMonth[month][network] = (byNetworkByMonth[month][network] || 0) + 1;
      }
    });

    return { total, byNetwork, byYear, byNetworkByMonth };
  }, [filteredCars, shopNetworkMap]);

  // Format pie chart data
  const pieChartData = useMemo(() => {
    return Object.entries(volumeMetrics.byNetwork)
      .map(([label, value]) => ({
        label,
        value,
        color: NETWORK_COLORS[label] || '#94A3B8',
      }))
      .sort((a, b) => b.value - a.value);
  }, [volumeMetrics.byNetwork]);

  // Format bar chart data
  const barChartData = useMemo(() => {
    return Object.entries(volumeMetrics.byYear)
      .filter(([year]) => year !== 'Unknown')
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [volumeMetrics.byYear]);

  // Format stacked bar chart data
  const stackedChartData = useMemo(() => {
    return MONTHS.map((month) => ({
      label: month,
      segments: Object.entries(volumeMetrics.byNetworkByMonth[month] || {}).map(([category, value]) => ({
        category,
        value,
      })),
    }));
  }, [volumeMetrics.byNetworkByMonth]);

  // Get active network categories (those with data)
  const activeNetworks = useMemo(() => {
    const networks = new Set<string>();
    Object.values(volumeMetrics.byNetworkByMonth).forEach((monthData) => {
      Object.entries(monthData).forEach(([network, value]) => {
        if (value > 0) networks.add(network);
      });
    });
    return Array.from(networks).sort((a, b) => {
      // Sort AITX first, then alphabetically
      if (a === 'AITX') return -1;
      if (b === 'AITX') return 1;
      return a.localeCompare(b);
    });
  }, [volumeMetrics.byNetworkByMonth]);

  // Update filter
  const updateFilter = useCallback((key: keyof DashboardFilters, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  return (
    <div className="space-y-6">
      {/* Header with KPI */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-6xl font-bold text-steel-900">{volumeMetrics.total}</div>
          <div className="text-sm text-steel-500 mt-1">Volume</div>
        </div>
        <div className="text-right text-sm text-steel-500">
          <div className="font-medium">Last Refresh:</div>
          <div>{lastRefresh.toLocaleDateString()} {lastRefresh.toLocaleTimeString()}</div>
        </div>
      </div>

      {/* Filters Row 1 */}
      <SlicerBar className="bg-white p-4 rounded-lg border border-steel-200">
        <Slicer
          label="Lessee Name"
          options={filterOptions.lesseeNames}
          value={filters.lesseeName}
          onChange={(v) => updateFilter('lesseeName', v)}
          size="sm"
        />
        <Slicer
          label="Projected / Actual Arrival Year"
          options={filterOptions.years}
          value={filters.arrivalYear}
          onChange={(v) => updateFilter('arrivalYear', v)}
          size="sm"
        />
        <Slicer
          label="Car Type Level 2"
          options={filterOptions.carTypes}
          value={filters.carType}
          onChange={(v) => updateFilter('carType', v)}
          size="sm"
        />
        <Slicer
          label="Reason Shopped"
          options={filterOptions.shopReasons}
          value={filters.reasonsShopped}
          onChange={(v) => updateFilter('reasonsShopped', v)}
          multiple
          size="sm"
        />
      </SlicerBar>

      {/* Filters Row 2 */}
      <SlicerBar className="bg-white p-4 rounded-lg border border-steel-200">
        <Slicer
          label="Perform Tank Qual"
          options={[
            { value: 'Yes', label: 'Yes' },
            { value: 'No', label: 'No' },
          ]}
          value={filters.performTankQual}
          onChange={(v) => updateFilter('performTankQual', v)}
          size="sm"
        />
        <Slicer
          label="Qualification Planner"
          options={[
            { value: 'Team A', label: 'Team A' },
            { value: 'Team B', label: 'Team B' },
          ]}
          value={filters.qualPlanner}
          onChange={(v) => updateFilter('qualPlanner', v)}
          size="sm"
        />
        <Slicer
          label="Network Hierarchy"
          options={filterOptions.networks}
          value={filters.network}
          onChange={(v) => updateFilter('network', v)}
          size="sm"
        />
        <Slicer
          label="Year Due"
          options={filterOptions.qualYears}
          value={filters.yearDue}
          onChange={(v) => updateFilter('yearDue', v)}
          size="sm"
        />
        <Slicer
          label="Current Status"
          options={filterOptions.statuses}
          value={filters.currentStatus}
          onChange={(v) => updateFilter('currentStatus', v)}
          size="sm"
        />
      </SlicerBar>

      {/* Filters Row 3 */}
      <SlicerBar className="bg-white p-4 rounded-lg border border-steel-200">
        <Slicer
          label="Plan Status"
          options={filterOptions.planStatuses}
          value={filters.planStatus}
          onChange={(v) => updateFilter('planStatus', v)}
          size="sm"
        />
        <Slicer
          label="Tier 1 Customer"
          options={filterOptions.customers}
          value={filters.tier1Customer}
          onChange={(v) => updateFilter('tier1Customer', v)}
          size="sm"
        />
      </SlicerBar>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Volume by Network - Pie Chart */}
        <div className="bg-white p-6 rounded-lg border border-steel-200">
          <PieChart
            title="Volume by Network"
            data={pieChartData}
            size={220}
            innerRadius={70}
            isLoading={isLoading}
          />
        </div>

        {/* Volume by Year - Bar Chart */}
        <div className="bg-white p-6 rounded-lg border border-steel-200">
          <BarChart
            title="Volume by Year"
            subtitle="Cars scheduled by year"
            data={barChartData}
            isLoading={isLoading}
            color="#22C55E"
            hoverColor="#16A34A"
            height={250}
          />
        </div>
      </div>

      {/* Charts Row 2 - Full Width */}
      <div className="bg-white p-6 rounded-lg border border-steel-200">
        <StackedBarChart
          title="% of Volume by Network"
          data={stackedChartData}
          categories={activeNetworks}
          height={350}
          isLoading={isLoading}
        />
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-steel-200">
          <div className="text-2xl font-bold text-steel-900">
            {Object.keys(volumeMetrics.byNetwork).length}
          </div>
          <div className="text-sm text-steel-500">Networks</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-steel-200">
          <div className="text-2xl font-bold text-steel-900">
            {filteredCars.filter((c) => c.performTankQual).length}
          </div>
          <div className="text-sm text-steel-500">Tank Qual Required</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-steel-200">
          <div className="text-2xl font-bold text-steel-900">
            {filteredCars.filter((c) => c.isTankCar).length}
          </div>
          <div className="text-sm text-steel-500">Tank Cars</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-steel-200">
          <div className="text-2xl font-bold text-steel-900">
            {new Set(filteredCars.map((c) => c.customer)).size}
          </div>
          <div className="text-sm text-steel-500">Unique Customers</div>
        </div>
      </div>
    </div>
  );
}
