/**
 * Data Mapping Intelligence Utilities for Car Import
 *
 * This module provides flexible data transformation and mapping capabilities
 * to handle various input formats and header naming conventions.
 */

import {
  CSV_SHOP_COLUMN_MAPPING,
  resolveShopCodeFromCSVColumn,
  getNetworkForShopCode,
  getTeamAssignment,
} from '../constants/shopNetworks';

// Re-export shop network utilities for convenience
export { CSV_SHOP_COLUMN_MAPPING, resolveShopCodeFromCSVColumn, getNetworkForShopCode, getTeamAssignment };

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

  // reasonsShopped synonyms (Note: schema uses plural 'reasonsShopped')
  'reasonshopped': 'reasonsShopped',
  'reason_shopped': 'reasonsShopped',
  'reason shopped': 'reasonsShopped',
  'reason': 'reasonsShopped',
  'shopreason': 'reasonsShopped',
  'shop_reason': 'reasonsShopped',
  'shop reason': 'reasonsShopped',
  'service reason': 'reasonsShopped',
  'servicereason': 'reasonsShopped',
  // UMLER system abbreviations
  'shoppi': 'reasonsShopped',
  'shop_typ': 'reasonsShopped',
  'shop_type': 'reasonsShopped',
  'shopping': 'reasonsShopped',
  'shopping_type': 'reasonsShopped',
  'repair_type': 'reasonsShopped',
  'repair_typ': 'reasonsShopped',
  'rep_type': 'reasonsShopped',
  'service_type': 'reasonsShopped',
  'svc_type': 'reasonsShopped',
  'maint_type': 'reasonsShopped',
  'work_type': 'reasonsShopped',
  'job_type': 'reasonsShopped',

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

  // ==========================================================================
  // QUAL PLANNER MASTER CSV FIELD MAPPINGS
  // ==========================================================================

  // Lessee Name → customer
  'lessee name': 'customer',
  'lesseename': 'customer',

  // Car Mark → carMark (for sister car sorting)
  'car mark': 'carMark',
  'carmark': 'carMark',

  // Mark and Number (components of railcarNumber)
  'mark': 'carMark',
  'number': 'carNumber',
  'mark2': 'carMark2', // Ignored but mapped

  // FMS Lessee Number
  'fms lessee number': 'fmsLesseeNumber',
  'fmslesseenumber': 'fmsLesseeNumber',
  'fms_lessee_number': 'fmsLesseeNumber',

  // Contract fields
  'contract': 'contractNumber',
  'contractnumber': 'contractNumber',
  'contract_number': 'contractNumber',
  'contract number': 'contractNumber',
  'contract#': 'contractNumber',
  'contract #': 'contractNumber',
  'contract_no': 'contractNumber',

  'contract expiration': 'contractExpiration',
  'contractexpiration': 'contractExpiration',
  'contract_expiration': 'contractExpiration',
  'contexp': 'contractExpiration',
  'cont_exp': 'contractExpiration',
  'cont exp': 'contractExpiration',
  'lease_end': 'contractExpiration',
  'lease_expiry': 'contractExpiration',

  // Primary Commodity
  'primary commodity': 'commodity',
  'primarycommodity': 'commodity',
  'primary_commodity': 'commodity',

  // Contact fields (reference only - display in car info drawer)
  'csr': 'csr',
  'csl': 'csl',
  'commericial': 'commercial', // Note: CSV has typo "Commericial"
  'commercial': 'commercial',

  // Region fields
  'past region': 'pastRegion',
  'pastregion': 'pastRegion',
  'past_region': 'pastRegion',
  '2026 region': 'region2026',
  '2026region': 'region2026',

  // Jacketed/Lined
  'jacketed': 'isJacketed',
  'isjacketed': 'isJacketed',
  'is_jacketed': 'isJacketed',
  'jacketed?': 'isJacketed',

  'lined': 'isLined',
  'islined': 'isLined',
  'is_lined': 'isLined',
  'lined?': 'isLined',

  'lining type': 'liningType',
  'liningtype': 'liningType',
  'lining_type': 'liningType',

  // Car Age and Build Year
  'car age': 'carAge',
  'carage': 'carAge',
  'car_age': 'carAge',
  'buildyear': 'buildYear',
  'build_year': 'buildYear',
  'build year': 'buildYear',
  'year': 'buildYear',
  'year_built': 'buildYear',

  // Car Type
  'car type level 2': 'carType',
  'cartypelevel2': 'carType',
  'car_type_level_2': 'carType',

  // ==========================================================================
  // QUALIFICATION DATE FIELDS (stored as years, e.g., 2025, 2030)
  // These drive shopping urgency - car must be shopped if any are due/overdue
  // ==========================================================================
  'min (no lining)': 'minNoLining',
  'min(nolining)': 'minNoLining',
  'min_no_lining': 'minNoLining',
  'minnolining': 'minNoLining',

  'min w lining': 'minWLining',
  'minwlining': 'minWLining',
  'min_w_lining': 'minWLining',
  'min with lining': 'minWLining',

  'interior lining': 'interiorLining',
  'interiorlining': 'interiorLining',
  'interior_lining': 'interiorLining',

  'rule 88b': 'rule88B',
  'rule88b': 'rule88B',
  'rule_88b': 'rule88B',
  'rule 88b ': 'rule88B', // Note: CSV may have trailing space

  'safety relief': 'safetyRelief',
  'safetyrelief': 'safetyRelief',
  'safety_relief': 'safetyRelief',

  'service equipment': 'serviceEquipment',
  'serviceequipment': 'serviceEquipment',
  'service_equipment': 'serviceEquipment',
  'service equipment ': 'serviceEquipment', // Note: CSV may have trailing space

  'stub sill': 'stubSill',
  'stubsill': 'stubSill',
  'stub_sill': 'stubSill',

  'tank thickness': 'tankThickness',
  'tankthickness': 'tankThickness',
  'tank_thickness': 'tankThickness',

  'tank qualification': 'tankQualification',
  'tankqualification': 'tankQualification',
  'tank_qualification': 'tankQualification',

  // ==========================================================================
  // PORTFOLIO AND STATUS FIELDS
  // ==========================================================================
  'portfolio': 'portfolio',
  'car': 'portfolio', // "Car" column in CSV indicates portfolio status

  // Full/Partial Qual → qualificationType
  'full/partial qual': 'qualificationType',
  'fullpartialqual': 'qualificationType',
  'full_partial_qual': 'qualificationType',
  'qualificationtype': 'qualificationType',
  'qualification_type': 'qualificationType',
  'qual type': 'qualificationType',

  // Perform Tank Qual (Yes = needs plan or be complete)
  'perform tank qual': 'performedTankQual',
  'performtankqual': 'performedTankQual',
  'perform_tank_qual': 'performedTankQual',

  // Scheduled (Planned Shopping, etc.)
  'scheduled': 'performScheduled',

  // Adjusted Status - IGNORED per user instruction
  'adjusted status': '_ignoredAdjustedStatus',
  'adjustedstatus': '_ignoredAdjustedStatus',

  // Plan Status (Committed, Not Confirmed, Not Committed, or year like 2026)
  'plan status': 'planStatus',
  'planstatus': 'planStatus',
  'plan_status': 'planStatus',

  // Cars & Year (compound field for reference)
  'cars & year': 'carsAndYear',
  'carsandyear': 'carsAndYear',
  'cars_and_year': 'carsAndYear',
};

