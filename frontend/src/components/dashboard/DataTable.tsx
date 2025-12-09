import { ReactNode } from 'react';

interface Column<T> {
  key: string;
  header: string;
  align?: 'left' | 'center' | 'right';
  render: (item: T) => ReactNode;
}

interface DataTableProps<T> {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  maxRows?: number;
  showViewAll?: boolean;
  onViewAll?: () => void;
  viewAllText?: string;
}

export default function DataTable<T extends { id?: string }>({
  title,
  subtitle,
  icon,
  columns,
  data,
  isLoading = false,
  emptyMessage = 'No data available',
  onRowClick,
  maxRows = 5,
  showViewAll = false,
  onViewAll,
  viewAllText,
}: DataTableProps<T>) {
  const displayData = data.slice(0, maxRows);

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-sm font-semibold text-steel-900">{title}</h3>
        </div>
        {showViewAll && onViewAll && (
          <button
            onClick={onViewAll}
            className="text-xs text-rail-600 hover:text-rail-800 font-medium"
          >
            View All
          </button>
        )}
      </div>

      {subtitle && (
        <p className="text-xs text-steel-500 mb-3">{subtitle}</p>
      )}

      {isLoading ? (
        <div className="text-sm text-steel-500 py-4 text-center">Loading...</div>
      ) : data.length > 0 ? (
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-steel-200">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`py-2 text-xs font-medium text-steel-500 uppercase ${
                      col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                    }`}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-100">
              {displayData.map((item, idx) => (
                <tr
                  key={item.id || idx}
                  className={onRowClick ? 'hover:bg-steel-50 cursor-pointer' : ''}
                  onClick={() => onRowClick?.(item)}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`py-2 ${
                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                      }`}
                    >
                      {col.render(item)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {data.length > maxRows && showViewAll && onViewAll && (
            <div className="mt-2 pt-2 border-t border-steel-100 text-center">
              <button
                onClick={onViewAll}
                className="text-sm text-rail-600 hover:text-rail-800 font-medium"
              >
                {viewAllText || `View all ${data.length} items`}
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-steel-500 py-4 text-center">{emptyMessage}</p>
      )}
    </div>
  );
}
