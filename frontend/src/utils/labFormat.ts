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
  // PctPositiveYears is a decimal fraction of years (e.g. 0.4375 = 43.75% of
  // years positive) -- a RATIO_FIELD would show it as "0.44", which reads as
  // a Sharpe-like ratio rather than a share of years.
  "PctPositiveYears",
  // DeflatedSharpeProb (Bailey & Lopez de Prado) is a probability in [0,1],
  // not a Sharpe-like ratio -- show it as a percentage so it isn't misread
  // as a small raw statistic.
  "DeflatedSharpeProb",
]);
export const RATIO_FIELDS = new Set(["Sharpe", "Sortino", "Calmar"]);
export const DATE_FIELDS = new Set(["StartDate", "EndDate", "DrawdownTrough", "RecoveryDate"]);
export const COUNT_FIELDS = new Set(["NYears", "NMonths", "RecoveryDays", "RecoveryMonths", "N_trials", "T_months", "n", "n_boot", "block_len", "n_months"]);

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

// --- Regime-overlap boolean flags (phase6_combination.json) ----------------
//
// Verified against the producer, `code/phase6_combination.py` (function
// building `partA_vs_6040[*]["regime_overlap"]`):
//   both_down = strat_cum < 0 and bench_cum < 0        -> coincident_drawdown
//   offset    = strat_cum > 0 and bench_cum < 0         -> offsetting
// `strat_cum`/`bench_cum` are pandas/numpy floats, so both comparisons
// produce `numpy.bool_`, not a native Python bool. The file is written via
// `json.dump(jsafe(out), ..., default=str)`, and `jsafe()` only coerces
// `np.floating`/`np.integer` -- it does not touch `np.bool_` -- so `json.dump`
// falls through to `default=str`, which serializes the value as the literal
// string "True" or "False" (capitalized, matching Python's `str(bool)`).
// This is a serialization quirk of the producer, not an intentional string
// type, confirmed directly in source (not inferred from the field name).
//
// The two flags always co-occur (set together in the same dict literal) and
// are only present when `testable` is `true`; a `testable: false` entry omits
// them entirely. By the producer's own formula they are mutually exclusive
// (offsetting requires strat_cum > 0, coincident_drawdown requires
// strat_cum < 0 -- both can't hold for the same value) but not exhaustive:
// both are false whenever bench_cum >= 0 (this regime showed no benchmark
// drawdown at all, so the overlap question does not apply) or in the
// knife-edge case strat_cum == 0 exactly while bench_cum < 0.

/** Parses one of the Lab's regime-overlap flags. Accepts the real emitted
 * shape (string "True"/"False") and, defensively, a genuine boolean (in case
 * a future producer run fixes the jsafe() gap above and emits real JSON
 * booleans) -- anything else (missing, null, "true"/"false" lowercase, any
 * other value) returns `undefined` rather than being coerced to `false`. */
export function parseLabBoolFlag(v: unknown): boolean | undefined {
  if (v === true || v === "True") return true;
  if (v === false || v === "False") return false;
  return undefined;
}

export type RegimeOverlapClassification = "offsetting" | "coincident" | "neither" | "unknown";

/** Classifies one regime's overlap from its raw `offsetting`/`coincident_drawdown`
 * flags. Never falls through to "neither" when the source data can't actually
 * support that conclusion -- missing/malformed/unexpected values, or the
 * (producer-impossible, so necessarily corrupt-data) case of both flags
 * reading true at once, are reported as "unknown" instead. */
export function classifyRegimeOverlap(offsettingRaw: unknown, coincidentRaw: unknown): RegimeOverlapClassification {
  const offsetting = parseLabBoolFlag(offsettingRaw);
  const coincident = parseLabBoolFlag(coincidentRaw);
  if (offsetting === undefined || coincident === undefined) return "unknown";
  if (offsetting && coincident) return "unknown"; // contradictory; impossible per producer's own formula
  if (offsetting) return "offsetting";
  if (coincident) return "coincident";
  return "neither";
}
