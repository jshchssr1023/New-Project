/**
 * Scenario Export Service
 *
 * Generates PDF and CSV exports for scenarios and Car Flow Plans.
 * Supports both AITX-branded and unbranded (customer-facing) exports.
 */

import PDFDocument from 'pdfkit';
import { prisma } from './db';
import logger from '../utils/logger';

// =============================================================================
// INTERFACES
// =============================================================================

export interface ScenarioExportOptions {
  scenarioId: string;
  format: 'pdf' | 'csv';
  branding: 'aitx' | 'customer'; // AITX branded vs customer-facing
  includeCapacity?: boolean;
  includeSummary?: boolean;
}

export interface CarFlowPlanExportOptions {
  year?: number;
  month?: number;
  shopId?: string;
  customerId?: string;
  format: 'pdf' | 'csv';
  branding: 'aitx' | 'customer';
}

interface ScenarioExportData {
  scenario: {
    id: string;
    name: string;
    status: string;
    notes: string | null;
    createdAt: Date;
    confirmedAt: Date | null;
    creator: { firstName: string; lastName: string };
    customers: Array<{ customer: { name: string; code: string } }>;
  };
  cars: Array<{
    car: {
      railcarNumber: string;
      carType: string | null;
      customer: string | null;
    };
    shop: {
      name: string;
      city: string;
      state: string;
    } | null;
    plannedMonth: number;
    plannedYear: number;
    shopReason: string | null;
  }>;
}

// =============================================================================
// EXPORT SERVICE
// =============================================================================

export class ScenarioExportService {
  private readonly MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  /**
   * Export a scenario to PDF or CSV
   */
  async exportScenario(options: ScenarioExportOptions): Promise<Buffer> {
    const { scenarioId, format, branding } = options;

    // Fetch scenario data
    const scenario = await prisma.scenario.findUnique({
      where: { id: scenarioId },
      include: {
        creator: { select: { firstName: true, lastName: true } },
        customers: {
          include: {
            customer: { select: { name: true, code: true } },
          },
        },
        cars: {
          include: {
            car: { select: { railcarNumber: true, carType: true, customer: true } },
            shop: { select: { name: true, city: true, state: true } },
          },
          orderBy: [{ plannedYear: 'asc' }, { plannedMonth: 'asc' }, { car: { railcarNumber: 'asc' } }],
        },
      },
    });

    if (!scenario) {
      throw new Error('Scenario not found');
    }

    const data: ScenarioExportData = {
      scenario: {
        id: scenario.id,
        name: scenario.name,
        status: scenario.status,
        notes: scenario.notes,
        createdAt: scenario.createdAt,
        confirmedAt: scenario.confirmedAt,
        creator: scenario.creator,
        customers: scenario.customers,
      },
      cars: scenario.cars,
    };

    if (format === 'pdf') {
      return this.generateScenarioPDF(data, branding, options);
    } else {
      return this.generateScenarioCSV(data);
    }
  }

  /**
   * Export Car Flow Plans to PDF or CSV
   */
  async exportCarFlowPlans(options: CarFlowPlanExportOptions): Promise<Buffer> {
    const { year, month, shopId, customerId, format, branding } = options;

    const where: any = {
      status: { not: 'Cancelled' },
    };

    if (year) where.plannedYear = year;
    if (month) where.plannedMonth = month;
    if (shopId) where.shopId = shopId;
    if (customerId) where.customerId = customerId;

    const plans = await prisma.carFlowPlan.findMany({
      where,
      include: {
        car: { select: { railcarNumber: true, carType: true, customer: true } },
        shop: { select: { name: true, city: true, state: true } },
        customer: { select: { name: true, code: true } },
      },
      orderBy: [{ plannedYear: 'asc' }, { plannedMonth: 'asc' }, { car: { railcarNumber: 'asc' } }],
    });

    if (format === 'pdf') {
      return this.generateCarFlowPlanPDF(plans, branding, options);
    } else {
      return this.generateCarFlowPlanCSV(plans);
    }
  }

