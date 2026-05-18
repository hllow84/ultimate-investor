import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { Plus, X, BarChart2, ExternalLink } from "lucide-react";
import { api } from "@/api/client";
import type { StockSummary, HealthScore, ValuationResult, TechnicalMomentum, MoatAnalysis } from "@/types";

const MAX = 5;
const STALE = 1000 * 60 * 5;

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompareData {
  ticker: string;
  summary?: StockSummary;
  health?: HealthScore;
  valuation?: ValuationResult;
  momentum?: TechnicalMomentum;
  moat?: MoatAnalysis;
  isLoading: boolean;
}

type CellVal = number | string | null | undefined;

interface RowDef {
  label: string;
  getValue: (d: CompareData) => CellVal;
  format: (v: CellVal) => string;
  higherIsBetter?: boolean;
  textColor?: (v: CellVal) => string | undefined;
}

interface Section {
  title: string;
  rows: RowDef[];
}

// ─── Format helpers ───────────────────────────────────────────────────────────

const fmtPrice = (v: CellVal) =>
  typeof v === "number" ? `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
const fmtPct = (v: CellVal) =>
  typeof v === "number" ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : "—";
const fmtNum = (v: CellVal, d = 1) =>
  typeof v === "number" ? v.toFixed(d) : "—";
const fmtX = (v: CellVal) =>
  typeof v === "number" ? `${v.toFixed(1)}x` : "—";
const fmtMCap = (v: CellVal) => {
  if (typeof v !== "number") return "—";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  return `$${(v / 1e6).toFixed(0)}M`;
};
const fmtStr = (v: CellVal) => (typeof v === "string" && v ? v : "—");

// ─── Row / section config ─────────────────────────────────────────────────────

const verdictColor = (v: CellVal) =>
  v === "undervalued" ? "var(--green)" : v === "overvalued" ? "var(--red)" : undefined;
const signalColor = (v: CellVal) =>
  v === "bullish" ? "var(--green)" : v === "bearish" ? "var(--red)" : undefined;

const SECTIONS: Section[] = [
  {
    title: "Overview",
    rows: [
      { label: "Price",      getValue: d => d.summary?.price      ?? null, format: fmtPrice },
      { label: "Today",      getValue: d => d.summary?.change_pct ?? null, format: fmtPct,  higherIsBetter: true },
      { label: "Market Cap", getValue: d => d.summary?.market_cap ?? null, format: fmtMCap, higherIsBetter: true },
      { label: "Sector",     getValue: d => d.summary?.sector     ?? null, format: fmtStr },
    ],
  },
  {
    title: "Health Score (/100)",
    rows: [
      { label: "Overall",       getValue: d => d.health?.overall       ?? null, format: fmtNum, higherIsBetter: true },
      { label: "Profitability", getValue: d => d.health?.profitability ?? null, format: fmtNum, higherIsBetter: true },
      { label: "Debt",          getValue: d => d.health?.debt          ?? null, format: fmtNum, higherIsBetter: true },
      { label: "Growth",        getValue: d => d.health?.growth        ?? null, format: fmtNum, higherIsBetter: true },
      { label: "Efficiency",    getValue: d => d.health?.efficiency    ?? null, format: fmtNum, higherIsBetter: true },
      { label: "Valuation",     getValue: d => d.health?.valuation     ?? null, format: fmtNum, higherIsBetter: true },
      { label: "Momentum",      getValue: d => d.health?.momentum      ?? null, format: fmtNum, higherIsBetter: true },
      { label: "Predictability",getValue: d => d.health?.predictability?? null, format: fmtNum, higherIsBetter: true },
    ],
  },
  {
    title: "Valuation",
    rows: [
      { label: "Trailing P/E", getValue: d => d.valuation?.pe_ratio          ?? null, format: fmtX,   higherIsBetter: false },
      { label: "Forward P/E",  getValue: d => d.valuation?.forward_pe        ?? null, format: fmtX,   higherIsBetter: false },
      { label: "EV/EBITDA",    getValue: d => d.valuation?.ev_ebitda         ?? null, format: fmtX,   higherIsBetter: false },
      { label: "Upside to FV", getValue: d => d.valuation?.upside_pct        ?? null, format: fmtPct, higherIsBetter: true },
      { label: "Verdict",      getValue: d => d.valuation?.verdict           ?? null, format: fmtStr, textColor: verdictColor },
    ],
  },
  {
    title: "Technical",
    rows: [
      { label: "RSI (14)",      getValue: d => d.momentum?.rsi               ?? null, format: fmtNum },
      { label: "vs SMA 50",     getValue: d => d.momentum?.pct_above_sma50   ?? null, format: fmtPct, higherIsBetter: true },
      { label: "vs SMA 200",    getValue: d => d.momentum?.pct_above_sma200  ?? null, format: fmtPct, higherIsBetter: true },
      { label: "From 52w High", getValue: d => d.momentum?.pct_from_52w_high ?? null, format: fmtPct, higherIsBetter: true },
      { label: "Signal",        getValue: d => d.momentum?.signal             ?? null, format: fmtStr, textColor: signalColor },
    ],
  },
  {
    title: "Moat",
    rows: [
      {
        label: "Moat Score (/10)",
        getValue: d => d.moat?.moat_score ?? null,
        format: v => typeof v === "number" ? `${v.toFixed(1)}/10` : "—",
        higherIsBetter: true,
      },
    ],
  },
];

// ─── Highlight ────────────────────────────────────────────────────────────────

function cellHighlight(value: CellVal, allValues: CellVal[], higherIsBetter: boolean): string | undefined {
  const nums = allValues.filter((v): v is number => typeof v === "number");
  if (nums.length < 2 || typeof value !== "number") return undefined;
  const best = higherIsBetter ? Math.max(...nums) : Math.min(...nums);
  const worst = higherIsBetter ? Math.min(...nums) : Math.max(...nums);
  if (best === worst) return undefined;
  if (value === best) return "var(--green)";
  if (value === worst) return "var(--red)";
  return undefined;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Compare() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [input, setInput] = useState("");

  const tickers = (searchParams.get("t") ?? "")
    .split(",")
    .map(t => t.trim().toUpperCase())
    .filter(Boolean);

  function addTicker() {
    const t = input.trim().toUpperCase();
    if (!t || tickers.includes(t) || tickers.length >= MAX) return;
    setSearchParams({ t: [...tickers, t].join(",") });
    setInput("");
  }

  function removeTicker(t: string) {
    const next = tickers.filter(x => x !== t);
    next.length ? setSearchParams({ t: next.join(",") }) : setSearchParams({});
  }

  // Parallel data fetching for all tickers
  const q = <T,>(fn: (t: string) => Promise<T>, key: string) =>
    tickers.map(t => ({ queryKey: [key, t], queryFn: () => fn(t), enabled: !!t, staleTime: STALE }));

  const summaries  = useQueries({ queries: q(api.stocks.summary,        "stock")    });
  const healths    = useQueries({ queries: q(api.analysis.health,       "health")   });
  const valuations = useQueries({ queries: q(api.analysis.valuation,    "valuation")});
  const momentums  = useQueries({ queries: q(api.analysis.momentum,     "momentum") });
  const moats      = useQueries({ queries: q(api.analysis.moat,         "moat")     });

  const compareData: CompareData[] = tickers.map((ticker, i) => ({
    ticker,
    summary:    summaries[i]?.data,
    health:     healths[i]?.data,
    valuation:  valuations[i]?.data,
    momentum:   momentums[i]?.data,
    moat:       moats[i]?.data,
    isLoading: [summaries[i], healths[i], valuations[i], momentums[i], moats[i]]
      .some(r => r?.isLoading),
  }));

  const n = tickers.length;
  const colTemplate = `160px repeat(${Math.max(n, 1)}, minmax(0, 1fr))`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Compare Stocks</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Side-by-side comparison · up to {MAX} tickers · shareable URL
        </p>
      </div>

      {/* Add ticker bar */}
      <form onSubmit={e => { e.preventDefault(); addTicker(); }} className="flex gap-2 items-center">
        <input
          value={input}
          onChange={e => setInput(e.target.value.toUpperCase())}
          placeholder="Add ticker (e.g. NVDA)"
          maxLength={10}
          className="px-3 py-2 rounded-lg text-sm outline-none"
          style={{
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--text)",
            width: 200,
          }}
        />
        <button
          type="submit"
          disabled={!input.trim() || tickers.length >= MAX}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-opacity"
          style={{
            backgroundColor: "var(--accent)",
            color: "white",
            opacity: !input.trim() || tickers.length >= MAX ? 0.45 : 1,
          }}
        >
          <Plus size={14} /> Add
        </button>
        {tickers.length >= MAX && (
          <span className="text-xs" style={{ color: "var(--muted)" }}>Max {MAX} tickers</span>
        )}
      </form>

      {/* Empty state */}
      {n === 0 && (
        <div className="text-center py-24" style={{ color: "var(--muted)" }}>
          <BarChart2 size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">Add tickers to compare</p>
          <p className="text-sm mt-1">Try AAPL vs MSFT vs GOOGL</p>
        </div>
      )}

      {/* Comparison table */}
      {n > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>

          {/* Sticky ticker header row */}
          <div
            className="grid sticky top-14 z-10"
            style={{ gridTemplateColumns: colTemplate, backgroundColor: "var(--surface)", borderBottom: "2px solid var(--border)" }}
          >
            <div className="p-4" />
            {compareData.map(d => (
              <div key={d.ticker} className="p-4 text-center border-l" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Link
                    to={`/stock/${d.ticker}`}
                    className="font-bold text-base hover:underline flex items-center gap-1"
                    style={{ color: "var(--accent)" }}
                  >
                    {d.ticker} <ExternalLink size={11} />
                  </Link>
                  <button
                    onClick={() => removeTicker(d.ticker)}
                    className="ml-1 rounded hover:opacity-70"
                    style={{ color: "var(--muted)" }}
                    title={`Remove ${d.ticker}`}
                  >
                    <X size={13} />
                  </button>
                </div>
                {d.summary ? (
                  <>
                    <p className="text-xl font-bold">{fmtPrice(d.summary.price)}</p>
                    <p className="text-xs font-medium" style={{ color: d.summary.change_pct >= 0 ? "var(--green)" : "var(--red)" }}>
                      {fmtPct(d.summary.change_pct)}
                    </p>
                    <p className="text-xs mt-0.5 truncate" style={{ color: "var(--muted)" }}>{d.summary.sector}</p>
                  </>
                ) : d.isLoading ? (
                  <div className="space-y-1.5 mt-1">
                    <div className="h-4 rounded animate-pulse mx-auto w-20" style={{ backgroundColor: "var(--border)" }} />
                    <div className="h-3 rounded animate-pulse mx-auto w-12" style={{ backgroundColor: "var(--border)" }} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          {/* Sections */}
          {SECTIONS.map(section => (
            <div key={section.title}>
              {/* Section label */}
              <div
                className="grid px-4 py-2"
                style={{
                  gridTemplateColumns: colTemplate,
                  backgroundColor: "var(--bg)",
                  borderTop: "1px solid var(--border)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--muted)" }}>
                  {section.title}
                </p>
              </div>

              {/* Data rows */}
              {section.rows.map((row, ri) => {
                const values = compareData.map(d => row.getValue(d));
                return (
                  <div
                    key={ri}
                    className="grid"
                    style={{ gridTemplateColumns: colTemplate, borderTop: "1px solid var(--border)" }}
                  >
                    {/* Row label */}
                    <div className="px-4 py-3 flex items-center">
                      <span className="text-xs" style={{ color: "var(--muted)" }}>{row.label}</span>
                    </div>

                    {/* Value per ticker */}
                    {compareData.map((d, i) => {
                      const val = values[i];
                      const formatted = row.format(val);
                      let color: string | undefined;
                      if (row.higherIsBetter !== undefined) {
                        color = cellHighlight(val, values, row.higherIsBetter);
                      }
                      if (!color && row.textColor) {
                        color = row.textColor(val);
                      }
                      return (
                        <div
                          key={d.ticker}
                          className="px-4 py-3 text-center border-l flex items-center justify-center"
                          style={{ borderColor: "var(--border)" }}
                        >
                          {d.isLoading && val == null ? (
                            <div className="h-3 w-14 rounded animate-pulse" style={{ backgroundColor: "var(--border)" }} />
                          ) : (
                            <span className="text-sm font-medium" style={{ color: color ?? "var(--text)" }}>
                              {formatted}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
