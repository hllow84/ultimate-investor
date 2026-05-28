import type { ValuationResult } from "@/types";

const verdictColor = {
  undervalued: "var(--green)",
  "fairly valued": "var(--yellow)",
  overvalued: "var(--red)",
};

export default function ValuationCard({ data }: { data: ValuationResult }) {
  const color = verdictColor[data.verdict];
  const estimates = [
    { label: "DCF Value", value: data.dcf_value ? `$${data.dcf_value.toFixed(2)}` : "—", weight: "2×" },
    { label: "EV/EBITDA Value", value: data.ev_ebitda_value ? `$${data.ev_ebitda_value.toFixed(2)}` : "—", weight: "2×" },
    { label: "Analyst Target", value: data.analyst_target ? `$${data.analyst_target.toFixed(2)}` : "—", weight: "3×" },
  ];
  const metrics = [
    { label: "Trailing P/E", value: data.pe_ratio ? data.pe_ratio.toFixed(1) : "—" },
    { label: "Forward P/E", value: data.forward_pe ? data.forward_pe.toFixed(1) : "—" },
    { label: "EV/EBITDA", value: data.ev_ebitda ? data.ev_ebitda.toFixed(1) : "—" },
    { label: "PEG Ratio", value: data.peg_ratio ? data.peg_ratio.toFixed(2) : "—" },
    { label: "Price/Book", value: data.price_to_book ? data.price_to_book.toFixed(2) : "—" },
  ];

  return (
    <div className="p-5 rounded-xl" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
      <p className="text-sm font-medium mb-4" style={{ color: "var(--muted)" }}>Valuation</p>

      <div className="flex items-center gap-3 mb-5">
        <div>
          <p className="text-2xl font-bold">${data.fair_value_estimate.toFixed(2)}</p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>Fair value estimate</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-lg font-bold" style={{ color }}>
            {data.upside_pct >= 0 ? "+" : ""}{data.upside_pct.toFixed(1)}% upside
          </p>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
            style={{ backgroundColor: `${color}20`, color }}
          >
            {data.verdict}
          </span>
        </div>
      </div>

      {/* Valuation method estimates */}
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--muted)" }}>
          Method Estimates <span className="font-normal normal-case">(weighted avg)</span>
        </p>
        <div className="grid grid-cols-3 gap-2">
          {estimates.map(({ label, value, weight }) => (
            <div key={label} className="rounded-lg p-2" style={{ backgroundColor: "var(--bg)", border: "1px solid var(--border)" }}>
              <p className="text-xs" style={{ color: "var(--muted)" }}>{label}</p>
              <p className="text-sm font-semibold">{value}</p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>weight {weight}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Raw multiples */}
      <div className="grid grid-cols-2 gap-3">
        {metrics.map(({ label, value }) => (
          <div key={label}>
            <p className="text-xs" style={{ color: "var(--muted)" }}>{label}</p>
            <p className="text-sm font-medium">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
