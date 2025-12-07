import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ShopManagement from './pages/ShopManagement';
import CarManagement from './pages/CarManagement';
import PlanningGrid from './pages/PlanningGrid';
import CarFlowPlanning from './pages/CarFlowPlanning';
import ScenarioManager from './pages/ScenarioManager';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
import UserManagement from './pages/UserManagement';
import Settings from './pages/Settings';
import RuleBuilder from './pages/RuleBuilder';
import ImportExport from './pages/ImportExport';
import Webhooks from './pages/Webhooks';
import ApiKeys from './pages/ApiKeys';
import MasterPlanView from './pages/MasterPlanView';
import CustomerSchedule from './pages/CustomerSchedule';
import ShopSchedule from './pages/ShopSchedule';

// Gold Standard Master Plan Wizard components
import MasterPlanWizard from './pages/MasterPlanWizard';
import MasterPlanAuditLog from './components/MasterPlanAuditLog';
import ImportWorkflow from './components/ImportWorkflow';

// Wrapper component for ImportWorkflow as a standalone page
function ImportWorkflowPage() {
  const navigate = useNavigate();
  return (
    <ImportWorkflow
      sessionType="cars"
      onComplete={() => navigate('/cars')}
      onCancel={() => navigate(-1)}
    />
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
        <Route path="cars" element={<CarManagement />} />
        <Route path="planning" element={<PlanningGrid />} />
        <Route path="car-flow" element={<CarFlowPlanning />} />
        <Route path="scenarios" element={<ScenarioManager />} />
        <Route path="masterplan" element={<MasterPlanView />} />
        <Route path="masterplan/:id" element={<MasterPlanView />} />
        <Route path="master-plan-wizard" element={<MasterPlanWizard />} />
        <Route path="master-plan-wizard/:masterPlanId" element={<MasterPlanWizard />} />
        <Route path="master-plan-audit" element={<MasterPlanAuditLog />} />
        <Route path="import-workflow" element={<ImportWorkflowPage />} />
        <Route path="customer-schedule/:customerId" element={<CustomerSchedule />} />
        <Route path="shop-schedule/:shopId" element={<ShopSchedule />} />
        <Route path="analytics" element={<AnalyticsDashboard />} />
        <Route path="rules" element={<RuleBuilder />} />
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
  );
}
