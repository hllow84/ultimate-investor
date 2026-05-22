import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, TrendingDown, TrendingUp, AlertTriangle, Info } from "lucide-react";
import { Link } from "react-router-dom";

interface SpreadEvent {
  type: "earnings" | "fomc" | "cpi" | "nfp" | "exdiv";
  date: string;
  label: string;
  days_away: number;
}

interface Spread {
  ticker: string;
  strategy: string;
  expiry: string;
  dte: number;
  stock_price: number;
  short_strike: number;
  long_strike: number;
  short_delta: number;
  net_credit: number;
  spread_width: number;
  max_risk: number;
  roi_pct: number;
  breakeven: number;
  buffer_pct: number;
  exp_move_pct: number;
  exp_move_dollar: number;
  hv30_pct: number;
  hv30_move_pct: number;
  hv30_move_dollar: number;
  short_bid: number;
  iv_pct: number;
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

const VIX_COLORS: Record<string, string> = {
  green: "var(--green)",
  yellow: "var(--yellow)",
  red: "var(--red)",
  muted: "var(--muted)",
};

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
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: color + "22", color }}
            >
              {vix_info.label}
            </span>
          </div>
        </div>
        <Icon size={28} style={{ color, flexShrink: 0 }} />
      </div>
      <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>{vix_info.message}</p>
      <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
        Data for {date} {cached ? "(cached)" : "(fresh)"}
      </p>
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
      <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
        Delta ~0.10 short leg · 30–45 DTE · min 5% ROI
      </p>
    </div>
  );
}

const EVENT_STYLES: Record<string, { bg: string; color: string }> = {
  earnings: { bg: "#ef444422", color: "#ef4444" },
  fomc:     { bg: "#f9731622", color: "#f97316" },
  cpi:      { bg: "#3b82f622", color: "#3b82f6" },
  nfp:      { bg: "#8b5cf622", color: "#8b5cf6" },
  exdiv:    { bg: "#22c55e22", color: "#22c55e" },
};

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
  if (!events || events.length === 0) {
    return <span style={{ color: "var(--muted)" }}>—</span>;
  }
  return (
    <div className="flex flex-col gap-1">
      {events.map((ev, i) => <EventBadge key={i} ev={ev} />)}
    </div>
  );
}

