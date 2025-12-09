import { useRef, useState } from 'react';
import { ArrowUpTrayIcon, XMarkIcon, CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import type { Car } from '../../types';

interface ImportResults {
  status: 'success' | 'partial_success' | 'failed' | 'mapping_required';
  newCarsAdded: number;
  existingCarsUpdated: number;
  failedRows: number;
  errors: { row: number; reason: string }[];
  warnings?: { row: number; message: string }[];
}

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (cars: Partial<Car>[]) => Promise<ImportResults>;
}

// CSV header mapping for new qualification fields
const HEADER_MAPPINGS: Record<string, keyof Car> = {
  // Railcar number variations
  'railcar_number': 'railcarNumber',
  'railcarnumber': 'railcarNumber',
  'railcar': 'railcarNumber',
  'vehicle_number': 'railcarNumber',
  'vehiclenumber': 'railcarNumber',
  'car_no': 'railcarNumber',
  'carno': 'railcarNumber',

  // Car type
  'car_type': 'carType',
  'cartype': 'carType',
  'type': 'carType',

  // Customer
  'customer': 'customer',
  'lessee': 'customer',

  // Status
  'status': 'status',
  'current_status': 'currentStatusNote',

  // Project
  'project_number': 'projectNumber',
  'projectnumber': 'projectNumber',
  'project': 'projectNumber',

  // Reason shopped
  'reason_shopped': 'reasonsShopped',
  'reasonshopped': 'reasonsShopped',
  'reason': 'reasonsShopped',

  // Contract
  'contract': 'contractNumber',
  'contract_number': 'contractNumber',
  'contractnumber': 'contractNumber',
  'contract_expiration': 'contractExpiration',
  'contractexpiration': 'contractExpiration',
  'cont_exp': 'contractExpiration',
  'contexp': 'contractExpiration',

  // Lining fields
  'lined': 'lined',
  'lining_type': 'liningType',
  'liningtype': 'liningType',

  // Qualification date fields (exact column names from CSV)
  'min_(no_lining)': 'minNoLining',
  'min(nolining)': 'minNoLining',
  'minnolining': 'minNoLining',
  'min_no_lining': 'minNoLining',

  'min_w_lining': 'minWLining',
  'minwlining': 'minWLining',

  'interior_lining': 'interiorLining',
  'interiorlining': 'interiorLining',

  'rule_88b': 'rule88B',
  'rule88b': 'rule88B',

  'safety_relief': 'safetyRelief',
  'safetyrelief': 'safetyRelief',

  'service_equipment': 'serviceEquipment',
  'serviceequipment': 'serviceEquipment',

  'stub_sill': 'stubSill',
  'stubsill': 'stubSill',

  'tank_thickness': 'tankThickness',
  'tankthickness': 'tankThickness',

  'tank_qualification': 'tankQualification',
  'tankqualification': 'tankQualification',

  // Additional qualification fields
  'portfolio': 'portfolio',

  'full/partial_qual': 'fullPartialQual',
  'fullpartialqual': 'fullPartialQual',
  'full_partial_qual': 'fullPartialQual',

  'perform_tank_qual': 'performTankQual',
  'performtankqual': 'performTankQual',

  'scheduled': 'scheduled',

  // Existing qualification fields
  'tank_qual': 'tankQualified',
  'tankqual': 'tankQualified',
  'tank_qualified': 'tankQualified',
  'tankqualified': 'tankQualified',

  'tank_qual_due': 'tankQualDueDate',
  'tankqualdue': 'tankQualDueDate',
  'tank_qual_due_date': 'tankQualDueDate',
  'tankqualduedate': 'tankQualDueDate',

  'qual_type': 'qualificationType',
  'qualtype': 'qualificationType',
  'qualification_type': 'qualificationType',
  'qualificationtype': 'qualificationType',

  // Other fields
  'commodity': 'commodity',
  'location': 'currentLocation',
  'current_location': 'currentLocation',
  'home_region': 'homeRegion',
  'homeregion': 'homeRegion',
  'origin_region': 'originRegion',
  'originregion': 'originRegion',
  'notes': 'notes',
};

