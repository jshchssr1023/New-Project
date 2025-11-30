/**
 * Import Workflow Component
 *
 * Implements 3-step validation flow:
 * Step 1: Upload File
 * Step 2: Preview/Validate Data Errors
 * Step 3: Confirm Field Mapping
 *
 * Generates downloadable Error Report CSV on failure
 */

import { useState, useCallback } from 'react';
import {
  CloudArrowUpIcon,
  DocumentMagnifyingGlassIcon,
  CheckBadgeIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  CheckCircleIcon,
  ArrowDownTrayIcon,
  XMarkIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  TableCellsIcon,
  ArrowsRightLeftIcon,
} from '@heroicons/react/24/outline';
import { masterPlanWizardApi, type ImportSessionData } from '../services/api';

// =============================================================================
// TYPES
// =============================================================================

interface ImportWorkflowProps {
  sessionType: 'cars' | 'shops' | 'capacity';
  onComplete: (result: { importedCount: number; updatedCount: number }) => void;
  onCancel: () => void;
}

type Step = 1 | 2 | 3;

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function ImportWorkflow({
  sessionType,
  onComplete,
  onCancel,
}: ImportWorkflowProps) {
  // State
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<ImportSessionData | null>(null);

  // File state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string>('');

  // Mapping state
  const [fieldMappings, setFieldMappings] = useState<Record<string, string>>({});

  // =============================================================================
  // STEP 1: FILE UPLOAD
  // =============================================================================

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.csv')) {
      setError('Please select a CSV file');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB');
      return;
    }

    setSelectedFile(file);
    setError(null);

    // Read file content
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setFileContent(content);
    };
    reader.readAsText(file);
  }, []);

  const handleUpload = async () => {
    if (!selectedFile || !fileContent) {
      setError('Please select a file first');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const result = await masterPlanWizardApi.createImportSession({
        sessionType,
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        rawData: fileContent,
      });

      setSession(result.session);
      setCurrentStep(2);

      // Automatically validate
      await handleValidate(result.session.id);
    } catch (err) {
      console.error('Upload failed:', err);
      setError('Failed to upload file. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // =============================================================================
  // STEP 2: VALIDATE
  // =============================================================================

  const handleValidate = async (sessionId?: string) => {
    const id = sessionId || session?.id;
    if (!id) return;

    try {
      setIsLoading(true);
      setError(null);

      const result = await masterPlanWizardApi.validateImportSession(id);
      setSession(result.session);
      setFieldMappings(result.session.fieldMappings);
    } catch (err) {
      console.error('Validation failed:', err);
      setError('Failed to validate file');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadErrorReport = async () => {
    if (!session?.id) return;

    try {
      const result = await masterPlanWizardApi.getErrorReportUrl(session.id);
      window.open(result.downloadUrl, '_blank');
    } catch (err) {
      console.error('Failed to get error report:', err);
      setError('Failed to download error report');
    }
  };

  // =============================================================================
  // STEP 3: MAPPING & EXECUTE
  // =============================================================================

  const handleMappingChange = (sourceField: string, targetField: string) => {
    setFieldMappings(prev => ({
      ...prev,
      [sourceField.toLowerCase()]: targetField,
    }));
  };

  const handleConfirmMapping = async () => {
    if (!session?.id) return;

    try {
      setIsLoading(true);
      setError(null);

      await masterPlanWizardApi.updateFieldMappings(session.id, fieldMappings);
      setCurrentStep(3);
    } catch (err) {
      console.error('Failed to update mappings:', err);
      setError('Failed to save field mappings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteImport = async () => {
    if (!session?.id) return;

    try {
      setIsLoading(true);
      setError(null);

      const result = await masterPlanWizardApi.executeImport(session.id);

      if (result.result.success || result.result.importedCount > 0) {
        onComplete({
          importedCount: result.result.importedCount,
          updatedCount: result.result.updatedCount,
        });
      } else {
        setError(`Import failed: ${result.result.errors.length} errors`);
      }
    } catch (err) {
      console.error('Import failed:', err);
      setError('Failed to execute import');
    } finally {
      setIsLoading(false);
    }
  };

  // =============================================================================
  // RENDER: STEP INDICATOR
  // =============================================================================

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center mb-6">
      {[
        { step: 1, icon: CloudArrowUpIcon, label: 'Upload' },
        { step: 2, icon: DocumentMagnifyingGlassIcon, label: 'Validate' },
        { step: 3, icon: CheckBadgeIcon, label: 'Confirm' },
      ].map((item, index) => (
        <div key={item.step} className="flex items-center">
          <div
            className={`flex flex-col items-center ${
              currentStep >= item.step ? 'text-blue-600' : 'text-gray-400'
            }`}
          >
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center ${
                currentStep > item.step
                  ? 'bg-green-500 text-white'
                  : currentStep === item.step
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200'
              }`}
            >
              {currentStep > item.step ? (
                <CheckCircleIcon className="h-5 w-5" />
              ) : (
                <item.icon className="h-5 w-5" />
              )}
            </div>
            <span className="text-xs mt-1">{item.label}</span>
          </div>
          {index < 2 && (
            <div
              className={`w-16 h-0.5 mx-2 ${
                currentStep > item.step ? 'bg-green-500' : 'bg-gray-200'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );

  // =============================================================================
  // RENDER: STEP 1 - UPLOAD
  // =============================================================================

  const renderStep1 = () => (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">Upload CSV File</h3>
        <p className="text-sm text-gray-500">
          Select a CSV file to import {sessionType} data
        </p>
      </div>

      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
        <input
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          className="hidden"
          id="file-upload"
        />
        <label htmlFor="file-upload" className="cursor-pointer">
          <CloudArrowUpIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          {selectedFile ? (
            <div>
              <p className="font-medium text-blue-600">{selectedFile.name}</p>
              <p className="text-sm text-gray-500">
                {(selectedFile.size / 1024).toFixed(1)} KB
              </p>
            </div>
          ) : (
            <div>
              <p className="font-medium text-gray-700">Click to select file</p>
              <p className="text-sm text-gray-500">or drag and drop</p>
            </div>
          )}
        </label>
      </div>

      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="font-medium mb-2">File Requirements:</h4>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>- CSV format with headers in first row</li>
          <li>- Maximum file size: 10 MB</li>
          <li>- UTF-8 encoding recommended</li>
          <li>
            - Required fields for {sessionType}:{' '}
            {sessionType === 'cars'
              ? 'railcarNumber'
              : sessionType === 'shops'
              ? 'name, code'
              : 'shopCode, weekKey'}
          </li>
        </ul>
      </div>

      <div className="flex justify-end gap-3">
        <button
          onClick={onCancel}
          className="px-4 py-2 border rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleUpload}
          disabled={!selectedFile || isLoading}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
            !selectedFile || isLoading
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {isLoading ? (
            <ArrowPathIcon className="h-5 w-5 animate-spin" />
          ) : (
            <CloudArrowUpIcon className="h-5 w-5" />
          )}
          Upload & Validate
        </button>
      </div>
    </div>
  );

  // =============================================================================
  // RENDER: STEP 2 - VALIDATE
  // =============================================================================

  const renderStep2 = () => {
    if (!session) return null;

    return (
      <div className="space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">Validation Results</h3>
          <p className="text-sm text-gray-500">
            Review the validation results before proceeding
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white border rounded-lg p-3 text-center">
            <div className="text-2xl font-bold">{session.totalRows}</div>
            <div className="text-xs text-gray-500">Total Rows</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-green-600">{session.validRows}</div>
            <div className="text-xs text-gray-500">Valid</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-red-600">{session.errorRows}</div>
            <div className="text-xs text-gray-500">Errors</div>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-yellow-600">{session.warningRows}</div>
            <div className="text-xs text-gray-500">Warnings</div>
          </div>
        </div>

        {/* Errors List */}
        {session.validationErrors.length > 0 && (
          <div className="border border-red-200 rounded-lg overflow-hidden">
            <div className="bg-red-50 px-4 py-2 border-b border-red-200 flex items-center justify-between">
              <span className="font-medium text-red-700 flex items-center gap-2">
                <XCircleIcon className="h-5 w-5" />
                Validation Errors ({session.validationErrors.length})
              </span>
              <button
                onClick={handleDownloadErrorReport}
                className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1"
              >
                <ArrowDownTrayIcon className="h-4 w-4" />
                Download Report
              </button>
            </div>
            <div className="max-h-40 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">Row</th>
                    <th className="px-3 py-2 text-left">Field</th>
                    <th className="px-3 py-2 text-left">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {session.validationErrors.slice(0, 10).map((err, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-xs">{err.row}</td>
                      <td className="px-3 py-2">{err.field}</td>
                      <td className="px-3 py-2 text-red-600">{err.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {session.validationErrors.length > 10 && (
                <div className="px-3 py-2 text-center text-sm text-gray-500 bg-gray-50">
                  +{session.validationErrors.length - 10} more errors
                </div>
              )}
            </div>
          </div>
        )}

        {/* Warnings List */}
        {session.validationWarnings.length > 0 && (
          <div className="border border-yellow-200 rounded-lg overflow-hidden">
            <div className="bg-yellow-50 px-4 py-2 border-b border-yellow-200">
              <span className="font-medium text-yellow-700 flex items-center gap-2">
                <ExclamationTriangleIcon className="h-5 w-5" />
                Warnings ({session.validationWarnings.length})
              </span>
            </div>
            <div className="max-h-32 overflow-y-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  {session.validationWarnings.slice(0, 5).map((warn, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-xs w-16">{warn.row}</td>
                      <td className="px-3 py-2 text-yellow-700">{warn.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Preview Data */}
        {session.previewData.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b flex items-center gap-2">
              <TableCellsIcon className="h-5 w-5 text-gray-500" />
              <span className="font-medium">Data Preview</span>
            </div>
            <div className="overflow-x-auto max-h-48">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    {session.detectedHeaders.slice(0, 8).map((header) => (
                      <th key={header} className="px-3 py-2 text-left whitespace-nowrap">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {session.previewData.slice(0, 5).map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      {session.detectedHeaders.slice(0, 8).map((header) => (
                        <td key={header} className="px-3 py-2 truncate max-w-[150px]">
                          {String(row[header] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-between pt-4">
          <button
            onClick={() => setCurrentStep(1)}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <ChevronLeftIcon className="h-5 w-5" />
            Back
          </button>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmMapping}
              disabled={session.errorRows > 0 || isLoading}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                session.errorRows > 0 || isLoading
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isLoading ? (
                <ArrowPathIcon className="h-5 w-5 animate-spin" />
              ) : (
                <ArrowsRightLeftIcon className="h-5 w-5" />
              )}
              Confirm Mappings
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  // =============================================================================
  // RENDER: STEP 3 - CONFIRM & EXECUTE
  // =============================================================================

  const renderStep3 = () => {
    if (!session) return null;

    return (
      <div className="space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">Confirm Field Mapping</h3>
          <p className="text-sm text-gray-500">
            Review how source columns map to target fields
          </p>
        </div>

        {/* Field Mappings */}
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b">
            <span className="font-medium">Field Mappings</span>
          </div>
          <div className="p-4 space-y-2">
            {session.detectedHeaders.map((header) => {
              const mappedTo = fieldMappings[header.toLowerCase()] || '';
              const isUnmapped = session.unmappedFields.includes(header);

              return (
                <div
                  key={header}
                  className={`flex items-center gap-4 p-2 rounded ${
                    isUnmapped ? 'bg-yellow-50' : 'bg-gray-50'
                  }`}
                >
                  <div className="w-1/3 font-mono text-sm">{header}</div>
                  <ArrowsRightLeftIcon className="h-4 w-4 text-gray-400" />
                  <select
                    value={mappedTo}
                    onChange={(e) => handleMappingChange(header, e.target.value)}
                    className="flex-1 px-3 py-1.5 border rounded text-sm"
                  >
                    <option value="">-- Skip this field --</option>
                    <optgroup label="Required Fields">
                      {sessionType === 'cars' && (
                        <option value="railcarNumber">railcarNumber</option>
                      )}
                      {sessionType === 'shops' && (
                        <>
                          <option value="name">name</option>
                          <option value="code">code</option>
                        </>
                      )}
                      {sessionType === 'capacity' && (
                        <>
                          <option value="shopCode">shopCode</option>
                          <option value="weekKey">weekKey</option>
                        </>
                      )}
                    </optgroup>
                    <optgroup label="Optional Fields">
                      {sessionType === 'cars' && (
                        <>
                          <option value="carType">carType</option>
                          <option value="customer">customer</option>
                          <option value="commodity">commodity</option>
                          <option value="status">status</option>
                          <option value="isTankCar">isTankCar</option>
                          <option value="tankQualDueDate">tankQualDueDate</option>
                          <option value="reasonShopped">reasonShopped</option>
                        </>
                      )}
                      {sessionType === 'shops' && (
                        <>
                          <option value="location">location</option>
                          <option value="region">region</option>
                          <option value="network">network</option>
                          <option value="capacity">capacity</option>
                          <option value="tankQualified">tankQualified</option>
                        </>
                      )}
                      {sessionType === 'capacity' && (
                        <>
                          <option value="qualCapacity">qualCapacity</option>
                          <option value="assignCapacity">assignCapacity</option>
                          <option value="returnCapacity">returnCapacity</option>
                          <option value="repairCapacity">repairCapacity</option>
                        </>
                      )}
                    </optgroup>
                  </select>
                  {isUnmapped && (
                    <span className="text-xs text-yellow-600">Unmapped</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Import Summary */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-800 mb-2">Import Summary</h4>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-700">{session.validRows}</div>
              <div className="text-xs text-blue-600">Rows to Import</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-700">
                {Object.keys(fieldMappings).filter((k) => fieldMappings[k]).length}
              </div>
              <div className="text-xs text-blue-600">Fields Mapped</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-700">
                {session.unmappedFields.length}
              </div>
              <div className="text-xs text-blue-600">Fields Skipped</div>
            </div>
          </div>
        </div>

        <div className="flex justify-between pt-4">
          <button
            onClick={() => setCurrentStep(2)}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <ChevronLeftIcon className="h-5 w-5" />
            Back
          </button>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleExecuteImport}
              disabled={isLoading}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                isLoading
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {isLoading ? (
                <ArrowPathIcon className="h-5 w-5 animate-spin" />
              ) : (
                <CheckBadgeIcon className="h-5 w-5" />
              )}
              Execute Import
            </button>
          </div>
        </div>
      </div>
    );
  };

  // =============================================================================
  // MAIN RENDER
  // =============================================================================

  return (
    <div className="bg-white rounded-lg shadow-lg w-full max-w-3xl">
      {/* Header */}
      <div className="px-6 py-4 border-b flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Import {sessionType.charAt(0).toUpperCase() + sessionType.slice(1)}
        </h2>
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600"
        >
          <XMarkIcon className="h-6 w-6" />
        </button>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <ExclamationTriangleIcon className="h-5 w-5" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto">
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Step Indicator */}
        {renderStepIndicator()}

        {/* Step Content */}
        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
        {currentStep === 3 && renderStep3()}
      </div>
    </div>
  );
}
