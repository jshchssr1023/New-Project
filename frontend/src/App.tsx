import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ShopManagement from './pages/ShopManagement';
import CarManagement from './pages/CarManagement';
import PlanningGrid from './pages/PlanningGrid';
import ScenarioManager from './pages/ScenarioManager';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
import UserManagement from './pages/UserManagement';
import Settings from './pages/Settings';

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
        <Route path="scenarios" element={<ScenarioManager />} />
        <Route path="analytics" element={<AnalyticsDashboard />} />
        <Route
          path="users"
          element={
            <AdminRoute>
              <UserManagement />
            </AdminRoute>
          }
        />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
