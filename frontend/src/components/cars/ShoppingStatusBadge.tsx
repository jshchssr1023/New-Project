import { ExclamationTriangleIcon, ClockIcon, CheckCircleIcon, CalendarIcon } from '@heroicons/react/24/outline';

export type ShoppingStatus = 'urgent' | 'must_shop' | 'upcoming' | 'compliant' | 'unknown';

interface ShoppingStatusBadgeProps {
  status: ShoppingStatus;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  showLabel?: boolean;
}

const statusConfig: Record<ShoppingStatus, {
  label: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  icon: typeof ExclamationTriangleIcon;
}> = {
  urgent: {
    label: 'URGENT',
    bgColor: 'bg-red-100',
    textColor: 'text-red-800',
    borderColor: 'border-red-300',
    icon: ExclamationTriangleIcon,
  },
  must_shop: {
    label: 'MUST SHOP',
    bgColor: 'bg-amber-100',
    textColor: 'text-amber-800',
    borderColor: 'border-amber-300',
    icon: ClockIcon,
  },
  upcoming: {
    label: 'UPCOMING',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-800',
    borderColor: 'border-blue-300',
    icon: CalendarIcon,
  },
  compliant: {
    label: 'COMPLIANT',
    bgColor: 'bg-green-100',
    textColor: 'text-green-800',
    borderColor: 'border-green-300',
    icon: CheckCircleIcon,
  },
  unknown: {
    label: 'N/A',
    bgColor: 'bg-steel-100',
    textColor: 'text-steel-600',
    borderColor: 'border-steel-300',
    icon: ClockIcon,
  },
};

const sizeClasses = {
  sm: 'px-1.5 py-0.5 text-xs',
  md: 'px-2 py-1 text-xs',
  lg: 'px-3 py-1.5 text-sm',
};

export default function ShoppingStatusBadge({
  status,
  size = 'md',
  showIcon = true,
  showLabel = true,
}: ShoppingStatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${config.bgColor} ${config.textColor} ${config.borderColor} ${sizeClasses[size]}`}
    >
      {showIcon && <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} />}
      {showLabel && config.label}
    </span>
  );
}

// Helper function to determine shopping status from car data
export function getShoppingStatus(car: {
  minNoLining?: string | null;
  minWLining?: string | null;
  interiorLining?: string | null;
  rule88B?: string | null;
  safetyRelief?: string | null;
  serviceEquipment?: string | null;
  stubSill?: string | null;
  tankThickness?: string | null;
  tankQualification?: string | null;
}): ShoppingStatus {
  const currentYear = new Date().getFullYear();
  const qualDates = [
    car.minNoLining,
    car.minWLining,
    car.interiorLining,
    car.rule88B,
    car.safetyRelief,
    car.serviceEquipment,
    car.stubSill,
    car.tankThickness,
    car.tankQualification,
  ].filter(Boolean);

  if (qualDates.length === 0) {
    return 'unknown';
  }

  let hasUrgent = false;
  let hasMustShop = false;
  let hasUpcoming = false;

  for (const dateStr of qualDates) {
    if (!dateStr) continue;

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) continue;

    const year = date.getFullYear();

    if (year < currentYear) {
      hasUrgent = true;
    } else if (year === currentYear) {
      hasMustShop = true;
    } else if (year === currentYear + 1) {
      hasUpcoming = true;
    }
  }

  // Priority: urgent > must_shop > upcoming > compliant
  if (hasUrgent) return 'urgent';
  if (hasMustShop) return 'must_shop';
  if (hasUpcoming) return 'upcoming';
  return 'compliant';
}

// Get the earliest qualification date that needs attention
export function getEarliestQualDate(car: {
  minNoLining?: string | null;
  minWLining?: string | null;
  interiorLining?: string | null;
  rule88B?: string | null;
  safetyRelief?: string | null;
  serviceEquipment?: string | null;
  stubSill?: string | null;
  tankThickness?: string | null;
  tankQualification?: string | null;
}): { field: string; date: Date } | null {
  const dates: { field: string; date: Date }[] = [];

  const fields = [
    { key: 'minNoLining', label: 'Min (no lining)' },
    { key: 'minWLining', label: 'Min w lining' },
    { key: 'interiorLining', label: 'Interior Lining' },
    { key: 'rule88B', label: 'Rule 88B' },
    { key: 'safetyRelief', label: 'Safety Relief' },
    { key: 'serviceEquipment', label: 'Service Equipment' },
    { key: 'stubSill', label: 'Stub Sill' },
    { key: 'tankThickness', label: 'Tank Thickness' },
    { key: 'tankQualification', label: 'Tank Qualification' },
  ];

  for (const { key, label } of fields) {
    const value = car[key as keyof typeof car];
    if (value) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        dates.push({ field: label, date });
      }
    }
  }

  if (dates.length === 0) return null;

  return dates.sort((a, b) => a.date.getTime() - b.date.getTime())[0];
}
