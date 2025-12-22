/**
 * PlanCarsModal - Direct Schedule Planning Modal
 *
 * A modal for planning selected cars directly into the master schedule:
 * - Left Panel: Selected cars list with details
 * - Middle Panel: Capacity heatmap showing shop availability with capacity numbers
 * - Right Panel: Assignment form (shop, month, year selection)
 *
 * IMPORTANT: This component saves directly to CarFlowPlan (the master schedule),
 * bypassing the scenario workflow for immediate planning.
 */

import { Fragment, useState, useMemo, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  XMarkIcon,
  TruckIcon,
  BuildingStorefrontIcon,
  CalendarDaysIcon,
  CheckIcon,
  ArrowRightIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  TrashIcon,
  PlusIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import { carFlowPlanApi, capacityApi, type BulkPlanAssignment, type BulkPlanConflict } from '../../services/carFlowApi';
import { shopsApi } from '../../services/api';
import CapacityHeatmap from './CapacityHeatmap';
import type { Car, Shop } from '../../types';

interface PlanCarsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCars: Car[];
  onSuccess?: (planCount: number) => void;
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
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [assignments, setAssignments] = useState<Map<string, CarAssignment>>(new Map());
  const [step, setStep] = useState<'assign' | 'conflicts' | 'saving' | 'success'>('assign');
  const [error, setError] = useState<string | null>(null);
  const [selectedShopId, setSelectedShopId] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [bulkShopReason, setBulkShopReason] = useState('');
  const [conflicts, setConflicts] = useState<BulkPlanConflict[]>([]);

  // Fetch shops with capacity info
  const { data: shops = [] } = useQuery({
    queryKey: ['shops'],
    queryFn: () => shopsApi.getAll({ isActive: true }),
    enabled: isOpen,
  });

  // Fetch capacity data for the selected year
  const { data: capacityData } = useQuery({
    queryKey: ['capacity', selectedYear],
    queryFn: () => capacityApi.get({ year: selectedYear }),
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
      setStep('assign');
      setError(null);
      setConflicts([]);
    }
  }, [isOpen, selectedCars, currentMonth, currentYear]);

  // Enhanced error state for detailed validation errors
  const [validationErrors, setValidationErrors] = useState<{
    carId: string;
    railcarNumber?: string;
    error: string;
    code: string;
  }[]>([]);
  const [capacityWarnings, setCapacityWarnings] = useState<{
    shopId: string;
    shopName: string;
    month: string;
    currentUsage: number;
    capacity: number;
    carCount: number;
  }[]>([]);

  // Create plans mutation - saves directly to master schedule
  const saveMutation = useMutation({
    mutationFn: async (data: { assignments: BulkPlanAssignment[]; overrideConflicts: boolean }) => {
      return await carFlowPlanApi.bulkCreate(data.assignments, data.overrideConflicts);
    },
    onSuccess: (response) => {
      // Reset validation state
      setValidationErrors([]);
      setCapacityWarnings([]);

      if (!response.success && response.conflicts && response.conflicts.length > 0) {
        // Show conflicts for user to decide
        setConflicts(response.conflicts);
        setStep('conflicts');
      } else if (!response.success && response.errors && response.errors.length > 0) {
        // Show validation errors (tank car issues, etc.)
        setValidationErrors(response.errors);
        setError(`${response.errors.length} assignment(s) failed validation`);
        setStep('assign');
      } else {
        // Success - plans created
        // Store any warnings
        if (response.warnings && response.warnings.length > 0) {
          setCapacityWarnings(response.warnings);
        }
        // Store any skipped assignments
        if (response.skipped && response.skipped.length > 0) {
          setValidationErrors(response.skipped);
        }

        queryClient.invalidateQueries({ queryKey: ['car-flow-plans'] });
        queryClient.invalidateQueries({ queryKey: ['cars'] });
        queryClient.invalidateQueries({ queryKey: ['capacity'] });
        setStep('success');
        setTimeout(() => {
          onSuccess?.(response.plansCreated || 0);
          onClose();
        }, 2000);
      }
    },
    onError: (err: any) => {
      // Try to extract detailed error information
      const errorData = err.response?.data;
      if (errorData?.errors && Array.isArray(errorData.errors)) {
        setValidationErrors(errorData.errors);
        setError(errorData.message || 'Validation failed');
      } else if (errorData?.message) {
        setError(errorData.message);
      } else {
        setError(err.message || 'Failed to save to schedule');
      }
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

  // Get capacity info for selected shop/month
  const selectedShopCapacity = useMemo(() => {
    if (!selectedShopId || !capacityData) return null;
    const shopCapacity = capacityData.capacity.find((c: any) => c.shopId === selectedShopId);
    if (!shopCapacity) return null;
    const monthData = shopCapacity.months[selectedMonth];
    return monthData || null;
  }, [selectedShopId, selectedMonth, capacityData]);

  // Handle save to schedule
  const handleSave = (overrideConflicts: boolean = false) => {
    if (assignedCount === 0) {
      setError('Please assign at least one car to a shop');
      return;
    }

    setStep('saving');
    setError(null);

    const assignmentData: BulkPlanAssignment[] = Array.from(assignments.values())
      .filter((a) => a.shopId)
      .map((a) => ({
        carId: a.carId,
        shopId: a.shopId!,
        plannedMonth: a.plannedMonth,
        plannedYear: a.plannedYear,
        shopReason: a.shopReason || undefined,
      }));

    saveMutation.mutate({
      assignments: assignmentData,
      overrideConflicts,
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

  const selectedShop = selectedShopId ? getShop(selectedShopId) : null;

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
                <div className="flex items-center justify-between px-6 py-4 border-b border-steel-200 bg-gradient-to-r from-crimson-50 to-white">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-crimson-100">
                      <CalendarDaysIcon className="h-5 w-5 text-crimson-600" />
                    </div>
                    <div>
                      <Dialog.Title className="text-lg font-semibold text-steel-900">
                        Plan Selected Cars to Schedule
                      </Dialog.Title>
                      <p className="text-sm text-steel-500">
                        {selectedCars.length} cars selected &middot; {assignedCount} assigned &middot; Saves directly to master schedule
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

                {/* Content - Assignment Step */}
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
                              className={`p-3 rounded-lg mb-2 border transition-colors ${
                                assignment?.shopId
                                  ? 'bg-green-50 border-green-200'
                                  : 'bg-white border-steel-200 hover:border-steel-300'
                              }`}
                            >
                              <div className="flex items-start justify-between">
                                <div>
                                  <span className="font-mono font-medium text-steel-900">
                                    {car.railcarNumber}
                                  </span>
                                  <p className="text-xs text-steel-500 mt-0.5">
                                    {car.carType || 'Unknown Type'} &middot; {car.customer || 'No customer'}
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
                                <div className="mt-2 text-xs bg-green-100 rounded p-2">
                                  <div className="flex items-center gap-1 text-green-700 font-medium">
                                    <BuildingStorefrontIcon className="h-3.5 w-3.5" />
                                    <span>{shop.name}</span>
                                  </div>
                                  <div className="text-green-600 mt-0.5">
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
                          Shop Capacity Overview
                        </h3>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSelectedYear((y) => y - 1)}
                            className="px-2 py-1 text-sm text-steel-600 hover:bg-steel-200 rounded"
                          >
                            &larr;
                          </button>
                          <span className="text-sm font-medium text-steel-900 bg-white px-3 py-1 rounded border">
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
                          Assign Cars to Shop
                        </h3>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {/* Shop Select */}
                        <div>
                          <label className="block text-sm font-medium text-steel-700 mb-1">
                            Select Shop
                          </label>
                          <select
                            value={selectedShopId}
                            onChange={(e) => setSelectedShopId(e.target.value)}
                            className="input w-full"
                          >
                            <option value="">Choose a shop...</option>
                            {shops.map((shop: Shop) => (
                              <option key={shop.id} value={shop.id}>
                                {shop.name} - {shop.city}, {shop.state}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Shop Capacity Info */}
                        {selectedShop && (
                          <div className="bg-steel-50 p-3 rounded-lg border border-steel-200">
                            <h4 className="text-sm font-medium text-steel-800 mb-2">
                              {selectedShop.name}
                            </h4>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-steel-500">Monthly Capacity:</span>
                                <span className="ml-1 font-medium">{selectedShop.capacity}/mo</span>
                              </div>
                              <div>
                                <span className="text-steel-500">Cost/Car:</span>
                                <span className="ml-1 font-medium">${selectedShop.baseCostPerCar?.toLocaleString()}</span>
                              </div>
                            </div>
                            {selectedShopCapacity && (
                              <div className="mt-2 pt-2 border-t border-steel-200">
                                <div className="flex justify-between text-xs">
                                  <span className="text-steel-500">{MONTHS[selectedMonth - 1]} Availability:</span>
                                  <span className={`font-medium ${
                                    selectedShopCapacity.available > 0 ? 'text-green-600' : 'text-red-600'
                                  }`}>
                                    {selectedShopCapacity.available} slots
                                  </span>
                                </div>
                                <div className="mt-1 bg-steel-200 rounded-full h-2">
                                  <div
                                    className={`h-2 rounded-full ${
                                      selectedShopCapacity.planned / selectedShopCapacity.committed > 0.9
                                        ? 'bg-red-500'
                                        : selectedShopCapacity.planned / selectedShopCapacity.committed > 0.7
                                          ? 'bg-amber-500'
                                          : 'bg-green-500'
                                    }`}
                                    style={{ width: `${Math.min(100, (selectedShopCapacity.planned / selectedShopCapacity.committed) * 100)}%` }}
                                  />
                                </div>
                                <div className="text-xs text-steel-500 mt-1">
                                  {selectedShopCapacity.planned} of {selectedShopCapacity.committed} committed slots used
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Month/Year */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-sm font-medium text-steel-700 mb-1">
                              Month
                            </label>
                            <select
                              value={selectedMonth}
                              onChange={(e) => setSelectedMonth(Number(e.target.value))}
                              className="input w-full"
                            >
                              {MONTHS.map((month, idx) => (
                                <option key={idx} value={idx + 1}>
                                  {month}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-steel-700 mb-1">
                              Year
                            </label>
                            <select
                              value={selectedYear}
                              onChange={(e) => setSelectedYear(Number(e.target.value))}
                              className="input w-full"
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
                        <div>
                          <label className="block text-sm font-medium text-steel-700 mb-1">
                            Shop Reason (optional)
                          </label>
                          <input
                            type="text"
                            value={bulkShopReason}
                            onChange={(e) => setBulkShopReason(e.target.value)}
                            className="input w-full"
                            placeholder="e.g., Tank Qual, Safety Relief..."
                          />
                        </div>

                        {/* Bulk Assign Button */}
                        <button
                          onClick={bulkAssign}
                          disabled={!selectedShopId || unassignedCount === 0}
                          className="w-full bg-crimson-600 hover:bg-crimson-700 text-white font-medium py-2.5 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                        >
                          <ArrowRightIcon className="h-4 w-4 mr-2" />
                          Assign {unassignedCount} Unassigned Cars
                        </button>

                        <hr className="border-steel-200" />

                        {/* Stats */}
                        <div className="bg-steel-50 p-3 rounded-lg space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-steel-600">✓ Assigned</span>
                            <span className="font-medium text-green-600">{assignedCount} cars</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-steel-600">○ Unassigned</span>
                            <span className="font-medium text-amber-600">{unassignedCount} cars</span>
                          </div>
                        </div>

                        {/* Error Display */}
                        {error && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                            <div className="flex items-start gap-2">
                              <ExclamationTriangleIcon className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                              <div className="flex-1">
                                <p className="text-sm font-medium text-red-700">{error}</p>
                                {/* Detailed validation errors */}
                                {validationErrors.length > 0 && (
                                  <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                                    {validationErrors.map((err, idx) => (
                                      <div
                                        key={idx}
                                        className={`text-xs p-2 rounded ${
                                          err.code === 'TANK_CAR_INVALID_SHOP'
                                            ? 'bg-red-100 text-red-800 border border-red-200'
                                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                                        }`}
                                      >
                                        <span className="font-mono font-medium">{err.railcarNumber || err.carId}</span>
                                        <span className="ml-2">{err.error}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Capacity Warnings */}
                        {capacityWarnings.length > 0 && (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <div className="flex items-start gap-2">
                              <ExclamationTriangleIcon className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                              <div className="flex-1">
                                <p className="text-sm font-medium text-amber-700">Capacity Warnings</p>
                                <div className="mt-2 space-y-1">
                                  {capacityWarnings.map((warning, idx) => (
                                    <div key={idx} className="text-xs text-amber-800">
                                      <span className="font-medium">{warning.shopName}</span>
                                      <span> ({warning.month}): </span>
                                      <span>Adding {warning.carCount} cars exceeds capacity ({warning.currentUsage + warning.carCount}/{warning.capacity})</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Conflicts Step */}
                {step === 'conflicts' && (
                  <div className="flex-1 overflow-auto p-6">
                    <div className="max-w-2xl mx-auto">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 rounded-full bg-amber-100">
                          <ExclamationCircleIcon className="h-8 w-8 text-amber-600" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-steel-900">
                            Some Cars Already Have Plans
                          </h3>
                          <p className="text-sm text-steel-500">
                            {conflicts.length} cars are already scheduled. Would you like to replace their existing plans?
                          </p>
                        </div>
                      </div>

                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                        <h4 className="font-medium text-amber-800 mb-3">Existing Plans:</h4>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {conflicts.map((conflict) => (
                            <div key={conflict.carId} className="flex items-center justify-between bg-white p-2 rounded border border-amber-100">
                              <div>
                                <span className="font-mono font-medium text-steel-900">
                                  {conflict.railcarNumber}
                                </span>
                              </div>
                              <div className="text-sm text-steel-600">
                                {conflict.existingShop} &middot; {conflict.existingMonth}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={() => {
                            setStep('assign');
                            setConflicts([]);
                          }}
                          className="flex-1 btn-secondary"
                        >
                          Go Back & Modify
                        </button>
                        <button
                          onClick={() => handleSave(true)}
                          className="flex-1 bg-crimson-600 hover:bg-crimson-700 text-white font-medium py-2 px-4 rounded-lg"
                        >
                          Replace Existing Plans
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Saving State */}
                {step === 'saving' && (
                  <div className="flex-1 flex items-center justify-center py-12">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-crimson-600 mx-auto"></div>
                      <p className="mt-4 text-steel-600 font-medium">Saving to Schedule...</p>
                      <p className="text-sm text-steel-500">
                        Adding {assignedCount} car assignments to the master plan
                      </p>
                    </div>
                  </div>
                )}

                {/* Success State */}
                {step === 'success' && (
                  <div className="flex-1 flex items-center justify-center py-12">
                    <div className="text-center">
                      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircleIcon className="h-10 w-10 text-green-600" />
                      </div>
                      <h3 className="text-xl font-semibold text-steel-900 mb-2">
                        Successfully Saved to Schedule!
                      </h3>
                      <p className="text-steel-600">
                        {assignedCount} cars have been added to the master plan.
                      </p>
                      <p className="text-sm text-steel-500 mt-2">
                        Redirecting...
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
                        Click on capacity cells to select shop and month, then assign cars
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={onClose}
                        disabled={saveMutation.isPending}
                        className="btn-secondary disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSave(false)}
                        disabled={assignedCount === 0 || saveMutation.isPending}
                        className="bg-crimson-600 hover:bg-crimson-700 text-white font-medium py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
                      >
                        {saveMutation.isPending ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <CheckIcon className="h-4 w-4 mr-2" />
                            Save {assignedCount} to Schedule
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
