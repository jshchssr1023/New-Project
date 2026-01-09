// Car type options for railcar fleet (fallback if no dynamic data)
// These will be overridden by dynamic data from car imports
export const CAR_TYPE_OPTIONS = [
  'General Service Tank',
  'Tank Car',
  'Covered Hopper',
  'Open Hopper',
  'Boxcar',
  'Gondola',
  'Flatcar',
  'Intermodal',
] as const;

// Reason options for shopping/service (fallback if no dynamic data)
// Maps to "Reason Shopped" column (Column AH) in car data
export const REASON_OPTIONS = [
  'TANK QUALIFICATION',
  'Annual Inspection',
  'Wheel Repair',
  'Tank Cleaning',
  'Valve Replacement',
  'Frame Repair',
  'Safety Retrofit',
  'DOT Compliance',
  'Corrosion Repair',
  'Coupler Replacement',
  'Brake System',
] as const;

// Car Status values from Column AK (Current Status) in car data
// These drive the logistics process
export const CAR_STATUS_OPTIONS = [
  { value: 'Complete', label: 'Complete', description: 'Car is done, no longer needs shopping' },
  { value: 'Arrived', label: 'Arrived', description: 'Car is in shop now' },
  { value: 'To Be Routed', label: 'To Be Routed', description: 'Car has not been sent to shop' },
  { value: 'Enroute', label: 'Enroute', description: 'Car is on its way to shop' },
  { value: 'Release', label: 'Release', description: 'Car released from shop' },
  { value: 'Reassigned', label: 'Reassigned', description: 'Car reassigned to different shop' },
  { value: 'Up Marketed', label: 'Up Marketed', description: 'Car up marketed' },
] as const;

// Planning status values from Column AJ (Scheduled)
// Planned = car has a date in a shop
// Needs Planning = available to be planned in the system
export const PLANNING_STATUS_OPTIONS = [
  { value: 'needs_planning', label: 'Needs Planning', description: 'Car available to be planned' },
  { value: 'already_planned', label: 'Planned', description: 'Car has a date in a shop' },
] as const;

// Status colors for table/card views - includes all car statuses
export const STATUS_COLORS = {
  // Legacy statuses
  available: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  in_service: 'bg-amber-50 text-amber-700 border-amber-200',
  in_shop: 'bg-violet-50 text-violet-700 border-violet-200',
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  planned: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  retired: 'bg-steel-100 text-steel-600 border-steel-200',
  // Car Status from Column AK
  Complete: 'bg-green-50 text-green-700 border-green-200',
  Arrived: 'bg-violet-50 text-violet-700 border-violet-200',
  'To Be Routed': 'bg-amber-50 text-amber-700 border-amber-200',
  Enroute: 'bg-blue-50 text-blue-700 border-blue-200',
  Release: 'bg-orange-50 text-orange-700 border-orange-200',
  Reassigned: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  'Up Marketed': 'bg-pink-50 text-pink-700 border-pink-200',
} as const;

// Shopping status colors
export const SHOPPING_STATUS_COLORS = {
  Urgent: 'bg-red-100 text-red-700 border-red-200',
  'Must Shop': 'bg-amber-100 text-amber-700 border-amber-200',
  Upcoming: 'bg-blue-100 text-blue-700 border-blue-200',
  Compliant: 'bg-green-100 text-green-700 border-green-200',
  'In Shop': 'bg-violet-100 text-violet-700 border-violet-200',
  Planned: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  Unknown: 'bg-steel-100 text-steel-600 border-steel-200',
} as const;

// Type exports
export type CarType = typeof CAR_TYPE_OPTIONS[number];
export type ReasonOption = typeof REASON_OPTIONS[number];
export type StatusKey = keyof typeof STATUS_COLORS;
export type ShoppingStatusKey = keyof typeof SHOPPING_STATUS_COLORS;
