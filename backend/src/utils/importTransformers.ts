/**
 * Data Mapping Intelligence Utilities for Car Import
 *
 * This module provides flexible data transformation and mapping capabilities
 * to handle various input formats and header naming conventions.
 */

// ============================================================================
// HEADER SYNONYM MAPPING DICTIONARY
// ============================================================================

/**
 * Maps common user header variations to required system field names.
 * Keys are lowercase normalized header names, values are the target system field.
 */
export const HEADER_SYNONYMS: Record<string, string> = {
  // railcarNumber synonyms (primary identifier for railcars)
  'railcarnumber': 'railcarNumber',
  'railcar_number': 'railcarNumber',
  'railcar number': 'railcarNumber',
  'railcar#': 'railcarNumber',
  'railcar #': 'railcarNumber',
  'railcar': 'railcarNumber',
  // Legacy vehicleNumber synonyms - map to railcarNumber
  'vehiclenumber': 'railcarNumber',
  'vehicle_number': 'railcarNumber',
  'vehicle number': 'railcarNumber',
  'carid': 'railcarNumber',
  'car_id': 'railcarNumber',
  'car id': 'railcarNumber',
  'vin': 'railcarNumber',
  'car number': 'railcarNumber',
  'carnumber': 'railcarNumber',
  'car_number': 'railcarNumber',
  'reporting mark': 'railcarNumber',
  'reportingmark': 'railcarNumber',
  'reporting_mark': 'railcarNumber',
  // UMLER system abbreviations
  'car_init': 'railcarNumber',
  'car_no': 'railcarNumber',
  'car_nbr': 'railcarNumber',
  'umession': 'railcarNumber',
  'equipment_id': 'railcarNumber',
  'equip_id': 'railcarNumber',
  'eq_id': 'railcarNumber',

  // customer synonyms
  'customer': 'customer',
  'customername': 'customer',
  'customer_name': 'customer',
  'customer name': 'customer',
  'client': 'customer',
  'clientname': 'customer',
  'client_name': 'customer',
  'client name': 'customer',
  'enduser': 'customer',
  'end_user': 'customer',
  'end user': 'customer',
  'lessee': 'customer',
  'owner': 'customer',
  // UMLER system abbreviations
  'cust_nm': 'customer',
  'cust_name': 'customer',
  'lessee_': 'customer',
  'lessee_nm': 'customer',
  'lessee_name': 'customer',
  'shipper': 'customer',
  'shipper_nm': 'customer',
  'consignee': 'customer',
  'consignee_nm': 'customer',

  // isTankCar synonyms
  'istankcar': 'isTankCar',
  'is_tank_car': 'isTankCar',
  'is tank car': 'isTankCar',
  'tank': 'isTankCar',
  'tankcar': 'isTankCar',
  'tank_car': 'isTankCar',
  'tank car': 'isTankCar',
  'tankstatus': 'isTankCar',
  'tank_status': 'isTankCar',
  'tank status': 'isTankCar',
  // UMLER system abbreviations
  'tank_ind': 'isTankCar',
  'is_tank': 'isTankCar',

  // carType synonyms
  'cartype': 'carType',
  'car_type': 'carType',
  'car type': 'carType',
  'type': 'carType',
  'carclass': 'carType',
  'car_class': 'carType',
  'car class': 'carType',
  'equipment type': 'carType',
  'equipmenttype': 'carType',
  'equipment_type': 'carType',
  // UMLER system abbreviations
  'car_typ': 'carType',
  'car_kind': 'carType',
  'eq_type': 'carType',
  'equip_type': 'carType',
  'aar_type': 'carType',
  'aar_cd': 'carType',

  // commodity synonyms
  'commodity': 'commodity',
  'product': 'commodity',
  'cargo': 'commodity',
  'contents': 'commodity',
  'material': 'commodity',
  // UMLER system abbreviations
  'commod': 'commodity',
  'commod_cd': 'commodity',
  'commodity_cd': 'commodity',
  'lading': 'commodity',
  'lading_cd': 'commodity',
  'stcc': 'commodity',
  'stcc_cd': 'commodity',
  'product_cd': 'commodity',
  'prod_cd': 'commodity',

  // status synonyms
  'status': 'status',
  'carstatus': 'status',
  'car_status': 'status',
  'car status': 'status',
  'currentstatus': 'status',
  'current_status': 'status',
  'current status': 'status',
  'state': 'status',
  // UMLER system abbreviations
  'car_ste': 'status',
  'car_sta': 'status',
  'car_stat': 'status',
  'stat_cd': 'status',
  'status_cd': 'status',
  'active': 'status',
  'in_sho': 'status',
  'in_shop': 'status',
  'shop_s': 'status',
  'shop_stat': 'status',
  'shop_status': 'status',
  'pendin': 'status',
  'pending': 'status',

  // currentLocation synonyms
  'currentlocation': 'currentLocation',
  'current_location': 'currentLocation',
  'current location': 'currentLocation',
  'location': 'currentLocation',
  'position': 'currentLocation',
  'site': 'currentLocation',
  // UMLER system abbreviations
  'location_nm': 'currentLocation',
  'loc_nm': 'currentLocation',
  'loc_name': 'currentLocation',
  'curr_loc': 'currentLocation',
  'cur_loc': 'currentLocation',
  'pod_cc': 'currentLocation',
  'station': 'currentLocation',
  'station_nm': 'currentLocation',
  'yard': 'currentLocation',
  'yard_nm': 'currentLocation',
  'city_nm': 'currentLocation',

  // homeRegion synonyms
  'homeregion': 'homeRegion',
  'home_region': 'homeRegion',
  'home region': 'homeRegion',
  'region': 'homeRegion',
  'home': 'homeRegion',
  // UMLER system abbreviations
  'home_reg': 'homeRegion',
  'hm_region': 'homeRegion',
  'home_area': 'homeRegion',
  'district': 'homeRegion',
  'district_nm': 'homeRegion',

  // originRegion synonyms
  'originregion': 'originRegion',
  'origin_region': 'originRegion',
  'origin region': 'originRegion',
  'origin': 'originRegion',
  'source region': 'originRegion',
  'sourceregion': 'originRegion',
  // UMLER system abbreviations
  'origina': 'originRegion',
  'orig_region': 'originRegion',
  'orig_reg': 'originRegion',
  'origin_nm': 'originRegion',
  'orig_loc': 'originRegion',
  'from_loc': 'originRegion',
  'ship_from': 'originRegion',

  // reasonShopped synonyms
  'reasonshopped': 'reasonShopped',
  'reason_shopped': 'reasonShopped',
  'reason shopped': 'reasonShopped',
  'reason': 'reasonShopped',
  'shopreason': 'reasonShopped',
  'shop_reason': 'reasonShopped',
  'shop reason': 'reasonShopped',
  'service reason': 'reasonShopped',
  'servicereason': 'reasonShopped',
  // UMLER system abbreviations
  'shoppi': 'reasonShopped',
  'shop_typ': 'reasonShopped',
  'shop_type': 'reasonShopped',
  'shopping': 'reasonShopped',
  'shopping_type': 'reasonShopped',
  'repair_type': 'reasonShopped',
  'repair_typ': 'reasonShopped',
  'rep_type': 'reasonShopped',
  'service_type': 'reasonShopped',
  'svc_type': 'reasonShopped',
  'maint_type': 'reasonShopped',
  'work_type': 'reasonShopped',
  'job_type': 'reasonShopped',

  // projectNumber synonyms
  'projectnumber': 'projectNumber',
  'project_number': 'projectNumber',
  'project number': 'projectNumber',
  'project': 'projectNumber',
  'projectid': 'projectNumber',
  'project_id': 'projectNumber',
  'work order': 'projectNumber',
  'workorder': 'projectNumber',
  'work_order': 'projectNumber',
  // UMLER system abbreviations
  'proj_no': 'projectNumber',
  'proj_nbr': 'projectNumber',
  'proj_num': 'projectNumber',
  'wo_no': 'projectNumber',
  'wo_nbr': 'projectNumber',
  'wo_num': 'projectNumber',
  'job_no': 'projectNumber',
  'job_nbr': 'projectNumber',
  'latest_j': 'projectNumber',
  'initial_f': 'projectNumber',

  // projectedCost synonyms
  'projectedcost': 'projectedCost',
  'projected_cost': 'projectedCost',
  'projected cost': 'projectedCost',
  'cost': 'projectedCost',
  'estimatedcost': 'projectedCost',
  'estimated_cost': 'projectedCost',
  'estimated cost': 'projectedCost',
  'price': 'projectedCost',
  // UMLER system abbreviations
  'car_prc': 'projectedCost',
  'car_price': 'projectedCost',
  'estimat': 'projectedCost',
  'estimate': 'projectedCost',
  'est_cost': 'projectedCost',
  'est_amt': 'projectedCost',
  'repair_cost': 'projectedCost',
  'rep_cost': 'projectedCost',
  'total_cost': 'projectedCost',
  'tot_cost': 'projectedCost',
  'econom': 'projectedCost',
  'perfor': 'projectedCost',

  // daysInShop synonyms
  'daysinshop': 'daysInShop',
  'days_in_shop': 'daysInShop',
  'days in shop': 'daysInShop',
  'shopdays': 'daysInShop',
  'shop_days': 'daysInShop',
  'shop days': 'daysInShop',
  'duration': 'daysInShop',
  // UMLER system abbreviations
  'days_ir': 'daysInShop',
  'days_in_repair': 'daysInShop',
  'repair_days': 'daysInShop',
  'rep_days': 'daysInShop',
  'max_d': 'daysInShop',
  'max_days': 'daysInShop',
  'turn_days': 'daysInShop',
  'turn_time': 'daysInShop',
  'cycle_days': 'daysInShop',
  'dwel_days': 'daysInShop',
  'dwell_time': 'daysInShop',

  // shopEntryDate synonyms
  'shopentrydate': 'shopEntryDate',
  'shop_entry_date': 'shopEntryDate',
  'shop entry date': 'shopEntryDate',
  'entrydate': 'shopEntryDate',
  'entry_date': 'shopEntryDate',
  'entry date': 'shopEntryDate',
  // UMLER system abbreviations
  'arrival_ship_d': 'shopEntryDate',
  'arrival_date': 'shopEntryDate',
  'arr_date': 'shopEntryDate',
  'arr_dt': 'shopEntryDate',
  'in_date': 'shopEntryDate',
  'in_dt': 'shopEntryDate',
  'shop_in_dt': 'shopEntryDate',
  'receive_dt': 'shopEntryDate',
  'rcv_date': 'shopEntryDate',

  // lastServiceDate synonyms
  'lastservicedate': 'lastServiceDate',
  'last_service_date': 'lastServiceDate',
  'last service date': 'lastServiceDate',
  'lastservice': 'lastServiceDate',
  'last_service': 'lastServiceDate',
  'last service': 'lastServiceDate',
  // UMLER system abbreviations
  'last_svc_dt': 'lastServiceDate',
  'last_rep_dt': 'lastServiceDate',
  'prev_svc_dt': 'lastServiceDate',
  'prior_svc_dt': 'lastServiceDate',
  'compl_date': 'lastServiceDate',
  'complete_dt': 'lastServiceDate',
  'out_date': 'lastServiceDate',
  'release_dt': 'lastServiceDate',

  // nextServiceDue synonyms
  'nextservicedue': 'nextServiceDue',
  'next_service_due': 'nextServiceDue',
  'next service due': 'nextServiceDue',
  'nextservice': 'nextServiceDue',
  'next_service': 'nextServiceDue',
  'next service': 'nextServiceDue',
  'due date': 'nextServiceDue',
  'duedate': 'nextServiceDue',
  // UMLER system abbreviations
  'next_svc_dt': 'nextServiceDue',
  'due_dt': 'nextServiceDue',
  'due_date': 'nextServiceDue',
  'sched_dt': 'nextServiceDue',
  'sched_date': 'nextServiceDue',
  'exp_date': 'nextServiceDue',
  'expire_dt': 'nextServiceDue',
  'cert_exp_dt': 'nextServiceDue',

  // assignedShop synonyms (for shop name/code)
  'shop_n': 'assignedShopCode',
  'shop_nm': 'assignedShopCode',
  'shop_name': 'assignedShopCode',
  'shopname': 'assignedShopCode',
  'shop name': 'assignedShopCode',
  'shop_cd': 'assignedShopCode',
  'shop_code': 'assignedShopCode',
  'shopcode': 'assignedShopCode',
  'shop code': 'assignedShopCode',
  'repair_shop': 'assignedShopCode',
  'assigned_shop': 'assignedShopCode',
  'facility': 'assignedShopCode',
  'facility_nm': 'assignedShopCode',
  'fac_nm': 'assignedShopCode',

  // onRent synonyms (maps to notes for now)
  'on_ren': 'notes',
  'on_rent': 'notes',
  'rent_status': 'notes',
  'lease_status': 'notes',

  // notes synonyms
  'notes': 'notes',
  'note': 'notes',
  'comments': 'notes',
  'comment': 'notes',
  'remarks': 'notes',
  'remark': 'notes',
  'description': 'notes',
  // UMLER system abbreviations
  'note_txt': 'notes',
  'comment_txt': 'notes',
  'rmk_txt': 'notes',
};

