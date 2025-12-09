import {
  CalendarDaysIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  DocumentChartBarIcon,
} from '@heroicons/react/24/outline';
import type { MasterPlan, MasterPlanSummary } from '../../types';

interface MasterPlanSummaryCardProps {
  masterPlan: MasterPlan;
  summary?: MasterPlanSummary | null;
  onViewPlan: () => void;
}

export default function MasterPlanSummaryCard({ masterPlan, summary, onViewPlan }: MasterPlanSummaryCardProps) {
  return (
    <div className="card p-4 border-l-4 border-l-rail-500">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="bg-rail-100 rounded-lg p-2">
            <CalendarDaysIcon className="h-5 w-5 text-rail-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-steel-900">Active Master Plan</h3>
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
                Active
              </span>
            </div>
            <p className="text-sm text-steel-600 mt-0.5">{masterPlan.planName}</p>
            <p className="text-xs text-steel-500 mt-1">
              FY{masterPlan.fiscalYear} v{masterPlan.version} |{' '}
              {masterPlan.commitments?.length || summary?.totalCommitments || 0} commitments
            </p>
          </div>
        </div>
        <button
          onClick={onViewPlan}
          className="flex items-center gap-1 text-sm font-medium text-rail-600 hover:text-rail-800"
        >
          View Plan
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Quick Stats Row */}
      {summary && (
        <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-steel-100">
          <div className="flex items-center gap-2">
            <DocumentChartBarIcon className="h-4 w-4 text-steel-400" />
            <span className="text-sm text-steel-600">
              <strong className="text-steel-900">{Object.keys(summary.commitmentsByShop || {}).length}</strong> shops
            </span>
          </div>
          <div className="flex items-center gap-2">
            <CalendarDaysIcon className="h-4 w-4 text-steel-400" />
            <span className="text-sm text-steel-600">
              <strong className="text-steel-900">{Object.keys(summary.commitmentsByMonth || {}).length}</strong> months
            </span>
          </div>
          {summary.commitmentsByStatus?.released !== undefined && (
            <div className="flex items-center gap-2">
              <CheckCircleIcon className="h-4 w-4 text-green-500" />
              <span className="text-sm text-steel-600">
                <strong className="text-green-600">{summary.commitmentsByStatus.released || 0}</strong> released
              </span>
            </div>
          )}
          {summary.commitmentsByStatus?.in_progress !== undefined && (
            <div className="flex items-center gap-2">
              <ArrowPathIcon className="h-4 w-4 text-purple-500" />
              <span className="text-sm text-steel-600">
                <strong className="text-purple-600">{summary.commitmentsByStatus.in_progress || 0}</strong> in progress
              </span>
            </div>
          )}
          {summary.totalEstimatedCost > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-sm text-steel-500">
                Est. Cost: <strong className="text-steel-900">${(summary.totalEstimatedCost / 1000).toFixed(0)}K</strong>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function NoMasterPlanBanner({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="card p-4 bg-steel-50 border-dashed border-2 border-steel-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CalendarDaysIcon className="h-5 w-5 text-steel-400" />
          <div>
            <p className="text-sm font-medium text-steel-700">No Active Master Plan</p>
            <p className="text-xs text-steel-500">Create one by approving a scenario in Car Flow Planning</p>
          </div>
        </div>
        <button onClick={onNavigate} className="btn-secondary text-sm">
          Go to Car Flow
        </button>
      </div>
    </div>
  );
}
