/**
 * Drawer Component - Reusable slide-out drawer for sidebars
 */

import { Fragment, ReactNode } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  position?: 'left' | 'right';
  width?: 'sm' | 'md' | 'lg' | 'xl';
  showCloseButton?: boolean;
  footer?: ReactNode;
}

const widthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

export default function Drawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  position = 'right',
  width = 'md',
  showCloseButton = true,
  footer,
}: DrawerProps) {
  const isRight = position === 'right';

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        {/* Backdrop */}
        <Transition.Child
          as={Fragment}
          enter="ease-in-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in-out duration-300"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div
              className={`pointer-events-none fixed inset-y-0 flex ${
                isRight ? 'right-0' : 'left-0'
              }`}
            >
              <Transition.Child
                as={Fragment}
                enter="transform transition ease-in-out duration-300"
                enterFrom={isRight ? 'translate-x-full' : '-translate-x-full'}
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-300"
                leaveFrom="translate-x-0"
                leaveTo={isRight ? 'translate-x-full' : '-translate-x-full'}
              >
                <Dialog.Panel
                  className={`pointer-events-auto w-screen ${widthClasses[width]}`}
                >
                  <div className="flex h-full flex-col bg-white shadow-xl">
                    {/* Header */}
                    {(title || showCloseButton) && (
                      <div className="flex items-start justify-between px-4 py-4 border-b border-steel-200">
                        <div>
                          {title && (
                            <Dialog.Title className="text-lg font-semibold text-steel-900">
                              {title}
                            </Dialog.Title>
                          )}
                          {subtitle && (
                            <p className="text-sm text-steel-500 mt-0.5">
                              {subtitle}
                            </p>
                          )}
                        </div>
                        {showCloseButton && (
                          <button
                            type="button"
                            className="rounded-md text-steel-400 hover:text-steel-600 focus:outline-none focus:ring-2 focus:ring-rail-500"
                            onClick={onClose}
                          >
                            <span className="sr-only">Close panel</span>
                            <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    )}

                    {/* Content */}
                    <div className="relative flex-1 overflow-y-auto">
                      {children}
                    </div>

                    {/* Footer */}
                    {footer && (
                      <div className="flex-shrink-0 border-t border-steel-200 px-4 py-3 bg-steel-50">
                        {footer}
                      </div>
                    )}
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
