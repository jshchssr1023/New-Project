/**
 * Responsive Data View Component
 *
 * Automatically switches between table and card view based on screen size.
 * - Desktop: Traditional table layout
 * - Mobile: Card-based layout for better touch experience
 */

import { useState, useEffect, ReactNode, useMemo } from 'react';
import { ChevronDownIcon, ChevronUpIcon, FunnelIcon } from '@heroicons/react/24/outline';

// ============================================================================
// TYPES
// ============================================================================

interface Column<T> {
  key: string;
  header: string;
  render: (item: T) => ReactNode;
  sortable?: boolean;
  priority?: 'high' | 'medium' | 'low'; // For mobile, only show high priority in summary
  className?: string;
}

interface ResponsiveDataViewProps<T> {
  data: T[];
  columns: Column<T>[];
  getRowId: (item: T) => string;
  onRowClick?: (item: T) => void;
  selectedId?: string | null;
  isLoading?: boolean;
  emptyMessage?: string;
  sortable?: boolean;
  defaultSort?: { key: string; direction: 'asc' | 'desc' };
  mobileBreakpoint?: number;
  cardTitle?: (item: T) => ReactNode;
  cardSubtitle?: (item: T) => ReactNode;
  cardBadge?: (item: T) => ReactNode;
  cardActions?: (item: T) => ReactNode;
}

