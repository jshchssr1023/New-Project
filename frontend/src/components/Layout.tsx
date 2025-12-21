import { Fragment, useState, useCallback } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { Dialog, Menu, Transition } from '@headlessui/react';
import {
  Bars3Icon,
  HomeIcon,
  TruckIcon,
  BuildingStorefrontIcon,
  ArrowsRightLeftIcon,
  BeakerIcon,
  ChartBarIcon,
  ChartPieIcon,
  UsersIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  MagnifyingGlassIcon,
  AdjustmentsHorizontalIcon,
  ArrowUpTrayIcon,
  BellAlertIcon,
  KeyIcon,
  XMarkIcon,
  CalendarDaysIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext';

import { useCarSelection } from '../contexts/CarSelectionContext';

import NotificationBell from './NotificationBell';


// Operations & Planning - Core scheduling/logistics functions
const operationsNavigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Railcars', href: '/cars', icon: TruckIcon },
  { name: 'Shop Network', href: '/shops', icon: BuildingStorefrontIcon },
  { name: 'Planning Grid', href: '/planning', icon: CalendarDaysIcon },
  { name: 'Car Flow Planning', href: '/car-flow', icon: ArrowsRightLeftIcon },
  { name: 'Scenarios', href: '/scenarios', icon: BeakerIcon },
];

// Reporting & Rules - Data review and configuration
const reportingNavigation = [
  { name: 'S&OP Dashboard', href: '/sop-dashboard', icon: ChartPieIcon },
  { name: 'Analytics', href: '/analytics', icon: ChartBarIcon },
  { name: 'Shop Rules', href: '/rules', icon: AdjustmentsHorizontalIcon },
];

