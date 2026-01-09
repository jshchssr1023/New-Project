import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PlusIcon,
  PlayIcon,
  TrashIcon,
  ArrowPathIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  UserGroupIcon,
  XMarkIcon,
  CheckIcon,
  BuildingStorefrontIcon,
  AdjustmentsHorizontalIcon,
  RocketLaunchIcon,
  TruckIcon,
} from '@heroicons/react/24/outline';
import { scenariosApi, plansApi, carsApi, shopsApi } from '../services/api';
import type { Scenario, Plan, Car, Shop, ScenarioCar, ShopRecommendation, OverloadedShop } from '../types';
import { EmptyState } from '../components/ui';
import { BeakerIcon } from '@heroicons/react/24/outline';
import { useWebSocket, useAssignmentUpdates } from '../contexts/WebSocketContext';
import { useCarSelection } from '../contexts/CarSelectionContext';

const statusColors: Record<string, string> = {
  draft: 'bg-steel-100 text-steel-800',
  analyzing: 'bg-amber-100 text-amber-800',
  completed: 'bg-green-100 text-green-800',
  approved: 'bg-rail-100 text-rail-800',
};

// Wizard steps for creating a scenario
type WizardStep = 'source' | 'cars' | 'shops' | 'capacity' | 'summary';

const WIZARD_STEPS: { id: WizardStep; label: string; description: string }[] = [
  { id: 'source', label: 'Source', description: 'Select Project or Customer' },
  { id: 'cars', label: 'Cars', description: 'Select cars to include' },
  { id: 'shops', label: 'Shops', description: 'Assign shops' },
  { id: 'capacity', label: 'Capacity', description: 'Review capacity' },
  { id: 'summary', label: 'Summary', description: 'Review and save' },
];

interface ShopAllocation {
  shopId: string;
  shopName: string;
  shopCode: string;
  capacity: number;
  existingLoad: number;
  allocated: number;
  month: string;
}

interface CapacityCheckResult {
  canFit: boolean;
  totalCars: number;
  allocations: ShopAllocation[];
  overflow: { month: string; count: number }[];
  details: string[];
}

