/**
 * Shop Import Script
 *
 * Imports shops from "cleaned shop locations.csv" into the database.
 * This is the single source of truth for shop data.
 *
 * Usage: npx ts-node prisma/importShops.ts
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface CsvShopRow {
  Action: string;
  Id: string;
  ShopName: string;
  ShopNameDisplay: string;
  ShopStatus: string;
  ShopType: string;
  SPLC: string;
  SCAC: string;
  Address1: string;
  Address2: string;
  City: string;
  State: string;
  Zip: string;
  IsAITXShop: string;
  CertifcationClass: string;
  CertificationDate: string;
  CertificateExpiration: string;
  Comment: string;
  CurrencyCode: string;
  DeliveryLines: string;
  DisplayOnCustomerMap: string;
  DisplayOnWebPortal: string;
  Email: string;
  EnvironmentalReview: string;
  Fax: string;
  LaborRate: string;
  Latitude: string;
  Longitude: string;
  LogoURL: string;
  Phone: string;
  SAP: string;
  Website: string;
  EnterDate: string;
  EnterUserId: string;
  LastEditDate: string;
  LastEditUserId: string;
  'Last Verified': string;
}

/**
 * Parse the CSV file with quirky quoting (entire lines wrapped in quotes)
 */
function parseCsv(filePath: string): CsvShopRow[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');

  // Strip outer quotes from each line
  const cleanedLines = lines.map(line => {
    line = line.trim();
    // Remove BOM if present
    if (line.charCodeAt(0) === 0xFEFF) {
      line = line.substring(1);
    }
    // Remove outer quotes
    if (line.startsWith('"') && line.endsWith('"')) {
      line = line.slice(1, -1);
    } else if (line.startsWith('"')) {
      line = line.slice(1);
    }
    return line;
  });

  // Parse header
  const headerLine = cleanedLines[0];
  const headers = parseCSVLine(headerLine);

  // Parse data rows
  const rows: CsvShopRow[] = [];
  for (let i = 1; i < cleanedLines.length; i++) {
    const values = parseCSVLine(cleanedLines[i]);
    if (values.length === 0) continue;

    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });
    rows.push(row as unknown as CsvShopRow);
  }

  return rows;
}

/**
 * Parse a single CSV line handling quoted fields with commas
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  return result;
}

/**
 * Generate a unique shop code from the shop name and city
 */
function generateShopCode(name: string, city: string, externalId: number): string {
  // Clean and normalize the name
  let code = name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .trim();

  // Take first significant words
  const words = code.split(/\s+/).filter(w =>
    !['INC', 'LLC', 'CORP', 'THE', 'AND', 'OF', 'CO'].includes(w) && w.length > 0
  );

  // Build code from first 2-3 significant words
  let baseCode = words.slice(0, 3).join('-');
  if (!baseCode) {
    baseCode = 'SHOP';
  }

  // Add city if available
  if (city && city !== 'nan' && city.length > 0) {
    const cleanCity = city.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 10);
    baseCode = `${baseCode}-${cleanCity}`;
  }

  // Add external ID to ensure uniqueness
  return `${baseCode}-${externalId}`;
}

/**
 * Determine the geographic region based on state
 */
function getRegionFromState(state: string): string {
  const regionMap: Record<string, string> = {
    // Northeast
    ME: 'Northeast', NH: 'Northeast', VT: 'Northeast', MA: 'Northeast',
    RI: 'Northeast', CT: 'Northeast', NY: 'Northeast', NJ: 'Northeast',
    PA: 'Northeast', MD: 'Northeast', DE: 'Northeast', DC: 'Northeast',
    // Southeast
    VA: 'Southeast', WV: 'Southeast', NC: 'Southeast', SC: 'Southeast',
    GA: 'Southeast', FL: 'Southeast', AL: 'Southeast', MS: 'Southeast',
    TN: 'Southeast', KY: 'Southeast',
    // Midwest
    OH: 'Midwest', IN: 'Midwest', IL: 'Midwest', MI: 'Midwest',
    WI: 'Midwest', MN: 'Midwest', IA: 'Midwest', MO: 'Midwest',
    ND: 'Midwest', SD: 'Midwest', NE: 'Midwest', KS: 'Midwest',
    // Southwest
    TX: 'Southwest', OK: 'Southwest', AR: 'Southwest', LA: 'Southwest',
    NM: 'Southwest', AZ: 'Southwest',
    // West
    CO: 'West', WY: 'West', MT: 'West', ID: 'West',
    WA: 'West', OR: 'West', CA: 'West', NV: 'West', UT: 'West',
    // Canada
    ON: 'Canada', QC: 'Canada', BC: 'Canada', AB: 'Canada',
    SK: 'Canada', MB: 'Canada', NB: 'Canada', NS: 'Canada',
  };

  return regionMap[state.toUpperCase()] || 'Other';
}

/**
 * Parse a date string from CSV format
 */
