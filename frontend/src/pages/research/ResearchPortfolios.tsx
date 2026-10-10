import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";
import { Layers } from "lucide-react";
import { useLabDiagnostics, useLabPortfolios } from "@/hooks/useLab";
import ResearchTabs from "@/components/lab/ResearchTabs";
import ArtifactPanel from "@/components/lab/ArtifactPanel";
import MetricsTable, { MetricsComparisonTable } from "@/components/lab/MetricsTable";
import WeightsBar from "@/components/lab/WeightsBar";
import CorrelationMatrix from "@/components/lab/CorrelationMatrix";
import { LoadingNotice, QueryErrorNotice } from "@/components/lab/QueryStateNotice";
import { looksLikeMetrics, pickCoreMetrics, formatRatio, formatPercent, classifyRegimeOverlap } from "@/utils/labFormat";

const ROLLING_KEY_PREFIX = "rolling_";

function PortfolioCard({ name, value }: { name: string; value: Record<string, unknown> }) {
  if (looksLikeMetrics(value.metrics)) {
    const metrics = value.metrics as Record<string, unknown>;
    const benchmarks = value.benchmarks as Record<string, Record<string, unknown>> | undefined;
    const avgWeights = value.avg_weights as Record<string, number> | undefined;
    const universe = value.universe as string[] | undefined;
    return (
      <div className="pt-4" style={{ borderTop: "1px solid var(--border)" }}>
        <h3 className="font-semibold mb-2">{name}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>Metrics</p>
            <MetricsTable metrics={pickCoreMetrics(metrics)} />
            {typeof value.avg_annual_turnover === "number" && (
              <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                Avg. annual turnover: {formatRatio(value.avg_annual_turnover)}
              </p>
            )}
          </div>
          {benchmarks && (
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>Benchmarks</p>
              <MetricsComparisonTable
                columns={["CAGR", "Sharpe", "Sortino", "MaxDD"]}
                rows={Object.entries(benchmarks).map(([bName, bVal]) => ({ label: bName, metrics: bVal }))}
              />
            </div>
          )}
        </div>
        {avgWeights && (
          <div className="mt-3">
            <p className="text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>Average sleeve weights</p>
            <WeightsBar weights={avgWeights} />
          </div>
        )}
        {universe && (
          <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>Universe: {universe.join(", ")}</p>
        )}
      </div>
    );
  }

  // Blend-tier shape (e.g. C1/C2: {"0pct_tsmom_core_alone": {...}, "10pct_tsmom": {...}})
  const tierEntries = Object.entries(value).filter(([, v]) => looksLikeMetrics(v));
  if (tierEntries.length > 0) {
    return (
      <div className="pt-4" style={{ borderTop: "1px solid var(--border)" }}>
        <h3 className="font-semibold mb-2">{name}</h3>
        <MetricsComparisonTable
          columns={["CAGR", "Sharpe", "Sortino", "MaxDD"]}
          rows={tierEntries.map(([tierName, tierVal]) => ({ label: tierName, metrics: tierVal as Record<string, unknown> }))}
        />
      </div>
    );
  }

  return (
    <div className="pt-4" style={{ borderTop: "1px solid var(--border)" }}>
      <h3 className="font-semibold mb-2">{name}</h3>
      <p className="text-xs" style={{ color: "var(--muted)" }}>No recognized metrics shape for this entry.</p>
    </div>
  );
}

