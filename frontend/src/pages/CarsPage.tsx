import { useState, useCallback, useMemo, useEffect, useRef, lazy, Suspense } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  PlusIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  Squares2X2Icon,
  ListBulletIcon,
  FunnelIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
  ChevronUpDownIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from '@heroicons/react/24/outline';
import { useCars } from '../hooks/useCars';
import { useToast } from '../contexts/ToastContext';
import BulkActionsBar from '../components/cars/BulkActionsBar';
import HierarchicalFilter from '../components/cars/HierarchicalFilter';
import ShoppingStatusBadge, { getShoppingStatus } from '../components/cars/ShoppingStatusBadge';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { CarCardGridSkeleton, TableSkeleton } from '../components/ui/LoadingSkeleton';
import ErrorMessage from '../components/ui/ErrorMessage';
import { Slicer, SlicerBar, CompactCarCard, CompactCarCardGrid, CarDetailModal, EmptyState, CustomerCard, CustomerCardGrid } from '../components/ui';
import { TruckIcon } from '@heroicons/react/24/outline';
import type { Car } from '../types';
import { carsApi, servicePlansApi } from '../services/api';
import type { ServicePlan } from '../services/api/servicePlans';
import { CAR_TYPE_OPTIONS, REASON_OPTIONS, STATUS_COLORS, CAR_STATUS_OPTIONS, PLANNING_STATUS_OPTIONS } from '../constants/carOptions';

// Lazy load modals
const ImportModal = lazy(() => import('../components/cars/ImportModal'));
const CarFormModal = lazy(() => import('../components/cars/CarFormModal'));

// View mode type
type ViewMode = 'customers' | 'cards' | 'table';

// Page size type
type PageSize = 25 | 50 | 100;

// Sort configuration
interface SortConfig {
  field: string;
  direction: 'asc' | 'desc';
}

// Sort options for card views
const SORT_OPTIONS = [
  { value: 'railcarNumber', label: 'Railcar #' },
  { value: 'customer', label: 'Customer' },
  { value: 'shoppingStatus', label: 'Shopping Status' },
  { value: 'nextDueDate', label: 'Due Date' },
  { value: 'carType', label: 'Car Type' },
  { value: 'status', label: 'Status' },
];

// Local storage keys
const STORAGE_KEYS = {
  viewMode: 'carsPage_viewMode',
  pageSize: 'carsPage_pageSize',
  sortField: 'carsPage_sortField',
  sortDirection: 'carsPage_sortDirection',
};

// Get earliest due date from a car
function getEarliestDueDate(car: Car): Date | null {
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
  ].filter(Boolean).map(d => new Date(d!)).filter(d => !isNaN(d.getTime()));

  if (dates.length === 0) return null;
  return dates.sort((a, b) => a.getTime() - b.getTime())[0];
}

// Sort cars by field
function sortCars(cars: Car[], sorts: SortConfig[]): Car[] {
  if (sorts.length === 0) return cars;

  return [...cars].sort((a, b) => {
    for (const sort of sorts) {
      let comparison = 0;

      switch (sort.field) {
        case 'railcarNumber':
          comparison = (a.railcarNumber || '').localeCompare(b.railcarNumber || '');
          break;
        case 'customer':
          comparison = (a.customer || '').localeCompare(b.customer || '');
          break;
        case 'shoppingStatus': {
          const statusOrder: Record<string, number> = { 'Urgent': 0, 'Must Shop': 1, 'Upcoming': 2, 'Compliant': 3, 'Unknown': 4 };
          const aStatus = getShoppingStatus(a as any);
          const bStatus = getShoppingStatus(b as any);
          comparison = (statusOrder[aStatus] ?? 5) - (statusOrder[bStatus] ?? 5);
          break;
        }
        case 'nextDueDate': {
          const aDate = getEarliestDueDate(a);
          const bDate = getEarliestDueDate(b);
          if (!aDate && !bDate) comparison = 0;
          else if (!aDate) comparison = 1;
          else if (!bDate) comparison = -1;
          else comparison = aDate.getTime() - bDate.getTime();
          break;
        }
        case 'carType':
          comparison = (a.carType || '').localeCompare(b.carType || '');
          break;
        case 'status':
          comparison = (a.status || '').localeCompare(b.status || '');
          break;
        case 'projectNumber':
          comparison = (a.projectNumber || '').localeCompare(b.projectNumber || '');
          break;
        case 'safetyRelief':
        case 'serviceEquipment':
        case 'tankQualification': {
          const aVal = (a as any)[sort.field];
          const bVal = (b as any)[sort.field];
          const aTime = aVal ? new Date(aVal).getTime() : Infinity;
          const bTime = bVal ? new Date(bVal).getTime() : Infinity;
          comparison = aTime - bTime;
          break;
        }
        default:
          comparison = 0;
      }

      if (comparison !== 0) {
        return sort.direction === 'asc' ? comparison : -comparison;
      }
    }
    return 0;
  });
}

