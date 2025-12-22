import { Fragment, useRef } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { ExclamationTriangleIcon, TrashIcon, CheckCircleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';

export type DialogVariant = 'danger' | 'warning' | 'success' | 'info';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: DialogVariant;
  isLoading?: boolean;
}

const variantConfig: Record<DialogVariant, {
  icon: typeof ExclamationTriangleIcon;
  iconBg: string;
  iconColor: string;
  buttonClass: string;
}> = {
  danger: {
    icon: TrashIcon,
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
    buttonClass: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
  },
  warning: {
    icon: ExclamationTriangleIcon,
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    buttonClass: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
  },
  success: {
    icon: CheckCircleIcon,
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600',
    buttonClass: 'bg-green-600 hover:bg-green-700 focus:ring-green-500',
  },
  info: {
    icon: InformationCircleIcon,
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    buttonClass: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
  },
};

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  isLoading = false,
}: ConfirmDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const config = variantConfig[variant];
  const Icon = config.icon;

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-50"
        initialFocus={cancelButtonRef}
        onClose={onClose}
      >
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-steel-900/50 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative transform overflow-hidden rounded-xl bg-white text-left shadow-xl transition-all w-full max-w-md">
                <div className="p-6">
                  <div className="flex items-start gap-4">
                    <div className={`flex-shrink-0 flex h-12 w-12 items-center justify-center rounded-full ${config.iconBg}`}>
                      <Icon className={`h-6 w-6 ${config.iconColor}`} aria-hidden="true" />
                    </div>
                    <div className="flex-1">
                      <Dialog.Title as="h3" className="text-lg font-semibold text-steel-900">
                        {title}
                      </Dialog.Title>
                      <p className="mt-2 text-sm text-steel-600">
                        {message}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="bg-steel-50 px-6 py-4 flex justify-end gap-3">
                  <button
                    type="button"
                    ref={cancelButtonRef}
                    onClick={onClose}
                    disabled={isLoading}
                    className="btn-secondary"
                  >
                    {cancelText}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onConfirm();
                    }}
                    disabled={isLoading}
                    className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 ${config.buttonClass}`}
                  >
                    {isLoading ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Processing...
                      </>
                    ) : (
                      confirmText
                    )}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}

export default ConfirmDialog;
