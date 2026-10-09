import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { formatPercent } from "@/utils/labFormat";

const COLORS = ["#6366f1", "#22c55e", "#eab308", "#ef4444", "#06b6d4", "#f97316", "#a855f7", "#14b8a6"];

/** Renders a {sleeve: weight} map (e.g. construction_A_weights, avg_weights)
 * as a horizontal bar chart. Weights come straight from the API response. */
export default function WeightsBar({ weights }: { weights: Record<string, number> | null | undefined }) {
  if (!weights || Object.keys(weights).length === 0) {
    return <p className="text-xs" style={{ color: "var(--muted)" }}>No weights present.</p>;
  }
  const data = Object.entries(weights)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  return (
    <ResponsiveContainer width="100%" height={Math.max(100, data.length * 32)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 4, bottom: 4 }}>
        <XAxis type="number" tickFormatter={(v) => formatPercent(v, 0)} tick={{ fontSize: 10, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: "var(--text)" }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
          formatter={(v: number) => [formatPercent(v, 2), "Weight"]}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