// Required fields that must be present (or mappable) for import
export const REQUIRED_FIELDS = ['railcarNumber'];

// All valid system fields for car import
export const VALID_SYSTEM_FIELDS = [
  // Core car identifiers
  'railcarNumber',
  'carMark',
  'carNumber',
  'carType',
  'isTankCar',
  'commodity',
  'customer',
  'fmsLesseeNumber',

  // Contract fields
  'contractNumber',
  'contractExpiration',

  // Status and planning
  'status',
  'shoppingStatus',
  'planStatus',
  'portfolio',
  'performedTankQual',
  'performScheduled',
  'qualificationType',
  'reasonsShopped',

  // Location and region
  'currentLocation',
  'homeRegion',
  'originRegion',
  'pastRegion',
  'region2026',

  // Physical characteristics
  'isJacketed',
  'isLined',
  'liningType',
  'buildYear',

  // Reference contacts (display in car info drawer)
  'csr',
  'csl',
  'commercial',

  // Cost and timing
  'projectedCost',
  'daysInShop',
  'shopEntryDate',
  'arrivalDate',
  'lastServiceDate',
  'nextServiceDue',
  'projectedCompletionMonth',
  'assignedShopCode',

  // Qualification date fields (stored as years or dates)
  'minNoLining',
  'minWLining',
  'interiorLining',
  'rule88B',
  'safetyRelief',
  'serviceEquipment',
  'stubSill',
  'tankThickness',
  'tankQualification',

  // Other
  'notes',
  'projectNumber',

  // Ignored/reference fields (mapped but not stored in Car)
  'carsAndYear',
  '_ignoredAdjustedStatus',
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

/**
 * Converts a year (e.g., 2025, "2025") to a Date at end of year (December 31st).
 * This is used for qualification date fields that store years.
 */
export function convertYearToDate(value: unknown): Date | null {
  if (!value) return null;

  let year: number;

  if (typeof value === 'number') {
    year = value;
  } else if (typeof value === 'string') {
    // Handle year strings like "2025" or full dates
    const trimmed = value.trim();
    if (/^\d{4}$/.test(trimmed)) {
      year = parseInt(trimmed, 10);
    } else {
      // Try parsing as a full date
      const date = new Date(trimmed);
      if (!isNaN(date.getTime())) {
        return date;
      }
      return null;
    }
  } else {
    return null;
  }

  // Validate year range (reasonable range for railcar qualification)
  if (year < 2000 || year > 2100) {
    return null;
  }

  // Return December 31st of that year (end of year when qualification is due)
  return new Date(year, 11, 31); // Month is 0-indexed, so 11 = December
}

/**
 * Extracts the year from a Date or year value.
 */
export function extractYear(value: unknown): number | null {
  if (!value) return null;

  if (typeof value === 'number') {
    // If it's a 4-digit year
    if (value >= 2000 && value <= 2100) {
      return value;
    }
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}$/.test(trimmed)) {
      return parseInt(trimmed, 10);
    }
    // Try parsing as date and extract year
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
      return date.getFullYear();
    }
  }

  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.getFullYear();
  }

  return null;
}

