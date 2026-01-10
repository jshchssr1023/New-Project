/**
 * Service Plans API Client
 *
 * Provides API methods for the Service Plan Builder feature including:
 * - Service Plan CRUD operations
 * - Car selection and management
 * - Plan Options management
 * - Capacity validation
 * - Option comparison
 * - PDF export
 * - Approval workflow
 */

import apiClient from './client';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export interface ServicePlan {
  id: string;
  name: string;
  description: string;
  customerId: string | null;
  customer?: { id: string; name: string; code: string } | null;
  projectNumber: string;
  carFlowRate: number;
  startMonth: number;
  startYear: number;
  endMonth: number;
  endYear: number;
  status: 'draft' | 'proposed' | 'approved' | 'archived' | 'cancelled';
  approvedOptionId: string | null;
  totalCarSlots: number;
  selectedCarCount: number;
  companyId: string;
  createdById: string;
  creator?: { id: string; firstName: string; lastName: string };
  createdAt: string;
  updatedAt: string;
  cars: ServicePlanCar[];
  options: PlanOption[];
}

export interface ServicePlanCar {
  id: string;
  servicePlanId: string;
  carId: string;
  car: {
    id: string;
    railcarNumber: string;
    carType: string;
    customer: string;
    customerId: string | null;
    shoppingStatus: string;
    tankQualification: string | null;
    contractExpiration: string | null;
  };
  autoAssignedMonth: number | null;
  autoAssignedYear: number | null;
  userAssignedMonth: number | null;
  userAssignedYear: number | null;
  qualificationDueDate: string | null;
  contractExpiration: string | null;
  shoppingStatus: string;
  addedAt: string;
}

export interface PlanOption {
  id: string;
  servicePlanId: string;
  name: string;
  description: string;
  totalEstimatedCost: number;
  totalEstimatedDays: number;
  shopCount: number;
  status: 'draft' | 'ready' | 'selected' | 'rejected';
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  assignments: PlanOptionAssignment[];
  capacityReservations?: CapacityReservation[];
}

export interface PlanOptionAssignment {
  id: string;
  planOptionId: string;
  servicePlanCarId: string;
  servicePlanCar: ServicePlanCar;
  shopId: string;
  shop: {
    id: string;
    name: string;
    code: string;
    location: string;
    capacity: number;
    baseCostPerCar: number;
    baseTurnTime: number;
  };
  suggestedShopId: string | null;
  plannedMonth: number;
  plannedYear: number;
  estimatedCost: number;
  estimatedDays: number;
  shopReason: string;
}

export interface CapacityReservation {
  id: string;
  planOptionId: string;
  shopId: string;
  shop: { id: string; name: string; code: string };
  reservedMonth: number;
  reservedYear: number;
  reservedSlots: number;
  status: 'active' | 'released' | 'converted';
}

export interface AvailableCapacity {
  shopId: string;
  shopName: string;
  month: number;
  year: number;
  totalCapacity: number;
  usedCapacity: number;
  reservedCapacity: number;
  availableCapacity: number;
}

export interface CapacityValidation {
  valid: boolean;
  conflicts: AvailableCapacity[];
}

export interface OptionComparisonResult {
  options: {
    id: string;
    name: string;
    totalCars: number;
    totalCost: number;
    avgCostPerCar: number;
    totalDays: number;
    shopCount: number;
    timeline: {
      month: number;
      year: number;
      monthLabel: string;
      carCount: number;
      shops: { shopId: string; shopName: string; carCount: number }[];
    }[];
  }[];
  cars: {
    carId: string;
    railcarNumber: string;
    carType: string;
    qualDue: string | null;
    leaseEnd: string | null;
    optionAssignments: {
      optionId: string;
      optionName: string;
      shopId: string;
      shopName: string;
      plannedMonth: number;
      plannedYear: number;
    }[];
  }[];
}

export interface CreateServicePlanInput {
  name: string;
  description?: string;
  customerId?: string;
  projectNumber?: string;
  carFlowRate: number;
  startMonth: number;
  startYear: number;
  endMonth: number;
  endYear: number;
}

export interface CreatePlanOptionInput {
  name: string;
  description?: string;
}

