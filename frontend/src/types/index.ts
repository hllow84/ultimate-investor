export interface StockSummary {
  ticker: string;
  name: string;
  price: number;
  change_pct: number;
  market_cap?: number;
  sector?: string;
}

export interface HealthScore {
  ticker: string;
  overall: number;
  profitability: number;
  debt: number;
  growth: number;
  efficiency: number;
  valuation: number;
  momentum: number;
  summary: string;
}

export interface ValuationResult {
  ticker: string;
  dcf_value?: number;
  pe_ratio?: number;
  ev_ebitda?: number;
  peg_ratio?: number;
  price_to_book?: number;
  fair_value_estimate: number;
  upside_pct: number;
  verdict: "undervalued" | "fairly valued" | "overvalued";
}

export interface MoatAnalysis {
  ticker: string;
  moat_score: number;
  competitive_advantages: string[];
  risks: string[];
  growth_drivers: string[];
  ai_summary: string;
}

export interface SentimentResult {
  ticker: string;
  news_sentiment: number;
  earnings_sentiment?: number;
  headline_count: number;
  summary: string;
}

export interface WatchlistItem {
  ticker: string;
  added_at?: string;
  notes?: string;
}

export interface Alert {
  id?: number;
  ticker: string;
  alert_type: "price_above" | "price_below" | "metric_change";
  threshold: number;
  metric?: string;
  active: boolean;
}