// ============================================================================
// SHOPPING STATUS CALCULATION
// ============================================================================

/**
 * Shopping status values based on qualification dates.
 * - URGENT: Past due or due this year, no plan
 * - MUST_SHOP: Due this year, needs planning
 * - UPCOMING: Due next year
 * - COMPLIANT: All qualifications current
 * - IN_SHOP: Currently at shop (Arrived, Enroute)
 * - PLANNED: Has a plan in place
 * - UNKNOWN: Cannot determine
 */
export const SHOPPING_STATUS_VALUES = [
  'Urgent',
  'Must Shop',
  'Upcoming',
  'Compliant',
  'In Shop',
  'Planned',
  'Unknown',
] as const;

export type ShoppingStatus = typeof SHOPPING_STATUS_VALUES[number];

/**
 * Qualification date field names for iteration.
 */
export const QUALIFICATION_DATE_FIELDS = [
  'minNoLining',
  'minWLining',
  'interiorLining',
  'rule88B',
  'safetyRelief',
  'serviceEquipment',
  'stubSill',
  'tankThickness',
  'tankQualification',
] as const;

/**
 * Calculates the shopping status based on qualification dates and current status.
 *
 * Rules:
 * - If any qualification date is past due (year < current year): URGENT (unless planned/complete)
 * - If any qualification date is due this year: MUST_SHOP (unless planned/complete)
 * - If any qualification date is due next year: UPCOMING
 * - If status is Arrived/Enroute/In Shop: IN_SHOP
 * - If planStatus indicates committed: PLANNED
 * - If all dates are future: COMPLIANT
 */
