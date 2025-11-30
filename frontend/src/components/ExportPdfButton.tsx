/**
 * ExportPdfButton.tsx - Customer-ready PDF export using @react-pdf/renderer
 *
 * Generates professional PDF documents from MasterPlan data including:
 * - Master Plan summary with statistics
 * - Monthly schedule breakdown
 * - Customer-facing qualification schedules
 * - Shop work orders
 */

import { useState } from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  PDFDownloadLink,
} from '@react-pdf/renderer';
import { DocumentArrowDownIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import type { MasterPlanWithCommitments, MasterPlanCommitment } from '../types';

// Register fonts (optional - using default Helvetica)
// Font.register({ family: 'Roboto', src: '/fonts/Roboto-Regular.ttf' });

// PDF Styles
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
  },
  header: {
    marginBottom: 20,
    borderBottom: '2 solid #1b4af5',
    paddingBottom: 15,
  },
  companyName: {
    fontSize: 10,
    color: '#666666',
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11,
    color: '#666666',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1b4af5',
    marginBottom: 8,
    paddingBottom: 4,
    borderBottom: '1 solid #e5e7eb',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 15,
  },
  statBox: {
    width: '25%',
    padding: 8,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  statLabel: {
    fontSize: 8,
    color: '#666666',
    marginTop: 2,
  },
  table: {
    marginTop: 10,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderBottom: '1 solid #d1d5db',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #e5e7eb',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  tableRowAlt: {
    flexDirection: 'row',
    borderBottom: '1 solid #e5e7eb',
    paddingVertical: 6,
    paddingHorizontal: 4,
    backgroundColor: '#f9fafb',
  },
  tableCell: {
    paddingHorizontal: 4,
  },
  tableCellHeader: {
    paddingHorizontal: 4,
    fontSize: 8,
    fontWeight: 'bold',
    color: '#374151',
    textTransform: 'uppercase',
  },
  // Column widths
  colRailcar: { width: '12%' },
  colCustomer: { width: '18%' },
  colShop: { width: '18%' },
  colMonth: { width: '12%' },
  colWorkType: { width: '18%' },
  colPriority: { width: '10%' },
  colStatus: { width: '12%' },
  // Status colors
  statusCommitted: { color: '#1d4ed8' },
  statusScheduled: { color: '#4338ca' },
  statusInTransit: { color: '#d97706' },
  statusArrived: { color: '#ea580c' },
  statusInProgress: { color: '#9333ea' },
  statusReleased: { color: '#16a34a' },
  priorityCritical: { color: '#dc2626' },
  priorityHigh: { color: '#ea580c' },
  priorityMedium: { color: '#ca8a04' },
  priorityLow: { color: '#2563eb' },
  priorityDeferred: { color: '#6b7280' },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 8,
    color: '#9ca3af',
    borderTop: '1 solid #e5e7eb',
    paddingTop: 10,
  },
  pageNumber: {
    position: 'absolute',
    bottom: 30,
    right: 40,
    fontSize: 8,
    color: '#9ca3af',
  },
  confidential: {
    backgroundColor: '#fef2f2',
    padding: 8,
    marginBottom: 15,
    borderRadius: 4,
    borderLeft: '3 solid #dc2626',
  },
  confidentialText: {
    fontSize: 9,
    color: '#dc2626',
    fontWeight: 'bold',
  },
  monthGroup: {
    marginBottom: 15,
  },
  monthTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#374151',
    backgroundColor: '#e5e7eb',
    padding: 6,
    marginBottom: 4,
  },
});

