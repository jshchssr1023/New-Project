/**
 * Centralized utilization color thresholds for consistent styling
 * across Planning Grid, Scenario Builder, and other components.
 *
 * Utilization Thresholds:
 * - Blue: 0% - 49% (Low utilization)
 * - Yellow: 50% - 79% (Moderate utilization)
 * - Green: 80% - 95% (Optimal utilization)
 * - Red: >95% (Warning) and 100% (Hard Block / Overload)
 */

export type UtilizationLevel = 'empty' | 'low' | 'moderate' | 'optimal' | 'warning' | 'overload';

/**
 * Get the utilization level based on count and capacity
 */
export function getUtilizationLevel(count: number, capacity: number): UtilizationLevel {
  if (capacity === 0) return 'empty';
  if (count === 0) return 'empty';

  const utilization = (count / capacity) * 100;

  if (utilization < 50) return 'low';
  if (utilization < 80) return 'moderate';
  if (utilization <= 95) return 'optimal';
  if (utilization > 100) return 'overload';
  return 'warning';
}

/**
 * Get the utilization percentage
 */
export function getUtilizationPercent(count: number, capacity: number): number {
  if (capacity === 0) return 0;
  return Math.round((count / capacity) * 100);
}

/**
 * Get cell background color classes based on utilization
 */
export function getCellColorClasses(count: number, capacity: number): string {
  const level = getUtilizationLevel(count, capacity);

  switch (level) {
    case 'empty':
      return 'bg-steel-50 hover:bg-steel-100';
    case 'low':
      return 'bg-blue-100 hover:bg-blue-200 border-blue-300';
    case 'moderate':
      return 'bg-yellow-100 hover:bg-yellow-200 border-yellow-300';
    case 'optimal':
      return 'bg-green-100 hover:bg-green-200 border-green-300';
    case 'warning':
      return 'bg-red-100 hover:bg-red-200 border-red-400';
    case 'overload':
      return 'bg-red-200 hover:bg-red-300 border-red-500';
    default:
      return 'bg-steel-100';
  }
}

/**
 * Get border color classes based on utilization (for drag-and-drop hover)
 */
export function getBorderColorClass(count: number, capacity: number): string {
  const level = getUtilizationLevel(count, capacity);

  switch (level) {
    case 'empty':
      return 'border-steel-400';
    case 'low':
      return 'border-blue-500';
    case 'moderate':
      return 'border-yellow-500';
    case 'optimal':
      return 'border-green-500';
    case 'warning':
    case 'overload':
      return 'border-red-500';
    default:
      return 'border-steel-400';
  }
}

/**
 * Get text color classes based on utilization level
 */
export function getTextColorClass(count: number, capacity: number): string {
  const level = getUtilizationLevel(count, capacity);

  switch (level) {
    case 'empty':
      return 'text-steel-500';
    case 'low':
      return 'text-blue-700';
    case 'moderate':
      return 'text-yellow-700';
    case 'optimal':
      return 'text-green-700';
    case 'warning':
    case 'overload':
      return 'text-red-700';
    default:
      return 'text-steel-700';
  }
}

/**
 * Get badge/pill classes for utilization display
 */
export function getUtilizationBadgeClasses(count: number, capacity: number): string {
  const level = getUtilizationLevel(count, capacity);

  switch (level) {
    case 'empty':
      return 'bg-steel-100 text-steel-700';
    case 'low':
      return 'bg-blue-100 text-blue-800';
    case 'moderate':
      return 'bg-yellow-100 text-yellow-800';
    case 'optimal':
      return 'bg-green-100 text-green-800';
    case 'warning':
      return 'bg-red-100 text-red-800';
    case 'overload':
      return 'bg-red-200 text-red-900 font-semibold';
    default:
      return 'bg-steel-100 text-steel-700';
  }
}

/**
 * Get display label for utilization level
 */
export function getUtilizationLabel(count: number, capacity: number): string {
  const level = getUtilizationLevel(count, capacity);
  const percent = getUtilizationPercent(count, capacity);

  switch (level) {
    case 'empty':
      return 'Empty';
    case 'low':
      return `Low (${percent}%)`;
    case 'moderate':
      return `Moderate (${percent}%)`;
    case 'optimal':
      return `Optimal (${percent}%)`;
    case 'warning':
      return `Warning (${percent}%)`;
    case 'overload':
      return `OVERLOAD (${percent}%)`;
    default:
      return `${percent}%`;
  }
}

/**
 * Check if assignment would cause capacity overload
 */
export function wouldExceedCapacity(currentCount: number, addCount: number, capacity: number): boolean {
  return (currentCount + addCount) > capacity;
}

/**
 * Check if current utilization is at warning or overload level
 */
export function isCapacityWarning(count: number, capacity: number): boolean {
  const level = getUtilizationLevel(count, capacity);
  return level === 'warning' || level === 'overload';
}
