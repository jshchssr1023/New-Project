/**
 * CarMatrix.tsx - Car Matrix Component for Service Plan Confirmation
 *
 * The Car Matrix is the ONLY place where car confirmations can occur.
 * It displays all cars in a plan with their status and allows:
 * - Viewing car details and assignments
 * - Editing pending car assignments (shop, month, reason)
 * - Confirming individual or multiple cars (locks them)
 * - Deleting pending cars with secondary confirmation
 *
 * Story 3: Car Matrix as Confirmation Authority
 */

import { useState, useCallback, useMemo } from 'react';
import {
  CheckCircleIcon,
  LockClosedIcon,
  TrashIcon,
  PencilIcon,
  ExclamationTriangleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';
import {
  servicePlansApi,
  CarMatrixData,
  CarMatrixCar,
  CarConfirmationResult,
} from '../../services/api/servicePlans';

interface CarMatrixProps {
  servicePlanId: string;
  carMatrixData: CarMatrixData;
  onDataChange: () => void;
  onShowConfirmationSummary: () => void;
  onFinalConfirm: () => void;
}

interface EditingCar {
  id: string;
  assignedShopId: string;
  plannedMonth: number | null;
  plannedYear: number | null;
  shopReason: string;
}

const MONTHS = [
  { value: 1, label: 'Jan' },
  { value: 2, label: 'Feb' },
  { value: 3, label: 'Mar' },
  { value: 4, label: 'Apr' },
  { value: 5, label: 'May' },
  { value: 6, label: 'Jun' },
  { value: 7, label: 'Jul' },
  { value: 8, label: 'Aug' },
  { value: 9, label: 'Sep' },
  { value: 10, label: 'Oct' },
  { value: 11, label: 'Nov' },
  { value: 12, label: 'Dec' },
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear + i);

export default function CarMatrix({
  servicePlanId,
  carMatrixData,
  onDataChange,
  onShowConfirmationSummary,
  onFinalConfirm,
}: CarMatrixProps) {
  const [selectedCarIds, setSelectedCarIds] = useState<Set<string>>(new Set());
  const [editingCar, setEditingCar] = useState<EditingCar | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ car: CarMatrixCar; reason: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'railcarNumber' | 'status' | 'shop' | 'month'>('railcarNumber');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed'>('all');

  const { cars, shops, summary, isEditable, canFinalConfirm, planStatus } = carMatrixData;

  // Filter and sort cars
  const filteredAndSortedCars = useMemo(() => {
    let result = [...cars];

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (car) =>
          car.railcarNumber.toLowerCase().includes(query) ||
          car.carType.toLowerCase().includes(query) ||
          car.assignedShopName?.toLowerCase().includes(query)
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      result = result.filter((car) => car.status === statusFilter);
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'railcarNumber':
          comparison = a.railcarNumber.localeCompare(b.railcarNumber);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'shop':
          comparison = (a.assignedShopName || '').localeCompare(b.assignedShopName || '');
          break;
        case 'month':
          const aDate = a.plannedYear && a.plannedMonth ? a.plannedYear * 12 + a.plannedMonth : 0;
          const bDate = b.plannedYear && b.plannedMonth ? b.plannedYear * 12 + b.plannedMonth : 0;
          comparison = aDate - bDate;
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [cars, searchQuery, statusFilter, sortField, sortDirection]);

  // Get pending cars for bulk operations
  const pendingCars = useMemo(() => cars.filter((c) => c.status === 'pending'), [cars]);
  const selectedPendingCars = useMemo(
    () => pendingCars.filter((c) => selectedCarIds.has(c.id)),
    [pendingCars, selectedCarIds]
  );

  // Toggle sort
  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Toggle car selection
  const handleToggleSelect = (carId: string) => {
    setSelectedCarIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(carId)) {
        newSet.delete(carId);
      } else {
        newSet.add(carId);
      }
      return newSet;
    });
  };

  // Select all pending cars
  const handleSelectAllPending = () => {
    if (selectedCarIds.size === pendingCars.length) {
      setSelectedCarIds(new Set());
    } else {
      setSelectedCarIds(new Set(pendingCars.map((c) => c.id)));
    }
  };

  // Start editing a car
  const handleStartEdit = (car: CarMatrixCar) => {
    if (car.status !== 'pending') return;
    setEditingCar({
      id: car.id,
      assignedShopId: car.assignedShopId || '',
      plannedMonth: car.plannedMonth,
      plannedYear: car.plannedYear,
      shopReason: car.shopReason || '',
    });
  };

  // Save car assignment edit
  const handleSaveEdit = async () => {
    if (!editingCar) return;

    try {
      setIsSaving(true);
      setError(null);

      await servicePlansApi.updateCarAssignment(servicePlanId, editingCar.id, {
        assignedShopId: editingCar.assignedShopId || undefined,
        plannedMonth: editingCar.plannedMonth || undefined,
        plannedYear: editingCar.plannedYear || undefined,
        shopReason: editingCar.shopReason || undefined,
      });

      setEditingCar(null);
      onDataChange();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update car assignment');
    } finally {
      setIsSaving(false);
    }
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingCar(null);
  };

  // Confirm a single car
  const handleConfirmCar = async (car: CarMatrixCar) => {
    if (car.status !== 'pending') return;
    if (!car.assignedShopId || !car.plannedMonth || !car.plannedYear) {
      setError('Car must have shop and month/year assigned before confirmation');
      return;
    }

    try {
      setIsConfirming(true);
      setError(null);

      await servicePlansApi.confirmCar(servicePlanId, car.id);
      onDataChange();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to confirm car');
    } finally {
      setIsConfirming(false);
    }
  };

  // Confirm selected cars (bulk)
  const handleConfirmSelected = async () => {
    if (selectedPendingCars.length === 0) return;

    // Check all selected cars have required fields
    const incompleteCarsa = selectedPendingCars.filter(
      (c) => !c.assignedShopId || !c.plannedMonth || !c.plannedYear
    );
    if (incompleteCarsa.length > 0) {
      setError(`${incompleteCarsa.length} car(s) missing shop or month assignment`);
      return;
    }

    try {
      setIsConfirming(true);
      setError(null);

      await servicePlansApi.confirmCarsBulk(servicePlanId, selectedPendingCars.map((c) => c.id));
      setSelectedCarIds(new Set());
      onDataChange();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to confirm cars');
    } finally {
      setIsConfirming(false);
    }
  };

  // Open delete confirmation modal
  const handleOpenDeleteModal = (car: CarMatrixCar) => {
    if (car.status !== 'pending') return;
    setDeleteModal({ car, reason: '' });
  };

  // Execute car deletion with secondary confirmation
  const handleDeleteCar = async () => {
    if (!deleteModal) return;

    try {
      setIsDeleting(true);
      setError(null);

      await servicePlansApi.deleteCarWithConfirmation(
        servicePlanId,
        deleteModal.car.id,
        deleteModal.reason,
        true // secondary confirmation
      );

      setDeleteModal(null);
      onDataChange();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete car');
    } finally {
      setIsDeleting(false);
    }
  };

  // Render sort icon
  const renderSortIcon = (field: typeof sortField) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? (
      <ChevronUpIcon className="w-4 h-4 inline ml-1" />
    ) : (
      <ChevronDownIcon className="w-4 h-4 inline ml-1" />
    );
  };

  // Render status badge
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">
            <LockClosedIcon className="w-3 h-3" />
            Confirmed
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
            Pending
          </span>
        );
      case 'deleted':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700">
            Deleted
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-steel-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-steel-200 bg-steel-50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-steel-800">Car Matrix</h2>
            <p className="text-sm text-steel-500 mt-0.5">
              Confirmation authority - All car confirmations occur here
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* Summary stats */}
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
                <span className="text-steel-600">Pending: {summary.pendingCars}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                <span className="text-steel-600">Confirmed: {summary.confirmedCars}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
          <ExclamationTriangleIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-red-700">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-xs text-red-600 hover:text-red-800 underline mt-1"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-steel-200 flex items-center justify-between gap-4 flex-wrap">
        {/* Search */}
        <div className="relative">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-steel-400" />
          <input
            type="text"
            placeholder="Search cars..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-3 py-2 border border-steel-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rail-500 focus:border-transparent w-64"
          />
        </div>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="px-3 py-2 border border-steel-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rail-500"
        >
          <option value="all">All Status</option>
          <option value="pending">Pending Only</option>
          <option value="confirmed">Confirmed Only</option>
        </select>

        {/* Bulk actions */}
        {isEditable && pendingCars.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleSelectAllPending}
              className="px-3 py-2 text-sm border border-steel-300 rounded-md hover:bg-steel-50"
            >
              {selectedCarIds.size === pendingCars.length ? 'Deselect All' : 'Select All Pending'}
            </button>
            {selectedPendingCars.length > 0 && (
              <button
                onClick={handleConfirmSelected}
                disabled={isConfirming}
                className="px-3 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
              >
                <CheckCircleIcon className="w-4 h-4" />
                Confirm Selected ({selectedPendingCars.length})
              </button>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-steel-50">
            <tr className="text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
              {isEditable && pendingCars.length > 0 && (
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={selectedCarIds.size === pendingCars.length && pendingCars.length > 0}
                    onChange={handleSelectAllPending}
                    className="rounded border-steel-300 text-rail-600 focus:ring-rail-500"
                  />
                </th>
              )}
              <th
                className="px-4 py-3 cursor-pointer hover:bg-steel-100"
                onClick={() => handleSort('railcarNumber')}
              >
                Railcar # {renderSortIcon('railcarNumber')}
              </th>
              <th className="px-4 py-3">Car Type</th>
              <th
                className="px-4 py-3 cursor-pointer hover:bg-steel-100"
                onClick={() => handleSort('status')}
              >
                Status {renderSortIcon('status')}
              </th>
              <th
                className="px-4 py-3 cursor-pointer hover:bg-steel-100"
                onClick={() => handleSort('shop')}
              >
                Assigned Shop {renderSortIcon('shop')}
              </th>
              <th
                className="px-4 py-3 cursor-pointer hover:bg-steel-100"
                onClick={() => handleSort('month')}
              >
                Planned Month {renderSortIcon('month')}
              </th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3">Qual Due</th>
              {isEditable && <th className="px-4 py-3 w-32">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-steel-100">
            {filteredAndSortedCars.map((car) => (
              <tr
                key={car.id}
                className={`hover:bg-steel-50 ${car.isLocked ? 'bg-green-50/30' : ''} ${
                  selectedCarIds.has(car.id) ? 'bg-rail-50' : ''
                }`}
              >
                {isEditable && pendingCars.length > 0 && (
                  <td className="px-4 py-3">
                    {car.status === 'pending' && (
                      <input
                        type="checkbox"
                        checked={selectedCarIds.has(car.id)}
                        onChange={() => handleToggleSelect(car.id)}
                        className="rounded border-steel-300 text-rail-600 focus:ring-rail-500"
                      />
                    )}
                  </td>
                )}
                <td className="px-4 py-3 font-mono text-sm text-steel-800">{car.railcarNumber}</td>
                <td className="px-4 py-3 text-sm text-steel-600">{car.carType}</td>
                <td className="px-4 py-3">{renderStatusBadge(car.status)}</td>
                <td className="px-4 py-3">
                  {editingCar?.id === car.id ? (
                    <select
                      value={editingCar.assignedShopId}
                      onChange={(e) =>
                        setEditingCar({ ...editingCar, assignedShopId: e.target.value })
                      }
                      className="w-full px-2 py-1 border border-steel-300 rounded text-sm"
                    >
                      <option value="">Select Shop</option>
                      {shops.map((shop) => (
                        <option key={shop.id} value={shop.id}>
                          {shop.name} ({shop.code})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-sm text-steel-700">
                      {car.assignedShopName ? (
                        <>
                          {car.assignedShopName}{' '}
                          <span className="text-steel-400">({car.assignedShopCode})</span>
                        </>
                      ) : (
                        <span className="text-steel-400 italic">Not assigned</span>
                      )}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {editingCar?.id === car.id ? (
                    <div className="flex gap-1">
                      <select
                        value={editingCar.plannedMonth || ''}
                        onChange={(e) =>
                          setEditingCar({
                            ...editingCar,
                            plannedMonth: e.target.value ? parseInt(e.target.value) : null,
                          })
                        }
                        className="w-20 px-2 py-1 border border-steel-300 rounded text-sm"
                      >
                        <option value="">Month</option>
                        {MONTHS.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={editingCar.plannedYear || ''}
                        onChange={(e) =>
                          setEditingCar({
                            ...editingCar,
                            plannedYear: e.target.value ? parseInt(e.target.value) : null,
                          })
                        }
                        className="w-20 px-2 py-1 border border-steel-300 rounded text-sm"
                      >
                        <option value="">Year</option>
                        {YEARS.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <span className="text-sm text-steel-700">
                      {car.plannedMonthLabel && car.plannedYear ? (
                        `${car.plannedMonthLabel} ${car.plannedYear}`
                      ) : (
                        <span className="text-steel-400 italic">Not set</span>
                      )}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {editingCar?.id === car.id ? (
                    <input
                      type="text"
                      value={editingCar.shopReason}
                      onChange={(e) =>
                        setEditingCar({ ...editingCar, shopReason: e.target.value })
                      }
                      placeholder="Reason..."
                      className="w-full px-2 py-1 border border-steel-300 rounded text-sm"
                    />
                  ) : (
                    <span className="text-sm text-steel-600">{car.shopReason || '-'}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-steel-600">
                  {car.qualificationDueDate
                    ? new Date(car.qualificationDueDate).toLocaleDateString()
                    : '-'}
                </td>
                {isEditable && (
                  <td className="px-4 py-3">
                    {car.status === 'pending' && (
                      <div className="flex items-center gap-1">
                        {editingCar?.id === car.id ? (
                          <>
                            <button
                              onClick={handleSaveEdit}
                              disabled={isSaving}
                              className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                              title="Save"
                            >
                              <CheckCircleSolidIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="p-1.5 text-steel-500 hover:bg-steel-100 rounded"
                              title="Cancel"
                            >
                              &times;
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleStartEdit(car)}
                              className="p-1.5 text-steel-500 hover:bg-steel-100 rounded"
                              title="Edit Assignment"
                            >
                              <PencilIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleConfirmCar(car)}
                              disabled={isConfirming || !car.assignedShopId || !car.plannedMonth}
                              className="p-1.5 text-green-600 hover:bg-green-50 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                              title={
                                !car.assignedShopId || !car.plannedMonth
                                  ? 'Assign shop and month first'
                                  : 'Confirm Car'
                              }
                            >
                              <CheckCircleIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleOpenDeleteModal(car)}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                              title="Delete Car"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                    {car.status === 'confirmed' && (
                      <span className="text-xs text-green-600 flex items-center gap-1">
                        <LockClosedIcon className="w-3 h-3" />
                        Locked
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {filteredAndSortedCars.length === 0 && (
          <div className="text-center py-12 text-steel-500">
            {searchQuery || statusFilter !== 'all'
              ? 'No cars match the current filters'
              : 'No cars in this plan'}
          </div>
        )}
      </div>

      {/* Footer with confirmation actions */}
      {isEditable && (
        <div className="px-4 py-3 border-t border-steel-200 bg-steel-50 flex items-center justify-between">
          <div className="text-sm text-steel-600">
            {summary.confirmedCars > 0 && (
              <span className="text-green-600 font-medium">
                {summary.confirmedCars} car{summary.confirmedCars !== 1 ? 's' : ''} confirmed and locked
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onShowConfirmationSummary}
              disabled={summary.confirmedCars === 0}
              className="px-4 py-2 text-sm border border-steel-300 rounded-md hover:bg-white disabled:opacity-50"
            >
              View Summary
            </button>
            <button
              onClick={onFinalConfirm}
              disabled={!canFinalConfirm}
              className="px-4 py-2 text-sm bg-rail-600 text-white rounded-md hover:bg-rail-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              title={
                !canFinalConfirm
                  ? summary.pendingCars > 0
                    ? 'All pending cars must be confirmed or deleted first'
                    : 'At least one car must be confirmed'
                  : 'Final confirm and send to Master Schedule'
              }
            >
              <CheckCircleSolidIcon className="w-4 h-4" />
              Final Confirm Plan
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (Story 4: Secondary Confirmation) */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="px-4 py-3 border-b border-steel-200 flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-full">
                <ExclamationTriangleIcon className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-steel-800">Confirm Deletion</h3>
                <p className="text-sm text-steel-500">This action requires secondary confirmation</p>
              </div>
            </div>
            <div className="px-4 py-4">
              <p className="text-steel-700 mb-4">
                Are you sure you want to remove car{' '}
                <span className="font-mono font-semibold">{deleteModal.car.railcarNumber}</span> from
                this plan?
              </p>
              <p className="text-sm text-steel-500 mb-4">
                The car will be removed from active planning but the audit history will be retained.
              </p>
              <div>
                <label className="block text-sm font-medium text-steel-700 mb-1">
                  Reason for deletion (optional)
                </label>
                <textarea
                  value={deleteModal.reason}
                  onChange={(e) => setDeleteModal({ ...deleteModal, reason: e.target.value })}
                  placeholder="Enter reason for deletion..."
                  className="w-full px-3 py-2 border border-steel-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rail-500"
                  rows={2}
                />
              </div>
            </div>
            <div className="px-4 py-3 border-t border-steel-200 flex justify-end gap-3">
              <button
                onClick={() => setDeleteModal(null)}
                className="px-4 py-2 text-sm border border-steel-300 rounded-md hover:bg-steel-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteCar}
                disabled={isDeleting}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
