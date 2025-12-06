/**
 * Header Validation Utility for Qual Planner Master Import
 *
 * This module provides bulletproof header validation and normalization.
 * It handles:
 * - Case-insensitive matching
 * - Whitespace normalization (leading, trailing, internal)
 * - Minor spelling variations
 * - Column order independence
 * - Missing/extra column detection
 * - Clear error messages
 */

import {
  ALL_CANONICAL_HEADERS,
  REQUIRED_HEADERS,
  KEY_PLANNING_HEADERS,
  SHOP_HEADERS,
  HEADER_TO_DB_COLUMN,
} from './qualPlannerSchema';

// =============================================================================
// TYPES
// =============================================================================

export interface HeaderValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  missingRequired: string[];
  missingKeyPlanning: string[];
  extraHeaders: string[];
  normalizedHeaderMap: Record<string, string>;  // rawHeader -> canonicalHeader
  dbColumnMap: Record<string, string>;          // rawHeader -> db_column_name
  shopColumnHeaders: string[];                   // Detected shop columns
  stats: {
    totalHeaders: number;
    matchedHeaders: number;
    unmatchedHeaders: number;
    shopHeaders: number;
  };
}

export interface NormalizationOptions {
  caseSensitive?: boolean;
  strictWhitespace?: boolean;
  allowSpellingVariations?: boolean;
}

// =============================================================================
// NORMALIZATION FUNCTIONS
// =============================================================================

/**
 * Strips BOM (Byte Order Mark) from the beginning of a string
 * Common with Excel exports
 */
export function stripBOM(str: string): string {
  // UTF-8 BOM: EF BB BF (appears as \uFEFF in JS)
  // UTF-16 BE BOM: FE FF
  // UTF-16 LE BOM: FF FE
  if (str.charCodeAt(0) === 0xFEFF) {
    return str.slice(1);
  }
  // Also handle UTF-8 BOM as raw bytes if present
  if (str.startsWith('\xEF\xBB\xBF')) {
    return str.slice(3);
  }
  return str;
}

/**
 * Normalizes a header string for comparison
 * - Strips BOM
 * - Trims leading/trailing whitespace
 * - Collapses internal multiple spaces to single space
 * - Removes invisible/control characters
 * - Preserves case by default (for final mapping)
 */
export function normalizeHeader(header: string, toLower: boolean = false): string {
  let normalized = stripBOM(header);

  // Remove invisible/control characters (except space)
  normalized = normalized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Trim leading/trailing whitespace
  normalized = normalized.trim();

  // Collapse multiple spaces to single space
  normalized = normalized.replace(/\s+/g, ' ');

  // Optionally convert to lowercase for matching
  if (toLower) {
    normalized = normalized.toLowerCase();
  }

  return normalized;
}

/**
 * Creates a normalized key for fuzzy matching
 * More aggressive normalization for finding matches
 */
export function createMatchKey(header: string): string {
  return normalizeHeader(header, true)
    .replace(/[^a-z0-9]/g, '')  // Remove all non-alphanumeric
    .trim();
}

// =============================================================================
// KNOWN SPELLING VARIATIONS
// =============================================================================

/**
 * Map of known spelling variations/typos to canonical headers
 * Add common variations here
 */
const SPELLING_VARIATIONS: Record<string, string> = {
  // Commercial variations
  'commercial': 'Commericial',           // Correct -> Typo (source has typo)
  'commerical': 'Commericial',
  'commericial': 'Commericial',

  // Region variations
  '2026region': '2026 Region',
  'region2026': '2026 Region',

  // Qualification variations
  'fullpartialqual': 'Full/Partial Qual',
  'fullpartial': 'Full/Partial Qual',
  'qualtype': 'Full/Partial Qual',

  // Tank qual variations
  'performtankqual': 'Perform Tank Qual',
  'tankqual': 'Perform Tank Qual',

  // Car mark variations
  'carmark': 'Car Mark',
  'car_mark': 'Car Mark',
  'mark': 'Car Mark',  // Only if 'Mark' column doesn't exist separately

  // Lessee variations
  'lesseename': 'Lessee Name',
  'lessee_name': 'Lessee Name',
  'lessee': 'Lessee Name',
  'customer': 'Lessee Name',
  'customername': 'Lessee Name',

  // Contract variations
  'contractexpiration': 'Contract Expiration',
  'contract_expiration': 'Contract Expiration',
  'contractexp': 'Contract Expiration',
  'contexp': 'Contract Expiration',

  // Primary commodity variations
  'primarycommodity': 'Primary Commodity',
  'primary_commodity': 'Primary Commodity',
  'commodity': 'Primary Commodity',

  // Status variations
  'currentstatus': 'Current Status',
  'current_status': 'Current Status',
  'status': 'Current Status',

  // Plan status variations
  'planstatus': 'Plan Status',
  'plan_status': 'Plan Status',

  // Jacketed variations
  'isjacketed': 'Jacketed',
  'is_jacketed': 'Jacketed',

  // Lined variations
  'islined': 'Lined',
  'is_lined': 'Lined',

  // Car type variations
  'cartypelevel2': 'Car Type Level 2',
  'car_type_level_2': 'Car Type Level 2',
  'cartype': 'Car Type Level 2',
  'car_type': 'Car Type Level 2',
};

