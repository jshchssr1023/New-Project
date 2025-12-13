/**
 * CompactCarCard - Small car card with expand toggle
 *
 * A compact car card showing minimal information (Car ID, Type, Customer)
 * with a click to expand for full details.
 */

import { useState } from 'react';
import {
  CheckIcon,
  EyeIcon,
  TruckIcon,
} from '@heroicons/react/24/outline';
import type { Car } from '../../types';

interface CompactCarCardProps {
  car: Car;
  isSelected?: boolean;
  onSelect?: (car: Car) => void;
  onViewDetails?: (car: Car) => void;
}

export default function CompactCarCard({
  car,
  isSelected = false,
  onSelect,
  onViewDetails,
}: CompactCarCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Get status color
  const getStatusColor = () => {
    const status = car.shoppingStatus?.toLowerCase() || '';
    if (status.includes('urgent') || status.includes('prior')) return 'border-l-red-500 bg-red-50';
    if (status.includes('must') || status.includes('this year')) return 'border-l-amber-500 bg-amber-50';
    if (status.includes('upcoming') || status.includes('next')) return 'border-l-blue-500 bg-blue-50';
    if (status.includes('compliant') || status.includes('ok')) return 'border-l-green-500 bg-green-50';
    return 'border-l-steel-300 bg-white';
  };

  // Get status badge
  const getStatusBadge = () => {
    const status = car.shoppingStatus;
    if (!status) return null;

    const s = status.toLowerCase();
    let color = 'bg-steel-100 text-steel-700';
    let shortLabel = status;

    if (s.includes('urgent') || s.includes('prior')) {
      color = 'bg-red-100 text-red-700';
      shortLabel = 'Urgent';
    } else if (s.includes('must') || s.includes('this year')) {
      color = 'bg-amber-100 text-amber-700';
      shortLabel = 'This Year';
    } else if (s.includes('upcoming') || s.includes('next')) {
      color = 'bg-blue-100 text-blue-700';
      shortLabel = 'Upcoming';
    } else if (s.includes('compliant') || s.includes('ok')) {
      color = 'bg-green-100 text-green-700';
      shortLabel = 'OK';
    }

    return (
      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${color}`}>
        {shortLabel}
      </span>
    );
  };

  return (
    <div
      className={`
        relative rounded-lg border-l-4 border border-steel-200 shadow-sm transition-all duration-150
        ${getStatusColor()}
        ${isSelected ? 'ring-2 ring-crimson-500 ring-offset-1' : ''}
        ${isHovered ? 'shadow-md' : ''}
        cursor-pointer
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onSelect?.(car)}
    >
      <div className="p-3">
        {/* Top row: Car ID and selection checkbox */}
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-2">
            {/* Selection checkbox */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.(car);
              }}
              className={`
                w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
                ${isSelected
                  ? 'bg-crimson-600 border-crimson-600 text-white'
                  : 'border-steel-300 hover:border-crimson-400'
                }
              `}
            >
              {isSelected && <CheckIcon className="h-3.5 w-3.5" strokeWidth={3} />}
            </button>

            {/* Car ID */}
            <span className="font-mono font-semibold text-steel-900">
              {car.railcarNumber}
            </span>
          </div>

          {/* View details button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails?.(car);
            }}
            className="p-1 text-steel-400 hover:text-crimson-600 hover:bg-crimson-50 rounded transition-colors"
            title="View details"
          >
            <EyeIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Middle row: Type and Customer */}
        <div className="flex items-center gap-2 text-sm mb-2">
          <div className="flex items-center gap-1 text-steel-600">
            <TruckIcon className="h-3.5 w-3.5" />
            <span>{car.carType || 'Unknown'}</span>
          </div>
          <span className="text-steel-300">|</span>
          <span className="text-steel-600 truncate flex-1">
            {car.customer || 'No customer'}
          </span>
        </div>

        {/* Bottom row: Status badge */}
        <div className="flex items-center justify-between">
          {getStatusBadge()}
          {car.onRent && (
            <span className="text-xs text-steel-500">On Rent</span>
          )}
        </div>
      </div>

      {/* Hover overlay with quick actions */}
      {isHovered && (
        <div className="absolute inset-0 bg-gradient-to-t from-steel-900/10 to-transparent rounded-lg pointer-events-none" />
      )}
    </div>
  );
}

/**
 * CompactCarCardGrid - Grid container for compact car cards
 */
interface CompactCarCardGridProps {
  children: React.ReactNode;
  columns?: 2 | 3 | 4 | 5 | 6;
  className?: string;
}

export function CompactCarCardGrid({
  children,
  columns = 4,
  className = '',
}: CompactCarCardGridProps) {
  const gridCols = {
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
    5: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5',
    6: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6',
  };

  return (
    <div className={`grid ${gridCols[columns]} gap-3 ${className}`}>
      {children}
    </div>
  );
}