export default function ResearchPortfolios() {
  const diag = useLabDiagnostics();
  const port = useLabPortfolios();

  const loading = diag.isPending || port.isPending;
  const anyError = diag.error ?? port.error;
  const pausedFetchStatus =
    (diag.isPending && diag.fetchStatus === "paused") || (port.isPending && port.fetchStatus === "paused")
      ? "paused"
      : undefined;
  const retryFailed = () => {
    if (diag.isError) diag.refetch();
    if (port.isError) port.refetch();
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Layers size={20} style={{ color: "var(--accent)" }} />
        <h1 className="text-2xl font-bold">Research</h1>
      </div>
      <ResearchTabs />

      <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
        Historical backtest and simulation results. Nothing on this page represents a live
        brokerage position -- these are simulated allocations evaluated against historical data.
      </p>

      {loading && <LoadingNotice label="Loading portfolio diagnostics…" fetchStatus={pausedFetchStatus} />}
      {(diag.isError || port.isError) && <QueryErrorNotice error={anyError} onRetry={retryFailed} />}

      {diag.data && (
        <div className="mb-4">
          <ArtifactPanel title="Cross-strategy correlation & regime overlap" envelope={diag.data.combination}>
            {(combination) => (
              <div className="flex flex-col gap-6">
                {combination.partB_cross_correlation && (
                  <div>
                    <p className="text-xs font-medium mb-2" style={{ color: "var(--muted)" }}>
                      Cross-strategy monthly-return correlation
                    </p>
                    <CorrelationMatrix matrix={combination.partB_cross_correlation} />
                  </div>
                )}
                {combination.partA_vs_6040 && (
                  <div>
                    <p className="text-xs font-medium mb-2" style={{ color: "var(--muted)" }}>
                      Correlation to a 60/40 benchmark, and Sharpe when blended in
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[520px]">
                        <thead>
                          <tr style={{ borderBottom: "1px solid var(--border)" }}>
                            <th className="text-left py-1.5 pr-4" style={{ color: "var(--muted)" }}>Strategy</th>
                            <th className="text-right py-1.5 pl-3" style={{ color: "var(--muted)" }}>Corr. to 60/40</th>
                            <th className="text-right py-1.5 pl-3" style={{ color: "var(--muted)" }}>Sharpe: 60/40 alone</th>
                            <th className="text-right py-1.5 pl-3" style={{ color: "var(--muted)" }}>Sharpe: +10% blend</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(combination.partA_vs_6040).map(([stratKey, v]) => {
                            const val = v as Record<string, unknown>;
                            const frontier = val.efficient_frontier as Record<string, Record<string, number>> | undefined;
                            const tier10 = frontier?.["10pct"];
                            return (
                              <tr key={stratKey} style={{ borderTop: "1px solid var(--border)" }}>
                                <td className="py-1.5 pr-4">{stratKey}</td>
                                <td className="py-1.5 pl-3 text-right font-mono">{formatRatio(val.correlation_to_6040)}</td>
                                <td className="py-1.5 pl-3 text-right font-mono">{formatRatio(tier10?.sharpe_6040_alone)}</td>
                                <td className="py-1.5 pl-3 text-right font-mono">{formatRatio(tier10?.sharpe_blend)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <details className="mt-2">
                      <summary className="text-xs cursor-pointer" style={{ color: "var(--accent)" }}>
                        Per-regime overlap with 60/40 (does each strategy's drawdown coincide with,
                        or offset, 60/40's?)
                      </summary>
                      <div className="mt-2 flex flex-col gap-3">
                        {Object.entries(combination.partA_vs_6040).map(([stratKey, v]) => {
                          const regimeOverlap = (v as Record<string, unknown>).regime_overlap as
                            | Record<string, Record<string, unknown>>
                            | undefined;
                          if (!regimeOverlap) return null;
                          return (
                            <div key={stratKey}>
                              <p className="text-xs font-medium mb-1">{stratKey}</p>
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs min-w-[520px]">
                                  <thead>
                                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                                      <th className="text-left py-1 pr-3" style={{ color: "var(--muted)" }}>Regime</th>
                                      <th className="text-right py-1 pr-3" style={{ color: "var(--muted)" }}>Strategy return</th>
                                      <th className="text-right py-1 pr-3" style={{ color: "var(--muted)" }}>60/40 return</th>
                                      <th className="text-right py-1" style={{ color: "var(--muted)" }}>Drawdown overlap</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {Object.entries(regimeOverlap).map(([regimeName, r]) => {
                                      if (r.testable !== true) {
                                        return (
                                          <tr key={regimeName} style={{ borderTop: "1px solid var(--border)" }}>
                                            <td className="py-1 pr-3">{regimeName}</td>
                                            <td className="py-1 pr-3 text-right" colSpan={3} style={{ color: "var(--muted)" }}>
                                              Not testable (insufficient data in this window)
                                            </td>
                                          </tr>
                                        );
                                      }
                                      const classification = classifyRegimeOverlap(r.offsetting, r.coincident_drawdown);
                                      const LABEL: Record<typeof classification, string> = {
                                        offsetting: "Offsetting",
                                        coincident: "Coincident drawdown",
                                        neither: "Neither (no benchmark drawdown, or exact tie)",
                                        unknown: "Unknown (missing or unexpected data)",
                                      };
                                      const COLOR: Record<typeof classification, string> = {
                                        offsetting: "var(--green)",
                                        coincident: "var(--red)",
                                        neither: "var(--muted)",
                                        unknown: "var(--yellow)",
                                      };
                                      return (
                                        <tr key={regimeName} style={{ borderTop: "1px solid var(--border)" }}>
                                          <td className="py-1 pr-3">{regimeName}</td>
                                          <td className="py-1 pr-3 text-right font-mono">{formatPercent(r.strat_total_return as number)}</td>
                                          <td className="py-1 pr-3 text-right font-mono">{formatPercent(r["6040_total_return"] as number)}</td>
                                          <td className="py-1 text-right" style={{ color: COLOR[classification] }}>
                                            {LABEL[classification]}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  </div>
                )}
              </div>
            )}
          </ArtifactPanel>
        </div>
      )}

      {port.data && (
        <div className="flex flex-col gap-4">
          <ArtifactPanel title="Portfolio constructions" envelope={port.data.portfolios}>
            {(portfolios) => {
              const entries = Object.entries(portfolios).filter(([k]) => !k.startsWith(ROLLING_KEY_PREFIX));
              const rollingKeys = Object.keys(portfolios).filter((k) => k.startsWith(ROLLING_KEY_PREFIX));
              return (
                <div>
                  {entries.map(([name, value]) => (
                    <PortfolioCard key={name} name={name} value={value as Record<string, unknown>} />
                  ))}
                  {typeof portfolios.rolling_12mo_drawdown === "object" && portfolios.rolling_12mo_drawdown && (
                    <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
                      <p className="text-xs font-medium mb-2" style={{ color: "var(--muted)" }}>
                        Rolling 12-month drawdown, by construction
                      </p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs min-w-[420px]">
                          <thead>
                            <tr style={{ borderBottom: "1px solid var(--border)" }}>
                              <th className="text-left py-1 pr-3" style={{ color: "var(--muted)" }}>Construction</th>
                              <th className="text-right py-1 pr-3" style={{ color: "var(--muted)" }}>Worst 12mo DD</th>
                              <th className="text-right py-1 pr-3" style={{ color: "var(--muted)" }}>Mean 12mo DD</th>
                              <th className="text-right py-1" style={{ color: "var(--muted)" }}>Worst-DD window ended</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(
                              portfolios.rolling_12mo_drawdown as Record<string, Record<string, unknown>>
                            ).map(([name, v]) => (
                              <tr key={name} style={{ borderTop: "1px solid var(--border)" }}>
                                <td className="py-1 pr-3">{name}</td>
                                <td className="py-1 pr-3 text-right font-mono">{formatPercent(v.worst as number)}</td>
                                <td className="py-1 pr-3 text-right font-mono">{formatPercent(v.mean as number)}</td>
                                <td className="py-1 text-right font-mono">{String(v.worst_date ?? "—")}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {rollingKeys.filter((k) => k !== "rolling_12mo_drawdown").length > 0 && (
                    <p className="text-xs mt-4" style={{ color: "var(--muted)" }}>
                      Additional rolling diagnostics present in the API response but not yet
                      visualized: {rollingKeys.filter((k) => k !== "rolling_12mo_drawdown").join(", ")}.
                    </p>
                  )}
                </div>
              );
            }}
          </ArtifactPanel>

          <ArtifactPanel title="Ablation: marginal contribution per sleeve" envelope={port.data.ablation}>
            {(ablationData) => {
              const baseline = ablationData.baseline_all9_equal_weight;
              const ablation = ablationData.ablation;
              if (!ablation) return <p className="text-xs" style={{ color: "var(--muted)" }}>No ablation entries present.</p>;
              const chartData = Object.entries(ablation).map(([stratKey, v]) => ({
                name: stratKey,
                sharpeDelta: v.marginal_contribution?.Sharpe_delta ?? 0,
              }));
              return (
                <div>
                  {baseline && (
                    <div className="mb-4">
                      <p className="text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>Baseline (all 9, equal weight)</p>
                      <MetricsTable metrics={pickCoreMetrics(baseline)} />
                    </div>
                  )}
                  <p className="text-xs font-medium mb-2" style={{ color: "var(--muted)" }}>
                    Sharpe contribution of each sleeve (baseline Sharpe minus Sharpe with that sleeve removed)
                  </p>
                  <ResponsiveContainer width="100%" height={Math.max(120, chartData.length * 32)}>
                    <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 40, left: 4, bottom: 4 }}>
                      <XAxis type="number" tick={{ fontSize: 10, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: "var(--text)" }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                        formatter={(v: number) => [formatRatio(v), "Sharpe delta"]}
                      />
                      <ReferenceLine x={0} stroke="var(--border)" />
                      <Bar dataKey="sharpeDelta" radius={[0, 4, 4, 0]}>
                        {chartData.map((d, i) => (
                          <Cell key={i} fill={d.sharpeDelta >= 0 ? "var(--green)" : "var(--red)"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              );
            }}
          </ArtifactPanel>

          <ArtifactPanel title="Statistical significance (block bootstrap & Jobson-Korkie-Memmel)" envelope={port.data.significance}>
            {(significance) => (
              <div className="flex flex-col gap-4">
                {Object.entries(significance).map(([compKey, comp]) => (
                  <div key={compKey} className="pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                    <h3 className="font-semibold text-sm mb-2">{compKey}</h3>
                    {typeof comp.verdict === "string" && (() => {
                      // Highlight directly off the verdict string itself, not off
                      // jk_and_bootstrap_agree_at_5pct alone -- the producer's own
                      // decision ladder (phase7_significance.py run_pair()) has a
                      // branch ("INCONCLUSIVE -- sensitive to block-length choice")
                      // that can fire even when that one flag is true, so keying off
                      // the flag alone would silently miss that case.
                      const isInconclusive = comp.verdict.startsWith("INCONCLUSIVE");
                      return (
                        <p
                          className="text-xs mb-2 px-2 py-1 rounded-lg inline-block"
                          style={{
                            border: `1px solid ${isInconclusive ? "var(--yellow)" : "var(--border)"}`,
                            color: isInconclusive ? "var(--yellow)" : "var(--muted)",
                          }}
                        >
                          Verdict: {comp.verdict}
                        </p>
                      );
                    })()}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {comp.jobson_korkie_memmel && (
                        <div>
                          <p className="text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>Jobson-Korkie-Memmel test</p>
                          <MetricsTable metrics={comp.jobson_korkie_memmel as Record<string, unknown>} />
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>Block bootstrap (annualized Sharpe diff, 95% CI, Sharpe units -- not a % return)</p>
                        <table className="w-full text-sm">
                          <thead>
                            <tr style={{ borderBottom: "1px solid var(--border)" }}>
                              <th className="text-left py-1" style={{ color: "var(--muted)" }}>Block</th>
                              <th className="text-right py-1" style={{ color: "var(--muted)" }}>Sharpe diff</th>
                              <th className="text-right py-1" style={{ color: "var(--muted)" }}>95% CI (Sharpe)</th>
                              <th className="text-right py-1" style={{ color: "var(--muted)" }}>Excl. zero</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(["block_bootstrap_3mo", "block_bootstrap_6mo", "block_bootstrap_12mo"] as const).map((bk) => {
                              const b = comp[bk] as Record<string, unknown> | undefined;
                              if (!b) return null;
                              return (
                                <tr key={bk} style={{ borderTop: "1px solid var(--border)" }}>
                                  <td className="py-1">{bk.replace("block_bootstrap_", "")}</td>
                                  <td className="py-1 text-right font-mono">{formatRatio(b.point_estimate_annualized)}</td>
                                  <td className="py-1 text-right font-mono">
                                    [{formatRatio(b["ci_2.5"])}, {formatRatio(b["ci_97.5"])}]
                                  </td>
                                  <td className="py-1 text-right">{b.excludes_zero ? "Yes" : "No"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {typeof comp.block_length_sensitivity_agrees === "boolean" && (
                          <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                            Block-length sensitivity agreement: {comp.block_length_sensitivity_agrees ? "Yes" : "No"}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ArtifactPanel>
        </div>
      )}
    </div>
  );
}