// =============================================================================
// SHOP HEADER DETECTION
// =============================================================================

/**
 * Detects if a header is likely a shop column
 * Shop columns typically contain company names with locations in parentheses
 */
export function isLikelyShopHeader(header: string): boolean {
  const normalized = normalizeHeader(header, true);

  // Check against known shop patterns
  const shopPatterns = [
    /aitx/i,
    /railcar/i,
    /repair/i,
    /rail\s*services/i,
    /cathcart/i,
    /eagle/i,
    /greenbrier/i,
    /transco/i,
    /trinity/i,
    /procor/i,
    /curry/i,
    /frit\s*car/i,
    /iron\s*horse/i,
    /rescar/i,
    /vls/i,
  ];

  for (const pattern of shopPatterns) {
    if (pattern.test(normalized)) {
      return true;
    }
  }

  // Check if it ends with a location in parentheses
  if (/\([^)]+\)\s*$/.test(header)) {
    return true;
  }

  return false;
}

// =============================================================================
// HEADER MATCHING
// =============================================================================

/**
 * Attempts to match a raw header to a canonical header
 * Returns the canonical header if matched, null otherwise
 */
export function matchHeader(
  rawHeader: string,
  canonicalHeaders: readonly string[],
  options: NormalizationOptions = {}
): string | null {
  const {
    caseSensitive = false,
    strictWhitespace = false,
    allowSpellingVariations = true,
  } = options;

  const normalizedRaw = strictWhitespace
    ? rawHeader.trim()
    : normalizeHeader(rawHeader, !caseSensitive);

  // 1. Exact match (after normalization)
  for (const canonical of canonicalHeaders) {
    const normalizedCanonical = strictWhitespace
      ? canonical.trim()
      : normalizeHeader(canonical, !caseSensitive);

    if (normalizedRaw === normalizedCanonical) {
      return canonical;
    }
  }

  // 2. Match with trailing spaces stripped (common Excel issue)
  for (const canonical of canonicalHeaders) {
    const trimmedCanonical = canonical.trim();
    const normalizedCanonical = strictWhitespace
      ? trimmedCanonical
      : normalizeHeader(trimmedCanonical, !caseSensitive);

    if (normalizedRaw === normalizedCanonical) {
      return canonical;
    }
  }

  // 3. Spelling variation match
  if (allowSpellingVariations) {
    const matchKey = createMatchKey(rawHeader);
    if (SPELLING_VARIATIONS[matchKey]) {
      const mappedCanonical = SPELLING_VARIATIONS[matchKey];
      if (canonicalHeaders.includes(mappedCanonical as any)) {
        return mappedCanonical;
      }
    }
  }

  // 4. Fuzzy match by match key
  for (const canonical of canonicalHeaders) {
    const canonicalKey = createMatchKey(canonical);
    const rawKey = createMatchKey(rawHeader);

    if (canonicalKey === rawKey && canonicalKey.length > 3) {
      return canonical;
    }
  }

  return null;
}

// =============================================================================
// MAIN VALIDATION FUNCTION
// =============================================================================

/**
 * Validates headers from an imported file against the canonical schema
 *
 * @param rawHeaders - Array of header strings from the imported file
 * @param options - Normalization options
 * @returns HeaderValidationResult with detailed validation info
 */
