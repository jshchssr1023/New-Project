/**
 * Mini-Gantt Chart Component
 *
 * 12-month timeline view for a single car showing:
 * - Solid bars: Planned shop stays
 * - Dotted lines: Estimated transit times
 * - Red line markers: Qualification due dates ("Qual Due")
 * - Diamond markers: Other milestones (contract expiry, etc.)
 */

import { useMemo } from 'react';

interface ShopStay {
  shopId: string;
  shopName: string;
  shopCode: string;
  startMonth: string; // YYYY-MM
  endMonth: string;   // YYYY-MM
  workType: string;   // qualification, repair, etc.
  status: 'planned' | 'in_progress' | 'complete';
}

interface QualificationDueDate {
  type: string;       // Tank Qual, Rule 88B, etc.
  dueDate: string;    // ISO date string
}

interface Milestone {
  type: 'contract_expiry' | 'release' | 'qual_due' | 'other';
  date: string;       // ISO date string
  label: string;
}

interface TransitPeriod {
  fromLocation: string;
  toLocation: string;
  startMonth: string;
  endMonth: string;
}

interface MiniGanttChartProps {
  carId: string;
  railcarNumber: string;
  shopStays?: ShopStay[];
  qualDueDates?: QualificationDueDate[];
  milestones?: Milestone[];
  transitPeriods?: TransitPeriod[];
  startMonth?: string;  // Default: current month
  monthsToShow?: number; // Default: 12
  compact?: boolean;
  onShopStayClick?: (shopStay: ShopStay) => void;
}

// Color palette for different work types
const WORK_TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  qualification: { bg: 'bg-rail-500', border: 'border-rail-600', text: 'text-white' },
  repair: { bg: 'bg-amber-500', border: 'border-amber-600', text: 'text-white' },
  assignment: { bg: 'bg-purple-500', border: 'border-purple-600', text: 'text-white' },
  return: { bg: 'bg-cyan-500', border: 'border-cyan-600', text: 'text-white' },
  default: { bg: 'bg-steel-500', border: 'border-steel-600', text: 'text-white' },
};

const STATUS_OPACITY: Record<string, string> = {
  planned: 'opacity-70',
  in_progress: 'opacity-100',
  complete: 'opacity-50',
};

