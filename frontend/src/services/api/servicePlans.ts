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
  // Proposal tracking fields
  customerResponseStatus?: 'none' | 'awaiting_response' | 'approved' | 'rejected' | 'revision_requested';
  customerRespondedAt?: string;
  customerFeedback?: string;
  revisionCount?: number;
  currentSnapshotId?: string;
  lastSentAt?: string;
  proposedAt?: string;
  proposedById?: string;
}

export interface ProposalSnapshot {
  id: string;
  servicePlanId: string;
  snapshotNumber: number;
  version: string;
  snapshotType: 'initial_proposal' | 'revision' | 'final_confirmation';
  snapshotData: any; // Parsed JSON containing full proposal state
  sentToCustomer: boolean;
  sentAt: string | null;
  sentById: string | null;
  sentToEmail: string | null;
  sentToName: string | null;
  customerResponseStatus: 'pending' | 'approved' | 'rejected' | 'revision_requested';
  customerRespondedAt: string | null;
  customerResponseNotes: string;
  revisionRequestedAt: string | null;
  revisionNotes: string;
  supersededBySnapshotId: string | null;
  pdfUrl: string | null;
  pdfGeneratedAt: string | null;
  carCount: number;
  optionCount: number;
  totalEstimatedCost: number;
  selectedOptionName: string | null;
  createdById: string;
  companyId: string;
  createdAt: string;
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
// CONFIRMATION WORKFLOW TYPES (v2)
// =============================================================================

export interface CarMatrixData {
  servicePlanId: string;
  planName: string;
  planVersion: number;
  planStatus: string;
  customer: { id: string; name: string; code: string };
  isEditable: boolean;
  canFinalConfirm: boolean;
  summary: {
    totalCars: number;
    pendingCars: number;
    confirmedCars: number;
  };
  cars: CarMatrixCar[];
  shops: { id: string; name: string; code: string; location: string }[];
}

export interface CarMatrixCar {
  id: string;
  carId: string;
  railcarNumber: string;
  carType: string;
  status: 'pending' | 'confirmed' | 'deleted';
  isLocked: boolean;
  assignedShopId: string | null;
  assignedShopName: string | null;
  assignedShopCode: string | null;
  plannedMonth: number | null;
  plannedYear: number | null;
  plannedMonthLabel: string | null;
  shopReason: string;
  qualificationDueDate: string | null;
  contractExpiration: string | null;
  shoppingStatus: string;
  confirmedAt: string | null;
  confirmedById: string | null;
  addedAt: string;
}

export interface CarConfirmationResult {
  id: string;
  carId: string;
  railcarNumber: string;
  status: string;
  confirmedAt: string;
  confirmedById: string;
  message?: string;
}

export interface CarDeletionResult {
  id: string;
  carId: string;
  railcarNumber: string;
  deletedAt: string;
  deletedById: string;
  deleteReason: string;
  message?: string;
}

export interface ConfirmationSummary {
  servicePlanId: string;
  planName: string;
  planVersion: number;
  customer: { id: string; name: string; code: string };
  totals: {
    confirmedCars: number;
    pendingCars: number;
    deletedCars: number;
    totalCars: number;
  };
  confirmedCarsByShop: {
    shopId: string;
    shopName: string;
    shopCode: string;
    carCount: number;
    cars: {
      carId: string;
      railcarNumber: string;
      plannedMonth: number;
      plannedYear: number;
    }[];
  }[];
  confirmedCarsByMonth: {
    month: number;
    year: number;
    monthLabel: string;
    carCount: number;
  }[];
  pendingCars: {
    id: string;
    carId: string;
    railcarNumber: string;
    carType: string;
    assignedShopId: string | null;
    assignedShopName: string | null;
    plannedMonth: number | null;
    plannedYear: number | null;
  }[];
}

export interface FinalConfirmationResult {
  servicePlan: ServicePlan;
  scheduledCars: number;
  archivedDraftPlans: number;
  message: string;
}

export interface AuditEvent {
  id: string;
  servicePlanId: string;
  eventType: string;
  planVersion: number;
  servicePlanCarId: string | null;
  carId: string | null;
  railcarNumber: string | null;
  eventDetails: string;
  performedById: string;
  performedByName: string;
  performedAt: string;
  companyId: string;
}

export interface PlanReportFilters {
  status?: string;
  customerId?: string;
  plannerId?: string;
  shopId?: string;
  month?: number;
  year?: number;
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
   * Creates an immutable snapshot for historical tracking
   */
  propose: async (
    servicePlanId: string,
    sentToEmail?: string,
    sentToName?: string
  ): Promise<{ message: string; servicePlan: ServicePlan }> => {
    const response = await apiClient.post<{ message: string; servicePlan: ServicePlan }>(
      `/service-plans/${servicePlanId}/propose`,
      { sentToEmail, sentToName }
    );
    return response.data;
  },

