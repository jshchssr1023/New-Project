/**
 * ConfirmationSummaryModal.tsx - Confirmation Summary Display
 *
 * Story 6: Confirmation Summary
 * Displays a read-only summary before final plan confirmation including:
 * - Customer information
 * - Plan version
 * - Confirmed vs pending car counts
 * - Cars by shop and month
 * - Option to proceed to final confirmation
 */

import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import {
  XMarkIcon,
  CheckCircleIcon,
  ClockIcon,
  BuildingOfficeIcon,
  CalendarIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';
import { ConfirmationSummary } from '../../services/api/servicePlans';

interface ConfirmationSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: ConfirmationSummary | null;
  onProceedToFinalConfirm: () => void;
  canFinalConfirm: boolean;
}

export default function ConfirmationSummaryModal({
  isOpen,
  onClose,
  summary,
  onProceedToFinalConfirm,
  canFinalConfirm,
}: ConfirmationSummaryModalProps) {
  if (!summary) return null;

  const {
    planName,
    planVersion,
    customer,
    totals,
    confirmedCarsByShop,
    confirmedCarsByMonth,
    pendingCars,
  } = summary;

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
              <Dialog.Panel className="w-full max-w-3xl transform overflow-hidden rounded-lg bg-white shadow-xl transition-all">
                {/* Header */}
                <div className="px-6 py-4 border-b border-steel-200 flex items-center justify-between bg-steel-50">
                  <div>
                    <Dialog.Title className="text-lg font-semibold text-steel-800">
                      Confirmation Summary
                    </Dialog.Title>
                    <p className="text-sm text-steel-500 mt-0.5">
                      Review before final confirmation - Read Only
                    </p>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-1 rounded-full hover:bg-steel-200 text-steel-500"
                  >
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>

                {/* Content */}
                <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
                  {/* Plan Info */}
                  <div className="mb-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-medium text-steel-500 uppercase">Plan</label>
                        <p className="text-steel-800 font-medium">{planName}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-steel-500 uppercase">Version</label>
                        <p className="text-steel-800 font-medium">v{planVersion}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-steel-500 uppercase">Customer</label>
                        <p className="text-steel-800 font-medium">
                          {customer.name} <span className="text-steel-400">({customer.code})</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-steel-700 mb-3">Car Totals</h3>
                    <div className="grid grid-cols-4 gap-3">
                      <div className="bg-green-50 rounded-lg p-3 text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <CheckCircleIcon className="w-4 h-4 text-green-600" />
                          <span className="text-xs font-medium text-green-600">Confirmed</span>
                        </div>
                        <p className="text-2xl font-bold text-green-700">{totals.confirmedCars}</p>
                      </div>
                      <div className="bg-amber-50 rounded-lg p-3 text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <ClockIcon className="w-4 h-4 text-amber-600" />
                          <span className="text-xs font-medium text-amber-600">Pending</span>
                        </div>
                        <p className="text-2xl font-bold text-amber-700">{totals.pendingCars}</p>
                      </div>
                      <div className="bg-red-50 rounded-lg p-3 text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <XMarkIcon className="w-4 h-4 text-red-600" />
                          <span className="text-xs font-medium text-red-600">Deleted</span>
                        </div>
                        <p className="text-2xl font-bold text-red-700">{totals.deletedCars}</p>
                      </div>
                      <div className="bg-steel-100 rounded-lg p-3 text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <span className="text-xs font-medium text-steel-600">Total</span>
                        </div>
                        <p className="text-2xl font-bold text-steel-700">{totals.totalCars}</p>
                      </div>
                    </div>
                  </div>

                  {/* Confirmed Cars by Shop */}
                  {confirmedCarsByShop.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-sm font-semibold text-steel-700 mb-3 flex items-center gap-2">
                        <BuildingOfficeIcon className="w-4 h-4" />
                        Confirmed Cars by Shop
                      </h3>
                      <div className="space-y-3">
                        {confirmedCarsByShop.map((shop) => (
                          <div
                            key={shop.shopId}
                            className="bg-steel-50 rounded-lg p-3"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <span className="font-medium text-steel-800">{shop.shopName}</span>
                                <span className="text-steel-400 ml-2">({shop.shopCode})</span>
                              </div>
                              <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                                {shop.carCount} car{shop.carCount !== 1 ? 's' : ''}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {shop.cars.map((car) => (
                                <span
                                  key={car.carId}
                                  className="px-2 py-0.5 bg-white border border-steel-200 rounded text-xs font-mono text-steel-600"
                                  title={`${car.plannedMonth}/${car.plannedYear}`}
                                >
                                  {car.railcarNumber}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Confirmed Cars by Month */}
                  {confirmedCarsByMonth.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-sm font-semibold text-steel-700 mb-3 flex items-center gap-2">
                        <CalendarIcon className="w-4 h-4" />
                        Confirmed Cars by Month
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {confirmedCarsByMonth.map((month) => (
                          <div
                            key={`${month.year}-${month.month}`}
                            className="px-3 py-2 bg-green-50 rounded-lg text-center"
                          >
                            <div className="text-xs text-green-600 font-medium">
                              {month.monthLabel} {month.year}
                            </div>
                            <div className="text-lg font-bold text-green-700">{month.carCount}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pending Cars Warning */}
                  {pendingCars.length > 0 && (
                    <div className="mb-4">
                      <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <h4 className="text-sm font-medium text-amber-800">
                            {pendingCars.length} Pending Car{pendingCars.length !== 1 ? 's' : ''}
                          </h4>
                          <p className="text-sm text-amber-700 mt-1">
                            Pending cars must be confirmed or deleted before final plan confirmation.
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {pendingCars.slice(0, 10).map((car) => (
                              <span
                                key={car.id}
                                className="px-2 py-0.5 bg-amber-100 rounded text-xs font-mono text-amber-700"
                              >
                                {car.railcarNumber}
                              </span>
                            ))}
                            {pendingCars.length > 10 && (
                              <span className="px-2 py-0.5 text-xs text-amber-600">
                                +{pendingCars.length - 10} more
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-steel-200 bg-steel-50 flex items-center justify-between">
                  <div className="text-sm text-steel-500">
                    {canFinalConfirm ? (
                      <span className="text-green-600 flex items-center gap-1">
                        <CheckCircleSolidIcon className="w-4 h-4" />
                        Ready for final confirmation
                      </span>
                    ) : (
                      <span className="text-amber-600">
                        Complete all pending items before final confirmation
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={onClose}
                      className="px-4 py-2 text-sm border border-steel-300 rounded-md hover:bg-white"
                    >
                      Close
                    </button>
                    <button
                      onClick={onProceedToFinalConfirm}
                      disabled={!canFinalConfirm}
                      className="px-4 py-2 text-sm bg-rail-600 text-white rounded-md hover:bg-rail-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <CheckCircleSolidIcon className="w-4 h-4" />
                      Proceed to Final Confirmation
                    </button>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
