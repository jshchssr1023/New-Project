/**
 * ScenarioDrawer - Drawer component for managing scenarios
 *
 * Displays a list of scenarios with filtering, sorting, and actions.
 * Allows creating new scenarios and viewing/editing existing ones.
 */

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PlusIcon,
  FunnelIcon,
  BeakerIcon,
  CheckCircleIcon,
  ArchiveBoxIcon,
  DocumentDuplicateIcon,
  TrashIcon,
  PencilIcon,
  ChevronRightIcon,
  UserCircleIcon,
  CalendarDaysIcon,
  TruckIcon,
} from '@heroicons/react/24/outline';
import Drawer from '../ui/Drawer';
import { scenarioApi } from '../../services/carFlowApi';
import type { Scenario, ScenarioStatus } from '../../types/carFlow';

interface ScenarioDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectScenario: (scenario: Scenario) => void;
  onCreateScenario: () => void;
  selectedScenarioId?: string | null;
}

const statusConfig: Record<ScenarioStatus, { label: string; color: string; icon: typeof BeakerIcon }> = {
  draft: {
    label: 'Draft',
    color: 'bg-amber-100 text-amber-800 border-amber-300',
    icon: BeakerIcon,
  },
  confirmed: {
    label: 'Confirmed',
    color: 'bg-green-100 text-green-800 border-green-300',
    icon: CheckCircleIcon,
  },
  archived: {
    label: 'Archived',
    color: 'bg-gray-100 text-gray-600 border-gray-300',
    icon: ArchiveBoxIcon,
  },
};

