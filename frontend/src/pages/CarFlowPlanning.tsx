import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ChartBarIcon,
  TableCellsIcon,
  Cog6ToothIcon,
  ArrowDownTrayIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DocumentArrowDownIcon,
} from '@heroicons/react/24/outline';
import { carsApi, shopsApi, reportsApi, sopApi } from '../services/api';
import type { Car, Shop } from '../types';
import type {
  DemandType,
  AITXShop,
  ThirdPartyNetwork,
  SystemMetrics,
  MonthlyDemandForecast,
  MonthlyAllocation,
  ActionItem,
  PlanningAssumptions,
  DEFAULT_AITX_SHOPS,
  DEFAULT_3P_NETWORKS,
  DEFAULT_ACTION_ITEMS,
  DEFAULT_PLANNING_ASSUMPTIONS,
} from '../types/sop';
import {
  calculateDemandFromCars,
  getCarsByScheduledMonth,
  generate18MonthLabels,
  calculateSystemMetrics,
  generateMonthlyForecast,
  generateMonthlyAllocations,
  calculateDemandPercentages,
  formatNumber,
  formatPercent,
  validateAllocations,
} from '../utils/sopCalculations';

// Import default data
import {
  DEFAULT_AITX_SHOPS as AITX_SHOPS,
  DEFAULT_3P_NETWORKS as NETWORKS_3P,
  DEFAULT_ACTION_ITEMS as ACTION_ITEMS,
  DEFAULT_PLANNING_ASSUMPTIONS as PLANNING_ASSUMPTIONS,
} from '../types/sop';

type TabType = 'dashboard' | 'demand' | 'supply' | 'plan' | 'assumptions';

