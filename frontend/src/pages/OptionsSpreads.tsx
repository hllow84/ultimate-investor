import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw, TrendingDown, TrendingUp, AlertTriangle, Info, ChevronRight, ChevronDown,
  Search, X, ShieldAlert, Clock, BadgeCheck, Bookmark,
} from "lucide-react";
import { Link } from "react-router-dom";

import { api } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import PortfolioDeltaCard from "@/components/stock/PortfolioDeltaCard";

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
  long_bid: number;
  long_ask: number;
  long_oi: number;
  long_volume: number;
  long_iv_pct: number;
  /** false when this leg had no live two-sided quote — prices below are null. */
  quote_ok: boolean;
  quote_issue: string | null;
  wide_quote: boolean;
  net_credit: number | null;
  max_risk: number | null;
  roi_pct: number | null;
  breakeven: number | null;
  buffer_pct: number | null;
  credit_width_pct: number | null;
  manage_price: number | null;
  manage_profit: number | null;
  suspect: boolean;
  suspect_reason: string | null;
}

interface TechSummary {
  signal: "bullish" | "bearish" | "neutral";
  rsi: number;
  sma50_pct: number | null;
  sma200_pct: number | null;
  w52_high_pct: number | null;
}

interface QuoteQuality {
  market_open: boolean;
  minutes_since_open: number | null;
  opening_range: boolean;
  short_oi: number;
  short_volume: number;
  short_bid: number;
  short_ask: number;
  low_liquidity: boolean;
  /** Widths whose long leg had no usable quote — informational, not a quality flag. */
  unpriced_widths: number[];
  reliable: boolean;
  flags: string[];
}

interface NextEarnings {
  date: string;
  days_away: number;
  before_expiry: boolean;
}

interface ExDivRisk {
  date: string;
  days_away: number;
  amount: number | null;
  moneyness: string;
  note: string;
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
  short_ask: number;
  roi_pct: number;
  widths: WidthVariant[];
  quality: QuoteQuality;
  iv_rank: number | null;
  iv_percentile: number | null;
  iv_atm_pct: number | null;
  iv_rank_source: "observed" | "hv_proxy" | "unavailable";
  iv_52w_low: number | null;
  iv_52w_high: number | null;
  next_earnings: NextEarnings | null;
  exdiv_risk: ExDivRisk | null;
  manage_dte: number;
  days_to_manage_dte: number;
  manage_date: string;
  manage_profit_pct: number;
  events?: SpreadEvent[];
  tech?: TechSummary;
}

interface VixInfo {
  color: string;
  label: string;
  message: string;
}

