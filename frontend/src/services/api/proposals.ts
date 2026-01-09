/**
 * Plan Proposals API Service
 *
 * Handles the customer approval workflow for car service plans.
 * Supports: Create Plan → Send to Customer → Get Approval → Schedule
 */

import { apiClient } from './client';
import type {
  PlanProposal,
  ProposalStatus,
  ProposalStats,
  CreateProposalInput,
  SendProposalInput,
  RecordApprovalInput,
  RecordRejectionInput,
  RequestRevisionInput,
  ScheduleProposalResult,
} from './types';

const BASE_URL = '/api/proposals';

// =============================================================================
// Proposal CRUD
// =============================================================================

/**
 * List all proposals with optional filters
 */
export async function listProposals(filters?: {
  customerId?: string;
  status?: ProposalStatus | ProposalStatus[];
  sentAfter?: string;
  sentBefore?: string;
}): Promise<PlanProposal[]> {
  const params = new URLSearchParams();

  if (filters?.customerId) {
    params.append('customerId', filters.customerId);
  }
  if (filters?.status) {
    params.append(
      'status',
      Array.isArray(filters.status) ? filters.status.join(',') : filters.status
    );
  }
  if (filters?.sentAfter) {
    params.append('sentAfter', filters.sentAfter);
  }
  if (filters?.sentBefore) {
    params.append('sentBefore', filters.sentBefore);
  }

  const url = params.toString() ? `${BASE_URL}?${params}` : BASE_URL;
  const response = await apiClient.get<PlanProposal[]>(url);
  return response.data;
}

/**
 * Get a single proposal by ID
 */
export async function getProposal(proposalId: string): Promise<PlanProposal> {
  const response = await apiClient.get<PlanProposal>(`${BASE_URL}/${proposalId}`);
  return response.data;
}

/**
 * Create a new proposal from a scenario
 */
export async function createProposal(input: CreateProposalInput): Promise<PlanProposal> {
  const response = await apiClient.post<PlanProposal>(BASE_URL, input);
  return response.data;
}

/**
 * Get proposal statistics
 */
export async function getProposalStats(): Promise<ProposalStats> {
  const response = await apiClient.get<ProposalStats>(`${BASE_URL}/stats`);
  return response.data;
}

// =============================================================================
// Scheduling Queue
// =============================================================================

/**
 * Get the scheduling queue (approved proposals awaiting scheduling)
 */
export async function getSchedulingQueue(): Promise<PlanProposal[]> {
  const response = await apiClient.get<PlanProposal[]>(`${BASE_URL}/scheduling-queue`);
  return response.data;
}

// =============================================================================
// Workflow Actions
// =============================================================================

/**
 * Send a proposal to the customer
 */
export async function sendProposal(
  proposalId: string,
  input: SendProposalInput
): Promise<PlanProposal> {
  const response = await apiClient.post<PlanProposal>(`${BASE_URL}/${proposalId}/send`, input);
  return response.data;
}

/**
 * Record customer approval
 */
export async function recordApproval(
  proposalId: string,
  input: RecordApprovalInput
): Promise<PlanProposal> {
  const response = await apiClient.post<PlanProposal>(`${BASE_URL}/${proposalId}/approve`, input);
  return response.data;
}

/**
 * Record customer rejection
 */
export async function recordRejection(
  proposalId: string,
  input: RecordRejectionInput
): Promise<PlanProposal> {
  const response = await apiClient.post<PlanProposal>(`${BASE_URL}/${proposalId}/reject`, input);
  return response.data;
}

/**
 * Record customer revision request
 */
export async function requestRevision(
  proposalId: string,
  input: RequestRevisionInput
): Promise<PlanProposal> {
  const response = await apiClient.post<PlanProposal>(
    `${BASE_URL}/${proposalId}/request-revision`,
    input
  );
  return response.data;
}

/**
 * Create a revised version of a proposal
 */
export async function createRevision(proposalId: string): Promise<PlanProposal> {
  const response = await apiClient.post<PlanProposal>(`${BASE_URL}/${proposalId}/revise`);
  return response.data;
}

/**
 * Schedule an approved proposal (convert to CarFlowPlans)
 */
export async function scheduleProposal(proposalId: string): Promise<ScheduleProposalResult> {
  const response = await apiClient.post<ScheduleProposalResult>(
    `${BASE_URL}/${proposalId}/schedule`
  );
  return response.data;
}

/**
 * Cancel a proposal
 */
export async function cancelProposal(proposalId: string): Promise<PlanProposal> {
  const response = await apiClient.post<PlanProposal>(`${BASE_URL}/${proposalId}/cancel`);
  return response.data;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get status display label
 */
export function getStatusLabel(status: ProposalStatus): string {
  const labels: Record<ProposalStatus, string> = {
    DRAFT: 'Draft',
    SENT: 'Sent to Customer',
    CUSTOMER_APPROVED: 'Customer Approved',
    CUSTOMER_REJECTED: 'Customer Rejected',
    REVISION_REQUESTED: 'Revision Requested',
    SCHEDULED: 'Scheduled',
    EXPIRED: 'Expired',
    CANCELLED: 'Cancelled',
  };
  return labels[status] || status;
}

/**
 * Get status color for UI badges
 */
export function getStatusColor(status: ProposalStatus): string {
  const colors: Record<ProposalStatus, string> = {
    DRAFT: 'bg-gray-100 text-gray-800',
    SENT: 'bg-blue-100 text-blue-800',
    CUSTOMER_APPROVED: 'bg-green-100 text-green-800',
    CUSTOMER_REJECTED: 'bg-red-100 text-red-800',
    REVISION_REQUESTED: 'bg-yellow-100 text-yellow-800',
    SCHEDULED: 'bg-purple-100 text-purple-800',
    EXPIRED: 'bg-gray-100 text-gray-500',
    CANCELLED: 'bg-gray-100 text-gray-500',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}

/**
 * Check if a proposal can be sent
 */
export function canSend(proposal: PlanProposal): boolean {
  return proposal.status === 'DRAFT';
}

/**
 * Check if a proposal can record customer response
 */
export function canRecordResponse(proposal: PlanProposal): boolean {
  return proposal.status === 'SENT';
}

/**
 * Check if a proposal can be scheduled
 */
export function canSchedule(proposal: PlanProposal): boolean {
  return proposal.status === 'CUSTOMER_APPROVED';
}

/**
 * Check if a proposal can be revised
 */
export function canRevise(proposal: PlanProposal): boolean {
  return proposal.status === 'REVISION_REQUESTED';
}

/**
 * Check if a proposal can be cancelled
 */
export function canCancel(proposal: PlanProposal): boolean {
  return !['SCHEDULED', 'CANCELLED'].includes(proposal.status);
}

export default {
  listProposals,
  getProposal,
  createProposal,
  getProposalStats,
  getSchedulingQueue,
  sendProposal,
  recordApproval,
  recordRejection,
  requestRevision,
  createRevision,
  scheduleProposal,
  cancelProposal,
  getStatusLabel,
  getStatusColor,
  canSend,
  canRecordResponse,
  canSchedule,
  canRevise,
  canCancel,
};
