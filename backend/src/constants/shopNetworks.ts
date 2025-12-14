/**
 * Shop Networks Configuration (Backend)
 *
 * Derived from Qual Planner Master CSV columns AN-DH (data tape shop columns)
 * This defines the hierarchical organization: Network → Child Location
 *
 * AITX-owned shops are internal, all others are 3rd party
 */

export interface ShopLocationDef {
  name: string;
  code: string;
  city: string;
  state: string;
  region: string;
  servingRailroad: string;
  tankQualified: boolean;
  monthlyCapacity: number;
  costIndex: number;
}

export interface ShopNetworkDef {
  id: string;
  name: string;
  code: string;
  isAitxInternal: boolean;
  annualTargetVolume: number;
  costIndex: number;
  notes: string;
  locations: ShopLocationDef[];
}

// CSV column name to shop code mapping (from Qual Planner Master columns AN-DH)
export const CSV_SHOP_COLUMN_MAPPING: Record<string, string> = {
  'AITX Fleet Services of Canada Inc. (Sarnia)': 'AITX-SARNIA',
  'AITX Railcar Services LLC (N Kansas City)': 'AITX-NKC',
  'AITX Mini/Mobile Unit 93 (Mounds)': 'AITX-MOUNDS',
  'AITX Mobile Headquarters (LaPorte)': 'AITX-LAPORTE',
  'AITX Mobile Operations (Houston)': 'AITX-HOUSTON',
  'AITX Railcar Services LLC (Brookhaven)': 'AITX-BROOKHAVEN',
  'AITX Railcar Services LLC (Bude)': 'AITX-BUDE',
  'AITX Railcar Services LLC (Longview)': 'AITX-LONGVIEW',
  'AITX Railcar Services LLC (Tennille)': 'AITX-TENNILLE',
  'AITX Repair-KCK MRU (Kansas City)': 'AITX-KCK',
  'AITX Repair-Milton, PA MRU': 'AITX-MILTON',
  'AITX Repair-Sweetwater, TX MRU ': 'AITX-SWEETWATER',
  'Apache Railway - Snowflake AZ (Snowflake)': 'APACHE-SNOWFLAKE',
  'Blastech Corp (BRANTFORD)': 'BLAST-BRANTFORD',
  'CAD Railway Services (Lachine, Montreal)': 'CAD-LACHINE',
  'CALTRAX, Inc. (Calgary)': 'CALTRAX-CALGARY',
  'CANDO Rail Services (Oakbank)': 'CANDO-OAKBANK',
  'Cathcart (Amarillo) (Amarillo)': 'CTH-AMARILLO',
  'Cathcart (Elk Mills) (Elk Mills)': 'CTH-ELKMILLS',
  'Cathcart - Hinton (Hinton)': 'CTH-HINTON',
  'Cathcart (Lynchburg) (Lynchburg)': 'CTH-LYNCHBURG',
  'Cathcart - Kansas City (Kansas City)': 'CTH-KC',
  'Cathcart - Maumee (Maumee)': 'CTH-MAUMEE',
  'Cathcart Rail - Hastings (Hastings)': 'CTH-HASTINGS',
  'Curry Rail Services - Hollidaysburg PA (Hollidaysburg)': 'CRY-HOLLIDAYSBURG',
  'Curry Rail Services Hockley (Hockley)': 'CRY-HOCKLEY',
  'Curry Rail Services Shoshoni (Shoshoni)': 'CRY-SHOSHONI',
  'Eagle Railcar (Cairo)': 'EGL-CAIRO',
  'Eagle Railcar (Channelview) (Eastland)': 'EGL-CHANNELVIEW',
  'Eagle Railcar (DuBois)': 'EGL-DUBOIS',
  'Eagle Railcar (Elkhart)': 'EGL-ELKHART',
  'Eagle Railcar (Fitzgerald)': 'EGL-FITZGERALD',
  'Eagle Railcar (Gordon)': 'EGL-GORDON',
  'Eagle Railcar (Junction City)': 'EGL-JUNCTIONCITY',
  'Eagle Railcar (Longview)': 'EGL-LONGVIEW',
  'Eagle Railcar-Georgetown/Orange (Georgetown)': 'EGL-GEORGETOWN',
  'Eagle Railcar Services (Orange)': 'EGL-ORANGE',
  'Eagle Railcar Services (Roscoe)': 'EGL-ROSCOE',
  'Eagle Railcar (Washington)': 'EGL-WASHINGTON',
  'Eagle Railcar (Wichita Falls)': 'EGL-WICHITAFALLS',
  'Frit Car and Equipment, Inc. (Brewton)': 'FRIT-BREWTON',
  'Frit Car and Equipment, Inc. (Bridgeton)': 'FRIT-BRIDGETON',
  'Greenbrier Repair & Services (Cleburne)': 'GBR-CLEBURNE',
  'Greenbrier Repair & Services (Finley)': 'GBR-FINLEY',
  'Greenbrier Repair-Central (Marmaduke)': 'GBR-MARMADUKE',
  'Greenbrier Rail Services (Omaha, NE)': 'GBR-OMAHA',
  'H.C. Chandler and Son, Inc. (Plantersville)': 'HCC-PLANTERSVILLE',
  'Iron Horse Rail Services (Beaumont)': 'IRONHORSE-BEAUMONT',
  'KRS Katahdin Railcar Services  (Bangor)': 'KRS-BANGOR',
  'Midwest Railcar Repair, Inc. (Brandon (Corson))': 'MWR-BRANDON',
  'PSC Repair (Beaumont, TX)': 'PSC-BEAUMONT',
  'Procor Limited (N. Van)': 'PRO-NVAN',
  'Procor Limited (Joffre)': 'PRO-JOFFRE',
  'Procor Limited (Sarnia)': 'PRO-SARNIA',
  'Procor - Transmark (Lethbridge, AB)': 'PRO-LETHBRIDGE',
  'Rescar (Savanna, IL)': 'RESCAR-SAVANNA',
  'TLC Rail Services/Inserv-Wright City (Wright City, OK)': 'TLC-WRIGHTCITY',
  'TMC Engineering Services (Houston, TX)': 'TMC-HOUSTON',
  'TNT Repair Services (Longview)': 'TNT-LONGVIEW',
  'Transco (Texarkana)': 'TRC-TEXARKANA',
  'Transco Rail (Sayre)': 'TRC-SAYRE',
  'Transco Railway (Oelwein)': 'TRC-OELWEIN',
  'Transco Railway Products, Inc. (Miles City)': 'TRC-MILESCITY',
  'Transco-Sheldon, TX (Houston)': 'TRC-SHELDON',
  'Transitech, Inc. (Fordyce)': 'TRANSITECH-FORDYCE',
  'Trinity Industries, Inc. (Ft. Worth)': 'TRI-FTWORTH',
  'Trinity Industries, Inc. (Saginaw)': 'TRI-SAGINAW',
  'Trinity Rail Services (Shell Rock, IA)': 'TRI-SHELLROCK',
  'Trinity Rail - Sunray (Sunray, TX)': 'TRI-SUNRAY',
  'Red River Coatings (Nash, TX)': 'RRC-NASH',
  'Rescar #380 (Deer Park)': 'RESCAR-DEERPARK',
  'Texana Midway Tank Cleaning (Texarkana, TX)': 'TEXANA-TEXARKANA',
  'VLS RECOVERY SERVICES  - Hockley (hockley)': 'VLS-HOCKLEY',
};

