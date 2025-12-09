import { ChevronRightIcon } from '@heroicons/react/24/outline';
import type { ComponentType, SVGProps } from 'react';

interface KPICardProps {
  name: string;
  value: string;
  description: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  color: string;
  hoverColor: string;
  onClick: () => void;
  isLoading?: boolean;
}

export default function KPICard({
  name,
  value,
  description,
  icon: Icon,
  color,
  hoverColor,
  onClick,
  isLoading = false,
}: KPICardProps) {
  return (
    <button
      onClick={onClick}
      className="card p-4 text-left transition-all duration-200 hover:shadow-md hover:scale-[1.01] group cursor-pointer"
    >
      <div className="flex items-center gap-3">
        <div className={`${color} ${hoverColor} rounded-lg p-2.5 transition-colors`}>
          <Icon className="h-5 w-5 text-white" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-steel-500 truncate">{name}</p>
          <p className="text-xl font-bold text-steel-900">
            {isLoading ? '...' : value}
          </p>
          <p className="text-xs text-steel-400">{description}</p>
        </div>
        <ChevronRightIcon className="h-4 w-4 text-steel-400 group-hover:text-steel-600 transition-colors" />
      </div>
    </button>
  );
}

export function KPICardSkeleton() {
  return (
    <div className="card p-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 bg-steel-200 rounded-lg" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-20 bg-steel-200 rounded" />
          <div className="h-6 w-12 bg-steel-200 rounded" />
          <div className="h-2 w-24 bg-steel-200 rounded" />
        </div>
      </div>
    </div>
  );
}