  /**
   * List all proposals awaiting customer response
   */
  getProposalsAwaitingResponse: async (): Promise<ServicePlan[]> => {
    const response = await apiClient.get<ServicePlan[]>(
      '/service-plans/proposals/awaiting-response'
    );
    return response.data;
  },

  /**
   * Get service plans that have confirmed cars and are ready for scheduling
   * This is the new workflow - supplements the old proposal-based scheduling queue
   */
  getSchedulingQueue: async (): Promise<{
    id: string;
    name: string;
    description: string;
    status: string;
    version: number;
    customer: { id: string; name: string; code: string; contactEmail?: string } | null;
    confirmedCarCount: number;
    pendingCarCount: number;
    totalCarCount: number;
    shopCount: number;
    totalEstimatedCost: number;
    planningHorizonStart: string | null;
    planningHorizonEnd: string | null;
    createdAt: string;
    updatedAt: string;
    createdBy: { id: string; firstName: string; lastName: string } | null;
    canFinalConfirm: boolean;
    hasPendingCars: boolean;
    source: 'service_plan';
  }[]> => {
    const response = await apiClient.get('/service-plans/scheduling-queue');
    return response.data;
  },

  /**
   * Record customer feedback on a proposal
   */
  recordCustomerFeedback: async (
    servicePlanId: string,
    responseStatus: 'approved' | 'rejected' | 'revision_requested',
    feedback?: string
  ): Promise<{ message: string; servicePlan: ServicePlan }> => {
    const response = await apiClient.post<{ message: string; servicePlan: ServicePlan }>(
      `/service-plans/${servicePlanId}/customer-feedback`,
      { responseStatus, feedback }
    );
    return response.data;
  },