function SpreadRow({ s }: { s: Spread }) {
  const isPut = s.strategy.includes("Put");
  const stratColor = isPut ? "var(--green)" : "var(--red)";

  // Buffer vs expected move: green = safely outside 1σ, yellow = close, red = inside
  const bufferColor =
    s.exp_move_pct > 0
      ? s.buffer_pct >= s.exp_move_pct * 1.2
        ? "var(--green)"
        : s.buffer_pct >= s.exp_move_pct * 0.8
        ? "var(--yellow)"
        : "var(--red)"
      : "var(--text)";

  const bufferArrow = isPut ? "↓" : "↑";

  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      {/* Ticker */}
      <td className="py-3 px-3">
        <Link
          to={`/stock/${s.ticker}`}
          className="font-semibold text-sm hover:underline"
          style={{ color: "var(--accent)" }}
        >
          {s.ticker}
        </Link>
      </td>

      {/* Strategy */}
      <td className="py-3 px-3">
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
          style={{ backgroundColor: stratColor + "22", color: stratColor }}
        >
          {isPut ? "↑ Bull Put" : "↓ Bear Call"}
        </span>
      </td>

      {/* Current price */}
      <td className="py-3 px-3 text-sm text-right font-medium" style={{ color: "var(--text)" }}>
        ${s.stock_price.toLocaleString()}
      </td>

      {/* Strikes / delta */}
      <td className="py-3 px-3 text-sm text-right">
        <span style={{ color: "var(--text)" }}>{s.short_strike}</span>
        <span className="mx-1" style={{ color: "var(--muted)" }}>/</span>
        <span style={{ color: "var(--muted)" }}>{s.long_strike}</span>
        <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>Δ {s.short_delta}</p>
      </td>

      {/* Net credit */}
      <td className="py-3 px-3 text-sm text-right">
        <span style={{ color: "var(--green)" }}>${s.net_credit.toFixed(2)}</span>
        <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>${s.spread_width} wide</p>
      </td>

      {/* Max risk */}
      <td className="py-3 px-3 text-sm text-right">
        <span style={{ color: "var(--red)" }}>${s.max_risk.toFixed(2)}</span>
      </td>

      {/* ROI % */}
      <td className="py-3 px-3 text-sm text-right font-semibold">
        <span style={{ color: s.roi_pct >= 15 ? "var(--green)" : "var(--text)" }}>
          {s.roi_pct.toFixed(1)}%
        </span>
      </td>

      {/* Buffer % — how far breakeven is from current price */}
      <td
        className="py-3 px-3 text-sm text-right font-semibold"
        title={`Breakeven: $${s.breakeven.toFixed(2)}`}
      >
        <span style={{ color: bufferColor }}>
          {bufferArrow} {s.buffer_pct.toFixed(1)}%
        </span>
        <p className="text-xs mt-0.5 font-normal" style={{ color: "var(--muted)" }}>
          be ${s.breakeven.toFixed(2)}
        </p>
      </td>

      {/* Expected move: IV-implied vs HV30 realized */}
      <td className="py-3 px-3 text-sm text-right">
        {s.exp_move_pct > 0 ? (
          <>
            {/* IV-implied (forward-looking) */}
            <span style={{ color: "var(--text)" }}>±{s.exp_move_pct.toFixed(1)}%</span>
            <span className="ml-1 text-xs" style={{ color: "var(--muted)" }}>IV</span>
            {/* HV30-realized (past 30 days) */}
            {s.hv30_move_pct > 0 && (
              <p className="text-xs mt-0.5">
                <span style={{ color: "var(--muted)" }}>±{s.hv30_move_pct.toFixed(1)}%</span>
                <span className="ml-1" style={{ color: "var(--muted)" }}>HV30</span>
                {/* Rich/cheap signal: IV vs HV30 */}
                {s.hv30_pct > 0 && (
                  <span
                    className="ml-1 font-semibold"
                    style={{
                      color: s.iv_pct > s.hv30_pct * 1.1
                        ? "var(--green)"
                        : s.iv_pct < s.hv30_pct * 0.9
                        ? "var(--red)"
                        : "var(--yellow)",
                    }}
                  >
                    {s.iv_pct > s.hv30_pct * 1.1
                      ? "↑rich"
                      : s.iv_pct < s.hv30_pct * 0.9
                      ? "↓cheap"
                      : "≈fair"}
                  </span>
                )}
              </p>
            )}
          </>
        ) : "—"}
      </td>

      {/* DTE */}
      <td className="py-3 px-3 text-sm text-right">
        <span style={{ color: "var(--text)" }}>{s.dte}d</span>
        <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{s.expiry}</p>
      </td>

      {/* IV */}
      <td className="py-3 px-3 text-sm text-right" style={{ color: "var(--muted)" }}>
        {s.iv_pct > 0 ? `${s.iv_pct}%` : "—"}
      </td>

      {/* Events */}
      <td className="py-3 px-3 text-sm text-right">
        <EventsCell events={s.events ?? []} />
      </td>
    </tr>
  );
}

type FilterType = "all" | "put" | "call";
type SortKey = "roi_pct" | "ticker" | "dte" | "net_credit" | "max_risk" | "buffer_pct";

