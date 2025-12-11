/**
 * ScenarioExportMenu - Dropdown menu for exporting scenarios
 *
 * Provides options to export scenarios in different formats:
 * - PDF (AITX branded)
 * - PDF (Customer-facing, no branding)
 * - CSV (Excel-compatible)
 */

import { Fragment, useState } from 'react';
import { Menu, Transition } from '@headlessui/react';
import {
  ArrowDownTrayIcon,
  DocumentTextIcon,
  TableCellsIcon,
  ChevronDownIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import { scenarioApi } from '../../services/carFlowApi';

interface ScenarioExportMenuProps {
  scenarioId: string;
  scenarioName?: string;
  className?: string;
}

type ExportFormat = 'pdf-aitx' | 'pdf-customer' | 'csv';

export default function ScenarioExportMenu({
  scenarioId,
  scenarioName,
  className = '',
}: ScenarioExportMenuProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<ExportFormat | null>(null);

  const handleExport = async (format: ExportFormat) => {
    setIsExporting(true);
    setExportSuccess(null);

    try {
      switch (format) {
        case 'pdf-aitx':
          await scenarioApi.exportPDF(scenarioId, 'aitx');
          break;
        case 'pdf-customer':
          await scenarioApi.exportPDF(scenarioId, 'customer');
          break;
        case 'csv':
          await scenarioApi.exportCSV(scenarioId);
          break;
      }
      setExportSuccess(format);
      setTimeout(() => setExportSuccess(null), 2000);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Menu as="div" className={`relative inline-block text-left ${className}`}>
      <Menu.Button
        className="btn-secondary flex items-center gap-2"
        disabled={isExporting}
      >
        {isExporting ? (
          <>
            <span className="animate-spin h-4 w-4 border-2 border-steel-400 border-t-transparent rounded-full" />
            Exporting...
          </>
        ) : (
          <>
            <ArrowDownTrayIcon className="h-4 w-4" />
            Export
            <ChevronDownIcon className="h-4 w-4" />
          </>
        )}
      </Menu.Button>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="absolute right-0 mt-2 w-56 origin-top-right divide-y divide-steel-100 rounded-lg bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
          {/* PDF Options */}
          <div className="p-1">
            <div className="px-3 py-1.5 text-xs font-semibold text-steel-500 uppercase tracking-wide">
              PDF Export
            </div>
            <Menu.Item>
              {({ active }) => (
                <button
                  onClick={() => handleExport('pdf-aitx')}
                  className={`${
                    active ? 'bg-rail-50 text-rail-900' : 'text-steel-900'
                  } group flex w-full items-center rounded-md px-3 py-2 text-sm`}
                >
                  <DocumentTextIcon className="mr-3 h-4 w-4 text-steel-400" />
                  <span className="flex-1 text-left">AITX Branded</span>
                  {exportSuccess === 'pdf-aitx' && (
                    <CheckIcon className="h-4 w-4 text-green-500" />
                  )}
                </button>
              )}
            </Menu.Item>
            <Menu.Item>
              {({ active }) => (
                <button
                  onClick={() => handleExport('pdf-customer')}
                  className={`${
                    active ? 'bg-rail-50 text-rail-900' : 'text-steel-900'
                  } group flex w-full items-center rounded-md px-3 py-2 text-sm`}
                >
                  <DocumentTextIcon className="mr-3 h-4 w-4 text-steel-400" />
                  <span className="flex-1 text-left">Customer-Facing</span>
                  {exportSuccess === 'pdf-customer' && (
                    <CheckIcon className="h-4 w-4 text-green-500" />
                  )}
                </button>
              )}
            </Menu.Item>
          </div>

          {/* Spreadsheet Options */}
          <div className="p-1">
            <div className="px-3 py-1.5 text-xs font-semibold text-steel-500 uppercase tracking-wide">
              Spreadsheet
            </div>
            <Menu.Item>
              {({ active }) => (
                <button
                  onClick={() => handleExport('csv')}
                  className={`${
                    active ? 'bg-rail-50 text-rail-900' : 'text-steel-900'
                  } group flex w-full items-center rounded-md px-3 py-2 text-sm`}
                >
                  <TableCellsIcon className="mr-3 h-4 w-4 text-steel-400" />
                  <span className="flex-1 text-left">CSV (Excel)</span>
                  {exportSuccess === 'csv' && (
                    <CheckIcon className="h-4 w-4 text-green-500" />
                  )}
                </button>
              )}
            </Menu.Item>
          </div>
        </Menu.Items>
      </Transition>
    </Menu>
  );
}
