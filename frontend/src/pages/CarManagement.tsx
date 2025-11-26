import { useState, useEffect } from 'react';
import { PlusIcon, PencilIcon, TrashIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { carsApi } from '../services/api';
import type { Car } from '../types';

const statusColors: Record<string, string> = {
  available: 'bg-green-100 text-green-800',
  in_service: 'bg-amber-100 text-amber-800',
  scheduled: 'bg-rail-100 text-rail-800',
  retired: 'bg-steel-200 text-steel-700',
};

const carTypeOptions = ['Tank Car', 'Covered Hopper', 'Open Hopper', 'Boxcar', 'Gondola', 'Flatcar', 'Intermodal'];
const reasonShoppedOptions = ['Annual Inspection', 'Wheel Repair', 'Tank Cleaning', 'Valve Replacement', 'Frame Repair', 'Safety Retrofit', 'DOT Compliance', 'Corrosion Repair', 'Coupler Replacement', 'Brake System'];

export default function CarManagement() {
  const [cars, setCars] = useState<Car[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCar, setEditingCar] = useState<Car | null>(null);
  const [selectedCars, setSelectedCars] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [formData, setFormData] = useState({
    vehicleNumber: '',
    carType: '',
    commodity: '',
    customer: '',
    projectNumber: '',
    reasonShopped: '',
    status: 'available' as Car['status'],
    notes: '',
  });

  useEffect(() => {
    loadCars();
  }, [page, statusFilter]);

  const loadCars = async () => {
    try {
      const response = await carsApi.getAll({
        page,
        pageSize: 20,
        status: statusFilter || undefined,
      });
      setCars(response.data);
      setTotalPages(response.totalPages);
    } catch (error) {
      console.error('Failed to load railcars:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = (car?: Car) => {
    if (car) {
      setEditingCar(car);
      setFormData({
        vehicleNumber: car.vehicleNumber,
        carType: car.carType,
        commodity: car.commodity,
        customer: car.customer,
        projectNumber: car.projectNumber,
        reasonShopped: car.reasonShopped,
        status: car.status,
        notes: car.notes || '',
      });
    } else {
      setEditingCar(null);
      setFormData({
        vehicleNumber: '',
        carType: '',
        commodity: '',
        customer: '',
        projectNumber: '',
        reasonShopped: '',
        status: 'available',
        notes: '',
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingCar) {
        await carsApi.update(editingCar.id, formData);
      } else {
        await carsApi.create(formData);
      }
      setIsModalOpen(false);
      loadCars();
    } catch (error) {
      console.error('Failed to save railcar:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this railcar?')) return;
    try {
      await carsApi.delete(id);
      loadCars();
    } catch (error) {
      console.error('Failed to delete railcar:', error);
    }
  };

  const handleBulkStatusUpdate = async (status: Car['status']) => {
    if (selectedCars.size === 0) return;
    try {
      await carsApi.bulkUpdate(Array.from(selectedCars), { status });
      setSelectedCars(new Set());
      loadCars();
    } catch (error) {
      console.error('Failed to update railcars:', error);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedCars.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedCars.size} railcars?`)) return;
    try {
      await carsApi.bulkDelete(Array.from(selectedCars));
      setSelectedCars(new Set());
      loadCars();
    } catch (error) {
      console.error('Failed to delete railcars:', error);
    }
  };

  const toggleCarSelection = (id: string) => {
    const newSelected = new Set(selectedCars);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedCars(newSelected);
  };

  const toggleAllSelection = () => {
    if (selectedCars.size === cars.length) {
      setSelectedCars(new Set());
    } else {
      setSelectedCars(new Set(cars.map((c) => c.id)));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-steel-900">Railcar Fleet</h1>
          <p className="mt-1 text-sm text-steel-500">
            Manage your railcar fleet with bulk operations
          </p>
        </div>
        <div className="flex space-x-3">
          <button className="btn-secondary flex items-center">
            <ArrowUpTrayIcon className="mr-2 h-5 w-5" />
            Import
          </button>
          <button onClick={() => handleOpenModal()} className="btn-primary flex items-center">
            <PlusIcon className="mr-2 h-5 w-5" />
            Add Railcar
          </button>
        </div>
      </div>

      {/* Filters and bulk actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input w-40"
          >
            <option value="">All Status</option>
            <option value="available">Available</option>
            <option value="in_service">In Service</option>
            <option value="scheduled">Scheduled</option>
            <option value="retired">Retired</option>
          </select>
        </div>
        {selectedCars.size > 0 && (
          <div className="flex items-center space-x-3">
            <span className="text-sm text-steel-600">{selectedCars.size} selected</span>
            <select
              onChange={(e) => handleBulkStatusUpdate(e.target.value as Car['status'])}
              className="input w-40"
              defaultValue=""
            >
              <option value="" disabled>
                Set Status...
              </option>
              <option value="available">Available</option>
              <option value="in_service">In Service</option>
              <option value="scheduled">Scheduled</option>
              <option value="retired">Retired</option>
            </select>
            <button onClick={handleBulkDelete} className="btn-secondary text-rail-600">
              Delete Selected
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="card">
          <p className="text-steel-500">Loading railcars...</p>
        </div>
      ) : (
        <>
          <div className="card overflow-hidden p-0">
            <table className="min-w-full divide-y divide-steel-200">
              <thead className="bg-steel-800 text-white">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedCars.size === cars.length && cars.length > 0}
                      onChange={toggleAllSelection}
                      className="h-4 w-4 text-rail-600 focus:ring-rail-500 border-steel-300 rounded"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                    Railcar #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                    Project #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                    Reason Shopped
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-steel-200">
                {cars.map((car) => (
                  <tr key={car.id} className={selectedCars.has(car.id) ? 'bg-rail-50' : 'hover:bg-steel-50'}>
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedCars.has(car.id)}
                        onChange={() => toggleCarSelection(car.id)}
                        className="h-4 w-4 text-rail-600 focus:ring-rail-500 border-steel-300 rounded"
                      />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-steel-900">
                      {car.vehicleNumber}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-steel-700">
                      {car.carType}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-steel-700">
                      {car.customer}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-steel-700 font-mono">
                      {car.projectNumber}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-steel-700">
                      {car.reasonShopped}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${statusColors[car.status]}`}
                      >
                        {car.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleOpenModal(car)}
                        className="text-rail-600 hover:text-rail-900 mr-3"
                      >
                        <PencilIcon className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleDelete(car.id)}
                        className="text-rail-600 hover:text-rail-900"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-steel-500">
              Page {page} of {totalPages}
            </p>
            <div className="flex space-x-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn-secondary disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-steel-900/50" onClick={() => setIsModalOpen(false)} />
            <div className="relative w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
              <h2 className="text-xl font-semibold text-steel-900 mb-4">
                {editingCar ? 'Edit Railcar' : 'Add New Railcar'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Railcar Number</label>
                    <input
                      type="text"
                      value={formData.vehicleNumber}
                      onChange={(e) => setFormData({ ...formData, vehicleNumber: e.target.value })}
                      className="input"
                      placeholder="e.g., AITX123456"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Car Type</label>
                    <select
                      value={formData.carType}
                      onChange={(e) => setFormData({ ...formData, carType: e.target.value })}
                      className="input"
                      required
                    >
                      <option value="">Select type...</option>
                      {carTypeOptions.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Customer</label>
                    <input
                      type="text"
                      value={formData.customer}
                      onChange={(e) => setFormData({ ...formData, customer: e.target.value })}
                      className="input"
                      placeholder="Customer name"
                    />
                  </div>
                  <div>
                    <label className="label">Commodity</label>
                    <input
                      type="text"
                      value={formData.commodity}
                      onChange={(e) => setFormData({ ...formData, commodity: e.target.value })}
                      className="input"
                      placeholder="e.g., Crude Oil, Corn"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Project Number</label>
                    <input
                      type="text"
                      value={formData.projectNumber}
                      onChange={(e) => setFormData({ ...formData, projectNumber: e.target.value })}
                      className="input"
                      placeholder="e.g., PRJ-2024-1234"
                    />
                  </div>
                  <div>
                    <label className="label">Reason Shopped</label>
                    <select
                      value={formData.reasonShopped}
                      onChange={(e) => setFormData({ ...formData, reasonShopped: e.target.value })}
                      className="input"
                    >
                      <option value="">Select reason...</option>
                      {reasonShoppedOptions.map((reason) => (
                        <option key={reason} value={reason}>{reason}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as Car['status'] })}
                    className="input"
                  >
                    <option value="available">Available</option>
                    <option value="in_service">In Service</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="retired">Retired</option>
                  </select>
                </div>
                <div>
                  <label className="label">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="input"
                    rows={3}
                    placeholder="Additional notes..."
                  />
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    {editingCar ? 'Save Changes' : 'Create Railcar'}
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
