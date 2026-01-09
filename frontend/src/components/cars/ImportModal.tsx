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

// CSV header mapping for qualification fields
// Maps normalized CSV headers to Car field names
// Headers are normalized: lowercase, spaces→underscores, special chars removed
const HEADER_MAPPINGS: Record<string, keyof Car> = {
  // =============================================================================
  // RAILCAR NUMBER (Column Q in master CSV: "Number", combined with Mark)
  // =============================================================================
  'railcar_number': 'railcarNumber',
  'railcarnumber': 'railcarNumber',
  'railcar': 'railcarNumber',
  'vehicle_number': 'railcarNumber',
  'vehiclenumber': 'railcarNumber',
  'car_no': 'railcarNumber',
  'carno': 'railcarNumber',
  'car_id': 'railcarNumber',
  'carid': 'railcarNumber',
  'number': 'railcarNumber',
  'mark2': 'railcarNumber', // Combined mark+number field

  // =============================================================================
  // CAR TYPE (Column S in master CSV: "Car Type Level 2")
  // =============================================================================
  'car_type': 'carType',
  'cartype': 'carType',
  'type': 'carType',
  'car_type_level_2': 'carType',
  'cartypelevel2': 'carType',
  'car_typ': 'carType',
  'equipment_type': 'carType',
  'equipmenttype': 'carType',

  // =============================================================================
  // CUSTOMER (Column A in master CSV: "Lessee Name")
  // =============================================================================
  'customer': 'customer',
  'lessee': 'customer',
  'lessee_name': 'customer',
  'lesseename': 'customer',
  'cust_nm': 'customer',
  'custnm': 'customer',

  // =============================================================================
  // STATUS (Column AK in master CSV: "Current Status")
  // Values: Complete, Arrived, To Be Routed, Enroute, Release, etc.
  // =============================================================================
  'status': 'status',
  'current_status': 'status',
  'currentstatus': 'status',
  'car_status': 'status',
  'carstatus': 'status',

  // =============================================================================
  // REASON SHOPPED (Column AH in master CSV: "Reason Shopped")
  // =============================================================================
  'reason_shopped': 'reasonsShopped',
  'reasonshopped': 'reasonsShopped',
  'reason': 'reasonsShopped',
  'reasons_shopped': 'reasonsShopped',
  'shop_reason': 'reasonsShopped',
  'shopreason': 'reasonsShopped',
  'service_reason': 'reasonsShopped',
  'servicereason': 'reasonsShopped',

  // =============================================================================
  // PORTFOLIO (Column AC in master CSV: "Portfolio")
  // Values: "On Lease", "Active" = true; otherwise false
  // =============================================================================
  'portfolio': 'portfolio',
  'on_lease': 'portfolio',
  'onlease': 'portfolio',

  // =============================================================================
  // SCHEDULED / PLANNING (Column AJ in master CSV: "Scheduled")
  // Values: "Planned Shopping" = performScheduled true
  // =============================================================================
  'scheduled': 'scheduled',
  'perform_scheduled': 'performScheduled',
  'performscheduled': 'performScheduled',
  'planning': 'performScheduled',
  'plan_status': 'planStatus',
  'planstatus': 'planStatus',

  // =============================================================================
  // PROJECT NUMBER
  // =============================================================================
  'project_number': 'projectNumber',
  'projectnumber': 'projectNumber',
  'project': 'projectNumber',
  'proj_no': 'projectNumber',
  'projno': 'projectNumber',

  // =============================================================================
  // CONTRACT FIELDS
  // =============================================================================
  'contract': 'contractNumber',
  'contract_number': 'contractNumber',
  'contractnumber': 'contractNumber',
  'contract_expiration': 'contractExpiration',
  'contractexpiration': 'contractExpiration',
  'cont_exp': 'contractExpiration',
  'contexp': 'contractExpiration',

  // =============================================================================
  // LINING FIELDS (Columns L-N in master CSV)
  // =============================================================================
  'lined': 'lined',
  'lining': 'lined',
  'lining_type': 'liningType',
  'liningtype': 'liningType',
  'jacketed': 'isJacketed',

  // =============================================================================
  // QUALIFICATION DATE FIELDS (Columns T-AB in master CSV)
  // =============================================================================
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
  'rule_88b_': 'rule88B',

  'safety_relief': 'safetyRelief',
  'safetyrelief': 'safetyRelief',

  'service_equipment': 'serviceEquipment',
  'serviceequipment': 'serviceEquipment',
  'service_equipment_': 'serviceEquipment',

  'stub_sill': 'stubSill',
  'stubsill': 'stubSill',

  'tank_thickness': 'tankThickness',
  'tankthickness': 'tankThickness',

  'tank_qualification': 'tankQualification',
  'tankqualification': 'tankQualification',

  // =============================================================================
  // ADDITIONAL QUALIFICATION FIELDS
  // =============================================================================
  'full/partial_qual': 'fullPartialQual',
  'fullpartialqual': 'fullPartialQual',
  'full_partial_qual': 'fullPartialQual',

  'perform_tank_qual': 'performTankQual',
  'performtankqual': 'performTankQual',

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

  // =============================================================================
  // OTHER FIELDS
  // =============================================================================
  'commodity': 'commodity',
  'primary_commodity': 'commodity',
  'primarycommodity': 'commodity',
  'commod': 'commodity',

  'location': 'currentLocation',
  'current_location': 'currentLocation',
  'currentlocation': 'currentLocation',

  'home_region': 'homeRegion',
  'homeregion': 'homeRegion',

  'origin_region': 'originRegion',
  'originregion': 'originRegion',

  'past_region': 'pastRegion',
  'pastregion': 'pastRegion',

  '2026_region': 'region2026',
  'region_2026': 'region2026',
  'region2026': 'region2026',

  'notes': 'notes',

  // Contact fields
  'csr': 'csr',
  'csl': 'csl',
  'commercial': 'commercial',
  'commericial': 'commercial', // Common typo in CSV

  // FMS fields
  'fms_lessee_number': 'fmsLesseeNumber',
  'fmslesseenumber': 'fmsLesseeNumber',
  'fms_lessee': 'fmsLesseeNumber',

  // Car age/build year
  'car_age': 'buildYear',
  'carage': 'buildYear',
  'build_year': 'buildYear',
  'buildyear': 'buildYear',
  'year_built': 'buildYear',
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
    let carMark = '';

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
      // Handle Mark column (Column P in master CSV)
      if (header === 'mark' || header === 'car_mark' || header === 'carmark') {
        carMark = value;
        return;
      }
      // Handle Number column (Column Q in master CSV)
      if (header === 'number' && !carObj.railcarNumber) {
        carNo = value;
        return;
      }

      // Map header to Car field
      const fieldName = HEADER_MAPPINGS[header];
      if (!fieldName) return;

      // Handle different value types based on field
      const valueLower = value.toLowerCase().trim();

      // Boolean fields
      if (fieldName === 'lined' || fieldName === 'tankQualified' || fieldName === 'performTankQual' || fieldName === 'isTankCar' || fieldName === 'isJacketed') {
        carObj[fieldName] = valueLower === 'true' ||
                            valueLower === 'yes' ||
                            valueLower === 'y' ||
                            valueLower === 'jacketed' ||
                            valueLower === 'lined' ||
                            value === '1';
      }
      // Portfolio field - "On Lease" or "Active" = true
      else if (fieldName === 'portfolio') {
        carObj[fieldName] = valueLower === 'on lease' ||
                            valueLower === 'active' ||
                            valueLower === 'yes' ||
                            valueLower === 'true' ||
                            value === '1';
      }
      // performScheduled field - "Planned Shopping" or "Planned" = true
      else if (fieldName === 'performScheduled' || fieldName === 'scheduled') {
        carObj.performScheduled = valueLower.includes('planned') ||
                                   valueLower === 'yes' ||
                                   valueLower === 'true' ||
                                   value === '1';
      }
      // Numeric fields
      else if (fieldName === 'projectedCost' || fieldName === 'daysInShop') {
        carObj[fieldName] = parseFloat(value) || 0;
      }
      // Build year - extract year number
      else if (fieldName === 'buildYear') {
        const yearNum = parseInt(value);
        if (!isNaN(yearNum) && yearNum > 1900 && yearNum < 2100) {
          carObj[fieldName] = yearNum;
        }
      }
      // All other fields - pass through as string
      else {
        carObj[fieldName] = value;
      }
    });

    // Combine Car Init/Mark + Car No if railcarNumber not directly set
    if (!carObj.railcarNumber) {
      const prefix = carInit || carMark || '';
      if (prefix && carNo) {
        carObj.railcarNumber = `${prefix}${carNo}`;
      } else if (carNo) {
        carObj.railcarNumber = carNo;
      }
    }

    // Store carMark separately if available
    if (carMark) {
      carObj.carMark = carMark;
    }
    if (carNo) {
      carObj.carNumber = carNo;
    }

    // Auto-detect tank car from car type
    if (carObj.carType && typeof carObj.carType === 'string' && !carObj.isTankCar) {
      const carTypeLower = (carObj.carType as string).toLowerCase();
      carObj.isTankCar = carTypeLower.includes('tank') || carTypeLower.includes('general service');
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
