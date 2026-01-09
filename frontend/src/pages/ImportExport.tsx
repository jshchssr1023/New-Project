import { useState, useCallback } from 'react';
import {
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  ArrowPathIcon,
  DocumentArrowDownIcon,
} from '@heroicons/react/24/outline';

interface ImportPreview {
  totalRows: number;
  validRows: number;
  errorRows: number;
  headers: string[];
  headerMapping: Record<string, string>;
  unmappedHeaders: string[];
  missingFields: string[];
  sampleData: Record<string, unknown>[];
  errors: { row: number; errors: string[] }[];
}

interface ImportResult {
  success: boolean;
  imported: number;
  updated: number;
  skipped: number;
  errors: { row: number; identifier: string; error: string }[];
  duration: number;
}

type EntityType = 'cars' | 'shops';
type Tab = 'import' | 'export';

export default function ImportExport() {
  const [activeTab, setActiveTab] = useState<Tab>('import');
  const [entityType, setEntityType] = useState<EntityType>('cars');
  const [csvContent, setCsvContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [updateExisting, setUpdateExisting] = useState(true);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      setError('Please select a CSV file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('File too large. Maximum size is 10MB.');
      return;
    }

    setFileName(file.name);
    setError('');
    setPreview(null);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCsvContent(content);
    };
    reader.onerror = () => {
      setError('Failed to read file');
    };
    reader.readAsText(file);
  }, []);

  const handlePreview = async () => {
    if (!csvContent) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/import-export/${entityType}/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ csvContent }),
      });

      if (res.ok) {
        const data = await res.json();
        setPreview(data);
      } else {
        const err = await res.json();
        setError(err.error || 'Preview failed');
      }
    } catch (err) {
      setError('Failed to preview import');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!csvContent) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/import-export/${entityType}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          csvContent,
          updateExisting,
          customMappings: preview?.headerMapping,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setImportResult(data);
        setPreview(null);
      } else {
        const err = await res.json();
        setError(err.error || 'Import failed');
      }
    } catch (err) {
      setError('Failed to import data');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (type: EntityType) => {
    setLoading(true);

    try {
      const res = await fetch(`/api/import-export/${type}/export`, {
        credentials: 'include',
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${type}_export_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError('Export failed');
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = async (type: EntityType) => {
    try {
      const res = await fetch(`/api/import-export/template/${type}`, {
        credentials: 'include',
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${type}_import_template.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError('Failed to download template');
    }
  };

  const reset = () => {
    setCsvContent('');
    setFileName('');
    setPreview(null);
    setImportResult(null);
    setError('');
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-steel-900 flex items-center gap-2">
          <DocumentTextIcon className="h-7 w-7 text-navy-600" />
          Import / Export Data
        </h1>
        <p className="text-steel-500 mt-1">
          Import data from CSV files or export your data for backup
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-steel-200 mb-6">
        <button
          onClick={() => setActiveTab('import')}
          className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === 'import'
              ? 'border-navy-600 text-navy-600'
              : 'border-transparent text-steel-500 hover:text-steel-700'
          }`}
        >
          <ArrowUpTrayIcon className="h-4 w-4" />
          Import
        </button>
        <button
          onClick={() => setActiveTab('export')}
          className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === 'export'
              ? 'border-navy-600 text-navy-600'
              : 'border-transparent text-steel-500 hover:text-steel-700'
          }`}
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          Export
        </button>
      </div>

      {/* Import Tab */}
      {activeTab === 'import' && (
        <div className="space-y-6">
          {/* Entity Type Selection */}
          <div className="bg-white rounded-lg border border-steel-200 p-6">
            <h2 className="font-medium text-steel-900 mb-4">1. Select Data Type</h2>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="entityType"
                  checked={entityType === 'cars'}
                  onChange={() => {
                    setEntityType('cars');
                    reset();
                  }}
                  className="text-navy-600 focus:ring-navy-500"
                />
                <span className="text-sm text-steel-700">Railcars</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="entityType"
                  checked={entityType === 'shops'}
                  onChange={() => {
                    setEntityType('shops');
                    reset();
                  }}
                  className="text-navy-600 focus:ring-navy-500"
                />
                <span className="text-sm text-steel-700">Shops</span>
              </label>
            </div>
            <button
              onClick={() => downloadTemplate(entityType)}
              className="mt-4 text-sm text-navy-600 hover:text-navy-700 flex items-center gap-1"
            >
              <DocumentArrowDownIcon className="h-4 w-4" />
              Download {entityType} template
            </button>
          </div>

          {/* File Upload */}
          <div className="bg-white rounded-lg border border-steel-200 p-6">
            <h2 className="font-medium text-steel-900 mb-4">2. Upload CSV File</h2>

            {!fileName ? (
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-steel-300 rounded-lg p-8 cursor-pointer hover:border-navy-400 transition-colors">
                <ArrowUpTrayIcon className="h-10 w-10 text-steel-400 mb-3" />
                <span className="text-sm text-steel-600 mb-1">Click to upload or drag and drop</span>
                <span className="text-xs text-steel-400">CSV files only, max 10MB</span>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="flex items-center justify-between bg-steel-50 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <DocumentTextIcon className="h-8 w-8 text-navy-600" />
                  <div>
                    <p className="font-medium text-steel-900">{fileName}</p>
                    <p className="text-xs text-steel-500">
                      {(csvContent.length / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <button
                  onClick={reset}
                  className="text-sm text-steel-500 hover:text-red-600"
                >
                  Remove
                </button>
              </div>
            )}

            {csvContent && !preview && !importResult && (
              <button
                onClick={handlePreview}
                disabled={loading}
                className="mt-4 w-full px-4 py-2 bg-navy-600 text-white rounded-lg hover:bg-navy-700 disabled:bg-steel-300 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUpTrayIcon className="h-4 w-4" />
                )}
                Preview Import
              </button>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <XCircleIcon className="h-5 w-5 text-red-500 mt-0.5" />
              <div>
                <p className="font-medium text-red-800">Error</p>
                <p className="text-sm text-red-600">{error}</p>
              </div>
            </div>
          )}

          {/* Preview */}
          {preview && (
            <div className="bg-white rounded-lg border border-steel-200 p-6">
              <h2 className="font-medium text-steel-900 mb-4">3. Preview & Confirm</h2>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-steel-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-steel-900">{preview.totalRows}</p>
                  <p className="text-xs text-steel-500">Total Rows</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-green-600">{preview.validRows}</p>
                  <p className="text-xs text-green-600">Valid</p>
                </div>
                <div className="bg-red-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-red-600">{preview.errorRows}</p>
                  <p className="text-xs text-red-600">Errors</p>
                </div>
              </div>

              {/* Mapping warnings */}
              {preview.missingFields.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                  <div className="flex items-start gap-2">
                    <ExclamationTriangleIcon className="h-5 w-5 text-amber-500 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-800">Missing Required Fields</p>
                      <p className="text-sm text-amber-600">
                        {preview.missingFields.join(', ')}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {preview.unmappedHeaders.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <div className="flex items-start gap-2">
                    <ExclamationTriangleIcon className="h-5 w-5 text-blue-500 mt-0.5" />
                    <div>
                      <p className="font-medium text-blue-800">Unmapped Columns (will be ignored)</p>
                      <p className="text-sm text-blue-600">
                        {preview.unmappedHeaders.join(', ')}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Sample data */}
              {preview.sampleData.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-steel-700 mb-2">Sample Data (first 5 rows)</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="bg-steel-100">
                          {Object.keys(preview.sampleData[0]).slice(0, 8).map(key => (
                            <th key={key} className="px-2 py-1 text-left font-medium text-steel-600">
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.sampleData.map((row, idx) => (
                          <tr key={idx} className="border-b border-steel-100">
                            {Object.values(row).slice(0, 8).map((val, i) => (
                              <td key={i} className="px-2 py-1 text-steel-700">
                                {val === null ? '-' : String(val).slice(0, 30)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Errors preview */}
              {preview.errors.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-red-700 mb-2">
                    Rows with Errors (showing first 20)
                  </h3>
                  <div className="max-h-40 overflow-y-auto bg-red-50 rounded-lg p-3">
                    {preview.errors.map((err, idx) => (
                      <div key={idx} className="text-xs text-red-600 mb-1">
                        Row {err.row}: {err.errors.join('; ')}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Options */}
              <div className="mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={updateExisting}
                    onChange={(e) => setUpdateExisting(e.target.checked)}
                    className="rounded border-steel-300 text-navy-600 focus:ring-navy-500"
                  />
                  <span className="text-sm text-steel-700">Update existing records</span>
                </label>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={reset}
                  className="px-4 py-2 border border-steel-300 rounded-lg text-steel-700 hover:bg-steel-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  disabled={loading || preview.missingFields.length > 0}
                  className="flex-1 px-4 py-2 bg-navy-600 text-white rounded-lg hover:bg-navy-700 disabled:bg-steel-300 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircleIcon className="h-4 w-4" />
                  )}
                  Import {preview.validRows} Records
                </button>
              </div>
            </div>
          )}

          {/* Import Result */}
          {importResult && (
            <div className="bg-white rounded-lg border border-steel-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                {importResult.success ? (
                  <CheckCircleIcon className="h-8 w-8 text-green-500" />
                ) : (
                  <ExclamationTriangleIcon className="h-8 w-8 text-amber-500" />
                )}
                <div>
                  <h2 className="font-medium text-steel-900">Import Complete</h2>
                  <p className="text-sm text-steel-500">
                    Completed in {(importResult.duration / 1000).toFixed(2)}s
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-green-600">{importResult.imported}</p>
                  <p className="text-xs text-green-600">Imported</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-blue-600">{importResult.updated}</p>
                  <p className="text-xs text-blue-600">Updated</p>
                </div>
                <div className="bg-steel-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-steel-600">{importResult.skipped}</p>
                  <p className="text-xs text-steel-600">Skipped</p>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div className="bg-red-50 rounded-lg p-4 mb-4">
                  <h3 className="text-sm font-medium text-red-700 mb-2">
                    Errors ({importResult.errors.length})
                  </h3>
                  <div className="max-h-40 overflow-y-auto">
                    {importResult.errors.slice(0, 20).map((err, idx) => (
                      <div key={idx} className="text-xs text-red-600 mb-1">
                        Row {err.row} ({err.identifier}): {err.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={reset}
                className="w-full px-4 py-2 bg-navy-600 text-white rounded-lg hover:bg-navy-700"
              >
                Import More Data
              </button>
            </div>
          )}
        </div>
      )}

      {/* Export Tab */}
      {activeTab === 'export' && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-steel-200 p-6">
            <h2 className="font-medium text-steel-900 mb-4">Export Data</h2>
            <p className="text-sm text-steel-500 mb-6">
              Download your data as CSV files for backup or analysis.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => handleExport('cars')}
                disabled={loading}
                className="flex items-center gap-4 p-4 border border-steel-200 rounded-lg hover:border-navy-400 hover:bg-navy-50 transition-colors text-left"
              >
                <div className="p-3 bg-navy-100 rounded-lg">
                  <ArrowDownTrayIcon className="h-6 w-6 text-navy-600" />
                </div>
                <div>
                  <p className="font-medium text-steel-900">Export Railcars</p>
                  <p className="text-sm text-steel-500">All railcar data</p>
                </div>
              </button>

              <button
                onClick={() => handleExport('shops')}
                disabled={loading}
                className="flex items-center gap-4 p-4 border border-steel-200 rounded-lg hover:border-navy-400 hover:bg-navy-50 transition-colors text-left"
              >
                <div className="p-3 bg-navy-100 rounded-lg">
                  <ArrowDownTrayIcon className="h-6 w-6 text-navy-600" />
                </div>
                <div>
                  <p className="font-medium text-steel-900">Export Shops</p>
                  <p className="text-sm text-steel-500">Shop network data</p>
                </div>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-steel-200 p-6">
            <h2 className="font-medium text-steel-900 mb-4">Download Templates</h2>
            <p className="text-sm text-steel-500 mb-4">
              Get CSV templates with the correct column headers for importing.
            </p>

            <div className="flex gap-4">
              <button
                onClick={() => downloadTemplate('cars')}
                className="text-sm text-navy-600 hover:text-navy-700 flex items-center gap-1"
              >
                <DocumentArrowDownIcon className="h-4 w-4" />
                Cars Template
              </button>
              <button
                onClick={() => downloadTemplate('shops')}
                className="text-sm text-navy-600 hover:text-navy-700 flex items-center gap-1"
              >
                <DocumentArrowDownIcon className="h-4 w-4" />
                Shops Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
