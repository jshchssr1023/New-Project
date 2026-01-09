import { useToast, ToastType } from '../../contexts/ToastContext';
import { XMarkIcon, CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';

const toastStyles: Record<ToastType, { bg: string; border: string; text: string; icon: string }> = {
  success: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-800',
    icon: 'text-emerald-500',
  },
  error: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-800',
    icon: 'text-red-500',
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-800',
    icon: 'text-amber-500',
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-800',
    icon: 'text-blue-500',
  },
};

const ToastIcon = ({ type }: { type: ToastType }) => {
  const className = `h-5 w-5 ${toastStyles[type].icon}`;

  switch (type) {
    case 'success':
      return <CheckCircleIcon className={className} />;
    case 'error':
      return <XCircleIcon className={className} />;
    case 'warning':
      return <ExclamationTriangleIcon className={className} />;
    case 'info':
    default:
      return <InformationCircleIcon className={className} />;
  }
};

export default function ToastContainer() {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((toast) => {
        const styles = toastStyles[toast.type];

        return (
          <div
            key={toast.id}
            className={`
              ${styles.bg} ${styles.border} ${styles.text}
              border rounded-lg shadow-lg p-4 pr-10
              animate-slide-in-right
              relative
            `}
            role="alert"
            aria-live="polite"
          >
            <div className="flex items-start gap-3">
              <ToastIcon type={toast.type} />
              <p className="text-sm font-medium">{toast.message}</p>
            </div>
            <button
              onClick={() => dismissToast(toast.id)}
              className={`
                absolute top-2 right-2 p-1 rounded-md
                hover:bg-black/5 transition-colors
                ${styles.text}
              `}
              aria-label="Dismiss notification"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
