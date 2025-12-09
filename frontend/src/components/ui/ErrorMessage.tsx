import { ExclamationCircleIcon, ArrowPathIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface ErrorMessageProps {
  title?: string;
  message: string;
  details?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  variant?: 'inline' | 'card' | 'banner';
  actionText?: string;
  actionHref?: string;
}

// Map common error codes to user-friendly messages with guidance
const errorGuidance: Record<string, { title: string; guidance: string }> = {
  NETWORK_ERROR: {
    title: 'Connection Problem',
    guidance: 'Check your internet connection and try again.',
  },
  NOT_FOUND: {
    title: 'Not Found',
    guidance: 'The requested item may have been deleted or moved.',
  },
  UNAUTHORIZED: {
    title: 'Session Expired',
    guidance: 'Please log in again to continue.',
  },
  FORBIDDEN: {
    title: 'Access Denied',
    guidance: 'You don\'t have permission to perform this action. Contact your administrator if you need access.',
  },
  VALIDATION_ERROR: {
    title: 'Invalid Input',
    guidance: 'Please check your input and correct any errors.',
  },
  CAPACITY_EXCEEDED: {
    title: 'Capacity Exceeded',
    guidance: 'The shop doesn\'t have enough capacity. Try a different month or shop.',
  },
  DUPLICATE_ENTRY: {
    title: 'Duplicate Entry',
    guidance: 'This record already exists. Update the existing record instead.',
  },
  SERVER_ERROR: {
    title: 'Server Error',
    guidance: 'Something went wrong on our end. Please try again in a few minutes.',
  },
};

export function getErrorGuidance(errorCode?: string, defaultMessage?: string): { title: string; message: string; guidance: string } {
  const code = errorCode?.toUpperCase() || '';
  const errorInfo = errorGuidance[code] || errorGuidance.SERVER_ERROR;

  return {
    title: errorInfo.title,
    message: defaultMessage || 'An unexpected error occurred.',
    guidance: errorInfo.guidance,
  };
}

export default function ErrorMessage({
  title,
  message,
  details,
  onRetry,
  onDismiss,
  variant = 'inline',
  actionText,
  actionHref,
}: ErrorMessageProps) {
  if (variant === 'banner') {
    return (
      <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
        <div className="flex items-start">
          <ExclamationCircleIcon className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div className="ml-3 flex-1">
            {title && (
              <h3 className="text-sm font-medium text-red-800">{title}</h3>
            )}
            <p className="text-sm text-red-700 mt-1">{message}</p>
            {details && (
              <p className="text-xs text-red-600 mt-2">{details}</p>
            )}
            <div className="mt-3 flex gap-3">
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="text-sm font-medium text-red-800 hover:text-red-900 flex items-center gap-1"
                >
                  <ArrowPathIcon className="h-4 w-4" />
                  Try Again
                </button>
              )}
              {actionText && actionHref && (
                <a
                  href={actionHref}
                  className="text-sm font-medium text-red-800 hover:text-red-900"
                >
                  {actionText}
                </a>
              )}
            </div>
          </div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="ml-3 text-red-500 hover:text-red-700"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div className="card p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <ExclamationCircleIcon className="h-6 w-6 text-red-600" />
        </div>
        {title && (
          <h3 className="mt-4 text-lg font-semibold text-steel-900">{title}</h3>
        )}
        <p className="mt-2 text-sm text-steel-600">{message}</p>
        {details && (
          <p className="mt-2 text-xs text-steel-500 bg-steel-50 rounded p-2 font-mono">
            {details}
          </p>
        )}
        <div className="mt-4 flex justify-center gap-3">
          {onRetry && (
            <button onClick={onRetry} className="btn-primary flex items-center gap-2">
              <ArrowPathIcon className="h-4 w-4" />
              Try Again
            </button>
          )}
          {actionText && actionHref && (
            <a href={actionHref} className="btn-secondary">
              {actionText}
            </a>
          )}
        </div>
      </div>
    );
  }

  // Default inline variant
  return (
    <div className="flex items-start gap-2 text-red-600 bg-red-50 rounded-lg p-3">
      <ExclamationCircleIcon className="h-5 w-5 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        {title && <p className="font-medium text-sm">{title}</p>}
        <p className="text-sm">{message}</p>
        {details && (
          <p className="text-xs text-red-500 mt-1">{details}</p>
        )}
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-2 text-xs font-medium text-red-700 hover:text-red-900 flex items-center gap-1"
          >
            <ArrowPathIcon className="h-3 w-3" />
            Try again
          </button>
        )}
      </div>
      {onDismiss && (
        <button onClick={onDismiss} className="text-red-500 hover:text-red-700">
          <XMarkIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