export default function CarFlowPlanning() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Data state
  const [cars, setCars] = useState<Car[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);

  // S&OP state
  const [demandTypes, setDemandTypes] = useState<DemandType[]>([]);
  const [aitxShops, setAitxShops] = useState<AITXShop[]>(AITX_SHOPS);
  const [thirdPartyNetworks, setThirdPartyNetworks] = useState<ThirdPartyNetwork[]>(NETWORKS_3P);
  const [monthlyForecasts, setMonthlyForecasts] = useState<MonthlyDemandForecast[]>([]);
  const [monthlyAllocations, setMonthlyAllocations] = useState<MonthlyAllocation[]>([]);
  const [assumptions, setAssumptions] = useState<PlanningAssumptions>(PLANNING_ASSUMPTIONS);
  const [assumptionsExpanded, setAssumptionsExpanded] = useState(false);

  // Export handlers
  const handleExportCSV = useCallback(async () => {
    setIsExporting(true);
    setShowExportMenu(false);
    try {
      // Export cars data
      const blob = await reportsApi.exportCSV({
        entityType: 'Car',
        columns: ['railcarNumber', 'carType', 'isTankCar', 'commodity', 'customer', 'status', 'projectedCompletionMonth', 'projectedCost'],
      });

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `sop-car-flow-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      setError('Failed to export data');
    } finally {
      setIsExporting(false);
    }
  }, []);

  const handleExportExcel = useCallback(async () => {
    setIsExporting(true);
    setShowExportMenu(false);
    try {
      const excelData = await reportsApi.exportExcel({
        entityType: 'Car',
        columns: ['railcarNumber', 'carType', 'isTankCar', 'commodity', 'customer', 'status', 'projectedCompletionMonth', 'projectedCost'],
      });

      // Convert to CSV format for Excel compatibility
      const escapeCell = (value: unknown): string => {
        const str = String(value ?? '');
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const headerRow = excelData.headers.map(escapeCell).join(',');
      const dataRows = excelData.rows.map((row) => row.map(escapeCell).join(','));
      const csvContent = [headerRow, ...dataRows].join('\n');

      // Download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `sop-car-flow-${new Date().toISOString().split('T')[0]}.xlsx.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      setError('Failed to export data');
    } finally {
      setIsExporting(false);
    }
  }, []);

  const handleExportPDF = useCallback(async () => {
    setIsExporting(true);
    setShowExportMenu(false);
    try {
      await reportsApi.exportPDF({
        entityType: 'Car',
        columns: ['railcarNumber', 'carType', 'isTankCar', 'commodity', 'customer', 'status', 'projectedCompletionMonth', 'projectedCost'],
        title: 'S&OP Car Flow Planning Report',
      });
    } catch (err) {
      console.error('Export failed:', err);
      setError('Failed to export PDF');
    } finally {
      setIsExporting(false);
    }
  }, []);

  // Save S&OP Plan
  const handleSavePlan = useCallback(async () => {
    setIsSaving(true);
    setSaveSuccess(null);
    setError(null);
    try {
      // Build allocations object from monthlyAllocations
      const allocations: Record<string, Record<string, number>> = {};

      monthlyAllocations.forEach((monthAlloc) => {
        allocations[monthAlloc.month] = {};
        monthAlloc.shopAllocations.forEach((shopAlloc) => {
          if (shopAlloc.cars > 0) {
            allocations[monthAlloc.month][shopAlloc.shopId] = shopAlloc.cars;
          }
        });
      });

      // Build shop capacities object
      const shopCapacities: Record<string, { monthlyCapacity: number; isAITX: boolean }> = {};

      aitxShops.forEach((shop) => {
        shopCapacities[shop.id] = {
          monthlyCapacity: shop.monthlyCapacity,
          isAITX: true,
        };
      });

      thirdPartyNetworks.forEach((network) => {
        shopCapacities[network.id] = {
          monthlyCapacity: network.monthlyCapacity,
          isAITX: false,
        };
      });

      const result = await sopApi.saveAllocations({
        allocations,
        shopCapacities,
      });

      if (result.success) {
        setSaveSuccess(`Plan saved successfully! ${result.created || 0} allocations created.`);
        setHasUnsavedChanges(false);
        // Clear success message after 5 seconds
        setTimeout(() => setSaveSuccess(null), 5000);
      } else {
        setError(result.message || 'Failed to save plan');
      }
    } catch (err) {
      console.error('Save failed:', err);
      setError('Failed to save S&OP plan');
    } finally {
      setIsSaving(false);
    }
  }, [monthlyAllocations, aitxShops, thirdPartyNetworks]);

  // Mark changes when allocations are modified
  const handleAllocationChange = useCallback((newAllocations: MonthlyAllocation[]) => {
    setMonthlyAllocations(newAllocations);
    setHasUnsavedChanges(true);
  }, []);

  // Mark changes when AITX shops are modified
  const handleAitxShopsChange = useCallback((newShops: AITXShop[]) => {
    setAitxShops(newShops);
    setHasUnsavedChanges(true);
  }, []);

  // Mark changes when 3P networks are modified
  const handleThirdPartyNetworksChange = useCallback((newNetworks: ThirdPartyNetwork[]) => {
    setThirdPartyNetworks(newNetworks);
    setHasUnsavedChanges(true);
  }, []);

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [carsResponse, shopsResponse] = await Promise.all([
          carsApi.getAll({ pageSize: 1000 }),
          shopsApi.getAll(),
        ]);
        setCars(carsResponse.data);
        setShops(shopsResponse);

        // Calculate demand from unassigned cars
        const { demandTypes: calculatedDemand } = calculateDemandFromCars(carsResponse.data);
        setDemandTypes(calculatedDemand);

        // Generate forecasts and allocations
        const forecasts = generateMonthlyForecast(calculatedDemand);
        setMonthlyForecasts(forecasts);

        const allocations = generateMonthlyAllocations(forecasts, AITX_SHOPS, NETWORKS_3P);
        setMonthlyAllocations(allocations);
      } catch (err) {
        setError('Failed to load data');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  // Calculate metrics
  const metrics = useMemo(() => {
    return calculateSystemMetrics(demandTypes, aitxShops, thirdPartyNetworks);
  }, [demandTypes, aitxShops, thirdPartyNetworks]);

  // Validation
  const validation = useMemo(() => {
    return validateAllocations(monthlyAllocations, aitxShops, thirdPartyNetworks);
  }, [monthlyAllocations, aitxShops, thirdPartyNetworks]);

  // Get unassigned cars count
  const unassignedCarsCount = useMemo(() => {
    return cars.filter(c => c.status === 'available' || c.status === 'scheduled').length;
  }, [cars]);

  // Cars by reason
  const carsByReason = useMemo(() => {
    const result = calculateDemandFromCars(cars);
    return result.carsByReason;
  }, [cars]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-steel-500">Loading Car Flow Planning data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-red-700">
        <ExclamationTriangleIcon className="mr-2 inline h-5 w-5" />
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-steel-900">Car Flow Planning</h1>
          <p className="text-sm text-steel-500">
            S&OP Module - 18 Month Rolling Horizon | {unassignedCarsCount} Unassigned Cars
            {hasUnsavedChanges && <span className="ml-2 text-yellow-600">(unsaved changes)</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Save Button */}
          <button
            onClick={handleSavePlan}
            disabled={isSaving || !hasUnsavedChanges}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 font-medium transition-colors ${
              hasUnsavedChanges
                ? 'bg-rail-600 text-white hover:bg-rail-700'
                : 'bg-steel-200 text-steel-500 cursor-not-allowed'
            }`}
          >
            {isSaving ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Saving...
              </>
            ) : (
              <>
                <CheckCircleIcon className="h-4 w-4" />
                Save Plan
              </>
            )}
          </button>
          {/* Export Menu */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={isExporting}
              className="btn-secondary flex items-center gap-2"
            >
              {isExporting ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Exporting...
                </>
              ) : (
                <>
                  <ArrowDownTrayIcon className="h-4 w-4" />
                  Export
                  <ChevronDownIcon className="h-3 w-3" />
                </>
              )}
            </button>
          {showExportMenu && (
            <div className="absolute right-0 z-10 mt-2 w-48 rounded-lg border border-steel-200 bg-white shadow-lg">
              <div className="py-1">
                <button
                  onClick={handleExportCSV}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-steel-700 hover:bg-steel-100"
                >
                  <ArrowDownTrayIcon className="h-4 w-4" />
                  Export as CSV
                </button>
                <button
                  onClick={handleExportExcel}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-steel-700 hover:bg-steel-100"
                >
                  <ArrowDownTrayIcon className="h-4 w-4" />
                  Export as Excel
                </button>
                <button
                  onClick={handleExportPDF}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-steel-700 hover:bg-steel-100"
                >
                  <DocumentArrowDownIcon className="h-4 w-4" />
                  Export as PDF
                </button>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Success Message */}
      {saveSuccess && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          <CheckCircleIcon className="h-5 w-5 flex-shrink-0" />
          {saveSuccess}
        </div>
      )}

      {/* Validation Alerts */}
      {(validation.errors.length > 0 || validation.warnings.length > 0) && (
        <div className="space-y-2">
          {validation.errors.map((err, idx) => (
            <div key={`err-${idx}`} className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <XCircleIcon className="h-5 w-5 flex-shrink-0" />
              {err}
            </div>
          ))}
          {validation.warnings.map((warn, idx) => (
            <div key={`warn-${idx}`} className="flex items-center gap-2 rounded-lg bg-yellow-50 p-3 text-sm text-yellow-700">
              <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0" />
              {warn}
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-steel-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'dashboard', name: 'Executive Dashboard', icon: ChartBarIcon },
            { id: 'demand', name: 'Demand Register', icon: TableCellsIcon },
            { id: 'supply', name: 'Supply Capacity', icon: TableCellsIcon },
            { id: 'plan', name: 'S&OP Plan', icon: TableCellsIcon },
            { id: 'assumptions', name: 'Assumptions', icon: Cog6ToothIcon },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex items-center gap-2 border-b-2 px-1 py-4 text-sm font-medium ${
                activeTab === tab.id
                  ? 'border-rail-600 text-rail-600'
                  : 'border-transparent text-steel-500 hover:border-steel-300 hover:text-steel-700'
              }`}
            >
              <tab.icon className="h-5 w-5" />
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'dashboard' && (
        <ExecutiveDashboard
          metrics={metrics}
          demandTypes={demandTypes}
          actionItems={ACTION_ITEMS}
          carsByReason={carsByReason}
        />
      )}

      {activeTab === 'demand' && (
        <DemandRegister
          demandTypes={demandTypes}
          setDemandTypes={setDemandTypes}
          monthlyForecasts={monthlyForecasts}
          setMonthlyForecasts={setMonthlyForecasts}
          carsByReason={carsByReason}
        />
      )}

      {activeTab === 'supply' && (
        <SupplyCapacityEditor
          aitxShops={aitxShops}
          setAitxShops={handleAitxShopsChange}
          thirdPartyNetworks={thirdPartyNetworks}
          setThirdPartyNetworks={handleThirdPartyNetworksChange}
        />
      )}

      {activeTab === 'plan' && (
        <SOPPlanGrid
          monthlyAllocations={monthlyAllocations}
          setMonthlyAllocations={handleAllocationChange}
          aitxShops={aitxShops}
          thirdPartyNetworks={thirdPartyNetworks}
        />
      )}

      {activeTab === 'assumptions' && (
        <PlanningAssumptionsPanel
          assumptions={assumptions}
          setAssumptions={setAssumptions}
        />
      )}
    </div>
  );
}

