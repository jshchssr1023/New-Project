import apiClient from './client';
import type {
  SOPAllocationData,
  SOPAllocationResponse,
  SOPLoadedAllocations,
  LeaseRelease,
  QualificationScenario,
  ScenarioMetrics,
  ScenarioComparison,
  AvailableCar,
  AvailableShop,
  AvailableCustomer,
  AvailableMonth,
  DocumentSelectionCriteria,
  GeneratedDocument,
  ShopCapacitySnapshot,
} from './types';

// S&OP API
export const sopApi = {
  // Get saved allocations
  getAllocations: async (): Promise<SOPLoadedAllocations> => {
    const response = await apiClient.get<SOPLoadedAllocations>('/sop/allocations');
    return response.data;
  },

  // Save monthly allocations
  saveAllocations: async (data: SOPAllocationData): Promise<SOPAllocationResponse> => {
    const response = await apiClient.post<SOPAllocationResponse>('/sop/allocations', data);
    return response.data;
  },

  // Update shop capacities
  updateCapacities: async (shopCapacities: Record<string, {
    qualCapacity?: number;
    assignCapacity?: number;
    releaseCapacity?: number;
    repairCapacity?: number;
    utilizationTarget?: number;
  }>): Promise<{ success: boolean; message: string; updatedShops: string[] }> => {
    const response = await apiClient.put('/sop/allocations/capacity', { shopCapacities });
    return response.data;
  },

  // Run capacity check
  checkCapacity: async (data: {
    carIds: string[];
    targetShops: string[];
    startMonth: string;
    flowRatePerWeek?: number;
  }): Promise<{
    passed: boolean;
    firstOverloadMonth: string | null;
    totalBacklog: number;
    totalCars: number;
    monthsNeeded: number;
    monthlyBreakdown: Array<{
      monthKey: string;
      carsScheduled: number;
      totalCapacity: number;
      available: number;
      isOverloaded: boolean;
    }>;
    overloadedShops: Array<{
      shopId: string;
      shopName: string;
      monthKey: string;
      capacity: number;
      projected: number;
      overload: number;
    }>;
    message: string;
  }> => {
    const response = await apiClient.post('/sop/capacity-check', data);
    return response.data;
  },
};

// Lease Qualification Engine API
export const leaseQualificationApi = {
  // Releases
  getReleases: async (horizonMonths: number = 6): Promise<{ data: LeaseRelease[]; count: number }> => {
    const response = await apiClient.get('/lease-qualification/releases', { params: { horizonMonths } });
    return response.data;
  },

  // Capacity
  getCapacity: async (horizonMonths: number = 6): Promise<{ data: ShopCapacitySnapshot[]; count: number }> => {
    const response = await apiClient.get('/lease-qualification/capacity', { params: { horizonMonths } });
    return response.data;
  },

  // Scenarios
  getScenarios: async (): Promise<{ data: QualificationScenario[]; count: number }> => {
    const response = await apiClient.get('/lease-qualification/scenarios');
    return response.data;
  },

  getScenario: async (id: string): Promise<{ data: QualificationScenario }> => {
    const response = await apiClient.get(`/lease-qualification/scenarios/${id}`);
    return response.data;
  },

  runScenario: async (params: {
    name: string;
    type?: 'base' | 'late_release' | 'capacity_shift' | 'custom';
    lateReleasePercent?: number;
    capacityAdjustments?: Record<string, number>;
    planningHorizonMonths?: number;
  }): Promise<{ data: ScenarioMetrics }> => {
    const response = await apiClient.post('/lease-qualification/scenarios/run', params);
    return response.data;
  },

  compareScenarios: async (scenarioIds: string[]): Promise<{ data: ScenarioComparison }> => {
    const response = await apiClient.post('/lease-qualification/scenarios/compare', { scenarioIds });
    return response.data;
  },

  approveScenario: async (id: string): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.post(`/lease-qualification/scenarios/${id}/approve`);
    return response.data;
  },

  getApprovedScenario: async (): Promise<{ data: QualificationScenario } | null> => {
    try {
      const response = await apiClient.get('/lease-qualification/scenarios/approved');
      return response.data;
    } catch {
      return null;
    }
  },

  // Selection data for documents
  getAvailableCars: async (scenarioId: string): Promise<{ data: AvailableCar[]; count: number }> => {
    const response = await apiClient.get(`/lease-qualification/scenarios/${scenarioId}/available-cars`);
    return response.data;
  },

  getAvailableShops: async (scenarioId: string): Promise<{ data: AvailableShop[]; count: number }> => {
    const response = await apiClient.get(`/lease-qualification/scenarios/${scenarioId}/available-shops`);
    return response.data;
  },

  getAvailableCustomers: async (scenarioId: string): Promise<{ data: AvailableCustomer[]; count: number }> => {
    const response = await apiClient.get(`/lease-qualification/scenarios/${scenarioId}/available-customers`);
    return response.data;
  },

  getAvailableMonths: async (scenarioId: string): Promise<{ data: AvailableMonth[]; count: number }> => {
    const response = await apiClient.get(`/lease-qualification/scenarios/${scenarioId}/available-months`);
    return response.data;
  },

  // Document generation
  generateTeamPlan: async (criteria: DocumentSelectionCriteria, save: boolean = false): Promise<{ data: GeneratedDocument; documentId?: string }> => {
    const response = await apiClient.post(`/lease-qualification/documents/team-plan?save=${save}`, criteria);
    return response.data;
  },

  generateCustomerSchedule: async (criteria: DocumentSelectionCriteria & { customerId: string }, save: boolean = false): Promise<{ data: GeneratedDocument; documentId?: string }> => {
    const response = await apiClient.post(`/lease-qualification/documents/customer-schedule?save=${save}`, criteria);
    return response.data;
  },

  generateShopPlan: async (criteria: DocumentSelectionCriteria & { shopId: string }, save: boolean = false): Promise<{ data: GeneratedDocument; documentId?: string }> => {
    const response = await apiClient.post(`/lease-qualification/documents/shop-plan?save=${save}`, criteria);
    return response.data;
  },

  // Saved documents
  getDocuments: async (scenarioId?: string): Promise<{ data: Array<{ id: string; scenarioId: string; documentType: string; title: string; createdAt: string }>; count: number }> => {
    const response = await apiClient.get('/lease-qualification/documents', { params: { scenarioId } });
    return response.data;
  },

  getDocument: async (id: string): Promise<{ data: { id: string; title: string; contentMarkdown: string; contentJson: Record<string, unknown> } }> => {
    const response = await apiClient.get(`/lease-qualification/documents/${id}`);
    return response.data;
  },

  // Contracts
  getContracts: async (params?: { status?: string; customerId?: string }): Promise<{ data: Array<{ id: string; contractNumber: string; car: { railcarNumber: string }; customer: { name: string }; endDate: string; status: string }>; count: number }> => {
    const response = await apiClient.get('/lease-qualification/contracts', { params });
    return response.data;
  },

  // Queue
  getQueue: async (params?: { status?: string; targetMonth?: string }): Promise<{ data: Array<{ id: string; car: { railcarNumber: string }; customer: { name: string }; targetQualMonth: string; queueStatus: string; priority: number; workTypes: string[] }>; count: number }> => {
    const response = await apiClient.get('/lease-qualification/queue', { params });
    return response.data;
  },
};

