/**
 * Car Flow Planning Module Types
 *
 * Types for scenarios, car flow plans, capacity, and S&OP commitments
 */

// =============================================================================
// SHOPPING STATUS
// =============================================================================

export type ShoppingStatus =
  | 'In Shop'
  | 'Compliant'
  | 'Planned'
  | 'Urgent'
  | 'Must Shop'
  | 'Upcoming'
  | 'Unknown';

export const SHOPPING_STATUS_COLORS: Record<ShoppingStatus, { bg: string; text: string; border: string }> = {
  'Urgent': { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
  'Must Shop': { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
  'Upcoming': { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
  'Compliant': { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
  'In Shop': { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
  'Planned': { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' },
  'Unknown': { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300' },
};

// =============================================================================
// CAR STATUS (New values per spec)
// =============================================================================

export type CarCurrentStatus =
  | 'Arrived'
  | 'Complete'
  | 'To Be Routed'
  | 'Release'
  | 'Up Marketed'
  | 'Enroute'
  | 'Reassigned'
  | 'Released'
  | 'Other';

// =============================================================================
// SCENARIO
// =============================================================================

export type ScenarioStatus = 'draft' | 'confirmed' | 'archived';

export interface ScenarioCustomer {
  id: string;
  customerId: string;
  isPrimary: boolean;
  customer: {
    id: string;
    name: string;
    code: string;
  };
}

export interface ScenarioCar {
  id: string;
  scenarioId: string;
  carId: string;
  shopId: string | null;
  plannedMonth: number;
  plannedYear: number;
  shopReason: string;
  estimatedCost: number;
  estimatedDays: number;
  car: {
    id: string;
    railcarNumber: string;
    customer: string;
    customerId: string | null;
    status: CarCurrentStatus;
    shoppingStatus: ShoppingStatus;
    tankQualification: string | null;
    rule88B: string | null;
    safetyRelief: string | null;
    minNoLining: string | null;
    minWLining: string | null;
  };
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  notes: string;
  status: ScenarioStatus;
  confirmedAt: string | null;
  projectNumber: string;
  companyId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  isBaseline: boolean;
  parentId: string | null;
  creator: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  customers: ScenarioCustomer[];
  cars?: ScenarioCar[];
  _count?: {
    cars: number;
  };
}

export interface CreateScenarioRequest {
  name: string;
  notes?: string;
  customerIds?: string[];
  carIds?: string[];
}

export interface ScenarioCarAssignment {
  carId: string;
  shopId?: string;
  plannedMonth: number;
  plannedYear: number;
  shopReason?: string;
}

// =============================================================================
// CAR FLOW PLAN
// =============================================================================

export type CarFlowPlanStatus = 'Planned' | 'In Progress' | 'Complete' | 'Cancelled';

export interface CarFlowPlan {
  id: string;
  carId: string;
  shopId: string;
  customerId: string | null;
  plannedMonth: number;
  plannedYear: number;
  sourceScenarioId: string | null;
  committedAt: string;
  committedById: string;
  status: CarFlowPlanStatus;
  shopReason: string;
  estimatedCost: number | null;
  priority: number;
  notes: string;
  companyId: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  car: {
    id: string;
    railcarNumber: string;
    customer: string;
    shoppingStatus: ShoppingStatus;
  };
  shop: {
    id: string;
    name: string;
    code: string;
    city: string;
    state: string;
    parentShopId: string | null;
  };
  customer?: {
    id: string;
    name: string;
    code: string;
  };
  committedBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export interface CreateCarFlowPlanRequest {
  carId: string;
  shopId: string;
  plannedMonth: number;
  plannedYear: number;
  shopReason?: string;
  notes?: string;
}

// =============================================================================
// S&OP COMMITMENT
// =============================================================================

export interface SOPCommitment {
  id: string;
  shopId: string;
  year: number;
  month: number;
  committedVolume: number;
  currentUsage: number;
  createdById: string;
  updatedById: string | null;
  companyId: string;
  createdAt: string;
  updatedAt: string;
  shop: {
    id: string;
    name: string;
    code: string;
    city: string;
    state: string;
    parentShopId: string | null;
    parentShop?: {
      id: string;
      name: string;
    };
  };
  createdBy: {
    firstName: string;
    lastName: string;
  };
  updatedBy?: {
    firstName: string;
    lastName: string;
  };
}

export interface CreateSOPCommitmentRequest {
  shopId: string;
  year: number;
  month: number;
  committedVolume: number;
}

// =============================================================================
// CAPACITY
// =============================================================================

export interface ShopCapacityMonth {
  committed: number;
  planned: number;
  draftUsage: number;
  available: number;
}

export interface ShopCapacity {
  shopId: string;
  shop: {
    id: string;
    name: string;
    code: string;
    city: string;
    state: string;
  };
  months: Record<number, ShopCapacityMonth>;
}

export interface CapacityResponse {
  year: number;
  months: number[];
  capacity: ShopCapacity[];
}

// =============================================================================
// FILTERS
// =============================================================================

export interface CarFlowFilters {
  customers: string[];
  projects: string[];
  shoppingStatuses: ShoppingStatus[];
  currentStatuses: CarCurrentStatus[];
  qualificationTypes: string[];
  carIdSearch: string;
}

export interface FilterPreset {
  id: string;
  name: string;
  description: string;
  filters: CarFlowFilters;
  pageType: 'cars' | 'car-flow' | 'scenarios';
  isPublic: boolean;
  createdById: string;
  companyId: string;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// CONFLICT DETECTION
// =============================================================================

export interface CarFlowConflict {
  carId: string;
  railcarNumber: string;
  shopName: string;
  plannedMonth: number;
  plannedYear: number;
  committedAt: string;
}

export interface ConfirmScenarioResponse {
  message: string;
  conflicts?: CarFlowConflict[];
  allowOverride?: boolean;
  scenario?: {
    id: string;
    status: ScenarioStatus;
  };
  plansCreated?: number;
}

// =============================================================================
// SHOPPING STATUS STATS
// =============================================================================

export interface ShoppingStatusStats {
  'In Shop': number;
  'Compliant': number;
  'Planned': number;
  'Urgent': number;
  'Must Shop': number;
  'Upcoming': number;
  'Unknown': number;
}

// =============================================================================
// SHOP NETWORK (using existing parent-child structure)
// =============================================================================

export interface ShopNetwork {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  isAitxInternal: boolean;
  locations: ShopLocation[];
}

export interface ShopLocation {
  id: string;
  name: string;
  code: string;
  city: string;
  state: string;
  isActive: boolean;
  tankQualified: boolean;
  parentShopId: string;
}
