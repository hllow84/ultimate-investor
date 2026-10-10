// Types for the read-only /api/lab/* integration with the Institutional
// Long-Horizon Lab. The Lab's underlying research artifacts are
// deliberately heterogeneous (different strategies carry different named
// variants), so nested payloads are typed as `unknown` and narrowed at
// render time rather than forced into a single rigid shape -- that keeps
// us from inventing structure the API doesn't actually guarantee.

export type ArtifactStatus = "ok" | "missing" | "malformed" | "unavailable";

export interface ArtifactEnvelope<T = unknown> {
  key: string;
  relative_path: string;
  status: ArtifactStatus;
  source_last_modified: string | null;
  data: T | null;
  error: string | null;
}

export interface ArtifactHealth {
  key: string;
  relative_path: string;
  status: ArtifactStatus;
  source_last_modified: string | null;
  error: string | null;
}

export interface PaperTradingFreshness {
  status: "ok" | "missing" | "malformed" | "unavailable";
  error?: string;
  last_success_at?: string | null;
  days_since_last_success?: number | null;
  is_stale?: boolean | null;
  stale_threshold_days?: number;
  note?: string;
}

export interface LabHealth {
  lab_root: string;
  exists: boolean;
  error?: string;
  artifacts: Record<string, ArtifactHealth>;
  paper_trading_freshness: PaperTradingFreshness;
}

export interface StrategiesResponse {
  results: ArtifactEnvelope<Record<string, unknown>>;
  scorecard: ArtifactEnvelope<Record<string, unknown>>;
  deflated_sharpe: ArtifactEnvelope<Record<string, unknown>>;
}

export interface DiagnosticsResponse {
  combination: ArtifactEnvelope<{
    partA_vs_6040?: Record<string, unknown>;
    partB_cross_correlation?: Record<string, Record<string, number>>;
    partB_overlap_months?: Record<string, Record<string, number>>;
  }>;
}

export interface PortfoliosResponse {
  portfolios: ArtifactEnvelope<Record<string, unknown>>;
  ablation: ArtifactEnvelope<{
    baseline_all9_equal_weight?: Record<string, unknown>;
    ablation?: Record<string, {
      marginal_contribution?: Record<string, number>;
      without_this_sleeve?: Record<string, unknown>;
    }>;
  }>;
  significance: ArtifactEnvelope<Record<string, {
    jobson_korkie_memmel?: Record<string, unknown>;
    block_bootstrap_3mo?: Record<string, unknown>;
    block_bootstrap_6mo?: Record<string, unknown>;
    block_bootstrap_12mo?: Record<string, unknown>;
    block_length_sensitivity_agrees?: boolean;
    jk_and_bootstrap_agree_at_5pct?: boolean;
    verdict?: string;
    n_months?: number;
  }>>;
}

export interface PaperTradingRecord {
  recorded_at: string;
  status: string;
  data_as_of: string;
  construction_A_weights?: Record<string, number> | null;
  construction_B_weights?: Record<string, number> | null;
  realized_since_last_recording?: { note?: string; period?: [string, string] } | null;
  turnover_and_cost?: Record<string, number> | null;
  missing_data_events?: unknown[];
  is_first_recording?: boolean;
  is_duplicate_period: boolean;
  has_no_new_month_note: boolean;
}

export interface PaperTradingLogResponse {
  status: "ok" | "missing" | "unavailable";
  relative_path: string;
  source_last_modified: string | null;
  total_records: number;
  malformed_line_count: number;
  distinct_data_as_of_periods: string[];
  records: PaperTradingRecord[];
  canonical_latest: PaperTradingRecord | null;
  canonical_latest_selection_rule: string | null;
  duplicate_period_warning: string | null;
  error: string | null;
}

export interface PaperTradingLatestResponse {
  status: "ok" | "missing" | "unavailable";
  error?: string | null;
  latest: PaperTradingRecord | null;
  selection_rule?: string;
  distinct_period_count?: number;
  track_record_note?: string;
  duplicate_period_warning?: string | null;
  freshness?: PaperTradingFreshness;
}
