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
} from '@heroicons/react/24/outline';
import { useCars } from '../hooks/useCars';
import { useCarSelection } from '../contexts/CarSelectionContext';
import CarCard from '../components/cars/CarCard';
import CarFilters from '../components/cars/CarFilters';
import BulkActionsBar from '../components/cars/BulkActionsBar';
import HierarchicalFilter from '../components/cars/HierarchicalFilter';
import ShoppingStatusBadge, { getShoppingStatus } from '../components/cars/ShoppingStatusBadge';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { CarCardGridSkeleton, TableSkeleton } from '../components/ui/LoadingSkeleton';
import ErrorMessage from '../components/ui/ErrorMessage';
import { Slicer, SlicerBar, CompactCarCard, CompactCarCardGrid, CarDetailModal } from '../components/ui';
import type { Car } from '../types';
import { carsApi } from '../services/api';

// Lazy load modals
const ImportModal = lazy(() => import('../components/cars/ImportModal'));
const CarFormModal = lazy(() => import('../components/cars/CarFormModal'));
const PlanCarsModal = lazy(() => import('../components/carflow/PlanCarsModal'));

// Constants
const CAR_TYPE_OPTIONS = ['Tank Car', 'Covered Hopper', 'Open Hopper', 'Boxcar', 'Gondola', 'Flatcar', 'Intermodal'];
const REASON_OPTIONS = ['Annual Inspection', 'Wheel Repair', 'Tank Cleaning', 'Valve Replacement', 'Frame Repair', 'Safety Retrofit', 'DOT Compliance', 'Corrosion Repair', 'Coupler Replacement', 'Brake System'];

// Status colors for table view
const statusColors: Record<string, string> = {
  available: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  in_service: 'bg-amber-50 text-amber-700 border-amber-200',
  in_shop: 'bg-violet-50 text-violet-700 border-violet-200',
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  planned: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  release: 'bg-orange-50 text-orange-700 border-orange-200',
  assignment: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  arrived: 'bg-green-50 text-green-700 border-green-200',
  retired: 'bg-steel-100 text-steel-600 border-steel-200',
};

