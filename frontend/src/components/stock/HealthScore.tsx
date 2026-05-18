import type { HealthScore } from "@/types";

const PILLARS = [
  { key: "profitability", label: "Profitability" },
  { key: "debt", label: "Debt Health" },
  { key: "growth", label: "Growth" },
  { key: "efficiency", label: "Efficiency" },
  { key: "valuation", label: "Valuation" },
  { key: "momentum", label: "Momentum" },
  { key: "predictability", label: "Predictability" },
] as const;

function scoreColor(score: number) {
  if (score >= 70) return "var(--green)";
  if (score >= 40) return "var(--yellow)";
  return "var(--red)";
}

export default function HealthScoreCard({ data }: { data: HealthScore }) {
  return (
    <div className="p-5 rounded-xl" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
      <p className="text-sm font-medium mb-4" style={{ color: "var(--muted)" }}>AI Health Score</p>

      <div className="flex items-center gap-4 mb-5">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold"
          style={{ border: `3px solid ${scoreColor(data.overall)}`, color: scoreColor(data.overall) }}
        >
          {data.overall}
        </div>
        <p className="text-sm flex-1" style={{ color: "var(--muted)" }}>{data.summary}</p>
      </div>

      <div className="flex flex-col gap-2">
        {PILLARS.map(({ key, label }) => {
          const score = data[key];
          return (
            <div key={key} className="flex items-center gap-3">
              <span className="text-xs w-24 shrink-0" style={{ color: "var(--muted)" }}>{label}</span>
              <div className="flex-1 h-2 rounded-full" style={{ backgroundColor: "var(--border)" }}>
                <div
                  className="h-2 rounded-full transition-all"
                  style={{ width: `${score}%`, backgroundColor: scoreColor(score) }}
                />
              </div>
              <span className="text-xs w-8 text-right" style={{ color: scoreColor(score) }}>{score}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
