import { useState, useMemo } from 'react';
import { ChevronDownIcon, ChevronRightIcon, XMarkIcon } from '@heroicons/react/24/outline';
import type { Car } from '../../types';

interface HierarchicalFilterProps {
  cars: Car[];
  onFilterChange: (filters: {
    customer: string | null;
    projectNumber: string | null;
    carIds: string[];
  }) => void;
  selectedCustomer: string | null;
  selectedProject: string | null;
}

export default function HierarchicalFilter({
  cars,
  onFilterChange,
  selectedCustomer,
  selectedProject,
}: HierarchicalFilterProps) {
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());

  // Build hierarchical data: Customer -> Projects -> Cars
  const hierarchy = useMemo(() => {
    const customerMap = new Map<string, Map<string, Car[]>>();

    cars.forEach(car => {
      const customer = car.customer || 'Unassigned';
      const project = car.projectNumber || 'No Project';

      if (!customerMap.has(customer)) {
        customerMap.set(customer, new Map());
      }

      const projectMap = customerMap.get(customer)!;
      if (!projectMap.has(project)) {
        projectMap.set(project, []);
      }

      projectMap.get(project)!.push(car);
    });

    // Convert to sorted array
    return Array.from(customerMap.entries())
      .map(([customer, projects]) => ({
        customer,
        carCount: Array.from(projects.values()).flat().length,
        projects: Array.from(projects.entries())
          .map(([project, projectCars]) => ({
            project,
            carCount: projectCars.length,
            cars: projectCars,
          }))
          .sort((a, b) => a.project.localeCompare(b.project)),
      }))
      .sort((a, b) => a.customer.localeCompare(b.customer));
  }, [cars]);

  const toggleCustomerExpand = (customer: string) => {
    setExpandedCustomers(prev => {
      const next = new Set(prev);
      if (next.has(customer)) {
        next.delete(customer);
      } else {
        next.add(customer);
      }
      return next;
    });
  };

  const selectCustomer = (customer: string) => {
    const customerData = hierarchy.find(h => h.customer === customer);
    const carIds = customerData?.projects.flatMap(p => p.cars.map(c => c.id)) || [];

    if (selectedCustomer === customer) {
      // Deselect
      onFilterChange({ customer: null, projectNumber: null, carIds: [] });
    } else {
      onFilterChange({ customer, projectNumber: null, carIds });
      setExpandedCustomers(prev => new Set([...prev, customer]));
    }
  };

  const selectProject = (customer: string, project: string) => {
    const customerData = hierarchy.find(h => h.customer === customer);
    const projectData = customerData?.projects.find(p => p.project === project);
    const carIds = projectData?.cars.map(c => c.id) || [];

    if (selectedCustomer === customer && selectedProject === project) {
      // Go back to customer level
      onFilterChange({
        customer,
        projectNumber: null,
        carIds: customerData?.projects.flatMap(p => p.cars.map(c => c.id)) || [],
      });
    } else {
      onFilterChange({ customer, projectNumber: project, carIds });
    }
  };

  const clearFilters = () => {
    onFilterChange({ customer: null, projectNumber: null, carIds: [] });
  };

  return (
    <div className="bg-white rounded-lg border border-steel-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-steel-50 border-b border-steel-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-steel-900">Filter by Customer</h3>
        {(selectedCustomer || selectedProject) && (
          <button
            onClick={clearFilters}
            className="text-xs text-steel-500 hover:text-steel-700 flex items-center gap-1"
          >
            <XMarkIcon className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      {/* Breadcrumb */}
      {selectedCustomer && (
        <div className="px-4 py-2 bg-rail-50 border-b border-rail-200 text-sm">
          <span className="text-steel-500">Viewing: </span>
          <button
            onClick={() => selectCustomer(selectedCustomer)}
            className="text-rail-700 font-medium hover:underline"
          >
            {selectedCustomer}
          </button>
          {selectedProject && (
            <>
              <span className="text-steel-400 mx-1">›</span>
              <span className="text-rail-800 font-semibold">{selectedProject}</span>
            </>
          )}
        </div>
      )}

      {/* Customer List */}
      <div className="max-h-80 overflow-y-auto">
        {hierarchy.map(({ customer, carCount, projects }) => {
          const isExpanded = expandedCustomers.has(customer);
          const isSelected = selectedCustomer === customer;

          return (
            <div key={customer}>
              {/* Customer Row */}
              <div
                className={`flex items-center px-4 py-2 border-b border-steel-100 cursor-pointer hover:bg-steel-50 ${
                  isSelected && !selectedProject ? 'bg-rail-50' : ''
                }`}
              >
                <button
                  onClick={() => toggleCustomerExpand(customer)}
                  className="p-1 hover:bg-steel-200 rounded mr-2"
                >
                  {isExpanded ? (
                    <ChevronDownIcon className="h-4 w-4 text-steel-500" />
                  ) : (
                    <ChevronRightIcon className="h-4 w-4 text-steel-500" />
                  )}
                </button>
                <button
                  onClick={() => selectCustomer(customer)}
                  className="flex-1 text-left flex items-center justify-between"
                >
                  <span className={`font-medium ${isSelected ? 'text-rail-700' : 'text-steel-800'}`}>
                    {customer}
                  </span>
                  <span className="text-xs text-steel-500 bg-steel-100 px-2 py-0.5 rounded-full">
                    {carCount} cars
                  </span>
                </button>
              </div>

              {/* Projects List */}
              {isExpanded && (
                <div className="bg-steel-50">
                  {projects.map(({ project, carCount: projectCarCount }) => {
                    const isProjectSelected = isSelected && selectedProject === project;

                    return (
                      <button
                        key={project}
                        onClick={() => selectProject(customer, project)}
                        className={`w-full flex items-center justify-between px-4 py-2 pl-12 border-b border-steel-100 hover:bg-steel-100 text-sm ${
                          isProjectSelected ? 'bg-rail-100' : ''
                        }`}
                      >
                        <span className={isProjectSelected ? 'text-rail-700 font-medium' : 'text-steel-700'}>
                          {project}
                        </span>
                        <span className="text-xs text-steel-500 bg-white px-2 py-0.5 rounded-full">
                          {projectCarCount}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
