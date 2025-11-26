import { useState, Fragment } from 'react';
import { Dialog, Transition, Listbox } from '@headlessui/react';
import {
  XMarkIcon,
  DocumentArrowDownIcon,
  BuildingOfficeIcon,
  UserGroupIcon,
  CheckIcon,
  ChevronUpDownIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import type { Plan, RecipientType, ReportGenerationConfig } from '../types';

interface ReportGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: Plan;
  onGenerate: (config: ReportGenerationConfig) => void;
}

const recipientOptions: { value: RecipientType; label: string; description: string; icon: typeof BuildingOfficeIcon }[] = [
  {
    value: 'internal',
    label: 'Internal (AITX)',
    description: 'Includes Chronos and AITX logos, full cost data',
    icon: BuildingOfficeIcon,
  },
  {
    value: 'external',
    label: 'External (Customer)',
    description: 'No logos, cost data hidden or neutralized',
    icon: UserGroupIcon,
  },
];

export default function ReportGenerationModal({
  isOpen,
  onClose,
  plan,
  onGenerate,
}: ReportGenerationModalProps) {
  const [recipientType, setRecipientType] = useState<RecipientType>('internal');
  const [includeConfidentialStatement, setIncludeConfidentialStatement] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  const selectedRecipient = recipientOptions.find(r => r.value === recipientType)!;

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const config: ReportGenerationConfig = {
        planId: plan.id,
        dateRange: {
          start: plan.startDate,
          end: plan.endDate,
        },
        recipientType,
        includeConfidentialStatement,
        hideCostData: recipientType === 'external',
      };
      await onGenerate(config);
      onClose();
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-50" />
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
              <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-xl bg-white shadow-2xl transition-all">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-steel-200 bg-steel-50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-rail-100 rounded-lg">
                      <DocumentArrowDownIcon className="w-6 h-6 text-rail-600" />
                    </div>
                    <div>
                      <Dialog.Title className="text-lg font-semibold text-steel-900">
                        Generate Project Plan Document
                      </Dialog.Title>
                      <p className="text-sm text-steel-500">{plan.name}</p>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-2 text-steel-400 hover:text-steel-600 rounded-lg hover:bg-steel-100"
                  >
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>

                {/* Content */}
                <div className="px-6 py-5 space-y-6">
                  {/* Plan Info */}
                  <div className="p-4 bg-steel-50 rounded-lg">
                    <h4 className="text-sm font-medium text-steel-700 mb-2">Document Details</h4>
                    <dl className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-steel-500">Project Name:</dt>
                        <dd className="font-medium text-steel-900">{plan.name}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-steel-500">Date Range:</dt>
                        <dd className="font-medium text-steel-900">
                          {new Date(plan.startDate).toLocaleDateString()} - {new Date(plan.endDate).toLocaleDateString()}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-steel-500">Total Assignments:</dt>
                        <dd className="font-medium text-steel-900">{plan.assignments?.length || 0}</dd>
                      </div>
                    </dl>
                  </div>

                  {/* Recipient Type - Required Field */}
                  <div>
                    <label className="block text-sm font-medium text-steel-700 mb-2">
                      Recipient Type <span className="text-red-500">*</span>
                    </label>
                    <Listbox value={recipientType} onChange={setRecipientType}>
                      <div className="relative">
                        <Listbox.Button className="relative w-full cursor-pointer rounded-lg bg-white py-3 pl-4 pr-10 text-left border border-steel-300 focus:outline-none focus:ring-2 focus:ring-rail-500 focus:border-rail-500">
                          <div className="flex items-center gap-3">
                            <selectedRecipient.icon className="w-5 h-5 text-steel-600" />
                            <div>
                              <span className="block font-medium text-steel-900">{selectedRecipient.label}</span>
                              <span className="block text-sm text-steel-500">{selectedRecipient.description}</span>
                            </div>
                          </div>
                          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                            <ChevronUpDownIcon className="h-5 w-5 text-steel-400" aria-hidden="true" />
                          </span>
                        </Listbox.Button>
                        <Transition
                          as={Fragment}
                          leave="transition ease-in duration-100"
                          leaveFrom="opacity-100"
                          leaveTo="opacity-0"
                        >
                          <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                            {recipientOptions.map((option) => (
                              <Listbox.Option
                                key={option.value}
                                value={option.value}
                                className={({ active }) =>
                                  `relative cursor-pointer select-none py-3 px-4 ${
                                    active ? 'bg-rail-50' : ''
                                  }`
                                }
                              >
                                {({ selected }) => (
                                  <div className="flex items-center gap-3">
                                    <option.icon className="w-5 h-5 text-steel-600" />
                                    <div className="flex-1">
                                      <span className={`block font-medium ${selected ? 'text-rail-600' : 'text-steel-900'}`}>
                                        {option.label}
                                      </span>
                                      <span className="block text-sm text-steel-500">{option.description}</span>
                                    </div>
                                    {selected && (
                                      <CheckIcon className="w-5 h-5 text-rail-600" />
                                    )}
                                  </div>
                                )}
                              </Listbox.Option>
                            ))}
                          </Listbox.Options>
                        </Transition>
                      </div>
                    </Listbox>
                  </div>

                  {/* External Warning */}
                  {recipientType === 'external' && (
                    <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-lg border border-amber-200">
                      <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-amber-800">External Document Notice</p>
                        <ul className="mt-1 text-amber-700 list-disc list-inside space-y-1">
                          <li>Chronos and AITX logos will be excluded</li>
                          <li>Cost data will be hidden or summarized neutrally</li>
                          <li>Internal notes and comments will be omitted</li>
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* Confidentiality Statement */}
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="confidential"
                      checked={includeConfidentialStatement}
                      onChange={(e) => setIncludeConfidentialStatement(e.target.checked)}
                      className="mt-1 h-4 w-4 text-rail-600 focus:ring-rail-500 border-steel-300 rounded"
                    />
                    <label htmlFor="confidential" className="text-sm text-steel-700">
                      Include confidentiality statement in header
                      <span className="block text-steel-500 text-xs mt-0.5">
                        "CONFIDENTIAL - For authorized use only"
                      </span>
                    </label>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-steel-200 bg-steel-50">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-steel-700 hover:text-steel-900 hover:bg-steel-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="px-4 py-2 text-sm font-medium text-white bg-rail-600 hover:bg-rail-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isGenerating ? (
                      <>
                        <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Generating...
                      </>
                    ) : (
                      <>
                        <DocumentArrowDownIcon className="w-4 h-4" />
                        Generate Document
                      </>
                    )}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
