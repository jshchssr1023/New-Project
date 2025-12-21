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

export function parseNetworksCsv(csvContent: string): NetworkImportData[] {
  const lines = csvContent.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const networks: NetworkImportData[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const network: NetworkImportData = {
      name: '',
      code: '',
    };

    headers.forEach((header, index) => {
      const value = values[index] || '';
      switch (header) {
        case 'name':
        case 'network_name':
        case 'networkname':
          network.name = value;
          break;
        case 'code':
        case 'network_code':
        case 'networkcode':
          network.code = value.toUpperCase();
          break;
        case 'description':
          network.description = value;
          break;
        case 'is_aitx_internal':
        case 'isaitxinternal':
        case 'aitx_internal':
        case 'internal':
          network.isAitxInternal = value.toLowerCase() === 'true' || value === '1';
          break;
        case 'network_tier':
        case 'networktier':
        case 'tier':
          network.networkTier = parseInt(value) || 3;
          break;
        case 'annual_target_volume':
        case 'annualtargetvolume':
        case 'target_volume':
          network.annualTargetVolume = parseInt(value) || 0;
          break;
        case 'annual_committed_volume':
        case 'annualcommittedvolume':
        case 'committed_volume':
          network.annualCommittedVolume = parseInt(value) || 0;
          break;
        case 'monthly_base_capacity':
        case 'monthlybasecapacity':
        case 'monthly_capacity':
          network.monthlyBaseCapacity = parseInt(value) || 0;
          break;
        case 'cost_index':
        case 'costindex':
          network.costIndex = parseFloat(value) || 1.0;
          break;
        case 'has_contractual_commitment':
        case 'hascontractualcommitment':
        case 'take_or_pay':
          network.hasContractualCommitment = value.toLowerCase() === 'true' || value === '1';
          break;
        case 'commitment_penalty_rate':
        case 'commitmentpenaltyrate':
        case 'penalty_rate':
          network.commitmentPenaltyRate = parseFloat(value) || 0;
          break;
        case 'contact_name':
        case 'contactname':
          network.contactName = value;
          break;
        case 'contact_email':
        case 'contactemail':
          network.contactEmail = value;
          break;
        case 'contact_phone':
        case 'contactphone':
          network.contactPhone = value;
          break;
        case 'regions':
          network.regions = value ? value.split(';').map(r => r.trim()) : [];
          break;
      }
    });

    // Only add if we have required fields
    if (network.name && network.code) {
      networks.push(network);
    }
  }

  return networks;
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
