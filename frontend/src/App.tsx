import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/layout/Navbar";
import Home from "@/pages/Home";
import StockDetail from "@/pages/StockDetail";
import Watchlist from "@/pages/Watchlist";
import Alerts from "@/pages/Alerts";
import Compare from "@/pages/Compare";
import OptionsSpreads from "@/pages/OptionsSpreads";
import Login from "@/pages/Login";
import Register from "@/pages/Register";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="*"
        element={
          <div className="min-h-screen flex flex-col">
            <Navbar />
            <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/stock/:ticker" element={<StockDetail />} />
                <Route path="/compare" element={<Compare />} />
                <Route path="/options" element={<OptionsSpreads />} />
                <Route
                  path="/watchlist"
                  element={
                    <ProtectedRoute>
                      <Watchlist />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/alerts"
                  element={
                    <ProtectedRoute>
                      <Alerts />
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </main>
          </div>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
