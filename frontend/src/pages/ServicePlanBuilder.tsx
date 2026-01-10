/**
 * Service Plan Builder
 *
 * A comprehensive tool for creating customer service plans with multiple options.
 *
 * WORKFLOW:
 * 1. Create a Service Plan with car flow definition (X cars/month, date range)
 * 2. Add cars to the plan (manual selection or filter-based)
 * 3. Create multiple Plan Options with different shop configurations
 * 4. Compare options side-by-side with Gantt-style timeline
 * 5. Export PDF for customer review
 * 6. Approve selected option to schedule cars
 *
 * @author AITX Chronos Team
 * @version 1.0.0
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  PlusIcon,
  TrashIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  DocumentArrowDownIcon,
  PaperAirplaneIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
  AdjustmentsHorizontalIcon,
  BuildingStorefrontIcon,
  TruckIcon,
  CalendarIcon,
  CurrencyDollarIcon,
  ClockIcon,
  CheckIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import { servicePlansApi, carsApi, shopsApi } from '../services/api';
import { customersApi } from '../services/carFlowApi';
import type {
  ServicePlan,
  ServicePlanCar,
  PlanOption,
  PlanOptionAssignment,
  OptionComparisonResult,
  CreateServicePlanInput,
  AssignmentInput,
} from '../services/api/servicePlans';
import type { Car, Shop, Customer } from '../types';
import { EmptyState } from '../components/ui';

// =============================================================================
// CONSTANTS
// =============================================================================

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-steel-100 text-steel-800',
  proposed: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  archived: 'bg-gray-100 text-gray-800',
  cancelled: 'bg-red-100 text-red-800',
};

const OPTION_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-red-500',
  'bg-purple-500',
];

// =============================================================================
// TYPES
// =============================================================================

type ViewMode = 'setup' | 'cars' | 'options' | 'compare';

interface WizardStepInfo {
  id: ViewMode;
  label: string;
  description: string;
}

const WIZARD_STEPS: WizardStepInfo[] = [
  { id: 'setup', label: 'Plan Setup', description: 'Define car flow' },
  { id: 'cars', label: 'Select Cars', description: 'Choose cars for plan' },
  { id: 'options', label: 'Plan Options', description: 'Create shop configurations' },
  { id: 'compare', label: 'Compare', description: 'Compare and export' },
];

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function ServicePlanBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // State
  const [servicePlan, setServicePlan] = useState<ServicePlan | null>(null);
  const [servicePlans, setServicePlans] = useState<ServicePlan[]>([]);
  const [comparison, setComparison] = useState<OptionComparisonResult | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [availableCars, setAvailableCars] = useState<Car[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);

  const [viewMode, setViewMode] = useState<ViewMode>('setup');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAddCarsModalOpen, setIsAddCarsModalOpen] = useState(false);
  const [isCreateOptionModalOpen, setIsCreateOptionModalOpen] = useState(false);
  const [isAssignShopsModalOpen, setIsAssignShopsModalOpen] = useState(false);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);

  // Form states
  const [createForm, setCreateForm] = useState<CreateServicePlanInput>({
    name: '',
    description: '',
    customerId: '',
    projectNumber: '',
    carFlowRate: 10,
    startMonth: new Date().getMonth() + 2, // Next month + 1
    startYear: new Date().getFullYear(),
    endMonth: new Date().getMonth() + 7, // 6 months out
    endYear: new Date().getFullYear(),
  });

  const [selectedCarIds, setSelectedCarIds] = useState<string[]>([]);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [approvedBy, setApprovedBy] = useState('');

  // ==========================================================================
  // DATA LOADING
  // ==========================================================================

  const loadServicePlans = useCallback(async () => {
    try {
      const data = await servicePlansApi.getAll();
      setServicePlans(data);
    } catch (err) {
      console.error('Failed to load service plans:', err);
    }
  }, []);

  const loadServicePlan = useCallback(async (planId: string) => {
    try {
      setIsLoading(true);
      const data = await servicePlansApi.getById(planId);
      setServicePlan(data);

      // Also load comparison data
      if (data.options.length > 0) {
        const comparisonData = await servicePlansApi.compareOptions(planId);
        setComparison(comparisonData);
      }
    } catch (err) {
      console.error('Failed to load service plan:', err);
      setError('Failed to load service plan');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadCustomers = useCallback(async () => {
    try {
      // Use dedicated customers API to get all active customers
      const customerList = await customersApi.getAll();
      setCustomers(customerList);
    } catch (err) {
      console.error('Failed to load customers:', err);
    }
  }, []);

  const loadAvailableCars = useCallback(async () => {
    try {
      const response = await carsApi.getAll();
      setAvailableCars(response.data || []);
    } catch (err) {
      console.error('Failed to load cars:', err);
    }
  }, []);

  const loadShops = useCallback(async () => {
    try {
      const response = await shopsApi.getAll();
      setShops(response.filter((s: Shop) => s.isActive));
    } catch (err) {
      console.error('Failed to load shops:', err);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      await Promise.all([loadServicePlans(), loadCustomers(), loadShops()]);
      if (id) {
        await loadServicePlan(id);
        setViewMode('cars');
      }
      setIsLoading(false);
    };
    init();
  }, [id, loadServicePlans, loadServicePlan, loadCustomers, loadShops]);

  // ==========================================================================
  // ACTION HANDLERS
  // ==========================================================================

  const handleCreatePlan = async () => {
    try {
      setIsSaving(true);
      const newPlan = await servicePlansApi.create(createForm);
      setServicePlan(newPlan);
      setServicePlans((prev) => [newPlan, ...prev]);
      setIsCreateModalOpen(false);
      setViewMode('cars');
      navigate(`/service-plans/${newPlan.id}`);
    } catch (err) {
      console.error('Failed to create service plan:', err);
      setError('Failed to create service plan');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddCars = async () => {
    if (!servicePlan || selectedCarIds.length === 0) return;

    try {
      setIsSaving(true);
      await servicePlansApi.addCars(servicePlan.id, selectedCarIds);
      await loadServicePlan(servicePlan.id);
      setSelectedCarIds([]);
      setIsAddCarsModalOpen(false);
    } catch (err) {
      console.error('Failed to add cars:', err);
      setError('Failed to add cars');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveCar = async (servicePlanCarId: string) => {
    if (!servicePlan) return;

    try {
      await servicePlansApi.removeCar(servicePlan.id, servicePlanCarId);
      await loadServicePlan(servicePlan.id);
    } catch (err) {
      console.error('Failed to remove car:', err);
    }
  };

  const handleCreateOption = async (name: string, description: string) => {
    if (!servicePlan) return;

    try {
      setIsSaving(true);
      await servicePlansApi.createOption(servicePlan.id, { name, description });
      await loadServicePlan(servicePlan.id);
      setIsCreateOptionModalOpen(false);
    } catch (err) {
      console.error('Failed to create option:', err);
      setError('Failed to create option');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteOption = async (optionId: string) => {
    if (!servicePlan) return;

    try {
      await servicePlansApi.deleteOption(servicePlan.id, optionId);
      await loadServicePlan(servicePlan.id);
    } catch (err) {
      console.error('Failed to delete option:', err);
    }
  };

  const handleSetAssignments = async (optionId: string, assignments: AssignmentInput[]) => {
    if (!servicePlan) return;

    try {
      setIsSaving(true);
      await servicePlansApi.setOptionAssignments(servicePlan.id, optionId, assignments);
      await loadServicePlan(servicePlan.id);
      setIsAssignShopsModalOpen(false);
    } catch (err) {
      console.error('Failed to set assignments:', err);
      setError('Failed to save assignments');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportPdf = async () => {
    if (!servicePlan) return;

    try {
      await servicePlansApi.downloadPdf(
        servicePlan.id,
        `${servicePlan.name.replace(/[^a-z0-9]/gi, '-')}-proposal.pdf`,
        { branding: 'aitx', includeCarDetails: true, includeShopDetails: true }
      );
    } catch (err) {
      console.error('Failed to export PDF:', err);
      setError('Failed to export PDF');
    }
  };

  const handlePropose = async () => {
    if (!servicePlan) return;

    try {
      setIsSaving(true);
      await servicePlansApi.propose(servicePlan.id);
      await loadServicePlan(servicePlan.id);
    } catch (err) {
      console.error('Failed to propose plan:', err);
      setError('Failed to send proposal');
    } finally {
      setIsSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!servicePlan || !selectedOptionId || !approvedBy) return;

    try {
      setIsSaving(true);
      await servicePlansApi.approve(servicePlan.id, selectedOptionId, approvedBy);
      await loadServicePlan(servicePlan.id);
      setIsApproveModalOpen(false);
    } catch (err) {
      console.error('Failed to approve plan:', err);
      setError('Failed to approve plan');
    } finally {
      setIsSaving(false);
    }
  };

  // ==========================================================================
  // RENDER HELPERS
  // ==========================================================================

  const renderStepIndicator = () => {
    const currentIndex = WIZARD_STEPS.findIndex((s) => s.id === viewMode);

    return (
      <div className="flex items-center justify-center mb-6">
        {WIZARD_STEPS.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <button
              onClick={() => servicePlan && setViewMode(step.id)}
              disabled={!servicePlan && step.id !== 'setup'}
              className={`flex items-center ${
                index <= currentIndex ? 'text-rail-600' : 'text-steel-400'
              } ${servicePlan || step.id === 'setup' ? 'cursor-pointer hover:text-rail-700' : 'cursor-not-allowed'}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  index < currentIndex
                    ? 'bg-rail-600 text-white'
                    : index === currentIndex
                    ? 'bg-rail-100 text-rail-600 border-2 border-rail-600'
                    : 'bg-steel-100 text-steel-500'
                }`}
              >
                {index < currentIndex ? <CheckIcon className="w-4 h-4" /> : index + 1}
              </div>
              <span className="ml-2 text-sm font-medium hidden sm:inline">{step.label}</span>
            </button>
            {index < WIZARD_STEPS.length - 1 && (
              <ChevronRightIcon className="w-5 h-5 mx-2 text-steel-300" />
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderPlanSetup = () => (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-steel-900 mb-4">Create Service Plan</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-steel-700 mb-1">
            Plan Name *
          </label>
          <input
            type="text"
            value={createForm.name}
            onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
            className="w-full px-3 py-2 border border-steel-300 rounded-md focus:ring-rail-500 focus:border-rail-500"
            placeholder="Q1 2026 Tank Car Service Plan"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-steel-700 mb-1">
            Customer
          </label>
          <select
            value={createForm.customerId}
            onChange={(e) => setCreateForm({ ...createForm, customerId: e.target.value })}
            className="w-full px-3 py-2 border border-steel-300 rounded-md focus:ring-rail-500 focus:border-rail-500"
          >
            <option value="">Select customer...</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-steel-700 mb-1">
            Project Number (optional)
          </label>
          <input
            type="text"
            value={createForm.projectNumber}
            onChange={(e) => setCreateForm({ ...createForm, projectNumber: e.target.value })}
            className="w-full px-3 py-2 border border-steel-300 rounded-md focus:ring-rail-500 focus:border-rail-500"
            placeholder="PRJ-2026-001"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-steel-700 mb-1">
            Cars per Month *
          </label>
          <input
            type="number"
            min="1"
            value={createForm.carFlowRate}
            onChange={(e) =>
              setCreateForm({ ...createForm, carFlowRate: parseInt(e.target.value) || 1 })
            }
            className="w-full px-3 py-2 border border-steel-300 rounded-md focus:ring-rail-500 focus:border-rail-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-steel-700 mb-1">
            Start Date *
          </label>
          <div className="flex gap-2">
            <select
              value={createForm.startMonth}
              onChange={(e) =>
                setCreateForm({ ...createForm, startMonth: parseInt(e.target.value) })
              }
              className="flex-1 px-3 py-2 border border-steel-300 rounded-md focus:ring-rail-500 focus:border-rail-500"
            >
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
            <select
              value={createForm.startYear}
              onChange={(e) =>
                setCreateForm({ ...createForm, startYear: parseInt(e.target.value) })
              }
              className="w-24 px-3 py-2 border border-steel-300 rounded-md focus:ring-rail-500 focus:border-rail-500"
            >
              {[2025, 2026, 2027, 2028].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-steel-700 mb-1">
            End Date *
          </label>
          <div className="flex gap-2">
            <select
              value={createForm.endMonth}
              onChange={(e) =>
                setCreateForm({ ...createForm, endMonth: parseInt(e.target.value) })
              }
              className="flex-1 px-3 py-2 border border-steel-300 rounded-md focus:ring-rail-500 focus:border-rail-500"
            >
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
            <select
              value={createForm.endYear}
              onChange={(e) =>
                setCreateForm({ ...createForm, endYear: parseInt(e.target.value) })
              }
              className="w-24 px-3 py-2 border border-steel-300 rounded-md focus:ring-rail-500 focus:border-rail-500"
            >
              {[2025, 2026, 2027, 2028].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-steel-700 mb-1">
            Description
          </label>
          <textarea
            value={createForm.description}
            onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 border border-steel-300 rounded-md focus:ring-rail-500 focus:border-rail-500"
            placeholder="Additional notes about this service plan..."
          />
        </div>
      </div>

      {/* Summary Box */}
      <div className="mt-6 p-4 bg-rail-50 rounded-lg">
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-steel-500">Total Slots:</span>
            <span className="ml-2 font-semibold text-steel-900">
              {(() => {
                const months =
                  (createForm.endYear - createForm.startYear) * 12 +
                  (createForm.endMonth - createForm.startMonth) +
                  1;
                return createForm.carFlowRate * Math.max(0, months);
              })()}{' '}
              cars
            </span>
          </div>
          <div>
            <span className="text-steel-500">Duration:</span>
            <span className="ml-2 font-semibold text-steel-900">
              {(() => {
                const months =
                  (createForm.endYear - createForm.startYear) * 12 +
                  (createForm.endMonth - createForm.startMonth) +
                  1;
                return Math.max(0, months);
              })()}{' '}
              months
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={handleCreatePlan}
          disabled={!createForm.name || createForm.carFlowRate < 1 || isSaving}
          className="px-4 py-2 bg-rail-600 text-white rounded-md hover:bg-rail-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isSaving ? (
            <ArrowPathIcon className="w-4 h-4 animate-spin" />
          ) : (
            <PlusIcon className="w-4 h-4" />
          )}
          Create Plan
        </button>
      </div>
    </div>
  );

  const renderCarSelection = () => {
    if (!servicePlan) return null;

    const existingCarIds = new Set(servicePlan.cars.map((c) => c.carId));
    const filteredCars = availableCars.filter(
      (c) =>
        !existingCarIds.has(c.id) &&
        (!servicePlan.customerId || c.customerId === servicePlan.customerId)
    );

    return (
      <div className="bg-white rounded-lg shadow">
        {/* Header */}
        <div className="p-4 border-b border-steel-200 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold text-steel-900">Cars in Plan</h2>
            <p className="text-sm text-steel-500">
              {servicePlan.selectedCarCount} of {servicePlan.totalCarSlots} slots filled
            </p>
          </div>
          <button
            onClick={() => {
              loadAvailableCars();
              setIsAddCarsModalOpen(true);
            }}
            className="px-3 py-2 bg-rail-600 text-white rounded-md hover:bg-rail-700 flex items-center gap-2"
          >
            <PlusIcon className="w-4 h-4" />
            Add Cars
          </button>
        </div>

        {/* Progress bar */}
        <div className="px-4 py-2 bg-steel-50">
          <div className="h-2 bg-steel-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-rail-500 transition-all"
              style={{
                width: `${Math.min(
                  100,
                  (servicePlan.selectedCarCount / servicePlan.totalCarSlots) * 100
                )}%`,
              }}
            />
          </div>
        </div>

        {/* Car list */}
        <div className="overflow-x-auto">
          {servicePlan.cars.length === 0 ? (
            <EmptyState
              icon={TruckIcon}
              title="No cars added yet"
              description="Add cars to this service plan to get started"
              action={{
                label: 'Add Cars',
                onClick: () => {
                  loadAvailableCars();
                  setIsAddCarsModalOpen(true);
                },
              }}
            />
          ) : (
            <table className="min-w-full divide-y divide-steel-200">
              <thead className="bg-steel-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-steel-500 uppercase">
                    Railcar #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-steel-500 uppercase">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-steel-500 uppercase">
                    Qual Due
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-steel-500 uppercase">
                    Assigned Month
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-steel-500 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-steel-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-steel-200">
                {servicePlan.cars.map((spc) => (
                  <tr key={spc.id} className="hover:bg-steel-50">
                    <td className="px-4 py-3 text-sm font-medium text-steel-900">
                      {spc.car.railcarNumber}
                    </td>
                    <td className="px-4 py-3 text-sm text-steel-500">{spc.car.carType || '-'}</td>
                    <td className="px-4 py-3 text-sm text-steel-500">
                      {spc.qualificationDueDate
                        ? new Date(spc.qualificationDueDate).toLocaleDateString('en-US', {
                            month: 'short',
                            year: '2-digit',
                          })
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-steel-500">
                      {spc.userAssignedMonth
                        ? `${MONTHS[spc.userAssignedMonth - 1]} ${spc.userAssignedYear}`
                        : spc.autoAssignedMonth
                        ? `${MONTHS[spc.autoAssignedMonth - 1]} ${spc.autoAssignedYear} (auto)`
                        : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          spc.shoppingStatus === 'Urgent'
                            ? 'bg-red-100 text-red-800'
                            : spc.shoppingStatus === 'MustShop'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-green-100 text-green-800'
                        }`}
                      >
                        {spc.shoppingStatus || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleRemoveCar(spc.id)}
                        className="text-red-600 hover:text-red-800"
                        title="Remove car"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Add Cars Modal */}
        {isAddCarsModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] overflow-hidden">
              <div className="p-4 border-b border-steel-200 flex justify-between items-center">
                <h3 className="text-lg font-semibold">Add Cars to Plan</h3>
                <button
                  onClick={() => setIsAddCarsModalOpen(false)}
                  className="text-steel-400 hover:text-steel-600"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 max-h-[60vh] overflow-y-auto">
                <p className="text-sm text-steel-500 mb-4">
                  Select cars to add to this service plan. {selectedCarIds.length} selected.
                </p>

                <table className="min-w-full divide-y divide-steel-200">
                  <thead className="bg-steel-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left">
                        <input
                          type="checkbox"
                          checked={selectedCarIds.length === filteredCars.length && filteredCars.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCarIds(filteredCars.map((c) => c.id));
                            } else {
                              setSelectedCarIds([]);
                            }
                          }}
                          className="rounded border-steel-300"
                        />
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-steel-500 uppercase">
                        Railcar #
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-steel-500 uppercase">
                        Type
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-steel-500 uppercase">
                        Customer
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-steel-500 uppercase">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-steel-200">
                    {filteredCars.slice(0, 100).map((car) => (
                      <tr
                        key={car.id}
                        className={`hover:bg-steel-50 cursor-pointer ${
                          selectedCarIds.includes(car.id) ? 'bg-rail-50' : ''
                        }`}
                        onClick={() => {
                          setSelectedCarIds((prev) =>
                            prev.includes(car.id)
                              ? prev.filter((id) => id !== car.id)
                              : [...prev, car.id]
                          );
                        }}
                      >
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            checked={selectedCarIds.includes(car.id)}
                            onChange={() => {}}
                            className="rounded border-steel-300"
                          />
                        </td>
                        <td className="px-4 py-2 text-sm font-medium text-steel-900">
                          {car.railcarNumber}
                        </td>
                        <td className="px-4 py-2 text-sm text-steel-500">{car.carType || '-'}</td>
                        <td className="px-4 py-2 text-sm text-steel-500">{car.customer || '-'}</td>
                        <td className="px-4 py-2">
                          <span
                            className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                              car.shoppingStatus === 'Urgent'
                                ? 'bg-red-100 text-red-800'
                                : car.shoppingStatus === 'MustShop'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-green-100 text-green-800'
                            }`}
                          >
                            {car.shoppingStatus || 'Unknown'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {filteredCars.length > 100 && (
                  <p className="text-sm text-steel-500 mt-2 text-center">
                    Showing first 100 cars. Use filters to narrow results.
                  </p>
                )}
              </div>

              <div className="p-4 border-t border-steel-200 flex justify-end gap-3">
                <button
                  onClick={() => setIsAddCarsModalOpen(false)}
                  className="px-4 py-2 border border-steel-300 rounded-md hover:bg-steel-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddCars}
                  disabled={selectedCarIds.length === 0 || isSaving}
                  className="px-4 py-2 bg-rail-600 text-white rounded-md hover:bg-rail-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSaving && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
                  Add {selectedCarIds.length} Cars
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderOptionsManagement = () => {
    if (!servicePlan) return null;

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-4 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold text-steel-900">Plan Options</h2>
            <p className="text-sm text-steel-500">
              Create different shop configurations for comparison
            </p>
          </div>
          <button
            onClick={() => setIsCreateOptionModalOpen(true)}
            className="px-3 py-2 bg-rail-600 text-white rounded-md hover:bg-rail-700 flex items-center gap-2"
          >
            <PlusIcon className="w-4 h-4" />
            Add Option
          </button>
        </div>

        {/* Options Grid */}
        {servicePlan.options.length === 0 ? (
          <div className="bg-white rounded-lg shadow">
            <EmptyState
              icon={AdjustmentsHorizontalIcon}
              title="No plan options yet"
              description="Create options to compare different shop configurations"
              action={{
                label: 'Create Option',
                onClick: () => setIsCreateOptionModalOpen(true),
              }}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {servicePlan.options.map((option, index) => (
              <div
                key={option.id}
                className={`bg-white rounded-lg shadow overflow-hidden border-t-4 ${
                  option.status === 'selected'
                    ? 'border-green-500'
                    : option.status === 'rejected'
                    ? 'border-red-500'
                    : `border-${['blue', 'emerald', 'amber', 'purple'][index % 4]}-500`
                }`}
              >
                <div className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-steel-900">{option.name}</h3>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        option.status === 'ready'
                          ? 'bg-green-100 text-green-800'
                          : option.status === 'selected'
                          ? 'bg-green-500 text-white'
                          : 'bg-steel-100 text-steel-600'
                      }`}
                    >
                      {option.status}
                    </span>
                  </div>

                  {option.description && (
                    <p className="text-sm text-steel-500 mb-4">{option.description}</p>
                  )}

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <TruckIcon className="w-4 h-4 text-steel-400" />
                      <span>{option.assignments.length} cars</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <BuildingStorefrontIcon className="w-4 h-4 text-steel-400" />
                      <span>{option.shopCount} shops</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CurrencyDollarIcon className="w-4 h-4 text-steel-400" />
                      <span>${option.totalEstimatedCost.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ClockIcon className="w-4 h-4 text-steel-400" />
                      <span>{option.totalEstimatedDays} days</span>
                    </div>
                  </div>
                </div>

                <div className="px-4 py-3 bg-steel-50 border-t border-steel-200 flex justify-between">
                  <button
                    onClick={() => {
                      setSelectedOptionId(option.id);
                      setIsAssignShopsModalOpen(true);
                    }}
                    className="text-sm text-rail-600 hover:text-rail-800 flex items-center gap-1"
                  >
                    <AdjustmentsHorizontalIcon className="w-4 h-4" />
                    Configure
                  </button>
                  <button
                    onClick={() => handleDeleteOption(option.id)}
                    className="text-sm text-red-600 hover:text-red-800 flex items-center gap-1"
                  >
                    <TrashIcon className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Option Modal */}
        {isCreateOptionModalOpen && (
          <CreateOptionModal
            onClose={() => setIsCreateOptionModalOpen(false)}
            onCreate={handleCreateOption}
            isSaving={isSaving}
          />
        )}

        {/* Assign Shops Modal */}
        {isAssignShopsModalOpen && selectedOptionId && (
          <AssignShopsModal
            servicePlan={servicePlan}
            optionId={selectedOptionId}
            shops={shops}
            onClose={() => setIsAssignShopsModalOpen(false)}
            onSave={handleSetAssignments}
            isSaving={isSaving}
          />
        )}
      </div>
    );
  };

  const renderComparison = () => {
    if (!servicePlan || !comparison) return null;

    return (
      <div className="space-y-6">
        {/* Actions Header */}
        <div className="bg-white rounded-lg shadow p-4 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold text-steel-900">Compare Options</h2>
            <p className="text-sm text-steel-500">
              Review and compare plan options side-by-side
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleExportPdf}
              className="px-3 py-2 border border-steel-300 rounded-md hover:bg-steel-50 flex items-center gap-2"
            >
              <DocumentArrowDownIcon className="w-4 h-4" />
              Export PDF
            </button>
            {servicePlan.status === 'draft' && (
              <button
                onClick={handlePropose}
                disabled={isSaving}
                className="px-3 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 flex items-center gap-2"
              >
                <PaperAirplaneIcon className="w-4 h-4" />
                Send Proposal
              </button>
            )}
            {(servicePlan.status === 'draft' || servicePlan.status === 'proposed') && (
              <button
                onClick={() => setIsApproveModalOpen(true)}
                className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2"
              >
                <CheckCircleIcon className="w-4 h-4" />
                Approve Option
              </button>
            )}
          </div>
        </div>

        {/* Summary Comparison Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-4 border-b border-steel-200">
            <h3 className="font-semibold text-steel-900">Summary Comparison</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-steel-200">
              <thead className="bg-steel-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-steel-500 uppercase">
                    Metric
                  </th>
                  {comparison.options.map((opt, i) => (
                    <th
                      key={opt.id}
                      className="px-4 py-3 text-left text-xs font-medium uppercase"
                      style={{ color: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'][i % 4] }}
                    >
                      {opt.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-200">
                <tr>
                  <td className="px-4 py-3 text-sm font-medium text-steel-900">Total Cars</td>
                  {comparison.options.map((opt) => (
                    <td key={opt.id} className="px-4 py-3 text-sm text-steel-700">
                      {opt.totalCars}
                    </td>
                  ))}
                </tr>
                <tr className="bg-steel-50">
                  <td className="px-4 py-3 text-sm font-medium text-steel-900">Total Cost</td>
                  {comparison.options.map((opt, i) => {
                    const isBest =
                      opt.totalCost === Math.min(...comparison.options.map((o) => o.totalCost));
                    return (
                      <td
                        key={opt.id}
                        className={`px-4 py-3 text-sm ${
                          isBest ? 'text-green-600 font-semibold' : 'text-steel-700'
                        }`}
                      >
                        ${opt.totalCost.toLocaleString()}
                        {isBest && ' ★'}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className="px-4 py-3 text-sm font-medium text-steel-900">Avg Cost/Car</td>
                  {comparison.options.map((opt, i) => {
                    const isBest =
                      opt.avgCostPerCar ===
                      Math.min(...comparison.options.map((o) => o.avgCostPerCar));
                    return (
                      <td
                        key={opt.id}
                        className={`px-4 py-3 text-sm ${
                          isBest ? 'text-green-600 font-semibold' : 'text-steel-700'
                        }`}
                      >
                        ${opt.avgCostPerCar.toLocaleString()}
                        {isBest && ' ★'}
                      </td>
                    );
                  })}
                </tr>
                <tr className="bg-steel-50">
                  <td className="px-4 py-3 text-sm font-medium text-steel-900">Shops Used</td>
                  {comparison.options.map((opt) => (
                    <td key={opt.id} className="px-4 py-3 text-sm text-steel-700">
                      {opt.shopCount}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Timeline Gantt Chart */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-4 border-b border-steel-200">
            <h3 className="font-semibold text-steel-900">Timeline Comparison</h3>
          </div>
          <div className="p-4 overflow-x-auto">
            <TimelineGantt
              servicePlan={servicePlan}
              comparison={comparison}
            />
          </div>
        </div>

        {/* Approve Modal */}
        {isApproveModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
              <div className="p-4 border-b border-steel-200">
                <h3 className="text-lg font-semibold">Approve Service Plan</h3>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-steel-700 mb-1">
                    Select Option to Approve
                  </label>
                  <select
                    value={selectedOptionId || ''}
                    onChange={(e) => setSelectedOptionId(e.target.value)}
                    className="w-full px-3 py-2 border border-steel-300 rounded-md"
                  >
                    <option value="">Select an option...</option>
                    {servicePlan.options.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name} - ${opt.totalEstimatedCost.toLocaleString()}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-steel-700 mb-1">
                    Approved By (Customer Contact)
                  </label>
                  <input
                    type="text"
                    value={approvedBy}
                    onChange={(e) => setApprovedBy(e.target.value)}
                    className="w-full px-3 py-2 border border-steel-300 rounded-md"
                    placeholder="John Smith"
                  />
                </div>
                <div className="p-3 bg-amber-50 rounded-md">
                  <p className="text-sm text-amber-800">
                    <ExclamationTriangleIcon className="w-4 h-4 inline mr-1" />
                    This will schedule all cars in the selected option and reject other options.
                  </p>
                </div>
              </div>
              <div className="p-4 border-t border-steel-200 flex justify-end gap-3">
                <button
                  onClick={() => setIsApproveModalOpen(false)}
                  className="px-4 py-2 border border-steel-300 rounded-md hover:bg-steel-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApprove}
                  disabled={!selectedOptionId || !approvedBy || isSaving}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {isSaving && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
                  Approve & Schedule
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ==========================================================================
  // MAIN RENDER
  // ==========================================================================

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <ArrowPathIcon className="w-8 h-8 animate-spin text-rail-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-steel-900">Service Plan Builder</h1>
            <p className="text-steel-500">
              Create and compare service plan options for customer proposals
            </p>
          </div>

          {servicePlan && (
            <div className="flex items-center gap-3">
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  STATUS_COLORS[servicePlan.status] || 'bg-steel-100 text-steel-800'
                }`}
              >
                {servicePlan.status.charAt(0).toUpperCase() + servicePlan.status.slice(1)}
              </span>
            </div>
          )}
        </div>

        {servicePlan && (
          <div className="mt-2 text-sm text-steel-600">
            <span className="font-medium">{servicePlan.name}</span>
            {servicePlan.customer && <span> • {servicePlan.customer.name}</span>}
            <span>
              {' '}
              • {servicePlan.carFlowRate} cars/month from {MONTHS[servicePlan.startMonth - 1]}{' '}
              {servicePlan.startYear} to {MONTHS[servicePlan.endMonth - 1]} {servicePlan.endYear}
            </span>
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-red-600" />
          <span className="text-red-800">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-600 hover:text-red-800">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Step Indicator */}
      {renderStepIndicator()}

      {/* Content */}
      <div className="mt-6">
        {viewMode === 'setup' && !servicePlan && renderPlanSetup()}
        {viewMode === 'setup' && servicePlan && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Plan Setup Complete</h2>
            <p className="text-steel-500 mb-4">
              Your service plan has been created. Continue to add cars.
            </p>
            <button
              onClick={() => setViewMode('cars')}
              className="px-4 py-2 bg-rail-600 text-white rounded-md hover:bg-rail-700"
            >
              Continue to Select Cars
            </button>
          </div>
        )}
        {viewMode === 'cars' && renderCarSelection()}
        {viewMode === 'options' && renderOptionsManagement()}
        {viewMode === 'compare' && renderComparison()}
      </div>

      {/* Navigation */}
      {servicePlan && (
        <div className="mt-6 flex justify-between">
          <button
            onClick={() => {
              const currentIndex = WIZARD_STEPS.findIndex((s) => s.id === viewMode);
              if (currentIndex > 0) {
                setViewMode(WIZARD_STEPS[currentIndex - 1].id);
              }
            }}
            disabled={viewMode === 'setup'}
            className="px-4 py-2 border border-steel-300 rounded-md hover:bg-steel-50 disabled:opacity-50 flex items-center gap-2"
          >
            <ChevronLeftIcon className="w-4 h-4" />
            Previous
          </button>
          <button
            onClick={() => {
              const currentIndex = WIZARD_STEPS.findIndex((s) => s.id === viewMode);
              if (currentIndex < WIZARD_STEPS.length - 1) {
                setViewMode(WIZARD_STEPS[currentIndex + 1].id);
              }
            }}
            disabled={viewMode === 'compare'}
            className="px-4 py-2 bg-rail-600 text-white rounded-md hover:bg-rail-700 disabled:opacity-50 flex items-center gap-2"
          >
            Next
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function CreateOptionModal({
  onClose,
  onCreate,
  isSaving,
}: {
  onClose: () => void;
  onCreate: (name: string, description: string) => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="p-4 border-b border-steel-200 flex justify-between items-center">
          <h3 className="text-lg font-semibold">Create Plan Option</h3>
          <button onClick={onClose} className="text-steel-400 hover:text-steel-600">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-steel-700 mb-1">
              Option Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-steel-300 rounded-md"
              placeholder="Option A - All to ABC Rail"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-steel-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-steel-300 rounded-md"
              placeholder="Describe this option..."
            />
          </div>
        </div>
        <div className="p-4 border-t border-steel-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-steel-300 rounded-md hover:bg-steel-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onCreate(name, description)}
            disabled={!name || isSaving}
            className="px-4 py-2 bg-rail-600 text-white rounded-md hover:bg-rail-700 disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
            Create Option
          </button>
        </div>
      </div>
    </div>
  );
}

function AssignShopsModal({
  servicePlan,
  optionId,
  shops,
  onClose,
  onSave,
  isSaving,
}: {
  servicePlan: ServicePlan;
  optionId: string;
  shops: Shop[];
  onClose: () => void;
  onSave: (optionId: string, assignments: AssignmentInput[]) => void;
  isSaving: boolean;
}) {
  const option = servicePlan.options.find((o) => o.id === optionId);
  const [assignments, setAssignments] = useState<Map<string, AssignmentInput>>(() => {
    const map = new Map<string, AssignmentInput>();
    if (option) {
      option.assignments.forEach((a) => {
        map.set(a.servicePlanCarId, {
          servicePlanCarId: a.servicePlanCarId,
          shopId: a.shopId,
          plannedMonth: a.plannedMonth,
          plannedYear: a.plannedYear,
          estimatedCost: a.estimatedCost,
          estimatedDays: a.estimatedDays,
        });
      });
    }
    return map;
  });

  const [bulkShopId, setBulkShopId] = useState('');

  const handleBulkAssign = () => {
    if (!bulkShopId) return;

    const shop = shops.find((s) => s.id === bulkShopId);
    const newAssignments = new Map(assignments);

    servicePlan.cars.forEach((spc) => {
      const month = spc.userAssignedMonth || spc.autoAssignedMonth || servicePlan.startMonth;
      const year = spc.userAssignedYear || spc.autoAssignedYear || servicePlan.startYear;

      newAssignments.set(spc.id, {
        servicePlanCarId: spc.id,
        shopId: bulkShopId,
        plannedMonth: month,
        plannedYear: year,
        estimatedCost: shop?.baseCostPerCar || 15000,
        estimatedDays: shop?.baseTurnTime || 14,
      });
    });

    setAssignments(newAssignments);
  };

  const handleSave = () => {
    onSave(optionId, Array.from(assignments.values()));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] overflow-hidden">
        <div className="p-4 border-b border-steel-200 flex justify-between items-center">
          <h3 className="text-lg font-semibold">Configure Option: {option?.name}</h3>
          <button onClick={onClose} className="text-steel-400 hover:text-steel-600">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b border-steel-200 bg-steel-50">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-steel-700">Bulk assign all cars to:</span>
            <select
              value={bulkShopId}
              onChange={(e) => setBulkShopId(e.target.value)}
              className="px-3 py-2 border border-steel-300 rounded-md"
            >
              <option value="">Select shop...</option>
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name} ({shop.code})
                </option>
              ))}
            </select>
            <button
              onClick={handleBulkAssign}
              disabled={!bulkShopId}
              className="px-3 py-2 bg-rail-600 text-white rounded-md hover:bg-rail-700 disabled:opacity-50"
            >
              Apply to All
            </button>
          </div>
        </div>

        <div className="p-4 max-h-[50vh] overflow-y-auto">
          <table className="min-w-full divide-y divide-steel-200">
            <thead className="bg-steel-50 sticky top-0">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-steel-500 uppercase">
                  Railcar #
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-steel-500 uppercase">
                  Month
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-steel-500 uppercase">
                  Shop
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-steel-500 uppercase">
                  Est. Cost
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-200">
              {servicePlan.cars.map((spc) => {
                const assignment = assignments.get(spc.id);
                return (
                  <tr key={spc.id} className="hover:bg-steel-50">
                    <td className="px-4 py-2 text-sm font-medium text-steel-900">
                      {spc.car.railcarNumber}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-2">
                        <select
                          value={assignment?.plannedMonth || spc.autoAssignedMonth || ''}
                          onChange={(e) => {
                            const newAssignments = new Map(assignments);
                            const existing = newAssignments.get(spc.id) || {
                              servicePlanCarId: spc.id,
                              shopId: '',
                              plannedMonth: spc.autoAssignedMonth || servicePlan.startMonth,
                              plannedYear: spc.autoAssignedYear || servicePlan.startYear,
                            };
                            existing.plannedMonth = parseInt(e.target.value);
                            newAssignments.set(spc.id, existing);
                            setAssignments(newAssignments);
                          }}
                          className="px-2 py-1 border border-steel-300 rounded text-sm"
                        >
                          {MONTHS.map((m, i) => (
                            <option key={i} value={i + 1}>
                              {m}
                            </option>
                          ))}
                        </select>
                        <select
                          value={assignment?.plannedYear || spc.autoAssignedYear || ''}
                          onChange={(e) => {
                            const newAssignments = new Map(assignments);
                            const existing = newAssignments.get(spc.id) || {
                              servicePlanCarId: spc.id,
                              shopId: '',
                              plannedMonth: spc.autoAssignedMonth || servicePlan.startMonth,
                              plannedYear: spc.autoAssignedYear || servicePlan.startYear,
                            };
                            existing.plannedYear = parseInt(e.target.value);
                            newAssignments.set(spc.id, existing);
                            setAssignments(newAssignments);
                          }}
                          className="px-2 py-1 border border-steel-300 rounded text-sm w-20"
                        >
                          {[2025, 2026, 2027, 2028].map((y) => (
                            <option key={y} value={y}>
                              {y}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={assignment?.shopId || ''}
                        onChange={(e) => {
                          const shop = shops.find((s) => s.id === e.target.value);
                          const newAssignments = new Map(assignments);
                          const existing = newAssignments.get(spc.id) || {
                            servicePlanCarId: spc.id,
                            shopId: '',
                            plannedMonth: spc.autoAssignedMonth || servicePlan.startMonth,
                            plannedYear: spc.autoAssignedYear || servicePlan.startYear,
                          };
                          existing.shopId = e.target.value;
                          existing.estimatedCost = shop?.baseCostPerCar || 15000;
                          existing.estimatedDays = shop?.baseTurnTime || 14;
                          newAssignments.set(spc.id, existing);
                          setAssignments(newAssignments);
                        }}
                        className="px-2 py-1 border border-steel-300 rounded text-sm"
                      >
                        <option value="">Select shop...</option>
                        {shops.map((shop) => (
                          <option key={shop.id} value={shop.id}>
                            {shop.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-sm text-steel-500">
                      ${(assignment?.estimatedCost || 0).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-steel-200 flex justify-between items-center">
          <div className="text-sm text-steel-500">
            {assignments.size} of {servicePlan.cars.length} cars assigned
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-steel-300 rounded-md hover:bg-steel-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={assignments.size === 0 || isSaving}
              className="px-4 py-2 bg-rail-600 text-white rounded-md hover:bg-rail-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
              Save Assignments
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineGantt({
  servicePlan,
  comparison,
}: {
  servicePlan: ServicePlan;
  comparison: OptionComparisonResult;
}) {
  // Generate months for the timeline
  const months: { month: number; year: number; label: string }[] = [];
  let currentMonth = servicePlan.startMonth;
  let currentYear = servicePlan.startYear;

  while (
    currentYear < servicePlan.endYear ||
    (currentYear === servicePlan.endYear && currentMonth <= servicePlan.endMonth)
  ) {
    months.push({
      month: currentMonth,
      year: currentYear,
      label: `${MONTHS[currentMonth - 1]} ${currentYear.toString().slice(-2)}`,
    });
    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
  }

  const monthWidth = 80;
  const rowHeight = 60;
  const labelWidth = 120;

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: labelWidth + months.length * monthWidth }}>
        {/* Month Headers */}
        <div className="flex border-b border-steel-200">
          <div style={{ width: labelWidth }} className="flex-shrink-0" />
          {months.map((m, i) => (
            <div
              key={i}
              style={{ width: monthWidth }}
              className="text-center text-xs font-medium text-steel-500 py-2 border-l border-steel-100"
            >
              {m.label}
            </div>
          ))}
        </div>

        {/* Option Rows */}
        {comparison.options.map((opt, optIndex) => {
          const color = ['bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-red-500'][optIndex % 4];

          return (
            <div key={opt.id} className="flex border-b border-steel-100" style={{ height: rowHeight }}>
              <div
                style={{ width: labelWidth }}
                className="flex-shrink-0 flex items-center px-2 font-medium text-sm text-steel-700"
              >
                {opt.name}
              </div>
              <div className="flex relative">
                {months.map((m, i) => {
                  const timelineEntry = opt.timeline.find(
                    (t) => t.month === m.month && t.year === m.year
                  );

                  return (
                    <div
                      key={i}
                      style={{ width: monthWidth }}
                      className="border-l border-steel-100 flex items-center justify-center p-1"
                    >
                      {timelineEntry && timelineEntry.carCount > 0 && (
                        <div
                          className={`${color} text-white rounded px-2 py-1 text-center w-full`}
                          title={timelineEntry.shops.map((s) => `${s.shopName}: ${s.carCount}`).join('\n')}
                        >
                          <div className="text-lg font-bold">{timelineEntry.carCount}</div>
                          <div className="text-xs truncate">
                            {timelineEntry.shops.length === 1
                              ? timelineEntry.shops[0].shopName
                              : `${timelineEntry.shops.length} shops`}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
