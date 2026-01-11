import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';

// Eager load - frequently accessed, small pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

// Lazy load - heavy pages with code splitting
const ShopManagement = lazy(() => import('./pages/ShopManagement'));
const ShopNetworks = lazy(() => import('./pages/ShopNetworks'));
const CarsPage = lazy(() => import('./pages/CarsPage'));
const PlanningGrid = lazy(() => import('./pages/PlanningGrid'));
const ServicePlanBuilder = lazy(() => import('./pages/ServicePlanBuilder'));
const AnalyticsDashboard = lazy(() => import('./pages/AnalyticsDashboard'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const Settings = lazy(() => import('./pages/Settings'));
const ImportExport = lazy(() => import('./pages/ImportExport'));
const Webhooks = lazy(() => import('./pages/Webhooks'));
const ApiKeys = lazy(() => import('./pages/ApiKeys'));
const SOPSupplySettings = lazy(() => import('./pages/SOPSupplySettings'));

// S&OP Planning Module - Sales & Operations Planning for car flow
const SOPCapacityPage = lazy(() => import('./pages/SOPCapacityPage'));
const SOPPlanningPage = lazy(() => import('./pages/SOPPlanningPage'));
const DemandRegistryPage = lazy(() => import('./pages/DemandRegistryPage'));
const SOPReviewDashboard = lazy(() => import('./pages/SOPReviewDashboard'));

// New Workflow - Proposal & Scheduling Queue
const SchedulingQueue = lazy(() => import('./pages/SchedulingQueue'));

// Scheduling Visibility - New UX Components
const SchedulingDashboard = lazy(() => import('./pages/SchedulingDashboard'));
const PlanOverviewDashboard = lazy(() => import('./pages/PlanOverviewDashboard'));

// Page loading fallback with accessibility support
function PageLoader({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center h-64" role="status" aria-label={message}>
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rail-600 mx-auto" aria-hidden="true"></div>
        <p className="mt-3 text-sm text-steel-500">{message}</p>
      </div>
    </div>
  );
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-steel-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rail-600 mx-auto"></div>
          <p className="mt-4 text-steel-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (user?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="shops" element={<ShopManagement />} />
            <Route path="shop-networks" element={<ShopNetworks />} />
            <Route path="cars" element={<CarsPage />} />
            <Route path="planning" element={<PlanningGrid />} />
            <Route path="service-plans" element={<ServicePlanBuilder />} />
            <Route path="service-plans/:id" element={<ServicePlanBuilder />} />
            <Route path="analytics" element={<AnalyticsDashboard />} />

            {/* S&OP Planning Module Routes */}
            <Route path="sop-review" element={<SOPReviewDashboard />} />
            <Route path="sop-capacity" element={<SOPCapacityPage />} />
            <Route path="sop-plan" element={<SOPPlanningPage />} />
            <Route path="demand-registry" element={<DemandRegistryPage />} />

            {/* New Workflow Routes */}
            <Route path="scheduling-queue" element={<SchedulingQueue />} />
            <Route path="scheduling-dashboard" element={<SchedulingDashboard />} />
            <Route path="plan-overview" element={<PlanOverviewDashboard />} />

            {/* S&OP Supply Settings - admin only */}
            <Route
              path="sop-settings"
              element={
                <AdminRoute>
                  <SOPSupplySettings />
                </AdminRoute>
              }
            />
            {/* Admin-only routes */}
            <Route
              path="import-export"
              element={
                <AdminRoute>
                  <ImportExport />
                </AdminRoute>
              }
            />
            <Route
              path="users"
              element={
                <AdminRoute>
                  <UserManagement />
                </AdminRoute>
              }
            />
            <Route
              path="webhooks"
              element={
                <AdminRoute>
                  <Webhooks />
                </AdminRoute>
              }
            />
            <Route
              path="api-keys"
              element={
                <AdminRoute>
                  <ApiKeys />
                </AdminRoute>
              }
            />
            <Route
              path="settings"
              element={
                <AdminRoute>
                  <Settings />
                </AdminRoute>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