interface SpreadsResponse {
  spreads: Spread[];
  vix: number;
  vix_info: VixInfo;
  cached: boolean;
  after_hours: boolean;
  minutes_since_open: number | null;
  opening_range: boolean;
  opening_range_minutes: number;
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

type SortKey = "roi_pct" | "ticker" | "dte" | "exp_move_pct" | "iv_rank";
type FilterType = "all" | "put" | "call";

/**
 * Kept to 12 data columns so the table fits a normal window without horizontal
 * scrolling. Strategy rides under the ticker, spot under the strikes, and max
 * risk under the credit — each pair reads as one fact anyway, and stacking them
 * uses vertical space the rows already occupied.
 */
const COLUMNS: [SortKey | null, string][] = [
  ["ticker", "Ticker"],
  [null, "Strikes / Δ"],
  [null, "Credit / Risk"],
  ["roi_pct", "ROI %"],
  [null, "Buffer %"],
  ["exp_move_pct", "±1σ"],
  ["iv_rank", "IV Rank"],
  [null, "Manage"],
  ["dte", "DTE"],
  [null, "Earnings"],
  [null, "Events"],
  [null, "Tech"],
];

const NUM_COLS = COLUMNS.length + 1;   // + the expand-chevron column

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBufferColor(buffer_pct: number, exp_move_pct: number): string {
  if (exp_move_pct <= 0) return "var(--text)";
  if (buffer_pct >= exp_move_pct * 1.2) return "var(--green)";
  if (buffer_pct >= exp_move_pct * 0.8) return "var(--yellow)";
  return "var(--red)";
}

/**
 * The width the collapsed row summarises: narrowest properly-quoted variant,
 * preferring one that isn't flagged as implausible so a bad quote never becomes
 * the headline number.
 */
function primaryWidth(s: Spread): WidthVariant | undefined {
  const priced = s.widths.filter(w => w.quote_ok);
  return priced.find(w => !w.suspect) ?? priced[0] ?? s.widths[0];
}

function ivRankColor(rank: number): string {
  if (rank >= 50) return "var(--green)";
  if (rank >= 30) return "var(--yellow)";
  return "var(--muted)";
}

const dash = <span style={{ color: "var(--muted)" }}>—</span>;

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

function SummaryCard({ count, puts, calls, flagged }: { count: number; puts: number; calls: number; flagged: number }) {
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
        <div>
          <p className="text-2xl font-semibold" style={{ color: flagged > 0 ? "var(--yellow)" : "var(--muted)" }}>{flagged}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>Data-quality flags</p>
        </div>
      </div>
      <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>Delta ~0.10 short leg · 30–45 DTE · conservative bid/ask pricing · expand rows for $5/$10/$25/$50/$100 widths</p>
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

function TechBadge({ tech }: { tech?: TechSummary }) {
  if (!tech) return dash;
  const { signal, rsi, sma50_pct, sma200_pct } = tech;
  const sigColor = signal === "bullish" ? "var(--green)" : signal === "bearish" ? "var(--red)" : "var(--yellow)";
  const sigLabel = signal === "bullish" ? "▲ Bullish" : signal === "bearish" ? "▼ Bearish" : "● Neutral";
  const fmt = (v: number | null) =>
    v != null ? <span style={{ color: v > 0 ? "var(--green)" : "var(--red)" }}>{v > 0 ? "+" : ""}{v}%</span> : null;
  return (
    <div className="text-xs leading-snug">
      <span className="font-semibold" style={{ color: sigColor }}>{sigLabel}</span>
      <p style={{ color: "var(--muted)" }}>
        RSI <span style={{ color: rsi > 70 ? "var(--red)" : rsi < 30 ? "var(--green)" : "var(--text)" }}>{rsi}</span>
      </p>
      {sma50_pct != null && <p style={{ color: "var(--muted)" }}>50MA {fmt(sma50_pct)}</p>}
      {sma200_pct != null && <p style={{ color: "var(--muted)" }}>200MA {fmt(sma200_pct)}</p>}
    </div>
  );
}

function EventsCell({ events }: { events: SpreadEvent[] }) {
  if (!events || events.length === 0) return dash;
  return (
    <div className="flex flex-col gap-1">
      {events.map((ev, i) => <EventBadge key={i} ev={ev} />)}
    </div>
  );
}

/** Quote-freshness / data-quality dot shown beside the ticker. */
function QualityBadge({ s }: { s: Spread }) {
  const q = s.quality;
  const anySuspect = s.widths.some(w => w.suspect);
  if (!q) return null;

  const color = anySuspect ? "var(--red)" : q.flags.length > 0 ? "var(--yellow)" : "var(--green)";
  const Icon = anySuspect ? ShieldAlert : q.opening_range ? Clock : BadgeCheck;
  const title = anySuspect
    ? `Verify vs broker — ${s.widths.find(w => w.suspect)?.suspect_reason}`
    : q.flags.length > 0
      ? `Quote quality: ${q.flags.join(" · ")}`
      : `Quote looks clean — OI ${q.short_oi}, volume ${q.short_volume}, short ${q.short_bid}/${q.short_ask}`;

  return (
    <span title={title} className="inline-flex items-center ml-1 align-middle">
      <Icon size={12} style={{ color }} />
    </span>
  );
}

function IvRankCell({ s }: { s: Spread }) {
  if (s.iv_rank == null) {
    return (
      <div className="text-xs" title="Not enough IV history yet — readings accumulate one per scan per day.">
        {dash}
        <p style={{ color: "var(--muted)" }}>IV {s.iv_pct}%</p>
      </div>
    );
  }
  const proxy = s.iv_rank_source === "hv_proxy";
  const title = proxy
    ? `Proxy: ranked against this ticker's rolling 30-day realised vol (${s.iv_52w_low}%–${s.iv_52w_high}%) `
      + "because there is not yet a year of recorded IV. Implied vol usually trades above realised, "
      + "so this proxy reads high. It self-corrects as daily IV readings accumulate."
    : `Ranked against ${s.iv_52w_low}%–${s.iv_52w_high}% of recorded ATM IV over the past year.`;
  return (
    <div className="text-xs" title={title}>
      <span className="font-semibold text-sm" style={{ color: ivRankColor(s.iv_rank) }}>
        {s.iv_rank.toFixed(0)}
        {proxy && <span style={{ color: "var(--muted)" }}>*</span>}
      </span>
      {s.iv_percentile != null && (
        <p style={{ color: "var(--muted)" }}>{s.iv_percentile.toFixed(0)}th pct</p>
      )}
      <p style={{ color: "var(--muted)" }}>ATM {s.iv_atm_pct}%</p>
    </div>
  );
}

function EarningsCell({ s }: { s: Spread }) {
  if (!s.next_earnings) return dash;
  const { date, days_away, before_expiry } = s.next_earnings;
  const color = before_expiry ? "var(--red)" : "var(--muted)";
  return (
    <div className="text-xs" title={
      before_expiry
        ? `Reports ${date} — BEFORE the ${s.expiry} expiration. The short leg carries an earnings gap.`
        : `Reports ${date}, after the ${s.expiry} expiration.`
    }>
      <span className="font-semibold" style={{ color }}>
        {before_expiry ? "⚠ " : ""}{date.slice(5).replace("-", "/")}
      </span>
      <p style={{ color: "var(--muted)" }}>{days_away}d {before_expiry ? "· pre-exp" : "· post-exp"}</p>
    </div>
  );
}

function ManageCell({ s, w }: { s: Spread; w?: WidthVariant }) {
  if (!w || !w.quote_ok || w.manage_price == null) return dash;
  const to21 = s.days_to_manage_dte;
  const color = to21 <= 0 ? "var(--red)" : to21 <= 5 ? "var(--yellow)" : "var(--muted)";
  return (
    <div className="text-xs" title={
      `Close at ${s.manage_profit_pct}% of credit: buy the spread back for $${w.manage_price?.toFixed(2)} `
      + `to bank $${w.manage_profit?.toFixed(2)}/share. Second checkpoint is ${s.manage_dte} DTE on ${s.manage_date}.`
    }>
      <span className="font-semibold" style={{ color: "var(--text)" }}>${w.manage_price.toFixed(2)}</span>
      <p style={{ color: "var(--muted)" }}>+${w.manage_profit?.toFixed(2)}</p>
      <p style={{ color }}>{to21 <= 0 ? `${s.manage_dte} DTE now` : `${to21}d to ${s.manage_dte}DTE`}</p>
    </div>
  );
}

function QuoteUnavailable({ issue }: { issue?: string | null }) {
  return (
    <span className="text-xs italic" style={{ color: "var(--yellow)" }}
      title={issue ? `Quote rejected: ${issue}` : undefined}>
      quote unavailable
    </span>
  );
}

// ─── Main spread row with expandable widths ───────────────────────────────────

function SpreadRows({ s, expanded, onToggle }: {
  s: Spread;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { isAuthenticated } = useAuth();
  const qc = useQueryClient();
  const [contracts, setContracts] = useState(1);
  const [saving, setSaving] = useState<number | null>(null);
  const [saved, setSaved] = useState<Record<number, string>>({});

  const isPut = s.strategy.includes("Put");
  const stratColor = isPut ? "var(--green)" : "var(--red)";
  const bufferArrow = isPut ? "↓" : "↑";
  const defaultW = primaryWidth(s);
  const priced = defaultW?.quote_ok ?? false;

  // IV rich/cheap label
  const ivVsHv = s.hv30_pct > 0
    ? s.iv_pct > s.hv30_pct * 1.1 ? { label: "↑rich", color: "var(--green)" }
    : s.iv_pct < s.hv30_pct * 0.9 ? { label: "↓cheap", color: "var(--red)" }
    : { label: "≈fair", color: "var(--yellow)" }
    : null;

  const rowBg = expanded ? "var(--surface)" : "transparent";

  async function savePosition(w: WidthVariant) {
    if (!w.net_credit) return;
    setSaving(w.width);
    try {
      await api.options.savePosition({
        ticker: s.ticker,
        opt_type: isPut ? "put" : "call",
        short_strike: s.short_strike,
        long_strike: w.long_strike,
        expiry: s.expiry,
        net_credit: w.net_credit,
        contracts,
        short_iv_pct: s.iv_pct,
        long_iv_pct: w.long_iv_pct,
      });
      setSaved(prev => ({ ...prev, [w.width]: "saved" }));
      qc.invalidateQueries({ queryKey: ["spread-positions"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSaved(prev => ({ ...prev, [w.width]: msg.includes("409") ? "already saved" : "failed" }));
    }
    setSaving(null);
  }

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

        {/* Ticker · strategy · risk flags */}
        <td className="py-3 px-2" onClick={e => e.stopPropagation()}>
          <span className="inline-flex items-center">
            {s.ticker.startsWith("^") ? (
              <span className="font-semibold text-sm" style={{ color: "var(--accent)" }}>{s.ticker}</span>
            ) : (
              <Link to={`/stock/${s.ticker}`} className="font-semibold text-sm hover:underline" style={{ color: "var(--accent)" }}>
                {s.ticker}
              </Link>
            )}
            <QualityBadge s={s} />
          </span>
          <p className="mt-0.5">
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap"
              style={{ backgroundColor: stratColor + "22", color: stratColor }}>
              {isPut ? "↑ Bull Put" : "↓ Bear Call"}
            </span>
          </p>
          {s.widths.some(w => w.suspect) && (
            <p className="text-xs font-semibold mt-0.5 px-1 py-0.5 rounded whitespace-nowrap inline-block"
              style={{ backgroundColor: "var(--red)22", color: "var(--red)" }}
              title={s.widths.find(w => w.suspect)?.suspect_reason ?? ""}>
              verify vs broker
            </p>
          )}
          {s.exdiv_risk && (
            <p className="text-xs font-semibold whitespace-nowrap" style={{ color: "#22c55e" }}
              title={s.exdiv_risk.note}>
              ⚑ ex-div {s.exdiv_risk.date.slice(5).replace("-", "/")}
            </p>
          )}
        </td>

        {/* Strikes · delta · spot */}
        <td className="py-3 px-2 text-sm text-right whitespace-nowrap">
          <span style={{ color: "var(--text)" }}>{s.short_strike}</span>
          <span className="mx-1" style={{ color: "var(--muted)" }}>/</span>
          <span style={{ color: "var(--muted)" }}>{defaultW?.long_strike ?? "—"}</span>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>Δ {s.short_delta}</p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>spot ${s.stock_price.toLocaleString()}</p>
        </td>

        {/* Credit · max risk · width (narrowest cleanly-quoted width) */}
        <td className="py-3 px-2 text-sm text-right whitespace-nowrap">
          {priced && defaultW ? (
            <>
              <span style={{ color: "var(--green)" }}>${defaultW.net_credit!.toFixed(2)}</span>
              <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                risk <span style={{ color: "var(--red)" }}>${defaultW.max_risk!.toFixed(2)}</span>
              </p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>${defaultW.width} wide</p>
            </>
          ) : <QuoteUnavailable issue={defaultW?.quote_issue} />}
        </td>

        {/* ROI % */}
        <td className="py-3 px-2 text-sm text-right font-semibold">
          {priced && defaultW ? (
            <span style={{ color: defaultW.suspect ? "var(--red)" : defaultW.roi_pct! >= 15 ? "var(--green)" : "var(--text)" }}>
              {defaultW.roi_pct!.toFixed(1)}%
            </span>
          ) : dash}
        </td>

        {/* Buffer % */}
        <td className="py-3 px-2 text-sm text-right font-semibold"
          title={priced && defaultW ? `Breakeven: $${defaultW.breakeven!.toFixed(2)}` : undefined}>
          {priced && defaultW ? (
            <>
              <span style={{ color: getBufferColor(defaultW.buffer_pct!, s.exp_move_pct) }}>
                {bufferArrow} {defaultW.buffer_pct!.toFixed(1)}%
              </span>
              <p className="text-xs mt-0.5 font-normal" style={{ color: "var(--muted)" }}>
                be ${defaultW.breakeven!.toFixed(2)}
              </p>
            </>
          ) : dash}
        </td>

        {/* ±1σ over the trade's DTE — IV-implied on top, HV30-realised below */}
        <td className="py-3 px-2 text-sm text-right whitespace-nowrap"
          title={`IV-implied 1σ ±${s.exp_move_pct}% (IV ${s.iv_pct}% annualised)`
            + (s.hv30_move_pct > 0 ? ` · realised 1σ ±${s.hv30_move_pct}% (HV30 ${s.hv30_pct}%)` : "")}>
          {s.exp_move_pct > 0 ? (
            <>
              <span style={{ color: "var(--text)" }}>±{s.exp_move_pct.toFixed(1)}%</span>
              <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>IV {s.iv_pct}%</p>
              {s.hv30_move_pct > 0 && (
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  HV30 {s.hv30_pct}%
                  {ivVsHv && (
                    <span className="ml-1 font-semibold" style={{ color: ivVsHv.color }}>{ivVsHv.label}</span>
                  )}
                </p>
              )}
            </>
          ) : "—"}
        </td>

        {/* IV Rank */}
        <td className="py-3 px-2 text-right"><IvRankCell s={s} /></td>

        {/* Manage target */}
        <td className="py-3 px-2 text-right"><ManageCell s={s} w={defaultW} /></td>

        {/* DTE */}
        <td className="py-3 px-2 text-sm text-right">
          <span style={{ color: "var(--text)" }}>{s.dte}d</span>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{s.expiry}</p>
        </td>

        {/* Earnings */}
        <td className="py-3 px-2 text-right"><EarningsCell s={s} /></td>

        {/* Events */}
        <td className="py-3 px-2 text-sm">
          <EventsCell events={s.events ?? []} />
        </td>

        {/* Tech */}
        <td className="py-3 px-2">
          <TechBadge tech={s.tech} />
        </td>
      </tr>

      {/* ── Expanded widths panel ── */}
      {expanded && (
        <tr style={{ borderBottom: "1px solid var(--border)" }}>
          <td colSpan={NUM_COLS} className="pb-3 px-10" style={{ backgroundColor: "var(--bg)" }}>

            {/* Quality / risk notes */}
            {(s.quality?.flags?.length > 0 || s.quality?.unpriced_widths?.length > 0 || s.exdiv_risk) && (
              <div className="flex flex-col gap-1.5 mb-3 mt-1">
                {s.quality?.unpriced_widths?.length > 0 && (
                  <div className="flex items-start gap-2 text-xs rounded-lg px-3 py-2"
                    style={{ backgroundColor: "var(--bg)", border: "1px solid var(--border)", color: "var(--muted)" }}>
                    <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>
                      No live two-sided quote on the long leg at
                      {" "}{s.quality.unpriced_widths.map(w => `$${w}`).join(", ")} wide, so
                      {s.quality.unpriced_widths.length > 1 ? " those widths are" : " that width is"} left unpriced.
                      The other widths are unaffected.
                    </span>
                  </div>
                )}
                {s.quality?.flags?.length > 0 && (
                  <div className="flex items-start gap-2 text-xs rounded-lg px-3 py-2"
                    style={{ backgroundColor: "#eab30811", border: "1px solid #eab30833", color: "#eab308" }}>
                    <Clock size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span><b>Quote quality:</b> {s.quality.flags.join(" · ")}
                      {" — "}short leg OI {s.quality.short_oi}, volume {s.quality.short_volume},
                      bid/ask {s.quality.short_bid}/{s.quality.short_ask}.</span>
                  </div>
                )}
                {s.exdiv_risk && (
                  <div className="flex items-start gap-2 text-xs rounded-lg px-3 py-2"
                    style={{ backgroundColor: "#22c55e11", border: "1px solid #22c55e33", color: "#22c55e" }}>
                    <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span><b>Ex-dividend assignment risk:</b> {s.exdiv_risk.note}
                      {s.exdiv_risk.amount != null && ` Indicated dividend $${s.exdiv_risk.amount}.`}</span>
                  </div>
                )}
              </div>
            )}

            {/* Contracts selector for saving */}
            <div className="flex items-center gap-2 mb-2 text-xs" style={{ color: "var(--muted)" }}>
              <span>Contracts to save:</span>
              <input
                type="number" min={1} max={100} value={contracts}
                onChange={e => setContracts(Math.max(1, Number(e.target.value) || 1))}
                onClick={e => e.stopPropagation()}
                className="w-16 px-2 py-1 rounded outline-none"
                style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
              {!isAuthenticated && (
                <span>· <Link to="/login" style={{ color: "var(--accent)" }} className="hover:underline">sign in</Link> to save positions</span>
              )}
            </div>

            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Width", "Long Strike", "Long Ask", "Net Credit", "Max Risk", "ROI %",
                    "Credit/Width", "Buffer %", "Breakeven", `Close @ ${s.manage_profit_pct}%`, ""].map((h, i) => (
                    <th key={i} className={`py-1.5 px-2 font-semibold uppercase tracking-wider ${i > 0 ? "text-right" : "text-left"}`}
                      style={{ color: "var(--muted)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.widths.map((w, i) => {
                  const isDefault = w === defaultW;
                  const rowStyle = {
                    borderBottom: i < s.widths.length - 1 ? "1px solid var(--border)" : "none",
                    backgroundColor: w.suspect ? "var(--red)0f" : isDefault ? "var(--accent)11" : "transparent",
                  };

                  if (!w.quote_ok) {
                    return (
                      <tr key={w.width} style={rowStyle}>
                        <td className="py-2 px-2 font-semibold" style={{ color: "var(--text)" }}>${w.width}</td>
                        <td className="py-2 px-2 text-right" style={{ color: "var(--muted)" }}>{w.long_strike}</td>
                        <td colSpan={9} className="py-2 px-2 text-right">
                          <QuoteUnavailable issue={w.quote_issue} />
                          <span className="ml-2" style={{ color: "var(--muted)" }}>
                            bid {w.long_bid} / ask {w.long_ask} · OI {w.long_oi}
                          </span>
                        </td>
                      </tr>
                    );
                  }

                  const bColor = getBufferColor(w.buffer_pct!, s.exp_move_pct);
                  const state = saved[w.width];
                  return (
                    <tr key={w.width} style={rowStyle}>
                      <td className="py-2 px-2 font-semibold" style={{ color: "var(--text)" }}>
                        ${w.width}
                        {isDefault && <span className="ml-1.5 text-xs px-1 rounded" style={{ backgroundColor: "var(--accent)33", color: "var(--accent)" }}>default</span>}
                        {w.suspect && (
                          <span className="ml-1.5 text-xs px-1 rounded" title={w.suspect_reason ?? ""}
                            style={{ backgroundColor: "var(--red)33", color: "var(--red)" }}>verify vs broker</span>
                        )}
                        {w.wide_quote && !w.suspect && (
                          <span className="ml-1.5 text-xs px-1 rounded" title="Bid/ask spread is a large fraction of the mid — expect fill slippage."
                            style={{ backgroundColor: "#eab30833", color: "#eab308" }}>wide</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right" style={{ color: "var(--muted)" }}>{w.long_strike}</td>
                      <td className="py-2 px-2 text-right" style={{ color: "var(--muted)" }}>${w.long_ask.toFixed(2)}</td>
                      <td className="py-2 px-2 text-right font-semibold" style={{ color: "var(--green)" }}>
                        ${w.net_credit!.toFixed(2)}
                        <span className="ml-1 font-normal" style={{ color: "var(--muted)" }}>= ${(w.net_credit! * 100).toFixed(0)}/contract</span>
                      </td>
                      <td className="py-2 px-2 text-right" style={{ color: "var(--red)" }}>${w.max_risk!.toFixed(2)}</td>
                      <td className="py-2 px-2 text-right font-semibold"
                        style={{ color: w.suspect ? "var(--red)" : w.roi_pct! >= 15 ? "var(--green)" : w.roi_pct! >= 5 ? "var(--text)" : "var(--muted)" }}>
                        {w.roi_pct!.toFixed(1)}%
                      </td>
                      <td className="py-2 px-2 text-right"
                        style={{ color: w.suspect ? "var(--red)" : "var(--muted)" }}>
                        {w.credit_width_pct?.toFixed(1)}%
                      </td>
                      <td className="py-2 px-2 text-right font-semibold" style={{ color: bColor }}>
                        {bufferArrow} {w.buffer_pct!.toFixed(1)}%
                      </td>
                      <td className="py-2 px-2 text-right" style={{ color: "var(--muted)" }}>${w.breakeven!.toFixed(2)}</td>
                      <td className="py-2 px-2 text-right" style={{ color: "var(--text)" }}
                        title={`Buy back at $${w.manage_price?.toFixed(2)} to bank $${w.manage_profit?.toFixed(2)}/share (${(w.manage_profit! * 100 * contracts).toFixed(0)} total on ${contracts} contract${contracts !== 1 ? "s" : ""}).`}>
                        ${w.manage_price!.toFixed(2)}
                        <span className="ml-1" style={{ color: "var(--green)" }}>+${w.manage_profit!.toFixed(2)}</span>
                      </td>
                      <td className="py-2 px-2 text-right">
                        {isAuthenticated && (
                          <button
                            onClick={e => { e.stopPropagation(); savePosition(w); }}
                            disabled={saving === w.width || !!state}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded font-medium whitespace-nowrap"
                            style={{
                              backgroundColor: state ? "transparent" : "var(--accent)22",
                              color: state === "failed" ? "var(--red)" : state ? "var(--muted)" : "var(--accent)",
                              cursor: state ? "default" : "pointer",
                            }}>
                            <Bookmark size={11} />
                            {state ?? (saving === w.width ? "saving…" : "Save position")}
                          </button>
                        )}
                      </td>
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

// ─── Table shell shared by the curated and custom-ticker tables ───────────────

function SpreadTable({ rows, keyPrefix, expandedSet, onToggle, sortKey, sortAsc, onSort }: {
  rows: Spread[];
  keyPrefix: string;
  expandedSet: Set<string>;
  onToggle: (key: string) => void;
  sortKey?: SortKey;
  sortAsc?: boolean;
  onSort?: (key: SortKey) => void;
}) {
  const thStyle = (key: SortKey) => ({
    cursor: onSort ? "pointer" : "default",
    color: sortKey === key ? "var(--accent)" : "var(--muted)",
    userSelect: "none" as const,
    whiteSpace: "nowrap" as const,
  });
  const arrow = (key: SortKey) => (sortKey === key ? (sortAsc ? " ↑" : " ↓") : "");

  return (
    <table className="w-full text-sm min-w-[1180px]">
      <thead>
        <tr style={{ borderBottom: "1px solid var(--border)" }}>
          <th className="py-3 pl-3 pr-1 w-6" />
          {COLUMNS.map(([key, label], i) => (
            <th key={i}
              // `uppercase` would render the sigma as a capital Σ, which is a
              // different symbol — that one header keeps its own casing.
              className={`py-3 px-2 text-xs font-semibold tracking-wider ${label.includes("σ") ? "" : "uppercase"} ${i > 0 ? "text-right" : "text-left"}`}
              style={key && onSort ? thStyle(key) : { color: "var(--muted)", whiteSpace: "nowrap" }}
              onClick={key && onSort ? () => onSort(key) : undefined}>
              {label}{key && onSort ? arrow(key) : ""}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((s, i) => {
          const key = `${keyPrefix}${s.ticker}-${s.strategy}`;
          return (
            <SpreadRows key={`${key}-${i}`} s={s} expanded={expandedSet.has(key)} onToggle={() => onToggle(key)} />
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Custom ticker scanner ────────────────────────────────────────────────────

interface CustomResult {
  ticker: string;
  spreads: Spread[];
  error?: string;
  after_hours?: boolean;
}

function CustomTickerScanner({ expandedSet, onToggle }: {
  expandedSet: Set<string>;
  onToggle: (key: string) => void;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CustomResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    const sym = input.trim().toUpperCase();
    if (!sym) return;
    if (results.find(r => r.ticker === sym)) {
      setInput("");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/options/spreads/ticker/${sym}`);
      const data = await res.json();
      if (res.status === 400) {
        setResults(prev => [...prev, { ticker: sym, spreads: [], error: data.detail }]);
      } else {
        setResults(prev => [...prev, { ticker: sym, spreads: data.spreads ?? [], error: data.error, after_hours: data.after_hours }]);
      }
    } catch {
      setResults(prev => [...prev, { ticker: sym, spreads: [], error: "Network error" }]);
    }
    setLoading(false);
    setInput("");
    inputRef.current?.focus();
  }

  function removeResult(ticker: string) {
    setResults(prev => prev.filter(r => r.ticker !== ticker));
  }

  const allCustomSpreads = results.flatMap(r => r.spreads);

  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
      <p className="text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>Scan a custom ticker</p>
      <form onSubmit={handleScan} className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--muted)" }} />
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            placeholder="e.g. COIN, PLTR, RKLB"
            className="w-full pl-8 pr-3 py-2 rounded-lg text-sm outline-none"
            style={{ backgroundColor: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
        </div>
        <button type="submit" disabled={loading || !input.trim()}
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{ backgroundColor: "var(--accent)", color: "#fff", opacity: loading || !input.trim() ? 0.5 : 1, cursor: loading || !input.trim() ? "not-allowed" : "pointer" }}>
          {loading ? <RefreshCw size={14} className="animate-spin" /> : "Scan"}
        </button>
      </form>

      {/* Scanned ticker chips */}
      {results.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {results.map(r => (
            <span key={r.ticker} className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{
                backgroundColor: r.error ? "var(--red)22" : r.spreads.length > 0 ? "var(--green)22" : "var(--muted)22",
                color: r.error ? "var(--red)" : r.spreads.length > 0 ? "var(--green)" : "var(--muted)",
                border: "1px solid currentColor",
              }}>
              {r.ticker}
              {r.error ? " — " + r.error : ` — ${r.spreads.length} spread${r.spreads.length !== 1 ? "s" : ""}`}
              <button onClick={() => removeResult(r.ticker)} style={{ lineHeight: 1 }}>
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Results table */}
      {allCustomSpreads.length > 0 && (
        <div className="mt-4 rounded-lg overflow-auto" style={{ border: "1px solid var(--border)" }}>
          <SpreadTable rows={allCustomSpreads} keyPrefix="custom-" expandedSet={expandedSet} onToggle={onToggle} />
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OptionsSpreads() {
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [sortKey, setSortKey] = useState<SortKey>("roi_pct");
  const [sortAsc, setSortAsc] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = useState(0);
  const [isForceRefreshing, setIsForceRefreshing] = useState(false);

  // Quality / premium filters (all default off — they hide data, so they opt in)
  const [ivRankOn, setIvRankOn] = useState(false);
  const [minIvRank, setMinIvRank] = useState(30);
  const [excludeEarnings, setExcludeEarnings] = useState(false);
  const [hideFlagged, setHideFlagged] = useState(false);

  const url = isForceRefreshing ? "/api/options/spreads?refresh=true" : "/api/options/spreads";

  const { data, isLoading, error, refetch } = useQuery<SpreadsResponse>({
    queryKey: ["options-spreads", refreshKey],
    queryFn: async () => {
      const res = await fetch(url);
      // A 500 body is plain text, not JSON — reading it gives a usable message
      // instead of an opaque "Unexpected token" parse error.
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Scanner returned ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
      }
      return res.json();
    },
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
    if (filterType === "put" && !s.strategy.includes("Put")) return false;
    if (filterType === "call" && !s.strategy.includes("Call")) return false;
    if (ivRankOn && (s.iv_rank == null || s.iv_rank < minIvRank)) return false;
    if (excludeEarnings && s.next_earnings?.before_expiry) return false;
    if (hideFlagged && (s.quality?.flags?.length > 0 || s.widths.some(w => w.suspect))) return false;
    return true;
  });
  const sorted = [...filtered].sort((a, b) => {
    const va = sortKey === "ticker" ? a.ticker : (a[sortKey] as number | null) ?? -1;
    const vb = sortKey === "ticker" ? b.ticker : (b[sortKey] as number | null) ?? -1;
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return sortAsc ? cmp : -cmp;
  });

  const puts = spreads.filter(s => s.strategy.includes("Put")).length;
  const calls = spreads.filter(s => s.strategy.includes("Call")).length;
  const flagged = spreads.filter(s => s.quality?.flags?.length > 0 || s.widths.some(w => w.suspect)).length;
  const hidden = spreads.length - filtered.length;

  const toggleStyle = (on: boolean) => ({
    backgroundColor: on ? "var(--accent)" : "var(--surface)",
    border: "1px solid var(--border)",
    color: on ? "#fff" : "var(--muted)",
    cursor: "pointer" as const,
  });

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
          <SummaryCard count={data.count} puts={puts} calls={calls} flagged={flagged} />
        </div>
      )}

      {/* Beta-weighted portfolio delta */}
      <PortfolioDeltaCard />

      {/* Opening-range warning — the least reliable quotes of the day */}
      {data?.opening_range && (
        <div className="flex items-start gap-3 rounded-xl px-4 py-3 text-sm"
          style={{ backgroundColor: "#eab30811", border: "1px solid #eab30833", color: "#eab308" }}>
          <Clock size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            <b>Opening range — {data.minutes_since_open} minutes after the open.</b> Market makers have not finished
            re-quoting the chain: bids and asks are thin, one-sided, and occasionally crossed, and open interest still
            reflects yesterday. Rows built on an incomplete quote are marked <i>quote unavailable</i> rather than priced,
            but anything shown in the first {data.opening_range_minutes} minutes deserves a broker check before you trade it.
          </span>
        </div>
      )}

      {/* After-hours warning */}
      {data?.after_hours && (
        <div className="flex items-start gap-3 rounded-xl px-4 py-3 text-sm"
          style={{ backgroundColor: "#f9731611", border: "1px solid #f9731633", color: "#f97316" }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            <b>Market closed — prices are stale.</b> Credits are calculated from the last live bid/ask of the session.
            Actual premiums at market open will differ. Use these numbers for screening only.
          </span>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="rounded-xl p-10 text-center" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
          <RefreshCw size={28} className="animate-spin mx-auto mb-3" style={{ color: "var(--accent)" }} />
          <p style={{ color: "var(--muted)" }}>Scanning options chains for 21 tickers…</p>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>This takes ~40 seconds on the first load.</p>
        </div>
      )}

      {error && (
        <div className="rounded-xl p-6 text-center" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
          <p style={{ color: "var(--red)" }}>Failed to load spreads. Make sure the backend is running.</p>
          <p className="text-xs mt-2 font-mono" style={{ color: "var(--muted)" }}>
            {error instanceof Error ? error.message : String(error)}
          </p>
        </div>
      )}

      {/* Filters */}
      {!isLoading && data && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm" style={{ color: "var(--muted)" }}>Show:</span>
            {(["all", "put", "call"] as FilterType[]).map(t => (
              <button key={t} onClick={() => setFilterType(t)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium"
                style={toggleStyle(filterType === t)}>
                {t === "all" ? "All" : t === "put" ? "Bull Put Spreads" : "Bear Call Spreads"}
              </button>
            ))}
            <span className="ml-auto text-sm" style={{ color: "var(--muted)" }}>
              {sorted.length} spread{sorted.length !== 1 ? "s" : ""}
              {hidden > 0 && ` · ${hidden} hidden by filters`}
            </span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={() => setIvRankOn(v => !v)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium"
              style={toggleStyle(ivRankOn)}
              title="Restrict to richer-premium environments: only spreads whose ATM IV sits at or above this rank within the ticker's own 52-week IV range.">
              IV Rank ≥
            </button>
            <input
              type="number" min={0} max={100} step={5} value={minIvRank}
              onChange={e => setMinIvRank(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
              disabled={!ivRankOn}
              className="w-20 px-2 py-1.5 rounded-lg text-sm outline-none"
              style={{
                backgroundColor: "var(--surface)", border: "1px solid var(--border)",
                color: ivRankOn ? "var(--text)" : "var(--muted)", opacity: ivRankOn ? 1 : 0.5,
              }}
            />

            <button onClick={() => setExcludeEarnings(v => !v)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium"
              style={toggleStyle(excludeEarnings)}
              title="Drop single names that report earnings on or before the expiration date.">
              Exclude earnings before expiry
            </button>

            <button onClick={() => setHideFlagged(v => !v)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium"
              style={toggleStyle(hideFlagged)}
              title="Hide rows carrying any quote-quality flag: opening range, thin open interest, wide markets, or an implausible credit/width ratio.">
              Hide flagged quotes
            </button>

            <span className="text-xs" style={{ color: "var(--muted)" }}>click row to expand widths</span>
          </div>
        </div>
      )}

      {/* Custom ticker scanner */}
      {!isLoading && data && (
        <CustomTickerScanner expandedSet={expanded} onToggle={toggleExpand} />
      )}

      {/* Table */}
      {!isLoading && sorted.length > 0 && (
        <div className="rounded-xl overflow-auto" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
          <SpreadTable
            rows={sorted}
            keyPrefix=""
            expandedSet={expanded}
            onToggle={toggleExpand}
            sortKey={sortKey}
            sortAsc={sortAsc}
            onSort={toggleSort}
          />
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && data && sorted.length === 0 && (
        <div className="rounded-xl p-10 text-center" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
          <TrendingUp size={32} className="mx-auto mb-3" style={{ color: "var(--muted)" }} />
          <p style={{ color: "var(--muted)" }}>No spread opportunities matching current filters.</p>
          {hidden > 0 && (
            <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
              {hidden} spread{hidden !== 1 ? "s were" : " was"} filtered out — try relaxing the IV Rank threshold
              or turning off the earnings / flagged-quote filters.
            </p>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="rounded-xl p-4 text-xs" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", color: "var(--muted)" }}>
        <p className="font-semibold mb-2" style={{ color: "var(--text)" }}>Legend</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
          <span><b style={{ color: "var(--text)" }}>Net Credit</b> — short bid − long ask (conservative realistic fill) per share (×100 = $ per contract)</span>
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
          <span>
            <b style={{ color: "var(--text)" }}>IV Rank</b> — where today's <b>ATM</b> IV sits inside this ticker's own 52-week IV range (0 = the year's low, 100 = its high).
            Unlike raw IV it is comparable across tickers and across time. The second line is IV <b>Percentile</b> — the share of days in the window that were <i>less</i> volatile than today.
          </span>
          <span>
            <b style={{ color: "var(--muted)" }}>*</b> after an IV Rank means it is a <b>proxy</b>: ranked against rolling 30-day <i>realised</i> vol because a year of recorded IV
            does not exist yet (one reading is stored per ticker per day). Implied vol usually trades above realised, so the proxy reads high — it converges on the real thing as readings accumulate.
          </span>
          <span><b style={{ color: "var(--text)" }}>Manage</b> — the debit to pay to close at 50% of the credit received, the profit that banks, and the countdown to the 21-DTE checkpoint</span>
          <span>
            <b style={{ color: "var(--text)" }}>Quote quality icon</b> beside the ticker:
            <b style={{ color: "var(--green)" }}> ✓ clean</b> ·
            <b style={{ color: "var(--yellow)" }}> ◷ flagged</b> (opening range, thin OI, wide market) ·
            <b style={{ color: "var(--red)" }}> ⚠ verify vs broker</b> (credit/width ratio implausible for the delta)
          </span>
          <span>
            <b style={{ color: "var(--text)" }}>quote unavailable</b> — that leg had no live two-sided market (missing bid or ask) or a crossed quote,
            so no credit or ROI is computed for it. This is deliberate: a missing long ask makes the long leg look free and inflates ROI enormously.
          </span>
          <span><b style={{ color: "var(--text)" }}>Earnings</b> — next report date for single names. <b style={{ color: "var(--red)" }}>⚠ pre-exp</b> means it lands on or before expiration, so the short leg carries gap risk.</span>
          <span><b style={{ color: "#22c55e" }}>⚑ ex-div</b> on a Bear Call — the short call is ITM or within 2% of spot and an ex-dividend date falls before expiration: early-assignment risk, and you would owe the dividend.</span>
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
