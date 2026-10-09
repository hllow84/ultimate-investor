// Formatting + light structural helpers for rendering the Lab's
// heterogeneous research JSON without inventing fields that aren't there.

export function formatPercent(v: unknown, decimals = 1): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(decimals)}%`;
}

export function formatRatio(v: unknown, decimals = 2): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return v.toFixed(decimals);
}

export function formatNumber(v: unknown, decimals = 0): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return v.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

export function formatDate(v: unknown): string {
  if (typeof v !== "string" || !v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(v: unknown): string {
  if (typeof v !== "string" || !v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// Field classification for the backtest metrics objects the Lab emits
// (e.g. {CAGR, Sharpe, Sortino, AnnVol, MaxDD, Calmar, BestYear, ...}).
// Used so a metrics table can format percentages vs ratios correctly
// instead of guessing per-value.
export const PERCENT_FIELDS = new Set([
  "CAGR", "AnnVol", "MaxDD", "BestYear", "WorstYear", "BestMonth", "WorstMonth",
  "WorstQuarter", "TotalReturn", "total_return",
]);
export const RATIO_FIELDS = new Set(["Sharpe", "Sortino", "Calmar", "PctPositiveYears"]);
export const DATE_FIELDS = new Set(["StartDate", "EndDate", "DrawdownTrough", "RecoveryDate"]);
export const COUNT_FIELDS = new Set(["NYears", "NMonths", "RecoveryDays", "RecoveryMonths"]);

const METRIC_KEY_HINTS = ["CAGR", "Sharpe", "Sortino", "AnnVol", "MaxDD", "Calmar"];

/** True if `obj` looks like one of the Lab's flat backtest-metric records. */
export function looksLikeMetrics(obj: unknown): obj is Record<string, unknown> {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return false;
  const keys = Object.keys(obj as Record<string, unknown>);
  return METRIC_KEY_HINTS.some((k) => keys.includes(k));
}

/** Format one metrics-object field by its known classification, falling back
 * to a raw value instead of fabricating a format for a field we don't recognize. */
export function formatMetricField(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (PERCENT_FIELDS.has(key)) return formatPercent(value);
  if (RATIO_FIELDS.has(key)) return formatRatio(value);
  if (DATE_FIELDS.has(key)) return formatDate(value);
  if (COUNT_FIELDS.has(key)) return formatNumber(value, 1);
  if (typeof value === "number") return formatNumber(value, 2);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value;
  return "—";
}

// A small fixed set of top-level fields worth showing in a compact metrics
// table -- excludes nested objects (regimes, benchmarks, concentration,
// downside_corr_vs_6040, label) which get their own dedicated rendering
// or are intentionally left out of Stage 2.
export const CORE_METRIC_KEYS = [
  "CAGR", "Sharpe", "Sortino", "AnnVol", "MaxDD", "Calmar",
  "BestYear", "WorstYear", "StartDate", "EndDate",
];

export function pickCoreMetrics(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of CORE_METRIC_KEYS) {
    if (k in obj) out[k] = obj[k];
  }
  return out;
}
