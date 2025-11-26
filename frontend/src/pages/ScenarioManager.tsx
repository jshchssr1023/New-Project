import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PlusIcon,
  PlayIcon,
  TrashIcon,
  DocumentDuplicateIcon,
  ArrowPathIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  UserGroupIcon,
  XMarkIcon,
  ArrowRightIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import { scenariosApi, plansApi, carsApi, shopsApi } from '../services/api';
import type { Scenario, Plan, Car, Shop, ScenarioCar, ShopRecommendation, OverloadedShop } from '../types';
import { getUtilizationBadgeClasses, getUtilizationPercent, isCapacityWarning } from '../utils/utilizationColors';

const statusColors: Record<string, string> = {
  draft: 'bg-steel-100 text-steel-800',
  analyzing: 'bg-amber-100 text-amber-800',
  completed: 'bg-green-100 text-green-800',
};

export default function ScenarioManager() {
  const navigate = useNavigate();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [cars, setCars] = useState<Car[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [customers, setCustomers] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAddCarsModalOpen, setIsAddCarsModalOpen] = useState(false);
  const [isRecommendationsModalOpen, setIsRecommendationsModalOpen] = useState(false);
  const [isCommitModalOpen, setIsCommitModalOpen] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [selectedScenarioCar, setSelectedScenarioCar] = useState<ScenarioCar | null>(null);
  const [recommendations, setRecommendations] = useState<ShopRecommendation[]>([]);
  const [commitPlanId, setCommitPlanId] = useState<string>('');
  const [formData, setFormData] = useState({
    projectNumber: '',
    name: '',
    description: '',
    customerFilter: '',
  });
  const [addCarsForm, setAddCarsForm] = useState({
    customer: '',
    scheduledMonth: '',
    selectedCarIds: [] as string[],
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedScenario) {
      loadScenarioDetails(selectedScenario.id);
    }
  }, [selectedScenario?.id]);

  const loadData = async () => {
    try {
      const [scenariosData, plansData, carsResponse, shopsData] = await Promise.all([
        scenariosApi.getAll(),
        plansApi.getAll(),
        carsApi.getAll({ pageSize: 1000 }),
        shopsApi.getAll(),
      ]);
      setScenarios(scenariosData);
      setPlans(plansData);
      setCars(carsResponse.data);
      setShops(shopsData);

      // Extract unique customers from cars
      const uniqueCustomers = [...new Set(carsResponse.data.map(c => c.customer).filter(Boolean))];
      setCustomers(uniqueCustomers);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadScenarioDetails = async (id: string) => {
    try {
      const scenario = await scenariosApi.getById(id);
      setSelectedScenario(scenario);
    } catch (error) {
      console.error('Failed to load scenario details:', error);
    }
  };

  const handleCreateScenario = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate projectNumber
    if (!formData.projectNumber.trim()) {
      alert('Project Number is required');
      return;
    }

    if (!formData.name.trim()) {
      alert('Scenario Name is required');
      return;
    }

    try {
      const newScenario = await scenariosApi.create({
        projectNumber: formData.projectNumber.toUpperCase(),
        name: formData.name,
        description: formData.description,
        customerFilter: formData.customerFilter,
      });
      setIsModalOpen(false);
      setFormData({ projectNumber: '', name: '', description: '', customerFilter: '' });
      await loadData();
      setSelectedScenario(newScenario);
    } catch (error: any) {
      console.error('Failed to create scenario:', error);
      if (error.response?.data?.message) {
        alert(error.response.data.message);
      }
    }
  };

  const handleAddCarsByCustomer = async () => {
    if (!selectedScenario || !addCarsForm.customer || !addCarsForm.scheduledMonth) return;
    try {
      const updated = await scenariosApi.addCarsByCustomer(
        selectedScenario.id,
        addCarsForm.customer,
        addCarsForm.scheduledMonth
      );
      setSelectedScenario(updated);
      setIsAddCarsModalOpen(false);
      setAddCarsForm({ customer: '', scheduledMonth: '', selectedCarIds: [] });
    } catch (error) {
      console.error('Failed to add cars:', error);
    }
  };

  const handleAddSelectedCars = async () => {
    if (!selectedScenario || addCarsForm.selectedCarIds.length === 0 || !addCarsForm.scheduledMonth) return;
    try {
      const updated = await scenariosApi.addCars(
        selectedScenario.id,
        addCarsForm.selectedCarIds,
        addCarsForm.scheduledMonth
      );
      setSelectedScenario(updated);
      setIsAddCarsModalOpen(false);
      setAddCarsForm({ customer: '', scheduledMonth: '', selectedCarIds: [] });
    } catch (error) {
      console.error('Failed to add cars:', error);
    }
  };

  const handleRemoveCar = async (scenarioCarId: string) => {
    if (!selectedScenario) return;
    try {
      await scenariosApi.removeCar(selectedScenario.id, scenarioCarId);
      await loadScenarioDetails(selectedScenario.id);
    } catch (error) {
      console.error('Failed to remove car:', error);
    }
  };

  const handleGetRecommendations = async (scenarioCar: ScenarioCar) => {
    if (!selectedScenario) return;
    setSelectedScenarioCar(scenarioCar);
    try {
      const result = await scenariosApi.getRecommendations(selectedScenario.id, scenarioCar.id);
      setRecommendations(result.recommendations);
      setIsRecommendationsModalOpen(true);
    } catch (error) {
      console.error('Failed to get recommendations:', error);
    }
  };

  const handleAssignShop = async (shopId: string) => {
    if (!selectedScenario || !selectedScenarioCar) return;
    try {
      const updated = await scenariosApi.assignShop(selectedScenario.id, selectedScenarioCar.id, shopId);
      setSelectedScenario(updated);
      setIsRecommendationsModalOpen(false);
      setSelectedScenarioCar(null);
    } catch (error) {
      console.error('Failed to assign shop:', error);
    }
  };

  const handleRunAnalysis = async (id: string) => {
    try {
      const updated = await scenariosApi.analyze(id);
      setSelectedScenario(updated);
      await loadData();
    } catch (error) {
      console.error('Failed to run analysis:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this scenario?')) return;
    try {
      await scenariosApi.delete(id);
      if (selectedScenario?.id === id) {
        setSelectedScenario(null);
      }
      loadData();
    } catch (error) {
      console.error('Failed to delete scenario:', error);
    }
  };

  const handleOpenCommitModal = () => {
    if (!selectedScenario || !selectedScenario.cars || selectedScenario.cars.length === 0) {
      alert('No cars in scenario to commit');
      return;
    }

    // Check if all cars have assigned shops
    const unassignedCars = selectedScenario.cars.filter(sc => !sc.assignedShopId && !sc.suggestedShopId);
    if (unassignedCars.length > 0) {
      alert(`${unassignedCars.length} car(s) have no assigned or suggested shop. Please assign shops before committing.`);
      return;
    }

    setIsCommitModalOpen(true);
  };

  const handleCommitToPlan = async () => {
    if (!selectedScenario || !commitPlanId) return;

    setIsCommitting(true);
    try {
      // Build assignments from scenario cars
      const assignments = selectedScenario.cars.map(sc => ({
        carId: sc.carId,
        shopId: sc.assignedShopId || sc.suggestedShopId || '',
        scheduledMonth: sc.scheduledMonth,
        estimatedCost: sc.estimatedCost,
        estimatedDuration: sc.estimatedDays,
        status: 'pending' as const,
      })).filter(a => a.shopId); // Only include cars with shops

      const result = await plansApi.bulkAddAssignments(commitPlanId, assignments);

      if (result.failed > 0) {
        alert(`Committed ${result.success} assignments. ${result.failed} failed.`);
      } else {
        alert(`Successfully committed ${result.success} assignments to the plan!`);
      }

      setIsCommitModalOpen(false);
      setCommitPlanId('');
    } catch (error) {
      console.error('Failed to commit to plan:', error);
      alert('Failed to commit assignments to plan');
    } finally {
      setIsCommitting(false);
    }
  };

  // Navigate to car details with filter
  const handleRailcarClick = (railcarNumber: string) => {
    navigate(`/cars?search=${encodeURIComponent(railcarNumber)}`);
  };

  const getNextMonths = () => {
    const months: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      months.push({ value, label });
    }
    return months;
  };

  const filteredCarsForModal = addCarsForm.customer
    ? cars.filter(c => c.customer === addCarsForm.customer)
    : cars;

  const toggleCarSelection = (carId: string) => {
    setAddCarsForm(prev => ({
      ...prev,
      selectedCarIds: prev.selectedCarIds.includes(carId)
        ? prev.selectedCarIds.filter(id => id !== carId)
        : [...prev.selectedCarIds, carId]
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-steel-900">Scenario Builder</h1>
          <p className="mt-1 text-sm text-steel-500">
            Build scenarios to test shop capacity and get recommendations
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono bg-steel-100 px-2 py-0.5 rounded text-steel-600">
                          {scenario.projectNumber || 'NO-PROJECT'}
                        </span>
                      </div>
                      <h3 className="text-lg font-medium text-steel-900">{scenario.name}</h3>
                      <p className="text-sm text-steel-500 mt-1 line-clamp-2">{scenario.description}</p>
                      {scenario.customerFilter && (
                        <div className="flex items-center mt-2 text-xs text-steel-600">
                          <UserGroupIcon className="h-4 w-4 mr-1" />
                          {scenario.customerFilter}
                        </div>
                      )}
                      <div className="text-xs text-steel-500 mt-1">
                        {scenario.carCount || scenario.cars?.length || 0} cars
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusColors[scenario.status]}`}>
                        {scenario.status}
                      </span>
                      <ChevronRightIcon className="h-5 w-5 text-steel-400" />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Scenario details and cars */}
          <div className="lg:col-span-2 space-y-4">
            {selectedScenario ? (
              <>
                {/* Scenario header */}
                <div className="card">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-steel-900">{selectedScenario.name}</h2>
                      <p className="text-sm text-steel-500 mt-1">{selectedScenario.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setIsAddCarsModalOpen(true)}
                        className="btn-secondary py-2 px-3 text-sm flex items-center"
                      >
                        <PlusIcon className="mr-1 h-4 w-4" />
                        Add Cars
                      </button>
                      {selectedScenario.status === 'draft' && selectedScenario.cars?.length > 0 && (
                        <button
                          onClick={() => handleRunAnalysis(selectedScenario.id)}
                          className="btn-primary py-2 px-3 text-sm flex items-center"
                        >
                          <PlayIcon className="mr-1 h-4 w-4" />
                          Run Analysis
                        </button>
                      )}
                      {selectedScenario.status === 'analyzing' && (
                        <button disabled className="btn-secondary py-2 px-3 text-sm flex items-center opacity-50">
                          <ArrowPathIcon className="mr-1 h-4 w-4 animate-spin" />
                          Analyzing...
                        </button>
                      )}
                      {selectedScenario.status === 'completed' && (
                        <button
                          onClick={handleOpenCommitModal}
                          className="btn-primary py-2 px-4 text-sm flex items-center font-medium"
                        >
                          <CheckIcon className="mr-2 h-4 w-4" />
                          Commit Plan
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(selectedScenario.id)}
                        className="text-red-600 hover:text-red-900 p-2"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Analysis Results Summary */}
                {selectedScenario.results && (
                  <div className="card">
                    <h3 className="text-lg font-medium text-steel-900 mb-4">Analysis Results</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      <div className="bg-steel-50 rounded-lg p-4">
                        <p className="text-sm text-steel-500">Total Cars</p>
                        <p className="text-2xl font-bold text-steel-900">{selectedScenario.results.totalCars}</p>
                      </div>
                      <div className="bg-green-50 rounded-lg p-4">
                        <p className="text-sm text-steel-500">Assigned</p>
                        <p className="text-2xl font-bold text-green-600">{selectedScenario.results.assignedCars}</p>
                      </div>
                      <div className="bg-amber-50 rounded-lg p-4">
                        <p className="text-sm text-steel-500">Suggested</p>
                        <p className="text-2xl font-bold text-amber-600">{selectedScenario.results.suggestedCars}</p>
                      </div>
                      <div className="bg-red-50 rounded-lg p-4">
                        <p className="text-sm text-steel-500">Unassigned</p>
                        <p className="text-2xl font-bold text-red-600">{selectedScenario.results.unassignedCars}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div className="bg-steel-50 rounded-lg p-4">
                        <p className="text-sm text-steel-500">Estimated Total Cost</p>
                        <p className="text-xl font-bold text-steel-900">
                          ${selectedScenario.results.totalCost?.toLocaleString() || 0}
                        </p>
                      </div>
                      <div className="bg-steel-50 rounded-lg p-4">
                        <p className="text-sm text-steel-500">Avg Turn Time</p>
                        <p className="text-xl font-bold text-steel-900">
                          {selectedScenario.results.averageTurnTime?.toFixed(1) || 0} days
                        </p>
                      </div>
                    </div>

                    {/* Capacity Analysis */}
                    {selectedScenario.results.capacityAnalysis && (
                      <div className="border-t border-steel-200 pt-4">
                        <h4 className="text-sm font-medium text-steel-700 mb-3 flex items-center">
                          {selectedScenario.results.capacityAnalysis.hasOverload ? (
                            <>
                              <ExclamationTriangleIcon className="h-5 w-5 text-red-500 mr-2" />
                              Capacity Overload Detected
                            </>
                          ) : (
                            <>
                              <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2" />
                              All Shops Within Capacity
                            </>
                          )}
                        </h4>

                        {selectedScenario.results.capacityAnalysis.overloadedShops?.length > 0 && (
                          <div className="space-y-2">
                            {selectedScenario.results.capacityAnalysis.overloadedShops.map((overload: OverloadedShop, idx: number) => (
                              <div key={idx} className="bg-red-50 border border-red-200 rounded-lg p-3">
                                <div className="flex justify-between items-center">
                                  <span className="font-medium text-red-900">
                                    {overload.shopName} ({overload.shopCode})
                                  </span>
                                  <span className="text-red-600 text-sm">{overload.month}</span>
                                </div>
                                <div className="text-sm text-red-700 mt-1">
                                  Total load: {overload.totalLoad} / {overload.capacity} capacity
                                  ({overload.overloadPercent.toFixed(0)}% over)
                                </div>
                                <div className="text-xs text-red-600 mt-1">
                                  Existing: {overload.existingLoad} + Scenario: {overload.scenarioLoad}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Cars in scenario */}
                <div className="card">
                  <h3 className="text-lg font-medium text-steel-900 mb-4">
                    Cars in Scenario ({selectedScenario.cars?.length || 0})
                  </h3>
                  {!selectedScenario.cars || selectedScenario.cars.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-steel-500 mb-4">No cars added to this scenario yet.</p>
                      <button
                        onClick={() => setIsAddCarsModalOpen(true)}
                        className="btn-primary"
                      >
                        <PlusIcon className="mr-2 h-5 w-5 inline" />
                        Add Cars
                      </button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-steel-200">
                        <thead className="bg-steel-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                              Car #
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                              Type / Customer
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                              Month
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                              Suggested Shop
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                              Assigned Shop
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                              Score
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-steel-500 uppercase tracking-wider">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-steel-200">
                          {selectedScenario.cars.map((sc) => (
                            <tr key={sc.id} className="hover:bg-steel-50">
                              <td className="px-4 py-3 whitespace-nowrap">
                                <button
                                onClick={() => sc.car?.railcarNumber && handleRailcarClick(sc.car.railcarNumber)}
                                className="font-medium text-rail-600 hover:text-rail-800 hover:underline"
                              >
                                {sc.car?.railcarNumber}
                              </button>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="text-sm text-steel-900">{sc.car?.carType}</div>
                                <div className="text-xs text-steel-500">{sc.car?.customer}</div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-steel-500">
                                {sc.scheduledMonth}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                {sc.suggestedShop ? (
                                  <span className="text-sm text-amber-600">{sc.suggestedShop.name}</span>
                                ) : (
                                  <span className="text-sm text-steel-400">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                {sc.assignedShop ? (
                                  <span className="text-sm font-medium text-green-600">{sc.assignedShop.name}</span>
                                ) : (
                                  <span className="text-sm text-steel-400">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className={`text-sm font-medium ${sc.ruleScore > 60 ? 'text-green-600' : sc.ruleScore > 30 ? 'text-amber-600' : 'text-red-600'}`}>
                                  {sc.ruleScore?.toFixed(1) || '-'}
                                </span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-right">
                                <button
                                  onClick={() => handleGetRecommendations(sc)}
                                  className="text-rail-600 hover:text-rail-900 text-sm mr-3"
                                >
                                  View Options
                                </button>
                                <button
                                  onClick={() => handleRemoveCar(sc.id)}
                                  className="text-red-600 hover:text-red-900"
                                >
                                  <XMarkIcon className="h-5 w-5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="card text-center py-12">
                <p className="text-steel-500">Select a scenario to view details or create a new one</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Scenario Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-steel-900/50" onClick={() => setIsModalOpen(false)} />
            <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
              <h2 className="text-xl font-semibold text-steel-900 mb-4">Create New Scenario</h2>
              <form onSubmit={handleCreateScenario} className="space-y-4">
                <div>
                  <label className="label">
                    Project Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.projectNumber}
                    onChange={(e) => setFormData({ ...formData, projectNumber: e.target.value })}
                    className="input"
                    placeholder="e.g., Q4-25-001"
                    required
                  />
                  <p className="text-xs text-steel-500 mt-1">
                    Required project identifier for tracking and downstream systems
                  </p>
                </div>
                <div>
                  <label className="label">
                    Scenario Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="input"
                    placeholder="e.g., Initial Proposal, Revised Budget Plan"
                    required
                  />
                  <p className="text-xs text-steel-500 mt-1">
                    Human-readable name to identify this scenario
                  </p>
                </div>
                <div>
                  <label className="label">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="input"
                    rows={3}
                    placeholder="Describe the scenario purpose..."
                  />
                </div>
                <div>
                  <label className="label">Customer Filter (optional)</label>
                  <select
                    value={formData.customerFilter}
                    onChange={(e) => setFormData({ ...formData, customerFilter: e.target.value })}
                    className="input"
                  >
                    <option value="">All Customers</option>
                    {customers.map((customer) => (
                      <option key={customer} value={customer}>
                        {customer}
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

      {/* Add Cars Modal */}
      {isAddCarsModalOpen && selectedScenario && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-steel-900/50" onClick={() => setIsAddCarsModalOpen(false)} />
            <div className="relative w-full max-w-4xl rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-semibold text-steel-900 mb-4">Add Cars to Scenario</h2>

              <div className="grid grid-cols-3 gap-4 mb-6">
                <div>
                  <label className="label">Customer Filter</label>
                  <select
                    value={addCarsForm.customer}
                    onChange={(e) => setAddCarsForm({ ...addCarsForm, customer: e.target.value, selectedCarIds: [] })}
                    className="input"
                  >
                    <option value="">All Customers</option>
                    {customers.map((customer) => (
                      <option key={customer} value={customer}>
                        {customer}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Scheduled Month</label>
                  <select
                    value={addCarsForm.scheduledMonth}
                    onChange={(e) => setAddCarsForm({ ...addCarsForm, scheduledMonth: e.target.value })}
                    className="input"
                    required
                  >
                    <option value="">Select month...</option>
                    {getNextMonths().map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  {addCarsForm.customer && addCarsForm.scheduledMonth && (
                    <button
                      onClick={handleAddCarsByCustomer}
                      className="btn-primary w-full"
                    >
                      Add All {filteredCarsForModal.length} Cars
                    </button>
                  )}
                </div>
              </div>

              {/* Car selection table */}
              <div className="border border-steel-200 rounded-lg overflow-hidden mb-4">
                <div className="bg-steel-50 px-4 py-2 border-b border-steel-200">
                  <span className="text-sm font-medium text-steel-700">
                    {addCarsForm.selectedCarIds.length} cars selected
                  </span>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  <table className="min-w-full divide-y divide-steel-200">
                    <thead className="bg-steel-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left">
                          <input
                            type="checkbox"
                            checked={addCarsForm.selectedCarIds.length === filteredCarsForModal.length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setAddCarsForm({
                                  ...addCarsForm,
                                  selectedCarIds: filteredCarsForModal.map(c => c.id)
                                });
                              } else {
                                setAddCarsForm({ ...addCarsForm, selectedCarIds: [] });
                              }
                            }}
                            className="rounded border-steel-300"
                          />
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-steel-500 uppercase">Car #</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-steel-500 uppercase">Type</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-steel-500 uppercase">Customer</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-steel-500 uppercase">Reason</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-steel-500 uppercase">Region</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-steel-200">
                      {filteredCarsForModal.map(car => (
                        <tr
                          key={car.id}
                          className={`hover:bg-steel-50 cursor-pointer ${
                            addCarsForm.selectedCarIds.includes(car.id) ? 'bg-rail-50' : ''
                          }`}
                          onClick={() => toggleCarSelection(car.id)}
                        >
                          <td className="px-4 py-2">
                            <input
                              type="checkbox"
                              checked={addCarsForm.selectedCarIds.includes(car.id)}
                              onChange={() => toggleCarSelection(car.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded border-steel-300"
                            />
                          </td>
                          <td className="px-4 py-2 font-medium text-steel-900">{car.railcarNumber}</td>
                          <td className="px-4 py-2 text-sm text-steel-600">{car.carType}</td>
                          <td className="px-4 py-2 text-sm text-steel-600">{car.customer}</td>
                          <td className="px-4 py-2 text-sm text-steel-600">{car.reasonShopped}</td>
                          <td className="px-4 py-2 text-sm text-steel-600">{car.homeRegion}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end space-x-3">
                <button onClick={() => setIsAddCarsModalOpen(false)} className="btn-secondary">
                  Cancel
                </button>
                <button
                  onClick={handleAddSelectedCars}
                  disabled={addCarsForm.selectedCarIds.length === 0 || !addCarsForm.scheduledMonth}
                  className="btn-primary disabled:opacity-50"
                >
                  Add {addCarsForm.selectedCarIds.length} Selected Cars
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Shop Recommendations Modal */}
      {isRecommendationsModalOpen && selectedScenarioCar && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-steel-900/50" onClick={() => setIsRecommendationsModalOpen(false)} />
            <div className="relative w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
              <h2 className="text-xl font-semibold text-steel-900 mb-2">Shop Recommendations</h2>
              <p className="text-sm text-steel-500 mb-4">
                For: {selectedScenarioCar.car?.railcarNumber} ({selectedScenarioCar.car?.carType})
              </p>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {recommendations.length === 0 ? (
                  <p className="text-steel-500 text-center py-8">No recommendations available</p>
                ) : (
                  recommendations.map((rec, idx) => (
                    <div
                      key={rec.shopId}
                      className={`border rounded-lg p-4 ${
                        rec.isRecommended ? 'border-green-300 bg-green-50' : 'border-steel-200'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            {idx === 0 && (
                              <span className="bg-green-500 text-white text-xs px-2 py-0.5 rounded">
                                Best Match
                              </span>
                            )}
                            <h3 className="font-medium text-steel-900">{rec.shopName}</h3>
                            <span className="text-sm text-steel-500">({rec.shopCode})</span>
                          </div>
                          <div className="mt-2 text-sm text-steel-600">
                            <p>Score: <span className="font-semibold">{rec.score.toFixed(1)}</span></p>
                            <p>Est. Cost: ${rec.estimatedCost.toLocaleString()}</p>
                            <p>Est. Days: {rec.estimatedDays}</p>
                            <p>Available Capacity: {rec.capacityAvailable}</p>
                          </div>
                          {rec.reasons.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs text-steel-500">Reasons:</p>
                              <ul className="text-xs text-steel-600 list-disc list-inside">
                                {rec.reasons.map((reason, i) => (
                                  <li key={i}>{reason}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleAssignShop(rec.shopId)}
                          className={`${rec.isRecommended ? 'btn-primary' : 'btn-secondary'} py-2 px-4 text-sm`}
                        >
                          Assign
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex justify-end mt-4">
                <button onClick={() => setIsRecommendationsModalOpen(false)} className="btn-secondary">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Commit to Plan Modal */}
      {isCommitModalOpen && selectedScenario && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-steel-900/50" onClick={() => setIsCommitModalOpen(false)} />
            <div className="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
              <h2 className="text-xl font-semibold text-steel-900 mb-4">Commit Scenario to Plan</h2>

              {/* Scenario Summary */}
              <div className="bg-steel-50 rounded-lg p-4 mb-4">
                <h3 className="font-medium text-steel-900 mb-2">{selectedScenario.name}</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <p className="text-steel-600">
                    <span className="text-steel-500">Total Cars:</span> {selectedScenario.cars?.length || 0}
                  </p>
                  <p className="text-steel-600">
                    <span className="text-steel-500">Assigned:</span>{' '}
                    {selectedScenario.cars?.filter(c => c.assignedShopId || c.suggestedShopId).length || 0}
                  </p>
                  {selectedScenario.results && (
                    <>
                      <p className="text-steel-600">
                        <span className="text-steel-500">Est. Cost:</span> ${selectedScenario.results.totalCost?.toLocaleString() || 0}
                      </p>
                      <p className="text-steel-600">
                        <span className="text-steel-500">Avg Time:</span> {selectedScenario.results.averageTurnTime?.toFixed(0) || 0} days
                      </p>
                    </>
                  )}
                </div>

                {/* Capacity Warning */}
                {selectedScenario.results?.capacityAnalysis?.hasOverload && (
                  <div className="mt-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded p-2">
                    <ExclamationTriangleIcon className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-red-800">Capacity Warning</p>
                      <p className="text-red-700">
                        {selectedScenario.results.capacityAnalysis.totalOverloadInstances} shop(s) will exceed capacity
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Plan Selection */}
              <div className="mb-6">
                <label className="label">Select Target Plan</label>
                <select
                  value={commitPlanId}
                  onChange={(e) => setCommitPlanId(e.target.value)}
                  className="input"
                >
                  <option value="">Choose a plan...</option>
                  {plans.filter(p => p.status === 'active' || p.status === 'draft').map(plan => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} ({plan.status})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setIsCommitModalOpen(false);
                    setCommitPlanId('');
                  }}
                  className="btn-secondary"
                  disabled={isCommitting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCommitToPlan}
                  disabled={!commitPlanId || isCommitting}
                  className="btn-primary disabled:opacity-50 flex items-center"
                >
                  {isCommitting ? (
                    <>
                      <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" />
                      Committing...
                    </>
                  ) : (
                    <>
                      <CheckIcon className="mr-2 h-4 w-4" />
                      Commit {selectedScenario.cars?.length || 0} Assignments
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
