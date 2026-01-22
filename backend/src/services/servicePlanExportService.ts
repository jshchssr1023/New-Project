/**
 * Service Plan Export Service
 *
 * Generates PDF exports for Service Plans with:
 * - Option comparison summary
 * - Gantt-style timeline visualization
 * - Car inventory with lease data
 * - Shop details
 *
 * @author AITX Chronos Team
 * @version 1.0.0
 */

import PDFDocument from 'pdfkit';
import { prisma } from './db';
import { servicePlanService, OptionComparisonResult } from './servicePlanService';
import logger from '../utils/logger';

// =============================================================================
// INTERFACES
// =============================================================================

export interface ServicePlanExportOptions {
  servicePlanId: string;
  branding: 'aitx' | 'customer';
  includeCarDetails?: boolean;
  includeShopDetails?: boolean;
}

// =============================================================================
// EXPORT SERVICE
// =============================================================================

export class ServicePlanExportService {
  private readonly MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  private readonly COLORS = {
    primary: '#1e40af',
    secondary: '#6b7280',
    success: '#059669',
    warning: '#d97706',
    error: '#dc2626',
    border: '#e5e7eb',
    headerBg: '#f3f4f6',
    optionColors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
  };

  /**
   * Export a service plan to PDF with comparison view
   */
  async exportServicePlan(options: ServicePlanExportOptions): Promise<Buffer> {
    const { servicePlanId, branding } = options;

    // Fetch service plan
    const servicePlan = await servicePlanService.getServicePlan(servicePlanId);

    if (!servicePlan) {
      throw new Error('Service plan not found');
    }

    // Get comparison data
    const comparison = await servicePlanService.compareOptions(servicePlanId);

    // Get shop details if requested
    let shops: Map<string, any> = new Map();
    if (options.includeShopDetails) {
      const shopIds = new Set<string>();
      for (const opt of servicePlan.options) {
        for (const a of opt.assignments) {
          shopIds.add(a.shopId);
        }
      }

      const shopData = await prisma.shop.findMany({
        where: { id: { in: Array.from(shopIds) } },
      });
      shops = new Map(shopData.map((s) => [s.id, s]));
    }

    return this.generatePDF(servicePlan, comparison, shops, options);
  }

