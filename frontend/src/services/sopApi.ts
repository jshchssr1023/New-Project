/**
 * S&OP (Sales & Operations Planning) API Service
 *
 * API client for S&OP module including:
 * - Demand Registry (cars due for work)
 * - Supply Capacity (network/shop commitments)
 * - Monthly Planning (allocation planning)
 */

import apiClient from './api';
import type { Car, Shop } from '../types';
import type {
  DemandRegister,
  DemandRegisterItem,
  MonthlyAllocation,
  SystemMetrics,
  WorkType,
  PlanningState,
} from '../types/sop';
import {
  buildDemandRegister,
  calculateSystemMetrics,
  generate18MonthLabels,
  calculateDemandFromCars,
} from '../utils/sopCalculations';
import {
  ALL_NETWORKS,
  AITX_NETWORK,
  THIRD_PARTY_NETWORKS,
  getSystemTotalCapacity,
} from '../constants/shopNetworks';

// =============================================================================
// TYPES
// =============================================================================

export interface NetworkCapacity {
  networkId: string;
  networkName: string;
  isAitxInternal: boolean;
  locations: {
    code: string;
    name: string;
    city: string;
    state: string;
    monthlyCapacity: number;
    annualCapacity: number;
    tankQualified: boolean;
  }[];
  totalMonthlyCapacity: number;
  totalAnnualCapacity: number;
  annualTargetVolume: number;
  monthlyAllocations: Record<string, number>; // monthKey -> allocated count
}

export interface SOPPlanSummary {
  planYear: number;
  months: string[];
  demandByMonth: Record<string, { qualifications: number; assignments: number; returns: number; total: number }>;
  supplyByMonth: Record<string, { aitx: number; thirdParty: number; total: number }>;
  allocationsByNetwork: Record<string, Record<string, number>>; // networkId -> monthKey -> count
  systemMetrics: SystemMetrics;
  capacityUtilization: number;
  unallocatedDemand: number;
}

export interface SOPAllocationUpdate {
  networkId: string;
  monthKey: string;
  allocatedCount: number;
}

export interface DemandRegistryFilters {
  workTypes?: WorkType[];
  planningStates?: PlanningState[];
  isOverdue?: boolean;
  dueDateRange?: { start: string; end: string };
  customer?: string;
  isTankCar?: boolean;
}

// =============================================================================
// DEMAND REGISTRY API
// =============================================================================

export const demandRegistryApi = {
  /**
   * Get the demand register built from actual car data
   * This fetches cars and builds the demand register client-side
   */
  getDemandRegister: async (
    filterYear?: number,
    includeRolling3Months: boolean = true
  ): Promise<DemandRegister> => {
    // Fetch cars and shops
    const [carsResponse, shopsData] = await Promise.all([
      apiClient.get<{ data: Car[] }>('/cars', { params: { pageSize: 10000 } }),
      apiClient.get<Shop[]>('/shops'),
    ]);

    const cars = carsResponse.data.data || carsResponse.data;
    const shops = Array.isArray(shopsData.data) ? shopsData.data : [];

    // Build demand register from car data
    return buildDemandRegister(cars, shops, filterYear, includeRolling3Months);
  },

  /**
   * Get filtered demand register items
   */
  getFilteredItems: async (
    filterYear?: number,
    filters?: DemandRegistryFilters
  ): Promise<DemandRegisterItem[]> => {
    const register = await demandRegistryApi.getDemandRegister(filterYear);

    let items = register.items;

    if (filters) {
      if (filters.workTypes && filters.workTypes.length > 0) {
        items = items.filter((i) => filters.workTypes!.includes(i.workType));
      }
      if (filters.planningStates && filters.planningStates.length > 0) {
        items = items.filter((i) => filters.planningStates!.includes(i.planningState));
      }
      if (filters.isOverdue !== undefined) {
        items = items.filter((i) => i.isOverdue === filters.isOverdue);
      }
      if (filters.customer) {
        items = items.filter((i) =>
          i.customer.toLowerCase().includes(filters.customer!.toLowerCase())
        );
      }
      if (filters.isTankCar !== undefined) {
        items = items.filter((i) => i.isTankCar === filters.isTankCar);
      }
    }

    return items;
  },

  /**
   * Get demand summary by work type
   */
  getDemandSummary: async (filterYear?: number) => {
    const register = await demandRegistryApi.getDemandRegister(filterYear);
    return {
      summaries: register.summaries,
      totalNotPlanned: register.totalNotPlanned,
      totalPlanned: register.totalPlanned,
      totalScheduled: register.totalScheduled,
      totalOverdue: register.totalOverdue,
      totalItems: register.items.length,
    };
  },

  /**
   * Update a car's planning state
   */
  updatePlanningState: async (
    carId: string,
    state: PlanningState,
    shopId?: string,
    scheduledMonth?: string
  ): Promise<void> => {
    await apiClient.patch(`/cars/${carId}`, {
      status: state,
      assignedShopId: shopId,
      projectedCompletionMonth: scheduledMonth,
    });
  },
};

