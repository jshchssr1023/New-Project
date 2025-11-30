/**
 * Master Plan Wizard - Gold Standard 3-Step Master Plan Generation
 *
 * This component replaces static tabs with a unified wizard workflow:
 * - Step 1: Input & Demand Lock (Demand Register + Weekly Capacity with inline auditing)
 * - Step 2: S&OP & Allocation Matrix (Interactive planning grid with validation)
 * - Step 3: Output & Publication (Scheduling output with pre-set filters)
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ClipboardDocumentListIcon,
  TableCellsIcon,
  PaperAirplaneIcon,
  CheckCircleIcon,
  LockClosedIcon,
  LockOpenIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  DocumentArrowUpIcon,
  ArrowDownTrayIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  XMarkIcon,
  InformationCircleIcon,
  ClockIcon,
  BoltIcon,
  SignalIcon,
  CheckBadgeIcon,
} from '@heroicons/react/24/outline';
import { carsApi, shopsApi, masterPlanWizardApi, masterPlanApi } from '../services/api';
import type { Car, Shop } from '../types';
import type {
  WeeklyCapacityData,
  MasterPlanVersionData,
  IntegrationLogData,
  ImportSessionData,
} from '../services/api';
import { useCarSelection } from '../contexts/CarSelectionContext';

// =============================================================================
// TYPES
// =============================================================================

type WizardStep = 1 | 2 | 3;
type WorkType = 'qualification' | 'assignment' | 'return' | 'repair';

interface DemandItem {
  carId: string;
  railcarNumber: string;
  customer: string;
  commodity: string;
  isTankCar: boolean;
  workType: WorkType;
  dueDate: string | null;
  daysUntilDue: number;
  isOverdue: boolean;
  priority: 'critical' | 'high' | 'medium' | 'low';
  planningState: string;
  assignedShopId: string | null;
  assignedShopName: string | null;
  scheduledWeek: string | null;
}

interface AllocationCell {
  shopId: string;
  shopName: string;
  weekKey: string;
  workType: WorkType;
  planned: number;
  capacity: number;
  used: number;
  available: number;
  isOverCapacity: boolean;
  isLocked: boolean;
}

// =============================================================================
// CAPACITY CHANGE CATEGORIES
// =============================================================================

const CAPACITY_CHANGE_CATEGORIES = [
  { value: 'demand_increase', label: 'Demand Increase' },
  { value: 'demand_decrease', label: 'Demand Decrease' },
  { value: 'resource_constraint', label: 'Resource Constraint' },
  { value: 'maintenance', label: 'Scheduled Maintenance' },
  { value: 'seasonal', label: 'Seasonal Adjustment' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'other', label: 'Other' },
];

const ALLOCATION_OVERRIDE_REASONS = [
  { value: 'rebalancing', label: 'Capacity Rebalancing' },
  { value: 'customer_request', label: 'Customer Request' },
  { value: 'emergency', label: 'Emergency/Urgent' },
  { value: 'capacity_issue', label: 'Capacity Issue' },
  { value: 'other', label: 'Other' },
];

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function MasterPlanWizard() {
  // Core state
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Data state
  const [cars, setCars] = useState<Car[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [weekKeys, setWeekKeys] = useState<string[]>([]);
  const [weeklyCapacities, setWeeklyCapacities] = useState<Record<string, Record<string, WeeklyCapacityData>>>({});

  // Wizard state
  const [isDemandLocked, setIsDemandLocked] = useState(false);
  const [isCapacityLocked, setIsCapacityLocked] = useState(false);
  const [isPlanLocked, setIsPlanLocked] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<MasterPlanVersionData | null>(null);
  const [activeMasterPlanId, setActiveMasterPlanId] = useState<string | null>(null);

  // Step 1: Demand & Capacity state
  const [demandItems, setDemandItems] = useState<DemandItem[]>([]);
  const [selectedWorkType, setSelectedWorkType] = useState<WorkType | 'all'>('all');
  const [demandSearchTerm, setDemandSearchTerm] = useState('');

  // Step 2: Allocation state
  const [selectedCars, setSelectedCars] = useState<Set<string>>(new Set());
  const [showBulkAllocationModal, setShowBulkAllocationModal] = useState(false);
  const [bulkAllocationTarget, setBulkAllocationTarget] = useState<{
    shopId: string;
    weekKey: string;
    workType: WorkType;
  } | null>(null);

  // Step 3: Output state
  const [schedulingFilter, setSchedulingFilter] = useState<'all' | 'flow_in' | 'returns' | 'qualifications'>('all');
  const [integrationLogs, setIntegrationLogs] = useState<IntegrationLogData[]>([]);
  const [integrationHealth, setIntegrationHealth] = useState<{
    total: number;
    successful: number;
    failed: number;
    successRate: number;
    avgDurationMs: number;
  } | null>(null);

  // Modals
  const [showCapacityEditModal, setShowCapacityEditModal] = useState(false);
  const [editingCapacity, setEditingCapacity] = useState<{
    id: string;
    shopName: string;
    weekKey: string;
    fieldName: string;
    currentValue: number;
  } | null>(null);
  const [showConfirmLockModal, setShowConfirmLockModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Car selection context
  const { selectedCars: globalSelectedCars, hasSelection: hasGlobalSelection } = useCarSelection();

  // =============================================================================
  // DATA LOADING
  // =============================================================================

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Load cars, shops, and week keys in parallel
      const [carsResponse, shopsResponse, weekKeysResponse] = await Promise.all([
        carsApi.getAll({ pageSize: 2000 }),
        shopsApi.getAll({ isActive: true }),
        masterPlanWizardApi.getWeekKeys(undefined, 16), // 16 weeks = ~4 months
      ]);

      setCars(carsResponse.data);
      setShops(shopsResponse);
      setWeekKeys(weekKeysResponse.weekKeys);

      // Build demand register from cars
      const demand = buildDemandRegister(carsResponse.data, shopsResponse);
      setDemandItems(demand);

      // Load weekly capacities for active shops
      const activeShopIds = shopsResponse.filter(s => s.isActive).map(s => s.id);
      if (activeShopIds.length > 0 && weekKeysResponse.weekKeys.length > 0) {
        const capacitiesResponse = await masterPlanWizardApi.getWeeklyCapacities(
          activeShopIds,
          weekKeysResponse.weekKeys
        );
        setWeeklyCapacities(capacitiesResponse.capacities);
      }

      // Try to get active master plan
      try {
        const activePlan = await masterPlanApi.getActive();
        setActiveMasterPlanId(activePlan.id);
      } catch {
        // No active plan, that's ok
      }

      // Load integration health
      const [logsResponse, healthResponse] = await Promise.all([
        masterPlanWizardApi.getIntegrationLogs(10),
        masterPlanWizardApi.getIntegrationHealth(),
      ]);
      setIntegrationLogs(logsResponse.logs);
      setIntegrationHealth(healthResponse);

    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load data. Please refresh and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // =============================================================================
  // DEMAND REGISTER BUILDER
  // =============================================================================

  const buildDemandRegister = (cars: Car[], shops: Shop[]): DemandItem[] => {
    const shopMap = new Map(shops.map(s => [s.id, s.name]));

    return cars
      .filter(car => ['available', 'scheduled', 'planned'].includes(car.status))
      .map(car => {
        // Determine work type from reasonShopped
        let workType: WorkType = 'assignment';
        const reason = (car.reasonShopped || '').toLowerCase();
        if (reason.includes('qual')) workType = 'qualification';
        else if (reason.includes('return') || reason.includes('release')) workType = 'return';
        else if (reason.includes('repair')) workType = 'repair';

        // Calculate days until due
        let dueDate: string | null = null;
        let daysUntilDue = Infinity;
        let isOverdue = false;

        if (car.tankQualDueDate) {
          dueDate = car.tankQualDueDate;
          const due = new Date(car.tankQualDueDate);
          daysUntilDue = Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          isOverdue = daysUntilDue < 0;
        } else if (car.contractExpiration) {
          dueDate = car.contractExpiration.toString();
          const due = new Date(car.contractExpiration);
          daysUntilDue = Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          isOverdue = daysUntilDue < 0;
        }

        // Determine priority
        let priority: 'critical' | 'high' | 'medium' | 'low' = 'low';
        if (isOverdue || daysUntilDue <= 30) priority = 'critical';
        else if (daysUntilDue <= 60) priority = 'high';
        else if (daysUntilDue <= 90) priority = 'medium';

        return {
          carId: car.id,
          railcarNumber: car.railcarNumber,
          customer: car.customer || 'Unknown',
          commodity: car.commodity || '',
          isTankCar: car.isTankCar,
          workType,
          dueDate,
          daysUntilDue: daysUntilDue === Infinity ? 999 : daysUntilDue,
          isOverdue,
          priority,
          planningState: car.planStatus || 'not_planned',
          assignedShopId: car.assignedShopId || null,
          assignedShopName: car.assignedShopId ? shopMap.get(car.assignedShopId) || null : null,
          scheduledWeek: car.projectedCompletionMonth || null,
        };
      })
      .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  };

  // =============================================================================
  // FILTERED DATA
  // =============================================================================

  const filteredDemandItems = useMemo(() => {
    return demandItems.filter(item => {
      // Work type filter
      if (selectedWorkType !== 'all' && item.workType !== selectedWorkType) {
        return false;
      }
      // Search filter
      if (demandSearchTerm) {
        const search = demandSearchTerm.toLowerCase();
        return (
          item.railcarNumber.toLowerCase().includes(search) ||
          item.customer.toLowerCase().includes(search) ||
          item.commodity.toLowerCase().includes(search)
        );
      }
      return true;
    });
  }, [demandItems, selectedWorkType, demandSearchTerm]);

  const demandSummary = useMemo(() => {
    const byWorkType = { qualification: 0, assignment: 0, return: 0, repair: 0 };
    const byPriority = { critical: 0, high: 0, medium: 0, low: 0 };
    let overdue = 0;

    demandItems.forEach(item => {
      byWorkType[item.workType]++;
      byPriority[item.priority]++;
      if (item.isOverdue) overdue++;
    });

    return {
      total: demandItems.length,
      byWorkType,
      byPriority,
      overdue,
    };
  }, [demandItems]);

  // =============================================================================
  // STEP NAVIGATION
  // =============================================================================

  const canProceedToStep2 = isDemandLocked && isCapacityLocked;
  const canProceedToStep3 = canProceedToStep2; // Add allocation validation here

  const handleNextStep = () => {
    if (currentStep === 1 && canProceedToStep2) {
      setCurrentStep(2);
    } else if (currentStep === 2 && canProceedToStep3) {
      setCurrentStep(3);
    }
  };

  const handlePreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as WizardStep);
    }
  };

  // =============================================================================
  // CAPACITY EDITING WITH AUDIT
  // =============================================================================

  const handleCapacityEdit = (
    shopId: string,
    shopName: string,
    weekKey: string,
    fieldName: string,
    currentValue: number
  ) => {
    setEditingCapacity({ id: '', shopName, weekKey, fieldName, currentValue });
    // Find the capacity ID
    const capacity = weeklyCapacities[shopId]?.[weekKey];
    if (capacity) {
      setEditingCapacity({ id: capacity.id, shopName, weekKey, fieldName, currentValue });
      setShowCapacityEditModal(true);
    }
  };

  const handleCapacitySave = async (
    newValue: number,
    justification: string,
    changeCategory: string
  ) => {
    if (!editingCapacity) return;

    try {
      const result = await masterPlanWizardApi.updateWeeklyCapacity(editingCapacity.id, {
        fieldName: editingCapacity.fieldName,
        newValue,
        justification,
        changeCategory,
      });

      // Update local state
      setWeeklyCapacities(prev => {
        const updated = { ...prev };
        const shopId = Object.keys(updated).find(
          sid => updated[sid]?.[editingCapacity.weekKey]?.id === editingCapacity.id
        );
        if (shopId) {
          updated[shopId] = {
            ...updated[shopId],
            [editingCapacity.weekKey]: result.capacity,
          };
        }
        return updated;
      });

      setSuccessMessage('Capacity updated successfully');
      setShowCapacityEditModal(false);
      setEditingCapacity(null);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Error updating capacity:', err);
      setError('Failed to update capacity');
    }
  };

  // =============================================================================
  // BULK ALLOCATION
  // =============================================================================

  const handleBulkAllocation = async (
    shopId: string,
    weekKey: string,
    workType: WorkType,
    justification: string,
    overrideReason: string
  ) => {
    const carIds = Array.from(selectedCars);

    try {
      // First validate
      const validation = await masterPlanWizardApi.validateAllocation({
        shopId,
        weekKey,
        workType,
        requestedCount: carIds.length,
      });

      if (!validation.valid) {
        setError(validation.message || 'Allocation exceeds capacity');
        return;
      }

      // Execute allocation
      const result = await masterPlanWizardApi.bulkAllocateCars({
        carIds,
        shopId,
        weekKey,
        workType,
        justification,
        overrideReason,
      });

      setSuccessMessage(`Successfully allocated ${result.allocated} cars`);
      setSelectedCars(new Set());
      setShowBulkAllocationModal(false);

      // Refresh data
      await loadInitialData();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Error allocating cars:', err);
      setError('Failed to allocate cars');
    }
  };

  // =============================================================================
  // LOCK AND PUBLISH
  // =============================================================================

  const handleLockDemand = () => {
    setIsDemandLocked(true);
    setSuccessMessage('Demand register locked');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleLockCapacity = () => {
    setIsCapacityLocked(true);
    setSuccessMessage('Capacity locked');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleConfirmAndLockPlan = async (lockReason: string) => {
    if (!activeMasterPlanId) {
      setError('No active master plan found');
      return;
    }

    try {
      // Create a new version
      const versionResult = await masterPlanWizardApi.createMasterPlanVersion({
        masterPlanId: activeMasterPlanId,
        versionLabel: 'Master Plan',
        planSnapshot: {
          demandItems,
          weeklyCapacities,
          timestamp: new Date().toISOString(),
        },
      });

      // Lock the version
      const lockResult = await masterPlanWizardApi.lockMasterPlanVersion(
        versionResult.version.id,
        lockReason
      );

      setCurrentVersion(lockResult.version);
      setIsPlanLocked(true);
      setShowConfirmLockModal(false);
      setSuccessMessage(`Plan locked as version ${lockResult.version.versionNumber}`);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      console.error('Error locking plan:', err);
      setError('Failed to lock plan');
    }
  };

  const handlePublishPlan = async () => {
    if (!currentVersion) return;

    try {
      const result = await masterPlanWizardApi.publishMasterPlanVersion(currentVersion.id);
      setCurrentVersion(result.version);
      setSuccessMessage('Plan published to scheduling team');

      // Refresh integration logs
      const logsResponse = await masterPlanWizardApi.getIntegrationLogs(10);
      setIntegrationLogs(logsResponse.logs);

      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      console.error('Error publishing plan:', err);
      setError('Failed to publish plan');
    }
  };

  // =============================================================================
  // RENDER: STEP INDICATOR
  // =============================================================================

  const renderStepIndicator = () => (
    <div className="mb-8">
      <div className="flex items-center justify-center">
        {[1, 2, 3].map((step) => (
          <div key={step} className="flex items-center">
            <button
              onClick={() => {
                if (step === 1 || (step === 2 && canProceedToStep2) || (step === 3 && canProceedToStep3)) {
                  setCurrentStep(step as WizardStep);
                }
              }}
              className={`flex items-center justify-center w-12 h-12 rounded-full font-bold text-lg transition-all ${
                currentStep === step
                  ? 'bg-blue-600 text-white ring-4 ring-blue-200'
                  : currentStep > step
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-200 text-gray-500'
              } ${
                (step === 2 && !canProceedToStep2) || (step === 3 && !canProceedToStep3)
                  ? 'cursor-not-allowed'
                  : 'cursor-pointer hover:ring-2 hover:ring-blue-300'
              }`}
              disabled={(step === 2 && !canProceedToStep2) || (step === 3 && !canProceedToStep3)}
            >
              {currentStep > step ? (
                <CheckCircleIcon className="h-6 w-6" />
              ) : (
                step
              )}
            </button>
            {step < 3 && (
              <div
                className={`w-24 h-1 mx-2 ${
                  currentStep > step ? 'bg-green-500' : 'bg-gray-200'
                }`}
              />
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-center mt-4">
        <div className="grid grid-cols-3 gap-16 text-center">
          <div className={currentStep === 1 ? 'text-blue-600 font-semibold' : 'text-gray-500'}>
            <ClipboardDocumentListIcon className="h-5 w-5 mx-auto mb-1" />
            <div className="text-sm">Input & Demand Lock</div>
          </div>
          <div className={currentStep === 2 ? 'text-blue-600 font-semibold' : 'text-gray-500'}>
            <TableCellsIcon className="h-5 w-5 mx-auto mb-1" />
            <div className="text-sm">S&OP Allocation Matrix</div>
          </div>
          <div className={currentStep === 3 ? 'text-blue-600 font-semibold' : 'text-gray-500'}>
            <PaperAirplaneIcon className="h-5 w-5 mx-auto mb-1" />
            <div className="text-sm">Output & Publication</div>
          </div>
        </div>
      </div>
    </div>
  );

  // =============================================================================
  // RENDER: STEP 1 - INPUT & DEMAND LOCK
  // =============================================================================

  const renderStep1 = () => (
    <div className="space-y-6">
      {/* Demand Summary Cards */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
          <div className="text-sm text-gray-500">Total Demand</div>
          <div className="text-2xl font-bold">{demandSummary.total}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
          <div className="text-sm text-gray-500">Overdue</div>
          <div className="text-2xl font-bold text-red-600">{demandSummary.overdue}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-orange-500">
          <div className="text-sm text-gray-500">Critical (30 days)</div>
          <div className="text-2xl font-bold text-orange-600">{demandSummary.byPriority.critical}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500">
          <div className="text-sm text-gray-500">High (60 days)</div>
          <div className="text-2xl font-bold text-yellow-600">{demandSummary.byPriority.high}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
          <div className="text-sm text-gray-500">Qualifications</div>
          <div className="text-2xl font-bold">{demandSummary.byWorkType.qualification}</div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-2 gap-6">
        {/* Left: Demand Register */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2">
              <ClipboardDocumentListIcon className="h-5 w-5" />
              Demand Register
              {isDemandLocked && (
                <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full flex items-center gap-1">
                  <LockClosedIcon className="h-3 w-3" />
                  Locked
                </span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowImportModal(true)}
                className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                title="Import Data"
              >
                <DocumentArrowUpIcon className="h-5 w-5" />
              </button>
              {!isDemandLocked && (
                <button
                  onClick={handleLockDemand}
                  className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 flex items-center gap-1"
                >
                  <LockClosedIcon className="h-4 w-4" />
                  Lock Demand
                </button>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="px-4 py-2 border-b bg-gray-50 flex items-center gap-4">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={demandSearchTerm}
                onChange={(e) => setDemandSearchTerm(e.target.value)}
                placeholder="Search cars..."
                className="w-full pl-9 pr-3 py-1.5 border rounded text-sm"
              />
            </div>
            <select
              value={selectedWorkType}
              onChange={(e) => setSelectedWorkType(e.target.value as WorkType | 'all')}
              className="px-3 py-1.5 border rounded text-sm"
            >
              <option value="all">All Work Types</option>
              <option value="qualification">Qualification</option>
              <option value="assignment">Assignment</option>
              <option value="return">Return</option>
              <option value="repair">Repair</option>
            </select>
          </div>

          {/* Demand List */}
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left">Car #</th>
                  <th className="px-3 py-2 text-left">Customer</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Due</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredDemandItems.slice(0, 50).map((item) => (
                  <tr
                    key={item.carId}
                    className={`hover:bg-gray-50 ${
                      item.isOverdue ? 'bg-red-50' : item.priority === 'critical' ? 'bg-orange-50' : ''
                    }`}
                  >
                    <td className="px-3 py-2 font-mono text-xs">{item.railcarNumber}</td>
                    <td className="px-3 py-2 truncate max-w-[100px]" title={item.customer}>
                      {item.customer}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${
                        item.workType === 'qualification' ? 'bg-purple-100 text-purple-700' :
                        item.workType === 'assignment' ? 'bg-blue-100 text-blue-700' :
                        item.workType === 'return' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {item.workType.slice(0, 4)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {item.isOverdue ? (
                        <span className="text-red-600 font-semibold">Overdue</span>
                      ) : (
                        <span className={`${
                          item.daysUntilDue <= 30 ? 'text-red-600' :
                          item.daysUntilDue <= 60 ? 'text-orange-600' :
                          'text-gray-600'
                        }`}>
                          {item.daysUntilDue}d
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {item.assignedShopName ? (
                        <span className="text-green-600 text-xs">{item.assignedShopName}</span>
                      ) : (
                        <span className="text-gray-400 text-xs">Unassigned</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredDemandItems.length > 50 && (
              <div className="px-3 py-2 text-center text-sm text-gray-500 bg-gray-50">
                Showing 50 of {filteredDemandItems.length} items
              </div>
            )}
          </div>
        </div>

        {/* Right: Weekly Capacity (Time-Series) */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2">
              <TableCellsIcon className="h-5 w-5" />
              Weekly Capacity (Time-Series)
              {isCapacityLocked && (
                <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full flex items-center gap-1">
                  <LockClosedIcon className="h-3 w-3" />
                  Locked
                </span>
              )}
            </h3>
            {!isCapacityLocked && isDemandLocked && (
              <button
                onClick={handleLockCapacity}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 flex items-center gap-1"
              >
                <LockClosedIcon className="h-4 w-4" />
                Lock Capacity
              </button>
            )}
          </div>

          {/* Capacity Grid */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left sticky left-0 bg-gray-50 z-10">Shop</th>
                  {weekKeys.slice(0, 8).map(week => (
                    <th key={week} className="px-2 py-2 text-center text-xs whitespace-nowrap">
                      {week.replace(/^\d{4}-W/, 'W')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {shops.filter(s => s.isActive).slice(0, 10).map((shop) => (
                  <tr key={shop.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 sticky left-0 bg-white font-medium text-xs">
                      <div>{shop.name}</div>
                      <div className="text-gray-400">{shop.code}</div>
                    </td>
                    {weekKeys.slice(0, 8).map(weekKey => {
                      const capacity = weeklyCapacities[shop.id]?.[weekKey];
                      const used = capacity?.totalUsed || 0;
                      const total = capacity?.totalCapacity || Math.ceil(shop.capacity / 4);
                      const utilization = total > 0 ? (used / total) * 100 : 0;

                      return (
                        <td
                          key={weekKey}
                          onClick={() => {
                            if (!isCapacityLocked) {
                              handleCapacityEdit(
                                shop.id,
                                shop.name,
                                weekKey,
                                'totalCapacity',
                                total
                              );
                            }
                          }}
                          className={`px-2 py-2 text-center cursor-pointer transition-colors ${
                            utilization >= 100 ? 'bg-red-100 hover:bg-red-200' :
                            utilization >= 90 ? 'bg-orange-100 hover:bg-orange-200' :
                            utilization >= 70 ? 'bg-yellow-100 hover:bg-yellow-200' :
                            'hover:bg-blue-50'
                          } ${capacity?.isLocked ? 'cursor-not-allowed' : ''}`}
                        >
                          <div className="text-xs font-medium">{used}/{total}</div>
                          <div className="text-xs text-gray-500">{utilization.toFixed(0)}%</div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Capacity Legend */}
          <div className="px-4 py-2 border-t bg-gray-50 flex items-center justify-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-red-100 border border-red-200 rounded"></div>
              <span>Over (&gt;100%)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-orange-100 border border-orange-200 rounded"></div>
              <span>Near (90-100%)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-yellow-100 border border-yellow-200 rounded"></div>
              <span>Moderate (70-90%)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-white border border-gray-200 rounded"></div>
              <span>Available (&lt;70%)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // =============================================================================
  // RENDER: STEP 2 - S&OP ALLOCATION MATRIX
  // =============================================================================

  const renderStep2 = () => (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="bg-white rounded-lg shadow px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            {selectedCars.size} cars selected
          </span>
          {selectedCars.size > 0 && (
            <>
              <button
                onClick={() => setShowBulkAllocationModal(true)}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 flex items-center gap-1"
              >
                <BoltIcon className="h-4 w-4" />
                Bulk Allocate
              </button>
              <button
                onClick={() => setSelectedCars(new Set())}
                className="px-3 py-1.5 border text-sm rounded hover:bg-gray-50"
              >
                Clear Selection
              </button>
            </>
          )}
        </div>
        <div className="text-sm text-gray-500 flex items-center gap-2">
          <InformationCircleIcon className="h-4 w-4" />
          Click cells to allocate. Hard-stop validation prevents over-capacity.
        </div>
      </div>

      {/* Allocation Matrix */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 text-left sticky left-0 bg-gray-100 z-10 min-w-[200px]">
                  Shop / Week
                </th>
                {weekKeys.slice(0, 12).map(week => (
                  <th key={week} className="px-3 py-3 text-center min-w-[80px] border-l">
                    <div className="font-semibold">{week.replace(/^\d{4}-W/, 'W')}</div>
                  </th>
                ))}
                <th className="px-4 py-3 text-center border-l bg-gray-200 min-w-[80px]">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {shops.filter(s => s.isActive && s.isAitxInternal).map((shop) => {
                let shopTotal = 0;
                return (
                  <tr key={shop.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 sticky left-0 bg-white font-medium border-r">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-100 text-blue-700 rounded text-xs font-bold">
                          A
                        </span>
                        <div>
                          <div>{shop.name}</div>
                          <div className="text-xs text-gray-400">{shop.code}</div>
                        </div>
                      </div>
                    </td>
                    {weekKeys.slice(0, 12).map(weekKey => {
                      const capacity = weeklyCapacities[shop.id]?.[weekKey];
                      const used = capacity?.totalUsed || 0;
                      const total = capacity?.totalCapacity || Math.ceil(shop.capacity / 4);
                      const available = total - used;
                      shopTotal += used;

                      return (
                        <td
                          key={weekKey}
                          onClick={() => {
                            // Open allocation modal for this cell
                            setBulkAllocationTarget({
                              shopId: shop.id,
                              weekKey,
                              workType: 'qualification',
                            });
                            setShowBulkAllocationModal(true);
                          }}
                          className={`px-3 py-3 text-center border-l cursor-pointer transition-colors ${
                            used > total ? 'bg-red-100 hover:bg-red-200' :
                            used === total ? 'bg-orange-100 hover:bg-orange-200' :
                            available <= 2 ? 'bg-yellow-100 hover:bg-yellow-200' :
                            'hover:bg-blue-50'
                          }`}
                        >
                          <div className="font-medium">{used}</div>
                          <div className="text-xs text-gray-500">/{total}</div>
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-center border-l bg-gray-50 font-semibold">
                      {shopTotal}
                    </td>
                  </tr>
                );
              })}

              {/* 3rd Party Section Header */}
              <tr className="bg-gray-200">
                <td colSpan={weekKeys.slice(0, 12).length + 2} className="px-4 py-2 font-semibold text-gray-700">
                  3rd Party Networks
                </td>
              </tr>

              {shops.filter(s => s.isActive && !s.isAitxInternal).slice(0, 5).map((shop) => {
                let shopTotal = 0;
                return (
                  <tr key={shop.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 sticky left-0 bg-white font-medium border-r">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 bg-gray-100 text-gray-700 rounded text-xs font-bold">
                          3P
                        </span>
                        <div>
                          <div>{shop.name}</div>
                          <div className="text-xs text-gray-400">{shop.network}</div>
                        </div>
                      </div>
                    </td>
                    {weekKeys.slice(0, 12).map(weekKey => {
                      const capacity = weeklyCapacities[shop.id]?.[weekKey];
                      const used = capacity?.totalUsed || 0;
                      const total = capacity?.totalCapacity || Math.ceil(shop.capacity / 4);
                      shopTotal += used;

                      return (
                        <td
                          key={weekKey}
                          onClick={() => {
                            setBulkAllocationTarget({
                              shopId: shop.id,
                              weekKey,
                              workType: 'qualification',
                            });
                            setShowBulkAllocationModal(true);
                          }}
                          className="px-3 py-3 text-center border-l cursor-pointer hover:bg-blue-50"
                        >
                          <div className="font-medium">{used}</div>
                          <div className="text-xs text-gray-500">/{total}</div>
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-center border-l bg-gray-50 font-semibold">
                      {shopTotal}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Unassigned Cars Panel */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="font-semibold">Unassigned Cars ({demandItems.filter(d => !d.assignedShopId).length})</h3>
          <button
            onClick={() => {
              const unassignedIds = demandItems
                .filter(d => !d.assignedShopId)
                .slice(0, 100)
                .map(d => d.carId);
              setSelectedCars(new Set(unassignedIds));
            }}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            Select Top 100
          </button>
        </div>
        <div className="max-h-48 overflow-y-auto">
          <div className="grid grid-cols-6 gap-2 p-4">
            {demandItems.filter(d => !d.assignedShopId).slice(0, 50).map(item => (
              <label
                key={item.carId}
                className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                  selectedCars.has(item.carId)
                    ? 'bg-blue-50 border-blue-300'
                    : 'hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedCars.has(item.carId)}
                  onChange={(e) => {
                    const newSelected = new Set(selectedCars);
                    if (e.target.checked) {
                      newSelected.add(item.carId);
                    } else {
                      newSelected.delete(item.carId);
                    }
                    setSelectedCars(newSelected);
                  }}
                  className="rounded"
                />
                <span className="text-xs font-mono truncate">{item.railcarNumber}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // =============================================================================
  // RENDER: STEP 3 - OUTPUT & PUBLICATION
  // =============================================================================

  const renderStep3 = () => (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="bg-white rounded-lg shadow px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h3 className="font-semibold text-lg">Scheduling Output</h3>
          {currentVersion && (
            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
              {currentVersion.versionNumber}
            </span>
          )}
          {isPlanLocked && (
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm flex items-center gap-1">
              <CheckBadgeIcon className="h-4 w-4" />
              Plan Locked
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {!isPlanLocked ? (
            <button
              onClick={() => setShowConfirmLockModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 font-medium"
            >
              <LockClosedIcon className="h-5 w-5" />
              Confirm & Lock Master Plan
            </button>
          ) : (
            <>
              <button
                onClick={handlePublishPlan}
                disabled={currentVersion?.pushedToScheduling}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 font-medium ${
                  currentVersion?.pushedToScheduling
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                <PaperAirplaneIcon className="h-5 w-5" />
                {currentVersion?.pushedToScheduling ? 'Published' : 'Push to Scheduling'}
              </button>
              <button className="px-4 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2">
                <ArrowDownTrayIcon className="h-5 w-5" />
                Export
              </button>
            </>
          )}
        </div>
      </div>

      {/* Pre-set Filters */}
      <div className="flex items-center gap-2">
        <FunnelIcon className="h-5 w-5 text-gray-400" />
        <span className="text-sm text-gray-500">Quick Filters:</span>
        {[
          { key: 'all', label: 'All' },
          { key: 'flow_in', label: 'Flow-In Assignments' },
          { key: 'returns', label: 'Planned Returns' },
          { key: 'qualifications', label: 'Lease Qualifications' },
        ].map(filter => (
          <button
            key={filter.key}
            onClick={() => setSchedulingFilter(filter.key as typeof schedulingFilter)}
            className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
              schedulingFilter === filter.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Scheduling Output Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 text-left">Car #</th>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Work Type</th>
                <th className="px-4 py-3 text-left">Shop</th>
                <th className="px-4 py-3 text-left">Week</th>
                <th className="px-4 py-3 text-left">Priority</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {demandItems
                .filter(item => {
                  if (!item.assignedShopId) return false;
                  if (schedulingFilter === 'flow_in') return item.workType === 'assignment';
                  if (schedulingFilter === 'returns') return item.workType === 'return';
                  if (schedulingFilter === 'qualifications') return item.workType === 'qualification';
                  return true;
                })
                .slice(0, 50)
                .map(item => (
                  <tr key={item.carId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{item.railcarNumber}</td>
                    <td className="px-4 py-3">{item.customer}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        item.workType === 'qualification' ? 'bg-purple-100 text-purple-700' :
                        item.workType === 'assignment' ? 'bg-blue-100 text-blue-700' :
                        item.workType === 'return' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {item.workType}
                      </span>
                    </td>
                    <td className="px-4 py-3">{item.assignedShopName || '-'}</td>
                    <td className="px-4 py-3">{item.scheduledWeek || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 ${
                        item.priority === 'critical' ? 'text-red-600' :
                        item.priority === 'high' ? 'text-orange-600' :
                        item.priority === 'medium' ? 'text-yellow-600' :
                        'text-gray-600'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${
                          item.priority === 'critical' ? 'bg-red-500' :
                          item.priority === 'high' ? 'bg-orange-500' :
                          item.priority === 'medium' ? 'bg-yellow-500' :
                          'bg-gray-400'
                        }`}></span>
                        {item.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-green-600">Planned</span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Integration Health Dashboard */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <SignalIcon className="h-5 w-5 text-gray-500" />
          <h3 className="font-semibold">Integration Health Dashboard</h3>
        </div>
        <div className="p-4">
          {/* Health Summary */}
          {integrationHealth && (
            <div className="grid grid-cols-5 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{integrationHealth.total}</div>
                <div className="text-xs text-gray-500">Total (24h)</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{integrationHealth.successful}</div>
                <div className="text-xs text-gray-500">Successful</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{integrationHealth.failed}</div>
                <div className="text-xs text-gray-500">Failed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{integrationHealth.successRate.toFixed(1)}%</div>
                <div className="text-xs text-gray-500">Success Rate</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{integrationHealth.avgDurationMs.toFixed(0)}ms</div>
                <div className="text-xs text-gray-500">Avg Duration</div>
              </div>
            </div>
          )}

          {/* Recent Logs */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Action</th>
                  <th className="px-3 py-2 text-left">Endpoint</th>
                  <th className="px-3 py-2 text-left">Duration</th>
                  <th className="px-3 py-2 text-left">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {integrationLogs.slice(0, 10).map(log => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      {log.status === 'success' ? (
                        <span className="inline-flex items-center gap-1 text-green-600">
                          <CheckCircleIcon className="h-4 w-4" />
                          Success
                        </span>
                      ) : log.status === 'failed' ? (
                        <span className="inline-flex items-center gap-1 text-red-600">
                          <XMarkIcon className="h-4 w-4" />
                          Failed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-yellow-600">
                          <ClockIcon className="h-4 w-4" />
                          {log.status}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{log.triggerAction}</td>
                    <td className="px-3 py-2 font-mono text-xs truncate max-w-[200px]">
                      {log.endpoint}
                    </td>
                    <td className="px-3 py-2">{log.durationMs}ms</td>
                    <td className="px-3 py-2 text-gray-500">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  // =============================================================================
  // RENDER: MODALS
  // =============================================================================

  const renderCapacityEditModal = () => {
    if (!showCapacityEditModal || !editingCapacity) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h3 className="font-semibold">Edit Capacity</h3>
            <button
              onClick={() => setShowCapacityEditModal(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.target as HTMLFormElement;
              const formData = new FormData(form);
              handleCapacitySave(
                Number(formData.get('newValue')),
                formData.get('justification') as string,
                formData.get('changeCategory') as string
              );
            }}
            className="p-4 space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Shop: {editingCapacity.shopName}
              </label>
              <label className="block text-sm text-gray-500">
                Week: {editingCapacity.weekKey}
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New Capacity Value
              </label>
              <input
                type="number"
                name="newValue"
                defaultValue={editingCapacity.currentValue}
                className="w-full px-3 py-2 border rounded-lg"
                required
                min="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Change Category *
              </label>
              <select
                name="changeCategory"
                className="w-full px-3 py-2 border rounded-lg"
                required
              >
                <option value="">Select a category...</option>
                {CAPACITY_CHANGE_CATEGORIES.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Justification * (minimum 10 characters)
              </label>
              <textarea
                name="justification"
                rows={3}
                className="w-full px-3 py-2 border rounded-lg"
                required
                minLength={10}
                placeholder="Explain why this capacity change is needed..."
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCapacityEditModal(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const renderConfirmLockModal = () => {
    if (!showConfirmLockModal) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
          <div className="px-4 py-3 border-b flex items-center justify-between bg-blue-50">
            <h3 className="font-semibold flex items-center gap-2">
              <LockClosedIcon className="h-5 w-5 text-blue-600" />
              Confirm & Lock Master Plan
            </h3>
            <button
              onClick={() => setShowConfirmLockModal(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.target as HTMLFormElement);
              handleConfirmAndLockPlan(formData.get('lockReason') as string);
            }}
            className="p-4 space-y-4"
          >
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm text-yellow-800">
                <strong>Important:</strong> Locking the Master Plan will create a versioned snapshot.
                Once locked, this version cannot be modified. A new version will be created for any future changes.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-2xl font-bold">{demandItems.filter(d => d.assignedShopId).length}</div>
                <div className="text-sm text-gray-500">Assigned Cars</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-2xl font-bold">{shops.filter(s => s.isActive).length}</div>
                <div className="text-sm text-gray-500">Active Shops</div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Version Label (optional)
              </label>
              <input
                type="text"
                name="versionLabel"
                placeholder="e.g., Q1 2025 Initial Plan"
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Lock Reason *
              </label>
              <textarea
                name="lockReason"
                rows={2}
                className="w-full px-3 py-2 border rounded-lg"
                required
                placeholder="Enter reason for locking this plan version..."
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmLockModal(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <LockClosedIcon className="h-4 w-4" />
                Confirm & Lock
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const renderBulkAllocationModal = () => {
    if (!showBulkAllocationModal) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h3 className="font-semibold">Bulk Allocate Cars</h3>
            <button
              onClick={() => {
                setShowBulkAllocationModal(false);
                setBulkAllocationTarget(null);
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.target as HTMLFormElement);
              handleBulkAllocation(
                formData.get('shopId') as string,
                formData.get('weekKey') as string,
                formData.get('workType') as WorkType,
                formData.get('justification') as string,
                formData.get('overrideReason') as string
              );
            }}
            className="p-4 space-y-4"
          >
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                Allocating <strong>{selectedCars.size}</strong> cars to the selected shop/week.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Target Shop *
              </label>
              <select
                name="shopId"
                defaultValue={bulkAllocationTarget?.shopId || ''}
                className="w-full px-3 py-2 border rounded-lg"
                required
              >
                <option value="">Select a shop...</option>
                {shops.filter(s => s.isActive).map(shop => (
                  <option key={shop.id} value={shop.id}>{shop.name} ({shop.code})</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Week *
                </label>
                <select
                  name="weekKey"
                  defaultValue={bulkAllocationTarget?.weekKey || ''}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                >
                  <option value="">Select week...</option>
                  {weekKeys.map(week => (
                    <option key={week} value={week}>{week}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Work Type *
                </label>
                <select
                  name="workType"
                  defaultValue={bulkAllocationTarget?.workType || 'qualification'}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                >
                  <option value="qualification">Qualification</option>
                  <option value="assignment">Assignment</option>
                  <option value="return">Return</option>
                  <option value="repair">Repair</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Override Reason *
              </label>
              <select
                name="overrideReason"
                className="w-full px-3 py-2 border rounded-lg"
                required
              >
                <option value="">Select reason...</option>
                {ALLOCATION_OVERRIDE_REASONS.map(reason => (
                  <option key={reason.value} value={reason.value}>{reason.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Justification *
              </label>
              <textarea
                name="justification"
                rows={2}
                className="w-full px-3 py-2 border rounded-lg"
                required
                minLength={10}
                placeholder="Explain the allocation decision..."
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowBulkAllocationModal(false);
                  setBulkAllocationTarget(null);
                }}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Allocate Cars
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // =============================================================================
  // MAIN RENDER
  // =============================================================================

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <ArrowPathIcon className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading Master Plan Wizard...</span>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Master Plan Generation Wizard</h1>
        <p className="text-gray-600 mt-1">
          Generate and publish your S&OP Master Plan in three steps
        </p>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <ExclamationTriangleIcon className="h-5 w-5" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
          <CheckCircleIcon className="h-5 w-5" />
          {successMessage}
        </div>
      )}

      {/* Step Indicator */}
      {renderStepIndicator()}

      {/* Step Content */}
      <div className="mb-8">
        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
        {currentStep === 3 && renderStep3()}
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-4 border-t">
        <button
          onClick={handlePreviousStep}
          disabled={currentStep === 1}
          className={`px-4 py-2 flex items-center gap-2 rounded-lg ${
            currentStep === 1
              ? 'text-gray-300 cursor-not-allowed'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <ChevronLeftIcon className="h-5 w-5" />
          Previous
        </button>

        <div className="flex items-center gap-4">
          {currentStep < 3 && (
            <button
              onClick={handleNextStep}
              disabled={
                (currentStep === 1 && !canProceedToStep2) ||
                (currentStep === 2 && !canProceedToStep3)
              }
              className={`px-4 py-2 flex items-center gap-2 rounded-lg ${
                (currentStep === 1 && !canProceedToStep2) ||
                (currentStep === 2 && !canProceedToStep3)
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              Next Step
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Modals */}
      {renderCapacityEditModal()}
      {renderConfirmLockModal()}
      {renderBulkAllocationModal()}
    </div>
  );
}