// Helper functions
const formatMonth = (monthKey: string) => {
  const [year, month] = monthKey.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const parseWorkTypes = (workTypesJson: string): string[] => {
  try {
    return JSON.parse(workTypesJson);
  } catch {
    return [workTypesJson];
  }
};

const getStatusStyle = (status: string) => {
  switch (status) {
    case 'committed': return styles.statusCommitted;
    case 'scheduled': return styles.statusScheduled;
    case 'in_transit': return styles.statusInTransit;
    case 'arrived': return styles.statusArrived;
    case 'in_progress': return styles.statusInProgress;
    case 'released': return styles.statusReleased;
    default: return {};
  }
};

const getPriorityStyle = (priority: number) => {
  switch (priority) {
    case 1: return styles.priorityCritical;
    case 2: return styles.priorityHigh;
    case 3: return styles.priorityMedium;
    case 4: return styles.priorityLow;
    case 5: return styles.priorityDeferred;
    default: return {};
  }
};

const getPriorityLabel = (priority: number) => {
  switch (priority) {
    case 1: return 'Critical';
    case 2: return 'High';
    case 3: return 'Medium';
    case 4: return 'Low';
    case 5: return 'Deferred';
    default: return `P${priority}`;
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'committed': return 'Committed';
    case 'scheduled': return 'Scheduled';
    case 'in_transit': return 'In Transit';
    case 'arrived': return 'Arrived';
    case 'in_progress': return 'In Progress';
    case 'released': return 'Released';
    default: return status;
  }
};

// =============================================================================
// PDF DOCUMENT COMPONENT - FULL MASTER PLAN
// =============================================================================

interface MasterPlanPDFProps {
  masterPlan: MasterPlanWithCommitments;
  includeConfidential?: boolean;
}

const MasterPlanPDF = ({ masterPlan, includeConfidential = true }: MasterPlanPDFProps) => {
  // Calculate stats
  const totalCommitments = masterPlan.commitments.length;
  const uniqueShops = new Set(masterPlan.commitments.map(c => c.shopId)).size;
  const uniqueCustomers = new Set(masterPlan.commitments.map(c => c.customerId)).size;
  const totalCost = masterPlan.commitments.reduce((sum, c) => sum + (c.estimatedCost || 0), 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.companyName}>AITX Chronos Scheduler</Text>
          <Text style={styles.title}>{masterPlan.planName}</Text>
          <Text style={styles.subtitle}>
            FY{masterPlan.fiscalYear} v{masterPlan.version} | Generated: {new Date().toLocaleDateString()}
          </Text>
        </View>

        {/* Confidential Notice */}
        {includeConfidential && (
          <View style={styles.confidential}>
            <Text style={styles.confidentialText}>
              CONFIDENTIAL - For Internal Use Only. Do not distribute without authorization.
            </Text>
          </View>
        )}

        {/* Summary Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Plan Summary</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{totalCommitments}</Text>
              <Text style={styles.statLabel}>Total Commitments</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{uniqueShops}</Text>
              <Text style={styles.statLabel}>Shops Involved</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{uniqueCustomers}</Text>
              <Text style={styles.statLabel}>Customers</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>${(totalCost / 1000).toFixed(0)}K</Text>
              <Text style={styles.statLabel}>Est. Total Cost</Text>
            </View>
          </View>
        </View>

        {/* Commitments Table */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Commitment Schedule</Text>
          <View style={styles.table}>
            {/* Table Header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.tableCellHeader, styles.colRailcar]}>Railcar #</Text>
              <Text style={[styles.tableCellHeader, styles.colCustomer]}>Customer</Text>
              <Text style={[styles.tableCellHeader, styles.colShop]}>Shop</Text>
              <Text style={[styles.tableCellHeader, styles.colMonth]}>Month</Text>
              <Text style={[styles.tableCellHeader, styles.colWorkType]}>Work Type</Text>
              <Text style={[styles.tableCellHeader, styles.colPriority]}>Priority</Text>
              <Text style={[styles.tableCellHeader, styles.colStatus]}>Status</Text>
            </View>

            {/* Table Rows */}
            {masterPlan.commitments.slice(0, 30).map((c, idx) => (
              <View key={c.id} style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                <Text style={[styles.tableCell, styles.colRailcar]}>{c.car.railcarNumber}</Text>
                <Text style={[styles.tableCell, styles.colCustomer]}>{c.customer.name}</Text>
                <Text style={[styles.tableCell, styles.colShop]}>{c.shop.name}</Text>
                <Text style={[styles.tableCell, styles.colMonth]}>{formatMonth(c.scheduledMonth).slice(0, 8)}</Text>
                <Text style={[styles.tableCell, styles.colWorkType]}>
                  {parseWorkTypes(c.workTypes).join(', ')}
                </Text>
                <Text style={[styles.tableCell, styles.colPriority, getPriorityStyle(c.priority)]}>
                  {getPriorityLabel(c.priority)}
                </Text>
                <Text style={[styles.tableCell, styles.colStatus, getStatusStyle(c.status)]}>
                  {getStatusLabel(c.status)}
                </Text>
              </View>
            ))}
          </View>

          {masterPlan.commitments.length > 30 && (
            <Text style={{ marginTop: 10, fontSize: 9, color: '#6b7280', textAlign: 'center' }}>
              + {masterPlan.commitments.length - 30} more commitments (see full report)
            </Text>
          )}
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          {masterPlan.planName} | AITX Chronos Scheduler
        </Text>
        <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) =>
          `Page ${pageNumber} of ${totalPages}`
        } fixed />
      </Page>

      {/* Additional pages for full commitment list if needed */}
      {masterPlan.commitments.length > 30 && (
        <Page size="A4" style={styles.page}>
          <View style={styles.header}>
            <Text style={styles.title}>{masterPlan.planName} - Full Schedule</Text>
            <Text style={styles.subtitle}>Page 2 - Complete Commitment List</Text>
          </View>

          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableCellHeader, styles.colRailcar]}>Railcar #</Text>
              <Text style={[styles.tableCellHeader, styles.colCustomer]}>Customer</Text>
              <Text style={[styles.tableCellHeader, styles.colShop]}>Shop</Text>
              <Text style={[styles.tableCellHeader, styles.colMonth]}>Month</Text>
              <Text style={[styles.tableCellHeader, styles.colWorkType]}>Work Type</Text>
              <Text style={[styles.tableCellHeader, styles.colPriority]}>Priority</Text>
              <Text style={[styles.tableCellHeader, styles.colStatus]}>Status</Text>
            </View>

            {masterPlan.commitments.slice(30, 70).map((c, idx) => (
              <View key={c.id} style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                <Text style={[styles.tableCell, styles.colRailcar]}>{c.car.railcarNumber}</Text>
                <Text style={[styles.tableCell, styles.colCustomer]}>{c.customer.name}</Text>
                <Text style={[styles.tableCell, styles.colShop]}>{c.shop.name}</Text>
                <Text style={[styles.tableCell, styles.colMonth]}>{formatMonth(c.scheduledMonth).slice(0, 8)}</Text>
                <Text style={[styles.tableCell, styles.colWorkType]}>
                  {parseWorkTypes(c.workTypes).join(', ')}
                </Text>
                <Text style={[styles.tableCell, styles.colPriority, getPriorityStyle(c.priority)]}>
                  {getPriorityLabel(c.priority)}
                </Text>
                <Text style={[styles.tableCell, styles.colStatus, getStatusStyle(c.status)]}>
                  {getStatusLabel(c.status)}
                </Text>
              </View>
            ))}
          </View>

          <Text style={styles.footer}>
            {masterPlan.planName} | AITX Chronos Scheduler
          </Text>
          <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}`
          } fixed />
        </Page>
      )}
    </Document>
  );
};

// =============================================================================
// EXPORT PDF BUTTON COMPONENT
// =============================================================================

interface ExportPdfButtonProps {
  masterPlan: MasterPlanWithCommitments;
  variant?: 'primary' | 'secondary';
}

export default function ExportPdfButton({ masterPlan, variant = 'primary' }: ExportPdfButtonProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [includeConfidential, setIncludeConfidential] = useState(true);

  const fileName = `${masterPlan.planName.replace(/\s+/g, '_')}_FY${masterPlan.fiscalYear}_v${masterPlan.version}.pdf`;

  return (
    <div className="relative">
      <div className="flex">
        <PDFDownloadLink
          document={<MasterPlanPDF masterPlan={masterPlan} includeConfidential={includeConfidential} />}
          fileName={fileName}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-l-lg font-medium transition-colors ${
            variant === 'primary'
              ? 'bg-rail-600 text-white hover:bg-rail-700'
              : 'bg-white border border-steel-300 text-steel-700 hover:bg-steel-50'
          }`}
        >
          {({ loading }) => (
            <>
              <DocumentArrowDownIcon className="h-4 w-4" />
              {loading ? 'Generating...' : 'Export PDF'}
            </>
          )}
        </PDFDownloadLink>

        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className={`px-2 py-2 rounded-r-lg border-l transition-colors ${
            variant === 'primary'
              ? 'bg-rail-600 text-white hover:bg-rail-700 border-rail-500'
              : 'bg-white border border-steel-300 text-steel-700 hover:bg-steel-50 border-l-steel-300'
          }`}
        >
          <ChevronDownIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Dropdown menu */}
      {isDropdownOpen && (
        <div className="absolute right-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-steel-200 z-20">
          <div className="p-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeConfidential}
                onChange={(e) => setIncludeConfidential(e.target.checked)}
                className="rounded border-steel-300 text-rail-600 focus:ring-rail-500"
              />
              <span className="text-sm text-steel-700">Include confidential notice</span>
            </label>
          </div>
          <div className="border-t border-steel-200 p-2">
            <button
              onClick={() => setIsDropdownOpen(false)}
              className="w-full text-left px-3 py-1.5 text-sm text-steel-600 hover:bg-steel-50 rounded"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// CUSTOMER SCHEDULE PDF COMPONENT
// =============================================================================

interface CustomerSchedulePDFProps {
  customerName: string;
  commitments: MasterPlanCommitment[];
  planName: string;
}

export const CustomerSchedulePDF = ({ customerName, commitments, planName }: CustomerSchedulePDFProps) => {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.companyName}>AITX Chronos Scheduler</Text>
          <Text style={styles.title}>Qualification Schedule - {customerName}</Text>
          <Text style={styles.subtitle}>
            {planName} | Generated: {new Date().toLocaleDateString()}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Scheduled Services</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableCellHeader, { width: '20%' }]}>Railcar #</Text>
              <Text style={[styles.tableCellHeader, { width: '25%' }]}>Shop</Text>
              <Text style={[styles.tableCellHeader, { width: '20%' }]}>Month</Text>
              <Text style={[styles.tableCellHeader, { width: '20%' }]}>Work Type</Text>
              <Text style={[styles.tableCellHeader, { width: '15%' }]}>Status</Text>
            </View>

            {commitments.map((c, idx) => (
              <View key={c.id} style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                <Text style={[styles.tableCell, { width: '20%' }]}>{c.car.railcarNumber}</Text>
                <Text style={[styles.tableCell, { width: '25%' }]}>{c.shop.name}</Text>
                <Text style={[styles.tableCell, { width: '20%' }]}>{formatMonth(c.scheduledMonth)}</Text>
                <Text style={[styles.tableCell, { width: '20%' }]}>
                  {parseWorkTypes(c.workTypes).join(', ')}
                </Text>
                <Text style={[styles.tableCell, { width: '15%' }, getStatusStyle(c.status)]}>
                  {getStatusLabel(c.status)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={styles.footer}>
          For questions, contact your AITX representative | {planName}
        </Text>
      </Page>
    </Document>
  );
};

// =============================================================================
// SHOP WORK ORDER PDF COMPONENT
// =============================================================================

interface ShopWorkOrderPDFProps {
  shopName: string;
  shopCode: string;
  month: string;
  commitments: MasterPlanCommitment[];
  planName: string;
}

export const ShopWorkOrderPDF = ({ shopName, shopCode, month, commitments, planName }: ShopWorkOrderPDFProps) => {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.companyName}>AITX Chronos Scheduler - Shop Work Order</Text>
          <Text style={styles.title}>{shopName} ({shopCode})</Text>
          <Text style={styles.subtitle}>
            {formatMonth(month)} | {commitments.length} Work Orders | Generated: {new Date().toLocaleDateString()}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Work Orders for {formatMonth(month)}</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableCellHeader, { width: '15%' }]}>Railcar #</Text>
              <Text style={[styles.tableCellHeader, { width: '20%' }]}>Customer</Text>
              <Text style={[styles.tableCellHeader, { width: '20%' }]}>Work Type</Text>
              <Text style={[styles.tableCellHeader, { width: '12%' }]}>Priority</Text>
              <Text style={[styles.tableCellHeader, { width: '15%' }]}>Arrival</Text>
              <Text style={[styles.tableCellHeader, { width: '18%' }]}>Status</Text>
            </View>

            {commitments.map((c, idx) => (
              <View key={c.id} style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                <Text style={[styles.tableCell, { width: '15%' }]}>{c.car.railcarNumber}</Text>
                <Text style={[styles.tableCell, { width: '20%' }]}>{c.customer.name}</Text>
                <Text style={[styles.tableCell, { width: '20%' }]}>
                  {parseWorkTypes(c.workTypes).join(', ')}
                </Text>
                <Text style={[styles.tableCell, { width: '12%' }, getPriorityStyle(c.priority)]}>
                  {getPriorityLabel(c.priority)}
                </Text>
                <Text style={[styles.tableCell, { width: '15%' }]}>
                  {formatDate(c.plannedArrival)}
                </Text>
                <Text style={[styles.tableCell, { width: '18%' }, getStatusStyle(c.status)]}>
                  {getStatusLabel(c.status)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={styles.footer}>
          {planName} | {shopName} Work Orders
        </Text>
      </Page>
    </Document>
  );
};
