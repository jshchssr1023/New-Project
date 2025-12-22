/**
 * S&OP Supply Settings Page
 *
 * Allows administrators to configure monthly S&OP commitments (negotiated capacity)
 * per shop for car flow planning, organized by Network hierarchy.
 *
 * Networks are assigned monthly targets from S&OP Supply register.
 * Shop capacity numbers are derived from S&OP data.
 * AITX-owned shops vs 3rd party are tracked for cost calculations.
 */

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BuildingStorefrontIcon,
  PlusIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CheckIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  AdjustmentsHorizontalIcon,
  CubeIcon,
  BuildingOffice2Icon,
  ArrowsPointingOutIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  TruckIcon,
} from '@heroicons/react/24/outline';
import { sopCommitmentApi } from '../services/carFlowApi';
import { shopsApi } from '../services/api';
import type { SOPCommitment, CreateSOPCommitmentRequest } from '../types/carFlow';
import type { Shop } from '../types';
import {
  ALL_NETWORKS,
  AITX_NETWORK,
  THIRD_PARTY_NETWORKS,
  getSystemTotalCapacity,
  SOP_PLANNING_DEFAULTS,
} from '../constants/shopNetworks';

const MONTH_ABBREV = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type ViewMode = 'network' | 'flat';
type FilterMode = 'all' | 'aitx' | 'thirdParty';
type TabType = 'supply' | 'rules';

// Shop Rule Types
interface ShopRule {
  id: string;
  shopId: string;
  shopName: string;
  shopCode: string;
  ruleType: 'car_type' | 'customer' | 'capacity' | 'qualification';
  condition: string;
  action: 'allow' | 'exclude' | 'prefer';
  priority: number;
  isActive: boolean;
}

