// Car type options for railcar fleet
export const CAR_TYPE_OPTIONS = [
  'Tank Car',
  'Covered Hopper',
  'Open Hopper',
  'Boxcar',
  'Gondola',
  'Flatcar',
  'Intermodal',
] as const;

// Reason options for shopping/service
export const REASON_OPTIONS = [
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

// Status colors for table/card views
export const STATUS_COLORS = {
  available: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  in_service: 'bg-amber-50 text-amber-700 border-amber-200',
  in_shop: 'bg-violet-50 text-violet-700 border-violet-200',
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  planned: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  release: 'bg-orange-50 text-orange-700 border-orange-200',
  assignment: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  arrived: 'bg-green-50 text-green-700 border-green-200',
  retired: 'bg-steel-100 text-steel-600 border-steel-200',
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
