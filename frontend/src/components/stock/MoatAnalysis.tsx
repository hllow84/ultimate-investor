import type { MoatAnalysis } from "@/types";
import { Shield, TrendingUp, AlertTriangle } from "lucide-react";

export default function MoatCard({ data }: { data: MoatAnalysis }) {
  return (
    <div className="p-5 rounded-xl" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>Moat Analysis</p>
        <div className="flex items-center gap-1.5">
          <Shield size={14} style={{ color: "var(--accent)" }} />
          <span className="text-sm font-bold" style={{ color: "var(--accent)" }}>{data.moat_score.toFixed(1)}/10</span>
        </div>
      </div>

      <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>{data.ai_summary}</p>

      <div className="flex flex-col gap-3">
        <Section icon={<Shield size={12} />} label="Advantages" items={data.competitive_advantages} color="var(--green)" />
        <Section icon={<TrendingUp size={12} />} label="Growth Drivers" items={data.growth_drivers} color="var(--accent)" />
        <Section icon={<AlertTriangle size={12} />} label="Risks" items={data.risks} color="var(--red)" />
      </div>
    </div>
  );
}

function Section({ icon, label, items, color }: { icon: React.ReactNode; label: string; items: string[]; color: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1" style={{ color }}>
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <ul className="flex flex-col gap-1">
        {items.map((item, i) => (
          <li key={i} className="text-xs flex gap-1.5" style={{ color: "var(--muted)" }}>
            <span style={{ color }}>•</span> {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
