import { useRef, forwardRef, useImperativeHandle } from 'react';
import type { ReportData, RecipientType } from '../types';

interface PrintPreviewProps {
  data: ReportData;
  recipientType: RecipientType;
  includeConfidentialStatement?: boolean;
}

export interface PrintPreviewRef {
  print: () => void;
}

const PrintPreview = forwardRef<PrintPreviewRef, PrintPreviewProps>(
  ({ data, recipientType, includeConfidentialStatement = true }, ref) => {
    const contentRef = useRef<HTMLDivElement>(null);

    const handlePrint = () => {
      const printContent = contentRef.current;
      if (!printContent) return;

      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>${data.planInfo.name} - Project Plan</title>
            <style>
              @media print {
                @page {
                  margin: 0.75in;
                  size: letter;
                }
              }
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.5;
                color: #1a1a1a;
                max-width: 8.5in;
                margin: 0 auto;
                padding: 20px;
              }
              .header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                padding-bottom: 20px;
                border-bottom: 2px solid #dc2626;
                margin-bottom: 30px;
              }
              .header-left {
                flex: 1;
              }
              .header-right {
                text-align: right;
              }
              .logo-container {
                display: flex;
                align-items: center;
                gap: 16px;
                margin-bottom: 10px;
              }
              .logo {
                height: 48px;
                width: auto;
              }
              .aitx-logo {
                height: 32px;
                width: auto;
              }
              .document-title {
                font-size: 24px;
                font-weight: 700;
                color: #1a1a1a;
                margin: 0 0 8px 0;
              }
              .project-name {
                font-size: 18px;
                font-weight: 600;
                color: #dc2626;
                margin: 0;
              }
              .date-range {
                font-size: 14px;
                color: #666;
                margin-top: 4px;
              }
              .confidential {
                display: inline-block;
                background-color: #fef3c7;
                color: #92400e;
                font-size: 11px;
                font-weight: 600;
                padding: 4px 12px;
                border-radius: 4px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-top: 10px;
              }
              .summary-section {
                background-color: #f8f9fa;
                padding: 20px;
                border-radius: 8px;
                margin-bottom: 30px;
              }
              .summary-title {
                font-size: 16px;
                font-weight: 600;
                margin: 0 0 15px 0;
                color: #1a1a1a;
              }
              .summary-grid {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 20px;
              }
              .summary-item {
                text-align: center;
              }
              .summary-value {
                font-size: 28px;
                font-weight: 700;
                color: #dc2626;
              }
              .summary-label {
                font-size: 12px;
                color: #666;
                text-transform: uppercase;
                letter-spacing: 0.5px;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 20px;
                font-size: 12px;
              }
              th {
                background-color: #27272a;
                color: white;
                padding: 12px 8px;
                text-align: left;
                font-weight: 600;
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
              }
              td {
                padding: 10px 8px;
                border-bottom: 1px solid #e5e5e5;
              }
              tr:nth-child(even) {
                background-color: #f9fafb;
              }
              .status-badge {
                display: inline-block;
                padding: 2px 8px;
                border-radius: 9999px;
                font-size: 10px;
                font-weight: 500;
                text-transform: uppercase;
              }
              .status-pending {
                background-color: #fef3c7;
                color: #92400e;
              }
              .status-confirmed {
                background-color: #d1fae5;
                color: #065f46;
              }
              .status-in_progress {
                background-color: #dbeafe;
                color: #1e40af;
              }
              .status-completed {
                background-color: #d1fae5;
                color: #065f46;
              }
              .footer {
                margin-top: 40px;
                padding-top: 20px;
                border-top: 1px solid #e5e5e5;
                font-size: 11px;
                color: #666;
                display: flex;
                justify-content: space-between;
              }
              .generated-date {
                text-align: right;
              }
              .cost-hidden {
                color: #9ca3af;
                font-style: italic;
              }
              @media print {
                .no-print { display: none; }
              }
            </style>
          </head>
          <body>
            ${printContent.innerHTML}
          </body>
        </html>
      `;

      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.focus();

      // Wait for content to load before printing
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 250);
    };

    useImperativeHandle(ref, () => ({
      print: handlePrint,
    }));

    const formatDate = (dateStr: string) => {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    };

    const formatCurrency = (amount: number) => {
      if (recipientType === 'external') {
        return <span className="cost-hidden">—</span>;
      }
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
      }).format(amount);
    };

    const getStatusClass = (status: string) => {
      return `status-badge status-${status.toLowerCase().replace(' ', '_')}`;
    };

    // Calculate summary statistics
    const totalAssignments = data.assignments.length;
    const uniqueShops = new Set(data.assignments.map(a => a.shopName)).size;
    const uniqueCustomers = new Set(data.assignments.map(a => a.customer).filter(Boolean)).size;
    const totalCost = data.assignments.reduce((sum, a) => sum + a.estimatedCost, 0);

    // Group assignments by month
    const assignmentsByMonth = data.assignments.reduce((acc, assignment) => {
      const month = assignment.scheduledMonth;
      if (!acc[month]) acc[month] = [];
      acc[month].push(assignment);
      return acc;
    }, {} as Record<string, typeof data.assignments>);

    return (
      <div ref={contentRef} className="print-preview">
        {/* Header */}
        <div className="header">
          <div className="header-left">
            {/* Conditional Logo Rendering */}
            {recipientType === 'internal' && (
              <div className="logo-container">
                <img
                  src="/images/chronos-logo.svg"
                  alt="Chronos"
                  className="logo"
                />
                {/* AITX Logo placeholder - can be replaced with actual logo */}
                <div style={{
                  padding: '4px 12px',
                  backgroundColor: '#dc2626',
                  color: 'white',
                  fontWeight: 700,
                  borderRadius: '4px',
                  fontSize: '14px'
                }}>
                  AITX
                </div>
              </div>
            )}
            <h1 className="document-title">Project Plan Document</h1>
            <p className="project-name">{data.planInfo.name}</p>
            <p className="date-range">
              {formatDate(data.planInfo.startDate)} — {formatDate(data.planInfo.endDate)}
            </p>
          </div>
          <div className="header-right">
            {includeConfidentialStatement && (
              <span className="confidential">Confidential — For Authorized Use Only</span>
            )}
          </div>
        </div>

        {/* Summary Section */}
        <div className="summary-section">
          <h2 className="summary-title">Executive Summary</h2>
          <div className="summary-grid">
            <div className="summary-item">
              <div className="summary-value">{totalAssignments}</div>
              <div className="summary-label">Total Assignments</div>
            </div>
            <div className="summary-item">
              <div className="summary-value">{uniqueShops}</div>
              <div className="summary-label">Shops Utilized</div>
            </div>
            <div className="summary-item">
              <div className="summary-value">{uniqueCustomers}</div>
              <div className="summary-label">Customers</div>
            </div>
            <div className="summary-item">
              {recipientType === 'internal' ? (
                <>
                  <div className="summary-value">
                    ${(totalCost / 1000).toFixed(0)}K
                  </div>
                  <div className="summary-label">Total Est. Cost</div>
                </>
              ) : (
                <>
                  <div className="summary-value" style={{ color: '#9ca3af' }}>—</div>
                  <div className="summary-label">Total Est. Cost</div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Assignments Table */}
        <div>
          <h2 className="summary-title" style={{ marginTop: '30px' }}>Assignment Schedule</h2>
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Railcar #</th>
                <th>Type</th>
                <th>Customer</th>
                <th>Shop</th>
                <th>Location</th>
                {recipientType === 'internal' && <th>Est. Cost</th>}
                <th>Duration</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(assignmentsByMonth)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([month, assignments]) =>
                  assignments.map((assignment, idx) => (
                    <tr key={`${month}-${idx}`}>
                      <td>{assignment.scheduledMonth}</td>
                      <td style={{ fontWeight: 500 }}>{assignment.railcarNumber}</td>
                      <td>{assignment.carType}</td>
                      <td>{assignment.customer || '—'}</td>
                      <td>{assignment.shopName}</td>
                      <td>{assignment.shopLocation || '—'}</td>
                      {recipientType === 'internal' && (
                        <td>{formatCurrency(assignment.estimatedCost)}</td>
                      )}
                      <td>{assignment.estimatedDuration} days</td>
                      <td>
                        <span className={getStatusClass(assignment.status)}>
                          {assignment.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="footer">
          <div>
            {recipientType === 'internal' && (
              <span>Generated by Chronos Rail Car Service Scheduler</span>
            )}
            {recipientType === 'external' && (
              <span>AITX Rail Car Service Planning</span>
            )}
          </div>
          <div className="generated-date">
            Generated on {formatDate(data.generatedAt || new Date().toISOString())}
          </div>
        </div>
      </div>
    );
  }
);

PrintPreview.displayName = 'PrintPreview';

export default PrintPreview;
