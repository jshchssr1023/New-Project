import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface CarFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  carTypeFilter: string;
  onCarTypeChange: (value: string) => void;
  customerFilter: string;
  onCustomerChange: (value: string) => void;
  reasonFilter: string;
  onReasonChange: (value: string) => void;
  shoppingStatusFilter?: string;
  onShoppingStatusChange?: (value: string) => void;
  qualTypeFilter?: string;
  onQualTypeChange?: (value: string) => void;
  customers: string[];
  carTypeOptions: string[];
  reasonOptions: string[];
  totalCount: number;
  onClearFilters?: () => void;
}

export default function CarFilters({
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusChange,
  carTypeFilter,
  onCarTypeChange,
  customerFilter,
  onCustomerChange,
  reasonFilter,
  onReasonChange,
  shoppingStatusFilter,
  onShoppingStatusChange,
  qualTypeFilter,
  onQualTypeChange,
  customers,
  carTypeOptions,
  reasonOptions,
  totalCount,
  onClearFilters,
}: CarFiltersProps) {
  const hasFilters = statusFilter || carTypeFilter || customerFilter || reasonFilter || shoppingStatusFilter || qualTypeFilter;

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <MagnifyingGlassIcon className="h-5 w-5 text-steel-400" />
        </div>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by railcar #, customer, project #, commodity, or car type..."
          className="input pl-10 w-full"
        />
        {searchTerm && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute inset-y-0 right-0 pr-3 flex items-center"
          >
            <XMarkIcon className="h-5 w-5 text-steel-400 hover:text-steel-600" />
          </button>
        )}
      </div>

      {/* Filter Row */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center space-x-3 flex-wrap gap-2">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => onStatusChange(e.target.value)}
            className={`input w-36 ${statusFilter ? 'border-rail-500 bg-rail-50' : ''}`}
          >
            <option value="">All Status</option>
            <option value="available">Available</option>
            <option value="planned">Planned</option>
            <option value="scheduled">Scheduled</option>
            <option value="release">Release</option>
            <option value="assignment">Assignment</option>
            <option value="arrived">Arrived</option>
            <option value="in_service">In Service</option>
            <option value="in_shop">In Shop</option>
            <option value="retired">Retired</option>
          </select>

          {/* Car Type Filter */}
          <select
            value={carTypeFilter}
            onChange={(e) => onCarTypeChange(e.target.value)}
            className={`input w-40 ${carTypeFilter ? 'border-rail-500 bg-rail-50' : ''}`}
          >
            <option value="">All Car Types</option>
            {carTypeOptions.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>

          {/* Customer Filter */}
          <select
            value={customerFilter}
            onChange={(e) => onCustomerChange(e.target.value)}
            className={`input w-40 ${customerFilter ? 'border-rail-500 bg-rail-50' : ''}`}
          >
            <option value="">All Customers</option>
            {customers.map(customer => (
              <option key={customer} value={customer}>{customer}</option>
            ))}
          </select>

          {/* Reason Filter */}
          <select
            value={reasonFilter}
            onChange={(e) => onReasonChange(e.target.value)}
            className={`input w-44 ${reasonFilter ? 'border-rail-500 bg-rail-50' : ''}`}
          >
            <option value="">All Reasons</option>
            {reasonOptions.map(reason => (
              <option key={reason} value={reason}>{reason}</option>
            ))}
          </select>

          {/* Shopping Status Filter (for qualification view) */}
          {onShoppingStatusChange && (
            <select
              value={shoppingStatusFilter || ''}
              onChange={(e) => onShoppingStatusChange(e.target.value)}
              className={`input w-44 ${shoppingStatusFilter ? 'border-rail-500 bg-rail-50' : ''}`}
            >
              <option value="">All Shopping Status</option>
              <option value="urgent">Urgent (Prior Year)</option>
              <option value="must_shop">Must Shop This Year</option>
              <option value="upcoming">Upcoming (Next Year)</option>
              <option value="compliant">Compliant</option>
            </select>
          )}

          {/* Full/Partial Qual Filter */}
          {onQualTypeChange && (
            <select
              value={qualTypeFilter || ''}
              onChange={(e) => onQualTypeChange(e.target.value)}
              className={`input w-36 ${qualTypeFilter ? 'border-rail-500 bg-rail-50' : ''}`}
            >
              <option value="">All Qual Types</option>
              <option value="Full">Full</option>
              <option value="Partial">Partial</option>
            </select>
          )}

          {/* Count & Clear */}
          <span className="text-sm text-steel-500">{totalCount} cars</span>

          {hasFilters && onClearFilters && (
            <button
              onClick={onClearFilters}
              className="text-sm text-rail-600 hover:text-rail-800 font-medium"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
