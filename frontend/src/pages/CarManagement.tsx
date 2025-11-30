import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PlusIcon, PencilIcon, TrashIcon, ArrowUpTrayIcon, ArrowDownTrayIcon, MagnifyingGlassIcon, XMarkIcon, CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon, ChevronUpIcon, ChevronDownIcon, ChevronUpDownIcon } from '@heroicons/react/24/outline';
import { carsApi } from '../services/api';
import type { Car } from '../types';

// Sort configuration type
type SortField = 'railcarNumber' | 'carType' | 'customer' | 'projectNumber' | 'reasonShopped' | 'status';
type SortDirection = 'asc' | 'desc' | null;

// Import result type matching API response
interface ImportResults {
  status: 'success' | 'partial_success' | 'failed' | 'mapping_required';
  newCarsAdded: number;
  existingCarsUpdated: number;
  failedRows: number;
  errors: { row: number; reason: string }[];
  warnings?: { row: number; message: string }[];
  detected_headers?: string[];
  missing_required_fields?: string[];
  unmapped_headers?: string[];
  suggested_mappings?: Record<string, string[]>;
}

// Softer, muted status colors for better visual comfort
const statusColors: Record<string, string> = {
  available: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  in_service: 'bg-amber-50 text-amber-700 border border-amber-200',
  in_shop: 'bg-violet-50 text-violet-700 border border-violet-200',
  scheduled: 'bg-blue-50 text-blue-700 border border-blue-200',
  planned: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  release: 'bg-orange-50 text-orange-700 border border-orange-200',
  assignment: 'bg-cyan-50 text-cyan-700 border border-cyan-200',
  arrived: 'bg-green-50 text-green-700 border border-green-200',
  retired: 'bg-steel-100 text-steel-600 border border-steel-200',
};

