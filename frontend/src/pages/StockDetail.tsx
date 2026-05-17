import { useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import {
  useStockSummary, useHealthScore, useValuation, useMoat,
  useSentiment, useValuationRange, useYoYFinancials, useWatchlist,
} from "@/hooks/useStock";
import { api } from "@/api/client";
import HealthScoreCard from "@/components/stock/HealthScore";
import ValuationCard from "@/components/stock/ValuationCard";
import ValuationRangeCard from "@/components/stock/ValuationRangeCard";
import MoatCard from "@/components/stock/MoatAnalysis";
import SentimentCard from "@/components/stock/SentimentBadge";
import FinancialsChart from "@/components/stock/FinancialsChart";

export default function StockDetail() {
  const { ticker = "" } = useParams<{ ticker: string }>();
  const t = ticker.toUpperCase();
  const queryClient = useQueryClient();

  const { data: stock, isLoading: loadingStock, error: stockError } = useStockSummary(t);
  const { data: health, isLoading: loadingHealth } = useHealthScore(t);
  const { data: valuation, isLoading: loadingVal } = useValuation(t);
  const { data: valuationRange, isLoading: loadingRange } = useValuationRange(t);
  const { data: financials, isLoading: loadingFin } = useYoYFinancials(t);
  const { data: moat, isLoading: loadingMoat } = useMoat(t);
  const { data: sentiment, isLoading: loadingSent } = useSentiment(t);
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
          <button
            onClick={() => isWatched ? removeFromWatchlist.mutate() : addToWatchlist.mutate()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: isWatched ? "var(--accent)" : "var(--surface)",
              border: "1px solid var(--border)",
              color: isWatched ? "white" : "var(--muted)",
            }}
          >
            <Star size={14} fill={isWatched ? "white" : "none"} />
            {isWatched ? "Watching" : "Add to Watchlist"}
          </button>
        </div>
      </div>

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
        {loadingHealth  ? <CardSkeleton title="AI Health Score" />  : health     && <HealthScoreCard data={health} />}
        {loadingVal     ? <CardSkeleton title="Valuation Metrics" /> : valuation  && <ValuationCard data={valuation} />}
        {loadingMoat    ? <CardSkeleton title="Moat Analysis" />     : moat       && <MoatCard data={moat} />}
        {loadingSent    ? <CardSkeleton title="News Sentiment" />    : sentiment  && <SentimentCard data={sentiment} />}
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
