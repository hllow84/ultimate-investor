import type { MoatAnalysis } from "@/types";
import { Shield, TrendingUp, TrendingDown } from "lucide-react";

export default function MoatCard({ data }: { data: MoatAnalysis }) {
  return (
    <div className="p-5 rounded-xl" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>Investment Thesis</p>
        <div className="flex items-center gap-1.5">
          <Shield size={14} style={{ color: "var(--accent)" }} />
          <span className="text-sm font-bold" style={{ color: "var(--accent)" }}>{data.moat_score.toFixed(1)}/10 moat</span>
        </div>
      </div>

      <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>{data.ai_summary}</p>

      <div className="grid grid-cols-2 gap-4">
        <ThesisColumn icon={<TrendingUp size={12} />} label="Bull Case" items={data.bull_thesis} color="var(--green)" />
        <ThesisColumn icon={<TrendingDown size={12} />} label="Bear Case" items={data.bear_thesis} color="var(--red)" />
      </div>
    </div>
  );
}

function ThesisColumn({ icon, label, items, color }: {
  icon: React.ReactNode;
  label: string;
  items: string[];
  color: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2" style={{ color }}>
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <li key={i} className="text-xs flex gap-1.5" style={{ color: "var(--muted)" }}>
            <span style={{ color, flexShrink: 0 }}>•</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