// Reverse mapping: shop code to CSV column name
export const SHOP_CODE_TO_CSV_COLUMN: Record<string, string> = Object.entries(
  CSV_SHOP_COLUMN_MAPPING
).reduce((acc, [csvColumn, shopCode]) => {
  acc[shopCode] = csvColumn;
  return acc;
}, {} as Record<string, string>);

// Shop code to network mapping
export const SHOP_CODE_TO_NETWORK: Record<string, { networkId: string; networkName: string; isAitxInternal: boolean }> = {
  // AITX Internal
  'AITX-SARNIA': { networkId: 'aitx', networkName: 'AITX', isAitxInternal: true },
  'AITX-NKC': { networkId: 'aitx', networkName: 'AITX', isAitxInternal: true },
  'AITX-MOUNDS': { networkId: 'aitx', networkName: 'AITX', isAitxInternal: true },
  'AITX-LAPORTE': { networkId: 'aitx', networkName: 'AITX', isAitxInternal: true },
  'AITX-HOUSTON': { networkId: 'aitx', networkName: 'AITX', isAitxInternal: true },
  'AITX-BROOKHAVEN': { networkId: 'aitx', networkName: 'AITX', isAitxInternal: true },
  'AITX-BUDE': { networkId: 'aitx', networkName: 'AITX', isAitxInternal: true },
  'AITX-LONGVIEW': { networkId: 'aitx', networkName: 'AITX', isAitxInternal: true },
  'AITX-TENNILLE': { networkId: 'aitx', networkName: 'AITX', isAitxInternal: true },
  'AITX-KCK': { networkId: 'aitx', networkName: 'AITX', isAitxInternal: true },
  'AITX-MILTON': { networkId: 'aitx', networkName: 'AITX', isAitxInternal: true },
  'AITX-SWEETWATER': { networkId: 'aitx', networkName: 'AITX', isAitxInternal: true },
  // Trinity
  'TRI-FTWORTH': { networkId: 'trinity', networkName: 'Trinity', isAitxInternal: false },
  'TRI-SAGINAW': { networkId: 'trinity', networkName: 'Trinity', isAitxInternal: false },
  'TRI-SHELLROCK': { networkId: 'trinity', networkName: 'Trinity', isAitxInternal: false },
  'TRI-SUNRAY': { networkId: 'trinity', networkName: 'Trinity', isAitxInternal: false },
  // Greenbrier
  'GBR-CLEBURNE': { networkId: 'greenbrier', networkName: 'Greenbrier', isAitxInternal: false },
  'GBR-FINLEY': { networkId: 'greenbrier', networkName: 'Greenbrier', isAitxInternal: false },
  'GBR-MARMADUKE': { networkId: 'greenbrier', networkName: 'Greenbrier', isAitxInternal: false },
  'GBR-OMAHA': { networkId: 'greenbrier', networkName: 'Greenbrier', isAitxInternal: false },
  // Eagle
  'EGL-CAIRO': { networkId: 'eagle', networkName: 'Eagle Railcar', isAitxInternal: false },
  'EGL-CHANNELVIEW': { networkId: 'eagle', networkName: 'Eagle Railcar', isAitxInternal: false },
  'EGL-DUBOIS': { networkId: 'eagle', networkName: 'Eagle Railcar', isAitxInternal: false },
  'EGL-ELKHART': { networkId: 'eagle', networkName: 'Eagle Railcar', isAitxInternal: false },
  'EGL-FITZGERALD': { networkId: 'eagle', networkName: 'Eagle Railcar', isAitxInternal: false },
  'EGL-GORDON': { networkId: 'eagle', networkName: 'Eagle Railcar', isAitxInternal: false },
  'EGL-JUNCTIONCITY': { networkId: 'eagle', networkName: 'Eagle Railcar', isAitxInternal: false },
  'EGL-LONGVIEW': { networkId: 'eagle', networkName: 'Eagle Railcar', isAitxInternal: false },
  'EGL-GEORGETOWN': { networkId: 'eagle', networkName: 'Eagle Railcar', isAitxInternal: false },
  'EGL-ORANGE': { networkId: 'eagle', networkName: 'Eagle Railcar', isAitxInternal: false },
  'EGL-ROSCOE': { networkId: 'eagle', networkName: 'Eagle Railcar', isAitxInternal: false },
  'EGL-WASHINGTON': { networkId: 'eagle', networkName: 'Eagle Railcar', isAitxInternal: false },
  'EGL-WICHITAFALLS': { networkId: 'eagle', networkName: 'Eagle Railcar', isAitxInternal: false },
  // Cathcart
  'CTH-AMARILLO': { networkId: 'cathcart', networkName: 'Cathcart', isAitxInternal: false },
  'CTH-ELKMILLS': { networkId: 'cathcart', networkName: 'Cathcart', isAitxInternal: false },
  'CTH-HINTON': { networkId: 'cathcart', networkName: 'Cathcart', isAitxInternal: false },
  'CTH-LYNCHBURG': { networkId: 'cathcart', networkName: 'Cathcart', isAitxInternal: false },
  'CTH-KC': { networkId: 'cathcart', networkName: 'Cathcart', isAitxInternal: false },
  'CTH-MAUMEE': { networkId: 'cathcart', networkName: 'Cathcart', isAitxInternal: false },
  'CTH-HASTINGS': { networkId: 'cathcart', networkName: 'Cathcart', isAitxInternal: false },
  // Curry
  'CRY-HOLLIDAYSBURG': { networkId: 'curry', networkName: 'Curry Rail Services', isAitxInternal: false },
  'CRY-HOCKLEY': { networkId: 'curry', networkName: 'Curry Rail Services', isAitxInternal: false },
  'CRY-SHOSHONI': { networkId: 'curry', networkName: 'Curry Rail Services', isAitxInternal: false },
  // Procor
  'PRO-NVAN': { networkId: 'procor', networkName: 'Procor', isAitxInternal: false },
  'PRO-JOFFRE': { networkId: 'procor', networkName: 'Procor', isAitxInternal: false },
  'PRO-SARNIA': { networkId: 'procor', networkName: 'Procor', isAitxInternal: false },
  'PRO-LETHBRIDGE': { networkId: 'procor', networkName: 'Procor', isAitxInternal: false },
  // Transco
  'TRC-TEXARKANA': { networkId: 'transco', networkName: 'Transco', isAitxInternal: false },
  'TRC-SAYRE': { networkId: 'transco', networkName: 'Transco', isAitxInternal: false },
  'TRC-OELWEIN': { networkId: 'transco', networkName: 'Transco', isAitxInternal: false },
  'TRC-MILESCITY': { networkId: 'transco', networkName: 'Transco', isAitxInternal: false },
  'TRC-SHELDON': { networkId: 'transco', networkName: 'Transco', isAitxInternal: false },
  // Other 3P
  'APACHE-SNOWFLAKE': { networkId: 'other-3p', networkName: 'Other 3rd Party', isAitxInternal: false },
  'BLAST-BRANTFORD': { networkId: 'other-3p', networkName: 'Other 3rd Party', isAitxInternal: false },
  'CAD-LACHINE': { networkId: 'other-3p', networkName: 'Other 3rd Party', isAitxInternal: false },
  'CALTRAX-CALGARY': { networkId: 'other-3p', networkName: 'Other 3rd Party', isAitxInternal: false },
  'CANDO-OAKBANK': { networkId: 'other-3p', networkName: 'Other 3rd Party', isAitxInternal: false },
  'FRIT-BREWTON': { networkId: 'other-3p', networkName: 'Other 3rd Party', isAitxInternal: false },
  'FRIT-BRIDGETON': { networkId: 'other-3p', networkName: 'Other 3rd Party', isAitxInternal: false },
  'HCC-PLANTERSVILLE': { networkId: 'other-3p', networkName: 'Other 3rd Party', isAitxInternal: false },
  'IRONHORSE-BEAUMONT': { networkId: 'other-3p', networkName: 'Other 3rd Party', isAitxInternal: false },
  'KRS-BANGOR': { networkId: 'other-3p', networkName: 'Other 3rd Party', isAitxInternal: false },
  'MWR-BRANDON': { networkId: 'other-3p', networkName: 'Other 3rd Party', isAitxInternal: false },
  'PSC-BEAUMONT': { networkId: 'other-3p', networkName: 'Other 3rd Party', isAitxInternal: false },
  'RESCAR-SAVANNA': { networkId: 'other-3p', networkName: 'Other 3rd Party', isAitxInternal: false },
  'TLC-WRIGHTCITY': { networkId: 'other-3p', networkName: 'Other 3rd Party', isAitxInternal: false },
  'TMC-HOUSTON': { networkId: 'other-3p', networkName: 'Other 3rd Party', isAitxInternal: false },
  'TNT-LONGVIEW': { networkId: 'other-3p', networkName: 'Other 3rd Party', isAitxInternal: false },
  'TRANSITECH-FORDYCE': { networkId: 'other-3p', networkName: 'Other 3rd Party', isAitxInternal: false },
  'RRC-NASH': { networkId: 'other-3p', networkName: 'Other 3rd Party', isAitxInternal: false },
  'RESCAR-DEERPARK': { networkId: 'other-3p', networkName: 'Other 3rd Party', isAitxInternal: false },
  'TEXANA-TEXARKANA': { networkId: 'other-3p', networkName: 'Other 3rd Party', isAitxInternal: false },
  'VLS-HOCKLEY': { networkId: 'other-3p', networkName: 'Other 3rd Party', isAitxInternal: false },
};