export function calculateShoppingStatus(
  qualificationDates: Record<string, unknown>,
  currentStatus: string,
  planStatus: string,
  hasScheduledShop: boolean = false
): { status: ShoppingStatus; reason: string; earliestDue: number | null } {
  const currentYear = new Date().getFullYear();
  let earliestDueYear: number | null = null;
  let overdueField: string | null = null;
  let dueThisYearField: string | null = null;
  let dueNextYearField: string | null = null;

  // Check current status first
  const statusLower = (currentStatus || '').toLowerCase().trim();
  if (['arrived', 'enroute', 'in shop', 'in_shop', 'inshop'].includes(statusLower)) {
    return { status: 'In Shop', reason: `Current status: ${currentStatus}`, earliestDue: null };
  }
  if (statusLower === 'complete') {
    return { status: 'Compliant', reason: 'Work complete', earliestDue: null };
  }

  // Check plan status
  const planLower = (planStatus || '').toLowerCase().trim();
  if (planLower === 'committed' || hasScheduledShop) {
    return { status: 'Planned', reason: 'Has committed plan', earliestDue: null };
  }

  // Iterate through qualification dates to find earliest due
  for (const field of QUALIFICATION_DATE_FIELDS) {
    const year = extractYear(qualificationDates[field]);
    if (year === null) continue;

    if (earliestDueYear === null || year < earliestDueYear) {
      earliestDueYear = year;
    }

    if (year < currentYear) {
      if (!overdueField) overdueField = field;
    } else if (year === currentYear) {
      if (!dueThisYearField) dueThisYearField = field;
    } else if (year === currentYear + 1) {
      if (!dueNextYearField) dueNextYearField = field;
    }
  }

  // Determine status based on earliest due date
  if (overdueField) {
    return {
      status: 'Urgent',
      reason: `${formatFieldName(overdueField)} overdue`,
      earliestDue: earliestDueYear,
    };
  }

  if (dueThisYearField) {
    return {
      status: 'Must Shop',
      reason: `${formatFieldName(dueThisYearField)} due ${currentYear}`,
      earliestDue: earliestDueYear,
    };
  }

  if (dueNextYearField) {
    return {
      status: 'Upcoming',
      reason: `${formatFieldName(dueNextYearField)} due ${currentYear + 1}`,
      earliestDue: earliestDueYear,
    };
  }

  if (earliestDueYear !== null) {
    return {
      status: 'Compliant',
      reason: `Next due ${earliestDueYear}`,
      earliestDue: earliestDueYear,
    };
  }

  return { status: 'Unknown', reason: 'No qualification dates', earliestDue: null };
}

/**
 * Formats a camelCase field name to human-readable format.
 */
