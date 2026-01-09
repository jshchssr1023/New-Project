import { useState, useEffect, Fragment } from 'react';
import { Dialog, Transition, Switch, Listbox } from '@headlessui/react';
import {
  PlusIcon,
  TrashIcon,
  PencilIcon,
  BoltIcon,
  CheckIcon,
  ChevronUpDownIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

interface WebhookConfig {
  id: string;
  name: string;
  type: 'slack' | 'teams' | 'custom';
  url: string;
  isActive: boolean;
  categories: string[];
  severities: string[];
  createdAt: string;
}

interface WebhookOptions {
  categories: { value: string; label: string; description: string }[];
  severities: { value: string; label: string; color: string }[];
  types: { value: string; label: string; icon: string }[];
}

const SEVERITY_COLORS: Record<string, string> = {
  info: 'bg-blue-100 text-blue-800',
  warning: 'bg-amber-100 text-amber-800',
  critical: 'bg-red-100 text-red-800',
};

const CATEGORY_LABELS: Record<string, string> = {
  security: 'Security',
  capacity: 'Capacity',
  performance: 'Performance',
  system: 'System',
  data_change: 'Data Changes',
};

export default function Webhooks() {
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [options, setOptions] = useState<WebhookOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<WebhookConfig | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    type: 'slack' as 'slack' | 'teams' | 'custom',
    url: '',
    categories: [] as string[],
    severities: [] as string[],
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchWebhooks();
    fetchOptions();
  }, []);

  const fetchWebhooks = async () => {
    try {
      const res = await fetch('/api/webhooks', {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setWebhooks(data.configs);
      }
    } catch (error) {
      console.error('Error fetching webhooks:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOptions = async () => {
    try {
      const res = await fetch('/api/webhooks/options', {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setOptions(data);
      }
    } catch (error) {
      console.error('Error fetching options:', error);
    }
  };

  const openCreateModal = () => {
    setEditingWebhook(null);
    setFormData({
      name: '',
      type: 'slack',
      url: '',
      categories: options?.categories.map(c => c.value) || [],
      severities: options?.severities.map(s => s.value) || [],
    });
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (webhook: WebhookConfig) => {
    setEditingWebhook(webhook);
    setFormData({
      name: webhook.name,
      type: webhook.type,
      url: webhook.url,
      categories: webhook.categories,
      severities: webhook.severities,
    });
    setFormError('');
    setModalOpen(true);
  };

  const handleSave = async () => {
    setFormError('');

    if (!formData.name.trim()) {
      setFormError('Name is required');
      return;
    }
    if (!formData.url.trim()) {
      setFormError('URL is required');
      return;
    }
    try {
      new URL(formData.url);
    } catch {
      setFormError('Invalid URL format');
      return;
    }
    if (formData.categories.length === 0) {
      setFormError('Select at least one category');
      return;
    }
    if (formData.severities.length === 0) {
      setFormError('Select at least one severity level');
      return;
    }

    setSaving(true);
    try {
      const method = editingWebhook ? 'PUT' : 'POST';
      const url = editingWebhook ? `/api/webhooks/${editingWebhook.id}` : '/api/webhooks';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save webhook');
      }

      setModalOpen(false);
      fetchWebhooks();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to save webhook');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this webhook?')) return;

    try {
      const res = await fetch(`/api/webhooks/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (res.ok) {
        setWebhooks(webhooks.filter(w => w.id !== id));
      }
    } catch (error) {
      console.error('Error deleting webhook:', error);
    }
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      const res = await fetch(`/api/webhooks/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ isActive }),
      });

      if (res.ok) {
        setWebhooks(webhooks.map(w => (w.id === id ? { ...w, isActive } : w)));
      }
    } catch (error) {
      console.error('Error toggling webhook:', error);
    }
  };

  const handleTest = async (webhook: WebhookConfig) => {
    setTesting(webhook.id);
    setTestResult(null);

    try {
      const res = await fetch(`/api/webhooks/${webhook.id}/test`, {
        method: 'POST',
        credentials: 'include',
      });

      const data = await res.json();
      setTestResult({
        id: webhook.id,
        success: data.success,
        message: data.success ? 'Test message sent successfully!' : data.error || 'Test failed',
      });
    } catch (error) {
      setTestResult({
        id: webhook.id,
        success: false,
        message: 'Failed to send test message',
      });
    } finally {
      setTesting(null);
    }
  };

  const handleTestUrl = async () => {
    setFormError('');
    if (!formData.url) {
      setFormError('Enter a URL to test');
      return;
    }

    try {
      new URL(formData.url);
    } catch {
      setFormError('Invalid URL format');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/webhooks/test-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ type: formData.type, url: formData.url }),
      });

      const data = await res.json();
      if (data.success) {
        setFormError('');
        alert('Test message sent successfully!');
      } else {
        setFormError(data.error || 'Test failed');
      }
    } catch (error) {
      setFormError('Failed to test webhook');
    } finally {
      setSaving(false);
    }
  };

  const toggleCategory = (category: string) => {
    setFormData(prev => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter(c => c !== category)
        : [...prev.categories, category],
    }));
  };

  const toggleSeverity = (severity: string) => {
    setFormData(prev => ({
      ...prev,
      severities: prev.severities.includes(severity)
        ? prev.severities.filter(s => s !== severity)
        : [...prev.severities, severity],
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-navy-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-steel-900">Webhook Alerts</h1>
          <p className="text-steel-500 mt-1">
            Configure Slack, Teams, or custom webhooks to receive alerts
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2 bg-navy-600 text-white rounded-lg hover:bg-navy-700"
        >
          <PlusIcon className="h-5 w-5" />
          Add Webhook
        </button>
      </div>

      {/* Webhooks List */}
      {webhooks.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <BoltIcon className="h-12 w-12 text-steel-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-steel-900 mb-2">No webhooks configured</h3>
          <p className="text-steel-500 mb-6">
            Add a webhook to receive alerts in Slack, Microsoft Teams, or any custom endpoint.
          </p>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-navy-600 text-white rounded-lg hover:bg-navy-700"
          >
            <PlusIcon className="h-5 w-5" />
            Add Your First Webhook
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-steel-200">
            <thead className="bg-steel-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                  Webhook
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                  Categories
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                  Severities
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-steel-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-steel-200">
              {webhooks.map((webhook) => (
                <tr key={webhook.id} className={!webhook.isActive ? 'bg-steel-50 opacity-60' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-8 h-8 bg-steel-100 rounded-full flex items-center justify-center">
                        <span className="text-xs font-bold uppercase">{webhook.type[0]}</span>
                      </div>
                      <div>
                        <div className="font-medium text-steel-900">{webhook.name}</div>
                        <div className="text-xs text-steel-500 capitalize">{webhook.type}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {webhook.categories.map((cat) => (
                        <span
                          key={cat}
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-steel-100 text-steel-700"
                        >
                          {CATEGORY_LABELS[cat] || cat}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {webhook.severities.map((sev) => (
                        <span
                          key={sev}
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${SEVERITY_COLORS[sev]}`}
                        >
                          {sev}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Switch
                      checked={webhook.isActive}
                      onChange={(checked) => handleToggle(webhook.id, checked)}
                      className={`${
                        webhook.isActive ? 'bg-green-600' : 'bg-steel-300'
                      } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out`}
                    >
                      <span
                        className={`${
                          webhook.isActive ? 'translate-x-5' : 'translate-x-0'
                        } pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
                      />
                    </Switch>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleTest(webhook)}
                        disabled={testing === webhook.id}
                        className="p-2 text-steel-400 hover:text-navy-600 disabled:opacity-50"
                        title="Send test message"
                      >
                        {testing === webhook.id ? (
                          <div className="animate-spin h-4 w-4 border-2 border-navy-600 border-t-transparent rounded-full" />
                        ) : (
                          <BoltIcon className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        onClick={() => openEditModal(webhook)}
                        className="p-2 text-steel-400 hover:text-navy-600"
                        title="Edit"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(webhook.id)}
                        className="p-2 text-steel-400 hover:text-red-600"
                        title="Delete"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                    {testResult && testResult.id === webhook.id && (
                      <div
                        className={`mt-1 text-xs ${
                          testResult.success ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {testResult.message}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Transition appear show={modalOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setModalOpen(false)}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/30" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-2xl bg-white p-6 shadow-xl transition-all">
                  <Dialog.Title className="text-lg font-medium text-steel-900 mb-4">
                    {editingWebhook ? 'Edit Webhook' : 'Add Webhook'}
                  </Dialog.Title>

                  <div className="space-y-4">
                    {/* Name */}
                    <div>
                      <label className="block text-sm font-medium text-steel-700 mb-1">Name</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g., Production Alerts"
                        className="w-full border border-steel-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-navy-500 focus:border-navy-500"
                      />
                    </div>

                    {/* Type */}
                    <div>
                      <label className="block text-sm font-medium text-steel-700 mb-1">Type</label>
                      <Listbox
                        value={formData.type}
                        onChange={(value) => setFormData({ ...formData, type: value })}
                      >
                        <div className="relative">
                          <Listbox.Button className="relative w-full cursor-pointer rounded-lg border border-steel-300 bg-white py-2 pl-3 pr-10 text-left focus:outline-none focus:ring-2 focus:ring-navy-500">
                            <span className="block truncate capitalize">{formData.type}</span>
                            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                              <ChevronUpDownIcon className="h-5 w-5 text-steel-400" />
                            </span>
                          </Listbox.Button>
                          <Transition
                            as={Fragment}
                            leave="transition ease-in duration-100"
                            leaveFrom="opacity-100"
                            leaveTo="opacity-0"
                          >
                            <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                              {options?.types.map((type) => (
                                <Listbox.Option
                                  key={type.value}
                                  value={type.value}
                                  className={({ active }) =>
                                    `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                                      active ? 'bg-navy-100 text-navy-900' : 'text-steel-900'
                                    }`
                                  }
                                >
                                  {({ selected }) => (
                                    <>
                                      <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                                        {type.label}
                                      </span>
                                      {selected && (
                                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-navy-600">
                                          <CheckIcon className="h-5 w-5" />
                                        </span>
                                      )}
                                    </>
                                  )}
                                </Listbox.Option>
                              ))}
                            </Listbox.Options>
                          </Transition>
                        </div>
                      </Listbox>
                    </div>

                    {/* URL */}
                    <div>
                      <label className="block text-sm font-medium text-steel-700 mb-1">Webhook URL</label>
                      <div className="flex gap-2">
                        <input
                          type="url"
                          value={formData.url}
                          onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                          placeholder={
                            formData.type === 'slack'
                              ? 'https://hooks.slack.com/services/...'
                              : formData.type === 'teams'
                              ? 'https://outlook.office.com/webhook/...'
                              : 'https://your-endpoint.com/webhook'
                          }
                          className="flex-1 border border-steel-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-navy-500 focus:border-navy-500"
                        />
                        <button
                          type="button"
                          onClick={handleTestUrl}
                          disabled={saving}
                          className="px-3 py-2 border border-steel-300 rounded-lg text-steel-700 hover:bg-steel-50"
                        >
                          Test
                        </button>
                      </div>
                    </div>

                    {/* Categories */}
                    <div>
                      <label className="block text-sm font-medium text-steel-700 mb-2">Alert Categories</label>
                      <div className="flex flex-wrap gap-2">
                        {options?.categories.map((cat) => (
                          <button
                            key={cat.value}
                            type="button"
                            onClick={() => toggleCategory(cat.value)}
                            className={`px-3 py-1.5 rounded-full text-sm ${
                              formData.categories.includes(cat.value)
                                ? 'bg-navy-100 text-navy-700 ring-1 ring-navy-500'
                                : 'bg-steel-100 text-steel-600 hover:bg-steel-200'
                            }`}
                          >
                            {cat.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Severities */}
                    <div>
                      <label className="block text-sm font-medium text-steel-700 mb-2">Severity Levels</label>
                      <div className="flex flex-wrap gap-2">
                        {options?.severities.map((sev) => (
                          <button
                            key={sev.value}
                            type="button"
                            onClick={() => toggleSeverity(sev.value)}
                            className={`px-3 py-1.5 rounded-full text-sm ${
                              formData.severities.includes(sev.value)
                                ? SEVERITY_COLORS[sev.value] + ' ring-1 ring-current'
                                : 'bg-steel-100 text-steel-600 hover:bg-steel-200'
                            }`}
                          >
                            {sev.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Error */}
                    {formError && (
                      <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">
                        <ExclamationTriangleIcon className="h-5 w-5" />
                        {formError}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-3 mt-6">
                    <button
                      onClick={() => setModalOpen(false)}
                      className="px-4 py-2 border border-steel-300 rounded-lg text-steel-700 hover:bg-steel-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-4 py-2 bg-navy-600 text-white rounded-lg hover:bg-navy-700 disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : editingWebhook ? 'Save Changes' : 'Create Webhook'}
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
}