/**
 * Resolves a CSV shop column header to a shop code
 */
export function resolveShopCodeFromCSVColumn(csvColumnHeader: string): string | null {
  // Direct lookup
  if (CSV_SHOP_COLUMN_MAPPING[csvColumnHeader]) {
    return CSV_SHOP_COLUMN_MAPPING[csvColumnHeader];
  }

  // Try trimmed version
  const trimmed = csvColumnHeader.trim();
  if (CSV_SHOP_COLUMN_MAPPING[trimmed]) {
    return CSV_SHOP_COLUMN_MAPPING[trimmed];
  }

  // Try fuzzy matching (case-insensitive, normalize spaces)
  const normalized = trimmed.toLowerCase().replace(/\s+/g, ' ');
  for (const [key, code] of Object.entries(CSV_SHOP_COLUMN_MAPPING)) {
    if (key.toLowerCase().replace(/\s+/g, ' ') === normalized) {
      return code;
    }
  }

  return null;
}

/**
 * Gets the network info for a shop code
 */
export function getNetworkForShopCode(shopCode: string): { networkId: string; networkName: string; isAitxInternal: boolean } | null {
  return SHOP_CODE_TO_NETWORK[shopCode] || null;
}

/**
 * Checks if a shop code belongs to AITX internal
 */
