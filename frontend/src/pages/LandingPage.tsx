/**
 * Landing Page
 *
 * Initial page users see after login. Provides quick navigation
 * to main areas of the application.
 */

import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ClipboardDocumentListIcon,
  BuildingStorefrontIcon,
  TruckIcon,
  ChartBarIcon,
  CalendarDaysIcon,
  DocumentCheckIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  ArrowRightIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import { analyticsApi } from '../services/api/analytics';
import { useAuth } from '../contexts/AuthContext';

export default function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Fetch SST status for quick stats
  const { data: sstStatus, isLoading } = useQuery({
    queryKey: ['sst-status-landing'],
    queryFn: () => analyticsApi.getSSTStatus(),
    staleTime: 30000, // Cache for 30 seconds
  });

  const quickActions = [
    {
      title: 'Team Leader Dashboard',
      description: 'View KPIs, queue status, and planning overview',
      icon: ChartBarIcon,
      path: '/dashboard',
      color: 'bg-indigo-500',
      hoverColor: 'hover:bg-indigo-600',
    },
    {
      title: 'Service Plans',
      description: 'View, confirm, and manage service plans',
      icon: DocumentCheckIcon,
      path: '/service-plans-management',
      color: 'bg-amber-500',
      hoverColor: 'hover:bg-amber-600',
      badge: sstStatus ? sstStatus.statusCounts.draft + sstStatus.statusCounts.pendingReview : undefined,
      badgeColor: 'bg-red-500',
    },
    {
      title: 'S&OP Review',
      description: 'Sales & Operations Planning dashboard',
      icon: ClipboardDocumentListIcon,
      path: '/sop-review',
      color: 'bg-purple-500',
      hoverColor: 'hover:bg-purple-600',
    },
    {
      title: 'Car Fleet',
      description: 'Browse and search all railcars',
      icon: TruckIcon,
      path: '/cars',
      color: 'bg-rail-500',
      hoverColor: 'hover:bg-rail-600',
    },
    {
      title: 'Shop Networks',
      description: 'View shop capacity and allocations',
      icon: BuildingStorefrontIcon,
      path: '/shop-networks',
      color: 'bg-emerald-500',
      hoverColor: 'hover:bg-emerald-600',
    },
    {
      title: 'Planning Grid',
      description: 'Monthly car-to-shop allocation planning',
      icon: CalendarDaysIcon,
      path: '/planning',
      color: 'bg-cyan-500',
      hoverColor: 'hover:bg-cyan-600',
    },
  ];

  return (
    <div className="min-h-[calc(100vh-120px)] flex flex-col">
      {/* Welcome Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-steel-900">
          Welcome back, {user?.name || 'User'}
        </h1>
        <p className="text-steel-500 mt-2">
          Rail car service scheduling and S&OP planning platform
        </p>
      </div>

      {/* Quick Stats */}
      {sstStatus && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="card p-4 border-l-4 border-l-red-500">
            <div className="flex items-center gap-2 mb-1">
              <ExclamationTriangleIcon className="h-4 w-4 text-red-600" />
              <span className="text-xs font-medium text-red-700">Needs Planning</span>
            </div>
            <p className="text-2xl font-bold text-red-900">{sstStatus.planningStates.needsPlanning}</p>
          </div>

          <div className="card p-4 border-l-4 border-l-amber-500">
            <div className="flex items-center gap-2 mb-1">
              <ClockIcon className="h-4 w-4 text-amber-600" />
              <span className="text-xs font-medium text-amber-700">Awaiting Confirmation</span>
            </div>
            <p className="text-2xl font-bold text-amber-900">{sstStatus.planningStates.notConfirmed}</p>
          </div>

          <div className="card p-4 border-l-4 border-l-blue-500">
            <div className="flex items-center gap-2 mb-1">
              <DocumentCheckIcon className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-medium text-blue-700">Confirmed</span>
            </div>
            <p className="text-2xl font-bold text-blue-900">{sstStatus.planningStates.confirmed}</p>
          </div>

          <div className="card p-4 border-l-4 border-l-green-500">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircleIcon className="h-4 w-4 text-green-600" />
              <span className="text-xs font-medium text-green-700">Fleet Coverage</span>
            </div>
            <p className="text-2xl font-bold text-green-900">{sstStatus.fleetCoverage.planningRate}%</p>
          </div>
        </div>
      )}

      {/* Priority Alert - Plans needing confirmation */}
      {sstStatus && (sstStatus.statusCounts.draft + sstStatus.statusCounts.pendingReview) > 0 && (
        <div
          className="card p-4 mb-8 bg-amber-50 border-amber-200 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate('/service-plans-management')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-amber-100 rounded-lg p-2">
                <ClockIcon className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-amber-900">Plans Awaiting Action</h3>
                <p className="text-sm text-amber-700">
                  You have {sstStatus.statusCounts.draft} draft and {sstStatus.statusCounts.pendingReview} pending review plans
                </p>
              </div>
            </div>
            <ArrowRightIcon className="h-5 w-5 text-amber-600" />
          </div>
        </div>
      )}

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 flex-1">
        {quickActions.map((action) => (
          <button
            key={action.path}
            onClick={() => navigate(action.path)}
            className="card p-6 text-left hover:shadow-lg transition-all duration-200 group relative overflow-hidden"
          >
            <div className="flex items-start gap-4">
              <div className={`${action.color} ${action.hoverColor} rounded-xl p-3 transition-colors`}>
                <action.icon className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-steel-900 group-hover:text-rail-600 transition-colors">
                    {action.title}
                  </h3>
                  {action.badge !== undefined && action.badge > 0 && (
                    <span className={`${action.badgeColor} text-white text-xs px-2 py-0.5 rounded-full`}>
                      {action.badge}
                    </span>
                  )}
                </div>
                <p className="text-sm text-steel-500 mt-1">{action.description}</p>
              </div>
              <ArrowRightIcon className="h-5 w-5 text-steel-300 group-hover:text-steel-500 group-hover:translate-x-1 transition-all" />
            </div>
          </button>
        ))}
      </div>

      {/* Footer Links */}
      <div className="mt-8 pt-6 border-t border-steel-200">
        <div className="flex items-center justify-between text-sm">
          <div className="flex gap-4">
            <button
              onClick={() => navigate('/analytics')}
              className="text-steel-500 hover:text-steel-700"
            >
              Analytics Dashboard
            </button>
            <button
              onClick={() => navigate('/demand-registry')}
              className="text-steel-500 hover:text-steel-700"
            >
              Demand Registry
            </button>
            <button
              onClick={() => navigate('/scheduling-dashboard')}
              className="text-steel-500 hover:text-steel-700"
            >
              Scheduling Dashboard
            </button>
          </div>
          {user?.role === 'admin' && (
            <button
              onClick={() => navigate('/settings')}
              className="flex items-center gap-1 text-steel-500 hover:text-steel-700"
            >
              <Cog6ToothIcon className="h-4 w-4" />
              Settings
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