// Required fields that must be present (or mappable) for import
export const REQUIRED_FIELDS = ['railcarNumber'];

// All valid system fields for car import
export const VALID_SYSTEM_FIELDS = [
  'railcarNumber',
  'carType',
  'isTankCar',
  'commodity',
  'customer',
  'projectNumber',
  'reasonShopped',
  'status',
  'currentLocation',
  'homeRegion',
  'originRegion',
  'projectedCost',
  'daysInShop',
  'shopEntryDate',
  'lastServiceDate',
  'nextServiceDue',
  'assignedShopCode',
  'notes',
];

// ============================================================================
// STATUS NORMALIZATION
// ============================================================================

/**
 * Status variations mapping to normalized values.
 * Handles various formats like 'in service', 'In-Service', 'IN SERVICE', etc.
 */
const STATUS_VARIATIONS: Record<string, string> = {
  // available variations
  'available': 'available',
  'avail': 'available',
  'free': 'available',
  'ready': 'available',

  // in_service variations
  'in_service': 'in_service',
  'inservice': 'in_service',
  'in service': 'in_service',
  'in-service': 'in_service',
  'active': 'in_service',
  'operating': 'in_service',

  // in_shop variations
  'in_shop': 'in_shop',
  'inshop': 'in_shop',
  'in shop': 'in_shop',
  'in-shop': 'in_shop',
  'shop': 'in_shop',
  'repair': 'in_shop',
  'maintenance': 'in_shop',
  'servicing': 'in_shop',

  // scheduled variations
  'scheduled': 'scheduled',
  'sched': 'scheduled',
  'planned': 'scheduled',
  'pending': 'scheduled',
  'queued': 'scheduled',

  // retired variations
  'retired': 'retired',
  'ret': 'retired',
  'decommissioned': 'retired',
  'out of service': 'retired',
  'outofservice': 'retired',
  'out-of-service': 'retired',
  'inactive': 'retired',
  'scrapped': 'retired',
};

