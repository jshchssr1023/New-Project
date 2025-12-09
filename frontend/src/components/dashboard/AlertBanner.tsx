import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface AlertBannerProps {
  overdueCars: number;
  capacityAlerts: {
    shopName: string;
    shopCode: string;
    capacity: number;
    currentLoad: number;
    overloadPercent: number;
  }[];
  onActionClick: () => void;
}

export default function AlertBanner({ overdueCars, capacityAlerts, onActionClick }: AlertBannerProps) {
  if (overdueCars === 0 && capacityAlerts.length === 0) {
    return null;
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
      <div className="flex items-start gap-3">
        <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {overdueCars > 0 && (
              <span className="text-sm text-amber-800">
                <span className="font-semibold">{overdueCars}</span> railcars are overdue for service
              </span>
            )}
            {capacityAlerts.length > 0 && (
              <span className="text-sm text-amber-800">
                Shop capacity exceeded at{' '}
                <span className="font-semibold">
                  {capacityAlerts.map(a => a.shopName).join(', ')}
                </span>
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onActionClick}
          className="flex-shrink-0 text-sm font-medium text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 px-3 py-1 rounded transition-colors"
        >
          Allocate Now
        </button>
      </div>
    </div>
  );
}