export default function SOPSupplySettings() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('supply');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [editingCell, setEditingCell] = useState<{ shopId: string; month: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showAddShopModal, setShowAddShopModal] = useState(false);
  const [expandedNetworks, setExpandedNetworks] = useState<Set<string>>(new Set(['aitx']));
  const [viewMode, setViewMode] = useState<ViewMode>('network');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [editingNetworkTarget, setEditingNetworkTarget] = useState<{ networkId: string; year: number } | null>(null);
  const [networkTargetValue, setNetworkTargetValue] = useState('');

  // Fetch shops
  const { data: shops = [], isLoading: shopsLoading } = useQuery({
    queryKey: ['shops'],
    queryFn: () => shopsApi.getAll({ isActive: true }),
  });

  // Fetch S&OP commitments for the selected year
  const { data: commitments = [], isLoading: commitmentsLoading, error } = useQuery({
    queryKey: ['sop-commitments', selectedYear],
    queryFn: () => sopCommitmentApi.list({ year: selectedYear }),
  });

  // Get unique shop IDs from commitments
  const shopsWithCommitments = useMemo(() => {
    const shopIds = new Set(commitments.map((c: { shopId: string }) => c.shopId));
    return shops.filter((s: Shop) => shopIds.has(s.id));
  }, [shops, commitments]);

  // Build commitment map for quick lookup
  const commitmentMap = useMemo(() => {
    const map = new Map<string, number>();
    commitments.forEach((c: { shopId: string; month: number; committedVolume: number }) => {
      map.set(`${c.shopId}-${c.month}`, c.committedVolume);
    });
    return map;
  }, [commitments]);

  // Group shops by network
  const shopsByNetwork = useMemo(() => {
    const grouped: Record<string, Shop[]> = {};

    for (const network of ALL_NETWORKS) {
      grouped[network.id] = [];
    }
    grouped['unassigned'] = [];

    for (const shop of shopsWithCommitments) {
      const networkId = shop.network?.toLowerCase().replace(/\s+/g, '-') || 'unassigned';
      if (grouped[networkId]) {
        grouped[networkId].push(shop);
      } else if (shop.isAitxInternal) {
        grouped['aitx'] = grouped['aitx'] || [];
        grouped['aitx'].push(shop);
      } else {
        grouped['unassigned'].push(shop);
      }
    }

    return grouped;
  }, [shopsWithCommitments]);

  // Filter shops based on filter mode
  const filteredShops = useMemo(() => {
    if (filterMode === 'all') return shopsWithCommitments;
    if (filterMode === 'aitx') return shopsWithCommitments.filter((s: Shop) => s.isAitxInternal);
    return shopsWithCommitments.filter((s: Shop) => !s.isAitxInternal);
  }, [shopsWithCommitments, filterMode]);

  // Calculate network totals
  const networkTotals = useMemo(() => {
    const totals: Record<string, { monthly: number[]; annual: number }> = {};

    for (const network of ALL_NETWORKS) {
      const monthly = Array(12).fill(0);
      let annual = 0;

      const networkShops = shopsByNetwork[network.id] || [];
      for (const shop of networkShops) {
        for (let m = 1; m <= 12; m++) {
          const value = commitmentMap.get(`${shop.id}-${m}`) || 0;
          monthly[m - 1] += value;
          annual += value;
        }
      }

      totals[network.id] = { monthly, annual };
    }

    return totals;
  }, [shopsByNetwork, commitmentMap]);

  // Calculate grand totals
  const grandTotals = useMemo(() => {
    const monthly = Array(12).fill(0);
    let annual = 0;
    let aitxAnnual = 0;
    let thirdPartyAnnual = 0;

    for (const shop of shopsWithCommitments) {
      for (let m = 1; m <= 12; m++) {
        const value = commitmentMap.get(`${shop.id}-${m}`) || 0;
        monthly[m - 1] += value;
        annual += value;
        if (shop.isAitxInternal) {
          aitxAnnual += value;
        } else {
          thirdPartyAnnual += value;
        }
      }
    }

    return { monthly, annual, aitxAnnual, thirdPartyAnnual };
  }, [shopsWithCommitments, commitmentMap]);

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: (data: CreateSOPCommitmentRequest) => sopCommitmentApi.upsert(data),
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
    const previousCommitments = await sopCommitmentApi.list({ year: previousYear });
    const shopCommitments = previousCommitments.filter((c: { shopId: string }) => c.shopId === shopId);

    if (shopCommitments.length === 0) {
      alert(`No commitments found for ${previousYear}`);
      return;
    }

    const newCommitments: CreateSOPCommitmentRequest[] = shopCommitments.map((c: { shopId: string; month: number; committedVolume: number }) => ({
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

  const toggleNetwork = (networkId: string) => {
    setExpandedNetworks((prev) => {
      const next = new Set(prev);
      if (next.has(networkId)) {
        next.delete(networkId);
      } else {
        next.add(networkId);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedNetworks(new Set(ALL_NETWORKS.map((n) => n.id)));
  };

  const collapseAll = () => {
    setExpandedNetworks(new Set());
  };

  const isLoading = shopsLoading || commitmentsLoading;

  // Capacity stats
  const capacityStats = getSystemTotalCapacity();

  // Mock shop rules data - in production this would come from API
  const shopRules = useMemo<ShopRule[]>(() => {
    return shopsWithCommitments.flatMap((shop: Shop) => {
      const rules: ShopRule[] = [];

      // Tank car rule
      if (shop.tankQualified) {
        rules.push({
          id: `${shop.id}-tank`,
          shopId: shop.id,
          shopName: shop.name,
          shopCode: shop.code,
          ruleType: 'qualification',
          condition: 'Tank Cars',
          action: 'allow',
          priority: 1,
          isActive: true,
        });
      } else {
        rules.push({
          id: `${shop.id}-tank`,
          shopId: shop.id,
          shopName: shop.name,
          shopCode: shop.code,
          ruleType: 'qualification',
          condition: 'Tank Cars',
          action: 'exclude',
          priority: 1,
          isActive: true,
        });
      }

      // Capacity rule
      if (shop.capacity && shop.capacity > 0) {
        rules.push({
          id: `${shop.id}-capacity`,
          shopId: shop.id,
          shopName: shop.name,
          shopCode: shop.code,
          ruleType: 'capacity',
          condition: `Monthly Capacity: ${shop.capacity} cars`,
          action: 'allow',
          priority: 2,
          isActive: true,
        });
      }

      return rules;
    });
  }, [shopsWithCommitments]);

  // Group rules by shop
  const rulesByShop = useMemo(() => {
    const grouped: Record<string, ShopRule[]> = {};
    shopRules.forEach(rule => {
      if (!grouped[rule.shopId]) {
        grouped[rule.shopId] = [];
      }
      grouped[rule.shopId].push(rule);
    });
    return grouped;
  }, [shopRules]);

  return (
    <div className="p-6 max-w-full mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-steel-900">S&OP Supply Management</h1>
        <p className="text-steel-500 mt-1">
          Configure shop capacity commitments and rules for car flow planning. This is the source of truth for shops included in S&OP Supply Capacity calculations.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-steel-200 mb-6">
        <nav className="-mb-px flex gap-6">
          <button
            onClick={() => setActiveTab('supply')}
            className={`flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'supply'
                ? 'border-rail-500 text-rail-600'
                : 'border-transparent text-steel-500 hover:text-steel-700 hover:border-steel-300'
            }`}
          >
            <BuildingStorefrontIcon className="h-5 w-5" />
            Supply Capacity
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'rules'
                ? 'border-rail-500 text-rail-600'
                : 'border-transparent text-steel-500 hover:text-steel-700 hover:border-steel-300'
            }`}
          >
            <ClipboardDocumentListIcon className="h-5 w-5" />
            Shop Rules
          </button>
        </nav>
      </div>

      {/* Supply Capacity Tab */}
      {activeTab === 'supply' && (
        <>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="card p-4 border-l-4 border-l-rail-500">
          <div className="flex items-center gap-3">
            <div className="bg-rail-100 rounded-lg p-2">
              <CubeIcon className="h-5 w-5 text-rail-600" />
            </div>
            <div>
              <p className="text-xs text-steel-500 uppercase">Total Annual Capacity</p>
              <p className="text-xl font-bold text-steel-900">{grandTotals.annual.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="card p-4 border-l-4 border-l-blue-500">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 rounded-lg p-2">
              <BuildingStorefrontIcon className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-steel-500 uppercase">AITX Internal</p>
              <p className="text-xl font-bold text-steel-900">
                {grandTotals.aitxAnnual.toLocaleString()}
                <span className="text-sm font-normal text-steel-500 ml-1">
                  ({grandTotals.annual > 0 ? Math.round((grandTotals.aitxAnnual / grandTotals.annual) * 100) : 0}%)
                </span>
              </p>
            </div>
          </div>
        </div>

        <div className="card p-4 border-l-4 border-l-emerald-500">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-100 rounded-lg p-2">
              <BuildingOffice2Icon className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-steel-500 uppercase">3rd Party</p>
              <p className="text-xl font-bold text-steel-900">
                {grandTotals.thirdPartyAnnual.toLocaleString()}
                <span className="text-sm font-normal text-steel-500 ml-1">
                  ({grandTotals.annual > 0 ? Math.round((grandTotals.thirdPartyAnnual / grandTotals.annual) * 100) : 0}%)
                </span>
              </p>
            </div>
          </div>
        </div>

        <div className="card p-4 border-l-4 border-l-amber-500">
          <div className="flex items-center gap-3">
            <div className="bg-amber-100 rounded-lg p-2">
              <BuildingStorefrontIcon className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-steel-500 uppercase">Active Shops</p>
              <p className="text-xl font-bold text-steel-900">{shopsWithCommitments.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        {/* Year Selector */}
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

        {/* View Controls */}
        <div className="flex items-center gap-4">
          {/* Filter Toggle */}
          <div className="flex items-center bg-steel-100 rounded-lg p-1">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                filterMode === 'all'
                  ? 'bg-white text-steel-900 shadow-sm'
                  : 'text-steel-600 hover:text-steel-900'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterMode('aitx')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                filterMode === 'aitx'
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'text-steel-600 hover:text-steel-900'
              }`}
            >
              AITX
            </button>
            <button
              onClick={() => setFilterMode('thirdParty')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                filterMode === 'thirdParty'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-steel-600 hover:text-steel-900'
              }`}
            >
              3rd Party
            </button>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-steel-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('network')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                viewMode === 'network'
                  ? 'bg-white text-steel-900 shadow-sm'
                  : 'text-steel-600 hover:text-steel-900'
              }`}
            >
              By Network
            </button>
            <button
              onClick={() => setViewMode('flat')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                viewMode === 'flat'
                  ? 'bg-white text-steel-900 shadow-sm'
                  : 'text-steel-600 hover:text-steel-900'
              }`}
            >
              Flat List
            </button>
          </div>

          {viewMode === 'network' && (
            <div className="flex items-center gap-2">
              <button
                onClick={expandAll}
                className="btn-secondary text-xs"
                title="Expand All"
              >
                <ArrowsPointingOutIcon className="h-4 w-4" />
              </button>
              <button
                onClick={collapseAll}
                className="btn-secondary text-xs"
                title="Collapse All"
              >
                <AdjustmentsHorizontalIcon className="h-4 w-4" />
              </button>
            </div>
          )}

          <button
            onClick={() => setShowAddShopModal(true)}
            className="btn-primary flex items-center"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Add Shop
          </button>
        </div>
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

      {/* Network Hierarchy View */}
      {!isLoading && shopsWithCommitments.length > 0 && viewMode === 'network' && (
        <div className="space-y-4">
          {ALL_NETWORKS.map((network) => {
            const networkShops = shopsByNetwork[network.id] || [];
            const filteredNetworkShops = networkShops.filter((s: Shop) => {
              if (filterMode === 'aitx') return s.isAitxInternal;
              if (filterMode === 'thirdParty') return !s.isAitxInternal;
              return true;
            });

            if (filteredNetworkShops.length === 0) return null;

            const isExpanded = expandedNetworks.has(network.id);
            const totals = networkTotals[network.id];

            return (
              <div
                key={network.id}
                className={`bg-white rounded-lg border ${
                  network.isAitxInternal ? 'border-blue-200' : 'border-steel-200'
                } overflow-hidden`}
              >
                {/* Network Header */}
                <div
                  className={`flex items-center justify-between px-4 py-3 cursor-pointer ${
                    network.isAitxInternal ? 'bg-blue-50' : 'bg-steel-50'
                  } hover:bg-opacity-75`}
                  onClick={() => toggleNetwork(network.id)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDownIcon className="h-5 w-5 text-steel-400" />
                    ) : (
                      <ChevronUpIcon className="h-5 w-5 text-steel-400" />
                    )}
                    <div
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        network.isAitxInternal
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {network.isAitxInternal ? 'AITX' : '3P'}
                    </div>
                    <div>
                      <h3 className="font-semibold text-steel-900">{network.name}</h3>
                      <p className="text-xs text-steel-500">
                        {filteredNetworkShops.length} locations | Cost Index: {network.costIndex}x
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-xs text-steel-500 uppercase">Annual Target</p>
                      <p className="font-semibold text-steel-900">{totals?.annual.toLocaleString() || 0}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-steel-500 uppercase">Avg Monthly</p>
                      <p className="font-semibold text-steel-900">
                        {totals ? Math.round(totals.annual / 12).toLocaleString() : 0}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Network Shops Table */}
                {isExpanded && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-steel-200">
                      <thead className="bg-steel-50">
                        <tr>
                          <th className="sticky left-0 bg-steel-50 px-4 py-2 text-left text-xs font-semibold text-steel-700 uppercase tracking-wider border-r border-steel-200 min-w-[200px]">
                            Location
                          </th>
                          {MONTH_ABBREV.map((month) => (
                            <th
                              key={month}
                              className="px-2 py-2 text-center text-xs font-semibold text-steel-700 uppercase tracking-wider min-w-[60px]"
                            >
                              {month}
                            </th>
                          ))}
                          <th className="px-3 py-2 text-center text-xs font-semibold text-steel-700 uppercase tracking-wider bg-steel-100 border-l border-steel-200">
                            Total
                          </th>
                          <th className="px-2 py-2 text-center text-xs font-semibold text-steel-700 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-steel-100">
                        {filteredNetworkShops.map((shop: Shop) => {
                          const yearTotal = Array.from({ length: 12 }, (_, i) =>
                            commitmentMap.get(`${shop.id}-${i + 1}`) || 0
                          ).reduce((sum, v) => sum + v, 0);

                          return (
                            <tr key={shop.id} className="hover:bg-steel-50">
                              <td className="sticky left-0 bg-white px-4 py-2 border-r border-steel-200">
                                <div className="flex items-center gap-2">
                                  <BuildingStorefrontIcon className="h-4 w-4 text-steel-400" />
                                  <div>
                                    <div className="font-medium text-steel-900 text-sm">{shop.name}</div>
                                    <div className="text-xs text-steel-500">
                                      {shop.city}, {shop.state}
                                    </div>
                                  </div>
                                </div>
                              </td>

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
                                          className="w-14 px-1 py-1 text-center text-sm border border-rail-300 rounded focus:ring-1 focus:ring-rail-500 focus:border-rail-500"
                                          autoFocus
                                          min="0"
                                        />
                                        <button
                                          onClick={handleSave}
                                          className="p-0.5 text-green-600 hover:bg-green-50 rounded"
                                          disabled={saveMutation.isPending}
                                        >
                                          <CheckIcon className="h-3 w-3" />
                                        </button>
                                        <button
                                          onClick={handleCancel}
                                          className="p-0.5 text-steel-400 hover:bg-steel-100 rounded"
                                        >
                                          <XMarkIcon className="h-3 w-3" />
                                        </button>
                                      </div>
                                    ) : (
                                      <span
                                        className={`inline-block min-w-[1.5rem] px-1.5 py-0.5 rounded text-xs font-medium ${
                                          value > 0
                                            ? network.isAitxInternal
                                              ? 'bg-blue-100 text-blue-800'
                                              : 'bg-emerald-100 text-emerald-800'
                                            : 'text-steel-400'
                                        }`}
                                      >
                                        {value || '-'}
                                      </span>
                                    )}
                                  </td>
                                );
                              })}

                              <td className="px-3 py-2 text-center font-semibold text-steel-900 bg-steel-50 border-l border-steel-200 text-sm">
                                {yearTotal}
                              </td>

                              <td className="px-2 py-2 text-center">
                                <button
                                  onClick={() => handleCopyFromPreviousYear(shop.id)}
                                  className="p-1 text-steel-500 hover:text-rail-600 hover:bg-rail-50 rounded"
                                  title={`Copy from ${selectedYear - 1}`}
                                >
                                  <ArrowPathIcon className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}

                        {/* Network Subtotal Row */}
                        <tr className="bg-steel-100 font-medium">
                          <td className="sticky left-0 bg-steel-100 px-4 py-2 border-r border-steel-200 text-steel-700 text-sm">
                            {network.name} Total
                          </td>
                          {totals?.monthly.map((monthTotal, idx) => (
                            <td key={idx} className="px-2 py-2 text-center text-sm text-steel-700">
                              {monthTotal}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-center text-sm font-bold text-steel-900 bg-steel-200 border-l border-steel-200">
                            {totals?.annual || 0}
                          </td>
                          <td></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Flat List View */}
      {!isLoading && shopsWithCommitments.length > 0 && viewMode === 'flat' && (
        <div className="bg-white rounded-lg border border-steel-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-steel-200">
              <thead className="bg-steel-50">
                <tr>
                  <th className="sticky left-0 bg-steel-50 px-4 py-3 text-left text-xs font-semibold text-steel-700 uppercase tracking-wider border-r border-steel-200">
                    Shop
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-steel-700 uppercase tracking-wider">
                    Network
                  </th>
                  {MONTH_ABBREV.map((month) => (
                    <th
                      key={month}
                      className="px-2 py-3 text-center text-xs font-semibold text-steel-700 uppercase tracking-wider"
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
                {filteredShops.map((shop: Shop) => {
                  const yearTotal = Array.from({ length: 12 }, (_, i) =>
                    commitmentMap.get(`${shop.id}-${i + 1}`) || 0
                  ).reduce((sum, v) => sum + v, 0);

                  return (
                    <tr key={shop.id} className="hover:bg-steel-50">
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
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                            shop.isAitxInternal
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {shop.isAitxInternal ? 'AITX' : shop.network || '3P'}
                        </span>
                      </td>

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
                                  className="w-14 px-1 py-1 text-center text-sm border border-rail-300 rounded focus:ring-1 focus:ring-rail-500 focus:border-rail-500"
                                  autoFocus
                                  min="0"
                                />
                                <button
                                  onClick={handleSave}
                                  className="p-0.5 text-green-600 hover:bg-green-50 rounded"
                                  disabled={saveMutation.isPending}
                                >
                                  <CheckIcon className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={handleCancel}
                                  className="p-0.5 text-steel-400 hover:bg-steel-100 rounded"
                                >
                                  <XMarkIcon className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <span
                                className={`inline-block min-w-[1.5rem] px-1.5 py-0.5 rounded text-xs font-medium ${
                                  value > 0
                                    ? shop.isAitxInternal
                                      ? 'bg-blue-100 text-blue-800'
                                      : 'bg-emerald-100 text-emerald-800'
                                    : 'text-steel-400'
                                }`}
                              >
                                {value || '-'}
                              </span>
                            )}
                          </td>
                        );
                      })}

                      <td className="px-4 py-3 text-center font-semibold text-steel-900 bg-steel-50 border-l border-steel-200">
                        {yearTotal}
                      </td>

                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleCopyFromPreviousYear(shop.id)}
                          className="p-1.5 text-steel-500 hover:text-rail-600 hover:bg-rail-50 rounded"
                          title={`Copy from ${selectedYear - 1}`}
                        >
                          <ArrowPathIcon className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Footer Totals */}
              <tfoot className="bg-steel-100">
                <tr>
                  <td className="sticky left-0 bg-steel-100 px-4 py-3 font-semibold text-steel-900 border-r border-steel-200" colSpan={2}>
                    Monthly Total
                  </td>
                  {grandTotals.monthly.map((monthTotal, idx) => (
                    <td
                      key={idx}
                      className="px-2 py-3 text-center font-semibold text-steel-900"
                    >
                      {monthTotal}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-center font-bold text-steel-900 bg-steel-200 border-l border-steel-200">
                    {grandTotals.annual}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Grand Totals Summary */}
      {!isLoading && shopsWithCommitments.length > 0 && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card p-4 bg-blue-50 border-blue-200">
            <h4 className="text-sm font-medium text-blue-800 mb-2">AITX Internal Capacity</h4>
            <div className="flex justify-between text-sm">
              <span className="text-blue-600">Annual:</span>
              <span className="font-semibold text-blue-900">{grandTotals.aitxAnnual.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-blue-600">Monthly Avg:</span>
              <span className="font-semibold text-blue-900">{Math.round(grandTotals.aitxAnnual / 12).toLocaleString()}</span>
            </div>
          </div>

          <div className="card p-4 bg-emerald-50 border-emerald-200">
            <h4 className="text-sm font-medium text-emerald-800 mb-2">3rd Party Capacity</h4>
            <div className="flex justify-between text-sm">
              <span className="text-emerald-600">Annual:</span>
              <span className="font-semibold text-emerald-900">{grandTotals.thirdPartyAnnual.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-emerald-600">Monthly Avg:</span>
              <span className="font-semibold text-emerald-900">{Math.round(grandTotals.thirdPartyAnnual / 12).toLocaleString()}</span>
            </div>
          </div>

          <div className="card p-4 bg-rail-50 border-rail-200">
            <h4 className="text-sm font-medium text-rail-800 mb-2">System Total</h4>
            <div className="flex justify-between text-sm">
              <span className="text-rail-600">Annual:</span>
              <span className="font-semibold text-rail-900">{grandTotals.annual.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-rail-600">Monthly Avg:</span>
              <span className="font-semibold text-rail-900">{Math.round(grandTotals.annual / 12).toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
        </>
      )}

      {/* Shop Rules Tab */}
      {activeTab === 'rules' && (
        <div className="space-y-6">
          {/* Rules Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="card p-4 border-l-4 border-l-green-500">
              <div className="flex items-center gap-3">
                <div className="bg-green-100 rounded-lg p-2">
                  <CheckIcon className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-steel-500 uppercase">Allow Rules</p>
                  <p className="text-xl font-bold text-steel-900">
                    {shopRules.filter(r => r.action === 'allow').length}
                  </p>
                </div>
              </div>
            </div>

            <div className="card p-4 border-l-4 border-l-red-500">
              <div className="flex items-center gap-3">
                <div className="bg-red-100 rounded-lg p-2">
                  <XMarkIcon className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-xs text-steel-500 uppercase">Exclude Rules</p>
                  <p className="text-xl font-bold text-steel-900">
                    {shopRules.filter(r => r.action === 'exclude').length}
                  </p>
                </div>
              </div>
            </div>

            <div className="card p-4 border-l-4 border-l-blue-500">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 rounded-lg p-2">
                  <TruckIcon className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-steel-500 uppercase">Tank Car Certified</p>
                  <p className="text-xl font-bold text-steel-900">
                    {shopRules.filter(r => r.ruleType === 'qualification' && r.action === 'allow').length}
                  </p>
                </div>
              </div>
            </div>

            <div className="card p-4 border-l-4 border-l-amber-500">
              <div className="flex items-center gap-3">
                <div className="bg-amber-100 rounded-lg p-2">
                  <BuildingStorefrontIcon className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-steel-500 uppercase">Shops with Rules</p>
                  <p className="text-xl font-bold text-steel-900">
                    {Object.keys(rulesByShop).length}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Rules Explanation */}
          <div className="card p-4 bg-blue-50 border border-blue-200">
            <div className="flex items-start gap-3">
              <AdjustmentsHorizontalIcon className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-medium text-blue-900">Shop Rules Control Car Assignments</h3>
                <p className="text-sm text-blue-800 mt-1">
                  Shop rules determine which cars can be sent to specific shops. These rules are used in the S&OP Supply Capacity calculations
                  and affect car flow planning. Rules include tank car qualifications, capacity limits, and customer preferences.
                </p>
              </div>
            </div>
          </div>

          {/* Shop Rules Table */}
          <div className="card">
            <div className="px-4 py-3 border-b border-steel-200 flex items-center justify-between">
              <h3 className="font-semibold text-steel-900">Shop Rules by Location</h3>
            </div>
            <div className="divide-y divide-steel-200">
              {shopsWithCommitments.map((shop: Shop) => {
                const rules = rulesByShop[shop.id] || [];
                return (
                  <div key={shop.id} className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${shop.isAitxInternal ? 'bg-rail-100' : 'bg-emerald-100'}`}>
                          <BuildingStorefrontIcon className={`h-5 w-5 ${shop.isAitxInternal ? 'text-rail-600' : 'text-emerald-600'}`} />
                        </div>
                        <div>
                          <h4 className="font-medium text-steel-900">{shop.name}</h4>
                          <p className="text-xs text-steel-500">
                            {shop.code} • {shop.isAitxInternal ? 'AITX Internal' : '3rd Party'} • Cap: {shop.capacity || 0}/mo
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${shop.tankQualified ? 'bg-green-100 text-green-800' : 'bg-steel-100 text-steel-600'}`}>
                          {shop.tankQualified ? 'Tank Certified' : 'No Tank Cert'}
                        </span>
                      </div>
                    </div>

                    {/* Rules List */}
                    <div className="space-y-2 ml-11">
                      {rules.map(rule => (
                        <div
                          key={rule.id}
                          className={`flex items-center justify-between p-2 rounded-lg text-sm ${
                            rule.action === 'allow' ? 'bg-green-50 border border-green-200' :
                            rule.action === 'exclude' ? 'bg-red-50 border border-red-200' :
                            'bg-blue-50 border border-blue-200'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              rule.ruleType === 'qualification' ? 'bg-purple-100 text-purple-800' :
                              rule.ruleType === 'capacity' ? 'bg-blue-100 text-blue-800' :
                              rule.ruleType === 'customer' ? 'bg-amber-100 text-amber-800' :
                              'bg-steel-100 text-steel-800'
                            }`}>
                              {rule.ruleType.replace('_', ' ').toUpperCase()}
                            </span>
                            <span className="text-steel-700">{rule.condition}</span>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            rule.action === 'allow' ? 'bg-green-200 text-green-800' :
                            rule.action === 'exclude' ? 'bg-red-200 text-red-800' :
                            'bg-blue-200 text-blue-800'
                          }`}>
                            {rule.action.toUpperCase()}
                          </span>
                        </div>
                      ))}
                      {rules.length === 0 && (
                        <p className="text-sm text-steel-500 italic">No rules configured for this shop</p>
                      )}
                    </div>
                  </div>
                );
              })}
              {shopsWithCommitments.length === 0 && (
                <div className="p-8 text-center text-steel-500">
                  <ClipboardDocumentListIcon className="h-12 w-12 mx-auto text-steel-300 mb-3" />
                  <p>No shops with S&OP commitments found.</p>
                  <p className="text-sm mt-1">Add shops in the Supply Capacity tab first.</p>
                </div>
              )}
            </div>
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

  // Group shops by network/ownership
  const aitxShops = shops.filter((s) => s.isAitxInternal);
  const thirdPartyShops = shops.filter((s) => !s.isAitxInternal);

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
              {aitxShops.length > 0 && (
                <optgroup label="AITX Internal">
                  {aitxShops.map((shop: Shop) => (
                    <option key={shop.id} value={shop.id}>
                      {shop.name} - {shop.city}, {shop.state}
                    </option>
                  ))}
                </optgroup>
              )}
              {thirdPartyShops.length > 0 && (
                <optgroup label="3rd Party">
                  {thirdPartyShops.map((shop: Shop) => (
                    <option key={shop.id} value={shop.id}>
                      {shop.name} - {shop.city}, {shop.state}
                    </option>
                  ))}
                </optgroup>
              )}
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
