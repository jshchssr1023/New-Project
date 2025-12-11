/**
 * ConfirmScenarioDialog - Dialog for confirming a scenario and creating Car Flow Plans
 *
 * This component implements the confirmation workflow:
 * 1. Shows summary of what will be committed
 * 2. Checks for conflicts with existing plans
 * 3. Requires user to type "CONFIRM" to proceed
 * 4. Creates Car Flow Plans from scenario cars
 */

import { Fragment, useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  XMarkIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  TruckIcon,
  BuildingStorefrontIcon,
  CalendarDaysIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { scenarioApi } from '../../services/carFlowApi';
import type { Scenario, CarFlowConflict, ConfirmScenarioResponse } from '../../types/carFlow';

interface ConfirmScenarioDialogProps {
  scenario: Scenario;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type Step = 'summary' | 'confirm' | 'processing' | 'success' | 'error';

export default function ConfirmScenarioDialog({
  scenario,
  isOpen,
  onClose,
  onSuccess,
}: ConfirmScenarioDialogProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('summary');
  const [confirmText, setConfirmText] = useState('');
  const [conflicts, setConflicts] = useState<CarFlowConflict[]>([]);
  const [result, setResult] = useState<ConfirmScenarioResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overrideConflicts, setOverrideConflicts] = useState(false);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setStep('summary');
      setConfirmText('');
      setConflicts([]);
      setResult(null);
      setError(null);
      setOverrideConflicts(false);
    }
  }, [isOpen]);

  // Fetch scenario details with cars
  const { data: scenarioDetails } = useQuery({
    queryKey: ['scenario', scenario.id],
    queryFn: () => scenarioApi.getById(scenario.id),
    enabled: isOpen,
  });

  // Confirm mutation
  const confirmMutation = useMutation({
    mutationFn: (override: boolean) => scenarioApi.confirm(scenario.id, override),
    onSuccess: (response) => {
      if (response.conflicts && response.conflicts.length > 0 && !overrideConflicts) {
        // Show conflicts and ask for override
        setConflicts(response.conflicts);
        setStep('confirm');
      } else if (response.scenario?.status === 'confirmed') {
        // Success!
        setResult(response);
        setStep('success');
        queryClient.invalidateQueries({ queryKey: ['scenarios'] });
        queryClient.invalidateQueries({ queryKey: ['car-flow-plans'] });
        queryClient.invalidateQueries({ queryKey: ['capacity'] });
      }
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to confirm scenario');
      setStep('error');
    },
  });

  const handleProceed = () => {
    if (confirmText.toUpperCase() !== 'CONFIRM') return;
    setStep('processing');
    confirmMutation.mutate(overrideConflicts);
  };

  const handleOverrideAndConfirm = () => {
    setOverrideConflicts(true);
    setStep('processing');
    confirmMutation.mutate(true);
  };

  const handleClose = () => {
    if (step === 'success') {
      onSuccess?.();
    }
    onClose();
  };

  const carCount = scenarioDetails?.cars?.length || scenario._count?.cars || 0;
  const shopCount = new Set(scenarioDetails?.cars?.map((c) => c.shopId)).size || 0;

  // Group cars by month for summary
  const carsByMonth = scenarioDetails?.cars?.reduce(
    (acc, car) => {
      const key = `${car.plannedYear}-${String(car.plannedMonth).padStart(2, '0')}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(car);
      return acc;
    },
    {} as Record<string, typeof scenarioDetails.cars>
  ) || {};

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
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
              <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-xl bg-white shadow-xl transition-all">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-steel-200">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${
                        step === 'success'
                          ? 'bg-green-100'
                          : step === 'error'
                          ? 'bg-red-100'
                          : conflicts.length > 0
                          ? 'bg-amber-100'
                          : 'bg-indigo-100'
                      }`}
                    >
                      {step === 'success' ? (
                        <CheckCircleIcon className="h-5 w-5 text-green-600" />
                      ) : step === 'error' ? (
                        <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
                      ) : conflicts.length > 0 ? (
                        <ExclamationTriangleIcon className="h-5 w-5 text-amber-600" />
                      ) : (
                        <ShieldCheckIcon className="h-5 w-5 text-indigo-600" />
                      )}
                    </div>
                    <Dialog.Title className="text-lg font-semibold text-steel-900">
                      {step === 'success'
                        ? 'Scenario Confirmed'
                        : step === 'error'
                        ? 'Confirmation Failed'
                        : conflicts.length > 0
                        ? 'Conflicts Detected'
                        : 'Confirm Scenario'}
                    </Dialog.Title>
                  </div>
                  <button
                    onClick={handleClose}
                    className="text-steel-400 hover:text-steel-600 transition-colors"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                {/* Content */}
                <div className="px-6 py-4">
                  {/* Summary Step */}
                  {step === 'summary' && (
                    <div className="space-y-4">
                      {/* Scenario Info */}
                      <div className="bg-steel-50 rounded-lg p-4">
                        <h4 className="font-medium text-steel-900">{scenario.name}</h4>
                        {scenario.projectNumber && (
                          <p className="text-sm text-steel-500 font-mono">
                            {scenario.projectNumber}
                          </p>
                        )}

                        <div className="flex items-center gap-6 mt-3 pt-3 border-t border-steel-200">
                          <div className="flex items-center gap-2">
                            <TruckIcon className="h-4 w-4 text-steel-400" />
                            <span className="text-sm text-steel-700">
                              <strong>{carCount}</strong> cars
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <BuildingStorefrontIcon className="h-4 w-4 text-steel-400" />
                            <span className="text-sm text-steel-700">
                              <strong>{shopCount}</strong> shops
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Monthly Breakdown */}
                      {Object.keys(carsByMonth).length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-steel-700 mb-2 flex items-center gap-2">
                            <CalendarDaysIcon className="h-4 w-4" />
                            Monthly Breakdown
                          </h4>
                          <div className="grid grid-cols-3 gap-2">
                            {Object.entries(carsByMonth)
                              .sort(([a], [b]) => a.localeCompare(b))
                              .slice(0, 6)
                              .map(([month, cars]) => (
                                <div
                                  key={month}
                                  className="bg-rail-50 rounded-lg p-2 text-center border border-rail-200"
                                >
                                  <div className="text-xs text-steel-500">{month}</div>
                                  <div className="text-lg font-semibold text-rail-700">
                                    {cars?.length || 0}
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}

                      {/* Warning */}
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                        <InformationCircleIcon className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-amber-800">
                          <p className="font-medium">This action will:</p>
                          <ul className="list-disc list-inside mt-1 text-amber-700">
                            <li>Create {carCount} Car Flow Plan commitments</li>
                            <li>Reserve shop capacity for planned months</li>
                            <li>Mark this scenario as "Confirmed"</li>
                          </ul>
                        </div>
                      </div>

                      {/* Confirm Input */}
                      <div>
                        <label className="block text-sm font-medium text-steel-700 mb-1">
                          Type <span className="font-mono bg-steel-100 px-1">CONFIRM</span> to proceed
                        </label>
                        <input
                          type="text"
                          value={confirmText}
                          onChange={(e) => setConfirmText(e.target.value)}
                          className="input w-full font-mono"
                          placeholder="CONFIRM"
                          autoComplete="off"
                        />
                      </div>
                    </div>
                  )}

                  {/* Conflicts Step */}
                  {step === 'confirm' && conflicts.length > 0 && (
                    <div className="space-y-4">
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <p className="text-sm text-amber-800 font-medium">
                          {conflicts.length} car(s) already have existing Car Flow Plans
                        </p>
                        <p className="text-xs text-amber-700 mt-1">
                          Proceeding will override these existing plans.
                        </p>
                      </div>

                      <div className="max-h-48 overflow-y-auto space-y-2">
                        {conflicts.map((conflict) => (
                          <div
                            key={conflict.carId}
                            className="flex items-center justify-between p-2 bg-steel-50 rounded border border-steel-200"
                          >
                            <div>
                              <span className="font-mono text-sm font-medium">
                                {conflict.railcarNumber}
                              </span>
                              <span className="text-xs text-steel-500 ml-2">
                                @ {conflict.shopName}
                              </span>
                            </div>
                            <span className="text-xs text-steel-500">
                              {conflict.plannedMonth}/{conflict.plannedYear}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <p className="text-sm text-red-700">
                          Are you sure you want to override these existing plans?
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Processing Step */}
                  {step === 'processing' && (
                    <div className="py-8 text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rail-600 mx-auto"></div>
                      <p className="mt-4 text-steel-600">Confirming scenario...</p>
                      <p className="text-sm text-steel-500">
                        Creating {carCount} Car Flow Plan commitments
                      </p>
                    </div>
                  )}

                  {/* Success Step */}
                  {step === 'success' && result && (
                    <div className="py-6 text-center">
                      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircleIcon className="h-8 w-8 text-green-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-steel-900 mb-2">
                        Scenario Confirmed!
                      </h3>
                      <p className="text-steel-600">
                        {result.plansCreated} Car Flow Plan(s) have been created.
                      </p>
                    </div>
                  )}

                  {/* Error Step */}
                  {step === 'error' && (
                    <div className="py-6">
                      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <ExclamationTriangleIcon className="h-8 w-8 text-red-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-steel-900 mb-2 text-center">
                        Confirmation Failed
                      </h3>
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <p className="text-sm text-red-700">{error}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-steel-200 bg-steel-50">
                  {step === 'summary' && (
                    <>
                      <button onClick={handleClose} className="btn-secondary">
                        Cancel
                      </button>
                      <button
                        onClick={handleProceed}
                        disabled={confirmText.toUpperCase() !== 'CONFIRM'}
                        className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ShieldCheckIcon className="h-4 w-4 mr-2" />
                        Confirm Scenario
                      </button>
                    </>
                  )}

                  {step === 'confirm' && conflicts.length > 0 && (
                    <>
                      <button onClick={handleClose} className="btn-secondary">
                        Cancel
                      </button>
                      <button
                        onClick={handleOverrideAndConfirm}
                        className="btn-primary bg-amber-600 hover:bg-amber-700"
                      >
                        <ExclamationTriangleIcon className="h-4 w-4 mr-2" />
                        Override & Confirm
                      </button>
                    </>
                  )}

                  {step === 'success' && (
                    <button onClick={handleClose} className="btn-primary">
                      Done
                    </button>
                  )}

                  {step === 'error' && (
                    <>
                      <button onClick={handleClose} className="btn-secondary">
                        Close
                      </button>
                      <button onClick={() => setStep('summary')} className="btn-primary">
                        Try Again
                      </button>
                    </>
                  )}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