// Valid normalized status values
export const VALID_STATUSES = ['available', 'in_service', 'in_shop', 'scheduled', 'retired'];

/**
 * Normalizes a status value to one of the valid system statuses.
 *
 * @param status - The raw status value from import
 * @returns Object with normalized status and whether it was successful
 */
export function normalizeStatus(status: string | undefined | null): {
  normalized: string;
  isValid: boolean;
  originalValue: string | null;
} {
  if (!status) {
    return { normalized: 'available', isValid: true, originalValue: null };
  }

  const original = String(status).trim();
  const lowercased = original.toLowerCase().replace(/[-_\s]+/g, ' ').trim();

  // Direct match in variations
  const normalized = STATUS_VARIATIONS[lowercased] || STATUS_VARIATIONS[lowercased.replace(/ /g, '_')];

  if (normalized) {
    return { normalized, isValid: true, originalValue: original };
  }

  // Check if it's already a valid status (case-insensitive)
  const directMatch = VALID_STATUSES.find(s => s.toLowerCase() === lowercased.replace(/ /g, '_'));
  if (directMatch) {
    return { normalized: directMatch, isValid: true, originalValue: original };
  }

  return { normalized: original, isValid: false, originalValue: original };
}

// ============================================================================
// BOOLEAN CONVERSION
// ============================================================================