export default function ScenarioDrawer({
  isOpen,
  onClose,
  onSelectScenario,
  onCreateScenario,
  selectedScenarioId,
}: ScenarioDrawerProps) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<ScenarioStatus | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch scenarios
  const { data: scenarios = [], isLoading } = useQuery({
    queryKey: ['scenarios', statusFilter === 'all' ? undefined : statusFilter],
    queryFn: () => scenarioApi.list(statusFilter === 'all' ? undefined : statusFilter),
    enabled: isOpen,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => scenarioApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
    },
  });

  // Filter scenarios by search term
  const filteredScenarios = useMemo(() => {
    if (!searchTerm) return scenarios;
    const search = searchTerm.toLowerCase();
    return scenarios.filter(
      (s) =>
        s.name.toLowerCase().includes(search) ||
        s.projectNumber?.toLowerCase().includes(search) ||
        s.customers?.some((c) => c.customer.name.toLowerCase().includes(search))
    );
  }, [scenarios, searchTerm]);

  // Group by status
  const groupedScenarios = useMemo(() => {
    const groups: Record<ScenarioStatus, Scenario[]> = {
      draft: [],
      confirmed: [],
      archived: [],
    };
    filteredScenarios.forEach((s) => {
      groups[s.status].push(s);
    });
    return groups;
  }, [filteredScenarios]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this scenario?')) {
      await deleteMutation.mutateAsync(id);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Scenarios"
      subtitle="Manage planning scenarios"
      width="lg"
      position="right"
      footer={
        <button
          onClick={onCreateScenario}
          className="w-full btn-primary flex items-center justify-center"
        >
          <PlusIcon className="h-4 w-4 mr-2" />
          Create New Scenario
        </button>
      }
    >
      <div className="p-4 space-y-4">
        {/* Search and Filter */}
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Search scenarios..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input w-full"
          />
          <div className="flex items-center gap-2">
            <FunnelIcon className="h-4 w-4 text-steel-400" />
            <div className="flex gap-1">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-2 py-1 text-xs rounded ${
                  statusFilter === 'all'
                    ? 'bg-steel-200 text-steel-900'
                    : 'text-steel-600 hover:bg-steel-100'
                }`}
              >
                All
              </button>
              {(['draft', 'confirmed', 'archived'] as ScenarioStatus[]).map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-2 py-1 text-xs rounded ${
                    statusFilter === status
                      ? 'bg-steel-200 text-steel-900'
                      : 'text-steel-600 hover:bg-steel-100'
                  }`}
                >
                  {statusConfig[status].label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="py-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rail-600 mx-auto"></div>
            <p className="mt-2 text-sm text-steel-500">Loading scenarios...</p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && filteredScenarios.length === 0 && (
          <div className="py-8 text-center">
            <BeakerIcon className="h-12 w-12 text-steel-300 mx-auto mb-3" />
            <p className="text-steel-600 font-medium">No scenarios found</p>
            <p className="text-sm text-steel-500 mt-1">
              {searchTerm
                ? 'Try adjusting your search'
                : 'Create a new scenario to get started'}
            </p>
          </div>
        )}

        {/* Scenario List */}
        {!isLoading && filteredScenarios.length > 0 && (
          <div className="space-y-6">
            {/* Draft Scenarios */}
            {groupedScenarios.draft.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-steel-500 uppercase tracking-wide mb-2">
                  Draft ({groupedScenarios.draft.length})
                </h3>
                <div className="space-y-2">
                  {groupedScenarios.draft.map((scenario) => (
                    <ScenarioCard
                      key={scenario.id}
                      scenario={scenario}
                      isSelected={selectedScenarioId === scenario.id}
                      onClick={() => onSelectScenario(scenario)}
                      onDelete={(e) => handleDelete(scenario.id, e)}
                      formatDate={formatDate}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Confirmed Scenarios */}
            {groupedScenarios.confirmed.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-steel-500 uppercase tracking-wide mb-2">
                  Confirmed ({groupedScenarios.confirmed.length})
                </h3>
                <div className="space-y-2">
                  {groupedScenarios.confirmed.map((scenario) => (
                    <ScenarioCard
                      key={scenario.id}
                      scenario={scenario}
                      isSelected={selectedScenarioId === scenario.id}
                      onClick={() => onSelectScenario(scenario)}
                      onDelete={(e) => handleDelete(scenario.id, e)}
                      formatDate={formatDate}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Archived Scenarios */}
            {groupedScenarios.archived.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-steel-500 uppercase tracking-wide mb-2">
                  Archived ({groupedScenarios.archived.length})
                </h3>
                <div className="space-y-2">
                  {groupedScenarios.archived.map((scenario) => (
                    <ScenarioCard
                      key={scenario.id}
                      scenario={scenario}
                      isSelected={selectedScenarioId === scenario.id}
                      onClick={() => onSelectScenario(scenario)}
                      onDelete={(e) => handleDelete(scenario.id, e)}
                      formatDate={formatDate}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}

// Individual Scenario Card
interface ScenarioCardProps {
  scenario: Scenario;
  isSelected: boolean;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
  formatDate: (date: string) => string;
}

function ScenarioCard({
  scenario,
  isSelected,
  onClick,
  onDelete,
  formatDate,
}: ScenarioCardProps) {
  const config = statusConfig[scenario.status];
  const StatusIcon = config.icon;
  const carCount = scenario._count?.cars || scenario.cars?.length || 0;
  const customerNames =
    scenario.customers?.map((c) => c.customer.name).join(', ') || 'No customers';

  return (
    <div
      onClick={onClick}
      className={`relative p-3 rounded-lg border cursor-pointer transition-all ${
        isSelected
          ? 'border-rail-500 bg-rail-50 ring-1 ring-rail-500'
          : 'border-steel-200 hover:border-steel-300 hover:bg-steel-50'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {/* Title Row */}
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded border ${config.color}`}
            >
              <StatusIcon className="h-3 w-3 mr-1" />
              {config.label}
            </span>
            {scenario.isBaseline && (
              <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-indigo-100 text-indigo-800 border border-indigo-300">
                Baseline
              </span>
            )}
          </div>

          {/* Name */}
          <h4 className="mt-2 font-medium text-steel-900 truncate">{scenario.name}</h4>

          {/* Project Number */}
          {scenario.projectNumber && (
            <p className="text-sm text-steel-500 font-mono">{scenario.projectNumber}</p>
          )}

          {/* Meta Info */}
          <div className="mt-2 flex items-center gap-4 text-xs text-steel-500">
            <span className="flex items-center gap-1">
              <TruckIcon className="h-3.5 w-3.5" />
              {carCount} cars
            </span>
            <span className="flex items-center gap-1 truncate">
              <UserCircleIcon className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{customerNames}</span>
            </span>
          </div>

          {/* Creator & Date */}
          <div className="mt-1 flex items-center gap-2 text-xs text-steel-400">
            <span>
              {scenario.creator.firstName} {scenario.creator.lastName}
            </span>
            <span>&middot;</span>
            <span className="flex items-center gap-1">
              <CalendarDaysIcon className="h-3 w-3" />
              {formatDate(scenario.createdAt)}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 ml-2">
          {scenario.status === 'draft' && (
            <button
              onClick={onDelete}
              className="p-1 text-steel-400 hover:text-red-600 rounded"
              title="Delete scenario"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          )}
          <ChevronRightIcon className="h-4 w-4 text-steel-400" />
        </div>
      </div>

      {/* Notes Preview */}
      {scenario.notes && (
        <p className="mt-2 text-xs text-steel-500 line-clamp-2 border-t border-steel-100 pt-2">
          {scenario.notes}
        </p>
      )}
    </div>
  );
}
