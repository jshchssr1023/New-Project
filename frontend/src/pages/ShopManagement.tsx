import { useState, useEffect, useRef, useMemo } from 'react';
import { PlusIcon, PencilIcon, TrashIcon, ArrowUpTrayIcon, ArrowDownTrayIcon, EyeIcon, XMarkIcon, CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon, ListBulletIcon, BuildingOffice2Icon, ChevronDownIcon, ChevronRightIcon, Squares2X2Icon, MagnifyingGlassIcon, TruckIcon, CalendarDaysIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import { shopsApi } from '../services/api';
import { capacityApi, carFlowPlanApi } from '../services/carFlowApi';
import { Slicer, SlicerBar, ShopCard, ShopCardGrid } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import type { Shop } from '../types';
import type { CarFlowPlan } from '../types/carFlow';

type ViewMode = 'cards' | 'list' | 'network';
const carTypes = ['Tank Car', 'Covered Hopper', 'Open Hopper', 'Boxcar', 'Gondola', 'Flatcar', 'Intermodal'];
const certificationOptions = ['DOT', 'AAR', 'FRA', 'TC (Transport Canada)', 'Hazmat'];

// Parent shop group interface (for hierarchy view)
interface ParentShopGroup {
  parentShop: Shop;         // The parent shop entity
  childShops: Shop[];       // Child locations under this parent
  totalCapacity: number;    // Sum of all child capacities (monthly)
  activeShops: number;      // Count of active child shops
  avgCostPerCar: number;    // Average cost across child shops
}

// Legacy network group interface (kept for backward compatibility)
interface NetworkGroup {
  network: string;
  isAitxInternal: boolean;
  shops: Shop[];
  totalCapacity: number;
  activeShops: number;
  avgCostPerCar: number;
}

// Import result type matching API response
interface ImportResults {
  status: 'success' | 'partial_success' | 'failed';
  newShopsAdded: number;
  existingShopsUpdated: number;
  failedRows: number;
  errors: { row: number; reason: string }[];
}

export default function ShopManagement() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [shops, setShops] = useState<Shop[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isImportResultsOpen, setIsImportResultsOpen] = useState(false);
  const [importResults, setImportResults] = useState<ImportResults | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [editingShop, setEditingShop] = useState<Shop | null>(null);
  const [viewingShop, setViewingShop] = useState<Shop | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('network'); // Default to network view
  const [networkFilter, setNetworkFilter] = useState<string>(''); // Filter by parent network
  const [locationFilter, setLocationFilter] = useState<string>(''); // Filter by specific shop location
  const [expandedNetworks, setExpandedNetworks] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [capacityData, setCapacityData] = useState<Record<string, any[]>>({});
  const [carFlowPlans, setCarFlowPlans] = useState<CarFlowPlan[]>([]);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get unique parent networks (parent shops)
  const uniqueNetworks = useMemo(() => {
    const parentShops = shops.filter(s => s.isParent);
    return parentShops.map(s => ({ value: s.id, label: s.name }));
  }, [shops]);

  // Get location options for drill-down (child shops within selected network)
  const locationOptions = useMemo(() => {
    if (!networkFilter) {
      // Show all non-parent shops as locations
      return shops
        .filter(s => !s.isParent)
        .map(s => ({ value: s.id, label: `${s.name} (${s.code})` }));
    }
    // Show child shops of selected parent network
    return shops
      .filter(s => s.parentShopId === networkFilter && !s.isParent)
      .map(s => ({ value: s.id, label: `${s.name} (${s.code})` }));
  }, [shops, networkFilter]);

  // Calculate cars planned summary stats
  const carsPlannedSummary = useMemo(() => {
    const summary = {
      totalCarsPlanned: 0,
      byShop: new Map<string, number>(),
      byNetwork: new Map<string, number>(),
      byMonth: new Map<string, number>(),
    };

    carFlowPlans.forEach(plan => {
      if (plan.status !== 'Cancelled') {
        summary.totalCarsPlanned++;

        // Count by shop
        const shopCount = summary.byShop.get(plan.shopId) || 0;
        summary.byShop.set(plan.shopId, shopCount + 1);

        // Find shop and count by network
        const shop = shops.find(s => s.id === plan.shopId);
        if (shop) {
          const networkId = shop.parentShopId || shop.id;
          const networkCount = summary.byNetwork.get(networkId) || 0;
          summary.byNetwork.set(networkId, networkCount + 1);
        }

        // Count by month
        const monthKey = `${plan.plannedYear}-${String(plan.plannedMonth).padStart(2, '0')}`;
        const monthCount = summary.byMonth.get(monthKey) || 0;
        summary.byMonth.set(monthKey, monthCount + 1);
      }
    });

    return summary;
  }, [carFlowPlans, shops]);

  // Group shops by network
  const networkGroups = useMemo((): NetworkGroup[] => {
    const groups: Record<string, NetworkGroup> = {};

    shops.forEach(shop => {
      const network = shop.network || 'Unassigned';
      if (!groups[network]) {
        groups[network] = {
          network,
          isAitxInternal: shop.isAitxInternal ?? false,
          shops: [],
          totalCapacity: 0,
          activeShops: 0,
          avgCostPerCar: 0,
        };
      }
      groups[network].shops.push(shop);
      groups[network].totalCapacity += shop.capacity || 0;
      if (shop.isActive) groups[network].activeShops++;
    });

    // Calculate average cost per car for each network
    Object.values(groups).forEach(group => {
      const totalCost = group.shops.reduce((sum, s) => sum + (s.baseCostPerCar || 0), 0);
      group.avgCostPerCar = group.shops.length > 0 ? totalCost / group.shops.length : 0;
    });

    // Sort: AITX first, then 3rd party alphabetically
    return Object.values(groups).sort((a, b) => {
      if (a.isAitxInternal && !b.isAitxInternal) return -1;
      if (!a.isAitxInternal && b.isAitxInternal) return 1;
      return a.network.localeCompare(b.network);
    });
  }, [shops]);

  // Filter network groups
  const filteredNetworkGroups = useMemo(() => {
    let filtered = networkGroups;
    if (ownershipFilter === 'aitx') {
      filtered = filtered.filter(g => g.isAitxInternal);
    } else if (ownershipFilter === '3p') {
      filtered = filtered.filter(g => !g.isAitxInternal);
    }
    if (networkFilter) {
      filtered = filtered.filter(g => g.network === networkFilter);
    }
    return filtered;
  }, [networkGroups, ownershipFilter, networkFilter]);

  // Get parent shops for hierarchy view
  const parentShops = useMemo(() => {
    return shops.filter(s => s.isParent);
  }, [shops]);

  // Group shops by parent (for hierarchy view)
  const parentShopGroups = useMemo((): ParentShopGroup[] => {
    const groups: ParentShopGroup[] = [];
    const orphanShops: Shop[] = [];

    // First, find all parent shops and their children
    parentShops.forEach(parentShop => {
      const childShops = shops.filter(s => s.parentShopId === parentShop.id && !s.isParent);
      const totalCapacity = childShops.reduce((sum, s) => sum + (s.capacity || 0), 0);
      const activeShops = childShops.filter(s => s.isActive).length;
      const totalCost = childShops.reduce((sum, s) => sum + (s.baseCostPerCar || 0), 0);
      const avgCostPerCar = childShops.length > 0 ? totalCost / childShops.length : 0;

      groups.push({
        parentShop,
        childShops,
        totalCapacity,
        activeShops,
        avgCostPerCar,
      });
    });

    // Find shops without a parent (orphans) - group by network as fallback
    shops.forEach(shop => {
      if (!shop.isParent && !shop.parentShopId) {
        orphanShops.push(shop);
      }
    });

    // If there are orphan shops, create a virtual "Unassigned" parent group
    if (orphanShops.length > 0) {
      const totalCapacity = orphanShops.reduce((sum, s) => sum + (s.capacity || 0), 0);
      const activeShops = orphanShops.filter(s => s.isActive).length;
      const totalCost = orphanShops.reduce((sum, s) => sum + (s.baseCostPerCar || 0), 0);
      const avgCostPerCar = orphanShops.length > 0 ? totalCost / orphanShops.length : 0;

      groups.push({
        parentShop: {
          id: '__unassigned__',
          name: 'Unassigned Shops',
          code: 'UNASSIGNED',
          isParent: true,
          isAitxInternal: false,
          annualTargetVolume: 0,
          parentShopId: null,
        } as Shop,
        childShops: orphanShops,
        totalCapacity,
        activeShops,
        avgCostPerCar,
      });
    }

    // Sort: AITX first, then 3rd party alphabetically
    return groups.sort((a, b) => {
      if (a.parentShop.isAitxInternal && !b.parentShop.isAitxInternal) return -1;
      if (!a.parentShop.isAitxInternal && b.parentShop.isAitxInternal) return 1;
      return a.parentShop.name.localeCompare(b.parentShop.name);
    });
  }, [shops, parentShops]);

  // Filtered parent shop groups - filter by parent network ID
  const filteredParentShopGroups = useMemo(() => {
    let filtered = parentShopGroups;
    // Filter by selected parent network
    if (networkFilter) {
      filtered = filtered.filter(g => g.parentShop.id === networkFilter);
    }
    // Filter by specific location (shop)
    if (locationFilter) {
      filtered = filtered.map(group => ({
        ...group,
        childShops: group.childShops.filter(s => s.id === locationFilter),
      })).filter(g => g.childShops.length > 0);
    }
    return filtered;
  }, [parentShopGroups, networkFilter, locationFilter]);

  const toggleNetworkExpanded = (network: string) => {
    setExpandedNetworks(prev => {
      const next = new Set(prev);
      if (next.has(network)) {
        next.delete(network);
      } else {
        next.add(network);
      }
      return next;
    });
  };

  const expandAllNetworks = () => {
    setExpandedNetworks(new Set(networkGroups.map(g => g.network)));
  };

  const collapseAllNetworks = () => {
    setExpandedNetworks(new Set());
  };
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    location: '',
    city: '',
    state: '',
    region: '',
    capacity: 10,
    baseCostPerCar: 15000,
    baseTurnTime: 14,
    capabilities: [] as string[],
    certifications: [] as string[],
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    notes: '',
    isActive: true,
    // Parent/Child hierarchy fields
    isParent: false,
    parentShopId: '' as string | null,
    annualTargetVolume: 0,
    isAitxInternal: false,
  });

  // Filter shops for card view
  const filteredShopsForCards = useMemo(() => {
    let filtered = shops;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(s =>
        s.name.toLowerCase().includes(query) ||
        s.code.toLowerCase().includes(query) ||
        s.city?.toLowerCase().includes(query) ||
        s.state?.toLowerCase().includes(query)
      );
    }
    if (activeFilter) {
      filtered = filtered.filter(s => s.isActive === (activeFilter === 'active'));
    }
    // Filter by parent network
    if (networkFilter) {
      filtered = filtered.filter(s => s.parentShopId === networkFilter || s.id === networkFilter);
    }
    // Filter by specific location
    if (locationFilter) {
      filtered = filtered.filter(s => s.id === locationFilter);
    }
    return filtered;
  }, [shops, searchQuery, activeFilter, networkFilter, locationFilter]);

  useEffect(() => {
    loadShops();
    loadCapacity();
    loadCarFlowPlans();
  }, [activeFilter]);

  const loadShops = async () => {
    try {
      const data = await shopsApi.getAll();
      let filtered = data;
      if (activeFilter) {
        filtered = filtered.filter((s: any) => s.isActive === (activeFilter === 'active'));
      }
      setShops(filtered);
    } catch (error) {
      console.error('Failed to load shops:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadCarFlowPlans = async () => {
    try {
      const currentYear = new Date().getFullYear();
      const plans = await carFlowPlanApi.list({ year: currentYear });
      setCarFlowPlans(plans);
    } catch (error) {
      console.error('Failed to load car flow plans:', error);
    }
  };

  const loadCapacity = async () => {
    try {
      const currentYear = new Date().getFullYear();
      const data = await capacityApi.get({ year: currentYear });
      if (data?.capacity) {
        const capacityMap: Record<string, any[]> = {};
        data.capacity.forEach((shopCapacity: any) => {
          capacityMap[shopCapacity.shopId] = Object.entries(shopCapacity.months || {}).map(([month, values]: [string, any]) => ({
            month: parseInt(month),
            year: currentYear,
            committed: values.committed || 0,
            planned: values.planned || 0,
            available: values.available || 0,
          }));
        });
        setCapacityData(capacityMap);
      }
    } catch (error) {
      console.error('Failed to load capacity data:', error);
    }
  };

  const handleOpenModal = (shop?: Shop) => {
    if (shop) {
      setEditingShop(shop);
      const caps = shop.capabilities;
      const certs = shop.certifications;
      setFormData({
        name: shop.name,
        code: shop.code,
        location: shop.location,
        city: shop.city || '',
        state: shop.state || '',
        region: shop.region || '',
        capacity: shop.capacity,
        baseCostPerCar: shop.baseCostPerCar || 15000,
        baseTurnTime: shop.baseTurnTime || 14,
        capabilities: Array.isArray(caps) ? caps : (typeof caps === 'string' && caps ? JSON.parse(caps) : []),
        certifications: Array.isArray(certs) ? certs : (typeof certs === 'string' && certs ? JSON.parse(certs) : []),
        contactName: shop.contactName || '',
        contactEmail: shop.contactEmail || '',
        contactPhone: shop.contactPhone || '',
        notes: shop.notes || '',
        isActive: shop.isActive,
        // Parent/Child hierarchy fields
        isParent: shop.isParent || false,
        parentShopId: shop.parentShopId || '',
        annualTargetVolume: shop.annualTargetVolume || 0,
        isAitxInternal: shop.isAitxInternal || false,
      });
    } else {
      setEditingShop(null);
      setFormData({
        name: '',
        code: '',
        location: '',
        city: '',
        state: '',
        region: '',
        capacity: 10,
        baseCostPerCar: 15000,
        baseTurnTime: 14,
        capabilities: [],
        certifications: [],
        contactName: '',
        contactEmail: '',
        contactPhone: '',
        notes: '',
        isActive: true,
        // Parent/Child hierarchy fields
        isParent: false,
        parentShopId: '',
        annualTargetVolume: 0,
        isAitxInternal: false,
      });
    }
    setIsModalOpen(true);
  };

  const handleViewShop = async (shop: Shop) => {
    try {
      const fullShop = await shopsApi.getById(shop.id);
      setViewingShop(fullShop);
      setIsViewModalOpen(true);
    } catch (error) {
      console.error('Failed to load shop details:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingShop) {
        await shopsApi.update(editingShop.id, formData);
      } else {
        await shopsApi.create(formData);
      }
      setIsModalOpen(false);
      loadShops();
    } catch (error) {
      console.error('Failed to save shop:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this shop?')) return;
    try {
      await shopsApi.delete(id);
      loadShops();
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to delete shop');
    }
  };

  const toggleCapability = (cap: string) => {
    setFormData(prev => ({
      ...prev,
      capabilities: prev.capabilities.includes(cap)
        ? prev.capabilities.filter(c => c !== cap)
        : [...prev.capabilities, cap],
    }));
  };

  const toggleCertification = (cert: string) => {
    setFormData(prev => ({
      ...prev,
      certifications: prev.certifications.includes(cert)
        ? prev.certifications.filter(c => c !== cert)
        : [...prev.certifications, cert],
    }));
  };

  // Parse CSV file and return array of shop objects
  const parseCSV = (csvText: string): Partial<Shop>[] => {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const shops: Partial<Shop>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const shop: Record<string, unknown> = {};

      headers.forEach((header, index) => {
        const value = values[index] || '';
        // Map common CSV headers to shop fields
        switch (header) {
          case 'shop_code':
          case 'code':
            shop.code = value;
            break;
          case 'shop_name':
          case 'name':
            shop.name = value;
            break;
          case 'region':
            shop.region = value;
            break;
          case 'network':
            shop.network = value;
            break;
          case 'city':
            shop.city = value;
            break;
          case 'state':
            shop.state = value;
            break;
          case 'capacity':
          case 'monthly_capacity':
            shop.capacity = parseInt(value) || 10;
            break;
          case 'tank_qualified':
          case 'tankqualified':
            shop.tankQualified = value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'yes';
            break;
          case 'is_aitx_internal':
          case 'aitx_internal':
            shop.isAitxInternal = value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'yes';
            break;
          case 'network_tier':
            shop.networkTier = parseInt(value) || 5;
            break;
          case 'serving_railroad':
          case 'railroad':
            shop.servingRailroad = value;
            break;
          case 'base_cost':
          case 'base_cost_per_car':
            shop.baseCostPerCar = parseFloat(value) || 15000;
            break;
          case 'labor_rate':
            shop.laborRate = parseFloat(value) || 75;
            break;
          case 'cost_index':
            shop.costIndex = parseFloat(value) || 1.0;
            break;
          case 'base_turn_time':
          case 'turn_time':
            shop.baseTurnTime = parseInt(value) || 14;
            break;
          case 'contact_name':
            shop.contactName = value;
            break;
          case 'contact_email':
            shop.contactEmail = value;
            break;
          case 'contact_phone':
            shop.contactPhone = value;
            break;
          case 'notes':
            shop.notes = value;
            break;
          case 'is_active':
          case 'active':
            shop.isActive = value.toLowerCase() !== 'false' && value !== '0' && value.toLowerCase() !== 'no';
            break;
        }
      });

      if (shop.code && shop.name) {
        shops.push(shop as Partial<Shop>);
      }
    }

    return shops;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      const parsedShops = parseCSV(text);

      if (parsedShops.length === 0) {
        setImportResults({
          status: 'failed',
          newShopsAdded: 0,
          existingShopsUpdated: 0,
          failedRows: 0,
          errors: [{ row: 0, reason: 'No valid shops found in CSV. Ensure headers include "code" and "name".' }]
        });
        setIsImportResultsOpen(true);
        setIsImportModalOpen(false);
        return;
      }

      const results = await shopsApi.bulkImport(parsedShops);
      setImportResults(results);
      setIsImportResultsOpen(true);
      setIsImportModalOpen(false);
      loadShops();
    } catch (error: any) {
      setImportResults({
        status: 'failed',
        newShopsAdded: 0,
        existingShopsUpdated: 0,
        failedRows: 0,
        errors: [{ row: 0, reason: error.response?.data?.message || 'Import failed. Please check your file format.' }]
      });
      setIsImportResultsOpen(true);
      setIsImportModalOpen(false);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await shopsApi.exportShops({
        region: regionFilter || undefined,
        isActive: activeFilter ? activeFilter === 'active' : undefined,
      });
    } catch (error) {
      console.error('Failed to export shops:', error);
      alert('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircleIcon className="h-12 w-12 text-green-500" />;
      case 'partial_success':
        return <ExclamationTriangleIcon className="h-12 w-12 text-amber-500" />;
      case 'failed':
        return <XCircleIcon className="h-12 w-12 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusMessage = (status: string) => {
    switch (status) {
      case 'success':
        return 'Import Successful';
      case 'partial_success':
        return 'Import Completed with Errors';
      case 'failed':
        return 'Import Failed';
      default:
        return 'Import Complete';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-steel-900">Shop Network</h1>
          <p className="mt-1 text-sm text-steel-500">
            Manage your repair shop network and capabilities
          </p>
        </div>
        <div className="flex space-x-3">
          {isAdmin && (
            <button
              onClick={() => setShowSettingsModal(true)}
              className="btn-secondary flex items-center"
              title="Admin Settings - Import/Export"
            >
              <Cog6ToothIcon className="mr-2 h-5 w-5" />
              Settings
            </button>
          )}
          <button onClick={() => handleOpenModal()} className="btn-primary flex items-center">
            <PlusIcon className="mr-2 h-5 w-5" />
            Add Shop
          </button>
        </div>
      </div>

      {/* Cars Planned Summary - Shows all cars planned into all shops */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4 border-l-4 border-l-rail-500">
          <div className="flex items-center gap-3">
            <div className="bg-rail-100 rounded-lg p-2">
              <TruckIcon className="h-5 w-5 text-rail-600" />
            </div>
            <div>
              <p className="text-xs text-steel-500 uppercase">Total Cars Planned</p>
              <p className="text-xl font-bold text-steel-900">{carsPlannedSummary.totalCarsPlanned.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="card p-4 border-l-4 border-l-blue-500">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 rounded-lg p-2">
              <BuildingOffice2Icon className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-steel-500 uppercase">Networks with Plans</p>
              <p className="text-xl font-bold text-steel-900">{carsPlannedSummary.byNetwork.size}</p>
            </div>
          </div>
        </div>

        <div className="card p-4 border-l-4 border-l-emerald-500">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-100 rounded-lg p-2">
              <ListBulletIcon className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-steel-500 uppercase">Locations with Plans</p>
              <p className="text-xl font-bold text-steel-900">{carsPlannedSummary.byShop.size}</p>
            </div>
          </div>
        </div>

        <div className="card p-4 border-l-4 border-l-amber-500">
          <div className="flex items-center gap-3">
            <div className="bg-amber-100 rounded-lg p-2">
              <CalendarDaysIcon className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-steel-500 uppercase">Active Months</p>
              <p className="text-xl font-bold text-steel-900">{carsPlannedSummary.byMonth.size}</p>
            </div>
          </div>
        </div>
      </div>

      {/* View Mode Toggle and Filters */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center space-x-4">
            {/* View Mode Toggle */}
            <div className="flex rounded-lg border border-steel-300 overflow-hidden">
              <button
                onClick={() => setViewMode('cards')}
                className={`px-3 py-1.5 text-sm flex items-center ${viewMode === 'cards' ? 'bg-crimson-600 text-white' : 'bg-white text-steel-700 hover:bg-steel-50'}`}
              >
                <Squares2X2Icon className="h-4 w-4 mr-1" />
                Cards
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 text-sm flex items-center ${viewMode === 'list' ? 'bg-crimson-600 text-white' : 'bg-white text-steel-700 hover:bg-steel-50'}`}
              >
                <ListBulletIcon className="h-4 w-4 mr-1" />
                List
              </button>
              <button
                onClick={() => setViewMode('network')}
                className={`px-3 py-1.5 text-sm flex items-center ${viewMode === 'network' ? 'bg-crimson-600 text-white' : 'bg-white text-steel-700 hover:bg-steel-50'}`}
              >
                <BuildingOffice2Icon className="h-4 w-4 mr-1" />
                Network
              </button>
            </div>
          </div>
          <span className="text-sm text-steel-500">
            {viewMode === 'cards'
              ? `${filteredShopsForCards.length} shops`
              : viewMode === 'list'
                ? `${shops.length} shops`
                : `${filteredNetworkGroups.length} networks, ${shops.length} shops`}
          </span>
        </div>

        {/* Slicer Filter Bar */}
        <div className="flex items-center gap-4 bg-white p-4 rounded-lg border border-steel-200">
          {/* Search Input */}
          <div className="relative flex-1 max-w-sm">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-steel-400" />
            <input
              type="text"
              placeholder="Search shop name, code, city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input w-full pl-9 py-2"
            />
          </div>

          <SlicerBar>
            <Slicer
              label="Network"
              options={uniqueNetworks}
              value={networkFilter}
              onChange={(v) => {
                setNetworkFilter(v as string);
                setLocationFilter(''); // Reset location when network changes
              }}
              placeholder="All Networks"
              size="sm"
            />
            <Slicer
              label="Location"
              options={locationOptions}
              value={locationFilter}
              onChange={(v) => setLocationFilter(v as string)}
              placeholder="All Locations"
              size="sm"
            />
            <Slicer
              label="Status"
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
              value={activeFilter}
              onChange={(v) => setActiveFilter(v as string)}
              placeholder="All"
              size="sm"
            />
          </SlicerBar>

          {/* Clear filters */}
          {(searchQuery || networkFilter || locationFilter || activeFilter) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setNetworkFilter('');
                setLocationFilter('');
                setActiveFilter('');
              }}
              className="text-sm text-crimson-600 hover:text-crimson-700 font-medium"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Network view controls */}
        {viewMode === 'network' && (
          <div className="flex space-x-2">
            <button
              onClick={expandAllNetworks}
              className="text-xs text-crimson-600 hover:text-crimson-800"
            >
              Expand All
            </button>
            <span className="text-steel-300">|</span>
            <button
              onClick={collapseAllNetworks}
              className="text-xs text-crimson-600 hover:text-crimson-800"
            >
              Collapse All
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="card">
          <p className="text-steel-500">Loading shops...</p>
        </div>
      ) : viewMode === 'cards' ? (
        /* Cards View */
        filteredShopsForCards.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-steel-500">No shops match your filters</p>
            <button
              onClick={() => {
                setSearchQuery('');
                setNetworkFilter('');
                setLocationFilter('');
                setActiveFilter('');
              }}
              className="mt-2 text-crimson-600 hover:text-crimson-800 font-medium"
            >
              Clear all filters
            </button>
          </div>
        ) : (
          <ShopCardGrid columns={3}>
            {filteredShopsForCards.map((shop) => (
              <ShopCard
                key={shop.id}
                shop={shop}
                capacityData={capacityData[shop.id] || []}
                onEdit={handleOpenModal}
                onDelete={handleDelete}
              />
            ))}
          </ShopCardGrid>
        )
      ) : viewMode === 'network' ? (
        /* Parent/Child Hierarchy View */
        <div className="space-y-4">
          {/* Use parent shop groups if available, otherwise fall back to network groups */}
          {(filteredParentShopGroups.length > 0 ? filteredParentShopGroups : filteredNetworkGroups.map(g => ({
            parentShop: { id: g.network, name: g.network, isAitxInternal: g.isAitxInternal, annualTargetVolume: 0, isParent: true } as Shop,
            childShops: g.shops,
            totalCapacity: g.totalCapacity,
            activeShops: g.activeShops,
            avgCostPerCar: g.avgCostPerCar,
          }))).map(group => (
            <div key={group.parentShop.id} className="card p-0 overflow-hidden">
              {/* Parent Shop Header */}
              <button
                onClick={() => toggleNetworkExpanded(group.parentShop.id)}
                className="w-full px-4 py-3 flex items-center justify-between bg-steel-100 hover:bg-steel-200 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  {expandedNetworks.has(group.parentShop.id) ? (
                    <ChevronDownIcon className="h-5 w-5 text-steel-500" />
                  ) : (
                    <ChevronRightIcon className="h-5 w-5 text-steel-500" />
                  )}
                  <div className="flex items-center space-x-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      group.parentShop.isAitxInternal
                        ? 'bg-rail-100 text-rail-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {group.parentShop.isAitxInternal ? 'AITX' : '3rd Party'}
                    </span>
                    <span className="font-semibold text-steel-900">{group.parentShop.name}</span>
                    {group.parentShop.code && group.parentShop.code !== 'UNASSIGNED' && (
                      <span className="text-xs text-steel-500 font-mono">({group.parentShop.code})</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-6 text-sm">
                  <span className="text-steel-600">
                    <span className="font-medium text-steel-900">{group.childShops.length}</span> locations
                  </span>
                  <span className="text-steel-600">
                    <span className="font-medium text-steel-900">{group.activeShops}</span> active
                  </span>
                  {group.parentShop.annualTargetVolume > 0 && (
                    <span className="text-indigo-600">
                      <span className="font-medium text-indigo-900">{group.parentShop.annualTargetVolume}</span> target/yr
                    </span>
                  )}
                  <span className="text-steel-600">
                    <span className="font-medium text-steel-900">{group.totalCapacity}</span> capacity/mo
                  </span>
                  <span className="text-steel-600">
                    ~$<span className="font-medium text-steel-900">{Math.round(group.avgCostPerCar).toLocaleString()}</span>/car
                  </span>
                </div>
              </button>

              {/* Expanded Child Shop List */}
              {expandedNetworks.has(group.parentShop.id) && (
                <div className="border-t border-steel-200">
                  <table className="min-w-full divide-y divide-steel-200">
                    <thead className="bg-steel-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-steel-500 uppercase">Shop Location</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-steel-500 uppercase">City/State</th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-steel-500 uppercase">Monthly Capacity</th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-steel-500 uppercase">Cost/Car</th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-steel-500 uppercase">Status</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-steel-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-steel-100">
                      {group.childShops.map(shop => (
                        <tr key={shop.id} className="hover:bg-steel-50">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div>
                              <div className="text-sm font-medium text-steel-900">{shop.name}</div>
                              <div className="text-xs text-steel-500 font-mono">{shop.code}</div>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-steel-700">
                            {shop.city && shop.state ? `${shop.city}, ${shop.state}` : shop.location}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center text-sm font-medium text-steel-900">
                            {shop.capacity}/mo
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center text-sm text-steel-700">
                            ${(shop.baseCostPerCar || 0).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                              shop.isActive ? 'bg-green-100 text-green-800' : 'bg-steel-200 text-steel-700'
                            }`}>
                              {shop.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                            <button
                              onClick={() => handleViewShop(shop)}
                              className="text-steel-600 hover:text-steel-900 mr-2"
                              title="View"
                            >
                              <EyeIcon className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleOpenModal(shop)}
                              className="text-rail-600 hover:text-rail-900 mr-2"
                              title="Edit"
                            >
                              <PencilIcon className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(shop.id)}
                              className="text-rail-600 hover:text-rail-900"
                              title="Delete"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}

          {filteredNetworkGroups.length === 0 && (
            <div className="card text-center py-8">
              <p className="text-steel-500">No networks match your filters</p>
            </div>
          )}
        </div>
      ) : (
        /* List View */
        <div className="card overflow-hidden p-0">
          <table className="min-w-full divide-y divide-steel-200">
            <thead className="bg-steel-800 text-white">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Shop</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Location</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Region</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider">Capacity</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider">Cost/Car</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider">Turn Time</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-steel-200">
              {shops.map((shop) => (
                <tr key={shop.id} className="hover:bg-steel-50">
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-steel-900">{shop.name}</div>
                      <div className="text-xs text-steel-500 font-mono">{shop.code}</div>
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-steel-700">
                    {shop.city && shop.state ? `${shop.city}, ${shop.state}` : shop.location}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-steel-700">
                    {shop.region || '-'}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-center text-sm font-medium text-steel-900">
                    {shop.capacity}/mo
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-steel-700">
                    ${(shop.baseCostPerCar || 15000).toLocaleString()}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-steel-700">
                    {shop.baseTurnTime || 14} days
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-center">
                    <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                      shop.isActive ? 'bg-green-100 text-green-800' : 'bg-steel-200 text-steel-700'
                    }`}>
                      {shop.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleViewShop(shop)}
                      className="text-steel-600 hover:text-steel-900 mr-3"
                      title="View details"
                    >
                      <EyeIcon className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => handleOpenModal(shop)}
                      className="text-rail-600 hover:text-rail-900 mr-3"
                      title="Edit"
                    >
                      <PencilIcon className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(shop.id)}
                      className="text-rail-600 hover:text-rail-900"
                      title="Delete"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit/Create Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-steel-900/50" onClick={() => setIsModalOpen(false)} />
            <div className="relative w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-semibold text-steel-900 mb-4">
                {editingShop ? 'Edit Shop' : 'Add New Shop'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <label className="label">Shop Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Code</label>
                    <input
                      type="text"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                      className="input font-mono"
                      placeholder="e.g., HOU"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="label">City</label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">State</label>
                    <input
                      type="text"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      className="input"
                      placeholder="e.g., TX"
                    />
                  </div>
                  <div>
                    <label className="label">Region</label>
                    <select
                      value={formData.region}
                      onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                      className="input"
                    >
                      <option value="">Select region...</option>
                      {regions.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="label">Full Address</label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="input"
                    placeholder="Full street address"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="label">Monthly Capacity</label>
                    <input
                      type="number"
                      value={formData.capacity}
                      onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 10 })}
                      className="input"
                      min="1"
                    />
                  </div>
                  <div>
                    <label className="label">Base Cost/Car ($)</label>
                    <input
                      type="number"
                      value={formData.baseCostPerCar}
                      onChange={(e) => setFormData({ ...formData, baseCostPerCar: parseInt(e.target.value) || 15000 })}
                      className="input"
                      min="0"
                      step="500"
                    />
                  </div>
                  <div>
                    <label className="label">Base Turn Time (days)</label>
                    <input
                      type="number"
                      value={formData.baseTurnTime}
                      onChange={(e) => setFormData({ ...formData, baseTurnTime: parseInt(e.target.value) || 14 })}
                      className="input"
                      min="1"
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Car Type Capabilities</label>
                  <div className="flex flex-wrap gap-2">
                    {carTypes.map(cap => (
                      <button
                        key={cap}
                        type="button"
                        onClick={() => toggleCapability(cap)}
                        className={`px-3 py-1 rounded-full text-sm ${
                          formData.capabilities.includes(cap)
                            ? 'bg-rail-600 text-white'
                            : 'bg-steel-100 text-steel-700 hover:bg-steel-200'
                        }`}
                      >
                        {cap}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="label">Certifications</label>
                  <div className="flex flex-wrap gap-2">
                    {certificationOptions.map(cert => (
                      <button
                        key={cert}
                        type="button"
                        onClick={() => toggleCertification(cert)}
                        className={`px-3 py-1 rounded-full text-sm ${
                          formData.certifications.includes(cert)
                            ? 'bg-rail-600 text-white'
                            : 'bg-steel-100 text-steel-700 hover:bg-steel-200'
                        }`}
                      >
                        {cert}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="label">Contact Name</label>
                    <input
                      type="text"
                      value={formData.contactName}
                      onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Contact Email</label>
                    <input
                      type="email"
                      value={formData.contactEmail}
                      onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Contact Phone</label>
                    <input
                      type="tel"
                      value={formData.contactPhone}
                      onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                      className="input"
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="input"
                    rows={2}
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="h-4 w-4 text-rail-600 focus:ring-rail-500 border-steel-300 rounded"
                  />
                  <label htmlFor="isActive" className="ml-2 text-sm text-steel-700">
                    Shop is active and available for assignments
                  </label>
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    {editingShop ? 'Save Changes' : 'Create Shop'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* View Details Modal */}
      {isViewModalOpen && viewingShop && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-steel-900/50" onClick={() => setIsViewModalOpen(false)} />
            <div className="relative w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
              <h2 className="text-xl font-semibold text-steel-900 mb-4">
                {viewingShop.name}
                <span className="ml-2 text-sm font-mono text-steel-500">({viewingShop.code})</span>
              </h2>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-sm text-steel-500">Location</p>
                  <p className="text-sm font-medium text-steel-900">
                    {viewingShop.city && viewingShop.state
                      ? `${viewingShop.city}, ${viewingShop.state}`
                      : viewingShop.location}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-steel-500">Region</p>
                  <p className="text-sm font-medium text-steel-900">{viewingShop.region || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-steel-500">Monthly Capacity</p>
                  <p className="text-sm font-medium text-steel-900">{viewingShop.capacity} cars</p>
                </div>
                <div>
                  <p className="text-sm text-steel-500">Base Cost/Car</p>
                  <p className="text-sm font-medium text-steel-900">
                    ${(viewingShop.baseCostPerCar || 15000).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-steel-500">Turn Time</p>
                  <p className="text-sm font-medium text-steel-900">{viewingShop.baseTurnTime || 14} days</p>
                </div>
                <div>
                  <p className="text-sm text-steel-500">Status</p>
                  <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                    viewingShop.isActive ? 'bg-green-100 text-green-800' : 'bg-steel-200 text-steel-700'
                  }`}>
                    {viewingShop.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>

              {viewingShop.capabilities && viewingShop.capabilities.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm text-steel-500 mb-2">Capabilities</p>
                  <div className="flex flex-wrap gap-2">
                    {viewingShop.capabilities.map((cap: string) => (
                      <span key={cap} className="px-2 py-1 bg-rail-100 text-rail-800 rounded text-xs">
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {viewingShop.monthlyCapacity && viewingShop.monthlyCapacity.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm text-steel-500 mb-2">Capacity Forecast (Next 12 Months)</p>
                  <div className="grid grid-cols-6 gap-2">
                    {viewingShop.monthlyCapacity.slice(0, 6).map((mc) => (
                      <div key={mc.month} className="text-center p-2 bg-steel-50 rounded">
                        <div className="text-xs text-steel-500">{mc.month}</div>
                        <div className={`text-sm font-medium ${
                          mc.utilizationPercent >= 100 ? 'text-rail-600' :
                          mc.utilizationPercent >= 80 ? 'text-amber-600' : 'text-green-600'
                        }`}>
                          {mc.used}/{mc.capacity}
                        </div>
                        <div className="text-xs text-steel-400">{mc.utilizationPercent}%</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(viewingShop.contactName || viewingShop.contactEmail || viewingShop.contactPhone) && (
                <div className="mb-4">
                  <p className="text-sm text-steel-500 mb-2">Contact</p>
                  <div className="text-sm text-steel-900">
                    {viewingShop.contactName && <div>{viewingShop.contactName}</div>}
                    {viewingShop.contactEmail && <div>{viewingShop.contactEmail}</div>}
                    {viewingShop.contactPhone && <div>{viewingShop.contactPhone}</div>}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-4">
                <button onClick={() => setIsViewModalOpen(false)} className="btn-secondary">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Settings Modal - Import/Export */}
      {showSettingsModal && isAdmin && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-steel-900/50" onClick={() => setShowSettingsModal(false)} />
            <div className="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-steel-900">Admin Settings</h2>
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="text-steel-400 hover:text-steel-600"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="border-b border-steel-200 pb-4">
                  <h3 className="text-sm font-medium text-steel-700 mb-3">Data Management</h3>
                  <p className="text-sm text-steel-500 mb-4">
                    Import and export shop network data. These features are restricted to administrators only.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => {
                      setShowSettingsModal(false);
                      setIsImportModalOpen(true);
                    }}
                    className="btn-secondary flex flex-col items-center justify-center py-6 hover:bg-steel-100"
                  >
                    <ArrowUpTrayIcon className="h-8 w-8 text-steel-600 mb-2" />
                    <span className="text-sm font-medium">Import Shops</span>
                    <span className="text-xs text-steel-500 mt-1">Upload CSV file</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowSettingsModal(false);
                      handleExport();
                    }}
                    disabled={isExporting}
                    className="btn-secondary flex flex-col items-center justify-center py-6 hover:bg-steel-100"
                  >
                    <ArrowDownTrayIcon className="h-8 w-8 text-steel-600 mb-2" />
                    <span className="text-sm font-medium">
                      {isExporting ? 'Exporting...' : 'Export Shops'}
                    </span>
                    <span className="text-xs text-steel-500 mt-1">Download CSV file</span>
                  </button>
                </div>

                <div className="bg-amber-50 rounded-lg p-4 mt-4">
                  <div className="flex items-start gap-2">
                    <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">Administrator Access</p>
                      <p className="text-xs text-amber-700 mt-1">
                        Import operations may modify existing shop data. Always verify the CSV format before importing.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-steel-900/50" onClick={() => !isImporting && setIsImportModalOpen(false)} />
            <div className="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-steel-900">Import Shops</h2>
                <button
                  onClick={() => setIsImportModalOpen(false)}
                  disabled={isImporting}
                  className="text-steel-400 hover:text-steel-600"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="border-2 border-dashed border-steel-300 rounded-lg p-8 text-center">
                  <ArrowUpTrayIcon className="h-12 w-12 text-steel-400 mx-auto mb-4" />
                  <p className="text-steel-600 mb-2">
                    Upload a CSV file with shop data
                  </p>
                  <p className="text-sm text-steel-500 mb-4">
                    Required columns: code, name<br />
                    Optional: region, network, city, state, capacity, tank_qualified, etc.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    disabled={isImporting}
                    className="hidden"
                    id="csv-upload"
                  />
                  <label
                    htmlFor="csv-upload"
                    className={`btn-primary inline-flex items-center cursor-pointer ${isImporting ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isImporting ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Importing...
                      </>
                    ) : (
                      'Select CSV File'
                    )}
                  </label>
                </div>

                <div className="bg-steel-50 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-steel-900 mb-2">CSV Format Example:</h3>
                  <code className="text-xs text-steel-600 block whitespace-pre-wrap">
                    code,name,region,network,capacity,tank_qualified{'\n'}
                    HSTN,Houston Railcar Services,Southwest,AITX-Own,25,true{'\n'}
                    DALL,Dallas Tank Repair,Southwest,3rd Party,15,true
                  </code>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Results Modal */}
      {isImportResultsOpen && importResults && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-steel-900/50" onClick={() => setIsImportResultsOpen(false)} />
            <div className="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
              <div className="text-center mb-6">
                {getStatusIcon(importResults.status)}
                <h2 className="text-xl font-semibold text-steel-900 mt-3">
                  {getStatusMessage(importResults.status)}
                </h2>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">{importResults.newShopsAdded}</div>
                  <div className="text-sm text-green-700">New Shops Added</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">{importResults.existingShopsUpdated}</div>
                  <div className="text-sm text-blue-700">Shops Updated</div>
                </div>
                <div className="bg-red-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-red-600">{importResults.failedRows}</div>
                  <div className="text-sm text-red-700">Failed Rows</div>
                </div>
              </div>

              {importResults.errors.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-steel-900 mb-2">Errors:</h3>
                  <div className="bg-red-50 rounded-lg p-3 max-h-48 overflow-y-auto">
                    <ul className="space-y-1">
                      {importResults.errors.map((error, index) => (
                        <li key={index} className="text-sm text-red-700">
                          {error.row > 0 && <span className="font-medium">Row {error.row}: </span>}
                          {error.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={() => setIsImportResultsOpen(false)}
                  className="btn-primary"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
