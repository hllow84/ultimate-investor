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

/**
 * The 1280px reading column suits every page except the spread scanner, whose
 * dense multi-column table would otherwise be stuck in permanent horizontal
 * scroll. That one route gets the full window instead.
 */
function MainContainer({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const wide = pathname.startsWith("/options");
  return (
    <main className={`flex-1 mx-auto w-full px-4 py-8 ${wide ? "max-w-[1800px]" : "max-w-7xl"}`}>
      {children}
    </main>
  );
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
            <MainContainer>
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
            </MainContainer>
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
