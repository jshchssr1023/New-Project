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
  carType: string;
  isTankCar: boolean;
  commodity: string;
  customer: string;
  projectNumber: string;
  reasonsShopped: string;
  status: string; // Current Status: Arrived, Complete, To Be Routed, Release, etc.
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

  // =============================================================================
  // CONTRACT AND QUALIFICATION FLAGS
  // =============================================================================
  contractNumber: string;
  contractExpiration: string | null;
  tankQualified: boolean;
  tankQualDueDate: string | null;
  qualificationType: string; // Full/Partial Qual
  fullPartialQual: string; // Alias for qualificationType (legacy support)

  // =============================================================================
  // TANK CAR CONFIGURATION (from CSV columns L-N)
  // =============================================================================
  isJacketed: boolean; // Jacketed column
  isLined: boolean; // Lined column (Yes/No, Lined/Unlined)
  lined: boolean; // Alias for isLined (legacy support)
  liningType: string; // Lining Type column

  // =============================================================================
  // CAR BUILD INFO
  // =============================================================================
  buildYear: number | null; // Car Age / Year Built

  // =============================================================================
  // QUALIFICATION DUE DATES (from CSV columns T-AB)
  // These drive shopping urgency - earliest due date determines shopping_status
  // =============================================================================
  minNoLining: string | null; // Min (no lining) - Column T
  minWLining: string | null; // Min w lining - Column U
  interiorLining: string | null; // Interior Lining - Column V
  rule88B: string | null; // Rule 88B - Column W
  safetyRelief: string | null; // Safety Relief - Column X
  serviceEquipment: string | null; // Service Equipment - Column Y
  stubSill: string | null; // Stub Sill - Column Z
  tankThickness: string | null; // Tank Thickness - Column AA
  tankQualification: string | null; // Tank Qualification - Column AB

  // =============================================================================
  // PORTFOLIO AND STATUS FIELDS
  // =============================================================================
  portfolio: boolean; // On Lease / Active (from Portfolio column)
  onRent: boolean; // Whether car is currently on rent/lease
  shoppingStatus: string; // Computed: Urgent, Must Shop, Upcoming, Compliant, In Shop, Planned, Unknown
  planStatus: string; // Plan Status: Committed, Not Confirmed, Not Committed, year
  performTankQual: boolean; // Perform Tank Qual flag
  performScheduled: boolean; // Scheduled flag

  // Legacy aliases for backwards compatibility
  scheduled: string | null; // Alias for performScheduled
  currentStatusNote: string; // Additional status notes
  reasonShopped: string; // Alias for reasonsShopped

  companyId: string;
  createdAt: string;
  updatedAt: string;
}

// Shopping status for regulatory qualification
export type ShoppingStatus = 'Urgent' | 'Must Shop' | 'Upcoming' | 'Compliant' | 'In Shop' | 'Planned' | 'Unknown';

// Helper function to calculate shopping status from car qualification dates
export function calculateShoppingStatus(car: Car): ShoppingStatus {
  // If shoppingStatus is already set, return it
  if (car.shoppingStatus) {
    return car.shoppingStatus as ShoppingStatus;
  }

  const currentYear = new Date().getFullYear();
  const qualDates = [
    car.minNoLining,
    car.minWLining,
    car.interiorLining,
    car.rule88B,
    car.safetyRelief,
    car.serviceEquipment,
    car.stubSill,
    car.tankThickness,
    car.tankQualification,
  ].filter(Boolean);

  if (qualDates.length === 0) {
    return 'Unknown';
  }

  let earliestYear: number | null = null;

  for (const dateStr of qualDates) {
    if (!dateStr) continue;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) continue;
    const year = date.getFullYear();

    if (earliestYear === null || year < earliestYear) {
      earliestYear = year;
    }
  }

  if (earliestYear === null) return 'Unknown';
  if (earliestYear < currentYear) return 'Urgent';
  if (earliestYear === currentYear) return 'Must Shop';
  if (earliestYear === currentYear + 1) return 'Upcoming';
  return 'Compliant';
}

// =============================================================================
// SHOP NETWORK - 3rd Party Networks for S&OP Planning
// =============================================================================
export interface ShopNetwork {
  id: string;
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
  contractStartDate: string | null;
  contractEndDate: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  isActive: boolean;
  notes: string;
  regions: string[];
  companyId: string;
  // Populated relations
  shops?: Shop[];
  shopCount?: number;
  totalMonthlyCapacity?: number;
  sopNetworkCommitments?: SOPNetworkCommitment[];
  createdAt: string;
  updatedAt: string;
}

export interface SOPNetworkCommitment {
  id: string;
  networkId: string;
  year: number;
  month: number;
  committedVolume: number;
  actualVolume: number;
  variancePercent: number;
  isUnderCommitment: boolean;
  penaltyAmount: number;
  notes: string;
  companyId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShopNetworkCapacitySummary {
  id: string;
  name: string;
  code: string;
  isAitxInternal: boolean;
  networkTier: number;
  shopCount: number;
  totalMonthlyCapacity: number;
  totalAnnualCapacity: number;
  annualCommittedVolume: number;
  hasContractualCommitment: boolean;
  monthlyData: Record<number, { committed: number; actual: number }>;
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
  // Location coordinates for map view
  latitude?: number | null;
  longitude?: number | null;
  // Shop Network Reference (for 3rd party networks)
  networkId?: string | null;
  shopNetwork?: ShopNetwork;
  // Parent/Child Shop Hierarchy
  parentShopId: string | null;  // Reference to parent shop (for network/group hierarchy)
  parentShop?: Shop;            // Parent shop object (when populated)
  childShops?: Shop[];          // Child shops (when populated)
  isParent: boolean;            // True if this is a parent/network shop
  annualTargetVolume: number;   // Annual target volume (for parent shops)
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
    reasonsShopped: string;
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
    reasonsShopped: string;
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
