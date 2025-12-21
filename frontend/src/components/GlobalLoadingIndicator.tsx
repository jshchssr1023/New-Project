/**
 * Global Loading Indicator
 *
 * Shows a top progress bar and loading overlay for:
 * - Page transitions
 * - Data imports with progress
 * - Background operations
 */

import { useLoading } from '../contexts/LoadingContext';
import { ArrowPathIcon, CloudIcon, ExclamationTriangleIcon, WifiIcon } from '@heroicons/react/24/outline';

export default function GlobalLoadingIndicator() {
  const { isLoading, loadingTasks, isOffline } = useLoading();

  // Get the current/most recent task
  const currentTask = loadingTasks[loadingTasks.length - 1];
  const hasProgress = currentTask && !currentTask.isIndeterminate && currentTask.progress !== undefined;

  return (
    <>
      {/* Top Progress Bar */}
      {isLoading && (
        <div className="fixed top-0 left-0 right-0 z-[100]">
          {hasProgress ? (
            // Determinate progress bar
            <div className="h-1 bg-steel-200">
              <div
                className="h-full bg-rail-600 transition-all duration-300 ease-out"
                style={{ width: `${currentTask.progress}%` }}
              />
            </div>
          ) : (
            // Indeterminate animated bar
            <div className="h-1 bg-steel-200 overflow-hidden">
              <div className="h-full bg-rail-600 animate-loading-bar" />
            </div>
          )}
        </div>
      )}

      {/* Offline Banner */}
      {isOffline && (
        <div className="fixed top-0 left-0 right-0 z-[99] bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium shadow-lg">
          <WifiIcon className="h-4 w-4" />
          <span>You're offline. Some features may be unavailable.</span>
          <CloudIcon className="h-4 w-4 animate-pulse" />
        </div>
      )}

      {/* Loading Toast */}
      {isLoading && loadingTasks.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[100]">
          <div className="bg-white rounded-lg shadow-lg border border-steel-200 p-4 min-w-[200px] max-w-[300px]">
            <div className="flex items-center gap-3">
              <ArrowPathIcon className="h-5 w-5 text-rail-600 animate-spin flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-steel-900 truncate">
                  {currentTask?.label || 'Loading...'}
                </p>
                {hasProgress && (
                  <div className="mt-2">
                    <div className="h-1.5 bg-steel-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-rail-600 rounded-full transition-all duration-300"
                        style={{ width: `${currentTask.progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-steel-500 mt-1">{Math.round(currentTask.progress || 0)}%</p>
                  </div>
                )}
              </div>
            </div>
            {loadingTasks.length > 1 && (
              <p className="text-xs text-steel-400 mt-2">
                +{loadingTasks.length - 1} more task{loadingTasks.length > 2 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Loading Spinner Component - Reusable spinner for inline use
 */
export function LoadingSpinner({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  };

  return (
    <ArrowPathIcon className={`${sizeClasses[size]} text-rail-600 animate-spin ${className}`} />
  );
}

/**
 * Full Page Loading Overlay
 */
export function LoadingOverlay({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="fixed inset-0 z-[200] bg-white/80 backdrop-blur-sm flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rail-600 mx-auto"></div>
        <p className="mt-4 text-steel-600 font-medium">{message}</p>
      </div>
    </div>
  );
}

/**
 * Skeleton Loading Components
 */
export function SkeletonText({ width = 'full', height = '4' }: { width?: string; height?: string }) {
  return (
    <div className={`animate-pulse bg-steel-200 rounded h-${height} w-${width}`} />
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-lg border border-steel-200 p-4 animate-pulse">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 bg-steel-200 rounded-lg" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-steel-200 rounded w-3/4" />
          <div className="h-3 bg-steel-200 rounded w-1/2" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-3 bg-steel-200 rounded" />
        <div className="h-3 bg-steel-200 rounded w-5/6" />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="bg-white rounded-lg border border-steel-200 overflow-hidden">
      <table className="min-w-full">
        <thead className="bg-steel-50">
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="px-4 py-3">
                <div className="h-4 bg-steel-200 rounded w-20 animate-pulse" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-steel-100">
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr key={rowIndex}>
              {Array.from({ length: columns }).map((_, colIndex) => (
                <td key={colIndex} className="px-4 py-3">
                  <div className="h-4 bg-steel-200 rounded animate-pulse" style={{ animationDelay: `${(rowIndex * columns + colIndex) * 50}ms` }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
