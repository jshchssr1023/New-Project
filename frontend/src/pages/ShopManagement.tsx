import { useState, useEffect } from 'react';
import { PlusIcon, PencilIcon, TrashIcon, ArrowUpTrayIcon, EyeIcon } from '@heroicons/react/24/outline';
import { shopsApi } from '../services/api';
import type { Shop } from '../types';

const regions = ['Northeast', 'Southeast', 'Midwest', 'Southwest', 'West', 'Canada', 'Mexico'];
const carTypes = ['Tank Car', 'Covered Hopper', 'Open Hopper', 'Boxcar', 'Gondola', 'Flatcar', 'Intermodal'];
const certificationOptions = ['DOT', 'AAR', 'FRA', 'TC (Transport Canada)', 'Hazmat'];

export default function ShopManagement() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [editingShop, setEditingShop] = useState<Shop | null>(null);
  const [viewingShop, setViewingShop] = useState<Shop | null>(null);
  const [regionFilter, setRegionFilter] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<string>('');
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    location: '',
    city: '',
    state: '',
    region: '',
    capacity: 10,
    baseCostPerCar: 15000,
    baseTurnTime: 14,
    capabilities: [] as string[],
    certifications: [] as string[],
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    notes: '',
    isActive: true,
  });

  useEffect(() => {
    loadShops();
  }, [regionFilter, activeFilter]);

  const loadShops = async () => {
    try {
      const data = await shopsApi.getAll();
      let filtered = data;
      if (regionFilter) {
        filtered = filtered.filter((s: any) => s.region === regionFilter);
      }
      if (activeFilter) {
        filtered = filtered.filter((s: any) => s.isActive === (activeFilter === 'active'));
      }
      setShops(filtered);
    } catch (error) {
      console.error('Failed to load shops:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = (shop?: Shop) => {
    if (shop) {
      setEditingShop(shop);
      const caps = shop.capabilities;
      const certs = shop.certifications;
      setFormData({
        name: shop.name,
        code: shop.code,
        location: shop.location,
        city: shop.city || '',
        state: shop.state || '',
        region: shop.region || '',
        capacity: shop.capacity,
        baseCostPerCar: shop.baseCostPerCar || 15000,
        baseTurnTime: shop.baseTurnTime || 14,
        capabilities: Array.isArray(caps) ? caps : (typeof caps === 'string' && caps ? JSON.parse(caps) : []),
        certifications: Array.isArray(certs) ? certs : (typeof certs === 'string' && certs ? JSON.parse(certs) : []),
        contactName: shop.contactName || '',
        contactEmail: shop.contactEmail || '',
        contactPhone: shop.contactPhone || '',
        notes: shop.notes || '',
        isActive: shop.isActive,
      });
    } else {
      setEditingShop(null);
      setFormData({
        name: '',
        code: '',
        location: '',
        city: '',
        state: '',
        region: '',
        capacity: 10,
        baseCostPerCar: 15000,
        baseTurnTime: 14,
        capabilities: [],
        certifications: [],
        contactName: '',
        contactEmail: '',
        contactPhone: '',
        notes: '',
        isActive: true,
      });
    }
    setIsModalOpen(true);
  };

  const handleViewShop = async (shop: Shop) => {
    try {
      const fullShop = await shopsApi.getById(shop.id);
      setViewingShop(fullShop);
      setIsViewModalOpen(true);
    } catch (error) {
      console.error('Failed to load shop details:', error);
    }
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
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to delete shop');
    }
  };

  const toggleCapability = (cap: string) => {
    setFormData(prev => ({
      ...prev,
      capabilities: prev.capabilities.includes(cap)
        ? prev.capabilities.filter(c => c !== cap)
        : [...prev.capabilities, cap],
    }));
  };

  const toggleCertification = (cert: string) => {
    setFormData(prev => ({
      ...prev,
      certifications: prev.certifications.includes(cert)
        ? prev.certifications.filter(c => c !== cert)
        : [...prev.certifications, cert],
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-steel-900">Shop Network</h1>
          <p className="mt-1 text-sm text-steel-500">
            Manage your repair shop network and capabilities
          </p>
        </div>
        <div className="flex space-x-3">
          <button className="btn-secondary flex items-center">
            <ArrowUpTrayIcon className="mr-2 h-5 w-5" />
            Import Shops
          </button>
          <button onClick={() => handleOpenModal()} className="btn-primary flex items-center">
            <PlusIcon className="mr-2 h-5 w-5" />
            Add Shop
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center space-x-4">
        <select
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value)}
          className="input w-40"
        >
          <option value="">All Regions</option>
          {regions.map(region => (
            <option key={region} value={region}>{region}</option>
          ))}
        </select>
        <select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value)}
          className="input w-40"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <span className="text-sm text-steel-500">{shops.length} shops</span>
      </div>

      {isLoading ? (
        <div className="card">
          <p className="text-steel-500">Loading shops...</p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="min-w-full divide-y divide-steel-200">
            <thead className="bg-steel-800 text-white">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Shop</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Location</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Region</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider">Capacity</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider">Cost/Car</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider">Turn Time</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-steel-200">
              {shops.map((shop) => (
                <tr key={shop.id} className="hover:bg-steel-50">
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-steel-900">{shop.name}</div>
                      <div className="text-xs text-steel-500 font-mono">{shop.code}</div>
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-steel-700">
                    {shop.city && shop.state ? `${shop.city}, ${shop.state}` : shop.location}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-steel-700">
                    {shop.region || '-'}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-center text-sm font-medium text-steel-900">
                    {shop.capacity}/mo
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-steel-700">
                    ${(shop.baseCostPerCar || 15000).toLocaleString()}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-steel-700">
                    {shop.baseTurnTime || 14} days
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-center">
                    <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                      shop.isActive ? 'bg-green-100 text-green-800' : 'bg-steel-200 text-steel-700'
                    }`}>
                      {shop.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleViewShop(shop)}
                      className="text-steel-600 hover:text-steel-900 mr-3"
                      title="View details"
                    >
                      <EyeIcon className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => handleOpenModal(shop)}
                      className="text-rail-600 hover:text-rail-900 mr-3"
                      title="Edit"
                    >
                      <PencilIcon className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(shop.id)}
                      className="text-rail-600 hover:text-rail-900"
                      title="Delete"
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

      {/* Edit/Create Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-steel-900/50" onClick={() => setIsModalOpen(false)} />
            <div className="relative w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-semibold text-steel-900 mb-4">
                {editingShop ? 'Edit Shop' : 'Add New Shop'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
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
                    <label className="label">Code</label>
                    <input
                      type="text"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                      className="input font-mono"
                      placeholder="e.g., HOU"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="label">City</label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">State</label>
                    <input
                      type="text"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      className="input"
                      placeholder="e.g., TX"
                    />
                  </div>
                  <div>
                    <label className="label">Region</label>
                    <select
                      value={formData.region}
                      onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                      className="input"
                    >
                      <option value="">Select region...</option>
                      {regions.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="label">Full Address</label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="input"
                    placeholder="Full street address"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="label">Monthly Capacity</label>
                    <input
                      type="number"
                      value={formData.capacity}
                      onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 10 })}
                      className="input"
                      min="1"
                    />
                  </div>
                  <div>
                    <label className="label">Base Cost/Car ($)</label>
                    <input
                      type="number"
                      value={formData.baseCostPerCar}
                      onChange={(e) => setFormData({ ...formData, baseCostPerCar: parseInt(e.target.value) || 15000 })}
                      className="input"
                      min="0"
                      step="500"
                    />
                  </div>
                  <div>
                    <label className="label">Base Turn Time (days)</label>
                    <input
                      type="number"
                      value={formData.baseTurnTime}
                      onChange={(e) => setFormData({ ...formData, baseTurnTime: parseInt(e.target.value) || 14 })}
                      className="input"
                      min="1"
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Car Type Capabilities</label>
                  <div className="flex flex-wrap gap-2">
                    {carTypes.map(cap => (
                      <button
                        key={cap}
                        type="button"
                        onClick={() => toggleCapability(cap)}
                        className={`px-3 py-1 rounded-full text-sm ${
                          formData.capabilities.includes(cap)
                            ? 'bg-rail-600 text-white'
                            : 'bg-steel-100 text-steel-700 hover:bg-steel-200'
                        }`}
                      >
                        {cap}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="label">Certifications</label>
                  <div className="flex flex-wrap gap-2">
                    {certificationOptions.map(cert => (
                      <button
                        key={cert}
                        type="button"
                        onClick={() => toggleCertification(cert)}
                        className={`px-3 py-1 rounded-full text-sm ${
                          formData.certifications.includes(cert)
                            ? 'bg-rail-600 text-white'
                            : 'bg-steel-100 text-steel-700 hover:bg-steel-200'
                        }`}
                      >
                        {cert}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="label">Contact Name</label>
                    <input
                      type="text"
                      value={formData.contactName}
                      onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Contact Email</label>
                    <input
                      type="email"
                      value={formData.contactEmail}
                      onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Contact Phone</label>
                    <input
                      type="tel"
                      value={formData.contactPhone}
                      onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                      className="input"
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="input"
                    rows={2}
                  />
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
                    Shop is active and available for assignments
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

      {/* View Details Modal */}
      {isViewModalOpen && viewingShop && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-steel-900/50" onClick={() => setIsViewModalOpen(false)} />
            <div className="relative w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
              <h2 className="text-xl font-semibold text-steel-900 mb-4">
                {viewingShop.name}
                <span className="ml-2 text-sm font-mono text-steel-500">({viewingShop.code})</span>
              </h2>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-sm text-steel-500">Location</p>
                  <p className="text-sm font-medium text-steel-900">
                    {viewingShop.city && viewingShop.state
                      ? `${viewingShop.city}, ${viewingShop.state}`
                      : viewingShop.location}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-steel-500">Region</p>
                  <p className="text-sm font-medium text-steel-900">{viewingShop.region || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-steel-500">Monthly Capacity</p>
                  <p className="text-sm font-medium text-steel-900">{viewingShop.capacity} cars</p>
                </div>
                <div>
                  <p className="text-sm text-steel-500">Base Cost/Car</p>
                  <p className="text-sm font-medium text-steel-900">
                    ${(viewingShop.baseCostPerCar || 15000).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-steel-500">Turn Time</p>
                  <p className="text-sm font-medium text-steel-900">{viewingShop.baseTurnTime || 14} days</p>
                </div>
                <div>
                  <p className="text-sm text-steel-500">Status</p>
                  <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                    viewingShop.isActive ? 'bg-green-100 text-green-800' : 'bg-steel-200 text-steel-700'
                  }`}>
                    {viewingShop.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>

              {viewingShop.capabilities && viewingShop.capabilities.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm text-steel-500 mb-2">Capabilities</p>
                  <div className="flex flex-wrap gap-2">
                    {viewingShop.capabilities.map((cap: string) => (
                      <span key={cap} className="px-2 py-1 bg-rail-100 text-rail-800 rounded text-xs">
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {viewingShop.monthlyCapacity && viewingShop.monthlyCapacity.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm text-steel-500 mb-2">Capacity Forecast (Next 12 Months)</p>
                  <div className="grid grid-cols-6 gap-2">
                    {viewingShop.monthlyCapacity.slice(0, 6).map((mc) => (
                      <div key={mc.month} className="text-center p-2 bg-steel-50 rounded">
                        <div className="text-xs text-steel-500">{mc.month}</div>
                        <div className={`text-sm font-medium ${
                          mc.utilizationPercent >= 100 ? 'text-rail-600' :
                          mc.utilizationPercent >= 80 ? 'text-amber-600' : 'text-green-600'
                        }`}>
                          {mc.used}/{mc.capacity}
                        </div>
                        <div className="text-xs text-steel-400">{mc.utilizationPercent}%</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(viewingShop.contactName || viewingShop.contactEmail || viewingShop.contactPhone) && (
                <div className="mb-4">
                  <p className="text-sm text-steel-500 mb-2">Contact</p>
                  <div className="text-sm text-steel-900">
                    {viewingShop.contactName && <div>{viewingShop.contactName}</div>}
                    {viewingShop.contactEmail && <div>{viewingShop.contactEmail}</div>}
                    {viewingShop.contactPhone && <div>{viewingShop.contactPhone}</div>}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-4">
                <button onClick={() => setIsViewModalOpen(false)} className="btn-secondary">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
