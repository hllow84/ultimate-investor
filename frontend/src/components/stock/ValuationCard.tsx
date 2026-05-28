import type { ValuationResult } from "@/types";

const verdictColor = {
  undervalued: "var(--green)",
  "fairly valued": "var(--yellow)",
  overvalued: "var(--red)",
};

export default function ValuationCard({ data }: { data: ValuationResult }) {
  const color = verdictColor[data.verdict];

  const methodEstimates = [
    { label: "Analyst Target",   value: data.analyst_target,    weight: "3×", source: "Consensus" },
    { label: "Forward P/E",      value: data.fair_value_estimate, weight: "3×", source: "Sector mult" },
    { label: "EV/EBITDA",        value: data.ev_ebitda_value,   weight: "2×", source: "Greenblatt" },
    { label: "DCF (2-stage)",    value: data.dcf_value,         weight: "2×", source: "Buffett" },
    { label: "Sticker Price",    value: data.sticker_price,     weight: "2×", source: "Phil Town" },
    { label: "Graham Number",    value: data.graham_number_value, weight: "1×", source: "Ben Graham" },
    { label: "Lynch FV",         value: data.lynch_fair_value,  weight: "1×", source: "Peter Lynch" },
  ].filter(m => m.value != null && m.value > 0);

  const multiples = [
    { label: "Trailing P/E",  value: data.pe_ratio      ? data.pe_ratio.toFixed(1)      : "—" },
    { label: "Forward P/E",   value: data.forward_pe    ? data.forward_pe.toFixed(1)    : "—" },
    { label: "EV/EBITDA",     value: data.ev_ebitda     ? data.ev_ebitda.toFixed(1)     : "—" },
    { label: "PEG Ratio",     value: data.peg_ratio     ? data.peg_ratio.toFixed(2)     : "—" },
    { label: "Price/Book",    value: data.price_to_book ? data.price_to_book.toFixed(2) : "—" },
  ];

  return (
    <div className="p-5 rounded-xl" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
      <p className="text-sm font-medium mb-4" style={{ color: "var(--muted)" }}>Valuation</p>

      {/* Fair value + verdict */}
      <div className="flex items-center gap-3 mb-5">
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
              <p className="text-xs" style={{ color: "var(--muted)" }}>Buy Zone (−25%)</p>
              <p className="text-sm font-bold" style={{ color: "var(--green)" }}>${data.margin_of_safety_price.toFixed(2)}</p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>Adam Khoo MOS</p>
            </div>
          )}
          {data.strong_buy_price && (
            <div className="flex-1 rounded-lg p-2 text-center" style={{ backgroundColor: "#3b82f618", border: "1px solid #3b82f633" }}>
              <p className="text-xs" style={{ color: "var(--muted)" }}>Strong Buy (−50%)</p>
              <p className="text-sm font-bold" style={{ color: "#3b82f6" }}>${data.strong_buy_price.toFixed(2)}</p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>Buffett / Phil Town</p>
            </div>
          )}
        </div>
      )}

      {/* Method estimates */}
      {methodEstimates.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--muted)" }}>
            Method Estimates
          </p>
          <div className="flex flex-col gap-1">
            {methodEstimates.map(({ label, value, weight, source }) => (
              <div key={label} className="flex items-center justify-between py-1.5 px-2 rounded-lg"
                style={{ backgroundColor: "var(--bg)" }}>
                <div>
                  <span className="text-xs font-medium" style={{ color: "var(--text)" }}>{label}</span>
                  <span className="ml-1.5 text-xs" style={{ color: "var(--muted)" }}>{source}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--border)", color: "var(--muted)" }}>
                    {weight}
                  </span>
                  <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                    ${(value as number).toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw multiples */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--muted)" }}>
          Market Multiples
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
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
