import { useParams } from "react-router-dom";
import { useStockSummary, useHealthScore, useValuation, useMoat, useSentiment } from "@/hooks/useStock";
import HealthScoreCard from "@/components/stock/HealthScore";
import ValuationCard from "@/components/stock/ValuationCard";
import MoatCard from "@/components/stock/MoatAnalysis";
import SentimentCard from "@/components/stock/SentimentBadge";

export default function StockDetail() {
  const { ticker = "" } = useParams<{ ticker: string }>();
  const t = ticker.toUpperCase();

  const { data: stock, isLoading: loadingStock, error: stockError } = useStockSummary(t);
  const { data: health, isLoading: loadingHealth } = useHealthScore(t);
  const { data: valuation, isLoading: loadingVal } = useValuation(t);
  const { data: moat, isLoading: loadingMoat } = useMoat(t);
  const { data: sentiment, isLoading: loadingSent } = useSentiment(t);

  if (loadingStock) return <Spinner label={`Loading ${t}...`} />;
  if (stockError || !stock) return <Error ticker={t} />;

  const changeColor = stock.change_pct >= 0 ? "var(--green)" : "var(--red)";

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-end gap-4">
        <div>
          <p className="text-sm" style={{ color: "var(--muted)" }}>{stock.sector}</p>
          <h1 className="text-3xl font-bold">{stock.name}</h1>
          <p className="text-lg" style={{ color: "var(--muted)" }}>{stock.ticker}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-4xl font-bold">${stock.price.toLocaleString()}</p>
          <p className="text-lg font-medium" style={{ color: changeColor }}>
            {stock.change_pct >= 0 ? "+" : ""}{stock.change_pct.toFixed(2)}%
          </p>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loadingHealth ? <CardSkeleton title="AI Health Score" /> : health && <HealthScoreCard data={health} />}
        {loadingVal ? <CardSkeleton title="Valuation" /> : valuation && <ValuationCard data={valuation} />}
        {loadingMoat ? <CardSkeleton title="Moat Analysis" /> : moat && <MoatCard data={moat} />}
        {loadingSent ? <CardSkeleton title="News Sentiment" /> : sentiment && <SentimentCard data={sentiment} />}
      </div>
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-64 gap-3" style={{ color: "var(--muted)" }}>
      <div className="w-6 h-6 border-2 border-t-indigo-500 rounded-full animate-spin" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
      {label}
    </div>
  );
}

function Error({ ticker }: { ticker: string }) {
  return (
    <div className="text-center mt-24" style={{ color: "var(--muted)" }}>
      <p className="text-xl">Could not load data for <strong>{ticker}</strong>.</p>
      <p className="text-sm mt-1">Check the ticker symbol and try again.</p>
    </div>
  );
}

function CardSkeleton({ title }: { title: string }) {
  return (
    <div className="p-5 rounded-xl animate-pulse" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
      <p className="text-sm font-medium mb-4" style={{ color: "var(--muted)" }}>{title}</p>
      <div className="h-4 rounded mb-3" style={{ backgroundColor: "var(--border)" }} />
      <div className="h-4 rounded w-3/4" style={{ backgroundColor: "var(--border)" }} />
    </div>
  );
}
