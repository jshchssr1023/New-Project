/**
 * Shop Networks API Service
 *
 * Handles all API calls related to shop networks for S&OP planning
 */

import axios from 'axios';
import type { ShopNetwork, ShopNetworkCapacitySummary } from '../types';

const API_BASE_URL = '/api';

// Get auth token from localStorage
function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return {
    Authorization: token ? `Bearer ${token}` : '',
  };
}

// Create axios instance with defaults
const api = axios.create({
  baseURL: API_BASE_URL,
});

// Add auth interceptor
api.interceptors.request.use((config) => {
  const headers = getAuthHeaders();
  config.headers.Authorization = headers.Authorization;
  return config;
});

// =============================================================================
// SHOP NETWORKS CRUD
// =============================================================================

export interface GetNetworksParams {
  isActive?: boolean;
  isAitxInternal?: boolean;
  includeShops?: boolean;
}

export async function getShopNetworks(params?: GetNetworksParams): Promise<ShopNetwork[]> {
  const response = await api.get<ShopNetwork[]>('/shop-networks', {
    params: {
      isActive: params?.isActive,
      isAitxInternal: params?.isAitxInternal,
      includeShops: params?.includeShops,
    },
  });
  return response.data;
}

export async function getShopNetwork(id: string): Promise<ShopNetwork> {
  const response = await api.get<ShopNetwork>(`/shop-networks/${id}`);
  return response.data;
}

export interface CreateNetworkInput {
  name: string;
  code: string;
  description?: string;
  isAitxInternal?: boolean;
  networkTier?: number;
  annualTargetVolume?: number;
  annualCommittedVolume?: number;
  monthlyBaseCapacity?: number;
  costIndex?: number;
  hasContractualCommitment?: boolean;
  commitmentPenaltyRate?: number;
  contractStartDate?: string | null;
  contractEndDate?: string | null;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  isActive?: boolean;
  notes?: string;
  regions?: string[];
}

export async function createShopNetwork(data: CreateNetworkInput): Promise<ShopNetwork> {
  const response = await api.post<ShopNetwork>('/shop-networks', data);
  return response.data;
}

export async function updateShopNetwork(id: string, data: Partial<CreateNetworkInput>): Promise<ShopNetwork> {
  const response = await api.put<ShopNetwork>(`/shop-networks/${id}`, data);
  return response.data;
}

export async function deleteShopNetwork(id: string): Promise<void> {
  await api.delete(`/shop-networks/${id}`);
}

// =============================================================================
// SHOP-NETWORK ASSIGNMENT
// =============================================================================

export async function assignShopsToNetwork(networkId: string, shopIds: string[]): Promise<{ count: number }> {
  const response = await api.post<{ message: string; count: number }>(
    `/shop-networks/${networkId}/shops`,
    { shopIds }
  );
  return { count: response.data.count };
}

export async function removeShopsFromNetwork(networkId: string, shopIds: string[]): Promise<{ count: number }> {
  const response = await api.delete<{ message: string; count: number }>(
    `/shop-networks/${networkId}/shops`,
    { data: { shopIds } }
  );
  return { count: response.data.count };
}

// =============================================================================
// BULK IMPORT
// =============================================================================

export interface NetworkImportData {
  name: string;
  code: string;
  description?: string;
  isAitxInternal?: boolean;
  networkTier?: number;
  annualTargetVolume?: number;
  annualCommittedVolume?: number;
  monthlyBaseCapacity?: number;
  costIndex?: number;
  hasContractualCommitment?: boolean;
  commitmentPenaltyRate?: number;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  regions?: string[];
}

export interface NetworkImportResult {
  created: number;
  updated: number;
  errors: { code: string; error: string }[];
}

export async function importShopNetworks(networks: NetworkImportData[]): Promise<NetworkImportResult> {
  const response = await api.post<NetworkImportResult & { message: string }>(
    '/shop-networks/import',
    { networks }
  );
  return {
    created: response.data.created,
    updated: response.data.updated,
    errors: response.data.errors,
  };
}

// =============================================================================
// S&OP CAPACITY SUMMARY
// =============================================================================

