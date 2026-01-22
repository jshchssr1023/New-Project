import { InboxIcon } from '@heroicons/react/24/outline';

interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export default function EmptyState({
  icon: Icon = InboxIcon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="text-center py-12 px-6">
      <Icon className="mx-auto h-12 w-12 text-steel-400" aria-hidden="true" />
      <h3 className="mt-4 text-lg font-semibold text-steel-900">{title}</h3>
      <p className="mt-2 text-sm text-steel-500 max-w-sm mx-auto">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-6 btn-primary"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