export default function CarsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { selectMultiple } = useCarSelection();

  // View mode: 'cards' or 'table'
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Page size: 25 or 50
  const [pageSize, setPageSize] = useState<25 | 50>(25);

  // Sidebar visibility
  const [showSidebar, setShowSidebar] = useState(true);

  // Hierarchical filter state
  const [hierarchicalFilter, setHierarchicalFilter] = useState<{
    customer: string | null;
    projectNumber: string | null;
    carIds: string[];
  }>({ customer: null, projectNumber: null, carIds: [] });

  // Modal states
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isPlanCarsModalOpen, setIsPlanCarsModalOpen] = useState(false);
  const [editingCar, setEditingCar] = useState<Car | null>(null);
  const [viewingCar, setViewingCar] = useState<Car | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; carId: string | null; isBulk: boolean }>({
    isOpen: false,
    carId: null,
    isBulk: false,
  });

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

  // Handle URL params - only run once on mount
  // Using a ref to track initialization prevents stale closure issues
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const urlStatus = searchParams.get('status');
    const urlSearch = searchParams.get('search');
    if (urlStatus) updateFilters({ status: urlStatus });
    if (urlSearch) updateFilters({ search: urlSearch });
  }, [searchParams, updateFilters]);

  // Filtered cars based on hierarchical filter
  const displayedCars = useMemo(() => {
    if (hierarchicalFilter.carIds.length > 0) {
      const idSet = new Set(hierarchicalFilter.carIds);
      return cars.filter(c => idSet.has(c.id));
    }
    return cars;
  }, [cars, hierarchicalFilter.carIds]);

  // Export handler
  const handleExport = async (exportSelected: boolean = false) => {
    try {
      await carsApi.exportCars({
        ids: exportSelected && selectedCarIds.size > 0 ? Array.from(selectedCarIds) : undefined,
        status: filters.status,
        customer: filters.customer,
        carType: filters.carType,
      });
    } catch (error) {
      console.error('Export failed:', error);
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

  // Navigation handlers
  const handleUseInScenario = () => {
    selectMultiple(selectedCars);
    navigate('/scenarios');
  };

  const handleUseInCarFlow = () => {
    setIsPlanCarsModalOpen(true);
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
  const handlePageSizeChange = (newSize: 25 | 50) => {
    setPageSize(newSize);
    updateFilters({ pageSize: newSize, page: 1 });
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
              <ShoppingStatusSummary cars={displayedCars} status="urgent" onClick={() => updateFilters({ shoppingStatus: 'urgent' })} isActive={filters.shoppingStatus === 'urgent'} />
              <ShoppingStatusSummary cars={displayedCars} status="must_shop" onClick={() => updateFilters({ shoppingStatus: 'must_shop' })} isActive={filters.shoppingStatus === 'must_shop'} />
              <ShoppingStatusSummary cars={displayedCars} status="upcoming" onClick={() => updateFilters({ shoppingStatus: 'upcoming' })} isActive={filters.shoppingStatus === 'upcoming'} />
              <ShoppingStatusSummary cars={displayedCars} status="compliant" onClick={() => updateFilters({ shoppingStatus: 'compliant' })} isActive={filters.shoppingStatus === 'compliant'} />
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
              {/* View Toggle */}
              <div className="flex items-center border border-steel-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode('cards')}
                  className={`p-2 ${viewMode === 'cards' ? 'bg-rail-100 text-rail-700' : 'text-steel-500 hover:bg-steel-50'}`}
                  title="Card View"
                >
                  <Squares2X2Icon className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setViewMode('table')}
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

          {/* Slicer Filter Bar */}
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

            {/* Slicer Filters */}
            <SlicerBar>
              <Slicer
                label="Car Type"
                options={CAR_TYPE_OPTIONS.map(t => ({ value: t, label: t }))}
                value={filters.carType || ''}
                onChange={(v) => updateFilters({ carType: v as string })}
                placeholder="All"
                size="sm"
              />
              <Slicer
                label="Status"
                options={[
                  { value: 'available', label: 'Available' },
                  { value: 'in_service', label: 'In Service' },
                  { value: 'in_shop', label: 'In Shop' },
                  { value: 'scheduled', label: 'Scheduled' },
                  { value: 'retired', label: 'Retired' },
                ]}
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
                options={REASON_OPTIONS.map(r => ({ value: r, label: r }))}
                value={filters.reasonShopped || ''}
                onChange={(v) => updateFilters({ reasonShopped: v as string })}
                placeholder="All"
                size="sm"
              />
            </SlicerBar>

            {/* Clear Filters */}
            {(filters.search || filters.carType || filters.status || filters.customer || filters.reasonShopped) && (
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
                onUseInScenario={handleUseInScenario}
                onUseInCarFlow={handleUseInCarFlow}
              />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            viewMode === 'cards' ? (
              <CarCardGridSkeleton count={pageSize} />
            ) : (
              <TableSkeleton rows={10} columns={10} />
            )
          ) : displayedCars.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-steel-500">No cars found matching your filters.</p>
              <button
                onClick={handleClearAllFilters}
                className="mt-2 text-rail-600 hover:text-rail-800 font-medium"
              >
                Clear all filters
              </button>
            </div>
          ) : viewMode === 'cards' ? (
            <CompactCarCardGrid columns={5}>
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
            <TableView
              cars={displayedCars}
              selectedCarIds={selectedCarIds}
              onToggleSelection={toggleSelection}
              onSelectAll={selectAll}
              onEdit={handleOpenForm}
              onDelete={handleDeleteClick}
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
                onChange={(e) => handlePageSizeChange(Number(e.target.value) as 25 | 50)}
                className="input text-sm py-1 w-20"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
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
        <PlanCarsModal
          isOpen={isPlanCarsModalOpen}
          onClose={() => {
            setIsPlanCarsModalOpen(false);
            clearSelection();
          }}
          selectedCars={selectedCars}
          onSuccess={(planCount) => {
            clearSelection();
            // Navigate to car flow plans page to see the saved plans
            navigate('/car-flow?tab=plans');
          }}
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
        onClose={() => setViewingCar(null)}
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
  status: 'urgent' | 'must_shop' | 'upcoming' | 'compliant';
  onClick: () => void;
  isActive: boolean;
}) {
  const count = cars.filter(car => getShoppingStatus(car as any) === status).length;

  const labels = {
    urgent: 'Urgent (Prior Year)',
    must_shop: 'Must Shop This Year',
    upcoming: 'Upcoming (Next Year)',
    compliant: 'Compliant',
  };

  const colors = {
    urgent: 'bg-red-100 text-red-700 border-red-200',
    must_shop: 'bg-amber-100 text-amber-700 border-amber-200',
    upcoming: 'bg-blue-100 text-blue-700 border-blue-200',
    compliant: 'bg-green-100 text-green-700 border-green-200',
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

// Table View Component
function TableView({
  cars,
  selectedCarIds,
  onToggleSelection,
  onSelectAll,
  onEdit,
  onDelete,
}: {
  cars: Car[];
  selectedCarIds: Set<string>;
  onToggleSelection: (id: string) => void;
  onSelectAll: () => void;
  onEdit: (car: Car) => void;
  onDelete: (id: string) => void;
}) {
  const formatDate = (date: string | null | undefined) => {
    if (!date) return '-';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  return (
    <div className="card overflow-hidden p-0">
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
            <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider">Railcar #</th>
            <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider">Customer</th>
            <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider">Project</th>
            <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider">Status</th>
            <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider">Shopping</th>
            <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider">Safety Relief</th>
            <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider">Service Equip</th>
            <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider">Tank Qual</th>
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
                  <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium border ${statusColors[car.status] || statusColors.available}`}>
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
  );
}
