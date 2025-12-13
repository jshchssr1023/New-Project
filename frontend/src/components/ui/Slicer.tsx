/**
 * Slicer - Dropdown Filter Component
 *
 * A reusable slicer/dropdown filter component styled to match the reference UI.
 * Supports single and multi-select modes with a clean, modern appearance.
 */

import { Fragment, useState, useRef, useEffect } from 'react';
import { Listbox, Transition, Popover } from '@headlessui/react';
import { ChevronDownIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';

export interface SlicerOption {
  value: string;
  label: string;
  count?: number;
}

interface SlicerProps {
  label: string;
  options: SlicerOption[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  multiple?: boolean;
  placeholder?: string;
  showCounts?: boolean;
  clearable?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function Slicer({
  label,
  options,
  value,
  onChange,
  multiple = false,
  placeholder = 'All',
  showCounts = false,
  clearable = true,
  className = '',
  size = 'md',
}: SlicerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Size classes
  const sizeClasses = {
    sm: 'text-xs px-2.5 py-1.5',
    md: 'text-sm px-3 py-2',
    lg: 'text-base px-4 py-2.5',
  };

  // Get display text
  const getDisplayText = () => {
    if (multiple) {
      const values = value as string[];
      if (values.length === 0) return placeholder;
      if (values.length === 1) {
        const option = options.find((o) => o.value === values[0]);
        return option?.label || values[0];
      }
      return `${values.length} selected`;
    } else {
      if (!value || value === '') return placeholder;
      const option = options.find((o) => o.value === value);
      return option?.label || value;
    }
  };

  // Check if value is selected (for multi-select)
  const isSelected = (optionValue: string) => {
    if (multiple) {
      return (value as string[]).includes(optionValue);
    }
    return value === optionValue;
  };

  // Handle option click
  const handleSelect = (optionValue: string) => {
    if (multiple) {
      const currentValues = value as string[];
      if (currentValues.includes(optionValue)) {
        onChange(currentValues.filter((v) => v !== optionValue));
      } else {
        onChange([...currentValues, optionValue]);
      }
    } else {
      onChange(optionValue === value ? '' : optionValue);
      setIsOpen(false);
    }
  };

  // Handle clear
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(multiple ? [] : '');
  };

  // Check if has value
  const hasValue = multiple
    ? (value as string[]).length > 0
    : value !== '' && value !== null && value !== undefined;

  return (
    <Popover className={`relative ${className}`}>
      {({ open }) => (
        <>
          <Popover.Button
            ref={buttonRef}
            className={`
              inline-flex items-center justify-between gap-2 rounded-lg border
              ${hasValue
                ? 'border-crimson-300 bg-crimson-50 text-crimson-700'
                : 'border-steel-300 bg-white text-steel-700 hover:bg-steel-50'
              }
              ${sizeClasses[size]}
              font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-crimson-500 focus:ring-offset-1
              min-w-[120px]
            `}
          >
            <span className="flex items-center gap-1.5">
              <span className={`${hasValue ? 'text-crimson-600' : 'text-steel-500'} font-normal`}>
                {label}
              </span>
              <span className={hasValue ? 'text-crimson-700 font-medium' : ''}>
                {getDisplayText()}
              </span>
            </span>
            <span className="flex items-center gap-1">
              {clearable && hasValue && (
                <button
                  onClick={handleClear}
                  className="p-0.5 hover:bg-crimson-100 rounded transition-colors"
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                </button>
              )}
              <ChevronDownIcon
                className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
              />
            </span>
          </Popover.Button>

          <Transition
            as={Fragment}
            enter="transition ease-out duration-100"
            enterFrom="transform opacity-0 scale-95"
            enterTo="transform opacity-100 scale-100"
            leave="transition ease-in duration-75"
            leaveFrom="transform opacity-100 scale-100"
            leaveTo="transform opacity-0 scale-95"
          >
            <Popover.Panel className="absolute left-0 z-50 mt-1 w-56 origin-top-left rounded-lg bg-white shadow-lg ring-1 ring-black/5 focus:outline-none">
              <div className="py-1 max-h-60 overflow-y-auto">
                {/* All/Clear option for single select */}
                {!multiple && (
                  <button
                    onClick={() => {
                      onChange('');
                      setIsOpen(false);
                    }}
                    className={`
                      w-full text-left px-4 py-2 text-sm flex items-center justify-between
                      ${!hasValue
                        ? 'bg-crimson-50 text-crimson-700'
                        : 'text-steel-700 hover:bg-steel-50'
                      }
                    `}
                  >
                    <span>{placeholder}</span>
                    {!hasValue && <CheckIcon className="h-4 w-4 text-crimson-600" />}
                  </button>
                )}

                {/* Options */}
                {options.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleSelect(option.value)}
                    className={`
                      w-full text-left px-4 py-2 text-sm flex items-center justify-between
                      ${isSelected(option.value)
                        ? 'bg-crimson-50 text-crimson-700'
                        : 'text-steel-700 hover:bg-steel-50'
                      }
                    `}
                  >
                    <span className="flex items-center gap-2">
                      {multiple && (
                        <span
                          className={`
                            w-4 h-4 rounded border flex items-center justify-center
                            ${isSelected(option.value)
                              ? 'bg-crimson-600 border-crimson-600'
                              : 'border-steel-300'
                            }
                          `}
                        >
                          {isSelected(option.value) && (
                            <CheckIcon className="h-3 w-3 text-white" />
                          )}
                        </span>
                      )}
                      <span>{option.label}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {showCounts && option.count !== undefined && (
                        <span className="text-xs text-steel-400">{option.count}</span>
                      )}
                      {!multiple && isSelected(option.value) && (
                        <CheckIcon className="h-4 w-4 text-crimson-600" />
                      )}
                    </span>
                  </button>
                ))}

                {options.length === 0 && (
                  <div className="px-4 py-2 text-sm text-steel-500 italic">
                    No options available
                  </div>
                )}
              </div>

              {/* Multi-select footer */}
              {multiple && (value as string[]).length > 0 && (
                <div className="border-t border-steel-200 px-4 py-2 flex items-center justify-between">
                  <span className="text-xs text-steel-500">
                    {(value as string[]).length} selected
                  </span>
                  <button
                    onClick={handleClear}
                    className="text-xs text-crimson-600 hover:text-crimson-700 font-medium"
                  >
                    Clear all
                  </button>
                </div>
              )}
            </Popover.Panel>
          </Transition>
        </>
      )}
    </Popover>
  );
}

/**
 * SlicerBar - A horizontal bar of multiple slicers
 */
interface SlicerBarProps {
  children: React.ReactNode;
  className?: string;
}

export function SlicerBar({ children, className = '' }: SlicerBarProps) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {children}
    </div>
  );
}

/**
 * SlicerGroup - A labeled group of slicers
 */
interface SlicerGroupProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function SlicerGroup({ title, children, className = '' }: SlicerGroupProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {title && (
        <span className="text-xs font-medium text-steel-500 uppercase tracking-wide">
          {title}
        </span>
      )}
      {children}
    </div>
  );
}
