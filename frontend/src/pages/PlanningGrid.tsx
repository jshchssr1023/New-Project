import { useState, useEffect } from 'react';
import {
  ArrowDownTrayIcon,
  PlusIcon,
  XMarkIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import { plansApi, shopsApi, carsApi } from '../services/api';
import type { Plan, Shop, PlanAssignment, Car } from '../types';

const months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export default function PlanningGrid() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [cars, setCars] = useState<Car[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [gridData, setGridData] = useState<Map<string, PlanAssignment[]>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [customerFilter, setCustomerFilter] = useState<string>('');
  const [customers, setCustomers] = useState<string[]>([]);
  const [selectedCell, setSelectedCell] = useState<{ shopId: string; month: number } | null>(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isCellDetailOpen, setIsCellDetailOpen] = useState(false);
  const [cellAssignments, setCellAssignments] = useState<PlanAssignment[]>([]);
  const [assignForm, setAssignForm] = useState({
    carId: '',
    estimatedCost: 15000,
    estimatedDuration: 14,
    notes: '',
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedPlan) {
      loadGridData();
    }
  }, [selectedPlan, customerFilter]);

  const loadInitialData = async () => {
    try {
      const [plansData, shopsData, carsResponse] = await Promise.all([
        plansApi.getAll(),
        shopsApi.getAll(),
        carsApi.getAll({ pageSize: 1000 }),
      ]);
      setPlans(plansData);
      setShops(shopsData.filter((s) => s.isActive));
      setCars(carsResponse.data);

      // Extract unique customers
      const uniqueCustomers = [...new Set(carsResponse.data.map(c => c.customer).filter(Boolean))];
      setCustomers(uniqueCustomers);

      if (plansData.length > 0) {
        setSelectedPlan(plansData[0]);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadGridData = async () => {
    if (!selectedPlan) return;
    try {
      const response = await plansApi.getGrid(selectedPlan.id);
      const assignmentMap = new Map<string, PlanAssignment[]>();

      response.assignments.forEach((shopAssignments, shopIndex) => {
        const shopId = response.shops[shopIndex]?.id;
        if (shopId) {
          shopAssignments.forEach((assignment) => {
            // Apply customer filter if set
            if (customerFilter && assignment.car?.customer !== customerFilter) {
              return;
            }
            const key = `${shopId}-${assignment.scheduledMonth}`;
            const existing = assignmentMap.get(key) || [];
            assignmentMap.set(key, [...existing, assignment]);
          });
        }
      });

      setGridData(assignmentMap);
    } catch (error) {
      console.error('Failed to load grid data:', error);
    }
  };

  const getCellAssignments = (shopId: string, monthIndex: number): PlanAssignment[] => {
    const monthKey = `${selectedYear}-${String(monthIndex + 1).padStart(2, '0')}`;
    return gridData.get(`${shopId}-${monthKey}`) || [];
  };

  const getCellColor = (count: number, capacity: number): string => {
    const utilization = count / capacity;
    if (utilization === 0) return 'bg-steel-50';
    if (utilization < 0.5) return 'bg-green-100';
    if (utilization < 0.8) return 'bg-amber-100';
    if (utilization < 1) return 'bg-orange-100';
    return 'bg-red-100';
  };

  const handleCellClick = (shopId: string, monthIndex: number) => {
    const assignments = getCellAssignments(shopId, monthIndex);
    setSelectedCell({ shopId, month: monthIndex });
    setCellAssignments(assignments);
    setIsCellDetailOpen(true);
  };

  const handleOpenAssignModal = () => {
    setAssignForm({
      carId: '',
      estimatedCost: 15000,
      estimatedDuration: 14,
      notes: '',
    });
    setIsAssignModalOpen(true);
  };

  const handleAddAssignment = async () => {
    if (!selectedPlan || !selectedCell || !assignForm.carId) return;

    try {
      const scheduledMonth = `${selectedYear}-${String(selectedCell.month + 1).padStart(2, '0')}`;
      await plansApi.addAssignment(selectedPlan.id, {
        carId: assignForm.carId,
        shopId: selectedCell.shopId,
        scheduledMonth,
        estimatedCost: assignForm.estimatedCost,
        estimatedDuration: assignForm.estimatedDuration,
        notes: assignForm.notes,
        status: 'pending',
      });
      setIsAssignModalOpen(false);
      await loadGridData();
      // Refresh cell details
      const assignments = getCellAssignments(selectedCell.shopId, selectedCell.month);
      setCellAssignments(assignments);
    } catch (error) {
      console.error('Failed to add assignment:', error);
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    if (!selectedPlan || !confirm('Remove this car from the plan?')) return;

    try {
      await plansApi.removeAssignment(selectedPlan.id, assignmentId);
      await loadGridData();
      if (selectedCell) {
        const assignments = getCellAssignments(selectedCell.shopId, selectedCell.month);
        setCellAssignments(assignments);
      }
    } catch (error) {
      console.error('Failed to remove assignment:', error);
    }
  };

  const getAvailableCars = (): Car[] => {
    // Get all car IDs that are already assigned in this month
    const assignedCarIds = new Set<string>();
    if (selectedCell) {
      const monthKey = `${selectedYear}-${String(selectedCell.month + 1).padStart(2, '0')}`;
      gridData.forEach((assignments, key) => {
        if (key.endsWith(monthKey)) {
          assignments.forEach(a => {
            if (a.carId) assignedCarIds.add(a.carId);
          });
        }
      });
    }

    // Filter cars that aren't assigned and optionally by customer
    return cars.filter(car => {
      if (assignedCarIds.has(car.id)) return false;
      if (customerFilter && car.customer !== customerFilter) return false;
      return true;
    });
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-steel-900">Planning Grid</h1>
          <p className="mt-1 text-sm text-steel-500">
            Shop × Month matrix for railcar service scheduling
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <select
            value={selectedPlan?.id || ''}
            onChange={(e) => setSelectedPlan(plans.find((p) => p.id === e.target.value) || null)}
            className="input w-48"
          >
            <option value="" disabled>Select a plan</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="input w-32"
          >
            {[2024, 2025, 2026].map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
          {selectedPlan && (
            <button
              onClick={() => plansApi.exportToExcel(selectedPlan.id)}
              className="btn-primary flex items-center"
            >
              <ArrowDownTrayIcon className="mr-2 h-5 w-5" />
              Export to Excel
            </button>
          )}
        </div>
      </div>

      {/* Customer Filter */}
      <div className="flex items-center gap-4 bg-steel-50 rounded-lg p-4">
        <FunnelIcon className="h-5 w-5 text-steel-500" />
        <span className="text-sm font-medium text-steel-700">Filter by Customer:</span>
        <select
          value={customerFilter}
          onChange={(e) => setCustomerFilter(e.target.value)}
          className="input w-64"
        >
          <option value="">All Customers</option>
          {customers.map((customer) => (
            <option key={customer} value={customer}>
              {customer}
            </option>
          ))}
        </select>
        {customerFilter && (
          <button
            onClick={() => setCustomerFilter('')}
            className="text-steel-500 hover:text-steel-700"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        )}
        {customerFilter && (
          <span className="text-sm text-steel-600">
            Showing assignments for: <strong>{customerFilter}</strong>
          </span>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center space-x-6 text-sm">
        <span className="text-steel-600">Utilization:</span>
        <div className="flex items-center space-x-1">
          <div className="w-4 h-4 bg-steel-50 rounded border border-steel-200" />
          <span className="text-steel-600">Empty</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-4 h-4 bg-green-100 rounded" />
          <span className="text-steel-600">&lt;50%</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-4 h-4 bg-amber-100 rounded" />
          <span className="text-steel-600">50-80%</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-4 h-4 bg-orange-100 rounded" />
          <span className="text-steel-600">80-100%</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-4 h-4 bg-red-100 rounded" />
          <span className="text-steel-600">Over capacity</span>
        </div>
        <span className="text-steel-400 ml-4">Click a cell to view/add assignments</span>
      </div>

      {/* Grid */}
      <div className="card overflow-x-auto p-0">
        <table className="min-w-full">
          <thead>
            <tr className="bg-steel-800 text-white">
              <th className="sticky left-0 z-10 bg-steel-800 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider border-r border-steel-700">
                Shop
              </th>
              {months.map((month) => (
                <th
                  key={month}
                  className="px-2 py-3 text-center text-xs font-medium uppercase tracking-wider min-w-[80px]"
                >
                  {month}
                </th>
              ))}
              <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-steel-200">
            {shops.map((shop) => {
              const yearTotal = months.reduce((sum, _, index) => {
                return sum + getCellAssignments(shop.id, index).length;
              }, 0);

              return (
                <tr key={shop.id}>
                  <td className="sticky left-0 z-10 bg-white px-4 py-3 whitespace-nowrap border-r border-steel-200">
                    <div>
                      <div className="text-sm font-medium text-steel-900">{shop.name}</div>
                      <div className="text-xs text-steel-500">{shop.capacity}/mo</div>
                    </div>
                  </td>
                  {months.map((_, index) => {
                    const assignments = getCellAssignments(shop.id, index);
                    const count = assignments.length;

                    return (
                      <td
                        key={index}
                        className={`px-2 py-3 text-center ${getCellColor(count, shop.capacity)} cursor-pointer hover:opacity-80 transition-opacity border border-steel-100`}
                        onClick={() => handleCellClick(shop.id, index)}
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
                    <div className="text-sm font-semibold text-steel-900">{yearTotal}</div>
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
              {months.map((_, index) => {
                const monthTotal = shops.reduce((sum, shop) => {
                  return sum + getCellAssignments(shop.id, index).length;
                }, 0);

                return (
                  <td key={index} className="px-2 py-3 text-center font-semibold text-steel-900">
                    {monthTotal}
                  </td>
                );
              })}
              <td className="px-4 py-3 text-center font-bold text-steel-900 bg-rail-100">
                {shops.reduce((total, shop) => {
                  return total + months.reduce((sum, _, index) => {
                    return sum + getCellAssignments(shop.id, index).length;
                  }, 0);
                }, 0)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Plan details */}
      {selectedPlan && (
        <div className="card">
          <h3 className="text-lg font-medium text-steel-900 mb-4">Plan Details</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-steel-500">Status</p>
              <p className="text-sm font-medium text-steel-900 capitalize">{selectedPlan.status}</p>
            </div>
            <div>
              <p className="text-sm text-steel-500">Start Date</p>
              <p className="text-sm font-medium text-steel-900">
                {new Date(selectedPlan.startDate).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-steel-500">End Date</p>
              <p className="text-sm font-medium text-steel-900">
                {new Date(selectedPlan.endDate).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-steel-500">Total Assignments</p>
              <p className="text-sm font-medium text-steel-900">
                {selectedPlan.assignments?.length || 0}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Cell Detail Modal */}
      {isCellDetailOpen && selectedCell && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-steel-900/50" onClick={() => setIsCellDetailOpen(false)} />
            <div className="relative w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-steel-900">
                    {getShopName(selectedCell.shopId)}
                  </h2>
                  <p className="text-sm text-steel-500">
                    {months[selectedCell.month]} {selectedYear}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleOpenAssignModal}
                    className="btn-primary py-2 px-3 text-sm flex items-center"
                  >
                    <PlusIcon className="mr-1 h-4 w-4" />
                    Add Car
                  </button>
                  <button
                    onClick={() => setIsCellDetailOpen(false)}
                    className="text-steel-500 hover:text-steel-700"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>
              </div>

              {cellAssignments.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-steel-500">No cars assigned for this month.</p>
                  <button
                    onClick={handleOpenAssignModal}
                    className="btn-primary mt-4"
                  >
                    <PlusIcon className="mr-2 h-5 w-5 inline" />
                    Add Car
                  </button>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {cellAssignments.map((assignment) => (
                    <div
                      key={assignment.id}
                      className="flex items-center justify-between p-3 bg-steel-50 rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-steel-900">
                          {assignment.car?.vehicleNumber || 'Unknown Car'}
                        </p>
                        <div className="text-sm text-steel-600">
                          <span>{assignment.car?.carType}</span>
                          {assignment.car?.customer && (
                            <span className="ml-2 text-steel-500">• {assignment.car.customer}</span>
                          )}
                        </div>
                        <div className="text-xs text-steel-500 mt-1">
                          Est. ${assignment.estimatedCost?.toLocaleString()} • {assignment.estimatedDuration} days
                          <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                            assignment.status === 'completed' ? 'bg-green-100 text-green-800' :
                            assignment.status === 'in_progress' ? 'bg-amber-100 text-amber-800' :
                            'bg-steel-100 text-steel-800'
                          }`}>
                            {assignment.status}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveAssignment(assignment.id)}
                        className="text-red-600 hover:text-red-900 p-2"
                      >
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Assignment Modal */}
      {isAssignModalOpen && selectedCell && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-steel-900/50" onClick={() => setIsAssignModalOpen(false)} />
            <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
              <h2 className="text-xl font-semibold text-steel-900 mb-2">Add Car to Plan</h2>
              <p className="text-sm text-steel-500 mb-4">
                {getShopName(selectedCell.shopId)} • {months[selectedCell.month]} {selectedYear}
              </p>

              <div className="space-y-4">
                <div>
                  <label className="label">Select Car</label>
                  <select
                    value={assignForm.carId}
                    onChange={(e) => setAssignForm({ ...assignForm, carId: e.target.value })}
                    className="input"
                    required
                  >
                    <option value="">Choose a car...</option>
                    {getAvailableCars().map((car) => (
                      <option key={car.id} value={car.id}>
                        {car.vehicleNumber} - {car.carType} ({car.customer})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Est. Cost ($)</label>
                    <input
                      type="number"
                      value={assignForm.estimatedCost}
                      onChange={(e) => setAssignForm({ ...assignForm, estimatedCost: parseInt(e.target.value) || 0 })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Est. Duration (days)</label>
                    <input
                      type="number"
                      value={assignForm.estimatedDuration}
                      onChange={(e) => setAssignForm({ ...assignForm, estimatedDuration: parseInt(e.target.value) || 0 })}
                      className="input"
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Notes (optional)</label>
                  <textarea
                    value={assignForm.notes}
                    onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })}
                    className="input"
                    rows={2}
                    placeholder="Any special notes..."
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsAssignModalOpen(false)}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddAssignment}
                    disabled={!assignForm.carId}
                    className="btn-primary disabled:opacity-50"
                  >
                    Add Assignment
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
