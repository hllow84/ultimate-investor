import type {
  StockSummary,
  HealthScore,
  ValuationResult,
  ValuationRange,
  YoYFinancials,
  MoatAnalysis,
  SentimentResult,
  WatchlistItem,
  Alert,
} from "@/types";

const BASE = "/api";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
}

export const api = {
  stocks: {
    summary: (ticker: string) => get<StockSummary>(`/stocks/${ticker}`),
    news: (ticker: string) => get<unknown[]>(`/stocks/${ticker}/news`),
  },
  analysis: {
    health: (ticker: string) => get<HealthScore>(`/analysis/${ticker}/health`),
    valuation: (ticker: string) => get<ValuationResult>(`/analysis/${ticker}/valuation`),
    valuationRange: (ticker: string) => get<ValuationRange>(`/analysis/${ticker}/valuation-range`),
    financials: (ticker: string) => get<YoYFinancials>(`/analysis/${ticker}/financials`),
    moat: (ticker: string) => get<MoatAnalysis>(`/analysis/${ticker}/moat`),
    sentiment: (ticker: string) => get<SentimentResult>(`/analysis/${ticker}/sentiment`),
  },
  watchlist: {
    list: () => get<WatchlistItem[]>(`/watchlist/`),
    add: (item: WatchlistItem) => post<WatchlistItem>(`/watchlist/`, item),
    remove: (ticker: string) => del(`/watchlist/${ticker}`),
  },
  alerts: {
    list: () => get<Alert[]>(`/alerts/`),
    create: (alert: Alert) => post<Alert>(`/alerts/`, alert),
    delete: (id: number) => del(`/alerts/${id}`),
  },
};
