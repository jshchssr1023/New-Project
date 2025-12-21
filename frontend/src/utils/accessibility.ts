/**
 * Accessibility Utilities
 *
 * Helpers for ARIA labels, keyboard navigation, and a11y compliance
 */

import { useEffect, useCallback, useRef, KeyboardEvent as ReactKeyboardEvent } from 'react';

// ============================================================================
// ARIA LABEL GENERATORS
// ============================================================================

/**
 * Generate ARIA label for a car item
 */
export function getCarAriaLabel(car: {
  railcarNumber: string;
  customer?: string;
  status?: string;
  shoppingStatus?: string;
}): string {
  const parts = [`Railcar ${car.railcarNumber}`];
  if (car.customer) parts.push(`owned by ${car.customer}`);
  if (car.status) parts.push(`status ${car.status}`);
  if (car.shoppingStatus) parts.push(`shopping status ${car.shoppingStatus}`);
  return parts.join(', ');
}

/**
 * Generate ARIA label for a shop
 */
export function getShopAriaLabel(shop: {
  name: string;
  code: string;
  city?: string;
  state?: string;
  capacity?: number;
  isActive?: boolean;
}): string {
  const parts = [`Shop ${shop.name}, code ${shop.code}`];
  if (shop.city && shop.state) parts.push(`located in ${shop.city}, ${shop.state}`);
  if (shop.capacity) parts.push(`capacity ${shop.capacity} cars per month`);
  if (shop.isActive !== undefined) parts.push(shop.isActive ? 'active' : 'inactive');
  return parts.join(', ');
}

/**
 * Generate ARIA label for date
 */
export function getDateAriaLabel(dateStr: string | null | undefined): string {
  if (!dateStr) return 'no date set';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'invalid date';
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Generate ARIA description for status badges
 */
export function getStatusDescription(status: string): string {
  const statusDescriptions: Record<string, string> = {
    urgent: 'Requires immediate attention, past due date',
    'must shop': 'Must be serviced this year',
    upcoming: 'Service due next year',
    compliant: 'Compliant, service not due for 2 or more years',
    'in shop': 'Currently at a service shop',
    planned: 'Service has been scheduled',
    unknown: 'Service status unknown',
    active: 'Currently operational',
    inactive: 'Not currently operational',
    draft: 'In draft status, not finalized',
    completed: 'Work has been completed',
    cancelled: 'Has been cancelled',
  };
  return statusDescriptions[status.toLowerCase()] || `Status: ${status}`;
}

// ============================================================================
// KEYBOARD NAVIGATION HOOKS
// ============================================================================

/**
 * Arrow key navigation for lists
 */
export function useArrowKeyNavigation<T>(
  items: T[],
  onSelect: (item: T, index: number) => void,
  options: {
    orientation?: 'horizontal' | 'vertical' | 'both';
    wrap?: boolean;
    initialIndex?: number;
  } = {}
) {
  const { orientation = 'vertical', wrap = true, initialIndex = -1 } = options;
  const currentIndexRef = useRef(initialIndex);

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      const { key } = e;
      let newIndex = currentIndexRef.current;

      const isVertical = orientation === 'vertical' || orientation === 'both';
      const isHorizontal = orientation === 'horizontal' || orientation === 'both';

      if ((key === 'ArrowDown' && isVertical) || (key === 'ArrowRight' && isHorizontal)) {
        e.preventDefault();
        newIndex = currentIndexRef.current + 1;
        if (newIndex >= items.length) {
          newIndex = wrap ? 0 : items.length - 1;
        }
      } else if ((key === 'ArrowUp' && isVertical) || (key === 'ArrowLeft' && isHorizontal)) {
        e.preventDefault();
        newIndex = currentIndexRef.current - 1;
        if (newIndex < 0) {
          newIndex = wrap ? items.length - 1 : 0;
        }
      } else if (key === 'Home') {
        e.preventDefault();
        newIndex = 0;
      } else if (key === 'End') {
        e.preventDefault();
        newIndex = items.length - 1;
      } else if (key === 'Enter' || key === ' ') {
        e.preventDefault();
        if (currentIndexRef.current >= 0 && currentIndexRef.current < items.length) {
          onSelect(items[currentIndexRef.current], currentIndexRef.current);
        }
        return;
      } else {
        return;
      }

      if (newIndex !== currentIndexRef.current && items[newIndex]) {
        currentIndexRef.current = newIndex;
        onSelect(items[newIndex], newIndex);
      }
    },
    [items, onSelect, orientation, wrap]
  );

  const setIndex = useCallback((index: number) => {
    currentIndexRef.current = index;
  }, []);

  return { handleKeyDown, setIndex, currentIndex: currentIndexRef.current };
}

