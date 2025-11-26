import { useState, useEffect } from 'react';
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { shopsApi } from '../services/api';
import type { Shop } from '../types';

export default function ShopManagement() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingShop, setEditingShop] = useState<Shop | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    location: '',
    capacity: 10,
    costMultiplier: 1.0,
    turnTimeMultiplier: 1.0,
    isActive: true,
  });

  useEffect(() => {
    loadShops();
  }, []);

  const loadShops = async () => {
    try {
      const data = await shopsApi.getAll();
      setShops(data);
    } catch (error) {
      console.error('Failed to load shops:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = (shop?: Shop) => {
    if (shop) {
      setEditingShop(shop);
      setFormData({
        name: shop.name,
        code: shop.code,
        location: shop.location,
        capacity: shop.capacity,
        costMultiplier: shop.costMultiplier,
        turnTimeMultiplier: shop.turnTimeMultiplier,
        isActive: shop.isActive,
      });
    } else {
      setEditingShop(null);
      setFormData({
        name: '',
        code: '',
        location: '',
        capacity: 10,
        costMultiplier: 1.0,
        turnTimeMultiplier: 1.0,
        isActive: true,
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingShop) {
        await shopsApi.update(editingShop.id, formData);
      } else {
        await shopsApi.create(formData);
      }
      setIsModalOpen(false);
      loadShops();
    } catch (error) {
      console.error('Failed to save shop:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this shop?')) return;
    try {
      await shopsApi.delete(id);
      loadShops();
    } catch (error) {
      console.error('Failed to delete shop:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-steel-900">Shop Management</h1>
          <p className="mt-1 text-sm text-steel-500">
            Manage service shops with cost and turn time multipliers
          </p>
        </div>
        <button onClick={() => handleOpenModal()} className="btn-primary flex items-center">
          <PlusIcon className="mr-2 h-5 w-5" />
          Add Shop
        </button>
      </div>

      {isLoading ? (
        <div className="card">
          <p className="text-steel-500">Loading shops...</p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="min-w-full divide-y divide-steel-200">
            <thead className="bg-steel-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                  Shop
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                  Location
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                  Capacity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                  Cost Multiplier
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                  Turn Time
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
              {shops.map((shop) => (
                <tr key={shop.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-steel-900">{shop.name}</div>
                      <div className="text-sm text-steel-500">{shop.code}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-steel-700">
                    {shop.location}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-steel-700">
                    {shop.capacity} cars/month
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-steel-700">
                    {shop.costMultiplier.toFixed(2)}x
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-steel-700">
                    {shop.turnTimeMultiplier.toFixed(2)}x
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                        shop.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-steel-100 text-steel-800'
                      }`}
                    >
                      {shop.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleOpenModal(shop)}
                      className="text-rail-600 hover:text-rail-900 mr-3"
                    >
                      <PencilIcon className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(shop.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-steel-900/50" onClick={() => setIsModalOpen(false)} />
            <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
              <h2 className="text-xl font-semibold text-steel-900 mb-4">
                {editingShop ? 'Edit Shop' : 'Add New Shop'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">Shop Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="label">Shop Code</label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="label">Location</label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="input"
                    required
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="label">Capacity</label>
                    <input
                      type="number"
                      value={formData.capacity}
                      onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) })}
                      className="input"
                      min="1"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Cost Mult.</label>
                    <input
                      type="number"
                      value={formData.costMultiplier}
                      onChange={(e) => setFormData({ ...formData, costMultiplier: parseFloat(e.target.value) })}
                      className="input"
                      step="0.1"
                      min="0.1"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Turn Time</label>
                    <input
                      type="number"
                      value={formData.turnTimeMultiplier}
                      onChange={(e) => setFormData({ ...formData, turnTimeMultiplier: parseFloat(e.target.value) })}
                      className="input"
                      step="0.1"
                      min="0.1"
                      required
                    />
                  </div>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="h-4 w-4 text-rail-600 focus:ring-rail-500 border-steel-300 rounded"
                  />
                  <label htmlFor="isActive" className="ml-2 text-sm text-steel-700">
                    Shop is active
                  </label>
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    {editingShop ? 'Save Changes' : 'Create Shop'}
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
