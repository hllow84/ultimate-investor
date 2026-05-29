import type { HealthScore } from "@/types";

const PILLARS = [
  { key: "profitability",   label: "Profitability",   desc: (s: number) => s >= 70 ? "High margins & strong ROE" : s >= 40 ? "Acceptable profitability" : "Thin or negative margins" },
  { key: "debt",            label: "Debt Health",     desc: (s: number) => s >= 70 ? "Low leverage, financial flexibility" : s >= 40 ? "Manageable debt load" : "Elevated leverage risk" },
  { key: "growth",          label: "Growth",          desc: (s: number) => s >= 70 ? "Accelerating revenue & earnings" : s >= 40 ? "Steady growth trajectory" : "Slowing or declining growth" },
  { key: "efficiency",      label: "Efficiency",      desc: (s: number) => s >= 70 ? "Strong asset utilisation (ROA)" : s >= 40 ? "Average capital efficiency" : "Poor return on assets" },
  { key: "valuation",       label: "Valuation",       desc: (s: number) => s >= 70 ? "Trading at a reasonable multiple" : s >= 40 ? "Moderately priced" : "Elevated P/E premium" },
  { key: "momentum",        label: "Momentum",        desc: (s: number) => s >= 70 ? "Near 52-week highs, strong trend" : s >= 40 ? "Mid-range, mixed signals" : "Near 52-week lows" },
  { key: "predictability",  label: "Predictability",  desc: (s: number) => s >= 70 ? "Consistent, forecastable earnings" : s >= 40 ? "Moderate earnings consistency" : "Volatile / hard to forecast" },
] as const;

type PillarKey = typeof PILLARS[number]["key"];

function scoreColor(score: number) {
  if (score >= 70) return "var(--green)";
  if (score >= 40) return "var(--yellow)";
  return "var(--red)";
}

const VERDICT_STYLE: Record<string, { bg: string; color: string }> = {
  Strong:   { bg: "#22c55e18", color: "#22c55e" },
  Moderate: { bg: "#f9731618", color: "#f97316" },
  Weak:     { bg: "#ef444418", color: "#ef4444" },
};

export default function HealthScoreCard({ data }: { data: HealthScore }) {
  const verdict = data.overall >= 65 ? "Strong" : data.overall >= 40 ? "Moderate" : "Weak";
  const vs = VERDICT_STYLE[verdict];

  // Sort pillars by score to find top strengths and areas to watch
  const ranked = [...PILLARS]
    .map(p => ({ ...p, score: data[p.key as PillarKey] }))
    .sort((a, b) => b.score - a.score);

  const strengths = ranked.filter(p => p.score >= 65).slice(0, 2);
  const concerns  = ranked.filter(p => p.score < 50).slice(-2).reverse();

  return (
    <div className="p-5 rounded-xl" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>AI Health Score</p>
        <span
          className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
          style={{ backgroundColor: vs.bg, color: vs.color }}
        >
          {verdict}
        </span>
      </div>

      {/* Score + highlights */}
      <div className="flex gap-4 mb-5">
        {/* Overall score circle */}
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold shrink-0"
          style={{ border: `3px solid ${scoreColor(data.overall)}`, color: scoreColor(data.overall) }}
        >
          {data.overall}
        </div>

        {/* Strengths + concerns */}
        <div className="flex-1 flex flex-col gap-1.5 justify-center">
          {strengths.map(p => (
            <div key={p.key} className="flex items-center gap-2">
              <span className="text-xs font-bold" style={{ color: "var(--green)" }}>↑</span>
              <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>{p.label}</span>
              <span className="text-xs" style={{ color: "var(--muted)" }}>— {p.desc(p.score)}</span>
            </div>
          ))}
          {concerns.map(p => (
            <div key={p.key} className="flex items-center gap-2">
              <span className="text-xs font-bold" style={{ color: scoreColor(p.score) }}>↓</span>
              <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>{p.label}</span>
              <span className="text-xs" style={{ color: "var(--muted)" }}>— {p.desc(p.score)}</span>
            </div>
          ))}
          {strengths.length === 0 && concerns.length === 0 && (
            <p className="text-xs" style={{ color: "var(--muted)" }}>Mixed signals across pillars.</p>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="mb-3" style={{ borderTop: "1px solid var(--border)" }} />

      {/* Pillar bars */}
      <div className="flex flex-col gap-2">
        {PILLARS.map(({ key, label }) => {
          const score = data[key as PillarKey];
          return (
            <div key={key} className="flex items-center gap-3">
              <span className="text-xs w-24 shrink-0" style={{ color: "var(--muted)" }}>{label}</span>
              <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: "var(--border)" }}>
                <div
                  className="h-1.5 rounded-full transition-all"
                  style={{ width: `${score}%`, backgroundColor: scoreColor(score) }}
                />
              </div>
              <span className="text-xs w-7 text-right font-medium" style={{ color: scoreColor(score) }}>{score}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