export function validateHeaders(
  rawHeaders: string[],
  options: NormalizationOptions = {}
): HeaderValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const missingRequired: string[] = [];
  const missingKeyPlanning: string[] = [];
  const extraHeaders: string[] = [];
  const normalizedHeaderMap: Record<string, string> = {};
  const dbColumnMap: Record<string, string> = {};
  const shopColumnHeaders: string[] = [];

  // Track which canonical headers have been matched
  const matchedCanonical = new Set<string>();

  // Clean and deduplicate headers
  const cleanedHeaders = rawHeaders.map(h => stripBOM(h.trim()));

  // Check for duplicate headers
  const headerCounts = new Map<string, number>();
  cleanedHeaders.forEach(h => {
    const count = headerCounts.get(h) || 0;
    headerCounts.set(h, count + 1);
  });

  headerCounts.forEach((count, header) => {
    if (count > 1 && header !== '' && header !== 'Column1') {
      warnings.push(`Duplicate header found: "${header}" appears ${count} times`);
    }
  });

  // Match each header
  for (const rawHeader of cleanedHeaders) {
    // Skip empty headers
    if (!rawHeader || rawHeader === 'Column1') {
      continue;
    }

    // Try to match against canonical headers
    const matched = matchHeader(rawHeader, ALL_CANONICAL_HEADERS, options);

    if (matched) {
      normalizedHeaderMap[rawHeader] = matched;
      matchedCanonical.add(matched);

      // Get DB column name if not a shop column
      if (!SHOP_HEADERS.includes(matched as any)) {
        const dbColumn = HEADER_TO_DB_COLUMN[matched];
        if (dbColumn) {
          dbColumnMap[rawHeader] = dbColumn;
        }
      } else {
        shopColumnHeaders.push(rawHeader);
      }
    } else if (isLikelyShopHeader(rawHeader)) {
      // It's a shop header we don't have in our canonical list
      // This is okay - log it but don't error
      shopColumnHeaders.push(rawHeader);
      warnings.push(`Unknown shop column detected: "${rawHeader}" - will be imported as shop schedule`);
    } else {
      extraHeaders.push(rawHeader);
    }
  }

  // Check for missing required headers
  for (const required of REQUIRED_HEADERS) {
    if (!matchedCanonical.has(required)) {
      missingRequired.push(required);
      errors.push(`REQUIRED header missing: "${required}"`);
    }
  }

  // Check for missing key planning headers (warnings, not errors)
  for (const keyHeader of KEY_PLANNING_HEADERS) {
    if (!matchedCanonical.has(keyHeader)) {
      missingKeyPlanning.push(keyHeader);
      warnings.push(`Key planning header missing: "${keyHeader}" - import will continue`);
    }
  }

  // Log extra headers
  if (extraHeaders.length > 0) {
    warnings.push(
      `${extraHeaders.length} unrecognized headers found: ${extraHeaders.slice(0, 5).join(', ')}${
        extraHeaders.length > 5 ? ` and ${extraHeaders.length - 5} more` : ''
      }`
    );
  }

  // Calculate stats
  const stats = {
    totalHeaders: cleanedHeaders.filter(h => h && h !== 'Column1').length,
    matchedHeaders: Object.keys(normalizedHeaderMap).length,
    unmatchedHeaders: extraHeaders.length,
    shopHeaders: shopColumnHeaders.length,
  };

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    missingRequired,
    missingKeyPlanning,
    extraHeaders,
    normalizedHeaderMap,
    dbColumnMap,
    shopColumnHeaders,
    stats,
  };
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Creates a header index map for fast column lookup
 * Maps canonical header -> column index
 */
export function createHeaderIndexMap(
  rawHeaders: string[],
  validationResult: HeaderValidationResult
): Map<string, number> {
  const indexMap = new Map<string, number>();

  rawHeaders.forEach((rawHeader, index) => {
    const canonical = validationResult.normalizedHeaderMap[rawHeader];
    if (canonical) {
      indexMap.set(canonical, index);
    }
  });

  return indexMap;
}

/**
 * Formats validation result as a human-readable report
 */
export function formatValidationReport(result: HeaderValidationResult): string {
  const lines: string[] = [
    '='.repeat(60),
    'HEADER VALIDATION REPORT',
    '='.repeat(60),
    '',
    `Status: ${result.isValid ? '✓ VALID' : '✗ INVALID'}`,
    '',
    'Statistics:',
    `  Total headers: ${result.stats.totalHeaders}`,
    `  Matched: ${result.stats.matchedHeaders}`,
    `  Unmatched: ${result.stats.unmatchedHeaders}`,
    `  Shop columns: ${result.stats.shopHeaders}`,
    '',
  ];

  if (result.errors.length > 0) {
    lines.push('ERRORS:');
    result.errors.forEach(e => lines.push(`  ✗ ${e}`));
    lines.push('');
  }

  if (result.warnings.length > 0) {
    lines.push('WARNINGS:');
    result.warnings.forEach(w => lines.push(`  ⚠ ${w}`));
    lines.push('');
  }

  if (result.missingRequired.length > 0) {
    lines.push('Missing Required Headers:');
    result.missingRequired.forEach(h => lines.push(`  - ${h}`));
    lines.push('');
  }

  if (result.extraHeaders.length > 0 && result.extraHeaders.length <= 10) {
    lines.push('Unrecognized Headers (will be ignored):');
    result.extraHeaders.forEach(h => lines.push(`  - ${h}`));
    lines.push('');
  }

  lines.push('='.repeat(60));

  return lines.join('\n');
}

export default {
  validateHeaders,
  normalizeHeader,
  stripBOM,
  matchHeader,
  isLikelyShopHeader,
  createHeaderIndexMap,
  formatValidationReport,
};
