import { useParams, useNavigate, Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Star, ExternalLink, BarChart2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useStockSummary, useHealthScore, useValuation, useMoat,
  useSentiment, useValuationRange, useYoYFinancials, useWatchlist, useMomentum,
  useInsiderTrades,
} from "@/hooks/useStock";
import { api } from "@/api/client";
import HealthScoreCard from "@/components/stock/HealthScore";
import ValuationCard from "@/components/stock/ValuationCard";
import ValuationRangeCard from "@/components/stock/ValuationRangeCard";
import MoatCard from "@/components/stock/MoatAnalysis";
import SentimentCard from "@/components/stock/SentimentBadge";
import FinancialsChart from "@/components/stock/FinancialsChart";
import MomentumCard from "@/components/stock/MomentumCard";
import InsiderTradesCard from "@/components/stock/InsiderTrades";

function fmtMCap(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`;
  return `$${(v / 1e6).toFixed(0)}M`;
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-xs uppercase tracking-wider" style={{ color: "var(--muted)" }}>{label}</span>
      <span className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>{value}</span>
    </div>
  );
}

function CompanyIntro({ stock }: { stock: import("@/types").StockSummary }) {
  const [expanded, setExpanded] = useState(false);

  const desc = stock.description ?? "";
  // Split on sentence boundaries: punctuation followed by whitespace + capital letter
  const sentences = desc.split(/(?<=[.!?])\s+(?=[A-Z])/);
  const firstSentence = sentences[0]?.trim() ?? "";
  const hasMore = sentences.length > 1;

  const stats: { label: string; value: string }[] = [
    stock.industry   ? { label: "Industry",    value: stock.industry }                          : null,
    stock.sector     ? { label: "Sector",      value: stock.sector }                            : null,
    stock.country    ? { label: "Country",     value: stock.country }                           : null,
    stock.employees  ? { label: "Employees",   value: stock.employees.toLocaleString() }        : null,
    stock.market_cap ? { label: "Market Cap",  value: fmtMCap(stock.market_cap) }               : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>

      {/* Stat boxes row */}
      {stats.length > 0 && (
        <div className="flex flex-wrap gap-x-8 gap-y-3 mb-4 pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
          {stats.map(s => <StatBox key={s.label} label={s.label} value={s.value} />)}
          {stock.website && (
            <div className="flex flex-col gap-0.5">
              <span className="text-xs uppercase tracking-wider" style={{ color: "var(--muted)" }}>Website</span>
              <a
                href={stock.website} target="_blank" rel="noopener noreferrer"
                className="text-sm font-semibold flex items-center gap-1 hover:underline"
                style={{ color: "var(--accent)" }}
              >
                {stock.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                <ExternalLink size={11} />
              </a>
            </div>
          )}
        </div>
      )}

      {/* Description */}
      {desc && (
        <div>
          {expanded ? (
            <ul className="flex flex-col gap-2">
              {sentences.map((s, i) => (
                <li key={i} className="flex gap-2.5 text-sm" style={{ color: "var(--muted)" }}>
                  <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: "var(--muted)", opacity: 0.5 }} />
                  <span className="leading-relaxed">{s.trim()}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
              {firstSentence}
            </p>
          )}
          {hasMore && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="mt-2 text-xs font-medium"
              style={{ color: "var(--accent)" }}
            >
              {expanded ? "Show less" : `Read more (${sentences.length - 1} more)`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function StockDetail() {
  const { ticker = "" } = useParams<{ ticker: string }>();
  const t = ticker.toUpperCase();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const { data: stock, isLoading: loadingStock, error: stockError } = useStockSummary(t);
  const { data: health, isLoading: loadingHealth } = useHealthScore(t);
  const { data: valuation, isLoading: loadingVal } = useValuation(t);
  const { data: valuationRange, isLoading: loadingRange } = useValuationRange(t);
  const { data: financials, isLoading: loadingFin } = useYoYFinancials(t);
  const { data: moat, isLoading: loadingMoat } = useMoat(t);
  const { data: sentiment, isLoading: loadingSent } = useSentiment(t);
  const { data: momentum, isLoading: loadingMomentum } = useMomentum(t);
  const { data: insider, isLoading: loadingInsider } = useInsiderTrades(t);
  const { data: watchlist = [] } = useWatchlist();

  const isWatched = watchlist.some((w) => w.ticker === t);

  const addToWatchlist = useMutation({
    mutationFn: () => api.watchlist.add({ ticker: t }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["watchlist"] }),
  });
  const removeFromWatchlist = useMutation({
    mutationFn: () => api.watchlist.remove(t),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  if (loadingStock) return <Spinner label={`Loading ${t}...`} />;
  if (stockError || !stock) return <ErrorMsg ticker={t} />;

  const changeColor = stock.change_pct >= 0 ? "var(--green)" : "var(--red)";

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start gap-4 flex-wrap">
        <div>
          <p className="text-sm" style={{ color: "var(--muted)" }}>{stock.sector}</p>
          <h1 className="text-3xl font-bold">{stock.name}</h1>
          <p className="text-lg" style={{ color: "var(--muted)" }}>{stock.ticker}</p>
        </div>
        <div className="ml-auto text-right flex flex-col items-end gap-2">
          <p className="text-4xl font-bold">${stock.price.toLocaleString()}</p>
          <p className="text-lg font-medium" style={{ color: changeColor }}>
            {stock.change_pct >= 0 ? "+" : ""}{stock.change_pct.toFixed(2)}%
          </p>
          <Link
            to={`/compare?t=${t}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", color: "var(--muted)" }}
          >
            <BarChart2 size={14} /> Compare
          </Link>
          <button
            onClick={() => {
              if (!isAuthenticated) { navigate("/login"); return; }
              isWatched ? removeFromWatchlist.mutate() : addToWatchlist.mutate();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: isWatched ? "var(--accent)" : "var(--surface)",
              border: "1px solid var(--border)",
              color: isWatched ? "white" : "var(--muted)",
            }}
          >
            <Star size={14} fill={isWatched ? "white" : "none"} />
            {isAuthenticated ? (isWatched ? "Watching" : "Add to Watchlist") : "Sign in to Watch"}
          </button>
        </div>
      </div>

      {/* Company intro */}
      <CompanyIntro stock={stock} />

      {/* YoY Financials — full width */}
      {loadingFin
        ? <CardSkeleton title="Financial Performance (5-Year)" fullWidth />
        : financials && <FinancialsChart data={financials} />
      }

      {/* Valuation Range — full width */}
      {loadingRange
        ? <CardSkeleton title="Valuation Range" fullWidth />
        : valuationRange && <ValuationRangeCard data={valuationRange} />
      }

      {/* 2-col grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loadingHealth    ? <CardSkeleton title="AI Health Score" />        : health     && <HealthScoreCard data={health} />}
        {loadingVal       ? <CardSkeleton title="Valuation Metrics" />      : valuation  && <ValuationCard data={valuation} />}
        {loadingMoat      ? <CardSkeleton title="Investment Thesis" />      : moat       && <MoatCard data={moat} />}
        {loadingSent      ? <CardSkeleton title="News Sentiment" />         : sentiment  && <SentimentCard data={sentiment} />}
        {loadingMomentum  ? <CardSkeleton title="Technical Momentum" fullWidth /> : momentum && <MomentumCard data={momentum} />}
        {loadingInsider   ? <CardSkeleton title="Insider Trades" fullWidth />     : insider  && insider.length > 0 && <InsiderTradesCard data={insider} />}
      </div>
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-64 gap-3" style={{ color: "var(--muted)" }}>
      <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
      {label}
    </div>
  );
}

function ErrorMsg({ ticker }: { ticker: string }) {
  return (
    <div className="text-center mt-24" style={{ color: "var(--muted)" }}>
      <p className="text-xl">Could not load data for <strong>{ticker}</strong>.</p>
      <p className="text-sm mt-1">Check the ticker symbol and try again.</p>
    </div>
  );
}

function CardSkeleton({ title, fullWidth }: { title: string; fullWidth?: boolean }) {
  return (
    <div
      className={`p-5 rounded-xl animate-pulse ${fullWidth ? "col-span-1 md:col-span-2" : ""}`}
      style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <p className="text-sm font-medium mb-4" style={{ color: "var(--muted)" }}>{title}</p>
      <div className="h-4 rounded mb-3" style={{ backgroundColor: "var(--border)" }} />
      <div className="h-4 rounded w-3/4" style={{ backgroundColor: "var(--border)" }} />
    </div>
  );
}
