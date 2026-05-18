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
  predictability: number;
  summary: string;
}

export interface ValuationResult {
  ticker: string;
  dcf_value?: number;
  pe_ratio?: number;
  forward_pe?: number;
  ev_ebitda?: number;
  peg_ratio?: number;
  price_to_book?: number;
  analyst_target?: number;
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

export interface FinancialPeriod {
  labels: string[];
  revenue: (number | null)[];
  revenue_growth: (number | null)[];
  net_income: (number | null)[];
  net_income_growth: (number | null)[];
  eps: (number | null)[];
  gross_margin: (number | null)[];
  operating_margin: (number | null)[];
  net_margin: (number | null)[];
  free_cash_flow: (number | null)[];
  fcf_growth: (number | null)[];
}

export interface YoYFinancials {
  ticker: string;
  annual: FinancialPeriod;
  quarterly: FinancialPeriod;
}

export interface ValuationRange {
  ticker: string;
  current_price: number;
  bear: number;
  base: number;
  bull: number;
  bear_reasoning: string;
  base_reasoning: string;
  bull_reasoning: string;
  ai_summary: string;
  inputs: Record<string, unknown>;
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