type SortDirection = 'asc' | 'desc' | null;

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ResponsiveDataView<T>({
  data,
  columns,
  getRowId,
  onRowClick,
  selectedId,
  isLoading = false,
  emptyMessage = 'No data to display',
  sortable = false,
  defaultSort,
  mobileBreakpoint = 768,
  cardTitle,
  cardSubtitle,
  cardBadge,
  cardActions,
}: ResponsiveDataViewProps<T>) {
  const [isMobile, setIsMobile] = useState(false);
  const [sortKey, setSortKey] = useState<string | null>(defaultSort?.key || null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSort?.direction || null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // Detect mobile breakpoint
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < mobileBreakpoint);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [mobileBreakpoint]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortKey || !sortDirection) return data;

    return [...data].sort((a, b) => {
      const column = columns.find(c => c.key === sortKey);
      if (!column) return 0;

      // Get values - try to extract from rendered content if possible
      const aVal = (a as any)[sortKey];
      const bVal = (b as any)[sortKey];

      // Handle different types
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      // Date handling
      if (aVal instanceof Date && bVal instanceof Date) {
        return sortDirection === 'asc'
          ? aVal.getTime() - bVal.getTime()
          : bVal.getTime() - aVal.getTime();
      }

      return 0;
    });
  }, [data, sortKey, sortDirection, columns]);

  // Handle sort click
  const handleSort = (key: string) => {
    if (!sortable) return;
    if (sortKey === key) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortKey(null);
        setSortDirection(null);
      }
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  // Toggle card expansion
  const toggleCard = (id: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Get high priority columns for mobile summary
  const highPriorityColumns = columns.filter(c => c.priority === 'high' || !c.priority);
  const detailColumns = columns.filter(c => c.priority === 'medium' || c.priority === 'low');

  // Loading state
  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-steel-100 rounded-lg h-16" />
        ))}
      </div>
    );
  }

  // Empty state
  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-steel-500">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  // ============================================================================
  // MOBILE CARD VIEW
  // ============================================================================
  if (isMobile) {
    return (
      <div className="space-y-3" role="list">
        {sortedData.map(item => {
          const id = getRowId(item);
          const isExpanded = expandedCards.has(id);
          const isSelected = selectedId === id;

          return (
            <div
              key={id}
              className={`bg-white rounded-lg border transition-all ${
                isSelected ? 'border-rail-500 ring-1 ring-rail-200' : 'border-steel-200'
              }`}
              role="listitem"
              aria-selected={isSelected}
            >
              {/* Card Header - Always visible */}
              <div
                className={`p-4 ${onRowClick ? 'cursor-pointer active:bg-steel-50' : ''}`}
                onClick={() => onRowClick?.(item)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {cardTitle && (
                      <div className="font-medium text-steel-900 truncate">
                        {cardTitle(item)}
                      </div>
                    )}
                    {cardSubtitle && (
                      <div className="text-sm text-steel-500 truncate mt-0.5">
                        {cardSubtitle(item)}
                      </div>
                    )}
                  </div>
                  {cardBadge && (
                    <div className="flex-shrink-0">{cardBadge(item)}</div>
                  )}
                </div>

                {/* High priority fields in summary */}
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {highPriorityColumns.slice(0, 4).map(col => (
                    <div key={col.key}>
                      <span className="text-steel-500">{col.header}: </span>
                      <span className="text-steel-900">{col.render(item)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Expand/Collapse for details */}
              {detailColumns.length > 0 && (
                <>
                  <button
                    onClick={() => toggleCard(id)}
                    className="w-full px-4 py-2 flex items-center justify-center gap-1 text-sm text-steel-500 hover:text-steel-700 border-t border-steel-100"
                    aria-expanded={isExpanded}
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUpIcon className="h-4 w-4" />
                        Less details
                      </>
                    ) : (
                      <>
                        <ChevronDownIcon className="h-4 w-4" />
                        More details
                      </>
                    )}
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 space-y-2 border-t border-steel-100 bg-steel-50">
                      {detailColumns.map(col => (
                        <div key={col.key} className="text-sm">
                          <span className="text-steel-500">{col.header}: </span>
                          <span className="text-steel-900">{col.render(item)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Card Actions */}
              {cardActions && (
                <div className="px-4 py-3 border-t border-steel-100 bg-steel-50 rounded-b-lg">
                  {cardActions(item)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ============================================================================
  // DESKTOP TABLE VIEW
  // ============================================================================
  return (
    <div className="bg-white rounded-lg border border-steel-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-steel-200" role="table">
          <thead className="bg-steel-50">
            <tr role="row">
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-xs font-semibold text-steel-600 uppercase tracking-wider ${
                    sortable && col.sortable !== false ? 'cursor-pointer hover:bg-steel-100 select-none' : ''
                  } ${col.className || ''}`}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                  role="columnheader"
                  aria-sort={
                    sortKey === col.key
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                >
                  <div className="flex items-center gap-1">
                    {col.header}
                    {sortable && col.sortable !== false && (
                      <span className="flex flex-col">
                        <ChevronUpIcon
                          className={`h-3 w-3 -mb-1 ${
                            sortKey === col.key && sortDirection === 'asc'
                              ? 'text-rail-600'
                              : 'text-steel-300'
                          }`}
                        />
                        <ChevronDownIcon
                          className={`h-3 w-3 ${
                            sortKey === col.key && sortDirection === 'desc'
                              ? 'text-rail-600'
                              : 'text-steel-300'
                          }`}
                        />
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-steel-100" role="rowgroup">
            {sortedData.map(item => {
              const id = getRowId(item);
              const isSelected = selectedId === id;

              return (
                <tr
                  key={id}
                  className={`${onRowClick ? 'cursor-pointer hover:bg-steel-50' : ''} ${
                    isSelected ? 'bg-rail-50' : ''
                  }`}
                  onClick={() => onRowClick?.(item)}
                  role="row"
                  aria-selected={isSelected}
                >
                  {columns.map(col => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 text-sm text-steel-900 ${col.className || ''}`}
                      role="cell"
                    >
                      {col.render(item)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// SIMPLE MOBILE CARD COMPONENT
// ============================================================================

interface MobileCardProps {
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  fields: Array<{ label: string; value: ReactNode }>;
  onClick?: () => void;
  isSelected?: boolean;
  actions?: ReactNode;
}

export function MobileCard({
  title,
  subtitle,
  badge,
  fields,
  onClick,
  isSelected,
  actions,
}: MobileCardProps) {
  return (
    <div
      className={`bg-white rounded-lg border p-4 ${
        onClick ? 'cursor-pointer active:bg-steel-50' : ''
      } ${isSelected ? 'border-rail-500 ring-1 ring-rail-200' : 'border-steel-200'}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-steel-900 truncate">{title}</div>
          {subtitle && (
            <div className="text-sm text-steel-500 truncate mt-0.5">{subtitle}</div>
          )}
        </div>
        {badge && <div className="flex-shrink-0">{badge}</div>}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {fields.map((field, i) => (
          <div key={i}>
            <span className="text-steel-500">{field.label}: </span>
            <span className="text-steel-900">{field.value}</span>
          </div>
        ))}
      </div>

      {actions && (
        <div className="mt-4 pt-3 border-t border-steel-100">{actions}</div>
      )}
    </div>
  );
}
