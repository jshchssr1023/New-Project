import { useState, useEffect } from 'react';

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string[];
  rateLimit: number;
  rateLimitWindow: number;
  isActive: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface PermissionGroup {
  all: string[];
  grouped: {
    read: string[];
    write: string[];
    admin: string[];
  };
}

export default function ApiKeys() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [permissions, setPermissions] = useState<PermissionGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  // Create form state
  const [formData, setFormData] = useState({
    name: '',
    permissions: [] as string[],
    rateLimit: 1000,
    rateLimitWindow: 3600,
    expiresAt: '',
  });

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

  useEffect(() => {
    fetchKeys();
    fetchPermissions();
  }, []);

  async function fetchKeys() {
    try {
      const res = await fetch(`${API_URL}/api/api-keys`, {
        credentials: 'include',
      });
      const data = await res.json();
      setKeys(data.data || []);
    } catch (error) {
      console.error('Failed to fetch API keys:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPermissions() {
    try {
      const res = await fetch(`${API_URL}/api/api-keys/permissions`, {
        credentials: 'include',
      });
      const data = await res.json();
      setPermissions(data.data);
    } catch (error) {
      console.error('Failed to fetch permissions:', error);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/api-keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          ...formData,
          expiresAt: formData.expiresAt || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewKey(data.fullKey);
        fetchKeys();
        setFormData({
          name: '',
          permissions: [],
          rateLimit: 1000,
          rateLimitWindow: 3600,
          expiresAt: '',
        });
      }
    } catch (error) {
      console.error('Failed to create API key:', error);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm('Are you sure you want to revoke this API key?')) return;
    try {
      await fetch(`${API_URL}/api/api-keys/${id}/revoke`, {
        method: 'POST',
        credentials: 'include',
      });
      fetchKeys();
    } catch (error) {
      console.error('Failed to revoke API key:', error);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to permanently delete this API key?')) return;
    try {
      await fetch(`${API_URL}/api/api-keys/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      fetchKeys();
    } catch (error) {
      console.error('Failed to delete API key:', error);
    }
  }

  function togglePermission(perm: string) {
    setFormData((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter((p) => p !== perm)
        : [...prev.permissions, perm],
    }));
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
          <p className="text-gray-600 mt-1">
            Manage API keys for programmatic access to Chronos Scheduler
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create API Key
        </button>
      </div>

      {/* API Documentation Link */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h3 className="font-medium text-blue-900">Public REST API</h3>
            <p className="text-sm text-blue-700 mt-1">
              Base URL: <code className="bg-blue-100 px-1 rounded">{API_URL}/api/v1</code>
            </p>
            <p className="text-sm text-blue-700 mt-1">
              Include the API key in requests using the <code className="bg-blue-100 px-1 rounded">X-API-Key</code> header.
            </p>
          </div>
        </div>
      </div>

      {/* Newly Created Key Alert */}
      {newKey && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-green-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <h3 className="font-medium text-green-900">API Key Created</h3>
              <p className="text-sm text-green-700 mt-1">
                Copy your API key now. You won't be able to see it again!
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="bg-green-100 px-3 py-2 rounded text-sm font-mono flex-1 break-all">
                  {newKey}
                </code>
                <button
                  onClick={() => copyToClipboard(newKey)}
                  className="text-green-700 hover:text-green-900 p-2"
                  title="Copy to clipboard"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
              <button
                onClick={() => setNewKey(null)}
                className="mt-2 text-sm text-green-700 hover:text-green-900"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* API Keys List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Key</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Permissions</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rate Limit</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Used</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {keys.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  No API keys created yet. Click "Create API Key" to get started.
                </td>
              </tr>
            ) : (
              keys.map((key) => (
                <tr key={key.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-gray-900">{key.name}</div>
                    <div className="text-sm text-gray-500">
                      Created {new Date(key.createdAt).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                      {key.keyPrefix}...
                    </code>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {key.permissions.slice(0, 3).map((perm) => (
                        <span
                          key={perm}
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                        >
                          {perm}
                        </span>
                      ))}
                      {key.permissions.length > 3 && (
                        <span className="text-xs text-gray-500">
                          +{key.permissions.length - 3} more
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {key.rateLimit}/hr
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        key.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {key.isActive ? 'Active' : 'Revoked'}
                    </span>
                    {key.expiresAt && new Date(key.expiresAt) < new Date() && (
                      <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        Expired
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {key.lastUsedAt
                      ? new Date(key.lastUsedAt).toLocaleString()
                      : 'Never'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {key.isActive && (
                      <button
                        onClick={() => handleRevoke(key.id)}
                        className="text-yellow-600 hover:text-yellow-900 mr-3"
                      >
                        Revoke
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(key.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">Create API Key</h2>
            </div>
            <form onSubmit={handleCreate}>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full border rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., Production Integration"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Permissions *
                  </label>
                  {permissions && (
                    <div className="space-y-4">
                      {Object.entries(permissions.grouped).map(([group, perms]) => (
                        <div key={group}>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-medium text-gray-600 capitalize">
                              {group}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const allSelected = perms.every((p) => formData.permissions.includes(p));
                                setFormData({
                                  ...formData,
                                  permissions: allSelected
                                    ? formData.permissions.filter((p) => !perms.includes(p))
                                    : [...new Set([...formData.permissions, ...perms])],
                                });
                              }}
                              className="text-xs text-blue-600 hover:text-blue-800"
                            >
                              {perms.every((p) => formData.permissions.includes(p)) ? 'Deselect all' : 'Select all'}
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {perms.map((perm) => (
                              <label
                                key={perm}
                                className={`inline-flex items-center px-3 py-1.5 rounded-md border cursor-pointer transition-colors ${
                                  formData.permissions.includes(perm)
                                    ? 'bg-blue-100 border-blue-300 text-blue-800'
                                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={formData.permissions.includes(perm)}
                                  onChange={() => togglePermission(perm)}
                                  className="sr-only"
                                />
                                <span className="text-sm">{perm}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Rate Limit (requests/window)
                    </label>
                    <input
                      type="number"
                      value={formData.rateLimit}
                      onChange={(e) => setFormData({ ...formData, rateLimit: parseInt(e.target.value) })}
                      className="w-full border rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      min="1"
                      max="100000"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Rate Limit Window (seconds)
                    </label>
                    <select
                      value={formData.rateLimitWindow}
                      onChange={(e) => setFormData({ ...formData, rateLimitWindow: parseInt(e.target.value) })}
                      className="w-full border rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value={60}>1 minute</option>
                      <option value={300}>5 minutes</option>
                      <option value={900}>15 minutes</option>
                      <option value={3600}>1 hour</option>
                      <option value={86400}>1 day</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Expiration Date (optional)
                  </label>
                  <input
                    type="date"
                    value={formData.expiresAt}
                    onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                    className="w-full border rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>

              <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setFormData({
                      name: '',
                      permissions: [],
                      rateLimit: 1000,
                      rateLimitWindow: 3600,
                      expiresAt: '',
                    });
                  }}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!formData.name || formData.permissions.length === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create API Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