function formatFieldName(field: string): string {
  // Convert camelCase to Title Case with spaces
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

// ============================================================================
// SHOP COLUMN DETECTION (Columns AN-DH in Qual Planner Master CSV)
// ============================================================================

/**
 * Known shop name patterns from the Qual Planner Master CSV.
 * These are the column headers that represent shop assignments with dates (Columns AN-DH).
 */
export const KNOWN_SHOP_PATTERNS = [
  /^AITX\s/i,
  /Rail(car)?\s*Services/i,
  /Railcar\s*Repair/i,
  /Mobile\s*(Unit|Operations|Headquarters)/i,
  /Procor/i,
  /Eagle\s*Railcar/i,
  /Cathcart/i,
  /Greenbrier/i,
  /Trinity/i,
  /Transco/i,
  /Curry\s*Rail/i,
  /Rescar/i,
  /Blastech/i,
  /CAD\s*Railway/i,
  /CALTRAX/i,
  /CANDO/i,
  /Frit\s*Car/i,
  /Iron\s*Horse/i,
  /KRS\s*Katahdin/i,
  /Midwest\s*Railcar/i,
  /PSC\s*Repair/i,
  /TLC\s*Rail/i,
  /TMC\s*Engineering/i,
  /TNT\s*Repair/i,
  /Transitech/i,
  /VLS\s*Recovery/i,
  /Red\s*River\s*Coatings/i,
  /Texana\s*Midway/i,
  /Apache\s*Railway/i,
  /H\.?C\.?\s*Chandler/i,
];

/**
 * Checks if a header name appears to be a shop column.
 */
export function isShopColumn(header: string): boolean {
  // Check against known shop patterns
  for (const pattern of KNOWN_SHOP_PATTERNS) {
    if (pattern.test(header)) {
      return true;
    }
  }

  // Check for city/state pattern in parentheses (common in shop names)
  if (/\([A-Za-z\s]+\)$/.test(header)) {
    // Has location in parentheses, likely a shop
    return true;
  }

  return false;
}

/**
 * Extracts shop assignments from a record's shop columns (AN-DH).
 * Returns array of shop assignment objects with resolved shop codes and network info.
 */
export interface ShopAssignment {
  shopName: string;
  shopLocation: string;
  shopCode: string | null;      // Resolved shop code from CSV_SHOP_COLUMN_MAPPING
  networkId: string | null;     // Network identifier (e.g., 'aitx', 'trinity')
  networkName: string | null;   // Network display name
  isAitxInternal: boolean;      // True if AITX owned shop
  scheduledDate: Date;
  scheduledMonth: string;       // YYYY-MM format
  csvColumnHeader: string;      // Original CSV column header for reference
}

export function extractShopAssignments(
  record: Record<string, unknown>,
  headers: string[]
): ShopAssignment[] {
  const assignments: ShopAssignment[] = [];

  for (const header of headers) {
    if (!isShopColumn(header)) continue;

    const value = record[header];
    if (!value || String(value).trim() === '') continue;

    // Try to parse the date
    const dateStr = String(value).trim();
    const date = parseShopDate(dateStr);

    if (date) {
      // Extract location from parentheses if present
      const locationMatch = header.match(/\(([^)]+)\)\s*$/);
      const location = locationMatch ? locationMatch[1].trim() : '';
      const shopName = header.replace(/\s*\([^)]+\)\s*$/, '').trim();

      // Resolve shop code from CSV column header
      const shopCode = resolveShopCodeFromCSVColumn(header);
      const networkInfo = shopCode ? getNetworkForShopCode(shopCode) : null;

      assignments.push({
        shopName: shopName,
        shopLocation: location,
        shopCode: shopCode,
        networkId: networkInfo?.networkId || null,
        networkName: networkInfo?.networkName || null,
        isAitxInternal: networkInfo?.isAitxInternal ?? false,
        scheduledDate: date,
        scheduledMonth: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        csvColumnHeader: header,
      });
    }
  }

  return assignments;
}

/**
 * Parses a date string from shop column (handles M/D/YYYY format).
 */
function parseShopDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  // Handle M/D/YYYY or MM/DD/YYYY format
  const mdyMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const [, month, day, year] = mdyMatch;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // Try standard date parsing
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date;
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
 * Extended transformation result with shop assignments.
 */
export interface ExtendedTransformationResult extends TransformationResult {
  shopAssignments: ShopAssignment[];
}

/**
 * Transforms a raw car record with normalized field values.
 * Handles all Qual Planner Master CSV fields including:
 * - Car identification (Mark + Number → railcarNumber)
 * - Qualification dates (stored as years)
 * - Reference fields (CSR, CSL, Commercial)
 * - Shop assignments from shop columns
 */
