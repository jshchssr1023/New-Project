/**
 * Test Suite for Qual Planner Master Import
 *
 * Comprehensive tests for header validation, CSV parsing, and import logic.
 */

import {
  validateHeaders,
  normalizeHeader,
  stripBOM,
  matchHeader,
  isLikelyShopHeader,
  createHeaderIndexMap,
} from '../qualPlannerHeaderValidator';
import {
  parseCSVLine,
  parseCSVContent,
  toBoolean,
  toInteger,
  toDate,
  formatDateISO,
} from '../qualPlannerImportService';
import {
  ALL_CANONICAL_HEADERS,
  REQUIRED_HEADERS,
  SHOP_HEADERS,
  HEADER_TO_DB_COLUMN,
} from '../qualPlannerSchema';

// =============================================================================
// HEADER NORMALIZATION TESTS
// =============================================================================

describe('Header Normalization', () => {
  describe('stripBOM', () => {
    it('should strip UTF-8 BOM character', () => {
      expect(stripBOM('\uFEFFLessee Name')).toBe('Lessee Name');
    });

    it('should handle strings without BOM', () => {
      expect(stripBOM('Lessee Name')).toBe('Lessee Name');
    });

    it('should strip raw UTF-8 BOM bytes', () => {
      expect(stripBOM('\xEF\xBB\xBFCar Mark')).toBe('Car Mark');
    });
  });

  describe('normalizeHeader', () => {
    it('should trim leading/trailing whitespace', () => {
      expect(normalizeHeader('  Car Mark  ')).toBe('Car Mark');
    });

    it('should collapse multiple internal spaces', () => {
      expect(normalizeHeader('Car    Mark')).toBe('Car Mark');
    });

    it('should remove invisible characters', () => {
      expect(normalizeHeader('Car\x00Mark')).toBe('CarMark');
    });

    it('should lowercase when requested', () => {
      expect(normalizeHeader('Car Mark', true)).toBe('car mark');
    });

    it('should handle trailing spaces from Excel exports', () => {
      expect(normalizeHeader('Rule 88B ')).toBe('Rule 88B');
    });
  });
});

// =============================================================================
// HEADER MATCHING TESTS
// =============================================================================

describe('Header Matching', () => {
  describe('matchHeader', () => {
    it('should match exact headers', () => {
      expect(matchHeader('Lessee Name', ALL_CANONICAL_HEADERS)).toBe('Lessee Name');
    });

    it('should match headers with extra trailing spaces', () => {
      expect(matchHeader('Car Mark  ', ALL_CANONICAL_HEADERS)).toBe('Car Mark');
    });

    it('should match case-insensitively by default', () => {
      expect(matchHeader('lessee name', ALL_CANONICAL_HEADERS)).toBe('Lessee Name');
      expect(matchHeader('CAR MARK', ALL_CANONICAL_HEADERS)).toBe('Car Mark');
    });

    it('should match known spelling variations', () => {
      expect(matchHeader('Commercial', ALL_CANONICAL_HEADERS)).toBe('Commericial');
      expect(matchHeader('customer', ALL_CANONICAL_HEADERS)).toBe('Lessee Name');
    });

    it('should match underscore-separated variations', () => {
      expect(matchHeader('car_mark', ALL_CANONICAL_HEADERS)).toBe('Car Mark');
      expect(matchHeader('lessee_name', ALL_CANONICAL_HEADERS)).toBe('Lessee Name');
    });

    it('should return null for unrecognized headers', () => {
      expect(matchHeader('Unknown Column', ALL_CANONICAL_HEADERS)).toBeNull();
    });

    it('should match headers with trailing spaces in canonical list', () => {
      // 'Rule 88B ' has trailing space in source
      expect(matchHeader('Rule 88B', ALL_CANONICAL_HEADERS)).toBe('Rule 88B ');
    });
  });

  describe('isLikelyShopHeader', () => {
    it('should detect AITX shop headers', () => {
      expect(isLikelyShopHeader('AITX Fleet Services of Canada Inc. (Sarnia)')).toBe(true);
      expect(isLikelyShopHeader('AITX Railcar Services LLC (N Kansas City)')).toBe(true);
    });

    it('should detect third-party shop headers', () => {
      expect(isLikelyShopHeader('Eagle Railcar (Cairo)')).toBe(true);
      expect(isLikelyShopHeader('Greenbrier Repair & Services (Cleburne)')).toBe(true);
      expect(isLikelyShopHeader('Trinity Industries, Inc. (Ft. Worth)')).toBe(true);
    });

    it('should not detect non-shop headers', () => {
      expect(isLikelyShopHeader('Lessee Name')).toBe(false);
      expect(isLikelyShopHeader('Contract Expiration')).toBe(false);
    });

    it('should detect headers with location in parentheses', () => {
      expect(isLikelyShopHeader('Some Company (Houston)')).toBe(true);
    });
  });
});

