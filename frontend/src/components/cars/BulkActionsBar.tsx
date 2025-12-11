import { BeakerIcon, ArrowsRightLeftIcon, CalendarDaysIcon } from '@heroicons/react/24/outline';
import type { Car } from '../../types';

interface BulkActionsBarProps {
  selectedCount: number;
  onExportSelected: () => void;
  onBulkStatusUpdate: (status: Car['status']) => void;
  onBulkDelete: () => void;
  onClearSelection: () => void;
  onUseInScenario: () => void;
  onUseInCarFlow: () => void;
  isExporting?: boolean;
}

export default function BulkActionsBar({
  selectedCount,
  onExportSelected,
  onBulkStatusUpdate,
  onBulkDelete,
  onClearSelection,
  onUseInScenario,
  onUseInCarFlow,
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

      {/* Secondary: Use in Scenario */}
      <button
        onClick={onUseInScenario}
        className="flex items-center text-sm text-rail-600 hover:text-rail-800 font-medium bg-white px-2 py-1 rounded border border-rail-300 hover:bg-rail-100"
      >
        <BeakerIcon className="h-4 w-4 mr-1" />
        Create Scenario
      </button>

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