  /**
   * Generate the PDF document
   */
  private async generatePDF(
    servicePlan: any,
    comparison: OptionComparisonResult,
    shops: Map<string, any>,
    options: ServicePlanExportOptions
  ): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'LETTER',
      layout: 'landscape',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      bufferPages: true, // Required for switchToPage() to add footers
      info: {
        Title: `Service Plan: ${servicePlan.name}`,
        Author: options.branding === 'aitx' ? 'AITX Chronos' : 'Service Plan Proposal',
        Creator: 'Service Plan Builder',
        CreationDate: new Date(),
      },
    });

    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      let currentY = 50;

      // === PAGE 1: COVER & SUMMARY ===
      currentY = this.renderHeader(doc, servicePlan, options.branding, currentY);
      currentY = this.renderPlanSummary(doc, servicePlan, currentY);
      currentY = this.renderOptionComparison(doc, comparison, currentY);

      // === PAGE 2: TIMELINE COMPARISON ===
      doc.addPage();
      currentY = 50;
      currentY = this.renderPageHeader(doc, 'Timeline Comparison', options.branding, currentY);
      currentY = this.renderGanttChart(doc, servicePlan, comparison, currentY);

      // === PAGE 3+: CAR DETAILS ===
      if (options.includeCarDetails !== false) {
        doc.addPage();
        currentY = 50;
        currentY = this.renderPageHeader(doc, 'Car Inventory', options.branding, currentY);
        currentY = this.renderCarTable(doc, servicePlan, comparison, currentY);
      }

      // === SHOP DETAILS (if included) ===
      if (options.includeShopDetails && shops.size > 0) {
        doc.addPage();
        currentY = 50;
        currentY = this.renderPageHeader(doc, 'Shop Details', options.branding, currentY);
        currentY = this.renderShopDetails(doc, shops, currentY);
      }

      // Footer on each page
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        this.renderFooter(doc, i + 1, pageCount, options.branding);
      }

      doc.end();
    });
  }

  /**
   * Render document header (cover page)
   */
  private renderHeader(
    doc: PDFKit.PDFDocument,
    servicePlan: any,
    branding: 'aitx' | 'customer',
    y: number
  ): number {
    if (branding === 'aitx') {
      doc.fontSize(28).font('Helvetica-Bold').fillColor(this.COLORS.primary)
        .text('AITX CHRONOS', 50, y);
      doc.fontSize(12).font('Helvetica').fillColor(this.COLORS.secondary)
        .text('Service Plan Proposal', 50, y + 35);
      y += 70;
    }

    doc.fontSize(22).font('Helvetica-Bold').fillColor('#111827')
      .text(servicePlan.name, 50, y);
    y += 30;

    // Customer/Project info
    if (servicePlan.customer) {
      doc.fontSize(11).font('Helvetica').fillColor(this.COLORS.secondary)
        .text(`Customer: ${servicePlan.customer.name}`, 50, y);
      y += 15;
    }
    if (servicePlan.projectNumber) {
      doc.fontSize(11).font('Helvetica').fillColor(this.COLORS.secondary)
        .text(`Project: ${servicePlan.projectNumber}`, 50, y);
      y += 15;
    }

    // Date generated
    doc.fontSize(10).font('Helvetica').fillColor(this.COLORS.secondary)
      .text(`Generated: ${new Date().toLocaleDateString()}`, 50, y);
    y += 30;

    return y;
  }

  /**
   * Render page header for subsequent pages
   */
  private renderPageHeader(
    doc: PDFKit.PDFDocument,
    title: string,
    branding: 'aitx' | 'customer',
    y: number
  ): number {
    if (branding === 'aitx') {
      doc.fontSize(10).font('Helvetica-Bold').fillColor(this.COLORS.primary)
        .text('AITX CHRONOS', 50, y);
      y += 15;
    }

    doc.fontSize(16).font('Helvetica-Bold').fillColor('#111827')
      .text(title, 50, y);
    y += 30;

    return y;
  }

  /**
   * Render plan summary section
   */
  private renderPlanSummary(
    doc: PDFKit.PDFDocument,
    servicePlan: any,
    y: number
  ): number {
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#111827')
      .text('Plan Overview', 50, y);
    y += 20;

    // Summary box
    const boxWidth = 200;
    const boxHeight = 80;
    const startX = 50;

    // Car Flow Info
    doc.rect(startX, y, boxWidth, boxHeight).stroke(this.COLORS.border);
    doc.fontSize(10).font('Helvetica').fillColor(this.COLORS.secondary)
      .text('Car Flow', startX + 10, y + 10);
    doc.fontSize(24).font('Helvetica-Bold').fillColor('#111827')
      .text(`${servicePlan.carFlowRate}`, startX + 10, y + 28);
    doc.fontSize(10).font('Helvetica').fillColor(this.COLORS.secondary)
      .text('cars per month', startX + 10, y + 55);

    // Date Range
    doc.rect(startX + boxWidth + 20, y, boxWidth, boxHeight).stroke(this.COLORS.border);
    doc.fontSize(10).font('Helvetica').fillColor(this.COLORS.secondary)
      .text('Date Range', startX + boxWidth + 30, y + 10);
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#111827')
      .text(
        `${this.MONTHS[servicePlan.startMonth - 1]} ${servicePlan.startYear} - ${this.MONTHS[servicePlan.endMonth - 1]} ${servicePlan.endYear}`,
        startX + boxWidth + 30,
        y + 32
      );
    doc.fontSize(10).font('Helvetica').fillColor(this.COLORS.secondary)
      .text(`${servicePlan.totalCarSlots} total slots`, startX + boxWidth + 30, y + 55);

    // Cars Selected
    doc.rect(startX + (boxWidth + 20) * 2, y, boxWidth, boxHeight).stroke(this.COLORS.border);
    doc.fontSize(10).font('Helvetica').fillColor(this.COLORS.secondary)
      .text('Cars Selected', startX + (boxWidth + 20) * 2 + 10, y + 10);
    doc.fontSize(24).font('Helvetica-Bold').fillColor('#111827')
      .text(`${servicePlan.selectedCarCount}`, startX + (boxWidth + 20) * 2 + 10, y + 28);
    doc.fontSize(10).font('Helvetica').fillColor(this.COLORS.secondary)
      .text(`of ${servicePlan.totalCarSlots} slots`, startX + (boxWidth + 20) * 2 + 10, y + 55);

    y += boxHeight + 30;
    return y;
  }

  /**
   * Render option comparison table
   */
  private renderOptionComparison(
    doc: PDFKit.PDFDocument,
    comparison: OptionComparisonResult,
    y: number
  ): number {
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#111827')
      .text('Option Comparison', 50, y);
    y += 25;

    if (comparison.options.length === 0) {
      doc.fontSize(11).font('Helvetica').fillColor(this.COLORS.secondary)
        .text('No options have been configured yet.', 50, y);
      return y + 20;
    }

    // Table setup
    const tableX = 50;
    const colWidths = [150, ...comparison.options.map(() => 120)];
    const rowHeight = 25;

    // Header row
    doc.rect(tableX, y, colWidths.reduce((a, b) => a + b, 0), rowHeight)
      .fill(this.COLORS.headerBg);

    let x = tableX + 10;
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#111827')
      .text('Metric', x, y + 8);
    x += colWidths[0];

    comparison.options.forEach((opt, i) => {
      doc.fillColor(this.COLORS.optionColors[i % this.COLORS.optionColors.length])
        .text(opt.name, x, y + 8, { width: colWidths[i + 1] - 10 });
      x += colWidths[i + 1];
    });

    y += rowHeight;

    // Data rows
    const metrics = [
      { label: 'Total Cars', key: 'totalCars', format: (v: number) => v.toString() },
      { label: 'Total Cost', key: 'totalCost', format: (v: number) => `$${v.toLocaleString()}` },
      { label: 'Avg Cost/Car', key: 'avgCostPerCar', format: (v: number) => `$${v.toLocaleString()}` },
      { label: 'Shops Used', key: 'shopCount', format: (v: number) => v.toString() },
    ];

    metrics.forEach((metric, rowIndex) => {
      const rowY = y + rowIndex * rowHeight;

      if (rowIndex % 2 === 1) {
        doc.rect(tableX, rowY, colWidths.reduce((a, b) => a + b, 0), rowHeight)
          .fill('#f9fafb');
      }

      x = tableX + 10;
      doc.fontSize(10).font('Helvetica').fillColor('#111827')
        .text(metric.label, x, rowY + 8);
      x += colWidths[0];

      // Find best value for highlighting
      const values = comparison.options.map((opt) => (opt as any)[metric.key]);
      const bestValue = metric.key === 'totalCost' || metric.key === 'avgCostPerCar'
        ? Math.min(...values)
        : Math.max(...values);

      comparison.options.forEach((opt, i) => {
        const value = (opt as any)[metric.key];
        const isBest = value === bestValue;

        doc.fontSize(10)
          .font(isBest ? 'Helvetica-Bold' : 'Helvetica')
          .fillColor(isBest ? this.COLORS.success : '#111827')
          .text(metric.format(value) + (isBest ? ' ★' : ''), x, rowY + 8, { width: colWidths[i + 1] - 10 });
        x += colWidths[i + 1];
      });
    });

    y += metrics.length * rowHeight + 20;
    return y;
  }

  /**
   * Render Gantt-style timeline chart
   */
  private renderGanttChart(
    doc: PDFKit.PDFDocument,
    servicePlan: any,
    comparison: OptionComparisonResult,
    y: number
  ): number {
    // Calculate month range
    const startMonth = servicePlan.startMonth;
    const startYear = servicePlan.startYear;
    const endMonth = servicePlan.endMonth;
    const endYear = servicePlan.endYear;

    const months: { month: number; year: number; label: string }[] = [];
    let currentMonth = startMonth;
    let currentYear = startYear;

    while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
      months.push({
        month: currentMonth,
        year: currentYear,
        label: `${this.MONTHS[currentMonth - 1]} ${currentYear.toString().slice(-2)}`,
      });
      currentMonth++;
      if (currentMonth > 12) {
        currentMonth = 1;
        currentYear++;
      }
    }

    // Chart dimensions
    const chartX = 150;
    const chartWidth = 550;
    const chartHeight = comparison.options.length * 60;
    const monthWidth = chartWidth / months.length;
    const rowHeight = 60;

    // Draw month headers
    doc.fontSize(8).font('Helvetica-Bold').fillColor(this.COLORS.secondary);
    months.forEach((m, i) => {
      doc.text(m.label, chartX + i * monthWidth, y, { width: monthWidth, align: 'center' });
    });
    y += 20;

    // Draw grid
    doc.strokeColor(this.COLORS.border).lineWidth(0.5);
    for (let i = 0; i <= months.length; i++) {
      doc.moveTo(chartX + i * monthWidth, y)
        .lineTo(chartX + i * monthWidth, y + chartHeight)
        .stroke();
    }
    for (let i = 0; i <= comparison.options.length; i++) {
      doc.moveTo(chartX, y + i * rowHeight)
        .lineTo(chartX + chartWidth, y + i * rowHeight)
        .stroke();
    }

    // Draw option rows
    comparison.options.forEach((opt, optIndex) => {
      const rowY = y + optIndex * rowHeight;
      const optColor = this.COLORS.optionColors[optIndex % this.COLORS.optionColors.length];

      // Option label
      doc.fontSize(10).font('Helvetica-Bold').fillColor(optColor)
        .text(opt.name, 50, rowY + 25, { width: 95 });

      // Draw bars for each month
      opt.timeline.forEach((t) => {
        const monthIndex = months.findIndex(
          (m) => m.month === t.month && m.year === t.year
        );
        if (monthIndex === -1) return;

        const barX = chartX + monthIndex * monthWidth + 2;
        const barWidth = monthWidth - 4;
        const barHeight = 40;
        const barY = rowY + 10;

        // Draw bar
        doc.rect(barX, barY, barWidth, barHeight).fill(optColor);

        // Draw car count
        doc.fontSize(12).font('Helvetica-Bold').fillColor('white')
          .text(t.carCount.toString(), barX, barY + 12, { width: barWidth, align: 'center' });

        // Draw shop info (smaller text)
        if (t.shops.length > 0) {
          const shopText = t.shops.map((s) => s.shopName).join(', ');
          doc.fontSize(6).font('Helvetica').fillColor('white')
            .text(shopText, barX + 2, barY + 28, { width: barWidth - 4, align: 'center' });
        }
      });
    });

    y += chartHeight + 30;
    return y;
  }

  /**
   * Render car inventory table
   */
  private renderCarTable(
    doc: PDFKit.PDFDocument,
    servicePlan: any,
    comparison: OptionComparisonResult,
    y: number
  ): number {
    const tableX = 50;
    const colWidths = [80, 60, 70, 70, ...comparison.options.map(() => 100)];
    const rowHeight = 18;
    const pageHeight = 540; // Leave room for header/footer

    // Header
    doc.rect(tableX, y, colWidths.reduce((a, b) => a + b, 0), rowHeight)
      .fill(this.COLORS.headerBg);

    let x = tableX + 5;
    const headers = ['Railcar #', 'Type', 'Qual Due', 'Lease End', ...comparison.options.map((o) => o.name)];
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#111827');

    headers.forEach((h, i) => {
      doc.text(h, x, y + 5, { width: colWidths[i] - 10 });
      x += colWidths[i];
    });

    y += rowHeight;

    // Data rows
    comparison.cars.forEach((car, rowIndex) => {
      // Check for page break
      if (y > pageHeight) {
        doc.addPage();
        y = 50;
        // Re-render header
        doc.rect(tableX, y, colWidths.reduce((a, b) => a + b, 0), rowHeight)
          .fill(this.COLORS.headerBg);
        x = tableX + 5;
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#111827');
        headers.forEach((h, i) => {
          doc.text(h, x, y + 5, { width: colWidths[i] - 10 });
          x += colWidths[i];
        });
        y += rowHeight;
      }

      if (rowIndex % 2 === 1) {
        doc.rect(tableX, y, colWidths.reduce((a, b) => a + b, 0), rowHeight)
          .fill('#f9fafb');
      }

      x = tableX + 5;
      doc.fontSize(7).font('Helvetica').fillColor('#111827');

      // Car info
      doc.text(car.railcarNumber, x, y + 5, { width: colWidths[0] - 10 });
      x += colWidths[0];

      doc.text(car.carType || '-', x, y + 5, { width: colWidths[1] - 10 });
      x += colWidths[1];

      doc.text(car.qualDue ? new Date(car.qualDue).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) : '-', x, y + 5, { width: colWidths[2] - 10 });
      x += colWidths[2];

      doc.text(car.leaseEnd ? new Date(car.leaseEnd).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) : '-', x, y + 5, { width: colWidths[3] - 10 });
      x += colWidths[3];

      // Option assignments
      car.optionAssignments.forEach((oa, i) => {
        const text = oa.shopName
          ? `${oa.shopName} (${this.MONTHS[oa.plannedMonth - 1]})`
          : '-';
        doc.fillColor(oa.shopName ? this.COLORS.optionColors[i % this.COLORS.optionColors.length] : this.COLORS.secondary)
          .text(text, x, y + 5, { width: colWidths[4 + i] - 10 });
        x += colWidths[4 + i];
      });

      y += rowHeight;
    });

    return y + 20;
  }

  /**
   * Render shop details section
   */
  private renderShopDetails(
    doc: PDFKit.PDFDocument,
    shops: Map<string, any>,
    y: number
  ): number {
    const cardWidth = 220;
    const cardHeight = 100;
    const cardsPerRow = 3;
    let cardIndex = 0;

    shops.forEach((shop) => {
      const row = Math.floor(cardIndex / cardsPerRow);
      const col = cardIndex % cardsPerRow;
      const x = 50 + col * (cardWidth + 15);
      const cardY = y + row * (cardHeight + 15);

      // Card background
      doc.rect(x, cardY, cardWidth, cardHeight).stroke(this.COLORS.border);

      // Shop name
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#111827')
        .text(shop.name, x + 10, cardY + 10, { width: cardWidth - 20 });

      // Shop details
      doc.fontSize(9).font('Helvetica').fillColor(this.COLORS.secondary);
      doc.text(`Location: ${shop.city}, ${shop.state}`, x + 10, cardY + 30);
      doc.text(`Capacity: ${shop.capacity} cars/month`, x + 10, cardY + 45);
      doc.text(`Cost: $${shop.baseCostPerCar?.toLocaleString() || 'N/A'}/car`, x + 10, cardY + 60);
      doc.text(`Turn Time: ${shop.baseTurnTime || 14} days`, x + 10, cardY + 75);

      cardIndex++;
    });

    const totalRows = Math.ceil(shops.size / cardsPerRow);
    return y + totalRows * (cardHeight + 15) + 20;
  }

  /**
   * Render page footer
   */
  private renderFooter(
    doc: PDFKit.PDFDocument,
    pageNum: number,
    totalPages: number,
    branding: 'aitx' | 'customer'
  ): void {
    const footerY = 575;

    doc.fontSize(8).font('Helvetica').fillColor(this.COLORS.secondary);

    if (branding === 'aitx') {
      doc.text('CONFIDENTIAL - AITX Chronos Service Plan Proposal', 50, footerY);
    }

    doc.text(`Page ${pageNum} of ${totalPages}`, 650, footerY, { align: 'right' });
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

export const servicePlanExportService = new ServicePlanExportService();

export default ServicePlanExportService;