// =============================================================================
// HEADER VALIDATION TESTS
// =============================================================================

describe('Header Validation', () => {
  describe('validateHeaders', () => {
    it('should validate a complete canonical header set', () => {
      const result = validateHeaders([...ALL_CANONICAL_HEADERS]);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.missingRequired).toHaveLength(0);
    });

    it('should fail when required headers are missing', () => {
      const headers = ['Contract', 'Primary Commodity', 'CSR'];
      const result = validateHeaders(headers);

      expect(result.isValid).toBe(false);
      expect(result.missingRequired).toContain('Car Mark');
      expect(result.missingRequired).toContain('Lessee Name');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should warn but not fail for missing key planning headers', () => {
      const headers = ['Lessee Name', 'Car Mark'];
      const result = validateHeaders(headers);

      expect(result.isValid).toBe(true);
      expect(result.missingKeyPlanning.length).toBeGreaterThan(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should track extra/unrecognized headers', () => {
      const headers = ['Lessee Name', 'Car Mark', 'Unknown Column', 'Another Unknown'];
      const result = validateHeaders(headers);

      expect(result.isValid).toBe(true);
      expect(result.extraHeaders).toContain('Unknown Column');
      expect(result.extraHeaders).toContain('Another Unknown');
    });

    it('should handle headers with BOM', () => {
      const headers = ['\uFEFFLessee Name', 'Car Mark', 'Contract'];
      const result = validateHeaders(headers);

      expect(result.isValid).toBe(true);
      expect(result.normalizedHeaderMap['\uFEFFLessee Name']).toBe('Lessee Name');
    });

    it('should detect duplicate headers', () => {
      const headers = ['Lessee Name', 'Car Mark', 'Car Mark', 'Contract'];
      const result = validateHeaders(headers);

      expect(result.warnings.some(w => w.includes('Duplicate header'))).toBe(true);
    });

    it('should identify shop column headers', () => {
      const headers = [
        'Lessee Name',
        'Car Mark',
        'AITX Fleet Services of Canada Inc. (Sarnia)',
        'Eagle Railcar (Cairo)',
      ];
      const result = validateHeaders(headers);

      expect(result.shopColumnHeaders).toContain('AITX Fleet Services of Canada Inc. (Sarnia)');
      expect(result.shopColumnHeaders).toContain('Eagle Railcar (Cairo)');
    });

    it('should provide DB column mapping', () => {
      const headers = ['Lessee Name', 'Car Mark', 'Contract', 'Commericial'];
      const result = validateHeaders(headers);

      expect(result.dbColumnMap['Lessee Name']).toBe('lessee_name');
      expect(result.dbColumnMap['Car Mark']).toBe('car_mark');
      expect(result.dbColumnMap['Commericial']).toBe('commercial'); // Fixed spelling
    });
  });

  describe('createHeaderIndexMap', () => {
    it('should create correct index mappings', () => {
      const headers = ['Lessee Name', 'Car Mark', 'Contract', 'Unknown'];
      const validation = validateHeaders(headers);
      const indexMap = createHeaderIndexMap(headers, validation);

      expect(indexMap.get('Lessee Name')).toBe(0);
      expect(indexMap.get('Car Mark')).toBe(1);
      expect(indexMap.get('Contract')).toBe(2);
      expect(indexMap.has('Unknown')).toBe(false);
    });
  });
});

// =============================================================================
// CSV PARSING TESTS
// =============================================================================

