/**
 * Shop Networks Page
 *
 * Manage 3rd party shop networks for S&OP planning
 * Features:
 * - View all networks with capacity summary
 * - Create/edit networks via drawer UI
 * - Import networks from CSV
 * - Assign shops to networks
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  BuildingOffice2Icon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  XMarkIcon,
  DocumentTextIcon,
  LinkIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext';
import Drawer from '../components/ui/Drawer';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Skeleton, TableSkeleton } from '../components/ui/LoadingSkeleton';
import type { ShopNetwork, Shop } from '../types';
import {
  getShopNetworks,
  getShopNetwork,
  createShopNetwork,
  updateShopNetwork,
  deleteShopNetwork,
  assignShopsToNetwork,
  removeShopsFromNetwork,
  importShopNetworks,
  getNetworkCapacitySummary,
  parseNetworksCsv,
  generateSampleNetworksCsv,
  type CreateNetworkInput,
  type NetworkImportResult,
} from '../services/shopNetworksApi';
import { shopsApi } from '../services/api';

interface NetworkFormData {
  name: string;
  code: string;
  description: string;
  isAitxInternal: boolean;
  networkTier: number;
  annualTargetVolume: number;
  annualCommittedVolume: number;
  monthlyBaseCapacity: number;
  costIndex: number;
  hasContractualCommitment: boolean;
  commitmentPenaltyRate: number;
  contractStartDate: string;
  contractEndDate: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  isActive: boolean;
  notes: string;
  regions: string[];
}

const emptyFormData: NetworkFormData = {
  name: '',
  code: '',
  description: '',
  isAitxInternal: false,
  networkTier: 3,
  annualTargetVolume: 0,
  annualCommittedVolume: 0,
  monthlyBaseCapacity: 0,
  costIndex: 1.0,
  hasContractualCommitment: false,
  commitmentPenaltyRate: 0,
  contractStartDate: '',
  contractEndDate: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  isActive: true,
  notes: '',
  regions: [],
};

const regionOptions = ['Northeast', 'Southeast', 'Midwest', 'Southwest', 'West', 'Canada'];

export default function ShopNetworks() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [networks, setNetworks] = useState<ShopNetwork[]>([]);
  const [allShops, setAllShops] = useState<Shop[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit' | 'view'>('create');
  const [selectedNetwork, setSelectedNetwork] = useState<ShopNetwork | null>(null);
  const [formData, setFormData] = useState<NetworkFormData>(emptyFormData);
  const [isSaving, setIsSaving] = useState(false);

  // Shop assignment drawer
  const [isAssignDrawerOpen, setIsAssignDrawerOpen] = useState(false);
  const [selectedShopIds, setSelectedShopIds] = useState<Set<string>>(new Set());

  // Import modal
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<NetworkImportResult | null>(null);

  // Delete confirmation
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [networkToDelete, setNetworkToDelete] = useState<ShopNetwork | null>(null);

  // Expand/collapse state
  const [expandedNetworks, setExpandedNetworks] = useState<Set<string>>(new Set());

  // Fetch data
  const fetchNetworks = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await getShopNetworks({ includeShops: true });
      setNetworks(data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load networks');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchShops = useCallback(async () => {
    try {
      const shops = await shopsApi.getAll();
      setAllShops(shops);
    } catch (err) {
      console.error('Failed to fetch shops', err);
    }
  }, []);

  useEffect(() => {
    fetchNetworks();
    fetchShops();
  }, [fetchNetworks, fetchShops]);

  // Get unassigned shops (shops without a networkId)
  const unassignedShops = useMemo(() => {
    return allShops.filter(shop => !shop.networkId && !shop.isParent);
  }, [allShops]);

  // Calculate totals
  const totals = useMemo(() => {
    const aitxNetworks = networks.filter(n => n.isAitxInternal);
    const thirdPartyNetworks = networks.filter(n => !n.isAitxInternal);

    return {
      totalNetworks: networks.length,
      aitxCount: aitxNetworks.length,
      thirdPartyCount: thirdPartyNetworks.length,
      totalShops: networks.reduce((sum, n) => sum + (n.shopCount || 0), 0),
      totalCapacity: networks.reduce((sum, n) => sum + (n.totalMonthlyCapacity || 0), 0),
      totalCommitted: networks.reduce((sum, n) => sum + n.annualCommittedVolume, 0),
    };
  }, [networks]);

  // Open drawer handlers
  const handleCreate = () => {
    setFormData(emptyFormData);
    setSelectedNetwork(null);
    setDrawerMode('create');
    setIsDrawerOpen(true);
  };

  const handleEdit = (network: ShopNetwork) => {
    setFormData({
      name: network.name,
      code: network.code,
      description: network.description,
      isAitxInternal: network.isAitxInternal,
      networkTier: network.networkTier,
      annualTargetVolume: network.annualTargetVolume,
      annualCommittedVolume: network.annualCommittedVolume,
      monthlyBaseCapacity: network.monthlyBaseCapacity,
      costIndex: network.costIndex,
      hasContractualCommitment: network.hasContractualCommitment,
      commitmentPenaltyRate: network.commitmentPenaltyRate,
      contractStartDate: network.contractStartDate ? network.contractStartDate.split('T')[0] : '',
      contractEndDate: network.contractEndDate ? network.contractEndDate.split('T')[0] : '',
      contactName: network.contactName,
      contactEmail: network.contactEmail,
      contactPhone: network.contactPhone,
      isActive: network.isActive,
      notes: network.notes,
      regions: network.regions || [],
    });
    setSelectedNetwork(network);
    setDrawerMode('edit');
    setIsDrawerOpen(true);
  };

  const handleView = async (network: ShopNetwork) => {
    try {
      const fullNetwork = await getShopNetwork(network.id);
      setSelectedNetwork(fullNetwork);
      setDrawerMode('view');
      setIsDrawerOpen(true);
    } catch (err) {
      setError('Failed to load network details');
    }
  };

  // Form handlers
  const handleFormChange = (field: keyof NetworkFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleRegionToggle = (region: string) => {
    setFormData(prev => ({
      ...prev,
      regions: prev.regions.includes(region)
        ? prev.regions.filter(r => r !== region)
        : [...prev.regions, region],
    }));
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const input: CreateNetworkInput = {
        ...formData,
        contractStartDate: formData.contractStartDate || null,
        contractEndDate: formData.contractEndDate || null,
      };

      if (drawerMode === 'create') {
        await createShopNetwork(input);
      } else if (drawerMode === 'edit' && selectedNetwork) {
        await updateShopNetwork(selectedNetwork.id, input);
      }

      await fetchNetworks();
      setIsDrawerOpen(false);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save network');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete handler
  const handleDeleteClick = (network: ShopNetwork) => {
    setNetworkToDelete(network);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!networkToDelete) return;

    try {
      await deleteShopNetwork(networkToDelete.id);
      await fetchNetworks();
      setIsDeleteDialogOpen(false);
      setNetworkToDelete(null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete network');
    }
  };

  // Shop assignment handlers
  const handleOpenAssignDrawer = (network: ShopNetwork) => {
    setSelectedNetwork(network);
    // Pre-select already assigned shops
    const assignedIds = network.shops?.map(s => s.id) || [];
    setSelectedShopIds(new Set(assignedIds));
    setIsAssignDrawerOpen(true);
  };

  const handleShopToggle = (shopId: string) => {
    setSelectedShopIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(shopId)) {
        newSet.delete(shopId);
      } else {
        newSet.add(shopId);
      }
      return newSet;
    });
  };

  const handleSaveShopAssignments = async () => {
    if (!selectedNetwork) return;

    try {
      setIsSaving(true);
      const currentShopIds = new Set(selectedNetwork.shops?.map(s => s.id) || []);
      const newlySelected = [...selectedShopIds].filter(id => !currentShopIds.has(id));
      const removed = [...currentShopIds].filter(id => !selectedShopIds.has(id));

      if (newlySelected.length > 0) {
        await assignShopsToNetwork(selectedNetwork.id, newlySelected);
      }
      if (removed.length > 0) {
        await removeShopsFromNetwork(selectedNetwork.id, removed);
      }

      await fetchNetworks();
      await fetchShops();
      setIsAssignDrawerOpen(false);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update shop assignments');
    } finally {
      setIsSaving(false);
    }
  };

  // Import handlers
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const parsed = parseNetworksCsv(content);
      setImportPreview(parsed);
      setImportResult(null);
      setIsImportModalOpen(true);
    } catch (err) {
      setError('Failed to parse CSV file');
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImport = async () => {
    try {
      setIsImporting(true);
      const result = await importShopNetworks(importPreview);
      setImportResult(result);
      await fetchNetworks();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  const handleDownloadSample = () => {
    const csv = generateSampleNetworksCsv();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'shop_networks_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export handler
  const handleExport = () => {
    const headers = [
      'name', 'code', 'description', 'is_aitx_internal', 'network_tier',
      'annual_target_volume', 'annual_committed_volume', 'monthly_base_capacity',
      'cost_index', 'has_contractual_commitment', 'commitment_penalty_rate',
      'contact_name', 'contact_email', 'contact_phone', 'regions', 'shop_count'
    ];

    const rows = networks.map(n => [
      n.name,
      n.code,
      n.description,
      n.isAitxInternal,
      n.networkTier,
      n.annualTargetVolume,
      n.annualCommittedVolume,
      n.monthlyBaseCapacity,
      n.costIndex,
      n.hasContractualCommitment,
      n.commitmentPenaltyRate,
      n.contactName,
      n.contactEmail,
      n.contactPhone,
      n.regions?.join(';') || '',
      n.shopCount || 0,
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shop_networks_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Toggle expand/collapse
  const toggleExpand = (networkId: string) => {
    setExpandedNetworks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(networkId)) {
        newSet.delete(networkId);
      } else {
        newSet.add(networkId);
      }
      return newSet;
    });
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="card p-4">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
        <TableSkeleton rows={5} columns={8} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-steel-900">Shop Networks</h1>
          <p className="text-steel-500 mt-1">Manage 3rd party networks for S&OP planning</p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-secondary flex items-center gap-2"
          >
            <ArrowUpTrayIcon className="h-4 w-4" />
            Import CSV
          </button>
          <button
            onClick={handleExport}
            className="btn-secondary flex items-center gap-2"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            Export
          </button>
          {isAdmin && (
            <button
              onClick={handleCreate}
              className="btn-primary flex items-center gap-2"
            >
              <PlusIcon className="h-4 w-4" />
              Add Network
            </button>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <ExclamationTriangleIcon className="h-5 w-5 text-red-500 flex-shrink-0" />
          <span className="text-red-700">{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-500 hover:text-red-700"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="card p-4">
          <p className="text-sm text-steel-500">Total Networks</p>
          <p className="text-2xl font-bold text-steel-900">{totals.totalNetworks}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-steel-500">AITX Internal</p>
          <p className="text-2xl font-bold text-rail-600">{totals.aitxCount}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-steel-500">3rd Party</p>
          <p className="text-2xl font-bold text-amber-600">{totals.thirdPartyCount}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-steel-500">Total Shops</p>
          <p className="text-2xl font-bold text-steel-900">{totals.totalShops}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-steel-500">Monthly Capacity</p>
          <p className="text-2xl font-bold text-steel-900">{totals.totalCapacity}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-steel-500">Annual Committed</p>
          <p className="text-2xl font-bold text-green-600">{totals.totalCommitted.toLocaleString()}</p>
        </div>
      </div>

      {/* Networks Table */}
      <div className="card overflow-hidden p-0">
        <table className="min-w-full divide-y divide-steel-200">
          <thead className="bg-steel-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-steel-600 uppercase tracking-wider w-8"></th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-steel-600 uppercase tracking-wider">Network</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-steel-600 uppercase tracking-wider">Type</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-steel-600 uppercase tracking-wider">Tier</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-steel-600 uppercase tracking-wider">Shops</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-steel-600 uppercase tracking-wider">Capacity/Mo</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-steel-600 uppercase tracking-wider">Committed</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-steel-600 uppercase tracking-wider">Cost Index</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-steel-600 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-steel-600 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-steel-100">
            {networks.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-steel-500">
                  <BuildingOffice2Icon className="h-12 w-12 mx-auto text-steel-300 mb-3" />
                  <p className="text-lg font-medium">No networks configured</p>
                  <p className="text-sm mt-1">Import from CSV or add a network to get started.</p>
                  <button
                    onClick={handleDownloadSample}
                    className="mt-4 text-sm text-rail-600 hover:text-rail-700 underline"
                  >
                    Download sample CSV template
                  </button>
                </td>
              </tr>
            ) : (
              networks.map(network => (
                <>
                  <tr
                    key={network.id}
                    className="hover:bg-steel-50 cursor-pointer"
                    onClick={() => toggleExpand(network.id)}
                  >
                    <td className="px-4 py-3">
                      {(network.shopCount || 0) > 0 ? (
                        expandedNetworks.has(network.id) ? (
                          <ChevronDownIcon className="h-4 w-4 text-steel-400" />
                        ) : (
                          <ChevronRightIcon className="h-4 w-4 text-steel-400" />
                        )
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          network.isAitxInternal ? 'bg-rail-100 text-rail-600' : 'bg-amber-100 text-amber-600'
                        }`}>
                          <BuildingOffice2Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-medium text-steel-900">{network.name}</p>
                          <p className="text-xs text-steel-500">{network.code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        network.isAitxInternal
                          ? 'bg-rail-100 text-rail-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {network.isAitxInternal ? 'AITX Internal' : '3rd Party'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        network.networkTier <= 2
                          ? 'bg-green-100 text-green-800'
                          : network.networkTier <= 3
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-steel-100 text-steel-800'
                      }`}>
                        Tier {network.networkTier}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-steel-900 font-medium">
                      {network.shopCount || 0}
                    </td>
                    <td className="px-4 py-3 text-steel-900">
                      {network.totalMonthlyCapacity || network.monthlyBaseCapacity || 0}
                    </td>
                    <td className="px-4 py-3">
                      {network.hasContractualCommitment ? (
                        <span className="text-green-600 font-medium">
                          {network.annualCommittedVolume.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-steel-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-steel-900">
                      {network.costIndex.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        network.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {network.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleView(network)}
                          className="p-1.5 text-steel-400 hover:text-steel-600 rounded"
                          title="View details"
                        >
                          <DocumentTextIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleOpenAssignDrawer(network)}
                          className="p-1.5 text-steel-400 hover:text-steel-600 rounded"
                          title="Assign shops"
                        >
                          <LinkIcon className="h-4 w-4" />
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              onClick={() => handleEdit(network)}
                              className="p-1.5 text-steel-400 hover:text-steel-600 rounded"
                              title="Edit network"
                            >
                              <PencilIcon className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteClick(network)}
                              className="p-1.5 text-steel-400 hover:text-red-600 rounded"
                              title="Delete network"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {/* Expanded shops list */}
                  {expandedNetworks.has(network.id) && network.shops && network.shops.length > 0 && (
                    <tr>
                      <td colSpan={10} className="px-8 py-2 bg-steel-50">
                        <div className="text-xs font-medium text-steel-500 uppercase mb-2">
                          Assigned Shops ({network.shops.length})
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                          {network.shops.map(shop => (
                            <div
                              key={shop.id}
                              className="bg-white rounded px-3 py-2 border border-steel-200 text-sm"
                            >
                              <p className="font-medium text-steel-900">{shop.name}</p>
                              <p className="text-xs text-steel-500">
                                {shop.city}, {shop.state} | Cap: {shop.capacity}
                              </p>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Network Form Drawer */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={drawerMode === 'create' ? 'Add Network' : drawerMode === 'edit' ? 'Edit Network' : 'Network Details'}
        position="right"
        width="lg"
        footer={
          drawerMode !== 'view' ? (
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !formData.name || !formData.code}
                className="btn-primary"
              >
                {isSaving ? 'Saving...' : 'Save Network'}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsDrawerOpen(false)}
              className="btn-secondary w-full"
            >
              Close
            </button>
          )
        }
      >
        {drawerMode === 'view' && selectedNetwork ? (
          <div className="p-4 space-y-6">
            {/* View mode content */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                  selectedNetwork.isAitxInternal ? 'bg-rail-100 text-rail-600' : 'bg-amber-100 text-amber-600'
                }`}>
                  <BuildingOffice2Icon className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-steel-900">{selectedNetwork.name}</h3>
                  <p className="text-sm text-steel-500">{selectedNetwork.code}</p>
                </div>
              </div>

              {selectedNetwork.description && (
                <p className="text-steel-600">{selectedNetwork.description}</p>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-steel-500 uppercase">Type</p>
                  <p className="font-medium">{selectedNetwork.isAitxInternal ? 'AITX Internal' : '3rd Party'}</p>
                </div>
                <div>
                  <p className="text-xs text-steel-500 uppercase">Tier</p>
                  <p className="font-medium">Tier {selectedNetwork.networkTier}</p>
                </div>
                <div>
                  <p className="text-xs text-steel-500 uppercase">Cost Index</p>
                  <p className="font-medium">{selectedNetwork.costIndex.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-steel-500 uppercase">Status</p>
                  <p className="font-medium">{selectedNetwork.isActive ? 'Active' : 'Inactive'}</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-xs text-steel-500 uppercase mb-2">Capacity & Commitment</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-steel-500">Monthly Capacity</p>
                    <p className="font-medium">{selectedNetwork.totalMonthlyCapacity || selectedNetwork.monthlyBaseCapacity}</p>
                  </div>
                  <div>
                    <p className="text-xs text-steel-500">Annual Target</p>
                    <p className="font-medium">{selectedNetwork.annualTargetVolume.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-steel-500">Annual Committed</p>
                    <p className="font-medium">{selectedNetwork.annualCommittedVolume.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-steel-500">Take-or-Pay</p>
                    <p className="font-medium">{selectedNetwork.hasContractualCommitment ? 'Yes' : 'No'}</p>
                  </div>
                </div>
              </div>

              {selectedNetwork.shops && selectedNetwork.shops.length > 0 && (
                <div className="border-t pt-4">
                  <p className="text-xs text-steel-500 uppercase mb-2">
                    Assigned Shops ({selectedNetwork.shops.length})
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {selectedNetwork.shops.map(shop => (
                      <div
                        key={shop.id}
                        className="bg-steel-50 rounded px-3 py-2 text-sm"
                      >
                        <p className="font-medium text-steel-900">{shop.name}</p>
                        <p className="text-xs text-steel-500">
                          {shop.city}, {shop.state} | Capacity: {shop.capacity}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-6">
            {/* Form mode content */}
            <div className="space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-steel-700 mb-1">
                    Network Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => handleFormChange('name', e.target.value)}
                    className="input-field"
                    placeholder="e.g., Trinity"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-steel-700 mb-1">
                    Code *
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={e => handleFormChange('code', e.target.value.toUpperCase())}
                    className="input-field"
                    placeholder="e.g., TRINITY"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-steel-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={e => handleFormChange('description', e.target.value)}
                  className="input-field"
                  rows={2}
                  placeholder="Optional description..."
                />
              </div>

              {/* Classification */}
              <div className="border-t pt-4">
                <p className="text-sm font-medium text-steel-900 mb-3">Classification</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.isAitxInternal}
                        onChange={e => handleFormChange('isAitxInternal', e.target.checked)}
                        className="h-4 w-4 rounded border-steel-300 text-rail-600 focus:ring-rail-500"
                      />
                      <span className="text-sm text-steel-700">AITX Internal</span>
                    </label>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-steel-700 mb-1">
                      Network Tier
                    </label>
                    <select
                      value={formData.networkTier}
                      onChange={e => handleFormChange('networkTier', parseInt(e.target.value))}
                      className="input-field"
                    >
                      {[1, 2, 3, 4, 5].map(tier => (
                        <option key={tier} value={tier}>Tier {tier}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Capacity & Cost */}
              <div className="border-t pt-4">
                <p className="text-sm font-medium text-steel-900 mb-3">Capacity & Cost</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-steel-700 mb-1">
                      Monthly Base Capacity
                    </label>
                    <input
                      type="number"
                      value={formData.monthlyBaseCapacity}
                      onChange={e => handleFormChange('monthlyBaseCapacity', parseInt(e.target.value) || 0)}
                      className="input-field"
                      min={0}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-steel-700 mb-1">
                      Cost Index
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.costIndex}
                      onChange={e => handleFormChange('costIndex', parseFloat(e.target.value) || 1.0)}
                      className="input-field"
                      min={0}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-steel-700 mb-1">
                      Annual Target Volume
                    </label>
                    <input
                      type="number"
                      value={formData.annualTargetVolume}
                      onChange={e => handleFormChange('annualTargetVolume', parseInt(e.target.value) || 0)}
                      className="input-field"
                      min={0}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-steel-700 mb-1">
                      Annual Committed Volume
                    </label>
                    <input
                      type="number"
                      value={formData.annualCommittedVolume}
                      onChange={e => handleFormChange('annualCommittedVolume', parseInt(e.target.value) || 0)}
                      className="input-field"
                      min={0}
                    />
                  </div>
                </div>
              </div>

              {/* Contractual Commitment */}
              <div className="border-t pt-4">
                <p className="text-sm font-medium text-steel-900 mb-3">Contractual Commitment</p>
                <div className="space-y-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.hasContractualCommitment}
                      onChange={e => handleFormChange('hasContractualCommitment', e.target.checked)}
                      className="h-4 w-4 rounded border-steel-300 text-rail-600 focus:ring-rail-500"
                    />
                    <span className="text-sm text-steel-700">Has Take-or-Pay Commitment</span>
                  </label>

                  {formData.hasContractualCommitment && (
                    <div className="grid grid-cols-2 gap-4 pl-6">
                      <div>
                        <label className="block text-sm font-medium text-steel-700 mb-1">
                          Penalty Rate ($/car)
                        </label>
                        <input
                          type="number"
                          value={formData.commitmentPenaltyRate}
                          onChange={e => handleFormChange('commitmentPenaltyRate', parseFloat(e.target.value) || 0)}
                          className="input-field"
                          min={0}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-steel-700 mb-1">
                          Contract Start
                        </label>
                        <input
                          type="date"
                          value={formData.contractStartDate}
                          onChange={e => handleFormChange('contractStartDate', e.target.value)}
                          className="input-field"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-steel-700 mb-1">
                          Contract End
                        </label>
                        <input
                          type="date"
                          value={formData.contractEndDate}
                          onChange={e => handleFormChange('contractEndDate', e.target.value)}
                          className="input-field"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Regions */}
              <div className="border-t pt-4">
                <p className="text-sm font-medium text-steel-900 mb-3">Regions Served</p>
                <div className="flex flex-wrap gap-2">
                  {regionOptions.map(region => (
                    <button
                      key={region}
                      type="button"
                      onClick={() => handleRegionToggle(region)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                        formData.regions.includes(region)
                          ? 'bg-rail-100 border-rail-300 text-rail-700'
                          : 'bg-white border-steel-200 text-steel-600 hover:border-steel-300'
                      }`}
                    >
                      {region}
                    </button>
                  ))}
                </div>
              </div>

              {/* Contact Info */}
              <div className="border-t pt-4">
                <p className="text-sm font-medium text-steel-900 mb-3">Contact Information</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-steel-700 mb-1">
                      Contact Name
                    </label>
                    <input
                      type="text"
                      value={formData.contactName}
                      onChange={e => handleFormChange('contactName', e.target.value)}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-steel-700 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={formData.contactEmail}
                      onChange={e => handleFormChange('contactEmail', e.target.value)}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-steel-700 mb-1">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={formData.contactPhone}
                      onChange={e => handleFormChange('contactPhone', e.target.value)}
                      className="input-field"
                    />
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="border-t pt-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={e => handleFormChange('isActive', e.target.checked)}
                    className="h-4 w-4 rounded border-steel-300 text-rail-600 focus:ring-rail-500"
                  />
                  <span className="text-sm text-steel-700">Active Network</span>
                </label>
              </div>

              {/* Notes */}
              <div className="border-t pt-4">
                <label className="block text-sm font-medium text-steel-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={e => handleFormChange('notes', e.target.value)}
                  className="input-field"
                  rows={3}
                />
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* Shop Assignment Drawer */}
      <Drawer
        isOpen={isAssignDrawerOpen}
        onClose={() => setIsAssignDrawerOpen(false)}
        title={`Assign Shops to ${selectedNetwork?.name || 'Network'}`}
        position="right"
        width="lg"
        footer={
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setIsAssignDrawerOpen(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveShopAssignments}
              disabled={isSaving}
              className="btn-primary"
            >
              {isSaving ? 'Saving...' : 'Save Assignments'}
            </button>
          </div>
        }
      >
        <div className="p-4">
          <p className="text-sm text-steel-500 mb-4">
            Select shops to assign to this network. Already assigned: {selectedNetwork?.shopCount || 0}
          </p>

          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {/* Currently assigned shops */}
            {selectedNetwork?.shops && selectedNetwork.shops.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-medium text-steel-500 uppercase mb-2">Currently Assigned</p>
                {selectedNetwork.shops.map(shop => (
                  <label
                    key={shop.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-steel-200 bg-steel-50 hover:bg-steel-100 cursor-pointer mb-2"
                  >
                    <input
                      type="checkbox"
                      checked={selectedShopIds.has(shop.id)}
                      onChange={() => handleShopToggle(shop.id)}
                      className="h-4 w-4 rounded border-steel-300 text-rail-600 focus:ring-rail-500"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-steel-900">{shop.name}</p>
                      <p className="text-xs text-steel-500">
                        {shop.code} | {shop.city}, {shop.state} | Capacity: {shop.capacity}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}

            {/* Unassigned shops */}
            {unassignedShops.length > 0 && (
              <div>
                <p className="text-xs font-medium text-steel-500 uppercase mb-2">Available Shops</p>
                {unassignedShops.map(shop => (
                  <label
                    key={shop.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-steel-200 hover:bg-steel-50 cursor-pointer mb-2"
                  >
                    <input
                      type="checkbox"
                      checked={selectedShopIds.has(shop.id)}
                      onChange={() => handleShopToggle(shop.id)}
                      className="h-4 w-4 rounded border-steel-300 text-rail-600 focus:ring-rail-500"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-steel-900">{shop.name}</p>
                      <p className="text-xs text-steel-500">
                        {shop.code} | {shop.city}, {shop.state} | Capacity: {shop.capacity}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}

            {unassignedShops.length === 0 && (!selectedNetwork?.shops || selectedNetwork.shops.length === 0) && (
              <p className="text-center text-steel-500 py-8">
                No shops available to assign.
              </p>
            )}
          </div>
        </div>
      </Drawer>

      {/* Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-steel-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-steel-900">Import Networks</h3>
              <button
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportPreview([]);
                  setImportResult(null);
                }}
                className="text-steel-400 hover:text-steel-600"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {importResult ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-green-600">
                    <CheckCircleIcon className="h-6 w-6" />
                    <span className="font-medium">Import Complete</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-green-50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-green-600">{importResult.created}</p>
                      <p className="text-sm text-green-700">Created</p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-blue-600">{importResult.updated}</p>
                      <p className="text-sm text-blue-700">Updated</p>
                    </div>
                    <div className="bg-red-50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-red-600">{importResult.errors.length}</p>
                      <p className="text-sm text-red-700">Errors</p>
                    </div>
                  </div>
                  {importResult.errors.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm font-medium text-steel-900 mb-2">Errors:</p>
                      <div className="bg-red-50 rounded-lg p-3 text-sm text-red-700 max-h-32 overflow-y-auto">
                        {importResult.errors.map((err, i) => (
                          <p key={i}>{err.code}: {err.error}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-steel-600">
                    Preview of {importPreview.length} networks to import:
                  </p>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="min-w-full text-sm">
                      <thead className="bg-steel-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-steel-600">Name</th>
                          <th className="px-3 py-2 text-left font-medium text-steel-600">Code</th>
                          <th className="px-3 py-2 text-left font-medium text-steel-600">Type</th>
                          <th className="px-3 py-2 text-left font-medium text-steel-600">Tier</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-steel-100">
                        {importPreview.slice(0, 10).map((network, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2 text-steel-900">{network.name}</td>
                            <td className="px-3 py-2 text-steel-600">{network.code}</td>
                            <td className="px-3 py-2">
                              {network.isAitxInternal ? 'AITX' : '3rd Party'}
                            </td>
                            <td className="px-3 py-2">{network.networkTier || 3}</td>
                          </tr>
                        ))}
                        {importPreview.length > 10 && (
                          <tr>
                            <td colSpan={4} className="px-3 py-2 text-center text-steel-500">
                              ... and {importPreview.length - 10} more
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-steel-200 flex justify-between">
              <button
                onClick={handleDownloadSample}
                className="text-sm text-rail-600 hover:text-rail-700 underline"
              >
                Download sample template
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setIsImportModalOpen(false);
                    setImportPreview([]);
                    setImportResult(null);
                  }}
                  className="btn-secondary"
                >
                  {importResult ? 'Close' : 'Cancel'}
                </button>
                {!importResult && (
                  <button
                    onClick={handleImport}
                    disabled={isImporting || importPreview.length === 0}
                    className="btn-primary"
                  >
                    {isImporting ? 'Importing...' : `Import ${importPreview.length} Networks`}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete Network"
        message={`Are you sure you want to delete "${networkToDelete?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
      />
    </div>
  );
}
