import { useState, useEffect } from 'react';
import {
  DocumentArrowDownIcon,
  TableCellsIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  XMarkIcon,
  ArrowsUpDownIcon,
  FunnelIcon,
  BookmarkIcon,
  TrashIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import { reportsApi, ReportColumn, FilterCriteria, ReportTemplate } from '../services/api';

interface ReportBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  defaultEntityType?: string;
  currentFilters?: Record<string, string>;
  currentSort?: { field: string; direction: 'asc' | 'desc' };
}

const ENTITY_TYPES = [
  { value: 'Car', label: 'Railcars' },
  { value: 'Shop', label: 'Shop Network' },
  { value: 'Plan', label: 'Plans' },
  { value: 'Assignment', label: 'Assignments' },
  { value: 'Scenario', label: 'Scenarios' },
];

const FILTER_OPERATORS = [
  { value: 'equals', label: 'Equals', types: ['string', 'number', 'boolean'] },
  { value: 'notEquals', label: 'Not Equals', types: ['string', 'number', 'boolean'] },
  { value: 'contains', label: 'Contains', types: ['string'] },
  { value: 'startsWith', label: 'Starts With', types: ['string'] },
  { value: 'greaterThan', label: 'Greater Than', types: ['number', 'date'] },
  { value: 'lessThan', label: 'Less Than', types: ['number', 'date'] },
  { value: 'between', label: 'Between', types: ['number', 'date'] },
  { value: 'isNull', label: 'Is Empty', types: ['string', 'number', 'date', 'boolean'] },
  { value: 'isNotNull', label: 'Is Not Empty', types: ['string', 'number', 'date', 'boolean'] },
];