export interface CapacitySummaryResponse {
  networks: ShopNetworkCapacitySummary[];
  totals: {
    aitxCapacity: number;
    thirdPartyCapacity: number;
    totalCapacity: number;
    totalCommitted: number;
  };
  year: number;
}

export async function getNetworkCapacitySummary(year?: number): Promise<CapacitySummaryResponse> {
  const response = await api.get<CapacitySummaryResponse>('/shop-networks/sop/capacity-summary', {
    params: { year },
  });
  return response.data;
}

// =============================================================================
// S&OP COMMITMENT TRACKING
// =============================================================================

export interface UpdateCommitmentInput {
  year: number;
  month: number;
  committedVolume?: number;
  actualVolume?: number;
  notes?: string;
}

export async function updateNetworkSOPCommitment(
  networkId: string,
  data: UpdateCommitmentInput
): Promise<void> {
  await api.post(`/shop-networks/${networkId}/sop-commitment`, data);
}

// =============================================================================
// CSV PARSING UTILITY
// =============================================================================

/**
 * Parse CSV content with support for quoted fields containing commas
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseNetworksCsv(csvContent: string): NetworkImportData[] {
  const lines = csvContent.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  const networks: NetworkImportData[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]).map(v => v.replace(/^["']|["']$/g, '').trim());
    const network: NetworkImportData = {
      name: '',
      code: '',
    };

    headers.forEach((header, index) => {
      const value = values[index] || '';
      const headerNorm = header.replace(/[_\s-]/g, '').toLowerCase();

      // Network identification
      if (['name', 'networkname', 'network'].includes(headerNorm)) {
        network.name = value;
      } else if (['code', 'networkcode', 'shopcode'].includes(headerNorm)) {
        network.code = value.toUpperCase();
      } else if (['description', 'desc', 'notes'].includes(headerNorm)) {
        network.description = value;
      }
      // Classification
      else if (['isaitxinternal', 'aitxinternal', 'internal', 'isinternal'].includes(headerNorm)) {
        network.isAitxInternal = ['true', '1', 'yes', 'y', 'internal', 'aitx'].includes(value.toLowerCase());
      } else if (['networktier', 'tier', 'priority'].includes(headerNorm)) {
        network.networkTier = parseInt(value) || 3;
      }
      // Capacity volumes (can be adjusted manually after import)
      else if (['annualtargetvolume', 'targetvolume', 'annualtarget'].includes(headerNorm)) {
        network.annualTargetVolume = parseInt(value) || 0;
      } else if (['annualcommittedvolume', 'committedvolume', 'commitment'].includes(headerNorm)) {
        network.annualCommittedVolume = parseInt(value) || 0;
      } else if (['monthlybasecapacity', 'monthlycapacity', 'capacity'].includes(headerNorm)) {
        network.monthlyBaseCapacity = parseInt(value) || 0;
      }
      // Cost
      else if (['costindex', 'cost', 'costmultiplier'].includes(headerNorm)) {
        network.costIndex = parseFloat(value) || 1.0;
      }
      // Contractual
      else if (['hascontractualcommitment', 'contractual', 'takeorpay'].includes(headerNorm)) {
        network.hasContractualCommitment = ['true', '1', 'yes', 'y'].includes(value.toLowerCase());
      } else if (['commitmentpenaltyrate', 'penaltyrate', 'penalty'].includes(headerNorm)) {
        network.commitmentPenaltyRate = parseFloat(value) || 0;
      }
      // Contact
      else if (['contactname', 'contact', 'contactperson'].includes(headerNorm)) {
        network.contactName = value;
      } else if (['contactemail', 'email'].includes(headerNorm)) {
        network.contactEmail = value;
      } else if (['contactphone', 'phone', 'telephone'].includes(headerNorm)) {
        network.contactPhone = value;
      }
      // Regions
      else if (['regions', 'region', 'coverage'].includes(headerNorm)) {
        network.regions = value ? value.split(/[;|]/).map(r => r.trim()).filter(Boolean) : [];
      }
    });

    // Only add if we have required fields
    if (network.name && network.code) {
      networks.push(network);
    }
  }

  return networks;
}

/**
 * Parse shop CSV with lat/lon support
 * This is for importing shops with location data
 */
