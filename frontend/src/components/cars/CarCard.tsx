import { CheckIcon } from '@heroicons/react/24/outline';
import ShoppingStatusBadge, { getShoppingStatus, getEarliestQualDate } from './ShoppingStatusBadge';
import type { Car } from '../../types';

// Extended Car type - all qualification fields are now in Car
// This type alias adds only extra fields that may come from extended queries
export type ExtendedCar = Car & {
  tankQualificationDate?: string | null; // Alternative field name
  currentStatus?: string; // Alternative status field
};

interface CarCardProps {
  car: ExtendedCar;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onViewDetails?: (car: ExtendedCar) => void;
}

// Status badge colors
const statusColors: Record<string, string> = {
  available: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  in_service: 'bg-amber-50 text-amber-700 border-amber-200',
  in_shop: 'bg-violet-50 text-violet-700 border-violet-200',
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  planned: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  release: 'bg-orange-50 text-orange-700 border-orange-200',
  assignment: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  arrived: 'bg-green-50 text-green-700 border-green-200',
  retired: 'bg-steel-100 text-steel-600 border-steel-200',
};

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export default function CarCard({ car, isSelected, onSelect, onViewDetails }: CarCardProps) {
  const shoppingStatus = getShoppingStatus(car);
  const earliestQual = getEarliestQualDate(car);
  const isTankCar = car.carType === 'Tank Car' || car.isTankCar;

  return (
    <div
      className={`card p-4 cursor-pointer transition-all hover:shadow-md ${
        isSelected ? 'ring-2 ring-rail-500 bg-rail-50' : 'hover:bg-steel-50'
      }`}
      onClick={() => onSelect(car.id)}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {/* Selection Checkbox */}
          <div
            className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
              isSelected ? 'bg-rail-500 border-rail-500' : 'border-steel-300'
            }`}
          >
            {isSelected && <CheckIcon className="w-3 h-3 text-white" />}
          </div>

          {/* Car Number & Type */}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-steel-900">{car.railcarNumber}</span>
              {isTankCar && (
                <span className="px-1.5 py-0.5 text-xs bg-violet-50 text-violet-700 border border-violet-200 rounded font-medium">
                  TANK
                </span>
              )}
            </div>
            <p className="text-xs text-steel-500">{car.carType}</p>
          </div>
        </div>

        {/* Shopping Status Badge */}
        <ShoppingStatusBadge status={shoppingStatus} size="md" />
      </div>

      {/* Car Info Section */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mb-3">
        <div>
          <span className="text-steel-500">Customer:</span>
          <span className="ml-1 text-steel-800 font-medium">{car.customer || '-'}</span>
        </div>
        <div>
          <span className="text-steel-500">Project:</span>
          <span className="ml-1 text-steel-800 font-mono text-xs">{car.projectNumber || '-'}</span>
        </div>
        <div>
          <span className="text-steel-500">Portfolio:</span>
          <span className="ml-1 text-steel-800">{car.portfolio || '-'}</span>
        </div>
        <div>
          <span className="text-steel-500">Qual Type:</span>
          <span className="ml-1 text-steel-800">{car.fullPartialQual || car.qualificationType || '-'}</span>
        </div>
      </div>

      {/* Tank/Lining Info (if tank car) */}
      {isTankCar && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mb-3 pt-2 border-t border-steel-100">
          <div>
            <span className="text-steel-500">Lined:</span>
            <span className="ml-1 text-steel-800">{car.lined ? 'Yes' : 'No'}</span>
          </div>
          <div>
            <span className="text-steel-500">Lining Type:</span>
            <span className="ml-1 text-steel-800">{car.liningType || '-'}</span>
          </div>
          <div>
            <span className="text-steel-500">Perform Tank Qual:</span>
            <span className={`ml-1 font-medium ${car.performTankQual ? 'text-amber-700' : 'text-steel-500'}`}>
              {car.performTankQual ? 'Yes' : 'No'}
            </span>
          </div>
        </div>
      )}

      {/* Qualification Dates Summary */}
      <div className="pt-2 border-t border-steel-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-steel-600 uppercase tracking-wide">
            Qualification Status
          </span>
          {earliestQual && (
            <span className={`text-xs ${shoppingStatus === 'urgent' ? 'text-red-600 font-semibold' : shoppingStatus === 'must_shop' ? 'text-amber-600 font-medium' : 'text-steel-500'}`}>
              Next: {earliestQual.field} ({formatDate(earliestQual.date.toISOString())})
            </span>
          )}
        </div>

        {/* Key Qualification Dates Grid */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <QualDateCell label="Safety Relief" date={car.safetyRelief} />
          <QualDateCell label="Service Equip" date={car.serviceEquipment} />
          <QualDateCell label="Tank Qual" date={car.tankQualificationDate || car.tankQualDueDate} />
          <QualDateCell label="Stub Sill" date={car.stubSill} />
          <QualDateCell label="Rule 88B" date={car.rule88B} />
          <QualDateCell label="Tank Thick" date={car.tankThickness} />
        </div>
      </div>

      {/* Footer: Status & Actions */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-steel-100">
        <span
          className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium border ${statusColors[car.status] || statusColors.available}`}
        >
          {car.status.replace('_', ' ')}
        </span>

        {onViewDetails && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails(car);
            }}
            className="text-xs text-rail-600 hover:text-rail-800 font-medium"
          >
            View Details
          </button>
        )}
      </div>
    </div>
  );
}

// Helper component for qualification date cells
function QualDateCell({ label, date }: { label: string; date: string | null | undefined }) {
  const currentYear = new Date().getFullYear();
  const dateObj = date ? new Date(date) : null;
  const year = dateObj && !isNaN(dateObj.getTime()) ? dateObj.getFullYear() : null;

  let colorClass = 'text-steel-500';
  if (year !== null) {
    if (year < currentYear) {
      colorClass = 'text-red-600 font-semibold bg-red-50';
    } else if (year === currentYear) {
      colorClass = 'text-amber-600 font-medium bg-amber-50';
    } else if (year === currentYear + 1) {
      colorClass = 'text-blue-600 bg-blue-50';
    } else {
      colorClass = 'text-green-600 bg-green-50';
    }
  }

  return (
    <div className={`px-1.5 py-1 rounded ${year !== null ? colorClass : ''}`}>
      <div className="text-steel-500 text-[10px] uppercase">{label}</div>
      <div className={year !== null ? '' : 'text-steel-400'}>{formatDate(date)}</div>
    </div>
  );
}
