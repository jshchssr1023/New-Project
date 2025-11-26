// S&OP (Sales & Operations Planning) Types for Car Flow Planning

export type Priority = 'HIGH' | 'MEDIUM' | 'LOW';
export type CarTypes = 'Tank & Freight' | 'Freight Only';
export type CapacityStatus = 'Sufficient' | 'SHORTAGE';
export type SurplusStatus = 'Surplus' | 'DEFICIT';
export type UtilizationStatus = 'Healthy' | 'Over-Utilized';

// Demand Type - 4 categories of work
export interface DemandType {
  id: string;
  name: string;
  annualVolume: number;
  priority: Priority;
  leadTime: string;
  notes: string;
  percentOfTotal?: number;
}

// Car Type Distribution
export interface CarTypeDistribution {
  tankCars: number;    // percentage (e.g., 65)
  freightCars: number; // percentage (e.g., 35)
}

// AITX Internal Shop
export interface AITXShop {
  id: string;
  location: string;
  carTypes: CarTypes;
  monthlyCapacity: number;
  annualCapacity: number;
  utilizationTarget: number;
  costIndex: number;
  notes: string;
  isTankQualified: boolean;
}

// Third-Party Network
export interface ThirdPartyNetwork {
  id: string;
  name: string;
  shopCount: number;
  monthlyCapacity: number;
  annualCapacity: number;
  carTypes: CarTypes;
  costIndex: number;
  notes: string;
  availabilityFactor: number;
}

// Monthly Demand Forecast
export interface MonthlyDemandForecast {
  month: string;
  qualifications: number;
  assignments: number;
  returns: number;
  external: number;
  total: number;
  isOverride?: boolean;
}

// Shop Allocation
export interface ShopAllocation {
  shopId: string;
  shopName: string;
  cars: number;
  isAITX: boolean;
}

// Monthly Allocation Plan
export interface MonthlyAllocation {
  month: string;
  shopAllocations: ShopAllocation[];
  aitxSubtotal: number;
  thirdPartySubtotal: number;
  totalPlanned: number;
  demandForMonth: number;
  unallocatedDemand: number;
  systemUtilization: number;
}

// System Metrics for Dashboard
export interface SystemMetrics {
  totalAnnualDemand: number;
  aitxAnnualCapacity: number;
  thirdPartyAnnualCapacity: number;
  totalSystemCapacity: number;
  capacitySurplusDeficit: number;
  systemUtilizationRate: number;
  aitxPercentage: number;
  thirdPartyPercentage: number;
  capacityStatus: CapacityStatus;
  surplusStatus: SurplusStatus;
  utilizationStatus: UtilizationStatus;
  monthlyDemand: number;
  monthlyCapacity: number;
}

// Action Item
export interface ActionItem {
  id: string;
  priority: Priority;
  action: string;
  owner: string;
  frequency: string;
}

