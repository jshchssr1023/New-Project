/**
 * Service Plans Management Page
 *
 * View and manage all service plans from the SST (UnifiedAssignment).
 * Shows:
 * - Proposals awaiting customer response
 * - Plans awaiting confirmation (DRAFT/PENDING_REVIEW)
 * - Confirmed/scheduled plans (COMMITTED/IN_PROGRESS)
 * - SST status overview
 */

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardDocumentListIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  FunnelIcon,
  ChevronRightIcon,
  DocumentCheckIcon,
  TruckIcon,
  BuildingStorefrontIcon,
  CalendarDaysIcon,
  MagnifyingGlassIcon,
  PaperAirplaneIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline';
import { analyticsApi } from '../services/api/analytics';
import { servicePlansApi } from '../services/api/servicePlans';
import type {
  SSTStatusResponse,
  PlansToConfirmResponse,
  ConfirmedPlansResponse,
  PlanToConfirm,
  ConfirmedPlan,
} from '../services/api/analytics';
import type { ServicePlan } from '../services/api/servicePlans';

type TabType = 'proposals' | 'to-confirm' | 'confirmed' | 'all';
type StatusFilter = 'all' | 'DRAFT' | 'PENDING_REVIEW' | 'COMMITTED' | 'IN_PROGRESS';

