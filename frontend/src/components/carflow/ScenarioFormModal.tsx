/**
 * ScenarioFormModal - Modal for creating and editing scenarios
 *
 * Allows users to:
 * - Name the scenario
 * - Add notes/description
 * - Select customers (multi-select)
 * - Optionally add cars from selection
 */

import { Fragment, useState, useEffect } from 'react';
import { Dialog, Transition, Combobox } from '@headlessui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  XMarkIcon,
  BeakerIcon,
  CheckIcon,
  ChevronUpDownIcon,
  UserGroupIcon,
  TruckIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import { scenarioApi, customersApi, Customer } from '../../services/carFlowApi';
import type { Scenario, CreateScenarioRequest } from '../../types/carFlow';
import type { Car } from '../../types';

interface ScenarioFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingScenario?: Scenario | null;
  preselectedCars?: Car[];
  onSuccess?: (scenario: Scenario) => void;
}

export default function ScenarioFormModal({
  isOpen,
  onClose,
  editingScenario,
  preselectedCars = [],
  onSuccess,
}: ScenarioFormModalProps) {
  const queryClient = useQueryClient();
  const isEditing = !!editingScenario;

  // Form state
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedCustomers, setSelectedCustomers] = useState<Customer[]>([]);
  const [customerQuery, setCustomerQuery] = useState('');
  const [includeCars, setIncludeCars] = useState(true);

  // Fetch customers
  const { data: customersData } = useQuery({
    queryKey: ['customers'],
    queryFn: () => customersApi.getAll(),
    enabled: isOpen,
  });

  const customers = customersData || [];

  // Filter customers by query
  const filteredCustomers = customerQuery === ''
    ? customers
    : customers.filter((customer: Customer) =>
        customer.name.toLowerCase().includes(customerQuery.toLowerCase()) ||
        customer.code.toLowerCase().includes(customerQuery.toLowerCase())
      );

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateScenarioRequest) => scenarioApi.create(data),
    onSuccess: (scenario) => {
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      onSuccess?.(scenario);
      handleClose();
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateScenarioRequest> }) =>
      scenarioApi.update(id, data),
    onSuccess: (scenario) => {
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      queryClient.invalidateQueries({ queryKey: ['scenario', scenario.id] });
      onSuccess?.(scenario);
      handleClose();
    },
  });

  // Initialize form when editing
  useEffect(() => {
    if (editingScenario) {
      setName(editingScenario.name);
      setNotes(editingScenario.notes || '');
      setSelectedCustomers(
        editingScenario.customers?.map((c) => c.customer) || []
      );
    } else {
      // Reset form
      setName('');
      setNotes('');
      setSelectedCustomers([]);
      setIncludeCars(preselectedCars.length > 0);
    }
  }, [editingScenario, preselectedCars.length, isOpen]);

  const handleClose = () => {
    setName('');
    setNotes('');
    setSelectedCustomers([]);
    setCustomerQuery('');
    setIncludeCars(true);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) return;

    const data: CreateScenarioRequest = {
      name: name.trim(),
      notes: notes.trim() || undefined,
      customerIds: selectedCustomers.map((c) => c.id),
      carIds: includeCars ? preselectedCars.map((c) => c.id) : undefined,
    };

    if (isEditing) {
      await updateMutation.mutateAsync({
        id: editingScenario.id,
        data,
      });
    } else {
      await createMutation.mutateAsync(data);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;
  const error = createMutation.error || updateMutation.error;

  const removeCustomer = (customerId: string) => {
    setSelectedCustomers((prev) => prev.filter((c) => c.id !== customerId));
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
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
              <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-xl bg-white shadow-xl transition-all">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-steel-200">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-100">
                      <BeakerIcon className="h-5 w-5 text-amber-600" />
                    </div>
                    <Dialog.Title className="text-lg font-semibold text-steel-900">
                      {isEditing ? 'Edit Scenario' : 'Create New Scenario'}
                    </Dialog.Title>
                  </div>
                  <button
                    onClick={handleClose}
                    className="text-steel-400 hover:text-steel-600 transition-colors"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit}>
                  <div className="px-6 py-4 space-y-4">
                    {/* Name */}
                    <div>
                      <label className="block text-sm font-medium text-steel-700 mb-1">
                        Scenario Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="input w-full"
                        placeholder="e.g., Q1 2026 Shell Planning"
                        required
                      />
                    </div>

                    {/* Notes */}
                    <div>
                      <label className="block text-sm font-medium text-steel-700 mb-1">
                        <DocumentTextIcon className="h-4 w-4 inline mr-1" />
                        Notes
                      </label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="input w-full"
                        rows={3}
                        placeholder="Optional notes about this scenario..."
                      />
                    </div>

                    {/* Customers */}
                    <div>
                      <label className="block text-sm font-medium text-steel-700 mb-1">
                        <UserGroupIcon className="h-4 w-4 inline mr-1" />
                        Customers
                      </label>
                      <Combobox
                        value={selectedCustomers}
                        onChange={(customers: Customer[]) => setSelectedCustomers(customers)}
                        multiple
                      >
                        <div className="relative">
                          <div className="relative">
                            <Combobox.Input
                              className="input w-full pr-10"
                              placeholder="Search customers..."
                              onChange={(e) => setCustomerQuery(e.target.value)}
                              displayValue={() => ''}
                            />
                            <Combobox.Button className="absolute inset-y-0 right-0 flex items-center pr-2">
                              <ChevronUpDownIcon
                                className="h-5 w-5 text-steel-400"
                                aria-hidden="true"
                              />
                            </Combobox.Button>
                          </div>
                          <Transition
                            as={Fragment}
                            leave="transition ease-in duration-100"
                            leaveFrom="opacity-100"
                            leaveTo="opacity-0"
                            afterLeave={() => setCustomerQuery('')}
                          >
                            <Combobox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                              {filteredCustomers.length === 0 && customerQuery !== '' ? (
                                <div className="relative cursor-default select-none py-2 px-4 text-steel-700">
                                  Nothing found.
                                </div>
                              ) : (
                                filteredCustomers.map((customer: Customer) => (
                                  <Combobox.Option
                                    key={customer.id}
                                    className={({ active }) =>
                                      `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                                        active ? 'bg-rail-600 text-white' : 'text-steel-900'
                                      }`
                                    }
                                    value={customer}
                                  >
                                    {({ selected, active }) => (
                                      <>
                                        <span
                                          className={`block truncate ${
                                            selected ? 'font-medium' : 'font-normal'
                                          }`}
                                        >
                                          {customer.name}
                                          <span className="text-xs opacity-60 ml-2">
                                            ({customer.code})
                                          </span>
                                        </span>
                                        {selected && (
                                          <span
                                            className={`absolute inset-y-0 left-0 flex items-center pl-3 ${
                                              active ? 'text-white' : 'text-rail-600'
                                            }`}
                                          >
                                            <CheckIcon className="h-5 w-5" aria-hidden="true" />
                                          </span>
                                        )}
                                      </>
                                    )}
                                  </Combobox.Option>
                                ))
                              )}
                            </Combobox.Options>
                          </Transition>
                        </div>
                      </Combobox>

                      {/* Selected Customers */}
                      {selectedCustomers.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {selectedCustomers.map((customer) => (
                            <span
                              key={customer.id}
                              className="inline-flex items-center px-2 py-1 rounded-md text-sm bg-rail-100 text-rail-800"
                            >
                              {customer.name}
                              <button
                                type="button"
                                onClick={() => removeCustomer(customer.id)}
                                className="ml-1 hover:text-rail-600"
                              >
                                <XMarkIcon className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Include Cars Option */}
                    {!isEditing && preselectedCars.length > 0 && (
                      <div className="bg-rail-50 border border-rail-200 rounded-lg p-3">
                        <label className="flex items-start gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={includeCars}
                            onChange={(e) => setIncludeCars(e.target.checked)}
                            className="mt-0.5 rounded border-steel-300 text-rail-600 focus:ring-rail-500"
                          />
                          <div>
                            <span className="text-sm font-medium text-steel-900 flex items-center gap-2">
                              <TruckIcon className="h-4 w-4 text-rail-600" />
                              Include {preselectedCars.length} selected cars
                            </span>
                            <p className="text-xs text-steel-500 mt-0.5">
                              Add the currently selected railcars to this scenario
                            </p>
                          </div>
                        </label>
                      </div>
                    )}

                    {/* Error Display */}
                    {error && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <p className="text-sm text-red-700">
                          {(error as Error).message || 'Failed to save scenario'}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex justify-end gap-3 px-6 py-4 border-t border-steel-200 bg-steel-50">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="btn-secondary"
                      disabled={isLoading}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={isLoading || !name.trim()}
                    >
                      {isLoading ? (
                        <>
                          <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                          {isEditing ? 'Updating...' : 'Creating...'}
                        </>
                      ) : (
                        <>{isEditing ? 'Update Scenario' : 'Create Scenario'}</>
                      )}
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