export default function CarsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  // Initialize from localStorage/URL
  const getInitialViewMode = (): ViewMode => {
    const urlView = searchParams.get('view') as ViewMode;
    if (urlView && ['customers', 'cards', 'table'].includes(urlView)) return urlView;
    const stored = localStorage.getItem(STORAGE_KEYS.viewMode) as ViewMode;
    if (stored && ['customers', 'cards', 'table'].includes(stored)) return stored;
    return 'cards';
  };

  const getInitialPageSize = (): PageSize => {
    const urlSize = parseInt(searchParams.get('pageSize') || '');
    if ([25, 50, 100].includes(urlSize)) return urlSize as PageSize;
    const stored = parseInt(localStorage.getItem(STORAGE_KEYS.pageSize) || '');
    if ([25, 50, 100].includes(stored)) return stored as PageSize;
    return 25;
  };

  const getInitialSort = (): SortConfig[] => {
    const urlSort = searchParams.get('sort');
    const urlDir = searchParams.get('sortDir');
    if (urlSort) {
      return [{ field: urlSort, direction: (urlDir as 'asc' | 'desc') || 'asc' }];
    }
    const storedField = localStorage.getItem(STORAGE_KEYS.sortField);
    const storedDir = localStorage.getItem(STORAGE_KEYS.sortDirection);
    if (storedField) {
      return [{ field: storedField, direction: (storedDir as 'asc' | 'desc') || 'asc' }];
    }
    return [{ field: 'railcarNumber', direction: 'asc' }];
  };

  // View mode: 'customers', 'cards', or 'table'
  const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode);

  // Page size: 25, 50, or 100
  const [pageSize, setPageSize] = useState<PageSize>(getInitialPageSize);

  // Sort configuration (supports multi-column for table)
  const [sortConfigs, setSortConfigs] = useState<SortConfig[]>(getInitialSort);

  // Sidebar visibility
  const [showSidebar, setShowSidebar] = useState(true);

  // Expanded customer IDs (for customer view)
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());

  // Hierarchical filter state
  const [hierarchicalFilter, setHierarchicalFilter] = useState<{
    customer: string | null;
    projectNumber: string | null;
    carIds: string[];
  }>({ customer: null, projectNumber: null, carIds: [] });

  // Modal states
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingCar, setEditingCar] = useState<Car | null>(null);
  const [viewingCar, setViewingCar] = useState<Car | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; carId: string | null; isBulk: boolean }>({
    isOpen: false,
    carId: null,
    isBulk: false,
  });

  // Service plans for bulk action dropdown
  const [servicePlans, setServicePlans] = useState<ServicePlan[]>([]);
  const [isAddingToServicePlan, setIsAddingToServicePlan] = useState(false);

  // Use custom hook for car data management
  const {
    cars,
    totalCars,
    totalPages,
    currentPage,
    isLoading,
    error,
    filters,
    updateFilters,
    clearFilters,
    filterOptions,
    selectedCarIds,
    toggleSelection,
    selectAll,
    clearSelection,
    selectedCars,
    createCar,
    updateCar,
    deleteCar,
    bulkUpdate,
    bulkDelete,
    importCars,
    isDeleting,
    isBulkDeleting,
    refetch,
  } = useCars({ initialPageSize: pageSize });

  // Persist view mode, page size, and sort to localStorage and URL
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.viewMode, viewMode);
    localStorage.setItem(STORAGE_KEYS.pageSize, pageSize.toString());
    if (sortConfigs.length > 0) {
      localStorage.setItem(STORAGE_KEYS.sortField, sortConfigs[0].field);
      localStorage.setItem(STORAGE_KEYS.sortDirection, sortConfigs[0].direction);
    }

    // Update URL params
    const newParams = new URLSearchParams(searchParams);
    newParams.set('view', viewMode);
    newParams.set('pageSize', pageSize.toString());
    if (sortConfigs.length > 0) {
      newParams.set('sort', sortConfigs[0].field);
      newParams.set('sortDir', sortConfigs[0].direction);
    }
    // Preserve other params
    if (filters.status) newParams.set('status', filters.status);
    if (filters.search) newParams.set('search', filters.search);
    if (filters.customer) newParams.set('customer', filters.customer);
    if (filters.carType) newParams.set('carType', filters.carType);

    setSearchParams(newParams, { replace: true });
  }, [viewMode, pageSize, sortConfigs]);

  // Handle URL params - only run once on mount
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const urlStatus = searchParams.get('status');
    const urlSearch = searchParams.get('search');
    const urlCarId = searchParams.get('carId');
    const urlCustomer = searchParams.get('customer');
    const urlCarType = searchParams.get('carType');

    if (urlStatus) updateFilters({ status: urlStatus });
    if (urlSearch) updateFilters({ search: urlSearch });
    if (urlCustomer) updateFilters({ customer: urlCustomer });
    if (urlCarType) updateFilters({ carType: urlCarType });

    // Auto-open car detail modal if carId is provided
    if (urlCarId) {
      carsApi.getById(urlCarId).then((car) => {
        setViewingCar(car);
      }).catch((err) => {
        console.error('Failed to load car for detail view:', err);
      });
    }
  }, [searchParams, updateFilters]);

  // Load service plans for the bulk action dropdown
  useEffect(() => {
    const loadServicePlans = async () => {
      try {
        const plans = await servicePlansApi.getAll({ status: 'draft' });
        const proposedPlans = await servicePlansApi.getAll({ status: 'proposed' });
        setServicePlans([...plans, ...proposedPlans]);
      } catch (err) {
        console.error('Failed to load service plans:', err);
      }
    };
    loadServicePlans();
  }, []);

  // Filtered and sorted cars
  const displayedCars = useMemo(() => {
    let result = cars;

    // Apply hierarchical filter
    if (hierarchicalFilter.carIds.length > 0) {
      const idSet = new Set(hierarchicalFilter.carIds);
      result = result.filter(c => idSet.has(c.id));
    }

    // Apply sorting
    result = sortCars(result, sortConfigs);

    return result;
  }, [cars, hierarchicalFilter.carIds, sortConfigs]);

  // Group cars by customer for customer view
  const customerGroups = useMemo(() => {
    const groups = new Map<string, Car[]>();

    for (const car of displayedCars) {
      const customer = car.customer || 'Unknown Customer';
      if (!groups.has(customer)) {
        groups.set(customer, []);
      }
      groups.get(customer)!.push(car);
    }

    // Sort groups by customer name
    return Array.from(groups.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([customer, groupCars]) => ({ customer, cars: groupCars }));
  }, [displayedCars]);

  // Determine card size based on page size
  const cardSize = useMemo((): 'large' | 'medium' | 'compact' => {
    if (pageSize <= 25) return 'large';
    if (pageSize <= 50) return 'medium';
    return 'compact';
  }, [pageSize]);

  // Grid columns based on page size
  const gridColumns = useMemo((): 2 | 3 | 4 | 5 | 6 => {
    if (pageSize <= 25) return 4;
    if (pageSize <= 50) return 5;
    return 6;
  }, [pageSize]);

  // Export handler
  const handleExport = async (exportSelected: boolean = false) => {
    try {
      await carsApi.exportCars({
        ids: exportSelected && selectedCarIds.size > 0 ? Array.from(selectedCarIds) : undefined,
        status: filters.status,
        customer: filters.customer,
        carType: filters.carType,
      });
      showToast('Export started successfully', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export failed';
      showToast(`Export failed: ${message}`, 'error');
    }
  };

  // Form handlers
  const handleOpenForm = (car?: Car) => {
    setEditingCar(car || null);
    setIsFormModalOpen(true);
  };

  const handleFormSubmit = async (data: Partial<Car>) => {
    if (editingCar) {
      await updateCar(editingCar.id, data);
    } else {
      await createCar(data);
    }
  };

  // Delete handlers
  const handleDeleteClick = (carId: string) => {
    setDeleteConfirm({ isOpen: true, carId, isBulk: false });
  };

  const handleBulkDeleteClick = () => {
    setDeleteConfirm({ isOpen: true, carId: null, isBulk: true });
  };

  const handleConfirmDelete = async () => {
    if (deleteConfirm.isBulk) {
      await bulkDelete(Array.from(selectedCarIds));
    } else if (deleteConfirm.carId) {
      await deleteCar(deleteConfirm.carId);
    }
    setDeleteConfirm({ isOpen: false, carId: null, isBulk: false });
  };

  // Add selected cars to an existing service plan
  const handleAddToServicePlan = async (servicePlanId: string) => {
    setIsAddingToServicePlan(true);
    try {
      const carIds = Array.from(selectedCarIds);
      await servicePlansApi.addCars(servicePlanId, carIds);
      showToast(`Added ${carIds.length} car(s) to service plan`, 'success');
      clearSelection();
      navigate(`/service-plans/${servicePlanId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add cars to service plan';
      showToast(message, 'error');
    } finally {
      setIsAddingToServicePlan(false);
    }
  };

  // Hierarchical filter handler
  const handleHierarchicalFilterChange = useCallback((newFilter: typeof hierarchicalFilter) => {
    setHierarchicalFilter(newFilter);
  }, []);

  // Clear all filters
  const handleClearAllFilters = () => {
    clearFilters();
    setHierarchicalFilter({ customer: null, projectNumber: null, carIds: [] });
  };

  // Page size change
  const handlePageSizeChange = (newSize: PageSize) => {
    setPageSize(newSize);
    updateFilters({ pageSize: newSize, page: 1 });
  };

  // View mode change
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    // Collapse all customers when switching away from customer view
    if (mode !== 'customers') {
      setExpandedCustomers(new Set());
    }
  };

  // Sort change for card views
  const handleSortChange = (field: string) => {
    setSortConfigs(prev => {
      const existing = prev.find(s => s.field === field);
      if (existing) {
        // Toggle direction
        return [{ field, direction: existing.direction === 'asc' ? 'desc' : 'asc' }];
      }
      return [{ field, direction: 'asc' }];
    });
  };

  // Table column sort (supports multi-column with Shift)
  const handleTableSort = (field: string, addToExisting: boolean) => {
    setSortConfigs(prev => {
      const existingIndex = prev.findIndex(s => s.field === field);

      if (addToExisting) {
        // Multi-column sort with Shift+click
        if (existingIndex >= 0) {
          // Toggle direction of existing sort
          const newConfigs = [...prev];
          newConfigs[existingIndex] = {
            ...newConfigs[existingIndex],
            direction: newConfigs[existingIndex].direction === 'asc' ? 'desc' : 'asc',
          };
          return newConfigs;
        } else {
          // Add new sort column
          return [...prev, { field, direction: 'asc' as const }];
        }
      } else {
        // Single column sort
        if (existingIndex >= 0 && prev.length === 1) {
          // Toggle direction
          return [{ field, direction: prev[0].direction === 'asc' ? 'desc' : 'asc' }];
        }
        return [{ field, direction: 'asc' }];
      }
    });
  };

  // Toggle customer expansion
  const toggleCustomerExpand = (customer: string) => {
    setExpandedCustomers(prev => {
      const next = new Set(prev);
      if (next.has(customer)) {
        next.delete(customer);
      } else {
        next.add(customer);
      }
      return next;
    });
  };

  if (error) {
    return (
      <div className="max-w-2xl mx-auto mt-12">
        <ErrorMessage
          title="Failed to load cars"
          message="We couldn't load the railcar fleet data."
          details={error instanceof Error ? error.message : 'Unknown error'}
          onRetry={refetch}
          variant="card"
        />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-140px)]">
      {/* Sidebar - Hierarchical Filter */}
      {showSidebar && (
        <div className="w-72 flex-shrink-0 border-r border-steel-200 bg-white overflow-hidden flex flex-col">
          <div className="p-4">
            <HierarchicalFilter
              cars={cars}
              onFilterChange={handleHierarchicalFilterChange}
              selectedCustomer={hierarchicalFilter.customer}
              selectedProject={hierarchicalFilter.projectNumber}
            />
          </div>

          {/* Shopping Status Summary */}
          <div className="p-4 border-t border-steel-200">
            <h3 className="text-sm font-semibold text-steel-900 mb-3">Shopping Status</h3>
            <div className="space-y-2">
              <ShoppingStatusSummary cars={displayedCars} status="Urgent" onClick={() => updateFilters({ shoppingStatus: 'Urgent' })} isActive={filters.shoppingStatus === 'Urgent'} />
              <ShoppingStatusSummary cars={displayedCars} status="Must Shop" onClick={() => updateFilters({ shoppingStatus: 'Must Shop' })} isActive={filters.shoppingStatus === 'Must Shop'} />
              <ShoppingStatusSummary cars={displayedCars} status="Upcoming" onClick={() => updateFilters({ shoppingStatus: 'Upcoming' })} isActive={filters.shoppingStatus === 'Upcoming'} />
              <ShoppingStatusSummary cars={displayedCars} status="Compliant" onClick={() => updateFilters({ shoppingStatus: 'Compliant' })} isActive={filters.shoppingStatus === 'Compliant'} />
            </div>
          </div>
        </div>
      )}

      {/* Sidebar Toggle */}
      <button
        onClick={() => setShowSidebar(!showSidebar)}
        className="w-6 bg-steel-100 hover:bg-steel-200 flex items-center justify-center border-r border-steel-200 flex-shrink-0"
      >
        {showSidebar ? (
          <ChevronLeftIcon className="w-4 h-4 text-steel-600" />
        ) : (
          <FunnelIcon className="w-4 h-4 text-steel-600" />
        )}
      </button>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-steel-200 bg-white">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-steel-900">Railcar Fleet</h1>
              <p className="text-sm text-steel-500">
                {hierarchicalFilter.customer ? (
                  <>
                    Viewing: <span className="font-medium">{hierarchicalFilter.customer}</span>
                    {hierarchicalFilter.projectNumber && (
                      <> / <span className="font-semibold">{hierarchicalFilter.projectNumber}</span></>
                    )}
                  </>
                ) : (
                  'Manage your railcar fleet and regulatory qualifications'
                )}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* View Toggle - 3 options */}
              <div className="flex items-center border border-steel-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => handleViewModeChange('customers')}
                  className={`p-2 ${viewMode === 'customers' ? 'bg-rail-100 text-rail-700' : 'text-steel-500 hover:bg-steel-50'}`}
                  title="Customer View"
                >
                  <UserGroupIcon className="h-5 w-5" />
                </button>
                <button
                  onClick={() => handleViewModeChange('cards')}
                  className={`p-2 ${viewMode === 'cards' ? 'bg-rail-100 text-rail-700' : 'text-steel-500 hover:bg-steel-50'}`}
                  title="Card View"
                >
                  <Squares2X2Icon className="h-5 w-5" />
                </button>
                <button
                  onClick={() => handleViewModeChange('table')}
                  className={`p-2 ${viewMode === 'table' ? 'bg-rail-100 text-rail-700' : 'text-steel-500 hover:bg-steel-50'}`}
                  title="Table View"
                >
                  <ListBulletIcon className="h-5 w-5" />
                </button>
              </div>

              <button
                onClick={() => handleExport(false)}
                className="btn-secondary flex items-center"
              >
                <ArrowDownTrayIcon className="mr-2 h-5 w-5" />
                Export
              </button>
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="btn-secondary flex items-center"
              >
                <ArrowUpTrayIcon className="mr-2 h-5 w-5" />
                Import
              </button>
              <button
                onClick={() => handleOpenForm()}
                className="btn-primary flex items-center"
              >
                <PlusIcon className="mr-2 h-5 w-5" />
                Add Railcar
              </button>
            </div>
          </div>

          {/* Slicer Filter Bar + Sort */}
          <div className="flex items-center gap-4">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-steel-400" />
              <input
                type="text"
                placeholder="Search car #, customer, project..."
                value={filters.search || ''}
                onChange={(e) => updateFilters({ search: e.target.value })}
                className="input w-full pl-9 py-2"
              />
            </div>

            {/* Sort Dropdown (for card/customer views) */}
            {viewMode !== 'table' && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-steel-500">Sort:</span>
                <select
                  value={sortConfigs[0]?.field || 'railcarNumber'}
                  onChange={(e) => handleSortChange(e.target.value)}
                  className="input text-sm py-1.5 pr-8"
                >
                  {SORT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => handleSortChange(sortConfigs[0]?.field || 'railcarNumber')}
                  className="p-1.5 text-steel-500 hover:text-steel-700 hover:bg-steel-100 rounded"
                  title={`Sort ${sortConfigs[0]?.direction === 'asc' ? 'Descending' : 'Ascending'}`}
                >
                  {sortConfigs[0]?.direction === 'asc' ? (
                    <ArrowUpIcon className="h-4 w-4" />
                  ) : (
                    <ArrowDownIcon className="h-4 w-4" />
                  )}
                </button>
              </div>
            )}

            {/* Slicer Filters */}
            <SlicerBar>
              <Slicer
                label="Planning"
                options={PLANNING_STATUS_OPTIONS.map(p => ({ value: p.value, label: p.label }))}
                value={filters.planningStatus || ''}
                onChange={(v) => updateFilters({ planningStatus: (v || undefined) as 'needs_planning' | 'already_planned' | 'all' | undefined })}
                placeholder="All"
                size="sm"
              />
              <Slicer
                label="Car Type"
                options={filterOptions.carTypes.length > 0
                  ? filterOptions.carTypes.map(t => ({ value: t, label: t }))
                  : CAR_TYPE_OPTIONS.map(t => ({ value: t, label: t }))}
                value={filters.carType || ''}
                onChange={(v) => updateFilters({ carType: v as string })}
                placeholder="All"
                size="sm"
              />
              <Slicer
                label="Status"
                options={CAR_STATUS_OPTIONS.map(s => ({ value: s.value, label: s.label }))}
                value={filters.status || ''}
                onChange={(v) => updateFilters({ status: v as string })}
                placeholder="All"
                size="sm"
              />
              <Slicer
                label="Customer"
                options={filterOptions.customers.map(c => ({ value: c, label: c }))}
                value={filters.customer || ''}
                onChange={(v) => updateFilters({ customer: v as string })}
                placeholder="All"
                size="sm"
              />
              <Slicer
                label="Reason"
                options={filterOptions.reasons.length > 0
                  ? filterOptions.reasons.map(r => ({ value: r, label: r }))
                  : REASON_OPTIONS.map(r => ({ value: r, label: r }))}
                value={filters.reasonsShopped || ''}
                onChange={(v) => updateFilters({ reasonsShopped: v as string })}
                placeholder="All"
                size="sm"
              />
            </SlicerBar>

            {/* Clear Filters */}
            {(filters.search || filters.carType || filters.status || filters.customer || filters.reasonsShopped || filters.planningStatus || filters.shoppingStatus) && (
              <button
                onClick={handleClearAllFilters}
                className="text-sm text-crimson-600 hover:text-crimson-700 font-medium"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Bulk Actions */}
          {selectedCarIds.size > 0 && (
            <div className="mt-4">
              <BulkActionsBar
                selectedCount={selectedCarIds.size}
                onExportSelected={() => handleExport(true)}
                onBulkStatusUpdate={(status) => bulkUpdate(Array.from(selectedCarIds), { status })}
                onBulkDelete={handleBulkDeleteClick}
                onClearSelection={clearSelection}
                servicePlans={servicePlans.map(plan => ({
                  id: plan.id,
                  name: plan.name,
                  customerName: plan.customer?.name,
                }))}
                onAddToServicePlan={handleAddToServicePlan}
                isExporting={isAddingToServicePlan}
              />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            viewMode === 'table' ? (
              <TableSkeleton rows={10} columns={10} />
            ) : (
              <CarCardGridSkeleton count={pageSize} />
            )
          ) : displayedCars.length === 0 ? (
            <EmptyState
              icon={TruckIcon}
              title="No cars found"
              description="No railcars match your current filters. Try adjusting your search or filters."
              action={{
                label: 'Clear all filters',
                onClick: handleClearAllFilters,
              }}
            />
          ) : viewMode === 'customers' ? (
            // Customer View
            <CustomerCardGrid>
              {customerGroups.map(({ customer, cars: groupCars }) => (
                <CustomerCard
                  key={customer}
                  customer={customer}
                  cars={groupCars}
                  selectedCarIds={selectedCarIds}
                  onToggleSelection={toggleSelection}
                  onViewCarDetails={(c) => setViewingCar(c)}
                  isExpanded={expandedCustomers.has(customer)}
                  onToggleExpand={() => toggleCustomerExpand(customer)}
                  cardSize={cardSize}
                />
              ))}
            </CustomerCardGrid>
          ) : viewMode === 'cards' ? (
            // Card View
            <CompactCarCardGrid columns={gridColumns}>
              {displayedCars.map((car) => (
                <CompactCarCard
                  key={car.id}
                  car={car}
                  isSelected={selectedCarIds.has(car.id)}
                  onSelect={() => toggleSelection(car.id)}
                  onViewDetails={(c) => setViewingCar(c)}
                />
              ))}
            </CompactCarCardGrid>
          ) : (
            // Table View
            <TableView
              cars={displayedCars}
              selectedCarIds={selectedCarIds}
              onToggleSelection={toggleSelection}
              onSelectAll={selectAll}
              onEdit={handleOpenForm}
              onDelete={handleDeleteClick}
              sortConfigs={sortConfigs}
              onSort={handleTableSort}
            />
          )}
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-steel-200 bg-white flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm text-steel-600">
              Showing {displayedCars.length} of {totalCars} cars
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-steel-500">Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value) as PageSize)}
                className="input text-sm py-1 w-20"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-steel-500">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => updateFilters({ page: currentPage - 1 })}
              disabled={currentPage === 1}
              className="btn-secondary py-1 px-2 disabled:opacity-50"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => updateFilters({ page: currentPage + 1 })}
              disabled={currentPage === totalPages}
              className="btn-secondary py-1 px-2 disabled:opacity-50"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      <Suspense fallback={null}>
        <ImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onImport={importCars}
        />
        <CarFormModal
          isOpen={isFormModalOpen}
          onClose={() => {
            setIsFormModalOpen(false);
            setEditingCar(null);
          }}
          onSubmit={handleFormSubmit}
          editingCar={editingCar}
          carTypeOptions={CAR_TYPE_OPTIONS}
          reasonOptions={REASON_OPTIONS}
        />
      </Suspense>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, carId: null, isBulk: false })}
        onConfirm={handleConfirmDelete}
        title={deleteConfirm.isBulk ? `Delete ${selectedCarIds.size} Railcars?` : 'Delete Railcar?'}
        message={
          deleteConfirm.isBulk
            ? `Are you sure you want to delete ${selectedCarIds.size} selected railcars? This action cannot be undone.`
            : 'Are you sure you want to delete this railcar? This action cannot be undone.'
        }
        confirmText="Delete"
        variant="danger"
        isLoading={isDeleting || isBulkDeleting}
      />

      {/* Car Detail Modal */}
      <CarDetailModal
        isOpen={viewingCar !== null}
        onClose={() => {
          setViewingCar(null);
          // Clear carId from URL if present
          if (searchParams.get('carId')) {
            const newParams = new URLSearchParams(searchParams);
            newParams.delete('carId');
            navigate(`/cars${newParams.toString() ? '?' + newParams.toString() : ''}`, { replace: true });
          }
        }}
        car={viewingCar}
      />
    </div>
  );
}

// Shopping Status Summary Component
function ShoppingStatusSummary({
  cars,
  status,
  onClick,
  isActive,
}: {
  cars: Car[];
  status: 'Urgent' | 'Must Shop' | 'Upcoming' | 'Compliant';
  onClick: () => void;
  isActive: boolean;
}) {
  const count = cars.filter(car => getShoppingStatus(car as any) === status).length;

  const labels: Record<string, string> = {
    'Urgent': 'Urgent (Prior Year)',
    'Must Shop': 'Must Shop This Year',
    'Upcoming': 'Upcoming (Next Year)',
    'Compliant': 'Compliant',
  };

  const colors: Record<string, string> = {
    'Urgent': 'bg-red-100 text-red-700 border-red-200',
    'Must Shop': 'bg-amber-100 text-amber-700 border-amber-200',
    'Upcoming': 'bg-blue-100 text-blue-700 border-blue-200',
    'Compliant': 'bg-green-100 text-green-700 border-green-200',
  };

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between p-2 rounded-lg border transition-colors ${
        isActive ? colors[status] : 'border-steel-200 hover:bg-steel-50'
      }`}
    >
      <span className="text-sm font-medium">{labels[status]}</span>
      <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${colors[status]}`}>
        {count}
      </span>
    </button>
  );
}

// Table View Component with Multi-Column Sorting
function TableView({
  cars,
  selectedCarIds,
  onToggleSelection,
  onSelectAll,
  onEdit,
  onDelete,
  sortConfigs,
  onSort,
}: {
  cars: Car[];
  selectedCarIds: Set<string>;
  onToggleSelection: (id: string) => void;
  onSelectAll: () => void;
  onEdit: (car: Car) => void;
  onDelete: (id: string) => void;
  sortConfigs: SortConfig[];
  onSort: (field: string, addToExisting: boolean) => void;
}) {
  const formatDate = (date: string | null | undefined) => {
    if (!date) return '-';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  // Get sort indicator for a column
  const getSortIndicator = (field: string) => {
    const sortIndex = sortConfigs.findIndex(s => s.field === field);
    if (sortIndex === -1) return null;

    const sort = sortConfigs[sortIndex];
    return (
      <span className="inline-flex items-center ml-1">
        {sort.direction === 'asc' ? (
          <ArrowUpIcon className="h-3 w-3" />
        ) : (
          <ArrowDownIcon className="h-3 w-3" />
        )}
        {sortConfigs.length > 1 && (
          <span className="text-[10px] ml-0.5">{sortIndex + 1}</span>
        )}
      </span>
    );
  };

  // Sortable header cell
  const SortableHeader = ({ field, children }: { field: string; children: React.ReactNode }) => (
    <th
      className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider cursor-pointer hover:bg-steel-700 select-none"
      onClick={(e) => onSort(field, e.shiftKey)}
      title="Click to sort, Shift+Click for multi-column sort"
    >
      <div className="flex items-center">
        {children}
        {getSortIndicator(field) || <ChevronUpDownIcon className="h-3 w-3 ml-1 opacity-50" />}
      </div>
    </th>
  );

  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-steel-200">
          <thead className="bg-steel-800 text-white">
            <tr>
              <th className="px-3 py-2.5 text-left w-10">
                <input
                  type="checkbox"
                  checked={selectedCarIds.size === cars.length && cars.length > 0}
                  onChange={onSelectAll}
                  className="h-4 w-4 text-rail-600 rounded"
                />
              </th>
              <SortableHeader field="railcarNumber">Railcar #</SortableHeader>
              <SortableHeader field="customer">Customer</SortableHeader>
              <SortableHeader field="projectNumber">Project</SortableHeader>
              <SortableHeader field="status">Status</SortableHeader>
              <SortableHeader field="shoppingStatus">Shopping</SortableHeader>
              <SortableHeader field="safetyRelief">Safety Relief</SortableHeader>
              <SortableHeader field="serviceEquipment">Service Equip</SortableHeader>
              <SortableHeader field="tankQualification">Tank Qual</SortableHeader>
              <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-steel-100">
            {cars.map((car) => {
              const shoppingStatus = getShoppingStatus(car as any);
              const isTankCar = car.carType === 'Tank Car' || car.isTankCar;

              return (
                <tr
                  key={car.id}
                  className={selectedCarIds.has(car.id) ? 'bg-rail-50' : 'hover:bg-steel-50'}
                >
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selectedCarIds.has(car.id)}
                      onChange={() => onToggleSelection(car.id)}
                      className="h-4 w-4 text-rail-600 rounded"
                    />
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-steel-900">{car.railcarNumber}</span>
                      {isTankCar && (
                        <span className="px-1.5 py-0.5 text-xs bg-violet-50 text-violet-700 border border-violet-200 rounded">
                          TANK
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-sm text-steel-700">
                    {car.customer || '-'}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-sm text-steel-700 font-mono">
                    {car.projectNumber || '-'}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium border ${
                      STATUS_COLORS[car.status as keyof typeof STATUS_COLORS] ||
                      STATUS_COLORS[car.status.replace('_', ' ') as keyof typeof STATUS_COLORS] ||
                      STATUS_COLORS.available
                    }`}>
                      {car.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <ShoppingStatusBadge status={shoppingStatus} size="sm" />
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-sm text-steel-700">
                    {formatDate((car as any).safetyRelief)}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-sm text-steel-700">
                    {formatDate((car as any).serviceEquipment)}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-sm text-steel-700">
                    {formatDate((car as any).tankQualification || car.tankQualDueDate)}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-right">
                    <button
                      onClick={() => onEdit(car)}
                      className="text-steel-500 hover:text-rail-600 mr-2 text-sm font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onDelete(car.id)}
                      className="text-steel-500 hover:text-red-600 text-sm font-medium"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
