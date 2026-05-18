import { Routes, Route } from "react-router-dom";
import Navbar from "@/components/layout/Navbar";
import Home from "@/pages/Home";
import StockDetail from "@/pages/StockDetail";
import Watchlist from "@/pages/Watchlist";
import Alerts from "@/pages/Alerts";
import Compare from "@/pages/Compare";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/stock/:ticker" element={<StockDetail />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/compare" element={<Compare />} />
        </Routes>
      </main>
    </div>
  );
}
