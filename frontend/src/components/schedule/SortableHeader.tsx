/**
 * Sortable Header Component
 *
 * Provides advanced sorting controls for schedule views:
 * - Multi-column sort support
 * - Sort by Customer, Due Date, Qualification status
 * - Visual indicators for sort direction
 */

import { useState, useMemo, useCallback } from 'react';
import {
  ChevronUpIcon,
  ChevronDownIcon,
  FunnelIcon,
  ArrowsUpDownIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

// ============================================================================
// TYPES
// ============================================================================

export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  key: string;
  direction: SortDirection;
}

export interface SortOption {
  key: string;
  label: string;
  getValue: (item: any) => any;
  type?: 'string' | 'number' | 'date';
}

// ============================================================================
// SORT UTILITIES
// ============================================================================

/**
 * Compare function generator
 */
export function createCompareFn<T>(
  sortConfigs: SortConfig[],
  options: SortOption[]
): (a: T, b: T) => number {
  return (a: T, b: T) => {
    for (const { key, direction } of sortConfigs) {
      const option = options.find(o => o.key === key);
      if (!option) continue;

      const aVal = option.getValue(a);
      const bVal = option.getValue(b);
      const multiplier = direction === 'asc' ? 1 : -1;

      // Handle nulls/undefined
      if (aVal == null && bVal == null) continue;
      if (aVal == null) return 1 * multiplier;
      if (bVal == null) return -1 * multiplier;

      // Compare based on type
      let comparison = 0;
      if (option.type === 'date') {
        const aDate = new Date(aVal).getTime();
        const bDate = new Date(bVal).getTime();
        comparison = aDate - bDate;
      } else if (option.type === 'number' || typeof aVal === 'number') {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }

      if (comparison !== 0) {
        return comparison * multiplier;
      }
    }
    return 0;
  };
}

/**
 * Hook for sortable data
 */
export function useSortableData<T>(
  data: T[],
  options: SortOption[],
  initialSort?: SortConfig[]
) {
  const [sortConfigs, setSortConfigs] = useState<SortConfig[]>(initialSort || []);

  const sortedData = useMemo(() => {
    if (sortConfigs.length === 0) return data;
    return [...data].sort(createCompareFn(sortConfigs, options));
  }, [data, sortConfigs, options]);

  const toggleSort = useCallback((key: string) => {
    setSortConfigs(prev => {
      const existing = prev.find(s => s.key === key);
      if (!existing) {
        // Add new sort (replace existing for single-sort, or add for multi-sort)
        return [{ key, direction: 'asc' }];
      }
      if (existing.direction === 'asc') {
        return prev.map(s => s.key === key ? { ...s, direction: 'desc' as const } : s);
      }
      // Remove sort
      return prev.filter(s => s.key !== key);
    });
  }, []);

  const clearSort = useCallback(() => {
    setSortConfigs([]);
  }, []);

  const getSortDirection = useCallback((key: string): SortDirection | null => {
    const config = sortConfigs.find(s => s.key === key);
    return config?.direction || null;
  }, [sortConfigs]);

  return {
    sortedData,
    sortConfigs,
    toggleSort,
    clearSort,
    getSortDirection,
  };
}

// ============================================================================
// SORTABLE COLUMN HEADER
// ============================================================================

interface SortableColumnHeaderProps {
  label: string;
  sortKey: string;
  currentDirection: SortDirection | null;
  onSort: (key: string) => void;
  className?: string;
}

export function SortableColumnHeader({
  label,
  sortKey,
  currentDirection,
  onSort,
  className = '',
}: SortableColumnHeaderProps) {
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`flex items-center gap-1 text-left font-semibold hover:text-steel-900 transition-colors ${
        currentDirection ? 'text-rail-600' : 'text-steel-600'
      } ${className}`}
      aria-label={`Sort by ${label} ${
        currentDirection === 'asc'
          ? '(currently ascending)'
          : currentDirection === 'desc'
          ? '(currently descending)'
          : ''
      }`}
    >
      {label}
      <span className="flex flex-col">
        <ChevronUpIcon
          className={`h-3 w-3 -mb-1 ${
            currentDirection === 'asc' ? 'text-rail-600' : 'text-steel-300'
          }`}
        />
        <ChevronDownIcon
          className={`h-3 w-3 ${
            currentDirection === 'desc' ? 'text-rail-600' : 'text-steel-300'
          }`}
        />
      </span>
    </button>
  );
}

// ============================================================================
// SORT CONTROL BAR
// ============================================================================

interface SortControlBarProps {
  options: SortOption[];
  sortConfigs: SortConfig[];
  onToggleSort: (key: string) => void;
  onClearSort: () => void;
  className?: string;
}

