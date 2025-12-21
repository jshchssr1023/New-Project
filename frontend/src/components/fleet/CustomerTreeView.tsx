/**
 * Customer Tree View Component
 *
 * Hierarchical view of railcar fleet grouped by customer:
 * - Collapsible customer rows with fleet summary
 * - Shopping status breakdown per customer
 * - Expand to see individual cars with mini-Gantt
 */

import { useState, useMemo } from 'react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  TruckIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';

interface Car {
  id: string;
  railcarNumber: string;
  carType: string;
  isTankCar: boolean;
  commodity: string;
  customer: string;
  customerId?: string;
  shoppingStatus: string;
  status: string;
  assignedShopId?: string;
  projectedCompletionMonth?: string;
  tankQualification?: string;
  minNoLining?: string;
  minWLining?: string;
}

interface CustomerSummary {
  customerId: string;
  customerName: string;
  totalCars: number;
  urgent: number;
  mustShop: number;
  upcoming: number;
  compliant: number;
  inShop: number;
  planned: number;
  cars: Car[];
}

interface CustomerTreeViewProps {
  cars: Car[];
  isLoading?: boolean;
  onCarClick?: (car: Car) => void;
  onCustomerClick?: (customerId: string) => void;
  selectedCarIds?: Set<string>;
  onCarSelect?: (carId: string, selected: boolean) => void;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  Urgent: { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' },
  'Must Shop': { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
  Upcoming: { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
  Compliant: { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  'In Shop': { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  Planned: { bg: 'bg-indigo-100', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  Unknown: { bg: 'bg-steel-100', text: 'text-steel-700', dot: 'bg-steel-500' },
};

export default function CustomerTreeView({
  cars,
  isLoading = false,
  onCarClick,
  onCustomerClick,
  selectedCarIds = new Set(),
  onCarSelect,
}: CustomerTreeViewProps) {
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'totalCars' | 'urgent'>('urgent');

  // Group cars by customer
  const customerSummaries = useMemo(() => {
    const grouped: Record<string, CustomerSummary> = {};

    cars.forEach(car => {
      const customerKey = car.customer || 'Unassigned';
      const customerId = car.customerId || customerKey;

      if (!grouped[customerKey]) {
        grouped[customerKey] = {
          customerId,
          customerName: customerKey,
          totalCars: 0,
          urgent: 0,
          mustShop: 0,
          upcoming: 0,
          compliant: 0,
          inShop: 0,
          planned: 0,
          cars: [],
        };
      }

      grouped[customerKey].totalCars++;
      grouped[customerKey].cars.push(car);

      // Count by shopping status
      switch (car.shoppingStatus) {
        case 'Urgent':
          grouped[customerKey].urgent++;
          break;
        case 'Must Shop':
          grouped[customerKey].mustShop++;
          break;
        case 'Upcoming':
          grouped[customerKey].upcoming++;
          break;
        case 'Compliant':
          grouped[customerKey].compliant++;
          break;
        case 'In Shop':
          grouped[customerKey].inShop++;
          break;
        case 'Planned':
          grouped[customerKey].planned++;
          break;
      }
    });

    // Convert to array and sort
    let summaries = Object.values(grouped);

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      summaries = summaries.filter(s =>
        s.customerName.toLowerCase().includes(term) ||
        s.cars.some(c => c.railcarNumber.toLowerCase().includes(term))
      );
    }

    // Sort
    summaries.sort((a, b) => {
      if (sortBy === 'name') return a.customerName.localeCompare(b.customerName);
      if (sortBy === 'totalCars') return b.totalCars - a.totalCars;
      if (sortBy === 'urgent') return b.urgent - a.urgent;
      return 0;
    });

    return summaries;
  }, [cars, searchTerm, sortBy]);

  const toggleCustomer = (customerName: string) => {
    setExpandedCustomers(prev => {
      const next = new Set(prev);
      if (next.has(customerName)) {
        next.delete(customerName);
      } else {
        next.add(customerName);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedCustomers(new Set(customerSummaries.map(s => s.customerName)));
  };

  const collapseAll = () => {
    setExpandedCustomers(new Set());
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-16 bg-steel-100 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-steel-400" />
          <input
            type="text"
            placeholder="Search customers or car numbers..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="input pl-10 w-full"
          />
        </div>

        <div className="flex items-center gap-3">
          {/* Sort */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as typeof sortBy)}
            className="input text-sm py-1.5"
          >
            <option value="urgent">Sort: Most Urgent</option>
            <option value="totalCars">Sort: Fleet Size</option>
            <option value="name">Sort: Name A-Z</option>
          </select>

          {/* Expand/Collapse */}
          <div className="flex gap-1">
            <button
              onClick={expandAll}
              className="px-3 py-1.5 text-sm text-steel-600 hover:text-steel-900 hover:bg-steel-100 rounded transition-colors"
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              className="px-3 py-1.5 text-sm text-steel-600 hover:text-steel-900 hover:bg-steel-100 rounded transition-colors"
            >
              Collapse All
            </button>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="flex gap-4 text-sm text-steel-600">
        <span>{customerSummaries.length} customers</span>
        <span>|</span>
        <span>{cars.length} total cars</span>
        <span>|</span>
        <span className="text-red-600">{customerSummaries.reduce((sum, s) => sum + s.urgent, 0)} urgent</span>
      </div>

      {/* Customer List */}
      <div className="space-y-2">
        {customerSummaries.length === 0 ? (
          <div className="text-center py-8 text-steel-500">
            <TruckIcon className="h-12 w-12 mx-auto mb-2 text-steel-300" />
            <p>No customers found</p>
          </div>
        ) : (
          customerSummaries.map(summary => {
            const isExpanded = expandedCustomers.has(summary.customerName);

            return (
              <div key={summary.customerName} className="border border-steel-200 rounded-lg overflow-hidden">
                {/* Customer Header */}
                <button
                  onClick={() => toggleCustomer(summary.customerName)}
                  className="w-full flex items-center gap-3 p-3 bg-steel-50 hover:bg-steel-100 transition-colors"
                >
                  {/* Expand Icon */}
                  <div className="text-steel-500">
                    {isExpanded ? (
                      <ChevronDownIcon className="h-5 w-5" />
                    ) : (
                      <ChevronRightIcon className="h-5 w-5" />
                    )}
                  </div>

                  {/* Customer Name */}
                  <div className="flex-1 text-left">
                    <span className="font-semibold text-steel-900">{summary.customerName}</span>
                    <span className="ml-2 text-sm text-steel-500">({summary.totalCars} cars)</span>
                  </div>

                  {/* Status Badges */}
                  <div className="flex items-center gap-2">
                    {summary.urgent > 0 && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                        <ExclamationTriangleIcon className="h-3 w-3" />
                        {summary.urgent}
                      </span>
                    )}
                    {summary.mustShop > 0 && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                        <ClockIcon className="h-3 w-3" />
                        {summary.mustShop}
                      </span>
                    )}
                    {summary.upcoming > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                        {summary.upcoming} upcoming
                      </span>
                    )}
                    {summary.compliant > 0 && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                        <CheckCircleIcon className="h-3 w-3" />
                        {summary.compliant}
                      </span>
                    )}
                  </div>
                </button>

                {/* Expanded Car List */}
                {isExpanded && (
                  <div className="border-t border-steel-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-steel-50 border-b border-steel-200">
                          {onCarSelect && (
                            <th className="w-8 p-2">
                              <input
                                type="checkbox"
                                onChange={(e) => {
                                  summary.cars.forEach(car => {
                                    onCarSelect(car.id, e.target.checked);
                                  });
                                }}
                                className="rounded border-steel-300"
                              />
                            </th>
                          )}
                          <th className="text-left p-2 text-xs font-medium text-steel-500 uppercase">Railcar #</th>
                          <th className="text-left p-2 text-xs font-medium text-steel-500 uppercase">Type</th>
                          <th className="text-left p-2 text-xs font-medium text-steel-500 uppercase">Commodity</th>
                          <th className="text-left p-2 text-xs font-medium text-steel-500 uppercase">Status</th>
                          <th className="text-left p-2 text-xs font-medium text-steel-500 uppercase">Shopping</th>
                          <th className="text-left p-2 text-xs font-medium text-steel-500 uppercase">Qual Due</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-steel-100">
                        {summary.cars.map(car => {
                          const statusColors = STATUS_COLORS[car.shoppingStatus] || STATUS_COLORS.Unknown;
                          const isSelected = selectedCarIds.has(car.id);

                          // Get earliest qual due date
                          const qualDue = car.tankQualification || car.minNoLining || car.minWLining;
                          const qualDueFormatted = qualDue ? new Date(qualDue).toLocaleDateString('en-US', {
                            month: 'short',
                            year: '2-digit',
                          }) : '-';

                          return (
                            <tr
                              key={car.id}
                              className={`hover:bg-steel-50 cursor-pointer ${isSelected ? 'bg-rail-50' : ''}`}
                              onClick={() => onCarClick?.(car)}
                            >
                              {onCarSelect && (
                                <td className="p-2" onClick={e => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={e => onCarSelect(car.id, e.target.checked)}
                                    className="rounded border-steel-300"
                                  />
                                </td>
                              )}
                              <td className="p-2 font-medium text-steel-900">{car.railcarNumber}</td>
                              <td className="p-2 text-steel-700">
                                {car.carType}
                                {car.isTankCar && (
                                  <span className="ml-1 text-xs text-rail-600">(Tank)</span>
                                )}
                              </td>
                              <td className="p-2 text-steel-600">{car.commodity || '-'}</td>
                              <td className="p-2">
                                <span className="inline-flex px-2 py-0.5 rounded-full bg-steel-100 text-steel-700 text-xs">
                                  {car.status || '-'}
                                </span>
                              </td>
                              <td className="p-2">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${statusColors.bg} ${statusColors.text} text-xs font-medium`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${statusColors.dot}`} />
                                  {car.shoppingStatus}
                                </span>
                              </td>
                              <td className="p-2 text-steel-600">{qualDueFormatted}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
