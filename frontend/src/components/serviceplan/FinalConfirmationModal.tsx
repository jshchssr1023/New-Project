/**
 * FinalConfirmationModal.tsx - Final Plan Confirmation Dialog
 *
 * Story 5: Final Plan Confirmation
 * Provides a deliberate confirmation step before:
 * - Sending confirmed cars to Master Schedule
 * - Locking the plan structure
 * - Archiving other draft plans for the same customer
 */

import { Fragment, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import {
  XMarkIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  RocketLaunchIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';
import { servicePlansApi, FinalConfirmationResult, ConfirmationSummary } from '../../services/api/servicePlans';

interface FinalConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  servicePlanId: string;
  summary: ConfirmationSummary | null;
  onConfirmationComplete: (result: FinalConfirmationResult) => void;
}

export default function FinalConfirmationModal({
  isOpen,
  onClose,
  servicePlanId,
  summary,
  onConfirmationComplete,
}: FinalConfirmationModalProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationChecked, setConfirmationChecked] = useState(false);

  const handleFinalConfirm = async () => {
    if (!confirmationChecked) {
      setError('Please acknowledge that you understand this action is final');
      return;
    }

    try {
      setIsConfirming(true);
      setError(null);

      const result = await servicePlansApi.finalConfirm(servicePlanId);
      onConfirmationComplete(result);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to final confirm plan');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleClose = () => {
    if (!isConfirming) {
      setError(null);
      setConfirmationChecked(false);
      onClose();
    }
  };

  if (!summary) return null;

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
          <div className="fixed inset-0 bg-black/50" />
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
              <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-lg bg-white shadow-xl transition-all">
                {/* Header */}
                <div className="px-6 py-4 border-b border-steel-200 bg-rail-600">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white/20 rounded-full">
                        <RocketLaunchIcon className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <Dialog.Title className="text-lg font-semibold text-white">
                          Final Plan Confirmation
                        </Dialog.Title>
                        <p className="text-sm text-rail-100 mt-0.5">
                          This action is deliberate and cannot be undone
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleClose}
                      disabled={isConfirming}
                      className="p-1 rounded-full hover:bg-white/20 text-white disabled:opacity-50"
                    >
                      <XMarkIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="px-6 py-4">
                  {/* What will happen */}
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-steel-700 mb-3">
                      What will happen:
                    </h3>
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <ArrowRightIcon className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-steel-600">
                          <span className="font-medium text-green-700">
                            {summary.totals.confirmedCars} confirmed car
                            {summary.totals.confirmedCars !== 1 ? 's' : ''}
                          </span>{' '}
                          will be sent to the Master Schedule
                        </p>
                      </div>
                      <div className="flex items-start gap-2">
                        <ArrowRightIcon className="w-4 h-4 text-rail-600 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-steel-600">
                          Plan structure will be <span className="font-medium">locked</span> - no
                          further edits allowed
                        </p>
                      </div>
                      <div className="flex items-start gap-2">
                        <ArrowRightIcon className="w-4 h-4 text-steel-400 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-steel-600">
                          Other draft plans for{' '}
                          <span className="font-medium">{summary.customer.name}</span> will be
                          archived
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Summary card */}
                  <div className="bg-steel-50 rounded-lg p-4 mb-6">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-steel-500">Plan:</span>
                        <p className="font-medium text-steel-800">{summary.planName}</p>
                      </div>
                      <div>
                        <span className="text-steel-500">Version:</span>
                        <p className="font-medium text-steel-800">v{summary.planVersion}</p>
                      </div>
                      <div>
                        <span className="text-steel-500">Customer:</span>
                        <p className="font-medium text-steel-800">{summary.customer.name}</p>
                      </div>
                      <div>
                        <span className="text-steel-500">Cars to Schedule:</span>
                        <p className="font-medium text-green-700">
                          {summary.totals.confirmedCars}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Warning */}
                  <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
                    <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-800">
                      <p className="font-medium">Important Notice</p>
                      <p className="mt-1">
                        Final confirmation is a <strong>deliberate action</strong>. Once confirmed,
                        the plan cannot be modified and confirmed cars will be committed to the
                        Master Schedule.
                      </p>
                    </div>
                  </div>

                  {/* Error display */}
                  {error && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
                      <ExclamationTriangleIcon className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-red-800">
                        <p className="font-medium">Error</p>
                        <p className="mt-1">{error}</p>
                      </div>
                    </div>
                  )}

                  {/* Confirmation checkbox */}
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmationChecked}
                      onChange={(e) => setConfirmationChecked(e.target.checked)}
                      disabled={isConfirming}
                      className="mt-0.5 rounded border-steel-300 text-rail-600 focus:ring-rail-500"
                    />
                    <span className="text-sm text-steel-700">
                      I understand that this action is final. Confirmed cars will be sent to the
                      Master Schedule and the plan structure will be locked.
                    </span>
                  </label>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-steel-200 bg-steel-50 flex items-center justify-end gap-3">
                  <button
                    onClick={handleClose}
                    disabled={isConfirming}
                    className="px-4 py-2 text-sm border border-steel-300 rounded-md hover:bg-white disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleFinalConfirm}
                    disabled={isConfirming || !confirmationChecked}
                    className="px-4 py-2 text-sm bg-rail-600 text-white rounded-md hover:bg-rail-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isConfirming ? (
                      <>
                        <svg
                          className="animate-spin h-4 w-4 text-white"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        Confirming...
                      </>
                    ) : (
                      <>
                        <CheckCircleSolidIcon className="w-4 h-4" />
                        Final Confirm Plan
                      </>
                    )}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
