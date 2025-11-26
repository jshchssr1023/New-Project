import { useState, useEffect, useMemo } from 'react';
import {
  ArrowDownTrayIcon,
  PlusIcon,
  XMarkIcon,
  FunnelIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';
import { plansApi, shopsApi, carsApi } from '../services/api';
import type { Plan, Shop, PlanAssignment, Car } from '../types';

const months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

// Shopping types based on reason shopped
const SHOPPING_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'release', label: 'Release' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'qualification', label: 'Qualification' },
  { value: 'project', label: 'Project' },
  { value: 'repair', label: 'Repair' },
  { value: 'maintenance', label: 'Maintenance' },
];

export default function PlanningGrid() {
  // Data state
  const [plans, setPlans] = useState<Plan[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [cars, setCars] = useState<Car[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [assignments, setAssignments] = useState<PlanAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Filter options
  const [shopFilters, setShopFilters] = useState<{
    regions: string[];
    networks: string[];
    railroads: string[];
  }>({ regions: [], networks: [], railroads: [] });
  const [shoppingTypes, setShoppingTypes] = useState<string[]>([]);

  // Active filters
  const [shopRegionFilter, setShopRegionFilter] = useState('');
  const [shopNetworkFilter, setShopNetworkFilter] = useState('');
  const [shopRailroadFilter, setShopRailroadFilter] = useState('');
  const [carAssignmentFilter, setCarAssignmentFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [carShoppingTypeFilter, setCarShoppingTypeFilter] = useState('');
  const [carCustomerFilter, setCarCustomerFilter] = useState('');

  // Selection and assignment state
  const [selectedCarIds, setSelectedCarIds] = useState<Set<string>>(new Set());
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  // UI state
  const [carPanelOpen, setCarPanelOpen] = useState(true);
  const [isAssigning, setIsAssigning] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedPlan) {
      loadPlanAssignments();
    }
  }, [selectedPlan?.id]);

  const loadInitialData = async () => {
    try {
      const [plansData, shopsData, carsResponse, filterData] = await Promise.all([
        plansApi.getAll(),
        shopsApi.getAll(),
        carsApi.getAll({ pageSize: 1000 }),
        shopsApi.getFilters(),
      ]);
      setPlans(plansData);
      setShops(shopsData);
      setCars(carsResponse.data);
      setShopFilters(filterData);

      // Extract unique shopping types from cars
      const types = [...new Set(carsResponse.data.map(c => c.reasonShopped?.toLowerCase()).filter(Boolean))];
      setShoppingTypes(types);

      if (plansData.length > 0) {
        setSelectedPlan(plansData[0]);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPlanAssignments = async () => {
    if (!selectedPlan) return;
    try {
      const planDetails = await plansApi.getById(selectedPlan.id);
      setAssignments(planDetails.assignments || []);
    } catch (error) {
      console.error('Failed to load assignments:', error);
    }
  };

  // Get all assigned car IDs for the current year
  const assignedCarIds = useMemo(() => {
    const yearPrefix = `${selectedYear}-`;
    return new Set(
      assignments
        .filter(a => a.scheduledMonth.startsWith(yearPrefix))
        .map(a => a.carId)
    );
  }, [assignments, selectedYear]);

  // Get unique customers from cars
  const customers = useMemo(() => {
    return [...new Set(cars.map(c => c.customer).filter(Boolean))].sort();
  }, [cars]);

  // Filter cars based on all criteria
  const filteredCars = useMemo(() => {
    return cars.filter(car => {
      // Assignment filter
      if (carAssignmentFilter === 'assigned' && !assignedCarIds.has(car.id)) return false;
      if (carAssignmentFilter === 'unassigned' && assignedCarIds.has(car.id)) return false;

      // Shopping type filter
      if (carShoppingTypeFilter && !car.reasonShopped?.toLowerCase().includes(carShoppingTypeFilter.toLowerCase())) {
        return false;
      }

      // Customer filter
      if (carCustomerFilter && car.customer !== carCustomerFilter) return false;

      return true;
    });
  }, [cars, carAssignmentFilter, carShoppingTypeFilter, carCustomerFilter, assignedCarIds]);

  // Filter shops based on criteria
  const filteredShops = useMemo(() => {
    return shops.filter(shop => {
      if (!shop.isActive) return false;
      if (shopRegionFilter && shop.region !== shopRegionFilter) return false;
      if (shopNetworkFilter && shop.network !== shopNetworkFilter) return false;
      if (shopRailroadFilter && shop.servingRailroad !== shopRailroadFilter) return false;
      return true;
    });
  }, [shops, shopRegionFilter, shopNetworkFilter, shopRailroadFilter]);

  // Get assignments for a specific shop and month
  const getCellAssignments = (shopId: string, monthIndex: number): PlanAssignment[] => {
    const monthKey = `${selectedYear}-${String(monthIndex + 1).padStart(2, '0')}`;
    return assignments.filter(a => a.shopId === shopId && a.scheduledMonth === monthKey);
  };

  // Get cell color based on utilization
  const getCellColor = (count: number, capacity: number): string => {
    const utilization = count / capacity;
    if (utilization === 0) return 'bg-steel-50 hover:bg-steel-100';
    if (utilization < 0.5) return 'bg-green-100 hover:bg-green-200';
    if (utilization < 0.8) return 'bg-amber-100 hover:bg-amber-200';
    if (utilization < 1) return 'bg-orange-100 hover:bg-orange-200';
    return 'bg-red-100 hover:bg-red-200';
  };

  // Handle cell click for selection
  const handleCellClick = (shopId: string, monthIndex: number) => {
    if (selectedShopId === shopId && selectedMonth === monthIndex) {
      setSelectedShopId(null);
      setSelectedMonth(null);
    } else {
      setSelectedShopId(shopId);
      setSelectedMonth(monthIndex);
    }
  };

  // Toggle car selection
  const toggleCarSelection = (carId: string) => {
    const newSelection = new Set(selectedCarIds);
    if (newSelection.has(carId)) {
      newSelection.delete(carId);
    } else {
      newSelection.add(carId);
    }
    setSelectedCarIds(newSelection);
  };

  // Select/deselect all visible cars
  const toggleSelectAll = () => {
    if (selectedCarIds.size === filteredCars.length) {
      setSelectedCarIds(new Set());
    } else {
      setSelectedCarIds(new Set(filteredCars.map(c => c.id)));
    }
  };

  // Assign selected cars to selected shop/month
  const handleAssignCars = async () => {
    if (!selectedPlan || !selectedShopId || selectedMonth === null || selectedCarIds.size === 0) return;

    setIsAssigning(true);
    const scheduledMonth = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
    const shop = shops.find(s => s.id === selectedShopId);

    try {
      for (const carId of selectedCarIds) {
        await plansApi.addAssignment(selectedPlan.id, {
          carId,
          shopId: selectedShopId,
          scheduledMonth,
          estimatedCost: shop?.baseCostPerCar || 15000,
          estimatedDuration: shop?.baseTurnTime || 14,
          status: 'pending',
        });
      }

      // Reload assignments and clear selection
      await loadPlanAssignments();
      setSelectedCarIds(new Set());
    } catch (error) {
      console.error('Failed to assign cars:', error);
      alert('Failed to assign some cars. Please try again.');
    } finally {
      setIsAssigning(false);
    }
  };

  // Remove assignment
  const handleRemoveAssignment = async (assignmentId: string) => {
    if (!selectedPlan || !confirm('Remove this assignment?')) return;
    try {
      await plansApi.removeAssignment(selectedPlan.id, assignmentId);
      await loadPlanAssignments();
    } catch (error) {
      console.error('Failed to remove assignment:', error);
    }
  };

  const getShopName = (shopId: string): string => {
    return shops.find(s => s.id === shopId)?.name || 'Unknown';
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-steel-900">Planning Grid</h1>
        <div className="card">
          <p className="text-steel-500">Loading planning grid...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-140px)]">
      {/* Cars Panel (Left) */}
      <div className={`${carPanelOpen ? 'w-96' : 'w-0'} transition-all duration-300 overflow-hidden border-r border-steel-200 bg-white flex flex-col`}>
        <div className="p-4 border-b border-steel-200 bg-steel-50">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-steel-900">Railcars</h2>
            <span className="text-sm text-steel-500">
              {selectedCarIds.size > 0 && `${selectedCarIds.size} selected`}
            </span>
          </div>

          {/* Car Filters */}
          <div className="space-y-2">
            <select
              value={carAssignmentFilter}
              onChange={(e) => setCarAssignmentFilter(e.target.value as 'all' | 'assigned' | 'unassigned')}
              className="input text-sm w-full"
            >
              <option value="all">All Cars</option>
              <option value="assigned">Assigned Only</option>
              <option value="unassigned">Unassigned Only</option>
            </select>

            <select
              value={carShoppingTypeFilter}
              onChange={(e) => setCarShoppingTypeFilter(e.target.value)}
              className="input text-sm w-full"
            >
              <option value="">All Shopping Types</option>
              {SHOPPING_TYPES.filter(t => t.value).map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
              {shoppingTypes.filter(t => !SHOPPING_TYPES.find(st => st.value === t)).map(type => (
                <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
              ))}
            </select>

            <select
              value={carCustomerFilter}
              onChange={(e) => setCarCustomerFilter(e.target.value)}
              className="input text-sm w-full"
            >
              <option value="">All Customers</option>
              {customers.map(customer => (
                <option key={customer} value={customer}>{customer}</option>
              ))}
            </select>
          </div>

          {/* Select All */}
          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={toggleSelectAll}
              className="text-sm text-rail-600 hover:text-rail-800"
            >
              {selectedCarIds.size === filteredCars.length ? 'Deselect All' : 'Select All'}
            </button>
            <span className="text-xs text-steel-500">{filteredCars.length} cars</span>
          </div>
        </div>

        {/* Car List */}
        <div className="flex-1 overflow-y-auto">
          {filteredCars.map(car => {
            const isAssigned = assignedCarIds.has(car.id);
            const isSelected = selectedCarIds.has(car.id);

            return (
              <div
                key={car.id}
                className={`p-3 border-b border-steel-100 cursor-pointer transition-colors ${
                  isSelected ? 'bg-rail-50 border-l-4 border-l-rail-500' : 'hover:bg-steel-50'
                }`}
                onClick={() => toggleCarSelection(car.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-steel-900">{car.vehicleNumber}</span>
                      {isAssigned && (
                        <span className="px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded">
                          Assigned
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-steel-500 mt-1">
                      {car.carType} • {car.customer}
                    </div>
                    {car.reasonShopped && (
                      <div className="text-xs text-steel-400 mt-0.5">
                        {car.reasonShopped}
                      </div>
                    )}
                  </div>
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                    isSelected ? 'bg-rail-500 border-rail-500' : 'border-steel-300'
                  }`}>
                    {isSelected && <CheckIcon className="w-3 h-3 text-white" />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Assign Button */}
        {selectedCarIds.size > 0 && selectedShopId && selectedMonth !== null && (
          <div className="p-4 border-t border-steel-200 bg-steel-50">
            <button
              onClick={handleAssignCars}
              disabled={isAssigning}
              className="btn-primary w-full flex items-center justify-center"
            >
              {isAssigning ? (
                'Assigning...'
              ) : (
                <>
                  <ArrowRightIcon className="w-4 h-4 mr-2" />
                  Assign {selectedCarIds.size} car{selectedCarIds.size > 1 ? 's' : ''} to {getShopName(selectedShopId)} ({months[selectedMonth]})
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Panel Toggle */}
      <button
        onClick={() => setCarPanelOpen(!carPanelOpen)}
        className="w-6 bg-steel-100 hover:bg-steel-200 flex items-center justify-center border-r border-steel-200"
      >
        {carPanelOpen ? (
          <ChevronLeftIcon className="w-4 h-4 text-steel-600" />
        ) : (
          <ChevronRightIcon className="w-4 h-4 text-steel-600" />
        )}
      </button>

      {/* Main Grid Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-steel-200 bg-white">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-steel-900">Planning Grid</h1>
              <p className="text-sm text-steel-500">
                Select cars on the left, click a cell to assign
              </p>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={selectedPlan?.id || ''}
                onChange={(e) => setSelectedPlan(plans.find(p => p.id === e.target.value) || null)}
                className="input"
              >
                <option value="" disabled>Select Plan</option>
                {plans.map(plan => (
                  <option key={plan.id} value={plan.id}>{plan.name}</option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="input"
              >
                {[2024, 2025, 2026].map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
              {selectedPlan && (
                <button
                  onClick={() => plansApi.exportToExcel(selectedPlan.id)}
                  className="btn-primary flex items-center"
                >
                  <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
                  Export
                </button>
              )}
            </div>
          </div>

          {/* Shop Filters */}
          <div className="flex items-center gap-4 bg-steel-50 rounded-lg p-3">
            <FunnelIcon className="w-5 h-5 text-steel-500" />
            <span className="text-sm font-medium text-steel-700">Filter Shops:</span>
            <select
              value={shopRegionFilter}
              onChange={(e) => setShopRegionFilter(e.target.value)}
              className="input text-sm"
            >
              <option value="">All Regions</option>
              {shopFilters.regions.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <select
              value={shopNetworkFilter}
              onChange={(e) => setShopNetworkFilter(e.target.value)}
              className="input text-sm"
            >
              <option value="">All Networks</option>
              {shopFilters.networks.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <select
              value={shopRailroadFilter}
              onChange={(e) => setShopRailroadFilter(e.target.value)}
              className="input text-sm"
            >
              <option value="">All Railroads</option>
              {shopFilters.railroads.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {(shopRegionFilter || shopNetworkFilter || shopRailroadFilter) && (
              <button
                onClick={() => {
                  setShopRegionFilter('');
                  setShopNetworkFilter('');
                  setShopRailroadFilter('');
                }}
                className="text-steel-500 hover:text-steel-700"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 text-xs">
            <span className="text-steel-600">Utilization:</span>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 bg-steel-50 rounded border border-steel-200" />
              <span>Empty</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 bg-green-100 rounded" />
              <span>&lt;50%</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 bg-amber-100 rounded" />
              <span>50-80%</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 bg-orange-100 rounded" />
              <span>80-100%</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 bg-red-100 rounded" />
              <span>Over</span>
            </div>
            {selectedShopId && selectedMonth !== null && (
              <span className="ml-4 px-2 py-1 bg-rail-100 text-rail-700 rounded">
                Selected: {getShopName(selectedShopId)} - {months[selectedMonth]}
              </span>
            )}
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-auto p-4">
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full">
              <thead>
                <tr className="bg-steel-800 text-white">
                  <th className="sticky left-0 z-10 bg-steel-800 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider border-r border-steel-700 min-w-[200px]">
                    Shop
                  </th>
                  {months.map((month, idx) => (
                    <th
                      key={month}
                      className={`px-2 py-3 text-center text-xs font-medium uppercase tracking-wider min-w-[80px] ${
                        selectedMonth === idx ? 'bg-rail-600' : ''
                      }`}
                    >
                      {month}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider bg-steel-700">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-200">
                {filteredShops.map(shop => {
                  const yearTotal = months.reduce((sum, _, idx) => {
                    return sum + getCellAssignments(shop.id, idx).length;
                  }, 0);

                  return (
                    <tr key={shop.id} className={selectedShopId === shop.id ? 'bg-rail-50' : ''}>
                      <td className="sticky left-0 z-10 bg-white px-4 py-3 border-r border-steel-200">
                        <div>
                          <div className="font-medium text-steel-900">{shop.name}</div>
                          <div className="text-xs text-steel-500">
                            {shop.code} • {shop.capacity}/mo
                            {shop.network && ` • ${shop.network}`}
                            {shop.servingRailroad && ` • ${shop.servingRailroad}`}
                          </div>
                        </div>
                      </td>
                      {months.map((_, idx) => {
                        const cellAssignments = getCellAssignments(shop.id, idx);
                        const count = cellAssignments.length;
                        const isSelected = selectedShopId === shop.id && selectedMonth === idx;

                        return (
                          <td
                            key={idx}
                            className={`px-2 py-3 text-center cursor-pointer transition-all border ${
                              isSelected
                                ? 'ring-2 ring-rail-500 ring-inset bg-rail-100'
                                : getCellColor(count, shop.capacity)
                            }`}
                            onClick={() => handleCellClick(shop.id, idx)}
                          >
                            {count > 0 ? (
                              <div className="text-sm font-medium text-steel-900">{count}</div>
                            ) : (
                              <div className="text-sm text-steel-400">-</div>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-center bg-steel-50">
                        <span className="font-semibold text-steel-900">{yearTotal}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-steel-100">
                  <td className="sticky left-0 z-10 bg-steel-100 px-4 py-3 font-medium text-steel-900 border-r border-steel-200">
                    Monthly Total
                  </td>
                  {months.map((_, idx) => {
                    const monthTotal = filteredShops.reduce((sum, shop) => {
                      return sum + getCellAssignments(shop.id, idx).length;
                    }, 0);
                    return (
                      <td key={idx} className="px-2 py-3 text-center font-semibold text-steel-900">
                        {monthTotal}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-center font-bold text-steel-900 bg-rail-100">
                    {filteredShops.reduce((total, shop) => {
                      return total + months.reduce((sum, _, idx) => {
                        return sum + getCellAssignments(shop.id, idx).length;
                      }, 0);
                    }, 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Cell Details Panel (shows when cell is selected) */}
        {selectedShopId && selectedMonth !== null && (
          <div className="border-t border-steel-200 bg-white p-4 max-h-48 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-steel-900">
                {getShopName(selectedShopId)} - {months[selectedMonth]} {selectedYear}
              </h3>
              <button
                onClick={() => {
                  setSelectedShopId(null);
                  setSelectedMonth(null);
                }}
                className="text-steel-500 hover:text-steel-700"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {getCellAssignments(selectedShopId, selectedMonth).map(assignment => (
                <div
                  key={assignment.id}
                  className="flex items-center gap-2 px-3 py-2 bg-steel-50 rounded-lg"
                >
                  <span className="font-medium text-steel-900">
                    {assignment.car?.vehicleNumber || 'Unknown'}
                  </span>
                  <span className="text-xs text-steel-500">
                    {assignment.car?.carType}
                  </span>
                  <button
                    onClick={() => handleRemoveAssignment(assignment.id)}
                    className="text-red-500 hover:text-red-700 ml-2"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {getCellAssignments(selectedShopId, selectedMonth).length === 0 && (
                <p className="text-steel-500 text-sm">
                  No cars assigned. Select cars from the left panel and they will be assigned here.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