  /**
   * Generate PDF for scenario export
   */
  private async generateScenarioPDF(
    data: ScenarioExportData,
    branding: 'aitx' | 'customer',
    options: ScenarioExportOptions
  ): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'LETTER',
      layout: 'landscape',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      info: {
        Title: `Scenario: ${data.scenario.name}`,
        Author: branding === 'aitx' ? 'AITX Chronos Scheduler' : 'Planning Report',
        Creator: 'Car Flow Planning System',
        CreationDate: new Date(),
      },
    });

    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      if (branding === 'aitx') {
        doc.fontSize(24).font('Helvetica-Bold').fillColor('#1e40af')
          .text('AITX Chronos', 50, 40);
        doc.fontSize(10).font('Helvetica').fillColor('#6b7280')
          .text('Car Flow Planning System', 50, 70);
      }

      // Title
      const titleY = branding === 'aitx' ? 100 : 50;
      doc.fontSize(18).font('Helvetica-Bold').fillColor('#111827')
        .text(data.scenario.name, 50, titleY);

      // Subtitle
      doc.fontSize(10).font('Helvetica').fillColor('#6b7280')
        .text(`Status: ${data.scenario.status.toUpperCase()} | Created: ${data.scenario.createdAt.toLocaleDateString()} | By: ${data.scenario.creator.firstName} ${data.scenario.creator.lastName}`, 50, titleY + 25);

      // Customers
      if (data.scenario.customers.length > 0) {
        const customerNames = data.scenario.customers.map(c => c.customer.name).join(', ');
        doc.text(`Customers: ${customerNames}`, 50, titleY + 40);
      }

      // Summary stats
      const summaryY = titleY + 70;
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#111827')
        .text('Summary', 50, summaryY);

      const totalCars = data.cars.length;
      const assignedCars = data.cars.filter(c => c.shop).length;
      const uniqueShops = new Set(data.cars.filter(c => c.shop).map(c => c.shop!.name)).size;

      doc.fontSize(10).font('Helvetica').fillColor('#4b5563')
        .text(`Total Cars: ${totalCars}`, 50, summaryY + 18)
        .text(`Assigned to Shops: ${assignedCars}`, 150, summaryY + 18)
        .text(`Unique Shops: ${uniqueShops}`, 300, summaryY + 18);

      // Table header
      const tableY = summaryY + 55;
      const colWidths = [100, 80, 100, 150, 70, 50, 100];
      const headers = ['Railcar #', 'Car Type', 'Customer', 'Shop', 'Month', 'Year', 'Reason'];

      // Header row
      doc.rect(50, tableY - 5, 700, 22).fill('#1f2937');
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff');
      let xPos = 55;
      headers.forEach((header, i) => {
        doc.text(header, xPos, tableY, { width: colWidths[i] - 5 });
        xPos += colWidths[i];
      });

      // Data rows
      let rowY = tableY + 25;
      let rowIndex = 0;
      const pageHeight = 540;

      for (const car of data.cars) {
        if (rowY > pageHeight) {
          doc.addPage();
          rowY = 50;
          // Repeat header on new page
          doc.rect(50, rowY - 5, 700, 22).fill('#1f2937');
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff');
          xPos = 55;
          headers.forEach((header, i) => {
            doc.text(header, xPos, rowY, { width: colWidths[i] - 5 });
            xPos += colWidths[i];
          });
          rowY += 25;
        }

        // Alternate row color
        if (rowIndex % 2 === 0) {
          doc.rect(50, rowY - 3, 700, 18).fill('#f9fafb');
        }

        doc.font('Helvetica').fontSize(9).fillColor('#111827');
        xPos = 55;

        const rowData = [
          car.car.railcarNumber,
          car.car.carType || '-',
          car.car.customer || '-',
          car.shop ? `${car.shop.name}, ${car.shop.city}` : 'Unassigned',
          car.shop ? this.MONTHS[car.plannedMonth - 1] : '-',
          car.shop ? String(car.plannedYear) : '-',
          car.shopReason || '-',
        ];

        rowData.forEach((value, i) => {
          doc.text(value, xPos, rowY, { width: colWidths[i] - 5, ellipsis: true });
          xPos += colWidths[i];
        });

        rowY += 18;
        rowIndex++;
      }

      // Footer
      const footerY = 560;
      doc.fontSize(8).fillColor('#9ca3af')
        .text(`Generated: ${new Date().toLocaleString()}`, 50, footerY)
        .text(`Page 1`, 700, footerY, { align: 'right' });

      doc.end();
    });
  }

  /**
   * Generate CSV for scenario export
   */
  private generateScenarioCSV(data: ScenarioExportData): Buffer {
    const headers = ['Railcar Number', 'Car Type', 'Customer', 'Shop', 'City', 'State', 'Month', 'Year', 'Shop Reason'];

    const rows = data.cars.map(car => [
      car.car.railcarNumber,
      car.car.carType || '',
      car.car.customer || '',
      car.shop?.name || '',
      car.shop?.city || '',
      car.shop?.state || '',
      car.shop ? this.MONTHS[car.plannedMonth - 1] : '',
      car.shop ? String(car.plannedYear) : '',
      car.shopReason || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    return Buffer.from(csvContent, 'utf-8');
  }

  /**
   * Generate PDF for Car Flow Plan export
   */
  private async generateCarFlowPlanPDF(
    plans: any[],
    branding: 'aitx' | 'customer',
    options: CarFlowPlanExportOptions
  ): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'LETTER',
      layout: 'landscape',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      info: {
        Title: 'Car Flow Plan Report',
        Author: branding === 'aitx' ? 'AITX Chronos Scheduler' : 'Planning Report',
        Creator: 'Car Flow Planning System',
        CreationDate: new Date(),
      },
    });

    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      if (branding === 'aitx') {
        doc.fontSize(24).font('Helvetica-Bold').fillColor('#1e40af')
          .text('AITX Chronos', 50, 40);
        doc.fontSize(10).font('Helvetica').fillColor('#6b7280')
          .text('Car Flow Planning System', 50, 70);
      }

      // Title
      const titleY = branding === 'aitx' ? 100 : 50;
      const titleParts = ['Car Flow Plan'];
      if (options.year) titleParts.push(`${options.year}`);
      if (options.month) titleParts.push(this.MONTHS[options.month - 1]);

      doc.fontSize(18).font('Helvetica-Bold').fillColor('#111827')
        .text(titleParts.join(' - '), 50, titleY);

      // Summary
      const summaryY = titleY + 40;
      doc.fontSize(10).font('Helvetica').fillColor('#4b5563')
        .text(`Total Planned Cars: ${plans.length}`, 50, summaryY);

      // Table
      const tableY = summaryY + 35;
      const colWidths = [100, 80, 100, 150, 70, 50, 80];
      const headers = ['Railcar #', 'Car Type', 'Customer', 'Shop', 'Month', 'Year', 'Status'];

      // Header row
      doc.rect(50, tableY - 5, 700, 22).fill('#1f2937');
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff');
      let xPos = 55;
      headers.forEach((header, i) => {
        doc.text(header, xPos, tableY, { width: colWidths[i] - 5 });
        xPos += colWidths[i];
      });

      // Data rows
      let rowY = tableY + 25;
      let rowIndex = 0;

      for (const plan of plans) {
        if (rowY > 540) {
          doc.addPage();
          rowY = 50;
          // Repeat header
          doc.rect(50, rowY - 5, 700, 22).fill('#1f2937');
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff');
          xPos = 55;
          headers.forEach((header, i) => {
            doc.text(header, xPos, rowY, { width: colWidths[i] - 5 });
            xPos += colWidths[i];
          });
          rowY += 25;
        }

        if (rowIndex % 2 === 0) {
          doc.rect(50, rowY - 3, 700, 18).fill('#f9fafb');
        }

        doc.font('Helvetica').fontSize(9).fillColor('#111827');
        xPos = 55;

        const rowData = [
          plan.car.railcarNumber,
          plan.car.carType || '-',
          plan.customer?.name || plan.car.customer || '-',
          `${plan.shop.name}, ${plan.shop.city}`,
          this.MONTHS[plan.plannedMonth - 1],
          String(plan.plannedYear),
          plan.status,
        ];

        rowData.forEach((value, i) => {
          doc.text(value, xPos, rowY, { width: colWidths[i] - 5, ellipsis: true });
          xPos += colWidths[i];
        });

        rowY += 18;
        rowIndex++;
      }

      // Footer
      doc.fontSize(8).fillColor('#9ca3af')
        .text(`Generated: ${new Date().toLocaleString()}`, 50, 560);

      doc.end();
    });
  }

  /**
   * Generate CSV for Car Flow Plan export
   */
  private generateCarFlowPlanCSV(plans: any[]): Buffer {
    const headers = ['Railcar Number', 'Car Type', 'Customer', 'Shop', 'City', 'State', 'Month', 'Year', 'Status', 'Committed At'];

    const rows = plans.map(plan => [
      plan.car.railcarNumber,
      plan.car.carType || '',
      plan.customer?.name || plan.car.customer || '',
      plan.shop.name,
      plan.shop.city,
      plan.shop.state,
      this.MONTHS[plan.plannedMonth - 1],
      String(plan.plannedYear),
      plan.status,
      plan.committedAt ? new Date(plan.committedAt).toLocaleDateString() : '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    return Buffer.from(csvContent, 'utf-8');
  }
}

// Singleton instance
export const scenarioExportService = new ScenarioExportService();
