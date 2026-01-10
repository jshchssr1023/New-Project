/**
 * useShopNetworks Hook
 *
 * Fetches shop networks from the API and provides the same interface
 * as the legacy hardcoded constants in constants/shopNetworks.ts.
 *
 * This enables transitioning from hardcoded shop data to database-driven data.
 */

import { useQuery } from '@tanstack/react-query';
import { shopsApi } from '../services/api';
import type { Shop } from '../types';

// Types matching the legacy constants interface
export interface ShopLocation {
  name: string;
  code: string;
  city: string;
  state: string;
  region: string;
  servingRailroad?: string;
  tankQualified: boolean;
  monthlyCapacity: number;
  costIndex: number;
}

export interface ShopNetworkData {
  id: string;
  name: string;
  code: string;
  isAitxInternal: boolean;
  annualTargetVolume: number;
  costIndex: number;
  notes: string;
  locations: ShopLocation[];
}

export interface CapacityStats {
  monthly: number;
  annual: number;
}

export interface SystemCapacityStats extends CapacityStats {
  aitxPercent: number;
  thirdPartyPercent: number;
}

// Default values for S&OP planning
export const SOP_PLANNING_DEFAULTS = {
  planningYear: new Date().getFullYear(),
  demandRegisterYearRange: { prior: 1, current: 1, following: 1 },
  utilizationTarget: 0.90,
  aitxCostPremium: 1.379,
  planningHorizonMonths: 18,
  tankCarPercentage: 65,
  freightCarPercentage: 35,
};

// Team assignments
export const TEAM_ASSIGNMENTS = {
  'Full Qual': 'qualification',
  'Partial Qual': 'in_service_repairs',
} as const;

export type TeamAssignment = typeof TEAM_ASSIGNMENTS[keyof typeof TEAM_ASSIGNMENTS];

/**
 * Transform API shops into the legacy network structure
 */
function transformShopsToNetworks(shops: Shop[]): {
  aitxNetwork: ShopNetworkData;
  thirdPartyNetworks: ShopNetworkData[];
  allNetworks: ShopNetworkData[];
} {
  // Separate AITX and 3rd party shops
  const aitxShops = shops.filter(s => s.isAitxInternal);
  const thirdPartyShops = shops.filter(s => !s.isAitxInternal);

  // Create AITX network
  const aitxNetwork: ShopNetworkData = {
    id: 'aitx',
    name: 'AITX',
    code: 'AITX',
    isAitxInternal: true,
    annualTargetVolume: aitxShops.reduce((sum, s) => sum + (s.capacity || 0) * 12, 0),
    costIndex: 1.379,
    notes: 'AITX owned and operated facilities',
    locations: aitxShops.map(s => ({
      name: s.name,
      code: s.code,
      city: s.city || '',
      state: s.state || '',
      region: s.region || '',
      servingRailroad: s.servingRailroad || '',
      tankQualified: s.tankQualified ?? true,
      monthlyCapacity: s.capacity || 20,
      costIndex: s.costIndex || 1.379,
    })),
  };

  // Group 3rd party shops by network
  const networkGroups = new Map<string, Shop[]>();

  thirdPartyShops.forEach(shop => {
    // Try to extract network from shop name or use a default grouping
    let networkKey = shop.network || 'Other 3rd Party';

    // Common network name patterns
    if (shop.name.toLowerCase().includes('trinity')) networkKey = 'Trinity';
    else if (shop.name.toLowerCase().includes('greenbrier')) networkKey = 'Greenbrier';
    else if (shop.name.toLowerCase().includes('eagle')) networkKey = 'Eagle Railcar';
    else if (shop.name.toLowerCase().includes('cathcart') || shop.name.toLowerCase().includes('appalachian')) networkKey = 'Cathcart';
    else if (shop.name.toLowerCase().includes('curry')) networkKey = 'Curry Rail Services';
    else if (shop.name.toLowerCase().includes('procor')) networkKey = 'Procor';
    else if (shop.name.toLowerCase().includes('transco')) networkKey = 'Transco';
    else networkKey = 'Other 3rd Party';

    if (!networkGroups.has(networkKey)) {
      networkGroups.set(networkKey, []);
    }
    networkGroups.get(networkKey)!.push(shop);
  });

  // Create 3rd party network objects
  const thirdPartyNetworks: ShopNetworkData[] = [];
  const networkCodeMap: Record<string, { code: string; tier: number; costIndex: number }> = {
    'Trinity': { code: 'TRINITY', tier: 1, costIndex: 1.05 },
    'Greenbrier': { code: 'GREENBRIER', tier: 1, costIndex: 1.08 },
    'Eagle Railcar': { code: 'EAGLE', tier: 2, costIndex: 1.00 },
    'Cathcart': { code: 'CATHCART', tier: 2, costIndex: 1.03 },
    'Curry Rail Services': { code: 'CURRY', tier: 2, costIndex: 1.02 },
    'Procor': { code: 'PROCOR', tier: 2, costIndex: 1.10 },
    'Transco': { code: 'TRANSCO', tier: 2, costIndex: 0.98 },
    'Other 3rd Party': { code: 'OTHER', tier: 3, costIndex: 1.05 },
  };

  networkGroups.forEach((groupShops, networkName) => {
    const networkInfo = networkCodeMap[networkName] || { code: networkName.toUpperCase().replace(/\s+/g, ''), tier: 3, costIndex: 1.0 };

    thirdPartyNetworks.push({
      id: networkInfo.code.toLowerCase(),
      name: networkName,
      code: networkInfo.code,
      isAitxInternal: false,
      annualTargetVolume: groupShops.reduce((sum, s) => sum + (s.capacity || 0) * 12, 0),
      costIndex: networkInfo.costIndex,
      notes: `${networkName} network shops`,
      locations: groupShops.map(s => ({
        name: s.name,
        code: s.code,
        city: s.city || '',
        state: s.state || '',
        region: s.region || '',
        servingRailroad: s.servingRailroad || '',
        tankQualified: s.tankQualified ?? true,
        monthlyCapacity: s.capacity || 20,
        costIndex: s.costIndex || networkInfo.costIndex,
      })),
    });
  });

  // Sort 3rd party networks by name
  thirdPartyNetworks.sort((a, b) => a.name.localeCompare(b.name));

  return {
    aitxNetwork,
    thirdPartyNetworks,
    allNetworks: [aitxNetwork, ...thirdPartyNetworks],
  };
}

