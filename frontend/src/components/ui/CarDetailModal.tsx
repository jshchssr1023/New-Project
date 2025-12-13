/**
 * CarDetailModal - Full Car Information Popup
 *
 * A modal displaying comprehensive car details organized into sections,
 * matching the design in the reference images.
 */

import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import type { Car } from '../../types';

interface CarDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  car: Car | null;
}

export default function CarDetailModal({ isOpen, onClose, car }: CarDetailModalProps) {
  if (!car) return null;

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
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white shadow-xl transition-all">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-steel-200">
                  <Dialog.Title className="text-xl font-semibold text-steel-900">
                    Car Info Details
                  </Dialog.Title>
                  <button
                    onClick={onClose}
                    className="text-steel-400 hover:text-steel-600 transition-colors p-1"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                {/* Content */}
                <div className="px-6 py-4 max-h-[70vh] overflow-y-auto">
                  {/* Basic Information */}
                  <Section title="Basic Information">
                    <InfoRow label="Car ID" value={car.railcarNumber} mono />
                    <InfoRow label="Type" value={car.carType || 'Unknown'} />
                    <InfoRow label="DOT / Car Class" value={car.dotCarClass || '-'} />
                    <InfoRow label="On Rent" value={car.onRent ? 'Yes' : 'No'} />
                    <InfoRow label="Reason" value={car.reasonShopped || '-'} />
                    <InfoRow label="Customer" value={car.customer || '-'} />
                  </Section>

                  {/* Builder & Classification */}
                  <Section title="Builder & Classification">
                    <InfoRow label="Build Date" value={car.builtDate ? new Date(car.builtDate).toLocaleDateString() : '-'} />
                    <InfoRow label="Builder" value={car.builder || '-'} />
                    <InfoRow label="Project #" value={car.projectNumber || '-'} />
                  </Section>

                  {/* Capacity Details */}
                  <Section title="Capacity Details">
                    <InfoRow
                      label="Capacity / Size"
                      value={car.capacity ? `${car.capacity.toLocaleString()} gal` : '-'}
                    />
                  </Section>

                  {/* Basic Mechanical Info */}
                  <Section title="Basic Mechanical Info">
                    <InfoRow label="Cars Built" value={car.carsBuilt || '-'} />
                    <InfoRow label="Brake Type" value={car.brakeType || '-'} />
                    <InfoRow label="Wheel Config" value={car.wheelConfig || '-'} />
                    <InfoRow label="Coupler Type" value={car.couplerType || '-'} />
                  </Section>

                  {/* Service & Qualifications */}
                  <Section title="Service & Qualifications">
                    <InfoRow label="Tank Qualification" value={car.tankQualification || '-'} />
                    <InfoRow
                      label="Service Equipment"
                      value={car.serviceEquipmentDate ? new Date(car.serviceEquipmentDate).toLocaleDateString() : '-'}
                    />
                    <InfoRow
                      label="Safety Relief"
                      value={car.safetyReliefDate ? new Date(car.safetyReliefDate).toLocaleDateString() : '-'}
                    />
                    <InfoRow label="Rule 88B" value={car.rule88B || '-'} />
                  </Section>

                  {/* Shopping Status */}
                  <Section title="Shopping Status">
                    <InfoRow
                      label="Status"
                      value={car.shoppingStatus || '-'}
                      badge
                      badgeColor={getStatusColor(car.shoppingStatus)}
                    />
                    <InfoRow
                      label="Min w/o Lining"
                      value={car.minNoLining ? new Date(car.minNoLining).toLocaleDateString() : '-'}
                    />
                    <InfoRow
                      label="Min w/ Lining"
                      value={car.minWLining ? new Date(car.minWLining).toLocaleDateString() : '-'}
                    />
                  </Section>

                  {/* Past Shopping History */}
                  {car.lastShopDate && (
                    <Section title="Past Shopping (Historical)">
                      <InfoRow
                        label={car.lastShopDate ? new Date(car.lastShopDate).toLocaleDateString() : '-'}
                        value={car.lastShopCost ? `$${car.lastShopCost.toLocaleString()}` : '-'}
                      />
                      <div className="text-sm text-steel-500 mt-1">
                        {car.lastShopName || 'Unknown Shop'}
                      </div>
                    </Section>
                  )}
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

// Section component
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-4 mb-3">
        <div className="h-px flex-1 bg-steel-200" />
        <span className="text-xs font-medium text-steel-500 uppercase tracking-wider">
          {title}
        </span>
        <div className="h-px flex-1 bg-steel-200" />
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

// Info row component
function InfoRow({
  label,
  value,
  mono = false,
  badge = false,
  badgeColor = 'steel',
}: {
  label: string;
  value: string;
  mono?: boolean;
  badge?: boolean;
  badgeColor?: string;
}) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-sm text-steel-500">{label}</span>
      {badge ? (
        <span
          className={`text-sm font-medium px-2 py-0.5 rounded ${
            badgeColor === 'red'
              ? 'bg-red-100 text-red-700'
              : badgeColor === 'amber'
                ? 'bg-amber-100 text-amber-700'
                : badgeColor === 'green'
                  ? 'bg-green-100 text-green-700'
                  : badgeColor === 'blue'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-steel-100 text-steel-700'
          }`}
        >
          {value}
        </span>
      ) : (
        <span className={`text-sm font-medium text-steel-900 ${mono ? 'font-mono' : ''}`}>
          {value}
        </span>
      )}
    </div>
  );
}

// Get status color helper
function getStatusColor(status?: string): string {
  if (!status) return 'steel';
  const s = status.toLowerCase();
  if (s.includes('urgent') || s.includes('prior')) return 'red';
  if (s.includes('must') || s.includes('this year')) return 'amber';
  if (s.includes('upcoming') || s.includes('next')) return 'blue';
  if (s.includes('compliant') || s.includes('ok')) return 'green';
  return 'steel';
}