// Parse CSV with support for new qualification fields
function parseCSV(csvText: string): Partial<Car>[] {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];

  // Normalize headers - remove special chars, lowercase
  const rawHeaders = lines[0].split(',').map(h => h.trim());
  const normalizedHeaders = rawHeaders.map(h =>
    h.toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_/()]/g, '')
  );

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

    normalizedHeaders.forEach((header, index) => {
      const value = values[index] || '';
      if (!value) return;

      // Check for car_init and car_no special handling
      if (header === 'car_init' || header === 'carinit') {
        carInit = value;
        return;
      }
      if (header === 'car_no' || header === 'carno') {
        carNo = value;
        return;
      }

      // Map header to Car field
      const fieldName = HEADER_MAPPINGS[header];
      if (!fieldName) return;

      // Handle different value types
      if (fieldName === 'lined' || fieldName === 'tankQualified' || fieldName === 'performTankQual' || fieldName === 'isTankCar') {
        carObj[fieldName] = value.toLowerCase() === 'true' ||
                            value.toLowerCase() === 'yes' ||
                            value.toLowerCase() === 'y' ||
                            value === '1';
      } else if (fieldName === 'projectedCost' || fieldName === 'daysInShop') {
        carObj[fieldName] = parseFloat(value) || 0;
      } else {
        carObj[fieldName] = value;
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
}

export default function ImportModal({ isOpen, onClose, onImport }: ImportModalProps) {
  const [isImporting, setIsImporting] = useState(false);
  const [results, setResults] = useState<ImportResults | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setResults(null);

    try {
      const text = await file.text();
      const parsedCars = parseCSV(text);

      if (parsedCars.length === 0) {
        setResults({
          status: 'failed',
          newCarsAdded: 0,
          existingCarsUpdated: 0,
          failedRows: 0,
          errors: [{
            row: 0,
            reason: 'No valid railcars found in CSV. Ensure headers include "railcar_number" or similar.'
          }]
        });
        return;
      }

      const importResults = await onImport(parsedCars);
      setResults(importResults);
    } catch (error: any) {
      setResults({
        status: 'failed',
        newCarsAdded: 0,
        existingCarsUpdated: 0,
        failedRows: 0,
        errors: [{
          row: 0,
          reason: error.response?.data?.message || error.message || 'Import failed. Please check your file format.'
        }]
      });
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

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-steel-900/50" onClick={() => !isImporting && onClose()} />
        <div className="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-steel-900">Import Railcars</h2>
            <button
              onClick={onClose}
              disabled={isImporting}
              className="text-steel-400 hover:text-steel-600"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {!results ? (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-steel-300 rounded-lg p-8 text-center">
                <ArrowUpTrayIcon className="h-12 w-12 text-steel-400 mx-auto mb-4" />
                <p className="text-steel-600 mb-2">Upload a CSV file with railcar data</p>
                <p className="text-sm text-steel-500 mb-4">
                  Supports new qualification fields: Safety Relief, Service Equipment, Tank Thickness, etc.
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
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Importing...
                    </>
                  ) : (
                    'Select CSV File'
                  )}
                </label>
              </div>

              <div className="bg-steel-50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-steel-900 mb-2">Supported Columns:</h3>
                <div className="text-xs text-steel-600 grid grid-cols-2 gap-1">
                  <span>• Railcar Number</span>
                  <span>• Car Type</span>
                  <span>• Customer</span>
                  <span>• Portfolio</span>
                  <span>• Lined</span>
                  <span>• Lining Type</span>
                  <span>• Min (no lining)</span>
                  <span>• Min w lining</span>
                  <span>• Interior Lining</span>
                  <span>• Rule 88B</span>
                  <span>• Safety Relief</span>
                  <span>• Service Equipment</span>
                  <span>• Stub Sill</span>
                  <span>• Tank Thickness</span>
                  <span>• Tank Qualification</span>
                  <span>• Full/Partial Qual</span>
                  <span>• Perform Tank Qual</span>
                  <span>• Scheduled</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="text-center">
                {getStatusIcon(results.status)}
                <h3 className="text-xl font-semibold text-steel-900 mt-3">
                  {getStatusMessage(results.status)}
                </h3>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">{results.newCarsAdded}</div>
                  <div className="text-sm text-green-700">New Cars Added</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">{results.existingCarsUpdated}</div>
                  <div className="text-sm text-blue-700">Cars Updated</div>
                </div>
                <div className="bg-red-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-red-600">{results.failedRows}</div>
                  <div className="text-sm text-red-700">Failed Rows</div>
                </div>
              </div>

              {results.errors.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-steel-900 mb-2">Errors:</h4>
                  <div className="bg-red-50 rounded-lg p-3 max-h-48 overflow-y-auto">
                    <ul className="space-y-1">
                      {results.errors.map((error, index) => (
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
                <button onClick={onClose} className="btn-primary">
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