// S&OP Scenario
export interface SOPScenario {
  id: string;
  name: string;
  description: string;
  demandTypes: DemandType[];
  carTypeDistribution: CarTypeDistribution;
  aitxShops: AITXShop[];
  thirdPartyNetworks: ThirdPartyNetwork[];
  monthlyForecasts: MonthlyDemandForecast[];
  monthlyAllocations: MonthlyAllocation[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

// Planning Assumptions
export interface PlanningAssumptions {
  defaultUtilizationTarget: number;
  defaultAvailabilityFactor: number;
  aitxCostPremium: number;
  planningHorizonMonths: number;
  tankCarPercentage: number;
  freightCarPercentage: number;
}

// Default Data
export const DEFAULT_DEMAND_TYPES: DemandType[] = [
  { id: 'qual', name: 'Regulatory Qualifications', annualVolume: 3500, priority: 'HIGH', leadTime: 'Due by year-end', notes: 'Commodity-based cycles (3-10yr)' },
  { id: 'assign', name: 'Assignments (Pre-Delivery)', annualVolume: 3600, priority: 'MEDIUM', leadTime: '90-120 days', notes: '4,000 assignments × 90% need shop' },
  { id: 'return', name: 'Returns (Off-Lease)', annualVolume: 4000, priority: 'MEDIUM', leadTime: '60-day notice', notes: 'Lease expirations, 75-120 day cycle' },
  { id: 'external', name: 'External Customer Work', annualVolume: 0, priority: 'LOW', leadTime: 'Varies', notes: 'P&O pipeline - sold services (optional)' }
];

export const DEFAULT_AITX_SHOPS: AITXShop[] = [
  { id: 'brookhaven', location: 'Brookhaven, MS', carTypes: 'Tank & Freight', monthlyCapacity: 35, annualCapacity: 420, utilizationTarget: 0.90, costIndex: 1.379, notes: 'Tank-qualified, crane capacity', isTankQualified: true },
  { id: 'bude', location: 'Bude, MS', carTypes: 'Tank & Freight', monthlyCapacity: 35, annualCapacity: 420, utilizationTarget: 0.90, costIndex: 1.379, notes: 'Tank-qualified', isTankQualified: true },
  { id: 'longview', location: 'Longview, TX', carTypes: 'Tank & Freight', monthlyCapacity: 30, annualCapacity: 360, utilizationTarget: 0.90, costIndex: 1.379, notes: 'Tank-qualified', isTankQualified: true },
  { id: 'nkc', location: 'NKC, MO', carTypes: 'Tank & Freight', monthlyCapacity: 30, annualCapacity: 360, utilizationTarget: 0.90, costIndex: 1.379, notes: 'Tank-qualified', isTankQualified: true },
  { id: 'sarnia', location: 'Sarnia, ON', carTypes: 'Tank & Freight', monthlyCapacity: 25, annualCapacity: 300, utilizationTarget: 0.90, costIndex: 1.379, notes: 'Tank-qualified, Canada', isTankQualified: true },
  { id: 'tennille', location: 'Tennille, GA', carTypes: 'Tank & Freight', monthlyCapacity: 25, annualCapacity: 300, utilizationTarget: 0.90, costIndex: 1.379, notes: 'Tank-qualified', isTankQualified: true },
  { id: 'goodrich', location: 'Goodrich, MI', carTypes: 'Freight Only', monthlyCapacity: 20, annualCapacity: 240, utilizationTarget: 0.90, costIndex: 1.379, notes: 'No tank capability', isTankQualified: false }
];

export const DEFAULT_3P_NETWORKS: ThirdPartyNetwork[] = [
  { id: 'networkA', name: 'Network A', shopCount: 10, monthlyCapacity: 250, annualCapacity: 3000, carTypes: 'Tank & Freight', costIndex: 1.00, notes: 'Preferred 3P partner', availabilityFactor: 0.85 },
  { id: 'networkB', name: 'Network B', shopCount: 8, monthlyCapacity: 200, annualCapacity: 2400, carTypes: 'Tank & Freight', costIndex: 1.05, notes: 'Secondary network', availabilityFactor: 0.85 },
  { id: 'networkC', name: 'Network C', shopCount: 8, monthlyCapacity: 150, annualCapacity: 1800, carTypes: 'Freight Only', costIndex: 0.95, notes: 'Freight specialist', availabilityFactor: 0.85 },
  { id: 'networkD', name: 'Network D', shopCount: 7, monthlyCapacity: 150, annualCapacity: 1800, carTypes: 'Tank & Freight', costIndex: 1.10, notes: 'Geographic coverage', availabilityFactor: 0.85 },
  { id: 'networkE', name: 'Network E', shopCount: 7, monthlyCapacity: 100, annualCapacity: 1200, carTypes: 'Tank & Freight', costIndex: 1.08, notes: 'Spot capacity', availabilityFactor: 0.85 }
];

export const DEFAULT_ACTION_ITEMS: ActionItem[] = [
  { id: '1', priority: 'HIGH', action: 'Update demand forecast with actual COT dates', owner: 'Fleet Planning', frequency: 'Quarterly' },
  { id: '2', priority: 'HIGH', action: 'Confirm 3P network capacity availability', owner: 'Vendor Management', frequency: 'Monthly' },
  { id: '3', priority: 'MEDIUM', action: 'Review AITX shop utilization vs target', owner: 'Shop Managers', frequency: 'Monthly' },
  { id: '4', priority: 'MEDIUM', action: 'Validate assignment delivery schedules', owner: 'Customer Service', frequency: 'Weekly' },
  { id: '5', priority: 'LOW', action: 'Optimize allocation logic for cost savings', owner: 'Fleet Planning', frequency: 'Quarterly' }
];

export const DEFAULT_PLANNING_ASSUMPTIONS: PlanningAssumptions = {
  defaultUtilizationTarget: 0.90,
  defaultAvailabilityFactor: 0.85,
  aitxCostPremium: 1.379,
  planningHorizonMonths: 18,
  tankCarPercentage: 65,
  freightCarPercentage: 35
};
