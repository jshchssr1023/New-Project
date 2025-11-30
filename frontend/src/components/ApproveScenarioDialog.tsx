/**
 * ApproveScenarioDialog.tsx - Dialog for converting a Scenario to MasterPlan
 *
 * This component provides the "Approve Scenario" workflow that:
 * 1. Validates the scenario has assignments
 * 2. Prompts for a MasterPlan name
 * 3. Shows preview of what will be created
 * 4. Calls createMasterPlanFromScenario API
 * 5. Optionally activates the new plan immediately
 */

import { useState, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircleIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  DocumentCheckIcon,
  CalendarDaysIcon,
  BuildingStorefrontIcon,
  TruckIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';
import { useCreateMasterPlanFromScenario, useApproveMasterPlan } from '../hooks/useQueryWithCompany';
import type { Scenario } from '../types';

interface ApproveScenarioDialogProps {
  scenario: Scenario;
  isOpen: boolean;
  onClose: () => void;
  assignmentCount: number;
}

export default function ApproveScenarioDialog({
  scenario,
  isOpen,
  onClose,
  assignmentCount,
}: ApproveScenarioDialogProps) {
  const navigate = useNavigate();
  const [planName, setPlanName] = useState(
    `${scenario.projectNumber} - ${scenario.name} Plan`
  );
  const [activateImmediately, setActivateImmediately] = useState(true);
  const [step, setStep] = useState<'confirm' | 'creating' | 'success' | 'error'>('confirm');
  const [error, setError] = useState<string | null>(null);
  const [createdPlanId, setCreatedPlanId] = useState<string | null>(null);

  const createMutation = useCreateMasterPlanFromScenario();
  const approveMutation = useApproveMasterPlan();

  const handleApprove = async () => {
    if (!planName.trim()) {
      setError('Please enter a plan name');
      return;
    }

    if (assignmentCount === 0) {
      setError('This scenario has no assignments. Add assignments before approving.');
      return;
    }

    setStep('creating');
    setError(null);

    try {
      // Step 1: Create MasterPlan from Scenario
      const newPlan = await createMutation.mutateAsync({
        scenarioId: scenario.id,
        planName: planName.trim(),
      });

      setCreatedPlanId(newPlan.id);

      // Step 2: Optionally approve and activate
      if (activateImmediately) {
        await approveMutation.mutateAsync({
          id: newPlan.id,
          activate: true,
        });
      }

      setStep('success');
    } catch (err: any) {
      console.error('Failed to create master plan:', err);
      setError(err.response?.data?.message || err.message || 'Failed to create master plan');
      setStep('error');
    }
  };

  const handleClose = () => {
    setStep('confirm');
    setError(null);
    setPlanName(`${scenario.projectNumber} - ${scenario.name} Plan`);
    onClose();
  };

  const handleViewPlan = () => {
    handleClose();
    if (createdPlanId) {
      navigate(`/masterplan/${createdPlanId}`);
    } else {
      navigate('/masterplan');
    }
  };

  // Determine fiscal year from scenario name or current date
  const currentYear = new Date().getFullYear();
  const fiscalYear = scenario.projectNumber?.match(/\d{2,4}/)?.[0]
    ? parseInt(scenario.projectNumber.match(/\d{2,4}/)?.[0] || String(currentYear))
    : currentYear;

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
                    <div className={`p-2 rounded-lg ${
                      step === 'success' ? 'bg-green-100' :
                      step === 'error' ? 'bg-red-100' :
                      'bg-indigo-100'
                    }`}>
                      {step === 'success' ? (
                        <CheckCircleIcon className="h-5 w-5 text-green-600" />
                      ) : step === 'error' ? (
                        <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
                      ) : (
                        <DocumentCheckIcon className="h-5 w-5 text-indigo-600" />
                      )}
                    </div>
                    <Dialog.Title className="text-lg font-semibold text-steel-900">
                      {step === 'success' ? 'Master Plan Created' :
                       step === 'error' ? 'Error Creating Plan' :
                       step === 'creating' ? 'Creating Master Plan...' :
                       'Approve Scenario'}
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
                  {/* Confirm Step */}
                  {step === 'confirm' && (
                    <div className="space-y-4">
                      {/* Scenario Preview */}
                      <div className="bg-steel-50 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <CalendarDaysIcon className="h-5 w-5 text-steel-400 mt-0.5" />
                          <div className="flex-1">
                            <p className="font-medium text-steel-900">{scenario.name}</p>
                            <p className="text-sm text-steel-500">
                              Project: {scenario.projectNumber}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-6 mt-3 pt-3 border-t border-steel-200">
                          <div className="flex items-center gap-2">
                            <TruckIcon className="h-4 w-4 text-steel-400" />
                            <span className="text-sm text-steel-700">
                              <strong>{assignmentCount}</strong> assignments
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <BuildingStorefrontIcon className="h-4 w-4 text-steel-400" />
                            <span className="text-sm text-steel-700">
                              <strong>{scenario.cars?.length || scenario.carCount || 0}</strong> cars
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Arrow */}
                      <div className="flex justify-center">
                        <ArrowRightIcon className="h-5 w-5 text-steel-400 rotate-90" />
                      </div>

                      {/* Plan Name Input */}
                      <div>
                        <label className="block text-sm font-medium text-steel-700 mb-1">
                          Master Plan Name
                        </label>
                        <input
                          type="text"
                          value={planName}
                          onChange={(e) => setPlanName(e.target.value)}
                          className="input w-full"
                          placeholder="Enter plan name..."
                        />
                        <p className="text-xs text-steel-500 mt-1">
                          This will create FY{fiscalYear > 2000 ? fiscalYear : 2000 + fiscalYear} Master Plan
                        </p>
                      </div>

                      {/* Activate Checkbox */}
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={activateImmediately}
                          onChange={(e) => setActivateImmediately(e.target.checked)}
                          className="mt-0.5 rounded border-steel-300 text-rail-600 focus:ring-rail-500"
                        />
                        <div>
                          <span className="text-sm font-medium text-steel-900">
                            Activate immediately
                          </span>
                          <p className="text-xs text-steel-500 mt-0.5">
                            Make this the active plan for FY{fiscalYear > 2000 ? fiscalYear : 2000 + fiscalYear}.
                            Previous active plans will be archived.
                          </p>
                        </div>
                      </label>

                      {/* Error Display */}
                      {error && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                          <ExclamationTriangleIcon className="h-5 w-5 text-red-500 flex-shrink-0" />
                          <p className="text-sm text-red-700">{error}</p>
                        </div>
                      )}

                      {/* Warning for no assignments */}
                      {assignmentCount === 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                          <ExclamationTriangleIcon className="h-5 w-5 text-amber-500 flex-shrink-0" />
                          <p className="text-sm text-amber-700">
                            This scenario has no SOPAssignments. Add assignments before approving.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Creating Step */}
                  {step === 'creating' && (
                    <div className="py-8 text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rail-600 mx-auto"></div>
                      <p className="mt-4 text-steel-600">Creating your Master Plan...</p>
                      <p className="text-sm text-steel-500">
                        Converting {assignmentCount} assignments to commitments
                      </p>
                    </div>
                  )}

                  {/* Success Step */}
                  {step === 'success' && (
                    <div className="py-6 text-center">
                      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircleIcon className="h-8 w-8 text-green-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-steel-900 mb-2">
                        Master Plan Created Successfully!
                      </h3>
                      <p className="text-steel-600 mb-4">
                        {planName} has been created with {assignmentCount} commitments.
                        {activateImmediately && ' The plan is now active.'}
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
                        Failed to Create Master Plan
                      </h3>
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <p className="text-sm text-red-700">{error}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-steel-200 bg-steel-50">
                  {step === 'confirm' && (
                    <>
                      <button
                        onClick={handleClose}
                        className="btn-secondary"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleApprove}
                        disabled={assignmentCount === 0 || !planName.trim()}
                        className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <CheckCircleIcon className="h-4 w-4 mr-2" />
                        Approve & Create Plan
                      </button>
                    </>
                  )}

                  {step === 'success' && (
                    <>
                      <button
                        onClick={handleClose}
                        className="btn-secondary"
                      >
                        Close
                      </button>
                      <button
                        onClick={handleViewPlan}
                        className="btn-primary"
                      >
                        View Master Plan
                      </button>
                    </>
                  )}

                  {step === 'error' && (
                    <>
                      <button
                        onClick={handleClose}
                        className="btn-secondary"
                      >
                        Close
                      </button>
                      <button
                        onClick={() => setStep('confirm')}
                        className="btn-primary"
                      >
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
