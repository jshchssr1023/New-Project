import { DocumentPlusIcon, CalendarDaysIcon } from '@heroicons/react/24/outline';
import type { Car } from '../../types';

interface ServicePlanOption {
  id: string;
  name: string;
  customerName?: string;
}

interface BulkActionsBarProps {
  selectedCount: number;
  onExportSelected: () => void;
  onBulkStatusUpdate: (status: Car['status']) => void;
  onBulkDelete: () => void;
  onClearSelection: () => void;
  onUseInCarFlow: () => void;
  servicePlans?: ServicePlanOption[];
  onAddToServicePlan?: (servicePlanId: string) => void;
  isExporting?: boolean;
}

export default function BulkActionsBar({
  selectedCount,
  onExportSelected,
  onBulkStatusUpdate,
  onBulkDelete,
  onClearSelection,
  onUseInCarFlow,
  servicePlans = [],
  onAddToServicePlan,
  isExporting = false,
}: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center space-x-3 bg-rail-50 px-4 py-2 rounded-lg border border-rail-200">
      <span className="text-sm font-medium text-rail-700">{selectedCount} selected</span>
      <div className="h-4 w-px bg-rail-300" />

      {/* Primary Action: Plan Selected Cars */}
      <button
        onClick={onUseInCarFlow}
        className="flex items-center text-sm text-white font-medium bg-rail-600 hover:bg-rail-700 px-3 py-1.5 rounded shadow-sm"
      >
        <CalendarDaysIcon className="h-4 w-4 mr-1.5" />
        Plan Selected Cars
      </button>

      <div className="h-4 w-px bg-rail-300" />

      {/* Add to Service Plan Dropdown */}
      <div className="flex items-center">
        <DocumentPlusIcon className="h-4 w-4 mr-1 text-rail-600" />
        <select
          onChange={(e) => {
            if (e.target.value && onAddToServicePlan) {
              onAddToServicePlan(e.target.value);
              e.target.value = '';
            }
          }}
          className="input w-48 text-sm py-1"
          defaultValue=""
        >
          <option value="">Add to Service Plan...</option>
          {servicePlans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name} {plan.customerName ? `(${plan.customerName})` : ''}
            </option>
          ))}
          {servicePlans.length === 0 && (
            <option value="" disabled>No service plans available</option>
          )}
        </select>
      </div>

      <div className="h-4 w-px bg-rail-300" />

      {/* Export */}
      <button
        onClick={onExportSelected}
        disabled={isExporting}
        className="text-sm text-rail-600 hover:text-rail-800 font-medium"
      >
        {isExporting ? 'Exporting...' : 'Export Selected'}
      </button>

      <div className="h-4 w-px bg-rail-300" />

      {/* Status Update */}
      <select
        onChange={(e) => onBulkStatusUpdate(e.target.value as Car['status'])}
        className="input w-36 text-sm py-1"
        defaultValue=""
      >
        <option value="" disabled>Set Status...</option>
        <option value="available">Available</option>
        <option value="in_service">In Service</option>
        <option value="scheduled">Scheduled</option>
        <option value="retired">Retired</option>
      </select>

      {/* Delete */}
      <button
        onClick={onBulkDelete}
        className="text-sm text-red-600 hover:text-red-800 font-medium"
      >
        Delete
      </button>

      {/* Clear */}
      <button
        onClick={onClearSelection}
        className="text-sm text-steel-500 hover:text-steel-700"
      >
        Clear
      </button>
    </div>
  );
}