export default function ServicePlansManagement() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('proposals');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [teamBucketFilter, setTeamBucketFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  // Fetch SST status
  const {
    data: sstStatus,
    isLoading: sstLoading,
    error: sstError,
    refetch: refetchSST,
  } = useQuery({
    queryKey: ['sst-status'],
    queryFn: () => analyticsApi.getSSTStatus(),
  });

  // Fetch proposals awaiting customer response
  const {
    data: proposalsAwaitingResponse,
    isLoading: proposalsLoading,
    refetch: refetchProposals,
  } = useQuery({
    queryKey: ['proposals-awaiting-response'],
    queryFn: () => servicePlansApi.getProposalsAwaitingResponse(),
    enabled: activeTab === 'proposals' || activeTab === 'all',
  });

  // Fetch plans to confirm
  const {
    data: plansToConfirm,
    isLoading: toConfirmLoading,
    refetch: refetchToConfirm,
  } = useQuery({
    queryKey: ['plans-to-confirm', statusFilter, teamBucketFilter, currentPage],
    queryFn: () =>
      analyticsApi.getPlansToConfirm({
        status: statusFilter === 'DRAFT' || statusFilter === 'PENDING_REVIEW' ? statusFilter : undefined,
        teamBucket: teamBucketFilter !== 'all' ? teamBucketFilter : undefined,
        page: currentPage,
        pageSize,
      }),
    enabled: activeTab === 'to-confirm' || activeTab === 'all',
  });

  // Fetch confirmed plans
  const {
    data: confirmedPlans,
    isLoading: confirmedLoading,
    refetch: refetchConfirmed,
  } = useQuery({
    queryKey: ['confirmed-plans', statusFilter, teamBucketFilter, currentPage],
    queryFn: () =>
      analyticsApi.getConfirmedPlans({
        status: statusFilter === 'COMMITTED' || statusFilter === 'IN_PROGRESS' ? statusFilter : undefined,
        teamBucket: teamBucketFilter !== 'all' ? teamBucketFilter : undefined,
        page: currentPage,
        pageSize,
      }),
    enabled: activeTab === 'confirmed' || activeTab === 'all',
  });

  const handleRefresh = () => {
    refetchSST();
    refetchProposals();
    refetchToConfirm();
    refetchConfirmed();
  };

  // Filter proposals by search term
  const filteredProposals = useMemo(() => {
    if (!proposalsAwaitingResponse) return [];
    if (!searchTerm) return proposalsAwaitingResponse;
    const term = searchTerm.toLowerCase();
    return proposalsAwaitingResponse.filter(
      (p) =>
        p.name?.toLowerCase().includes(term) ||
        p.customer?.name?.toLowerCase().includes(term) ||
        p.customer?.code?.toLowerCase().includes(term)
    );
  }, [proposalsAwaitingResponse, searchTerm]);

  // Filter plans by search term
  const filteredPlansToConfirm = useMemo(() => {
    if (!plansToConfirm?.plans) return [];
    if (!searchTerm) return plansToConfirm.plans;
    const term = searchTerm.toLowerCase();
    return plansToConfirm.plans.filter(
      (p) =>
        p.railcarNumber?.toLowerCase().includes(term) ||
        p.customer?.toLowerCase().includes(term) ||
        p.shopName?.toLowerCase().includes(term)
    );
  }, [plansToConfirm, searchTerm]);

  const filteredConfirmedPlans = useMemo(() => {
    if (!confirmedPlans?.plans) return [];
    if (!searchTerm) return confirmedPlans.plans;
    const term = searchTerm.toLowerCase();
    return confirmedPlans.plans.filter(
      (p) =>
        p.railcarNumber?.toLowerCase().includes(term) ||
        p.customer?.toLowerCase().includes(term) ||
        p.shopName?.toLowerCase().includes(term)
    );
  }, [confirmedPlans, searchTerm]);

  const isLoading = sstLoading ||
    (activeTab === 'proposals' && proposalsLoading) ||
    (activeTab === 'to-confirm' && toConfirmLoading) ||
    (activeTab === 'confirmed' && confirmedLoading);

  // Calculate days since proposal sent
  const getDaysSinceSent = (sentAt: string | undefined) => {
    if (!sentAt) return 0;
    const sent = new Date(sentAt);
    const now = new Date();
    return Math.floor((now.getTime() - sent.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return 'bg-gray-100 text-gray-700 border-gray-300';
      case 'PENDING_REVIEW':
        return 'bg-amber-100 text-amber-700 border-amber-300';
      case 'COMMITTED':
        return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'IN_PROGRESS':
        return 'bg-green-100 text-green-700 border-green-300';
      default:
        return 'bg-steel-100 text-steel-700 border-steel-300';
    }
  };

  const getUrgencyBadge = (urgency: string) => {
    switch (urgency) {
      case 'Overdue':
        return 'bg-red-100 text-red-700';
      case 'Urgent':
        return 'bg-amber-100 text-amber-700';
      default:
        return 'bg-green-100 text-green-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-steel-900">Service Plans Management</h1>
          <p className="text-sm text-steel-500 mt-1">
            View and manage all service plans from the Single Source of Truth (SST)
          </p>
        </div>
        <button
          onClick={handleRefresh}
          className="btn-secondary flex items-center gap-2"
          disabled={isLoading}
        >
          <ArrowPathIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* SST Status Overview */}
      {sstStatus && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {/* Proposals Awaiting Response */}
          <div
            className="card p-4 border-l-4 border-l-purple-500 cursor-pointer hover:shadow-md"
            onClick={() => {
              setActiveTab('proposals');
              setCurrentPage(1);
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <PaperAirplaneIcon className="h-4 w-4 text-purple-600" />
              <span className="text-xs font-medium text-purple-700">Proposals Sent</span>
            </div>
            <p className="text-2xl font-bold text-purple-900">{proposalsAwaitingResponse?.length || 0}</p>
            <p className="text-xs text-steel-500">Awaiting customer</p>
          </div>

          {/* Needs Planning */}
          <div
            className="card p-4 border-l-4 border-l-red-500 cursor-pointer hover:shadow-md"
            onClick={() => navigate('/cars?planStatus=Not%20Planned')}
          >
            <div className="flex items-center gap-2 mb-1">
              <ExclamationTriangleIcon className="h-4 w-4 text-red-600" />
              <span className="text-xs font-medium text-red-700">Needs Planning</span>
            </div>
            <p className="text-2xl font-bold text-red-900">{sstStatus.planningStates.needsPlanning}</p>
            <p className="text-xs text-steel-500">No SST record</p>
          </div>

          {/* Draft */}
          <div
            className="card p-4 border-l-4 border-l-gray-400 cursor-pointer hover:shadow-md"
            onClick={() => {
              setActiveTab('to-confirm');
              setStatusFilter('DRAFT');
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <ClipboardDocumentListIcon className="h-4 w-4 text-gray-600" />
              <span className="text-xs font-medium text-gray-700">Draft</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{sstStatus.statusCounts.draft}</p>
            <p className="text-xs text-steel-500">Not sent yet</p>
          </div>

          {/* Pending Review */}
          <div
            className="card p-4 border-l-4 border-l-amber-500 cursor-pointer hover:shadow-md"
            onClick={() => {
              setActiveTab('to-confirm');
              setStatusFilter('PENDING_REVIEW');
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <ClockIcon className="h-4 w-4 text-amber-600" />
              <span className="text-xs font-medium text-amber-700">Pending Review</span>
            </div>
            <p className="text-2xl font-bold text-amber-900">{sstStatus.statusCounts.pendingReview}</p>
            <p className="text-xs text-steel-500">Awaiting confirmation</p>
          </div>

          {/* Committed */}
          <div
            className="card p-4 border-l-4 border-l-blue-500 cursor-pointer hover:shadow-md"
            onClick={() => {
              setActiveTab('confirmed');
              setStatusFilter('COMMITTED');
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <DocumentCheckIcon className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-medium text-blue-700">Committed</span>
            </div>
            <p className="text-2xl font-bold text-blue-900">{sstStatus.statusCounts.committed}</p>
            <p className="text-xs text-steel-500">Scheduled</p>
          </div>

          {/* In Progress */}
          <div
            className="card p-4 border-l-4 border-l-green-500 cursor-pointer hover:shadow-md"
            onClick={() => {
              setActiveTab('confirmed');
              setStatusFilter('IN_PROGRESS');
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <TruckIcon className="h-4 w-4 text-green-600" />
              <span className="text-xs font-medium text-green-700">In Progress</span>
            </div>
            <p className="text-2xl font-bold text-green-900">{sstStatus.statusCounts.inProgress}</p>
            <p className="text-xs text-steel-500">At shop</p>
          </div>

          {/* Completed */}
          <div className="card p-4 border-l-4 border-l-emerald-500">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircleIcon className="h-4 w-4 text-emerald-600" />
              <span className="text-xs font-medium text-emerald-700">Completed</span>
            </div>
            <p className="text-2xl font-bold text-emerald-900">{sstStatus.statusCounts.completed}</p>
            <p className="text-xs text-steel-500">Finished</p>
          </div>
        </div>
      )}

      {/* Fleet Coverage Bar */}
      {sstStatus && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-steel-900">Fleet Planning Coverage</h3>
            <span className="text-sm text-steel-600">
              {sstStatus.fleetCoverage.planningRate}% of fleet has a plan
            </span>
          </div>
          <div className="h-6 bg-steel-100 rounded-full overflow-hidden flex">
            <div
              className="bg-green-500 flex items-center justify-center text-xs font-medium text-white"
              style={{ width: `${Math.round((sstStatus.statusCounts.inProgress / sstStatus.fleetCoverage.totalCars) * 100)}%` }}
              title="In Progress"
            />
            <div
              className="bg-blue-500 flex items-center justify-center text-xs font-medium text-white"
              style={{ width: `${Math.round((sstStatus.statusCounts.committed / sstStatus.fleetCoverage.totalCars) * 100)}%` }}
              title="Committed"
            />
            <div
              className="bg-amber-500 flex items-center justify-center text-xs font-medium text-white"
              style={{ width: `${Math.round((sstStatus.statusCounts.pendingReview / sstStatus.fleetCoverage.totalCars) * 100)}%` }}
              title="Pending Review"
            />
            <div
              className="bg-gray-400 flex items-center justify-center text-xs font-medium text-white"
              style={{ width: `${Math.round((sstStatus.statusCounts.draft / sstStatus.fleetCoverage.totalCars) * 100)}%` }}
              title="Draft"
            />
            <div
              className="bg-red-500 flex items-center justify-center text-xs font-medium text-white flex-1"
              title="Not Planned"
            />
          </div>
          <div className="flex gap-4 mt-2 text-xs flex-wrap">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-green-500 rounded-full"></span> In Progress
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-blue-500 rounded-full"></span> Committed
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-amber-500 rounded-full"></span> Pending Review
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-gray-400 rounded-full"></span> Draft
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-red-500 rounded-full"></span> Not Planned
            </span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-steel-200">
        <nav className="flex gap-4">
          <button
            onClick={() => {
              setActiveTab('proposals');
              setStatusFilter('all');
              setCurrentPage(1);
            }}
            className={`py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
              activeTab === 'proposals'
                ? 'border-rail-600 text-rail-600'
                : 'border-transparent text-steel-500 hover:text-steel-700'
            }`}
          >
            Proposals Sent
            {proposalsAwaitingResponse && (
              <span className="ml-2 bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-xs">
                {proposalsAwaitingResponse.length}
              </span>
            )}
          </button>
          <button
            onClick={() => {
              setActiveTab('to-confirm');
              setStatusFilter('all');
              setCurrentPage(1);
            }}
            className={`py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
              activeTab === 'to-confirm'
                ? 'border-rail-600 text-rail-600'
                : 'border-transparent text-steel-500 hover:text-steel-700'
            }`}
          >
            Plans to Confirm
            {plansToConfirm && (
              <span className="ml-2 bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-xs">
                {plansToConfirm.summary.total}
              </span>
            )}
          </button>
          <button
            onClick={() => {
              setActiveTab('confirmed');
              setStatusFilter('all');
              setCurrentPage(1);
            }}
            className={`py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
              activeTab === 'confirmed'
                ? 'border-rail-600 text-rail-600'
                : 'border-transparent text-steel-500 hover:text-steel-700'
            }`}
          >
            Confirmed Plans
            {confirmedPlans && (
              <span className="ml-2 bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs">
                {confirmedPlans.summary.total}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-steel-400" />
          <input
            type="text"
            placeholder="Search by car number, customer, or shop..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10 w-full"
          />
        </div>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as StatusFilter);
            setCurrentPage(1);
          }}
          className="input"
        >
          <option value="all">All Statuses</option>
          {activeTab === 'to-confirm' && (
            <>
              <option value="DRAFT">Draft</option>
              <option value="PENDING_REVIEW">Pending Review</option>
            </>
          )}
          {activeTab === 'confirmed' && (
            <>
              <option value="COMMITTED">Committed</option>
              <option value="IN_PROGRESS">In Progress</option>
            </>
          )}
        </select>

        {/* Team Bucket Filter */}
        <select
          value={teamBucketFilter}
          onChange={(e) => {
            setTeamBucketFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="input"
        >
          <option value="all">All Teams</option>
          <option value="Qualification">Qualification</option>
          <option value="Assignment">Assignment</option>
          <option value="In-Service Repairs">In-Service Repairs</option>
          <option value="Other">Other</option>
        </select>
      </div>

      {/* Plans Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rail-600 mx-auto"></div>
              <p className="mt-3 text-sm text-steel-500">Loading plans...</p>
            </div>
          </div>
        ) : activeTab === 'proposals' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-steel-50 border-b border-steel-200">
                <tr>
                  <th className="text-left py-3 px-4 text-xs font-medium text-steel-500 uppercase">Plan Name</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-steel-500 uppercase">Customer</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-steel-500 uppercase">Cars</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-steel-500 uppercase">Options</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-steel-500 uppercase">Sent</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-steel-500 uppercase">Days Waiting</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-steel-500 uppercase">Status</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-steel-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {filteredProposals.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-steel-500">
                      No proposals awaiting customer response
                    </td>
                  </tr>
                ) : (
                  filteredProposals.map((proposal) => {
                    const daysSinceSent = getDaysSinceSent(proposal.lastSentAt || proposal.proposedAt);
                    return (
                      <tr key={proposal.id} className="hover:bg-steel-50">
                        <td className="py-3 px-4">
                          <div className="font-medium text-steel-900">{proposal.name}</div>
                          {proposal.description && (
                            <div className="text-xs text-steel-500 truncate max-w-[200px]">{proposal.description}</div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-steel-900">{proposal.customer?.name || '-'}</div>
                          <div className="text-xs text-steel-500">{proposal.customer?.code || ''}</div>
                        </td>
                        <td className="py-3 px-4 text-steel-700">{proposal.selectedCarCount}</td>
                        <td className="py-3 px-4 text-steel-700">{proposal.options?.length || 0}</td>
                        <td className="py-3 px-4 text-steel-700">
                          {proposal.lastSentAt || proposal.proposedAt
                            ? new Date(proposal.lastSentAt || proposal.proposedAt!).toLocaleDateString()
                            : '-'}
                        </td>
                        <td className={`py-3 px-4 text-right ${daysSinceSent > 7 ? 'text-red-600 font-medium' : daysSinceSent > 3 ? 'text-amber-600' : 'text-steel-600'}`}>
                          {daysSinceSent}
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium border bg-purple-100 text-purple-700 border-purple-300">
                            Awaiting Response
                          </span>
                          {proposal.revisionCount && proposal.revisionCount > 0 && (
                            <span className="ml-1 text-xs text-steel-500">
                              (Rev {proposal.revisionCount})
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex gap-2">
                            <button
                              onClick={() => navigate(`/service-plans/${proposal.id}`)}
                              className="text-rail-600 hover:text-rail-800 text-sm font-medium"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => navigate(`/service-plans/${proposal.id}?tab=feedback`)}
                              className="text-green-600 hover:text-green-800 text-sm font-medium"
                            >
                              Record Feedback
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : activeTab === 'to-confirm' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-steel-50 border-b border-steel-200">
                <tr>
                  <th className="text-left py-3 px-4 text-xs font-medium text-steel-500 uppercase">Railcar #</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-steel-500 uppercase">Customer</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-steel-500 uppercase">Shop</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-steel-500 uppercase">Scheduled</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-steel-500 uppercase">Status</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-steel-500 uppercase">Team</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-steel-500 uppercase">Urgency</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-steel-500 uppercase">Days Until</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-steel-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {filteredPlansToConfirm.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-steel-500">
                      No plans awaiting confirmation
                    </td>
                  </tr>
                ) : (
                  filteredPlansToConfirm.map((plan) => (
                    <tr key={plan.id} className="hover:bg-steel-50">
                      <td className="py-3 px-4 font-medium text-steel-900">{plan.railcarNumber}</td>
                      <td className="py-3 px-4 text-steel-700">{plan.customer || '-'}</td>
                      <td className="py-3 px-4">
                        <div>
                          <span className="text-steel-900">{plan.shopName}</span>
                          {plan.isAitxInternal && (
                            <span className="ml-1 text-xs bg-indigo-100 text-indigo-700 px-1 rounded">AITX</span>
                          )}
                        </div>
                        <span className="text-xs text-steel-500">{plan.shopRegion}</span>
                      </td>
                      <td className="py-3 px-4 text-steel-700">{plan.scheduledMonth}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusBadge(plan.status)}`}>
                          {plan.statusLabel}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-steel-700">{plan.teamBucket}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getUrgencyBadge(plan.urgency)}`}>
                          {plan.urgency}
                        </span>
                      </td>
                      <td className={`py-3 px-4 text-right ${plan.daysUntilScheduled < 0 ? 'text-red-600 font-medium' : plan.daysUntilScheduled < 30 ? 'text-amber-600' : 'text-steel-600'}`}>
                        {plan.daysUntilScheduled}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => navigate(`/service-plan-confirmation/${plan.id}`)}
                          className="text-rail-600 hover:text-rail-800 text-sm font-medium"
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-steel-50 border-b border-steel-200">
                <tr>
                  <th className="text-left py-3 px-4 text-xs font-medium text-steel-500 uppercase">Railcar #</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-steel-500 uppercase">Customer</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-steel-500 uppercase">Shop</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-steel-500 uppercase">Scheduled</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-steel-500 uppercase">Status</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-steel-500 uppercase">Team</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-steel-500 uppercase">Days in Shop</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-steel-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {filteredConfirmedPlans.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-steel-500">
                      No confirmed plans
                    </td>
                  </tr>
                ) : (
                  filteredConfirmedPlans.map((plan) => (
                    <tr key={plan.id} className="hover:bg-steel-50">
                      <td className="py-3 px-4 font-medium text-steel-900">{plan.railcarNumber}</td>
                      <td className="py-3 px-4 text-steel-700">{plan.customer || '-'}</td>
                      <td className="py-3 px-4">
                        <div>
                          <span className="text-steel-900">{plan.shopName}</span>
                          {plan.isAitxInternal && (
                            <span className="ml-1 text-xs bg-indigo-100 text-indigo-700 px-1 rounded">AITX</span>
                          )}
                        </div>
                        <span className="text-xs text-steel-500">{plan.shopRegion}</span>
                      </td>
                      <td className="py-3 px-4 text-steel-700">{plan.scheduledMonth}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusBadge(plan.status)}`}>
                          {plan.statusLabel}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-steel-700">{plan.teamBucket}</td>
                      <td className={`py-3 px-4 text-right ${plan.daysInProgress > 14 ? 'text-red-600 font-medium' : plan.daysInProgress > 7 ? 'text-amber-600' : 'text-steel-600'}`}>
                        {plan.status === 'IN_PROGRESS' ? plan.daysInProgress : '-'}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => navigate(`/cars?search=${encodeURIComponent(plan.railcarNumber)}`)}
                          className="text-rail-600 hover:text-rail-800 text-sm font-medium"
                        >
                          View Car
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {((activeTab === 'to-confirm' && plansToConfirm?.pagination) ||
          (activeTab === 'confirmed' && confirmedPlans?.pagination)) && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-steel-200">
            <div className="text-sm text-steel-500">
              Showing{' '}
              {activeTab === 'to-confirm'
                ? `${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, plansToConfirm?.pagination.totalItems || 0)}`
                : `${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, confirmedPlans?.pagination.totalItems || 0)}`}{' '}
              of{' '}
              {activeTab === 'to-confirm'
                ? plansToConfirm?.pagination.totalItems
                : confirmedPlans?.pagination.totalItems}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="btn-secondary text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage((p) => p + 1)}
                disabled={
                  activeTab === 'to-confirm'
                    ? currentPage >= (plansToConfirm?.pagination.totalPages || 1)
                    : currentPage >= (confirmedPlans?.pagination.totalPages || 1)
                }
                className="btn-secondary text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