function parseDate(dateStr: string): Date | null {
  if (!dateStr || dateStr === 'nan' || dateStr.trim() === '') {
    return null;
  }
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Parse a float from string
 */
function parseFloat(str: string): number | null {
  if (!str || str === 'nan' || str.trim() === '') {
    return null;
  }
  const parsed = Number.parseFloat(str);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Parse a boolean from Yes/No string
 */
function parseBoolean(str: string): boolean {
  return str?.toLowerCase() === 'yes';
}

/**
 * Main import function
 */
async function importShops(options: {
  dryRun?: boolean;
  activeOnly?: boolean;
  shopTypesFilter?: string[];
} = {}) {
  const { dryRun = false, activeOnly = true, shopTypesFilter } = options;

  console.log('=== Shop Import Script ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Filter: ${activeOnly ? 'Active only' : 'All statuses'}`);
  if (shopTypesFilter) {
    console.log(`Shop types: ${shopTypesFilter.join(', ')}`);
  }
  console.log('');

  // Get or create default company
  let company = await prisma.company.findFirst();
  if (!company) {
    console.log('Creating default company...');
    if (!dryRun) {
      company = await prisma.company.create({
        data: {
          name: 'AITX',
          code: 'AITX',
          type: 'lessor',
        },
      });
    } else {
      company = { id: 'dry-run-company-id' } as any;
    }
  }
  console.log(`Using company: ${company.id}`);

  // Read and parse CSV
  const csvPath = path.join(__dirname, 'cleaned shop locations.csv');
  console.log(`\nReading CSV from: ${csvPath}`);

  if (!fs.existsSync(csvPath)) {
    console.error('CSV file not found!');
    process.exit(1);
  }

  const rows = parseCsv(csvPath);
  console.log(`Parsed ${rows.length} rows from CSV`);

  // Filter rows
  let filteredRows = rows.filter(row => {
    // Must have valid IsAITXShop field (Yes or No) to be well-formed
    if (!['Yes', 'No'].includes(row.IsAITXShop)) {
      return false;
    }

    // Filter by status
    if (activeOnly && row.ShopStatus !== 'Active') {
      return false;
    }

    // Filter by shop type
    if (shopTypesFilter && !shopTypesFilter.includes(row.ShopType)) {
      return false;
    }

    // Skip rows marked for deletion
    if (row.Action?.toLowerCase() === 'delete') {
      return false;
    }

    return true;
  });

  console.log(`Filtered to ${filteredRows.length} shops for import`);

  // Track codes to handle duplicates
  const usedCodes = new Set<string>();

  // Process and import shops
  const stats = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  for (const row of filteredRows) {
    try {
      const externalId = parseInt(row.Id) || 0;
      let code = generateShopCode(row.ShopName, row.City, externalId);

      // Ensure unique code
      let codeAttempt = 0;
      while (usedCodes.has(code)) {
        codeAttempt++;
        code = `${code}-${codeAttempt}`;
      }
      usedCodes.add(code);

      const shopData = {
        externalId,
        name: row.ShopName || 'Unknown',
        displayName: row.ShopNameDisplay || row.ShopName || 'Unknown',
        code,
        shopType: row.ShopType || 'Repair',
        location: `${row.City || ''}, ${row.State || ''}`.trim().replace(/^,\s*/, ''),
        address1: row.Address1 || '',
        address2: row.Address2 || '',
        city: row.City === 'nan' ? '' : (row.City || ''),
        state: row.State === 'nan' ? '' : (row.State || ''),
        zip: row.Zip === 'nan' ? '' : (row.Zip || ''),
        region: getRegionFromState(row.State || ''),
        servingRailroad: row.DeliveryLines || '',
        splc: row.SPLC || '',
        scac: row.SCAC || '',
        latitude: parseFloat(row.Latitude),
        longitude: parseFloat(row.Longitude),
        isAitxInternal: parseBoolean(row.IsAITXShop),
        tankQualified: true, // Assume tank qualified by default for repair shops
        shopStatus: row.ShopStatus?.toLowerCase() === 'active' ? 'active' : 'review',
        isActive: row.ShopStatus?.toLowerCase() === 'active',
        contactEmail: row.Email || '',
        contactPhone: row.Phone || '',
        contactFax: row.Fax || '',
        website: row.Website || '',
        sapVendorId: row.SAP || '',
        notes: row.Comment || '',
        certificationClass: row.CertifcationClass || '',
        certificationDate: parseDate(row.CertificationDate),
        certificationExp: parseDate(row.CertificateExpiration),
        displayOnMap: parseBoolean(row.DisplayOnCustomerMap),
        displayOnPortal: parseBoolean(row.DisplayOnWebPortal),
        environmentalReview: parseBoolean(row.EnvironmentalReview),
        lastVerified: parseDate(row['Last Verified']),
        laborRate: parseFloat(row.LaborRate) || 75.0,
        costIndex: parseBoolean(row.IsAITXShop) ? 1.379 : 1.0,
        companyId: company!.id,
      };

      if (dryRun) {
        console.log(`[DRY RUN] Would upsert: ${shopData.code} - ${shopData.displayName}`);
        stats.created++;
      } else {
        // Check if shop exists by externalId
        const existing = await prisma.shop.findFirst({
          where: { externalId },
        });

        if (existing) {
          await prisma.shop.update({
            where: { id: existing.id },
            data: shopData,
          });
          stats.updated++;
        } else {
          await prisma.shop.create({
            data: shopData,
          });
          stats.created++;
        }
      }
    } catch (error) {
      console.error(`Error processing shop ${row.Id} (${row.ShopName}):`, error);
      stats.errors++;
    }
  }

  console.log('\n=== Import Complete ===');
  console.log(`Created: ${stats.created}`);
  console.log(`Updated: ${stats.updated}`);
  console.log(`Skipped: ${stats.skipped}`);
  console.log(`Errors: ${stats.errors}`);

  return stats;
}

// Run if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const allStatuses = args.includes('--all');
  const repairOnly = args.includes('--repair-only');

  const shopTypesFilter = repairOnly
    ? ['Repair', 'Repair: Mini Mobile']
    : undefined;

  importShops({
    dryRun,
    activeOnly: !allStatuses,
    shopTypesFilter,
  })
    .then(() => {
      console.log('\nDone!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Import failed:', error);
      process.exit(1);
    })
    .finally(() => {
      prisma.$disconnect();
    });
}

export { importShops, parseCsv };