export function SortControlBar({
  options,
  sortConfigs,
  onToggleSort,
  onClearSort,
  className = '',
}: SortControlBarProps) {
  const activeSorts = sortConfigs.filter(s => options.some(o => o.key === s.key));

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      <span className="text-xs font-medium text-steel-500 uppercase tracking-wider flex items-center gap-1">
        <FunnelIcon className="h-3.5 w-3.5" />
        Sort by:
      </span>

      {options.map(option => {
        const sortConfig = sortConfigs.find(s => s.key === option.key);
        const isActive = !!sortConfig;

        return (
          <button
            key={option.key}
            onClick={() => onToggleSort(option.key)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
              isActive
                ? 'bg-rail-50 border-rail-200 text-rail-700'
                : 'bg-white border-steel-200 text-steel-600 hover:border-steel-300'
            }`}
            aria-pressed={isActive}
          >
            {option.label}
            {isActive && (
              <span className="flex items-center">
                {sortConfig?.direction === 'asc' ? (
                  <ChevronUpIcon className="h-3 w-3" />
                ) : (
                  <ChevronDownIcon className="h-3 w-3" />
                )}
              </span>
            )}
          </button>
        );
      })}

      {activeSorts.length > 0 && (
        <button
          onClick={onClearSort}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-steel-500 hover:text-steel-700"
          aria-label="Clear all sorting"
        >
          <XMarkIcon className="h-3.5 w-3.5" />
          Clear
        </button>
      )}
    </div>
  );
}

// ============================================================================
// QUICK SORT DROPDOWN
// ============================================================================

interface QuickSortDropdownProps {
  options: SortOption[];
  currentSort: SortConfig | null;
  onSort: (key: string, direction: SortDirection) => void;
  className?: string;
}

export function QuickSortDropdown({
  options,
  currentSort,
  onSort,
  className = '',
}: QuickSortDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-steel-700 bg-white border border-steel-200 rounded-lg hover:bg-steel-50"
      >
        <ArrowsUpDownIcon className="h-4 w-4" />
        {currentSort ? (
          <span>
            {options.find(o => o.key === currentSort.key)?.label}
            {currentSort.direction === 'asc' ? ' ↑' : ' ↓'}
          </span>
        ) : (
          'Sort'
        )}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-steel-200 py-1 z-20">
            {options.map(option => (
              <div key={option.key}>
                <button
                  onClick={() => {
                    onSort(option.key, 'asc');
                    setIsOpen(false);
                  }}
                  className={`w-full px-3 py-1.5 text-left text-sm hover:bg-steel-50 flex items-center justify-between ${
                    currentSort?.key === option.key && currentSort.direction === 'asc'
                      ? 'text-rail-600 bg-rail-50'
                      : 'text-steel-700'
                  }`}
                >
                  {option.label}
                  <ChevronUpIcon className="h-3 w-3" />
                </button>
                <button
                  onClick={() => {
                    onSort(option.key, 'desc');
                    setIsOpen(false);
                  }}
                  className={`w-full px-3 py-1.5 text-left text-sm hover:bg-steel-50 flex items-center justify-between ${
                    currentSort?.key === option.key && currentSort.direction === 'desc'
                      ? 'text-rail-600 bg-rail-50'
                      : 'text-steel-700'
                  }`}
                >
                  {option.label}
                  <ChevronDownIcon className="h-3 w-3" />
                </button>
              </div>
            ))}

            {currentSort && (
              <>
                <div className="border-t border-steel-100 my-1" />
                <button
                  onClick={() => {
                    onSort('', 'asc'); // Signal to clear
                    setIsOpen(false);
                  }}
                  className="w-full px-3 py-1.5 text-left text-sm text-steel-500 hover:bg-steel-50"
                >
                  Clear sort
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// PREDEFINED SORT OPTIONS FOR CARS
// ============================================================================

export const carSortOptions: SortOption[] = [
  {
    key: 'customer',
    label: 'Customer',
    getValue: (car: any) => car.customer,
    type: 'string',
  },
  {
    key: 'dueDate',
    label: 'Due Date',
    getValue: (car: any) => {
      // Get earliest qualification due date
      const dates = [
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
      if (dates.length === 0) return null;
      return dates.reduce((earliest, d) => {
        const date = new Date(d);
        return !earliest || date < earliest ? date : earliest;
      }, null as Date | null);
    },
    type: 'date',
  },
  {
    key: 'shoppingStatus',
    label: 'Status',
    getValue: (car: any) => {
      // Priority order: Urgent > Must Shop > Upcoming > In Shop > Planned > Compliant > Unknown
      const priority: Record<string, number> = {
        urgent: 1,
        'must shop': 2,
        upcoming: 3,
        'in shop': 4,
        planned: 5,
        compliant: 6,
        unknown: 7,
      };
      return priority[(car.shoppingStatus || 'unknown').toLowerCase()] || 99;
    },
    type: 'number',
  },
  {
    key: 'railcarNumber',
    label: 'Car Number',
    getValue: (car: any) => car.railcarNumber,
    type: 'string',
  },
  {
    key: 'qualificationType',
    label: 'Qual Type',
    getValue: (car: any) => car.qualificationType || car.fullPartialQual,
    type: 'string',
  },
];