export default function OptionsSpreads() {
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [sortKey, setSortKey] = useState<SortKey>("roi_pct");
  const [sortAsc, setSortAsc] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isForceRefreshing, setIsForceRefreshing] = useState(false);

  const url = isForceRefreshing
    ? "/api/options/spreads?refresh=true"
    : "/api/options/spreads";

  const { data, isLoading, error, refetch } = useQuery<SpreadsResponse>({
    queryKey: ["options-spreads", refreshKey],
    queryFn: () => fetch(url).then((r) => r.json()),
    staleTime: 30 * 60 * 1000, // 30 min
  });

  async function handleRefresh() {
    setIsForceRefreshing(true);
    setRefreshKey((k) => k + 1);
    await refetch();
    setIsForceRefreshing(false);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((a) => !a);
    } else {
      setSortKey(key);
      setSortAsc(key === "ticker");
    }
  }

  const spreads = data?.spreads ?? [];

  const filtered = spreads.filter((s) => {
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

  const puts = spreads.filter((s) => s.strategy.includes("Put")).length;
  const calls = spreads.filter((s) => s.strategy.includes("Call")).length;

  const thStyle = (key: SortKey) => ({
    cursor: "pointer",
    color: sortKey === key ? "var(--accent)" : "var(--muted)",
    userSelect: "none" as const,
    whiteSpace: "nowrap" as const,
  });

  const sortArrow = (key: SortKey) =>
    sortKey === key ? (sortAsc ? " ↑" : " ↓") : "";

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text)" }}>
            Credit Spread Scanner
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Daily-refreshed bull put &amp; bear call spreads · Delta ~0.10 · 30–45 DTE
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          style={{
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--text)",
            cursor: isLoading ? "not-allowed" : "pointer",
            opacity: isLoading ? 0.6 : 1,
          }}
        >
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

      {/* Loading state */}
      {isLoading && (
        <div className="rounded-xl p-10 text-center" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
          <RefreshCw size={28} className="animate-spin mx-auto mb-3" style={{ color: "var(--accent)" }} />
          <p style={{ color: "var(--muted)" }}>Scanning options chains for {20} tickers…</p>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>This takes ~30 seconds on the first load.</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-xl p-6 text-center" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
          <p style={{ color: "var(--red)" }}>Failed to load spreads. Make sure the backend is running.</p>
        </div>
      )}

      {/* Filter bar */}
      {!isLoading && data && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm" style={{ color: "var(--muted)" }}>Show:</span>
          {(["all", "put", "call"] as FilterType[]).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{
                backgroundColor: filterType === t ? "var(--accent)" : "var(--surface)",
                border: "1px solid var(--border)",
                color: filterType === t ? "#fff" : "var(--muted)",
                cursor: "pointer",
              }}
            >
              {t === "all" ? "All" : t === "put" ? "Bull Put Spreads" : "Bear Call Spreads"}
            </button>
          ))}
          <span className="ml-auto text-sm" style={{ color: "var(--muted)" }}>
            {sorted.length} spread{sorted.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Table */}
      {!isLoading && sorted.length > 0 && (
        <div
          className="rounded-xl overflow-auto"
          style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <table className="w-full text-sm min-w-[1050px]">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {[
                  ["ticker", "Ticker"],
                  [null, "Strategy"],
                  [null, "Price"],
                  [null, "Strikes / Δ"],
                  ["net_credit", "Net Credit"],
                  ["max_risk", "Max Risk"],
                  ["roi_pct", "ROI %"],
                  ["buffer_pct", "Buffer %"],
                  [null, "±Move (IV / HV30)"],
                  ["dte", "DTE"],
                  [null, "IV"],
                  [null, "Events (30d)"],
                ].map(([key, label], i) => (
                  <th
                    key={i}
                    className={`py-3 px-3 text-xs font-semibold uppercase tracking-wider ${i > 1 ? "text-right" : "text-left"}`}
                    style={key ? thStyle(key as SortKey) : { color: "var(--muted)", whiteSpace: "nowrap" }}
                    onClick={key ? () => toggleSort(key as SortKey) : undefined}
                  >
                    {label}{key ? sortArrow(key as SortKey) : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, i) => (
                <SpreadRow key={`${s.ticker}-${s.strategy}-${i}`} s={s} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && data && sorted.length === 0 && (
        <div
          className="rounded-xl p-10 text-center"
          style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <TrendingUp size={32} className="mx-auto mb-3" style={{ color: "var(--muted)" }} />
          <p style={{ color: "var(--muted)" }}>
            No spread opportunities found matching current filters.
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            Try clicking Refresh, or check back during market hours.
          </p>
        </div>
      )}

      {/* Legend */}
      <div
        className="rounded-xl p-4 text-xs"
        style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", color: "var(--muted)" }}
      >
        <p className="font-semibold mb-1" style={{ color: "var(--text)" }}>How to read this table</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
          <span><b>Net Credit</b> — premium collected per share (×100 per contract)</span>
          <span><b>Max Risk</b> — spread width − net credit (worst case loss per share)</span>
          <span><b>ROI %</b> — net credit ÷ max risk (return on capital at risk)</span>
          <span><b>Buffer %</b> — how far the stock must move before you lose money (be = breakeven price). Green = buffer &gt; exp. move; yellow = close; red = inside</span>
          <span><b>±Move IV</b> — implied volatility × √(DTE/365): forward-looking market-priced range · <b>HV30</b> — realized std dev of past 30d returns × √(DTE/365): what actually happened</span>
          <span><b style={{color:"var(--green)"}}>↑rich</b> = IV &gt; HV30 (options expensive → good for sellers) · <b style={{color:"var(--red)"}}>↓cheap</b> = IV &lt; HV30 · <b style={{color:"var(--yellow)"}}>≈fair</b> = roughly equal</span>
          <span><b>Delta ~0.10</b> — short leg has ~10% probability of expiring in-the-money</span>
          <span><b>Bull Put</b> — profits if stock stays above short strike · <b>Bear Call</b> — profits if stock stays below short strike</span>
          <span><b style={{color:"#ef4444"}}>Earnings</b> — IV typically spikes into earnings then collapses; avoid unless intentional</span>
          <span><b style={{color:"#f97316"}}>FOMC</b> market-wide · <b style={{color:"#3b82f6"}}>CPI</b> inflation data · <b style={{color:"#8b5cf6"}}>NFP</b> jobs report · <b style={{color:"#22c55e"}}>Ex-Div</b> dividend date</span>
        </div>
      </div>
    </div>
  );
}
