/**
 * Default values for planning and scheduling operations
 * These can be overridden by shop-specific values when available
 */

// Default estimated cost per car (in USD)
// Used when shop doesn't have baseCostPerCar set
export const DEFAULT_ESTIMATED_COST = 15000;

// Default estimated turn time in days
// Used when shop doesn't have baseTurnTime set
export const DEFAULT_ESTIMATED_DAYS = 14;

// Default priority for assignments (1 = highest, 5 = lowest)
export const DEFAULT_PRIORITY = 3;

// Default work type when none specified
export const DEFAULT_WORK_TYPE = 'qualification';

// Export all defaults as an object for convenience
export const DEFAULTS = {
  ESTIMATED_COST: DEFAULT_ESTIMATED_COST,
  ESTIMATED_DAYS: DEFAULT_ESTIMATED_DAYS,
  PRIORITY: DEFAULT_PRIORITY,
  WORK_TYPE: DEFAULT_WORK_TYPE,
} as const;