/**
 * Focus trap for modals/dialogs
 */
export function useFocusTrap(isActive: boolean, containerRef: React.RefObject<HTMLElement>) {
  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;
    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusableElements = container.querySelectorAll<HTMLElement>(focusableSelector);
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    // Focus first element on open
    firstFocusable?.focus();

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable?.focus();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable?.focus();
        }
      }
    };

    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Let parent handle escape
      }
    };

    container.addEventListener('keydown', handleTabKey);
    container.addEventListener('keydown', handleEscapeKey);

    return () => {
      container.removeEventListener('keydown', handleTabKey);
      container.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isActive, containerRef]);
}

/**
 * Roving tabindex for toolbar/menubar
 */
export function useRovingTabindex<T extends HTMLElement>(
  containerRef: React.RefObject<T>,
  selector: string
) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const items = container.querySelectorAll<HTMLElement>(selector);
    if (items.length === 0) return;

    // Set initial tabindex
    items.forEach((item, index) => {
      item.setAttribute('tabindex', index === 0 ? '0' : '-1');
    });

    let currentIndex = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      const { key } = e;
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return;

      e.preventDefault();
      items[currentIndex].setAttribute('tabindex', '-1');

      if (key === 'ArrowRight') {
        currentIndex = (currentIndex + 1) % items.length;
      } else if (key === 'ArrowLeft') {
        currentIndex = (currentIndex - 1 + items.length) % items.length;
      } else if (key === 'Home') {
        currentIndex = 0;
      } else if (key === 'End') {
        currentIndex = items.length - 1;
      }

      items[currentIndex].setAttribute('tabindex', '0');
      items[currentIndex].focus();
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [containerRef, selector]);
}

// ============================================================================
// LIVE REGION ANNOUNCER
// ============================================================================

let announcer: HTMLDivElement | null = null;

function getAnnouncer(): HTMLDivElement {
  if (!announcer) {
    announcer = document.createElement('div');
    announcer.setAttribute('aria-live', 'polite');
    announcer.setAttribute('aria-atomic', 'true');
    announcer.setAttribute('role', 'status');
    announcer.style.cssText = `
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    `;
    document.body.appendChild(announcer);
  }
  return announcer;
}

/**
 * Announce a message to screen readers
 */
export function announce(message: string, priority: 'polite' | 'assertive' = 'polite') {
  const el = getAnnouncer();
  el.setAttribute('aria-live', priority);
  el.textContent = '';
  // Force reflow
  void el.offsetWidth;
  el.textContent = message;
}

/**
 * Hook to announce messages
 */
export function useAnnounce() {
  return useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    announce(message, priority);
  }, []);
}

// ============================================================================
// SKIP LINK HELPERS
// ============================================================================

/**
 * Create skip link target IDs
 */
export const skipLinkTargets = {
  mainContent: 'main-content',
  navigation: 'main-navigation',
  search: 'global-search',
} as const;

/**
 * Component props for skip link targets
 */
export function getSkipLinkTargetProps(target: keyof typeof skipLinkTargets) {
  return {
    id: skipLinkTargets[target],
    tabIndex: -1,
  };
}

// ============================================================================
// REDUCED MOTION
// ============================================================================

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Hook for reduced motion preference
 */
export function usePrefersReducedMotion(): boolean {
  const ref = useRef(prefersReducedMotion());

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => {
      ref.current = mediaQuery.matches;
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return ref.current;
}

// ============================================================================
// HIGH CONTRAST MODE
// ============================================================================

/**
 * Check if user prefers high contrast
 */
export function prefersHighContrast(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-contrast: more)').matches;
}

/**
 * Hook for high contrast preference
 */
export function usePrefersHighContrast(): boolean {
  const ref = useRef(prefersHighContrast());

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-contrast: more)');
    const handleChange = () => {
      ref.current = mediaQuery.matches;
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return ref.current;
}