/**
 * Values that map to TRUE for boolean fields
 */
const TRUTHY_VALUES = new Set([
  'true', 'yes', 'y', '1', 'on', 'enabled', 'active', 'x', '✓', '✔', 'tank',
]);

/**
 * Values that map to FALSE for boolean fields
 */
const FALSY_VALUES = new Set([
  'false', 'no', 'n', '0', 'off', 'disabled', 'inactive', '', 'null', 'undefined',
]);

/**
 * Converts various input formats to boolean.
 *
 * @param value - The raw value to convert
 * @returns Object with the boolean result and whether conversion was successful
 */
export function convertToBoolean(value: unknown): {
  value: boolean;
  isValid: boolean;
  originalValue: unknown;
} {
  if (typeof value === 'boolean') {
    return { value, isValid: true, originalValue: value };
  }

  if (value === null || value === undefined) {
    return { value: false, isValid: true, originalValue: value };
  }

  if (typeof value === 'number') {
    return { value: value !== 0, isValid: true, originalValue: value };
  }

  const strValue = String(value).toLowerCase().trim();

  if (TRUTHY_VALUES.has(strValue)) {
    return { value: true, isValid: true, originalValue: value };
  }

  if (FALSY_VALUES.has(strValue)) {
    return { value: false, isValid: true, originalValue: value };
  }

  // Check if it's a string that contains 'tank' (for carType inference)
  if (strValue.includes('tank')) {
    return { value: true, isValid: true, originalValue: value };
  }

  // Unknown value - default to false but mark as ambiguous
  return { value: false, isValid: false, originalValue: value };
}

