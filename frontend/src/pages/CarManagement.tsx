import { useState, useEffect } from 'react';
import { PlusIcon, PencilIcon, TrashIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { carsApi } from '../services/api';
import type { Car } from '../types';

const statusColors: Record<string, string> = {
  available: 'bg-green-100 text-green-800',
  in_service: 'bg-amber-100 text-amber-800',
  scheduled: 'bg-blue-100 text-blue-800',
  retired: 'bg-steel-100 text-steel-800',
};

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
    make: '',
    model: '',
    year: new Date().getFullYear(),
    mileage: 0,
    status: 'available' as Car['status'],
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
      console.error('Failed to load cars:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = (car?: Car) => {
    if (car) {
      setEditingCar(car);
      setFormData({
        vehicleNumber: car.vehicleNumber,
        make: car.make,
        model: car.model,
        year: car.year,
        mileage: car.mileage,
        status: car.status,
      });
    } else {
      setEditingCar(null);
      setFormData({
        vehicleNumber: '',
        make: '',
        model: '',
        year: new Date().getFullYear(),
        mileage: 0,
        status: 'available',
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
      console.error('Failed to save car:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this car?')) return;
    try {
      await carsApi.delete(id);
      loadCars();
    } catch (error) {
      console.error('Failed to delete car:', error);
    }
  };

  const handleBulkStatusUpdate = async (status: Car['status']) => {
    if (selectedCars.size === 0) return;
    try {
      await carsApi.bulkUpdate(Array.from(selectedCars), { status });
      setSelectedCars(new Set());
      loadCars();
    } catch (error) {
      console.error('Failed to update cars:', error);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedCars.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedCars.size} cars?`)) return;
    try {
      await carsApi.bulkDelete(Array.from(selectedCars));
      setSelectedCars(new Set());
      loadCars();
    } catch (error) {
      console.error('Failed to delete cars:', error);
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
          <h1 className="text-2xl font-bold text-steel-900">Car Pool</h1>
          <p className="mt-1 text-sm text-steel-500">
            Manage your rail car fleet with bulk operations
          </p>
        </div>
        <div className="flex space-x-3">
          <button className="btn-secondary flex items-center">
            <ArrowUpTrayIcon className="mr-2 h-5 w-5" />
            Import
          </button>
          <button onClick={() => handleOpenModal()} className="btn-primary flex items-center">
            <PlusIcon className="mr-2 h-5 w-5" />
            Add Car
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
            <button onClick={handleBulkDelete} className="btn-secondary text-red-600">
              Delete Selected
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="card">
          <p className="text-steel-500">Loading cars...</p>
        </div>
      ) : (
        <>
          <div className="card overflow-hidden p-0">
            <table className="min-w-full divide-y divide-steel-200">
              <thead className="bg-steel-50">
                <tr>
                  <th className="px-6 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedCars.size === cars.length && cars.length > 0}
                      onChange={toggleAllSelection}
                      className="h-4 w-4 text-rail-600 focus:ring-rail-500 border-steel-300 rounded"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                    Vehicle
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                    Make/Model
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                    Year
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                    Mileage
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
                {cars.map((car) => (
                  <tr key={car.id} className={selectedCars.has(car.id) ? 'bg-rail-50' : ''}>
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedCars.has(car.id)}
                        onChange={() => toggleCarSelection(car.id)}
                        className="h-4 w-4 text-rail-600 focus:ring-rail-500 border-steel-300 rounded"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-steel-900">
                      {car.vehicleNumber}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-steel-700">
                      {car.make} {car.model}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-steel-700">
                      {car.year}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-steel-700">
                      {car.mileage.toLocaleString()} mi
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${statusColors[car.status]}`}
                      >
                        {car.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleOpenModal(car)}
                        className="text-rail-600 hover:text-rail-900 mr-3"
                      >
                        <PencilIcon className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleDelete(car.id)}
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
            <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
              <h2 className="text-xl font-semibold text-steel-900 mb-4">
                {editingCar ? 'Edit Car' : 'Add New Car'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">Vehicle Number</label>
                  <input
                    type="text"
                    value={formData.vehicleNumber}
                    onChange={(e) => setFormData({ ...formData, vehicleNumber: e.target.value })}
                    className="input"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Make</label>
                    <input
                      type="text"
                      value={formData.make}
                      onChange={(e) => setFormData({ ...formData, make: e.target.value })}
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Model</label>
                    <input
                      type="text"
                      value={formData.model}
                      onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                      className="input"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Year</label>
                    <input
                      type="number"
                      value={formData.year}
                      onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                      className="input"
                      min="1900"
                      max={new Date().getFullYear() + 1}
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Mileage</label>
                    <input
                      type="number"
                      value={formData.mileage}
                      onChange={(e) => setFormData({ ...formData, mileage: parseInt(e.target.value) })}
                      className="input"
                      min="0"
                      required
                    />
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
                <div className="flex justify-end space-x-3 pt-4">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    {editingCar ? 'Save Changes' : 'Create Car'}
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