export function isAitxInternalShop(shopCode: string): boolean {
  const network = SHOP_CODE_TO_NETWORK[shopCode];
  return network?.isAitxInternal ?? false;
}

// Team assignments based on qualification type (Column AG)
export const TEAM_ASSIGNMENTS = {
  'Full Qual': 'qualification',     // Qual team
  'Partial Qual': 'in_service_repairs', // In-service repairs team
} as const;

export type TeamAssignment = typeof TEAM_ASSIGNMENTS[keyof typeof TEAM_ASSIGNMENTS];

/**
 * Determines team assignment based on qualification type
 */
export function getTeamAssignment(qualificationType: string): TeamAssignment | null {
  const normalized = qualificationType?.trim();
  if (!normalized) return null;

  if (normalized.toLowerCase().includes('full')) {
    return 'qualification';
  }
  if (normalized.toLowerCase().includes('partial')) {
    return 'in_service_repairs';
  }

  return null;
}

// S&OP Planning Parameters
export const SOP_PLANNING_DEFAULTS = {
  planningYear: new Date().getFullYear(),
  demandRegisterYearRange: { prior: 1, current: 1, following: 1 }, // -1, 0, +1 years from planning year
  utilizationTarget: 0.90,
  aitxCostPremium: 1.379,
  planningHorizonMonths: 18,
  tankCarPercentage: 65,
  freightCarPercentage: 35,
};
