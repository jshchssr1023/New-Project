/**
 * PlanCarsModal - Three-Panel Master Plan Modal
 *
 * A modal for planning selected cars into shop capacity:
 * - Left Panel: Selected cars list with details
 * - Middle Panel: Capacity heatmap showing shop availability
 * - Right Panel: Assignment form (shop, month, year selection)
 */

import { Fragment, useState, useMemo, useEffect } from 'react';
import { Dialog, Transition, Listbox } from '@headlessui/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  XMarkIcon,
  TruckIcon,
  BuildingStorefrontIcon,
  CalendarDaysIcon,
  CheckIcon,
  ChevronUpDownIcon,
  ArrowRightIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  TrashIcon,
  PlusIcon,
  BeakerIcon,
} from '@heroicons/react/24/outline';
import { scenarioApi, capacityApi, customersApi } from '../../services/carFlowApi';
import { shopsApi } from '../../services/api';
import CapacityHeatmap from './CapacityHeatmap';
import type { Car, Shop } from '../../types';
import type { ScenarioCarAssignment, CreateScenarioRequest } from '../../types/carFlow';

interface PlanCarsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCars: Car[];
  onSuccess?: (scenarioId: string) => void;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface CarAssignment {
  carId: string;
  shopId: string | null;
  plannedMonth: number;
  plannedYear: number;
  shopReason: string;
}

