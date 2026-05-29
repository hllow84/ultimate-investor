import { useState } from "react";
import type { InsiderTrade } from "@/types";

const TYPE_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  "Buy":            { bg: "#22c55e18", color: "#22c55e", label: "Buy" },
  "Sell":           { bg: "#ef444418", color: "#ef4444", label: "Sell" },
  "Award/Exercise": { bg: "#6366f118", color: "#818cf8", label: "Award / Exercise" },
  "Disposition":    { bg: "#f9731618", color: "#f97316", label: "Disposition" },
  "Other":          { bg: "#64748b18", color: "#94a3b8", label: "Other" },
};

function fmt(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export default function InsiderTradesCard({ data }: { data: InsiderTrade[] }) {
  const [showDerivatives, setShowDerivatives] = useState(false);

  const displayed = showDerivatives ? data : data.filter(t => !t.is_derivative);

  // Summary stats
  const openMarket = data.filter(t => !t.is_derivative);
  const buyCount   = openMarket.filter(t => t.transaction_type === "Buy").length;
  const sellCount  = openMarket.filter(t => t.transaction_type === "Sell").length;
  const buyValue   = openMarket.filter(t => t.transaction_type === "Buy").reduce((s, t) => s + (t.value ?? 0), 0);
  const sellValue  = openMarket.filter(t => t.transaction_type === "Sell").reduce((s, t) => s + (t.value ?? 0), 0);

  return (
    <div
      className="p-5 rounded-xl col-span-1 md:col-span-2"
      style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>Insider Trades</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
            SEC Form 4 filings · last {data.length} transactions
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Show derivatives toggle */}
          <button
            onClick={() => setShowDerivatives(s => !s)}
            className="text-xs px-2 py-1 rounded-lg"
            style={{
              backgroundColor: showDerivatives ? "var(--accent)22" : "var(--bg)",
              border: "1px solid var(--border)",
              color: showDerivatives ? "var(--accent)" : "var(--muted)",
            }}
          >
            {showDerivatives ? "Hide" : "Show"} derivatives
          </button>
        </div>
      </div>

      {/* Summary bar */}
      {openMarket.length > 0 && (
        <div className="flex gap-4 mb-4 p-3 rounded-lg" style={{ backgroundColor: "var(--bg)" }}>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#22c55e" }} />
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              <span className="font-semibold" style={{ color: "#22c55e" }}>{buyCount} buy{buyCount !== 1 ? "s" : ""}</span>
              {buyValue > 0 && <span> · {fmt(buyValue)}</span>}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#ef4444" }} />
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              <span className="font-semibold" style={{ color: "#ef4444" }}>{sellCount} sell{sellCount !== 1 ? "s" : ""}</span>
              {sellValue > 0 && <span> · {fmt(sellValue)}</span>}
            </span>
          </div>
          <span className="text-xs ml-auto" style={{ color: "var(--muted)" }}>open-market only</span>
        </div>
      )}

      {/* Table */}
      {displayed.length === 0 ? (
        <p className="text-sm text-center py-6" style={{ color: "var(--muted)" }}>
          No transactions to display.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Date", "Insider", "Title", "Type", "Shares", "Price", "Value", "Owned After"].map((h, i) => (
                  <th
                    key={h}
                    className={`py-2 px-2 text-xs font-semibold uppercase tracking-wider ${i > 2 ? "text-right" : "text-left"}`}
                    style={{ color: "var(--muted)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.map((t, i) => {
                const style = TYPE_STYLE[t.transaction_type] ?? TYPE_STYLE["Other"];
                return (
                  <tr
                    key={i}
                    style={{ borderBottom: "1px solid var(--border)", opacity: t.is_derivative ? 0.7 : 1 }}
                  >
                    <td className="py-2 px-2 text-xs" style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
                      {t.date}
                    </td>
                    <td className="py-2 px-2 font-medium text-xs" style={{ color: "var(--text)" }}>
                      {t.name}
                    </td>
                    <td className="py-2 px-2 text-xs" style={{ color: "var(--muted)" }}>
                      {t.title || "—"}
                      {t.is_derivative && (
                        <span className="ml-1 text-xs px-1 rounded" style={{ backgroundColor: "var(--border)", color: "var(--muted)" }}>
                          deriv
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                        style={{ backgroundColor: style.bg, color: style.color }}
                      >
                        {style.label}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right text-xs font-medium" style={{ color: "var(--text)" }}>
                      {t.shares.toLocaleString()}
                    </td>
                    <td className="py-2 px-2 text-right text-xs" style={{ color: "var(--muted)" }}>
                      {t.price ? `$${t.price.toLocaleString()}` : "—"}
                    </td>
                    <td
                      className="py-2 px-2 text-right text-xs font-medium"
                      style={{ color: t.transaction_type === "Buy" ? "#22c55e" : t.transaction_type === "Sell" ? "#ef4444" : "var(--text)" }}
                    >
                      {t.value ? fmt(t.value) : "—"}
                    </td>
                    <td className="py-2 px-2 text-right text-xs" style={{ color: "var(--muted)" }}>
                      {t.shares_owned ? t.shares_owned.toLocaleString() : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
