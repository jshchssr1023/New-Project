/**
 * ServicePlanConfirmation.tsx - Service Plan Confirmation Workflow Page
 *
 * Main page for the Service Plan confirmation workflow implementing:
 * - Story 1: View and manage service plans for customers
 * - Story 2: Car-level planning with assignments
 * - Story 3: Car Matrix as confirmation authority
 * - Story 4: Secondary confirmation for deletions
 * - Story 5: Final plan confirmation
 * - Story 6: Confirmation summary
 * - Story 8: Visibility and reporting
 * - Story 9: Audit history
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  DocumentTextIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';

import CarMatrix from '../components/serviceplan/CarMatrix';
import ConfirmationSummaryModal from '../components/serviceplan/ConfirmationSummaryModal';
import FinalConfirmationModal from '../components/serviceplan/FinalConfirmationModal';
import {
  servicePlansApi,
  CarMatrixData,
  ConfirmationSummary,
  FinalConfirmationResult,
  AuditEvent,
} from '../services/api/servicePlans';

// Tab types
type TabType = 'car-matrix' | 'audit';

export default function ServicePlanConfirmation() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // State
  const [carMatrixData, setCarMatrixData] = useState<CarMatrixData | null>(null);
  const [confirmationSummary, setConfirmationSummary] = useState<ConfirmationSummary | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('car-matrix');

  // Modal state
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [showFinalConfirmModal, setShowFinalConfirmModal] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<FinalConfirmationResult | null>(null);

  // Load car matrix data
  const loadCarMatrix = useCallback(async () => {
    if (!id) return;

    try {
      setError(null);
      const data = await servicePlansApi.getCarMatrix(id);
      setCarMatrixData(data);
    } catch (err: any) {
      console.error('Failed to load car matrix:', err);
      setError(err.response?.data?.message || 'Failed to load service plan');
    }
  }, [id]);

  // Load confirmation summary
  const loadConfirmationSummary = useCallback(async () => {
    if (!id) return;

    try {
      const summary = await servicePlansApi.getConfirmationSummary(id);
      setConfirmationSummary(summary);
    } catch (err: any) {
      console.error('Failed to load confirmation summary:', err);
    }
  }, [id]);

  // Load audit events
  const loadAuditEvents = useCallback(async () => {
    if (!id) return;

    try {
      const events = await servicePlansApi.getAuditHistory(id, { limit: 50 });
      setAuditEvents(events);
    } catch (err: any) {
      console.error('Failed to load audit events:', err);
    }
  }, [id]);

  // Initial load
  useEffect(() => {
    const loadAll = async () => {
      setIsLoading(true);
      await loadCarMatrix();
      await loadConfirmationSummary();
      setIsLoading(false);
    };
    loadAll();
  }, [loadCarMatrix, loadConfirmationSummary]);

  // Load audit events when tab changes
  useEffect(() => {
    if (activeTab === 'audit') {
      loadAuditEvents();
    }
  }, [activeTab, loadAuditEvents]);

  // Refresh data after changes
  const handleDataChange = useCallback(async () => {
    await loadCarMatrix();
    await loadConfirmationSummary();
  }, [loadCarMatrix, loadConfirmationSummary]);

  // Show confirmation summary modal
  const handleShowConfirmationSummary = () => {
    setShowSummaryModal(true);
  };

  // Open final confirmation modal
  const handleOpenFinalConfirm = () => {
    setShowSummaryModal(false);
    setShowFinalConfirmModal(true);
  };

  // Handle final confirmation complete
  const handleConfirmationComplete = (result: FinalConfirmationResult) => {
    setConfirmationResult(result);
    setShowFinalConfirmModal(false);
    handleDataChange();
  };

  // Render plan status badge
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-steel-100 text-steel-600">
            <DocumentTextIcon className="w-3 h-3" />
            Draft
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
            <ClockIcon className="w-3 h-3" />
            Pending
          </span>
        );
      case 'final_confirmed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">
            <CheckCircleIcon className="w-3 h-3" />
            Final Confirmed
          </span>
        );
      case 'scheduled':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
            <CheckCircleSolidIcon className="w-3 h-3" />
            Scheduled
          </span>
        );
      case 'archived':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-steel-200 text-steel-500">
            Archived
          </span>
        );
      default:
        return null;
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  // Render event type badge
  const renderEventTypeBadge = (eventType: string) => {
    const typeConfig: Record<string, { color: string; label: string }> = {
      car_added: { color: 'bg-blue-100 text-blue-700', label: 'Car Added' },
      car_updated: { color: 'bg-amber-100 text-amber-700', label: 'Car Updated' },
      car_confirmed: { color: 'bg-green-100 text-green-700', label: 'Car Confirmed' },
      car_deleted: { color: 'bg-red-100 text-red-700', label: 'Car Deleted' },
      plan_created: { color: 'bg-blue-100 text-blue-700', label: 'Plan Created' },
      plan_updated: { color: 'bg-amber-100 text-amber-700', label: 'Plan Updated' },
      plan_final_confirmed: { color: 'bg-green-100 text-green-700', label: 'Final Confirmed' },
      plan_scheduled: { color: 'bg-green-100 text-green-700', label: 'Scheduled' },
      plan_archived: { color: 'bg-steel-200 text-steel-600', label: 'Archived' },
    };

    const config = typeConfig[eventType] || { color: 'bg-steel-100 text-steel-600', label: eventType };

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${config.color}`}>
        {config.label}
      </span>
    );
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-steel-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rail-600 mx-auto"></div>
          <p className="mt-4 text-steel-600">Loading service plan...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !carMatrixData) {
    return (
      <div className="min-h-screen bg-steel-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <ExclamationTriangleIcon className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-steel-800 mb-2">Failed to Load Plan</h2>
          <p className="text-steel-600 mb-4">{error || 'Service plan not found'}</p>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-rail-600 text-white rounded-md hover:bg-rail-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Success state after final confirmation
  if (confirmationResult) {
    return (
      <div className="min-h-screen bg-steel-50 flex items-center justify-center">
        <div className="text-center max-w-lg bg-white rounded-lg shadow-lg p-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircleSolidIcon className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-steel-800 mb-2">Plan Successfully Confirmed!</h2>
          <p className="text-steel-600 mb-6">
            {confirmationResult.scheduledCars} car
            {confirmationResult.scheduledCars !== 1 ? 's have' : ' has'} been sent to the Master
            Schedule.
          </p>
          <div className="bg-steel-50 rounded-lg p-4 mb-6 text-left">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-steel-500">Cars Scheduled:</span>
                <p className="font-semibold text-green-600">{confirmationResult.scheduledCars}</p>
              </div>
              <div>
                <span className="text-steel-500">Draft Plans Archived:</span>
                <p className="font-semibold text-steel-700">
                  {confirmationResult.archivedDraftPlans}
                </p>
              </div>
            </div>
          </div>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => navigate('/service-plans')}
              className="px-4 py-2 border border-steel-300 rounded-md hover:bg-steel-50"
            >
              View All Plans
            </button>
            <button
              onClick={() => {
                setConfirmationResult(null);
                handleDataChange();
              }}
              className="px-4 py-2 bg-rail-600 text-white rounded-md hover:bg-rail-700"
            >
              View This Plan
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-steel-50">
      {/* Header */}
      <div className="bg-white border-b border-steel-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(-1)}
                className="p-2 hover:bg-steel-100 rounded-full text-steel-500"
              >
                <ArrowLeftIcon className="w-5 h-5" />
              </button>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-bold text-steel-800">{carMatrixData.planName}</h1>
                  {renderStatusBadge(carMatrixData.planStatus)}
                </div>
                <p className="text-sm text-steel-500 mt-0.5">
                  {carMatrixData.customer.name}{' '}
                  <span className="text-steel-400">({carMatrixData.customer.code})</span>
                  <span className="mx-2">•</span>
                  Version {carMatrixData.planVersion}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-steel-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('car-matrix')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'car-matrix'
                  ? 'border-rail-600 text-rail-600'
                  : 'border-transparent text-steel-500 hover:text-steel-700'
              }`}
            >
              <span className="flex items-center gap-2">
                <ChartBarIcon className="w-4 h-4" />
                Car Matrix
              </span>
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'audit'
                  ? 'border-rail-600 text-rail-600'
                  : 'border-transparent text-steel-500 hover:text-steel-700'
              }`}
            >
              <span className="flex items-center gap-2">
                <ClockIcon className="w-4 h-4" />
                Audit History
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'car-matrix' && (
          <CarMatrix
            servicePlanId={id!}
            carMatrixData={carMatrixData}
            onDataChange={handleDataChange}
            onShowConfirmationSummary={handleShowConfirmationSummary}
            onFinalConfirm={handleOpenFinalConfirm}
          />
        )}

        {activeTab === 'audit' && (
          <div className="bg-white rounded-lg shadow-sm border border-steel-200">
            <div className="px-4 py-3 border-b border-steel-200 bg-steel-50">
              <h2 className="text-lg font-semibold text-steel-800">Audit History</h2>
              <p className="text-sm text-steel-500 mt-0.5">
                Complete history of all planning and confirmation actions
              </p>
            </div>
            <div className="divide-y divide-steel-100">
              {auditEvents.length === 0 ? (
                <div className="text-center py-12 text-steel-500">No audit events yet</div>
              ) : (
                auditEvents.map((event) => (
                  <div key={event.id} className="px-4 py-3 hover:bg-steel-50">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">{renderEventTypeBadge(event.eventType)}</div>
                        <div>
                          {event.railcarNumber && (
                            <p className="font-mono text-sm text-steel-800">{event.railcarNumber}</p>
                          )}
                          <p className="text-sm text-steel-600 mt-0.5">
                            {event.performedByName || 'System'}
                          </p>
                          {event.eventDetails && event.eventDetails !== '{}' && (
                            <pre className="text-xs text-steel-400 mt-1 overflow-x-auto max-w-md">
                              {JSON.stringify(JSON.parse(event.eventDetails), null, 2)}
                            </pre>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-steel-400">{formatDate(event.performedAt)}</p>
                        <p className="text-xs text-steel-400 mt-0.5">v{event.planVersion}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Summary Modal */}
      <ConfirmationSummaryModal
        isOpen={showSummaryModal}
        onClose={() => setShowSummaryModal(false)}
        summary={confirmationSummary}
        onProceedToFinalConfirm={handleOpenFinalConfirm}
        canFinalConfirm={carMatrixData.canFinalConfirm}
      />

      {/* Final Confirmation Modal */}
      <FinalConfirmationModal
        isOpen={showFinalConfirmModal}
        onClose={() => setShowFinalConfirmModal(false)}
        servicePlanId={id!}
        summary={confirmationSummary}
        onConfirmationComplete={handleConfirmationComplete}
      />
    </div>
  );
}
