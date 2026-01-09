/**
 * PlanPDFExport Component
 *
 * Generates a shareable PDF document for a single plan/scenario.
 * Includes:
 * - Plan summary header
 * - Workflow status indicator
 * - Car list with scheduling details
 * - Shop assignments and timeline
 *
 * Can be used for:
 * - Sharing with customers
 * - Internal review meetings
 * - Audit documentation
 */

import { useState, useRef } from 'react';
import {
  DocumentArrowDownIcon,
  PrinterIcon,
  ShareIcon,
  CalendarDaysIcon,
  TruckIcon,
  BuildingStorefrontIcon,
  ClockIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';

export interface PlanPDFData {
  planName: string;
  planNumber?: string;
  version?: number;
  status: 'draft' | 'sent' | 'approved' | 'scheduled' | 'in_progress' | 'completed';
  createdAt: string;
  customer?: {
    name: string;
    code?: string;
    contactName?: string;
    contactEmail?: string;
  };
  summary: {
    totalCars: number;
    totalShops: number;
    estimatedCost?: number;
    planningHorizonStart?: string;
    planningHorizonEnd?: string;
  };
  cars: {
    id: string;
    carNumber: string;
    customer: string;
    scheduledMonth?: string;
    shopName?: string;
    workType?: string;
    estimatedCost?: number;
    status: string;
  }[];
  shops?: {
    id: string;
    name: string;
    code: string;
    carCount: number;
  }[];
  notes?: string;
}

interface PlanPDFExportProps {
  planData: PlanPDFData;
  onExport?: () => void;
}

const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  draft: { label: 'Draft', color: 'text-steel-700', bgColor: 'bg-steel-100' },
  sent: { label: 'Sent to Customer', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  approved: { label: 'Customer Approved', color: 'text-green-700', bgColor: 'bg-green-100' },
  scheduled: { label: 'Scheduled', color: 'text-indigo-700', bgColor: 'bg-indigo-100' },
  in_progress: { label: 'In Progress', color: 'text-purple-700', bgColor: 'bg-purple-100' },
  completed: { label: 'Completed', color: 'text-emerald-700', bgColor: 'bg-emerald-100' },
};

export default function PlanPDFExport({ planData, onExport }: PlanPDFExportProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    setIsGenerating(true);
    try {
      // Create a printable version and trigger browser print to PDF
      // In production, this would call a backend PDF generation service
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(generatePrintHTML(planData));
        printWindow.document.close();
        printWindow.print();
      }
      onExport?.();
    } finally {
      setIsGenerating(false);
    }
  };

  const statusInfo = statusConfig[planData.status] || statusConfig.draft;

  return (
    <div className="space-y-4">
      {/* Export Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleDownloadPDF}
          disabled={isGenerating}
          className="inline-flex items-center gap-2 px-4 py-2 bg-rail-600 text-white rounded-lg hover:bg-rail-700 disabled:opacity-50 transition-colors"
        >
          <DocumentArrowDownIcon className="h-5 w-5" />
          {isGenerating ? 'Generating...' : 'Export PDF'}
        </button>
        <button
          onClick={handlePrint}
          className="inline-flex items-center gap-2 px-4 py-2 border border-steel-300 text-steel-700 rounded-lg hover:bg-steel-50 transition-colors"
        >
          <PrinterIcon className="h-5 w-5" />
          Print
        </button>
        <button
          className="inline-flex items-center gap-2 px-4 py-2 border border-steel-300 text-steel-700 rounded-lg hover:bg-steel-50 transition-colors"
          onClick={() => {
            // Copy shareable link
            navigator.clipboard.writeText(window.location.href);
          }}
        >
          <ShareIcon className="h-5 w-5" />
          Share Link
        </button>
      </div>

      {/* Preview Card */}
      <div
        ref={printRef}
        className="bg-white rounded-lg border border-steel-200 shadow-sm print:shadow-none print:border-0"
      >
        {/* Header */}
        <div className="p-6 border-b border-steel-200 bg-gradient-to-r from-steel-50 to-white">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-steel-900">{planData.planName}</h1>
              {planData.planNumber && (
                <p className="text-sm text-steel-500 mt-1">
                  {planData.planNumber}
                  {planData.version && ` • Version ${planData.version}`}
                </p>
              )}
              <p className="text-xs text-steel-400 mt-2">
                Created: {new Date(planData.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
            <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${statusInfo.bgColor} ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
          </div>

          {/* Customer Info */}
          {planData.customer && (
            <div className="mt-4 p-3 bg-steel-50 rounded-lg">
              <p className="text-sm font-medium text-steel-700">Customer</p>
              <p className="text-lg font-semibold text-steel-900">{planData.customer.name}</p>
              {planData.customer.code && (
                <p className="text-sm text-steel-500">{planData.customer.code}</p>
              )}
              {planData.customer.contactName && (
                <p className="text-sm text-steel-500 mt-1">
                  Contact: {planData.customer.contactName}
                  {planData.customer.contactEmail && ` (${planData.customer.contactEmail})`}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Summary Stats */}
        <div className="p-6 border-b border-steel-200">
          <h2 className="text-lg font-semibold text-steel-900 mb-4">Plan Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-indigo-50 rounded-lg p-4 text-center">
              <TruckIcon className="h-6 w-6 text-indigo-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-indigo-900">{planData.summary.totalCars}</p>
              <p className="text-sm text-indigo-700">Cars</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-4 text-center">
              <BuildingStorefrontIcon className="h-6 w-6 text-purple-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-purple-900">{planData.summary.totalShops}</p>
              <p className="text-sm text-purple-700">Shops</p>
            </div>
            {planData.summary.estimatedCost !== undefined && (
              <div className="bg-green-50 rounded-lg p-4 text-center">
                <CheckCircleIcon className="h-6 w-6 text-green-600 mx-auto mb-2" />
                <p className="text-2xl font-bold text-green-900">
                  ${(planData.summary.estimatedCost / 1000).toFixed(0)}K
                </p>
                <p className="text-sm text-green-700">Est. Cost</p>
              </div>
            )}
            {planData.summary.planningHorizonStart && (
              <div className="bg-amber-50 rounded-lg p-4 text-center">
                <CalendarDaysIcon className="h-6 w-6 text-amber-600 mx-auto mb-2" />
                <p className="text-sm font-bold text-amber-900">
                  {new Date(planData.summary.planningHorizonStart).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  {planData.summary.planningHorizonEnd && planData.summary.planningHorizonEnd !== planData.summary.planningHorizonStart && (
                    <> - {new Date(planData.summary.planningHorizonEnd).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</>
                  )}
                </p>
                <p className="text-sm text-amber-700">Timeline</p>
              </div>
            )}
          </div>
        </div>

        {/* Cars List */}
        <div className="p-6 border-b border-steel-200">
          <h2 className="text-lg font-semibold text-steel-900 mb-4">Car Schedule</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-steel-200">
              <thead className="bg-steel-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                    Car #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                    Scheduled Month
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                    Shop
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                    Work Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-steel-100">
                {planData.cars.map((car) => (
                  <tr key={car.id} className="hover:bg-steel-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-medium text-steel-900">{car.carNumber}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-steel-600">
                      {car.customer}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-steel-600">
                      {car.scheduledMonth ? new Date(car.scheduledMonth + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-steel-600">
                      {car.shopName || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-steel-600">
                      {car.workType || 'Qualification'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                        car.status === 'scheduled' ? 'bg-green-100 text-green-800' :
                        car.status === 'in_progress' ? 'bg-purple-100 text-purple-800' :
                        'bg-steel-100 text-steel-800'
                      }`}>
                        {car.status.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Shops Summary */}
        {planData.shops && planData.shops.length > 0 && (
          <div className="p-6 border-b border-steel-200">
            <h2 className="text-lg font-semibold text-steel-900 mb-4">Shop Allocations</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {planData.shops.map((shop) => (
                <div key={shop.id} className="bg-steel-50 rounded-lg p-3">
                  <p className="font-medium text-steel-900">{shop.name}</p>
                  <p className="text-xs text-steel-500">{shop.code}</p>
                  <p className="text-lg font-bold text-rail-600 mt-1">{shop.carCount} cars</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {planData.notes && (
          <div className="p-6 border-b border-steel-200">
            <h2 className="text-lg font-semibold text-steel-900 mb-2">Notes</h2>
            <p className="text-sm text-steel-600 whitespace-pre-wrap">{planData.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="p-6 bg-steel-50 text-center">
          <p className="text-xs text-steel-400">
            Generated on {new Date().toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
          <p className="text-xs text-steel-400 mt-1">
            Chronos Rail Car Service Scheduler
          </p>
        </div>
      </div>
    </div>
  );
}

// Generate printable HTML for PDF
function generatePrintHTML(planData: PlanPDFData): string {
  const statusInfo = statusConfig[planData.status] || statusConfig.draft;

  const carsHTML = planData.cars.map(car => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 500;">${car.carNumber}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${car.customer}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${car.scheduledMonth ? new Date(car.scheduledMonth + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '-'}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${car.shopName || '-'}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${car.workType || 'Qualification'}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${car.status.replace('_', ' ')}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${planData.planName} - Service Plan</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; color: #1f2937; }
        .header { border-bottom: 2px solid #e5e7eb; padding-bottom: 20px; margin-bottom: 20px; }
        .title { font-size: 24px; font-weight: bold; margin: 0; }
        .subtitle { font-size: 14px; color: #6b7280; margin-top: 8px; }
        .status { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 500; background: #f3f4f6; }
        .summary { display: flex; gap: 16px; margin: 20px 0; }
        .summary-item { flex: 1; background: #f9fafb; padding: 16px; border-radius: 8px; text-align: center; }
        .summary-value { font-size: 24px; font-weight: bold; color: #4f46e5; }
        .summary-label { font-size: 12px; color: #6b7280; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th { background: #f9fafb; text-align: left; padding: 12px 8px; font-size: 11px; text-transform: uppercase; color: #6b7280; border-bottom: 2px solid #e5e7eb; }
        .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #9ca3af; }
        @media print { body { margin: 20px; } }
      </style>
    </head>
    <body>
      <div class="header">
        <h1 class="title">${planData.planName}</h1>
        <p class="subtitle">
          ${planData.planNumber || ''} ${planData.version ? '• Version ' + planData.version : ''}
          <span class="status">${statusInfo.label}</span>
        </p>
        ${planData.customer ? `<p class="subtitle">Customer: <strong>${planData.customer.name}</strong></p>` : ''}
      </div>

      <div class="summary">
        <div class="summary-item">
          <div class="summary-value">${planData.summary.totalCars}</div>
          <div class="summary-label">Cars</div>
        </div>
        <div class="summary-item">
          <div class="summary-value">${planData.summary.totalShops}</div>
          <div class="summary-label">Shops</div>
        </div>
        ${planData.summary.estimatedCost !== undefined ? `
        <div class="summary-item">
          <div class="summary-value">$${(planData.summary.estimatedCost / 1000).toFixed(0)}K</div>
          <div class="summary-label">Est. Cost</div>
        </div>
        ` : ''}
        ${planData.summary.planningHorizonStart ? `
        <div class="summary-item">
          <div class="summary-value" style="font-size: 14px;">
            ${new Date(planData.summary.planningHorizonStart).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            ${planData.summary.planningHorizonEnd && planData.summary.planningHorizonEnd !== planData.summary.planningHorizonStart ?
              ' - ' + new Date(planData.summary.planningHorizonEnd).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : ''
            }
          </div>
          <div class="summary-label">Timeline</div>
        </div>
        ` : ''}
      </div>

      <h2 style="font-size: 18px; margin-top: 30px;">Car Schedule</h2>
      <table>
        <thead>
          <tr>
            <th>Car #</th>
            <th>Customer</th>
            <th>Scheduled Month</th>
            <th>Shop</th>
            <th>Work Type</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${carsHTML}
        </tbody>
      </table>

      ${planData.notes ? `
      <h2 style="font-size: 18px; margin-top: 30px;">Notes</h2>
      <p style="background: #f9fafb; padding: 16px; border-radius: 8px;">${planData.notes}</p>
      ` : ''}

      <div class="footer">
        <p>Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        <p>Chronos Rail Car Service Scheduler</p>
      </div>
    </body>
    </html>
  `;
}

// Export button component for easy integration
export function ExportPlanButton({
  planData,
  variant = 'primary',
}: {
  planData: PlanPDFData;
  variant?: 'primary' | 'secondary' | 'icon';
}) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleExport = async () => {
    setIsGenerating(true);
    try {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(generatePrintHTML(planData));
        printWindow.document.close();
        printWindow.print();
      }
    } finally {
      setIsGenerating(false);
    }
  };

  if (variant === 'icon') {
    return (
      <button
        onClick={handleExport}
        disabled={isGenerating}
        className="p-2 text-steel-500 hover:text-rail-600 hover:bg-steel-100 rounded-lg transition-colors disabled:opacity-50"
        title="Export to PDF"
      >
        <DocumentArrowDownIcon className="h-5 w-5" />
      </button>
    );
  }

  if (variant === 'secondary') {
    return (
      <button
        onClick={handleExport}
        disabled={isGenerating}
        className="inline-flex items-center gap-2 px-3 py-2 border border-steel-300 text-steel-700 rounded-lg hover:bg-steel-50 transition-colors disabled:opacity-50 text-sm"
      >
        <DocumentArrowDownIcon className="h-4 w-4" />
        {isGenerating ? 'Generating...' : 'Export PDF'}
      </button>
    );
  }

  return (
    <button
      onClick={handleExport}
      disabled={isGenerating}
      className="inline-flex items-center gap-2 px-4 py-2 bg-rail-600 text-white rounded-lg hover:bg-rail-700 disabled:opacity-50 transition-colors"
    >
      <DocumentArrowDownIcon className="h-5 w-5" />
      {isGenerating ? 'Generating...' : 'Export PDF'}
    </button>
  );
}
