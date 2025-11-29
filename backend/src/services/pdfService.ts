/**
 * PDF Generation Service
 *
 * Generates PDF documents from markdown content and tabular data
 * using PDFKit. Supports report exports, team plans, and customer schedules.
 *
 * @author AITX Chronos Team
 */

import PDFDocument from 'pdfkit';
import { Readable } from 'stream';

// =============================================================================
// INTERFACES
// =============================================================================

export interface PDFStyle {
  fontSize?: number;
  font?: 'Helvetica' | 'Helvetica-Bold' | 'Helvetica-Oblique' | 'Courier';
  color?: string;
  align?: 'left' | 'center' | 'right' | 'justify';
}

export interface PDFTableColumn {
  header: string;
  key: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
}

export interface PDFTableOptions {
  columns: PDFTableColumn[];
  data: Record<string, unknown>[];
  headerStyle?: PDFStyle;
  rowStyle?: PDFStyle;
  alternateRowColor?: string;
  borderColor?: string;
}

export interface PDFDocumentOptions {
  title: string;
  subtitle?: string;
  author?: string;
  createdAt?: Date;
  headerLogo?: boolean;
  footer?: boolean;
  watermark?: string;
}

export interface MarkdownSection {
  type: 'heading' | 'paragraph' | 'table' | 'list' | 'hr';
  level?: number; // For headings: 1-6
  content?: string;
  items?: string[]; // For lists
  tableData?: {
    headers: string[];
    rows: string[][];
  };
}

// =============================================================================
// PDF GENERATION CLASS
// =============================================================================

export class PDFService {
  private defaultOptions: PDFDocumentOptions = {
    title: 'AITX Chronos Report',
    author: 'AITX Chronos Scheduler',
    headerLogo: true,
    footer: true,
  };

  /**
   * Generate PDF from markdown content
   */
  async generateFromMarkdown(
    markdown: string,
    options: Partial<PDFDocumentOptions> = {}
  ): Promise<Buffer> {
    const sections = this.parseMarkdown(markdown);
    return this.generateFromSections(sections, options);
  }

