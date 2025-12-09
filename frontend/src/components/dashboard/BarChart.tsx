interface BarChartData {
  label: string;
  value: number;
}

interface BarChartProps {
  title: string;
  subtitle?: string;
  data: BarChartData[];
  isLoading?: boolean;
  emptyMessage?: string;
  color?: string;
  hoverColor?: string;
  height?: number;
}

export default function BarChart({
  title,
  subtitle,
  data,
  isLoading = false,
  emptyMessage = 'No data available',
  color = 'bg-rail-500',
  hoverColor = 'hover:bg-rail-600',
  height = 48,
}: BarChartProps) {
  const maxValue = Math.max(...data.map(d => d.value), 1);

  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-steel-900 mb-1">{title}</h3>
      {subtitle && <p className="text-xs text-steel-500 mb-3">{subtitle}</p>}

      <div className={`h-${height} flex items-end justify-around bg-steel-50 rounded-lg p-3`}>
        {isLoading ? (
          <p className="text-steel-500 text-sm self-center">Loading...</p>
        ) : data.length > 0 ? (
          data.map((item) => (
            <div key={item.label} className="flex flex-col items-center">
              <span className="text-xs text-steel-600 mb-1">{item.value}</span>
              <div
                className={`${color} w-10 rounded-t transition-all ${hoverColor}`}
                style={{ height: `${Math.max((item.value / maxValue) * 120, 8)}px` }}
              />
              <span className="text-xs text-steel-500 mt-2">
                {item.label}
              </span>
            </div>
          ))
        ) : (
          <p className="text-steel-500 text-sm self-center">{emptyMessage}</p>
        )}
      </div>
    </div>
  );
}

interface ProgressBarData {
  label: string;
  value: number;
  maxValue?: number;
}

interface ProgressBarChartProps {
  title: string;
  data: ProgressBarData[];
  isLoading?: boolean;
  emptyMessage?: string;
  getColor?: (value: number, maxValue: number) => string;
}

export function ProgressBarChart({
  title,
  data,
  isLoading = false,
  emptyMessage = 'No data available',
  getColor = (value, maxValue) => {
    const percent = (value / maxValue) * 100;
    if (percent > 95) return 'bg-red-500';
    if (percent > 80) return 'bg-emerald-500';
    if (percent > 50) return 'bg-amber-500';
    return 'bg-blue-500';
  },
}: ProgressBarChartProps) {
  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-steel-900 mb-3">{title}</h3>
      <div className="space-y-3">
        {isLoading ? (
          <p className="text-steel-500 text-sm py-4 text-center">Loading...</p>
        ) : data.length > 0 ? (
          data.map((item) => {
            const maxValue = item.maxValue || 100;
            return (
              <div key={item.label} className="flex items-center gap-3">
                <span className="text-sm text-steel-700 w-32 truncate">{item.label}</span>
                <div className="flex-1 bg-steel-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${getColor(item.value, maxValue)}`}
                    style={{ width: `${Math.min(item.value, maxValue)}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-steel-900 w-10 text-right">
                  {item.value}%
                </span>
              </div>
            );
          })
        ) : (
          <p className="text-steel-500 text-sm py-4 text-center">{emptyMessage}</p>
        )}
      </div>
    </div>
  );
}
