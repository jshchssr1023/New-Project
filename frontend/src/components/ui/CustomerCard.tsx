/**
 * CustomerCard - Expandable customer card showing summary of customer's cars
 *
 * Displays customer name, car count, shopping status breakdown, and most urgent date.
 * Expands inline to reveal all railcars for that customer.
 */

import { useState, useMemo } from 'react';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  UserGroupIcon,
  TruckIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  CalendarIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import type { Car } from '../../types';
import { getShoppingStatus, getEarliestQualDate } from '../cars/ShoppingStatusBadge';
import CompactCarCard from './CompactCarCard';

interface CustomerCardProps {
  customer: string;
  cars: Car[];
  selectedCarIds: Set<string>;
  onToggleSelection: (carId: string) => void;
  onViewCarDetails: (car: Car) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  cardSize: 'large' | 'medium' | 'compact';
}

interface ShoppingStatusCounts {
  urgent: number;
  mustShop: number;
  upcoming: number;
  compliant: number;
  unknown: number;
}

export default function CustomerCard({
  customer,
  cars,
  selectedCarIds,
  onToggleSelection,
  onViewCarDetails,
  isExpanded = false,
  onToggleExpand,
  cardSize,
}: CustomerCardProps) {
  // Calculate shopping status breakdown
  const statusCounts = useMemo<ShoppingStatusCounts>(() => {
    const counts = { urgent: 0, mustShop: 0, upcoming: 0, compliant: 0, unknown: 0 };

    for (const car of cars) {
      const status = getShoppingStatus(car as any);
      switch (status) {
        case 'Urgent': counts.urgent++; break;
        case 'Must Shop': counts.mustShop++; break;
        case 'Upcoming': counts.upcoming++; break;
        case 'Compliant': counts.compliant++; break;
        default: counts.unknown++; break;
      }
    }

    return counts;
  }, [cars]);

  // Find most urgent due date
  const mostUrgentDate = useMemo(() => {
    let earliest: { field: string; date: Date } | null = null;

    for (const car of cars) {
      const carEarliest = getEarliestQualDate(car as any);
      if (carEarliest && (!earliest || carEarliest.date < earliest.date)) {
        earliest = carEarliest;
      }
    }

    return earliest;
  }, [cars]);

  // Count selected cars for this customer
  const selectedCount = useMemo(() => {
    return cars.filter(car => selectedCarIds.has(car.id)).length;
  }, [cars, selectedCarIds]);

  // Select/deselect all cars for this customer
  const handleSelectAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    const allSelected = cars.every(car => selectedCarIds.has(car.id));
    cars.forEach(car => {
      if (allSelected) {
        // Deselect all
        if (selectedCarIds.has(car.id)) {
          onToggleSelection(car.id);
        }
      } else {
        // Select all
        if (!selectedCarIds.has(car.id)) {
          onToggleSelection(car.id);
        }
      }
    });
  };

  const allSelected = cars.length > 0 && cars.every(car => selectedCarIds.has(car.id));
  const someSelected = selectedCount > 0 && !allSelected;

  // Get the dominant status color for the card border
  const getDominantStatusColor = () => {
    if (statusCounts.urgent > 0) return 'border-l-red-500';
    if (statusCounts.mustShop > 0) return 'border-l-amber-500';
    if (statusCounts.upcoming > 0) return 'border-l-blue-500';
    return 'border-l-green-500';
  };

  // Format the due year display
  const formatDueYear = (date: Date) => {
    const currentYear = new Date().getFullYear();
    const year = date.getFullYear();
    if (year < currentYear) return `OVERDUE (${year})`;
    if (year === currentYear) return `Due ${year}`;
    return `Due ${year}`;
  };

  // Dynamic sizing based on cardSize prop
  const cardClasses = {
    large: 'p-4',
    medium: 'p-3',
    compact: 'p-2',
  };

  const headerTextClasses = {
    large: 'text-lg',
    medium: 'text-base',
    compact: 'text-sm',
  };

  const badgeClasses = {
    large: 'px-2 py-1 text-xs',
    medium: 'px-1.5 py-0.5 text-xs',
    compact: 'px-1 py-0.5 text-[10px]',
  };

  return (
    <div className="mb-3">
      {/* Customer Summary Card */}
      <div
        className={`
          bg-white rounded-lg border-l-4 border border-steel-200 shadow-sm
          ${getDominantStatusColor()}
          ${isExpanded ? 'rounded-b-none border-b-0' : ''}
          cursor-pointer hover:shadow-md transition-shadow
        `}
        onClick={onToggleExpand}
      >
        <div className={cardClasses[cardSize]}>
          {/* Header Row */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              {/* Selection checkbox */}
              <button
                onClick={handleSelectAll}
                className={`
                  w-5 h-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0
                  ${allSelected
                    ? 'bg-crimson-600 border-crimson-600 text-white'
                    : someSelected
                    ? 'bg-crimson-200 border-crimson-400'
                    : 'border-steel-300 hover:border-crimson-400'
                  }
                `}
              >
                {allSelected && (
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 12 12">
                    <path d="M10.28 2.28L3.989 8.575 1.695 6.28A1 1 0 00.28 7.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 2.28z" />
                  </svg>
                )}
                {someSelected && !allSelected && (
                  <div className="w-2 h-0.5 bg-crimson-600 rounded" />
                )}
              </button>

              {/* Customer icon and name */}
              <div className="flex items-center gap-2">
                <UserGroupIcon className="h-5 w-5 text-steel-500 flex-shrink-0" />
                <span className={`font-semibold text-steel-900 ${headerTextClasses[cardSize]}`}>
                  {customer || 'Unknown Customer'}
                </span>
              </div>

              {/* Car count badge */}
              <span className={`inline-flex items-center gap-1 bg-steel-100 text-steel-700 rounded-full font-medium ${badgeClasses[cardSize]}`}>
                <TruckIcon className="h-3 w-3" />
                {cars.length} car{cars.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Expand/Collapse indicator */}
            <div className="flex items-center gap-2">
              {selectedCount > 0 && (
                <span className="text-xs text-crimson-600 font-medium">
                  {selectedCount} selected
                </span>
              )}
              {isExpanded ? (
                <ChevronUpIcon className="h-5 w-5 text-steel-500" />
              ) : (
                <ChevronDownIcon className="h-5 w-5 text-steel-500" />
              )}
            </div>
          </div>

          {/* Status Breakdown Row */}
          <div className="flex items-center flex-wrap gap-2">
            {/* Shopping Status Badges */}
            {statusCounts.urgent > 0 && (
              <span className={`inline-flex items-center gap-1 bg-red-100 text-red-700 border border-red-200 rounded-full font-medium ${badgeClasses[cardSize]}`}>
                <ExclamationTriangleIcon className="h-3 w-3" />
                {statusCounts.urgent} Urgent
              </span>
            )}
            {statusCounts.mustShop > 0 && (
              <span className={`inline-flex items-center gap-1 bg-amber-100 text-amber-700 border border-amber-200 rounded-full font-medium ${badgeClasses[cardSize]}`}>
                <ClockIcon className="h-3 w-3" />
                {statusCounts.mustShop} Must Shop
              </span>
            )}
            {statusCounts.upcoming > 0 && (
              <span className={`inline-flex items-center gap-1 bg-blue-100 text-blue-700 border border-blue-200 rounded-full font-medium ${badgeClasses[cardSize]}`}>
                <CalendarIcon className="h-3 w-3" />
                {statusCounts.upcoming} Upcoming
              </span>
            )}
            {statusCounts.compliant > 0 && (
              <span className={`inline-flex items-center gap-1 bg-green-100 text-green-700 border border-green-200 rounded-full font-medium ${badgeClasses[cardSize]}`}>
                <CheckCircleIcon className="h-3 w-3" />
                {statusCounts.compliant} OK
              </span>
            )}

            {/* Most Urgent Due Date */}
            {mostUrgentDate && (
              <span className={`ml-auto text-steel-500 ${cardSize === 'compact' ? 'text-[10px]' : 'text-xs'}`}>
                Next due: <span className={mostUrgentDate.date.getFullYear() <= new Date().getFullYear() ? 'text-red-600 font-semibold' : 'text-steel-700 font-medium'}>
                  {formatDueYear(mostUrgentDate.date)}
                </span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Expanded Cars Grid */}
      {isExpanded && (
        <div className="bg-steel-50 border border-t-0 border-steel-200 rounded-b-lg p-3">
          <div className={`grid gap-2 ${
            cardSize === 'compact'
              ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
              : cardSize === 'medium'
              ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
              : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
          }`}>
            {cars.map((car) => (
              <CompactCarCard
                key={car.id}
                car={car}
                isSelected={selectedCarIds.has(car.id)}
                onSelect={() => onToggleSelection(car.id)}
                onViewDetails={onViewCarDetails}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * CustomerCardGrid - Container for customer cards with dynamic sizing
 */
interface CustomerCardGridProps {
  children: React.ReactNode;
  className?: string;
}

export function CustomerCardGrid({ children, className = '' }: CustomerCardGridProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {children}
    </div>
  );
}
