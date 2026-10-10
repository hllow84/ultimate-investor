import { BarChart2 } from "lucide-react";
import { useLabStrategies } from "@/hooks/useLab";
import ResearchTabs from "@/components/lab/ResearchTabs";
import ArtifactPanel from "@/components/lab/ArtifactPanel";
import MetricsTable, { MetricsComparisonTable } from "@/components/lab/MetricsTable";
import { LoadingNotice, QueryErrorNotice } from "@/components/lab/QueryStateNotice";
import { looksLikeMetrics, pickCoreMetrics, CORE_METRIC_KEYS } from "@/utils/labFormat";
import ArtifactStatusBadge from "@/components/lab/ArtifactStatusBadge";

/** Strategy id as it appears in each of the three source files isn't
 * spelled identically ("strategy_1_momentum" vs "1_momentum") -- this
 * derives a shared id so the three sources can be shown together without
 * guessing at names the API didn't provide. */
function strategyId(key: string): string {
  return key.replace(/^strategy_/, "");
}

export default function ResearchStrategies() {
  const { data, isPending, isError, error, fetchStatus, refetch } = useLabStrategies();

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <BarChart2 size={20} style={{ color: "var(--accent)" }} />
        <h1 className="text-2xl font-bold">Research</h1>
      </div>
      <ResearchTabs />

      {isPending && <LoadingNotice label="Loading strategy results…" fetchStatus={fetchStatus} />}
      {isError && <QueryErrorNotice error={error} onRetry={() => refetch()} />}

      {data && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 flex-wrap text-xs" style={{ color: "var(--muted)" }}>
            <span>Scorecard:</span>
            <ArtifactStatusBadge status={data.scorecard.status} />
            <span className="ml-3">Deflated Sharpe:</span>
            <ArtifactStatusBadge status={data.deflated_sharpe.status} />
          </div>

          <ArtifactPanel title="Per-strategy backtest results & scorecard" envelope={data.results}>
            {(resultsData) => {
              const scorecard = data.scorecard.status === "ok" ? data.scorecard.data : null;
              const deflated = data.deflated_sharpe.status === "ok" ? data.deflated_sharpe.data : null;
              return (
                <div className="flex flex-col gap-6">
                  {Object.entries(resultsData).map(([key, value]) => {
                    const id = strategyId(key);
                    const strategyObj = value as Record<string, unknown>;
                    const score = scorecard ? (scorecard[id] as Record<string, unknown> | undefined) : undefined;
                    const def = deflated ? (deflated[key] as Record<string, unknown> | undefined) : undefined;

                    const variantEntries = Object.entries(strategyObj).filter(
                      ([k, v]) => k !== "benchmarks" && looksLikeMetrics(v)
                    );
                    const benchmarks = strategyObj.benchmarks as Record<string, Record<string, unknown>> | undefined;

                    return (
                      <div key={key} className="pt-4" style={{ borderTop: "1px solid var(--border)" }}>
                        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                          <h3 className="font-semibold">{key}</h3>
                          {score && typeof score.total === "number" && (
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ border: "1px solid var(--border)", color: "var(--muted)" }}>
                              Scorecard total: {score.total}
                            </span>
                          )}
                        </div>

                        {variantEntries.length === 0 ? (
                          <p className="text-xs" style={{ color: "var(--muted)" }}>No variant metrics present for this strategy.</p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                            {variantEntries.map(([variantKey, variantVal]) => (
                              <div key={variantKey}>
                                <p className="text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>{variantKey}</p>
                                <MetricsTable metrics={pickCoreMetrics(variantVal as Record<string, unknown>)} />
                              </div>
                            ))}
                          </div>
                        )}

                        {benchmarks && (
                          <details className="mb-3">
                            <summary className="text-xs cursor-pointer" style={{ color: "var(--accent)" }}>Benchmarks</summary>
                            <div className="mt-2">
                              <MetricsComparisonTable
                                columns={CORE_METRIC_KEYS.filter((k) => k !== "StartDate" && k !== "EndDate")}
                                rows={Object.entries(benchmarks).map(([bName, bVal]) => ({
                                  label: bName,
                                  metrics: bVal,
                                }))}
                              />
                            </div>
                          </details>
                        )}

                        {(score || def) && (
                          <details>
                            <summary className="text-xs cursor-pointer" style={{ color: "var(--accent)" }}>
                              Scorecard & statistical significance detail
                            </summary>
                            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                              {score && (
                                <div>
                                  <p className="text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>Scorecard factors</p>
                                  {typeof score.scores === "object" && score.scores
                                    ? <MetricsTable metrics={score.scores as Record<string, unknown>} />
                                    : <p className="text-xs" style={{ color: "var(--muted)" }}>No factor breakdown present.</p>}
                                </div>
                              )}
                              {def && (
                                <div>
                                  <p className="text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>Deflated Sharpe</p>
                                  <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>
                                    Probability the strategy's true in-sample Sharpe exceeds a benchmark adjusted
                                    for the number of pre-registered variants tested (Bailey &amp; L&oacute;pez de
                                    Prado, 2014) -- not a forecast of future performance.
                                  </p>
                                  <MetricsTable metrics={def} />
                                </div>
                              )}
                            </div>
                          </details>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            }}
          </ArtifactPanel>
        </div>
      )}
    </div>
  );
}