// System Administration - System and user management (admin only)
const adminNavigation = [
  { name: 'S&OP Supply', href: '/sop-settings', icon: CalendarDaysIcon },
  { name: 'Import/Export', href: '/import-export', icon: ArrowUpTrayIcon },
  { name: 'Users', href: '/users', icon: UsersIcon },
  { name: 'Webhooks', href: '/webhooks', icon: BellAlertIcon },
  { name: 'API Keys', href: '/api-keys', icon: KeyIcon },
  { name: 'Settings', href: '/settings', icon: Cog6ToothIcon },
];

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { hasSelection, clearSelection, getSelectionSummary } = useCarSelection();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Global search handler - searches across Railcar Number, Customer, Project Number
  const handleGlobalSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (globalSearch.trim()) {
      navigate(`/cars?search=${encodeURIComponent(globalSearch.trim())}`);
      setGlobalSearch('');
    }
  }, [globalSearch, navigate]);

  // Build navigation sections based on user role
  const navSections = [
    { title: 'Operations & Planning', items: operationsNavigation },
    { title: 'Reporting & Rules', items: reportingNavigation },
    ...(user?.role === 'admin' ? [{ title: 'Administration', items: adminNavigation }] : []),
  ];

  return (
    <div className="min-h-screen bg-steel-50">
      {/* Mobile sidebar */}
      <Transition.Root show={sidebarOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50 lg:hidden" onClose={setSidebarOpen}>
          <Transition.Child
            as={Fragment}
            enter="transition-opacity ease-linear duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-opacity ease-linear duration-300"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-steel-900/80" />
          </Transition.Child>

          <div className="fixed inset-0 flex">
            <Transition.Child
              as={Fragment}
              enter="transition ease-in-out duration-300 transform"
              enterFrom="-translate-x-full"
              enterTo="translate-x-0"
              leave="transition ease-in-out duration-300 transform"
              leaveFrom="translate-x-0"
              leaveTo="-translate-x-full"
            >
              <Dialog.Panel className="relative mr-16 flex w-full max-w-xs flex-1">
                <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-steel-800 px-6 pb-4">
                  <div className="flex h-20 shrink-0 items-center justify-center">
                    <img
                      src="/images/chronos-logo.png"
                      alt="Chronos"
                      className="h-12 w-auto"
                    />
                  </div>
                  <nav className="flex flex-1 flex-col">
                    <ul role="list" className="flex flex-1 flex-col gap-y-4">
                      {navSections.map((section) => (
                        <li key={section.title}>
                          <div className="text-xs font-semibold leading-6 text-steel-400 uppercase tracking-wider px-2 mb-1">
                            {section.title}
                          </div>
                          <ul role="list" className="-mx-2 space-y-1">
                            {section.items.map((item) => (
                              <li key={item.name}>
                                <Link
                                  to={item.href}
                                  onClick={() => setSidebarOpen(false)}
                                  className={classNames(
                                    location.pathname === item.href
                                      ? 'bg-rail-600 text-white'
                                      : 'text-steel-300 hover:bg-steel-700 hover:text-white',
                                    'group flex gap-x-3 rounded-md p-2 text-sm font-medium leading-6'
                                  )}
                                >
                                  <item.icon className="h-6 w-6 shrink-0" aria-hidden="true" />
                                  {item.name}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  </nav>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition.Root>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-64 lg:flex-col">
        <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-steel-800 px-6 pb-4">
          <div className="flex h-20 shrink-0 items-center justify-center">
            <img
              src="/images/chronos-logo.png"
              alt="Chronos"
              className="h-16 w-auto"
            />
          </div>
          <nav className="flex flex-1 flex-col">
            <ul role="list" className="flex flex-1 flex-col gap-y-4">
              {navSections.map((section) => (
                <li key={section.title}>
                  <div className="text-xs font-semibold leading-6 text-steel-400 uppercase tracking-wider px-2 mb-1">
                    {section.title}
                  </div>
                  <ul role="list" className="-mx-2 space-y-1">
                    {section.items.map((item) => (
                      <li key={item.name}>
                        <Link
                          to={item.href}
                          className={classNames(
                            location.pathname === item.href
                              ? 'bg-rail-600 text-white'
                              : 'text-steel-300 hover:bg-steel-700 hover:text-white',
                            'group flex gap-x-3 rounded-md p-2 text-sm font-medium leading-6'
                          )}
                        >
                          <item.icon className="h-6 w-6 shrink-0" aria-hidden="true" />
                          {item.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top header */}
        <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-steel-200 bg-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
          <button
            type="button"
            className="-m-2.5 p-2.5 text-steel-700 lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <span className="sr-only">Open sidebar</span>
            <Bars3Icon className="h-6 w-6" aria-hidden="true" />
          </button>

          <div className="h-6 w-px bg-steel-200 lg:hidden" aria-hidden="true" />

          <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
            {/* Global Search Bar */}
            <form onSubmit={handleGlobalSearch} className="flex flex-1 items-center max-w-lg">
              <div className="relative w-full">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <MagnifyingGlassIcon className="h-4 w-4 text-steel-400" />
                </div>
                <input
                  type="text"
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                  placeholder="Search railcar #, customer, or project..."
                  className="block w-full pl-9 pr-3 py-1.5 text-sm border border-steel-300 rounded-lg bg-steel-50 focus:bg-white focus:ring-2 focus:ring-rail-500 focus:border-rail-500 outline-none transition-all placeholder:text-steel-400"
                />
              </div>
            </form>
            <div className="flex items-center gap-x-4 lg:gap-x-6">
              {/* Logo in top right */}
              <img
                src="/images/chronos-logo.png"
                alt="Chronos"
                className="h-8 w-auto"
              />

              {/* Notifications */}
              <NotificationBell />

              {/* User menu */}
              <Menu as="div" className="relative">
                <Menu.Button className="-m-1.5 flex items-center p-1.5">
                  <span className="sr-only">Open user menu</span>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rail-600 text-white">
                    {user?.firstName?.[0]}
                    {user?.lastName?.[0]}
                  </div>
                  <span className="hidden lg:flex lg:items-center">
                    <span className="ml-4 text-sm font-medium text-steel-700">
                      {user?.firstName} {user?.lastName}
                    </span>
                  </span>
                </Menu.Button>
                <Transition
                  as={Fragment}
                  enter="transition ease-out duration-100"
                  enterFrom="transform opacity-0 scale-95"
                  enterTo="transform opacity-100 scale-100"
                  leave="transition ease-in duration-75"
                  leaveFrom="transform opacity-100 scale-100"
                  leaveTo="transform opacity-0 scale-95"
                >
                  <Menu.Items className="absolute right-0 z-10 mt-2.5 w-48 origin-top-right rounded-md bg-white py-2 shadow-lg ring-1 ring-steel-900/5 focus:outline-none">
                    <Menu.Item>
                      {({ active }) => (
                        <Link
                          to="/settings"
                          className={classNames(
                            active ? 'bg-steel-50' : '',
                            'block px-3 py-1 text-sm leading-6 text-steel-900'
                          )}
                        >
                          <Cog6ToothIcon className="mr-2 inline h-5 w-5" />
                          Settings
                        </Link>
                      )}
                    </Menu.Item>
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={handleLogout}
                          className={classNames(
                            active ? 'bg-steel-50' : '',
                            'block w-full px-3 py-1 text-left text-sm leading-6 text-steel-900'
                          )}
                        >
                          <ArrowRightOnRectangleIcon className="mr-2 inline h-5 w-5" />
                          Sign out
                        </button>
                      )}
                    </Menu.Item>
                  </Menu.Items>
                </Transition>
              </Menu>
            </div>
          </div>
        </div>

        {/* Global Car Selection Bar */}
        {hasSelection && (
          <div className="sticky top-16 z-30 bg-rail-600 text-white px-4 py-2 shadow-md">
            <div className="flex items-center justify-between max-w-7xl mx-auto">
              <div className="flex items-center space-x-4">
                <TruckIcon className="h-5 w-5" />
                <span className="text-sm font-medium">{getSelectionSummary()}</span>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => navigate('/scenarios')}
                  className="text-sm bg-rail-500 hover:bg-rail-400 px-3 py-1 rounded transition-colors flex items-center"
                >
                  <BeakerIcon className="h-4 w-4 mr-1" />
                  Scenario Builder
                </button>
                <button
                  onClick={() => navigate('/car-flow')}
                  className="text-sm bg-rail-500 hover:bg-rail-400 px-3 py-1 rounded transition-colors flex items-center"
                >
                  <ArrowsRightLeftIcon className="h-4 w-4 mr-1" />
                  Car Flow
                </button>
                <button
                  onClick={clearSelection}
                  className="text-sm text-rail-200 hover:text-white flex items-center"
                >
                  <XMarkIcon className="h-4 w-4 mr-1" />
                  Clear
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Page content - reduced padding for more real estate */}
        <main className="py-4">
          <div className="px-4 sm:px-5 lg:px-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
