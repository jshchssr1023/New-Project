import { useState, useEffect } from 'react';
import {
  PlusIcon,
  PlayIcon,
  TrashIcon,
  DocumentDuplicateIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { scenariosApi, plansApi } from '../services/api';
import type { Scenario, Plan } from '../types';

const statusColors: Record<string, string> = {
  draft: 'bg-steel-100 text-steel-800',
  analyzing: 'bg-amber-100 text-amber-800',
  completed: 'bg-green-100 text-green-800',
};

export default function ScenarioManager() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    basePlanId: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [scenariosData, plansData] = await Promise.all([
        scenariosApi.getAll(),
        plansApi.getAll(),
      ]);
      setScenarios(scenariosData);
      setPlans(plansData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateScenario = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await scenariosApi.create(formData);
      setIsModalOpen(false);
      setFormData({ name: '', description: '', basePlanId: '' });
      loadData();
    } catch (error) {
      console.error('Failed to create scenario:', error);
    }
  };

  const handleRunAnalysis = async (id: string) => {
    try {
      await scenariosApi.analyze(id);
      loadData();
    } catch (error) {
      console.error('Failed to run analysis:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this scenario?')) return;
    try {
      await scenariosApi.delete(id);
      loadData();
    } catch (error) {
      console.error('Failed to delete scenario:', error);
    }
  };

  const handleApplyToPlan = async (scenarioId: string) => {
    const planId = prompt('Enter the plan ID to apply this scenario to:');
    if (!planId) return;
    try {
      await scenariosApi.applyToPlan(scenarioId, planId);
      alert('Scenario applied successfully!');
    } catch (error) {
      console.error('Failed to apply scenario:', error);
    }
  };

  const formatDelta = (value: number): string => {
    if (value > 0) return `+${value.toFixed(1)}%`;
    if (value < 0) return `${value.toFixed(1)}%`;
    return '0%';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-steel-900">Scenario Manager</h1>
          <p className="mt-1 text-sm text-steel-500">
            What-if analysis for service planning optimization
          </p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="btn-primary flex items-center">
          <PlusIcon className="mr-2 h-5 w-5" />
          New Scenario
        </button>
      </div>

      {isLoading ? (
        <div className="card">
          <p className="text-steel-500">Loading scenarios...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Scenarios list */}
          <div className="space-y-4">
            <h2 className="text-lg font-medium text-steel-900">Scenarios</h2>
            {scenarios.length === 0 ? (
              <div className="card">
                <p className="text-steel-500">No scenarios created yet.</p>
              </div>
            ) : (
              scenarios.map((scenario) => (
                <div
                  key={scenario.id}
                  className={`card cursor-pointer transition-all ${
                    selectedScenario?.id === scenario.id ? 'ring-2 ring-rail-500' : ''
                  }`}
                  onClick={() => setSelectedScenario(scenario)}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-medium text-steel-900">{scenario.name}</h3>
                      <p className="text-sm text-steel-500 mt-1">{scenario.description}</p>
                    </div>
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusColors[scenario.status]}`}>
                      {scenario.status}
                    </span>
                  </div>
                  <div className="mt-4 flex items-center space-x-2">
                    {scenario.status === 'draft' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRunAnalysis(scenario.id);
                        }}
                        className="btn-primary py-1 px-3 text-sm flex items-center"
                      >
                        <PlayIcon className="mr-1 h-4 w-4" />
                        Analyze
                      </button>
                    )}
                    {scenario.status === 'analyzing' && (
                      <button disabled className="btn-secondary py-1 px-3 text-sm flex items-center opacity-50">
                        <ArrowPathIcon className="mr-1 h-4 w-4 animate-spin" />
                        Running...
                      </button>
                    )}
                    {scenario.status === 'completed' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleApplyToPlan(scenario.id);
                        }}
                        className="btn-secondary py-1 px-3 text-sm flex items-center"
                      >
                        <DocumentDuplicateIcon className="mr-1 h-4 w-4" />
                        Apply to Plan
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(scenario.id);
                      }}
                      className="text-red-600 hover:text-red-900 p-1"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Scenario details */}
          <div>
            <h2 className="text-lg font-medium text-steel-900 mb-4">Analysis Results</h2>
            {selectedScenario?.results ? (
              <div className="card space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-steel-50 rounded-lg p-4">
                    <p className="text-sm text-steel-500">Total Cost</p>
                    <p className="text-2xl font-bold text-steel-900">
                      ${selectedScenario.results.totalCost.toLocaleString()}
                    </p>
                    <p className={`text-sm ${selectedScenario.results.costDelta > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatDelta(selectedScenario.results.costDelta)} vs baseline
                    </p>
                  </div>
                  <div className="bg-steel-50 rounded-lg p-4">
                    <p className="text-sm text-steel-500">Avg Turn Time</p>
                    <p className="text-2xl font-bold text-steel-900">
                      {selectedScenario.results.averageTurnTime.toFixed(1)} days
                    </p>
                    <p className={`text-sm ${selectedScenario.results.turnTimeDelta > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatDelta(selectedScenario.results.turnTimeDelta)} vs baseline
                    </p>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-steel-700 mb-3">Shop Utilization</h4>
                  <div className="space-y-2">
                    {Object.entries(selectedScenario.results.shopUtilization).map(([shopId, utilization]) => (
                      <div key={shopId} className="flex items-center justify-between">
                        <span className="text-sm text-steel-600">{shopId}</span>
                        <div className="flex items-center space-x-2">
                          <div className="w-32 bg-steel-200 rounded-full h-2">
                            <div
                              className="bg-rail-500 h-2 rounded-full"
                              style={{ width: `${Math.min(utilization, 100)}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium w-12 text-right">{utilization}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-steel-700 mb-3">Monthly Distribution</h4>
                  <div className="flex items-end h-32 space-x-1">
                    {Object.entries(selectedScenario.results.monthlyDistribution).map(([month, count]) => (
                      <div key={month} className="flex-1 flex flex-col items-center">
                        <div
                          className="w-full bg-rail-500 rounded-t"
                          style={{ height: `${(count / Math.max(...Object.values(selectedScenario.results!.monthlyDistribution))) * 100}%` }}
                        />
                        <span className="text-xs text-steel-500 mt-1">{month.slice(5)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="card">
                <p className="text-steel-500">
                  {selectedScenario
                    ? 'Run analysis to see results'
                    : 'Select a scenario to view details'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-steel-900/50" onClick={() => setIsModalOpen(false)} />
            <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
              <h2 className="text-xl font-semibold text-steel-900 mb-4">Create New Scenario</h2>
              <form onSubmit={handleCreateScenario} className="space-y-4">
                <div>
                  <label className="label">Scenario Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="input"
                    placeholder="e.g., High Volume Q2"
                    required
                  />
                </div>
                <div>
                  <label className="label">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="input"
                    rows={3}
                    placeholder="Describe the scenario..."
                  />
                </div>
                <div>
                  <label className="label">Base Plan</label>
                  <select
                    value={formData.basePlanId}
                    onChange={(e) => setFormData({ ...formData, basePlanId: e.target.value })}
                    className="input"
                    required
                  >
                    <option value="">Select a plan</option>
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    Create Scenario
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
