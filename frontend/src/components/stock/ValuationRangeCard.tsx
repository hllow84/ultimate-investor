import type { ValuationRange } from "@/types";
import { TrendingDown, Minus, TrendingUp } from "lucide-react";

export default function ValuationRangeCard({ data }: { data: ValuationRange }) {
  const { bear, base, bull, current_price } = data;
  const rangeSpan = bull - bear;

  // Position of current price within bear–bull range (clamped 0–100%)
  const pricePos = Math.min(100, Math.max(0, ((current_price - bear) / rangeSpan) * 100));
  const basePos  = Math.min(100, Math.max(0, ((base - bear) / rangeSpan) * 100));

  const verdict =
    current_price < base * 0.90 ? "undervalued" :
    current_price > base * 1.10 ? "overvalued" : "fairly valued";

  const verdictColor = {
    undervalued: "var(--green)",
    "fairly valued": "var(--yellow)",
    overvalued: "var(--red)",
  }[verdict];

  const scenarios = [
    { icon: <TrendingDown size={14} />, label: "Bear", value: bear, color: "var(--red)", reasoning: data.bear_reasoning },
    { icon: <Minus size={14} />, label: "Base", value: base, color: "var(--yellow)", reasoning: data.base_reasoning },
    { icon: <TrendingUp size={14} />, label: "Bull", value: bull, color: "var(--green)", reasoning: data.bull_reasoning },
  ];

  return (
    <div className="p-5 rounded-xl col-span-1 md:col-span-2" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>Valuation Range</p>
        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
          style={{ backgroundColor: `${verdictColor}20`, color: verdictColor }}
        >
          {verdict}
        </span>
      </div>

      {/* Range bar */}
      <div className="relative mb-6">
        <div className="flex justify-between text-xs mb-1" style={{ color: "var(--muted)" }}>
          <span style={{ color: "var(--red)" }}>${bear.toFixed(0)} Bear</span>
          <span style={{ color: "var(--yellow)" }}>${base.toFixed(0)} Base</span>
          <span style={{ color: "var(--green)" }}>${bull.toFixed(0)} Bull</span>
        </div>
        <div className="relative h-3 rounded-full" style={{ background: `linear-gradient(to right, var(--red), var(--yellow), var(--green))` }}>
          {/* Base marker */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white opacity-60"
            style={{ left: `${basePos}%` }}
          />
          {/* Current price pin */}
          <div
            className="absolute -top-1 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-xs font-bold shadow-lg"
            style={{ left: `calc(${pricePos}% - 10px)`, backgroundColor: "var(--bg)", color: "var(--text)", fontSize: 8 }}
            title={`Current: $${current_price.toFixed(2)}`}
          >
            ▼
          </div>
        </div>
        <p className="text-center text-xs mt-2" style={{ color: "var(--muted)" }}>
          Current price <strong style={{ color: "var(--text)" }}>${current_price.toFixed(2)}</strong>
        </p>
      </div>

      {/* Scenario cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {scenarios.map(({ icon, label, value, color }) => (
          <div key={label} className="p-3 rounded-lg" style={{ backgroundColor: "var(--bg)", border: `1px solid ${color}40` }}>
            <div className="flex items-center gap-1.5 mb-1" style={{ color }}>
              {icon}
              <span className="text-xs font-semibold">{label}</span>
            </div>
            <p className="text-lg font-bold" style={{ color }}>${value.toFixed(0)}</p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {((value - current_price) / current_price * 100).toFixed(1)}% vs now
            </p>
          </div>
        ))}
      </div>

      {/* Reasoning */}
      <div className="flex flex-col gap-2">
        {scenarios.map(({ label, color, reasoning }) => (
          <div key={label} className="flex gap-2 text-xs" style={{ color: "var(--muted)" }}>
            <span className="font-semibold shrink-0" style={{ color }}>{label}:</span>
            <span>{reasoning}</span>
          </div>
        ))}
      </div>

      {/* AI summary */}
      <p className="text-xs mt-3 pt-3" style={{ color: "var(--muted)", borderTop: "1px solid var(--border)" }}>
        {data.ai_summary}
      </p>
    </div>
  );
}
