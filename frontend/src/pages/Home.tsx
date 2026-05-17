import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { TrendingUp, Search } from "lucide-react";

const POPULAR = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "TSLA", "META", "NFLX"];

export default function Home() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const ticker = query.trim().toUpperCase();
    if (ticker) navigate(`/stock/${ticker}`);
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 text-center">
      <div className="flex flex-col items-center gap-3">
        <TrendingUp size={48} style={{ color: "var(--accent)" }} />
        <h1 className="text-4xl font-bold">Ultimate Investor</h1>
        <p className="text-lg" style={{ color: "var(--muted)" }}>
          AI-powered stock research. Health scores, valuations, moat analysis, and sentiment.
        </p>
      </div>

      <form onSubmit={handleSearch} className="w-full max-w-lg">
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "var(--muted)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter a ticker symbol (e.g. AAPL, MSFT, NVDA)"
            className="w-full pl-12 pr-4 py-4 rounded-xl text-base outline-none"
            style={{
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--text)",
            }}
          />
        </div>
      </form>

      <div className="flex flex-wrap gap-2 justify-center">
        {POPULAR.map((t) => (
          <button
            key={t}
            onClick={() => navigate(`/stock/${t}`)}
            className="px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
            style={{
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--text)",
            }}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
