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
  make: string;
  model: string;
  year: number;
  mileage: number;
  status: 'available' | 'in_service' | 'scheduled' | 'retired';
  lastServiceDate: string | null;
  nextServiceDue: string | null;
  companyId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Shop {
  id: string;
  name: string;
  code: string;
  location: string;
  capacity: number;
  costMultiplier: number;
  turnTimeMultiplier: number;
  isActive: boolean;
  companyId: string;
  createdAt: string;
  updatedAt: string;
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
  car?: Car;
  shop?: Shop;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  basePlanId: string;
  status: 'draft' | 'analyzing' | 'completed';
  modifications: ScenarioModification[];
  results: ScenarioResults | null;
  companyId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioModification {
  id: string;
  scenarioId: string;
  type: 'add_assignment' | 'remove_assignment' | 'modify_assignment' | 'change_shop' | 'change_date';
  targetId: string;
  changes: Record<string, unknown>;
}

export interface ScenarioResults {
  totalCost: number;
  costDelta: number;
  averageTurnTime: number;
  turnTimeDelta: number;
  shopUtilization: Record<string, number>;
  monthlyDistribution: Record<string, number>;
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
