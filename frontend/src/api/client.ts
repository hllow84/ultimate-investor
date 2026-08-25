import type {
  StockSummary,
  HealthScore,
  ValuationResult,
  ValuationRange,
  YoYFinancials,
  MoatAnalysis,
  SentimentResult,
  TechnicalMomentum,
  InsiderTrade,
  WatchlistItem,
  Alert,
  Token,
  PortfolioResponse,
  SpreadPositionCreate,
} from "@/types";

const BASE = "/api";

function authHeader(): Record<string, string> {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: authHeader() });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function post<T>(path: string, body: unknown, withAuth = false): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (withAuth) Object.assign(headers, authHeader());
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE", headers: authHeader() });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
}

async function patch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "PATCH", headers: authHeader() });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      post<Token>("/auth/login", { email, password }),
    register: (email: string, password: string) =>
      post<Token>("/auth/register", { email, password }),
  },
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
    momentum: (ticker: string) => get<TechnicalMomentum>(`/analysis/${ticker}/momentum`),
  },
  insider: {
    trades: (ticker: string) => get<InsiderTrade[]>(`/insider/${ticker}`),
  },
  watchlist: {
    list: () => get<WatchlistItem[]>(`/watchlist/`),
    add: (item: WatchlistItem) => post<WatchlistItem>(`/watchlist/`, item, true),
    remove: (ticker: string) => del(`/watchlist/${ticker}`),
  },
  alerts: {
    list: () => get<Alert[]>(`/alerts/`),
    create: (alert: Alert) => post<Alert>(`/alerts/`, alert, true),
    toggle: (id: number) => patch<Alert>(`/alerts/${id}/toggle`),
    delete: (id: number) => del(`/alerts/${id}`),
  },
  options: {
    positions: () => get<PortfolioResponse>(`/options/positions`),
    savePosition: (p: SpreadPositionCreate) =>
      post<{ id: number; ticker: string; expiry: string }>(`/options/positions`, p, true),
    closePosition: (id: number) => patch<{ id: number }>(`/options/positions/${id}/close`),
    deletePosition: (id: number) => del(`/options/positions/${id}`),
  },
};