export interface ShopImportData {
  code: string;
  name: string;
  city?: string;
  state?: string;
  region?: string;
  network?: string;
  latitude?: number;
  longitude?: number;
  capacity?: number;
  isAitxInternal?: boolean;
  tankQualified?: boolean;
  networkTier?: number;
  servingRailroad?: string;
}

export function parseShopsCsv(csvContent: string): ShopImportData[] {
  const lines = csvContent.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  const shops: ShopImportData[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]).map(v => v.replace(/^["']|["']$/g, '').trim());
    const shop: ShopImportData = {
      code: '',
      name: '',
    };

    headers.forEach((header, index) => {
      const value = values[index] || '';
      const headerNorm = header.replace(/[_\s-]/g, '').toLowerCase();

      // Identification
      if (['code', 'shopcode'].includes(headerNorm)) {
        shop.code = value.toUpperCase();
      } else if (['name', 'shopname'].includes(headerNorm)) {
        shop.name = value;
      }
      // Location
      else if (['city'].includes(headerNorm)) {
        shop.city = value;
      } else if (['state', 'st', 'province'].includes(headerNorm)) {
        shop.state = value;
      } else if (['region'].includes(headerNorm)) {
        shop.region = value;
      }
      // Coordinates - important for map view
      else if (['latitude', 'lat'].includes(headerNorm)) {
        const lat = parseFloat(value);
        if (!isNaN(lat) && lat >= -90 && lat <= 90) {
          shop.latitude = lat;
        }
      } else if (['longitude', 'lon', 'lng', 'long'].includes(headerNorm)) {
        const lon = parseFloat(value);
        if (!isNaN(lon) && lon >= -180 && lon <= 180) {
          shop.longitude = lon;
        }
      }
      // Network
      else if (['network', 'shopnetwork', 'networkname'].includes(headerNorm)) {
        shop.network = value;
      }
      // Capacity
      else if (['capacity', 'monthlycapacity'].includes(headerNorm)) {
        shop.capacity = parseInt(value) || 0;
      }
      // Classification
      else if (['isaitxinternal', 'aitxinternal', 'internal'].includes(headerNorm)) {
        shop.isAitxInternal = ['true', '1', 'yes', 'y', 'internal', 'aitx'].includes(value.toLowerCase());
      } else if (['tankqualified', 'tankqual'].includes(headerNorm)) {
        shop.tankQualified = ['true', '1', 'yes', 'y'].includes(value.toLowerCase());
      } else if (['tier', 'networktier'].includes(headerNorm)) {
        shop.networkTier = parseInt(value) || 5;
      }
      // Railroad
      else if (['servingrailroad', 'railroad', 'rr'].includes(headerNorm)) {
        shop.servingRailroad = value;
      }
    });

    // Only add if we have required fields
    if (shop.code && shop.name) {
      shops.push(shop);
    }
  }

  return shops;
}

// =============================================================================
// GENERATE SAMPLE CSV
// =============================================================================

export function generateSampleNetworksCsv(): string {
  const headers = [
    'name',
    'code',
    'description',
    'is_aitx_internal',
    'network_tier',
    'annual_target_volume',
    'annual_committed_volume',
    'monthly_base_capacity',
    'cost_index',
    'has_contractual_commitment',
    'commitment_penalty_rate',
    'contact_name',
    'contact_email',
    'contact_phone',
    'regions',
  ];

  const sampleData = [
    ['Trinity', 'TRINITY', 'Major 3P partner', 'false', '2', '1800', '1500', '150', '1.05', 'true', '500', 'John Smith', 'jsmith@trinity.com', '555-0100', 'Midwest;Southwest'],
    ['Greenbrier', 'GREENBRIER', 'Rail services and manufacturing', 'false', '2', '1200', '1000', '100', '1.08', 'true', '400', 'Jane Doe', 'jdoe@greenbrier.com', '555-0200', 'Southwest;Southeast'],
    ['Eagle Railcar', 'EAGLE', 'Largest 3P network', 'false', '1', '2400', '2000', '200', '1.00', 'true', '600', 'Bob Wilson', 'bwilson@eagle.com', '555-0300', 'Midwest;Southwest;Southeast;Northeast'],
  ];

  return [
    headers.join(','),
    ...sampleData.map(row => row.join(',')),
  ].join('\n');
}
