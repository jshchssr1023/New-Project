/**
 * WorkflowProgressTracker Component
 *
 * Visual representation of the 5-phase workflow:
 * Plan → Communicate → Schedule → Execute → Close Out
 *
 * Shows counts at each stage and allows clicking to filter/navigate.
 */

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardDocumentListIcon,
  EnvelopeIcon,
  CalendarDaysIcon,
  WrenchScrewdriverIcon,
  CheckCircleIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';

export interface WorkflowCounts {
  plan: number;
  communicate: number;
  schedule: number;
  execute: number;
  closeOut: number;
}

interface WorkflowStage {
  id: keyof WorkflowCounts;
  label: string;
  shortLabel: string;
  description: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  color: string;
  bgColor: string;
  borderColor: string;
  route: string;
}

const WORKFLOW_STAGES: WorkflowStage[] = [
  {
    id: 'plan',
    label: 'Plan',
    shortLabel: 'Plan',
    description: 'Draft scenarios being created',
    icon: ClipboardDocumentListIcon,
    color: 'text-indigo-700',
    bgColor: 'bg-indigo-100',
    borderColor: 'border-indigo-300',
    route: '/scenarios',
  },
  {
    id: 'communicate',
    label: 'Communicate',
    shortLabel: 'Comm.',
    description: 'Proposals sent to customers',
    icon: EnvelopeIcon,
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    borderColor: 'border-blue-300',
    route: '/scenarios?status=sent',
  },
  {
    id: 'schedule',
    label: 'Schedule',
    shortLabel: 'Sched.',
    description: 'Approved and ready to schedule',
    icon: CalendarDaysIcon,
    color: 'text-amber-700',
    bgColor: 'bg-amber-100',
    borderColor: 'border-amber-300',
    route: '/scheduling-queue',
  },
  {
    id: 'execute',
    label: 'Execute',
    shortLabel: 'Exec.',
    description: 'Cars currently in shop',
    icon: WrenchScrewdriverIcon,
    color: 'text-purple-700',
    bgColor: 'bg-purple-100',
    borderColor: 'border-purple-300',
    route: '/cars?status=in_shop',
  },
  {
    id: 'closeOut',
    label: 'Close Out',
    shortLabel: 'Close',
    description: 'Completed this month',
    icon: CheckCircleIcon,
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    borderColor: 'border-green-300',
    route: '/cars?status=completed',
  },
];

interface WorkflowProgressTrackerProps {
  counts: WorkflowCounts;
  compact?: boolean;
  onStageClick?: (stage: keyof WorkflowCounts) => void;
}

export default function WorkflowProgressTracker({
  counts,
  compact = false,
  onStageClick,
}: WorkflowProgressTrackerProps) {
  const navigate = useNavigate();

  const totalItems = useMemo(() => {
    return Object.values(counts).reduce((sum, count) => sum + count, 0);
  }, [counts]);

  const handleStageClick = (stage: WorkflowStage) => {
    if (onStageClick) {
      onStageClick(stage.id);
    } else {
      navigate(stage.route);
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-1 overflow-x-auto">
        {WORKFLOW_STAGES.map((stage, index) => (
          <div key={stage.id} className="flex items-center">
            <button
              onClick={() => handleStageClick(stage)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-all hover:shadow-sm ${stage.bgColor} ${stage.borderColor} ${stage.color}`}
              title={`${stage.label}: ${counts[stage.id]} items - ${stage.description}`}
            >
              <stage.icon className="h-4 w-4" />
              <span className="text-xs font-semibold">{counts[stage.id]}</span>
            </button>
            {index < WORKFLOW_STAGES.length - 1 && (
              <ChevronRightIcon className="h-3 w-3 text-steel-400 mx-0.5 flex-shrink-0" />
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-steel-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-steel-900">Workflow Progress</h3>
          <p className="text-xs text-steel-500 mt-0.5">
            {totalItems} items across all stages
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="relative h-2 bg-steel-100 rounded-full mb-4 overflow-hidden">
        <div className="absolute inset-0 flex">
          {WORKFLOW_STAGES.map((stage) => {
            const percentage = totalItems > 0 ? (counts[stage.id] / totalItems) * 100 : 0;
            return (
              <div
                key={stage.id}
                className={`h-full ${stage.bgColor.replace('100', '500')}`}
                style={{ width: `${percentage}%` }}
              />
            );
          })}
        </div>
      </div>

      {/* Stage Cards */}
      <div className="grid grid-cols-5 gap-2">
        {WORKFLOW_STAGES.map((stage, index) => (
          <div key={stage.id} className="relative">
            {/* Connector Arrow */}
            {index < WORKFLOW_STAGES.length - 1 && (
              <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10">
                <ChevronRightIcon className="h-4 w-4 text-steel-300" />
              </div>
            )}

            <button
              onClick={() => handleStageClick(stage)}
              className={`w-full p-3 rounded-lg border-2 transition-all hover:shadow-md hover:scale-[1.02] ${stage.bgColor} ${stage.borderColor}`}
            >
              <div className="flex flex-col items-center text-center">
                <stage.icon className={`h-6 w-6 ${stage.color} mb-1`} />
                <span className={`text-2xl font-bold ${stage.color}`}>
                  {counts[stage.id]}
                </span>
                <span className={`text-xs font-medium ${stage.color}`}>
                  {stage.shortLabel}
                </span>
              </div>
            </button>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-3 border-t border-steel-100">
        <div className="grid grid-cols-5 gap-2 text-xs text-steel-500">
          {WORKFLOW_STAGES.map((stage) => (
            <div key={stage.id} className="text-center">
              {stage.description}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