export default function PlanCarsModal({
  isOpen,
  onClose,
  selectedCars,
  onSuccess,
}: PlanCarsModalProps) {
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // Form state
  const [scenarioName, setScenarioName] = useState('');
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [assignments, setAssignments] = useState<Map<string, CarAssignment>>(new Map());
  const [step, setStep] = useState<'assign' | 'review' | 'creating' | 'success'>('assign');
  const [error, setError] = useState<string | null>(null);
  const [selectedShopId, setSelectedShopId] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [bulkShopReason, setBulkShopReason] = useState('');

  // Fetch shops
  const { data: shops = [] } = useQuery({
    queryKey: ['shops'],
    queryFn: () => shopsApi.getAll({ isActive: true }),
    enabled: isOpen,
  });

  // Initialize assignments when cars change
  useEffect(() => {
    if (isOpen) {
      const newAssignments = new Map<string, CarAssignment>();
      selectedCars.forEach((car) => {
        newAssignments.set(car.id, {
          carId: car.id,
          shopId: null,
          plannedMonth: currentMonth,
          plannedYear: currentYear,
          shopReason: '',
        });
      });
      setAssignments(newAssignments);
      setScenarioName(`Planning Scenario - ${new Date().toLocaleDateString()}`);
      setStep('assign');
      setError(null);
    }
  }, [isOpen, selectedCars, currentMonth, currentYear]);

  // Create scenario mutation
  const createMutation = useMutation({
    mutationFn: async (data: { name: string; assignments: ScenarioCarAssignment[] }) => {
      const scenario = await scenarioApi.create({
        name: data.name,
        carIds: selectedCars.map((c) => c.id),
      });

      // Add car assignments to scenario
      if (data.assignments.length > 0) {
        await scenarioApi.addCars(scenario.id, data.assignments);
      }

      return scenario;
    },
    onSuccess: (scenario) => {
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      setStep('success');
      setTimeout(() => {
        onSuccess?.(scenario.id);
        onClose();
      }, 2000);
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to create scenario');
      setStep('assign');
    },
  });

  // Update a single car assignment
  const updateAssignment = (carId: string, updates: Partial<CarAssignment>) => {
    setAssignments((prev) => {
      const newMap = new Map(prev);
      const current = newMap.get(carId);
      if (current) {
        newMap.set(carId, { ...current, ...updates });
      }
      return newMap;
    });
  };

  // Bulk assign all unassigned cars
  const bulkAssign = () => {
    if (!selectedShopId) return;

    setAssignments((prev) => {
      const newMap = new Map(prev);
      newMap.forEach((assignment, carId) => {
        if (!assignment.shopId) {
          newMap.set(carId, {
            ...assignment,
            shopId: selectedShopId,
            plannedMonth: selectedMonth,
            plannedYear: selectedYear,
            shopReason: bulkShopReason,
          });
        }
      });
      return newMap;
    });
  };

  // Calculate stats
  const assignedCount = useMemo(() => {
    return Array.from(assignments.values()).filter((a) => a.shopId).length;
  }, [assignments]);

  const unassignedCount = selectedCars.length - assignedCount;

  // Handle create
  const handleCreate = () => {
    if (!scenarioName.trim()) {
      setError('Please enter a scenario name');
      return;
    }

    if (assignedCount === 0) {
      setError('Please assign at least one car to a shop');
      return;
    }

    setStep('creating');
    setError(null);

    const assignmentData: ScenarioCarAssignment[] = Array.from(assignments.values())
      .filter((a) => a.shopId)
      .map((a) => ({
        carId: a.carId,
        shopId: a.shopId!,
        plannedMonth: a.plannedMonth,
        plannedYear: a.plannedYear,
        shopReason: a.shopReason || undefined,
      }));

    createMutation.mutate({
      name: scenarioName.trim(),
      assignments: assignmentData,
    });
  };

  // Get shop by ID
  const getShop = (shopId: string): Shop | undefined => {
    return shops.find((s: Shop) => s.id === shopId);
  };

  // Highlighted capacity cells
  const highlightedCells = useMemo(() => {
    return Array.from(assignments.values())
      .filter((a) => a.shopId)
      .map((a) => ({ shopId: a.shopId!, month: a.plannedMonth }));
  }, [assignments]);

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-hidden">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-6xl transform overflow-hidden rounded-xl bg-white shadow-2xl transition-all max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-steel-200 bg-steel-50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-rail-100">
                      <CalendarDaysIcon className="h-5 w-5 text-rail-600" />
                    </div>
                    <div>
                      <Dialog.Title className="text-lg font-semibold text-steel-900">
                        Plan Selected Cars
                      </Dialog.Title>
                      <p className="text-sm text-steel-500">
                        {selectedCars.length} cars selected &middot; {assignedCount} assigned
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="text-steel-400 hover:text-steel-600 transition-colors"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                {/* Content */}
                {step === 'assign' && (
                  <div className="flex-1 overflow-hidden flex">
                    {/* Left Panel - Car List */}
                    <div className="w-80 flex-shrink-0 border-r border-steel-200 flex flex-col">
                      <div className="p-4 border-b border-steel-200 bg-steel-50">
                        <h3 className="font-medium text-steel-900 flex items-center gap-2">
                          <TruckIcon className="h-4 w-4" />
                          Selected Cars ({selectedCars.length})
                        </h3>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2">
                        {selectedCars.map((car) => {
                          const assignment = assignments.get(car.id);
                          const shop = assignment?.shopId
                            ? getShop(assignment.shopId)
                            : null;

                          return (
                            <div
                              key={car.id}
                              className={`p-3 rounded-lg mb-2 border ${
                                assignment?.shopId
                                  ? 'bg-green-50 border-green-200'
                                  : 'bg-white border-steel-200'
                              }`}
                            >
                              <div className="flex items-start justify-between">
                                <div>
                                  <span className="font-mono font-medium text-steel-900">
                                    {car.railcarNumber}
                                  </span>
                                  <p className="text-xs text-steel-500 mt-0.5">
                                    {car.customer || 'No customer'}
                                  </p>
                                </div>
                                {assignment?.shopId && (
                                  <button
                                    onClick={() =>
                                      updateAssignment(car.id, {
                                        shopId: null,
                                        shopReason: '',
                                      })
                                    }
                                    className="p-1 text-steel-400 hover:text-red-500"
                                    title="Remove assignment"
                                  >
                                    <TrashIcon className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                              {shop && (
                                <div className="mt-2 text-xs">
                                  <div className="flex items-center gap-1 text-green-700">
                                    <BuildingStorefrontIcon className="h-3.5 w-3.5" />
                                    <span>{shop.name}</span>
                                  </div>
                                  <div className="text-green-600">
                                    {MONTHS[assignment!.plannedMonth - 1]} {assignment!.plannedYear}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Middle Panel - Capacity */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                      <div className="p-4 border-b border-steel-200 bg-steel-50 flex items-center justify-between">
                        <h3 className="font-medium text-steel-900 flex items-center gap-2">
                          <BuildingStorefrontIcon className="h-4 w-4" />
                          Shop Capacity
                        </h3>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSelectedYear((y) => y - 1)}
                            className="px-2 py-1 text-sm text-steel-600 hover:bg-steel-200 rounded"
                          >
                            &larr;
                          </button>
                          <span className="text-sm font-medium text-steel-900">
                            {selectedYear}
                          </span>
                          <button
                            onClick={() => setSelectedYear((y) => y + 1)}
                            className="px-2 py-1 text-sm text-steel-600 hover:bg-steel-200 rounded"
                          >
                            &rarr;
                          </button>
                        </div>
                      </div>
                      <div className="flex-1 overflow-auto p-4">
                        <CapacityHeatmap
                          year={selectedYear}
                          compact
                          highlightedCells={highlightedCells}
                          onCellClick={(shopId, month) => {
                            setSelectedShopId(shopId);
                            setSelectedMonth(month);
                          }}
                        />
                      </div>
                    </div>

                    {/* Right Panel - Assignment Form */}
                    <div className="w-80 flex-shrink-0 border-l border-steel-200 flex flex-col">
                      <div className="p-4 border-b border-steel-200 bg-steel-50">
                        <h3 className="font-medium text-steel-900 flex items-center gap-2">
                          <PlusIcon className="h-4 w-4" />
                          Quick Assign
                        </h3>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {/* Scenario Name */}
                        <div>
                          <label className="block text-sm font-medium text-steel-700 mb-1">
                            Scenario Name
                          </label>
                          <input
                            type="text"
                            value={scenarioName}
                            onChange={(e) => setScenarioName(e.target.value)}
                            className="input w-full"
                            placeholder="Enter scenario name..."
                          />
                        </div>

                        <hr className="border-steel-200" />

                        {/* Bulk Assignment */}
                        <div className="bg-rail-50 p-4 rounded-lg border border-rail-200">
                          <h4 className="text-sm font-medium text-rail-800 mb-3">
                            Assign {unassignedCount} Unassigned Cars
                          </h4>

                          {/* Shop Select */}
                          <div className="mb-3">
                            <label className="block text-xs font-medium text-steel-600 mb-1">
                              Shop
                            </label>
                            <select
                              value={selectedShopId}
                              onChange={(e) => setSelectedShopId(e.target.value)}
                              className="input w-full text-sm"
                            >
                              <option value="">Select shop...</option>
                              {shops.map((shop: Shop) => (
                                <option key={shop.id} value={shop.id}>
                                  {shop.name} - {shop.city}, {shop.state}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Month/Year */}
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            <div>
                              <label className="block text-xs font-medium text-steel-600 mb-1">
                                Month
                              </label>
                              <select
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                                className="input w-full text-sm"
                              >
                                {MONTHS.map((month, idx) => (
                                  <option key={idx} value={idx + 1}>
                                    {month}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-steel-600 mb-1">
                                Year
                              </label>
                              <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(Number(e.target.value))}
                                className="input w-full text-sm"
                              >
                                {[currentYear, currentYear + 1, currentYear + 2].map((y) => (
                                  <option key={y} value={y}>
                                    {y}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {/* Shop Reason */}
                          <div className="mb-3">
                            <label className="block text-xs font-medium text-steel-600 mb-1">
                              Shop Reason (optional)
                            </label>
                            <input
                              type="text"
                              value={bulkShopReason}
                              onChange={(e) => setBulkShopReason(e.target.value)}
                              className="input w-full text-sm"
                              placeholder="e.g., Tank Qual, Safety..."
                            />
                          </div>

                          <button
                            onClick={bulkAssign}
                            disabled={!selectedShopId || unassignedCount === 0}
                            className="w-full btn-primary text-sm disabled:opacity-50"
                          >
                            <ArrowRightIcon className="h-4 w-4 mr-2" />
                            Assign {unassignedCount} Cars
                          </button>
                        </div>

                        {/* Stats */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-steel-600">Assigned</span>
                            <span className="font-medium text-green-600">{assignedCount}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-steel-600">Unassigned</span>
                            <span className="font-medium text-amber-600">{unassignedCount}</span>
                          </div>
                        </div>

                        {/* Error Display */}
                        {error && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                            <ExclamationTriangleIcon className="h-5 w-5 text-red-500 flex-shrink-0" />
                            <p className="text-sm text-red-700">{error}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Creating State */}
                {step === 'creating' && (
                  <div className="flex-1 flex items-center justify-center py-12">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rail-600 mx-auto"></div>
                      <p className="mt-4 text-steel-600">Creating scenario...</p>
                      <p className="text-sm text-steel-500">
                        Adding {assignedCount} car assignments
                      </p>
                    </div>
                  </div>
                )}

                {/* Success State */}
                {step === 'success' && (
                  <div className="flex-1 flex items-center justify-center py-12">
                    <div className="text-center">
                      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckIcon className="h-8 w-8 text-green-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-steel-900 mb-2">
                        Scenario Created!
                      </h3>
                      <p className="text-steel-600">
                        {assignedCount} cars have been assigned to shops.
                      </p>
                    </div>
                  </div>
                )}

                {/* Footer */}
                {step === 'assign' && (
                  <div className="flex items-center justify-between px-6 py-4 border-t border-steel-200 bg-steel-50">
                    <div className="flex items-center gap-2 text-sm text-steel-500">
                      <InformationCircleIcon className="h-4 w-4" />
                      <span>
                        Click on capacity cells to select shop and month
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={onClose}
                        disabled={createMutation.isPending}
                        className="btn-secondary disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleCreate}
                        disabled={assignedCount === 0 || !scenarioName.trim() || createMutation.isPending}
                        className="btn-primary disabled:opacity-50 flex items-center"
                      >
                        {createMutation.isPending ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                            Creating...
                          </>
                        ) : (
                          <>
                            <BeakerIcon className="h-4 w-4 mr-2" />
                            Create Scenario
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