export function transformCarRecord(
  record: Record<string, unknown>,
  fieldMappings?: Record<string, string>,
  headers?: string[]
): ExtendedTransformationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const data: Record<string, unknown> = {};

  // Apply field mappings if provided
  const normalizedRecord: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    const mappedField = fieldMappings?.[key] || mapHeaderToField(key) || key;
    normalizedRecord[mappedField] = value;
  }

  // ==========================================================================
  // RAILCAR NUMBER - Construct from Mark + Number if not directly provided
  // ==========================================================================
  let railcarNumber = String(normalizedRecord.railcarNumber || '').trim();

  // If no direct railcarNumber, try to construct from carMark + carNumber
  if (!railcarNumber && normalizedRecord.carMark && normalizedRecord.carNumber) {
    railcarNumber = `${String(normalizedRecord.carMark).trim()}${String(normalizedRecord.carNumber).trim()}`;
  }

  data.railcarNumber = railcarNumber;
  data.vehicleNumber = railcarNumber; // Keep for backward compatibility

  if (!railcarNumber) {
    errors.push('Missing required field: railcarNumber (or Mark + Number)');
  }

  // Store Mark and Number separately for sister car sorting
  data.carMark = String(normalizedRecord.carMark || '').trim();
  data.carNumber = String(normalizedRecord.carNumber || '').trim();

  // ==========================================================================
  // CAR TYPE AND TANK CAR DETECTION
  // ==========================================================================
  data.carType = String(normalizedRecord.carType || '').trim();

  // isTankCar - smart detection from carType
  const carTypeLower = String(data.carType).toLowerCase();
  if (carTypeLower.includes('tank') || carTypeLower.includes('general service')) {
    data.isTankCar = true;
  } else {
    const tankCarResult = convertToBoolean(normalizedRecord.isTankCar);
    data.isTankCar = tankCarResult.value;
  }

  // ==========================================================================
  // STATUS FIELDS
  // ==========================================================================
  // Current Status - keep original value for Qual Planner statuses
  const rawStatus = String(normalizedRecord.status || '').trim();
  const qualPlannerStatuses = ['arrived', 'complete', 'to be routed', 'release', 'up marketed', 'enroute', 'reassigned', 'released'];
  if (qualPlannerStatuses.includes(rawStatus.toLowerCase())) {
    data.status = rawStatus; // Keep original Qual Planner status
  } else {
    const statusResult = normalizeStatus(rawStatus);
    data.status = statusResult.normalized;
    if (!statusResult.isValid && rawStatus) {
      warnings.push(`Non-standard status: "${rawStatus}"`);
    }
  }

  // Plan Status - critical for workflow
  data.planStatus = String(normalizedRecord.planStatus || '').trim();

  // ==========================================================================
  // CUSTOMER AND CONTRACT FIELDS
  // ==========================================================================
  data.customer = String(normalizedRecord.customer || '').trim();
  data.fmsLesseeNumber = String(normalizedRecord.fmsLesseeNumber || '').trim();
  data.contractNumber = String(normalizedRecord.contractNumber || '').trim();
  data.contractExpiration = convertToDate(normalizedRecord.contractExpiration);

  // ==========================================================================
  // COMMODITY
  // ==========================================================================
  data.commodity = String(normalizedRecord.commodity || '').trim();

  // ==========================================================================
  // REFERENCE CONTACT FIELDS (display in car info drawer)
  // ==========================================================================
  data.csr = String(normalizedRecord.csr || '').trim();
  data.csl = String(normalizedRecord.csl || '').trim();
  data.commercial = String(normalizedRecord.commercial || '').trim();

  // ==========================================================================
  // REGION FIELDS
  // ==========================================================================
  data.homeRegion = String(normalizedRecord.homeRegion || '').trim();
  data.originRegion = String(normalizedRecord.originRegion || '').trim();
  data.pastRegion = String(normalizedRecord.pastRegion || '').trim();
  data.region2026 = String(normalizedRecord.region2026 || '').trim();
  data.currentLocation = String(normalizedRecord.currentLocation || '').trim();

  // ==========================================================================
  // PHYSICAL CHARACTERISTICS
  // ==========================================================================
  // Jacketed - handle "Jacketed" string value
  const jacketedValue = String(normalizedRecord.isJacketed || '').toLowerCase().trim();
  data.isJacketed = jacketedValue === 'jacketed' || jacketedValue === 'yes' || jacketedValue === 'true' || jacketedValue === '1';

  // Lined - handle "Unlined" vs "Lined" string values
  const linedValue = String(normalizedRecord.isLined || '').toLowerCase().trim();
  data.isLined = linedValue === 'lined' || linedValue === 'yes' || linedValue === 'true' || linedValue === '1';
  // "Unlined" explicitly means not lined
  if (linedValue === 'unlined') {
    data.isLined = false;
  }

  data.liningType = String(normalizedRecord.liningType || '').trim();
  data.buildYear = convertToInt(normalizedRecord.buildYear) || null;

  // ==========================================================================
  // QUALIFICATION TYPE AND SHOPPING REASON
  // ==========================================================================
  // Full/Partial Qual - normalize to standard values
  const qualTypeRaw = String(normalizedRecord.qualificationType || '').toLowerCase().trim();
  if (qualTypeRaw.includes('full')) {
    data.qualificationType = 'Full Qual';
  } else if (qualTypeRaw.includes('partial')) {
    data.qualificationType = 'Partial Qual';
  } else {
    data.qualificationType = normalizedRecord.qualificationType || '';
  }

  data.reasonsShopped = String(normalizedRecord.reasonsShopped || '').trim();

  // Perform Tank Qual - "Yes" means needs plan or complete
  const performTankQual = String(normalizedRecord.performedTankQual || '').toLowerCase().trim();
  data.performedTankQual = performTankQual === 'yes' || performTankQual === 'true' || performTankQual === '1';

  // Scheduled field - indicates if car should have data points in system
  const scheduledValue = String(normalizedRecord.performScheduled || '').toLowerCase().trim();
  data.performScheduled = scheduledValue.includes('planned') || scheduledValue === 'yes' || scheduledValue === 'true';

  // ==========================================================================
  // PORTFOLIO (On Lease/Active)
  // ==========================================================================
  const portfolioValue = String(normalizedRecord.portfolio || '').toLowerCase().trim();
  data.portfolio = portfolioValue === 'on lease' || portfolioValue === 'active' || portfolioValue === 'yes' || portfolioValue === 'true';

  // ==========================================================================
  // QUALIFICATION DATE FIELDS (stored as years → converted to end-of-year dates)
  // ==========================================================================
  const qualDates: Record<string, unknown> = {};

  for (const field of QUALIFICATION_DATE_FIELDS) {
    const yearValue = normalizedRecord[field];
    if (yearValue) {
      const date = convertYearToDate(yearValue);
      data[field] = date;
      qualDates[field] = yearValue; // Keep original for status calculation
    } else {
      data[field] = null;
    }
  }

  // ==========================================================================
  // CALCULATE SHOPPING STATUS
  // ==========================================================================
  // Extract shop assignments first to check if car has scheduled shop
  const shopAssignments = headers ? extractShopAssignments(record, headers) : [];
  const hasScheduledShop = shopAssignments.length > 0;

  const shoppingStatusResult = calculateShoppingStatus(
    qualDates,
    data.status as string,
    data.planStatus as string,
    hasScheduledShop
  );
  data.shoppingStatus = shoppingStatusResult.status;

  // ==========================================================================
  // COST AND TIMING FIELDS
  // ==========================================================================
  data.projectedCost = convertToFloat(normalizedRecord.projectedCost);
  data.daysInShop = convertToInt(normalizedRecord.daysInShop);
  data.projectNumber = String(normalizedRecord.projectNumber || '').trim();

  // Date fields
  data.shopEntryDate = convertToDate(normalizedRecord.shopEntryDate);
  data.arrivalDate = convertToDate(normalizedRecord.arrivalDate);
  data.lastServiceDate = convertToDate(normalizedRecord.lastServiceDate);
  data.nextServiceDue = convertToDate(normalizedRecord.nextServiceDue);

  // ==========================================================================
  // OTHER FIELDS
  // ==========================================================================
  data.notes = String(normalizedRecord.notes || '').trim();
  data.assignedShopCode = String(normalizedRecord.assignedShopCode || '').trim();

  // If car has shop assignments, use the first one as the assigned shop
  if (shopAssignments.length > 0) {
    const firstAssignment = shopAssignments[0];
    // Format: Shop Name (Location)
    data.assignedShopCode = firstAssignment.shopLocation
      ? `${firstAssignment.shopName} (${firstAssignment.shopLocation})`
      : firstAssignment.shopName;
    data.projectedCompletionMonth = firstAssignment.scheduledMonth;
  }

  return {
    success: errors.length === 0,
    data,
    warnings,
    errors,
    shopAssignments,
  };
}
