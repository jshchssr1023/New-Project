/**
 * LeaseQualificationEngine.tsx - Lease Release + Qualification Planning UI
 *
 * S&OP-style planning interface for:
 * - Running qualification scenarios (base, late-release, capacity-shift)
 * - Comparing scenarios and viewing metrics
 * - Generating team plans and customer schedules
 * - Selecting specific cars/shops for documents
 */

import { useState, useEffect } from 'react';
import {
  PlayIcon,
  DocumentTextIcon,
  ChartBarIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  BuildingOfficeIcon,
  TruckIcon,
  DocumentArrowDownIcon,
  ArrowPathIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import {
  leaseQualificationApi,
  QualificationScenario,
  ScenarioMetrics,
  AvailableCar,
  AvailableShop,
  AvailableCustomer,
  AvailableMonth,
  ScenarioComparison,
} from '../services/api';

type TabType = 'scenarios' | 'documents' | 'queue';

export default function LeaseQualificationEngine() {
  const [activeTab, setActiveTab] = useState<TabType>('scenarios');
  const [scenarios, setScenarios] = useState<QualificationScenario[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<QualificationScenario | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [comparison, setComparison] = useState<ScenarioComparison | null>(null);

  // Document generation state
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [documentType, setDocumentType] = useState<'team_plan' | 'customer' | 'shop'>('team_plan');
  const [availableCars, setAvailableCars] = useState<AvailableCar[]>([]);
  const [availableShops, setAvailableShops] = useState<AvailableShop[]>([]);
  const [availableCustomers, setAvailableCustomers] = useState<AvailableCustomer[]>([]);
  const [availableMonths, setAvailableMonths] = useState<AvailableMonth[]>([]);
  const [selectedCarIds, setSelectedCarIds] = useState<string[]>([]);
  const [selectedShopIds, setSelectedShopIds] = useState<string[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedMonthRange, setSelectedMonthRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [generatedMarkdown, setGeneratedMarkdown] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Scenario creation state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState('');
  const [newScenarioType, setNewScenarioType] = useState<'base' | 'late_release' | 'capacity_shift'>('base');
  const [lateReleasePercent, setLateReleasePercent] = useState(20);

  useEffect(() => {
    loadScenarios();
  }, []);

  const loadScenarios = async () => {
    setIsLoading(true);
    try {
      const response = await leaseQualificationApi.getScenarios();
      setScenarios(response.data);
    } catch (error) {
      console.error('Failed to load scenarios:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const runScenario = async () => {
    if (!newScenarioName.trim()) return;

    setIsRunning(true);
    try {
      const params: Parameters<typeof leaseQualificationApi.runScenario>[0] = {
        name: newScenarioName,
        type: newScenarioType,
      };

      if (newScenarioType === 'late_release') {
        params.lateReleasePercent = lateReleasePercent;
      }

      await leaseQualificationApi.runScenario(params);
      setShowCreateModal(false);
      setNewScenarioName('');
      await loadScenarios();
    } catch (error) {
      console.error('Failed to run scenario:', error);
    } finally {
      setIsRunning(false);
    }
  };

  const compareSelectedScenarios = async () => {
    const completedScenarios = scenarios.filter((s) => s.status === 'completed');
    if (completedScenarios.length < 2) return;

    try {
      const response = await leaseQualificationApi.compareScenarios(completedScenarios.slice(0, 3).map((s) => s.id));
      setComparison(response.data);
    } catch (error) {
      console.error('Failed to compare scenarios:', error);
    }
  };

  const openDocumentModal = async (scenario: QualificationScenario) => {
    setSelectedScenario(scenario);
    setShowDocumentModal(true);
    setGeneratedMarkdown('');

    // Load selection data
    try {
      const [carsRes, shopsRes, customersRes, monthsRes] = await Promise.all([
        leaseQualificationApi.getAvailableCars(scenario.id),
        leaseQualificationApi.getAvailableShops(scenario.id),
        leaseQualificationApi.getAvailableCustomers(scenario.id),
        leaseQualificationApi.getAvailableMonths(scenario.id),
      ]);

      setAvailableCars(carsRes.data);
      setAvailableShops(shopsRes.data);
      setAvailableCustomers(customersRes.data);
      setAvailableMonths(monthsRes.data);

      // Pre-select all
      setSelectedCarIds(carsRes.data.map((c) => c.id));
      setSelectedShopIds(shopsRes.data.map((s) => s.id));
      if (customersRes.data.length > 0) {
        setSelectedCustomerId(customersRes.data[0].id);
      }
      if (monthsRes.data.length > 0) {
        setSelectedMonthRange({
          start: monthsRes.data[0].monthKey,
          end: monthsRes.data[monthsRes.data.length - 1].monthKey,
        });
      }
    } catch (error) {
      console.error('Failed to load selection data:', error);
    }
  };

  const generateDocument = async () => {
    if (!selectedScenario) return;

    setIsGenerating(true);
    try {
      const criteria = {
        scenarioId: selectedScenario.id,
        carIds: selectedCarIds.length > 0 ? selectedCarIds : undefined,
        shopIds: selectedShopIds.length > 0 ? selectedShopIds : undefined,
        startMonth: selectedMonthRange.start || undefined,
        endMonth: selectedMonthRange.end || undefined,
      };

      let response;
      if (documentType === 'team_plan') {
        response = await leaseQualificationApi.generateTeamPlan(criteria);
      } else if (documentType === 'customer') {
        response = await leaseQualificationApi.generateCustomerSchedule({
          ...criteria,
          customerId: selectedCustomerId,
        });
      } else {
        response = await leaseQualificationApi.generateShopPlan({
          ...criteria,
          shopId: selectedShopIds[0] || '',
        });
      }

      setGeneratedMarkdown(response.data.markdownContent);
    } catch (error) {
      console.error('Failed to generate document:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const getRiskBadge = (score: number) => {
    if (score >= 50) return <span className="badge badge-danger">High Risk ({score})</span>;
    if (score >= 25) return <span className="badge badge-warning">Medium Risk ({score})</span>;
    return <span className="badge badge-available">Low Risk ({score})</span>;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="badge badge-available">Completed</span>;
      case 'running':
        return <span className="badge badge-warning">Running</span>;
      case 'approved':
        return <span className="badge badge-info">Approved</span>;
      default:
        return <span className="badge">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-steel-900">Lease Qualification Planning</h1>
          <p className="text-steel-600">S&OP-style planning for lease releases and qualifications</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowCreateModal(true)}>
          <PlayIcon className="h-5 w-5" />
          Run New Scenario
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-steel-200">
        <nav className="flex space-x-8">
          {[
            { id: 'scenarios', label: 'Scenarios', icon: ChartBarIcon },
            { id: 'documents', label: 'Documents', icon: DocumentTextIcon },
            { id: 'queue', label: 'Qualification Queue', icon: ClockIcon },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-rail-600 text-rail-600'
                  : 'border-transparent text-steel-500 hover:text-steel-700 hover:border-steel-300'
              }`}
            >
              <tab.icon className="h-5 w-5" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Scenarios Tab */}
      {activeTab === 'scenarios' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-rail-100 rounded-lg">
                  <ChartBarIcon className="h-6 w-6 text-rail-600" />
                </div>
                <div>
                  <p className="text-sm text-steel-500">Total Scenarios</p>
                  <p className="text-2xl font-bold text-steel-900">{scenarios.length}</p>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-accent-100 rounded-lg">
                  <CheckCircleIcon className="h-6 w-6 text-accent-600" />
                </div>
                <div>
                  <p className="text-sm text-steel-500">Completed</p>
                  <p className="text-2xl font-bold text-steel-900">
                    {scenarios.filter((s) => s.status === 'completed').length}
                  </p>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-warning-100 rounded-lg">
                  <ExclamationTriangleIcon className="h-6 w-6 text-warning-600" />
                </div>
                <div>
                  <p className="text-sm text-steel-500">Approved</p>
                  <p className="text-2xl font-bold text-steel-900">
                    {scenarios.filter((s) => s.isApproved).length}
                  </p>
                </div>
              </div>
            </div>
            <div className="card">
              <button
                onClick={compareSelectedScenarios}
                disabled={scenarios.filter((s) => s.status === 'completed').length < 2}
                className="w-full h-full flex items-center justify-center gap-2 text-rail-600 hover:bg-rail-50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowPathIcon className="h-5 w-5" />
                Compare Scenarios
              </button>
            </div>
          </div>

          {/* Comparison Table */}
          {comparison && (
            <div className="card">
              <h3 className="text-lg font-semibold mb-4">Scenario Comparison</h3>
              <div className="prose prose-sm max-w-none overflow-x-auto">
                <pre className="whitespace-pre-wrap bg-steel-50 p-4 rounded-lg text-sm">
                  {comparison.comparisonTable}
                </pre>
              </div>
              <div className="mt-4 p-4 bg-accent-50 rounded-lg">
                <p className="font-medium text-accent-800">Recommendation</p>
                <p className="text-accent-700">{comparison.bestScenarioReason}</p>
              </div>
              {comparison.recommendations.length > 0 && (
                <div className="mt-4">
                  <p className="font-medium mb-2">Additional Recommendations:</p>
                  <ul className="list-disc list-inside text-sm text-steel-600">
                    {comparison.recommendations.map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Scenarios List */}
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">Planning Scenarios</h3>
            {isLoading ? (
              <div className="text-center py-8 text-steel-500">Loading scenarios...</div>
            ) : scenarios.length === 0 ? (
              <div className="text-center py-8 text-steel-500">
                No scenarios yet. Click "Run New Scenario" to create one.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-steel-200">
                      <th className="text-left py-3 px-4 font-medium text-steel-600">Name</th>
                      <th className="text-left py-3 px-4 font-medium text-steel-600">Type</th>
                      <th className="text-left py-3 px-4 font-medium text-steel-600">Status</th>
                      <th className="text-left py-3 px-4 font-medium text-steel-600">Metrics</th>
                      <th className="text-left py-3 px-4 font-medium text-steel-600">Risk</th>
                      <th className="text-left py-3 px-4 font-medium text-steel-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenarios.map((scenario) => (
                      <tr key={scenario.id} className="border-b border-steel-100 hover:bg-steel-50">
                        <td className="py-3 px-4">
                          <div className="font-medium text-steel-900">{scenario.name}</div>
                          <div className="text-xs text-steel-500">
                            {new Date(scenario.createdAt).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="capitalize">{scenario.scenarioType.replace('_', ' ')}</span>
                          {scenario.scenarioType === 'late_release' && (
                            <span className="text-xs text-steel-500 ml-1">
                              ({scenario.lateReleasePercent}%)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">{getStatusBadge(scenario.status)}</td>
                        <td className="py-3 px-4">
                          {scenario.summaryJson ? (
                            <div className="text-sm">
                              <div>Compliance: {scenario.summaryJson.releaseCompliance}%</div>
                              <div>Attainment: {scenario.summaryJson.qualAttainment}%</div>
                              <div>Backlog: {scenario.summaryJson.backlog}</div>
                            </div>
                          ) : (
                            <span className="text-steel-400">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {scenario.summaryJson ? (
                            getRiskBadge(scenario.summaryJson.riskScore)
                          ) : (
                            <span className="text-steel-400">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openDocumentModal(scenario)}
                              className="btn-ghost text-sm flex items-center gap-1"
                              disabled={scenario.status !== 'completed'}
                            >
                              <DocumentArrowDownIcon className="h-4 w-4" />
                              Generate Docs
                            </button>
                            {scenario.status === 'completed' && !scenario.isApproved && (
                              <button
                                onClick={async () => {
                                  await leaseQualificationApi.approveScenario(scenario.id);
                                  await loadScenarios();
                                }}
                                className="btn-primary text-sm"
                              >
                                Approve
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Documents Tab */}
      {activeTab === 'documents' && (
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Generated Documents</h3>
          <p className="text-steel-500">
            Select a scenario from the Scenarios tab and click "Generate Docs" to create team plans or customer schedules.
          </p>
        </div>
      )}

      {/* Queue Tab */}
      {activeTab === 'queue' && (
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Qualification Queue</h3>
          <p className="text-steel-500">
            The qualification queue shows cars pending qualification work. Run a scenario first to populate the queue.
          </p>
        </div>
      )}

      {/* Create Scenario Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">Run New Scenario</h2>

              <div className="space-y-4">
                <div>
                  <label className="label">Scenario Name</label>
                  <input
                    type="text"
                    className="input w-full"
                    placeholder="e.g., Q2 2026 Base Plan"
                    value={newScenarioName}
                    onChange={(e) => setNewScenarioName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="label">Scenario Type</label>
                  <select
                    className="input w-full"
                    value={newScenarioType}
                    onChange={(e) => setNewScenarioType(e.target.value as typeof newScenarioType)}
                  >
                    <option value="base">Base Plan</option>
                    <option value="late_release">Late Release Scenario</option>
                    <option value="capacity_shift">Capacity Shift Scenario</option>
                  </select>
                </div>

                {newScenarioType === 'late_release' && (
                  <div>
                    <label className="label">Late Release Percentage</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="5"
                        max="50"
                        value={lateReleasePercent}
                        onChange={(e) => setLateReleasePercent(Number(e.target.value))}
                        className="flex-1"
                      />
                      <span className="text-steel-700 font-medium w-12">{lateReleasePercent}%</span>
                    </div>
                    <p className="text-xs text-steel-500 mt-1">
                      Simulates {lateReleasePercent}% of cars being released late
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button className="btn-primary" onClick={runScenario} disabled={isRunning || !newScenarioName.trim()}>
                  {isRunning ? 'Running...' : 'Run Scenario'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document Generation Modal */}
      {showDocumentModal && selectedScenario && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-steel-200">
              <h2 className="text-xl font-bold">Generate Document</h2>
              <p className="text-steel-500">Scenario: {selectedScenario.name}</p>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Selection */}
                <div className="space-y-4">
                  <div>
                    <label className="label">Document Type</label>
                    <select
                      className="input w-full"
                      value={documentType}
                      onChange={(e) => setDocumentType(e.target.value as typeof documentType)}
                    >
                      <option value="team_plan">Team Plan (Internal)</option>
                      <option value="customer">Customer Schedule</option>
                      <option value="shop">Shop Plan</option>
                    </select>
                  </div>

                  {/* Month Range */}
                  <div>
                    <label className="label flex items-center gap-2">
                      <FunnelIcon className="h-4 w-4" />
                      Month Range
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        className="input"
                        value={selectedMonthRange.start}
                        onChange={(e) => setSelectedMonthRange({ ...selectedMonthRange, start: e.target.value })}
                      >
                        <option value="">Start Month</option>
                        {availableMonths.map((m) => (
                          <option key={m.monthKey} value={m.monthKey}>
                            {m.monthLabel} ({m.assignmentCount})
                          </option>
                        ))}
                      </select>
                      <select
                        className="input"
                        value={selectedMonthRange.end}
                        onChange={(e) => setSelectedMonthRange({ ...selectedMonthRange, end: e.target.value })}
                      >
                        <option value="">End Month</option>
                        {availableMonths.map((m) => (
                          <option key={m.monthKey} value={m.monthKey}>
                            {m.monthLabel} ({m.assignmentCount})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Shops Selection */}
                  <div>
                    <label className="label flex items-center gap-2">
                      <BuildingOfficeIcon className="h-4 w-4" />
                      Select Shops ({selectedShopIds.length}/{availableShops.length})
                    </label>
                    <div className="border border-steel-200 rounded-lg max-h-32 overflow-y-auto p-2">
                      {availableShops.map((shop) => (
                        <label key={shop.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-steel-50">
                          <input
                            type="checkbox"
                            checked={selectedShopIds.includes(shop.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedShopIds([...selectedShopIds, shop.id]);
                              } else {
                                setSelectedShopIds(selectedShopIds.filter((id) => id !== shop.id));
                              }
                            }}
                          />
                          <span className="text-sm">
                            {shop.name} ({shop.code}) - {shop.assignmentCount} cars
                          </span>
                        </label>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-1">
                      <button
                        className="text-xs text-rail-600 hover:underline"
                        onClick={() => setSelectedShopIds(availableShops.map((s) => s.id))}
                      >
                        Select All
                      </button>
                      <button
                        className="text-xs text-rail-600 hover:underline"
                        onClick={() => setSelectedShopIds([])}
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {/* Cars Selection */}
                  <div>
                    <label className="label flex items-center gap-2">
                      <TruckIcon className="h-4 w-4" />
                      Select Cars ({selectedCarIds.length}/{availableCars.length})
                    </label>
                    <div className="border border-steel-200 rounded-lg max-h-32 overflow-y-auto p-2">
                      {availableCars.slice(0, 50).map((car) => (
                        <label key={car.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-steel-50">
                          <input
                            type="checkbox"
                            checked={selectedCarIds.includes(car.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedCarIds([...selectedCarIds, car.id]);
                              } else {
                                setSelectedCarIds(selectedCarIds.filter((id) => id !== car.id));
                              }
                            }}
                          />
                          <span className="text-sm">
                            {car.railcarNumber} - {car.customer} ({car.monthKey})
                          </span>
                        </label>
                      ))}
                      {availableCars.length > 50 && (
                        <p className="text-xs text-steel-500 p-2">
                          Showing first 50 of {availableCars.length} cars
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 mt-1">
                      <button
                        className="text-xs text-rail-600 hover:underline"
                        onClick={() => setSelectedCarIds(availableCars.map((c) => c.id))}
                      >
                        Select All
                      </button>
                      <button
                        className="text-xs text-rail-600 hover:underline"
                        onClick={() => setSelectedCarIds([])}
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {/* Customer Selection (for customer schedule) */}
                  {documentType === 'customer' && (
                    <div>
                      <label className="label">Select Customer</label>
                      <select
                        className="input w-full"
                        value={selectedCustomerId}
                        onChange={(e) => setSelectedCustomerId(e.target.value)}
                      >
                        <option value="">Select a customer...</option>
                        {availableCustomers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.code}) - In: {c.inboundCount}, Out: {c.outboundCount}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <button
                    className="btn-primary w-full"
                    onClick={generateDocument}
                    disabled={isGenerating || (documentType === 'customer' && !selectedCustomerId)}
                  >
                    {isGenerating ? 'Generating...' : 'Generate Document'}
                  </button>
                </div>

                {/* Right: Preview */}
                <div>
                  <label className="label">Preview</label>
                  <div className="border border-steel-200 rounded-lg h-96 overflow-y-auto p-4 bg-steel-50">
                    {generatedMarkdown ? (
                      <pre className="whitespace-pre-wrap text-sm font-mono">{generatedMarkdown}</pre>
                    ) : (
                      <p className="text-steel-400 text-center mt-20">
                        Click "Generate Document" to preview
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-steel-200 flex justify-end gap-3">
              <button className="btn-secondary" onClick={() => setShowDocumentModal(false)}>
                Close
              </button>
              {generatedMarkdown && (
                <button
                  className="btn-primary"
                  onClick={() => {
                    const blob = new Blob([generatedMarkdown], { type: 'text/markdown' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${selectedScenario.name.replace(/\s+/g, '_')}_${documentType}.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Download Markdown
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
