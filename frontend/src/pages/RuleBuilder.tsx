import { useState, useEffect, useCallback } from 'react';
import {
  CogIcon,
  PlusIcon,
  TrashIcon,
  PencilIcon,
  ArrowsUpDownIcon,
  PlayIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext';

interface RuleCondition {
  [key: string]: unknown;
}

interface RuleAction {
  [key: string]: unknown;
}

interface RuleSchema {
  label: string;
  description: string;
  conditions: { key: string; type: string; label: string; default: unknown }[];
  actions: { key: string; type: string; label: string; default: unknown }[];
}

interface ShopRule {
  id: string;
  name: string;
  description: string;
  ruleType: string;
  priority: number;
  isActive: boolean;
  conditions: RuleCondition;
  actions: RuleAction;
  schema?: RuleSchema;
}

interface RuleTestResult {
  carId: string;
  carNumber: string;
  suggestedShopId: string | null;
  suggestedShopName: string | null;
  allScores: {
    shopId: string;
    shopName: string;
    shopCode: string;
    score: number;
    reasons: string[];
    estimatedCost: number;
    estimatedDays: number;
    capacityAvailable: number;
    isRecommended: boolean;
  }[];
  ruleNotes: string;
}

const RULE_TYPE_COLORS: Record<string, string> = {
  capacity: 'bg-blue-100 text-blue-800 border-blue-200',
  car_type: 'bg-purple-100 text-purple-800 border-purple-200',
  region: 'bg-green-100 text-green-800 border-green-200',
  customer: 'bg-amber-100 text-amber-800 border-amber-200',
  cost: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  turn_time: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  performance: 'bg-rose-100 text-rose-800 border-rose-200',
  custom: 'bg-steel-100 text-steel-800 border-steel-200',
};

export default function RuleBuilder() {
  const { token } = useAuth();
  const [rules, setRules] = useState<ShopRule[]>([]);
  const [schemas, setSchemas] = useState<Record<string, RuleSchema>>({});
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<ShopRule | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set());
  const [testResult, setTestResult] = useState<RuleTestResult | null>(null);
  const [testCar, setTestCar] = useState('');
  const [testMonth, setTestMonth] = useState('');
  const [cars, setCars] = useState<{ id: string; vehicleNumber: string }[]>([]);

  const fetchRules = useCallback(async () => {
    try {
      const [rulesRes, schemasRes] = await Promise.all([
        fetch('/api/shop-rules', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/shop-rules/schemas', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (rulesRes.ok) {
        const data = await rulesRes.json();
        setRules(data);
      }

      if (schemasRes.ok) {
        const data = await schemasRes.json();
        setSchemas(data);
      }
    } catch (error) {
      console.error('Error fetching rules:', error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchCars = useCallback(async () => {
    try {
      const res = await fetch('/api/cars?pageSize=100', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const response = await res.json();
        // API returns { data: [...], total, page, pageSize, totalPages }
        const carList = response.data || [];
        // Map to include both id and railcarNumber for the dropdown
        setCars(carList.map((car: any) => ({
          id: car.id,
          vehicleNumber: car.railcarNumber || car.vehicleNumber,
        })));
      }
    } catch (error) {
      console.error('Error fetching cars:', error);
    }
  }, [token]);

  useEffect(() => {
    fetchRules();
    fetchCars();
  }, [fetchRules, fetchCars]);

  const toggleRule = async (id: string) => {
    try {
      const res = await fetch(`/api/shop-rules/${id}/toggle`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const updated = await res.json();
        setRules(prev => prev.map(r => r.id === id ? updated : r));
      }
    } catch (error) {
      console.error('Error toggling rule:', error);
    }
  };

  const deleteRule = async (id: string) => {
    if (!confirm('Are you sure you want to delete this rule?')) return;

    try {
      const res = await fetch(`/api/shop-rules/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setRules(prev => prev.filter(r => r.id !== id));
      }
    } catch (error) {
      console.error('Error deleting rule:', error);
    }
  };

  const saveRule = async (rule: Partial<ShopRule>) => {
    try {
      const url = rule.id ? `/api/shop-rules/${rule.id}` : '/api/shop-rules';
      const method = rule.id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(rule),
      });

      if (res.ok) {
        const saved = await res.json();
        if (rule.id) {
          setRules(prev => prev.map(r => r.id === rule.id ? saved : r));
        } else {
          setRules(prev => [...prev, saved]);
        }
        setEditingRule(null);
        setIsCreating(false);
      }
    } catch (error) {
      console.error('Error saving rule:', error);
    }
  };

  const resetToDefaults = async () => {
    if (!confirm('This will replace all your rules with the defaults. Continue?')) return;

    try {
      const res = await fetch('/api/shop-rules/reset-defaults', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const defaults = await res.json();
        setRules(defaults);
      }
    } catch (error) {
      console.error('Error resetting rules:', error);
    }
  };

  const testRules = async () => {
    if (!testCar || !testMonth) return;

    try {
      const res = await fetch('/api/shop-rules/test', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ carId: testCar, month: testMonth }),
      });

      if (res.ok) {
        const result = await res.json();
        setTestResult(result);
      }
    } catch (error) {
      console.error('Error testing rules:', error);
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedRules(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-navy-600" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-steel-900 flex items-center gap-2">
            <CogIcon className="h-7 w-7 text-navy-600" />
            Shop Assignment Rules
          </h1>
          <p className="text-steel-500 mt-1">
            Configure rules for automatic shop recommendations
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={resetToDefaults}
            className="px-4 py-2 border border-steel-300 rounded-lg text-steel-700 hover:bg-steel-50 flex items-center gap-2"
          >
            <ArrowPathIcon className="h-4 w-4" />
            Reset to Defaults
          </button>
          <button
            onClick={() => {
              setIsCreating(true);
              setEditingRule({
                id: '',
                name: '',
                description: '',
                ruleType: 'custom',
                priority: 50,
                isActive: true,
                conditions: {},
                actions: {},
              });
            }}
            className="px-4 py-2 bg-navy-600 text-white rounded-lg hover:bg-navy-700 flex items-center gap-2"
          >
            <PlusIcon className="h-4 w-4" />
            Add Rule
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Rules List */}
        <div className="lg:col-span-2 space-y-4">
          {rules.length === 0 ? (
            <div className="bg-white rounded-lg border border-steel-200 p-8 text-center">
              <CogIcon className="h-12 w-12 text-steel-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-steel-900 mb-2">No Rules Configured</h3>
              <p className="text-steel-500 mb-4">
                Add rules to customize how shops are recommended for car assignments.
              </p>
              <button
                onClick={resetToDefaults}
                className="px-4 py-2 bg-navy-600 text-white rounded-lg hover:bg-navy-700"
              >
                Load Default Rules
              </button>
            </div>
          ) : (
            rules.map((rule, index) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                index={index}
                totalRules={rules.length}
                isExpanded={expandedRules.has(rule.id)}
                onToggleExpand={() => toggleExpanded(rule.id)}
                onEdit={() => setEditingRule(rule)}
                onToggle={() => toggleRule(rule.id)}
                onDelete={() => deleteRule(rule.id)}
              />
            ))
          )}
        </div>

        {/* Test Panel */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-steel-200 p-4">
            <h3 className="font-medium text-steel-900 mb-4 flex items-center gap-2">
              <PlayIcon className="h-5 w-5 text-navy-600" />
              Test Rules
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-steel-700 mb-1">
                  Select Car
                </label>
                <select
                  value={testCar}
                  onChange={(e) => setTestCar(e.target.value)}
                  className="w-full px-3 py-2 border border-steel-300 rounded-lg focus:ring-2 focus:ring-navy-500 focus:border-navy-500"
                >
                  <option value="">Choose a car...</option>
                  {cars.map(car => (
                    <option key={car.id} value={car.id}>
                      {car.vehicleNumber}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-steel-700 mb-1">
                  Target Month
                </label>
                <input
                  type="month"
                  value={testMonth}
                  onChange={(e) => setTestMonth(e.target.value)}
                  className="w-full px-3 py-2 border border-steel-300 rounded-lg focus:ring-2 focus:ring-navy-500 focus:border-navy-500"
                />
              </div>

              <button
                onClick={testRules}
                disabled={!testCar || !testMonth}
                className="w-full px-4 py-2 bg-navy-600 text-white rounded-lg hover:bg-navy-700 disabled:bg-steel-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <PlayIcon className="h-4 w-4" />
                Run Test
              </button>
            </div>

            {testResult && (
              <div className="mt-4 pt-4 border-t border-steel-200">
                <h4 className="font-medium text-steel-900 mb-2">Results</h4>
                <div className="bg-steel-50 rounded-lg p-3 mb-3">
                  <p className="text-sm text-steel-600">Car: {testResult.carNumber}</p>
                  <p className="text-sm font-medium text-steel-900 mt-1">
                    {testResult.suggestedShopName ? (
                      <span className="text-green-600">
                        Recommended: {testResult.suggestedShopName}
                      </span>
                    ) : (
                      <span className="text-amber-600">No suitable shop found</span>
                    )}
                  </p>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {testResult.allScores.slice(0, 5).map((score) => (
                    <div
                      key={score.shopId}
                      className={`p-2 rounded border ${
                        score.isRecommended
                          ? 'bg-green-50 border-green-200'
                          : 'bg-white border-steel-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{score.shopName}</span>
                        <span className={`text-sm font-bold ${
                          score.score > 60 ? 'text-green-600' :
                          score.score > 30 ? 'text-amber-600' : 'text-red-600'
                        }`}>
                          {score.score.toFixed(1)}
                        </span>
                      </div>
                      <div className="text-xs text-steel-500 mt-1">
                        {score.reasons.slice(0, 2).join(' | ')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="bg-white rounded-lg border border-steel-200 p-4">
            <h3 className="font-medium text-steel-900 mb-3">Rule Types</h3>
            <div className="space-y-2">
              {Object.entries(schemas).map(([type, schema]) => (
                <div key={type} className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-xs rounded-full border ${RULE_TYPE_COLORS[type] || RULE_TYPE_COLORS.custom}`}>
                    {type}
                  </span>
                  <span className="text-sm text-steel-600">{schema.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {(editingRule || isCreating) && (
        <RuleEditModal
          rule={editingRule!}
          schemas={schemas}
          onSave={saveRule}
          onClose={() => {
            setEditingRule(null);
            setIsCreating(false);
          }}
        />
      )}
    </div>
  );
}

// Rule Card Component
function RuleCard({
  rule,
  index,
  totalRules: _totalRules,
  isExpanded,
  onToggleExpand,
  onEdit,
  onToggle,
  onDelete,
}: {
  rule: ShopRule;
  index: number;
  totalRules: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={`bg-white rounded-lg border ${rule.isActive ? 'border-steel-200' : 'border-steel-100 opacity-60'}`}>
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-center text-steel-400">
              <ArrowsUpDownIcon className="h-4 w-4" />
              <span className="text-xs mt-1">#{index + 1}</span>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-steel-900">{rule.name}</h3>
                <span className={`px-2 py-0.5 text-xs rounded-full border ${RULE_TYPE_COLORS[rule.ruleType] || RULE_TYPE_COLORS.custom}`}>
                  {rule.ruleType}
                </span>
              </div>
              {rule.description && (
                <p className="text-sm text-steel-500 mt-1">{rule.description}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onToggle}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                rule.isActive
                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                  : 'bg-steel-100 text-steel-500 hover:bg-steel-200'
              }`}
            >
              {rule.isActive ? 'Active' : 'Inactive'}
            </button>

            <button
              onClick={onEdit}
              className="p-2 text-steel-400 hover:text-navy-600 hover:bg-steel-50 rounded-lg"
            >
              <PencilIcon className="h-4 w-4" />
            </button>

            <button
              onClick={onDelete}
              className="p-2 text-steel-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
            >
              <TrashIcon className="h-4 w-4" />
            </button>

            <button
              onClick={onToggleExpand}
              className="p-2 text-steel-400 hover:text-steel-600 hover:bg-steel-50 rounded-lg"
            >
              {isExpanded ? (
                <ChevronUpIcon className="h-4 w-4" />
              ) : (
                <ChevronDownIcon className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-steel-100">
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <h4 className="text-xs font-medium text-steel-500 uppercase mb-2">Conditions</h4>
              <pre className="text-xs bg-steel-50 p-2 rounded overflow-x-auto">
                {JSON.stringify(rule.conditions, null, 2)}
              </pre>
            </div>
            <div>
              <h4 className="text-xs font-medium text-steel-500 uppercase mb-2">Actions</h4>
              <pre className="text-xs bg-steel-50 p-2 rounded overflow-x-auto">
                {JSON.stringify(rule.actions, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Rule Edit Modal
function RuleEditModal({
  rule,
  schemas,
  onSave,
  onClose,
}: {
  rule: ShopRule;
  schemas: Record<string, RuleSchema>;
  onSave: (rule: Partial<ShopRule>) => void;
  onClose: () => void;
}) {
  const [formData, setFormData] = useState({
    ...rule,
    conditions: { ...rule.conditions },
    actions: { ...rule.actions },
  });

  const schema = schemas[formData.ruleType];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const updateCondition = (key: string, value: unknown) => {
    setFormData(prev => ({
      ...prev,
      conditions: { ...prev.conditions, [key]: value },
    }));
  };

  const updateAction = (key: string, value: unknown) => {
    setFormData(prev => ({
      ...prev,
      actions: { ...prev.actions, [key]: value },
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-steel-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-steel-900">
              {rule.id ? 'Edit Rule' : 'Create Rule'}
            </h2>
            <button
              onClick={onClose}
              className="p-2 text-steel-400 hover:text-steel-600 rounded-lg"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-steel-700 mb-1">
                Rule Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 border border-steel-300 rounded-lg focus:ring-2 focus:ring-navy-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-steel-700 mb-1">
                Rule Type
              </label>
              <select
                value={formData.ruleType}
                onChange={(e) => {
                  const newType = e.target.value;
                  const newSchema = schemas[newType];
                  setFormData(prev => ({
                    ...prev,
                    ruleType: newType,
                    conditions: newSchema?.conditions.reduce((acc, c) => ({ ...acc, [c.key]: c.default }), {}) || {},
                    actions: newSchema?.actions.reduce((acc, a) => ({ ...acc, [a.key]: a.default }), {}) || {},
                  }));
                }}
                className="w-full px-3 py-2 border border-steel-300 rounded-lg focus:ring-2 focus:ring-navy-500"
              >
                {Object.entries(schemas).map(([type, s]) => (
                  <option key={type} value={type}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-steel-700 mb-1">
              Description
            </label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-3 py-2 border border-steel-300 rounded-lg focus:ring-2 focus:ring-navy-500"
              placeholder="Optional description..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-steel-700 mb-1">
                Priority (1-100)
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={formData.priority}
                onChange={(e) => setFormData(prev => ({ ...prev, priority: parseInt(e.target.value) || 50 }))}
                className="w-full px-3 py-2 border border-steel-300 rounded-lg focus:ring-2 focus:ring-navy-500"
              />
              <p className="text-xs text-steel-500 mt-1">Higher priority rules are evaluated first</p>
            </div>

            <div className="flex items-center pt-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                  className="w-4 h-4 rounded border-steel-300 text-navy-600 focus:ring-navy-500"
                />
                <span className="text-sm font-medium text-steel-700">Rule is active</span>
              </label>
            </div>
          </div>

          {/* Conditions */}
          {schema && schema.conditions.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-steel-900 mb-3">Conditions</h3>
              <div className="space-y-3 bg-steel-50 p-4 rounded-lg">
                {schema.conditions.map((cond) => (
                  <div key={cond.key} className="flex items-center gap-3">
                    <label className="text-sm text-steel-700 w-48">{cond.label}</label>
                    {cond.type === 'boolean' ? (
                      <input
                        type="checkbox"
                        checked={!!formData.conditions[cond.key]}
                        onChange={(e) => updateCondition(cond.key, e.target.checked)}
                        className="w-4 h-4 rounded border-steel-300 text-navy-600"
                      />
                    ) : cond.type === 'number' ? (
                      <input
                        type="number"
                        value={formData.conditions[cond.key] as number ?? cond.default}
                        onChange={(e) => updateCondition(cond.key, parseFloat(e.target.value))}
                        className="w-24 px-2 py-1 border border-steel-300 rounded"
                      />
                    ) : (
                      <input
                        type="text"
                        value={String(formData.conditions[cond.key] ?? '')}
                        onChange={(e) => updateCondition(cond.key, e.target.value)}
                        className="flex-1 px-2 py-1 border border-steel-300 rounded"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          {schema && schema.actions.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-steel-900 mb-3">Actions</h3>
              <div className="space-y-3 bg-steel-50 p-4 rounded-lg">
                {schema.actions.map((action) => (
                  <div key={action.key} className="flex items-center gap-3">
                    <label className="text-sm text-steel-700 w-48">{action.label}</label>
                    {action.type === 'boolean' ? (
                      <input
                        type="checkbox"
                        checked={!!formData.actions[action.key]}
                        onChange={(e) => updateAction(action.key, e.target.checked)}
                        className="w-4 h-4 rounded border-steel-300 text-navy-600"
                      />
                    ) : action.type === 'number' ? (
                      <input
                        type="number"
                        value={formData.actions[action.key] as number ?? action.default}
                        onChange={(e) => updateAction(action.key, parseFloat(e.target.value))}
                        className="w-24 px-2 py-1 border border-steel-300 rounded"
                        step={action.key.includes('Weight') ? '0.05' : '1'}
                      />
                    ) : (
                      <input
                        type="text"
                        value={String(formData.actions[action.key] ?? '')}
                        onChange={(e) => updateAction(action.key, e.target.value)}
                        className="flex-1 px-2 py-1 border border-steel-300 rounded"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-4 border-t border-steel-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-steel-300 rounded-lg text-steel-700 hover:bg-steel-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-navy-600 text-white rounded-lg hover:bg-navy-700 flex items-center gap-2"
            >
              <CheckCircleIcon className="h-4 w-4" />
              Save Rule
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
