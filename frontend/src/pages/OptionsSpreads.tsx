import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, TrendingDown, TrendingUp, AlertTriangle, Info, ChevronRight, ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SpreadEvent {
  type: "earnings" | "fomc" | "cpi" | "nfp" | "exdiv";
  date: string;
  label: string;
  days_away: number;
}

interface WidthVariant {
  width: number;
  long_strike: number;
  net_credit: number;
  max_risk: number;
  roi_pct: number;
  breakeven: number;
  buffer_pct: number;
}

interface Spread {
  ticker: string;
  strategy: string;
  expiry: string;
  dte: number;
  stock_price: number;
  short_strike: number;
  short_delta: number;
  iv_pct: number;
  hv30_pct: number;
  exp_move_pct: number;
  exp_move_dollar: number;
  hv30_move_pct: number;
  hv30_move_dollar: number;
  short_bid: number;
  roi_pct: number;
  widths: WidthVariant[];
  events: SpreadEvent[];
}

interface VixInfo {
  color: "green" | "yellow" | "red" | "muted";
  label: string;
  message: string;
}

interface SpreadsResponse {
  spreads: Spread[];
  vix: number;
  vix_info: VixInfo;
  cached: boolean;
  date: string;
  count: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VIX_COLORS: Record<string, string> = {
  green: "var(--green)",
  yellow: "var(--yellow)",
  red: "var(--red)",
  muted: "var(--muted)",
};

const EVENT_STYLES: Record<string, { bg: string; color: string }> = {
  earnings: { bg: "#ef444422", color: "#ef4444" },
  fomc:     { bg: "#f9731622", color: "#f97316" },
  cpi:      { bg: "#3b82f622", color: "#3b82f6" },
  nfp:      { bg: "#8b5cf622", color: "#8b5cf6" },
  exdiv:    { bg: "#22c55e22", color: "#22c55e" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBufferColor(buffer_pct: number, exp_move_pct: number): string {
  if (exp_move_pct <= 0) return "var(--text)";
  if (buffer_pct >= exp_move_pct * 1.2) return "var(--green)";
  if (buffer_pct >= exp_move_pct * 0.8) return "var(--yellow)";
  return "var(--red)";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function VixCard({ vix, vix_info, cached, date }: { vix: number; vix_info: VixInfo; cached: boolean; date: string }) {
  const color = VIX_COLORS[vix_info.color] ?? "var(--muted)";
  const Icon = vix_info.color === "red" ? AlertTriangle : vix_info.color === "muted" ? Info : TrendingDown;
  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--muted)" }}>VIX Index</p>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold" style={{ color }}>{vix > 0 ? vix.toFixed(2) : "—"}</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: color + "22", color }}>
              {vix_info.label}
            </span>
          </div>
        </div>
        <Icon size={28} style={{ color, flexShrink: 0 }} />
      </div>
      <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>{vix_info.message}</p>
      <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>Data for {date} {cached ? "(cached)" : "(fresh)"}</p>
    </div>
  );
}

function SummaryCard({ count, puts, calls }: { count: number; puts: number; calls: number }) {
  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
      <p className="text-xs uppercase tracking-wider mb-3" style={{ color: "var(--muted)" }}>Opportunities Found</p>
      <div className="flex gap-6">
        <div>
          <p className="text-3xl font-bold" style={{ color: "var(--accent)" }}>{count}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>Total spreads</p>
        </div>
        <div>
          <p className="text-2xl font-semibold" style={{ color: "var(--green)" }}>{puts}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>Bull Put</p>
        </div>
        <div>
          <p className="text-2xl font-semibold" style={{ color: "var(--red)" }}>{calls}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>Bear Call</p>
        </div>
      </div>
      <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>Delta ~0.10 short leg · 30–45 DTE · min 5% ROI · expand rows for $5/$10/$25/$50/$100 widths</p>
    </div>
  );
}

function EventBadge({ ev }: { ev: SpreadEvent }) {
  const style = EVENT_STYLES[ev.type] ?? { bg: "#64748b22", color: "#64748b" };
  const mmdd = ev.date.slice(5).replace("-", "/");
  return (
    <span
      title={`${ev.label} on ${ev.date} (${ev.days_away}d away)`}
      className="inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded whitespace-nowrap"
      style={{ backgroundColor: style.bg, color: style.color }}
    >
      {ev.label} <span style={{ opacity: 0.7 }}>{mmdd}</span>
    </span>
  );
}