describe('CSV Parsing', () => {
  describe('parseCSVLine', () => {
    it('should parse simple comma-separated values', () => {
      expect(parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c']);
    });

    it('should handle quoted fields', () => {
      expect(parseCSVLine('"hello","world"')).toEqual(['hello', 'world']);
    });

    it('should handle commas inside quoted fields', () => {
      expect(parseCSVLine('"hello, world",test')).toEqual(['hello, world', 'test']);
    });

    it('should handle escaped quotes', () => {
      expect(parseCSVLine('"say ""hello""",test')).toEqual(['say "hello"', 'test']);
    });

    it('should trim values', () => {
      expect(parseCSVLine('  a  ,  b  ')).toEqual(['a', 'b']);
    });

    it('should handle empty fields', () => {
      expect(parseCSVLine('a,,c')).toEqual(['a', '', 'c']);
    });

    it('should handle trailing comma', () => {
      expect(parseCSVLine('a,b,')).toEqual(['a', 'b', '']);
    });
  });

  describe('parseCSVContent', () => {
    it('should parse complete CSV content', () => {
      const csv = 'Header1,Header2\nValue1,Value2\nValue3,Value4';
      const result = parseCSVContent(csv);

      expect(result.headers).toEqual(['Header1', 'Header2']);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual(['Value1', 'Value2']);
    });

    it('should handle CRLF line endings', () => {
      const csv = 'Header1,Header2\r\nValue1,Value2';
      const result = parseCSVContent(csv);

      expect(result.headers).toEqual(['Header1', 'Header2']);
      expect(result.rows[0]).toEqual(['Value1', 'Value2']);
    });

    it('should strip BOM from content', () => {
      const csv = '\uFEFFHeader1,Header2\nValue1,Value2';
      const result = parseCSVContent(csv);

      expect(result.headers[0]).toBe('Header1');
    });

    it('should handle newlines inside quoted fields', () => {
      const csv = 'Header1,Header2\n"Line1\nLine2",Value2';
      const result = parseCSVContent(csv);

      expect(result.rows[0][0]).toBe('Line1\nLine2');
    });

    it('should skip empty lines', () => {
      const csv = 'Header1,Header2\n\nValue1,Value2\n\n';
      const result = parseCSVContent(csv);

      expect(result.rows).toHaveLength(1);
    });
  });
});

// =============================================================================
// DATA CONVERSION TESTS
// =============================================================================

describe('Data Conversion', () => {
  describe('toBoolean', () => {
    it('should convert truthy strings', () => {
      expect(toBoolean('yes')).toBe(true);
      expect(toBoolean('Yes')).toBe(true);
      expect(toBoolean('YES')).toBe(true);
      expect(toBoolean('y')).toBe(true);
      expect(toBoolean('true')).toBe(true);
      expect(toBoolean('1')).toBe(true);
      expect(toBoolean('x')).toBe(true);
      expect(toBoolean('Jacketed')).toBe(true);
    });

    it('should convert falsy strings', () => {
      expect(toBoolean('no')).toBe(false);
      expect(toBoolean('No')).toBe(false);
      expect(toBoolean('false')).toBe(false);
      expect(toBoolean('0')).toBe(false);
      expect(toBoolean('')).toBe(false);
    });

    it('should handle null/undefined', () => {
      expect(toBoolean(null)).toBe(false);
      expect(toBoolean(undefined)).toBe(false);
    });

    it('should pass through boolean values', () => {
      expect(toBoolean(true)).toBe(true);
      expect(toBoolean(false)).toBe(false);
    });
  });

  describe('toInteger', () => {
    it('should parse integer strings', () => {
      expect(toInteger('42')).toBe(42);
      expect(toInteger('2025')).toBe(2025);
      expect(toInteger('0')).toBe(0);
    });

    it('should handle negative numbers', () => {
      expect(toInteger('-5')).toBe(-5);
    });

    it('should handle commas in numbers', () => {
      expect(toInteger('1,234')).toBe(1234);
    });

    it('should return null for empty/invalid values', () => {
      expect(toInteger('')).toBeNull();
      expect(toInteger(null)).toBeNull();
      expect(toInteger('abc')).toBeNull();
    });
  });

  describe('toDate', () => {
    it('should parse MM/DD/YYYY format', () => {
      const date = toDate('2/28/2026');
      expect(date).toBeInstanceOf(Date);
      expect(date?.getMonth()).toBe(1); // February (0-indexed)
      expect(date?.getDate()).toBe(28);
      expect(date?.getFullYear()).toBe(2026);
    });

    it('should parse M/D/YYYY format', () => {
      const date = toDate('3/5/2025');
      expect(date?.getMonth()).toBe(2); // March
      expect(date?.getDate()).toBe(5);
    });

    it('should parse ISO format', () => {
      const date = toDate('2025-03-15');
      expect(date?.getFullYear()).toBe(2025);
      expect(date?.getMonth()).toBe(2);
      expect(date?.getDate()).toBe(15);
    });

    it('should return null for empty/invalid values', () => {
      expect(toDate('')).toBeNull();
      expect(toDate(null)).toBeNull();
      expect(toDate('invalid')).toBeNull();
    });

    it('should pass through Date objects', () => {
      const original = new Date(2025, 5, 15);
      expect(toDate(original)).toEqual(original);
    });
  });

  describe('formatDateISO', () => {
    it('should format date as YYYY-MM-DD', () => {
      const date = new Date(2025, 2, 15); // March 15, 2025
      expect(formatDateISO(date)).toBe('2025-03-15');
    });

    it('should return null for null input', () => {
      expect(formatDateISO(null)).toBeNull();
    });
  });
});

// =============================================================================
// SCHEMA TESTS
// =============================================================================

describe('Schema Definitions', () => {
  it('should have all required headers defined', () => {
    expect(REQUIRED_HEADERS).toContain('Car Mark');
    expect(REQUIRED_HEADERS).toContain('Lessee Name');
  });

  it('should have DB column mappings for core headers', () => {
    expect(HEADER_TO_DB_COLUMN['Lessee Name']).toBe('lessee_name');
    expect(HEADER_TO_DB_COLUMN['Car Mark']).toBe('car_mark');
    expect(HEADER_TO_DB_COLUMN['Contract Expiration']).toBe('contract_expiration');
    expect(HEADER_TO_DB_COLUMN['Commericial']).toBe('commercial'); // Fixed spelling
  });

  it('should have shop headers defined', () => {
    expect(SHOP_HEADERS.length).toBeGreaterThan(50);
    expect(SHOP_HEADERS.some(h => h.includes('AITX'))).toBe(true);
    expect(SHOP_HEADERS.some(h => h.includes('Eagle'))).toBe(true);
    expect(SHOP_HEADERS.some(h => h.includes('Greenbrier'))).toBe(true);
  });
});

// =============================================================================
// INTEGRATION TESTS (use real CSV content)
// =============================================================================

describe('Integration Tests', () => {
  const sampleCSV = `Lessee Name,Car Mark,FMS Lessee Number,Contract,Contract Expiration,Primary Commodity,CSR,CSL,Commericial,Current Status,Plan Status
Acme-Hardesty co,SHQX006002,3531,020045 0001,2/28/2026,CASTOR OIL,Marilynn Easton,Cortney Zemanski,Jack Glowski,Active,To Be Routed
ADM Transportation Company,SHQX009709,0028,009042 0105,5/31/2029,"CORN OIL,REFINED",Cyndie Sansone,Katelyn Monteith,Matt Keck,Active,Complete`;

  it('should parse sample CSV correctly', () => {
    const result = parseCSVContent(sampleCSV);

    expect(result.headers).toHaveLength(11);
    expect(result.rows).toHaveLength(2);
    expect(result.headers[0]).toBe('Lessee Name');
  });

  it('should validate sample headers', () => {
    const result = parseCSVContent(sampleCSV);
    const validation = validateHeaders(result.headers);

    expect(validation.isValid).toBe(true);
    expect(validation.normalizedHeaderMap['Car Mark']).toBe('Car Mark');
  });

  it('should handle quoted commodity with comma', () => {
    const result = parseCSVContent(sampleCSV);

    // Row 2 (index 1) has quoted commodity
    expect(result.rows[1][5]).toBe('CORN OIL,REFINED');
  });
});

// =============================================================================
// EDGE CASE TESTS
// =============================================================================

describe('Edge Cases', () => {
  it('should handle completely empty file', () => {
    const result = parseCSVContent('');
    expect(result.headers).toHaveLength(0);
    expect(result.rows).toHaveLength(0);
  });

  it('should handle file with only headers', () => {
    const result = parseCSVContent('Header1,Header2,Header3');
    expect(result.headers).toHaveLength(3);
    expect(result.rows).toHaveLength(0);
  });

  it('should handle single column file', () => {
    const result = parseCSVContent('Header\nValue1\nValue2');
    expect(result.headers).toEqual(['Header']);
    expect(result.rows).toEqual([['Value1'], ['Value2']]);
  });

  it('should handle very long header names', () => {
    const longHeader = 'AITX Repair-Sweetwater, TX MRU '; // Has trailing space
    const validation = validateHeaders([longHeader, 'Car Mark', 'Lessee Name']);

    expect(validation.shopColumnHeaders).toContain(longHeader);
  });

  it('should handle Column1 placeholder', () => {
    const headers = ['Car Mark', 'Lessee Name', 'Column1'];
    const validation = validateHeaders(headers);

    expect(validation.isValid).toBe(true);
    expect(validation.extraHeaders).not.toContain('Column1'); // Should be ignored
  });
});
