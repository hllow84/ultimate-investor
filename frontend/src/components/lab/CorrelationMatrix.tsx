function cellColor(v: number): string {
  // -1..1 -> red..muted-neutral..green, matching the site's existing
  // gain/loss color convention rather than inventing a new palette.
  const clamped = Math.max(-1, Math.min(1, v));
  if (clamped >= 0) {
    const alpha = clamped * 0.55;
    return `rgba(34, 197, 94, ${alpha.toFixed(2)})`; // --green
  }
  const alpha = -clamped * 0.55;
  return `rgba(239, 68, 68, ${alpha.toFixed(2)})`; // --red
}

/** Renders a {row: {col: value}} correlation matrix as a colored table.
 * Only rows/columns actually present in `matrix` are shown. */
export default function CorrelationMatrix({ matrix }: { matrix: Record<string, Record<string, number>> }) {
  const keys = Object.keys(matrix);
  if (keys.length === 0) {
    return <p className="text-xs" style={{ color: "var(--muted)" }}>No correlation data present.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className="p-1"></th>
            {keys.map((k) => (
              <th key={k} className="p-1 font-medium whitespace-nowrap" style={{ color: "var(--muted)" }}>
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {keys.map((rowKey) => (
            <tr key={rowKey}>
              <td className="p-1 font-medium whitespace-nowrap text-right" style={{ color: "var(--muted)" }}>{rowKey}</td>
              {keys.map((colKey) => {
                const v = matrix[rowKey]?.[colKey];
                return (
                  <td
                    key={colKey}
                    className="p-1 text-center font-mono"
                    style={{ backgroundColor: typeof v === "number" ? cellColor(v) : undefined, minWidth: 48 }}
                    title={`${rowKey} × ${colKey}`}
                  >
                    {typeof v === "number" ? v.toFixed(2) : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