export interface AssignmentInput {
  servicePlanCarId: string;
  shopId: string;
  plannedMonth: number;
  plannedYear: number;
  estimatedCost?: number;
  estimatedDays?: number;
  shopReason?: string;
}

// =============================================================================
// API CLIENT
// =============================================================================

export const servicePlansApi = {
  // ===========================================================================
  // SERVICE PLAN CRUD
  // ===========================================================================

  /**
   * List all service plans
   */
  getAll: async (filters?: { status?: string; customerId?: string }): Promise<ServicePlan[]> => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.customerId) params.append('customerId', filters.customerId);

    const response = await apiClient.get<ServicePlan[]>(
      `/service-plans${params.toString() ? `?${params.toString()}` : ''}`
    );
    return response.data;
  },

  /**
   * Get a service plan by ID
   */
  getById: async (id: string): Promise<ServicePlan> => {
    const response = await apiClient.get<ServicePlan>(`/service-plans/${id}`);
    return response.data;
  },

  /**
   * Create a new service plan
   */
  create: async (input: CreateServicePlanInput): Promise<ServicePlan> => {
    const response = await apiClient.post<ServicePlan>('/service-plans', input);
    return response.data;
  },

  /**
   * Update a service plan
   */
  update: async (id: string, input: Partial<CreateServicePlanInput>): Promise<ServicePlan> => {
    const response = await apiClient.put<ServicePlan>(`/service-plans/${id}`, input);
    return response.data;
  },

  /**
   * Delete a service plan
   */
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/service-plans/${id}`);
  },

  // ===========================================================================
  // CAR MANAGEMENT
  // ===========================================================================

  /**
   * Add cars to a service plan by ID array
   */
  addCars: async (
    servicePlanId: string,
    carIds: string[]
  ): Promise<{ message: string; cars: ServicePlanCar[] }> => {
    const response = await apiClient.post<{ message: string; cars: ServicePlanCar[] }>(
      `/service-plans/${servicePlanId}/cars`,
      { carIds }
    );
    return response.data;
  },

  /**
   * Add cars by filter criteria
   */
  addCarsByFilter: async (
    servicePlanId: string,
    filter: {
      customerId?: string;
      shoppingStatuses?: string[];
      limit?: number;
    }
  ): Promise<{ message: string; cars: ServicePlanCar[] }> => {
    const response = await apiClient.post<{ message: string; cars: ServicePlanCar[] }>(
      `/service-plans/${servicePlanId}/cars/by-filter`,
      filter
    );
    return response.data;
  },

  /**
   * Remove a car from a service plan
   */
  removeCar: async (servicePlanId: string, servicePlanCarId: string): Promise<void> => {
    await apiClient.delete(`/service-plans/${servicePlanId}/cars/${servicePlanCarId}`);
  },

  /**
   * Update a car's assigned month
   */
  updateCarMonth: async (
    servicePlanId: string,
    servicePlanCarId: string,
    month: number,
    year: number
  ): Promise<ServicePlanCar> => {
    const response = await apiClient.put<ServicePlanCar>(
      `/service-plans/${servicePlanId}/cars/${servicePlanCarId}/month`,
      { month, year }
    );
    return response.data;
  },

  // ===========================================================================
  // PLAN OPTIONS
  // ===========================================================================

  /**
   * Create a new plan option
   */
  createOption: async (
    servicePlanId: string,
    input: CreatePlanOptionInput
  ): Promise<PlanOption> => {
    const response = await apiClient.post<PlanOption>(
      `/service-plans/${servicePlanId}/options`,
      input
    );
    return response.data;
  },

  /**
   * Update a plan option
   */
  updateOption: async (
    servicePlanId: string,
    optionId: string,
    input: Partial<CreatePlanOptionInput>
  ): Promise<PlanOption> => {
    const response = await apiClient.put<PlanOption>(
      `/service-plans/${servicePlanId}/options/${optionId}`,
      input
    );
    return response.data;
  },

  /**
   * Delete a plan option
   */
  deleteOption: async (servicePlanId: string, optionId: string): Promise<void> => {
    await apiClient.delete(`/service-plans/${servicePlanId}/options/${optionId}`);
  },

  // ===========================================================================
  // ASSIGNMENTS
  // ===========================================================================

  /**
   * Set all assignments for a plan option (bulk operation)
   */
  setOptionAssignments: async (
    servicePlanId: string,
    optionId: string,
    assignments: AssignmentInput[]
  ): Promise<PlanOption> => {
    const response = await apiClient.put<PlanOption>(
      `/service-plans/${servicePlanId}/options/${optionId}/assignments`,
      { assignments }
    );
    return response.data;
  },

  /**
   * Update a single assignment
   */
  updateAssignment: async (
    servicePlanId: string,
    optionId: string,
    assignmentId: string,
    updates: Partial<AssignmentInput>
  ): Promise<PlanOptionAssignment> => {
    const response = await apiClient.put<PlanOptionAssignment>(
      `/service-plans/${servicePlanId}/options/${optionId}/assignments/${assignmentId}`,
      updates
    );
    return response.data;
  },

  // ===========================================================================
  // CAPACITY
  // ===========================================================================

  /**
   * Get capacity validation for an option
   */
  validateOptionCapacity: async (
    servicePlanId: string,
    optionId: string
  ): Promise<CapacityValidation> => {
    const response = await apiClient.get<CapacityValidation>(
      `/service-plans/${servicePlanId}/options/${optionId}/capacity`
    );
    return response.data;
  },

  /**
   * Get available capacity for a shop in a given month
   */
  getShopCapacity: async (
    shopId: string,
    month: number,
    year: number,
    excludeOptionId?: string
  ): Promise<AvailableCapacity> => {
    const params = new URLSearchParams({
      month: month.toString(),
      year: year.toString(),
    });
    if (excludeOptionId) params.append('excludeOptionId', excludeOptionId);

    const response = await apiClient.get<AvailableCapacity>(
      `/service-plans/capacity/shop/${shopId}?${params.toString()}`
    );
    return response.data;
  },

  // ===========================================================================
  // COMPARISON AND EXPORT
  // ===========================================================================

  /**
   * Get comparison data for all options in a service plan
   */
  compareOptions: async (servicePlanId: string): Promise<OptionComparisonResult> => {
    const response = await apiClient.get<OptionComparisonResult>(
      `/service-plans/${servicePlanId}/compare`
    );
    return response.data;
  },

  /**
   * Export service plan to PDF
   */
  exportPdf: async (
    servicePlanId: string,
    options?: {
      branding?: 'aitx' | 'customer';
      includeCarDetails?: boolean;
      includeShopDetails?: boolean;
    }
  ): Promise<Blob> => {
    const params = new URLSearchParams();
    if (options?.branding) params.append('branding', options.branding);
    if (options?.includeCarDetails !== undefined) {
      params.append('includeCarDetails', options.includeCarDetails.toString());
    }
    if (options?.includeShopDetails !== undefined) {
      params.append('includeShopDetails', options.includeShopDetails.toString());
    }

    const response = await apiClient.get<Blob>(
      `/service-plans/${servicePlanId}/export${params.toString() ? `?${params.toString()}` : ''}`,
      { responseType: 'blob' }
    );
    return response.data;
  },

  /**
   * Download PDF (helper function that triggers browser download)
   */
  downloadPdf: async (
    servicePlanId: string,
    filename: string,
    options?: {
      branding?: 'aitx' | 'customer';
      includeCarDetails?: boolean;
      includeShopDetails?: boolean;
    }
  ): Promise<void> => {
    const blob = await servicePlansApi.exportPdf(servicePlanId, options);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  // ===========================================================================
  // WORKFLOW
  // ===========================================================================

  /**
   * Mark service plan as proposed (sent to customer)
   */
  propose: async (servicePlanId: string): Promise<ServicePlan> => {
    const response = await apiClient.post<ServicePlan>(
      `/service-plans/${servicePlanId}/propose`
    );
    return response.data;
  },

  /**
   * Approve an option and schedule the cars
   */
  approve: async (
    servicePlanId: string,
    optionId: string,
    approvedBy: string
  ): Promise<{ message: string; servicePlan: ServicePlan }> => {
    const response = await apiClient.post<{ message: string; servicePlan: ServicePlan }>(
      `/service-plans/${servicePlanId}/approve/${optionId}`,
      { approvedBy }
    );
    return response.data;
  },
};

export default servicePlansApi;