export default function MiniGanttChart({
  carId,
  railcarNumber,
  shopStays = [],
  qualDueDates = [],
  milestones = [],
  transitPeriods = [],
  startMonth,
  monthsToShow = 12,
  compact = false,
  onShopStayClick,
}: MiniGanttChartProps) {
  // Generate month columns
  const months = useMemo(() => {
    const result: { key: string; label: string; isCurrentMonth: boolean }[] = [];
    const now = new Date();
    const start = startMonth
      ? new Date(startMonth + '-01')
      : new Date(now.getFullYear(), now.getMonth(), 1);

    for (let i = 0; i < monthsToShow; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short' });
      const isCurrentMonth = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();

      result.push({ key, label, isCurrentMonth });
    }

    return result;
  }, [startMonth, monthsToShow]);

  // Calculate position for a date within the timeline
  const getPositionForMonth = (monthKey: string): number => {
    const index = months.findIndex(m => m.key === monthKey);
    if (index === -1) return -1;
    return (index / months.length) * 100;
  };

  // Calculate position for an exact date
  const getPositionForDate = (dateStr: string): number => {
    const date = new Date(dateStr);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const monthIndex = months.findIndex(m => m.key === monthKey);

    if (monthIndex === -1) return -1;

    // Add fraction for day within month
    const dayFraction = date.getDate() / 30;
    return ((monthIndex + dayFraction) / months.length) * 100;
  };

  // Calculate width for a date range
  const getWidthForRange = (startKey: string, endKey: string): number => {
    const startIndex = months.findIndex(m => m.key === startKey);
    const endIndex = months.findIndex(m => m.key === endKey);

    if (startIndex === -1 || endIndex === -1) return 0;

    return ((endIndex - startIndex + 1) / months.length) * 100;
  };

  return (
    <div className={`${compact ? 'h-8' : 'h-14'}`}>
      {/* Timeline Container */}
      <div className="relative w-full h-full bg-steel-50 rounded border border-steel-200 overflow-hidden">
        {/* Month Grid Lines */}
        <div className="absolute inset-0 flex">
          {months.map((month, i) => (
            <div
              key={month.key}
              className={`flex-1 border-r border-steel-200 ${
                month.isCurrentMonth ? 'bg-rail-50' : ''
              } ${i === 0 ? '' : ''}`}
            >
              {!compact && (
                <div className="text-center text-[10px] text-steel-400 pt-0.5">
                  {month.label}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Transit Periods (Dotted Lines) */}
        {transitPeriods.map((transit, i) => {
          const left = getPositionForMonth(transit.startMonth);
          const width = getWidthForRange(transit.startMonth, transit.endMonth);

          if (left === -1 || width === 0) return null;

          return (
            <div
              key={`transit-${i}`}
              className="absolute top-1/2 h-0.5 -translate-y-1/2 border-t-2 border-dashed border-steel-400"
              style={{
                left: `${left}%`,
                width: `${width}%`,
              }}
              title={`Transit: ${transit.fromLocation} → ${transit.toLocation}`}
            />
          );
        })}

        {/* Shop Stays (Solid Bars) */}
        {shopStays.map((stay, i) => {
          const left = getPositionForMonth(stay.startMonth);
          const width = getWidthForRange(stay.startMonth, stay.endMonth);

          if (left === -1 || width === 0) return null;

          const colors = WORK_TYPE_COLORS[stay.workType] || WORK_TYPE_COLORS.default;
          const opacity = STATUS_OPACITY[stay.status] || '';

          return (
            <div
              key={`stay-${i}`}
              className={`absolute top-1/2 -translate-y-1/2 h-5 rounded cursor-pointer transition-all hover:scale-y-110 ${colors.bg} ${colors.border} border ${opacity}`}
              style={{
                left: `${left}%`,
                width: `${Math.max(width, 2)}%`, // Minimum width for visibility
              }}
              onClick={() => onShopStayClick?.(stay)}
              title={`${stay.shopName} (${stay.workType}): ${stay.startMonth} - ${stay.endMonth}`}
            >
              {!compact && width > 8 && (
                <span className={`absolute inset-0 flex items-center justify-center text-[9px] font-medium ${colors.text} truncate px-1`}>
                  {stay.shopCode}
                </span>
              )}
            </div>
          );
        })}

        {/* Qualification Due Markers (Red Lines) */}
        {qualDueDates.map((qual, i) => {
          const position = getPositionForDate(qual.dueDate);

          if (position === -1 || position < 0 || position > 100) return null;

          return (
            <div
              key={`qual-${i}`}
              className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
              style={{ left: `${position}%` }}
              title={`${qual.type}: ${new Date(qual.dueDate).toLocaleDateString()}`}
            >
              {/* Triangle marker at top */}
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[6px] border-l-transparent border-r-transparent border-t-red-500" />
            </div>
          );
        })}

        {/* Other Milestones (Diamond Markers) */}
        {milestones.map((milestone, i) => {
          const position = getPositionForDate(milestone.date);

          if (position === -1 || position < 0 || position > 100) return null;

          const isContractExpiry = milestone.type === 'contract_expiry';

          return (
            <div
              key={`milestone-${i}`}
              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 transform rotate-45 z-10 ${
                isContractExpiry ? 'bg-purple-500' : 'bg-amber-500'
              }`}
              style={{ left: `${position}%` }}
              title={`${milestone.label}: ${new Date(milestone.date).toLocaleDateString()}`}
            />
          );
        })}

        {/* Current Date Indicator */}
        {(() => {
          const now = new Date();
          const position = getPositionForDate(now.toISOString());

          if (position < 0 || position > 100) return null;

          return (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-green-500 z-20"
              style={{ left: `${position}%` }}
            >
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-green-500" />
            </div>
          );
        })()}
      </div>

      {/* Legend (only in non-compact mode) */}
      {!compact && (
        <div className="flex items-center gap-4 mt-1 text-[10px] text-steel-500">
          <div className="flex items-center gap-1">
            <div className="w-4 h-2 rounded bg-rail-500" />
            <span>Shop Stay</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-0.5 border-t-2 border-dashed border-steel-400" />
            <span>Transit</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-0.5 h-3 bg-red-500" />
            <span>Qual Due</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-green-500 rounded-full" />
            <span>Today</span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Wrapper for showing Mini-Gantt in a customer tree row
 */
interface CarGanttRowProps {
  car: {
    id: string;
    railcarNumber: string;
    projectedCompletionMonth?: string;
    assignedShopId?: string;
    shopName?: string;
    shopCode?: string;
    tankQualification?: string;
    minNoLining?: string;
    minWLining?: string;
    rule88B?: string;
    contractExpiration?: string;
  };
  onCarClick?: () => void;
}

export function CarGanttRow({ car, onCarClick }: CarGanttRowProps) {
  // Build shop stays from car data
  const shopStays: ShopStay[] = useMemo(() => {
    if (!car.projectedCompletionMonth || !car.assignedShopId) return [];

    const [year, month] = car.projectedCompletionMonth.split('-').map(Number);
    const startMonth = `${year}-${String(Math.max(1, month - 1)).padStart(2, '0')}`;

    return [{
      shopId: car.assignedShopId,
      shopName: car.shopName || 'Assigned Shop',
      shopCode: car.shopCode || 'SHOP',
      startMonth,
      endMonth: car.projectedCompletionMonth,
      workType: 'qualification',
      status: 'planned',
    }];
  }, [car]);

  // Build qual due dates from car data
  const qualDueDates: QualificationDueDate[] = useMemo(() => {
    const dates: QualificationDueDate[] = [];

    if (car.tankQualification) {
      dates.push({ type: 'Tank Qual', dueDate: car.tankQualification });
    }
    if (car.minNoLining) {
      dates.push({ type: 'Min No Lining', dueDate: car.minNoLining });
    }
    if (car.minWLining) {
      dates.push({ type: 'Min W Lining', dueDate: car.minWLining });
    }
    if (car.rule88B) {
      dates.push({ type: 'Rule 88B', dueDate: car.rule88B });
    }

    return dates;
  }, [car]);

  // Build milestones
  const milestones: Milestone[] = useMemo(() => {
    const m: Milestone[] = [];

    if (car.contractExpiration) {
      m.push({
        type: 'contract_expiry',
        date: car.contractExpiration,
        label: 'Contract Expiry',
      });
    }

    return m;
  }, [car]);

  return (
    <div className="flex items-center gap-3 py-2 px-3 hover:bg-steel-50 cursor-pointer" onClick={onCarClick}>
      <div className="w-24 text-sm font-medium text-steel-900 truncate">
        {car.railcarNumber}
      </div>
      <div className="flex-1">
        <MiniGanttChart
          carId={car.id}
          railcarNumber={car.railcarNumber}
          shopStays={shopStays}
          qualDueDates={qualDueDates}
          milestones={milestones}
          monthsToShow={12}
          compact
        />
      </div>
    </div>
  );
}
