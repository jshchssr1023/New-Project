export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'planner' | 'viewer';
  companyId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Company {
  id: string;
  name: string;
  code: string;
  createdAt: string;
  updatedAt: string;
}

export interface Car {
  id: string;
  railcarNumber: string;
  vehicleNumber?: string; // Legacy alias for railcarNumber
  carType: string;
  isTankCar: boolean;
  commodity: string;
  customer: string;
  projectNumber: string;
  reasonShopped: string;
  status: 'available' | 'in_service' | 'in_shop' | 'scheduled' | 'retired' | 'planned' | 'release' | 'assignment' | 'arrived';
  currentLocation: string;
  assignedShopId: string | null;
  projectedCompletionMonth: string;
  projectedCost: number;
  shopEntryDate: string | null;
  arrivalDate: string | null; // When car arrived at shop (from FMS data)
  daysInShop: number;
  lastServiceDate: string | null;
  nextServiceDue: string | null;
  homeRegion: string;
  originRegion: string;
  notes: string;
  // Qualification and contract fields
  contractNumber: string;
  contractExpiration: string | null; // Contract expiration date
  tankQualified: boolean; // Tank qualification flag
  tankQualDueDate: string | null; // Tank qualification due date
  qualificationType: string; // Full/Partial qualification
  companyId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Shop {
  id: string;
  name: string;
  code: string;
  location: string;
  city: string;
  state: string;
  region: string;
  network: string;
  servingRailroad: string;
  isAitxInternal: boolean;
  tankQualified: boolean;
  networkTier: number;
  shopStatus: 'active' | 'probation' | 'inactive';
  capacity: number;
  currentLoad?: number;
  availableCapacity?: number;
  utilizationTarget: number;
  baseCostPerCar: number;
  laborRate: number;
  costIndex: number;
  baseTurnTime: number;
  turnTimeMultiplier: number;
  capabilities: string[];
  certifications: string[];
  preferredCustomers: string[];
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  notes: string;
  isActive: boolean;
  companyId: string;
  monthlyCapacity?: MonthlyCapacity[];
  createdAt: string;
  updatedAt: string;
}

export interface ShopFilters {
  regions: string[];
  networks: string[];
  railroads: string[];
}

export interface MonthlyCapacity {
  month: string;
  capacity: number;
  used: number;
  available: number;
  utilizationPercent: number;
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  status: 'draft' | 'active' | 'completed' | 'archived';
  companyId: string;
  createdBy: string;
  assignments: PlanAssignment[];
  createdAt: string;
  updatedAt: string;
}

export interface PlanAssignment {
  id: string;
  planId: string;
  carId: string;
  shopId: string;
  scheduledMonth: string;
  estimatedCost: number;
  estimatedDuration: number;
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  notes?: string;
  car?: Car;
  shop?: Shop;
}

export interface Scenario {
  id: string;
  projectNumber: string; // Required project identifier (e.g., Q4-25-001)
  name: string; // Scenario name (e.g., "Initial Proposal")
  description: string;
  customerFilter: string;
  basePlanId: string | null;
  status: 'draft' | 'analyzing' | 'completed' | 'approved';
  cars: ScenarioCar[];
  carCount?: number;
  modifications: ScenarioModification[];
  results: ScenarioResults | null;
  companyId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioCar {
  id: string;
  scenarioId: string;
  carId: string;
  car: Car;
  suggestedShopId: string | null;
  suggestedShop?: Shop | null;
  assignedShopId: string | null;
  assignedShop?: Shop | null;
  scheduledMonth: string;
  estimatedCost: number;
  estimatedDays: number;
  ruleScore: number;
  ruleNotes: string;
}

export interface ScenarioModification {
  id: string;
  scenarioId: string;
  type: 'add_assignment' | 'remove_assignment' | 'modify_assignment' | 'change_shop' | 'change_date';
  targetId: string;
  changes: Record<string, unknown>;
}

export interface ScenarioResults {
  totalCars: number;
  assignedCars: number;
  suggestedCars: number;
  unassignedCars: number;
  totalCost: number;
  averageTurnTime: number;
  customers: string[];
  capacityAnalysis: {
    hasOverload: boolean;
    totalOverloadInstances: number;
    overloadedShops: OverloadedShop[];
    shopMonthlyBreakdown: Record<string, { capacity: number; scenarioLoad: Record<string, number> }>;
  };
  unassignedCarNumbers: string[];
}

export interface OverloadedShop {
  shopName: string;
  shopCode: string;
  month: string;
  existingLoad: number;
  scenarioLoad: number;
  totalLoad: number;
  capacity: number;
  overloadPercent: number;
}

export interface ShopRecommendation {
  shopId: string;
  shopName: string;
  shopCode: string;
  score: number;
  reasons: string[];
  estimatedCost: number;
  estimatedDays: number;
  capacityAvailable: number;
  isRecommended: boolean;
}

export interface AnalyticsData {
  totalCars: number;
  totalShops: number;
  activePlans: number;
  carsInService: number;
  carsInQueue: number;
  totalCarsInShop: number;
  shopsWithCars: number;
  activeScenarios: number;
  monthlyServiceCounts: { month: string; count: number }[];
  shopPerformance: { shopId: string; shopName: string; utilization: number; avgTurnTime: number }[];
  costBreakdown: { category: string; amount: number }[];
  upcomingServices: { carId: string; railcarNumber: string; scheduledDate: string; shopName: string }[];
  myQueue: {
    id: string;
    railcarNumber: string;
    customer: string;
    reasonShopped: string;
    nextServiceDue: string | null;
    daysUntilDue: number | null;
  }[];
  inShopStatus: {
    id: string;
    railcarNumber: string;
    customer: string;
    status: string;
    shopName: string;
    shopCode: string;
    daysInShop: number;
    shopEntryDate: string | null;
  }[];
  alerts: {
    overdueCars: number;
    capacityAlerts: {
      shopName: string;
      shopCode: string;
      capacity: number;
      currentLoad: number;
      overloadPercent: number;
    }[];
    hasAlerts: boolean;
  };
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  message: string;
  code: string;
  details?: Record<string, unknown>;
}

// Report generation types
export type RecipientType = 'internal' | 'external';

export interface ReportGenerationConfig {
  planId: string;
  dateRange: {
    start: string;
    end: string;
  };
  recipientType: RecipientType;
  includeConfidentialStatement: boolean;
  hideCostData?: boolean;
}

export interface ReportData {
  planInfo: {
    name: string;
    description: string;
    startDate: string;
    endDate: string;
    status: string;
    totalAssignments: number;
  };
  assignments: Array<{
    scheduledMonth: string;
    railcarNumber: string;
    carType: string;
    customer: string;
    projectNumber: string;
    reasonShopped: string;
    shopName: string;
    shopCode: string;
    shopLocation: string;
    estimatedCost: number;
    estimatedDuration: number;
    status: string;
  }>;
  recipientType: RecipientType;
  generatedAt: string;
}

// =============================================================================
// MASTERPLAN TYPES
// =============================================================================

export type MasterPlanStatus = 'draft' | 'under_review' | 'approved' | 'active' | 'archived';
export type CommitmentStatus = 'committed' | 'scheduled' | 'in_transit' | 'arrived' | 'in_progress' | 'released';
export type WorkType = 'qualification' | 'assignment' | 'return' | 'repair' | 'maintenance';

export interface MasterPlan {
  id: string;
  companyId: string;
  planName: string;
  fiscalYear: number;
  version: number;
  status: MasterPlanStatus;
  baseScenarioId: string | null;
  approvedAt: string | null;
  approvedById: string | null;
  validFrom: string;
  validTo: string;
  createdAt: string;
  updatedAt: string;
  commitments?: MasterPlanCommitment[];
  company?: { id: string; name: string; code: string };
  baseScenario?: { id: string; name: string; projectNumber: string } | null;
  approvedBy?: { id: string; firstName: string; lastName: string; email: string } | null;
  _count?: { commitments: number };
}

export interface MasterPlanCommitment {
  id: string;
  masterPlanId: string;
  carId: string;
  shopId: string;
  customerId: string;
  scheduledMonth: string;
  plannedArrival: string | null;
  plannedRelease: string | null;
  workTypes: string;
  isBundled: boolean;
  estimatedCost: number | null;
  priority: number;
  status: CommitmentStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
  car: {
    id: string;
    railcarNumber: string;
    carType: string;
    isTankCar: boolean;
    commodity: string;
    customer: string;
  };
  shop: {
    id: string;
    name: string;
    code: string;
    location: string;
    region: string;
  };
  customer: {
    id: string;
    name: string;
    code: string;
  };
}

export interface MasterPlanSummary {
  totalCommitments: number;
  totalEstimatedCost: number;
  commitmentsByMonth: Record<string, number>;
  commitmentsByShop: Record<string, number>;
  commitmentsByStatus: Record<string, number>;
  commitmentsByWorkType: Record<string, number>;
}

export interface MasterPlanWithCommitments extends MasterPlan {
  commitments: MasterPlanCommitment[];
}
