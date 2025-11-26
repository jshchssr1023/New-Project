import { useState, useEffect } from 'react';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { plansApi, shopsApi } from '../services/api';
import type { Plan, Shop, PlanAssignment } from '../types';

const months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export default function PlanningGrid() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [gridData, setGridData] = useState<Map<string, PlanAssignment[]>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedPlan) {
      loadGridData();
    }
  }, [selectedPlan]);

  const loadInitialData = async () => {
    try {
      const [plansData, shopsData] = await Promise.all([
        plansApi.getAll(),
        shopsApi.getAll(),
      ]);
      setPlans(plansData);
      setShops(shopsData.filter((s) => s.isActive));
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
                        className={`px-2 py-3 text-center ${getCellColor(count, shop.capacity)} cursor-pointer hover:opacity-80 transition-opacity`}
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
    </div>
  );
}