/**
 * Hook to fetch and transform shop networks data
 */
export function useShopNetworks() {
  // Fetch all active shops
  const {
    data: shops,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['shops', 'all', 'active'],
    queryFn: () => shopsApi.getAll({ isActive: true }),
    staleTime: 5 * 60 * 1000, // 5 minutes - shop data doesn't change often
  });

  // Transform shops into network structure
  const networkData = shops ? transformShopsToNetworks(shops) : null;

  // Calculate capacity stats
  const getAitxTotalCapacity = (): CapacityStats => {
    if (!networkData) return { monthly: 0, annual: 0 };
    const monthly = networkData.aitxNetwork.locations.reduce(
      (sum, loc) => sum + loc.monthlyCapacity,
      0
    );
    return { monthly, annual: monthly * 12 };
  };

  const getThirdPartyTotalCapacity = (): CapacityStats => {
    if (!networkData) return { monthly: 0, annual: 0 };
    const monthly = networkData.thirdPartyNetworks.reduce(
      (sum, network) =>
        sum + network.locations.reduce((locSum, loc) => locSum + loc.monthlyCapacity, 0),
      0
    );
    return { monthly, annual: monthly * 12 };
  };

  const getSystemTotalCapacity = (): SystemCapacityStats => {
    const aitx = getAitxTotalCapacity();
    const thirdParty = getThirdPartyTotalCapacity();
    const total = aitx.monthly + thirdParty.monthly;

    return {
      monthly: total,
      annual: total * 12,
      aitxPercent: total > 0 ? Math.round((aitx.monthly / total) * 100) : 0,
      thirdPartyPercent: total > 0 ? Math.round((thirdParty.monthly / total) * 100) : 0,
    };
  };

  const getAllShopLocations = (): (ShopLocation & {
    networkId: string;
    networkName: string;
    isAitxInternal: boolean;
  })[] => {
    if (!networkData) return [];

    const locations: (ShopLocation & {
      networkId: string;
      networkName: string;
      isAitxInternal: boolean;
    })[] = [];

    networkData.allNetworks.forEach(network => {
      network.locations.forEach(location => {
        locations.push({
          ...location,
          networkId: network.id,
          networkName: network.name,
          isAitxInternal: network.isAitxInternal,
        });
      });
    });

    return locations;
  };

  const getNetworkForShopCode = (shopCode: string): ShopNetworkData | null => {
    if (!networkData) return null;

    for (const network of networkData.allNetworks) {
      const location = network.locations.find(loc => loc.code === shopCode);
      if (location) {
        return network;
      }
    }
    return null;
  };

  const getShopLocationByCode = (shopCode: string): ShopLocation | null => {
    if (!networkData) return null;

    for (const network of networkData.allNetworks) {
      const location = network.locations.find(loc => loc.code === shopCode);
      if (location) {
        return location;
      }
    }
    return null;
  };

  return {
    // Data
    AITX_NETWORK: networkData?.aitxNetwork ?? null,
    THIRD_PARTY_NETWORKS: networkData?.thirdPartyNetworks ?? [],
    ALL_NETWORKS: networkData?.allNetworks ?? [],

    // Helper functions
    getAitxTotalCapacity,
    getThirdPartyTotalCapacity,
    getSystemTotalCapacity,
    getAllShopLocations,
    getNetworkForShopCode,
    getShopLocationByCode,

    // Query state
    isLoading,
    error,
    refetch,

    // Constants
    SOP_PLANNING_DEFAULTS,
    TEAM_ASSIGNMENTS,
  };
}

export default useShopNetworks;