function EventsCell({ events }: { events: SpreadEvent[] }) {
  if (!events || events.length === 0) return <span style={{ color: "var(--muted)" }}>—</span>;
  return (
    <div className="flex flex-col gap-1">
      {events.map((ev, i) => <EventBadge key={i} ev={ev} />)}
    </div>
  );
}

// ─── Main spread row with expandable widths ───────────────────────────────────

const NUM_COLS = 13;

function SpreadRows({ s, expanded, onToggle }: {
  s: Spread;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isPut = s.strategy.includes("Put");
  const stratColor = isPut ? "var(--green)" : "var(--red)";
  const bufferArrow = isPut ? "↓" : "↑";
  const defaultW = s.widths[0];

  // IV rich/cheap label
  const ivVsHv = s.hv30_pct > 0
    ? s.iv_pct > s.hv30_pct * 1.1 ? { label: "↑rich", color: "var(--green)" }
    : s.iv_pct < s.hv30_pct * 0.9 ? { label: "↓cheap", color: "var(--red)" }
    : { label: "≈fair", color: "var(--yellow)" }
    : null;

  const rowBg = expanded ? "var(--surface)" : "transparent";

  return (
    <>
      {/* ── Main collapsed row ── */}
      <tr
        style={{ borderBottom: expanded ? "none" : "1px solid var(--border)", backgroundColor: rowBg, cursor: "pointer" }}
        onClick={onToggle}
      >
        {/* Expand toggle */}
        <td className="py-3 pl-3 pr-1 w-6">
          {expanded
            ? <ChevronDown size={14} style={{ color: "var(--accent)" }} />
            : <ChevronRight size={14} style={{ color: "var(--muted)" }} />}
        </td>

        {/* Ticker */}
        <td className="py-3 px-2" onClick={e => e.stopPropagation()}>
          <Link to={`/stock/${s.ticker}`} className="font-semibold text-sm hover:underline" style={{ color: "var(--accent)" }}>
            {s.ticker}
          </Link>
        </td>

        {/* Strategy */}
        <td className="py-3 px-2">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
            style={{ backgroundColor: stratColor + "22", color: stratColor }}>
            {isPut ? "↑ Bull Put" : "↓ Bear Call"}
          </span>
        </td>

        {/* Price */}
        <td className="py-3 px-2 text-sm text-right font-medium" style={{ color: "var(--text)" }}>
          ${s.stock_price.toLocaleString()}
        </td>

        {/* Short Strike / Δ */}
        <td className="py-3 px-2 text-sm text-right">
          <span style={{ color: "var(--text)" }}>{s.short_strike}</span>
          <span className="mx-1" style={{ color: "var(--muted)" }}>/</span>
          <span style={{ color: "var(--muted)" }}>{defaultW.long_strike}</span>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>Δ {s.short_delta}</p>
        </td>

        {/* Net Credit (narrowest width) */}
        <td className="py-3 px-2 text-sm text-right">
          <span style={{ color: "var(--green)" }}>${defaultW.net_credit.toFixed(2)}</span>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>${defaultW.width} wide</p>
        </td>

        {/* Max Risk */}
        <td className="py-3 px-2 text-sm text-right">
          <span style={{ color: "var(--red)" }}>${defaultW.max_risk.toFixed(2)}</span>
        </td>

        {/* ROI % */}
        <td className="py-3 px-2 text-sm text-right font-semibold">
          <span style={{ color: defaultW.roi_pct >= 15 ? "var(--green)" : "var(--text)" }}>
            {defaultW.roi_pct.toFixed(1)}%
          </span>
        </td>

        {/* Buffer % */}
        <td className="py-3 px-2 text-sm text-right font-semibold" title={`Breakeven: $${defaultW.breakeven.toFixed(2)}`}>
          <span style={{ color: getBufferColor(defaultW.buffer_pct, s.exp_move_pct) }}>
            {bufferArrow} {defaultW.buffer_pct.toFixed(1)}%
          </span>
          <p className="text-xs mt-0.5 font-normal" style={{ color: "var(--muted)" }}>
            be ${defaultW.breakeven.toFixed(2)}
          </p>
        </td>

        {/* ±1σ standard deviation over DTE */}
        <td className="py-3 px-2 text-sm text-right">
          {s.exp_move_pct > 0 ? (
            <>
              {/* IV-implied 1σ */}
              <span style={{ color: "var(--text)" }}>±{s.exp_move_pct.toFixed(1)}%</span>
              <span className="ml-1 text-xs" style={{ color: "var(--muted)" }}>
                (IV {s.iv_pct}%)
              </span>
              {/* HV30-realized 1σ */}
              {s.hv30_move_pct > 0 && (
                <p className="text-xs mt-0.5">
                  <span style={{ color: "var(--muted)" }}>±{s.hv30_move_pct.toFixed(1)}%</span>
                  <span className="ml-1" style={{ color: "var(--muted)" }}>
                    (HV30 {s.hv30_pct}%)
                  </span>
                  {ivVsHv && (
                    <span className="ml-1 font-semibold" style={{ color: ivVsHv.color }}>{ivVsHv.label}</span>
                  )}
                </p>
              )}
            </>
          ) : "—"}
        </td>

        {/* DTE */}
        <td className="py-3 px-2 text-sm text-right">
          <span style={{ color: "var(--text)" }}>{s.dte}d</span>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{s.expiry}</p>
        </td>

        {/* IV */}
        <td className="py-3 px-2 text-sm text-right" style={{ color: "var(--muted)" }}>
          {s.iv_pct > 0 ? `${s.iv_pct}%` : "—"}
        </td>

        {/* Events */}
        <td className="py-3 px-2 text-sm">
          <EventsCell events={s.events ?? []} />
        </td>
      </tr>

      {/* ── Expanded widths panel ── */}
      {expanded && (
        <tr style={{ borderBottom: "1px solid var(--border)" }}>
          <td colSpan={NUM_COLS} className="pb-3 px-10"
            style={{ backgroundColor: "var(--bg)" }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Width", "Long Strike", "Net Credit (×100/contract)", "Max Risk", "ROI %", "Buffer %", "Breakeven"].map((h, i) => (
                    <th key={i} className={`py-1.5 px-2 font-semibold uppercase tracking-wider ${i > 0 ? "text-right" : "text-left"}`}
                      style={{ color: "var(--muted)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.widths.map((w, i) => {
                  const bColor = getBufferColor(w.buffer_pct, s.exp_move_pct);
                  const isDefault = i === 0;
                  return (
                    <tr key={w.width}
                      style={{
                        borderBottom: i < s.widths.length - 1 ? "1px solid var(--border)" : "none",
                        backgroundColor: isDefault ? "var(--accent)11" : "transparent",
                      }}>
                      <td className="py-2 px-2 font-semibold" style={{ color: "var(--text)" }}>
                        ${w.width}
                        {isDefault && <span className="ml-1.5 text-xs px-1 rounded" style={{ backgroundColor: "var(--accent)33", color: "var(--accent)" }}>default</span>}
                      </td>
                      <td className="py-2 px-2 text-right" style={{ color: "var(--muted)" }}>{w.long_strike}</td>
                      <td className="py-2 px-2 text-right font-semibold" style={{ color: "var(--green)" }}>
                        ${w.net_credit.toFixed(2)}
                        <span className="ml-1 font-normal" style={{ color: "var(--muted)" }}>= ${(w.net_credit * 100).toFixed(0)}/contract</span>
                      </td>
                      <td className="py-2 px-2 text-right" style={{ color: "var(--red)" }}>${w.max_risk.toFixed(2)}</td>
                      <td className="py-2 px-2 text-right font-semibold"
                        style={{ color: w.roi_pct >= 15 ? "var(--green)" : w.roi_pct >= 5 ? "var(--text)" : "var(--muted)" }}>
                        {w.roi_pct.toFixed(1)}%
                      </td>
                      <td className="py-2 px-2 text-right font-semibold" style={{ color: bColor }}>
                        {bufferArrow} {w.buffer_pct.toFixed(1)}%
                      </td>
                      <td className="py-2 px-2 text-right" style={{ color: "var(--muted)" }}>${w.breakeven.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type FilterType = "all" | "put" | "call";
type SortKey = "roi_pct" | "ticker" | "dte" | "exp_move_pct";

export default function OptionsSpreads() {
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [sortKey, setSortKey] = useState<SortKey>("roi_pct");
  const [sortAsc, setSortAsc] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = useState(0);
  const [isForceRefreshing, setIsForceRefreshing] = useState(false);

  const url = isForceRefreshing ? "/api/options/spreads?refresh=true" : "/api/options/spreads";

  const { data, isLoading, error, refetch } = useQuery<SpreadsResponse>({
    queryKey: ["options-spreads", refreshKey],
    queryFn: () => fetch(url).then(r => r.json()),
    staleTime: 30 * 60 * 1000,
  });

  async function handleRefresh() {
    setIsForceRefreshing(true);
    setRefreshKey(k => k + 1);
    await refetch();
    setIsForceRefreshing(false);
  }

  function toggleExpand(key: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(key === "ticker"); }
  }

  const spreads = data?.spreads ?? [];
  const filtered = spreads.filter(s => {
    if (filterType === "put") return s.strategy.includes("Put");
    if (filterType === "call") return s.strategy.includes("Call");
    return true;
  });
  const sorted = [...filtered].sort((a, b) => {
    const va = a[sortKey] as number | string;
    const vb = b[sortKey] as number | string;
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return sortAsc ? cmp : -cmp;
  });

  const puts = spreads.filter(s => s.strategy.includes("Put")).length;
  const calls = spreads.filter(s => s.strategy.includes("Call")).length;

  const thStyle = (key: SortKey) => ({
    cursor: "pointer",
    color: sortKey === key ? "var(--accent)" : "var(--muted)",
    userSelect: "none" as const,
    whiteSpace: "nowrap" as const,
  });
  const arrow = (key: SortKey) => sortKey === key ? (sortAsc ? " ↑" : " ↓") : "";

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text)" }}>Credit Spread Scanner</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Daily-refreshed bull put &amp; bear call spreads · Delta ~0.10 · 30–45 DTE · click row to expand widths
          </p>
        </div>
        <button onClick={handleRefresh} disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", cursor: isLoading ? "not-allowed" : "pointer", opacity: isLoading ? 0.6 : 1 }}>
          <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
          {isLoading ? "Scanning…" : "Refresh"}
        </button>
      </div>

      {/* Info cards */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <VixCard {...data} />
          <SummaryCard count={data.count} puts={puts} calls={calls} />
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="rounded-xl p-10 text-center" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
          <RefreshCw size={28} className="animate-spin mx-auto mb-3" style={{ color: "var(--accent)" }} />
          <p style={{ color: "var(--muted)" }}>Scanning options chains for 20 tickers…</p>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>This takes ~40 seconds on the first load.</p>
        </div>
      )}

      {error && (
        <div className="rounded-xl p-6 text-center" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
          <p style={{ color: "var(--red)" }}>Failed to load spreads. Make sure the backend is running.</p>
        </div>
      )}

      {/* Filters */}
      {!isLoading && data && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm" style={{ color: "var(--muted)" }}>Show:</span>
          {(["all", "put", "call"] as FilterType[]).map(t => (
            <button key={t} onClick={() => setFilterType(t)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{ backgroundColor: filterType === t ? "var(--accent)" : "var(--surface)", border: "1px solid var(--border)", color: filterType === t ? "#fff" : "var(--muted)", cursor: "pointer" }}>
              {t === "all" ? "All" : t === "put" ? "Bull Put Spreads" : "Bear Call Spreads"}
            </button>
          ))}
          <span className="ml-auto text-sm" style={{ color: "var(--muted)" }}>
            {sorted.length} spread{sorted.length !== 1 ? "s" : ""} · click row to expand widths
          </span>
        </div>
      )}

      {/* Table */}
      {!isLoading && sorted.length > 0 && (
        <div className="rounded-xl overflow-auto" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th className="py-3 pl-3 pr-1 w-6" />
                {([
                  ["ticker", "Ticker"],
                  [null, "Strategy"],
                  [null, "Price"],
                  [null, "Strike / Δ"],
                  [null, "Net Credit"],
                  [null, "Max Risk"],
                  ["roi_pct", "ROI %"],
                  [null, "Buffer %"],
                  ["exp_move_pct", "±1σ (IV vs HV30)"],
                  ["dte", "DTE"],
                  [null, "IV"],
                  [null, "Events (30d)"],
                ] as [string | null, string][]).map(([key, label], i) => (
                  <th key={i}
                    className={`py-3 px-2 text-xs font-semibold uppercase tracking-wider ${i > 1 ? "text-right" : i === 1 ? "text-left" : "text-left"}`}
                    style={key ? thStyle(key as SortKey) : { color: "var(--muted)", whiteSpace: "nowrap" }}
                    onClick={key ? () => toggleSort(key as SortKey) : undefined}>
                    {label}{key ? arrow(key as SortKey) : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, i) => {
                const key = `${s.ticker}-${s.strategy}`;
                return (
                  <SpreadRows
                    key={`${key}-${i}`}
                    s={s}
                    expanded={expanded.has(key)}
                    onToggle={() => toggleExpand(key)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && data && sorted.length === 0 && (
        <div className="rounded-xl p-10 text-center" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
          <TrendingUp size={32} className="mx-auto mb-3" style={{ color: "var(--muted)" }} />
          <p style={{ color: "var(--muted)" }}>No spread opportunities matching current filters.</p>
        </div>
      )}

      {/* Legend */}
      <div className="rounded-xl p-4 text-xs" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", color: "var(--muted)" }}>
        <p className="font-semibold mb-2" style={{ color: "var(--text)" }}>Legend</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
          <span><b style={{ color: "var(--text)" }}>Net Credit</b> — premium collected per share (×100 = $ per contract)</span>
          <span><b style={{ color: "var(--text)" }}>Max Risk</b> — spread width − net credit (max loss per share)</span>
          <span><b style={{ color: "var(--text)" }}>ROI %</b> — net credit ÷ max risk · return on capital at risk</span>
          <span><b style={{ color: "var(--text)" }}>Buffer %</b> — how far stock must move before you lose money (be = breakeven price)</span>
          <span>Buffer color: <b style={{ color: "var(--green)" }}>green</b> = buffer &gt; 1.2× exp move · <b style={{ color: "var(--yellow)" }}>yellow</b> = close · <b style={{ color: "var(--red)" }}>red</b> = inside exp move range</span>
          <span><b style={{ color: "var(--text)" }}>±1σ</b> = <b>one standard deviation</b> projected over the trade's DTE. Formula: annualised_vol × √(DTE/365). ~68% of outcomes land within this range.</span>
          <span><b style={{ color: "var(--text)" }}>IV line</b> — implied vol (from options pricing) as the annualised σ, e.g. "±21.1% (IV 68.7%)" means the market prices in a 68.7% annualised vol → ±21.1% 1σ range over 35 days</span>
          <span><b style={{ color: "var(--text)" }}>HV30 line</b> — realised σ from the past 30 trading days, same projection. Compares what the stock <i>actually</i> did vs what options are pricing in</span>
          <span>
            <b style={{ color: "var(--green)" }}>↑rich</b> — IV &gt; HV30: options overpriced vs history → <b>good to sell premium</b> &nbsp;·&nbsp;
            <b style={{ color: "var(--red)" }}>↓cheap</b> — IV &lt; HV30: options underpriced → sellers earn less than historical vol warrants &nbsp;·&nbsp;
            <b style={{ color: "var(--yellow)" }}>≈fair</b> — roughly equal
          </span>
          <span><b style={{ color: "var(--text)" }}>Delta ~0.10</b> — short leg has ~10% chance of expiring in-the-money</span>
          <span>
            Event badges: <b style={{ color: "#ef4444" }}>Earnings</b> (IV spikes then crushes) ·
            <b style={{ color: "#f97316" }}> FOMC</b> (market-wide) ·
            <b style={{ color: "#3b82f6" }}> CPI</b> ·
            <b style={{ color: "#8b5cf6" }}> NFP</b> ·
            <b style={{ color: "#22c55e" }}> Ex-Div</b>
          </span>
          <span>Colors reflect <b>potential market impact</b>: red = highest (stock-specific IV event) → orange → blue/purple → green = lowest</span>
        </div>
      </div>
    </div>
  );
}
