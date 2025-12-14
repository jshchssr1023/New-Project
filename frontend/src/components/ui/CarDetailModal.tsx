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
                    <InfoRow label="On Rent" value={car.portfolio ? 'Yes' : 'No'} />
                    <InfoRow label="Customer" value={car.customer || '-'} />
                    <InfoRow label="Year Built" value={car.buildYear ? String(car.buildYear) : '-'} />
                    <InfoRow label="Project #" value={car.projectNumber || '-'} />
                  </Section>

                  {/* Tank Car Configuration */}
                  <Section title="Tank Car Configuration">
                    <InfoRow label="Jacketed" value={car.isJacketed ? 'Yes' : 'No'} />
                    <InfoRow label="Lined" value={car.isLined ? 'Yes' : 'No'} />
                    <InfoRow label="Lining Type" value={car.liningType || '-'} />
                  </Section>

                  {/* Service & Qualifications - CSV columns T-AE */}
                  <Section title="Service & Qualifications">
                    <InfoRow
                      label="Min (no lining)"
                      value={formatQualDate(car.minNoLining)}
                    />
                    <InfoRow
                      label="Min w/ lining"
                      value={formatQualDate(car.minWLining)}
                    />
                    <InfoRow
                      label="Interior Lining"
                      value={formatQualDate(car.interiorLining)}
                    />
                    <InfoRow
                      label="Rule 88B"
                      value={formatQualDate(car.rule88B)}
                    />
                    <InfoRow
                      label="Safety Relief"
                      value={formatQualDate(car.safetyRelief)}
                    />
                    <InfoRow
                      label="Service Equipment"
                      value={formatQualDate(car.serviceEquipment)}
                    />
                    <InfoRow
                      label="Stub Sill"
                      value={formatQualDate(car.stubSill)}
                    />
                    <InfoRow
                      label="Tank Thickness"
                      value={formatQualDate(car.tankThickness)}
                    />
                    <InfoRow
                      label="Tank Qualification"
                      value={formatQualDate(car.tankQualification)}
                    />
                  </Section>

                  {/* Shopping Status */}
                  <Section title="Shopping Status">
                    <InfoRow label="Reason Shopped" value={car.reasonsShopped || '-'} />
                    <InfoRow
                      label="Current Status"
                      value={car.status || '-'}
                      badge
                      badgeColor={getStatusColor(car.status)}
                    />
                    <InfoRow
                      label="Plan Status"
                      value={car.planStatus || '-'}
                    />
                    <InfoRow
                      label="Shopping Status"
                      value={getShoppingStatusDisplay(car)}
                      badge
                      badgeColor={getStatusColor(getShoppingStatusDisplay(car))}
                    />
                  </Section>
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

// Format qualification date - shows year or formatted date
function formatQualDate(dateValue: string | null | undefined): string {
  if (!dateValue) return '-';

  const date = new Date(dateValue);
  if (isNaN(date.getTime())) return '-';

  // If it's Dec 31, just show the year (as dates are stored as end-of-year)
  if (date.getMonth() === 11 && date.getDate() === 31) {
    return String(date.getFullYear());
  }

  // Otherwise show the full date
  return date.toLocaleDateString();
}

// Get shopping status display from car data
function getShoppingStatusDisplay(car: Car): string {
  // If there's a computed shoppingStatus, use it
  if (car.shoppingStatus) {
    return car.shoppingStatus;
  }

  // Calculate based on qualification dates
  const currentYear = new Date().getFullYear();
  const qualDates = [
    car.minNoLining,
    car.minWLining,
    car.interiorLining,
    car.rule88B,
    car.safetyRelief,
    car.serviceEquipment,
    car.stubSill,
    car.tankThickness,
    car.tankQualification,
  ].filter(Boolean);

  if (qualDates.length === 0) return 'Unknown';

  let earliestYear: number | null = null;
  for (const dateStr of qualDates) {
    if (!dateStr) continue;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) continue;
    const year = date.getFullYear();
    if (earliestYear === null || year < earliestYear) {
      earliestYear = year;
    }
  }

  if (earliestYear === null) return 'Unknown';
  if (earliestYear < currentYear) return 'Urgent';
  if (earliestYear === currentYear) return 'Must Shop';
  if (earliestYear === currentYear + 1) return 'Upcoming';
  return 'Compliant';
}

// Get status color helper
function getStatusColor(status?: string): string {
  if (!status) return 'steel';
  const s = status.toLowerCase();
  if (s.includes('urgent') || s.includes('prior') || s.includes('overdue')) return 'red';
  if (s.includes('must') || s.includes('this year') || s.includes('arrived')) return 'amber';
  if (s.includes('upcoming') || s.includes('next') || s.includes('planned') || s.includes('scheduled')) return 'blue';
  if (s.includes('compliant') || s.includes('ok') || s.includes('complete')) return 'green';
  return 'steel';
}