export default function ReportBuilder({
  isOpen,
  onClose,
  defaultEntityType = 'Car',
  currentFilters,
  currentSort,
}: ReportBuilderProps) {
  const [entityType, setEntityType] = useState(defaultEntityType);
  const [availableColumns, setAvailableColumns] = useState<ReportColumn[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [filters, setFilters] = useState<FilterCriteria[]>([]);
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(currentSort || null);
  const [groupBy, setGroupBy] = useState<string>('');
  const [previewData, setPreviewData] = useState<Record<string, unknown>[] | null>(null);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [outputFormat, setOutputFormat] = useState<'csv' | 'xlsx'>('csv');

  // Load available columns when entity type changes
  useEffect(() => {
    if (entityType) {
      loadColumns();
    }
  }, [entityType]);

  // Load templates on mount
  useEffect(() => {
    loadTemplates();
  }, []);

  // Apply current filters when provided
  useEffect(() => {
    if (currentFilters && availableColumns.length > 0) {
      const appliedFilters: FilterCriteria[] = [];
      for (const [field, value] of Object.entries(currentFilters)) {
        if (value && availableColumns.find(c => c.key === field)) {
          appliedFilters.push({
            field,
            operator: 'equals',
            value,
          });
        }
      }
      if (appliedFilters.length > 0) {
        setFilters(appliedFilters);
      }
    }
  }, [currentFilters, availableColumns]);

  const loadColumns = async () => {
    try {
      const columns = await reportsApi.getColumns(entityType);
      setAvailableColumns(columns);
      // Auto-select default visible columns
      const defaultSelected = columns.filter(c => c.defaultVisible).map(c => c.key);
      setSelectedColumns(defaultSelected);
    } catch (error) {
      console.error('Failed to load columns:', error);
    }
  };

  const loadTemplates = async () => {
    try {
      const data = await reportsApi.getTemplates();
      setTemplates(data);
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  };

  const toggleColumn = (columnKey: string) => {
    setSelectedColumns(prev =>
      prev.includes(columnKey)
        ? prev.filter(k => k !== columnKey)
        : [...prev, columnKey]
    );
  };

  const moveColumn = (columnKey: string, direction: 'up' | 'down') => {
    setSelectedColumns(prev => {
      const idx = prev.indexOf(columnKey);
      if (idx === -1) return prev;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const newArr = [...prev];
      [newArr[idx], newArr[newIdx]] = [newArr[newIdx], newArr[idx]];
      return newArr;
    });
  };

  const addFilter = () => {
    const firstFilterable = availableColumns.find(c => c.filterable);
    if (firstFilterable) {
      setFilters(prev => [
        ...prev,
        { field: firstFilterable.key, operator: 'equals', value: '' },
      ]);
    }
  };

  const updateFilter = (index: number, updates: Partial<FilterCriteria>) => {
    setFilters(prev => prev.map((f, i) => (i === index ? { ...f, ...updates } : f)));
  };

  const removeFilter = (index: number) => {
    setFilters(prev => prev.filter((_, i) => i !== index));
  };

  const runPreview = async () => {
    if (selectedColumns.length === 0) return;

    setIsLoading(true);
    try {
      const result = await reportsApi.executeReport({
        entityType,
        columns: selectedColumns,
        filters: filters.length > 0 ? filters : undefined,
        sort: sort || undefined,
        groupBy: groupBy || undefined,
      });
      setPreviewData(result.data.slice(0, 10)); // Show first 10 rows
      setPreviewTotal(result.total);
      setShowPreview(true);
    } catch (error) {
      console.error('Failed to run preview:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async () => {
    if (selectedColumns.length === 0) return;

    setIsLoading(true);
    try {
      if (outputFormat === 'csv') {
        const blob = await reportsApi.exportCSV({
          entityType,
          columns: selectedColumns,
          filters: filters.length > 0 ? filters : undefined,
          sort: sort || undefined,
        });

        // Download the file
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${entityType.toLowerCase()}-report-${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const data = await reportsApi.exportExcel({
          entityType,
          columns: selectedColumns,
          filters: filters.length > 0 ? filters : undefined,
          sort: sort || undefined,
        });

        // For Excel, we'd need a library like xlsx to create the file
        // For now, convert to CSV format
        const csv = [
          data.headers.join(','),
          ...data.rows.map(row => row.map(cell => {
            const str = String(cell ?? '');
            return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
          }).join(','))
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${entityType.toLowerCase()}-report-${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Failed to export:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveTemplate = async () => {
    if (!templateName || selectedColumns.length === 0) return;

    try {
      await reportsApi.createTemplate({
        name: templateName,
        entityType,
        columns: selectedColumns,
        filters,
        sortConfig: sort,
        groupBy,
        outputFormats: [outputFormat],
        isPublic: false,
      });
      setShowSaveTemplate(false);
      setTemplateName('');
      loadTemplates();
    } catch (error) {
      console.error('Failed to save template:', error);
    }
  };

  const loadTemplate = async (template: ReportTemplate) => {
    setEntityType(template.entityType);
    // Wait for columns to load
    const columns = await reportsApi.getColumns(template.entityType);
    setAvailableColumns(columns);
    setSelectedColumns(template.columns);
    setFilters(template.filters);
    setSort(template.sortConfig);
    setGroupBy(template.groupBy || '');
    setOutputFormat(template.outputFormats[0] as 'csv' | 'xlsx' || 'csv');
  };

  const deleteTemplate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this template?')) return;

    try {
      await reportsApi.deleteTemplate(id);
      loadTemplates();
    } catch (error) {
      console.error('Failed to delete template:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-steel-900/50" onClick={onClose} />
        <div className="relative w-full max-w-6xl rounded-xl bg-white shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-steel-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TableCellsIcon className="h-6 w-6 text-rail-600" />
              <h2 className="text-xl font-semibold text-steel-900">Custom Report Builder</h2>
            </div>
            <button onClick={onClose} className="text-steel-400 hover:text-steel-600">
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Panel - Configuration */}
              <div className="lg:col-span-2 space-y-6">
                {/* Entity Type Selection */}
                <div>
                  <label className="label">Report Type</label>
                  <select
                    value={entityType}
                    onChange={(e) => setEntityType(e.target.value)}
                    className="input"
                  >
                    {ENTITY_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                {/* Column Selection */}
                <div>
                  <label className="label flex items-center gap-2">
                    <TableCellsIcon className="h-4 w-4" />
                    Select Columns
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-3 border rounded-lg bg-steel-50">
                    {availableColumns.map(col => (
                      <label
                        key={col.key}
                        className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-steel-100 ${
                          selectedColumns.includes(col.key) ? 'bg-rail-50 border border-rail-200' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedColumns.includes(col.key)}
                          onChange={() => toggleColumn(col.key)}
                          className="rounded border-steel-300 text-rail-600 focus:ring-rail-500"
                        />
                        <span className="text-sm text-steel-700">{col.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Selected Columns Order */}
                {selectedColumns.length > 0 && (
                  <div>
                    <label className="label flex items-center gap-2">
                      <ArrowsUpDownIcon className="h-4 w-4" />
                      Column Order (drag to reorder)
                    </label>
                    <div className="space-y-1 p-3 border rounded-lg bg-steel-50">
                      {selectedColumns.map((key, idx) => {
                        const col = availableColumns.find(c => c.key === key);
                        return (
                          <div
                            key={key}
                            className="flex items-center justify-between p-2 bg-white rounded border border-steel-200"
                          >
                            <span className="text-sm font-medium text-steel-700">{col?.label || key}</span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => moveColumn(key, 'up')}
                                disabled={idx === 0}
                                className="p-1 text-steel-400 hover:text-steel-600 disabled:opacity-30"
                              >
                                <ChevronUpIcon className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => moveColumn(key, 'down')}
                                disabled={idx === selectedColumns.length - 1}
                                className="p-1 text-steel-400 hover:text-steel-600 disabled:opacity-30"
                              >
                                <ChevronDownIcon className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => toggleColumn(key)}
                                className="p-1 text-red-400 hover:text-red-600"
                              >
                                <XMarkIcon className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Filters */}
                <div>
                  <label className="label flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <FunnelIcon className="h-4 w-4" />
                      Filters
                    </span>
                    <button
                      onClick={addFilter}
                      className="text-rail-600 hover:text-rail-800 text-sm flex items-center gap-1"
                    >
                      <PlusIcon className="h-4 w-4" />
                      Add Filter
                    </button>
                  </label>
                  <div className="space-y-2">
                    {filters.length === 0 ? (
                      <p className="text-sm text-steel-500 p-3 bg-steel-50 rounded-lg">
                        No filters applied. Click "Add Filter" to filter your data.
                      </p>
                    ) : (
                      filters.map((filter, idx) => {
                        const column = availableColumns.find(c => c.key === filter.field);
                        const operators = FILTER_OPERATORS.filter(op =>
                          column ? op.types.includes(column.type) : true
                        );

                        return (
                          <div key={idx} className="flex items-center gap-2 p-2 bg-steel-50 rounded-lg">
                            <select
                              value={filter.field}
                              onChange={(e) => updateFilter(idx, { field: e.target.value })}
                              className="input py-1 text-sm flex-1"
                            >
                              {availableColumns.filter(c => c.filterable).map(col => (
                                <option key={col.key} value={col.key}>{col.label}</option>
                              ))}
                            </select>
                            <select
                              value={filter.operator}
                              onChange={(e) => updateFilter(idx, { operator: e.target.value as FilterCriteria['operator'] })}
                              className="input py-1 text-sm w-32"
                            >
                              {operators.map(op => (
                                <option key={op.value} value={op.value}>{op.label}</option>
                              ))}
                            </select>
                            {filter.operator !== 'isNull' && filter.operator !== 'isNotNull' && (
                              <input
                                type="text"
                                value={String(filter.value || '')}
                                onChange={(e) => updateFilter(idx, { value: e.target.value })}
                                placeholder="Value"
                                className="input py-1 text-sm flex-1"
                              />
                            )}
                            <button
                              onClick={() => removeFilter(idx)}
                              className="p-1 text-red-400 hover:text-red-600"
                            >
                              <XMarkIcon className="h-5 w-5" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Sort */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Sort By</label>
                    <select
                      value={sort?.field || ''}
                      onChange={(e) => setSort(e.target.value ? { field: e.target.value, direction: sort?.direction || 'asc' } : null)}
                      className="input"
                    >
                      <option value="">No Sorting</option>
                      {availableColumns.filter(c => c.sortable).map(col => (
                        <option key={col.key} value={col.key}>{col.label}</option>
                      ))}
                    </select>
                  </div>
                  {sort && (
                    <div>
                      <label className="label">Direction</label>
                      <select
                        value={sort.direction}
                        onChange={(e) => setSort({ ...sort, direction: e.target.value as 'asc' | 'desc' })}
                        className="input"
                      >
                        <option value="asc">Ascending</option>
                        <option value="desc">Descending</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* Output Format */}
                <div>
                  <label className="label">Export Format</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        value="csv"
                        checked={outputFormat === 'csv'}
                        onChange={() => setOutputFormat('csv')}
                        className="text-rail-600 focus:ring-rail-500"
                      />
                      <span className="text-sm">CSV (Excel-compatible)</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        value="xlsx"
                        checked={outputFormat === 'xlsx'}
                        onChange={() => setOutputFormat('xlsx')}
                        className="text-rail-600 focus:ring-rail-500"
                      />
                      <span className="text-sm">Excel (.xlsx)</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Right Panel - Templates & Preview */}
              <div className="space-y-6">
                {/* Saved Templates */}
                <div>
                  <label className="label flex items-center gap-2">
                    <BookmarkIcon className="h-4 w-4" />
                    Saved Templates
                  </label>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {templates.length === 0 ? (
                      <p className="text-sm text-steel-500 p-3 bg-steel-50 rounded-lg">
                        No saved templates yet.
                      </p>
                    ) : (
                      templates.map(t => (
                        <div
                          key={t.id}
                          onClick={() => loadTemplate(t)}
                          className="flex items-center justify-between p-2 bg-steel-50 rounded cursor-pointer hover:bg-steel-100"
                        >
                          <div>
                            <p className="text-sm font-medium text-steel-700">{t.name}</p>
                            <p className="text-xs text-steel-500">{t.entityType} - {t.columns.length} columns</p>
                          </div>
                          <button
                            onClick={(e) => deleteTemplate(t.id, e)}
                            className="p-1 text-red-400 hover:text-red-600"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Save Template */}
                {showSaveTemplate ? (
                  <div className="p-3 bg-steel-50 rounded-lg space-y-2">
                    <input
                      type="text"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder="Template name"
                      className="input py-1 text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={saveTemplate}
                        disabled={!templateName}
                        className="btn-primary py-1 px-3 text-sm flex-1"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setShowSaveTemplate(false)}
                        className="btn-secondary py-1 px-3 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowSaveTemplate(true)}
                    disabled={selectedColumns.length === 0}
                    className="btn-secondary w-full flex items-center justify-center gap-2"
                  >
                    <BookmarkIcon className="h-4 w-4" />
                    Save as Template
                  </button>
                )}

                {/* Preview */}
                {showPreview && previewData && (
                  <div>
                    <label className="label">
                      Preview (showing {previewData.length} of {previewTotal} rows)
                    </label>
                    <div className="border rounded-lg overflow-x-auto max-h-64">
                      <table className="min-w-full divide-y divide-steel-200 text-xs">
                        <thead className="bg-steel-50">
                          <tr>
                            {selectedColumns.slice(0, 4).map(key => {
                              const col = availableColumns.find(c => c.key === key);
                              return (
                                <th key={key} className="px-2 py-1 text-left font-medium text-steel-500">
                                  {col?.label || key}
                                </th>
                              );
                            })}
                            {selectedColumns.length > 4 && (
                              <th className="px-2 py-1 text-left font-medium text-steel-500">
                                +{selectedColumns.length - 4} more
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-steel-100">
                          {previewData.map((row, idx) => (
                            <tr key={idx}>
                              {selectedColumns.slice(0, 4).map(key => (
                                <td key={key} className="px-2 py-1 text-steel-700 whitespace-nowrap">
                                  {String(row[key] ?? '-')}
                                </td>
                              ))}
                              {selectedColumns.length > 4 && (
                                <td className="px-2 py-1 text-steel-400">...</td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-steel-200 flex items-center justify-between bg-steel-50">
            <div className="text-sm text-steel-500">
              {selectedColumns.length} columns selected
              {filters.length > 0 && ` | ${filters.length} filter(s)`}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={runPreview}
                disabled={selectedColumns.length === 0 || isLoading}
                className="btn-secondary flex items-center gap-2"
              >
                Preview
              </button>
              <button
                onClick={handleExport}
                disabled={selectedColumns.length === 0 || isLoading}
                className="btn-primary flex items-center gap-2"
              >
                <DocumentArrowDownIcon className="h-5 w-5" />
                {isLoading ? 'Exporting...' : `Export ${outputFormat.toUpperCase()}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
