import { useState } from "react";
import type { ValuationResult } from "@/types";

const verdictColor = {
  undervalued: "var(--green)",
  "fairly valued": "var(--yellow)",
  overvalued: "var(--red)",
};

function methodVerdict(value: number, price: number): { label: string; color: string } {
  if (price <= 0) return { label: "—", color: "var(--muted)" };
  const upside = ((value - price) / price) * 100;
  if (upside >  30) return { label: "Significantly undervalued", color: "var(--green)" };
  if (upside >  15) return { label: "Undervalued",               color: "var(--green)" };
  if (upside >   5) return { label: "Slightly undervalued",      color: "#86efac" };
  if (upside >  -5) return { label: "Fairly valued",             color: "var(--yellow)" };
  if (upside > -15) return { label: "Slightly overvalued",       color: "#f97316" };
  if (upside > -30) return { label: "Overvalued",                color: "var(--red)" };
  return                   { label: "Significantly overvalued ⚠️", color: "var(--red)" };
}

function MethodRow({
  label, abbr, value, price, weight,
}: {
  label: string; abbr?: string; value?: number | null; price: number; weight?: string;
}) {
  if (!value || value <= 0) return null;
  const { label: verdict, color } = methodVerdict(value, price);
  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded-lg" style={{ backgroundColor: "var(--bg)" }}>
      <div className="flex flex-col min-w-0">
        <span className="text-xs font-medium" style={{ color: "var(--text)" }}>
          {abbr ? <><span className="font-semibold">{abbr}</span> <span style={{ color: "var(--muted)" }}>({label})</span></> : label}
        </span>
        <span className="text-xs" style={{ color }}>— {verdict}</span>
      </div>
      <div className="flex items-center gap-2 ml-3 shrink-0">
        {weight && (
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--border)", color: "var(--muted)" }}>
            {weight}
          </span>
        )}
        <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>${value.toFixed(2)}</span>
      </div>
    </div>
  );
}

function Section({
  title, children, defaultOpen = true,
}: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full text-left mb-2"
      >
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          {title}
        </span>
        <span className="text-xs ml-auto" style={{ color: "var(--muted)" }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="flex flex-col gap-1">{children}</div>}
    </div>
  );
}

