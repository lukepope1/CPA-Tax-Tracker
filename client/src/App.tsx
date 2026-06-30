import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import ClientDetail from "./pages/ClientDetail";
import DueDates from "./pages/DueDates";
import TimeEntries from "./pages/TimeEntries";
import Trash from "./pages/Trash";
import Billing from "./pages/Billing";
import FirmDashboard from "./pages/FirmDashboard";
import Admin from "./pages/Admin";

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AdminRoute({ children }: { children: JSX.Element }) {
  const { user } = useAuth();
  if (user?.role !== "ADMIN") return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/clients/:id" element={<ClientDetail />} />
        <Route path="/due-dates" element={<DueDates />} />
        <Route path="/time" element={<TimeEntries />} />
        <Route path="/trash" element={<Trash />} />
        <Route path="/billing" element={<AdminRoute><Billing /></AdminRoute>} />
        <Route path="/firm" element={<AdminRoute><FirmDashboard /></AdminRoute>} />
        <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
