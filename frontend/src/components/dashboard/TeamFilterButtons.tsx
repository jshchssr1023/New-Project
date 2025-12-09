import {
  CheckCircleIcon,
  ArrowPathIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';

export type TeamFilter = 'all' | 'qualification' | 'assignment_release' | 'in_service_repairs';

interface TeamFilterButtonsProps {
  activeFilter: TeamFilter;
  onFilterChange: (filter: TeamFilter) => void;
}

export default function TeamFilterButtons({ activeFilter, onFilterChange }: TeamFilterButtonsProps) {
  const filters: { key: TeamFilter; label: string; icon?: typeof CheckCircleIcon; colors: { active: string; inactive: string } }[] = [
    {
      key: 'all',
      label: 'All Cars',
      colors: {
        active: 'bg-rail-600 text-white',
        inactive: 'bg-steel-100 text-steel-700 hover:bg-steel-200',
      },
    },
    {
      key: 'qualification',
      label: 'Qualification',
      icon: CheckCircleIcon,
      colors: {
        active: 'bg-indigo-600 text-white',
        inactive: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100',
      },
    },
    {
      key: 'assignment_release',
      label: 'Assignment & Release',
      icon: ArrowPathIcon,
      colors: {
        active: 'bg-orange-600 text-white',
        inactive: 'bg-orange-50 text-orange-700 hover:bg-orange-100',
      },
    },
    {
      key: 'in_service_repairs',
      label: 'In-Service Repairs',
      icon: Cog6ToothIcon,
      colors: {
        active: 'bg-amber-600 text-white',
        inactive: 'bg-amber-50 text-amber-700 hover:bg-amber-100',
      },
    },
  ];

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm font-medium text-steel-500">Team View:</span>
      {filters.map(({ key, label, icon: Icon, colors }) => (
        <button
          key={key}
          onClick={() => onFilterChange(key)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
            activeFilter === key ? colors.active : colors.inactive
          }`}
        >
          {Icon && <Icon className="h-4 w-4" />}
          {label}
        </button>
      ))}
    </div>
  );
}