// ============================================================================
// TYPE CONVERSION
// ============================================================================

/**
 * Safely converts a value to a float.
 */
export function convertToFloat(value: unknown, defaultValue: number = 0): number {
  if (typeof value === 'number' && !isNaN(value)) {
    return value;
  }
  if (typeof value === 'string') {
    // Remove common currency symbols and formatting
    const cleaned = value.replace(/[$,€£¥]/g, '').trim();
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  return defaultValue;
}

/**
 * Safely converts a value to an integer.
 */
export function convertToInt(value: unknown, defaultValue: number = 0): number {
  if (typeof value === 'number' && !isNaN(value)) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[,]/g, '').trim();
    const parsed = parseInt(cleaned, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  return defaultValue;
}

/**
 * Safely converts a value to a Date or null.
 */
export function convertToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
  return null;
}

// ============================================================================
// HEADER MAPPING UTILITIES
// ============================================================================

/**
 * Normalizes a header name for lookup in the synonym dictionary.
 * Returns multiple variations to try for flexible matching.
 */
export function normalizeHeaderName(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');    // Collapse multiple spaces but preserve underscores
}

/**
 * Generate all possible variations of a header for lookup
 */
function getHeaderVariations(header: string): string[] {
  const base = header.toLowerCase().trim();
  const variations = new Set<string>();

  // Original lowercase
  variations.add(base);

  // With underscores replaced by spaces
  variations.add(base.replace(/[_\-]/g, ' ').replace(/\s+/g, ' ').trim());

  // With spaces replaced by underscores
  variations.add(base.replace(/[\s\-]/g, '_').replace(/_+/g, '_'));

  // No spaces or underscores (concatenated)
  variations.add(base.replace(/[\s_\-]/g, ''));

  // With hyphens replaced by underscores
  variations.add(base.replace(/-/g, '_'));

  // With hyphens replaced by spaces
  variations.add(base.replace(/-/g, ' '));

  return Array.from(variations);
}

/**
 * Maps a user-provided header to a system field name.
 *
 * @param header - The raw header from the import file
 * @returns The mapped system field name or null if not recognized
 */
export function mapHeaderToField(header: string): string | null {
  // Try all variations of the header
  const variations = getHeaderVariations(header);

  for (const variant of variations) {
    if (HEADER_SYNONYMS[variant]) {
      return HEADER_SYNONYMS[variant];
    }
  }

  // Check if it's already a valid system field (case-insensitive)
  const normalizedNoSpaces = header.toLowerCase().replace(/[\s_\-]/g, '');
  const matchedField = VALID_SYSTEM_FIELDS.find(
    f => f.toLowerCase() === normalizedNoSpaces
  );
  if (matchedField) {
    return matchedField;
  }

  return null;
}

/**
 * Analyzes import headers and returns mapping results.
 */
export interface HeaderMappingResult {
  status: 'success' | 'mapping_required';
  mappings: Record<string, string>;  // original header -> system field
  unmappedHeaders: string[];          // headers that couldn't be mapped
  missingRequiredFields: string[];    // required fields not found in mappings
  detectedHeaders: string[];          // all original headers
  suggestions: Record<string, string[]>;  // unmapped header -> possible field suggestions
}

/**
 * Analyzes the provided headers and determines if mapping is complete.
 */
export function analyzeHeaders(headers: string[]): HeaderMappingResult {
  const mappings: Record<string, string> = {};
  const unmappedHeaders: string[] = [];
  const mappedFields = new Set<string>();
  const suggestions: Record<string, string[]> = {};

  for (const header of headers) {
    const mappedField = mapHeaderToField(header);
    if (mappedField) {
      mappings[header] = mappedField;
      mappedFields.add(mappedField);
    } else {
      unmappedHeaders.push(header);
      // Generate suggestions for unmapped headers
      suggestions[header] = generateFieldSuggestions(header);
    }
  }

  // Check for missing required fields
  const missingRequiredFields = REQUIRED_FIELDS.filter(f => !mappedFields.has(f));

  const status: 'success' | 'mapping_required' =
    missingRequiredFields.length > 0 || unmappedHeaders.length > 0
      ? 'mapping_required'
      : 'success';

  return {
    status,
    mappings,
    unmappedHeaders,
    missingRequiredFields,
    detectedHeaders: headers,
    suggestions,
  };
}

