/**
 * S&OP Supply Entry Settings Page
 *
 * Allows administrators to configure monthly S&OP commitments (negotiated capacity)
 * per shop for car flow planning.
 */

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BuildingStorefrontIcon,
  PlusIcon,
  TrashIcon,
  PencilIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { sopCommitmentApi } from '../services/carFlowApi';
import { shopsApi } from '../services/api';
import type { SOPCommitment, CreateSOPCommitmentRequest } from '../types/carFlow';
import type { Shop } from '../types';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_ABBREV = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function SOPSupplySettings() {
  const queryClient = useQueryClient();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [editingCell, setEditingCell] = useState<{ shopId: string; month: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showAddShopModal, setShowAddShopModal] = useState(false);

  // Fetch shops
  const { data: shops = [], isLoading: shopsLoading } = useQuery({
    queryKey: ['shops'],
    queryFn: () => shopsApi.getAll({ isActive: true }),
  });

  // Fetch S&OP commitments for the selected year
  const { data: commitments = [], isLoading: commitmentsLoading, error } = useQuery({
    queryKey: ['sop-commitments', selectedYear],
    queryFn: () => sopCommitmentApi.getAll(selectedYear),
  });

  // Get unique shop IDs from commitments
  const shopsWithCommitments = useMemo(() => {
    const shopIds = new Set(commitments.map((c) => c.shopId));
    return shops.filter((s: Shop) => shopIds.has(s.id));
  }, [shops, commitments]);

  // Build commitment map for quick lookup
  const commitmentMap = useMemo(() => {
    const map = new Map<string, number>();
    commitments.forEach((c) => {
      map.set(`${c.shopId}-${c.month}`, c.committedVolume);
    });
    return map;
  }, [commitments]);

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: (data: CreateSOPCommitmentRequest) => sopCommitmentApi.createOrUpdate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sop-commitments'] });
      setEditingCell(null);
    },
  });

  // Batch update mutation
  const batchMutation = useMutation({
    mutationFn: (commitments: CreateSOPCommitmentRequest[]) =>
      sopCommitmentApi.batchUpdate(commitments),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sop-commitments'] });
    },
  });

  const handleCellClick = (shopId: string, month: number) => {
    const currentValue = commitmentMap.get(`${shopId}-${month}`) || 0;
    setEditingCell({ shopId, month });
    setEditValue(String(currentValue));
  };

  const handleSave = () => {
    if (!editingCell) return;
    const value = parseInt(editValue) || 0;
    saveMutation.mutate({
      shopId: editingCell.shopId,
      year: selectedYear,
      month: editingCell.month,
      committedVolume: value,
    });
  };

  const handleCancel = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  // Copy from previous year
  const handleCopyFromPreviousYear = async (shopId: string) => {
    const previousYear = selectedYear - 1;
    const previousCommitments = await sopCommitmentApi.getAll(previousYear);
    const shopCommitments = previousCommitments.filter((c) => c.shopId === shopId);

    if (shopCommitments.length === 0) {
      alert(`No commitments found for ${previousYear}`);
      return;
    }

    const newCommitments: CreateSOPCommitmentRequest[] = shopCommitments.map((c) => ({
      shopId: c.shopId,
      year: selectedYear,
      month: c.month,
      committedVolume: c.committedVolume,
    }));

    await batchMutation.mutateAsync(newCommitments);
  };

  // Fill year with same value
  const handleFillYear = async (shopId: string, value: number) => {
    const commitments: CreateSOPCommitmentRequest[] = Array.from({ length: 12 }, (_, i) => ({
      shopId,
      year: selectedYear,
      month: i + 1,
      committedVolume: value,
    }));
    await batchMutation.mutateAsync(commitments);
  };

  const isLoading = shopsLoading || commitmentsLoading;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-steel-900">S&OP Supply Commitments</h1>
        <p className="text-steel-500 mt-1">
          Configure monthly shop capacity commitments for car flow planning
        </p>
      </div>

      {/* Year Selector */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSelectedYear((y) => y - 1)}
            className="btn-secondary p-2"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2 text-lg font-semibold text-steel-900">
            <CalendarIcon className="h-5 w-5 text-steel-400" />
            <span>{selectedYear}</span>
          </div>
          <button
            onClick={() => setSelectedYear((y) => y + 1)}
            className="btn-secondary p-2"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </div>

        <button
          onClick={() => setShowAddShopModal(true)}
          className="btn-primary flex items-center"
        >
          <PlusIcon className="h-4 w-4 mr-2" />
          Add Shop
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <ExclamationTriangleIcon className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">Failed to load commitments</p>
            <p className="text-sm text-red-700">{(error as Error).message}</p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rail-600"></div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && shopsWithCommitments.length === 0 && (
        <div className="text-center py-12 bg-steel-50 rounded-lg border border-steel-200">
          <BuildingStorefrontIcon className="h-12 w-12 text-steel-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-steel-900 mb-2">
            No S&OP Commitments for {selectedYear}
          </h3>
          <p className="text-steel-500 mb-4">
            Add shops and configure their monthly capacity commitments
          </p>
          <button
            onClick={() => setShowAddShopModal(true)}
            className="btn-primary"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Add First Shop
          </button>
        </div>
      )}

      {/* Commitment Table */}
      {!isLoading && shopsWithCommitments.length > 0 && (
        <div className="bg-white rounded-lg border border-steel-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-steel-200">
              <thead className="bg-steel-50">
                <tr>
                  <th className="sticky left-0 bg-steel-50 px-4 py-3 text-left text-xs font-semibold text-steel-700 uppercase tracking-wider border-r border-steel-200">
                    Shop
                  </th>
                  {MONTH_ABBREV.map((month, idx) => (
                    <th
                      key={month}
                      className="px-3 py-3 text-center text-xs font-semibold text-steel-700 uppercase tracking-wider"
                    >
                      {month}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-center text-xs font-semibold text-steel-700 uppercase tracking-wider bg-steel-100 border-l border-steel-200">
                    Total
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-steel-700 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-steel-200">
                {shopsWithCommitments.map((shop: Shop) => {
                  const yearTotal = Array.from({ length: 12 }, (_, i) =>
                    commitmentMap.get(`${shop.id}-${i + 1}`) || 0
                  ).reduce((sum, v) => sum + v, 0);

                  return (
                    <tr key={shop.id} className="hover:bg-steel-50">
                      {/* Shop Name */}
                      <td className="sticky left-0 bg-white px-4 py-3 border-r border-steel-200">
                        <div className="flex items-center gap-2">
                          <BuildingStorefrontIcon className="h-4 w-4 text-steel-400" />
                          <div>
                            <div className="font-medium text-steel-900">{shop.name}</div>
                            <div className="text-xs text-steel-500">
                              {shop.city}, {shop.state}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Monthly Values */}
                      {Array.from({ length: 12 }, (_, monthIdx) => {
                        const month = monthIdx + 1;
                        const value = commitmentMap.get(`${shop.id}-${month}`) || 0;
                        const isEditing =
                          editingCell?.shopId === shop.id && editingCell?.month === month;

                        return (
                          <td
                            key={month}
                            className={`px-1 py-2 text-center ${
                              isEditing
                                ? ''
                                : 'cursor-pointer hover:bg-rail-50 hover:ring-1 hover:ring-inset hover:ring-rail-300'
                            }`}
                            onClick={() => !isEditing && handleCellClick(shop.id, month)}
                          >
                            {isEditing ? (
                              <div className="flex items-center justify-center gap-1">
                                <input
                                  type="number"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={handleKeyDown}
                                  className="w-16 px-2 py-1 text-center text-sm border border-rail-300 rounded focus:ring-1 focus:ring-rail-500 focus:border-rail-500"
                                  autoFocus
                                  min="0"
                                />
                                <button
                                  onClick={handleSave}
                                  className="p-1 text-green-600 hover:bg-green-50 rounded"
                                  disabled={saveMutation.isPending}
                                >
                                  <CheckIcon className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={handleCancel}
                                  className="p-1 text-steel-400 hover:bg-steel-100 rounded"
                                >
                                  <XMarkIcon className="h-4 w-4" />
                                </button>
                              </div>
                            ) : (
                              <span
                                className={`inline-block min-w-[2rem] px-2 py-1 rounded text-sm font-medium ${
                                  value > 0
                                    ? 'bg-rail-100 text-rail-800'
                                    : 'text-steel-400'
                                }`}
                              >
                                {value || '-'}
                              </span>
                            )}
                          </td>
                        );
                      })}

                      {/* Total */}
                      <td className="px-4 py-3 text-center font-semibold text-steel-900 bg-steel-50 border-l border-steel-200">
                        {yearTotal}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleCopyFromPreviousYear(shop.id)}
                            className="p-1.5 text-steel-500 hover:text-rail-600 hover:bg-rail-50 rounded"
                            title={`Copy from ${selectedYear - 1}`}
                          >
                            <ArrowPathIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Footer Totals */}
              <tfoot className="bg-steel-100">
                <tr>
                  <td className="sticky left-0 bg-steel-100 px-4 py-3 font-semibold text-steel-900 border-r border-steel-200">
                    Monthly Total
                  </td>
                  {Array.from({ length: 12 }, (_, monthIdx) => {
                    const month = monthIdx + 1;
                    const monthTotal = shopsWithCommitments.reduce(
                      (sum: number, shop: Shop) =>
                        sum + (commitmentMap.get(`${shop.id}-${month}`) || 0),
                      0
                    );
                    return (
                      <td
                        key={month}
                        className="px-3 py-3 text-center font-semibold text-steel-900"
                      >
                        {monthTotal}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-center font-bold text-steel-900 bg-steel-200 border-l border-steel-200">
                    {shopsWithCommitments.reduce((sum: number, shop: Shop) => {
                      return (
                        sum +
                        Array.from({ length: 12 }, (_, i) =>
                          commitmentMap.get(`${shop.id}-${i + 1}`) || 0
                        ).reduce((s, v) => s + v, 0)
                      );
                    }, 0)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Add Shop Modal */}
      {showAddShopModal && (
        <AddShopModal
          shops={shops.filter((s: Shop) => !shopsWithCommitments.some((sw: Shop) => sw.id === s.id))}
          year={selectedYear}
          onClose={() => setShowAddShopModal(false)}
          onAdd={async (shopId, defaultValue) => {
            if (defaultValue > 0) {
              await handleFillYear(shopId, defaultValue);
            } else {
              // Just add a single commitment to register the shop
              await saveMutation.mutateAsync({
                shopId,
                year: selectedYear,
                month: 1,
                committedVolume: 0,
              });
            }
            setShowAddShopModal(false);
          }}
        />
      )}
    </div>
  );
}

// Add Shop Modal Component
interface AddShopModalProps {
  shops: Shop[];
  year: number;
  onClose: () => void;
  onAdd: (shopId: string, defaultValue: number) => Promise<void>;
}

function AddShopModal({ shops, year, onClose, onAdd }: AddShopModalProps) {
  const [selectedShopId, setSelectedShopId] = useState('');
  const [defaultValue, setDefaultValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = async () => {
    if (!selectedShopId) return;
    setIsAdding(true);
    try {
      await onAdd(selectedShopId, parseInt(defaultValue) || 0);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-semibold text-steel-900 mb-4">
          Add Shop to {year} S&OP Plan
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-steel-700 mb-1">
              Select Shop
            </label>
            <select
              value={selectedShopId}
              onChange={(e) => setSelectedShopId(e.target.value)}
              className="input w-full"
            >
              <option value="">Choose a shop...</option>
              {shops.map((shop: Shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name} - {shop.city}, {shop.state}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-steel-700 mb-1">
              Default Monthly Commitment (optional)
            </label>
            <input
              type="number"
              value={defaultValue}
              onChange={(e) => setDefaultValue(e.target.value)}
              className="input w-full"
              placeholder="0"
              min="0"
            />
            <p className="text-xs text-steel-500 mt-1">
              Set a default value for all months, or leave blank to set individually
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!selectedShopId || isAdding}
            className="btn-primary disabled:opacity-50"
          >
            {isAdding ? 'Adding...' : 'Add Shop'}
          </button>
        </div>
      </div>
    </div>
  );
}