  /**
   * Get proposal history (all snapshots) for a service plan
   */
  getProposalHistory: async (servicePlanId: string): Promise<ProposalSnapshot[]> => {
    const response = await apiClient.get<ProposalSnapshot[]>(
      `/service-plans/${servicePlanId}/proposal-history`
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

  // ===========================================================================
  // CONFIRMATION WORKFLOW (v2) - Car Matrix Operations
  // ===========================================================================

  /**
   * Get Car Matrix data for a service plan
   * The Car Matrix is the ONLY place where confirmation can occur
   */
  getCarMatrix: async (servicePlanId: string): Promise<CarMatrixData> => {
    const response = await apiClient.get<CarMatrixData>(
      `/service-plan-confirmation/${servicePlanId}/car-matrix`
    );
    return response.data;
  },

  /**
   * Add a car to plan with assignment (v2)
   */
  addCarWithAssignment: async (
    servicePlanId: string,
    input: {
      carId: string;
      assignedShopId?: string;
      plannedMonth?: number;
      plannedYear?: number;
      shopReason?: string;
    }
  ): Promise<ServicePlanCar> => {
    const response = await apiClient.post<ServicePlanCar>(
      `/service-plan-confirmation/${servicePlanId}/cars/v2`,
      input
    );
    return response.data;
  },

  /**
   * Update car assignment (shop, month, reason)
   * Only for pending cars
   */
  updateCarAssignment: async (
    servicePlanId: string,
    servicePlanCarId: string,
    updates: {
      assignedShopId?: string;
      plannedMonth?: number;
      plannedYear?: number;
      shopReason?: string;
    }
  ): Promise<ServicePlanCar> => {
    const response = await apiClient.put<ServicePlanCar>(
      `/service-plan-confirmation/${servicePlanId}/cars/${servicePlanCarId}/assignment`,
      updates
    );
    return response.data;
  },

  /**
   * Confirm a single car (locks it)
   */
  confirmCar: async (
    servicePlanId: string,
    servicePlanCarId: string
  ): Promise<CarConfirmationResult> => {
    const response = await apiClient.post<CarConfirmationResult>(
      `/service-plan-confirmation/${servicePlanId}/cars/${servicePlanCarId}/confirm`
    );
    return response.data;
  },

  /**
   * Confirm multiple cars at once
   */
  confirmCarsBulk: async (
    servicePlanId: string,
    servicePlanCarIds: string[]
  ): Promise<{ message: string; results: CarConfirmationResult[] }> => {
    const response = await apiClient.post<{ message: string; results: CarConfirmationResult[] }>(
      `/service-plan-confirmation/${servicePlanId}/cars/confirm-bulk`,
      { servicePlanCarIds }
    );
    return response.data;
  },

  /**
   * Delete a car from the plan (requires secondary confirmation)
   */
  deleteCarWithConfirmation: async (
    servicePlanId: string,
    servicePlanCarId: string,
    deleteReason: string,
    secondaryConfirmation: boolean
  ): Promise<CarDeletionResult> => {
    const response = await apiClient.delete<CarDeletionResult>(
      `/service-plan-confirmation/${servicePlanId}/cars/${servicePlanCarId}`,
      { data: { deleteReason, secondaryConfirmation } }
    );
    return response.data;
  },

  // ===========================================================================
  // CONFIRMATION SUMMARY AND FINAL CONFIRMATION
  // ===========================================================================

  /**
   * Get confirmation summary for review before final confirmation
   */
  getConfirmationSummary: async (servicePlanId: string): Promise<ConfirmationSummary> => {
    const response = await apiClient.get<ConfirmationSummary>(
      `/service-plan-confirmation/${servicePlanId}/confirmation-summary`
    );
    return response.data;
  },

  /**
   * Final confirmation of the plan - sends confirmed cars to Master Schedule
   */
  finalConfirm: async (servicePlanId: string): Promise<FinalConfirmationResult> => {
    const response = await apiClient.post<FinalConfirmationResult>(
      `/service-plan-confirmation/${servicePlanId}/final-confirm`
    );
    return response.data;
  },

  // ===========================================================================
  // REPORTING
  // ===========================================================================

  /**
   * Get all confirmed plans
   */
  getConfirmedPlans: async (filters?: PlanReportFilters): Promise<ServicePlan[]> => {
    const params = new URLSearchParams();
    if (filters?.customerId) params.append('customerId', filters.customerId);
    if (filters?.plannerId) params.append('plannerId', filters.plannerId);
    if (filters?.shopId) params.append('shopId', filters.shopId);
    if (filters?.month) params.append('month', filters.month.toString());
    if (filters?.year) params.append('year', filters.year.toString());

    const response = await apiClient.get<ServicePlan[]>(
      `/service-plan-confirmation/reports/confirmed${params.toString() ? `?${params.toString()}` : ''}`
    );
    return response.data;
  },

  /**
   * Get all pending/draft plans
   */
  getPendingPlans: async (filters?: PlanReportFilters): Promise<ServicePlan[]> => {
    const params = new URLSearchParams();
    if (filters?.customerId) params.append('customerId', filters.customerId);
    if (filters?.plannerId) params.append('plannerId', filters.plannerId);

    const response = await apiClient.get<ServicePlan[]>(
      `/service-plan-confirmation/reports/pending${params.toString() ? `?${params.toString()}` : ''}`
    );
    return response.data;
  },

  /**
   * Get detailed plan report
   */
  getPlanReport: async (servicePlanId: string): Promise<ServicePlan & { summary: any }> => {
    const response = await apiClient.get<ServicePlan & { summary: any }>(
      `/service-plan-confirmation/${servicePlanId}/report`
    );
    return response.data;
  },

  // ===========================================================================
  // AUDIT
  // ===========================================================================

  /**
   * Get audit history for a service plan
   */
  getAuditHistory: async (
    servicePlanId: string,
    options?: { limit?: number; offset?: number; eventType?: string }
  ): Promise<AuditEvent[]> => {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    if (options?.eventType) params.append('eventType', options.eventType);

    const response = await apiClient.get<AuditEvent[]>(
      `/service-plan-confirmation/${servicePlanId}/audit${params.toString() ? `?${params.toString()}` : ''}`
    );
    return response.data;
  },

  /**
   * Check if customer has a final confirmed plan
   */
  hasCustomerFinalConfirmedPlan: async (customerId: string): Promise<boolean> => {
    const response = await apiClient.get<{ hasFinalConfirmed: boolean }>(
      `/service-plan-confirmation/customer/${customerId}/has-final-confirmed`
    );
    return response.data.hasFinalConfirmed;
  },
};

export default servicePlansApi;