export default function ValuationCard({ data }: { data: ValuationResult }) {
  const color = verdictColor[data.verdict];
  const p = data.current_price;

  const multiples = [
    { label: "Trailing P/E",  value: data.pe_ratio       ? data.pe_ratio.toFixed(1)       : "—" },
    { label: "Forward P/E",   value: data.forward_pe     ? data.forward_pe.toFixed(1)     : "—" },
    { label: "EV/EBITDA",     value: data.ev_ebitda      ? data.ev_ebitda.toFixed(1)      : "—" },
    { label: "PEG Ratio",     value: data.peg_ratio      ? data.peg_ratio.toFixed(2)      : "—" },
    { label: "Price/Book",    value: data.price_to_book  ? data.price_to_book.toFixed(2)  : "—" },
  ];

  return (
    <div className="p-5 rounded-xl" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
      <p className="text-sm font-medium mb-4" style={{ color: "var(--muted)" }}>Valuation</p>

      {/* Composite fair value + verdict */}
      <div className="flex items-center gap-3 mb-4">
        <div>
          <p className="text-2xl font-bold">${data.fair_value_estimate.toFixed(2)}</p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>Weighted fair value</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-lg font-bold" style={{ color }}>
            {data.upside_pct >= 0 ? "+" : ""}{data.upside_pct.toFixed(1)}% upside
          </p>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
            style={{ backgroundColor: `${color}20`, color }}>
            {data.verdict}
          </span>
        </div>
      </div>

      {/* Buy zone indicators */}
      {(data.margin_of_safety_price || data.strong_buy_price) && (
        <div className="flex gap-2 mb-5">
          {data.margin_of_safety_price && (
            <div className="flex-1 rounded-lg p-2 text-center" style={{ backgroundColor: "#22c55e18", border: "1px solid #22c55e33" }}>
              <p className="text-xs" style={{ color: "var(--muted)" }}>Buy Zone</p>
              <p className="text-sm font-bold" style={{ color: "var(--green)" }}>${data.margin_of_safety_price.toFixed(2)}</p>
              <p className="text-xs font-medium" style={{ color: "var(--green)" }}>25% margin of safety</p>
            </div>
          )}
          {data.strong_buy_price && (
            <div className="flex-1 rounded-lg p-2 text-center" style={{ backgroundColor: "#3b82f618", border: "1px solid #3b82f633" }}>
              <p className="text-xs" style={{ color: "var(--muted)" }}>Strong Buy</p>
              <p className="text-sm font-bold" style={{ color: "#3b82f6" }}>${data.strong_buy_price.toFixed(2)}</p>
              <p className="text-xs font-medium" style={{ color: "#3b82f6" }}>50% margin of safety</p>
            </div>
          )}
        </div>
      )}

      {/* ── DCF Methods ─────────────────────────────────────────────────────── */}
      <Section title="Discounted Cash Flow Methods">
        <MethodRow label="Discounted Cash Flow 10-year"       abbr="DCF-10"         value={data.dcf_value}          price={p} weight="2×" />
        <MethodRow label="Discounted Cash Flow 20-year"       abbr="DCF-20"         value={data.dcf_20_value}       price={p} />
        <MethodRow label="Discounted Free Cash Flow 20-year"  abbr="DFCF-20"        value={data.dfcf_20_value}      price={p} />
        <MethodRow label="Discounted Net Income 20-year"      abbr="DNI-20"         value={data.dni_20_value}       price={p} />
        <MethodRow label="Discounted Free Cash Flow Terminal"  abbr="DFCF-Terminal"  value={data.dfcf_terminal_value} price={p} />
      </Section>

      {/* ── Ratio-Based Methods ──────────────────────────────────────────────── */}
      <Section title="Ratio-Based Methods">
        <MethodRow label="Mean Price to Sales"               abbr="PS Ratio"        value={data.ps_ratio_value}     price={p} />
        <MethodRow label="Mean Price to Earnings (no NRI)"   abbr="PE Ratio"        value={data.pe_nri_value}       price={p} />
        <MethodRow label="Price to Book"                     abbr="PB Ratio"        value={data.pb_value}           price={p} weight="1×" />
        <MethodRow label="Price to Sales Growth"             abbr="PSG Ratio"       value={data.psg_value}          price={p} />
        <MethodRow label="Price to Earnings Growth (no NRI)" abbr="PEG Ratio"       value={data.peg_nri_value}      price={p} />
      </Section>

      {/* ── Other Methods (existing composite inputs) ────────────────────────── */}
      <Section title="Other Methods" defaultOpen={false}>
        <MethodRow label="Analyst Consensus Target"  value={data.analyst_target}       price={p} weight="3×" />
        <MethodRow label="Forward P/E × Sector"      value={data.forward_pe_value}     price={p} weight="3×" />
        <MethodRow label="EV / EBITDA"               value={data.ev_ebitda_value}      price={p} weight="2×" />
        <MethodRow label="Sticker Price (Phil Town)"  value={data.sticker_price}        price={p} weight="2×" />
        <MethodRow label="Graham Number"              value={data.graham_number_value}  price={p} weight="1×" />
        <MethodRow label="Lynch Fair Value"           value={data.lynch_fair_value}     price={p} weight="1×" />
        <MethodRow label="Trailing P/E × Sector"      value={data.trailing_pe_value}   price={p} weight="1×" />
      </Section>

      {/* ── Raw multiples ────────────────────────────────────────────────────── */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--muted)" }}>
          Market Multiples
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {multiples.map(({ label, value }) => (
            <div key={label} className="flex justify-between">
              <p className="text-xs" style={{ color: "var(--muted)" }}>{label}</p>
              <p className="text-xs font-medium">{value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