// =============================================================================
// SUPPLY CAPACITY API
// =============================================================================

export const supplyCapacityApi = {
  /**
   * Get network hierarchy with capacity information
   */
  getNetworkHierarchy: async (): Promise<NetworkCapacity[]> => {
    // Fetch shop data to get actual commitment/allocation data
    const shopsResponse = await apiClient.get<Shop[]>('/shops');
    const shops = Array.isArray(shopsResponse.data) ? shopsResponse.data : [];

    // Build network hierarchy from constants + actual shop data
    return ALL_NETWORKS.map((network) => {
      const networkShops = shops.filter(
        (s) =>
          s.network?.toLowerCase().replace(/\s+/g, '-') === network.id ||
          (network.isAitxInternal && s.isAitxInternal)
      );

      // Calculate totals from constants (master data)
      const totalMonthlyCapacity = network.locations.reduce(
        (sum, loc) => sum + loc.monthlyCapacity,
        0
      );

      return {
        networkId: network.id,
        networkName: network.name,
        isAitxInternal: network.isAitxInternal,
        locations: network.locations.map((loc) => ({
          code: loc.code,
          name: loc.name,
          city: loc.city,
          state: loc.state,
          monthlyCapacity: loc.monthlyCapacity,
          annualCapacity: loc.monthlyCapacity * 12,
          tankQualified: loc.tankQualified,
        })),
        totalMonthlyCapacity,
        totalAnnualCapacity: totalMonthlyCapacity * 12,
        annualTargetVolume: network.annualTargetVolume,
        monthlyAllocations: {}, // Will be populated from S&OP data
      };
    });
  },

  /**
   * Get system-wide capacity metrics
   */
  getSystemCapacity: () => {
    return getSystemTotalCapacity();
  },

  /**
   * Update network target volume
   */
  updateNetworkTarget: async (
    networkId: string,
    annualTargetVolume: number
  ): Promise<void> => {
    // In a real implementation, this would update the database
    // For now, we'll just validate and return
    console.log(`Updating ${networkId} target to ${annualTargetVolume}`);
  },
};

// =============================================================================
// S&OP PLANNING API
// =============================================================================

