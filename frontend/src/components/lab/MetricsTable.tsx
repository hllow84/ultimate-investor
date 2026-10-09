import { formatMetricField } from "@/utils/labFormat";

const LABELS: Record<string, string> = {
  CAGR: "CAGR", Sharpe: "Sharpe", Sortino: "Sortino", AnnVol: "Ann. Vol",
  MaxDD: "Max Drawdown", Calmar: "Calmar", BestYear: "Best Year", WorstYear: "Worst Year",
  BestMonth: "Best Month", WorstMonth: "Worst Month", StartDate: "Start", EndDate: "End",
  NYears: "Years", NMonths: "Months",
};

/**
 * Renders a flat object of backtest metrics (CAGR/Sharpe/MaxDD/...) as a
 * labeled table. Only keys actually present in `metrics` are shown --
 * nothing is filled in or assumed.
 */
export default function MetricsTable({
  metrics, columns,
}: { metrics: Record<string, unknown>; columns?: string[] }) {
  const keys = columns ?? Object.keys(metrics);
  const present = keys.filter((k) => k in metrics);
  if (present.length === 0) {
    return <p className="text-xs" style={{ color: "var(--muted)" }}>No metric fields present.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <tbody>
          {present.map((k) => (
            <tr key={k} style={{ borderTop: "1px solid var(--border)" }}>
              <td className="py-1.5 pr-4" style={{ color: "var(--muted)" }}>{LABELS[k] ?? k}</td>
              <td className="py-1.5 font-mono text-right">{formatMetricField(k, metrics[k])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Side-by-side comparison of multiple named metrics objects (e.g. a
 * strategy variant against its cash/SPY/60-40 benchmarks). */
export function MetricsComparisonTable({
  columns, rows,
}: { columns: string[]; rows: { label: string; metrics: Record<string, unknown> | undefined }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[480px]">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            <th className="text-left py-1.5 pr-4" style={{ color: "var(--muted)" }}></th>
            {columns.map((c) => (
              <th key={c} className="text-right py-1.5 pl-3 font-medium" style={{ color: "var(--muted)" }}>
                {LABELS[c] ?? c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} style={{ borderTop: "1px solid var(--border)" }}>
              <td className="py-1.5 pr-4 font-medium whitespace-nowrap">{row.label}</td>
              {columns.map((c) => (
                <td key={c} className="py-1.5 pl-3 font-mono text-right">
                  {row.metrics ? formatMetricField(c, row.metrics[c]) : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