// Helper to format date for display
const formatDate = (date: string | Date | null | undefined): string => {
  if (!date) return '-';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Check if date is within X days from now
const isDateWithinDays = (date: string | Date | null | undefined, days: number): boolean => {
  if (!date) return false;
  const d = new Date(date);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
};

// Check if date is past
const isDatePast = (date: string | Date | null | undefined): boolean => {
  if (!date) return false;
  const d = new Date(date);
  if (isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
};

const carTypeOptions = ['Tank Car', 'Covered Hopper', 'Open Hopper', 'Boxcar', 'Gondola', 'Flatcar', 'Intermodal'];
const reasonShoppedOptions = ['Annual Inspection', 'Wheel Repair', 'Tank Cleaning', 'Valve Replacement', 'Frame Repair', 'Safety Retrofit', 'DOT Compliance', 'Corrosion Repair', 'Coupler Replacement', 'Brake System'];

export default function CarManagement() {
  const [searchParams] = useSearchParams();
  const [cars, setCars] = useState<Car[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCar, setEditingCar] = useState<Car | null>(null);
  const [selectedCars, setSelectedCars] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [carTypeFilter, setCarTypeFilter] = useState<string>('');
  const [customerFilter, setCustomerFilter] = useState<string>('');
  const [reasonFilter, setReasonFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isImportResultsOpen, setIsImportResultsOpen] = useState(false);
  const [importResults, setImportResults] = useState<ImportResults | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [formData, setFormData] = useState({
    railcarNumber: '',
    carType: '',
    commodity: '',
    customer: '',
    projectNumber: '',
    reasonShopped: '',
    status: 'available' as Car['status'],
    notes: '',
  });

  // Handle URL query parameters on mount and when they change
  useEffect(() => {
    const urlStatus = searchParams.get('status');
    const urlSearch = searchParams.get('search');

    if (urlStatus) {
      // Handle comma-separated status values (e.g., "available,scheduled")
      setStatusFilter(urlStatus);
    }
    if (urlSearch) {
      setSearchTerm(urlSearch);
    }
  }, [searchParams]);

  // Load cars when filters or pagination change
  useEffect(() => {
    loadCars();
  }, [page, statusFilter, carTypeFilter, customerFilter, reasonFilter]);

  const loadCars = async () => {
    try {
      const response = await carsApi.getAll({
        page,
        pageSize: 20,
        status: statusFilter || undefined,
        carType: carTypeFilter || undefined,
        customer: customerFilter || undefined,
        reasonShopped: reasonFilter || undefined,
      });
      setCars(response.data);
      setTotalPages(response.totalPages);
    } catch (error) {
      console.error('Failed to load railcars:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle column sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle direction: asc -> desc -> null
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortField(null);
        setSortDirection(null);
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Get sort icon for a column
  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ChevronUpDownIcon className="h-4 w-4 text-steel-400 ml-1" />;
    }
    if (sortDirection === 'asc') {
      return <ChevronUpIcon className="h-4 w-4 text-rail-600 ml-1" />;
    }
    return <ChevronDownIcon className="h-4 w-4 text-rail-600 ml-1" />;
  };

  const handleOpenModal = (car?: Car) => {
    if (car) {
      setEditingCar(car);
      setFormData({
        railcarNumber: car.railcarNumber,
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
        railcarNumber: '',
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

  // Export selected cars or all cars with current filters
  const handleExport = async (exportSelected: boolean = false) => {
    setIsExporting(true);
    try {
      await carsApi.exportCars({
        ids: exportSelected && selectedCars.size > 0 ? Array.from(selectedCars) : undefined,
        status: statusFilter || undefined,
        customer: customerFilter || undefined,
        reasonShopped: reasonFilter || undefined,
        carType: carTypeFilter || undefined,
      });
    } catch (error) {
      console.error('Failed to export cars:', error);
      alert('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // Parse CSV file and return array of car objects
  const parseCSV = (csvText: string): Partial<Car>[] => {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const carList: Partial<Car>[] = [];

    for (let i = 1; i < lines.length; i++) {
      // Handle CSV with quoted values
      const values: string[] = [];
      let current = '';
      let inQuotes = false;
      for (const char of lines[i]) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim().replace(/^"|"$/g, ''));
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim().replace(/^"|"$/g, ''));

      const carObj: Record<string, unknown> = {};
      let carInit = '';
      let carNo = '';

      headers.forEach((header, index) => {
        const value = values[index] || '';
        const lowerHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '');

        switch (lowerHeader) {
          // Railcar number variations
          case 'railcarnumber':
          case 'railcar':
          case 'vehiclenumber':
            carObj.railcarNumber = value;
            break;
          case 'carno':
            carNo = value;
            break;
          case 'carinit':
            carInit = value;
            break;
          // Car type variations
          case 'cartype':
          case 'type':
            carObj.carType = value;
            break;
          case 'istankcar':
          case 'tankcar':
            carObj.isTankCar = value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'yes';
            break;
          case 'commodity':
            carObj.commodity = value;
            break;
          // Customer/Lessee variations
          case 'customer':
          case 'lessee':
            carObj.customer = value;
            break;
          case 'projectnumber':
          case 'project':
            carObj.projectNumber = value;
            break;
          case 'reasonshopped':
          case 'reason':
            carObj.reasonShopped = value;
            break;
          case 'status':
            carObj.status = value.toLowerCase();
            break;
          case 'currentlocation':
          case 'location':
            carObj.currentLocation = value;
            break;
          case 'homeregion':
            carObj.homeRegion = value;
            break;
          case 'originregion':
            carObj.originRegion = value;
            break;
          case 'projectedcost':
          case 'cost':
            carObj.projectedCost = parseFloat(value) || 0;
            break;
          case 'daysinshop':
            carObj.daysInShop = parseInt(value) || 0;
            break;
          case 'notes':
            carObj.notes = value;
            break;
          case 'lastservicedate':
            if (value) carObj.lastServiceDate = value;
            break;
          case 'nextservicedue':
            if (value) carObj.nextServiceDue = value;
            break;
          // New fields from Qual Planner Master CSV
          case 'contract':
          case 'contractnumber':
            carObj.contractNumber = value;
            break;
          case 'contexp':
          case 'contractexpiration':
            if (value) carObj.contractExpiration = value;
            break;
          case 'jacketed':
            carObj.isJacketed = value.toLowerCase() === 'yes' || value.toLowerCase() === 'y' || value === '1';
            break;
          case 'lined':
            carObj.isLined = value.toLowerCase() === 'yes' || value.toLowerCase() === 'y' || value === '1';
            break;
          case 'buildyr':
          case 'buildyear':
            carObj.buildYear = parseInt(value) || null;
            break;
          case 'qualtype':
          case 'qualificationtype':
            carObj.qualificationType = value;
            break;
          case 'tankqual':
          case 'tankqualified':
            carObj.tankQualified = value.toLowerCase() === 'yes' || value.toLowerCase() === 'y' || value === '1';
            break;
          case 'tankqualdue':
          case 'tankqualduedate':
            if (value) carObj.tankQualDueDate = value;
            break;
          case 'perfsched':
          case 'performscheduled':
            carObj.performScheduled = value.toLowerCase() === 'yes' || value.toLowerCase() === 'y' || value === '1';
            break;
          case 'planstatus':
            carObj.planStatus = value;
            break;
        }
      });

      // Combine Car Init + Car No if railcarNumber not directly set
      if (!carObj.railcarNumber && carInit && carNo) {
        carObj.railcarNumber = `${carInit}${carNo}`;
      } else if (!carObj.railcarNumber && carNo) {
        carObj.railcarNumber = carNo;
      }

      // Auto-detect tank car from car type
      if (carObj.carType && typeof carObj.carType === 'string' && !carObj.isTankCar) {
        carObj.isTankCar = carObj.carType.toLowerCase().includes('tank');
      }

      if (carObj.railcarNumber) {
        carList.push(carObj as Partial<Car>);
      }
    }

    return carList;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      const parsedCars = parseCSV(text);

      if (parsedCars.length === 0) {
        setImportResults({
          status: 'failed',
          newCarsAdded: 0,
          existingCarsUpdated: 0,
          failedRows: 0,
          errors: [{ row: 0, reason: 'No valid railcars found in CSV. Ensure headers include "railcar_number" or "railcarNumber".' }]
        });
        setIsImportResultsOpen(true);
        setIsImportModalOpen(false);
        return;
      }

      const results = await carsApi.bulkImport(parsedCars);
      setImportResults(results);
      setIsImportResultsOpen(true);
      setIsImportModalOpen(false);
      loadCars();
    } catch (error: any) {
      setImportResults({
        status: 'failed',
        newCarsAdded: 0,
        existingCarsUpdated: 0,
        failedRows: 0,
        errors: [{ row: 0, reason: error.response?.data?.message || 'Import failed. Please check your file format.' }]
      });
      setIsImportResultsOpen(true);
      setIsImportModalOpen(false);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircleIcon className="h-12 w-12 text-green-500" />;
      case 'partial_success':
        return <ExclamationTriangleIcon className="h-12 w-12 text-amber-500" />;
      case 'failed':
        return <XCircleIcon className="h-12 w-12 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusMessage = (status: string) => {
    switch (status) {
      case 'success':
        return 'Import Successful';
      case 'partial_success':
        return 'Import Completed with Errors';
      case 'failed':
        return 'Import Failed';
      default:
        return 'Import Complete';
    }
  };

  // Filter and sort cars (client-side)
  const filteredCars = useMemo(() => {
    let result = cars;

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(car =>
        car.railcarNumber?.toLowerCase().includes(term) ||
        car.customer?.toLowerCase().includes(term) ||
        car.projectNumber?.toLowerCase().includes(term) ||
        car.commodity?.toLowerCase().includes(term) ||
        car.carType?.toLowerCase().includes(term)
      );
    }

    // Apply client-side filters for carType, customer, reason (when API doesn't filter)
    if (carTypeFilter && !cars.every(c => c.carType === carTypeFilter || !carTypeFilter)) {
      result = result.filter(car => car.carType === carTypeFilter);
    }
    if (customerFilter) {
      result = result.filter(car => car.customer === customerFilter);
    }
    if (reasonFilter) {
      result = result.filter(car => car.reasonShopped === reasonFilter);
    }

    // Apply sorting
    if (sortField && sortDirection) {
      result = [...result].sort((a, b) => {
        const aVal = (a[sortField] || '').toString().toLowerCase();
        const bVal = (b[sortField] || '').toString().toLowerCase();
        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [cars, searchTerm, carTypeFilter, customerFilter, reasonFilter, sortField, sortDirection]);

  // Get unique customers for filter dropdown
  const uniqueCustomers = [...new Set(cars.map(c => c.customer).filter(Boolean))].sort();

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
    if (selectedCars.size === filteredCars.length && filteredCars.length > 0) {
      setSelectedCars(new Set());
    } else {
      setSelectedCars(new Set(filteredCars.map((c) => c.id)));
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
          <button
            onClick={() => handleExport(false)}
            disabled={isExporting}
            className="btn-secondary flex items-center"
          >
            <ArrowDownTrayIcon className="mr-2 h-5 w-5" />
            {isExporting ? 'Exporting...' : 'Export All'}
          </button>
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="btn-secondary flex items-center"
          >
            <ArrowUpTrayIcon className="mr-2 h-5 w-5" />
            Import
          </button>
          <button onClick={() => handleOpenModal()} className="btn-primary flex items-center">
            <PlusIcon className="mr-2 h-5 w-5" />
            Add Railcar
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <MagnifyingGlassIcon className="h-5 w-5 text-steel-400" />
        </div>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by railcar #, customer, project #, commodity, or car type..."
          className="input pl-10 w-full"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute inset-y-0 right-0 pr-3 flex items-center"
          >
            <XMarkIcon className="h-5 w-5 text-steel-400 hover:text-steel-600" />
          </button>
        )}
      </div>

      {/* Filters and bulk actions */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center space-x-4 flex-wrap gap-2">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className={`input w-36 ${statusFilter ? 'border-rail-500 bg-rail-50' : ''}`}
          >
            <option value="">All Status</option>
            <option value="available">Available</option>
            <option value="planned">Planned</option>
            <option value="scheduled">Scheduled</option>
            <option value="release">Release</option>
            <option value="assignment">Assignment</option>
            <option value="arrived">Arrived</option>
            <option value="in_service">In Service</option>
            <option value="in_shop">In Shop</option>
            <option value="retired">Retired</option>
          </select>
          <select
            value={carTypeFilter}
            onChange={(e) => {
              setCarTypeFilter(e.target.value);
              setPage(1);
            }}
            className={`input w-40 ${carTypeFilter ? 'border-rail-500 bg-rail-50' : ''}`}
          >
            <option value="">All Car Types</option>
            {carTypeOptions.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <select
            value={customerFilter}
            onChange={(e) => {
              setCustomerFilter(e.target.value);
              setPage(1);
            }}
            className={`input w-40 ${customerFilter ? 'border-rail-500 bg-rail-50' : ''}`}
          >
            <option value="">All Customers</option>
            {uniqueCustomers.map(customer => (
              <option key={customer} value={customer}>{customer}</option>
            ))}
          </select>
          <select
            value={reasonFilter}
            onChange={(e) => {
              setReasonFilter(e.target.value);
              setPage(1);
            }}
            className={`input w-44 ${reasonFilter ? 'border-rail-500 bg-rail-50' : ''}`}
          >
            <option value="">All Reasons</option>
            {reasonShoppedOptions.map(reason => (
              <option key={reason} value={reason}>{reason}</option>
            ))}
          </select>
          <span className="text-sm text-steel-500">{filteredCars.length} cars</span>
        </div>
        {selectedCars.size > 0 && (
          <div className="flex items-center space-x-3 bg-rail-50 px-4 py-2 rounded-lg border border-rail-200">
            <span className="text-sm font-medium text-rail-700">{selectedCars.size} selected</span>
            <div className="h-4 w-px bg-rail-300" />
            <button
              onClick={() => handleExport(true)}
              disabled={isExporting}
              className="text-sm text-rail-600 hover:text-rail-800 font-medium"
            >
              {isExporting ? 'Exporting...' : 'Export Selected'}
            </button>
            <div className="h-4 w-px bg-rail-300" />
            <select
              onChange={(e) => handleBulkStatusUpdate(e.target.value as Car['status'])}
              className="input w-36 text-sm py-1"
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
            <button onClick={handleBulkDelete} className="text-sm text-rail-600 hover:text-rail-800 font-medium">
              Delete
            </button>
            <button
              onClick={() => setSelectedCars(new Set())}
              className="text-sm text-steel-500 hover:text-steel-700"
            >
              Clear
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
                  <th className="px-3 py-2.5 text-left w-10">
                    <input
                      type="checkbox"
                      checked={selectedCars.size === filteredCars.length && filteredCars.length > 0}
                      onChange={toggleAllSelection}
                      className="h-4 w-4 text-rail-600 focus:ring-rail-500 border-steel-300 rounded"
                    />
                  </th>
                  <th className="px-3 py-2.5 text-left">
                    <button
                      onClick={() => handleSort('railcarNumber')}
                      className="flex items-center text-xs font-medium uppercase tracking-wider hover:text-rail-200 transition-colors"
                    >
                      Railcar #
                      {getSortIcon('railcarNumber')}
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-left">
                    <button
                      onClick={() => handleSort('carType')}
                      className="flex items-center text-xs font-medium uppercase tracking-wider hover:text-rail-200 transition-colors"
                    >
                      Type
                      {getSortIcon('carType')}
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-left">
                    <button
                      onClick={() => handleSort('customer')}
                      className="flex items-center text-xs font-medium uppercase tracking-wider hover:text-rail-200 transition-colors"
                    >
                      Customer
                      {getSortIcon('customer')}
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-left">
                    <button
                      onClick={() => handleSort('projectNumber')}
                      className="flex items-center text-xs font-medium uppercase tracking-wider hover:text-rail-200 transition-colors"
                    >
                      Project #
                      {getSortIcon('projectNumber')}
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-left">
                    <button
                      onClick={() => handleSort('reasonShopped')}
                      className="flex items-center text-xs font-medium uppercase tracking-wider hover:text-rail-200 transition-colors"
                    >
                      Reason Shopped
                      {getSortIcon('reasonShopped')}
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-left">
                    <button
                      onClick={() => handleSort('status')}
                      className="flex items-center text-xs font-medium uppercase tracking-wider hover:text-rail-200 transition-colors"
                    >
                      Status
                      {getSortIcon('status')}
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider">
                    Contract Exp
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider">
                    Tank Qual Due
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-steel-100">
                {filteredCars.map((car) => {
                  const isTankCar = car.carType === 'Tank Car' || car.isTankCar;
                  return (
                    <tr key={car.id} className={selectedCars.has(car.id) ? 'bg-rail-50' : 'hover:bg-steel-50'}>
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={selectedCars.has(car.id)}
                          onChange={() => toggleCarSelection(car.id)}
                          className="h-4 w-4 text-rail-600 focus:ring-rail-500 border-steel-300 rounded"
                        />
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex items-center">
                          <span className="text-sm font-medium text-steel-900">{car.railcarNumber}</span>
                          {isTankCar && (
                            <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200">
                              TANK
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-sm text-steel-700">
                        {car.carType}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-sm text-steel-700">
                        {car.customer || '-'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-sm text-steel-700 font-mono">
                        {car.projectNumber || '-'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-sm text-steel-700">
                        {car.reasonShopped || '-'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${statusColors[car.status] || statusColors.available}`}
                        >
                          {car.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-sm">
                        {car.contractExpiration ? (
                          <span className={`${
                            isDatePast(car.contractExpiration)
                              ? 'text-red-600 font-medium'
                              : isDateWithinDays(car.contractExpiration, 90)
                                ? 'text-amber-600'
                                : 'text-steel-700'
                          }`}>
                            {formatDate(car.contractExpiration)}
                          </span>
                        ) : (
                          <span className="text-steel-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-sm">
                        {car.tankQualDueDate ? (
                          <span className={`${
                            isDatePast(car.tankQualDueDate)
                              ? 'text-red-600 font-medium'
                              : isDateWithinDays(car.tankQualDueDate, 90)
                                ? 'text-amber-600'
                                : 'text-steel-700'
                          }`}>
                            {formatDate(car.tankQualDueDate)}
                          </span>
                        ) : (
                          <span className="text-steel-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleOpenModal(car)}
                          className="text-steel-500 hover:text-rail-600 mr-2 p-1 rounded hover:bg-steel-100"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(car.id)}
                          className="text-steel-500 hover:text-red-600 p-1 rounded hover:bg-steel-100"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
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
                      value={formData.railcarNumber}
                      onChange={(e) => setFormData({ ...formData, railcarNumber: e.target.value })}
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

      {/* Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-steel-900/50" onClick={() => !isImporting && setIsImportModalOpen(false)} />
            <div className="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-steel-900">Import Railcars</h2>
                <button
                  onClick={() => setIsImportModalOpen(false)}
                  disabled={isImporting}
                  className="text-steel-400 hover:text-steel-600"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="border-2 border-dashed border-steel-300 rounded-lg p-8 text-center">
                  <ArrowUpTrayIcon className="h-12 w-12 text-steel-400 mx-auto mb-4" />
                  <p className="text-steel-600 mb-2">
                    Upload a CSV file with railcar data
                  </p>
                  <p className="text-sm text-steel-500 mb-4">
                    Required column: railcar_number<br />
                    Optional: car_type, customer, commodity, status, reason_shopped, etc.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    disabled={isImporting}
                    className="hidden"
                    id="csv-upload-cars"
                  />
                  <label
                    htmlFor="csv-upload-cars"
                    className={`btn-primary inline-flex items-center cursor-pointer ${isImporting ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isImporting ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Importing...
                      </>
                    ) : (
                      'Select CSV File'
                    )}
                  </label>
                </div>

                <div className="bg-steel-50 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-steel-900 mb-2">CSV Format Example:</h3>
                  <code className="text-xs text-steel-600 block whitespace-pre-wrap">
                    railcar_number,car_type,customer,status,reason_shopped{'\n'}
                    AITX123456,Tank Car,Shell Energy,available,Annual Inspection{'\n'}
                    AITX789012,Covered Hopper,Cargill,scheduled,Wheel Repair
                  </code>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Results Modal */}
      {isImportResultsOpen && importResults && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-steel-900/50" onClick={() => setIsImportResultsOpen(false)} />
            <div className="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
              <div className="text-center mb-6">
                {getStatusIcon(importResults.status)}
                <h2 className="text-xl font-semibold text-steel-900 mt-3">
                  {getStatusMessage(importResults.status)}
                </h2>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">{importResults.newCarsAdded}</div>
                  <div className="text-sm text-green-700">New Cars Added</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">{importResults.existingCarsUpdated}</div>
                  <div className="text-sm text-blue-700">Cars Updated</div>
                </div>
                <div className="bg-red-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-red-600">{importResults.failedRows}</div>
                  <div className="text-sm text-red-700">Failed Rows</div>
                </div>
              </div>

              {importResults.errors.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-steel-900 mb-2">Errors:</h3>
                  <div className="bg-red-50 rounded-lg p-3 max-h-48 overflow-y-auto">
                    <ul className="space-y-1">
                      {importResults.errors.map((error, index) => (
                        <li key={index} className="text-sm text-red-700">
                          {error.row > 0 && <span className="font-medium">Row {error.row}: </span>}
                          {error.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={() => setIsImportResultsOpen(false)}
                  className="btn-primary"
                >
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