export const sopPlanningApi = {
  /**
   * Get the full S&OP plan summary for a year
   */
  getPlanSummary: async (planYear?: number): Promise<SOPPlanSummary> => {
    const year = planYear || new Date().getFullYear();
    const months = generate18MonthLabels(new Date(year, 0, 1));

    // Fetch demand register
    const demandRegister = await demandRegistryApi.getDemandRegister(year);

    // Fetch network hierarchy
    const networks = await supplyCapacityApi.getNetworkHierarchy();

    // Build demand by month
    const demandByMonth: Record<
      string,
      { fullQualifications: number; partialQualifications: number; assignments: number; releases: number; total: number }
    > = {};

    months.forEach((month) => {
      const monthItems = demandRegister.items.filter((i) => i.dueMonth === month);
      demandByMonth[month] = {
        fullQualifications: monthItems.filter((i) => i.workType === 'full_qualification').length,
        partialQualifications: monthItems.filter((i) => i.workType === 'partial_qualification').length,
        assignments: monthItems.filter((i) => i.workType === 'assignment').length,
        releases: monthItems.filter((i) => i.workType === 'release').length,
        total: monthItems.length,
      };
    });

    // Build supply by month from network capacities
    const supplyByMonth: Record<string, { aitx: number; thirdParty: number; total: number }> = {};
    const aitxMonthly = AITX_NETWORK.locations.reduce((sum, loc) => sum + loc.monthlyCapacity, 0);
    const thirdPartyMonthly = THIRD_PARTY_NETWORKS.reduce(
      (sum, net) => sum + net.locations.reduce((s, loc) => s + loc.monthlyCapacity, 0),
      0
    );

    months.forEach((month) => {
      supplyByMonth[month] = {
        aitx: aitxMonthly,
        thirdParty: thirdPartyMonthly,
        total: aitxMonthly + thirdPartyMonthly,
      };
    });

    // Build allocations by network (placeholder - would come from database)
    const allocationsByNetwork: Record<string, Record<string, number>> = {};
    networks.forEach((network) => {
      allocationsByNetwork[network.networkId] = {};
      months.forEach((month) => {
        // Default: distribute demand proportionally based on capacity
        const networkCapacityShare =
          network.totalMonthlyCapacity / (aitxMonthly + thirdPartyMonthly);
        const monthDemand = demandByMonth[month]?.total || 0;
        allocationsByNetwork[network.networkId][month] = Math.round(
          monthDemand * networkCapacityShare
        );
      });
    });

    // Calculate system metrics
    const demandData = calculateDemandFromCars(
      demandRegister.items.map((i) => ({ id: i.carId } as Car)),
      []
    );

    const totalDemand = demandRegister.items.length;
    const totalSupply = (aitxMonthly + thirdPartyMonthly) * 12;
    const capacityUtilization = totalSupply > 0 ? (totalDemand / totalSupply) * 100 : 0;
    const unallocatedDemand = Math.max(0, totalDemand - totalSupply);

    return {
      planYear: year,
      months,
      demandByMonth,
      supplyByMonth,
      allocationsByNetwork,
      systemMetrics: {
        totalAnnualDemand: totalDemand,
        aitxAnnualCapacity: aitxMonthly * 12,
        thirdPartyAnnualCapacity: thirdPartyMonthly * 12,
        totalSystemCapacity: totalSupply,
        capacitySurplusDeficit: totalSupply - totalDemand,
        systemUtilizationRate: capacityUtilization / 100,
        aitxPercentage: aitxMonthly / (aitxMonthly + thirdPartyMonthly),
        thirdPartyPercentage: thirdPartyMonthly / (aitxMonthly + thirdPartyMonthly),
        capacityStatus: totalSupply >= totalDemand ? 'Sufficient' : 'SHORTAGE',
        surplusStatus: totalSupply >= totalDemand ? 'Surplus' : 'DEFICIT',
        utilizationStatus: capacityUtilization <= 90 ? 'Healthy' : 'Over-Utilized',
        monthlyDemand: totalDemand / 12,
        monthlyCapacity: aitxMonthly + thirdPartyMonthly,
      },
      capacityUtilization,
      unallocatedDemand,
    };
  },

  /**
   * Update allocation for a network/month
   */
  updateAllocation: async (update: SOPAllocationUpdate): Promise<void> => {
    // In a real implementation, this would update the database
    await apiClient.post('/sop/allocations', update);
  },

  /**
   * Batch update allocations
   */
  batchUpdateAllocations: async (updates: SOPAllocationUpdate[]): Promise<void> => {
    await apiClient.post('/sop/allocations/batch', { updates });
  },

  /**
   * Auto-allocate demand to networks based on capacity
   */
  autoAllocate: async (planYear: number): Promise<SOPPlanSummary> => {
    // Fetch current plan
    const plan = await sopPlanningApi.getPlanSummary(planYear);

    // Auto-allocation logic: AITX first, then 3P by cost index
    const networks = await supplyCapacityApi.getNetworkHierarchy();
    const sortedNetworks = [...networks].sort((a, b) => {
      // AITX first, then by cost index (lower is better)
      if (a.isAitxInternal && !b.isAitxInternal) return -1;
      if (!a.isAitxInternal && b.isAitxInternal) return 1;
      const aCostIndex = ALL_NETWORKS.find((n) => n.id === a.networkId)?.costIndex || 1;
      const bCostIndex = ALL_NETWORKS.find((n) => n.id === b.networkId)?.costIndex || 1;
      return aCostIndex - bCostIndex;
    });

    // Distribute demand across networks
    const newAllocations: Record<string, Record<string, number>> = {};
    sortedNetworks.forEach((net) => {
      newAllocations[net.networkId] = {};
    });

    plan.months.forEach((month) => {
      let remainingDemand = plan.demandByMonth[month]?.total || 0;

      sortedNetworks.forEach((network) => {
        const allocation = Math.min(remainingDemand, network.totalMonthlyCapacity);
        newAllocations[network.networkId][month] = allocation;
        remainingDemand -= allocation;
      });
    });

    return {
      ...plan,
      allocationsByNetwork: newAllocations,
    };
  },
};

// =============================================================================
// S&OP DASHBOARD API (for Scheduling Master Dashboard)
// =============================================================================

export const sopDashboardApi = {
  /**
   * Get dashboard data including demand register and summary metrics
   * Used by SchedulingMasterDashboard for unified view
   */
  getDashboardData: async (planYear?: number): Promise<{ demandRegister: DemandRegister }> => {
    const year = planYear || new Date().getFullYear();
    const demandRegister = await demandRegistryApi.getDemandRegister(year, true);
    return { demandRegister };
  },

  /**
   * Get network commitments summary by shop
   */
  getNetworkCommitments: async (planYear?: number) => {
    const year = planYear || new Date().getFullYear();
    const [networks, planSummary] = await Promise.all([
      supplyCapacityApi.getNetworkHierarchy(),
      sopPlanningApi.getPlanSummary(year),
    ]);

    return {
      networks,
      allocations: planSummary.allocationsByNetwork,
      systemMetrics: planSummary.systemMetrics,
    };
  },
};

// =============================================================================
// COMBINED EXPORT
// =============================================================================

export const sopApi = {
  demandRegistry: demandRegistryApi,
  supplyCapacity: supplyCapacityApi,
  planning: sopPlanningApi,
  dashboard: sopDashboardApi,
};

export default sopApi;
