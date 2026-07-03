/**
 * Tests for Qual Planner Master CSV export (reversible bridge for the legacy
 * spreadsheet) and the exportCars column/orderBy fix.
 *
 * See docs/PLANNINGGRID_CSV_PARITY_AUDIT.md (finding F5).
 */

// Mock the SQLite wrapper so we can drive findMany results directly.
jest.mock('../../services/db', () => ({
  prisma: {
    car: { findMany: jest.fn() },
    shop: { findMany: jest.fn() },
    carFlowPlan: { findMany: jest.fn() },
  },
}));

import { prisma } from '../../services/db';
import {
  exportQualPlannerMaster,
  exportCars,
} from '../../services/importExportService';
import { ALL_CANONICAL_HEADERS } from '../../services/qualPlannerSchema';
import { SHOP_CODE_TO_CSV_COLUMN } from '../../constants/shopNetworks';

const carFindMany = prisma.car.findMany as jest.Mock;
const shopFindMany = prisma.shop.findMany as jest.Mock;
const planFindMany = prisma.carFlowPlan.findMany as jest.Mock;

/** Split a single CSV line into fields, honoring quoted commas. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cur += ch; }
    } else if (ch === '"') { inQuotes = true; }
    else if (ch === ',') { out.push(cur); cur = ''; }
    else { cur += ch; }
  }
  out.push(cur);
  return out;
}

describe('exportQualPlannerMaster', () => {
  beforeEach(() => {
    carFindMany.mockReset();
    shopFindMany.mockReset();
    planFindMany.mockReset();
    shopFindMany.mockResolvedValue([]);
    planFindMany.mockResolvedValue([]);
  });

  it('emits every canonical header verbatim, with source quirks preserved', async () => {
    carFindMany.mockResolvedValue([]);
    const csv = await exportQualPlannerMaster('co1');
    const headerFields = parseCsvLine(csv.split('\n')[0]);

    // Same number of columns as the canonical schema, in the same order.
    expect(headerFields).toEqual([...ALL_CANONICAL_HEADERS]);

    // Spot-check the quirks the downstream consumer parses by.
    expect(headerFields).toContain('Commericial');        // misspelling preserved
    expect(headerFields).toContain('Rule 88B ');          // trailing space preserved
    expect(headerFields).toContain('Service Equipment ');
    expect(headerFields).toContain('2026 Region');
    // A comma-bearing shop name survives round-trip through quoting.
    expect(headerFields).toContain('Rescar (Savanna, IL)');
  });

  it('maps Car attributes into the correct columns', async () => {
    carFindMany.mockResolvedValue([
      {
        id: 'car1',
        railcarNumber: 'SHQX006002',
        customer: 'SHELL OIL',
        carMark: 'SHQX',
        carNumber: '006002',
        commodity: 'Crude Oil',
        isJacketed: true,
        isLined: false,
        portfolio: true,
        performTankQual: true,
        rule88B: '2026',
        status: 'To Be Routed',
        reasonsShopped: 'Tank Qual',
      },
    ]);

    const csv = await exportQualPlannerMaster('co1');
    const lines = csv.split('\n');
    const headers = parseCsvLine(lines[0]);
    const row = parseCsvLine(lines[1]);
    const cell = (h: string) => row[headers.indexOf(h)];

    expect(cell('Lessee Name')).toBe('SHELL OIL');
    expect(cell('Car Mark')).toBe('SHQX006002'); // full reporting mark (unique key)
    expect(cell('Mark')).toBe('SHQX');
    expect(cell('Number')).toBe('006002');
    expect(cell('Primary Commodity')).toBe('Crude Oil');
    expect(cell('Jacketed')).toBe('Yes');
    expect(cell('Lined')).toBe('No');
    expect(cell('Portfolio')).toBe('On Lease');
    expect(cell('Perform Tank Qual')).toBe('Yes');
    expect(cell('Rule 88B ')).toBe('2026'); // qual-timing stored as text, emitted as-is
    expect(cell('Current Status')).toBe('To Be Routed');
    expect(cell('Reason Shopped')).toBe('Tank Qual');
  });

  it('fills shop-date columns from committed assignments and skips cancelled ones', async () => {
    const shopHeader = SHOP_CODE_TO_CSV_COLUMN['AITX-SARNIA'];
    expect(shopHeader).toBeTruthy(); // guard: mapping exists

    carFindMany.mockResolvedValue([
      { id: 'carA', railcarNumber: 'AAAA1', customer: 'C' },
      { id: 'carB', railcarNumber: 'BBBB2', customer: 'C' },
    ]);
    shopFindMany.mockResolvedValue([{ id: 'shopSarnia', code: 'AITX-SARNIA' }]);
    planFindMany.mockResolvedValue([
      { carId: 'carA', shopId: 'shopSarnia', plannedMonth: 3, plannedYear: 2026, status: 'Planned' },
      { carId: 'carB', shopId: 'shopSarnia', plannedMonth: 5, plannedYear: 2026, status: 'Cancelled' },
    ]);

    const csv = await exportQualPlannerMaster('co1');
    const lines = csv.split('\n');
    const headers = parseCsvLine(lines[0]);
    const idx = headers.indexOf(shopHeader);
    const rowA = parseCsvLine(lines[1]);
    const rowB = parseCsvLine(lines[2]);

    expect(rowA[idx]).toBe('03/01/2026'); // committed assignment -> date
    expect(rowB[idx]).toBe('');            // cancelled assignment -> blank
  });
});

describe('exportCars (regression: F5 broken orderBy/columns)', () => {
  it('orders by railcarNumber and uses real column names', async () => {
    const findMany = prisma.car.findMany as jest.Mock;
    findMany.mockReset();
    findMany.mockResolvedValue([
      { railcarNumber: 'SHQX1', reasonsShopped: 'Repair', isTankCar: true },
    ]);

    const csv = await exportCars('co1');

    // orderBy must reference a column that exists on the Car table.
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { railcarNumber: 'asc' } })
    );

    const [header, dataRow] = csv.split('\n');
    expect(header.split(',')).toContain('railcarNumber');
    expect(header.split(',')).toContain('reasonsShopped');
    expect(header.split(',')).not.toContain('vehicleNumber');
    // The value lands under the corrected reasonsShopped column.
    const cols = header.split(',');
    expect(dataRow.split(',')[cols.indexOf('reasonsShopped')]).toBe('Repair');
  });
});