// Executive Dashboard Component
function ExecutiveDashboard({
  metrics,
  demandTypes,
  actionItems,
  carsByReason,
}: {
  metrics: SystemMetrics;
  demandTypes: DemandType[];
  actionItems: ActionItem[];
  carsByReason: Map<string, Car[]>;
}) {
  const StatusBadge = ({ status, type }: { status: string; type: 'capacity' | 'surplus' | 'utilization' }) => {
    const colors = {
      'Sufficient': 'bg-green-100 text-green-800',
      'SHORTAGE': 'bg-red-100 text-red-800',
      'Surplus': 'bg-green-100 text-green-800',
      'DEFICIT': 'bg-red-100 text-red-800',
      'Healthy': 'bg-green-100 text-green-800',
      'Over-Utilized': 'bg-yellow-100 text-yellow-800',
    };
    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status as keyof typeof colors] || 'bg-steel-100 text-steel-800'}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card">
          <div className="text-sm font-medium text-steel-500">Annual Demand</div>
          <div className="mt-1 text-2xl font-bold text-steel-900">
            {formatNumber(metrics.totalAnnualDemand)}
          </div>
          <div className="mt-1 text-xs text-steel-500">
            {formatNumber(Math.round(metrics.monthlyDemand))} cars/month
          </div>
        </div>

        <div className="card">
          <div className="text-sm font-medium text-steel-500">AITX Capacity</div>
          <div className="mt-1 text-2xl font-bold text-steel-900">
            {formatNumber(metrics.aitxAnnualCapacity)}
          </div>
          <div className="mt-1 text-xs text-steel-500">
            {formatPercent(metrics.aitxPercentage)} of demand
          </div>
        </div>

        <div className="card">
          <div className="text-sm font-medium text-steel-500">3P Capacity</div>
          <div className="mt-1 text-2xl font-bold text-steel-900">
            {formatNumber(metrics.thirdPartyAnnualCapacity)}
          </div>
          <div className="mt-1 text-xs text-steel-500">
            {formatPercent(metrics.thirdPartyPercentage)} of demand
          </div>
        </div>

        <div className="card">
          <div className="text-sm font-medium text-steel-500">Total System Capacity</div>
          <div className="mt-1 text-2xl font-bold text-steel-900">
            {formatNumber(metrics.totalSystemCapacity)}
          </div>
          <div className="mt-1">
            <StatusBadge status={metrics.capacityStatus} type="capacity" />
          </div>
        </div>
      </div>

      {/* Second Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <div className="card">
          <div className="text-sm font-medium text-steel-500">Capacity Surplus/(Deficit)</div>
          <div className={`mt-1 text-2xl font-bold ${metrics.capacitySurplusDeficit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {metrics.capacitySurplusDeficit >= 0 ? '+' : ''}{formatNumber(metrics.capacitySurplusDeficit)}
          </div>
          <div className="mt-1">
            <StatusBadge status={metrics.surplusStatus} type="surplus" />
          </div>
        </div>

        <div className="card">
          <div className="text-sm font-medium text-steel-500">System Utilization</div>
          <div className="mt-1 text-2xl font-bold text-steel-900">
            {formatPercent(metrics.systemUtilizationRate)}
          </div>
          <div className="mt-1">
            <StatusBadge status={metrics.utilizationStatus} type="utilization" />
          </div>
        </div>

        <div className="card">
          <div className="text-sm font-medium text-steel-500">AITX vs 3P Split</div>
          <div className="mt-2">
            <div className="flex h-4 overflow-hidden rounded-full bg-steel-200">
              <div
                className="bg-rail-600"
                style={{ width: `${metrics.aitxPercentage * 100}%` }}
              />
              <div
                className="bg-steel-500"
                style={{ width: `${metrics.thirdPartyPercentage * 100}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-xs text-steel-500">
              <span>AITX: {formatPercent(metrics.aitxPercentage)}</span>
              <span>3P: {formatPercent(metrics.thirdPartyPercentage)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Demand Composition */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <h3 className="mb-4 text-lg font-semibold text-steel-900">Demand by Type</h3>
          <div className="space-y-3">
            {demandTypes.map((demand) => {
              const total = demandTypes.reduce((sum, d) => sum + d.annualVolume, 0);
              const percent = total > 0 ? (demand.annualVolume / total) * 100 : 0;
              const actualCars = carsByReason.get(demand.id === 'qual' ? 'qualification' :
                                                   demand.id === 'assign' ? 'assignment' :
                                                   demand.id === 'return' ? 'release' :
                                                   demand.id === 'project' ? 'project' :
                                                   demand.id === 'repair' ? 'repair' :
                                                   'maintenance')?.length || 0;
              return (
                <div key={demand.id}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-steel-700">{demand.name}</span>
                    <span className="text-steel-500">
                      {actualCars} cars ({percent.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-steel-200">
                    <div
                      className={`h-full ${
                        demand.priority === 'HIGH' ? 'bg-red-500' :
                        demand.priority === 'MEDIUM' ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Items */}
        <div className="card">
          <h3 className="mb-4 text-lg font-semibold text-steel-900">Critical Action Items</h3>
          <div className="space-y-3">
            {actionItems.map((item) => (
              <div key={item.id} className="flex items-start gap-3 rounded-lg border border-steel-200 p-3">
                <span className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
                  item.priority === 'HIGH' ? 'bg-red-100 text-red-700' :
                  item.priority === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {item.priority[0]}
                </span>
                <div className="flex-1">
                  <div className="text-sm font-medium text-steel-900">{item.action}</div>
                  <div className="mt-1 flex gap-4 text-xs text-steel-500">
                    <span>Owner: {item.owner}</span>
                    <span>Frequency: {item.frequency}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Demand Register Component
function DemandRegister({
  demandTypes,
  setDemandTypes,
  monthlyForecasts,
  setMonthlyForecasts,
  carsByReason,
}: {
  demandTypes: DemandType[];
  setDemandTypes: (types: DemandType[]) => void;
  monthlyForecasts: MonthlyDemandForecast[];
  setMonthlyForecasts: (forecasts: MonthlyDemandForecast[]) => void;
  carsByReason: Map<string, Car[]>;
}) {
  const totalDemand = demandTypes.reduce((sum, d) => sum + d.annualVolume, 0);

  const handleDemandChange = (id: string, field: keyof DemandType, value: string | number) => {
    setDemandTypes(demandTypes.map(d =>
      d.id === id ? { ...d, [field]: value } : d
    ));
  };

  return (
    <div className="space-y-6">
      {/* Demand Types Table */}
      <div className="card">
        <h3 className="mb-4 text-lg font-semibold text-steel-900">Demand Types</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-steel-200">
            <thead className="bg-steel-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-steel-500">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-steel-500">Current Backlog</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-steel-500">Annual Volume</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-steel-500">Monthly Avg</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-steel-500">% of Total</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-steel-500">Priority</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-steel-500">Lead Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-200 bg-white">
              {demandTypes.map((demand) => {
                const reasonKey = demand.id === 'qual' ? 'qualification' :
                                  demand.id === 'assign' ? 'assignment' :
                                  demand.id === 'return' ? 'release' :
                                  demand.id === 'project' ? 'project' :
                                  demand.id === 'repair' ? 'repair' : 'maintenance';
                const actualCars = carsByReason.get(reasonKey)?.length || 0;
                const percent = totalDemand > 0 ? (demand.annualVolume / totalDemand) * 100 : 0;

                return (
                  <tr key={demand.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-steel-900">
                      {demand.name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-steel-700">
                      <span className="font-semibold text-rail-600">{actualCars}</span> cars
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <input
                        type="number"
                        value={demand.annualVolume}
                        onChange={(e) => handleDemandChange(demand.id, 'annualVolume', parseInt(e.target.value) || 0)}
                        className="w-24 rounded border border-steel-300 px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-steel-700">
                      {Math.round(demand.annualVolume / 12)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-steel-700">
                      {percent.toFixed(1)}%
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                        demand.priority === 'HIGH' ? 'bg-red-100 text-red-700' :
                        demand.priority === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {demand.priority}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-steel-500">
                      {demand.leadTime}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-steel-50 font-semibold">
                <td className="px-4 py-3 text-sm text-steel-900">Total</td>
                <td className="px-4 py-3 text-sm text-steel-900">
                  {Array.from(carsByReason.values()).reduce((sum, cars) => sum + cars.length, 0)} cars
                </td>
                <td className="px-4 py-3 text-sm text-steel-900">{formatNumber(totalDemand)}</td>
                <td className="px-4 py-3 text-sm text-steel-900">{Math.round(totalDemand / 12)}</td>
                <td className="px-4 py-3 text-sm text-steel-900">100%</td>
                <td colSpan={2}></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly Forecast Grid */}
      <div className="card">
        <h3 className="mb-4 text-lg font-semibold text-steel-900">18-Month Demand Forecast</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-steel-200 text-xs">
            <thead className="bg-steel-50">
              <tr>
                <th className="sticky left-0 z-10 bg-steel-50 px-3 py-2 text-left font-medium uppercase tracking-wider text-steel-500">Type</th>
                {monthlyForecasts.map((f) => (
                  <th key={f.month} className="px-3 py-2 text-center font-medium uppercase tracking-wider text-steel-500">
                    {f.month}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-200 bg-white">
              <tr>
                <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-steel-900">Qualifications</td>
                {monthlyForecasts.map((f) => (
                  <td key={f.month} className="px-3 py-2 text-center text-steel-700">{f.qualifications}</td>
                ))}
              </tr>
              <tr>
                <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-steel-900">Assignments</td>
                {monthlyForecasts.map((f) => (
                  <td key={f.month} className="px-3 py-2 text-center text-steel-700">{f.assignments}</td>
                ))}
              </tr>
              <tr>
                <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-steel-900">Returns</td>
                {monthlyForecasts.map((f) => (
                  <td key={f.month} className="px-3 py-2 text-center text-steel-700">{f.returns}</td>
                ))}
              </tr>
              <tr>
                <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-steel-900">External</td>
                {monthlyForecasts.map((f) => (
                  <td key={f.month} className="px-3 py-2 text-center text-steel-700">{f.external}</td>
                ))}
              </tr>
              <tr className="bg-steel-50 font-semibold">
                <td className="sticky left-0 z-10 bg-steel-50 px-3 py-2 text-steel-900">Total</td>
                {monthlyForecasts.map((f) => (
                  <td key={f.month} className="px-3 py-2 text-center text-steel-900">{f.total}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Supply Capacity Editor Component
function SupplyCapacityEditor({
  aitxShops,
  setAitxShops,
  thirdPartyNetworks,
  setThirdPartyNetworks,
}: {
  aitxShops: AITXShop[];
  setAitxShops: (shops: AITXShop[]) => void;
  thirdPartyNetworks: ThirdPartyNetwork[];
  setThirdPartyNetworks: (networks: ThirdPartyNetwork[]) => void;
}) {
  const aitxTotalMonthly = aitxShops.reduce((sum, s) => sum + s.monthlyCapacity, 0);
  const aitxTotalAnnual = aitxTotalMonthly * 12;
  const networkTotalMonthly = thirdPartyNetworks.reduce((sum, n) => sum + n.monthlyCapacity, 0);
  const networkTotalAnnual = networkTotalMonthly * 12;

  return (
    <div className="space-y-6">
      {/* AITX Shops */}
      <div className="card">
        <h3 className="mb-4 text-lg font-semibold text-steel-900">AITX Internal Shops</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-steel-200">
            <thead className="bg-steel-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-steel-500">Location</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-steel-500">Car Types</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-steel-500">Monthly Cap</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-steel-500">Annual Cap</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-steel-500">Util Target</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-steel-500">Cost Index</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-steel-500">Tank Qualified</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-200 bg-white">
              {aitxShops.map((shop) => (
                <tr key={shop.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-steel-900">{shop.location}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-steel-700">{shop.carTypes}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <input
                      type="number"
                      value={shop.monthlyCapacity}
                      onChange={(e) => {
                        const value = parseInt(e.target.value) || 0;
                        setAitxShops(aitxShops.map(s =>
                          s.id === shop.id ? { ...s, monthlyCapacity: value, annualCapacity: value * 12 } : s
                        ));
                      }}
                      className="w-20 rounded border border-steel-300 px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-steel-700">{shop.annualCapacity}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <input
                      type="number"
                      step="0.01"
                      value={shop.utilizationTarget}
                      onChange={(e) => {
                        setAitxShops(aitxShops.map(s =>
                          s.id === shop.id ? { ...s, utilizationTarget: parseFloat(e.target.value) || 0.9 } : s
                        ));
                      }}
                      className="w-20 rounded border border-steel-300 px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-steel-700">{shop.costIndex}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {shop.isTankQualified ? (
                      <CheckCircleIcon className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircleIcon className="h-5 w-5 text-steel-300" />
                    )}
                  </td>
                </tr>
              ))}
              <tr className="bg-steel-50 font-semibold">
                <td className="px-4 py-3 text-sm text-steel-900">AITX Total</td>
                <td></td>
                <td className="px-4 py-3 text-sm text-steel-900">{aitxTotalMonthly}</td>
                <td className="px-4 py-3 text-sm text-steel-900">{formatNumber(aitxTotalAnnual)}</td>
                <td colSpan={3}></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 3P Networks */}
      <div className="card">
        <h3 className="mb-4 text-lg font-semibold text-steel-900">Third-Party Networks</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-steel-200">
            <thead className="bg-steel-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-steel-500">Network</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-steel-500">Shops</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-steel-500">Car Types</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-steel-500">Monthly Cap</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-steel-500">Annual Cap</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-steel-500">Avail Factor</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-steel-500">Cost Index</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-200 bg-white">
              {thirdPartyNetworks.map((network) => (
                <tr key={network.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-steel-900">{network.name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-steel-700">{network.shopCount}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-steel-700">{network.carTypes}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <input
                      type="number"
                      value={network.monthlyCapacity}
                      onChange={(e) => {
                        const value = parseInt(e.target.value) || 0;
                        setThirdPartyNetworks(thirdPartyNetworks.map(n =>
                          n.id === network.id ? { ...n, monthlyCapacity: value, annualCapacity: value * 12 } : n
                        ));
                      }}
                      className="w-20 rounded border border-steel-300 px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-steel-700">{network.annualCapacity}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <input
                      type="number"
                      step="0.01"
                      value={network.availabilityFactor}
                      onChange={(e) => {
                        setThirdPartyNetworks(thirdPartyNetworks.map(n =>
                          n.id === network.id ? { ...n, availabilityFactor: parseFloat(e.target.value) || 0.85 } : n
                        ));
                      }}
                      className="w-20 rounded border border-steel-300 px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-steel-700">{network.costIndex}</td>
                </tr>
              ))}
              <tr className="bg-steel-50 font-semibold">
                <td className="px-4 py-3 text-sm text-steel-900">3P Total</td>
                <td className="px-4 py-3 text-sm text-steel-900">
                  {thirdPartyNetworks.reduce((sum, n) => sum + n.shopCount, 0)}
                </td>
                <td></td>
                <td className="px-4 py-3 text-sm text-steel-900">{networkTotalMonthly}</td>
                <td className="px-4 py-3 text-sm text-steel-900">{formatNumber(networkTotalAnnual)}</td>
                <td colSpan={2}></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Combined Summary */}
      <div className="card bg-steel-50">
        <h3 className="mb-4 text-lg font-semibold text-steel-900">Combined Capacity Summary</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-sm text-steel-500">AITX Capacity</div>
            <div className="text-xl font-bold text-steel-900">{formatNumber(aitxTotalAnnual)} / year</div>
          </div>
          <div>
            <div className="text-sm text-steel-500">3P Capacity</div>
            <div className="text-xl font-bold text-steel-900">{formatNumber(networkTotalAnnual)} / year</div>
          </div>
          <div>
            <div className="text-sm text-steel-500">Total System Capacity</div>
            <div className="text-xl font-bold text-rail-600">{formatNumber(aitxTotalAnnual + networkTotalAnnual)} / year</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// S&OP Plan Grid Component
function SOPPlanGrid({
  monthlyAllocations,
  setMonthlyAllocations,
  aitxShops,
  thirdPartyNetworks,
}: {
  monthlyAllocations: MonthlyAllocation[];
  setMonthlyAllocations: (allocations: MonthlyAllocation[]) => void;
  aitxShops: AITXShop[];
  thirdPartyNetworks: ThirdPartyNetwork[];
}) {
  // Create a mapping of all shops/networks for rows
  const allSources = [
    ...aitxShops.map(s => ({ id: s.id, name: s.location, isAITX: true, capacity: s.monthlyCapacity })),
    ...thirdPartyNetworks.map(n => ({ id: n.id, name: n.name, isAITX: false, capacity: n.monthlyCapacity })),
  ];

  const handleAllocationChange = (monthIndex: number, shopId: string, value: number) => {
    const newAllocations = [...monthlyAllocations];
    const allocation = newAllocations[monthIndex];
    const shopAlloc = allocation.shopAllocations.find(sa => sa.shopId === shopId);
    if (shopAlloc) {
      shopAlloc.cars = value;
      // Recalculate subtotals
      allocation.aitxSubtotal = allocation.shopAllocations
        .filter(sa => sa.isAITX)
        .reduce((sum, sa) => sum + sa.cars, 0);
      allocation.thirdPartySubtotal = allocation.shopAllocations
        .filter(sa => !sa.isAITX)
        .reduce((sum, sa) => sum + sa.cars, 0);
      allocation.totalPlanned = allocation.aitxSubtotal + allocation.thirdPartySubtotal;
      allocation.unallocatedDemand = Math.max(0, allocation.demandForMonth - allocation.totalPlanned);
    }
    setMonthlyAllocations(newAllocations);
  };

  return (
    <div className="card">
      <h3 className="mb-4 text-lg font-semibold text-steel-900">18-Month S&OP Allocation Plan</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-steel-200 text-xs">
          <thead className="bg-steel-50">
            <tr>
              <th className="sticky left-0 z-10 bg-steel-50 px-3 py-2 text-left font-medium uppercase tracking-wider text-steel-500">
                Shop/Network
              </th>
              <th className="sticky left-0 z-10 bg-steel-50 px-3 py-2 text-center font-medium uppercase tracking-wider text-steel-500">
                Cap
              </th>
              {monthlyAllocations.map((a) => (
                <th key={a.month} className="px-3 py-2 text-center font-medium uppercase tracking-wider text-steel-500">
                  {a.month}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-steel-200 bg-white">
            {/* AITX Shops */}
            {allSources.filter(s => s.isAITX).map((source) => (
              <tr key={source.id} className="hover:bg-steel-50">
                <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-steel-900">
                  <span className="text-rail-600">AITX:</span> {source.name}
                </td>
                <td className="sticky left-0 z-10 bg-white px-3 py-2 text-center text-steel-500">
                  {source.capacity}
                </td>
                {monthlyAllocations.map((allocation, mIdx) => {
                  const shopAlloc = allocation.shopAllocations.find(sa => sa.shopId === source.id);
                  const cars = shopAlloc?.cars || 0;
                  const isOverCapacity = cars > source.capacity;
                  return (
                    <td key={allocation.month} className="px-1 py-1 text-center">
                      <input
                        type="number"
                        value={cars}
                        onChange={(e) => handleAllocationChange(mIdx, source.id, parseInt(e.target.value) || 0)}
                        className={`w-12 rounded border px-1 py-0.5 text-center text-xs ${
                          isOverCapacity ? 'border-red-500 bg-red-50' : 'border-steel-300'
                        }`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
            {/* AITX Subtotal */}
            <tr className="bg-rail-50 font-semibold">
              <td className="sticky left-0 z-10 bg-rail-50 px-3 py-2 text-rail-700">AITX Subtotal</td>
              <td className="sticky left-0 z-10 bg-rail-50 px-3 py-2 text-center text-rail-700">
                {aitxShops.reduce((sum, s) => sum + s.monthlyCapacity, 0)}
              </td>
              {monthlyAllocations.map((a) => (
                <td key={a.month} className="px-3 py-2 text-center text-rail-700">{a.aitxSubtotal}</td>
              ))}
            </tr>

            {/* 3P Networks */}
            {allSources.filter(s => !s.isAITX).map((source) => (
              <tr key={source.id} className="hover:bg-steel-50">
                <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-steel-900">
                  <span className="text-steel-500">3P:</span> {source.name}
                </td>
                <td className="sticky left-0 z-10 bg-white px-3 py-2 text-center text-steel-500">
                  {source.capacity}
                </td>
                {monthlyAllocations.map((allocation, mIdx) => {
                  const shopAlloc = allocation.shopAllocations.find(sa => sa.shopId === source.id);
                  const cars = shopAlloc?.cars || 0;
                  const isOverCapacity = cars > source.capacity;
                  return (
                    <td key={allocation.month} className="px-1 py-1 text-center">
                      <input
                        type="number"
                        value={cars}
                        onChange={(e) => handleAllocationChange(mIdx, source.id, parseInt(e.target.value) || 0)}
                        className={`w-12 rounded border px-1 py-0.5 text-center text-xs ${
                          isOverCapacity ? 'border-red-500 bg-red-50' : 'border-steel-300'
                        }`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
            {/* 3P Subtotal */}
            <tr className="bg-steel-100 font-semibold">
              <td className="sticky left-0 z-10 bg-steel-100 px-3 py-2 text-steel-700">3P Subtotal</td>
              <td className="sticky left-0 z-10 bg-steel-100 px-3 py-2 text-center text-steel-700">
                {thirdPartyNetworks.reduce((sum, n) => sum + n.monthlyCapacity, 0)}
              </td>
              {monthlyAllocations.map((a) => (
                <td key={a.month} className="px-3 py-2 text-center text-steel-700">{a.thirdPartySubtotal}</td>
              ))}
            </tr>

            {/* Grand Total */}
            <tr className="bg-steel-800 font-bold text-white">
              <td className="sticky left-0 z-10 bg-steel-800 px-3 py-2">Total Planned</td>
              <td className="sticky left-0 z-10 bg-steel-800 px-3 py-2 text-center">
                {aitxShops.reduce((sum, s) => sum + s.monthlyCapacity, 0) + thirdPartyNetworks.reduce((sum, n) => sum + n.monthlyCapacity, 0)}
              </td>
              {monthlyAllocations.map((a) => (
                <td key={a.month} className="px-3 py-2 text-center">{a.totalPlanned}</td>
              ))}
            </tr>

            {/* Demand Row */}
            <tr className="bg-yellow-50">
              <td className="sticky left-0 z-10 bg-yellow-50 px-3 py-2 font-semibold text-yellow-800">Demand</td>
              <td className="sticky left-0 z-10 bg-yellow-50"></td>
              {monthlyAllocations.map((a) => (
                <td key={a.month} className="px-3 py-2 text-center font-semibold text-yellow-800">{a.demandForMonth}</td>
              ))}
            </tr>

            {/* Unallocated Row */}
            <tr>
              <td className="sticky left-0 z-10 bg-white px-3 py-2 font-semibold text-steel-900">Unallocated</td>
              <td className="sticky left-0 z-10 bg-white"></td>
              {monthlyAllocations.map((a) => (
                <td key={a.month} className={`px-3 py-2 text-center font-semibold ${
                  a.unallocatedDemand > 0 ? 'bg-red-100 text-red-700' : 'text-green-600'
                }`}>
                  {a.unallocatedDemand}
                </td>
              ))}
            </tr>

            {/* Utilization Row */}
            <tr className="bg-steel-50">
              <td className="sticky left-0 z-10 bg-steel-50 px-3 py-2 font-semibold text-steel-700">Utilization %</td>
              <td className="sticky left-0 z-10 bg-steel-50"></td>
              {monthlyAllocations.map((a) => (
                <td key={a.month} className={`px-3 py-2 text-center text-xs ${
                  a.systemUtilization > 0.95 ? 'text-red-600 font-bold' :
                  a.systemUtilization > 0.85 ? 'text-yellow-600' : 'text-green-600'
                }`}>
                  {(a.systemUtilization * 100).toFixed(0)}%
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Planning Assumptions Panel
function PlanningAssumptionsPanel({
  assumptions,
  setAssumptions,
}: {
  assumptions: PlanningAssumptions;
  setAssumptions: (assumptions: PlanningAssumptions) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="mb-4 text-lg font-semibold text-steel-900">Planning Assumptions</h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <label className="label">Default Utilization Target</label>
            <input
              type="number"
              step="0.01"
              value={assumptions.defaultUtilizationTarget}
              onChange={(e) => setAssumptions({
                ...assumptions,
                defaultUtilizationTarget: parseFloat(e.target.value) || 0.9
              })}
              className="input"
            />
            <p className="mt-1 text-xs text-steel-500">Target shop utilization (e.g., 0.90 = 90%)</p>
          </div>

          <div>
            <label className="label">Default 3P Availability Factor</label>
            <input
              type="number"
              step="0.01"
              value={assumptions.defaultAvailabilityFactor}
              onChange={(e) => setAssumptions({
                ...assumptions,
                defaultAvailabilityFactor: parseFloat(e.target.value) || 0.85
              })}
              className="input"
            />
            <p className="mt-1 text-xs text-steel-500">Expected availability of 3P capacity (e.g., 0.85 = 85%)</p>
          </div>

          <div>
            <label className="label">AITX Cost Premium (Index)</label>
            <input
              type="number"
              step="0.001"
              value={assumptions.aitxCostPremium}
              onChange={(e) => setAssumptions({
                ...assumptions,
                aitxCostPremium: parseFloat(e.target.value) || 1.379
              })}
              className="input"
            />
            <p className="mt-1 text-xs text-steel-500">AITX cost relative to 3P baseline (1.379 = 37.9% premium)</p>
          </div>

          <div>
            <label className="label">Planning Horizon (Months)</label>
            <input
              type="number"
              value={assumptions.planningHorizonMonths}
              onChange={(e) => setAssumptions({
                ...assumptions,
                planningHorizonMonths: parseInt(e.target.value) || 18
              })}
              className="input"
            />
            <p className="mt-1 text-xs text-steel-500">Number of months in the rolling forecast</p>
          </div>

          <div>
            <label className="label">Tank Car Percentage</label>
            <input
              type="number"
              value={assumptions.tankCarPercentage}
              onChange={(e) => setAssumptions({
                ...assumptions,
                tankCarPercentage: parseInt(e.target.value) || 65,
                freightCarPercentage: 100 - (parseInt(e.target.value) || 65)
              })}
              className="input"
            />
            <p className="mt-1 text-xs text-steel-500">Percentage of fleet that are tank cars</p>
          </div>

          <div>
            <label className="label">Freight Car Percentage</label>
            <input
              type="number"
              value={assumptions.freightCarPercentage}
              disabled
              className="input bg-steel-100"
            />
            <p className="mt-1 text-xs text-steel-500">Auto-calculated from tank car percentage</p>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="mb-4 text-lg font-semibold text-steel-900">Allocation Priority Rules</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-lg border border-steel-200 p-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rail-600 text-xs font-bold text-white">1</span>
            <div>
              <div className="font-medium text-steel-900">AITX Shops First</div>
              <div className="text-xs text-steel-500">Maximize internal shop utilization up to target</div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-steel-200 p-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">2</span>
            <div>
              <div className="font-medium text-steel-900">Tank Car Qualification (Critical)</div>
              <div className="text-xs text-steel-500">Tank cars MUST go to tank-qualified shops only</div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-steel-200 p-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-yellow-600 text-xs font-bold text-white">3</span>
            <div>
              <div className="font-medium text-steel-900">Geographic Proximity</div>
              <div className="text-xs text-steel-500">Minimize deadhead logistics costs</div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-steel-200 p-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-steel-600 text-xs font-bold text-white">4</span>
            <div>
              <div className="font-medium text-steel-900">Network Tier Preference</div>
              <div className="text-xs text-steel-500">3P preference: Network A {'>'} B {'>'} C {'>'} D {'>'} E</div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-steel-200 p-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-steel-400 text-xs font-bold text-white">5</span>
            <div>
              <div className="font-medium text-steel-900">Cost Index</div>
              <div className="text-xs text-steel-500">Lower cost preferred if all else equal</div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-red-300 bg-red-50 p-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">!</span>
            <div>
              <div className="font-medium text-red-900">Available Capacity (Critical)</div>
              <div className="text-xs text-red-700">Must have confirmed capacity before assignment</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
