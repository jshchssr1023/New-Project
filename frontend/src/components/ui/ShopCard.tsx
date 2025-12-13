/**
 * ShopCard - Shop card with capacity calendar popup
 *
 * A card displaying shop information with a popup showing
 * 12-month capacity calendar view.
 */

import { Fragment, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import {
  XMarkIcon,
  BuildingStorefrontIcon,
  MapPinIcon,
  WrenchScrewdriverIcon,
  CurrencyDollarIcon,
  CalendarDaysIcon,
  PencilIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import type { Shop } from '../../types';

interface ShopCardProps {
  shop: Shop;
  capacityData?: MonthlyCapacity[];
  onViewCapacity?: (shop: Shop) => void;
  onEdit?: (shop: Shop) => void;
  onDelete?: (shopId: string) => void;
  className?: string;
}

interface MonthlyCapacity {
  month: number;
  year: number;
  committed: number;
  planned: number;
  available: number;
}

export default function ShopCard({
  shop,
  capacityData = [],
  onViewCapacity,
  onEdit,
  onDelete,
  className = '',
}: ShopCardProps) {
  const [showCapacityModal, setShowCapacityModal] = useState(false);

  // Calculate utilization for current month
  const currentMonth = new Date().getMonth() + 1;
  const currentCapacity = capacityData.find((c) => c.month === currentMonth);
  const utilization = currentCapacity
    ? Math.round((currentCapacity.planned / currentCapacity.committed) * 100)
    : 0;

  // Get utilization color
  const getUtilizationColor = (util: number) => {
    if (util >= 95) return 'text-red-600 bg-red-100';
    if (util >= 80) return 'text-amber-600 bg-amber-100';
    if (util >= 50) return 'text-green-600 bg-green-100';
    return 'text-blue-600 bg-blue-100';
  };

  return (
    <>
      <div
        className={`bg-white rounded-xl border border-steel-200 shadow-sm hover:shadow-md transition-shadow ${className}`}
      >
        <div className="p-4">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-crimson-100">
                <BuildingStorefrontIcon className="h-5 w-5 text-crimson-600" />
              </div>
              <div>
                <h3 className="font-semibold text-steel-900">{shop.name}</h3>
                <p className="text-xs text-steel-500">{shop.code}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-1 rounded text-xs font-medium ${
                  shop.isActive
                    ? 'bg-green-100 text-green-700'
                    : 'bg-steel-100 text-steel-500'
                }`}
              >
                {shop.isActive ? 'Active' : 'Inactive'}
              </span>
              {/* Edit Button */}
              {onEdit && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(shop);
                  }}
                  className="p-1.5 text-steel-400 hover:text-crimson-600 hover:bg-crimson-50 rounded transition-colors"
                  title="Edit shop"
                >
                  <PencilIcon className="h-4 w-4" />
                </button>
              )}
              {/* Delete Button */}
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(shop.id);
                  }}
                  className="p-1.5 text-steel-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                  title="Delete shop"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Location */}
          <div className="flex items-center gap-1.5 text-sm text-steel-600 mb-3">
            <MapPinIcon className="h-4 w-4 text-steel-400" />
            <span>
              {shop.city}, {shop.state}
            </span>
            {shop.region && (
              <>
                <span className="text-steel-300">|</span>
                <span className="text-steel-500">{shop.region}</span>
              </>
            )}
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-steel-50 rounded-lg p-2.5">
              <div className="flex items-center gap-1.5 text-xs text-steel-500 mb-1">
                <WrenchScrewdriverIcon className="h-3.5 w-3.5" />
                <span>Capacity</span>
              </div>
              <div className="text-lg font-semibold text-steel-900">
                {shop.capacity || '-'}
                <span className="text-xs text-steel-500 font-normal">/mo</span>
              </div>
            </div>
            <div className="bg-steel-50 rounded-lg p-2.5">
              <div className="flex items-center gap-1.5 text-xs text-steel-500 mb-1">
                <CurrencyDollarIcon className="h-3.5 w-3.5" />
                <span>Cost/Car</span>
              </div>
              <div className="text-lg font-semibold text-steel-900">
                ${shop.baseCostPerCar?.toLocaleString() || '-'}
              </div>
            </div>
          </div>

          {/* Current Utilization */}
          {currentCapacity && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-steel-500">Current Month Utilization</span>
                <span className={`font-medium px-1.5 py-0.5 rounded ${getUtilizationColor(utilization)}`}>
                  {utilization}%
                </span>
              </div>
              <div className="h-2 bg-steel-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    utilization >= 95
                      ? 'bg-red-500'
                      : utilization >= 80
                        ? 'bg-amber-500'
                        : utilization >= 50
                          ? 'bg-green-500'
                          : 'bg-blue-500'
                  }`}
                  style={{ width: `${Math.min(100, utilization)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-steel-500 mt-1">
                <span>{currentCapacity.planned} planned</span>
                <span>{currentCapacity.available} available</span>
              </div>
            </div>
          )}

          {/* View Capacity Button */}
          <button
            onClick={() => setShowCapacityModal(true)}
            className="w-full flex items-center justify-center gap-2 bg-crimson-600 hover:bg-crimson-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            <CalendarDaysIcon className="h-4 w-4" />
            View Capacity Calendar
          </button>
        </div>
      </div>

      {/* Capacity Calendar Modal */}
      <CapacityCalendarModal
        isOpen={showCapacityModal}
        onClose={() => setShowCapacityModal(false)}
        shop={shop}
        capacityData={capacityData}
      />
    </>
  );
}

/**
 * CapacityCalendarModal - 12-month capacity view
 */
interface CapacityCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  shop: Shop;
  capacityData: MonthlyCapacity[];
}

function CapacityCalendarModal({
  isOpen,
  onClose,
  shop,
  capacityData,
}: CapacityCalendarModalProps) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);

  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  // Get capacity for a specific month
  const getMonthCapacity = (month: number): MonthlyCapacity | undefined => {
    return capacityData.find((c) => c.month === month && c.year === selectedYear);
  };

  // Get cell color based on utilization
  const getCellColor = (capacity: MonthlyCapacity | undefined) => {
    if (!capacity) return 'bg-steel-100 border-steel-200';
    const utilization = (capacity.planned / capacity.committed) * 100;
    if (utilization >= 95) return 'bg-red-100 border-red-300';
    if (utilization >= 80) return 'bg-amber-100 border-amber-300';
    if (utilization >= 50) return 'bg-green-100 border-green-300';
    return 'bg-blue-100 border-blue-300';
  };

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
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white shadow-xl transition-all">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-steel-200 bg-steel-50">
                  <div>
                    <Dialog.Title className="text-lg font-semibold text-steel-900">
                      {shop.name} - Capacity Calendar
                    </Dialog.Title>
                    <p className="text-sm text-steel-500">
                      {shop.city}, {shop.state} | Monthly capacity: {shop.capacity}
                    </p>
                  </div>
                  <button
                    onClick={onClose}
                    className="text-steel-400 hover:text-steel-600 transition-colors"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                {/* Year Selector */}
                <div className="flex items-center justify-center gap-4 py-4 border-b border-steel-200">
                  <button
                    onClick={() => setSelectedYear((y) => y - 1)}
                    className="px-3 py-1 text-steel-600 hover:bg-steel-100 rounded transition-colors"
                  >
                    &larr; Previous
                  </button>
                  <span className="text-xl font-semibold text-steel-900 min-w-[80px] text-center">
                    {selectedYear}
                  </span>
                  <button
                    onClick={() => setSelectedYear((y) => y + 1)}
                    className="px-3 py-1 text-steel-600 hover:bg-steel-100 rounded transition-colors"
                  >
                    Next &rarr;
                  </button>
                </div>

                {/* Calendar Grid */}
                <div className="p-6">
                  <div className="grid grid-cols-4 gap-3">
                    {months.map((monthName, index) => {
                      const month = index + 1;
                      const capacity = getMonthCapacity(month);
                      const utilization = capacity
                        ? Math.round((capacity.planned / capacity.committed) * 100)
                        : 0;

                      return (
                        <div
                          key={month}
                          className={`rounded-lg border p-3 ${getCellColor(capacity)}`}
                        >
                          <div className="font-medium text-steel-900 mb-2">
                            {monthName}
                          </div>
                          {capacity ? (
                            <>
                              <div className="text-2xl font-bold text-steel-900 mb-1">
                                {capacity.planned}
                                <span className="text-sm font-normal text-steel-500">
                                  /{capacity.committed}
                                </span>
                              </div>
                              <div className="h-1.5 bg-steel-200 rounded-full overflow-hidden mb-1">
                                <div
                                  className={`h-full rounded-full ${
                                    utilization >= 95
                                      ? 'bg-red-500'
                                      : utilization >= 80
                                        ? 'bg-amber-500'
                                        : utilization >= 50
                                          ? 'bg-green-500'
                                          : 'bg-blue-500'
                                  }`}
                                  style={{ width: `${Math.min(100, utilization)}%` }}
                                />
                              </div>
                              <div className="text-xs text-steel-600">
                                {capacity.available} available
                              </div>
                            </>
                          ) : (
                            <div className="text-sm text-steel-400 italic">
                              No data
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Legend */}
                  <div className="flex items-center justify-center gap-4 mt-6 pt-4 border-t border-steel-200">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-blue-400" />
                      <span className="text-xs text-steel-600">0-49%</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-green-400" />
                      <span className="text-xs text-steel-600">50-79%</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-amber-400" />
                      <span className="text-xs text-steel-600">80-94%</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-red-400" />
                      <span className="text-xs text-steel-600">95%+</span>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-steel-200 bg-steel-50">
                  <button
                    onClick={onClose}
                    className="w-full bg-crimson-600 hover:bg-crimson-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors"
                  >
                    Close
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

/**
 * ShopCardGrid - Grid container for shop cards
 */
interface ShopCardGridProps {
  children: React.ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}

export function ShopCardGrid({
  children,
  columns = 3,
  className = '',
}: ShopCardGridProps) {
  const gridCols = {
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  };

  return (
    <div className={`grid ${gridCols[columns]} gap-4 ${className}`}>
      {children}
    </div>
  );
}
