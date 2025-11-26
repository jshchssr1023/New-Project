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
  vehicleNumber: string;
  carType: string;
  isTankCar: boolean;
  commodity: string;
  customer: string;
  projectNumber: string;
  reasonShopped: string;
  status: 'available' | 'in_service' | 'in_shop' | 'scheduled' | 'retired';
  currentLocation: string;
  assignedShopId: string | null;
  projectedCompletionMonth: string;
  projectedCost: number;
  shopEntryDate: string | null;
  daysInShop: number;
  lastServiceDate: string | null;
  nextServiceDue: string | null;
  homeRegion: string;
  originRegion: string;
  notes: string;
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
  name: string;
  description: string;
  customerFilter: string;
  basePlanId: string | null;
  status: 'draft' | 'analyzing' | 'completed';
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
  monthlyServiceCounts: { month: string; count: number }[];
  shopPerformance: { shopId: string; shopName: string; utilization: number; avgTurnTime: number }[];
  costBreakdown: { category: string; amount: number }[];
  upcomingServices: { carId: string; vehicleNumber: string; scheduledDate: string; shopName: string }[];
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
