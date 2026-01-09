/**
 * Scheduling Queue Page
 *
 * Displays customer-approved proposals awaiting scheduling.
 * This is the handoff point from the planning team to the scheduling team.
 *
 * Workflow: Plan Created → Sent to Customer → Customer Approved → [THIS PAGE] → Scheduled
 */

import { useState, useEffect, useCallback } from 'react';
import {
  CalendarDaysIcon,
  CheckCircleIcon,
  ClockIcon,
  UserGroupIcon,
  BuildingOffice2Icon,
  TruckIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  ChevronRightIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import proposalsApi, {
  getStatusLabel,
  getStatusColor,
} from '../services/api/proposals';
import type { PlanProposal, ProposalStats } from '../services/api/types';

// =============================================================================
// Helper Functions
// =============================================================================

function formatDate(dateString: string | null): string {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPlanningHorizon(start: string | null, end: string | null): string {
  if (!start) return '-';
  const startDate = new Date(start);
  const startStr = startDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  if (!end || start === end) return startStr;

  const endDate = new Date(end);
  const endStr = endDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  return `${startStr} - ${endStr}`;
}

// =============================================================================
// Stats Card Component
// =============================================================================

interface StatsCardProps {
  title: string;
  value: number;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  color: string;
  description?: string;
}

function StatsCard({ title, value, icon: Icon, color, description }: StatsCardProps) {
  return (
    <div className="bg-white rounded-lg border border-steel-200 p-4">
      <div className="flex items-center">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div className="ml-4">
          <p className="text-sm font-medium text-steel-500">{title}</p>
          <p className="text-2xl font-semibold text-steel-900">{value}</p>
          {description && (
            <p className="text-xs text-steel-400 mt-1">{description}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Proposal Card Component
// =============================================================================

interface ProposalCardProps {
  proposal: PlanProposal;
  onSchedule: (proposalId: string) => void;
  onViewDetails: (proposal: PlanProposal) => void;
  isScheduling: boolean;
}

function ProposalCard({ proposal, onSchedule, onViewDetails, isScheduling }: ProposalCardProps) {
  const daysSinceApproval = proposal.respondedAt
    ? Math.floor(
        (Date.now() - new Date(proposal.respondedAt).getTime()) / (1000 * 60 * 60 * 24)
      )
    : 0;

  const isUrgent = daysSinceApproval > 7;

  return (
    <div
      className={`bg-white rounded-lg border ${
        isUrgent ? 'border-amber-300 ring-1 ring-amber-200' : 'border-steel-200'
      } p-5 hover:shadow-md transition-shadow`}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-steel-900">{proposal.name}</h3>
            {isUrgent && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                <ExclamationTriangleIcon className="h-3 w-3 mr-1" />
                {daysSinceApproval}d waiting
              </span>
            )}
          </div>
          <p className="text-sm text-steel-500 mt-1">
            {proposal.proposalNumber} • v{proposal.version}
          </p>
        </div>
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
            proposal.status
          )}`}
        >
          {getStatusLabel(proposal.status)}
        </span>
      </div>

      {/* Customer Info */}
      <div className="mt-4 flex items-center text-sm text-steel-600">
        <BuildingOffice2Icon className="h-4 w-4 mr-2 text-steel-400" />
        <span className="font-medium">{proposal.customer?.name || 'Unknown Customer'}</span>
        <span className="mx-2">•</span>
        <span>{proposal.customer?.code}</span>
      </div>

      {/* Metrics Grid */}
      <div className="mt-4 grid grid-cols-3 gap-4">
        <div className="text-center">
          <div className="flex items-center justify-center">
            <TruckIcon className="h-4 w-4 text-steel-400 mr-1" />
            <span className="text-lg font-semibold text-steel-900">{proposal.carCount}</span>
          </div>
          <p className="text-xs text-steel-500">Cars</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center">
            <BuildingOffice2Icon className="h-4 w-4 text-steel-400 mr-1" />
            <span className="text-lg font-semibold text-steel-900">{proposal.shopCount}</span>
          </div>
          <p className="text-xs text-steel-500">Shops</p>
        </div>
        <div className="text-center">
          <span className="text-lg font-semibold text-steel-900">
            {formatCurrency(proposal.totalEstimatedCost)}
          </span>
          <p className="text-xs text-steel-500">Est. Cost</p>
        </div>
      </div>

      {/* Planning Horizon */}
      <div className="mt-4 flex items-center text-sm text-steel-600">
        <CalendarDaysIcon className="h-4 w-4 mr-2 text-steel-400" />
        <span>
          {formatPlanningHorizon(proposal.planningHorizonStart, proposal.planningHorizonEnd)}
        </span>
      </div>

      {/* Approval Info */}
      <div className="mt-3 flex items-center text-sm text-steel-500">
        <CheckCircleIcon className="h-4 w-4 mr-2 text-green-500" />
        <span>
          Approved by {proposal.approvedBy}
          {proposal.respondedAt && ` on ${formatDate(proposal.respondedAt)}`}
        </span>
      </div>

      {/* Actions */}
      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={() => onSchedule(proposal.id)}
          disabled={isScheduling}
          className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-rail-600 hover:bg-rail-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rail-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isScheduling ? (
            <>
              <ArrowPathIcon className="h-4 w-4 mr-2 animate-spin" />
              Scheduling...
            </>
          ) : (
            <>
              <CalendarDaysIcon className="h-4 w-4 mr-2" />
              Schedule Now
            </>
          )}
        </button>
        <button
          onClick={() => onViewDetails(proposal)}
          className="inline-flex items-center px-4 py-2 border border-steel-300 text-sm font-medium rounded-md text-steel-700 bg-white hover:bg-steel-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rail-500"
        >
          <DocumentTextIcon className="h-4 w-4 mr-2" />
          Details
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// Proposal Details Modal
// =============================================================================

interface ProposalDetailsModalProps {
  proposal: PlanProposal | null;
  onClose: () => void;
}

function ProposalDetailsModal({ proposal, onClose }: ProposalDetailsModalProps) {
  if (!proposal) return null;

  // Parse the proposal snapshot if available
  let snapshotData: { cars?: unknown[]; generatedAt?: string } = {};
  try {
    snapshotData = JSON.parse(proposal.proposalSnapshot || '{}');
  } catch {
    // Ignore parse errors
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-end justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="inline-block transform overflow-hidden rounded-lg bg-white text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl sm:align-middle">
          {/* Header */}
          <div className="bg-steel-50 px-6 py-4 border-b border-steel-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-steel-900">{proposal.name}</h3>
                <p className="text-sm text-steel-500">
                  {proposal.proposalNumber} • Version {proposal.version}
                </p>
              </div>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                  proposal.status
                )}`}
              >
                {getStatusLabel(proposal.status)}
              </span>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
            {/* Customer Section */}
            <div className="mb-6">
              <h4 className="text-sm font-medium text-steel-500 uppercase tracking-wide mb-2">
                Customer
              </h4>
              <div className="bg-steel-50 rounded-lg p-4">
                <p className="font-medium text-steel-900">{proposal.customer?.name}</p>
                <p className="text-sm text-steel-600">{proposal.customer?.code}</p>
                {proposal.customer?.contactEmail && (
                  <p className="text-sm text-steel-500 mt-1">{proposal.customer.contactEmail}</p>
                )}
              </div>
            </div>

            {/* Summary Metrics */}
            <div className="mb-6">
              <h4 className="text-sm font-medium text-steel-500 uppercase tracking-wide mb-2">
                Summary
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-steel-50 rounded-lg p-3">
                  <p className="text-2xl font-semibold text-steel-900">{proposal.carCount}</p>
                  <p className="text-sm text-steel-500">Cars to Schedule</p>
                </div>
                <div className="bg-steel-50 rounded-lg p-3">
                  <p className="text-2xl font-semibold text-steel-900">{proposal.shopCount}</p>
                  <p className="text-sm text-steel-500">Shops Involved</p>
                </div>
                <div className="bg-steel-50 rounded-lg p-3">
                  <p className="text-2xl font-semibold text-steel-900">
                    {formatCurrency(proposal.totalEstimatedCost)}
                  </p>
                  <p className="text-sm text-steel-500">Estimated Cost</p>
                </div>
                <div className="bg-steel-50 rounded-lg p-3">
                  <p className="text-sm font-medium text-steel-900">
                    {formatPlanningHorizon(
                      proposal.planningHorizonStart,
                      proposal.planningHorizonEnd
                    )}
                  </p>
                  <p className="text-sm text-steel-500">Planning Horizon</p>
                </div>
              </div>
            </div>

            {/* Approval Details */}
            <div className="mb-6">
              <h4 className="text-sm font-medium text-steel-500 uppercase tracking-wide mb-2">
                Approval Details
              </h4>
              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <div className="flex items-center">
                  <CheckCircleIcon className="h-5 w-5 text-green-600 mr-2" />
                  <span className="font-medium text-green-800">Customer Approved</span>
                </div>
                <div className="mt-2 text-sm text-green-700">
                  <p>
                    <strong>Approved by:</strong> {proposal.approvedBy}
                    {proposal.approverTitle && ` (${proposal.approverTitle})`}
                  </p>
                  {proposal.approverEmail && (
                    <p>
                      <strong>Email:</strong> {proposal.approverEmail}
                    </p>
                  )}
                  {proposal.respondedAt && (
                    <p>
                      <strong>Date:</strong> {formatDate(proposal.respondedAt)}
                    </p>
                  )}
                  {proposal.responseNotes && (
                    <p className="mt-2">
                      <strong>Notes:</strong> {proposal.responseNotes}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="mb-6">
              <h4 className="text-sm font-medium text-steel-500 uppercase tracking-wide mb-2">
                Timeline
              </h4>
              <div className="relative pl-6 border-l-2 border-steel-200 space-y-4">
                <div className="relative">
                  <div className="absolute -left-[25px] w-4 h-4 rounded-full bg-steel-300" />
                  <p className="text-sm font-medium text-steel-900">Created</p>
                  <p className="text-xs text-steel-500">{formatDate(proposal.createdAt)}</p>
                </div>
                {proposal.sentAt && (
                  <div className="relative">
                    <div className="absolute -left-[25px] w-4 h-4 rounded-full bg-blue-500" />
                    <p className="text-sm font-medium text-steel-900">Sent to Customer</p>
                    <p className="text-xs text-steel-500">
                      {formatDate(proposal.sentAt)} • To: {proposal.sentToName}
                    </p>
                  </div>
                )}
                {proposal.respondedAt && (
                  <div className="relative">
                    <div className="absolute -left-[25px] w-4 h-4 rounded-full bg-green-500" />
                    <p className="text-sm font-medium text-steel-900">Customer Approved</p>
                    <p className="text-xs text-steel-500">{formatDate(proposal.respondedAt)}</p>
                  </div>
                )}
                <div className="relative">
                  <div className="absolute -left-[25px] w-4 h-4 rounded-full border-2 border-rail-500 bg-white" />
                  <p className="text-sm font-medium text-rail-600">Ready to Schedule</p>
                  <p className="text-xs text-steel-500">Awaiting scheduler action</p>
                </div>
              </div>
            </div>

            {/* Description */}
            {proposal.description && (
              <div className="mb-6">
                <h4 className="text-sm font-medium text-steel-500 uppercase tracking-wide mb-2">
                  Description
                </h4>
                <p className="text-sm text-steel-700 bg-steel-50 rounded-lg p-3">
                  {proposal.description}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-steel-50 px-6 py-4 border-t border-steel-200 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-steel-700 bg-white border border-steel-300 rounded-md hover:bg-steel-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Page Component
// =============================================================================

export default function SchedulingQueue() {
  const [queue, setQueue] = useState<PlanProposal[]>([]);
  const [stats, setStats] = useState<ProposalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [selectedProposal, setSelectedProposal] = useState<PlanProposal | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [queueData, statsData] = await Promise.all([
        proposalsApi.getSchedulingQueue(),
        proposalsApi.getProposalStats(),
      ]);

      setQueue(queueData);
      setStats(statsData);
    } catch (err) {
      console.error('Error fetching scheduling queue:', err);
      setError('Failed to load scheduling queue. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle scheduling
  const handleSchedule = async (proposalId: string) => {
    try {
      setSchedulingId(proposalId);
      setError(null);

      const result = await proposalsApi.scheduleProposal(proposalId);

      setSuccessMessage(
        `Successfully scheduled ${result.carFlowPlansCreated} cars from proposal "${result.proposal.name}"`
      );

      // Refresh data
      await fetchData();

      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      console.error('Error scheduling proposal:', err);
      setError('Failed to schedule proposal. Please try again.');
    } finally {
      setSchedulingId(null);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <ArrowPathIcon className="h-8 w-8 text-rail-600 mx-auto animate-spin" />
          <p className="mt-3 text-sm text-steel-500">Loading scheduling queue...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-steel-900">Scheduling Queue</h1>
          <p className="text-sm text-steel-500 mt-1">
            Customer-approved proposals ready for scheduling
          </p>
        </div>
        <button
          onClick={fetchData}
          className="inline-flex items-center px-3 py-2 border border-steel-300 text-sm font-medium rounded-md text-steel-700 bg-white hover:bg-steel-50"
        >
          <ArrowPathIcon className="h-4 w-4 mr-2" />
          Refresh
        </button>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center">
            <CheckCircleIcon className="h-5 w-5 text-green-600 mr-2" />
            <p className="text-sm font-medium text-green-800">{successMessage}</p>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-600 mr-2" />
            <p className="text-sm font-medium text-red-800">{error}</p>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatsCard
            title="Ready to Schedule"
            value={stats.awaitingScheduling}
            icon={CalendarDaysIcon}
            color="bg-rail-600"
            description="Approved proposals"
          />
          <StatsCard
            title="Awaiting Response"
            value={stats.awaitingResponse}
            icon={ClockIcon}
            color="bg-blue-500"
            description="Sent to customers"
          />
          <StatsCard
            title="Scheduled This Month"
            value={stats.scheduled}
            icon={CheckCircleIcon}
            color="bg-green-500"
          />
          <StatsCard
            title="Total Proposals"
            value={stats.total}
            icon={UserGroupIcon}
            color="bg-steel-500"
          />
        </div>
      )}

      {/* Queue List */}
      {queue.length === 0 ? (
        <div className="bg-white rounded-lg border border-steel-200 p-12 text-center">
          <CalendarDaysIcon className="h-12 w-12 text-steel-300 mx-auto" />
          <h3 className="mt-4 text-lg font-medium text-steel-900">No proposals to schedule</h3>
          <p className="mt-2 text-sm text-steel-500">
            When customers approve plan proposals, they will appear here for scheduling.
          </p>
          <div className="mt-6 flex items-center justify-center text-sm text-steel-500">
            <span className="flex items-center">
              <span className="w-2 h-2 rounded-full bg-steel-300 mr-2" />
              Create Plan
            </span>
            <ChevronRightIcon className="h-4 w-4 mx-2" />
            <span className="flex items-center">
              <span className="w-2 h-2 rounded-full bg-blue-500 mr-2" />
              Send to Customer
            </span>
            <ChevronRightIcon className="h-4 w-4 mx-2" />
            <span className="flex items-center">
              <span className="w-2 h-2 rounded-full bg-green-500 mr-2" />
              Customer Approves
            </span>
            <ChevronRightIcon className="h-4 w-4 mx-2" />
            <span className="flex items-center font-medium text-rail-600">
              <span className="w-2 h-2 rounded-full bg-rail-500 mr-2" />
              Schedule Here
            </span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {queue.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              onSchedule={handleSchedule}
              onViewDetails={setSelectedProposal}
              isScheduling={schedulingId === proposal.id}
            />
          ))}
        </div>
      )}

      {/* Details Modal */}
      <ProposalDetailsModal
        proposal={selectedProposal}
        onClose={() => setSelectedProposal(null)}
      />
    </div>
  );
}