/**
 * Generates possible field suggestions for an unmapped header using fuzzy matching.
 */
function generateFieldSuggestions(header: string): string[] {
  const normalized = normalizeHeaderName(header);
  const suggestions: string[] = [];

  // Check for partial matches in system fields
  for (const field of VALID_SYSTEM_FIELDS) {
    const fieldLower = field.toLowerCase();
    if (fieldLower.includes(normalized) || normalized.includes(fieldLower)) {
      suggestions.push(field);
    }
  }

  // If no suggestions, return top 3 most common fields as hints
  if (suggestions.length === 0) {
    return ['railcarNumber', 'customer', 'status'];
  }

  return suggestions.slice(0, 3);
}

// ============================================================================
// DATA TRANSFORMATION PIPELINE
// ============================================================================

export interface TransformationResult {
  success: boolean;
  data: Record<string, unknown>;
  warnings: string[];
  errors: string[];
}

/**
 * Transforms a raw car record with normalized field values.
 */
export function transformCarRecord(
  record: Record<string, unknown>,
  fieldMappings?: Record<string, string>
): TransformationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const data: Record<string, unknown> = {};

  // Apply field mappings if provided
  const normalizedRecord: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    const mappedField = fieldMappings?.[key] || mapHeaderToField(key) || key;
    normalizedRecord[mappedField] = value;
  }

  // Transform each field
  // railcarNumber (required) - also support legacy vehicleNumber
  data.railcarNumber = normalizedRecord.railcarNumber || normalizedRecord.vehicleNumber || '';
  // Keep vehicleNumber for backward compatibility
  data.vehicleNumber = data.railcarNumber;
  if (!data.railcarNumber) {
    errors.push('Missing required field: railcarNumber (or railcar_number)');
  }

  // carType
  data.carType = String(normalizedRecord.carType || '').trim();

  // isTankCar - with smart boolean conversion
  const tankCarResult = convertToBoolean(normalizedRecord.isTankCar);
  if (!tankCarResult.isValid && normalizedRecord.isTankCar !== undefined) {
    warnings.push(`Ambiguous isTankCar value: "${normalizedRecord.isTankCar}", defaulting to false`);
  }
  // Also check if carType contains 'tank'
  if (!tankCarResult.value && data.carType && String(data.carType).toLowerCase().includes('tank')) {
    data.isTankCar = true;
  } else {
    data.isTankCar = tankCarResult.value;
  }

  // status - with normalization
  const statusResult = normalizeStatus(normalizedRecord.status as string);
  if (!statusResult.isValid && normalizedRecord.status) {
    errors.push(`Invalid status: "${normalizedRecord.status}". Valid values: ${VALID_STATUSES.join(', ')}`);
  }
  data.status = statusResult.normalized;

  // String fields with defaults
  data.commodity = String(normalizedRecord.commodity || '').trim();
  data.customer = String(normalizedRecord.customer || '').trim();
  data.projectNumber = String(normalizedRecord.projectNumber || '').trim();
  data.reasonShopped = String(normalizedRecord.reasonShopped || '').trim();
  data.currentLocation = String(normalizedRecord.currentLocation || '').trim();
  data.homeRegion = String(normalizedRecord.homeRegion || '').trim();
  data.originRegion = String(normalizedRecord.originRegion || '').trim();
  data.notes = String(normalizedRecord.notes || '').trim();
  // Shop assignment (optional - for reference during import)
  data.assignedShopCode = String(normalizedRecord.assignedShopCode || '').trim();

  // Numeric fields
  data.projectedCost = convertToFloat(normalizedRecord.projectedCost);
  data.daysInShop = convertToInt(normalizedRecord.daysInShop);

  // Date fields
  data.shopEntryDate = convertToDate(normalizedRecord.shopEntryDate);
  data.lastServiceDate = convertToDate(normalizedRecord.lastServiceDate);
  data.nextServiceDue = convertToDate(normalizedRecord.nextServiceDue);

  return {
    success: errors.length === 0,
    data,
    warnings,
    errors,
  };
}
