import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, TrendingUp, Bell, Star } from "lucide-react";

export default function Navbar() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const ticker = query.trim().toUpperCase();
    if (ticker) {
      navigate(`/stock/${ticker}`);
      setQuery("");
    }
  }

  return (
    <nav
      style={{ backgroundColor: "var(--surface)", borderBottom: "1px solid var(--border)" }}
      className="sticky top-0 z-50 px-6 py-3 flex items-center gap-6"
    >
      <Link to="/" className="flex items-center gap-2 font-bold text-lg" style={{ color: "var(--accent)" }}>
        <TrendingUp size={22} />
        Ultimate Investor
      </Link>

      <form onSubmit={handleSearch} className="flex-1 max-w-md">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--muted)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ticker (e.g. AAPL)"
            className="w-full pl-9 pr-4 py-2 rounded-lg text-sm outline-none"
            style={{
              backgroundColor: "var(--bg)",
              border: "1px solid var(--border)",
              color: "var(--text)",
            }}
          />
        </div>
      </form>

      <div className="flex items-center gap-4 ml-auto">
        <Link to="/watchlist" className="flex items-center gap-1.5 text-sm" style={{ color: "var(--muted)" }}>
          <Star size={16} /> Watchlist
        </Link>
        <Link to="/alerts" className="flex items-center gap-1.5 text-sm" style={{ color: "var(--muted)" }}>
          <Bell size={16} /> Alerts
        </Link>
      </div>
    </nav>
  );
}