export default function ScenarioManager() {
  const navigate = useNavigate();
  const { isConnected } = useWebSocket();
  const { selectedCars: globalSelectedCars, hasSelection: hasGlobalSelection, clearSelection, getSelectionSummary } = useCarSelection();

  // Track if we've shown the import prompt for this session
  const [showImportBanner, setShowImportBanner] = useState(false);
  const [importHandled, setImportHandled] = useState(false);

  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [, setPlans] = useState<Plan[]>([]);
  const [cars, setCars] = useState<Car[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [customers, setCustomers] = useState<string[]>([]);
  const [projectNumbers, setProjectNumbers] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAddCarsModalOpen, setIsAddCarsModalOpen] = useState(false);
  const [isShopSelectionModalOpen, setIsShopSelectionModalOpen] = useState(false);
  const [isCapacityCheckModalOpen, setIsCapacityCheckModalOpen] = useState(false);
  const [isRecommendationsModalOpen, setIsRecommendationsModalOpen] = useState(false);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [approvePlanName, setApprovePlanName] = useState('');
  const [activateOnApprove, setActivateOnApprove] = useState(true);
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [selectedScenarioCar, setSelectedScenarioCar] = useState<ScenarioCar | null>(null);
  const [recommendations, setRecommendations] = useState<ShopRecommendation[]>([]);
  const [capacityCheckResult, setCapacityCheckResult] = useState<CapacityCheckResult | null>(null);
  const [isCheckingCapacity, setIsCheckingCapacity] = useState(false);

  const [addCarsForm, setAddCarsForm] = useState({
    customer: '',
    projectNumber: '',
    scheduledMonth: '',
    selectedCarIds: [] as string[],
  });

  // Multi-shop selection state
  const [selectedShops, setSelectedShops] = useState<string[]>([]);
  const [shopAllocations, setShopAllocations] = useState<Record<string, Record<string, number>>>({});
  const [selectedMonth, setSelectedMonth] = useState('');

  // Wizard state for new scenario creation
  const [wizardStep, setWizardStep] = useState<WizardStep>('source');
  const [wizardSourceType, setWizardSourceType] = useState<'project' | 'customer'>('project');
  const [wizardSelectedProject, setWizardSelectedProject] = useState('');
  const [wizardSelectedCustomer, setWizardSelectedCustomer] = useState('');
  const [wizardSelectedCarIds, setWizardSelectedCarIds] = useState<string[]>([]);
  const [wizardSelectedShopIds, setWizardSelectedShopIds] = useState<string[]>([]);
  const [wizardExpandedParents, setWizardExpandedParents] = useState<Set<string>>(new Set());
  const [wizardCapacityMonthRange, setWizardCapacityMonthRange] = useState<[number, number]>([3, 9]);
  const [wizardScenarioName, setWizardScenarioName] = useState('');
  const [wizardIsSaving, setWizardIsSaving] = useState(false);

  // Real-time updates
  const handleRealtimeUpdate = useCallback(() => {
    loadData();
    if (selectedScenario) {
      loadScenarioDetails(selectedScenario.id);
    }
  }, [selectedScenario]);

  useAssignmentUpdates(handleRealtimeUpdate);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedScenario) {
      loadScenarioDetails(selectedScenario.id);
    }
  }, [selectedScenario?.id]);

  // Show import banner when arriving with global selection
  useEffect(() => {
    if (hasGlobalSelection && !importHandled) {
      setShowImportBanner(true);
    }
  }, [hasGlobalSelection, importHandled]);

  // Handle importing globally selected cars into a scenario
  const handleImportGlobalSelection = async () => {
    if (!selectedScenario || globalSelectedCars.length === 0) return;

    const defaultMonth = getNextMonths()[0]?.value || '';
    try {
      const carIds = globalSelectedCars.map(c => c.id);
      const updated = await scenariosApi.addCars(selectedScenario.id, carIds, defaultMonth);
      setSelectedScenario(updated);
      clearSelection();
      setShowImportBanner(false);
      setImportHandled(true);
    } catch (error) {
      console.error('Failed to import cars:', error);
    }
  };

  const dismissImportBanner = () => {
    setShowImportBanner(false);
    setImportHandled(true);
  };

  const loadData = async () => {
    try {
      const [scenariosData, plansData, carsResponse, shopsData] = await Promise.all([
        scenariosApi.getAll(),
        plansApi.getAll(),
        carsApi.getAll({ pageSize: 2000 }),
        shopsApi.getAll(),
      ]);
      setScenarios(scenariosData);
      setPlans(plansData);
      setCars(carsResponse.data);
      setShops(shopsData);

      // Extract unique customers and project numbers
      const uniqueCustomers = [...new Set(carsResponse.data.map(c => c.customer).filter(Boolean))];
      const uniqueProjects = [...new Set(carsResponse.data.map(c => c.projectNumber).filter(Boolean))];
      setCustomers(uniqueCustomers.sort());
      setProjectNumbers(uniqueProjects.sort());
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadScenarioDetails = async (id: string) => {
    try {
      const scenario = await scenariosApi.getById(id);
      setSelectedScenario(scenario);
    } catch (error) {
      console.error('Failed to load scenario details:', error);
    }
  };

  // Filter cars based on customer and project
  const filteredCarsForModal = useMemo(() => {
    let result = cars;
    if (addCarsForm.customer) {
      result = result.filter(c => c.customer === addCarsForm.customer);
    }
    if (addCarsForm.projectNumber) {
      result = result.filter(c => c.projectNumber === addCarsForm.projectNumber);
    }
    return result;
  }, [cars, addCarsForm.customer, addCarsForm.projectNumber]);

  const getNextMonths = () => {
    const months: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 18; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      months.push({ value, label });
    }
    return months;
  };

  const handleAddSelectedCars = async () => {
    if (!selectedScenario || addCarsForm.selectedCarIds.length === 0 || !addCarsForm.scheduledMonth) return;
    try {
      const updated = await scenariosApi.addCars(
        selectedScenario.id,
        addCarsForm.selectedCarIds,
        addCarsForm.scheduledMonth
      );
      setSelectedScenario(updated);
      setIsAddCarsModalOpen(false);
      setAddCarsForm({ customer: '', projectNumber: '', scheduledMonth: '', selectedCarIds: [] });
    } catch (error) {
      console.error('Failed to add cars:', error);
    }
  };

  const handleAddCarsByFilter = async () => {
    if (!selectedScenario || !addCarsForm.scheduledMonth) return;
    if (!addCarsForm.customer && !addCarsForm.projectNumber) {
      alert('Please select a customer or project to filter by');
      return;
    }

    try {
      const carIds = filteredCarsForModal.map(c => c.id);
      const updated = await scenariosApi.addCars(
        selectedScenario.id,
        carIds,
        addCarsForm.scheduledMonth
      );
      setSelectedScenario(updated);
      setIsAddCarsModalOpen(false);
      setAddCarsForm({ customer: '', projectNumber: '', scheduledMonth: '', selectedCarIds: [] });
    } catch (error) {
      console.error('Failed to add cars:', error);
    }
  };

  const handleRemoveCar = async (scenarioCarId: string) => {
    if (!selectedScenario) return;
    try {
      await scenariosApi.removeCar(selectedScenario.id, scenarioCarId);
      await loadScenarioDetails(selectedScenario.id);
    } catch (error) {
      console.error('Failed to remove car:', error);
    }
  };

  const handleGetRecommendations = async (scenarioCar: ScenarioCar) => {
    if (!selectedScenario) return;
    setSelectedScenarioCar(scenarioCar);
    try {
      const result = await scenariosApi.getRecommendations(selectedScenario.id, scenarioCar.id);
      setRecommendations(result.recommendations);
      setIsRecommendationsModalOpen(true);
    } catch (error) {
      console.error('Failed to get recommendations:', error);
    }
  };

  const handleAssignShop = async (shopId: string) => {
    if (!selectedScenario || !selectedScenarioCar) return;
    try {
      const updated = await scenariosApi.assignShop(selectedScenario.id, selectedScenarioCar.id, shopId);
      setSelectedScenario(updated);
      setIsRecommendationsModalOpen(false);
      setSelectedScenarioCar(null);
    } catch (error) {
      console.error('Failed to assign shop:', error);
    }
  };

  // Multi-shop selection and capacity check
  const handleOpenShopSelection = () => {
    if (!selectedScenario || !selectedScenario.cars || selectedScenario.cars.length === 0) {
      alert('No cars in scenario to assign');
      return;
    }
    setSelectedShops([]);
    setShopAllocations({});
    setSelectedMonth(getNextMonths()[0].value);
    setIsShopSelectionModalOpen(true);
  };

  const toggleShopSelection = (shopId: string) => {
    setSelectedShops(prev => {
      if (prev.includes(shopId)) {
        // Remove shop and its allocations
        const newAllocations = { ...shopAllocations };
        delete newAllocations[shopId];
        setShopAllocations(newAllocations);
        return prev.filter(id => id !== shopId);
      } else if (prev.length < 5) {
        return [...prev, shopId];
      }
      return prev;
    });
  };

  const updateShopAllocation = (shopId: string, month: string, count: number) => {
    setShopAllocations(prev => ({
      ...prev,
      [shopId]: {
        ...(prev[shopId] || {}),
        [month]: Math.max(0, count),
      },
    }));
  };

  // Capacity verification
  const handleCheckCapacity = async () => {
    if (!selectedScenario || selectedShops.length === 0) return;

    setIsCheckingCapacity(true);
    try {
      const totalCars = selectedScenario.cars?.length || 0;
      const allocations: ShopAllocation[] = [];
      const overflow: { month: string; count: number }[] = [];
      const details: string[] = [];

      let unallocatedCars = totalCars;
      const months = getNextMonths().slice(0, 6);
      const monthValues = months.map(m => m.value);

      // Get real capacity data from backend
      const capacityResult = await shopsApi.getBatchCapacity(selectedShops, monthValues);
      const { capacityData } = capacityResult;

      // Calculate allocations for each shop and month
      for (const shopId of selectedShops) {
        const shop = shops.find(s => s.id === shopId);
        if (!shop) continue;

        for (const monthData of months) {
          const month = monthData.value;
          const shopAlloc = shopAllocations[shopId]?.[month] || 0;

          // Get real existing load from backend
          const existingLoad = capacityData[shopId]?.[month]?.used || 0;

          allocations.push({
            shopId,
            shopName: shop.name,
            shopCode: shop.code,
            capacity: shop.capacity,
            existingLoad,
            allocated: shopAlloc,
            month,
          });

          if (shopAlloc > 0) {
            const available = shop.capacity - existingLoad;
            if (shopAlloc > available) {
              const overflowCount = shopAlloc - available;
              overflow.push({ month, count: overflowCount });
              details.push(`${shop.name} (${month}): ${overflowCount} cars will overflow to next month`);
            }
            unallocatedCars -= Math.min(shopAlloc, available);
          }
        }
      }

      // Auto-distribute unallocated cars
      if (unallocatedCars > 0) {
        details.push(`${unallocatedCars} cars need to be allocated`);
      }

      const canFit = unallocatedCars === 0 && overflow.length === 0;

      setCapacityCheckResult({
        canFit,
        totalCars,
        allocations,
        overflow,
        details,
      });

      setIsCapacityCheckModalOpen(true);
    } catch (error) {
      console.error('Capacity check failed:', error);
    } finally {
      setIsCheckingCapacity(false);
    }
  };

  // Bulk assign to selected shops (ONE-STEP: just assign shops, approval handles the rest)
  const handleBulkAssignToShops = async () => {
    if (!selectedScenario || selectedShops.length === 0) return;

    try {
      // Assign cars to selected shops based on allocations
      const scenarioCars = selectedScenario.cars || [];
      let carIndex = 0;
      let assignedCount = 0;

      for (const shopId of selectedShops) {
        const shopAllocCount = Object.values(shopAllocations[shopId] || {}).reduce((sum, count) => sum + count, 0);

        for (let i = 0; i < shopAllocCount && carIndex < scenarioCars.length; i++) {
          const sc = scenarioCars[carIndex];
          if (!sc.assignedShopId) {
            await scenariosApi.assignShop(selectedScenario.id, sc.id, shopId);
            assignedCount++;
          }
          carIndex++;
        }
      }

      // ONE-STEP FLOW: Just assign shops here. Approval will handle:
      // - Creating SOPAssignments
      // - Creating MasterPlan with commitments
      // - Updating Car.assignedShopId
      // - Using suggestedShopId for any unassigned cars

      alert(
        `Shop assignments saved!\n\n` +
        `${assignedCount} cars assigned to shops.\n` +
        `Click "Approve Scenario" to finalize and create the Master Plan.`
      );

      await loadScenarioDetails(selectedScenario.id);
      setIsShopSelectionModalOpen(false);
      setIsCapacityCheckModalOpen(false);
    } catch (error) {
      console.error('Bulk assign failed:', error);
      alert('Failed to assign shops. Please try again.');
    }
  };

  const handleRunAnalysis = async (id: string) => {
    try {
      const updated = await scenariosApi.analyze(id);
      setSelectedScenario(updated);
      await loadData();
    } catch (error) {
      console.error('Failed to run analysis:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this scenario?')) return;
    try {
      await scenariosApi.delete(id);
      if (selectedScenario?.id === id) {
        setSelectedScenario(null);
      }
      loadData();
    } catch (error) {
      console.error('Failed to delete scenario:', error);
    }
  };

  const handleOpenApproveModal = () => {
    if (!selectedScenario) return;

    // Check if scenario has cars with assignments (either manual or suggested)
    // ONE-STEP: The backend will use suggestedShopId if assignedShopId is not set
    const hasCarsWithShops = selectedScenario.cars?.some(
      (sc) => sc.assignedShopId || sc.suggestedShopId
    );

    if (!selectedScenario.cars || selectedScenario.cars.length === 0) {
      alert('Please add cars to the scenario before approving.');
      return;
    }

    if (!hasCarsWithShops) {
      alert('Please assign shops to cars or run "Verify Capacity" to get shop suggestions before approving.');
      return;
    }

    setApprovePlanName(`${selectedScenario.projectNumber} - ${selectedScenario.name}`);
    setActivateOnApprove(true);
    setIsApproveModalOpen(true);
  };

  const handleApproveScenario = async () => {
    if (!selectedScenario) return;

    setIsApproving(true);
    try {
      const result = await scenariosApi.approve(selectedScenario.id, {
        planName: approvePlanName || `${selectedScenario.projectNumber} - ${selectedScenario.name}`,
        activate: activateOnApprove,
      });

      alert(
        `Success! ${result.message}\n\n` +
        `Master Plan: ${result.masterPlan.planName}\n` +
        `Fiscal Year: FY${result.masterPlan.fiscalYear}\n` +
        `Status: ${result.masterPlan.status}\n` +
        `Commitments: ${result.masterPlan.commitmentCount}`
      );

      setIsApproveModalOpen(false);
      setApprovePlanName('');
      await loadData();

      // Update selected scenario to show new status
      if (selectedScenario) {
        loadScenarioDetails(selectedScenario.id);
      }
    } catch (error: any) {
      console.error('Failed to approve scenario:', error);
      alert(error.response?.data?.message || 'Failed to approve scenario. Please try again.');
    } finally {
      setIsApproving(false);
    }
  };

  const handleRailcarClick = (railcarNumber: string) => {
    navigate(`/cars?search=${encodeURIComponent(railcarNumber)}`);
  };

  const toggleCarSelection = (carId: string) => {
    setAddCarsForm(prev => ({
      ...prev,
      selectedCarIds: prev.selectedCarIds.includes(carId)
        ? prev.selectedCarIds.filter(id => id !== carId)
        : [...prev.selectedCarIds, carId]
    }));
  };

  // Get total allocated for display
  const getTotalAllocated = () => {
    return Object.values(shopAllocations).reduce((total, months) => {
      return total + Object.values(months).reduce((sum, count) => sum + count, 0);
    }, 0);
  };

  // =============================================================================
  // WIZARD FUNCTIONS
  // =============================================================================

  // Filter cars based on wizard source selection
  const wizardFilteredCars = useMemo(() => {
    if (wizardSourceType === 'project' && wizardSelectedProject) {
      return cars.filter(c => c.projectNumber === wizardSelectedProject);
    }
    if (wizardSourceType === 'customer' && wizardSelectedCustomer) {
      return cars.filter(c => c.customer === wizardSelectedCustomer);
    }
    return [];
  }, [cars, wizardSourceType, wizardSelectedProject, wizardSelectedCustomer]);

  // Group shops by parent for wizard shop selection
  const wizardParentShopGroups = useMemo(() => {
    const parentShops = shops.filter(s => s.isParent);
    const groups: { parent: Shop; children: Shop[] }[] = [];

    parentShops.forEach(parent => {
      const children = shops.filter(s => s.parentShopId === parent.id && !s.isParent);
      groups.push({ parent, children });
    });

    // Add orphan shops (no parent) as a group
    const orphans = shops.filter(s => !s.isParent && !s.parentShopId);
    if (orphans.length > 0) {
      groups.push({
        parent: { id: '__orphans__', name: 'Unassigned Shops', isParent: true, isAitxInternal: false } as Shop,
        children: orphans
      });
    }

    return groups.sort((a, b) => {
      if (a.parent.isAitxInternal && !b.parent.isAitxInternal) return -1;
      if (!a.parent.isAitxInternal && b.parent.isAitxInternal) return 1;
      return a.parent.name.localeCompare(b.parent.name);
    });
  }, [shops]);

  // Calculate capacity for selected shops in the month range
  const wizardCapacityData = useMemo(() => {
    const selectedShopsList = shops.filter(s => wizardSelectedShopIds.includes(s.id));
    const months: { key: string; label: string; totalCapacity: number; allocated: number; status: 'green' | 'yellow' | 'red' }[] = [];

    const now = new Date();
    for (let i = wizardCapacityMonthRange[0]; i <= wizardCapacityMonthRange[1]; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = date.toLocaleString('en-US', { month: 'short', year: '2-digit' });

      const totalCapacity = selectedShopsList.reduce((sum, s) => sum + (s.capacity || 0), 0);
      const allocated = wizardSelectedCarIds.length > 0 ? Math.ceil(wizardSelectedCarIds.length / (wizardCapacityMonthRange[1] - wizardCapacityMonthRange[0] + 1)) : 0;

      const utilization = totalCapacity > 0 ? allocated / totalCapacity : 0;
      let status: 'green' | 'yellow' | 'red' = 'green';
      if (utilization > 1) status = 'red';
      else if (utilization > 0.85) status = 'yellow';

      months.push({ key: monthKey, label: monthLabel, totalCapacity, allocated, status });
    }

    return months;
  }, [shops, wizardSelectedShopIds, wizardSelectedCarIds, wizardCapacityMonthRange]);

  // Calculate space hold allocations - distribute cars across shops and months based on capacity
  const spaceHoldAllocations = useMemo(() => {
    const selectedShopsList = shops.filter(s => wizardSelectedShopIds.includes(s.id));
    const totalCars = wizardSelectedCarIds.length;
    const numShops = selectedShopsList.length;
    const numMonths = wizardCapacityMonthRange[1] - wizardCapacityMonthRange[0] + 1;

    if (numShops === 0 || numMonths === 0 || totalCars === 0) {
      return { allocations: [], totalAllocated: 0, months: [] };
    }

    // Calculate total capacity across all shops
    const totalCapacity = selectedShopsList.reduce((sum, s) => sum + (s.capacity || 0), 0);

    // Generate months
    const now = new Date();
    const months: { key: string; label: string; year: number; month: number }[] = [];
    for (let i = wizardCapacityMonthRange[0]; i <= wizardCapacityMonthRange[1]; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
      months.push({
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        label: date.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
        year: date.getFullYear(),
        month: date.getMonth() + 1,
      });
    }

    // Distribute cars proportionally by shop capacity, evenly across months
    const allocations: { shopId: string; shopName: string; shopCode: string; monthKey: string; monthLabel: string; carsAllocated: number; capacity: number; utilization: number }[] = [];
    let totalAllocated = 0;
    let remainingCars = totalCars;

    // Calculate per-shop allocations based on capacity ratio
    const shopAllocations: Map<string, number> = new Map();
    selectedShopsList.forEach((shop, idx) => {
      const shopCapacityRatio = totalCapacity > 0 ? (shop.capacity || 0) / totalCapacity : 1 / numShops;
      const shopTotalCars = Math.floor(totalCars * shopCapacityRatio);
      shopAllocations.set(shop.id, shopTotalCars);
      remainingCars -= shopTotalCars;

      // Distribute leftover cars to first few shops
      if (idx < remainingCars) {
        shopAllocations.set(shop.id, (shopAllocations.get(shop.id) || 0) + 1);
      }
    });

    // Now distribute each shop's cars across months
    selectedShopsList.forEach(shop => {
      const shopCars = shopAllocations.get(shop.id) || 0;
      const carsPerMonth = Math.floor(shopCars / numMonths);
      let shopRemainder = shopCars - (carsPerMonth * numMonths);

      months.forEach((monthData, monthIdx) => {
        let monthCars = carsPerMonth;
        if (monthIdx < shopRemainder) {
          monthCars += 1;
        }

        const utilization = (shop.capacity || 1) > 0 ? monthCars / (shop.capacity || 1) : 0;

        allocations.push({
          shopId: shop.id,
          shopName: shop.name,
          shopCode: shop.code,
          monthKey: monthData.key,
          monthLabel: monthData.label,
          carsAllocated: monthCars,
          capacity: shop.capacity || 0,
          utilization,
        });

        totalAllocated += monthCars;
      });
    });

    return { allocations, totalAllocated, months };
  }, [shops, wizardSelectedShopIds, wizardSelectedCarIds, wizardCapacityMonthRange]);

  // Check if wizard can proceed to next step
  const canProceedToStep = (step: WizardStep): boolean => {
    switch (step) {
      case 'cars':
        return (wizardSourceType === 'project' && !!wizardSelectedProject) ||
               (wizardSourceType === 'customer' && !!wizardSelectedCustomer);
      case 'shops':
        return wizardSelectedCarIds.length > 0;
      case 'capacity':
        return wizardSelectedShopIds.length > 0;
      case 'summary':
        return wizardCapacityData.every(m => m.status !== 'red');
      default:
        return true;
    }
  };

  // Reset wizard state
  const resetWizard = () => {
    setWizardStep('source');
    setWizardSourceType('project');
    setWizardSelectedProject('');
    setWizardSelectedCustomer('');
    setWizardSelectedCarIds([]);
    setWizardSelectedShopIds([]);
    setWizardExpandedParents(new Set());
    setWizardCapacityMonthRange([3, 9]);
    setWizardScenarioName('');
    setWizardIsSaving(false);
  };

  // Open wizard modal
  const openWizardModal = () => {
    resetWizard();
    setIsModalOpen(true);
  };

  // Toggle parent shop expansion in wizard
  const toggleWizardParentExpanded = (parentId: string) => {
    setWizardExpandedParents(prev => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  };

  // Toggle shop selection in wizard
  const toggleWizardShopSelection = (shopId: string) => {
    setWizardSelectedShopIds(prev =>
      prev.includes(shopId) ? prev.filter(id => id !== shopId) : [...prev, shopId]
    );
  };

  // Save scenario from wizard (can save at any step after naming)
  const saveWizardScenario = async (_asDraft: boolean = true) => {
    if (!wizardScenarioName.trim()) {
      alert('Please enter a scenario name');
      return;
    }

    setWizardIsSaving(true);
    try {
      // Create the scenario
      const projectNumber = wizardSourceType === 'project' ? wizardSelectedProject : `CUST-${Date.now()}`;
      const newScenario = await scenariosApi.create({
        projectNumber,
        name: wizardScenarioName,
        description: `${wizardSourceType === 'project' ? 'Project' : 'Customer'}: ${wizardSourceType === 'project' ? wizardSelectedProject : wizardSelectedCustomer}`,
        customerFilter: wizardSourceType === 'customer' ? wizardSelectedCustomer : '',
      });

      // If cars are selected, add them
      if (wizardSelectedCarIds.length > 0) {
        const defaultMonth = getNextMonths()[0]?.value || '';
        await scenariosApi.addCars(newScenario.id, wizardSelectedCarIds, defaultMonth);
      }

      // If shops are selected, assign them
      if (wizardSelectedShopIds.length > 0 && wizardSelectedCarIds.length > 0) {
        // Distribute cars across selected shops
        const carsPerShop = Math.ceil(wizardSelectedCarIds.length / wizardSelectedShopIds.length);
        let carIndex = 0;

        for (const _shopId of wizardSelectedShopIds) {
          for (let i = 0; i < carsPerShop && carIndex < wizardSelectedCarIds.length; i++) {
            // Shop assignment will be done after scenario is loaded
            carIndex++;
          }
        }
      }

      // Reload data and close modal
      await loadData();
      setSelectedScenario(newScenario);
      setIsModalOpen(false);
      resetWizard();
    } catch (error) {
      console.error('Failed to save scenario:', error);
      alert('Failed to save scenario. Please try again.');
    } finally {
      setWizardIsSaving(false);
    }
  };

  // Navigate wizard steps
  const goToWizardStep = (step: WizardStep) => {
    const currentIndex = WIZARD_STEPS.findIndex(s => s.id === wizardStep);
    const targetIndex = WIZARD_STEPS.findIndex(s => s.id === step);

    // Can only go to completed steps or next step
    if (targetIndex <= currentIndex || targetIndex === currentIndex + 1) {
      if (targetIndex <= currentIndex || canProceedToStep(step)) {
        setWizardStep(step);
      }
    }
  };

  const nextWizardStep = () => {
    const currentIndex = WIZARD_STEPS.findIndex(s => s.id === wizardStep);
    if (currentIndex < WIZARD_STEPS.length - 1) {
      const nextStep = WIZARD_STEPS[currentIndex + 1].id;
      if (canProceedToStep(nextStep)) {
        setWizardStep(nextStep);
      }
    }
  };

  const prevWizardStep = () => {
    const currentIndex = WIZARD_STEPS.findIndex(s => s.id === wizardStep);
    if (currentIndex > 0) {
      setWizardStep(WIZARD_STEPS[currentIndex - 1].id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-steel-900">Scenario Builder</h1>
          <p className="mt-1 text-sm text-steel-500">
            Build scenarios to test shop capacity and get recommendations
            {isConnected && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Live
              </span>
            )}
          </p>
        </div>
        <button onClick={openWizardModal} className="btn-primary flex items-center">
          <PlusIcon className="mr-2 h-5 w-5" />
          New Scenario
        </button>
      </div>

      {/* Global Car Selection Import Banner */}
      {showImportBanner && hasGlobalSelection && (
        <div className="bg-rail-50 border border-rail-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TruckIcon className="h-6 w-6 text-rail-600" />
              <div>
                <p className="font-medium text-rail-900">Cars Selected from Railcars Page</p>
                <p className="text-sm text-rail-700">{getSelectionSummary()}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedScenario ? (
                <button
                  onClick={handleImportGlobalSelection}
                  className="btn-primary py-2 px-4 text-sm"
                >
                  Add to Current Scenario
                </button>
              ) : (
                <span className="text-sm text-rail-600">Select or create a scenario first</span>
              )}
              <button
                onClick={dismissImportBanner}
                className="text-rail-500 hover:text-rail-700 p-1"
                title="Dismiss"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="card">
          <p className="text-steel-500">Loading scenarios...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Scenarios list */}
          <div className="space-y-4">
            <h2 className="text-lg font-medium text-steel-900">Scenarios</h2>
            {scenarios.length === 0 ? (
              <div className="card">
                <EmptyState
                  icon={BeakerIcon}
                  title="No scenarios yet"
                  description="Create your first scenario to start planning railcar service assignments."
                  action={{
                    label: 'Create Scenario',
                    onClick: () => setIsModalOpen(true),
                  }}
                />
              </div>
            ) : (
              scenarios.map((scenario) => (
                <div
                  key={scenario.id}
                  className={`card cursor-pointer transition-all ${
                    selectedScenario?.id === scenario.id ? 'ring-2 ring-rail-500' : ''
                  }`}
                  onClick={() => setSelectedScenario(scenario)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono bg-steel-100 px-2 py-0.5 rounded text-steel-600">
                          {scenario.projectNumber || 'NO-PROJECT'}
                        </span>
                      </div>
                      <h3 className="text-lg font-medium text-steel-900">{scenario.name}</h3>
                      <p className="text-sm text-steel-500 mt-1 line-clamp-2">{scenario.description}</p>
                      {scenario.customerFilter && (
                        <div className="flex items-center mt-2 text-xs text-steel-600">
                          <UserGroupIcon className="h-4 w-4 mr-1" />
                          {scenario.customerFilter}
                        </div>
                      )}
                      <div className="text-xs text-steel-500 mt-1">
                        {scenario.carCount || scenario.cars?.length || 0} cars
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusColors[scenario.status]}`}>
                        {scenario.status}
                      </span>
                      <ChevronRightIcon className="h-5 w-5 text-steel-400" />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Scenario details and cars */}
          <div className="lg:col-span-2 space-y-4">
            {selectedScenario ? (
              <>
                {/* Scenario header */}
                <div className="card">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-steel-900">{selectedScenario.name}</h2>
                      <p className="text-sm text-steel-500 mt-1">{selectedScenario.description}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => setIsAddCarsModalOpen(true)}
                        className="btn-secondary py-2 px-3 text-sm flex items-center"
                      >
                        <PlusIcon className="mr-1 h-4 w-4" />
                        Add Cars
                      </button>
                      <button
                        onClick={handleOpenShopSelection}
                        className="btn-secondary py-2 px-3 text-sm flex items-center"
                        disabled={!selectedScenario.cars?.length}
                      >
                        <BuildingStorefrontIcon className="mr-1 h-4 w-4" />
                        Select Shops
                      </button>
                      {selectedScenario.status === 'draft' && selectedScenario.cars?.length > 0 && (
                        <>
                          <button
                            onClick={() => handleRunAnalysis(selectedScenario.id)}
                            className="btn-secondary py-2 px-3 text-sm flex items-center"
                          >
                            <PlayIcon className="mr-1 h-4 w-4" />
                            Verify Capacity
                          </button>
                          {/* ONE-STEP: Allow approval directly from draft if cars have shops */}
                          {selectedScenario.cars?.some(c => c.assignedShopId || c.suggestedShopId) && (
                            <button
                              onClick={handleOpenApproveModal}
                              className="btn-primary py-2 px-4 text-sm flex items-center font-medium bg-green-600 hover:bg-green-700"
                            >
                              <RocketLaunchIcon className="mr-2 h-4 w-4" />
                              Approve Scenario
                            </button>
                          )}
                        </>
                      )}
                      {selectedScenario.status === 'analyzing' && (
                        <button disabled className="btn-secondary py-2 px-3 text-sm flex items-center opacity-50">
                          <ArrowPathIcon className="mr-1 h-4 w-4 animate-spin" />
                          Analyzing...
                        </button>
                      )}
                      {selectedScenario.status === 'completed' && (
                        <button
                          onClick={handleOpenApproveModal}
                          className="btn-primary py-2 px-4 text-sm flex items-center font-medium bg-green-600 hover:bg-green-700"
                        >
                          <RocketLaunchIcon className="mr-2 h-4 w-4" />
                          Approve Scenario
                        </button>
                      )}
                      {selectedScenario.status === 'approved' && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                          <CheckCircleIcon className="h-5 w-5 text-green-600" />
                          <span className="text-sm font-medium text-green-800">
                            Approved - Master Plan Created
                          </span>
                        </div>
                      )}
                      <button
                        onClick={() => handleDelete(selectedScenario.id)}
                        className="text-red-600 hover:text-red-900 p-2"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Analysis Results Summary */}
                {selectedScenario.results && (
                  <div className="card">
                    <h3 className="text-lg font-medium text-steel-900 mb-4">Capacity Verification Results</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      <div className="bg-steel-50 rounded-lg p-4">
                        <p className="text-sm text-steel-500">Total Cars</p>
                        <p className="text-2xl font-bold text-steel-900">{selectedScenario.results.totalCars}</p>
                      </div>
                      <div className="bg-green-50 rounded-lg p-4">
                        <p className="text-sm text-steel-500">Assigned</p>
                        <p className="text-2xl font-bold text-green-600">{selectedScenario.results.assignedCars}</p>
                      </div>
                      <div className="bg-amber-50 rounded-lg p-4">
                        <p className="text-sm text-steel-500">Suggested</p>
                        <p className="text-2xl font-bold text-amber-600">{selectedScenario.results.suggestedCars}</p>
                      </div>
                      <div className="bg-red-50 rounded-lg p-4">
                        <p className="text-sm text-steel-500">Unassigned</p>
                        <p className="text-2xl font-bold text-red-600">{selectedScenario.results.unassignedCars}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div className="bg-steel-50 rounded-lg p-4">
                        <p className="text-sm text-steel-500">Estimated Total Cost</p>
                        <p className="text-xl font-bold text-steel-900">
                          ${selectedScenario.results.totalCost?.toLocaleString() || 0}
                        </p>
                      </div>
                      <div className="bg-steel-50 rounded-lg p-4">
                        <p className="text-sm text-steel-500">Avg Turn Time</p>
                        <p className="text-xl font-bold text-steel-900">
                          {selectedScenario.results.averageTurnTime?.toFixed(1) || 0} days
                        </p>
                      </div>
                    </div>

                    {/* Capacity Analysis */}
                    {selectedScenario.results.capacityAnalysis && (
                      <div className="border-t border-steel-200 pt-4">
                        <h4 className="text-sm font-medium text-steel-700 mb-3 flex items-center">
                          {selectedScenario.results.capacityAnalysis.hasOverload ? (
                            <>
                              <ExclamationTriangleIcon className="h-5 w-5 text-amber-500 mr-2" />
                              <span className="text-amber-700">
                                Capacity Constraints Detected - Cars will overflow to next month
                              </span>
                            </>
                          ) : (
                            <>
                              <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2" />
                              <span className="text-green-700">YES - All Cars Can Fit in Schedule</span>
                            </>
                          )}
                        </h4>

                        {selectedScenario.results.capacityAnalysis.overloadedShops?.length > 0 && (
                          <div className="space-y-2">
                            {selectedScenario.results.capacityAnalysis.overloadedShops.map((overload: OverloadedShop, idx: number) => (
                              <div key={idx} className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                <div className="flex justify-between items-center">
                                  <span className="font-medium text-amber-900">
                                    {overload.shopName} ({overload.shopCode})
                                  </span>
                                  <span className="text-amber-600 text-sm">{overload.month}</span>
                                </div>
                                <div className="text-sm text-amber-700 mt-1">
                                  Total load: {overload.totalLoad} / {overload.capacity} capacity
                                  <span className="ml-2">
                                    ({overload.overloadPercent.toFixed(0)}% over → overflow to next month)
                                  </span>
                                </div>
                                <div className="text-xs text-amber-600 mt-1">
                                  Existing: {overload.existingLoad} + Scenario: {overload.scenarioLoad}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Cars in scenario */}
                <div className="card">
                  <h3 className="text-lg font-medium text-steel-900 mb-4">
                    Cars in Scenario ({selectedScenario.cars?.length || 0})
                  </h3>
                  {!selectedScenario.cars || selectedScenario.cars.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-steel-500 mb-4">No cars added to this scenario yet.</p>
                      <button
                        onClick={() => setIsAddCarsModalOpen(true)}
                        className="btn-primary"
                      >
                        <PlusIcon className="mr-2 h-5 w-5 inline" />
                        Add Cars
                      </button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-steel-200">
                        <thead className="bg-steel-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                              Car #
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                              Type / Customer
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                              Month
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                              Suggested Shop
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                              Assigned Shop
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                              Score
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-steel-500 uppercase tracking-wider">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-steel-200">
                          {selectedScenario.cars.map((sc) => (
                            <tr key={sc.id} className="hover:bg-steel-50">
                              <td className="px-4 py-3 whitespace-nowrap">
                                <button
                                  onClick={() => sc.car?.railcarNumber && handleRailcarClick(sc.car.railcarNumber)}
                                  className="font-medium text-rail-600 hover:text-rail-800 hover:underline"
                                >
                                  {sc.car?.railcarNumber}
                                </button>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="text-sm text-steel-900">{sc.car?.carType}</div>
                                <div className="text-xs text-steel-500">{sc.car?.customer}</div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-steel-500">
                                {sc.scheduledMonth}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                {sc.suggestedShop ? (
                                  <span className="text-sm text-amber-600">{sc.suggestedShop.name}</span>
                                ) : (
                                  <span className="text-sm text-steel-400">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                {sc.assignedShop ? (
                                  <span className="text-sm font-medium text-green-600">{sc.assignedShop.name}</span>
                                ) : (
                                  <span className="text-sm text-steel-400">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className={`text-sm font-medium ${sc.ruleScore > 60 ? 'text-green-600' : sc.ruleScore > 30 ? 'text-amber-600' : 'text-red-600'}`}>
                                  {sc.ruleScore?.toFixed(1) || '-'}
                                </span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-right">
                                <button
                                  onClick={() => handleGetRecommendations(sc)}
                                  className="text-rail-600 hover:text-rail-900 text-sm mr-3"
                                >
                                  View Options
                                </button>
                                <button
                                  onClick={() => handleRemoveCar(sc.id)}
                                  className="text-red-600 hover:text-red-900"
                                >
                                  <XMarkIcon className="h-5 w-5 inline" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="card text-center py-12">
                <p className="text-steel-500">Select a scenario to view details or create a new one</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scenario Creation Wizard Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-steel-900/50" onClick={() => { setIsModalOpen(false); resetWizard(); }} />
            <div className="relative w-full max-w-4xl rounded-xl bg-white shadow-xl max-h-[90vh] flex flex-col">
              {/* Wizard Header */}
              <div className="p-6 border-b border-steel-200">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-steel-900">Create New Scenario</h2>
                  <button onClick={() => { setIsModalOpen(false); resetWizard(); }} className="text-steel-400 hover:text-steel-600">
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>
                {/* Step Progress */}
                <div className="flex items-center justify-between">
                  {WIZARD_STEPS.map((step, index) => {
                    const currentIndex = WIZARD_STEPS.findIndex(s => s.id === wizardStep);
                    const isCompleted = index < currentIndex;
                    const isCurrent = index === currentIndex;
                    return (
                      <div key={step.id} className="flex items-center flex-1">
                        <button
                          onClick={() => goToWizardStep(step.id)}
                          disabled={index > currentIndex + 1}
                          className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                            isCompleted ? 'bg-green-500 text-white' :
                            isCurrent ? 'bg-rail-600 text-white' :
                            'bg-steel-200 text-steel-500'
                          }`}
                        >
                          {isCompleted ? <CheckIcon className="h-4 w-4" /> : index + 1}
                        </button>
                        <div className="ml-2 hidden sm:block">
                          <p className={`text-sm font-medium ${isCurrent ? 'text-rail-600' : 'text-steel-500'}`}>{step.label}</p>
                        </div>
                        {index < WIZARD_STEPS.length - 1 && (
                          <div className={`flex-1 h-0.5 mx-4 ${isCompleted ? 'bg-green-500' : 'bg-steel-200'}`} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Wizard Content */}
              <div className="flex-1 p-6 overflow-y-auto">
                {/* Step 1: Source Selection */}
                {wizardStep === 'source' && (
                  <div className="space-y-6">
                    <h3 className="text-lg font-medium text-steel-900">Select Source</h3>
                    <p className="text-sm text-steel-500">Choose to filter cars by Project Number or Customer.</p>

                    {/* Scenario Name (can save at any step) */}
                    <div>
                      <label className="label">Scenario Name <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        value={wizardScenarioName}
                        onChange={(e) => setWizardScenarioName(e.target.value)}
                        className="input"
                        placeholder="Enter a name to enable saving..."
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onClick={() => setWizardSourceType('project')}
                        className={`p-6 border-2 rounded-lg text-left transition-colors ${
                          wizardSourceType === 'project' ? 'border-rail-600 bg-rail-50' : 'border-steel-200 hover:border-steel-300'
                        }`}
                      >
                        <RocketLaunchIcon className="h-8 w-8 text-rail-600 mb-2" />
                        <h4 className="font-medium text-steel-900">By Project</h4>
                        <p className="text-sm text-steel-500 mt-1">Select cars from a specific project number</p>
                      </button>
                      <button
                        onClick={() => setWizardSourceType('customer')}
                        className={`p-6 border-2 rounded-lg text-left transition-colors ${
                          wizardSourceType === 'customer' ? 'border-rail-600 bg-rail-50' : 'border-steel-200 hover:border-steel-300'
                        }`}
                      >
                        <UserGroupIcon className="h-8 w-8 text-rail-600 mb-2" />
                        <h4 className="font-medium text-steel-900">By Customer</h4>
                        <p className="text-sm text-steel-500 mt-1">Select cars belonging to a specific customer</p>
                      </button>
                    </div>

                    {wizardSourceType === 'project' && (
                      <div>
                        <label className="label">Project Number</label>
                        <select
                          value={wizardSelectedProject}
                          onChange={(e) => { setWizardSelectedProject(e.target.value); setWizardSelectedCarIds([]); }}
                          className="input"
                        >
                          <option value="">Select a project...</option>
                          {projectNumbers.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        {wizardSelectedProject && (
                          <p className="text-sm text-green-600 mt-2">
                            {cars.filter(c => c.projectNumber === wizardSelectedProject).length} cars available
                          </p>
                        )}
                      </div>
                    )}

                    {wizardSourceType === 'customer' && (
                      <div>
                        <label className="label">Customer</label>
                        <select
                          value={wizardSelectedCustomer}
                          onChange={(e) => { setWizardSelectedCustomer(e.target.value); setWizardSelectedCarIds([]); }}
                          className="input"
                        >
                          <option value="">Select a customer...</option>
                          {customers.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        {wizardSelectedCustomer && (
                          <p className="text-sm text-green-600 mt-2">
                            {cars.filter(c => c.customer === wizardSelectedCustomer).length} cars available
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Step 2: Car Selection */}
                {wizardStep === 'cars' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-lg font-medium text-steel-900">Select Cars</h3>
                        <p className="text-sm text-steel-500">
                          {wizardSelectedCarIds.length} of {wizardFilteredCars.length} cars selected
                        </p>
                      </div>
                      <button
                        onClick={() => setWizardSelectedCarIds(wizardFilteredCars.map(c => c.id))}
                        className="btn-secondary text-sm"
                      >
                        Select All
                      </button>
                    </div>
                    <div className="border border-steel-200 rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                      <table className="min-w-full divide-y divide-steel-200">
                        <thead className="bg-steel-50 sticky top-0">
                          <tr>
                            <th className="px-4 py-2 text-left w-10">
                              <input
                                type="checkbox"
                                checked={wizardSelectedCarIds.length === wizardFilteredCars.length && wizardFilteredCars.length > 0}
                                onChange={(e) => setWizardSelectedCarIds(e.target.checked ? wizardFilteredCars.map(c => c.id) : [])}
                              />
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-steel-500 uppercase">Railcar</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-steel-500 uppercase">Customer</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-steel-500 uppercase">Reason</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-steel-500 uppercase">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-steel-100">
                          {wizardFilteredCars.map(car => (
                            <tr key={car.id} className="hover:bg-steel-50">
                              <td className="px-4 py-2">
                                <input
                                  type="checkbox"
                                  checked={wizardSelectedCarIds.includes(car.id)}
                                  onChange={() => setWizardSelectedCarIds(prev =>
                                    prev.includes(car.id) ? prev.filter(id => id !== car.id) : [...prev, car.id]
                                  )}
                                />
                              </td>
                              <td className="px-4 py-2 text-sm font-mono text-steel-900">{car.railcarNumber}</td>
                              <td className="px-4 py-2 text-sm text-steel-700">{car.customer}</td>
                              <td className="px-4 py-2 text-sm text-steel-600">{car.reasonShopped || '-'}</td>
                              <td className="px-4 py-2">
                                <span className={`px-2 py-0.5 text-xs rounded-full ${
                                  car.status === 'available' ? 'bg-green-100 text-green-800' : 'bg-steel-100 text-steel-700'
                                }`}>
                                  {car.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Step 3: Shop Selection with Parent/Child */}
                {wizardStep === 'shops' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-lg font-medium text-steel-900">Select Shops</h3>
                        <p className="text-sm text-steel-500">
                          {wizardSelectedShopIds.length} shops selected for {wizardSelectedCarIds.length} cars
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {wizardParentShopGroups.map(group => (
                        <div key={group.parent.id} className="border border-steel-200 rounded-lg overflow-hidden">
                          {/* Parent Header */}
                          <button
                            onClick={() => toggleWizardParentExpanded(group.parent.id)}
                            className="w-full px-4 py-3 flex items-center justify-between bg-steel-50 hover:bg-steel-100"
                          >
                            <div className="flex items-center gap-3">
                              {wizardExpandedParents.has(group.parent.id) ? (
                                <ChevronRightIcon className="h-4 w-4 rotate-90 transition-transform" />
                              ) : (
                                <ChevronRightIcon className="h-4 w-4 transition-transform" />
                              )}
                              <span className={`px-2 py-0.5 text-xs rounded ${
                                group.parent.isAitxInternal ? 'bg-rail-100 text-rail-800' : 'bg-amber-100 text-amber-800'
                              }`}>
                                {group.parent.isAitxInternal ? 'AITX' : '3rd Party'}
                              </span>
                              <span className="font-medium text-steel-900">{group.parent.name}</span>
                            </div>
                            <span className="text-sm text-steel-500">{group.children.length} locations</span>
                          </button>
                          {/* Child Shops */}
                          {wizardExpandedParents.has(group.parent.id) && (
                            <div className="border-t border-steel-200 divide-y divide-steel-100">
                              {group.children.map(shop => (
                                <label key={shop.id} className="flex items-center px-4 py-2 hover:bg-steel-50 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={wizardSelectedShopIds.includes(shop.id)}
                                    onChange={() => toggleWizardShopSelection(shop.id)}
                                    className="mr-3"
                                  />
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-steel-900">{shop.name}</p>
                                    <p className="text-xs text-steel-500">{shop.city}, {shop.state} • Capacity: {shop.capacity}/mo</p>
                                  </div>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step 4: Capacity Review with Slider */}
                {wizardStep === 'capacity' && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-medium text-steel-900">Capacity Review</h3>
                      <p className="text-sm text-steel-500">
                        Review capacity across {wizardSelectedShopIds.length} shops for {wizardSelectedCarIds.length} cars
                      </p>
                    </div>

                    {/* Month Range Slider */}
                    <div>
                      <label className="label">Planning Horizon: {wizardCapacityMonthRange[0]} to {wizardCapacityMonthRange[1]} months out</label>
                      <div className="flex items-center gap-4">
                        <input
                          type="range"
                          min="1"
                          max="12"
                          value={wizardCapacityMonthRange[0]}
                          onChange={(e) => setWizardCapacityMonthRange([Math.min(parseInt(e.target.value), wizardCapacityMonthRange[1] - 1), wizardCapacityMonthRange[1]])}
                          className="flex-1"
                        />
                        <input
                          type="range"
                          min="1"
                          max="12"
                          value={wizardCapacityMonthRange[1]}
                          onChange={(e) => setWizardCapacityMonthRange([wizardCapacityMonthRange[0], Math.max(parseInt(e.target.value), wizardCapacityMonthRange[0] + 1)])}
                          className="flex-1"
                        />
                      </div>
                    </div>

                    {/* Capacity Grid */}
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                      {wizardCapacityData.map(month => (
                        <div
                          key={month.key}
                          className={`p-3 rounded-lg border-2 text-center ${
                            month.status === 'green' ? 'border-green-300 bg-green-50' :
                            month.status === 'yellow' ? 'border-yellow-300 bg-yellow-50' :
                            'border-red-300 bg-red-50'
                          }`}
                        >
                          <p className="text-xs font-medium text-steel-700">{month.label}</p>
                          <p className={`text-lg font-bold ${
                            month.status === 'green' ? 'text-green-700' :
                            month.status === 'yellow' ? 'text-yellow-700' :
                            'text-red-700'
                          }`}>
                            {month.allocated}/{month.totalCapacity}
                          </p>
                          <p className="text-xs text-steel-500">
                            {month.status === 'green' ? '✓ OK' : month.status === 'yellow' ? '⚠ High' : '✗ Over'}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Overall Status */}
                    <div className={`p-4 rounded-lg ${
                      wizardCapacityData.every(m => m.status === 'green') ? 'bg-green-100 text-green-800' :
                      wizardCapacityData.some(m => m.status === 'red') ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {wizardCapacityData.every(m => m.status === 'green') ? (
                        <p className="flex items-center gap-2"><CheckCircleIcon className="h-5 w-5" /> Capacity is sufficient. Ready to schedule!</p>
                      ) : wizardCapacityData.some(m => m.status === 'red') ? (
                        <p className="flex items-center gap-2"><ExclamationTriangleIcon className="h-5 w-5" /> Over capacity in some months. Consider adjusting shops or extending timeline.</p>
                      ) : (
                        <p className="flex items-center gap-2"><ExclamationTriangleIcon className="h-5 w-5" /> High utilization. Proceed with caution.</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Step 5: Summary */}
                {wizardStep === 'summary' && (
                  <div className="space-y-6">
                    <h3 className="text-lg font-medium text-steel-900">Summary</h3>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-steel-50 rounded-lg">
                        <p className="text-sm text-steel-500">Source</p>
                        <p className="font-medium text-steel-900">
                          {wizardSourceType === 'project' ? `Project: ${wizardSelectedProject}` : `Customer: ${wizardSelectedCustomer}`}
                        </p>
                      </div>
                      <div className="p-4 bg-steel-50 rounded-lg">
                        <p className="text-sm text-steel-500">Cars Selected</p>
                        <p className="font-medium text-steel-900">{wizardSelectedCarIds.length} cars</p>
                      </div>
                      <div className="p-4 bg-steel-50 rounded-lg">
                        <p className="text-sm text-steel-500">Shops Selected</p>
                        <p className="font-medium text-steel-900">{wizardSelectedShopIds.length} shops</p>
                      </div>
                      <div className="p-4 bg-steel-50 rounded-lg">
                        <p className="text-sm text-steel-500">Capacity Status</p>
                        <p className={`font-medium ${
                          wizardCapacityData.every(m => m.status === 'green') ? 'text-green-700' :
                          wizardCapacityData.some(m => m.status === 'red') ? 'text-red-700' : 'text-yellow-700'
                        }`}>
                          {wizardCapacityData.every(m => m.status === 'green') ? 'Ready' :
                           wizardCapacityData.some(m => m.status === 'red') ? 'Over Capacity' : 'High Utilization'}
                        </p>
                      </div>
                    </div>

                    {/* Space Hold Allocation Preview */}
                    {spaceHoldAllocations.allocations.length > 0 && (
                      <div className="border border-steel-200 rounded-lg">
                        <div className="px-4 py-3 bg-amber-50 border-b border-steel-200 rounded-t-lg">
                          <h4 className="font-medium text-amber-800 flex items-center gap-2">
                            <AdjustmentsHorizontalIcon className="h-5 w-5" />
                            Space Hold Preview - Per Shop Per Month
                          </h4>
                          <p className="text-sm text-amber-700 mt-1">
                            This scenario will temporarily hold capacity at the selected shops until confirmed into the car flow plan.
                          </p>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-steel-200">
                            <thead className="bg-steel-50">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-steel-500 sticky left-0 bg-steel-50">
                                  Shop
                                </th>
                                {spaceHoldAllocations.months.map(m => (
                                  <th key={m.key} className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-steel-500">
                                    {m.label}
                                  </th>
                                ))}
                                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-steel-500">
                                  Total
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-steel-200">
                              {shops.filter(s => wizardSelectedShopIds.includes(s.id)).map(shop => {
                                const shopAllocations = spaceHoldAllocations.allocations.filter(a => a.shopId === shop.id);
                                const shopTotal = shopAllocations.reduce((sum, a) => sum + a.carsAllocated, 0);
                                return (
                                  <tr key={shop.id} className="hover:bg-steel-50">
                                    <td className="px-4 py-3 text-sm font-medium text-steel-900 sticky left-0 bg-white whitespace-nowrap">
                                      {shop.name}
                                      <span className="text-steel-500 text-xs ml-1">({shop.code})</span>
                                      <span className="text-steel-400 text-xs block">Cap: {shop.capacity}/mo</span>
                                    </td>
                                    {spaceHoldAllocations.months.map(m => {
                                      const alloc = shopAllocations.find(a => a.monthKey === m.key);
                                      const cars = alloc?.carsAllocated || 0;
                                      const util = alloc?.utilization || 0;
                                      return (
                                        <td key={m.key} className="px-4 py-3 text-center">
                                          <div className={`inline-flex flex-col items-center px-2 py-1 rounded ${
                                            util > 1 ? 'bg-red-100 text-red-800' :
                                            util > 0.85 ? 'bg-yellow-100 text-yellow-800' :
                                            cars > 0 ? 'bg-green-100 text-green-800' : 'text-steel-400'
                                          }`}>
                                            <span className="font-semibold">{cars}</span>
                                            <span className="text-xs">{(util * 100).toFixed(0)}%</span>
                                          </div>
                                        </td>
                                      );
                                    })}
                                    <td className="px-4 py-3 text-center font-semibold text-steel-900">
                                      {shopTotal}
                                    </td>
                                  </tr>
                                );
                              })}
                              {/* Total row */}
                              <tr className="bg-steel-50 font-semibold">
                                <td className="px-4 py-3 text-sm text-steel-900 sticky left-0 bg-steel-50">
                                  Total
                                </td>
                                {spaceHoldAllocations.months.map(m => {
                                  const monthTotal = spaceHoldAllocations.allocations
                                    .filter(a => a.monthKey === m.key)
                                    .reduce((sum, a) => sum + a.carsAllocated, 0);
                                  return (
                                    <td key={m.key} className="px-4 py-3 text-center text-steel-900">
                                      {monthTotal}
                                    </td>
                                  );
                                })}
                                <td className="px-4 py-3 text-center text-rail-700">
                                  {spaceHoldAllocations.totalAllocated}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        <div className="px-4 py-3 bg-steel-50 border-t border-steel-200 rounded-b-lg text-sm text-steel-600">
                          <div className="flex items-center gap-4">
                            <span className="flex items-center gap-1">
                              <span className="w-3 h-3 rounded bg-green-200 border border-green-400"></span>
                              Normal (&lt;85%)
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="w-3 h-3 rounded bg-yellow-200 border border-yellow-400"></span>
                              High (85-100%)
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="w-3 h-3 rounded bg-red-200 border border-red-400"></span>
                              Over (&gt;100%)
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="label">Scenario Name <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        value={wizardScenarioName}
                        onChange={(e) => setWizardScenarioName(e.target.value)}
                        className="input"
                        placeholder="Enter scenario name..."
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Wizard Footer */}
              <div className="p-6 border-t border-steel-200 flex justify-between">
                <button
                  onClick={prevWizardStep}
                  disabled={wizardStep === 'source'}
                  className="btn-secondary disabled:opacity-50"
                >
                  Back
                </button>
                <div className="flex gap-3">
                  {wizardScenarioName.trim() && (
                    <button
                      onClick={() => saveWizardScenario(true)}
                      disabled={wizardIsSaving}
                      className="btn-secondary"
                    >
                      {wizardIsSaving ? 'Saving...' : 'Save as Draft'}
                    </button>
                  )}
                  {wizardStep === 'summary' ? (
                    <button
                      onClick={() => saveWizardScenario(false)}
                      disabled={wizardIsSaving || !wizardScenarioName.trim()}
                      className="btn-primary disabled:opacity-50"
                    >
                      {wizardIsSaving ? 'Creating...' : 'Create Scenario'}
                    </button>
                  ) : (
                    <button
                      onClick={nextWizardStep}
                      disabled={!canProceedToStep(WIZARD_STEPS[WIZARD_STEPS.findIndex(s => s.id === wizardStep) + 1]?.id)}
                      className="btn-primary disabled:opacity-50"
                    >
                      Next
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Add Cars Modal */}
      {isAddCarsModalOpen && selectedScenario && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-steel-900/50" onClick={() => setIsAddCarsModalOpen(false)} />
            <div className="relative w-full max-w-5xl rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-semibold text-steel-900 mb-4">Add Cars to Scenario</h2>

              {/* Filters */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div>
                  <label className="label">Customer</label>
                  <select
                    value={addCarsForm.customer}
                    onChange={(e) => setAddCarsForm({ ...addCarsForm, customer: e.target.value, selectedCarIds: [] })}
                    className="input"
                  >
                    <option value="">All Customers</option>
                    {customers.map((customer) => (
                      <option key={customer} value={customer}>{customer}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Project Number</label>
                  <select
                    value={addCarsForm.projectNumber}
                    onChange={(e) => setAddCarsForm({ ...addCarsForm, projectNumber: e.target.value, selectedCarIds: [] })}
                    className="input"
                  >
                    <option value="">All Projects</option>
                    {projectNumbers.map((proj) => (
                      <option key={proj} value={proj}>{proj}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Scheduled Month</label>
                  <select
                    value={addCarsForm.scheduledMonth}
                    onChange={(e) => setAddCarsForm({ ...addCarsForm, scheduledMonth: e.target.value })}
                    className="input"
                    required
                  >
                    <option value="">Select month...</option>
                    {getNextMonths().map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  {(addCarsForm.customer || addCarsForm.projectNumber) && addCarsForm.scheduledMonth && (
                    <button
                      onClick={handleAddCarsByFilter}
                      className="btn-primary w-full"
                    >
                      Add All {filteredCarsForModal.length} Cars
                    </button>
                  )}
                </div>
              </div>

              {/* Car selection table */}
              <div className="border border-steel-200 rounded-lg overflow-hidden mb-4">
                <div className="bg-steel-50 px-4 py-2 border-b border-steel-200 flex justify-between items-center">
                  <span className="text-sm font-medium text-steel-700">
                    {addCarsForm.selectedCarIds.length} cars selected of {filteredCarsForModal.length}
                  </span>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  <table className="min-w-full divide-y divide-steel-200">
                    <thead className="bg-steel-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left">
                          <input
                            type="checkbox"
                            checked={addCarsForm.selectedCarIds.length === filteredCarsForModal.length && filteredCarsForModal.length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setAddCarsForm({
                                  ...addCarsForm,
                                  selectedCarIds: filteredCarsForModal.map(c => c.id)
                                });
                              } else {
                                setAddCarsForm({ ...addCarsForm, selectedCarIds: [] });
                              }
                            }}
                            className="rounded border-steel-300"
                          />
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-steel-500 uppercase">Car #</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-steel-500 uppercase">Type</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-steel-500 uppercase">Customer</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-steel-500 uppercase">Project</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-steel-500 uppercase">Reason</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-steel-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-steel-200">
                      {filteredCarsForModal.map(car => (
                        <tr
                          key={car.id}
                          className={`hover:bg-steel-50 cursor-pointer ${
                            addCarsForm.selectedCarIds.includes(car.id) ? 'bg-rail-50' : ''
                          }`}
                          onClick={() => toggleCarSelection(car.id)}
                        >
                          <td className="px-4 py-2">
                            <input
                              type="checkbox"
                              checked={addCarsForm.selectedCarIds.includes(car.id)}
                              onChange={() => toggleCarSelection(car.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded border-steel-300"
                            />
                          </td>
                          <td className="px-4 py-2 font-medium text-steel-900">{car.railcarNumber}</td>
                          <td className="px-4 py-2 text-sm text-steel-600">{car.carType}</td>
                          <td className="px-4 py-2 text-sm text-steel-600">{car.customer}</td>
                          <td className="px-4 py-2 text-sm text-steel-600 font-mono">{car.projectNumber || '-'}</td>
                          <td className="px-4 py-2 text-sm text-steel-600">{car.reasonShopped}</td>
                          <td className="px-4 py-2 text-sm">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              car.status === 'available' ? 'bg-green-100 text-green-800' :
                              car.status === 'planned' ? 'bg-blue-100 text-blue-800' :
                              'bg-steel-100 text-steel-800'
                            }`}>
                              {car.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end space-x-3">
                <button onClick={() => setIsAddCarsModalOpen(false)} className="btn-secondary">Cancel</button>
                <button
                  onClick={handleAddSelectedCars}
                  disabled={addCarsForm.selectedCarIds.length === 0 || !addCarsForm.scheduledMonth}
                  className="btn-primary disabled:opacity-50"
                >
                  Add {addCarsForm.selectedCarIds.length} Selected Cars
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Shop Selection Modal */}
      {isShopSelectionModalOpen && selectedScenario && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-steel-900/50" onClick={() => setIsShopSelectionModalOpen(false)} />
            <div className="relative w-full max-w-4xl rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-steel-900">Select Shops (1-5)</h2>
                <span className="text-sm text-steel-500">
                  {selectedShops.length} of 5 shops selected | {getTotalAllocated()} cars allocated
                </span>
              </div>

              <div className="mb-4">
                <label className="label">Target Month</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="input w-48"
                >
                  {getNextMonths().slice(0, 6).map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              {/* Shop selection grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {shops.filter(s => s.isActive).map(shop => {
                  const isSelected = selectedShops.includes(shop.id);
                  const allocated = shopAllocations[shop.id]?.[selectedMonth] || 0;

                  return (
                    <div
                      key={shop.id}
                      className={`border rounded-lg p-4 cursor-pointer transition-all ${
                        isSelected ? 'border-rail-500 bg-rail-50' : 'border-steel-200 hover:border-steel-300'
                      } ${!isSelected && selectedShops.length >= 5 ? 'opacity-50 cursor-not-allowed' : ''}`}
                      onClick={() => toggleShopSelection(shop.id)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleShopSelection(shop.id)}
                            disabled={!isSelected && selectedShops.length >= 5}
                            className="rounded border-steel-300"
                          />
                          <div>
                            <h3 className="font-medium text-steel-900">{shop.name}</h3>
                            <p className="text-xs text-steel-500">{shop.code} | {shop.region}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-steel-900">Capacity: {shop.capacity}/mo</p>
                          <p className="text-xs text-steel-500">{shop.tankQualified ? 'Tank Qualified' : 'Non-Tank'}</p>
                        </div>
                      </div>

                      {isSelected && (
                        <div className="mt-3 pt-3 border-t border-steel-200" onClick={(e) => e.stopPropagation()}>
                          <label className="label text-xs">Cars to allocate for {selectedMonth}</label>
                          <input
                            type="number"
                            min="0"
                            max={shop.capacity}
                            value={allocated}
                            onChange={(e) => updateShopAllocation(shop.id, selectedMonth, parseInt(e.target.value) || 0)}
                            className="input w-24"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-steel-200">
                <div className="text-sm text-steel-600">
                  Total cars in scenario: <span className="font-semibold">{selectedScenario.cars?.length || 0}</span>
                  {' | '}
                  Allocated: <span className="font-semibold">{getTotalAllocated()}</span>
                  {getTotalAllocated() < (selectedScenario.cars?.length || 0) && (
                    <span className="text-amber-600 ml-2">
                      ({(selectedScenario.cars?.length || 0) - getTotalAllocated()} unallocated)
                    </span>
                  )}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setIsShopSelectionModalOpen(false)} className="btn-secondary">Cancel</button>
                  <button
                    onClick={handleCheckCapacity}
                    disabled={selectedShops.length === 0 || isCheckingCapacity}
                    className="btn-primary disabled:opacity-50 flex items-center"
                  >
                    {isCheckingCapacity ? (
                      <>
                        <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" />
                        Checking...
                      </>
                    ) : (
                      <>
                        <AdjustmentsHorizontalIcon className="mr-2 h-4 w-4" />
                        Verify Capacity
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Capacity Check Results Modal */}
      {isCapacityCheckModalOpen && capacityCheckResult && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-steel-900/50" onClick={() => setIsCapacityCheckModalOpen(false)} />
            <div className="relative w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
              <div className="flex items-center gap-3 mb-4">
                {capacityCheckResult.canFit ? (
                  <CheckCircleIcon className="h-8 w-8 text-green-500" />
                ) : (
                  <ExclamationTriangleIcon className="h-8 w-8 text-amber-500" />
                )}
                <div>
                  <h2 className="text-xl font-semibold text-steel-900">
                    {capacityCheckResult.canFit ? 'YES - Cars Can Fit!' : 'Capacity Constraints'}
                  </h2>
                  <p className="text-sm text-steel-500">
                    {capacityCheckResult.totalCars} cars to be assigned
                  </p>
                </div>
              </div>

              {/* Detailed breakdown */}
              <div className="space-y-4 mb-6">
                {capacityCheckResult.details.map((detail, idx) => (
                  <div key={idx} className="bg-steel-50 rounded-lg p-3 text-sm text-steel-700">
                    {detail}
                  </div>
                ))}

                {capacityCheckResult.overflow.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <h3 className="font-medium text-amber-800 mb-2">Overflow to Next Month</h3>
                    <ul className="text-sm text-amber-700 space-y-1">
                      {capacityCheckResult.overflow.map((ov, idx) => (
                        <li key={idx}>{ov.count} cars will move to next available month from {ov.month}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3">
                <button onClick={() => setIsCapacityCheckModalOpen(false)} className="btn-secondary">
                  Adjust Allocations
                </button>
                <button
                  onClick={handleBulkAssignToShops}
                  className="btn-primary flex items-center"
                >
                  <CheckIcon className="mr-2 h-4 w-4" />
                  Confirm & Assign to Shops
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Shop Recommendations Modal */}
      {isRecommendationsModalOpen && selectedScenarioCar && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-steel-900/50" onClick={() => setIsRecommendationsModalOpen(false)} />
            <div className="relative w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
              <h2 className="text-xl font-semibold text-steel-900 mb-2">Shop Recommendations</h2>
              <p className="text-sm text-steel-500 mb-4">
                For: {selectedScenarioCar.car?.railcarNumber} ({selectedScenarioCar.car?.carType})
              </p>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {recommendations.length === 0 ? (
                  <p className="text-steel-500 text-center py-8">No recommendations available</p>
                ) : (
                  recommendations.map((rec, idx) => (
                    <div
                      key={rec.shopId}
                      className={`border rounded-lg p-4 ${
                        rec.isRecommended ? 'border-green-300 bg-green-50' : 'border-steel-200'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            {idx === 0 && (
                              <span className="bg-green-500 text-white text-xs px-2 py-0.5 rounded">
                                Best Match
                              </span>
                            )}
                            <h3 className="font-medium text-steel-900">{rec.shopName}</h3>
                            <span className="text-sm text-steel-500">({rec.shopCode})</span>
                          </div>
                          <div className="mt-2 text-sm text-steel-600">
                            <p>Score: <span className="font-semibold">{rec.score.toFixed(1)}</span></p>
                            <p>Est. Cost: ${rec.estimatedCost.toLocaleString()}</p>
                            <p>Est. Days: {rec.estimatedDays}</p>
                            <p>Available Capacity: {rec.capacityAvailable}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleAssignShop(rec.shopId)}
                          className={`${rec.isRecommended ? 'btn-primary' : 'btn-secondary'} py-2 px-4 text-sm`}
                        >
                          Assign
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex justify-end mt-4">
                <button onClick={() => setIsRecommendationsModalOpen(false)} className="btn-secondary">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Approve Scenario Modal */}
      {isApproveModalOpen && selectedScenario && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-steel-900/50" onClick={() => setIsApproveModalOpen(false)} />
            <div className="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-green-100 rounded-full">
                  <RocketLaunchIcon className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-steel-900">Approve Scenario</h2>
                  <p className="text-sm text-steel-500">Create Master Plan & Notify Stakeholders</p>
                </div>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                <h3 className="font-medium text-green-900 mb-2">What happens when you approve:</h3>
                <ul className="text-sm text-green-800 space-y-2">
                  <li className="flex items-start gap-2">
                    <CheckCircleIcon className="h-5 w-5 text-green-600 flex-shrink-0" />
                    <span>Creates a <strong>MasterPlanCommitment</strong> for each car assignment</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircleIcon className="h-5 w-5 text-green-600 flex-shrink-0" />
                    <span>Generates <strong>Customer PDF schedules</strong> for distribution</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircleIcon className="h-5 w-5 text-green-600 flex-shrink-0" />
                    <span>Creates <strong>Shop Work Orders</strong> for each shop/month</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircleIcon className="h-5 w-5 text-green-600 flex-shrink-0" />
                    <span>Updates the <strong>CFO Dashboard</strong> in real-time</span>
                  </li>
                </ul>
              </div>

              <div className="bg-steel-50 rounded-lg p-4 mb-4">
                <h3 className="font-medium text-steel-900 mb-2">{selectedScenario.name}</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <p className="text-steel-600">
                    <span className="text-steel-500">Project:</span> {selectedScenario.projectNumber}
                  </p>
                  <p className="text-steel-600">
                    <span className="text-steel-500">Cars:</span> {selectedScenario.cars?.length || 0}
                  </p>
                  <p className="text-steel-600">
                    <span className="text-steel-500">Assigned:</span>{' '}
                    {selectedScenario.cars?.filter(c => c.assignedShopId || c.suggestedShopId).length || 0}
                  </p>
                  <p className="text-steel-600">
                    <span className="text-steel-500">Est. Cost:</span>{' '}
                    ${(selectedScenario.results?.totalCost || 0).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="label">Master Plan Name</label>
                  <input
                    type="text"
                    value={approvePlanName}
                    onChange={(e) => setApprovePlanName(e.target.value)}
                    className="input"
                    placeholder="e.g., Q4-25-001 - Initial Proposal"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="activateOnApprove"
                    checked={activateOnApprove}
                    onChange={(e) => setActivateOnApprove(e.target.checked)}
                    className="rounded border-steel-300 text-green-600 focus:ring-green-500"
                  />
                  <label htmlFor="activateOnApprove" className="text-sm text-steel-700">
                    <span className="font-medium">Activate immediately</span>
                    <span className="block text-steel-500">
                      Set this plan as the active master plan (archives any existing active plan)
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => { setIsApproveModalOpen(false); setApprovePlanName(''); }}
                  className="btn-secondary"
                  disabled={isApproving}
                >
                  Cancel
                </button>
                <button
                  onClick={handleApproveScenario}
                  disabled={isApproving}
                  className="btn-primary bg-green-600 hover:bg-green-700 disabled:opacity-50 flex items-center"
                >
                  {isApproving ? (
                    <>
                      <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" />
                      Approving...
                    </>
                  ) : (
                    <>
                      <RocketLaunchIcon className="mr-2 h-4 w-4" />
                      Approve & Create Master Plan
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