  /**
   * Generate PDF from structured sections
   */
  async generateFromSections(
    sections: MarkdownSection[],
    options: Partial<PDFDocumentOptions> = {}
  ): Promise<Buffer> {
    const opts = { ...this.defaultOptions, ...options };
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
      info: {
        Title: opts.title,
        Author: opts.author,
        Creator: 'AITX Chronos Scheduler',
        CreationDate: opts.createdAt || new Date(),
      },
    });

    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Add header
      this.addHeader(doc, opts);

      // Add content
      for (const section of sections) {
        this.addSection(doc, section);
      }

      // Add footer to all pages
      if (opts.footer) {
        this.addFooter(doc, opts);
      }

      doc.end();
    });
  }

  /**
   * Generate PDF from tabular report data
   */
  async generateTableReport(
    tableOptions: PDFTableOptions,
    documentOptions: Partial<PDFDocumentOptions> = {}
  ): Promise<Buffer> {
    const opts = { ...this.defaultOptions, ...documentOptions };
    const doc = new PDFDocument({
      size: 'LETTER',
      layout: tableOptions.columns.length > 5 ? 'landscape' : 'portrait',
      margins: { top: 72, bottom: 72, left: 50, right: 50 },
      info: {
        Title: opts.title,
        Author: opts.author,
        Creator: 'AITX Chronos Scheduler',
        CreationDate: opts.createdAt || new Date(),
      },
    });

    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Add header
      this.addHeader(doc, opts);
      doc.moveDown(2);

      // Add table
      this.addTable(doc, tableOptions);

      // Add footer
      if (opts.footer) {
        this.addFooter(doc, opts);
      }

      doc.end();
    });
  }

  /**
   * Generate PDF from CSV-like data (for scheduled reports)
   */
  async generateFromReportData(
    headers: string[],
    rows: unknown[][],
    documentOptions: Partial<PDFDocumentOptions> = {}
  ): Promise<Buffer> {
    const columns: PDFTableColumn[] = headers.map((header, idx) => ({
      header,
      key: `col_${idx}`,
      align: 'left' as const,
    }));

    const data = rows.map((row) => {
      const obj: Record<string, unknown> = {};
      row.forEach((cell, idx) => {
        obj[`col_${idx}`] = cell;
      });
      return obj;
    });

    return this.generateTableReport(
      { columns, data },
      documentOptions
    );
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  /**
   * Parse markdown into sections
   */
  private parseMarkdown(markdown: string): MarkdownSection[] {
    const sections: MarkdownSection[] = [];
    const lines = markdown.split('\n');
    let currentTable: { headers: string[]; rows: string[][] } | null = null;
    let currentList: string[] = [];
    let isInTable = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Headings
      if (trimmedLine.startsWith('#')) {
        // Flush any pending list
        if (currentList.length > 0) {
          sections.push({ type: 'list', items: currentList });
          currentList = [];
        }

        const match = trimmedLine.match(/^(#{1,6})\s+(.+)$/);
        if (match) {
          sections.push({
            type: 'heading',
            level: match[1].length,
            content: match[2],
          });
          continue;
        }
      }

      // Horizontal rule
      if (trimmedLine === '---' || trimmedLine === '***' || trimmedLine === '___') {
        sections.push({ type: 'hr' });
        continue;
      }

      // Table detection
      if (trimmedLine.startsWith('|') && trimmedLine.endsWith('|')) {
        if (!isInTable) {
          isInTable = true;
          // Parse header row
          const headerCells = trimmedLine.split('|')
            .slice(1, -1)
            .map((cell) => cell.trim());
          currentTable = { headers: headerCells, rows: [] };
        } else if (trimmedLine.includes('---')) {
          // Skip separator row
          continue;
        } else if (currentTable) {
          // Data row
          const cells = trimmedLine.split('|')
            .slice(1, -1)
            .map((cell) => cell.trim());
          currentTable.rows.push(cells);
        }
        continue;
      } else if (isInTable && currentTable) {
        // End of table
        sections.push({ type: 'table', tableData: currentTable });
        currentTable = null;
        isInTable = false;
      }

      // List items
      if (trimmedLine.match(/^[-*+]\s+/) || trimmedLine.match(/^\d+\.\s+/)) {
        const content = trimmedLine.replace(/^[-*+]\s+/, '').replace(/^\d+\.\s+/, '');
        currentList.push(content);
        continue;
      } else if (currentList.length > 0) {
        // End of list
        sections.push({ type: 'list', items: currentList });
        currentList = [];
      }

      // Bold text and regular paragraphs
      if (trimmedLine && !trimmedLine.startsWith('|')) {
        sections.push({
          type: 'paragraph',
          content: trimmedLine,
        });
      }
    }

    // Flush remaining content
    if (currentTable) {
      sections.push({ type: 'table', tableData: currentTable });
    }
    if (currentList.length > 0) {
      sections.push({ type: 'list', items: currentList });
    }

    return sections;
  }

  /**
   * Add document header
   */
  private addHeader(doc: PDFKit.PDFDocument, options: PDFDocumentOptions): void {
    // Company branding
    doc.fontSize(24)
       .font('Helvetica-Bold')
       .fillColor('#1e3a5f')
       .text('AITX CHRONOS', { align: 'left' });

    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#666666')
       .text('Railcar Fleet Management System', { align: 'left' });

    doc.moveDown(0.5);

    // Horizontal line
    doc.strokeColor('#1e3a5f')
       .lineWidth(2)
       .moveTo(72, doc.y)
       .lineTo(doc.page.width - 72, doc.y)
       .stroke();

    doc.moveDown(1);

    // Document title
    doc.fontSize(18)
       .font('Helvetica-Bold')
       .fillColor('#333333')
       .text(options.title, { align: 'center' });

    if (options.subtitle) {
      doc.fontSize(12)
         .font('Helvetica')
         .fillColor('#666666')
         .text(options.subtitle, { align: 'center' });
    }

    // Generation date
    const dateStr = (options.createdAt || new Date()).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    doc.fontSize(10)
       .fillColor('#888888')
       .text(`Generated: ${dateStr}`, { align: 'center' });

    doc.moveDown(2);
  }

  /**
   * Add section content
   */
  private addSection(doc: PDFKit.PDFDocument, section: MarkdownSection): void {
    switch (section.type) {
      case 'heading':
        this.addHeading(doc, section.content || '', section.level || 1);
        break;

      case 'paragraph':
        this.addParagraph(doc, section.content || '');
        break;

      case 'table':
        if (section.tableData) {
          this.addMarkdownTable(doc, section.tableData);
        }
        break;

      case 'list':
        if (section.items) {
          this.addList(doc, section.items);
        }
        break;

      case 'hr':
        this.addHorizontalRule(doc);
        break;
    }
  }

  /**
   * Add heading
   */
  private addHeading(doc: PDFKit.PDFDocument, text: string, level: number): void {
    const sizes: Record<number, number> = {
      1: 18,
      2: 16,
      3: 14,
      4: 12,
      5: 11,
      6: 10,
    };

    // Check if we need a new page
    if (doc.y > doc.page.height - 150) {
      doc.addPage();
    }

    doc.fontSize(sizes[level] || 12)
       .font('Helvetica-Bold')
       .fillColor(level <= 2 ? '#1e3a5f' : '#333333')
       .text(text);

    doc.moveDown(0.5);
  }

  /**
   * Add paragraph
   */
  private addParagraph(doc: PDFKit.PDFDocument, text: string): void {
    // Handle bold text marked with **
    const parts = text.split(/(\*\*[^*]+\*\*)/);

    doc.fontSize(10)
       .fillColor('#333333');

    let x = doc.x;
    const startY = doc.y;

    for (const part of parts) {
      if (part.startsWith('**') && part.endsWith('**')) {
        const boldText = part.slice(2, -2);
        doc.font('Helvetica-Bold').text(boldText, { continued: true });
      } else {
        doc.font('Helvetica').text(part, { continued: true });
      }
    }

    doc.text(''); // End the line
    doc.moveDown(0.3);
  }

  /**
   * Add list
   */
  private addList(doc: PDFKit.PDFDocument, items: string[]): void {
    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#333333');

    for (const item of items) {
      // Handle emoji indicators
      const cleanItem = item.replace(/^[🔴🟡🟢⚠️📉]/, (emoji) => {
        if (emoji === '🔴') return '[HIGH] ';
        if (emoji === '🟡') return '[MED] ';
        if (emoji === '🟢') return '[OK] ';
        if (emoji === '⚠️') return '[WARN] ';
        if (emoji === '📉') return '[LOW] ';
        return '';
      });

      doc.text(`• ${cleanItem}`, {
        indent: 20,
        lineGap: 2,
      });
    }

    doc.moveDown(0.5);
  }

  /**
   * Add horizontal rule
   */
  private addHorizontalRule(doc: PDFKit.PDFDocument): void {
    doc.moveDown(0.5);
    doc.strokeColor('#cccccc')
       .lineWidth(1)
       .moveTo(72, doc.y)
       .lineTo(doc.page.width - 72, doc.y)
       .stroke();
    doc.moveDown(0.5);
  }

  /**
   * Add table from markdown table data
   */
  private addMarkdownTable(
    doc: PDFKit.PDFDocument,
    tableData: { headers: string[]; rows: string[][] }
  ): void {
    const { headers, rows } = tableData;
    const pageWidth = doc.page.width - 144; // margins
    const colWidth = pageWidth / headers.length;
    const startX = 72;
    let y = doc.y;

    // Check if we need a new page
    if (y > doc.page.height - 200) {
      doc.addPage();
      y = 72;
    }

    // Header row
    doc.fontSize(9)
       .font('Helvetica-Bold')
       .fillColor('#1e3a5f');

    headers.forEach((header, i) => {
      doc.text(header, startX + i * colWidth, y, {
        width: colWidth - 10,
        align: 'left',
      });
    });

    y += 18;

    // Header underline
    doc.strokeColor('#1e3a5f')
       .lineWidth(1)
       .moveTo(startX, y)
       .lineTo(startX + pageWidth, y)
       .stroke();

    y += 5;

    // Data rows
    doc.font('Helvetica')
       .fillColor('#333333')
       .fontSize(8);

    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx];

      // Check for page break
      if (y > doc.page.height - 72) {
        doc.addPage();
        y = 72;

        // Re-add header on new page
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#1e3a5f');

        headers.forEach((header, i) => {
          doc.text(header, startX + i * colWidth, y, {
            width: colWidth - 10,
            align: 'left',
          });
        });

        y += 18;
        doc.strokeColor('#1e3a5f')
           .lineWidth(1)
           .moveTo(startX, y)
           .lineTo(startX + pageWidth, y)
           .stroke();
        y += 5;

        doc.font('Helvetica')
           .fillColor('#333333')
           .fontSize(8);
      }

      // Alternate row background
      if (rowIdx % 2 === 1) {
        doc.rect(startX, y - 2, pageWidth, 14)
           .fill('#f5f5f5');
        doc.fillColor('#333333');
      }

      row.forEach((cell, i) => {
        doc.text(cell || '-', startX + i * colWidth, y, {
          width: colWidth - 10,
          align: 'left',
        });
      });

      y += 14;
    }

    doc.y = y + 10;
  }

  /**
   * Add styled table
   */
  private addTable(doc: PDFKit.PDFDocument, options: PDFTableOptions): void {
    const { columns, data, alternateRowColor = '#f5f5f5' } = options;
    const pageWidth = doc.page.width - 100;
    const startX = 50;
    let y = doc.y;

    // Calculate column widths
    const totalWeight = columns.reduce((sum, col) => sum + (col.width || 1), 0);
    const colWidths = columns.map((col) =>
      ((col.width || 1) / totalWeight) * pageWidth
    );

    // Header row
    doc.fontSize(9)
       .font('Helvetica-Bold')
       .fillColor('#ffffff');

    // Header background
    doc.rect(startX, y - 5, pageWidth, 20)
       .fill('#1e3a5f');
    doc.fillColor('#ffffff');

    let x = startX;
    columns.forEach((col, i) => {
      doc.text(col.header, x + 5, y, {
        width: colWidths[i] - 10,
        align: col.align || 'left',
      });
      x += colWidths[i];
    });

    y += 20;

    // Data rows
    doc.font('Helvetica')
       .fontSize(8);

    for (let rowIdx = 0; rowIdx < data.length; rowIdx++) {
      const row = data[rowIdx];

      // Page break check
      if (y > doc.page.height - 72) {
        doc.addPage();
        y = 72;

        // Re-add header
        doc.fontSize(9)
           .font('Helvetica-Bold');
        doc.rect(startX, y - 5, pageWidth, 20).fill('#1e3a5f');
        doc.fillColor('#ffffff');

        x = startX;
        columns.forEach((col, i) => {
          doc.text(col.header, x + 5, y, {
            width: colWidths[i] - 10,
            align: col.align || 'left',
          });
          x += colWidths[i];
        });

        y += 20;
        doc.font('Helvetica').fontSize(8);
      }

      // Alternate row background
      if (rowIdx % 2 === 1) {
        doc.rect(startX, y - 3, pageWidth, 16)
           .fill(alternateRowColor);
      }

      doc.fillColor('#333333');
      x = startX;
      columns.forEach((col, i) => {
        const value = String(row[col.key] ?? '-');
        doc.text(value, x + 5, y, {
          width: colWidths[i] - 10,
          align: col.align || 'left',
        });
        x += colWidths[i];
      });

      y += 16;
    }

    doc.y = y + 10;
  }

  /**
   * Add footer to all pages
   */
  private addFooter(doc: PDFKit.PDFDocument, options: PDFDocumentOptions): void {
    const pages = doc.bufferedPageRange();

    for (let i = pages.start; i < pages.start + pages.count; i++) {
      doc.switchToPage(i);

      // Page number
      doc.fontSize(8)
         .fillColor('#888888')
         .text(
           `Page ${i + 1} of ${pages.count}`,
           72,
           doc.page.height - 50,
           { align: 'center', width: doc.page.width - 144 }
         );

      // Confidentiality notice
      doc.fontSize(7)
         .text(
           'Confidential - AITX Internal Use Only',
           72,
           doc.page.height - 40,
           { align: 'center', width: doc.page.width - 144 }
         );
    }
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const pdfService = new PDFService();
export default pdfService;
