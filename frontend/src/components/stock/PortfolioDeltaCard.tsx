import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Scale, Trash2, CheckCircle2, ChevronDown, ChevronRight, Info } from "lucide-react";
import { useState } from "react";

import { api } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import type { PortfolioResponse, PositionRow } from "@/types";

const money = (v: number) =>
  (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 });

function signColor(v: number, neutralBand = 0) {
  if (v > neutralBand) return "var(--green)";
  if (v < -neutralBand) return "var(--red)";
  return "var(--muted)";
}

function PositionsTable({ rows, onClose, onDelete }: {
  rows: PositionRow[];
  onClose: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="mt-4 rounded-lg overflow-auto" style={{ border: "1px solid var(--border)" }}>
      <table className="w-full text-xs min-w-[900px]">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            {["Position", "Spot", "Cushion", "Qty", "Credit", "Max Risk", "Close @", "21 DTE",
              "Pos Δ", "β", "β-wtd $Δ", "SPY sh", ""].map((h, i) => (
              <th key={i}
                className={`py-2 px-2 font-semibold uppercase tracking-wider ${i === 0 ? "text-left" : i === 12 ? "text-right" : "text-right"}`}
                style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(p => {
            const isPut = p.opt_type === "put";
            const stratColor = isPut ? "var(--green)" : "var(--red)";
            return (
              <tr key={p.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="py-2 px-2 text-left">
                  <Link to={`/stock/${p.ticker}`} className="font-semibold hover:underline"
                    style={{ color: "var(--accent)" }}>{p.ticker}</Link>
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full font-semibold"
                    style={{ backgroundColor: stratColor + "22", color: stratColor }}>
                    {isPut ? "↑ Bull Put" : "↓ Bear Call"}
                  </span>
                  <p style={{ color: "var(--muted)" }}>
                    {p.short_strike}/{p.long_strike} · {p.expiry} · {p.dte}d
                  </p>
                </td>
                <td className="py-2 px-2 text-right" style={{ color: "var(--text)" }}>${p.spot}</td>
                <td className="py-2 px-2 text-right font-semibold"
                  style={{ color: p.cushion_pct > 5 ? "var(--green)" : p.cushion_pct > 0 ? "var(--yellow)" : "var(--red)" }}>
                  {p.cushion_pct.toFixed(1)}%
                </td>
                <td className="py-2 px-2 text-right" style={{ color: "var(--text)" }}>{p.contracts}</td>
                <td className="py-2 px-2 text-right" style={{ color: "var(--green)" }}>{money(p.credit_total)}</td>
                <td className="py-2 px-2 text-right" style={{ color: "var(--red)" }}>{money(p.max_risk_total)}</td>
                <td className="py-2 px-2 text-right" style={{ color: "var(--text)" }}>${p.manage_price.toFixed(2)}</td>
                <td className="py-2 px-2 text-right"
                  style={{ color: p.days_to_manage_dte <= 0 ? "var(--red)" : p.days_to_manage_dte <= 5 ? "var(--yellow)" : "var(--muted)" }}>
                  {p.days_to_manage_dte <= 0 ? "now" : `${p.days_to_manage_dte}d`}
                </td>
                <td className="py-2 px-2 text-right font-semibold" style={{ color: signColor(p.position_delta) }}>
                  {p.position_delta > 0 ? "+" : ""}{p.position_delta.toFixed(1)}
                </td>
                <td className="py-2 px-2 text-right" style={{ color: "var(--muted)" }}
                  title={p.beta_estimated ? "Not enough history to regress — assumed 1.00" : "1y OLS vs SPY"}>
                  {p.beta.toFixed(2)}{p.beta_estimated && "*"}
                </td>
                <td className="py-2 px-2 text-right font-semibold" style={{ color: signColor(p.beta_dollar_delta) }}>
                  {p.beta_dollar_delta > 0 ? "+" : ""}{money(p.beta_dollar_delta)}
                </td>
                <td className="py-2 px-2 text-right" style={{ color: signColor(p.spy_equiv_shares) }}>
                  {p.spy_equiv_shares > 0 ? "+" : ""}{p.spy_equiv_shares.toFixed(1)}
                </td>
                <td className="py-2 px-2 text-right whitespace-nowrap">
                  <button onClick={() => onClose(p.id)} title="Mark closed" className="mr-2">
                    <CheckCircle2 size={13} style={{ color: "var(--muted)" }} />
                  </button>
                  <button onClick={() => onDelete(p.id)} title="Delete">
                    <Trash2 size={13} style={{ color: "var(--red)" }} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function PortfolioDeltaCard() {
  const { isAuthenticated } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(true);

  const { data, isLoading } = useQuery<PortfolioResponse>({
    queryKey: ["spread-positions"],
    queryFn: () => api.options.positions(),
    enabled: isAuthenticated,
    staleTime: 60 * 1000,
  });

  const closeMut = useMutation({
    mutationFn: (id: number) => api.options.closePosition(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["spread-positions"] }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => api.options.deletePosition(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["spread-positions"] }),
  });

  if (!isAuthenticated) {
    return (
      <div className="rounded-xl p-5 text-sm" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", color: "var(--muted)" }}>
        <div className="flex items-center gap-2">
          <Scale size={16} style={{ color: "var(--muted)" }} />
          <span>
            <Link to="/login" style={{ color: "var(--accent)" }} className="hover:underline">Sign in</Link>
            {" "}to save spreads and see your beta-weighted portfolio delta.
          </span>
        </div>
      </div>
    );
  }

  const rows = data?.positions ?? [];
  const s = data?.summary;
  const leanColor = s?.lean_color === "green" ? "var(--green)"
    : s?.lean_color === "red" ? "var(--red)" : "var(--yellow)";

  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 w-full text-left">
        {open ? <ChevronDown size={15} style={{ color: "var(--accent)" }} />
              : <ChevronRight size={15} style={{ color: "var(--muted)" }} />}
        <Scale size={16} style={{ color: "var(--accent)" }} />
        <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
          Portfolio Delta ({rows.length} open position{rows.length !== 1 ? "s" : ""})
        </span>
        {s && rows.length > 0 && (
          <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: leanColor + "22", color: leanColor }}>
            {s.lean}
          </span>
        )}
      </button>

      {open && (
        <>
          {isLoading && <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>Loading positions…</p>}

          {!isLoading && rows.length === 0 && (
            <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
              No saved positions. Expand any spread below and hit <b>Save position</b> to track it here —
              the summary beta-weights every position against SPY so you can see which way the whole book leans,
              not just what each row risks on its own.
            </p>
          )}

          {!isLoading && s && rows.length > 0 && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                <div>
                  <p className="text-xs uppercase tracking-wider" style={{ color: "var(--muted)" }}>β-weighted $ delta</p>
                  <p className="text-2xl font-bold" style={{ color: signColor(s.beta_dollar_delta, 500) }}>
                    {s.beta_dollar_delta > 0 ? "+" : ""}{money(s.beta_dollar_delta)}
                  </p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>unweighted {money(s.raw_dollar_delta)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                    = {s.benchmark} shares
                  </p>
                  <p className="text-2xl font-bold" style={{ color: signColor(s.spy_equiv_shares, 1) }}>
                    {s.spy_equiv_shares > 0 ? "+" : ""}{s.spy_equiv_shares.toFixed(1)}
                  </p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>{s.benchmark} ${s.benchmark_price}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider" style={{ color: "var(--muted)" }}>Per 1% {s.benchmark} move</p>
                  <p className="text-2xl font-bold" style={{ color: signColor(s.pnl_per_1pct_spy, 10) }}>
                    {s.pnl_per_1pct_spy > 0 ? "+" : ""}{money(s.pnl_per_1pct_spy)}
                  </p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>first-order estimate</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider" style={{ color: "var(--muted)" }}>Credit / max risk</p>
                  <p className="text-lg font-bold" style={{ color: "var(--green)" }}>{money(s.total_credit)}</p>
                  <p className="text-lg font-bold" style={{ color: "var(--red)" }}>{money(s.total_max_risk)}</p>
                </div>
              </div>

              <PositionsTable
                rows={rows}
                onClose={id => closeMut.mutate(id)}
                onDelete={id => deleteMut.mutate(id)}
              />

              <p className="mt-3 text-xs flex items-start gap-1.5" style={{ color: "var(--muted)" }}>
                <Info size={12} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  Deltas are re-priced from live spot and today's time to expiry, not frozen at entry.
                  β is the 1-year OLS slope of the ticker's daily returns on {s.benchmark}'s
                  {s.any_beta_estimated && " (* = too little history to regress, assumed 1.00)"}.
                  Delta is a first-order estimate: it ignores gamma, so a large move will not track it linearly.
                </span>
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
